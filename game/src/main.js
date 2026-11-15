// Emberline — Night Shift, main loop. Everything the player sees and does is
// wired here: first-person camera, pointer lock, shooting, buying, and the
// fixed-step simulation. Rendering reads the sim; it never writes to it. Bot
// shots are resolved here too, because only the renderer owns the raycaster.
//
// Night-shift changes over the first yard: every weapon zooms to its own ADS
// field of view (the Longshot scopes in tight, the P9 barely zooms at all),
// the site beacons pulse on the sim's own clock, the screenshot presets gain
// a "clash" frame at site B, and the HUD gains round pips, a kill streak and
// a spike-carrier tag.
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS } from './weapons.js';
import { createEffects } from './effects.js';
import { createBots } from './bots.js';
import { createSim } from './sim.js';
import { createHud } from './hud.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 7);
const rng = makeRng(SEED);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.id = 'scene';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.bg);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.bg), 55, 170);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

// Lighting lives with the world (createWorld adds the night moon, sky fill and
// yard lamps); nothing here adds a second set.
let audio;
try {
  audio = createAudio();
} catch (error) {
  console.warn('Audio unavailable:', error);
  audio = { resume() {}, shot() {}, dryFire() {}, reload() {}, hurt() {}, hit() {}, buy() {}, roundEnd() {}, plantBeep() {}, explosion() {}, click() {}, setMuted() {} };
}
const world = createWorld(scene);
const effects = createEffects(scene);
const hud = createHud();
// Pointer lock is the input module's job: this callback is its one report.
let locked = false;
let paused = false;
const input = createInput(renderer.domElement, (isLocked) => {
  locked = isLocked;
  if (isLocked) {
    paused = false;
    hud.hideOverlay();
    if (sim.state.phase === 'menu') startMatch();
  } else if (!SHOT && sim.state.phase !== 'menu' && sim.state.phase !== 'match') {
    paused = true;
    hud.showOverlay('PAUSED', 'Click to resume the round.', () => {
      audio.resume();
      input.requestLock();
    });
  }
});
const player = createPlayer(world.colliders);
const rig = createWeaponRig(camera);
const bots = createBots(scene, world, rng);
const sim = createSim({ world, rng, audio, effects, hud });

const playerActor = {
  id: 'vanguard-YOU',
  name: 'YOU',
  team: 'vanguard',
  isPlayer: true,
  pos: player.state.position,
  yaw: 0,
  hp: 100,
  alive: true,
  mesh: null,
};
const actors = [playerActor, ...bots.actors];

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function los(from, to) {
  _origin.set(from.x, from.y, from.z);
  _dir.set(to.x - from.x, to.y - from.y, to.z - from.z);
  const dist = _dir.length();
  if (dist < 0.001) return true;
  _dir.divideScalar(dist);
  raycaster.set(_origin, _dir);
  raycaster.far = dist;
  const hits = raycaster.intersectObjects(world.shootables, false);
  return hits.length === 0;
}

function resolveShot(origin, dir, maxDist, shooter, damage, ownerTeam) {
  raycaster.set(origin, _dir.copy(dir));
  raycaster.far = maxDist;
  const targets = [...world.shootables, ...bots.hitMeshes];
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length === 0) return null;
  const hit = hits[0];
  const actor = hit.object.userData.actor;
  if (actor && actor.team !== ownerTeam) {
    return { point: hit.point.clone(), actor, part: hit.object.userData.part || 'torso' };
  }
  return { point: hit.point.clone(), actor: null, part: null };
}

function applyShot(origin, dir, maxDist, shooter, damage, ownerTeam) {
  const result = resolveShot(origin, dir, maxDist, shooter, damage, ownerTeam);
  const end = result ? result.point : _to.copy(origin).addScaledVector(dir, maxDist).clone();
  effects.tracer(_muzzle.copy(origin), end, camera.position);
  if (result && result.actor) {
    const dmg = result.part === 'head' ? damage * (shooter === playerActor ? rig.def.headMul : 3) : damage;
    sim.damageActor(result.actor, dmg, result.part, shooter, ctx);
  } else if (result) {
    effects.impact(result.point, 8);
  }
  return result;
}

