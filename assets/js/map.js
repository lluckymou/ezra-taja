/* ================================================================
   MINIMAP - DOM-based 8×6 grid with fog-of-war
================================================================ */
import { G } from './state.js';
import { getCell, COLS, ROWS } from './world.js';
import { getGameHour } from './renderer.js';
import { PERMANENTS } from '../data/items.js';
import { get as i18n } from './i18n.js';

const TYPE_ICONS = {
  normal:   '⚔️',
  shop:     '🏪',
  modifier: '✨',
  treasure: '💰',
  tent:     '⛺',
  teacher:  '🧑‍🏫',
};
// Boss icon is dynamic - comes from the current world's bossEmoji
function bossIcon() {
  return G.dungeon?.worldDef?.bossEmoji || '🐲';
}

let _mapEl = null;
let _cellEls = null;

export function initMap(containerEl) {
  _mapEl = containerEl;
  _mapEl.innerHTML = '';
  _mapEl.style.display = 'grid';
  _mapEl.style.gridTemplateColumns = `14px repeat(${COLS}, 28px)`;
  _mapEl.style.gridTemplateRows = `12px repeat(${ROWS}, 28px)`;
  _mapEl.style.gap = '2px';

  // Header row: empty corner + column labels
  const corner = document.createElement('div');
  _mapEl.appendChild(corner);
  for (let c = 0; c < COLS; c++) {
    const lbl = document.createElement('div');
    lbl.className = 'map-col-lbl';
    lbl.textContent = String.fromCharCode(65 + c);
    _mapEl.appendChild(lbl);
  }

  _cellEls = [];
  for (let r = 0; r < ROWS; r++) {
    // Row label
    const rowLbl = document.createElement('div');
    rowLbl.className = 'map-row-lbl';
    rowLbl.textContent = r + 1;
    _mapEl.appendChild(rowLbl);

    for (let c = 0; c < COLS; c++) {
      const el = document.createElement('div');
      el.className = 'map-cell fog';
      el.dataset.col = c;
      el.dataset.row = r;
      el.title = `${String.fromCharCode(65 + c)}${r + 1}`;
      // Click to teleport to cleared/visited rooms
      el.addEventListener('click', () => {
        if (!G.dungeon) return;
        const cell = getCell(c, r);
        // Teleportable if visited OR map revealed (masterkey / crystal_ball), but not current room
        const isCurrent = G.currentRoom && c === G.currentRoom.col && r === G.currentRoom.row;
        const canTeleport = cell && (cell.visited || G.run?.mapRevealed) && !isCurrent;
        if (!canTeleport) return;
        if (typeof window !== 'undefined' && window._worldRef?.enterRoom) {
          // Revoke masterkey reveal after teleport, but keep it if crystal_ball is owned
          if (G.run && !G.run.permanents?.includes('crystal_ball')) G.run.mapRevealed = false;
          window._worldRef.enterRoom(c, r);
          document.getElementById('map-panel')?.classList.add('off');
          if (typeof window !== 'undefined' && window._setMapPlaceholder) window._setMapPlaceholder(false);
          if (typeof window !== 'undefined' && window._mapCloseCleanup) window._mapCloseCleanup();
        }
      });
      _mapEl.appendChild(el);
      _cellEls.push(el);
    }
  }
}

