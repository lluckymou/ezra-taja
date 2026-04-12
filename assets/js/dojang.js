/* ================================================================
   HANGUL DOJANG - Main Module
   Drawing practice system for learning hangul stroke order.
================================================================ */
import { G } from './state.js';
import {
  JAMO_STROKES, JAMO_INFO, JAMO_HAS_BATCHIM, PHASE1_JAMOS,
  INTRO_JAMOS, MAX_JAMO_COUNT, BATCHIM_UNLOCK_COUNT, WORDS_UNLOCK_PCT,
  ALL_CV_SYLLABLES, COMPLEX_SYLLABLES,
  syllableToJamos, computeHangulStage, pickNextChallenge,
} from '../data/dojang-data.js';
import { WORD_DICT } from '../data/words.js';
import { get as i18n } from './i18n.js';
import { parseLessonMarkdown } from './hud.js';
import { play as sfx } from './sfx.js';

const STORAGE_KEY = 'krr_dojang';
const MAX_ERRORS  = 3;     // errors before resetting current character
const MIN_STROKE_LEN = 18; // minimum stroke px to count (avoids taps)
const CIRCLE_CLOSE_RATIO = 0.45; // end/start dist must be < ratio * total length

// ── Persistent stats schema ──────────────────────────────────
// {
//   jamoProgress: { 'ㄱ': { count: 0 }, ... },
//   globalThreshold: 0,
//   unlockedGuides: [],
//   firstDate: '2025-...',
//   lastDate:  '2025-...',
// }

export function loadDojangStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // Migrate old saves that lack new fields
      if (!Array.isArray(s.seenJamos))     s.seenJamos = [];
      if (!Array.isArray(s.seenSyllables)) s.seenSyllables = [];
      return s;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function saveDojangStats(stats) {
  stats.lastDate = new Date().toISOString().slice(0, 10);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch (e) { /* ignore */ }
}

function freshStats() {
  return {
    jamoProgress: {},
    seenJamos: [],      // jamos successfully completed at least once
    seenSyllables: [],  // CV syllables (no batchim) completed at least once
    firstDate: new Date().toISOString().slice(0, 10),
    lastDate:  new Date().toISOString().slice(0, 10),
  };
}

// ── Arrow helpers ─────────────────────────────────────────────
function _angleToArrow(deg) {
  const dirs = ['→','↘','↓','↙','←','↖','↑','↗'];
  const idx = Math.round(((deg % 360 + 360) % 360) / 45) % 8;
  return dirs[idx];
}

export function strokeAngleToArrow(angle) {
  if (angle === 'circle') return '◯';
  if (Array.isArray(angle)) return _angleToArrow(angle[0]) + _angleToArrow(angle[1]);
  return _angleToArrow(angle);
}

// ── DojangManager ────────────────────────────────────────────
export class DojangManager {
  constructor() {
    this.stats          = null;
    this.strokeCanvas   = null;
    this.sCtx           = null;
    // Challenge state
    // { char, jamos, jamoIdx, strokeIdx, totalStrokes, globalStrokeIdx, completedPaths }
    this.challenge      = null;
    this.errors         = 0;
    // In-progress stroke tracking
    this.drawing        = false;
    this.points         = [];
    this.lastPt         = null;
    // Animation state
    this.flash          = null;  // { type: 'ok'|'err', t: 0, dur: 0.4 }
    this.paused         = false;
    this.bookOpen       = false;
    this.inspectorOpen  = false;
    // Challenge countdown before displaying next (brief pause after success)
    this.nextDelay      = 0;
    // TTS queue: if speech is playing, next auto-speak is stored here
    this._pendingSpeak  = null;
    // Callbacks set by game.js
    this.onStartAdventure = null;
    this.onExitToMenu     = null;
  }

  // ── Init ──────────────────────────────────────────────────
  init(strokeCanvasEl) {
    this.strokeCanvas = strokeCanvasEl;
    this.sCtx = strokeCanvasEl.getContext('2d');
    this._bindEvents();
  }

  start(stats) {
    this.stats  = stats ? JSON.parse(JSON.stringify(stats)) : freshStats();
    this.paused = false;
    this.bookOpen = false;
    this.inspectorOpen = false;
    this._nextChallenge();
    this._syncHUD();
    this._showPauseMenu(false);
    this._showBook(false);
    this._showInspector(false);
    document.body.classList.add('phase-dojang');
    // Place player sprite into dojang player slot
    const slot = document.getElementById('dojang-player-sprite');
    const src  = document.getElementById('pl-emoji');
    if (slot && src) slot.innerHTML = src.innerHTML;
  }