function botShoot(bot, target, error) {
  const eye = bots.eyeOf(bot);
  _origin.set(eye.x, eye.y, eye.z);
  _chest.set(target.pos.x, target.pos.y + 1.3, target.pos.z);
  _dir.subVectors(_chest, _origin).normalize();
  // Aim error: a gaussian-ish wobble so a bot at 40 m is not aimbotting.
  const wobble = (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;
  const wobbleY = (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;
  const right = new THREE.Vector3().crossVectors(_dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, _dir).normalize();
  _dir.addScaledVector(right, wobble * error).addScaledVector(up, wobbleY * error).normalize();
  const dist = _origin.distanceTo(_chest);
  const hit = applyShot(_origin, _dir, dist + 2, bot, WEAPONS.kr7.damage, bot.team);
  if (!hit) {
    // The ray missed every collider but the target is still in the cone: a graze.
    const closest = _to.copy(_chest).sub(_origin);
    const along = closest.dot(_dir);
    const miss = Math.sqrt(Math.max(0, closest.lengthSq() - along * along));
    if (along > 0 && along < dist + 2 && miss < 0.55) {
      sim.damageActor(target, WEAPONS.kr7.damage, 'torso', bot, ctx);
    }
  }
  const dx = bot.pos.x - player.state.position.x;
  const dz = bot.pos.z - player.state.position.z;
  if (dx * dx + dz * dz < 40 * 40) audio.shot('kr7');
  bots.hearShot(bot.pos, bot.team, sim.state.time);
}

const EMPTY_PRESSED = new Set();
const ctx = {
  player: playerActor,
  bots,
  rig,
  actors,
  keys: input.state.keys,
  pressed: EMPTY_PRESSED,
  nextRound() {
    const site = rng.next() < 0.5 ? 'A' : 'B';
    const spawn = world.spawns.vanguard[0];
    player.reset(spawn[0], spawn[1], spawn[2]);
    playerActor.hp = 100;
    playerActor.alive = true;
    bots.reset(sim.state.round, site);
    // Surviving means keeping your rifle; dying means re-buying it.
    if (sim.state.owned.kr7) rig.equip('kr7');
    else if (sim.state.owned.longshot) rig.equip('longshot');
    else rig.equip('p9');
    rig.refill();
    hud.setHealth(100, true);
    hud.setAmmo(rig.state.mag, rig.state.reserve, rig.def.name);
    hud.setStreak(0);
    hud.setCarrier(sim.carrierName());
  },
};

const botApi = {
  get time() { return sim.state.time; },
  get phase() { return sim.state.phase; },
  get spike() { return sim.state.spike; },
  actors,
  los,
  playerSpeed: () => player.groundSpeed(),
  botShoot,
  aimErrorMul: (target) => sim.aimErrorMul(target),
  plantTick: (bot, progress) => sim.plantTick(bot, progress),
  plantDone: (bot) => sim.plantDone(bot),
  defuseTick: (bot, progress) => sim.defuseTick(bot, progress),
  defuseDone: (bot) => sim.defuseDone(bot),
};

function startMatch() {
  const site = rng.next() < 0.5 ? 'A' : 'B';
  const spawn = world.spawns.vanguard[0];
  player.reset(spawn[0], spawn[1], spawn[2]);
  playerActor.hp = 100;
  playerActor.alive = true;
  bots.reset(1, site);
  rig.equip('p9');
  rig.refill();
  hud.setHealth(100, true);
  hud.setScore(0, 0);
  hud.setMoney(800);
  hud.setStreak(0);
  hud.setCarrier('YOU');
  sim.startMatch();
}

// Mouse look, firing and key taps are read once per frame in the loop below
// (takeLook / takePressed), so a frame can never see the same tap twice.

function tryFire() {
  if (sim.state.phase !== 'live' || !playerActor.alive) return;
  if (!rig.ready()) {
    if (rig.state.mag === 0 && rig.state.reserve > 0) rig.reload();
    else audio.dryFire();
    return;
  }
  const def = rig.def;
  if (def.id === 'frag') {
    camera.getWorldDirection(_dir);
    _origin.copy(player.state.position);
    _origin.y += player.state.eye;
    _muzzle.copy(_origin).addScaledVector(_dir, 0.5);
    _muzzle.y -= 0.12;
    if (sim.throwGrenade(playerActor, _muzzle, _dir)) {
      rig.takeRound();
      rig.equip('p9');
      rig.refill();
      audio.click();
      hud.setAmmo(rig.state.mag, rig.state.reserve, rig.def.name);
    }
    return;
  }
  rig.takeRound();
  rig.pullTrigger();
  camera.getWorldDirection(_dir);
  _origin.copy(player.state.position);
  _origin.y += player.state.eye;
  const spread = rig.spread(player.groundSpeed(), input.state.ads, player.state.crouching);
  const wobble = (rng.next() + rng.next() - 1) * spread;
  const wobbleY = (rng.next() + rng.next() - 1) * spread;
  const right = new THREE.Vector3().crossVectors(_dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, _dir).normalize();
  _dir.addScaledVector(right, wobble).addScaledVector(up, wobbleY).normalize();
  applyShot(_origin, _dir, 120, playerActor, def.damage, 'vanguard');
  player.recoil(def.kick, (rng.next() - 0.5) * def.kick * 0.6);
  audio.shot(def.id);
  bots.hearShot(player.state.position, 'vanguard', sim.state.time);
  hud.setAmmo(rig.state.mag, rig.state.reserve, def.name);
  if (rig.state.mag === 0 && rig.state.reserve > 0) rig.reload();
}

// One frame's key taps: reload and weapon switching while live. Buying
// (keys 1-4 in the buy phase) is the simulation's job, fed the same set.
function handlePressed(pressed) {
  if (sim.state.phase !== 'live' || !playerActor.alive) return;
  if (pressed.has('KeyR') && rig.reload()) audio.reload();
  let switched = false;
  if (pressed.has('Digit1') && sim.state.owned.kr7) { rig.equip('kr7'); switched = true; }
  else if (pressed.has('Digit2') && sim.state.owned.longshot) { rig.equip('longshot'); switched = true; }
  else if (pressed.has('Digit3') && sim.state.owned.frag > 0) { rig.equip('frag'); switched = true; }
  else if (pressed.has('Digit4')) { rig.equip('p9'); switched = true; }
  if (switched) {
    rig.refill();
    hud.setAmmo(rig.state.mag, rig.state.reserve, rig.def.name);
  }
}

function yawTo(fx, fz, tx, tz) {
  return Math.atan2(-(tx - fx), -(tz - fz));
}

function botByName(name) {
  return bots.actors.find((b) => b.name === name);
}

function stageBot(bot, x, z, yaw) {
  // Put a bot on a mark: full health, alive, mesh synced to its sim position.
  bot.pos.set(x, 0, z);
  bot.yaw = yaw;
  bot.hp = 100;
  bot.alive = true;
  bot.target = null;
  bot.state = 'hold';
  bot.route = [];
  bot.mesh.visible = true;
  bot.mesh.position.set(x, 0, z);
  bot.mesh.rotation.y = yaw;
}

function placePlayer(x, z, yaw) {
  player.reset(x, z, yaw);
  playerActor.hp = 100;
  playerActor.alive = true;
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, yaw, 0);
}

function aimCameraAt(tx, ty, tz) {
  const dx = tx - camera.position.x;
  const dy = ty - camera.position.y;
  const dz = tz - camera.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  camera.rotation.set(Math.asin(Math.max(-1, Math.min(1, dy / len))), Math.atan2(-dx, -dz), 0);
}

function advanceBots(seconds) {
  // Let the bots fight for real for a few sim-seconds, so the killfeed
  // carries genuine entries. Effects age out before the frame is taken.
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    bots.step(1 / 60, botApi);
    effects.step(1 / 60);
    sim.state.time += 1 / 60;
  }
}

