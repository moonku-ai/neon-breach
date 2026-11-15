// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. main.js wires the modules together and owns nothing else:
// the state lives in state.js, the rules in rounds.js, the shooting in
// combat.js, the brains in bots.js. ?shot=start|play|buy|end with &seed=N sets
// up a deterministic frame for a capture, renders it twice, then freezes it
// and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { BOTS, WEAPONS } from './config.js';
import { createState, drainEvents } from './state.js';
import { createMap } from './map.js';
import { createPlayer, groundSpeed } from './player.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createCombat } from './combat.js';
import { buildFighterMesh, createFighter, respawnFighter, updateFighterMesh } from './fighters.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createBomb } from './bomb.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createViewModel, weaponReady, weaponReload, weaponSpread, weaponStep } from './weapons.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const state = createState(seed);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2233);
scene.fog = new THREE.Fog(new THREE.Color(0x1a2233), 30, 90);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const map = createMap(scene);
const effects = createEffects(scene);
const audio = createAudio();
const combat = createCombat(scene, map, state, effects, onDeath);
const bots = createBots(map, state, combat);
const grenades = createGrenades(scene, map, state, combat, effects, audio);
const bomb = createBomb(scene, map, state, audio);
const rounds = createRounds(state, map, combat, bots, bomb);
const viewModel = createViewModel(camera);
const minimap = createMinimap(map);

// Fighters: the human plus four Viper bots against five Sentinel bots.
const player = createFighter('You', 'atk', false);
state.fighters.push(player);
const botNames = [...BOTS.names];
for (let i = 0; i < 4; i += 1) {
  state.fighters.push(createFighter(botNames[i], 'atk', true));
}
for (let i = 0; i < 5; i += 1) {
  state.fighters.push(createFighter(botNames[4 + i], 'def', true));
}
for (const fighter of state.fighters) {
  buildFighterMesh(scene, fighter);
  combat.registerFighter(fighter);
  const spawn = fighter.team === 'atk'
    ? map.spawns.atk[state.fighters.filter((f) => f.team === 'atk').indexOf(fighter) % 5]
    : map.spawns.def[state.fighters.filter((f) => f.team === 'def').indexOf(fighter) % 5];
  respawnFighter(fighter, spawn[0], spawn[1], fighter.team === 'atk' ? 0 : Math.PI);
}

const hud = createHud(
  (itemId) => {
    const ok = rounds.buy(player, itemId);
    if (ok) {
      audio.buy();
      if (WEAPONS[itemId]) viewModel.equip(itemId);
    } else {
      audio.denied();
    }
    return ok;
  },
  () => {
    audio.unlock();
    if (state.phase === 'menu' || state.phase === 'matchEnd') {
      rounds.startMatch();
      state.started = true;
    }
    input.requestLock();
  },
);
const playerControl = createPlayer(map.colliders);
const input = createInput(renderer.domElement, onLockChange);

const aimDir = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const throwDir = new THREE.Vector3();
let accumulator = 0;
let lastTime = performance.now();
let frozen = false;
let fovTarget = 74;

function onDeath(victim) {
  if (victim.carryingBomb) {
    victim.carryingBomb = false;
    bomb.drop(victim.position);
  }
  if (victim === player) {
    state.spectating = state.fighters.find((f) => f.alive && f.team === 'atk' && f !== player)
      || state.fighters.find((f) => f.alive) || null;
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    hud.hideBuy();
  } else if (state.phase !== 'menu' && state.phase !== 'matchEnd' && !hud.isBuyOpen()) {
    hud.showOverlay('paused', state);
  }
}

