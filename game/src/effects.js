// Effects: tracers, impact sparks, explosions and smoke. Everything is pooled
// and reused — the hot loops make no new objects per frame — and every pool is
// a fixed size, so a long firefight costs the same as a short one.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 48;
const SPARK_COUNT = 240;
const TRACER_LIFE = 0.07;
const SPARK_LIFE = 0.45;

export function createEffects(scene) {
  // Tracers: one LineSegments with a position buffer; each tracer is a segment
  // whose life ticks down, then collapses to a point (invisible).
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(TRACER_COUNT * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracers = new THREE.LineSegments(
    tracerGeo,
    new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 }),
  );
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tracerLife = new Float32Array(TRACER_COUNT);
  let tracerNext = 0;

  // Sparks: one Points cloud; each spark has a velocity and a life.
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.07, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(SPARK_COUNT * 3);
  const sparkLife = new Float32Array(SPARK_COUNT);
  let sparkNext = 0;

  // Explosion: a flash sphere and a point light, scaled down over 0.5 s.
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 30, 1.6);
  scene.add(boomLight);
  let boomLeft = 0;

  // Smoke: up to 6 clouds, each 5 translucent spheres that drift and fade.
  // Each cloud has its own material, so one cloud fading never fades another.
  const smokeGeo = new THREE.SphereGeometry(1.6, 10, 8);
  const smokeGroups = [];
  for (let i = 0; i < 6; i += 1) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x9aa4b0, transparent: true, opacity: 0.42, depthWrite: false });
    for (let j = 0; j < 5; j += 1) {
      const puff = new THREE.Mesh(smokeGeo, mat);
      puff.position.set((j % 3 - 1) * 1.4, (j % 2) * 0.9 + 0.6, (Math.floor(j / 3) - 0.5) * 1.6);
      group.add(puff);
    }
    group.visible = false;
    scene.add(group);
    smokeGroups.push({ group, mat, until: 0 });
  }

  const tmp = new THREE.Vector3();

  return {
    tracer(from, to) {
      const i = tracerNext;
      tracerNext = (tracerNext + 1) % TRACER_COUNT;
      tracerPos[i * 6] = from.x;
      tracerPos[i * 6 + 1] = from.y;
      tracerPos[i * 6 + 2] = from.z;
      tracerPos[i * 6 + 3] = to.x;
      tracerPos[i * 6 + 4] = to.y;
      tracerPos[i * 6 + 5] = to.z;
      tracerLife[i] = TRACER_LIFE;
      tracerGeo.attributes.position.needsUpdate = true;
    },
    impact(point, normal, count = 8) {
      for (let n = 0; n < count; n += 1) {
        const i = sparkNext;
        sparkNext = (sparkNext + 1) % SPARK_COUNT;
        sparkPos[i * 3] = point.x;
        sparkPos[i * 3 + 1] = point.y;
        sparkPos[i * 3 + 2] = point.z;
        tmp.copy(normal).multiplyScalar(2 + Math.random() * 3);
        tmp.x += (Math.random() - 0.5) * 3;
        tmp.y += Math.random() * 3;
        tmp.z += (Math.random() - 0.5) * 3;
        sparkVel[i * 3] = tmp.x;
        sparkVel[i * 3 + 1] = tmp.y;
        sparkVel[i * 3 + 2] = tmp.z;
        sparkLife[i] = SPARK_LIFE * (0.5 + Math.random() * 0.5);
      }
      sparkGeo.attributes.position.needsUpdate = true;
    },
    explosion(point) {
      boom.position.copy(point);
      boom.visible = true;
      boomLeft = 0.5;
      boomLight.position.copy(point);
      boomLight.position.y += 1;
      this.impact(point, tmp.set(0, 1, 0), 40);
    },
    smokeAt(point, until) {
      const slot = smokeGroups.find((s) => !s.group.visible) ?? smokeGroups[0];
      slot.group.position.copy(point);
      slot.group.visible = true;
      slot.until = until;
    },
    step(dt, now) {
      let tracerDirty = false;
      for (let i = 0; i < TRACER_COUNT; i += 1) {
        if (tracerLife[i] <= 0) continue;
        tracerLife[i] -= dt;
        if (tracerLife[i] <= 0) {
          tracerPos[i * 6 + 3] = tracerPos[i * 6];
          tracerPos[i * 6 + 4] = tracerPos[i * 6 + 1];
          tracerPos[i * 6 + 5] = tracerPos[i * 6 + 2];
          tracerDirty = true;
        }
      }
      if (tracerDirty) tracerGeo.attributes.position.needsUpdate = true;
      let sparkDirty = false;
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 12 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        if (sparkPos[i * 3 + 1] < 0.02) sparkPos[i * 3 + 1] = 0.02;
        sparkDirty = true;
      }
      if (sparkDirty) sparkGeo.attributes.position.needsUpdate = true;
      if (boomLeft > 0) {
        boomLeft -= dt;
        const k = Math.max(0, boomLeft / 0.5);
        boom.scale.setScalar(1 + (1 - k) * 6);
        boom.material.opacity = k * 0.8;
        boomLight.intensity = k * 220;
        if (boomLeft <= 0) {
          boom.visible = false;
          boomLight.intensity = 0;
        }
      }
      for (const slot of smokeGroups) {
        if (!slot.group.visible) continue;
        if (now >= slot.until) { slot.group.visible = false; continue; }
        slot.group.rotation.y += dt * 0.15;
        slot.mat.opacity = 0.42 * Math.min(1, (slot.until - now) / 2);
      }
    },
  };
}
