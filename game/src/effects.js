// Combat feedback, pooled and reused: tracers, impact sparks, explosions and
// muzzle glow. Nothing is allocated in the hot loop — every tracer, spark and
// light comes from a fixed pool, so a firefight cannot stall the frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 240;

export function createEffects(scene) {
  const tracers = [];
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 });
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerCursor = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  const sparkVel = new Float32Array(SPARK_COUNT * 3);
  const sparkLife = new Float32Array(SPARK_COUNT);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkCursor = 0;

  const boomGeo = new THREE.SphereGeometry(1, 20, 14);
  const boomMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3d'), transparent: true, opacity: 0.85, depthWrite: false });
  const boom = new THREE.Mesh(boomGeo, boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color('#ff9a3d'), 0, 18, 1.6);
  scene.add(boomLight);
  let boomLife = 0;

  const _from = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _mid = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _seg = new THREE.Vector3();
  const _closest = new THREE.Vector3();

  function tracer(from, to, cameraPos) {
    // A tracer that flies through the viewpoint fills the screen with a
    // wedge; the player cannot see a bullet pass through their own head, so
    // that one is skipped instead of drawn.
    if (cameraPos) {
      _seg.subVectors(to, from);
      const lenSq = _seg.lengthSq();
      if (lenSq > 0) {
        const t = Math.max(0, Math.min(1, _closest.subVectors(cameraPos, from).dot(_seg) / lenSq));
        _closest.copy(from).addScaledVector(_seg, t);
        if (_closest.distanceTo(cameraPos) < 0.7) return;
      }
    }
    const slot = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % TRACER_COUNT;
    _mid.addVectors(from, to).multiplyScalar(0.5);
    _dir.subVectors(to, from);
    const len = _dir.length() || 0.001;
    slot.mesh.position.copy(_mid);
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.lookAt(to);
    slot.mesh.visible = true;
    slot.life = 0.07;
  }

  function impact(point, count = 10) {
    for (let n = 0; n < count; n += 1) {
      const i = sparkCursor;
      sparkCursor = (sparkCursor + 1) % SPARK_COUNT;
      sparkPos[i * 3] = point.x;
      sparkPos[i * 3 + 1] = point.y;
      sparkPos[i * 3 + 2] = point.z;
      sparkVel[i * 3] = (Math.random() * 2 - 1) * 3;
      sparkVel[i * 3 + 1] = Math.random() * 3.5;
      sparkVel[i * 3 + 2] = (Math.random() * 2 - 1) * 3;
      sparkLife[i] = 0.35;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function explosion(point) {
    boom.position.copy(point);
    boom.scale.setScalar(0.4);
    boom.visible = true;
    boomLife = 0.55;
    boomLight.position.copy(point);
    boomLight.position.y += 1;
    boomLight.intensity = 90;
    impact(point, 60);
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    let anySpark = false;
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      if (sparkLife[i] <= 0) continue;
      anySpark = true;
      sparkLife[i] -= dt;
      sparkPos[i * 3] += sparkVel[i * 3] * dt;
      sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
      sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      sparkVel[i * 3 + 1] -= 9 * dt;
      if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = -10;
    }
    if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
    if (boomLife > 0) {
      boomLife -= dt;
      const t = 1 - Math.max(0, boomLife) / 0.55;
      boom.scale.setScalar(0.4 + t * 4.6);
      boomMat.opacity = 0.85 * (1 - t);
      boomLight.intensity = 90 * (1 - t);
      if (boomLife <= 0) {
        boom.visible = false;
        boomLight.intensity = 0;
      }
    }
  }

  return { tracer, impact, explosion, step, _from, _to };
}
