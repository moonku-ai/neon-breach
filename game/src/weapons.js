// Weapons: the numbers live in config.js; this module owns the firing state
// machine and the first-person view models. A fighter's weapon state is plain
// data on the fighter (mag, reserve, cooldown, reloading), so the sim and the
// bots share it; only the human gets a view model, built from boxes per weapon.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { PALETTE } from './palette.js';

export function createWeaponState(weaponId) {
  const def = WEAPONS[weaponId];
  return { id: weaponId, mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0 };
}

export function weaponReady(state) {
  return state.mag > 0 && state.cooldown <= 0 && state.reloadLeft <= 0;
}

export function weaponStep(state, dt) {
  state.cooldown = Math.max(0, state.cooldown - dt);
  if (state.reloadLeft > 0) {
    state.reloadLeft = Math.max(0, state.reloadLeft - dt);
    if (state.reloadLeft === 0) {
      const def = WEAPONS[state.id];
      const take = Math.min(def.mag - state.mag, state.reserve);
      state.mag += take;
      state.reserve -= take;
    }
  }
}

export function weaponReload(state) {
  const def = WEAPONS[state.id];
  if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false;
  state.reloadLeft = def.reload;
  return true;
}

// The spread cone for a shot: tight while still, wide while sprinting, tighter
// still while crouched or scoped. This is what makes stopping to aim pay.
export function weaponSpread(state, speed, crouching, aiming) {
  const def = WEAPONS[state.id];
  const move = Math.min(1, speed / 5.4);
  let spread = def.spreadStill + move * def.spreadMove;
  if (crouching) spread *= 0.7;
  if (aiming) spread *= state.id === 'marksman' ? 0.25 : 0.6;
  return spread;
}

export function weaponDamage(state, distance, head) {
  const def = WEAPONS[state.id];
  let damage = def.damage * (head ? def.headMult : 1);
  if (distance > def.falloff) damage *= 0.5;
  return damage;
}

// The first-person view model: one group per weapon, boxes only, swapped on
// switch. The muzzle flash is a lit plane at the barrel tip, shown for 60 ms.
export function createViewModel(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.7, metalness: 0.3 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.4, metalness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const models = {};

  function part(geo, material, x, y, z) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    return mesh;
  }

  // Pistol: short slide, grip, a stub barrel.
  {
    const g = new THREE.Group();
    g.add(
      part(new THREE.BoxGeometry(0.05, 0.07, 0.2), metal, 0, 0, -0.08),
      part(new THREE.BoxGeometry(0.045, 0.12, 0.06), grip, 0, -0.08, 0.03),
      part(new THREE.BoxGeometry(0.02, 0.02, 0.06), accent, 0, 0.045, -0.15),
    );
    models.pistol = g;
  }
  // SMG: long magazine, suppressor, top rail.
  {
    const g = new THREE.Group();
    g.add(
      part(new THREE.BoxGeometry(0.07, 0.09, 0.34), metal, 0, 0, -0.1),
      part(new THREE.BoxGeometry(0.05, 0.16, 0.06), grip, 0, -0.1, -0.08),
      part(new THREE.BoxGeometry(0.035, 0.035, 0.22), grip, 0, 0.01, -0.36),
      part(new THREE.BoxGeometry(0.03, 0.03, 0.2), accent, 0, 0.06, -0.12),
    );
    models.smg = g;
  }
  // Rifle: receiver, handguard, stock, sight.
  {
    const g = new THREE.Group();
    g.add(
      part(new THREE.BoxGeometry(0.08, 0.1, 0.42), metal, 0, 0, -0.06),
      part(new THREE.BoxGeometry(0.06, 0.07, 0.3), grip, 0, -0.01, -0.36),
      part(new THREE.BoxGeometry(0.07, 0.08, 0.22), grip, 0, -0.02, 0.24),
      part(new THREE.BoxGeometry(0.04, 0.05, 0.1), accent, 0, 0.075, -0.1),
      part(new THREE.BoxGeometry(0.05, 0.14, 0.05), grip, 0, -0.1, 0.02),
    );
    models.rifle = g;
  }
  // Marksman: long barrel, scope, bipod hint.
  {
    const g = new THREE.Group();
    g.add(
      part(new THREE.BoxGeometry(0.07, 0.09, 0.5), metal, 0, 0, -0.12),
      part(new THREE.BoxGeometry(0.03, 0.03, 0.5), grip, 0, 0.01, -0.5),
      part(new THREE.BoxGeometry(0.05, 0.05, 0.16), accent, 0, 0.08, -0.12),
      part(new THREE.BoxGeometry(0.07, 0.09, 0.2), grip, 0, -0.01, 0.26),
    );
    models.marksman = g;
  }

  const holder = new THREE.Group();
  holder.position.set(0.24, -0.21, -0.42);
  camera.add(holder);
  let current = null;
  let currentId = null;

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.7);
  camera.add(flashLight);

  let flashLeft = 0;
  let kick = 0;
  let reloadAnim = 0;

  return {
    equip(weaponId) {
      if (currentId === weaponId) return;
      if (current) holder.remove(current);
      current = models[weaponId];
      currentId = weaponId;
      holder.add(current);
    },
    pullTrigger() {
      flashLeft = 0.06;
      kick = 0.05;
    },
    reload() {
      reloadAnim = 1;
    },
    step(dt) {
      flashLeft = Math.max(0, flashLeft - dt);
      kick += (0 - kick) * Math.min(1, dt * 14);
      reloadAnim = Math.max(0, reloadAnim - dt * 1.4);
      holder.position.z = -0.42 + kick;
      holder.rotation.x = kick * 2.2 - Math.sin(reloadAnim * Math.PI) * 0.5;
      flash.visible = flashLeft > 0;
      flash.rotation.z = flashLeft * 40;
      flashLight.intensity = flashLeft > 0 ? 20 : 0;
    },
    muzzleWorld(out) {
      // The barrel tip in world space, for tracers fired by the player.
      out.set(0.24, -0.16, -0.95);
      return camera.localToWorld(out);
    },
  };
}
