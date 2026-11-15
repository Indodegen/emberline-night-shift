// The arsenal: three hitscan guns and one throwable. Each weapon owns its
// numbers — damage, headshot multiplier, fire rate, spread, reload — and its
// own boxy view model, so the three silhouettes read apart at a glance. The
// simulation owns the ray and the damage; this module owns the feel: recoil,
// muzzle flash, ADS zoom and the spread that punishes firing on the move.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 36,
    damage: 26, headMul: 2, fireGap: 0.16, reloadTime: 1.4,
    spreadStill: 0.004, spreadMove: 0.02, auto: false, kick: 0.006, adsMul: 0.5,
    adsFov: 65,
  },
  kr7: {
    id: 'kr7', name: 'KR-7 Carbine', price: 900, mag: 25, reserve: 75,
    damage: 30, headMul: 3, fireGap: 0.1, reloadTime: 2.0,
    spreadStill: 0.002, spreadMove: 0.026, auto: true, kick: 0.011, adsMul: 0.42,
    adsFov: 52,
  },
  longshot: {
    id: 'longshot', name: 'Longshot DMR', price: 1500, mag: 8, reserve: 24,
    damage: 72, headMul: 2, fireGap: 0.85, reloadTime: 2.6,
    spreadStill: 0.001, spreadMove: 0.02, auto: false, kick: 0.02, adsMul: 0.35,
    adsFov: 34,
  },
  frag: {
    id: 'frag', name: 'Frag-9 Grenade', price: 300, mag: 1, reserve: 1,
    damage: 90, headMul: 1, fireGap: 0.5, reloadTime: 0, spreadStill: 0,
    spreadMove: 0, auto: false, kick: 0.004, adsMul: 1,
    adsFov: 60,
  },
};

const MUZZLE_TIME = 0.06;

function buildViewModel(def) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.wall), roughness: 0.7, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.gunmetal), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const group = new THREE.Group();
  const add = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  if (def.id === 'p9') {
    add(0.06, 0.09, 0.22, 0, 0, -0.1, steel); // slide
    add(0.05, 0.12, 0.07, 0, -0.09, 0.02, dark); // grip
    add(0.02, 0.02, 0.02, 0, 0.055, -0.19, accent); // front sight
  } else if (def.id === 'longshot') {
    add(0.08, 0.09, 0.55, 0, 0, -0.2, steel); // long receiver
    add(0.04, 0.04, 0.5, 0, 0.02, -0.6, dark); // barrel
    add(0.07, 0.06, 0.16, 0, 0.07, -0.12, dark); // scope
    add(0.015, 0.015, 0.015, 0, 0.105, -0.12, accent); // scope glint
    add(0.06, 0.09, 0.2, 0, -0.03, 0.22, dark); // stock
  } else if (def.id === 'frag') {
    add(0.09, 0.11, 0.09, 0, 0, 0, steel); // body
    add(0.03, 0.05, 0.03, 0, 0.08, 0, accent); // fuse
    add(0.05, 0.02, 0.02, 0.03, 0.09, 0, dark); // lever
  } else {
    add(0.09, 0.1, 0.42, 0, 0, -0.12, steel); // receiver
    add(0.045, 0.045, 0.4, 0, 0.025, -0.5, dark); // barrel
    add(0.075, 0.08, 0.22, 0, -0.02, 0.2, dark); // stock
    add(0.03, 0.06, 0.12, 0, 0.08, -0.1, dark); // sight
    add(0.05, 0.04, 0.18, 0, -0.08, -0.28, accent); // handguard accent
  }
  return group;
}

export function createWeaponRig(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    models[def.id] = buildViewModel(def);
    models[def.id].visible = false;
    models[def.id].scale.setScalar(0.72);
    models[def.id].position.set(0.26, -0.23, -0.5);
    camera.add(models[def.id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.2, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.18, -0.65);
  camera.add(flashLight);

  let current = WEAPONS.p9;
  const state = { mag: current.mag, reserve: current.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, ads: 0 };

  function equip(id) {
    current = WEAPONS[id];
    for (const key of Object.keys(models)) models[key].visible = key === id;
    state.mag = current.mag;
    state.reserve = current.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
  }

  function step(dt, ads) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.ads += ((ads ? 1 : 0) - state.ads) * Math.min(1, dt * 10);
    const model = models[current.id];
    const hip = { x: 0.26, y: -0.23, z: -0.5 };
    const aim = { x: 0, y: -0.16, z: -0.4 };
    const a = state.ads;
    model.position.set(
      hip.x + (aim.x - hip.x) * a,
      hip.y + (aim.y - hip.y) * a,
      hip.z + (aim.z - hip.z) * a + state.kick,
    );
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (current.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = current.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    get def() {
      return current;
    },
    equip,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current.fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === current.mag || state.reserve === 0 || current.reloadTime === 0) return false;
      state.reloadLeft = current.reloadTime;
      return true;
    },
    spread(speed, ads, crouching) {
      const move = Math.min(1, speed / 5.4);
      let s = current.spreadStill + move * current.spreadMove;
      if (crouching) s *= 0.7;
      if (ads) s *= current.adsMul;
      return s;
    },
    refill() {
      state.mag = current.mag;
      state.reserve = current.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