  exit() {
    saveDojangStats(this.stats);
    document.body.classList.remove('phase-dojang');
    this._clearStrokes();
    // Ensure all overlays are hidden so they don't leak into roguelite
    this._showPauseMenu(false);
    this._showBook(false);
    this._showInspector(false);
    this.paused = false;
    this.bookOpen = false;
    this.inspectorOpen = false;
  }

  // ── RAF Loop ─────────────────────────────────────────────
  tick(dt) {
    if (this.paused || this.bookOpen || this.inspectorOpen) return;
    if (this.flash) {
      this.flash.t += dt;
      if (this.flash.t >= this.flash.dur) this.flash = null;
    }
    if (this.nextDelay > 0) {
      this.nextDelay -= dt;
      if (this.nextDelay <= 0) {
        this.nextDelay = 0;
        this._nextChallenge();
      }
    }
  }

  // Draw onto the main gc canvas (background + ghost guide)
  draw(ctx) {
    const W = G.W, H = G.vH || G.H;

    // ── Background ────────────────────────────────────────
    ctx.fillStyle = '#05081a';
    ctx.fillRect(0, 0, W, H);

    const cx      = W / 2;
    const isMob   = H < 600;
    const cy      = H * 0.42;
    const size    = isMob
      ? Math.min(W * 0.44, H * 0.34, 200)
      : Math.min(W * 0.55, H * 0.45, 280);

    // Grid centered on ghost character (half-char-height grid cells)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const gSize  = size / 2;
    const startX = ((cx % gSize) + gSize) % gSize;
    const startY = ((cy % gSize) + gSize) % gSize;
    for (let x = startX; x <= W; x += gSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = startY; y <= H; y += gSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    if (!this.challenge) return;

    // ── Ghost guide character ─────────────────────────────
    const stage = computeHangulStage(this.stats);
    const { jamos, jamoIdx } = this.challenge;
    // Stage 0/1: show current individual jamo; stage 2+: show full syllable
    const ghostChar = (stage <= 1 && jamoIdx < jamos.length)
      ? jamos[jamoIdx]
      : this.challenge.char;

    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle  = '#ffffff';
    ctx.font = `bold ${size}px "Nanum Myeongjo", "SongMyung", serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ghostChar, cx, cy);
    ctx.restore();

    // ── Flash overlay ─────────────────────────────────────
    if (this.flash) {
      const p = this.flash.t / this.flash.dur;
      const alpha = Math.max(0, (1 - p) * 0.35);
      ctx.fillStyle = this.flash.type === 'ok'
        ? `rgba(80,220,120,${alpha})`
        : `rgba(220,60,60,${alpha})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Stroke guide + HUD text ───────────────────────────
    this._drawStrokeGuide(ctx, W, H);
    this._drawHUDCanvas(ctx, W, H);
  }

  // ── Stroke guide: numbered directional arrows ─────────────
  _drawStrokeGuide(ctx, W, H) {
    if (!this.challenge || this.nextDelay > 0) return;
    const { jamos, jamoIdx, strokeIdx } = this.challenge;
    if (jamoIdx >= jamos.length) return;
    const curJamo = jamos[jamoIdx];
    const strokes = JAMO_STROKES[curJamo] || [];
    if (strokes.length === 0) return;

    const isMob   = H < 600;
    const guideY  = isMob ? H * 0.73 : H * 0.70;
    const isDesk  = H >= 600;
    const maxItemW = isDesk ? 90 : 64;
    const itemW   = Math.max(44, Math.min(maxItemW, (W * 0.72) / Math.max(strokes.length, 1)));
    const totalW  = strokes.length * itemW;
    const startX  = W / 2 - totalW / 2 + itemW / 2;
    const rNum    = Math.max(12, H * 0.026); // circle radius
    const circleY = guideY - rNum * 2.2;     // center of the numbered circle
    const arrowY  = guideY + H * 0.008;      // center of the arrow glyph

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    strokes.forEach((stroke, i) => {
      const x = startX + i * itemW;
      const isCompleted = i < strokeIdx;
      const isCurrent   = i === strokeIdx;

      if (isCompleted) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle   = 'rgba(80,220,120,0.9)';
        ctx.strokeStyle = 'rgba(80,220,120,0.6)';
      } else if (isCurrent) {
        ctx.globalAlpha = 1;
        ctx.fillStyle   = 'rgba(255,255,255,1)';
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      } else {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle   = 'rgba(255,255,255,0.5)';
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      }

      // Circled stroke number - arc and text share the same center
      ctx.beginPath();
      ctx.arc(x, circleY, rNum, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = `bold ${Math.round(rNum * 1.1)}px "Pretendard Variable", sans-serif`;
      ctx.fillText(String(i + 1), x, circleY);

      // Direction arrow
      const arrow = strokeAngleToArrow(stroke.a);
      ctx.font = `${Math.round(Math.max(20, H * 0.038))}px "Pretendard Variable", sans-serif`;
      ctx.fillText(arrow, x, arrowY);
    });
    ctx.restore();
  }

  _drawHUDCanvas(ctx, W, H) {
    if (!this.challenge) return;
    const { jamos, jamoIdx, totalStrokes, globalStrokeIdx } = this.challenge;

    const isMob = H < 600;
    // Guard against out-of-bounds after challenge complete (during nextDelay)
    if (jamoIdx >= jamos.length) {
      // Show all dots green
      const dotY   = isMob ? H * 0.895 : H * 0.856;
      const dotR   = H * 0.013;
      const dotGap = dotR * 3.2;
      const startX = W / 2 - (totalStrokes - 1) * dotGap / 2;
      for (let i = 0; i < totalStrokes; i++) {
        ctx.beginPath();
        ctx.arc(startX + i * dotGap, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(80,220,120,0.9)';
        ctx.fill();
      }
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(80,220,120,0.9)';
      ctx.font = `bold ${Math.round(H * 0.032)}px "Pretendard Variable", sans-serif`;
      ctx.fillText(i18n('dojang.great'), W / 2, isMob ? H * 0.84 : H * 0.80);
      ctx.restore();
      return;
    }

    const curJamo   = jamos[jamoIdx];
    const info      = JAMO_INFO[curJamo];

    // Bottom instruction text
    const instrY = isMob ? H * 0.84 : H * 0.80;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this.errors >= MAX_ERRORS - 1 && this.challenge.globalStrokeIdx > 0) {
      ctx.fillStyle = 'rgba(255,160,80,0.9)';
      ctx.font = `bold ${Math.round(Math.max(16, H * 0.034))}px "Pretendard Variable", sans-serif`;
      ctx.fillText(i18n('dojang.lastTry'), W / 2, instrY);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `${Math.round(Math.max(15, H * 0.032))}px "Pretendard Variable", sans-serif`;
      const stage = computeHangulStage(this.stats);
      let msg;
      if (stage <= 1) {
        msg = i18n('dojang.drawJamo').replace('{j}', curJamo);
      } else {
        msg = i18n('dojang.drawSyllable').replace('{s}', this.challenge.char).replace('{j}', curJamo);
      }
      ctx.fillText(msg, W / 2, instrY);
    }

    // Stroke counter dots - sliding window of max 10, centered on current stroke
    const MAX_DOTS  = 10;
    const dotY      = isMob ? H * 0.895 : H * 0.856;
    const dotR      = H * 0.013;
    const dotGap    = dotR * 3.2;
    let winStart = 0;
    if (totalStrokes > MAX_DOTS) {
      // Keep current stroke in the middle half of the window (start scrolling at index 5)
      winStart = Math.max(0, Math.min(globalStrokeIdx - Math.floor(MAX_DOTS / 2), totalStrokes - MAX_DOTS));
    }
    const winCount = Math.min(MAX_DOTS, totalStrokes);
    const startX   = W / 2 - (winCount - 1) * dotGap / 2;
    for (let w = 0; w < winCount; w++) {
      const i = winStart + w;
      ctx.beginPath();
      ctx.arc(startX + w * dotGap, dotY, dotR, 0, Math.PI * 2);
      if (i < globalStrokeIdx) {
        ctx.fillStyle = 'rgba(80,220,120,0.9)';   // completed
      } else if (i === globalStrokeIdx) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';  // current
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; // upcoming
      }
      ctx.fill();
    }

    // Jamo name label above ghost area
    if (info) {
      const sz = Math.round(Math.max(14, H * 0.030));
      ctx.font = `${sz}px "Pretendard Variable", sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText(`${curJamo}  ${info.name} · ${info.rom}`, W / 2, H * 0.22);
    }

    ctx.restore();
  }

  // ── Stroke events ─────────────────────────────────────────
  _bindEvents() {
    const el = this.strokeCanvas;
    const getXY = (e) => {
      const r = el.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    };
    const down = (e) => {
      e.preventDefault();
      if (this.paused || this.bookOpen || this.inspectorOpen || this.nextDelay > 0) return;
      const { x, y } = getXY(e);
      this._startStroke(x, y);
    };
    const move = (e) => {
      e.preventDefault();
      if (!this.drawing) return;
      const { x, y } = getXY(e);
      this._moveStroke(x, y);
    };
    const up = (e) => {
      e.preventDefault();
      if (!this.drawing) return;
      const src = e.changedTouches ? e.changedTouches[0] : e;
      const r = el.getBoundingClientRect();
      this._endStroke(src.clientX - r.left, src.clientY - r.top);
    };
    el.addEventListener('mousedown',  down, { passive: false });
    el.addEventListener('mousemove',  move, { passive: false });
    el.addEventListener('mouseup',    up,   { passive: false });
    el.addEventListener('mouseleave', up,   { passive: false });
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchmove',  move, { passive: false });
    el.addEventListener('touchend',   up,   { passive: false });
  }

  _startStroke(x, y) {
    this.drawing = true;
    this.points  = [{ x, y }];
    this.lastPt  = { x, y };
    this.sCtx.beginPath();
    this.sCtx.moveTo(x, y);
  }

  _moveStroke(x, y) {
    this.points.push({ x, y });
    this.sCtx.lineTo(x, y);
    this.sCtx.strokeStyle = '#ffffff';
    this.sCtx.lineWidth   = Math.max(3, Math.min(this.strokeCanvas.width * 0.006, 7));
    this.sCtx.lineCap  = 'round';
    this.sCtx.lineJoin = 'round';
    this.sCtx.stroke();
    this.sCtx.beginPath();
    this.sCtx.moveTo(x, y);
    this.lastPt = { x, y };
  }

  _endStroke(x, y) {
    this.drawing = false;
    if (x !== this.lastPt?.x || y !== this.lastPt?.y) {
      this._moveStroke(x, y);
    }
    this._validateStroke();
  }

  // ── Stroke validation ──────────────────────────────────────
  _validateStroke() {
    const pts = this.points;
    if (pts.length < 2) { this._onError(); return; }

    // Proximity check: strokes within a jamo must be drawn near each other
    if (!this._isNearExisting(pts)) { this._onError(); return; }

    const start = pts[0];
    const end   = pts[pts.length - 1];
    const len   = pts.reduce((acc, p, i) => {
      if (i === 0) return 0;
      return acc + Math.hypot(p.x - pts[i-1].x, p.y - pts[i-1].y);
    }, 0);

    if (len < MIN_STROKE_LEN) { this._onError(); return; }

    const { jamos, jamoIdx, strokeIdx } = this.challenge;
    if (jamoIdx >= jamos.length) return;
    const curJamo   = jamos[jamoIdx];
    const strokeDef = (JAMO_STROKES[curJamo] || [])[strokeIdx];
    if (!strokeDef) { this._onError(); return; }

    let valid = false;

    if (strokeDef.a === 'circle') {
      const closeDist = Math.hypot(end.x - start.x, end.y - start.y);
      valid = closeDist < len * CIRCLE_CLOSE_RATIO && len > MIN_STROKE_LEN * 2;

    } else if (Array.isArray(strokeDef.a)) {
      // Compound stroke (L-shape, 7-shape, etc.): check start and end segment directions
      if (pts.length < 6 || len < MIN_STROKE_LEN * 1.5) { this._onError(); return; }
      const n = pts.length;
      const p1 = pts[Math.floor(n / 3)];
      const p2 = pts[Math.floor(2 * n / 3)];

      const dx1 = p1.x - start.x, dy1 = p1.y - start.y;
      const dx2 = end.x  - p2.x,  dy2 = end.y  - p2.y;
      const a1  = (Math.atan2(dy1, dx1) * 180 / Math.PI + 360) % 360;
      const a2  = (Math.atan2(dy2, dx2) * 180 / Math.PI + 360) % 360;

      const t = strokeDef.t ?? 55;
      let d1 = Math.abs(a1 - strokeDef.a[0]); if (d1 > 180) d1 = 360 - d1;
      let d2 = Math.abs(a2 - strokeDef.a[1]); if (d2 > 180) d2 = 360 - d2;

      // Require an actual bend (not a straight line that flukes both checks)
      let bend = Math.abs(a1 - a2); if (bend > 180) bend = 360 - bend;
      valid = d1 <= t && d2 <= t && bend >= 20;

    } else {
      // Simple directional stroke: check direction AND straightness
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const drawnAngle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const tolerance  = strokeDef.t ?? 55;
      let diff = Math.abs(drawnAngle - strokeDef.a);
      if (diff > 180) diff = 360 - diff;
      // Also reject if the stroke is too curvy (lots of direction changes or deviation)
      valid = diff <= tolerance && this._isStraightEnough(pts, len);
    }

    if (valid) this._onStrokeOk();
    else       this._onError();
  }

  // Strokes within the same jamo must be spatially close to each other.
  // The user can write anywhere on screen, but strokes of one jamo must cluster.
  _isNearExisting(pts) {
    if (!this.challenge) return true;
    const { jamoIdx, strokeIdx, completedPaths } = this.challenge;

    // First stroke of the very first jamo: no constraint
    if (jamoIdx === 0 && strokeIdx === 0) return true;

    // No completed strokes yet (shouldn't happen after the above guard, but be safe)
    if (completedPaths.length === 0) return true;

    const W    = parseFloat(this.strokeCanvas.style.width)  || this.strokeCanvas.width;
    const H    = parseFloat(this.strokeCanvas.style.height) || this.strokeCanvas.height;
    const size = Math.min(W * 0.55, H * 0.45, 280);

    // Choose reference paths and margin based on whether we're within same jamo or starting a new one
    let refPaths, margin;
    if (strokeIdx > 0) {
      // Same jamo: only look at strokes already drawn in this jamo
      refPaths = completedPaths.slice(-strokeIdx);
      // Wide margin for strokes that are spatially offset from the previous one:
      // ㅂ/ㅃ stroke 2 (parallel right vertical), ㅁ stroke 2 (L-shape right+down)
      const jamos = this.challenge.jamos;
      const curJamo = jamos[this.challenge.jamoIdx];
      const isWideStroke = ((curJamo === 'ㅂ' || curJamo === 'ㅃ') && strokeIdx === 1)
                        || (curJamo === 'ㅁ' && strokeIdx === 1);
      margin = size * (isWideStroke ? 0.56 : 0.28);
    } else {
      // First stroke of a new jamo: compare against all previous strokes
      refPaths = completedPaths;
      margin   = size * 0.45; // slightly looser - jamos in a compact syllable
    }

    // Compute bounding box of reference strokes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { pts: rpts } of refPaths) {
      for (const p of rpts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }

    // Expand bbox by margin
    minX -= margin; minY -= margin;
    maxX += margin; maxY += margin;

    // The centroid of the new stroke must fall within the expanded bbox
    let sumX = 0, sumY = 0;
    for (const p of pts) { sumX += p.x; sumY += p.y; }
    const cx = sumX / pts.length, cy = sumY / pts.length;
    return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
  }

  // Simple strokes should be mostly straight (no erratic zig-zags)
  _isStraightEnough(pts, precomputedLen) {
    if (pts.length < 4) return true;
    const start = pts[0], end = pts[pts.length - 1];
    const dx = end.x - start.x, dy = end.y - start.y;
    const len = precomputedLen ?? Math.hypot(dx, dy);
    if (len < 20) return true;
    // Max perpendicular deviation from the start→end line
    let maxDev = 0;
    for (const p of pts) {
      const dev = Math.abs(dy * p.x - dx * p.y + end.x * start.y - end.y * start.x) / len;
      maxDev = Math.max(maxDev, dev);
    }
    // Allow up to 18% of stroke length as deviation (tighter - rejects wavy strokes)
    return maxDev <= Math.max(12, 0.18 * len);
  }

  _onStrokeOk() {
    this.errors = 0;

    // Record the completed path so we can redraw it in green
    this.challenge.completedPaths.push({ pts: [...this.points] });

    // Redraw canvas: completed strokes in green, in-progress cleared
    this._clearStrokes();
    this._redrawCompletedStrokes();

    this.challenge.strokeIdx++;
    this.challenge.globalStrokeIdx++;

    const { jamos, jamoIdx } = this.challenge;
    const curJamo    = jamos[jamoIdx];
    const numStrokes = (JAMO_STROKES[curJamo] || []).length;

    if (this.challenge.strokeIdx >= numStrokes) {
      this._onJamoComplete();
    }
  }

  _onJamoComplete() {
    sfx('doStrokeOk', 0.75);
    const { jamos, jamoIdx } = this.challenge;
    const curJamo = jamos[jamoIdx];

    if (!this.stats.jamoProgress[curJamo]) this.stats.jamoProgress[curJamo] = { count: 0 };
    this.stats.jamoProgress[curJamo].count =
      Math.min(MAX_JAMO_COUNT, (this.stats.jamoProgress[curJamo].count || 0) + 1);

    // Stage transition detection
    const isFirstTime = !this.stats.seenJamos.includes(curJamo);
    const stageBefore = computeHangulStage(this.stats);
    if (isFirstTime) this.stats.seenJamos.push(curJamo);
    const stageAfter = computeHangulStage(this.stats);
    if (stageAfter > stageBefore) {
      this._announceStageUp(stageAfter);
    } else if (isFirstTime) {
      this._announce(i18n('dojang.jamoUnlocked').replace('{j}', curJamo));
    }

    saveDojangStats(this.stats);
    this._syncHUD();

    this.challenge.jamoIdx++;

    if (this.challenge.jamoIdx >= jamos.length) {
      this._onChallengeComplete();
    } else {
      this.challenge.strokeIdx = 0;
      this.errors = 0;
    }
  }

  _onChallengeComplete() {
    const { char, jamos } = this.challenge;

    // Track CV syllables (cho + jung only) for stage 2 unlock
    if (jamos.length === 2) {
      const stageBefore = computeHangulStage(this.stats);
      if (!this.stats.seenSyllables.includes(char)) this.stats.seenSyllables.push(char);
      const stageAfter = computeHangulStage(this.stats);
      if (stageAfter > stageBefore) this._announceStageUp(stageAfter);
    }

    this.flash = { type: 'ok', t: 0, dur: 0.4 };
    this.nextDelay = 0.55;
    this._clearStrokes();
    this.challenge.completedPaths = [];
  }

  _announceStageUp(newStage) {
    const msgs = {
      1: i18n('dojang.phaseUp2'),
      2: i18n('dojang.phaseUpCV'),
      3: i18n('dojang.phaseUp3'),
    };
    if (msgs[newStage]) this._announce(msgs[newStage]);
  }

  _onError() {
    this.flash = { type: 'err', t: 0, dur: 0.35 };

    // Clear the failed in-progress stroke, but keep completed strokes
    this._clearStrokes();
    this._redrawCompletedStrokes();

    // First stroke of the whole character: free retries, nothing to lose
    if (this.challenge.globalStrokeIdx === 0) {
      sfx('doMinorError', 0.3);
      return;
    }

    this.errors++;
    if (this.errors >= MAX_ERRORS) {
      sfx('doMajorError', 0.8);
      // Reset entire character - clear all ink and restart from first jamo
      this.errors = 0;
      this.challenge.jamoIdx   = 0;
      this.challenge.strokeIdx = 0;
      this.challenge.globalStrokeIdx = 0;
      this.challenge.completedPaths  = [];
      this._clearStrokes();
      this._announce(i18n('dojang.resetJamo'));
    } else {
      sfx('doMinorError', 0.3);
    }
  }

  // ── Stroke canvas helpers ─────────────────────────────────
  _clearStrokes() {
    const c = this.strokeCanvas;
    this.sCtx.clearRect(0, 0, c.width, c.height);
    this.points  = [];
    this.lastPt  = null;
    this.drawing = false;
    this.sCtx.beginPath();
  }

  _redrawCompletedStrokes() {
    const ctx = this.sCtx;
    const lw  = Math.max(3, Math.min(this.strokeCanvas.width * 0.006, 7));
    (this.challenge?.completedPaths || []).forEach(({ pts }) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = 'rgba(80,220,120,0.85)';
      ctx.lineWidth   = lw;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();
    });
  }

  // ── Challenge generation ──────────────────────────────────
  _nextChallenge() {
    this._clearStrokes();
    this.errors = 0;

    // Check if words/complex syllables should occasionally appear
    const jp = this.stats.jamoProgress || {};
    const globalPct = PHASE1_JAMOS.reduce((s, j) => s + (jp[j]?.count || 0), 0)
                      / (PHASE1_JAMOS.length * MAX_JAMO_COUNT);
    const wordsUnlocked = globalPct >= WORDS_UNLOCK_PCT;

    const lastChar = this.challenge?.char ?? null;
    let char;
    let attempts = 0;
    do {
      const rnd = Math.random();
      if (wordsUnlocked && rnd < 0.05) {
        // 5% chance: complex syllable
        char = COMPLEX_SYLLABLES[Math.floor(Math.random() * COMPLEX_SYLLABLES.length)];
      } else if (wordsUnlocked && rnd < 0.15) {
        // 10% chance: word from dictionary
        const entry = WORD_DICT[Math.floor(Math.random() * Math.min(WORD_DICT.length, 300))];
        char = entry.text[0];
      } else {
        char = pickNextChallenge(this.stats);
      }
      attempts++;
    } while (char === lastChar && attempts < 5);

    const jamos = syllableToJamos(char);
    const totalStrokes = jamos.reduce((sum, j) => sum + (JAMO_STROKES[j]?.length || 0), 0);
    this.challenge = {
      char,
      jamos,
      jamoIdx: 0,
      strokeIdx: 0,
      totalStrokes,
      globalStrokeIdx: 0,
      completedPaths: [],
    };
    this._speakText(char);
  }

  // Restart current character from the beginning (bound to ♻️ button)
  restartChallenge() {
    if (!this.challenge) return;
    this.challenge.jamoIdx = 0;
    this.challenge.strokeIdx = 0;
    this.challenge.globalStrokeIdx = 0;
    this.challenge.completedPaths = [];
    this.errors = 0;
    this._clearStrokes();
  }

  // Re-speak the current character (bound to 🔊 button) - always interrupts
  speakCurrent() {
    if (!this.challenge) return;
    this._speakText(this.challenge.char, true);
  }

  // ── TTS ───────────────────────────────────────────────────
  // immediate=true: cancel current and speak now (user button)
  // immediate=false (default): wait for current to finish, then speak
  _speakText(text, immediate = false) {
    if (!G.ttsEnabled || !text || typeof speechSynthesis === 'undefined') return;
    if (immediate) {
      speechSynthesis.cancel();
      this._pendingSpeak = null;
    } else if (speechSynthesis.speaking) {
      this._pendingSpeak = text;
      return;
    }
    this._pendingSpeak = null;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.8;
    u.onend = () => {
      if (this._pendingSpeak) {
        const next = this._pendingSpeak;
        this._pendingSpeak = null;
        this._speakText(next);
      }
    };
    speechSynthesis.speak(u);
  }

  // ── HUD sync ──────────────────────────────────────────────
  _syncHUD() {
    const jp = this.stats.jamoProgress || {};
    const totalCount  = PHASE1_JAMOS.reduce((s, j) => s + (jp[j]?.count || 0), 0);
    const totalMax    = PHASE1_JAMOS.length * MAX_JAMO_COUNT;
    const globalPct   = Math.min(100, Math.round(totalCount / totalMax * 100));
    const stage       = computeHangulStage(this.stats);

    const el = document.getElementById('dojang-threshold');
    if (el) el.textContent = `${globalPct}%`;

    const ring = document.getElementById('dojang-ring-fg');
    if (ring) {
      const circumference = 2 * Math.PI * 22;
      ring.style.strokeDashoffset = String(circumference * (1 - globalPct / 100));
    }
    const phaseEl = document.getElementById('dojang-phase-label');
    if (phaseEl) {
      const stageLabels = ['phase1','phase2','phaseCV','phase3','phase4'];
      phaseEl.textContent = i18n(`dojang.${stageLabels[Math.min(stage, 4)] || 'phase4'}`);
    }
  }

  // ── Announce ──────────────────────────────────────────────
  _announce(msg) {
    const el = document.getElementById('dojang-announce');
    if (!el) return;
    el.textContent = msg;
    // Reset transition so re-triggering mid-display works cleanly
    el.classList.remove('on');
    void el.offsetWidth; // force reflow to restart transition
    el.classList.add('on');
    clearTimeout(this._announceTimer);
    this._announceTimer = setTimeout(() => el.classList.remove('on'), 2500);
  }

  // ── Pause ─────────────────────────────────────────────────
  togglePause() {
    this.paused = !this.paused;
    this._showPauseMenu(this.paused);
    if (this.paused) this._clearStrokes();
  }

  _showPauseMenu(show) {
    const el = document.getElementById('dojang-pause-overlay');
    if (el) el.classList.toggle('off', !show);
    const advBtn = document.getElementById('dojang-btn-adventure');
    if (advBtn) {
      const stage = computeHangulStage(this.stats || {});
      advBtn.classList.toggle('off', stage < 2);
    }
  }

  // ── Book ──────────────────────────────────────────────────
  openBook() {
    this.bookOpen = true;
    this._showBook(true);
    this._renderBook();
  }

  closeBook() {
    this.bookOpen = false;
    this._showBook(false);
  }

  _showBook(show) {
    const el = document.getElementById('dojang-book-modal');
    if (el) el.classList.toggle('off', !show);
  }

  _renderBook() {
    const body = document.getElementById('dojang-book-body');
    if (!body) return;

    const jp      = this.stats.jamoProgress || {};
    const stage   = computeHangulStage(this.stats);
    const jp_tot  = PHASE1_JAMOS.reduce((s, j) => s + (jp[j]?.count || 0), 0);
    const totalMax = PHASE1_JAMOS.length * MAX_JAMO_COUNT;
    const globalPct = Math.round(jp_tot / totalMax * 100);

    const isMastered = PHASE1_JAMOS.every(j => (jp[j]?.count || 0) >= MAX_JAMO_COUNT);
    const stageLabels = [
      i18n('dojang.phase1'), i18n('dojang.phase2'),
      i18n('dojang.phaseCV'), i18n('dojang.phase3'), i18n('dojang.phase4'),
    ];
    const phaseLabel = isMastered ? i18n('dojang.masterTitle') : (stageLabels[stage] || stageLabels[3]);

    const countTip   = i18n('dojang.timesWritten');
    const strokesTip = i18n('dojang.strokeCountTip');

    const rows = PHASE1_JAMOS.map(j => {
      const count   = jp[j]?.count || 0;
      const strokes = (JAMO_STROKES[j] || []).length;
      const bar     = Math.min(100, Math.round(count / MAX_JAMO_COUNT * 100));
      const info    = JAMO_INFO[j];
      const hasDesc = count >= 1;

      let descHtml = '';
      if (hasDesc) {
        const baseText = i18n(`jamo_desc.${j}.base`);
        const showBatchim = count >= BATCHIM_UNLOCK_COUNT && JAMO_HAS_BATCHIM.has(j);
        const batchimText = showBatchim ? i18n(`jamo_desc.${j}.batchim`) : '';
        const fullMd = baseText + (batchimText ? `\n\n**받침:** ${batchimText}` : '');
        descHtml = parseLessonMarkdown(fullMd);
      }

      return `<div class="dj-book-row${hasDesc ? ' has-desc' : ''}">
        <div class="dj-book-row-main">
          <span class="dj-book-jamo">${j}</span>
          <span class="dj-book-name">${info?.name || ''}</span>
          <span class="dj-book-rom">${info?.rom || ''}</span>
          <div class="dj-book-bar-wrap"><div class="dj-book-bar" style="width:${bar}%"></div></div>
          <span class="dj-book-count" data-tooltip="${countTip}">${count}</span>
          <span class="dj-book-strokes" data-tooltip="${strokesTip}">${strokes}획</span>
          ${hasDesc ? '<button class="dj-book-expand-btn">▼</button>' : '<span></span>'}
        </div>
        ${hasDesc ? `<div class="dj-book-desc off">${descHtml}</div>` : ''}
      </div>`;
    }).join('');

    body.innerHTML = `
      <div class="dj-book-header">
        <div class="dj-book-stat">
          <span class="dj-book-stat-val">${globalPct}%</span>
          <span class="dj-book-stat-lbl">${i18n('dojang.globalProgress')}</span>
        </div>
        <div class="dj-book-stat">
          <span class="dj-book-stat-val">${isMastered ? '✪' : (stage + 1)}</span>
          <span class="dj-book-stat-lbl">${phaseLabel}</span>
        </div>
      </div>
      <div class="dj-book-list">${rows}</div>
    `;

    body.querySelectorAll('.dj-book-row.has-desc').forEach(row => {
      const main = row.querySelector('.dj-book-row-main');
      const desc = row.querySelector('.dj-book-desc');
      if (!main || !desc) return;
      main.style.cursor = 'pointer';
      main.addEventListener('click', () => {
        const open = !row.classList.contains('expanded');
        row.classList.toggle('expanded', open);
        desc.classList.toggle('off', !open);
      });
    });
  }

  // ── Stroke Inspector ──────────────────────────────────────
  openInspector() {
    if (!this.challenge) return;
    this.inspectorOpen = true;
    this._showInspector(true);
    this._renderInspector(0);
  }

  closeInspector() {
    this.inspectorOpen = false;
    this._showInspector(false);
  }

  _showInspector(show) {
    const el = document.getElementById('dojang-inspector-modal');
    if (el) el.classList.toggle('off', !show);
  }

  _renderInspector(jamoPageIdx) {
    const body = document.getElementById('dojang-inspector-body');
    const nav  = document.getElementById('dojang-inspector-nav');
    if (!body || !this.challenge) return;

    const { jamos, jamoIdx: currentJamoIdx } = this.challenge;

    // Jamo card
    const j       = jamos[jamoPageIdx];
    const strokes = JAMO_STROKES[j] || [];
    const info    = JAMO_INFO[j];

    const strokeRows = strokes.map((s, i) => {
      const arrow = strokeAngleToArrow(s.a);
      return `<div class="dj-insp-stroke-row">
        <span class="dj-insp-num">&#${9311 + i + 1};</span>
        <span class="dj-insp-arrow">${arrow}</span>
      </div>`;
    }).join('');

    body.innerHTML = `
      <div class="dj-insp-card">
        <div class="dj-insp-char">${j}</div>
        <div class="dj-insp-name">${info?.name || ''} · ${info?.rom || ''}</div>
        <div class="dj-insp-strokes">${strokeRows}</div>
      </div>
    `;

    // Navigation dots (if multiple jamos)
    if (jamos.length > 1) {
      nav.innerHTML = jamos.map((_, i) => {
        const active = i === jamoPageIdx ? ' dj-insp-dot-active' : '';
        const cur    = i === currentJamoIdx ? ' dj-insp-dot-current' : '';
        return `<button class="dj-insp-dot${active}${cur}" data-idx="${i}">${jamos[i]}</button>`;
      }).join('');
      nav.querySelectorAll('.dj-insp-dot').forEach(btn => {
        btn.addEventListener('click', () => this._renderInspector(Number(btn.dataset.idx)));
      });
    } else {
      nav.innerHTML = '';
    }
  }

  // ── Stroke canvas resize ──────────────────────────────────
  resizeStrokeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const c   = this.strokeCanvas;
    const w   = Math.floor(window.innerWidth);
    const h   = Math.floor(G.vH || window.innerHeight);
    if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) {
      c.width        = Math.floor(w * dpr);
      c.height       = Math.floor(h * dpr);
      c.style.width  = w + 'px';
      c.style.height = h + 'px';
      this.sCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._clearStrokes();
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────
export const dojangManager = new DojangManager();
