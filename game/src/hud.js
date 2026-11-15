// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// killfeed, banner, bomb status, buy menu and the start/pause/end overlays.
// It never touches the simulation; main.js pushes state in once a frame and
// the buy menu calls back out. Every setter writes the DOM only when its
// value changed, so a steady frame costs no layout.
import { ARMOR_PRICE, GRENADES, WEAPONS } from './config.js';

const $ = (id) => document.getElementById(id);

export function createHud(onBuy, onPlay) {
  const els = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    vignette: $('damage-vignette'),
    flash: $('flash-overlay'),
    scoreAtk: $('score-atk'),
    scoreDef: $('score-def'),
    timerValue: $('timer-value'),
    timerLabel: $('timer-label'),
    timer: $('timer'),
    killfeed: $('killfeed'),
    healthNum: $('health-num'),
    healthFill: $('health-fill'),
    armorLabel: $('armor-label'),
    money: $('money'),
    weaponName: $('weapon-name'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammo: $('ammo'),
    slots: [...document.querySelectorAll('#weapon-slots span')],
    grenades: $('grenades'),
    bombStatus: $('bomb-status'),
    bombText: $('bomb-text'),
    progressWrap: $('progress-wrap'),
    progressFill: $('progress-fill'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    hint: $('hint'),
    buy: $('buy'),
    buyGrid: $('buy-grid'),
    buyCash: $('buy-cash'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    scoreboard: $('scoreboard'),
    scoreboardBody: $('scoreboard-body'),
  };
  let hitTimer = 0;
  let bannerTimer = 0;
  let vignetteTimer = 0;
  let last = {};
  let buyOpen = false;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function teamClass(team) {
    return team === 'atk' ? 'atk' : 'def';
  }

  const hud = {
    // One call a frame with the whole state; cheap writes only.
    sync(state, player, spreadPx) {
      setText(els.scoreAtk, 'sa', String(state.score.atk));
      setText(els.scoreDef, 'sd', String(state.score.def));
      const timerText = state.phase === 'buy'
        ? formatTime(state.buyTimeLeft)
        : state.bomb.state === 'planted'
          ? formatTime(state.bomb.fuseLeft)
          : formatTime(state.roundTimeLeft);
      setText(els.timerValue, 't', timerText);
      setText(els.timerLabel, 'tl', state.phase === 'buy' ? 'BUY TIME'
        : state.bomb.state === 'planted' ? 'BOMB' : `ROUND ${state.round}`);
      els.timer.classList.toggle('low', (state.phase === 'live' && state.roundTimeLeft < 15)
        || (state.bomb.state === 'planted' && state.bomb.fuseLeft < 10));

      setText(els.healthNum, 'h', String(Math.max(0, Math.ceil(player.health))));
      els.healthNum.classList.toggle('low', player.health <= 30);
      const hp = Math.max(0, player.health);
      if (last.hp !== hp) {
        last.hp = hp;
        els.healthFill.style.width = `${hp}%`;
        els.healthFill.classList.toggle('low', hp <= 30);
      }
      setText(els.armorLabel, 'ar', player.armor ? 'Armor on' : 'No armor');
      setText(els.money, 'm', `$${player.money}`);
      setText(els.weaponName, 'w', WEAPONS[player.weapon.id].name);
      setText(els.ammoMag, 'am', String(player.weapon.mag));
      setText(els.ammoReserve, 'arv', `/ ${player.weapon.reserve}`);
      els.ammo.classList.toggle('empty', player.weapon.mag === 0);
      els.slots.forEach((span) => {
        const id = ['pistol', 'smg', 'rifle', 'marksman'][Number(span.dataset.slot)];
        span.classList.toggle('on', player.weapon.id === id);
        span.style.opacity = player.owned[id] ? 1 : 0.35;
      });
      const g = player.grenades;
      setText(els.grenades, 'g',
        `Grenades: frag ${g.frag} · flash ${g.flash} · smoke ${g.smoke} [${player.selectedGrenade}]`);
      if (last.gap !== spreadPx) {
        last.gap = spreadPx;
        els.crosshair.style.setProperty('--gap', `${spreadPx}px`);
      }

      // Bomb status line: what the player should know right now.
      const bomb = state.bomb;
      if (bomb.state === 'planted') {
        els.bombStatus.hidden = false;
        setText(els.bombText, 'b', `💣 Bomb planted at ${bomb.site} — ${formatTime(bomb.fuseLeft)}`);
        els.bombText.className = 'planted';
        const defusing = bomb.defuser === player;
        els.progressWrap.hidden = !defusing;
        if (defusing) els.progressFill.style.width = `${bomb.defuseProgress * 100}%`;
      } else if (player.carryingBomb) {
        els.bombStatus.hidden = false;
        setText(els.bombText, 'b', 'You carry the bomb — hold E in a site to plant');
        els.bombText.className = 'carry';
        els.progressWrap.hidden = bomb.plantProgress <= 0;
        if (bomb.plantProgress > 0) els.progressFill.style.width = `${bomb.plantProgress * 100}%`;
      } else if (bomb.state === 'dropped') {
        els.bombStatus.hidden = false;
        setText(els.bombText, 'b', 'Bomb dropped — pick it up');
        els.bombText.className = 'carry';
        els.progressWrap.hidden = true;
      } else if (bomb.carrier && bomb.carrier !== player) {
        els.bombStatus.hidden = false;
        setText(els.bombText, 'b', `${bomb.carrier.name} carries the bomb`);
        els.bombText.className = '';
        els.progressWrap.hidden = true;
      } else {
        els.bombStatus.hidden = true;
      }
    },

    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on'), holdMs);
    },

    damageFlash() {
      els.vignette.style.opacity = '1';
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => { els.vignette.style.opacity = '0'; }, 180);
    },

    setFlash(amount) {
      els.flash.style.opacity = String(Math.max(0, Math.min(1, amount)));
    },

    addKill(killer, victim, head) {
      const row = document.createElement('div');
      const killerName = killer ? killer.name : '💣';
      row.innerHTML = `<span class="${killer ? teamClass(killer.team) : ''}">${killerName}</span> ▸ `
        + `<span class="${teamClass(victim.team)}">${victim.name}</span>${head ? ' <span class="head">HEADSHOT</span>' : ''}`;
      els.killfeed.prepend(row);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 5000);
    },

    banner(title, sub, cls, holdMs = 2600) {
      els.bannerTitle.textContent = title;
      els.bannerTitle.className = cls;
      els.bannerSub.textContent = sub;
      els.banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('show'), holdMs);
    },

    hint(text) {
      if (text) {
        els.hint.innerHTML = text;
        els.hint.hidden = false;
      } else {
        els.hint.hidden = true;
      }
    },

    showBuy(state, player) {
      buyOpen = true;
      els.buy.hidden = false;
      hud.refreshBuy(state, player);
    },

    refreshBuy(state, player) {
      setText(els.buyCash, 'bc', `$${player.money}`);
      els.buyGrid.innerHTML = '';
      const items = [
        ...['smg', 'rifle', 'marksman'].map((id) => ({
          id, name: WEAPONS[id].name, price: WEAPONS[id].price, blurb: WEAPONS[id].blurb,
          owned: player.owned[id],
        })),
        ...Object.entries(GRENADES).map(([id, def]) => ({
          id, name: def.name, price: def.price, blurb: def.blurb,
          owned: player.grenades[id] >= 1,
        })),
        { id: 'armor', name: 'Kevlar Armor', price: ARMOR_PRICE, blurb: 'Halves all damage taken.', owned: player.armor },
      ];
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.disabled = item.owned || player.money < item.price || state.phase !== 'buy';
        button.innerHTML = `${item.name}<b>${item.owned ? 'OWNED' : `$${item.price}`}</b><small>${item.blurb}</small>`;
        button.addEventListener('click', () => {
          if (onBuy(item.id)) hud.refreshBuy(state, player);
        });
        els.buyGrid.appendChild(button);
      }
    },

    hideBuy() {
      buyOpen = false;
      els.buy.hidden = true;
    },

    isBuyOpen() {
      return buyOpen;
    },

    showOverlay(mode, state) {
      els.scoreboard.hidden = true;
      if (mode === 'start') {
        els.overlayTitle.innerHTML = 'Neon <em>Breach</em>';
        els.overlayCopy.textContent = 'A round-based tactical shooter on Harbor Depot. Plant the bomb at A or B, or wipe the Sentinels out — first team to 5 rounds takes the match.';
        els.play.textContent = 'Click to play';
      } else if (mode === 'paused') {
        els.overlayTitle.textContent = 'Paused';
        els.overlayCopy.textContent = 'Click to resume the match.';
        els.play.textContent = 'Click to resume';
      } else if (mode === 'end') {
        const won = state.matchWinner === 'atk';
        els.overlayTitle.textContent = won ? 'Vipers win the match' : 'Sentinels win the match';
        els.overlayCopy.textContent = `Final score ${state.score.atk} – ${state.score.def}. Play again to run it back.`;
        els.play.textContent = 'Play again';
        els.scoreboard.hidden = false;
        els.scoreboardBody.innerHTML = [...state.fighters]
          .sort((a, b) => b.kills - a.kills)
          .map((f) => `<tr><td class="${teamClass(f.team)}">${f.name}${f.isBot ? '' : ' (you)'}</td><td>${f.kills}</td><td>${f.deaths}</td><td>$${f.money}</td></tr>`)
          .join('');
      }
      els.overlay.hidden = false;
    },

    hideOverlay() {
      els.overlay.hidden = true;
    },
  };

  els.play.addEventListener('click', onPlay);
  return hud;
}
