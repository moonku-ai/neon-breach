// Grenades: thrown, bounced, fused. Three kinds, one flight model: a small
// sphere with gravity that bounces off the map's boxes, then does its job when
// the fuse runs out. Frag hurts in a radius, flash blinds whoever can see it,
// smoke lays a cloud that blocks line of sight for both sides.
import * as THREE from 'three';
import { GRENADES } from './config.js';
import { emit } from './state.js';

const GRAVITY = 14;
const BOUNCE = 0.42;
const MAX_LIVE = 8;
const nextPos = new THREE.Vector3();
const eyePos = new THREE.Vector3();

export function createGrenades(scene, map, state, combat, effects, audio) {
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1c2129, roughness: 0.5, metalness: 0.6 });
  const meshes = [];
  for (let i = 0; i < MAX_LIVE; i += 1) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.castShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
  }

  function throwGrenade(fighter, kind, direction) {
    if (fighter.grenades[kind] <= 0) return false;
    const slot = state.grenades.length < MAX_LIVE ? state.grenades.length : -1;
    if (slot === -1) return false;
    fighter.grenades[kind] -= 1;
    const def = GRENADES[kind];
    const grenade = {
      kind,
      mesh: meshes[slot],
      position: new THREE.Vector3(
        fighter.position.x + direction.x * 0.5,
        fighter.position.y + fighter.eye - 0.1,
        fighter.position.z + direction.z * 0.5,
      ),
      velocity: new THREE.Vector3(
        direction.x * 13 + fighter.velocity.x * 0.5,
        direction.y * 13 + 2.5,
        direction.z * 13 + fighter.velocity.z * 0.5,
      ),
      fuseLeft: def.fuse,
      thrower: fighter,
    };
    grenade.mesh.visible = true;
    grenade.mesh.position.copy(grenade.position);
    state.grenades.push(grenade);
    emit(state, { type: 'grenadeThrown', fighter, kind });
    return true;
  }

  function collide(grenade, dt) {
    const p = grenade.position;
    const v = grenade.velocity;
    const next = nextPos.set(p.x + v.x * dt, p.y + v.y * dt, p.z + v.z * dt);
    // Floor.
    if (next.y < 0.09) {
      next.y = 0.09;
      v.y = Math.abs(v.y) * BOUNCE;
      v.x *= 0.7;
      v.z *= 0.7;
    }
    // Boxes: test each axis separately and reflect the velocity that hit.
    for (const box of map.colliders) {
      if (next.x > box.min.x - 0.09 && next.x < box.max.x + 0.09
        && next.y > box.min.y - 0.09 && next.y < box.max.y + 0.09
        && next.z > box.min.z - 0.09 && next.z < box.max.z + 0.09) {
        const wasX = p.x <= box.min.x - 0.09 || p.x >= box.max.x + 0.09;
        const wasZ = p.z <= box.min.z - 0.09 || p.z >= box.max.z + 0.09;
        if (wasX) { next.x = p.x; v.x = -v.x * BOUNCE; }
        else if (wasZ) { next.z = p.z; v.z = -v.z * BOUNCE; }
        else { next.y = p.y; v.y = -v.y * BOUNCE; }
      }
    }
    p.copy(next);
  }

  function detonate(grenade) {
    const def = GRENADES[grenade.kind];
    const p = grenade.position;
    if (grenade.kind === 'frag') {
      effects.explosion(p);
      audio.explosion();
      for (const fighter of state.fighters) {
        if (!fighter.alive) continue;
        const d = Math.hypot(
          fighter.position.x - p.x,
          fighter.position.y + 1 - p.y,
          fighter.position.z - p.z,
        );
        if (d < def.radius) {
          const damage = def.damage * (1 - (d / def.radius) * 0.7);
          combat.damageFighter(fighter, damage, grenade.thrower, false);
        }
      }
      emit(state, { type: 'explosion', position: { x: p.x, z: p.z } });
    } else if (grenade.kind === 'flash') {
      emit(state, { type: 'flashPop', position: { x: p.x, y: p.y, z: p.z } });
      for (const fighter of state.fighters) {
        if (!fighter.alive) continue;
        const d = Math.hypot(
          fighter.position.x - p.x,
          fighter.position.y + fighter.eye - p.y,
          fighter.position.z - p.z,
        );
        if (d > def.radius) continue;
        eyePos.set(fighter.position.x, fighter.position.y + fighter.eye, fighter.position.z);
        if (!combat.hasLineOfSight(p, eyePos)) continue;
        // Facing the flash blinds fully; facing away, only half as long.
        const facing = Math.sin(fighter.yaw) * (p.x - fighter.position.x)
          + Math.cos(fighter.yaw) * (p.z - fighter.position.z);
        const looking = facing < 0;
        fighter.blindUntil = state.time + def.blind * (looking ? 1 : 0.4) * (1 - d / (def.radius * 1.6));
      }
    } else if (grenade.kind === 'smoke') {
      const until = state.time + def.life;
      state.smokes.push({ position: p.clone(), radius: def.radius, expiresAt: until });
      effects.smokeAt(p, until);
      emit(state, { type: 'smokePop', position: { x: p.x, z: p.z } });
    }
  }

  return {
    throwGrenade,
    step(dt) {
      for (let i = state.grenades.length - 1; i >= 0; i -= 1) {
        const grenade = state.grenades[i];
        grenade.velocity.y -= GRAVITY * dt;
        collide(grenade, dt);
        grenade.mesh.position.copy(grenade.position);
        grenade.fuseLeft -= dt;
        if (grenade.fuseLeft <= 0) {
          detonate(grenade);
          grenade.mesh.visible = false;
          state.grenades.splice(i, 1);
        }
      }
      // Smoke clouds expire on their own clock.
      for (let i = state.smokes.length - 1; i >= 0; i -= 1) {
        if (state.time >= state.smokes[i].expiresAt) state.smokes.splice(i, 1);
      }
    },
  };
}
