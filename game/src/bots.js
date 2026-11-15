// The other nine players: four Vanguard teammates and five Sentinel
// defenders. Each bot is a small state machine — route, hold, engage,
// plant, defuse, rotate — walking the waypoint graph, checking line of
// sight with a real raycast, reacting to what it sees and hears, and
// firing in bursts with an aim error that grows with distance and target
// speed. A bot never knows where an enemy is unless it saw one, heard a
// shot, or the spike told it.
import * as THREE from 'three';
import { moveBox } from './world.js';
import { PALETTE } from './palette.js';

const BOT_NAMES = {
  vanguard: ['ASH', 'REX', 'KAI', 'NOVA'],
  sentinel: ['ORIN', 'MIRA', 'DUSK', 'VEX', 'SABLE'],
};
// Roles, tied to the behaviour each bot already has: ASH carries the spike
// (Support), REX routes to the site approach and holds it (Anchor), KAI
// works the mid connectors as a second flanker (Flanker), NOVA holds the
// other site's approach (Anchor); ORIN holds the A approach (Anchor A),
// MIRA works the mid connectors as the flanker (Flanker), DUSK holds the
// B approach (Anchor B), VEX works the mid-west connector as a second
// flanker (Flanker), SABLE holds the B approach (Anchor B). The human
// player is the Entry. Roles are labels only — they never change a route
// or a hold.
const BOT_ROLES = {
  ASH: 'Support',
  REX: 'Anchor',
  KAI: 'Flanker',
  NOVA: 'Anchor',
  ORIN: 'Anchor A',
  MIRA: 'Flanker',
  DUSK: 'Anchor B',
  VEX: 'Flanker',
  SABLE: 'Anchor B',
};
const RADIO_MIN_GAP = 8; // sim seconds between one bot's radio callouts
const HEAR_DIVERT_RADIUS = 12; // a shot this close overrides a bot's route
// The round's team plans, picked fresh in reset() from the actual
// assignments: Vanguard pushes the chosen site (ASH carries, REX anchors
// the approach, KAI works the mid connectors, NOVA holds the other site's
// approach); Sentinel holds both sites with flankers on the mid
// connectors. The Vanguard plan is radioed once at round start; the
// Sentinel plan is the hold assignment itself. No randomness: a plan is a
// pure function of the chosen site.
let roundPlan = null;
let planAnnounced = false;
const WALK_SPEED = 3.4;
const RUN_SPEED = 4.7;
const PERCEIVE_EVERY = 0.12;
const REACTION_MIN = 0.32;
const REACTION_MAX = 0.62;
const HEAR_RADIUS = 26;
const SEE_RADIUS = 55;

function buildBotMesh(team) {
  const group = new THREE.Group();
  const teamColor = team === 'vanguard' ? PALETTE.accent : PALETTE.teal;
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.wall), roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), dark);
  legL.position.set(-0.11, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), cloth);
  torso.position.y = 1.14;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), skin);
  head.position.y = 1.66;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.55), dark);
  gun.position.set(0.2, 1.22, -0.3);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.38, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(teamColor), transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(legL, legR, torso, head, gun, ring);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { group, torso, head, gun };
}

