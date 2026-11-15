// Fighters: the human and the bots share one shape. A fighter is plain data
// (position, health, weapon, money) plus a body built from boxes: a torso, a
// head, legs and a gun. The head and torso meshes are the hitboxes — the ray
// in combat.js reads userData.fighter and userData.part off them. The human's
// body is invisible (first person) but still takes hits, so bots can shoot you.
import * as THREE from 'three';
import { BODY, ECONOMY, WEAPONS } from './config.js';
import { PALETTE } from './palette.js';
import { createWeaponState } from './weapons.js';

let nextId = 1;

export function createFighter(name, team, isBot) {
  const fighter = {
    id: nextId++,
    name,
    team, // 'atk' (Vipers) or 'def' (Sentinels)
    isBot,
    alive: true,
    health: BODY.health,
    armor: false,
    money: ECONOMY.startMoney,
    kills: 0,
    deaths: 0,
    weapon: null, // points at one of ammo's states; set below
    owned: { pistol: true, smg: false, rifle: false, marksman: false },
    ammo: {
      pistol: createWeaponState('pistol'),
      smg: createWeaponState('smg'),
      rifle: createWeaponState('rifle'),
      marksman: createWeaponState('marksman'),
    },
    grenades: { frag: 0, flash: 0, smoke: 0 },
    selectedGrenade: 'frag',
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: BODY.standEye,
    crouching: false,
    height: BODY.standHeight,
    onGround: true,
    blindUntil: 0,
    using: false, // holding the use key (plant / defuse)
    carryingBomb: false,
    body: null, // THREE.Group, set by buildFighterMesh
    headMesh: null,
    torsoMesh: null,
    fall: 0, // 0 standing .. 1 fallen, animated on death
    bobPhase: Math.random() * 6,
    bot: null, // AI state, set by bots.js for bots
  };
  // The active weapon IS its ammo state: switching weapons never loses a mag.
  fighter.weapon = fighter.ammo.pistol;
  return fighter;
}

const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
const headGeo = new THREE.SphereGeometry(0.155, 14, 10);
const legGeo = new THREE.BoxGeometry(0.17, 0.56, 0.2);
const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);

export function buildFighterMesh(scene, fighter) {
  const teamColor = fighter.team === 'atk' ? PALETTE.attack : PALETTE.defend;
  const torsoMat = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.75 });
  const trimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.5, emissive: new THREE.Color(teamColor), emissiveIntensity: 0.35 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.6, metalness: 0.2 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.5, metalness: 0.5 });

  const group = new THREE.Group();
  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  torso.position.y = 1.0;
  torso.userData.fighter = fighter;
  torso.userData.part = 'torso';
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.1, 0.32), trimMat);
  trim.position.y = 1.28;
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.53;
  head.userData.fighter = fighter;
  head.userData.part = 'head';
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.05), trimMat);
  visor.position.set(0, 1.55, -0.13);
  const legL = new THREE.Mesh(legGeo, torsoMat);
  legL.position.set(-0.13, 0.28, 0);
  const legR = new THREE.Mesh(legGeo, torsoMat);
  legR.position.set(0.13, 0.28, 0);
  const gun = new THREE.Mesh(gunGeo, gunMat);
  gun.position.set(0.2, 1.15, -0.35);
  group.add(torso, trim, head, visor, legL, legR, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  // The human's body is invisible but still raycastable: bots shoot at it.
  group.visible = !fighter.isBot ? false : true;
  if (!fighter.isBot) {
    group.traverse((mesh) => { if (mesh.isMesh) mesh.visible = false; });
  }
  scene.add(group);
  fighter.body = group;
  fighter.headMesh = head;
  fighter.torsoMesh = torso;
  fighter.legL = legL;
  fighter.legR = legR;
  return group;
}

// Syncs the mesh to the fighter: position, facing, a walk bob, and the fall
// on death. Called once a frame, outside the fixed step.
export function updateFighterMesh(fighter, dt, now) {
  const group = fighter.body;
  if (!group) return;
  group.position.copy(fighter.position);
  group.rotation.y = fighter.yaw;
  if (!fighter.alive) {
    fighter.fall = Math.min(1, fighter.fall + dt / 0.4);
    group.rotation.x = -fighter.fall * 1.5;
    group.position.y = fighter.position.y - fighter.fall * 0.1;
    return;
  }
  group.rotation.x = 0;
  const speed = Math.hypot(fighter.velocity.x, fighter.velocity.z);
  if (speed > 0.5) {
    fighter.bobPhase += dt * speed * 1.6;
    const swing = Math.sin(fighter.bobPhase) * 0.35;
    fighter.legL.rotation.x = swing;
    fighter.legR.rotation.x = -swing;
    group.position.y = fighter.position.y + Math.abs(Math.sin(fighter.bobPhase)) * 0.04;
  } else {
    fighter.legL.rotation.x = 0;
    fighter.legR.rotation.x = 0;
  }
  // Crouching shrinks the whole body, so the hitboxes shrink with the mesh.
  group.scale.y = fighter.crouching ? 0.72 : 1;
}

export function respawnFighter(fighter, x, z, yaw) {
  fighter.position.set(x, 0, z);
  fighter.velocity.set(0, 0, 0);
  fighter.yaw = yaw;
  fighter.pitch = 0;
  fighter.health = BODY.health;
  fighter.alive = true;
  fighter.fall = 0;
  fighter.crouching = false;
  fighter.height = BODY.standHeight;
  fighter.eye = BODY.standEye;
  fighter.blindUntil = 0;
  fighter.using = false;
  fighter.carryingBomb = false;
  if (fighter.body) {
    fighter.body.rotation.set(0, yaw, 0);
    fighter.body.scale.set(1, 1, 1);
  }
}
