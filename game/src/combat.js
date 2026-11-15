// Combat: hitscan fire, damage and line of sight. One raycaster serves every
// shot: the ray is tested against the map and against every living fighter's
// head and torso meshes, and the nearer hit wins. Headshots multiply damage,
// armor halves it, and damage halves again past a weapon's falloff range.
// Deaths go through one function so the killfeed, the money and the bomb drop
// can never disagree.
import * as THREE from 'three';
import { ARMOR_REDUCTION, ECONOMY, WEAPONS } from './config.js';
import { emit } from './state.js';
import { weaponDamage } from './weapons.js';

const dir = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const tmp = new THREE.Vector3();
const endPoint = new THREE.Vector3();
const UP_AXIS = new THREE.Vector3(0, 1, 0);

export function createCombat(scene, map, state, effects, onDeath) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 160;
  const hitMeshes = []; // living fighters' head + torso meshes, kept current

  function registerFighter(fighter) {
    hitMeshes.push(fighter.headMesh, fighter.torsoMesh);
  }

  function unregisterFighter(fighter) {
    for (const mesh of [fighter.headMesh, fighter.torsoMesh]) {
      const i = hitMeshes.indexOf(mesh);
      if (i !== -1) hitMeshes.splice(i, 1);
    }
  }

  function eyePosition(fighter, out) {
    return out.set(fighter.position.x, fighter.position.y + fighter.eye, fighter.position.z);
  }

  // A clear line of sight between two points: no wall in between, and no smoke
  // cloud crossing the segment (smoke blocks sight for bots and for tracers).
  function hasLineOfSight(a, b, smokes = state.smokes) {
    tmp.copy(b).sub(a);
    const distance = tmp.length();
    if (distance < 0.001) return true;
    raycaster.set(a, tmp.normalize());
    raycaster.far = distance;
    if (raycaster.intersectObjects(map.shootables, false).length > 0) return false;
    for (const cloud of smokes) {
      if (nowInSmoke(a, b, cloud)) return false;
    }
    return true;
  }

  // Does the segment a->b pass within the cloud's radius? (closest point test)
  function nowInSmoke(a, b, cloud) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const len2 = abx * abx + aby * aby + abz * abz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1,
      ((cloud.position.x - a.x) * abx + (cloud.position.y - a.y) * aby + (cloud.position.z - a.z) * abz) / len2));
    const dx = a.x + abx * t - cloud.position.x;
    const dy = a.y + aby * t - cloud.position.y;
    const dz = a.z + abz * t - cloud.position.z;
    return dx * dx + dy * dy + dz * dz < cloud.radius * cloud.radius;
  }

  function damageFighter(target, amount, attacker, head) {
    if (!target.alive) return false;
    let damage = amount;
    if (target.armor) damage *= 1 - ARMOR_REDUCTION;
    target.health -= damage;
    if (target.health > 0) {
      emit(state, { type: 'hurt', target, attacker, head });
      return false;
    }
    target.health = 0;
    target.alive = false;
    unregisterFighter(target);
    if (attacker) {
      attacker.kills += 1;
      attacker.money = Math.min(16000, attacker.money + ECONOMY.kill);
    }
    target.deaths += 1;
    emit(state, { type: 'kill', killer: attacker, victim: target, head, weapon: attacker ? attacker.weapon.id : null });
    if (onDeath) onDeath(target, attacker);
    return true;
  }

  // Fire one hitscan round. origin is the shooter's eye, aim the intended
  // direction, spread the cone half-angle; muzzle is where the tracer starts.
  function fire(shooter, aim, spread, muzzle) {
    const weapon = shooter.weapon;
    const def = WEAPONS[weapon.id];
    dir.copy(aim);
    if (spread > 0) {
      right.crossVectors(dir, UP_AXIS).normalize();
      up.crossVectors(right, dir).normalize();
      const a = (state.random() * 2 - 1) * spread;
      const b = (state.random() * 2 - 1) * spread;
      dir.addScaledVector(right, a).addScaledVector(up, b).normalize();
    }
    eyePosition(shooter, tmp);
    raycaster.set(tmp, dir);
    raycaster.far = def.range;
    scene.updateMatrixWorld(true);
    const worldHit = raycaster.intersectObjects(map.shootables, false)[0];
    const bodyHits = raycaster.intersectObjects(hitMeshes, false);
    // The shooter's own hitboxes never count: a shot starts inside them.
    const bodyHit = bodyHits.find((h) => h.object.userData.fighter !== shooter);
    const hit = bodyHit && (!worldHit || bodyHit.distance < worldHit.distance) ? bodyHit : worldHit;
    const end = hit ? hit.point : endPoint.copy(tmp).addScaledVector(dir, def.range);
    if (muzzle) effects.tracer(muzzle, end);
    state.shotsHeard.push({ x: shooter.position.x, z: shooter.position.z, time: state.time });
    if (!hit) return null;
    if (hit.object.userData.fighter) {
      const target = hit.object.userData.fighter;
      if (target === shooter || target.team === shooter.team) return { blocked: true, point: hit.point };
      const head = hit.object.userData.part === 'head';
      const killed = damageFighter(target, weaponDamage(weapon, hit.distance, head), shooter, head);
      return { hit: true, target, head, killed, point: hit.point, distance: hit.distance };
    }
    effects.impact(hit.point, hit.face ? hit.face.normal : UP_AXIS, 6);
    return { hit: false, point: hit.point, distance: hit.distance };
  }

  return {
    registerFighter,
    unregisterFighter,
    eyePosition,
    hasLineOfSight,
    damageFighter,
    fire,
  };
}
