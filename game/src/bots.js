// Bot brains. Each bot is a fighter with a role (a lane to rush or a site to
// hold), a route over the map's waypoint graph, and a small state machine:
// advance along the route, hold an angle, engage what it sees, investigate
// gunfire it hears, plant the bomb it carries, or defuse the one that is down.
// Bots see through the same line-of-sight test as the bullets, react after a
// human-like delay, and miss more the further and faster their target moves.
import * as THREE from 'three';
import { BOTS, WEAPONS } from './config.js';
import { moveKinematic } from './player.js';
import { weaponReady, weaponReload, weaponStep } from './weapons.js';

const eye = new THREE.Vector3();
const targetEye = new THREE.Vector3();
const aim = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const toPoint = new THREE.Vector3();

export function createBots(map, state, combat) {
  function newBot(fighter, role) {
    return {
      role,
      route: [],
      routeIndex: 0,
      mode: 'advance',
      target: null,
      lastSeen: null,
      reaction: 0,
      burstLeft: 0,
      burstPause: 0,
      watchYaw: 0,
      investigate: null,
      strafeDir: 1,
      strafeUntil: 0,
      aimError: BOTS.aimErrorBase * (0.8 + state.random() * 0.5),
    };
  }

  // Roles are handed out at the start of every round. Attackers split across
  // the three lanes; defenders hold the sites and one roams mid.
  function assignRoles() {
    const atkBots = state.fighters.filter((f) => f.isBot && f.team === 'atk');
    const defBots = state.fighters.filter((f) => f.isBot && f.team === 'def');
    const atkRoles = ['rushA', 'rushB', 'mid', 'rushA'];
    const defRoles = ['holdA', 'holdA', 'holdB', 'holdB', 'roam'];
    atkBots.forEach((fighter, i) => {
      fighter.bot = newBot(fighter, atkRoles[i % atkRoles.length]);
      planRoute(fighter);
    });
    defBots.forEach((fighter, i) => {
      fighter.bot = newBot(fighter, defRoles[i % defRoles.length]);
      planRoute(fighter);
    });
  }

  function planRoute(fighter) {
    const bot = fighter.bot;
    const start = map.nearestNode(fighter.position.x, fighter.position.z);
    let goal = 'midN';
    if (bot.role === 'rushA') goal = 'siteA';
    else if (bot.role === 'rushB') goal = 'siteB';
    else if (bot.role === 'mid') goal = 'midN';
    else if (bot.role === 'holdA') goal = fighter.id % 2 === 0 ? 'siteAW' : 'siteAE';
    else if (bot.role === 'holdB') goal = fighter.id % 2 === 0 ? 'siteBW' : 'siteBE';
    else if (bot.role === 'roam') goal = 'midN';
    bot.route = map.findPath(start, goal);
    bot.routeIndex = 0;
    bot.mode = 'advance';
    // Holders face the way the enemy comes: A holders watch the long and the
    // yard gate, B holders the same mirrored, roamers watch mid.
    if (bot.role === 'holdA') bot.watchYaw = fighter.id % 2 === 0 ? Math.PI / 2 : Math.PI;
    else if (bot.role === 'holdB') bot.watchYaw = fighter.id % 2 === 0 ? -Math.PI / 2 : Math.PI;
    else bot.watchYaw = 0;
  }

  function routeTo(fighter, goal) {
    const bot = fighter.bot;
    const start = map.nearestNode(fighter.position.x, fighter.position.z);
    bot.route = map.findPath(start, goal);
    bot.routeIndex = 0;
    bot.mode = 'advance';
  }

  // Perception: the nearest living enemy inside the view cone and distance
  // with a clear line of sight. Smoke and walls both block it.
  function scanForEnemy(fighter) {
    combat.eyePosition(fighter, eye);
    let best = null;
    let bestD = Infinity;
    for (const other of state.fighters) {
      if (!other.alive || other.team === fighter.team || other === fighter) continue;
      const dx = other.position.x - fighter.position.x;
      const dz = other.position.z - fighter.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > BOTS.viewDistance) continue;
      const angle = Math.atan2(-dx, -dz);
      let diff = angle - fighter.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > BOTS.viewHalfAngle) continue;
      combat.eyePosition(other, targetEye);
      targetEye.y -= 0.3; // aim at the chest, not the top of the head
      if (!combat.hasLineOfSight(eye, targetEye)) continue;
      if (dist < bestD) { bestD = dist; best = other; }
    }
    return best;
  }

  function seek(fighter, x, z, speed) {
    toPoint.set(x - fighter.position.x, 0, z - fighter.position.z);
    const dist = toPoint.length();
    if (dist < 0.05) return { wx: 0, wz: 0, arrived: true };
    toPoint.normalize();
    return { wx: toPoint.x, wz: toPoint.z, arrived: dist < 1.1 };
  }

  function faceToward(fighter, x, z, dt, rate = 8) {
    const target = Math.atan2(-(x - fighter.position.x), -(z - fighter.position.z));
    let diff = target - fighter.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    fighter.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function tryShoot(fighter, dt) {
    const bot = fighter.bot;
    const target = bot.target;
    if (!target || !target.alive) return;
    if (state.time < fighter.blindUntil) return;
    if (bot.burstPause > 0) {
      bot.burstPause -= dt;
      return;
    }
    if (bot.burstLeft <= 0) {
      bot.burstLeft = BOTS.burstMin + Math.floor(state.random() * (BOTS.burstMax - BOTS.burstMin + 1));
      bot.burstPause = 0;
    }
    if (!weaponReady(fighter.weapon)) {
      if (fighter.weapon.mag === 0) weaponReload(fighter.weapon);
      return;
    }
    // Aim at the chest with an error that grows with range and target speed.
    combat.eyePosition(target, targetEye);
    targetEye.y -= 0.35;
    combat.eyePosition(fighter, eye);
    aim.copy(targetEye).sub(eye);
    const dist = aim.length();
    aim.normalize();
    const targetSpeed = Math.hypot(target.velocity.x, target.velocity.z);
    const spread = bot.aimError + dist * BOTS.aimErrorPerMetre + targetSpeed * 0.004
      + Math.hypot(fighter.velocity.x, fighter.velocity.z) * 0.006;
    muzzle.copy(eye).addScaledVector(aim, 0.5);
    fighter.weapon.mag -= 1;
    fighter.weapon.cooldown = WEAPONS[fighter.weapon.id].gap;
    const result = combat.fire(fighter, aim, spread, muzzle);
    if (result && result.killed) bot.target = null;
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.burstPause = BOTS.burstPause * (0.7 + state.random() * 0.6);
  }

  function stepBot(fighter, dt) {
    const bot = fighter.bot;
    if (!bot || !fighter.alive) return;
    weaponStep(fighter.weapon, dt);
    fighter.using = false;

    const bombPlanted = state.bomb.state === 'planted';
    const bombSite = state.bomb.site;

    // Defenders rush a planted bomb; attackers guard it.
    if (bombPlanted && fighter.team === 'def' && bot.mode !== 'defuse' && bot.mode !== 'engage') {
      routeTo(fighter, bombSite === 'A' ? 'siteA' : 'siteB');
      bot.mode = 'defuse';
    }

    // Perception first: what can this bot see right now?
    const seen = state.time < fighter.blindUntil ? null : scanForEnemy(fighter);
    if (seen) {
      bot.lastSeen = { x: seen.position.x, z: seen.position.z, time: state.time };
      if (bot.target !== seen) {
        bot.target = seen;
        bot.reaction = state.time + BOTS.reactionMin + state.random() * (BOTS.reactionMax - BOTS.reactionMin);
      }
      if (bot.mode !== 'engage' && state.time >= bot.reaction) bot.mode = 'engage';
    } else if (bot.target && (!bot.target.alive || (bot.lastSeen && state.time - bot.lastSeen.time > 2.5))) {
      // Lost the target: go and look where it was last seen.
      bot.investigate = bot.lastSeen ? { x: bot.lastSeen.x, z: bot.lastSeen.z } : null;
      bot.target = null;
      if (bot.mode === 'engage') bot.mode = bot.investigate ? 'investigate' : 'advance';
    }

    // Hearing: a shot nearby pulls a patrolling bot toward it.
    if ((bot.mode === 'advance' || bot.mode === 'hold') && !bot.target) {
      for (const shot of state.shotsHeard) {
        const d = Math.hypot(shot.x - fighter.position.x, shot.z - fighter.position.z);
        if (d < BOTS.hearRadius && state.time - shot.time < 1.5) {
          bot.investigate = { x: shot.x, z: shot.z };
          bot.mode = 'investigate';
          break;
        }
      }
    }

    // Act on the mode. Movement targets are resolved to a wish direction,
    // then one shared kinematic step moves the bot.
    let wx = 0;
    let wz = 0;
    let speed = BOTS.moveSpeed;
    let jump = false;

    if (bot.mode === 'engage' && bot.target && bot.target.alive) {
      const t = bot.target;
      faceToward(fighter, t.position.x, t.position.z, dt, 10);
      if (state.time >= bot.strafeUntil) {
        bot.strafeDir = state.random() < 0.5 ? -1 : 1;
        bot.strafeUntil = state.time + 0.7 + state.random() * 0.7;
      }
      // Strafe sideways to the target, closing a little if far away.
      const dx = t.position.x - fighter.position.x;
      const dz = t.position.z - fighter.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const px = -dz / dist * bot.strafeDir;
      const pz = dx / dist * bot.strafeDir;
      const close = dist > 18 ? 0.6 : dist < 5 ? -0.4 : 0;
      wx = px + (dx / dist) * close;
      wz = pz + (dz / dist) * close;
      const len = Math.hypot(wx, wz) || 1;
      wx /= len;
      wz /= len;
      speed = 2.6;
      if (state.time >= bot.reaction) tryShoot(fighter, dt);
    } else if (bot.mode === 'plant' || (fighter.carryingBomb && bot.mode === 'advance' && atSite(fighter))) {
      // Planting: stand still in the site and hold the use key.
      bot.mode = 'plant';
      fighter.using = true;
      faceToward(fighter, fighter.position.x - Math.sin(fighter.yaw), fighter.position.z - Math.cos(fighter.yaw), dt, 4);
    } else if (bot.mode === 'defuse' && state.bomb.state === 'planted') {
      const bombPos = state.bomb.position;
      const d = Math.hypot(bombPos.x - fighter.position.x, bombPos.z - fighter.position.z);
      if (d < 1.6) {
        fighter.using = true;
        faceToward(fighter, bombPos.x, bombPos.z, dt, 8);
      } else {
        const s = seek(fighter, bombPos.x, bombPos.z, BOTS.moveSpeed);
        wx = s.wx; wz = s.wz;
        faceToward(fighter, bombPos.x, bombPos.z, dt, 8);
      }
    } else if (bot.mode === 'investigate' && bot.investigate) {
      const s = seek(fighter, bot.investigate.x, bot.investigate.z, BOTS.moveSpeed);
      wx = s.wx; wz = s.wz;
      if (s.arrived) {
        bot.investigate = null;
        bot.mode = bot.role.startsWith('hold') || bot.role === 'roam' ? 'hold' : 'advance';
        if (bot.mode === 'advance') planRoute(fighter);
      } else {
        faceToward(fighter, bot.investigate.x, bot.investigate.z, dt, 8);
      }
    } else if (bot.mode === 'hold') {
      // Hold the angle: face the watch direction, crouch half the time.
      fighter.yaw += (bot.watchYaw - fighter.yaw) * Math.min(1, dt * 4);
      fighter.crouching = fighter.id % 2 === 0;
      fighter.height = fighter.crouching ? 1.12 : 1.72;
      fighter.eye = fighter.crouching ? 1.02 : 1.6;
    } else {
      // Advance: walk the route, one waypoint at a time.
      fighter.crouching = false;
      fighter.height = 1.72;
      fighter.eye = 1.6;
      const nodeId = bot.route[bot.routeIndex];
      if (!nodeId) {
        bot.mode = bombPlanted && fighter.team === 'atk' ? 'hold' : 'hold';
        bot.watchYaw = fighter.team === 'atk' ? Math.PI : 0;
      } else {
        const [nx, nz] = map.nodes[nodeId];
        const s = seek(fighter, nx, nz, BOTS.moveSpeed);
        wx = s.wx; wz = s.wz;
        faceToward(fighter, nx, nz, dt, 8);
        if (s.arrived) bot.routeIndex += 1;
      }
    }

    // Attackers carrying the bomb head for the nearest site once their route
    // ends; defenders with the bomb planted never hold still.
    if (fighter.carryingBomb && bot.mode === 'hold' && !bombPlanted) {
      const site = nearestSite(fighter);
      routeTo(fighter, site === 'A' ? 'siteA' : 'siteB');
      bot.mode = 'advance';
    }

    // Separation: bots never stand inside each other.
    for (const other of state.fighters) {
      if (other === fighter || !other.alive) continue;
      const dx = fighter.position.x - other.position.x;
      const dz = fighter.position.z - other.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.64 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        wx += (dx / d) * 0.8;
        wz += (dz / d) * 0.8;
      }
    }
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }

    moveKinematic(fighter, map.colliders, dt, wx, wz, speed, jump);
  }

  function atSite(fighter) {
    for (const site of Object.values(map.sites)) {
      if (Math.hypot(fighter.position.x - site.center.x, fighter.position.z - site.center.z) < site.radius) return true;
    }
    return false;
  }

  function nearestSite(fighter) {
    const da = Math.hypot(fighter.position.x - map.sites.A.center.x, fighter.position.z - map.sites.A.center.z);
    const db = Math.hypot(fighter.position.x - map.sites.B.center.x, fighter.position.z - map.sites.B.center.z);
    return da < db ? 'A' : 'B';
  }

  return {
    assignRoles,
    planRoute,
    routeTo,
    step(dt) {
      for (const fighter of state.fighters) {
        if (fighter.isBot) stepBot(fighter, dt);
      }
    },
  };
}