export function createBots(scene, world, rng) {
  const actors = [];
  const hitMeshes = [];
  const _delta = new THREE.Vector3();
  const _next = new THREE.Vector3();
  const _toTarget = new THREE.Vector3();

  function makeBot(team, name, spawn) {
    const { group, torso, head, gun } = buildBotMesh(team);
    group.position.set(spawn[0], 0, spawn[1]);
    scene.add(group);
    const bot = {
      id: `${team}-${name}`,
      name,
      role: BOT_ROLES[name] || '',
      team,
      isPlayer: false,
      mesh: group,
      gun,
      pos: new THREE.Vector3(spawn[0], 0, spawn[1]),
      yaw: spawn[2],
      pitch: 0,
      hp: 100,
      alive: true,
      weapon: 'kr7',
      mag: 30,
      reloadLeft: 0,
      state: 'route',
      route: [],
      routeIndex: 0,
      holdPoint: null,
      holdUntil: 0,
      target: null,
      lastSeen: new THREE.Vector3(),
      lastSeenAt: -99,
      reactionAt: 0,
      burstLeft: 0,
      nextShotAt: 0,
      perceiveAt: rng.range(0, PERCEIVE_EVERY),
      heardPos: null,
      heardAt: -99,
      site: null,
      carrier: false,
      planting: 0,
      defusing: 0,
      lastRadioAt: -99, // sim time of this bot's last radio callout
      speed: 0,
      bobPhase: rng.range(0, 6),
      strafeDir: 1,
      strafeUntil: 0,
      flanker: false,
    };
    torso.userData.actor = bot;
    torso.userData.part = 'torso';
    head.userData.actor = bot;
    head.userData.part = 'head';
    bot.hitMeshes = [torso, head];
    hitMeshes.push(torso, head);
    actors.push(bot);
    return bot;
  }

  for (const [i, spawn] of world.spawns.vanguard.entries()) {
    if (i === 0) continue; // slot 0 is the human player
    makeBot('vanguard', BOT_NAMES.vanguard[i - 1], spawn);
  }
  for (const [i, spawn] of world.spawns.sentinel.entries()) {
    makeBot('sentinel', BOT_NAMES.sentinel[i], spawn);
  }

  function aliveOf(team) {
    return actors.filter((b) => b.team === team && b.alive);
  }

  function reset(round, siteChoice) {
    let vi = 0;
    const sentinels = actors.filter((a) => a.team === 'sentinel');
    for (const bot of actors) {
      bot.hp = 100;
      bot.alive = true;
      bot.mag = 30;
      bot.reloadLeft = 0;
      bot.state = 'route';
      bot.route = [];
      bot.routeIndex = 0;
      bot.target = null;
      bot.lastSeenAt = -99;
      bot.burstLeft = 0;
      bot.planting = 0;
      bot.defusing = 0;
      bot.heardPos = null;
      bot.heardAt = -99;
      bot.site = null;
      bot.carrier = false;
      bot.strafeDir = 1;
      bot.strafeUntil = 0;
      bot.flanker = false;
      if (bot.team === 'vanguard') {
        const s = world.spawns.vanguard[vi + 1];
        bot.pos.set(s[0], 0, s[1]);
        bot.yaw = s[2];
        vi += 1;
      } else {
        const s = world.spawns.sentinel[sentinels.indexOf(bot)];
        bot.pos.set(s[0], 0, s[1]);
        bot.yaw = s[2];
      }
      bot.mesh.visible = true;
      bot.mesh.position.copy(bot.pos);
    }
    // Vanguard picks a site for the round; the carrier plants, the other covers.
    const site = siteChoice;
    const vanguard = aliveOf('vanguard');
    if (vanguard.length > 0) {
      vanguard[0].carrier = true;
      vanguard[0].site = site;
      const targetWp = site === 'A' ? 5 : 11;
      const from = world.nearestWaypoint(vanguard[0].pos.x, vanguard[0].pos.z);
      vanguard[0].route = world.route(from, targetWp);
      vanguard[0].routeIndex = 0;
    }
    if (vanguard.length > 1) {
      vanguard[1].site = site;
      const targetWp = site === 'A' ? 6 : 10;
      const from = world.nearestWaypoint(vanguard[1].pos.x, vanguard[1].pos.z);
      vanguard[1].route = world.route(from, targetWp);
      vanguard[1].routeIndex = 0;
    }
    if (vanguard.length > 2) {
      // KAI (Flanker) works the mid connectors, forward of the site push.
      vanguard[2].site = site;
      vanguard[2].flanker = true;
      const targetWp = site === 'A' ? 18 : 19;
      const from = world.nearestWaypoint(vanguard[2].pos.x, vanguard[2].pos.z);
      vanguard[2].route = world.route(from, targetWp);
      vanguard[2].routeIndex = 0;
    }
    if (vanguard.length > 3) {
      // NOVA (Anchor) holds the other site's approach, covering the rotate.
      vanguard[3].site = site;
      const targetWp = site === 'A' ? 10 : 6;
      const from = world.nearestWaypoint(vanguard[3].pos.x, vanguard[3].pos.z);
      vanguard[3].route = world.route(from, targetWp);
      vanguard[3].routeIndex = 0;
    }
    // Sentinels hold: ORIN at the A approach, MIRA the mid-east connector
    // (flanker), DUSK at the B approach, VEX the mid-west connector
    // (second flanker), SABLE the B approach. Every hold is a different
    // waypoint, so no two defenders stack on one spot. The two flankers
    // swap between the connectors while they wait.
    const sentinel = aliveOf('sentinel');
    const holds = [16, 19, 17, 18, 10];
    sentinel.forEach((bot, i) => {
      const targetWp = holds[i % holds.length];
      const from = world.nearestWaypoint(bot.pos.x, bot.pos.z);
      bot.route = world.route(from, targetWp);
      bot.routeIndex = 0;
      bot.holdPoint = { x: world.waypoints[targetWp].x, z: world.waypoints[targetWp].z };
      if (i === 1 || i === 3) bot.flanker = true;
    });
    // Pick this round's team plans from the assignments above, and arm the
    // one radio callout that announces the Vanguard plan at round start.
    const otherSite = site === 'A' ? 'B' : 'A';
    roundPlan = {
      vanguard: `ASH: Plan — push ${site} with REX, KAI works mid, NOVA holds ${otherSite}`,
      sentinel: 'ORIN: Plan — hold A and B, flankers work the mid connectors',
    };
    planAnnounced = false;
  }

  function hearShot(pos, shooterTeam, time) {
    for (const bot of actors) {
      if (!bot.alive || bot.team === shooterTeam) continue;
      const dx = bot.pos.x - pos.x;
      const dz = bot.pos.z - pos.z;
      if (dx * dx + dz * dz < HEAR_RADIUS * HEAR_RADIUS) {
        bot.heardPos = bot.heardPos || new THREE.Vector3();
        bot.heardPos.set(pos.x, 0, pos.z);
        bot.heardAt = time;
      }
    }
  }

  function eyeOf(bot) {
    return { x: bot.pos.x, y: bot.pos.y + 1.55, z: bot.pos.z };
  }

  function step(dt, api) {
    const { time, phase, spike } = api;
    // The round's team plan goes out once, on the first step of the round —
    // the Vanguard plan, from its carrier, while the teams are still in the
    // buy phase. The Sentinel plan is their hold assignment, in reset().
    if (roundPlan && !planAnnounced && phase !== 'menu' && phase !== 'match') {
      planAnnounced = true;
      api.radio(roundPlan.vanguard);
    }
    for (const bot of actors) {
      if (!bot.alive) continue;
      if (bot.reloadLeft > 0) bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);

      // --- perception, staggered so not every bot raycasts on the same tick.
      bot.perceiveAt -= dt;
      if (bot.perceiveAt <= 0) {
        bot.perceiveAt = PERCEIVE_EVERY;
        let best = null;
        let bestDist = Infinity;
        for (const other of api.actors) {
          if (other === bot || !other.alive || other.team === bot.team) continue;
          const dx = other.pos.x - bot.pos.x;
          const dy = other.pos.y + 1.3 - (bot.pos.y + 1.55);
          const dz = other.pos.z - bot.pos.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > SEE_RADIUS || dist >= bestDist) continue;
          if (api.los(eyeOf(bot), { x: other.pos.x, y: other.pos.y + 1.3, z: other.pos.z })) {
            best = other;
            bestDist = dist;
          }
        }
        if (best) {
          if (bot.target !== best) {
            bot.reactionAt = time + rng.range(REACTION_MIN, REACTION_MAX);
            // Radio: a bot that just spotted an enemy calls it out, once per
            // gap, with the zone it is standing in — a real perception event,
            // never a scripted line.
            if (phase === 'live' && time - bot.lastRadioAt >= RADIO_MIN_GAP) {
              bot.lastRadioAt = time;
              const zone = bot.pos.x < -12 ? 'site A' : bot.pos.x > 12 ? 'site B' : 'mid';
              api.radio(`${bot.name}: Contact ${zone}`);
            }
          }
          bot.target = best;
          bot.lastSeen.set(best.pos.x, 0, best.pos.z);
          bot.lastSeenAt = time;
          bot.state = 'engage';
        } else if (bot.target && time - bot.lastSeenAt > 1.2) {
          bot.target = null;
          bot.state = bot.route.length > 0 && bot.routeIndex < bot.route.length ? 'route' : 'hold';
        }
      }

      // --- objective overrides, only when nothing is shooting at the bot.
      if (!bot.target) {
        if (spike.state === 'planted' && bot.team === 'sentinel') {
          // Rotate to the planted site; defuse when close and clear.
          const site = world.sites[spike.site];
          const dx = bot.pos.x - site.x;
          const dz = bot.pos.z - site.z;
          if (Math.hypot(dx, dz) < 1.6) {
            if (bot.state !== 'defuse') {
              bot.state = 'defuse';
              // Radio on the transition in, once per defuse attempt.
              if (phase === 'live') api.radio(`${bot.name}: Defusing the spike`);
            }
          } else if (bot.state !== 'rotate') {
            bot.state = 'rotate';
            const from = world.nearestWaypoint(bot.pos.x, bot.pos.z);
            bot.route = world.route(from, spike.site === 'A' ? 5 : 11);
            bot.routeIndex = 0;
          }
        } else if (spike.state === 'carried' && bot.carrier && bot.team === 'vanguard') {
          const site = world.sites[bot.site];
          const dx = bot.pos.x - site.x;
          const dz = bot.pos.z - site.z;
          if (Math.hypot(dx, dz) < 2.2 && phase === 'live') {
            bot.state = 'plant';
          } else if (bot.state === 'hold') {
            bot.state = 'route';
          }
        } else if (bot.heardPos && time - bot.heardAt < 4) {
          // Hearing: a bot that hears gunfire turns toward the sound at
          // once — facing the threat before it can see it — and then
          // investigates it. The plan normally holds (a bot already
          // routing keeps its route), but a nearby shot under 12 m
          // overrides the route: a close gunfight beats the plan. The
          // carrier's plant run is never diverted: its branch above
          // matches first while the spike is carried. No new randomness:
          // the facing and the route are pure functions of the heard
          // position and the sim time.
          bot.yaw = Math.atan2(-(bot.heardPos.x - bot.pos.x), -(bot.heardPos.z - bot.pos.z));
          const heardDist = Math.hypot(bot.heardPos.x - bot.pos.x, bot.heardPos.z - bot.pos.z);
          if (bot.state !== 'route' || heardDist < HEAR_DIVERT_RADIUS) {
            bot.state = 'route';
            const from = world.nearestWaypoint(bot.pos.x, bot.pos.z);
            const to = world.nearestWaypoint(bot.heardPos.x, bot.heardPos.z);
            bot.route = world.route(from, to);
            bot.routeIndex = 0;
          }
        }
      }

      // --- movement.
      let speed = 0;
      if (bot.state === 'plant') {
        bot.planting += dt;
        api.plantTick(bot, bot.planting);
        if (bot.planting >= 3.5) {
          api.plantDone(bot);
          bot.planting = 0;
          bot.state = 'hold';
          bot.holdPoint = { x: bot.pos.x, z: bot.pos.z };
        }
      } else if (bot.state === 'defuse') {
        bot.defusing += dt;
        api.defuseTick(bot, bot.defusing);
        if (bot.defusing >= 5) {
          api.defuseDone(bot);
          bot.defusing = 0;
          bot.state = 'hold';
        }
      } else if (bot.state === 'route' || bot.state === 'rotate') {
        if (bot.routeIndex < bot.route.length) {
          const wp = world.waypoints[bot.route[bot.routeIndex]];
          const dx = wp.x - bot.pos.x;
          const dz = wp.z - bot.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.5) {
            bot.routeIndex += 1;
          } else {
            speed = bot.state === 'rotate' ? RUN_SPEED : WALK_SPEED;
            const nx = (dx / dist) * speed * dt;
            const nz = (dz / dist) * speed * dt;
            _delta.set(nx, 0, nz);
            moveBox(bot.pos, _delta, 0.34, 1.72, world.colliders, _next);
            bot.pos.copy(_next);
            bot.yaw = Math.atan2(-dx, -dz);
          }
        } else {
          bot.state = 'hold';
          bot.holdPoint = { x: bot.pos.x, z: bot.pos.z };
          bot.holdUntil = time + rng.range(4, 9);
        }
      } else if (bot.state === 'hold') {
        // Scan: slow yaw sweep while holding a lane.
        bot.yaw += Math.sin(time * 0.45 + bot.bobPhase) * 0.0035;
        if (bot.holdUntil && time > bot.holdUntil && bot.team === 'vanguard' && bot.site) {
          const from = world.nearestWaypoint(bot.pos.x, bot.pos.z);
          bot.route = world.route(from, bot.site === 'A' ? 5 : 11);
          bot.routeIndex = 0;
          bot.state = 'route';
          bot.holdUntil = 0;
        } else if (bot.holdUntil && time > bot.holdUntil && bot.flanker) {
          // The flanker never camps one spot: it swaps between the two
          // connectors, so a player who checked mid-east once cannot trust it.
          const current = world.nearestWaypoint(bot.pos.x, bot.pos.z);
          const other = current === 19 ? 18 : 19;
          const from = current;
          bot.route = world.route(from, other);
          bot.routeIndex = 0;
          bot.state = 'route';
          bot.holdUntil = 0;
        }
      }

      // --- combat: face the target, fire in bursts after the reaction delay.
      if (bot.target && bot.target.alive) {
        _toTarget.set(
          bot.target.pos.x - bot.pos.x,
          bot.target.pos.y + 1.3 - (bot.pos.y + 1.55),
          bot.target.pos.z - bot.pos.z,
        );
        const dist = _toTarget.length() || 1;
        bot.yaw = Math.atan2(-_toTarget.x, -_toTarget.z);
        bot.pitch = Math.asin(Math.max(-1, Math.min(1, _toTarget.y / dist)));
        if (time >= bot.reactionAt && bot.reloadLeft === 0) {
          if (bot.burstLeft <= 0) {
            if (time >= bot.nextShotAt) {
              bot.burstLeft = 3 + Math.floor(rng.next() * 3);
              bot.nextShotAt = time + 0.55 + rng.next() * 0.5;
            }
          } else if (time >= bot.nextShotAt) {
            bot.nextShotAt = time + 0.11;
            bot.burstLeft -= 1;
            const moving = bot.target.isPlayer ? api.playerSpeed() : 2.5;
            // Early in the round, bots shooting at the human player aim
            // worse (x2 error for the first 10 s of live); bot-vs-bot aim
            // is unchanged. See sim.aimErrorMul.
            const error = (0.016 + dist * 0.0007 + moving * 0.0022) * api.aimErrorMul(bot.target);
            api.botShoot(bot, bot.target, error);
            bot.mag -= 1;
            if (bot.mag <= 0) {
              bot.mag = 30;
              bot.reloadLeft = 2.0;
            }
          }
        }
        // Strafe while engaging: a bot that plants its feet to shoot is a
        // static target, so it shuffles sideways across the line of fire in
        // short bursts, changing direction at random. The wobble this adds
        // to its own aim is priced into the error the shooter passes in.
        if (bot.strafeUntil <= time) {
          bot.strafeDir = rng.next() < 0.5 ? -1 : 1;
          bot.strafeUntil = time + rng.range(0.5, 1.1);
        }
        const strafeSpeed = 1.6;
        const perpX = -_toTarget.z / dist;
        const perpZ = _toTarget.x / dist;
        _delta.set(perpX * bot.strafeDir * strafeSpeed * dt, 0, perpZ * bot.strafeDir * strafeSpeed * dt);
        moveBox(bot.pos, _delta, 0.34, 1.72, world.colliders, _next);
        bot.pos.copy(_next);
        speed = strafeSpeed;
      }

      bot.speed = speed;
      bot.bobPhase += dt * (speed > 0 ? 9 : 2);
      bot.mesh.position.copy(bot.pos);
      bot.mesh.position.y = bot.pos.y + (speed > 0 ? Math.abs(Math.sin(bot.bobPhase)) * 0.03 : 0);
      bot.mesh.rotation.y = bot.yaw;
      bot.mesh.visible = bot.alive;
    }
  }

  return {
    actors,
    hitMeshes,
    aliveOf,
    reset,
    hearShot,
    eyeOf,
    step,
  };
}
