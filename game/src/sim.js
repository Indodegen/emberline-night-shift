// The simulation: the match's single source of truth. Rounds, money, the spike,
// grenades and damage live here, in one place, on a fixed 60 Hz step —
// rendering never writes to it, and it never reads the wall clock. The round
// is won by eliminating the other team, by detonating the planted spike, or by
// defusing it; the timer expiring with no plant hands the round to Sentinel.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const BUY_SECONDS = 12;
const ROUND_SECONDS = 100;
const PLANT_SECONDS = 3.5;
const DEFUSE_SECONDS = 5;
const SPIKE_SECONDS = 35;
const ROUNDS_TO_WIN = 4;
// Early-round protection for the human player only. Bots are tuned to melt
// a player who walks into the open in the first seconds of a round, so the
// player gets a short grace window plus a longer window of reduced bot
// damage and worse bot aim. Bot-vs-bot is untouched: these scales apply
// only when the target is the human player, and all of them are functions
// of sim time, so the fixed-step sim stays deterministic.
const SPAWN_GRACE_SECONDS = 5;
const EARLY_WINDOW_SECONDS = 10;
const GRACE_DAMAGE_SCALE = 0.25;
const EARLY_DAMAGE_SCALE = 0.7;
const EARLY_AIM_ERROR_MUL = 2;
const WIN_BONUS = 1400;
const LOSS_BONUS = 800;
const KILL_BONUS = 300;
const PLANT_BONUS = 300;