function shotBase() {
  // A fresh match; the caller then stages its own frame. Shot mode only:
  // SHOT is set solely by the ?shot= query, never in live play.
  sim.startMatch();
  bots.reset(1, 'A');
  playerActor.hp = 100;
  playerActor.alive = true;
  hud.hideOverlay();
  hud.showBuy(false);
  hud.hideScoreboard();
  hud.hideBanner();
}

function finishShot() {
  world.pulse(sim.state.time);
  renderOnce();
  document.title = 'ready';
}

// The four dossier frames, staged from the game's own pieces — real bot
// positions, real sim calls, real HUD setters — so each frame reads at a
// glance. Every value is fixed and no new randomness is drawn, so a retake
// is identical. The balance fix (spawn grace + early window in sim.js) is
// untouched: these presets only arrange a photograph of the game.

// 1 — cover: a contact moment at mid-east. The player holds the lane,
// DUSK is in the crosshair, the player's shot just landed (muzzle flash,
// impact sparks, hitmarker), and DUSK's return fire crosses the frame
// toward REX as a tracer. Round 2, Vanguard up 1-0.
function applyClashShot() {
  shotBase();
  sim.state.phase = 'live';
  sim.state.liveAt = 0;
  advanceBots(6);
  sim.state.phase = 'live';
  hud.hideScoreboard();
  hud.hideBanner();
  sim.state.round = 2;
  sim.state.score.vanguard = 1;
  sim.state.score.sentinel = 0;
  sim.state.money = 1300; // 800 + 1400 win bonus − 900 KR-7
  sim.state.timer = 52;
  sim.state.spike.carrier = 'player';
  // The enemy in the crosshair is ORIN: MIRA and DUSK died in the advance
  // (the killfeed says so), so they stay dead and out of the frame — the
  // bots on screen are all alive, and the feed agrees with the picture.
  stageBot(botByName('ORIN'), 11, -4, yawTo(11, -4, 8, 3));
  stageBot(botByName('REX'), 6, -2, yawTo(6, -2, 11, -4));
  stageBot(botByName('ASH'), -2, 6, 0);
  placePlayer(8, 3, 0);
  rig.equip('kr7');
  rig.refill();
  // The player's shot at ORIN: muzzle flash + impact sparks on the bot.
  aimCameraAt(11, 1.3, -4);
  camera.getWorldDirection(_dir);
  _origin.copy(player.state.position);
  _origin.y += player.state.eye;
  rig.takeRound();
  rig.pullTrigger();
  applyShot(_origin, _dir, 120, playerActor, rig.def.damage, 'vanguard');
  // ORIN's answer at REX, drawn as a tracer the camera can see.
  const orin = botByName('ORIN');
  const rex = botByName('REX');
  effects.tracer(
    new THREE.Vector3(orin.pos.x, orin.pos.y + 1.55, orin.pos.z),
    new THREE.Vector3(rex.pos.x, rex.pos.y + 1.3, rex.pos.z),
    camera.position,
  );
  effects.impact(new THREE.Vector3(rex.pos.x, rex.pos.y + 1.3, rex.pos.z), 8);
  hud.setPhase('live', 2);
  hud.setTimer(52);
  hud.setMoney(1300);
  hud.setHealth(100, true);
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.def.name);
  hud.setCarrier('YOU');
  hud.setStreak(0);
  hud.setScore(1, 0);
  finishShot();
}

