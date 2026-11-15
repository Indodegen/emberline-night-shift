// Emberline — Night Shift: an original industrial yard, 46 x 32 m, built from
// boxes. Two bomb sites (A west, B east), three lanes (A-long, mid, B-long),
// and a waypoint graph the bots walk. Every solid box is a collider for
// players and bots and a surface a bullet stops on. Nothing is loaded from a
// file: the yard's sign is painted on a canvas at runtime.
//
// Night-shift changes over the first yard: a gantry beam crosses mid with a
// lamp hanging under it, two more crates break the long sightlines down the
// flanks, a third lamp pools light on the north side, and the site plates
// pulse — the beacons breathe so the live site reads at a glance.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [width, height, depth, x, y, z, material] — every row is one solid box.
// The rows' x/z/y values are the map's contract with the waypoint graph:
// the first 30 rows are the original yard, unchanged, so every waypoint,
// spawn and bot route from the first build still lands on open ground.
const BOXES = [
  // Perimeter: floor + walls, 5 m high, open to the night sky.
  [46.8, 0.4, 32.8, 0, -0.2, 0, 'canvas'],
  [0.5, 5, 32.8, -23.3, 2.5, 0, 'wall'],
  [0.5, 5, 32.8, 23.3, 2.5, 0, 'wall'],
  [46.8, 5, 0.5, 0, 2.5, -16.3, 'wall'],
  [46.8, 5, 0.5, 0, 2.5, 16.3, 'wall'],
  // Site A (west): a container along the back wall, crates to plant behind.
  [6.2, 2.6, 2.4, -18.5, 1.3, -13.5, 'container'],
  [2.4, 1.2, 1.2, -14.5, 0.6, -11.5, 'crate'],
  [1.2, 1.2, 1.2, -14.5, 1.8, -11.5, 'crate'],
  [1.2, 1.2, 2.4, -20.5, 0.6, -8.0, 'crate'],
  [3.6, 1.1, 1.2, -12.0, 0.55, -6.5, 'crate'],
  // Site B (east): stacked containers, a crate wall to crouch behind.
  [6.2, 2.6, 2.4, 18.5, 1.3, -13.5, 'container'],
  [2.4, 2.4, 2.4, 14.0, 1.2, -13.0, 'container'],
  [1.2, 1.2, 1.2, 20.5, 0.6, -8.0, 'crate'],
  [3.6, 1.1, 1.2, 12.0, 0.55, -6.5, 'crate'],
  // Mid: a central blockhouse with two doors, crates on either side.
  [4.4, 3.0, 1.4, -3.4, 1.5, -2.0, 'wall'],
  [4.4, 3.0, 1.4, 3.4, 1.5, -2.0, 'wall'],
  [1.2, 1.2, 1.2, -6.5, 0.6, 3.5, 'crate'],
  [1.2, 1.2, 1.2, 6.5, 0.6, 3.5, 'crate'],
  [2.4, 0.9, 1.2, 0, 0.45, 6.0, 'crate'],
  // A-long (west corridor): a container and crates break the sightline.
  [2.4, 2.6, 6.0, -21.0, 1.3, 2.0, 'container'],
  [1.2, 1.2, 1.2, -19.5, 0.6, -4.5, 'crate'],
  // B-long (east corridor): mirrored cover.
  [2.4, 2.6, 6.0, 21.0, 1.3, 2.0, 'container'],
  [1.2, 1.2, 1.2, 19.5, 0.6, -4.5, 'crate'],
  // Spawn cover: crates the attackers step out from behind.
  [2.4, 1.1, 1.2, -4.0, 0.55, 11.5, 'crate'],
  [2.4, 1.1, 1.2, 4.0, 0.55, 11.5, 'crate'],
  [1.2, 1.1, 1.2, 0, 0.55, 12.8, 'crate'],
  // North hold cover for the defenders.
  [1.6, 1.1, 1.6, -8.0, 0.55, -11.5, 'crate'],
  [1.6, 1.1, 1.6, 8.0, 0.55, -11.5, 'crate'],
  // Night shift, new cover: the gantry's two legs stand clear of every lane,
  // and the flank crates sit between the connector waypoints, not on them.
  [0.5, 4.3, 0.5, -7.0, 2.15, -2.0, 'wall'],
  [0.5, 4.3, 0.5, 7.0, 2.15, -2.0, 'wall'],
  [14.5, 0.5, 0.8, 0, 4.3, -2.0, 'wall'],
  [1.2, 1.2, 1.2, -9.0, 0.6, 6.5, 'crate'],
  [1.2, 1.2, 1.2, 9.0, 0.6, 6.5, 'crate'],
];

