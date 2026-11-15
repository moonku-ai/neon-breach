// Rounds: the match clock, the economy and the buy menu. A match is first to
// 5 rounds. Each round runs buy (15 s, frozen, shop open) -> live (100 s) ->
// round end (4 s banner), and the next round starts. A round ends on
// elimination, on the bomb exploding or being defused, or on the clock. Money
// follows the CS shape: wins pay $3,250, losses $1,900 plus $500 per
// consecutive loss, kills $300, a plant $300.
import { ARMOR_PRICE, ECONOMY, GRENADES, MATCH, WEAPONS } from './config.js';
import { emit } from './state.js';
import { respawnFighter } from './fighters.js';

export function createRounds(state, map, combat, bots, bomb) {
  function refill(fighter) {
    for (const id of Object.keys(fighter.ammo)) {
      if (!fighter.owned[id]) continue;
      fighter.ammo[id].mag = WEAPONS[id].mag;
      fighter.ammo[id].reserve = WEAPONS[id].reserve;
      fighter.ammo[id].cooldown = 0;
      fighter.ammo[id].reloadLeft = 0;
    }
    fighter.weapon = fighter.ammo[fighter.weapon.id];
  }

  function botBuy(fighter) {
    // Bots shop with a simple rule: the best gun they can afford, then armor
    // if they still have cash. Round 1 is pistols for everyone.
    if (fighter.money >= WEAPONS.rifle.price && state.random() < 0.7) {
      fighter.money -= WEAPONS.rifle.price;
      fighter.owned.rifle = true;
      fighter.weapon = fighter.ammo.rifle;
    } else if (fighter.money >= WEAPONS.smg.price) {
      fighter.money -= WEAPONS.smg.price;
      fighter.owned.smg = true;
      fighter.weapon = fighter.ammo.smg;
    }
    if (fighter.money >= ARMOR_PRICE + 300 && !fighter.armor) {
      fighter.money -= ARMOR_PRICE;
      fighter.armor = true;
    }
  }

  function startRound() {
    state.phase = 'buy';
    state.buyTimeLeft = MATCH.buyTime;
    state.roundTimeLeft = MATCH.roundTime;
    state.roundWinner = null;
    state.roundReason = '';
    state.grenades.length = 0;
    state.smokes.length = 0;
    let atkIndex = 0;
    let defIndex = 0;
    for (const fighter of state.fighters) {
      const spawn = fighter.team === 'atk'
        ? map.spawns.atk[atkIndex++ % map.spawns.atk.length]
        : map.spawns.def[defIndex++ % map.spawns.def.length];
      const wasDead = !fighter.alive;
      respawnFighter(fighter, spawn[0], spawn[1], fighter.team === 'atk' ? 0 : Math.PI);
      if (wasDead) combat.registerFighter(fighter);
      refill(fighter);
      if (fighter.isBot) botBuy(fighter);
    }
    bomb.reset(state.fighters[0]); // the human carries the bomb each round
    bots.assignRoles();
    emit(state, { type: 'roundStart', round: state.round });
  }

  function startMatch() {
    state.score.atk = 0;
    state.score.def = 0;
    state.lossStreak.atk = 0;
    state.lossStreak.def = 0;
    state.round = 1;
    state.matchWinner = null;
    for (const fighter of state.fighters) {
      fighter.money = ECONOMY.startMoney;
      fighter.kills = 0;
      fighter.deaths = 0;
      fighter.owned = { pistol: true, smg: false, rifle: false, marksman: false };
      fighter.weapon = fighter.ammo.pistol;
      fighter.grenades = { frag: 0, flash: 0, smoke: 0 };
      fighter.armor = false;
    }
    startRound();
  }

  function payRound(winner) {
    const loser = winner === 'atk' ? 'def' : 'atk';
    state.lossStreak[winner] = 0;
    state.lossStreak[loser] += 1;
    const lossPay = Math.min(
      ECONOMY.lossMax,
      ECONOMY.lossBase + (state.lossStreak[loser] - 1) * ECONOMY.lossStreakStep,
    );
    for (const fighter of state.fighters) {
      fighter.money = Math.min(
        ECONOMY.maxMoney,
        fighter.money + (fighter.team === winner ? ECONOMY.win : lossPay),
      );
    }
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    state.score[winner] += 1;
    state.roundWinner = winner;
    state.roundReason = reason;
    state.phase = 'roundEnd';
    state.roundEndLeft = MATCH.roundEndTime;
    payRound(winner);
    emit(state, { type: 'roundEnd', winner, reason, score: { ...state.score } });
  }

  function aliveCount(team) {
    let count = 0;
    for (const fighter of state.fighters) {
      if (fighter.alive && fighter.team === team) count += 1;
    }
    return count;
  }

  // The shop. Returns true when the purchase went through.
  function buy(fighter, itemId) {
    if (state.phase !== 'buy') return false;
    if (itemId === 'armor') {
      if (fighter.armor || fighter.money < ARMOR_PRICE) return false;
      fighter.money -= ARMOR_PRICE;
      fighter.armor = true;
      return true;
    }
    if (GRENADES[itemId]) {
      if (fighter.grenades[itemId] >= 1 || fighter.money < GRENADES[itemId].price) return false;
      fighter.money -= GRENADES[itemId].price;
      fighter.grenades[itemId] += 1;
      fighter.selectedGrenade = itemId;
      return true;
    }
    const def = WEAPONS[itemId];
    if (!def || fighter.money < def.price) return false;
    fighter.money -= def.price;
    fighter.owned[itemId] = true;
    fighter.ammo[itemId].mag = def.mag;
    fighter.ammo[itemId].reserve = def.reserve;
    fighter.weapon = fighter.ammo[itemId];
    return true;
  }

  function switchWeapon(fighter, weaponId) {
    if (!fighter.owned[weaponId] || fighter.weapon.id === weaponId) return false;
    fighter.weapon = fighter.ammo[weaponId];
    return true;
  }

  function step(dt) {
    if (state.phase === 'buy') {
      state.buyTimeLeft -= dt;
      if (state.buyTimeLeft <= 0) {
        state.phase = 'live';
        emit(state, { type: 'roundLive', round: state.round });
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.roundEndLeft -= dt;
      if (state.roundEndLeft <= 0) {
        if (state.score.atk >= MATCH.roundsToWin || state.score.def >= MATCH.roundsToWin) {
          state.phase = 'matchEnd';
          state.matchWinner = state.score.atk >= MATCH.roundsToWin ? 'atk' : 'def';
          emit(state, { type: 'matchEnd', winner: state.matchWinner, score: { ...state.score } });
        } else {
          state.round += 1;
          startRound();
        }
      }
      return;
    }
    if (state.phase !== 'live') return;

    // The bomb's outcome ends the round at once.
    if (state.bomb.outcome === 'exploded') {
      state.bomb.outcome = null;
      endRound('atk', 'Bomb detonated');
      return;
    }
    if (state.bomb.outcome === 'defused') {
      state.bomb.outcome = null;
      endRound('def', 'Bomb defused');
      return;
    }

    if (aliveCount('atk') === 0) {
      endRound('def', state.bomb.state === 'planted' ? 'Attackers eliminated' : 'Team eliminated');
      return;
    }
    if (aliveCount('def') === 0) {
      endRound('atk', 'Team eliminated');
      return;
    }

    // The clock only kills the attackers while the bomb is not planted.
    if (state.bomb.state !== 'planted') {
      state.roundTimeLeft -= dt;
      if (state.roundTimeLeft <= 0) {
        state.roundTimeLeft = 0;
        endRound('def', 'Time expired');
      }
    }
  }

  return { startMatch, startRound, buy, switchWeapon, step, aliveCount };
}