export function updateMap() {
  if (!G.dungeon || !_cellEls) return;

  const { col: curCol, row: curRow } = G.currentRoom || { col: -1, row: -1 };
  const bossRoom  = G.dungeon.bossRoom;
  const revealed  = G.run?.mapRevealed;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const el   = _cellEls[r * COLS + c];
      const cell = getCell(c, r);
      if (!cell) continue;

      const isCurrent      = c === curCol && r === curRow;
      const isBoss         = bossRoom && c === bossRoom.col && r === bossRoom.row;
      const isVisited      = cell.visited;
      const shopRevealed   = cell.shopRevealed;
      const isGuideRevealed = !!cell.guideRevealed;

      el.className  = 'map-cell';
      el.style.cssText = '';

      // ── Boss room: always visible in red ──────────────────────────
      if (isBoss) {
        el.classList.add('boss-room');
        if (isCurrent) el.classList.add('current');
        if (isVisited || revealed) {
          el.classList.add('can-teleport');
          const bc = 'rgba(255,80,80,0.25)';
          el.style.borderTop    = cell.connections.has('N') ? 'none' : `2px solid ${bc}`;
          el.style.borderBottom = cell.connections.has('S') ? 'none' : `2px solid ${bc}`;
          el.style.borderRight  = cell.connections.has('E') ? 'none' : `2px solid ${bc}`;
          el.style.borderLeft   = cell.connections.has('W') ? 'none' : `2px solid ${bc}`;
        }
        el.textContent = bossIcon();
        continue;
      }

      // ── Shop room: visible in yellow when shopRevealed or visited ─
      if (cell.type === 'shop' && (shopRevealed || isVisited || revealed || isGuideRevealed)) {
        el.classList.add('shop-room');
        if (isCurrent) el.classList.add('current');
        // Teleportable if visited OR map fully revealed (masterkey/crystal_ball)
        if (isVisited || revealed) {
          el.classList.add('can-teleport');
          const yc = 'rgba(255,200,60,0.25)';
          el.style.borderTop    = cell.connections.has('N') ? 'none' : `2px solid ${yc}`;
          el.style.borderBottom = cell.connections.has('S') ? 'none' : `2px solid ${yc}`;
          el.style.borderRight  = cell.connections.has('E') ? 'none' : `2px solid ${yc}`;
          el.style.borderLeft   = cell.connections.has('W') ? 'none' : `2px solid ${yc}`;
        }
        el.textContent = '🏪';
        continue;
      }

      // ── Casino room: visible in purple when visited ───────────────
      if (cell.type === 'casino' && (isVisited || revealed || isGuideRevealed)) {
        el.classList.add('casino-room');
        if (isCurrent) el.classList.add('current');
        if (isVisited || revealed) {
          el.classList.add('can-teleport');
          const pc = 'rgba(180,100,255,0.25)';
          el.style.borderTop    = cell.connections.has('N') ? 'none' : `2px solid ${pc}`;
          el.style.borderBottom = cell.connections.has('S') ? 'none' : `2px solid ${pc}`;
          el.style.borderRight  = cell.connections.has('E') ? 'none' : `2px solid ${pc}`;
          el.style.borderLeft   = cell.connections.has('W') ? 'none' : `2px solid ${pc}`;
        }
        el.textContent = '🎰';
        continue;
      }
      
      // ── Teacher room: visible in green ──────────────────────────
      if (cell.type === 'teacher' && (cell.teacherRevealed || isVisited || revealed || isGuideRevealed)) {
        el.classList.add('teacher-room');
        if (isCurrent) el.classList.add('current');
        if (isVisited || revealed) {
          el.classList.add('can-teleport');
          const gc = 'rgba(46,204,113,0.25)';
          el.style.borderTop    = cell.connections.has('N') ? 'none' : `2px solid ${gc}`;
          el.style.borderBottom = cell.connections.has('S') ? 'none' : `2px solid ${gc}`;
          el.style.borderRight  = cell.connections.has('E') ? 'none' : `2px solid ${gc}`;
          el.style.borderLeft   = cell.connections.has('W') ? 'none' : `2px solid ${gc}`;
        }
        el.textContent = '🧑‍🏫';
        continue;
      }

      // ── Fog: not yet visible ──────────────────────────────────────
      if (!isVisited && !revealed && !isGuideRevealed) {
        el.classList.add('fog');
        el.textContent = '';
        continue;
      }

      // ── Normal visited/revealed room (or guide-revealed only) ────
      if (isGuideRevealed && !isVisited && !revealed) {
        el.classList.add('guide-only'); // visible but not teleportable → cursor:default
      } else {
        el.classList.add('visited');
      }
      if (cell.cleared) el.classList.add('cleared');
      if (isCurrent)    el.classList.add('current');

      el.textContent = TYPE_ICONS[cell.type] || '⚔️';

      const wc = 'rgba(255,255,255,0.22)';
      el.style.borderTop    = cell.connections.has('N') ? 'none' : `2px solid ${wc}`;
      el.style.borderBottom = cell.connections.has('S') ? 'none' : `2px solid ${wc}`;
      el.style.borderRight  = cell.connections.has('E') ? 'none' : `2px solid ${wc}`;
      el.style.borderLeft   = cell.connections.has('W') ? 'none' : `2px solid ${wc}`;
    }
  }

  // Overlay player hero on current cell
  _cellEls.forEach(el => el.querySelector('.map-cell-hero')?.remove());
  if (curCol >= 0 && curRow >= 0) {
    const curEl = _cellEls[curRow * COLS + curCol];
    if (curEl && !curEl.classList.contains('fog')) {
      // Hide the room emoji so only the hero shows in the current cell
      curEl.textContent = '';
      const heroEl = document.createElement('span');
      heroEl.className = 'map-cell-hero';
      if (G.avatar && typeof Avataaars !== 'undefined') {
        heroEl.innerHTML = Avataaars.create({ style: 'transparent', ...G.avatar });
      } else {
        heroEl.textContent = G.hero || '😊';
      }
      curEl.appendChild(heroEl);
    }
  }
}

export const WEATHER_ICONS = {
  clear:   '☀️',
  foggy:   '🌫️',
  drizzle: '🌦️',
  raining: '🌧️',
  snowing: '❄️',
  blizzard:'🌨️',
  fall:    '🍁',
  blossom: '🌸',
};

export function getWeatherLabel() {
  const wx = G.weather || 'clear';
  const icon = WEATHER_ICONS[wx] || '';
  const name = i18n('weather.' + wx);
  return icon ? `${icon} ${name}` : name;
}

// _clockSecs: display time in total seconds (0..86399), ticks 1 real second at a time
let _clockSecs = 12 * 3600; // default noon until synced

export function syncClockToGame() {
  const h = getGameHour();
  if (typeof h === 'number' && isFinite(h)) {
    _clockSecs = Math.floor(h * 3600) % 86400;
  }
}

