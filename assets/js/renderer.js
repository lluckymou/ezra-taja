/* ================================================================
   RENDERER - canvas: room backgrounds, doors, nav arrows, weather
   Combat drawMonsters/Projs/Parts live in combat.js
================================================================ */
import { G } from './state.js';
import { currentCell, getAvailableDirs, getCell, WORLDS, DIR_NAMES, COLS, ROWS } from './world.js';
import { WORD_DICT } from '../data/words.js';
import { get as i18n, wordTr } from './i18n.js';
import {
  drawRoomTrees as renderRoomTrees,
  getRoomTreeDepths as getRenderTreeDepths,
  clearRoomTrees as clearRoomTreePlan,
  generateRoomTrees as generateRoomTreePlan,
} from './trees.js?trailer-tree-scale-v1';
import {
  drawRoomPuddles as renderRoomPuddles,
  drawRoomEnvironmentObject as renderRoomEnvironmentObject,
  getRoomEnvironmentDepths as getRenderEnvironmentDepths,
} from './environment.js';

const DIR_DELTA_R = { N: [0,-1], S: [0,1], E: [1,0], W: [-1,0] };

// BFS from boss room — cached per dungeon instance
let _bossDistCache = null;
function _getBossDistMap() {
  if (!G.dungeon) return null;
  if (_bossDistCache?.dungeon === G.dungeon) return _bossDistCache.map;
  const boss = G.dungeon.grid?.find(c => c.type === 'boss');
  if (!boss) { _bossDistCache = { dungeon: G.dungeon, map: null }; return null; }
  const dist = new Map();
  const queue = [boss];
  dist.set(`${boss.col},${boss.row}`, 0);
  while (queue.length) {
    const cur = queue.shift();
    const d = dist.get(`${cur.col},${cur.row}`);
    for (const dir of cur.connections) {
      const [dc, dr] = DIR_DELTA_R[dir];
      const nc = ((cur.col + dc) + COLS) % COLS;
      const nr = ((cur.row + dr) + ROWS) % ROWS;
      const key = `${nc},${nr}`;
      if (!dist.has(key)) {
        dist.set(key, d + 1);
        const nb = getCell(nc, nr);
        if (nb) queue.push(nb);
      }
    }
  }
  _bossDistCache = { dungeon: G.dungeon, map: dist };
  return dist;
}

let canvas, ctx, wxCanvas, wxCtx, dnCanvas, dnCtx;
const FLOOR_GRID_SIZE = 96;
const FLOOR_LARGE_GRID_SIZE = FLOOR_GRID_SIZE * 2;

// Room design overrides set by the cheat menu (-1 = use room's natural value)
let _roomDesignFloorPat  = -1;
let _roomDesignWallStyle = -1;
export function setRoomDesignFloorPat(v)  { _roomDesignFloorPat  = v < 0 ? -1 : v; }
export function setRoomDesignWallStyle(v) { _roomDesignWallStyle = v < 0 ? -1 : v; }

export function drawTrees(layer = 'back', onlyTreeId = null) {
  if (!ctx || !G.dungeon || (G.treeDetails ?? 2) <= 0) return;
  const cell = currentCell();
  const world = G.dungeon.worldDef;
  if (!cell || !world) return;
  renderRoomTrees(ctx, {
    world,
    cell,
    W: G.W,
    H: G.vH,
    seed: G.dungeon.runSeed ?? G.run?.seed ?? 0,
    time: G.gameTime || 0,
    light: getDayBrightness(),
    weather: G.weather || 'clear',
    layer,
    details: G.treeDetails ?? 2,
    // Trailer previews can use a smaller landmark scale in narrow formats
    // without changing the actual game's room plans.
    scale: G.treeScale ?? 1,
    onlyTreeId,
  });
}

function currentRoomSeed() {
  return G.dungeon?.runSeed ?? G.run?.seed ?? 0;
}

export function drawPuddles() {
  if (!ctx || !G.dungeon || (G.treeDetails ?? 2) <= 0) return;
  const cell = currentCell();
  const world = G.dungeon.worldDef;
  if (!cell || !world) return;
  // Puddles are floor-plane objects. Clip them to the same rectangle used by
  // the floor pattern so a wide blob can never spill onto a side wall.
  const wallSide = Math.floor(G.W * 0.05);
  const floorTop = Math.floor(G.vH * 0.13);
  const floorBot = G.vH - Math.floor(G.vH * 0.07);
  ctx.save();
  ctx.beginPath();
  ctx.rect(wallSide, floorTop, G.W - wallSide * 2, floorBot - floorTop);
  ctx.clip();
  renderRoomPuddles(ctx, {
    world,
    cell,
    W: G.W,
    H: G.vH,
    seed: currentRoomSeed(),
    time: G.gameTime || 0,
    details: G.treeDetails ?? 2,
  });
  ctx.restore();
}

export function drawEnvironmentObject(onlyId = null) {
  if (!ctx || !G.dungeon || (G.treeDetails ?? 2) <= 0) return;
  const cell = currentCell();
  const world = G.dungeon.worldDef;
  if (!cell || !world) return;
  renderRoomEnvironmentObject(ctx, {
    world,
    cell,
    W: G.W,
    H: G.vH,
    seed: currentRoomSeed(),
    time: G.gameTime || 0,
    details: G.treeDetails ?? 2,
    onlyId,
  });
}

export function getTreeDepths() {
  if (!G.dungeon || (G.treeDetails ?? 2) <= 0) return [];
  const cell = currentCell();
  const world = G.dungeon.worldDef;
  if (!cell || !world) return [];
  return getRenderTreeDepths({
    world,
    cell,
    H: G.vH,
    seed: G.dungeon.runSeed ?? G.run?.seed ?? 0,
    details: G.treeDetails ?? 2,
  });
}

export function getEnvironmentDepths() {
  if (!G.dungeon || (G.treeDetails ?? 2) <= 0) return [];
  const cell = currentCell();
  const world = G.dungeon.worldDef;
  if (!cell || !world) return [];
  return getRenderEnvironmentDepths({
    world,
    cell,
    H: G.vH,
    seed: currentRoomSeed(),
    details: G.treeDetails ?? 2,
  });
}

export function clearRoomTrees() {
  if (!G.dungeon) return false;
  const cell = currentCell();
  if (!cell) return false;
  clearRoomTreePlan({
    world: G.dungeon.worldDef,
    cell,
    seed: G.dungeon.runSeed ?? G.run?.seed ?? 0,
  });
  return true;
}

export function generateRoomTrees(theme = 'auto') {
  if (!G.dungeon) return false;
  const cell = currentCell();
  if (!cell) return false;
  generateRoomTreePlan({
    world: G.dungeon.worldDef,
    cell,
    seed: G.dungeon.runSeed ?? G.run?.seed ?? 0,
    theme,
  });
  return true;
}

// ── Day/Night Cycle ─────────────────────────────────────────────
// Full cycle = 420 seconds (7 min). Maps to 0-24h.
// Bright hours: 7h-20h. Transition 5-7h (dawn), 20-22h (dusk). Dark: 22-5h.
// If the current world has fixedLighting, the clock is frozen at that hour
// (backend time still advances normally for weather events).

function _hourToBrightness(h) {
  if (h >= 7 && h < 20)  return 1.0;
  if (h >= 5 && h < 7)   return (h - 5) / 2;
  if (h >= 20 && h < 22) return 1 - (h - 20) / 2;
  return 0.0;
}

export function getGameHour() {
  // On title screen, always use G.gameTime (= midday) regardless of the previous
  // world's fixedLighting so the menu is never stuck in night mode.
  if (G.phase !== 'title') {
    const fixed = G.dungeon?.worldDef?.fixedLighting;
    if (fixed) {
      const [hh, mm] = fixed.split(':').map(Number);
      return hh + (mm || 0) / 60;
    }
  }
  const t = (G.gameTime || 0) % 420;
  return (t / 420) * 24; // fractional hour 0..24
}

export function getDayBrightness() {
  return _hourToBrightness(getGameHour());
}

