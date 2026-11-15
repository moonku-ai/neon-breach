// The one place match state lives. Every module reads and writes this object;
// none keeps its own copy of the score, the clock or a fighter's health. The
// event queue is how the simulation talks to the HUD and the sounds: the sim
// pushes plain objects here, main.js drains them once a frame, nothing else
// subscribes. A seeded RNG makes the scripted screenshots deterministic.
import { ECONOMY, MATCH } from './config.js';

export function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createState(seed) {
  return {
    seed,
    random: mulberry32(seed),
    time: 0,
    // Phase: 'menu' | 'buy' | 'live' | 'roundEnd' | 'matchEnd'.
    phase: 'menu',
    round: 1,
    score: { atk: 0, def: 0 },
    lossStreak: { atk: 0, def: 0 },
    roundTimeLeft: MATCH.roundTime,
    buyTimeLeft: MATCH.buyTime,
    roundEndLeft: 0,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    // fighters[0] is always the human player. Each fighter: { id, name, team,
    // isBot, alive, health, armor, money, kills, deaths, weapon, owned,
    // ammo {pistol, smg, rifle, marksman: {mag, reserve}}, grenades
    // {frag, flash, smoke}, selectedGrenade, position, velocity, yaw, pitch,
    // eye, crouching, height, onGround, blindUntil, body (mesh group),
    // headMesh, torsoMesh, bot (AI state or null), carryingBomb }.
    fighters: [],
    // bomb: { state: 'carried' | 'dropped' | 'planted' | 'gone',
    // carrier (fighter or null), position, site, fuseLeft, plantProgress,
    // defuseProgress, planter, defuser, outcome ('exploded' | 'defused') }.
    bomb: {
      state: 'carried', carrier: null, position: null, site: null, fuseLeft: 0,
      plantProgress: 0, defuseProgress: 0, planter: null, defuser: null, outcome: null,
    },
    grenades: [], // live thrown grenades: { kind, position, velocity, fuseLeft }
    smokes: [], // active smoke clouds: { position, radius, expiresAt }
    events: [], // { type, ... } drained once a frame by main.js
    shotsHeard: [], // { position, time } for bot hearing, drained by bots.js
    started: false, // the human has clicked play at least once
    spectating: null, // fighter the camera follows while the player is dead
  };
}

export function resetMoney(state) {
  for (const fighter of state.fighters) fighter.money = ECONOMY.startMoney;
}

export function emit(state, event) {
  state.events.push(event);
}

export function drainEvents(state) {
  const out = state.events;
  state.events = [];
  return out;
}
