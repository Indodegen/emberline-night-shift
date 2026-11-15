// The HUD: crosshair, health, ammo, money, timer, score, round pips, kill
// streak, kill feed, buy menu, plant bar and banners — plain DOM over the
// canvas, built once and updated in place, so the round state is always
// readable at a glance.
//
// Night-shift changes: the score line carries four round pips per team, so
// the first-to-4 race is visible without reading numbers; a streak chip
// appears under the crosshair after two kills without dying; and a carrier
// tag names whoever holds the spike, so the player always knows whether to
// push or protect.
import { WEAPONS } from './weapons.js';

const el = (tag, cls, parent) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
};

function pips(container, team) {
  for (let i = 0; i < 4; i += 1) {
    const dot = el('i', `pip ${team}`, container);
    dot.dataset.index = String(i);
  }
}

export function createHud() {
  const root = el('div', 'hud');
  document.body.appendChild(root);

  const crosshair = el('div', 'crosshair', root);
  crosshair.innerHTML = '<i></i><i></i><i></i><i></i><span></span>';
  const hitmarker = el('div', 'hitmarker', root);
  hitmarker.innerHTML = '<i></i><i></i><i></i><i></i>';
  const flash = el('div', 'damage-flash', root);
  const streakEl = el('div', 'streak', root);
  streakEl.style.display = 'none';

  const top = el('div', 'topbar', root);
  const timerEl = el('div', 'timer', top);
  timerEl.textContent = '—';
  const scoreEl = el('div', 'score', top);
  scoreEl.innerHTML = '<b class="van">VANGUARD 0</b><span>·</span><b class="sen">0 SENTINEL</b>';
  const pipsEl = el('div', 'pips', top);
  pips(pipsEl, 'van');
  pips(pipsEl, 'sen');
  const roundEl = el('div', 'round', top);
  roundEl.textContent = 'ROUND 1';

  const feed = el('div', 'killfeed', root);
  const announce = el('div', 'announce', root);
  const announceTitle = el('h2', '', announce);
  const announceSub = el('p', '', announce);
  const objective = el('div', 'objective', root);
  objective.textContent = 'Plant the spike at A or B';
  const carrierEl = el('div', 'carrier', root);
  carrierEl.style.display = 'none';

  const plantWrap = el('div', 'plantwrap', root);
  const plantLabel = el('div', 'plantlabel', plantWrap);
  const plantBar = el('div', 'plantbar', plantWrap);
  const plantFill = el('div', 'plantfill', plantBar);
  plantWrap.style.display = 'none';

  const bottom = el('div', 'bottombar', root);
  const health = el('div', 'health', bottom);
  health.innerHTML = '<span class="num">100</span><span class="lbl">HP</span>';
  const money = el('div', 'money', bottom);
  money.textContent = '$800';
  const ammo = el('div', 'ammo', bottom);
  ammo.innerHTML = '<span class="num">12</span><span class="lbl">/ 36 · P9 Sidearm</span>';
  const hint = el('div', 'hint', bottom);
  hint.textContent = 'WASD move · Ctrl crouch · E plant · R reload · 1-4 buy/switch';

  const buyMenu = el('div', 'buymenu', root);
  buyMenu.innerHTML = '<h3>BUY PHASE — press 1–4</h3>';
  const buyList = el('div', 'buylist', buyMenu);
  for (const [key, id] of [['1', 'kr7'], ['2', 'longshot'], ['3', 'frag'], ['4', 'p9']]) {
    const def = WEAPONS[id];
    const row = el('div', 'buyrow', buyList);
    row.id = `buy-${id}`;
    row.innerHTML = `<b>[${key}] ${def.name}</b><span>$${def.price} · ${id === 'frag' ? '1 grenade' : `${def.mag} round mag`}</span>`;
  }
  buyMenu.style.display = 'none';

  const overlay = el('div', 'overlay', root);
  const overlayTitle = el('h1', '', overlay);
  const overlayText = el('p', '', overlay);
  const overlayButton = el('button', '', overlay);
  overlayButton.textContent = 'CLICK TO PLAY';
  overlay.style.display = 'none';

  let bannerTimer = 0;
  let hitTimer = 0;

  function paintPips() {
    for (const dot of pipsEl.querySelectorAll('.pip')) {
      const won = Number(dot.dataset.index) < (dot.classList.contains('van') ? paintPips.van : paintPips.sen);
      dot.classList.toggle('won', won);
    }
  }
  paintPips.van = 0;
  paintPips.sen = 0;

  return {
    setHealth(hp, alive) {
      health.querySelector('.num').textContent = Math.max(0, Math.round(hp));
      health.classList.toggle('low', hp <= 30 && alive);
      health.classList.toggle('dead', !alive);
    },
    setAmmo(mag, reserve, name) {
      ammo.querySelector('.num').textContent = mag;
      ammo.querySelector('.lbl').textContent = `/ ${reserve} · ${name}`;
    },
    setMoney(value) {
      money.textContent = `$${value}`;
    },
    setTimer(seconds) {
      timerEl.textContent = seconds >= 60
        ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
        : `${seconds}s`;
    },
    setScore(vanguard, sentinel) {
      scoreEl.querySelector('.van').textContent = `VANGUARD ${vanguard}`;
      scoreEl.querySelector('.sen').textContent = `${sentinel} SENTINEL`;
      paintPips.van = vanguard;
      paintPips.sen = sentinel;
      paintPips();
    },
    setStreak(streak) {
      if (streak >= 2) {
        streakEl.style.display = 'block';
        streakEl.textContent = `STREAK ×${streak}`;
      } else {
        streakEl.style.display = 'none';
      }
    },
    setCarrier(name) {
      if (name) {
        carrierEl.style.display = 'block';
        carrierEl.textContent = `SPIKE — ${name}`;
      } else {
        carrierEl.style.display = 'none';
      }
    },
    setPhase(phase, round) {
      roundEl.textContent = `ROUND ${round}`;
      objective.textContent = phase === 'buy'
        ? 'Buy phase — gear up, then plant the spike'
        : 'Plant the spike at A or B';
    },
    setSpike(seconds, site) {
      if (seconds > 0) {
        objective.textContent = `SPIKE ARMED at ${site} — ${Math.ceil(seconds)}s to detonation`;
        objective.classList.add('danger');
      } else {
        objective.classList.remove('danger');
      }
    },
    setPlant(progress, site) {
      if (progress > 0 && site) {
        plantWrap.style.display = 'block';
        plantLabel.textContent = `PLANTING — SITE ${site}`;
        plantFill.style.width = `${Math.round(progress * 100)}%`;
      } else {
        plantWrap.style.display = 'none';
      }
    },
    showBuy(show, moneyValue, owned) {
      buyMenu.style.display = show ? 'block' : 'none';
      if (show) {
        this.setMoney(moneyValue);
        for (const id of ['kr7', 'longshot', 'frag']) {
          const row = document.getElementById(`buy-${id}`);
          const has = id === 'frag' ? owned.frag > 0 : owned[id];
          row.classList.toggle('owned', !!has);
          if (id === 'frag') row.querySelector('span').textContent = `$${WEAPONS.frag.price} · carried: ${owned.frag}`;
        }
      }
    },
    banner(title, sub) {
      announceTitle.textContent = title;
      announceSub.textContent = sub || '';
      announce.classList.add('show');
      bannerTimer = 3;
    },
    addKill(killer, victim, headshot, _killerTeam) {
      const row = el('div', 'killrow', feed);
      row.innerHTML = `<b>${killer}</b><span>${headshot ? ' ☠ HEADSHOT ' : ' → '}</span><b>${victim}</b>`;
      feed.prepend(row);
      while (feed.children.length > 4) feed.removeChild(feed.lastChild);
      setTimeout(() => row.remove(), 6000);
    },
    hitMarker(kill) {
      hitmarker.classList.add('show');
      if (kill) hitmarker.classList.add('kill');
      hitTimer = 0.18;
      setTimeout(() => {
        hitmarker.classList.remove('show');
        hitmarker.classList.remove('kill');
      }, 180);
    },
    flashDamage() {
      flash.classList.add('show');
      setTimeout(() => flash.classList.remove('show'), 160);
    },
    showOverlay(title, text, onClick) {
      overlayTitle.textContent = title;
      overlayText.textContent = text;
      overlay.style.display = 'flex';
      overlayButton.onclick = onClick;
    },
    hideOverlay() {
      overlay.style.display = 'none';
    },
    step(dt) {
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) announce.classList.remove('show');
      }
      if (hitTimer > 0) hitTimer -= dt;
    },
  };
}