function syncCamera() {
  if (player.alive) {
    camera.position.set(player.position.x, player.position.y + player.eye, player.position.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  } else if (state.spectating && state.spectating.alive) {
    const target = state.spectating;
    camera.position.set(target.position.x, target.position.y + target.eye, target.position.z);
    camera.rotation.set(target.pitch, target.yaw, 0, 'YXZ');
  }
  if (Math.abs(camera.fov - fovTarget) > 0.1) {
    camera.fov += (fovTarget - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

function shootPlayer() {
  const weapon = player.weapon;
  if (!weaponReady(weapon)) {
    if (weapon.mag === 0 && weapon.reloadLeft <= 0) audio.dryFire();
    return;
  }
  weapon.mag -= 1;
  weapon.cooldown = WEAPONS[weapon.id].gap;
  camera.getWorldDirection(aimDir);
  const spread = weaponSpread(weapon, groundSpeed(player), player.crouching, input.state.aiming);
  viewModel.muzzleWorld(muzzlePos);
  const result = combat.fire(player, aimDir, spread, muzzlePos);
  viewModel.pullTrigger();
  audio.shot(weapon.id);
  playerControl.recoil(player, 0.009 + state.random() * 0.004 + WEAPONS[weapon.id].recoil * 0.4, (state.random() * 2 - 1) * 0.004);
  if (result && result.hit) {
    hud.hitMarker(result.killed, result.killed ? 300 : 90);
    if (result.killed) audio.kill();
    else audio.hit();
  }
  if (weapon.mag === 0 && weaponReload(weapon)) {
    viewModel.reload();
    audio.reload();
  }
}

function handleEvents() {
  for (const event of drainEvents(state)) {
    if (event.type === 'kill') {
      hud.addKill(event.killer, event.victim, event.head);
      if (event.victim === player) {
        hud.damageFlash();
        audio.hurt();
      }
    } else if (event.type === 'hurt') {
      if (event.target === player) {
        hud.damageFlash();
        audio.hurt();
      }
    } else if (event.type === 'roundStart') {
      hud.banner(`ROUND ${event.round}`, 'Buy your gear — press B for the shop', '', 2200);
    } else if (event.type === 'roundLive') {
      hud.hideBuy();
      hud.banner('GO', event.round === 1 ? 'Plant the bomb at A or B' : '', '', 1200);
    } else if (event.type === 'roundEnd') {
      const won = event.winner === 'atk';
      hud.banner(won ? 'ROUND WON' : 'ROUND LOST', event.reason, won ? 'win' : 'lose', 3400);
      if (won) audio.roundWin();
      else audio.roundLose();
    } else if (event.type === 'matchEnd') {
      hud.showOverlay('end', state);
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (event.type === 'bombPlanted') {
      hud.banner('BOMB PLANTED', `Site ${event.site} — defend it`, 'win', 2600);
    } else if (event.type === 'bombExploded') {
      effects.explosion(event.position);
      audio.explosion();
    } else if (event.type === 'bombDefused') {
      hud.banner('BOMB DEFUSED', `Site ${event.site} is safe`, 'lose', 2600);
    } else if (event.type === 'bombPickedUp' && event.fighter === player) {
      hud.hint('You picked up the bomb — <kbd>E</kbd> to plant in a site');
      setTimeout(() => hud.hint(null), 3000);
    }
  }
}

function step(dt) {
  if (state.phase !== 'menu') state.time += dt;
  rounds.step(dt);

  // The human: look, move, shoot, reload, switch, throw, use.
  if (player.alive && (state.phase === 'live' || state.phase === 'buy')) {
    const look = input.takeLook();
    playerControl.look(player, look.x, look.y);
    playerControl.step(player, dt, input.state.keys);
    weaponStep(player.weapon, dt);
    player.using = input.state.keys.has('KeyE');

    if (state.phase === 'live') {
      const auto = WEAPONS[player.weapon.id].auto;
      if ((auto && input.state.firing) || (!auto && input.pressed('MouseLeft'))) shootPlayer();
      if (input.pressed('KeyR') && weaponReload(player.weapon)) {
        viewModel.reload();
        audio.reload();
      }
    }
    for (const [index, id] of ['pistol', 'smg', 'rifle', 'marksman'].entries()) {
      if (input.pressed(`Digit${index + 1}`) && rounds.switchWeapon(player, id)) {
        viewModel.equip(id);
      }
    }
    if (input.pressed('KeyG') && state.phase === 'live') {
      // Throw the selected grenade, or the next owned kind if it is empty.
      const order = ['frag', 'flash', 'smoke'];
      let kind = player.selectedGrenade;
      if (player.grenades[kind] <= 0) {
        kind = order.find((k) => player.grenades[k] > 0);
      }
      if (kind) {
        player.selectedGrenade = kind;
        camera.getWorldDirection(throwDir);
        grenades.throwGrenade(player, kind, throwDir);
      }
    }
    if (input.pressed('KeyB')) {
      if (hud.isBuyOpen()) {
        hud.hideBuy();
        input.requestLock();
      } else if (state.phase === 'buy') {
        input.releaseLock();
        hud.showBuy(state, player);
      }
    }
  }

  // Bots move and fight only while the round is live.
  if (state.phase === 'live') bots.step(dt);
  if (state.phase === 'live') {
    bomb.step(dt);
    grenades.step(dt);
  }
  state.shotsHeard.length = 0;
  input.consumeAll();

  // Hints: what the player can do right here, right now.
  if (player.alive && state.phase === 'live') {
    if (player.carryingBomb && bomb.siteAt(player.position.x, player.position.z)) {
      hud.hint('Hold <kbd>E</kbd> to plant the bomb');
    } else if (state.bomb.state === 'planted'
      && Math.hypot(player.position.x - state.bomb.position.x, player.position.z - state.bomb.position.z) < 1.6
      && player.team === 'def') {
      hud.hint('Hold <kbd>E</kbd> to defuse');
    } else {
      hud.hint(null);
    }
  } else if (player.alive && state.phase === 'buy') {
    hud.hint('Press <kbd>B</kbd> to buy');
  } else {
    hud.hint(null);
  }

  // The aim zoom: the marksman scopes in, other weapons tighten a little.
  fovTarget = input.state.aiming
    ? (player.weapon.id === 'marksman' ? 38 : 58)
    : 74;

  // Meshes follow the fighters inside the step, so the simulation is
  // self-consistent: a raycast in the next step sees where bodies really are,
  // even when the renderer is far behind (or the test drives the sim directly).
  for (const fighter of state.fighters) updateFighterMesh(fighter, dt, state.time);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    handleEvents();
    viewModel.step(dt);
    effects.step(dt, state.time);
    syncCamera();
    const spreadPx = 6 + weaponSpread(player.weapon, groundSpeed(player), player.crouching, input.state.aiming) * 900;
    hud.sync(state, player, Math.min(26, spreadPx));
    // The flash overlay fades with the remaining blind time.
    hud.setFlash(Math.max(0, (player.blindUntil - state.time) / 2.2));
    minimap.draw(state);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - player.position.x;
  const dy = point.y - (player.position.y + player.eye);
  const dz = point.z - player.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    player.position.set(0, 0, 19.5);
    player.yaw = 0;
    player.pitch = 0;
    settle(20);
    hud.showOverlay('start', state);
  } else if (name === 'buy') {
    rounds.startMatch();
    settle(10);
    hud.showBuy(state, player);
  } else if (name === 'play') {
    rounds.startMatch();
    state.phase = 'live';
    state.roundTimeLeft = 87;
    // A rifle for the frame, an enemy in the sights, an ally on the flank.
    player.owned.rifle = true;
    player.weapon = player.ammo.rifle;
    viewModel.equip('rifle');
    player.position.set(0, 0, 8);
    player.yaw = 0;
    player.pitch = 0;
    const enemy = state.fighters.find((f) => f.team === 'def');
    enemy.position.set(0.6, 0, -6);
    enemy.yaw = Math.PI;
    enemy.bot.mode = 'hold';
    const ally = state.fighters.find((f) => f.isBot && f.team === 'atk');
    ally.position.set(2.6, 0, 4);
    ally.yaw = 0;
    settle(20);
    aimAt(new THREE.Vector3(enemy.position.x, 1.2, enemy.position.z));
    shootPlayer();
    settle(6);
    aimAt(new THREE.Vector3(enemy.position.x, 1.2, enemy.position.z));
    shootPlayer();
    settle(2);
  } else if (name === 'end') {
    rounds.startMatch();
    state.score.atk = 5;
    state.score.def = 3;
    state.matchWinner = 'atk';
    state.phase = 'matchEnd';
    // Plausible final stats for the scoreboard frame (a 5-3 match has kills).
    const stats = [
      [12, 8, 4200], [9, 7, 3100], [7, 9, 2400], [6, 6, 2900], [4, 10, 1500],
      [10, 9, 3600], [8, 8, 2800], [11, 10, 4100], [5, 7, 1900], [3, 9, 1200],
    ];
    state.fighters.forEach((fighter, i) => {
      [fighter.kills, fighter.deaths, fighter.money] = stats[i];
    });
    player.position.set(-13, 0, -5);
    aimAt(new THREE.Vector3(-20, 1.5, -12));
    settle(10);
    hud.showOverlay('end', state);
  }
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    hud.sync(state, player, 8);
    minimap.draw(state);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && hud.isBuyOpen()) {
    hud.hideBuy();
    input.requestLock();
  }
});

syncCamera();
// Debugging handles for local playtests: window.__debug.state is the match,
// and advance(seconds) runs the simulation forward synchronously.
window.__debug = {
  state,
  player,
  advance(seconds) {
    const n = Math.round(seconds / FIXED_STEP);
    for (let i = 0; i < n; i += 1) step(FIXED_STEP);
    handleEvents();
  },
};
if (shot) runShot(shot);
else requestAnimationFrame(frame);