export function createSim({ world, rng, audio, effects, hud }) {
  const state = {
    phase: 'menu', // menu | buy | live | end | match
    round: 1,
    score: { vanguard: 0, sentinel: 0 },
    timer: 0,
    money: 800,
    owned: { kr7: false, longshot: false, frag: 0 },
    spike: { state: 'carried', site: null, carrier: 'player', plantProgress: 0, defuseProgress: 0, timer: 0, x: 0, z: 0 },
    time: 0,
    liveAt: -99, // sim time the current live phase began; -99 outside live
    winner: null,
    reason: '',
    streak: 0, // the player's kills since the last death, this round
    kd: {}, // actor id -> { k, d }, reset per match; feeds the scoreboard
  };
  const grenades = [];
  let roster = null; // the match's actors, captured on the first damage call
  const _v = new THREE.Vector3();

  function siteAt(x, z) {
    for (const name of ['A', 'B']) {
      const s = world.sites[name];
      const dx = x - s.x;
      const dz = z - s.z;
      if (dx * dx + dz * dz < s.radius * s.radius) return name;
    }
    return null;
  }

  function startMatch() {
    state.round = 1;
    state.score.vanguard = 0;
    state.score.sentinel = 0;
    state.money = 800;
    state.owned = { kr7: false, longshot: false, frag: 0 };
    state.winner = null;
    state.reason = '';
    state.kd = {};
    startRound();
  }

  function startRound() {
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.streak = 0;
    hud.setStreak(0);
    hud.setCarrier('YOU');
    state.spike = { state: 'carried', site: null, carrier: 'player', plantProgress: 0, defuseProgress: 0, timer: 0, x: 0, z: 0 };
    grenades.length = 0;
    hud.setPhase('buy', state.round);
    hud.showBuy(true, state.money, state.owned);
    hud.hideScoreboard();
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'match') return;
    state.phase = 'end';
    state.timer = 4;
    state.winner = winner;
    state.reason = reason;
    state.score[winner] += 1;
    state.money += winner === 'vanguard' ? WIN_BONUS : LOSS_BONUS;
    hud.setScore(state.score.vanguard, state.score.sentinel);
    hud.banner(winner === 'vanguard' ? 'VANGUARD WINS THE ROUND' : 'SENTINEL WINS THE ROUND', reason);
    audio.roundEnd(winner === 'vanguard');
    hud.showBuy(false);
    if (roster) {
      hud.showScoreboard(
        `ROUND ${state.round} — ${winner === 'vanguard' ? 'VANGUARD' : 'SENTINEL'} WINS`,
        roster.map((a) => {
          const row = state.kd[a.id] || { k: 0, d: 0 };
          return { name: a.name || 'YOU', team: a.team, k: row.k, d: row.d };
        }),
      );
    }
  }

  function endMatch(winner) {
    state.phase = 'match';
    state.winner = winner;
    hud.showOverlay('match', winner === 'vanguard' ? 'Vanguard takes the yard.' : 'Sentinel holds the yard.', state.score);
    hud.hideScoreboard();
    audio.roundEnd(winner === 'vanguard');
  }

  function buy(id, ctx) {
    if (state.phase !== 'buy') return false;
    const def = WEAPONS[id];
    if (!def || state.money < def.price) return false;
    if (id === 'frag') {
      state.money -= def.price;
      state.owned.frag += 1;
    } else {
      if (state.owned[id]) return false;
      state.money -= def.price;
      state.owned[id] = true;
      ctx.rig.equip(id);
      ctx.rig.refill();
    }
    state.money = Math.max(0, state.money);
    audio.buy();
    hud.setMoney(state.money);
    hud.showBuy(true, state.money, state.owned);
    return true;
  }

  function throwGrenade(actor, origin, dir) {
    if (state.owned.frag <= 0) return false;
    state.owned.frag -= 1;
    grenades.push({
      pos: origin.clone(),
      vel: new THREE.Vector3(dir.x * 16, dir.y * 16 + 4.5, dir.z * 16),
      fuse: 2.2,
    });
    return true;
  }

  function explodeGrenade(g, ctx) {
    effects.explosion(g.pos);
    audio.explosion();
    for (const actor of ctx.actors) {
      if (!actor.alive) continue;
      const dx = actor.pos.x - g.pos.x;
      const dz = actor.pos.z - g.pos.z;
      const dy = actor.pos.y + 1 - g.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > 5.5) continue;
      const dmg = Math.round(90 * (1 - dist / 5.5));
      damageActor(actor, Math.max(15, dmg), 'torso', null, ctx);
    }
    ctx.bots.hearShot(g.pos, null, state.time);
  }

  // Damage scale for the human player, from sim time only: x0.25 for the
  // first 5 s of the live phase (spawn grace), x0.7 until 10 s, then x1.
  // Every other target always takes full damage.
  function playerDamageScale() {
    if (state.phase !== 'live') return 1;
    const elapsed = state.time - state.liveAt;
    if (elapsed < SPAWN_GRACE_SECONDS) return GRACE_DAMAGE_SCALE;
    if (elapsed < EARLY_WINDOW_SECONDS) return EARLY_DAMAGE_SCALE;
    return 1;
  }

  // Aim-error multiplier for bots shooting at the human player: x2 for the
  // first 10 s of the live phase, then x1. Bot-vs-bot aim is unchanged.
  function aimErrorMul(target) {
    if (!target || !target.isPlayer || state.phase !== 'live') return 1;
    return state.time - state.liveAt < EARLY_WINDOW_SECONDS ? EARLY_AIM_ERROR_MUL : 1;
  }

  function damageActor(target, amount, part, shooter, ctx) {
    if (!roster && ctx && ctx.actors) roster = ctx.actors;
    if (!target.alive || state.phase !== 'live') return 'none';
    if (target.isPlayer) amount = Math.max(1, Math.round(amount * playerDamageScale()));
    target.hp -= amount;
    if (target.isPlayer) {
      audio.hurt();
      hud.flashDamage();
    }
    if (target.hp > 0) {
      if (shooter && shooter.isPlayer) hud.hitMarker(false);
      return 'hit';
    }
    target.hp = 0;
    target.alive = false;
    if (target.isPlayer) {
      hud.flashDamage();
      state.streak = 0;
      hud.setStreak(0);
    } else {
      target.mesh.visible = false;
      target.mesh.position.y = -50;
    }
    const killerName = shooter ? shooter.name || 'YOU' : 'GRENADE';
    hud.addKill(killerName, target.name || 'YOU', part === 'head', shooter ? shooter.team : null);
    // Kill bookkeeping for the round-end scoreboard: a kill for the shooter,
    // a death for the victim. Keyed by actor id; reset per match.
    if (shooter) {
      const k = state.kd[shooter.id] || (state.kd[shooter.id] = { k: 0, d: 0 });
      k.k += 1;
    }
    const v = state.kd[target.id] || (state.kd[target.id] = { k: 0, d: 0 });
    v.d += 1;
    if (shooter && shooter.isPlayer && !target.isPlayer) {
      state.money += KILL_BONUS;
      state.streak += 1;
      hud.setMoney(state.money);
      hud.setStreak(state.streak);
      hud.hitMarker(true);
      audio.hit(true);
    }
    // The spike changes hands when its carrier dies.
    if (state.spike.carrier === target || (target.isPlayer && state.spike.carrier === 'player')) {
      const alive = ctx.bots.aliveOf('vanguard');
      if (alive.length > 0) {
        state.spike.carrier = alive[0];
        alive[0].carrier = true;
        alive[0].site = state.spike.site || alive[0].site || 'A';
      } else {
        state.spike.carrier = null;
      }
      hud.setCarrier(carrierName());
    }
    checkElimination(ctx);
    return 'kill';
  }

  function checkElimination(ctx) {
    if (state.phase !== 'live') return;
    const vanguardAlive = ctx.actors.filter((a) => a.team === 'vanguard' && a.alive).length;
    const sentinelAlive = ctx.actors.filter((a) => a.team === 'sentinel' && a.alive).length;
    if (vanguardAlive === 0) endRound('sentinel', state.spike.state === 'planted' ? 'The spike was lost with its carriers.' : 'Vanguard eliminated.');
    else if (sentinelAlive === 0) endRound('vanguard', state.spike.state === 'planted' ? 'Sentinel eliminated — the spike will detonate.' : 'Sentinel eliminated.');
  }

  function step(dt, ctx) {
    state.time += dt;
    if (state.phase === 'menu' || state.phase === 'match') return;

    // Grenades fly on their own clock, in every phase but the menu.
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.1) {
        g.pos.y = 0.1;
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      const b = world.bounds;
      if (g.pos.x < b.minX || g.pos.x > b.maxX) g.vel.x *= -0.4;
      if (g.pos.z < b.minZ || g.pos.z > b.maxZ) g.vel.z *= -0.4;
      g.pos.x = Math.max(b.minX, Math.min(b.maxX, g.pos.x));
      g.pos.z = Math.max(b.minZ, Math.min(b.maxZ, g.pos.z));
      if (g.fuse <= 0) {
        grenades.splice(i, 1);
        explodeGrenade(g, ctx);
      }
    }

    if (state.phase === 'buy') {
      state.timer -= dt;
      hud.setTimer(Math.max(0, Math.ceil(state.timer)));
      for (const code of ctx.pressed) {
        if (code === 'Digit1') buy('kr7', ctx);
        else if (code === 'Digit2') buy('longshot', ctx);
        else if (code === 'Digit3') buy('frag', ctx);
        else if (code === 'Digit4') buy('p9', ctx);
      }
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_SECONDS;
        state.liveAt = state.time;
        hud.setPhase('live', state.round);
        hud.showBuy(false);
        hud.banner(`ROUND ${state.round}`, state.spike.site ? '' : 'Plant the spike at A or B');
      }
      return;
    }

    if (state.phase === 'end') {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.score.vanguard >= ROUNDS_TO_WIN || state.score.sentinel >= ROUNDS_TO_WIN) {
          endMatch(state.score.vanguard > state.score.sentinel ? 'vanguard' : 'sentinel');
        } else {
          state.round += 1;
          ctx.nextRound();
          startRound();
        }
      }
      return;
    }

    // Live phase.
    if (state.phase === 'live') {
      state.timer -= dt;
      hud.setTimer(Math.max(0, Math.ceil(state.timer)));
      const player = ctx.player;
      // The human plants: stand on a site, hold E, keep still-ish.
      if (state.spike.state === 'carried' && state.spike.carrier === 'player' && player.alive) {
        const site = siteAt(player.pos.x, player.pos.z);
        if (site && ctx.keys.has('KeyE')) {
          state.spike.plantProgress += dt;
          state.spike.site = site;
          hud.setPlant(state.spike.plantProgress / PLANT_SECONDS, site);
          audio.plantBeep(false);
          if (state.spike.plantProgress >= PLANT_SECONDS) {
            state.spike.state = 'planted';
            state.spike.timer = SPIKE_SECONDS;
            state.spike.x = world.sites[site].x;
            state.spike.z = world.sites[site].z;
            state.spike.plantProgress = 0;
            state.money += PLANT_BONUS;
            hud.setMoney(state.money);
            hud.setPlant(0, null);
            hud.banner('SPIKE PLANTED', `Defend site ${site} — ${SPIKE_SECONDS}s to detonation`);
            audio.plantBeep(true);
          }
        } else {
          state.spike.plantProgress = 0;
          hud.setPlant(0, null);
        }
      }
      if (state.spike.state === 'planted') {
        state.spike.timer -= dt;
        hud.setSpike(state.spike.timer, state.spike.site);
        if (state.spike.timer <= 0) {
          state.spike.state = 'detonated';
          effects.explosion(_v.set(state.spike.x, 0.6, state.spike.z));
          audio.explosion();
          endRound('vanguard', 'The spike detonated.');
          return;
        }
      }
      if (state.timer <= 0 && state.spike.state !== 'planted') {
        endRound('sentinel', 'Time expired — the spike was never planted.');
      }
    }
  }

  function carrierName() {
    const c = state.spike.carrier;
    if (c === 'player') return 'YOU';
    if (c && c.name) return c.name;
    return null;
  }

  return {
    state,
    siteAt,
    carrierName,
    startMatch,
    startRound,
    buy,
    throwGrenade,
    damageActor,
    step,
    liveElapsed() {
      return state.phase === 'live' ? state.time - state.liveAt : 999;
    },
    aimErrorMul,
    plantTick(bot, progress) {
      if (state.phase !== 'live' || state.spike.state !== 'carried') return;
      state.spike.plantProgress = progress;
      state.spike.site = bot.site;
      hud.setPlant(Math.min(1, progress / PLANT_SECONDS), bot.site);
    },
    plantDone(bot) {
      if (state.phase !== 'live' || state.spike.state !== 'carried') return;
      const site = bot.site || 'A';
      state.spike.state = 'planted';
      state.spike.timer = SPIKE_SECONDS;
      state.spike.x = world.sites[site].x;
      state.spike.z = world.sites[site].z;
      state.spike.site = site;
      state.spike.plantProgress = 0;
      hud.setPlant(0, null);
      hud.banner('SPIKE PLANTED', `Defend site ${site} — ${SPIKE_SECONDS}s to detonation`);
      audio.plantBeep(true);
    },
    defuseTick(bot, progress) {
      if (state.phase !== 'live' || state.spike.state !== 'planted') return;
      state.spike.defuseProgress = progress;
      hud.setPlant(Math.min(1, progress / DEFUSE_SECONDS), state.spike.site);
    },
    defuseDone() {
      if (state.phase !== 'live' || state.spike.state !== 'planted') return;
      state.spike.state = 'defused';
      state.spike.defuseProgress = 0;
      hud.setPlant(0, null);
      hud.setSpike(0, null);
      endRound('sentinel', 'The spike was defused.');
    },
  };
}