function setClockDisplay(totalSecs) {
  const iconEl    = document.getElementById('hud-clock-icon');
  const timeEl    = document.getElementById('hud-clock-time');
  const wxEl      = document.getElementById('hud-clock-weather');
  if (!iconEl || !timeEl) return;

  const hours = Math.floor(totalSecs / 3600) % 24;
  const mins  = Math.floor((totalSecs % 3600) / 60);

  const isNight = hours >= 22 || hours < 5;
  const isDusk  = (hours >= 19 && hours < 22) || (hours >= 5 && hours < 7);
  const dayIcon = isNight ? '🌙' : isDusk ? '🌅' : '☀️';

  // Preserve weather badge child, replace only the text node
  iconEl.firstChild.textContent = dayIcon;

  timeEl.textContent = `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;

  const wx = G.weather || '';
  if (wxEl) wxEl.textContent = WEATHER_ICONS[wx] || '';
  // Tooltip with translated weather name (desktop hover)
  iconEl.title = getWeatherLabel();
}

// Tick at 100ms - one display minute ≈ 291ms, so each minute is shown before advancing
setInterval(() => {
  if (G.phase !== 'run') return;
  const cl = document.getElementById('hud-clock');
  const timeEl = document.getElementById('hud-clock-time');
  if (G.dungeon?.worldDef?.fixedLighting) {
    // Fixed-lighting world: show dash (time doesn't pass)
    if (timeEl) timeEl.textContent = '-';
    const wxEl = document.getElementById('hud-clock-weather');
    const hours = parseInt(G.dungeon.worldDef.fixedLighting.split(':')[0]) || 0;
    const isNight = hours >= 22 || hours < 5;
    const isDusk  = (hours >= 19 && hours < 22) || (hours >= 5 && hours < 7);
    const iconEl = document.getElementById('hud-clock-icon');
    if (iconEl?.firstChild) iconEl.firstChild.textContent = isNight ? '🌙' : isDusk ? '🌅' : '☀️';
    if (wxEl) wxEl.textContent = WEATHER_ICONS[G.weather || ''] || '';
    if (iconEl) iconEl.title = getWeatherLabel();
    if (cl) cl.style.opacity = '0.45';
  } else {
    if (cl) cl.style.opacity = '';
    // Derive from game time so clock matches background day/night cycle
    const newSecs = Math.floor(getGameHour() * 3600) % 86400;
    // Only re-render when the displayed minute (or hour) actually changes
    const newMin = Math.floor(newSecs / 60);
    if (newMin !== Math.floor(_clockSecs / 60)) {
      _clockSecs = newSecs;
      setClockDisplay(_clockSecs);
    }
  }
}, 100);

export function updateMapExtras() {
  // Update map legend boss icon dynamically
  const legendBoss = document.getElementById('map-legend-boss');
  if (legendBoss) legendBoss.textContent = bossIcon();

  // Clock: interval handles updates; nothing to sync here

  // Show next worlds preview (cached at world-start - stable, no random flicker)
  const nextEl = document.getElementById('map-next-worlds');
  if (nextEl) {
    const nexts = G.run?.nextWorldsPreview;
    if (nexts?.length) {
      nextEl.innerHTML = '';
      if (G.touchMode) {
        // Touch: vertical list with emoji + world name
        nexts.forEach(w => {
          const row = document.createElement('div');
          row.className = 'map-next-world-row';
          const emojiSpan = document.createElement('span');
          emojiSpan.className = 'mnw-emoji';
          emojiSpan.textContent = w.emoji;
          const nameSpan = document.createElement('span');
          nameSpan.className = 'mnw-name';
          nameSpan.textContent = i18n('worlds.' + w.id + '.name') || w.name;
          row.appendChild(emojiSpan);
          row.appendChild(nameSpan);
          nextEl.appendChild(row);
        });
      } else {
        // Desktop: horizontal emoji row with tooltip
        const tooltip = document.getElementById('shop-tooltip');
        nexts.forEach(w => {
          const span = document.createElement('span');
          span.style.cssText = 'font-size:1.3rem;cursor:default;margin-right:4px';
          span.textContent = w.emoji;
          if (tooltip) {
            span.addEventListener('mouseenter', e => {
              tooltip.textContent = `${w.emoji} ${i18n('worlds.' + w.id + '.name') || w.name}`;
              tooltip.style.right = (window.innerWidth - e.clientX + 12) + 'px';
              tooltip.style.left = 'auto';
              tooltip.style.top  = (e.clientY - 38)  + 'px';
              tooltip.classList.add('show');
            });
            span.addEventListener('mousemove', e => {
              tooltip.style.right = (window.innerWidth - e.clientX + 12) + 'px';
              tooltip.style.left = 'auto';
              tooltip.style.top  = (e.clientY - 38)  + 'px';
            });
            span.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
          }
          nextEl.appendChild(span);
        });
      }
    } else {
      nextEl.textContent = '-';
    }
  }
}

// Expose update function globally for world.js to call
if (typeof window !== 'undefined') {
  window._mapUpdate = updateMap;
}