export function initRenderer(mainCanvas, weatherCanvas, dayNightCanvas) {
  canvas   = mainCanvas;
  ctx      = canvas.getContext('2d');
  wxCanvas = weatherCanvas;
  wxCtx    = wxCanvas.getContext('2d');
  if (dayNightCanvas) {
    dnCanvas = dayNightCanvas;
    dnCtx    = dnCanvas.getContext('2d');
  }
}

/* ================================================================
   RESIZE
================================================================ */
export function rendererResize() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width   = Math.floor(G.W * dpr); canvas.height  = Math.floor(G.vH * dpr);
  canvas.style.width = G.W + 'px'; canvas.style.height = G.vH + 'px';
  wxCanvas.width  = Math.floor(G.W * dpr); wxCanvas.height = Math.floor(G.vH * dpr);
  wxCanvas.style.width = G.W + 'px'; wxCanvas.style.height = G.vH + 'px';
}

/* ================================================================
   DRAW ROOM BACKGROUND
================================================================ */
function isOpenWorld(world) {
  return world?.biome === 'ocean' || world?.biome === 'cosmos';
}

function drawEndlessOcean(world, cell, W, H) {
  // This is painted before actors in the main frame, so the sea remains a
  // true background plane while its internal bands can layer normally.
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  const time = G.gameTime || 0;
  const roomPhase = ((cell?.col || 0) * 1.71 + (cell?.row || 0) * 2.43) % 10;
  const wind = Math.max(0.25, Number(world.wind) || 0.6);

  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, world.bgTop || '#031b35');
  base.addColorStop(0.42, world.floorColor || '#063d66');
  base.addColorStop(1, world.floorColorAlt || '#021b3a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // The portfolio's sea uses stacked, perspective-like swells. Here every
  // layer fills the screen, so the world reads as an endless surface instead
  // of a room with a wall/floor seam.
  const bands = 19;
  for (let i = 0; i < bands; i++) {
    const depth = i / (bands - 1);
    const yTop = H * (-0.07 + depth * 0.96);
    const amp = H * (0.004 + depth * 0.020) * (0.75 + wind * 0.34);
    const wavelength = Math.max(42, W * (0.12 + depth * 0.44));
    const phase = time * (0.18 + depth * 0.38) + roomPhase + i * 0.73;
    const alpha = 0.10 + depth * 0.08;

    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const y = yTop
        + Math.sin(x / wavelength + phase) * amp
        + Math.sin(x / (wavelength * 0.43) + phase * 1.7) * amp * 0.28;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = `rgba(${depth < 0.45 ? '64,174,215' : '3,35,91'},${alpha})`;
    ctx.fill();

    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = yTop
        + Math.sin(x / wavelength + phase) * amp
        + Math.sin(x / (wavelength * 0.43) + phase * 1.7) * amp * 0.28;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(165,232,255,${0.06 + depth * 0.10})`;
    ctx.lineWidth = Math.max(1, H * 0.0018);
    ctx.stroke();
  }

  if ((G.treeDetails ?? 2) >= 2) {
    // A few sparse surface highlights keep the sea alive without the heavy
    // per-particle cost of the weather renderer.
    ctx.lineWidth = Math.max(1, H * 0.0015);
    for (let i = 0; i < 14; i++) {
      const seed = (cell?.col || 0) * 37 + (cell?.row || 0) * 61 + i * 19;
      const x = ((seed * 47) % 101) / 100 * W;
      const y = (((seed * 29) % 73) / 100 * 0.82 + 0.12) * H;
      const len = W * (0.012 + ((seed * 13) % 17) / 1000);
      const drift = Math.sin(time * 0.65 + i) * wind * 2;
      ctx.strokeStyle = 'rgba(196,242,255,0.19)';
      ctx.beginPath();
      ctx.moveTo(x + drift, y);
      ctx.lineTo(x + len + drift, y + Math.sin(i) * 1.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawEndlessCosmos(world, cell, W, H) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  const time = G.gameTime || 0;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, world.bgTop || '#000004');
  grad.addColorStop(1, world.floorColor || '#08001c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 46; i++) {
    const seed = (cell?.col || 0) * 131 + (cell?.row || 0) * 67 + i * 97;
    const x = ((seed * 17) % 1000) / 1000 * W;
    const y = ((seed * 43) % 1000) / 1000 * H;
    const twinkle = 0.38 + 0.30 * Math.sin(time * 0.8 + i * 1.7);
    ctx.fillStyle = `rgba(196,216,255,${Math.max(0.08, twinkle)})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + (seed % 3) * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawBackground() {
  if (!ctx) return;
  // Use the actual chosen world definition, not the run-depth index
  const world = G.dungeon?.worldDef || WORLDS[0];
  const W = G.W, H = G.vH;
  const cell = currentCell();

  if (isOpenWorld(world)) {
    if (world.biome === 'ocean') drawEndlessOcean(world, cell, W, H);
    else drawEndlessCosmos(world, cell, W, H);
    return;
  }

  // Walls
  const wallH    = Math.floor(H * 0.13);
  const wallSide = Math.floor(W * 0.05);
  const wallBot  = Math.floor(H * 0.07);
  const floorTop = wallH;
  const floorBot = H - wallBot;

  // Full-screen background gradient (bgTop → bgBot)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, world.bgTop);
  bgGrad.addColorStop(1, world.bgBot || world.bgTop);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Wall colors: walls with a door opening use altWallColor for visual distinction
  const cons = cell?.connections || new Set();
  const wallMain = world.wallColor;
  const wallAlt  = world.altWallColor || world.wallColor;
  const colorN = cons.has('N') ? wallAlt : wallMain;
  const colorS = cons.has('S') ? wallAlt : wallMain;
  const colorE = cons.has('E') ? wallAlt : wallMain;
  const colorW = cons.has('W') ? wallAlt : wallMain;
  const floorAlt = world.floorColorAlt || world.floorColor;

  // Floor base color
  ctx.fillStyle = world.floorColor;
  ctx.fillRect(wallSide, floorTop, W - wallSide * 2, floorBot - floorTop);

  // Per-room floor pattern (deterministic from room position, overridable via cheat menu)
  // 0=checkerboard 1=large-chess 2=planks-v 3=planks-h 4=mono-main 5=mono-alt 6=pixel-art 7=cross
  const _rCol = cell?.col ?? 0;
  const _rRow = cell?.row ?? 0;
  const _patIdx = _roomDesignFloorPat >= 0 ? _roomDesignFloorPat : (_rCol * 7 + _rRow * 13) % 8;
  const gs = FLOOR_GRID_SIZE;
  const _fw = W - wallSide * 2;
  const _fh = floorBot - floorTop;
  ctx.save();
  ctx.beginPath();
  ctx.rect(wallSide, floorTop, _fw, _fh);
  ctx.clip();
  ctx.fillStyle = floorAlt;
  if (_patIdx === 0) {
    // Checkerboard: large 96px grid
    for (let gx = wallSide; gx < W - wallSide; gx += gs) {
      for (let gy = floorTop; gy < floorBot; gy += gs) {
        if ((Math.floor((gx - wallSide) / gs) + Math.floor((gy - floorTop) / gs)) % 2 === 0)
          ctx.fillRect(gx, gy, gs, gs);
      }
    }
  } else if (_patIdx === 1) {
    // Even larger checkerboard: double the large grid
    const gs2 = FLOOR_LARGE_GRID_SIZE;
    for (let gx = wallSide; gx < W - wallSide; gx += gs2) {
      for (let gy = floorTop; gy < floorBot; gy += gs2) {
        if ((Math.floor((gx - wallSide) / gs2) + Math.floor((gy - floorTop) / gs2)) % 2 === 0)
          ctx.fillRect(gx, gy, gs2, gs2);
      }
    }
  } else if (_patIdx === 2) {
    // Vertical planks
    for (let gx = wallSide; gx < W - wallSide; gx += gs) {
      if (Math.floor((gx - wallSide) / gs) % 2 === 0)
        ctx.fillRect(gx, floorTop, gs, _fh);
    }
  } else if (_patIdx === 3) {
    // Horizontal planks
    for (let gy = floorTop; gy < floorBot; gy += gs) {
      if (Math.floor((gy - floorTop) / gs) % 2 === 0)
        ctx.fillRect(wallSide, gy, _fw, gs);
    }
  } else if (_patIdx === 4) {
    // Monochromatic - solid floorColor (base already drawn, nothing added)
  } else if (_patIdx === 5) {
    // Monochromatic - solid floorAlt
    ctx.fillRect(wallSide, floorTop, _fw, _fh);
  } else if (_patIdx === 6) {
    // Pixel-art: same 96px grid as checkerboard/planks/cross
    const ps = FLOOR_GRID_SIZE;
    for (let gx = wallSide; gx < W - wallSide; gx += ps) {
      for (let gy = floorTop; gy < floorBot; gy += ps) {
        const px = Math.floor((gx - wallSide) / ps);
        const py = Math.floor((gy - floorTop) / ps);
        if ((px * 3 + py * 7 + _rCol * 11 + _rRow * 5) % 5 === 0)
          ctx.fillRect(gx, gy, ps, ps);
      }
    }
  } else {
    // Cross (patternIdx === 7): bar from N door to S, bar from W to E
    const cx = wallSide + _fw / 2;
    const cy = floorTop + _fh / 2;
    ctx.fillRect(wallSide, cy - gs / 2, _fw, gs);    // horizontal
    ctx.fillRect(cx - gs / 2, floorTop, gs, _fh);   // vertical
  }
  ctx.restore();

  // Draw walls as proper trapezoids following the perspective diagonal lines
  function fillTrap(pts, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }
  fillTrap([[0,0],[W,0],[W-wallSide,wallH],[wallSide,wallH]], colorN);         // top
  fillTrap([[0,0],[wallSide,wallH],[wallSide,floorBot],[0,H]], colorW);         // left
  fillTrap([[W,0],[W-wallSide,wallH],[W-wallSide,floorBot],[W,H]], colorE);     // right
  fillTrap([[wallSide,floorBot],[W-wallSide,floorBot],[W,H],[0,H]], colorS);    // bottom

  // Wall edge highlight + 3D perspective lines from canvas corners to floor corners
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(wallSide, wallH, W - wallSide * 2, floorBot - wallH);
  ctx.beginPath();
  ctx.moveTo(0, 0);       ctx.lineTo(wallSide,       wallH);
  ctx.moveTo(W, 0);       ctx.lineTo(W - wallSide,   wallH);
  ctx.moveTo(0, H);       ctx.lineTo(wallSide,       floorBot);
  ctx.moveTo(W, H);       ctx.lineTo(W - wallSide,   floorBot);
  ctx.stroke();
  ctx.restore();

  // Wall texture (deterministic per room, 4 styles, overridable via cheat menu)
  // 0=stripe-v (fan lines, current default)  1=stripe-h (horizontal/vertical flat lines)
  // 2=cube (grid: both v+h)                  3=wide (stripe-v, sparse)
  const _wStyle = _roomDesignWallStyle >= 0 ? _roomDesignWallStyle : (_rCol * 11 + _rRow * 5 + Math.abs(_rCol * _rRow)) % 4;
  drawWallPattern(_wStyle, wallH, wallSide, wallBot);

  // Vignette
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.15, W/2, H/2, H*0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

// Wall texture styles (deterministic per room).
//   0 = stripe-v  : perspective fan lines, vertical feel (current default)
//   1 = stripe-h  : flat horizontal/vertical straight lines
//   2 = cube      : grid overlay (stripe-v + stripe-h combined)
//   3 = wide      : stripe-v but sparse (1 line per ~6 spaces)
function drawWallPattern(style, wallH, wallSide, wallBot) {
  if (!ctx) return;
  const W = G.W, H = G.vH;
  const floorBot = H - wallBot;

  const bH = Math.max(8, Math.floor(wallH / 3)); // base spacing

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;

  // ── Clip helper ────────────────────────────────────────────────
  function withClip(pts, fn) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.clip();
    fn();
    ctx.restore();
  }

  // ── Fan-lines helper (perspective-correct converging lines) ────
  // Corner diagonal angles — same derivation as original drawWallBricks.
  const TL   = Math.atan2( wallH,   wallSide);
  const BL   = Math.atan2(-wallBot, wallSide);
  const TR   = Math.atan2(-wallH,   wallSide);
  const BR   = Math.atan2( wallBot, wallSide);
  const TR_v = Math.atan2( wallH,  -wallSide);
  const BR_v = Math.atan2(-wallBot, -wallSide);

  function fanLines(rx, ry, rw, rh, stepX, startAngle, centerAngle, endAngle, spacing, clipFn) {
    if (rw <= 0 || rh <= 0) return;
    ctx.save(); clipFn();
    const reach = Math.hypot(W, H);
    const midX = rx + rw / 2, midY = ry + rh / 2;
    if (stepX) {
      for (let x = rx; x <= rx + rw + spacing; x += spacing) {
        const t = x <= midX ? (midX - x) / Math.max(1, midX - rx) : (x - midX) / Math.max(1, rx + rw - midX);
        const angle = centerAngle + ((x <= midX ? startAngle : endAngle) - centerAngle) * t;
        const ux = Math.cos(angle), uy = Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(x - ux * reach, midY - uy * reach);
        ctx.lineTo(x + ux * reach, midY + uy * reach);
        ctx.stroke();
      }
    } else {
      for (let y = ry; y <= ry + rh + spacing; y += spacing) {
        const t = y <= midY ? (midY - y) / Math.max(1, midY - ry) : (y - midY) / Math.max(1, ry + rh - midY);
        const angle = centerAngle + ((y <= midY ? startAngle : endAngle) - centerAngle) * t;
        const ux = Math.cos(angle), uy = Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(midX - ux * reach, y - uy * reach);
        ctx.lineTo(midX + ux * reach, y + uy * reach);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ── Style 0 / 3: stripe-v (perspective fan lines) ─────────────
  function drawStripeV(spacing) {
    fanLines(0,           0, wallSide, H,      false, TL,  0,            BL,   spacing, () => {
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,H); ctx.lineTo(wallSide,floorBot); ctx.lineTo(wallSide,wallH); ctx.closePath(); ctx.clip();
    });
    fanLines(W-wallSide,  0, wallSide, H,      false, TR,  0,            BR,   spacing, () => {
      ctx.beginPath(); ctx.moveTo(W,0); ctx.lineTo(W,H); ctx.lineTo(W-wallSide,floorBot); ctx.lineTo(W-wallSide,wallH); ctx.closePath(); ctx.clip();
    });
    fanLines(0,           0, W,       wallH,   true,  TL,  Math.PI/2,    TR_v, spacing, () => {
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(W,0); ctx.lineTo(W-wallSide,wallH); ctx.lineTo(wallSide,wallH); ctx.closePath(); ctx.clip();
    });
    fanLines(0, floorBot,    W,       wallBot, true,  BL, -Math.PI/2,    BR_v, spacing, () => {
      ctx.beginPath(); ctx.moveTo(0,H); ctx.lineTo(W,H); ctx.lineTo(W-wallSide,floorBot); ctx.lineTo(wallSide,floorBot); ctx.closePath(); ctx.clip();
    });
  }

  // ── Style 1: stripe-h (flat horizontal + vertical straight lines) ─
  function drawStripeH() {
    // Side walls: straight vertical lines stepped across the wall width
    const xSp = Math.max(4, Math.floor(wallSide / 3));
    withClip([[0,0],[0,H],[wallSide,floorBot],[wallSide,wallH]], () => {
      for (let x = xSp; x < wallSide; x += xSp) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
    });
    withClip([[W,0],[W,H],[W-wallSide,floorBot],[W-wallSide,wallH]], () => {
      for (let x = W - xSp; x > W - wallSide; x -= xSp) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
    });
    // Top/bottom walls: straight horizontal lines stepped across the wall height
    withClip([[0,0],[W,0],[W-wallSide,wallH],[wallSide,wallH]], () => {
      for (let y = bH; y < wallH; y += bH) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    });
    withClip([[0,H],[W,H],[W-wallSide,floorBot],[wallSide,floorBot]], () => {
      for (let y = H - bH; y > floorBot; y -= bH) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    });
  }

  // ── Dispatch by style ──────────────────────────────────────────
  if (style === 0) {
    drawStripeV(bH);
  } else if (style === 1) {
    drawStripeH();
  } else if (style === 2) {
    // Cube: overlay both (slightly dimmer so they don't overpower each other)
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    drawStripeV(bH);
    drawStripeH();
  } else {
    // Wide/espaçado: same fan lines but much sparser
    drawStripeV(bH * 6);
  }

  ctx.restore();
}

/* ================================================================
   DRAW MENU BACKGROUND (independent of dungeon state)
   worldDef: one of WORLDS entries; openDirs: array of 'N'|'S'|'E'|'W'
================================================================ */
export function drawMenuBackground(worldDef, openDirs = [], patIdx = 0) {
  if (!ctx) return;
  const W = G.W, H = G.vH;

  if (isOpenWorld(worldDef)) {
    if (worldDef.biome === 'ocean') drawEndlessOcean(worldDef, { col: 0, row: 0 }, W, H);
    else drawEndlessCosmos(worldDef, { col: 0, row: 0 }, W, H);
    return;
  }

  const wallH    = Math.floor(H * 0.13);
  const wallSide = Math.floor(W * 0.05);
  const wallBot  = Math.floor(H * 0.07);
  const floorTop = wallH;
  const floorBot = H - wallBot;

  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, worldDef.bgTop);
  bgGrad.addColorStop(1, worldDef.bgBot || worldDef.bgTop);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const cons = new Set(openDirs);
  const wallMain = worldDef.wallColor;
  const wallAlt  = worldDef.altWallColor || worldDef.wallColor;
  const floorAlt = worldDef.floorColorAlt || worldDef.floorColor;

  ctx.fillStyle = worldDef.floorColor;
  ctx.fillRect(wallSide, floorTop, W - wallSide * 2, floorBot - floorTop);

  const gs = FLOOR_GRID_SIZE;
  const _fw = W - wallSide * 2;
  const _fh = floorBot - floorTop;
  ctx.save();
  ctx.beginPath();
  ctx.rect(wallSide, floorTop, _fw, _fh);
  ctx.clip();
  ctx.fillStyle = floorAlt;
  if (patIdx === 0) {
    for (let gx = wallSide; gx < W - wallSide; gx += gs)
      for (let gy = floorTop; gy < floorBot; gy += gs)
        if ((Math.floor((gx - wallSide) / gs) + Math.floor((gy - floorTop) / gs)) % 2 === 0)
          ctx.fillRect(gx, gy, gs, gs);
  } else if (patIdx === 1) {
    const gs2 = FLOOR_LARGE_GRID_SIZE;
    for (let gx = wallSide; gx < W - wallSide; gx += gs2)
      for (let gy = floorTop; gy < floorBot; gy += gs2)
        if ((Math.floor((gx - wallSide) / gs2) + Math.floor((gy - floorTop) / gs2)) % 2 === 0)
          ctx.fillRect(gx, gy, gs2, gs2);
  } else if (patIdx === 2) {
    for (let gx = wallSide; gx < W - wallSide; gx += gs)
      if (Math.floor((gx - wallSide) / gs) % 2 === 0) ctx.fillRect(gx, floorTop, gs, _fh);
  } else if (patIdx === 3) {
    for (let gy = floorTop; gy < floorBot; gy += gs)
      if (Math.floor((gy - floorTop) / gs) % 2 === 0) ctx.fillRect(wallSide, gy, _fw, gs);
  } else if (patIdx === 5) {
    ctx.fillRect(wallSide, floorTop, _fw, _fh);
  }
  ctx.restore();

  function fillTrap(pts, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }
  fillTrap([[0,0],[W,0],[W-wallSide,wallH],[wallSide,wallH]], cons.has('N') ? wallAlt : wallMain);
  fillTrap([[0,0],[wallSide,wallH],[wallSide,floorBot],[0,H]], cons.has('W') ? wallAlt : wallMain);
  fillTrap([[W,0],[W-wallSide,wallH],[W-wallSide,floorBot],[W,H]], cons.has('E') ? wallAlt : wallMain);
  fillTrap([[wallSide,floorBot],[W-wallSide,floorBot],[W,H],[0,H]], cons.has('S') ? wallAlt : wallMain);

  // Perspective lines
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(wallSide, wallH, W - wallSide * 2, floorBot - wallH);
  ctx.beginPath();
  ctx.moveTo(0, 0);  ctx.lineTo(wallSide,     wallH);
  ctx.moveTo(W, 0);  ctx.lineTo(W-wallSide,   wallH);
  ctx.moveTo(0, H);  ctx.lineTo(wallSide,     floorBot);
  ctx.moveTo(W, H);  ctx.lineTo(W-wallSide,   floorBot);
  ctx.stroke();
  ctx.restore();

  drawWallPattern(patIdx % 4, wallH, wallSide, wallBot);

  // Draw door openings (no labels)
  const doorW = Math.min(90, W * 0.14);
  const scaleW = W / Math.max(1, W - 2 * wallSide);
  const scaleH = H / Math.max(1, H - wallH - wallBot);
  const dw_e = doorW * scaleW;
  const dh_e = doorW * scaleH;
  const cy = H * 0.5;
  const DOOR_POS = {
    N: [[W/2 - dw_e/2, 0], [W/2 + dw_e/2, 0], [W/2 + doorW/2, wallH], [W/2 - doorW/2, wallH]],
    S: [[W/2 - doorW/2, H - wallBot], [W/2 + doorW/2, H - wallBot], [W/2 + dw_e/2, H], [W/2 - dw_e/2, H]],
    E: [[W - wallSide, cy - doorW/2], [W, cy - dh_e/2], [W, cy + dh_e/2], [W - wallSide, cy + doorW/2]],
    W: [[0, cy - dh_e/2], [wallSide, cy - doorW/2], [wallSide, cy + doorW/2], [0, cy + dh_e/2]],
  };
  openDirs.forEach(dir => {
    const pts = DOOR_POS[dir];
    if (!pts) return;
    ctx.fillStyle = worldDef.bgBot || worldDef.bgTop;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
    // Door frame highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.stroke();
  });

  // Vignette
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.15, W/2, H/2, H*0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

/* ================================================================
   DRAW DOORS
================================================================ */
const OPEN_EDGE_STYLES = {
  boss:     { rgb: '225, 48, 48',   alpha: 0.56 },
  teacher:  { rgb: '38, 185, 104',  alpha: 0.30 },
  shop:     { rgb: '218, 166, 42',  alpha: 0.28 },
  casino:   { rgb: '153, 64, 220',  alpha: 0.30 },
  modifier: { rgb: '92, 211, 235',  alpha: 0.36 },
  treasure: { rgb: '92, 211, 235',  alpha: 0.36 },
  tent:     { rgb: '158, 111, 204', alpha: 0.22 },
};

function openWorldEdgeStyle(cell, adjacent) {
  const type = adjacent?.type;
  if (type && OPEN_EDGE_STYLES[type]) return OPEN_EDGE_STYLES[type];
  if (cell?.type && OPEN_EDGE_STYLES[cell.type]) return OPEN_EDGE_STYLES[cell.type];
  return null;
}

function drawBossPathParticles(x, y, intensity = 1, monochrome = false) {
  const t = (G.last ?? 0) * 0.001;
  ctx.save();
  // Cleared boss-path rooms keep a neutral, high-contrast marker instead of
  // competing with the gray direction label. Keep the particles fully visible
  // even though the label itself is intentionally dimmed.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = monochrome ? 'source-over' : 'lighter';

  const halo = ctx.createRadialGradient(x, y, 0, x, y, 30 * intensity);
  if (monochrome) {
    halo.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
    halo.addColorStop(0.45, 'rgba(235, 235, 235, 0.16)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    halo.addColorStop(0, 'rgba(255, 45, 45, 0.42)');
    halo.addColorStop(0.45, 'rgba(220, 25, 35, 0.18)');
    halo.addColorStop(1, 'rgba(180, 0, 0, 0)');
  }
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, 30 * intensity, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = monochrome ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 40, 40, 0.95)';
  ctx.shadowBlur = monochrome ? 7 : 10;
  for (let i = 0; i < 8; i++) {
    const phase = (t * (0.8 + i * 0.06) + i * 0.37) % 1;
    const angle = t * (0.45 + i * 0.035) + i * 0.9;
    const orbit = (8 + (i % 3) * 5) * intensity;
    const px = x + Math.cos(angle) * orbit;
    const py = y + Math.sin(angle) * orbit - phase * 18 * intensity;
    const size = (1.8 + (i % 2) * 1.3) * intensity;
    if (monochrome) {
      const lightParticle = i % 2 === 0;
      ctx.fillStyle = lightParticle ? '#ffffff' : '#111111';
    } else {
      ctx.fillStyle = i % 3 === 0 ? '#ffb0a8' : '#ff3f45';
    }
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOpenWorldEdgeGradients(cell, W, H) {
  const edgeDepth = Math.max(88, Math.min(W, H) * 0.19);
  const roomCleared = !!cell.cleared;
  const pulse = roomCleared ? 0.92 + Math.sin((G.last ?? 0) * 0.002) * 0.08 : 1;

  for (const dir of ['N', 'E', 'S', 'W']) {
    if (!cell.connections.has(dir)) continue;
    const [dc, dr] = DIR_DELTA_R[dir];
    const adjacent = getCell(((cell.col + dc) + COLS) % COLS, ((cell.row + dr) + ROWS) % ROWS);
    const style = openWorldEdgeStyle(cell, adjacent);
    if (!style) continue;

    let gradient;
    if (dir === 'N') gradient = ctx.createLinearGradient(0, 0, 0, edgeDepth);
    else if (dir === 'S') gradient = ctx.createLinearGradient(0, H, 0, H - edgeDepth);
    else if (dir === 'E') gradient = ctx.createLinearGradient(W, 0, W - edgeDepth, 0);
    else gradient = ctx.createLinearGradient(0, 0, edgeDepth, 0);

    const alpha = style.alpha * pulse;
    gradient.addColorStop(0, `rgba(${style.rgb}, ${alpha})`);
    gradient.addColorStop(0.48, `rgba(${style.rgb}, ${alpha * 0.34})`);
    gradient.addColorStop(1, `rgba(${style.rgb}, 0)`);

    ctx.save();
    ctx.fillStyle = gradient;
    if (dir === 'N') ctx.fillRect(0, 0, W, edgeDepth);
    else if (dir === 'S') ctx.fillRect(0, H - edgeDepth, W, edgeDepth);
    else if (dir === 'E') ctx.fillRect(W - edgeDepth, 0, edgeDepth, H);
    else ctx.fillRect(0, 0, edgeDepth, H);
    ctx.restore();
  }
}

function drawOpenWorldLabels(cell, W, H) {
  const labelAlpha = G.doorLabelAlpha ?? 1;
  if (labelAlpha < 0.01) return;
  // Open worlds hide the physical wall and door artwork, but their controls
  // keep the exact old door positions so navigation still feels identical.
  const wallH = Math.floor(H * 0.13);
  const wallSide = Math.floor(W * 0.05);
  const wallBot = Math.floor(H * 0.07);
  const labelPos = {
    N: { x: W / 2, y: wallH * 0.5 },
    S: { x: W / 2, y: H - wallBot * 0.5 },
    E: { x: W - wallSide * 0.5, y: H * 0.5 },
    W: { x: wallSide * 0.5, y: H * 0.5 },
  };
  const bossDistMap = _getBossDistMap();
  const curBossDist = bossDistMap?.get(`${cell.col},${cell.row}`);
  const roomCleared = !!cell.cleared;
  const pulse = roomCleared ? (Math.sin((G.last ?? 0) * 0.002) + 1) / 2 : 0;
  const showLabels = G.mode === 'navigate' || cell.cleared;

  for (const dir of ['N', 'E', 'S', 'W']) {
    if (!cell.connections.has(dir) || !showLabels) continue;
    const [dc, dr] = DIR_DELTA_R[dir];
    const adj = getCell(((cell.col + dc) + COLS) % COLS, ((cell.row + dr) + ROWS) % ROWS);
    if (!adj) continue;

    const adjBossDist = bossDistMap?.get(`${adj.col},${adj.row}`);
    const adjCleared = !!adj.cleared && !!adj.visited;
    const isBossPath = curBossDist != null
      && adjBossDist != null && adjBossDist < curBossDist;
    const showBossPathRed = isBossPath && !adjCleared;
    const showBossPathMonochrome = isBossPath && adjCleared;
    const pos = labelPos[dir];

    ctx.save();
    ctx.globalAlpha = labelAlpha * (adj.cleared && adj.visited ? 0.32 : 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.floor(Math.min(wallH, wallSide) * 0.52)}px 'Noto Sans KR', 'Noto Color Emoji', sans-serif`;
    if (showBossPathRed) {
      drawBossPathParticles(pos.x, pos.y, 1.05);
      ctx.shadowBlur = 6 + pulse * 5;
      ctx.shadowColor = 'rgba(255, 24, 32, 0.98)';
    } else if (showBossPathMonochrome) {
      drawBossPathParticles(pos.x, pos.y, 1.05, true);
      ctx.shadowBlur = 3 + pulse * 2;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    } else if (roomCleared) {
      ctx.shadowBlur = 2 + pulse * 2;
      ctx.shadowColor = 'rgba(165, 230, 255, 0.46)';
    }
    ctx.fillStyle = showBossPathRed ? '#ffffff'
      : (adjCleared ? 'rgba(160,160,160,0.9)' : 'rgba(255,255,255,0.88)');
    if (showBossPathRed) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(220, 28, 38, 0.98)';
      ctx.strokeText(DIR_NAMES[dir], pos.x, pos.y);
    }
    ctx.fillText(DIR_NAMES[dir], pos.x, pos.y);
    ctx.restore();
  }
}

export function drawDoors() {
  if (!ctx || !G.dungeon) return;
  const cell = currentCell();
  if (!cell) return;

  if (isOpenWorld(G.dungeon.worldDef)) {
    drawOpenWorldEdgeGradients(cell, G.W, G.vH);
    drawOpenWorldLabels(cell, G.W, G.vH);
    return;
  }

  const W = G.W, H = G.vH;
  const wallH    = Math.floor(H * 0.13);
  const wallSide = Math.floor(W * 0.05);
  const wallBot  = Math.floor(H * 0.07);
  const doorW = Math.min(90, W * 0.14);

  // Perspective scale: doors widen toward the canvas edge (matches wall fan angles)
  const scaleW = W / Math.max(1, W - 2 * wallSide);           // ≈ 1.11 for N/S
  const scaleH = H / Math.max(1, H - wallH - wallBot);        // ≈ 1.25 for E/W
  const dw_e   = doorW * scaleW;   // N/S door width at canvas edge
  const dh_e   = doorW * scaleH;   // E/W door height at canvas edge
  const cy     = H * 0.5;

  // Door shapes as polygon vertex arrays (trapezoidal, wider at canvas edge).
  const DOOR_POS = {
    N: { pts: [[W/2 - dw_e/2, 0], [W/2 + dw_e/2, 0],
               [W/2 + doorW/2, wallH], [W/2 - doorW/2, wallH]],
         lx: W/2, ly: wallH * 0.5 },
    S: { pts: [[W/2 - doorW/2, H - wallBot], [W/2 + doorW/2, H - wallBot],
               [W/2 + dw_e/2, H], [W/2 - dw_e/2, H]],
         lx: W/2, ly: H - wallBot * 0.5 },
    E: { pts: [[W - wallSide, cy - doorW/2], [W, cy - dh_e/2],
               [W, cy + dh_e/2], [W - wallSide, cy + doorW/2]],
         lx: W - wallSide * 0.5, ly: cy },
    W: { pts: [[0, cy - dh_e/2], [wallSide, cy - doorW/2],
               [wallSide, cy + doorW/2], [0, cy + dh_e/2]],
         lx: wallSide * 0.5, ly: cy },
  };

  function fillPts(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
  }

  function strokePts(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.stroke();
  }

  const labelAlpha  = G.doorLabelAlpha ?? 1;
  const roomCleared = !!cell?.cleared;
  const _glowT      = roomCleared ? (G.last ?? 0) * 0.002 : 0;
  const _glowPulse  = roomCleared ? (Math.sin(_glowT) + 1) / 2 : 0; // 0..1, ~3.1s period
  const bossDistMap = _getBossDistMap();
  const curBossDist = bossDistMap?.get(`${cell.col},${cell.row}`);

  for (const [dir, d] of Object.entries(DOOR_POS)) {
    if (!cell.connections.has(dir)) continue; // wall, no door

    const [dc, dr] = DIR_DELTA_R[dir];
    const adj = getCell(((cell.col + dc) + COLS) % COLS, ((cell.row + dr) + ROWS) % ROWS);

    // Door background + tint based on adjacent room type
    const isBossDoor    = adj?.type === 'boss'    || cell.type === 'boss';
    const isCasinoDoor  = adj?.type === 'casino'  || cell.type === 'casino';
    const isShopDoor    = adj?.type === 'shop'    || cell.type === 'shop';
    const isTeacherDoor = adj?.type === 'teacher' || cell.type === 'teacher';
    const isCyanDoor    = adj?.type === 'modifier' || adj?.type === 'treasure'
                       || cell.type === 'modifier' || cell.type === 'treasure';
    ctx.fillStyle = '#000000';
    fillPts(d.pts);

    // Colored glow overlay
    if (isBossDoor) {
      ctx.save();
      ctx.globalAlpha = 0.52;
      ctx.fillStyle = '#d51f2f';
      fillPts(d.pts);
      ctx.strokeStyle = 'rgba(255, 150, 150, 0.95)';
      ctx.lineWidth = 3;
      strokePts(d.pts);
      ctx.restore();
    } else if (isCasinoDoor) {
      ctx.save();
      ctx.globalAlpha = 0.40;
      ctx.fillStyle = '#8800cc';
      fillPts(d.pts);
      ctx.strokeStyle = 'rgba(225, 155, 255, 0.95)';
      ctx.lineWidth = 2.5;
      strokePts(d.pts);
      ctx.restore();
    } else if (isShopDoor) {
      ctx.save();
      ctx.globalAlpha = 0.40;
      ctx.fillStyle = '#aa8800';
      fillPts(d.pts);
      ctx.strokeStyle = 'rgba(255, 232, 125, 0.95)';
      ctx.lineWidth = 2.5;
      strokePts(d.pts);
      ctx.restore();
    } else if (isTeacherDoor) {
      ctx.save();
      ctx.globalAlpha = 0.50;
      ctx.fillStyle = '#0a5c1e';
      fillPts(d.pts);
      ctx.strokeStyle = 'rgba(145, 255, 185, 0.95)';
      ctx.lineWidth = 2.5;
      strokePts(d.pts);
      ctx.restore();
    } else if (isCyanDoor) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#4bd4e9';
      fillPts(d.pts);
      ctx.strokeStyle = 'rgba(185, 247, 255, 0.95)';
      ctx.lineWidth = 2.5;
      strokePts(d.pts);
      ctx.restore();
    }

    if (labelAlpha < 0.01) continue;

    // Show direction label when: in navigate mode (any door) OR adjacent room already visited
    const showLabel = G.mode === 'navigate' || adj?.visited;
    if (!showLabel) continue;

    // Cleared adjacent rooms: dim the label
    const adjCleared = adj?.cleared && adj?.visited;

    // Boss-path: this door leads toward the boss room via the shortest route
    const adjBossDist = adj ? bossDistMap?.get(`${adj.col},${adj.row}`) : undefined;
    const isBossPath  = curBossDist != null && adjBossDist != null && adjBossDist < curBossDist;
    const showBossPathRed = isBossPath && !adjCleared;
    const showBossPathMonochrome = isBossPath && adjCleared;

    ctx.save();
    ctx.globalAlpha = labelAlpha * (adjCleared ? 0.28 : 1.0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Glow effects: boss-path red takes priority; cleared-room blue is subtle
    if (showBossPathRed) {
      drawBossPathParticles(d.lx, d.ly, 1.0);
      ctx.shadowBlur  = 5 + _glowPulse * 4;
      ctx.shadowColor = 'rgba(255, 24, 32, 0.98)';
    } else if (showBossPathMonochrome) {
      drawBossPathParticles(d.lx, d.ly, 1.0, true);
      ctx.shadowBlur  = 3 + _glowPulse * 2;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    } else if (roomCleared) {
      ctx.shadowBlur  = 2 + _glowPulse * 3;
      ctx.shadowColor = 'rgba(160, 230, 255, 0.5)';
    }
    ctx.font = `bold ${Math.floor(Math.min(wallH, wallSide) * 0.52)}px 'Noto Sans KR', 'Noto Color Emoji', sans-serif`;
    ctx.fillStyle = showBossPathRed ? '#ffffff'
      : (adjCleared ? 'rgba(155,155,155,0.92)' : 'rgba(255,255,255,0.9)');
    if (showBossPathRed) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(220, 28, 38, 0.98)';
      ctx.strokeText(DIR_NAMES[dir], d.lx, d.ly);
    }
    ctx.fillText(DIR_NAMES[dir], d.lx, d.ly);
    ctx.restore();
  }
}

/* ================================================================
   NAV ARROWS (navigate mode only)
================================================================ */
export function drawNavPrompt() {
  // Direction prompts are now shown directly on door openings in drawDoors()
}

/* ================================================================
   ANNOUNCE OVERLAY
================================================================ */
export function drawAnnounce() {
  if (!G.announceQ || !ctx) return;
  const q = G.announceQ;
  const alpha = Math.min(1, q.t * 4) * (q.t > q.dur - 0.4 ? (q.dur - q.t) / 0.4 : 1);
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.font = `bold ${Math.floor(G.vH * 0.04)}px 'Noto Color Emoji', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText(q.msg, G.W / 2 + 2, G.vH * 0.3 + 2);
  ctx.fillStyle = q.color || '#ffffff';
  ctx.fillText(q.msg, G.W / 2, G.vH * 0.3);
  ctx.restore();
}

/* ================================================================
   TRANSITION FADE
================================================================ */
export function drawTransition() {
  if (!G.transition || !ctx) return;
  const { phase, t, dur } = G.transition;
  const progress = Math.min(1, t / dur);
  const alpha = phase === 'out' ? progress : 1 - progress;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fillRect(0, 0, G.W, G.vH);
  ctx.restore();
}

export function drawWorldTransition() {
  const wt = G.worldTransition;
  if (!wt || !ctx) return;
  const W = G.W, H = G.vH;
  const fontSize = Math.round(H * 0.11);
  ctx.save();
  if (wt.phase === 'wipe_in') {
    // Bar grows left → right
    const barW = W * easeInOut(wt.wipeProgress);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, barW, H);
  } else if (wt.phase === 'emoji') {
    // Full black + travelling emoji
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(wt.ex, wt.ey);
    ctx.rotate(wt.angle);
    ctx.font = `${fontSize}px 'Noto Color Emoji', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wt.emoji, 0, 0);
    ctx.restore();
  } else if (wt.phase === 'wipe_out') {
    // Bar shrinks from left (right anchor)
    const leftEdge = W * easeInOut(1 - wt.wipeProgress);
    ctx.fillStyle = '#000';
    ctx.fillRect(leftEdge, 0, W - leftEdge, H);
  }
  ctx.restore();
}

function easeInOut(t) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }

/* ================================================================
   WEATHER SYSTEM (ported from typing-game.html)
================================================================ */
const _emojiCache = new Map();
function _getEmojiCanvas(emoji) {
  if (_emojiCache.has(emoji)) return _emojiCache.get(emoji);
  const sz = 64;
  const oc = document.createElement('canvas');
  oc.width = oc.height = sz;
  const c = oc.getContext('2d');
  c.font = `${Math.round(sz * 0.85)}px 'Noto Color Emoji', serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(emoji, sz / 2, sz / 2);
  _emojiCache.set(emoji, oc);
  return oc;
}
function mkWxParticle(type, scatter) {
  const p = { type, life: 1 };
  p.x = Math.random() * G.W;
  p.y = scatter ? Math.random() * G.vH : -10;
  if (type === 'drizzle' || type === 'raining') {
    p.vy = 300 + Math.random() * 140;
    p.vx = -30 + Math.random() * 60;
    p.len = type === 'raining' ? 18 + Math.random() * 12 : 9 + Math.random() * 6;
    p.alpha = type === 'raining' ? 0.55 + Math.random() * 0.3 : 0.38 + Math.random() * 0.25;
  } else if (type === 'snowing' || type === 'blizzard') {
    const sp = type === 'blizzard' ? 2.2 : 1;
    p.r = type === 'blizzard' ? 2.5 + Math.random() * 5 : 1.8 + Math.random() * 3;
    p.vy = 50 + Math.random() * 90 * sp;
    p.vx = (-40 + Math.random() * 80) * sp;
    p.wobble = Math.random() * Math.PI * 2;
    p.wobbleSpd = 0.5 + Math.random() * 1.5;
    const hue = Math.random() * 40;
    p.color = `hsl(${200 + hue},${20 + Math.random() * 30}%,${88 + Math.random() * 10}%)`;
    p.alpha = type === 'blizzard' ? 0.72 + Math.random() * 0.18 : 0.6 + Math.random() * 0.25;
  } else if (type === 'fall' || type === 'blossom') {
    p.emoji = type === 'fall'
      ? ['🍂','🍁','🍃'][Math.floor(Math.random() * 3)]
      : ['🌸','🌺','🌼'][Math.floor(Math.random() * 3)];
    p.r = 8 + Math.random() * 8;
    p.sz = p.r * 2;
    p.vy = 40 + Math.random() * 60;
    p.vx = -25 + Math.random() * 50;
    p.rot = Math.random() * Math.PI * 2;
    p.rotSpd = (-1 + Math.random() * 2) * 1.2;
    p.alpha = 0.55 + Math.random() * 0.4;
    _getEmojiCanvas(p.emoji); // pre-warm cache on particle creation
  }
  return p;
}

export function initWeather(w) {
  G.weather = w;
  G.wxParticles = [];
  G.wxFogOffset = 0;
  const BASE = { drizzle:120, raining:280, snowing:160, blizzard:420, fall:50, blossom:50 };
  const areaScale = Math.min(1, (window.innerWidth * window.innerHeight) / (1920 * 1080));
  const weatherMult = G.weatherEnabled ?? 1;
  const count = Math.round((BASE[w] || 0) * areaScale * weatherMult);
  for (let i = 0; i < count; i++) G.wxParticles.push(mkWxParticle(w, true));
}

// Crossfade state - old weather fades out while new weather fades in simultaneously.
// Canvas opacity is never animated; instead, particle groups each have an alpha multiplier.
let _wxFade = { active: false, t: 0, dur: 3.0, oldAlpha: 0, newAlpha: 1 };

/** Begin a 3-second crossfade to a new weather type. Old particles fade out; new fade in. */
export function startWeatherFade(newWeather) {
  if (!(G.weatherEnabled > 0)) {
    G.weather = newWeather;
    G.wxParticles = [];
    G.wxOldParticles = [];
    G.wxOldWeather = null;
    return;
  }
  // Save current particles as "old" (will fade out)
  G.wxOldParticles = G.wxParticles;
  G.wxOldWeather   = G.weather;
  // Initialize new weather (will fade in)
  G.weather = newWeather;
  G.wxParticles = [];
  initWeather(newWeather);
  _wxFade = { active: true, t: 0, dur: 3.0, oldAlpha: 1.0, newAlpha: 0.0 };
}

function _tickWxParticleGroup(groupKey, w, dt, allowSpawn) {
  const particles = G[groupKey];
  if (!particles || w === 'clear') return;

  if (w === 'foggy' || w === 'blizzard') {
    const weatherMult = G.weatherEnabled ?? 1;
    const targets = Math.round((w === 'blizzard' ? 14 : 28) * weatherMult);
    const fogParticles = particles.filter(p => p.type === 'fogblob');
    if (allowSpawn) {
      while (fogParticles.length < targets) {
        const p = { type:'fogblob', x:Math.random()*G.W, y:Math.random()*G.vH,
          r: 80 + Math.random()*130,
          vx: (10 + Math.random()*18) * (Math.random()<0.5?1:-1),
          vy: -5 + Math.random()*10,
          alpha: w==='blizzard' ? 0.06+Math.random()*0.08 : 0.12+Math.random()*0.16 };
        particles.push(p); fogParticles.push(p);
      }
    }
    for (const p of particles) {
      if (p.type !== 'fogblob') continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p._fadingOut) {
        p._fadeVal = Math.max(0, (p._fadeVal ?? 1) - dt * 2.5);
        if (p._fadeVal <= 0) {
          if (p.x > G.W + p.r) p.x = -p.r;
          if (p.x < -p.r)       p.x = G.W + p.r;
          if (p.y < -p.r)       p.y = G.vH + p.r;
          if (p.y > G.vH + p.r) p.y = -p.r;
          p._fadingOut = false; p._fadingIn = true;
        }
      } else if (p._fadingIn) {
        p._fadeVal = Math.min(1, (p._fadeVal ?? 0) + dt * 2.5);
        if (p._fadeVal >= 1) p._fadingIn = false;
      } else if (p.x > G.W+p.r || p.x < -p.r || p.y < -p.r || p.y > G.vH+p.r) {
        p._fadingOut = true; p._fadeVal = 1;
      }
    }
    if (w === 'foggy') return;
  }

  const areaScale = Math.min(1, (G.W * G.vH) / (1920 * 1080));
  const weatherMult = G.weatherEnabled ?? 1;
  const cap = Math.round(({ drizzle:120, raining:280, snowing:160, blizzard:420, fall:50, blossom:50 })[w] * areaScale * weatherMult) || 0;
  if (allowSpawn) {
    while (particles.length < cap) particles.push(mkWxParticle(w, false));
  }
  for (const p of particles) {
    if (p.type === 'fogblob') continue;
    if (w === 'drizzle' || w === 'raining') {
      p.x += p.vx * dt; p.y += p.vy * dt;
    } else if (w === 'snowing' || w === 'blizzard') {
      p.wobble += p.wobbleSpd * dt;
      p.x += p.vx * dt + Math.sin(p.wobble) * 0.5;
      p.y += p.vy * dt;
    } else if (w === 'fall' || w === 'blossom') {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.rotSpd * dt;
    }
  }
  if (allowSpawn) {
    G[groupKey] = particles.filter(p => p.y < G.vH + 20 && p.x > -30 && p.x < G.W + 30);
  }
}

export function tickWeather(dt) {
  if (!(G.weatherEnabled > 0)) return;

  // Advance crossfade - old fades 1→0, new fades 0→1 simultaneously
  if (_wxFade.active) {
    _wxFade.t += dt;
    const frac = Math.min(1, _wxFade.t / _wxFade.dur);
    _wxFade.oldAlpha = 1.0 - frac;
    _wxFade.newAlpha = frac;
    if (_wxFade.t >= _wxFade.dur) {
      _wxFade.active = false;
      G.wxOldParticles = [];
      G.wxOldWeather = null;
    }
  }

  // Keep old weather particles moving during fade-out
  if (G.wxOldParticles?.length && G.wxOldWeather) {
    _tickWxParticleGroup('wxOldParticles', G.wxOldWeather, dt, false);
  }

  // Tick current weather
  const w = G.weather;
  if (w === 'clear') return;
  _tickWxParticleGroup('wxParticles', w, dt, true);
}

function _drawWxParticles(particles, w, alphaMult) {
  if (!particles.length || w === 'clear') return;

  // Fog blobs: radial gradient instead of per-blob CSS blur filter (10x cheaper)
  if (w === 'foggy' || w === 'blizzard') {
    for (const p of particles) {
      if (p.type !== 'fogblob') continue;
      const a = p.alpha * (p._fadeVal ?? 1) * alphaMult;
      const grad = wxCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, `rgba(200,215,230,${a})`);
      grad.addColorStop(1, 'rgba(200,215,230,0)');
      wxCtx.fillStyle = grad;
      wxCtx.beginPath();
      wxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      wxCtx.fill();
    }
    if (w === 'foggy') return;
  }

  // One save/restore per weather type instead of per particle
  wxCtx.save();
  if (w === 'drizzle' || w === 'raining') {
    wxCtx.strokeStyle = w === 'raining' ? 'rgba(120,175,220,1)' : 'rgba(150,200,235,0.9)';
    wxCtx.lineWidth = w === 'raining' ? 2.2 : 1.4;
    for (const p of particles) {
      if (p.type === 'fogblob') continue;
      wxCtx.globalAlpha = p.alpha * alphaMult;
      wxCtx.beginPath();
      wxCtx.moveTo(p.x, p.y);
      wxCtx.lineTo(p.x + p.vx * 0.03, p.y + p.len);
      wxCtx.stroke();
    }
  } else if (w === 'snowing' || w === 'blizzard') {
    for (const p of particles) {
      if (p.type === 'fogblob') continue;
      wxCtx.globalAlpha = p.alpha * alphaMult;
      wxCtx.fillStyle = p.color;
      wxCtx.beginPath();
      wxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      wxCtx.fill();
    }
  } else if (w === 'fall' || w === 'blossom') {
    for (const p of particles) {
      wxCtx.save();
      wxCtx.globalAlpha = p.alpha * alphaMult;
      wxCtx.translate(p.x, p.y); wxCtx.rotate(p.rot);
      wxCtx.drawImage(_getEmojiCanvas(p.emoji), -p.sz / 2, -p.sz / 2, p.sz, p.sz);
      wxCtx.restore();
    }
  }
  wxCtx.restore();
}

/** Draw weather particles only - day/night handled separately by drawDayNight(). */
export function drawWeather() {
  if (!wxCtx) return;
  const _dpr = window.devicePixelRatio || 1;
  const _pw = Math.floor(G.W * _dpr), _ph = Math.floor(G.vH * _dpr);
  if (wxCanvas.width !== _pw || wxCanvas.height !== _ph) {
    wxCanvas.width  = _pw; wxCanvas.height = _ph;
    wxCanvas.style.width = G.W + 'px'; wxCanvas.style.height = G.vH + 'px';
  }
  wxCtx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  wxCtx.clearRect(0, 0, G.W, G.vH);
  if (!G.weatherEnabled) return;

  // Draw old weather (fading out) simultaneously with new weather (fading in)
  if (_wxFade.active && G.wxOldParticles?.length && G.wxOldWeather) {
    _drawWxParticles(G.wxOldParticles, G.wxOldWeather, _wxFade.oldAlpha);
  }
  const newAlpha = _wxFade.active ? _wxFade.newAlpha : 1.0;
  _drawWxParticles(G.wxParticles, G.weather, newAlpha);
}

/** Draw the day/night darkness overlay on a dedicated canvas that is never opacity-animated. */
export function drawDayNight() {
  if (!dnCtx) return;
  const _dpr = window.devicePixelRatio || 1;
  const _pw = Math.floor(G.W * _dpr), _ph = Math.floor(G.vH * _dpr);
  if (dnCanvas.width !== _pw || dnCanvas.height !== _ph) {
    dnCanvas.width  = _pw; dnCanvas.height = _ph;
    dnCanvas.style.width = G.W + 'px'; dnCanvas.style.height = G.vH + 'px';
  }
  dnCtx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  dnCtx.clearRect(0, 0, G.W, G.vH);
  const brightness = getDayBrightness();
  if (brightness < 1.0) {
    const darkAlpha = (1 - brightness) * 0.62;
    dnCtx.save();
    dnCtx.globalAlpha = darkAlpha;
    dnCtx.fillStyle = 'rgba(0,0,30,1)';
    dnCtx.fillRect(0, 0, G.W, G.vH);
    dnCtx.restore();
  }
}

/* ================================================================
   ROOM NPC (shop / modifier - player types word to interact)
================================================================ */
export function drawRoomNpc() {
  if (!ctx) return;
  const npc = G.room?.npc;
  if (!npc || !npc.active) return;

  // Always compute from current viewport - NPC position is not stored as absolute coords
  const x = G.W / 2;
  const y = G.vH * 0.42;
  const emojiSize = Math.floor(G.vH * 0.07);

  ctx.save();

  // Subtle glow pulse
  const pulse = 0.7 + Math.sin((G.gameTime || 0) * 3) * 0.15;
  const isPortal = npc.type === 'next_world';
  ctx.shadowColor = isPortal ? 'rgba(120, 180, 255, 0.75)' : 'rgba(255, 220, 60, 0.6)';
  ctx.shadowBlur = (isPortal ? 28 : 18) * pulse;

  // NPC emoji
  ctx.font = `${emojiSize}px 'Noto Color Emoji', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(npc.emoji, x, y);

  ctx.shadowBlur = 0;

  // Tent on cooldown: show only emoji + arc + seconds, skip all labels
  if (npc.type === 'tent' && (G.run?.tentCooldown || 0) > 0) {
    const cd = G.run.tentCooldown;
    const frac = cd / 120;
    const r = emojiSize * 0.80;
    ctx.strokeStyle = 'rgba(80,80,80,0.5)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#cc8833';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
    const cdSz = Math.max(11, Math.floor(emojiSize * 0.34));
    ctx.font = `bold ${cdSz}px 'Noto Sans KR', 'Noto Color Emoji', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffcc66';
    ctx.fillText(`${Math.ceil(cd)}초`, x, y + r + 10);
    ctx.restore();
    return;
  }

  // Word label (what player must type)
  const labelSize = Math.max(20, Math.round((G.hangulSize || 38) * G.vH / 1080));
  ctx.font = `bold ${labelSize}px 'Noto Sans KR', 'Noto Color Emoji', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Background pill
  const textW = ctx.measureText(npc.word).width;
  const padX = 12, padY = 5;
  const rx = x - textW / 2 - padX;
  const ry = y + emojiSize * 0.6;
  const rw = textW + padX * 2;
  const rh = labelSize + padY * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.beginPath();
  ctx.roundRect(rx, ry, rw, rh, 8);
  ctx.fill();

  // Text
  ctx.fillStyle = '#ffe066';
  ctx.fillText(npc.word, x, ry + padY);

  // Translation / subtitle below word
  {
    const entry = WORD_DICT.find(d => d.text === npc.word);
    // Portal always shows world name; others only when translationEnabled
    const trans = isPortal
      ? (npc.worldId ? i18n('worlds.' + npc.worldId + '.name') : '') || ''
      : (G.translationEnabled && entry ? wordTr(entry.text) : '');
    if (trans) {
      const transSz = Math.max(7, labelSize * 0.72);
      ctx.font = `${transSz}px 'Pretendard', 'Noto Sans KR', 'Noto Color Emoji', sans-serif`;
      ctx.fillStyle = isPortal ? 'rgba(160,210,255,0.85)' : 'rgba(180,210,255,0.72)';
      ctx.textBaseline = 'top';
      ctx.fillText(trans, x, ry + padY + labelSize + 10);
    }
  }

  ctx.restore();
}

/* ================================================================
   ROOM TYPE LABEL (debug / orientation)
================================================================ */
export function drawRoomLabel() {
  // Room type labels removed (visual clutter)
}

export { canvas, ctx };