// 2 — buy phase: round 2, Vanguard up 1-0, $2,200 to spend, the buy menu
// readable over the yard. The player has not bought yet (P9 in hand).
function applyBuyShot() {
  shotBase();
  sim.state.phase = 'live';
  sim.state.liveAt = 0;
  advanceBots(6);
  sim.state.phase = 'buy';
  hud.hideScoreboard();
  hud.hideBanner();
  sim.state.round = 2;
  sim.state.score.vanguard = 1;
  sim.state.score.sentinel = 0;
  sim.state.money = 2200; // 800 + 1400 win bonus, nothing bought yet
  sim.state.timer = 12;
  sim.state.spike.carrier = 'player';
  placePlayer(-4, 13, 0.05);
  rig.equip('p9');
  rig.refill();
  hud.setPhase('buy', 2);
  hud.setTimer(12);
  hud.setMoney(2200);
  hud.setHealth(100, true);
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.def.name);
  hud.setCarrier('YOU');
  hud.setStreak(0);
  hud.setScore(1, 0);
  hud.showBuy(true, 2200, { kr7: false, longshot: false, frag: 0 });
  finishShot();
}

// 3 — the spike planted at A: ASH planted it, the banner and the armed
// objective line say so, ORIN rotates in to defuse. Round 3, 1-1.
function applyPlantShot() {
  shotBase();
  sim.state.phase = 'live';
  sim.state.liveAt = 0;
  advanceBots(6);
  sim.state.phase = 'live';
  hud.hideScoreboard();
  sim.state.round = 3;
  sim.state.score.vanguard = 1;
  sim.state.score.sentinel = 1;
  sim.state.money = 2100; // 800 + 1400 win − 900 KR-7 + 800 loss
  sim.state.timer = 52;
  const ash = botByName('ASH');
  stageBot(ash, -15, -6, yawTo(-15, -6, -10, -2));
  stageBot(botByName('ORIN'), -12, -11, yawTo(-12, -11, -10, -2));
  stageBot(botByName('REX'), -6, 2, 0);
  // MIRA and DUSK died in the advance (the killfeed says so) and sit out
  // of this frame, so they are left dead rather than revived on screen.
  sim.state.spike.carrier = ash;
  sim.plantDone(ash); // spike planted at A; banner "SPIKE PLANTED"
  placePlayer(-10, -2, 0);
  playerActor.hp = 86;
  rig.equip('kr7');
  rig.refill();
  aimCameraAt(-15, 1.3, -6);
  hud.setPhase('live', 3);
  // setSpike after setPhase: setPhase rewrites the objective line, and the
  // armed-spike text (35s, matching the banner) must be the one that stays.
  hud.setSpike(35, 'A');
  hud.setTimer(52);
  hud.setMoney(2100);
  hud.setHealth(86, true);
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.def.name);
  hud.setCarrier('ASH');
  hud.setStreak(0);
  hud.setScore(1, 1);
  finishShot();
}

