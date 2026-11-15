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
  // Radio callouts: one line from a real sim event (a bot spotting an enemy,
  // a plant, a round win), shown for a few seconds, then gone.
  const radioEl = el('div', 'radio', root);
  radioEl.style.display = 'none';
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
  health.innerHTML = '<span class="num">100</span><span class="lbl">HP</span><span class="armour" style="display:none"></span>';
  const money = el('div', 'money', bottom);
  money.textContent = '$800';
  const ammo = el('div', 'ammo', bottom);
  ammo.innerHTML = '<span class="num">15</span><span class="lbl">/ 45 · P9 Sidearm</span>';
  const hint = el('div', 'hint', bottom);
  hint.textContent = 'WASD move · Ctrl crouch · E plant · R reload · 1-5 buy/switch';

  // Live minimap: a small canvas, top-left, redrawn from sim state every
  // frame — bounds, both sites, the spike, and every living actor, so it is
  // a map of the game, not a picture of one.
  const mapWrap = el('div', 'minimap-wrap', root);
  const mapLabel = el('div', 'minimap-label', mapWrap);
  mapLabel.textContent = 'EMBERLINE YARD';
  const mapCanvas = el('canvas', 'minimap', mapWrap);
  mapCanvas.width = 176;
  mapCanvas.height = 132;
  const mapCtx = mapCanvas.getContext('2d');

  const buyMenu = el('div', 'buymenu', root);
  buyMenu.innerHTML = '<h3>BUY PHASE — press 1–5</h3>';
  const buyList = el('div', 'buylist', buyMenu);
  for (const [key, id] of [['1', 'kr7'], ['2', 'longshot'], ['3', 'frag'], ['4', 'p9']]) {
    const def = WEAPONS[id];
    const row = el('div', 'buyrow', buyList);
    row.id = `buy-${id}`;
    row.innerHTML = `<b>[${key}] ${def.name}</b><span>$${def.price} · ${id === 'frag' ? '1 grenade' : `${def.mag} round mag`}</span>`;
  }
  const armourRow = el('div', 'buyrow', buyList);
  armourRow.id = 'buy-armour';
  armourRow.innerHTML = '<b>[5] Armour</b><span>$500 · +50 armour</span>';
  buyMenu.style.display = 'none';

  // Round-end scoreboard: names with K/D, shown when a round ends (and in
  // the dossier's fourth screenshot). Built once, filled per round.
  const board = el('div', 'scoreboard', root);
  const boardTitle = el('h3', '', board);
  const boardRows = el('div', 'boardrows', board);
  board.style.display = 'none';

  const overlay = el('div', 'overlay', root);
  const overlayTitle = el('h1', '', overlay);
  const overlayText = el('p', '', overlay);
  const overlayButton = el('button', '', overlay);
  overlayButton.textContent = 'CLICK TO PLAY';
  overlay.style.display = 'none';

  let bannerTimer = 0;
  let hitTimer = 0;
  let radioTimer = 0;

  // Minimap projection: the yard is 45.2 x 31.2 m; the canvas is 176 x 132
  // with an 8 px margin, so one scale fits both axes.
  const MAP_SCALE = 3.5;
  const MAP_OX = 8 + (176 - 16 - 45.2 * MAP_SCALE) / 2;
  const MAP_OY = 8 + (132 - 16 - 31.2 * MAP_SCALE) / 2;
  function mapXY(x, z) {
    return [MAP_OX + (x + 22.6) * MAP_SCALE, MAP_OY + (z + 15.6) * MAP_SCALE];
  }

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
    setArmour(value) {
      const chip = health.querySelector('.armour');
      if (value > 0) {
        chip.style.display = 'inline-block';
        chip.textContent = `${Math.round(value)} ARMOUR`;
      } else {
        chip.style.display = 'none';
      }
    },
    // Redraw the minimap from live state: yard outline, the two sites, a
    // few landmark blocks, the spike, and every living actor — the player
    // as a yawed arrow, teammates amber, Sentinels teal. Dead actors vanish.
    setMap(data) {
      const c = mapCtx;
      c.clearRect(0, 0, 176, 132);
      c.fillStyle = 'rgba(10, 12, 16, 0.66)';
      c.fillRect(0, 0, 176, 132);
      c.strokeStyle = 'rgba(236, 231, 220, 0.35)';
      c.lineWidth = 1;
      const [bx, by] = mapXY(-22.6, -15.6);
      c.strokeRect(bx, by, 45.2 * MAP_SCALE, 31.2 * MAP_SCALE);
      // Landmark blocks: the mid blockhouse and the site containers.
      c.fillStyle = 'rgba(236, 231, 220, 0.22)';
      for (const [x, z, w, d] of [[-3.4, -2, 8.8, 1.4], [3.4, -2, 8.8, 1.4], [-18.5, -13.5, 6.2, 2.4], [18.5, -13.5, 6.2, 2.4]]) {
        const [px, py] = mapXY(x - w / 2, z - d / 2);
        c.fillRect(px, py, w * MAP_SCALE, d * MAP_SCALE);
      }
      // Sites: amber A west, teal B east.
      for (const [name, sx, sz, color] of [['A', -17, -9, '#ffb02e'], ['B', 17, -9, '#2fd3c4']]) {
        const [px, py] = mapXY(sx, sz);
        c.beginPath();
        c.arc(px, py, 7, 0, Math.PI * 2);
        c.fillStyle = color;
        c.globalAlpha = 0.25;
        c.fill();
        c.globalAlpha = 1;
        c.strokeStyle = color;
        c.stroke();
        c.fillStyle = '#ece7dc';
        c.font = '700 9px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(name, px, py);
      }
      // The spike: a pulsing diamond where it is planted, a small dot on
      // its carrier while it is carried.
      if (data.spike) {
        if (data.spike.state === 'planted') {
          const [px, py] = mapXY(data.spike.x, data.spike.z);
          c.fillStyle = '#ffb02e';
          c.beginPath();
          c.moveTo(px, py - 5);
          c.lineTo(px + 5, py);
          c.lineTo(px, py + 5);
          c.lineTo(px - 5, py);
          c.closePath();
          c.fill();
        }
      }
      for (const a of data.actors || []) {
        if (!a.alive) continue;
        const [px, py] = mapXY(a.x, a.z);
        if (a.isPlayer) {
          // Player arrow, rotated by yaw: canvas y is map z, and yaw 0
          // faces -z (north), so the arrow points up when yaw is 0.
          c.save();
          c.translate(px, py);
          c.rotate(-a.yaw);
          c.fillStyle = '#ece7dc';
          c.beginPath();
          c.moveTo(0, -6);
          c.lineTo(4, 5);
          c.lineTo(-4, 5);
          c.closePath();
          c.fill();
          c.restore();
        } else {
          c.beginPath();
          c.arc(px, py, 3.5, 0, Math.PI * 2);
          c.fillStyle = a.team === 'vanguard' ? '#ffb02e' : '#2fd3c4';
          c.fill();
          c.strokeStyle = 'rgba(10, 12, 16, 0.9)';
          c.stroke();
        }
      }
    },
    radio(text) {
      radioEl.textContent = `RADIO · ${text}`;
      radioEl.style.display = 'block';
      radioTimer = 4;
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
      // Never over the scoreboard: the board hides the chip when it opens,
      // and this guard stops a later setStreak from showing it again.
      if (streak >= 2 && board.style.display !== 'block') {
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
    showBuy(show, moneyValue, owned, armour) {
      buyMenu.style.display = show ? 'block' : 'none';
      if (show) {
        this.setMoney(moneyValue);
        for (const id of ['kr7', 'longshot', 'frag']) {
          const row = document.getElementById(`buy-${id}`);
          const has = id === 'frag' ? owned.frag > 0 : owned[id];
          row.classList.toggle('owned', !!has);
          if (id === 'frag') row.querySelector('span').textContent = `$${WEAPONS.frag.price} · carried: ${owned.frag}`;
        }
        const hasArmour = (armour || 0) >= 50;
        armourRow.classList.toggle('owned', hasArmour);
        armourRow.querySelector('span').textContent = hasArmour ? '$500 · carried: 50' : '$500 · +50 armour';
      }
    },
    showScoreboard(title, rows) {
      if (!title || !rows) {
        board.style.display = 'none';
        return;
      }
      // The streak chip sits under the crosshair, dead-centre behind this
      // panel — hide it while the board is up so the two never overlap.
      streakEl.style.display = 'none';
      boardTitle.textContent = title;
      boardRows.innerHTML = '';
      for (const row of rows) {
        const r = el('div', 'boardrow', boardRows);
        r.innerHTML = `<b class="${row.team === 'vanguard' ? 'van' : 'sen'}">${row.name}</b><span class="role">${(row.role || '').toUpperCase()}</span><span>${row.k} K</span><span>${row.d} D</span>`;
      }
      board.style.display = 'block';
    },
    hideScoreboard() {
      board.style.display = 'none';
    },
    banner(title, sub) {
      announceTitle.textContent = title;
      announceSub.textContent = sub || '';
      announce.classList.add('show');
      bannerTimer = 3;
    },
    hideBanner() {
      announce.classList.remove('show');
      bannerTimer = 0;
    },
    addKill(killer, victim, headshot, _killerTeam, killerRole, victimRole) {
      const row = el('div', 'killrow', feed);
      const kRole = killerRole ? `<span class="role">${killerRole.toUpperCase()}</span>` : '';
      const vRole = victimRole ? `<span class="role">${victimRole.toUpperCase()}</span>` : '';
      row.innerHTML = `<b>${killer}</b>${kRole}<span>${headshot ? ' ☠ HEADSHOT ' : ' → '}</span><b>${victim}</b>${vRole}`;
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
      if (radioTimer > 0) {
        radioTimer -= dt;
        if (radioTimer <= 0) radioEl.style.display = 'none';
      }
      if (hitTimer > 0) hitTimer -= dt;
    },
  };
}