// Waypoints the bots walk: [x, z, links...]. Lanes run south (spawn) to north
// (sites); mid crosses the map at z = 2 and z = -8. Unchanged from the first
// yard — the bot routes were tuned against these exact indices.
const WAYPOINTS = [
  [-2, 12.5, [1, 2, 7]], // 0 vanguard spawn, mid
  [-6, 12.5, [0, 3]], // 1 vanguard spawn, west
  [6, 12.5, [0, 13]], // 2 vanguard spawn, east
  [-19, 8, [1, 4]], // 3 A-long south
  [-19, -4, [3, 5, 18]], // 4 A-long mid
  [-17, -9, [4, 6]], // 5 site A
  [-12, -9, [5, 9, 18]], // 6 A approach
  [0, 8, [0, 8]], // 7 mid south
  [0, 0, [7, 9, 18, 19]], // 8 mid
  [0, -8, [8, 6, 10]], // 9 mid north
  [12, -9, [9, 11, 19]], // 10 B approach
  [17, -9, [10, 12]], // 11 site B
  [19, -4, [11, 13, 19]], // 12 B-long mid
  [19, 8, [2, 12]], // 13 B-long south
  [-2, -13, [9, 16]], // 14 sentinel spawn
  [6, -13, [9, 17]], // 15 sentinel spawn east
  [-8, -12, [14, 6]], // 16 A hold
  [8, -12, [15, 10]], // 17 B hold
  [-10, 2, [4, 6, 8]], // 18 mid-west connector
  [10, 2, [8, 10, 12]], // 19 mid-east connector
];

function makeSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#11141b';
  ctx.fillRect(0, 0, 1024, 192);
  ctx.fillStyle = '#ffb02e';
  ctx.font = '700 88px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EMBERLINE', 512, 76);
  ctx.fillStyle = '#2fd3c4';
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillText('— NIGHT SHIFT —', 512, 140);
  ctx.fillStyle = '#8b94a0';
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.fillText('SECTOR 07  ·  FREIGHT TERMINAL', 512, 178);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {
    canvas: new THREE.MeshStandardMaterial({ color: PALETTE.canvas, roughness: 0.95 }),
    surface: new THREE.MeshStandardMaterial({ color: PALETTE.surface, roughness: 0.9 }),
    wall: new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.88, metalness: 0.05 }),
    crate: new THREE.MeshStandardMaterial({ color: PALETTE.crate, roughness: 0.85 }),
    container: new THREE.MeshStandardMaterial({ color: PALETTE.container, roughness: 0.6, metalness: 0.35 }),
  };

  const colliders = [];
  const shootables = [];

  for (const [w, h, d, x, y, z, material] of BOXES) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    // Rows carry their own y: the floor row sits at y -0.2, top exactly 0.
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
  }

  // Site plates: paint on the floor, not solid — players walk straight over
  // them. Each plate keeps its own materials so the beacons can pulse.
  const beacons = [];
  function sitePlate(x, z, color) {
    const plateMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), plateMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    group.add(mesh);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.4, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    group.add(ring);
    beacons.push({ plateMat, ringMat });
  }
  sitePlate(-17, -9, new THREE.Color(PALETTE.accent));
  sitePlate(17, -9, new THREE.Color(PALETTE.teal));

  // The yard sign on the north wall, and three lamp posts that throw pools
  // of light. The gantry lamp hangs under the beam over mid.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 2.25),
    new THREE.MeshBasicMaterial({ map: makeSignTexture() }),
  );
  sign.position.set(0, 4.1, -16.0);
  group.add(sign);

  for (const [x, z] of [[-11, 4], [11, 4], [0, -11]]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 5.4, 8),
      materials.wall,
    );
    pole.position.set(x, 2.7, z);
    pole.castShadow = true;
    group.add(pole);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 26, 16, 1.8);
    lamp.position.set(x, 5.2, z);
    scene.add(lamp);
  }
  const gantryLamp = new THREE.PointLight(new THREE.Color(PALETTE.beacon), 30, 14, 1.6);
  gantryLamp.position.set(0, 4.0, -2.0);
  scene.add(gantryLamp);

  // Night light: a low amber moon, a cool sky fill, and a gradient sky.
  const sky = new THREE.HemisphereLight(new THREE.Color('#2c3c5a'), new THREE.Color('#0b0e13'), 0.85);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 1.9);
  sun.position.set(-14, 10, 12);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a7ba6'), 0.45);
  fill.position.set(10, 12, -10);
  scene.add(fill);

  const waypoints = WAYPOINTS.map(([x, z, links]) => ({ x, z, links }));

  return {
    group,
    colliders,
    shootables,
    bounds: { minX: -22.6, maxX: 22.6, minZ: -15.6, maxZ: 15.6 },
    sites: {
      A: { x: -17, z: -9, radius: 3.4 },
      B: { x: 17, z: -9, radius: 3.4 },
    },
    spawns: {
      vanguard: [[-4, 13, 0], [0, 13.5, 0], [4, 13, 0]],
      sentinel: [[-6, -13, Math.PI], [0, -13.5, Math.PI], [6, -13, Math.PI]],
    },
    waypoints,
    // The beacons breathe: plates and rings swell and fade on a slow sine,
    // out of phase per site, so the live site catches the eye. Purely
    // visual — the sim never reads it, and the phase is driven by the sim's
    // own clock, so a replay shows the same pulse.
    pulse(time) {
      for (let i = 0; i < beacons.length; i += 1) {
        const s = 0.5 + 0.5 * Math.sin(time * 1.6 + i * Math.PI);
        beacons[i].plateMat.opacity = 0.14 + 0.22 * s;
        beacons[i].ringMat.opacity = 0.5 + 0.4 * s;
      }
    },
    // Breadth-first route through the waypoint graph.
    route(fromIndex, toIndex) {
      if (fromIndex === toIndex) return [toIndex];
      const prev = new Map([[fromIndex, -1]]);
      const queue = [fromIndex];
      while (queue.length > 0) {
        const at = queue.shift();
        if (at === toIndex) break;
        for (const next of waypoints[at].links) {
          if (!prev.has(next)) {
            prev.set(next, at);
            queue.push(next);
          }
        }
      }
      if (!prev.has(toIndex)) return [toIndex];
      const path = [];
      let at = toIndex;
      while (at !== -1) {
        path.unshift(at);
        at = prev.get(at);
      }
      return path;
    },
    nearestWaypoint(x, z) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < waypoints.length; i += 1) {
        const dx = waypoints[i].x - x;
        const dz = waypoints[i].z - z;
        const d = dx * dx + dz * dz;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    },
  };
}

// Move an upright box (radius, height, feet at y) by delta, one axis at a time,
// so a wall never swallows the mover. Reused by the player and every bot.
// Writes the result into out and returns it.
const _probe = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
export function moveBox(pos, delta, radius, height, colliders, out) {
  const lift = 0.04;
  function overlaps(x, y, z) {
    _probe.min.x = x - radius;
    _probe.min.y = y + lift;
    _probe.min.z = z - radius;
    _probe.max.x = x + radius;
    _probe.max.y = y + height - lift;
    _probe.max.z = z + radius;
    for (let i = 0; i < colliders.length; i += 1) {
      const c = colliders[i];
      if (
        _probe.min.x < c.max.x && _probe.max.x > c.min.x &&
        _probe.min.y < c.max.y && _probe.max.y > c.min.y &&
        _probe.min.z < c.max.z && _probe.max.z > c.min.z
      ) return c;
    }
    return null;
  }
  let x = pos.x;
  let y = pos.y;
  let z = pos.z;
  const nx = x + delta.x;
  if (!overlaps(nx, y, z)) x = nx;
  const nz = z + delta.z;
  if (!overlaps(x, y, nz)) z = nz;
  const ny = y + delta.y;
  const hit = overlaps(x, ny, z);
  if (!hit) {
    y = ny;
  } else if (delta.y <= 0) {
    y = hit.max.y;
  } else {
    y = hit.min.y - height;
  }
  if (y < 0) y = 0;
  out.set(x, y, z);
  return out;
}