// 4 — round end: the player cleared the Sentinels, so the round ends on
// three real kills through the sim — the killfeed and the scoreboard both
// record them. Round 4, Vanguard takes it 3-1.
function applyScoreShot() {
  shotBase();
  sim.state.phase = 'live';
  sim.state.liveAt = 0;
  sim.state.round = 4;
  sim.state.score.vanguard = 2;
  sim.state.score.sentinel = 1;
  sim.state.money = 2100;
  sim.state.timer = 48;
  sim.state.spike.carrier = 'player';
  placePlayer(0, 10, 0);
  rig.equip('kr7');
  rig.refill();
  hud.setPhase('live', 4);
  for (const name of ['ORIN', 'MIRA', 'DUSK']) {
    sim.damageActor(botByName(name), 999, 'torso', playerActor, ctx);
  }
  // The third kill ends the round: banner + scoreboard are up.
  hud.setTimer(4);
  hud.setMoney(3000);
  hud.setHealth(100, true);
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.def.name);
  hud.setCarrier('YOU');
  hud.setStreak(3);
  hud.setScore(3, 1);
  finishShot();
}

function applyShotMode() {
  if (SHOT === 'buy') applyBuyShot();
  else if (SHOT === 'plant') applyPlantShot();
  else if (SHOT === 'score') applyScoreShot();
  else applyClashShot(); // 'clash' and any unknown preset: the cover
}

function renderOnce() {
  rig.step(0.016, false);
  effects.step(0.016);
  renderer.render(scene, camera);
}

const clock = new THREE.Clock();
let accumulator = 0;
const FIXED = 1 / 60;
let fovTarget = 75;
let wasFiring = false;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  hud.step(dt);

  if (!SHOT && !paused && (locked || sim.state.phase === 'menu' || sim.state.phase === 'match')) {
    const look = input.takeLook();
    if (locked) player.look(look.x, look.y);
    const pressed = input.takePressed();
    handlePressed(pressed);
    accumulator += dt;
    // The frame's taps reach the simulation once, on the first fixed step;
    // later steps in the same frame get an empty set.
    let firstStep = true;
    while (accumulator >= FIXED) {
      accumulator -= FIXED;
      ctx.pressed = firstStep ? pressed : EMPTY_PRESSED;
      firstStep = false;
      sim.step(FIXED, ctx);
      if (sim.state.phase === 'live' || sim.state.phase === 'buy') bots.step(FIXED, botApi);
    }
    if (locked && playerActor.alive && sim.state.phase !== 'menu' && sim.state.phase !== 'match') {
      player.step(dt, input.state.keys, input.state.ads);
      const firing = input.state.firing;
      // Semi-auto fires once per click; full-auto keeps firing while held.
      if (firing && (!wasFiring || rig.def.auto)) tryFire();
      wasFiring = firing;
    } else {
      wasFiring = false;
    }
  }

  // Camera follows the player, with ADS zoom per weapon.
  if (!SHOT) {
    camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
    camera.rotation.y = player.state.yaw;
    camera.rotation.x = player.state.pitch;
    camera.rotation.z = 0;
    fovTarget = input.state.ads && playerActor.alive ? (rig.def.adsFov || 52) : 75;
    if (Math.abs(camera.fov - fovTarget) > 0.1) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    rig.step(dt, input.state.ads);
    const spread = rig.spread(player.groundSpeed(), input.state.ads, player.state.crouching);
    document.documentElement.style.setProperty('--spread', `${Math.round(6 + spread * 900)}px`);
    hud.setHealth(playerActor.hp, playerActor.alive);
  }
  world.pulse(sim.state.time);
  effects.step(dt);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

hud.showOverlay(
  'EMBERLINE — NIGHT SHIFT',
  'Vanguard vs Sentinel — first to 4 rounds. Plant the spike at A or B, or eliminate the other team. Click to play.',
  () => {
    // Pointer lock is requested here; the lock callback starts the match and
    // hides this overlay once the lock is actually held.
    audio.resume();
    input.requestLock();
  },
);

if (SHOT) {
  applyShotMode();
} else {
  loop();
}
