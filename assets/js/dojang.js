/* ================================================================
   HANGUL DOJANG - Main Module
   Drawing practice system for learning hangul stroke order.
================================================================ */
import { G } from './state.js';
import {
  JAMO_STROKES, JAMO_INFO, JAMO_HAS_BATCHIM, PHASE1_JAMOS, DOJANG_BOOK_ORDER,
  INTRO_JAMOS, EXTRA_JAMOS, MAX_JAMO_COUNT, BATCHIM_UNLOCK_COUNT, WORDS_UNLOCK_PCT,
  ALL_CV_SYLLABLES, ALL_CVC_SYLLABLES, COMPLEX_SYLLABLES,
  syllableToJamos, computeHangulStage, pickNextChallenge,
} from '../data/dojang-data.js';
import { WORD_DICT } from '../data/words.js';
import { get as i18n } from './i18n.js';
import { parseLessonMarkdown, jamoFontPreview } from './hud.js';
import { play as sfx, getVolume } from './sfx.js';

const STORAGE_KEY = 'krr_dojang';
const BASE_ERRORS = 3;     // base error allowance; +1 per 4 jamos in the challenge
function _maxErrors(jamoCount) { return BASE_ERRORS + Math.floor(jamoCount / 4); }
const MIN_STROKE_LEN = 10; // minimum stroke px to count (avoids taps)
const CIRCLE_CLOSE_RATIO = 0.45; // end/start dist must be < ratio * total length

// First stroke of each double consonant's second copy (used for L→R ordering check)
const DOUBLE_CONS_HALF = { 'ㄲ': 1, 'ㄸ': 2, 'ㅃ': 4, 'ㅆ': 2, 'ㅉ': 2 };

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
      if (!Array.isArray(s.seenJamos))            s.seenJamos = [];
      if (!Array.isArray(s.seenSyllables))        s.seenSyllables = [];
      if (!Array.isArray(s.seenBatchimSyllables)) s.seenBatchimSyllables = [];
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
    seenJamos: [],             // jamos successfully completed at least once
    seenSyllables: [],         // CV syllables (no batchim) completed at least once
    seenBatchimSyllables: [],  // CVC syllables (simple batchim) completed at least once
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

// ── Animated stroke direction indicator ──────────────────────
// Draws an animated mini-stroke on canvas showing direction.
// cx/cy = center, R = radius of motion, t = animation progress 0..1
function _drawStrokeAnim(ctx, cx, cy, R, angle, t) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (angle === 'circle') {
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.8, -Math.PI / 2, -Math.PI / 2 - t * Math.PI * 2, true);
    ctx.stroke();
    return;
  }

  const rad = a => (a * Math.PI) / 180;

  if (!Array.isArray(angle)) {
    const dx = Math.cos(rad(angle)), dy = Math.sin(rad(angle));
    const sx = cx - dx * R, sy = cy - dy * R;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + t * dx * R * 2, sy + t * dy * R * 2);
    ctx.stroke();
  } else {
    // Two-segment compound stroke; each segment gets half the time
    const [a1, a2] = angle;
    const dx1 = Math.cos(rad(a1)), dy1 = Math.sin(rad(a1));
    const dx2 = Math.cos(rad(a2)), dy2 = Math.sin(rad(a2));
    // Start offset so the full L fits nicely centred
    const sx = cx - dx1 * R * 0.6, sy = cy - dy1 * R * 0.6;
    const mx = sx + dx1 * R * 1.1, my = sy + dy1 * R * 1.1;
    const ex = mx + dx2 * R * 0.9, ey = my + dy2 * R * 0.9;

    if (t < 0.5) {
      const t1 = t * 2;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx + t1 * (mx - sx), sy + t1 * (my - sy));
      ctx.stroke();
    } else {
      const t2 = (t - 0.5) * 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, my); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my);
      ctx.lineTo(mx + t2 * (ex - mx), my + t2 * (ey - my));
      ctx.stroke();
    }
  }
}

// Returns an animated inline SVG string for the dojang inspector.
function _makeStrokeAnimSVG(angle) {
  const S = 25; // viewBox size (1.25× larger than before)
  const c = S / 2, R = S * 0.36, dur = '3.2s', sw = '2.4';
  const rad = a => (a * Math.PI) / 180;

  // easeInExpo draw (0→68.75% = 2.2s), then hold fully drawn (68.75%→100% = 1s)
  const animAttr = (L) =>
    `values="${L};0;0" keyTimes="0;0.6875;1" calcMode="spline" keySplines="0.12 0 0.39 0;0 0 1 1" dur="${dur}" repeatCount="indefinite"`;

  if (angle === 'circle') {
    const r   = (R * 0.8).toFixed(2);
    const top = (c - R * 0.8).toFixed(2);
    const bot = (c + R * 0.8).toFixed(2);
    const pathD = `M ${c},${top} A ${r},${r},0,0,0,${c},${bot} A ${r},${r},0,0,0,${c},${top}`;
    const circ = (2 * Math.PI * R * 0.8).toFixed(1);
    return `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" aria-hidden="true">
      <path d="${pathD}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round"
        stroke-dasharray="${circ}" stroke-dashoffset="${circ}">
        <animate attributeName="stroke-dashoffset" ${animAttr(circ)}/>
      </path></svg>`;
  }

  if (!Array.isArray(angle)) {
    const dx = Math.cos(rad(angle)), dy = Math.sin(rad(angle));
    const x1 = (c - dx * R).toFixed(2), y1 = (c - dy * R).toFixed(2);
    const x2 = (c + dx * R).toFixed(2), y2 = (c + dy * R).toFixed(2);
    const L = (R * 2).toFixed(2);
    return `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" aria-hidden="true">
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round"
        stroke-dasharray="${L}" stroke-dashoffset="${L}">
        <animate attributeName="stroke-dashoffset" ${animAttr(L)}/>
      </line></svg>`;
  }

  // Compound stroke
  const [a1, a2] = angle;
  const dx1 = Math.cos(rad(a1)), dy1 = Math.sin(rad(a1));
  const dx2 = Math.cos(rad(a2)), dy2 = Math.sin(rad(a2));
  const sx = (c - dx1 * R * 0.6).toFixed(2), sy = (c - dy1 * R * 0.6).toFixed(2);
  const mx = (c - dx1 * R * 0.6 + dx1 * R * 1.1).toFixed(2);
  const my = (c - dy1 * R * 0.6 + dy1 * R * 1.1).toFixed(2);
  const ex = (parseFloat(mx) + dx2 * R * 0.9).toFixed(2);
  const ey = (parseFloat(my) + dy2 * R * 0.9).toFixed(2);
  const L1 = (R * 1.1).toFixed(2), L2 = (R * 0.9).toFixed(2);
  const totalL = (parseFloat(L1) + parseFloat(L2)).toFixed(2);
  return `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" aria-hidden="true">
    <polyline points="${sx},${sy} ${mx},${my} ${ex},${ey}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"
      stroke-dasharray="${totalL}" stroke-dashoffset="${totalL}">
      <animate attributeName="stroke-dashoffset" ${animAttr(totalL)}/>
    </polyline></svg>`;
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
    this._totalErrors   = 0; // cumulative errors this session (never resets mid-challenge)
    this._firstStrokeErrors = 0; // consecutive errors on the very first stroke (for early inspector)
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
    // Velocity tracking for speed-based stroke width
    this._lastMoveTime  = null;
    this._currentWidth  = null; // EMA-smoothed width for continuity
    this._poolR         = 0;    // current ink-pool radius (grows when stationary)
    // Idle tracking for hint blinks
    this._idleStart     = performance.now(); // reset on every stroke end / challenge start
    // Dev cheat state
    this._cheat           = { ghostMode: 'auto', drawMode: false };
    this._restartTapCount = 0;
    // Callbacks set by game.js
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
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
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
    // Auto-open inspector: 10 errors OR 15s idle — disabled above 50% progress
    const _leafOpen = !document.getElementById('dojang-leaf-modal')?.classList.contains('off');
    if (this.challenge && !this.drawing && !this.inspectorOpen && !_leafOpen) {
      const jp2 = this.stats.jamoProgress || {};
      const _pct01 = PHASE1_JAMOS.reduce((s, j) => s + (jp2[j]?.count || 0), 0)
                   / (PHASE1_JAMOS.length * MAX_JAMO_COUNT);
      if (_pct01 < 0.50) {
        const idleMs = performance.now() - (this._idleStart ?? 0);
        if (this._totalErrors >= 10 || idleMs >= 15000) {
          this._totalErrors = 0;
          this.openInspector();
        }
      }
    }
    // Ink pooling: when held stationary, grow a dot at the cursor position
    if (this.drawing && this.lastPt && this._lastMoveTime !== null) {
      const idle = performance.now() - this._lastMoveTime;
      if (idle > 80) {
        const baseR  = (this._currentWidth ?? 9) / 2;
        const maxExtra = 10;
        const progress = Math.min(1, (idle - 80) / 800);
        const targetR = baseR + maxExtra * progress;
        this._poolR = targetR;
        const { x, y } = this.lastPt;
        this.sCtx.beginPath();
        this.sCtx.arc(x, y, this._poolR, 0, Math.PI * 2);
        this.sCtx.fillStyle = '#333333';
        this.sCtx.fill();
      }
    }
  }

  // Draw onto the main gc canvas (background + ghost guide)
  draw(ctx) {
    const W = G.W, H = G.vH || G.H;

    // ── Background ────────────────────────────────────────
    const grad = ctx.createRadialGradient(0, 0, 0, W * 0.35, H * 0.35, Math.max(W, H) * 0.9);
    grad.addColorStop(0, 'hsla(48,68%,94%,1)');
    grad.addColorStop(0.5, 'hsla(46,52%,90%,1)');
    grad.addColorStop(1, 'hsla(44,38%,86%,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const cx      = W / 2;
    const isMob   = H < 600;
    const cy      = isMob ? H * 0.44 : H * 0.42;
    const size    = isMob
      ? Math.min(W * 0.50, H * 0.42, 230)
      : Math.min(W * 0.55, H * 0.45, 280);

    // Grid centered on ghost character (half-char-height grid cells)
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
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
    // Stage 0/1: show current jamo; words: show full word; stage 2+: show current syllable
    const ghostChar = (stage <= 1 && jamoIdx < jamos.length)
      ? jamos[jamoIdx]
      : (this.challenge.word ?? this.challenge.char);

    const _cheatOpen  = !!document.getElementById('dojang-cheat-menu');
    const _idleMs    = _cheatOpen ? 0 : performance.now() - (this._idleStart ?? 0);
    const _noStroke  = (this.challenge?.globalStrokeIdx ?? 0) === 0;
    const _blinkGhost = _idleMs > 3000 && !this.drawing && _noStroke;
    const _blinkBox   = _idleMs > 5000 && !this.drawing;
    const _blinkWave  = t => 0.5 + 0.5 * Math.sin(t * Math.PI * 2);

    // Ghost visibility fades from 10% → 15% global progress, then gone at rest
    const jp = this.stats.jamoProgress || {};
    const _globalPct01 = PHASE1_JAMOS.reduce((s, j) => s + (jp[j]?.count || 0), 0)
                       / (PHASE1_JAMOS.length * MAX_JAMO_COUNT);
    let ghostVis = _globalPct01 < 0.10 ? 1.0
                 : _globalPct01 < 0.15 ? 1 - (_globalPct01 - 0.10) / 0.05
                 : 0.0;
    if (this._cheat.ghostMode === 'show') ghostVis = 1.0;
    if (this._cheat.ghostMode === 'hide') ghostVis = 0.0;

    // Hint ghost: above 15%, reappear pulsing after 10s idle to show what to write
    const _hintGhost = ghostVis === 0
      && this._cheat.ghostMode !== 'hide'
      && _idleMs > 10000 && !this.drawing && _noStroke;

    if (ghostVis > 0 || _hintGhost) {
      let ghostAlpha;
      if (_hintGhost) {
        // Pulse from 0 → 0.10 → 0, period ~2.5s, brighter than rest ghost
        ghostAlpha = 0.10 * _blinkWave(performance.now() / 2500);
      } else {
        // Normal: fixed 0.07, slow pulse downward when idle
        ghostAlpha = (_blinkGhost
          ? 0.07 * (0.15 + 0.85 * _blinkWave(performance.now() / 3000))
          : 0.07) * ghostVis;
      }
      ctx.save();
      ctx.globalAlpha = ghostAlpha;
      ctx.fillStyle  = '#333333';
      ctx.font = `bold ${size}px "Nanum Myeongjo", "Song Myung", serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ghostChar, cx, cy);
      ctx.restore();
    }

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
    this._drawStrokeGuide(ctx, W, H, _blinkBox, _blinkWave);
    this._drawHUDCanvas(ctx, W, H);
  }

  // ── Stroke guide: numbered directional arrows ─────────────
  _drawStrokeGuide(ctx, W, H, blinkBox = false, blinkWave = null) {
    if (!this.challenge || this.nextDelay > 0) return;
    const { jamos, jamoIdx, strokeIdx } = this.challenge;
    if (jamoIdx >= jamos.length) return;
    const curJamo = jamos[jamoIdx];
    const strokes = JAMO_STROKES[curJamo] || [];
    if (strokes.length === 0) return;

    // Compute global progress to gate error-scaling feature
    const _jp = this.stats?.jamoProgress || {};
    const _globalPct = PHASE1_JAMOS.reduce((s, j) => s + (_jp[j]?.count || 0), 0)
                     / (PHASE1_JAMOS.length * MAX_JAMO_COUNT);

    const isMob   = H < 600;
    const guideY  = isMob ? H * 0.84 : H * 0.70;
    const maxItemW = isMob ? 46 : 62;
    const itemW   = Math.max(28, Math.min(maxItemW, (W * 0.60) / Math.max(strokes.length, 1)));
    const totalW  = strokes.length * itemW;
    const startX  = W / 2 - totalW / 2 + itemW / 2;
    const rNum    = Math.max(8, H * 0.016);

    // easeInExpo draw for 2.2s, then hold fully drawn for 1s
    const ANIM_DUR = 3200;
    const DRAW_FRAC = 2200 / 3200;
    const t_raw = (performance.now() % ANIM_DUR) / ANIM_DUR;
    const t_draw = t_raw <= DRAW_FRAC ? t_raw / DRAW_FRAC : 1.0;
    const t_eased = t_draw === 0 ? 0 : Math.pow(2, 10 * (t_draw - 1));

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    strokes.forEach((stroke, i) => {
      const x = startX + i * itemW;
      const isCompleted = i < strokeIdx;
      const isCurrent   = i === strokeIdx;
      if (isCompleted) return;

      // Error-grow: scale up current box when player has made ≥1 error and is early
      const errScale = (isCurrent && _globalPct < 0.10 && this.errors > 0)
        ? 1 + Math.min(this.errors * 0.10, 0.30)
        : 1.0;

      const sqW_base = itemW * 0.82;
      const sqW = sqW_base * errScale;
      const sqX = x - sqW / 2;

      // Box height: animation area (top) + number area (bottom)
      const animH = rNum * 2.8 * errScale;
      const numH  = rNum * 1.8 * errScale;
      const sqPad = rNum * 0.7 * errScale;
      const sqH   = animH + numH + sqPad * 2;
      const sqTop = guideY - sqH;

      const animCenterY = sqTop + sqPad + animH * 0.5;
      const numY        = sqTop + sqPad + animH + numH * 0.5;

      // Background box
      ctx.globalAlpha = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(sqX, sqTop, sqW, sqH, 7 * errScale);
      else ctx.rect(sqX, sqTop, sqW, sqH);

      if (isCurrent) {
        const ba = blinkBox && blinkWave ? 0.2 + 0.8 * blinkWave(performance.now() / 1000 + 0.25) : 1;
        ctx.globalAlpha = ba;
        ctx.fillStyle = this.errors > 0 && _globalPct < 0.10
          ? 'rgba(80,220,120,0.26)' : 'rgba(80,220,120,0.18)';
        ctx.fill();
        ctx.strokeStyle = this.errors > 0 && _globalPct < 0.10
          ? 'rgba(50,170,90,0.95)' : 'rgba(50,170,90,0.7)';
        ctx.lineWidth = (1.8 + this.errors * 0.3) * errScale;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = 'rgba(100,100,100,0.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,100,100,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Animation arrow (top of box)
      const animR = Math.max(5, Math.min(rNum * 1.4, sqW * 0.28)) * errScale;
      const baseW = isCurrent ? 3.2 : 2.0;
      ctx.lineWidth = baseW * (1.8 - 0.9 * t_eased);
      if (isCurrent) ctx.strokeStyle = 'rgba(20,100,50,1)';
      else           ctx.strokeStyle = 'rgba(80,80,80,0.55)';
      _drawStrokeAnim(ctx, x, animCenterY, animR, stroke.a, t_eased);

      // Stroke number (bottom of box)
      ctx.font = `bold ${Math.round(rNum * 1.0 * errScale)}px "Pretendard Variable", sans-serif`;
      ctx.fillStyle = isCurrent ? 'rgba(20,100,50,1)' : 'rgba(80,80,80,0.55)';
      ctx.fillText(String(i + 1), x, numY);
    });
    ctx.restore();
  }

  _drawHUDCanvas(ctx, W, H) {
    if (!this.challenge) return;
    const { jamos, jamoIdx, totalStrokes, globalStrokeIdx } = this.challenge;

    const isMob = H < 600;
    // Mobile layout constants (push UI elements toward edges for more drawing room)
    const mobInstrY = H * 0.920;
    const mobDotY   = H * 0.963;
    const mobLabelY = H * 0.08;
    // Guard against out-of-bounds after challenge complete (during nextDelay)
    if (jamoIdx >= jamos.length) {
      // Show all dots green
      const dotY   = isMob ? mobDotY : H * 0.828;
      const dotR   = H * 0.009;
      const dotGap = dotR * 3.5;
      const startX = W / 2 - (totalStrokes - 1) * dotGap / 2;
      for (let i = 0; i < totalStrokes; i++) {
        ctx.beginPath();
        ctx.arc(startX + i * dotGap, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(50,170,90,0.9)';
        ctx.fill();
      }
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(30,140,70,0.9)';
      ctx.font = `bold ${Math.round(isMob ? Math.max(15, H * 0.032) : H * 0.026)}px "EZRA Serif", "Song Myung", serif`;
      ctx.fillText(i18n('dojang.great'), W / 2, isMob ? mobInstrY : H * 0.80);
      ctx.restore();
      return;
    }

    const curJamo   = jamos[jamoIdx];
    const info      = JAMO_INFO[curJamo];

    // Bottom instruction text
    const instrY = isMob ? mobInstrY : H * 0.80;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this.errors >= _maxErrors(jamos.length) - 1 && this.challenge.globalStrokeIdx > 0) {
      ctx.fillStyle = 'rgba(200,80,20,0.9)';
      ctx.font = `bold ${Math.round(isMob ? Math.max(15, H * 0.032) : Math.max(13, H * 0.026))}px "EZRA Serif", "Song Myung", serif`;
      ctx.fillText(i18n('dojang.lastTry'), W / 2, instrY);
    } else {
      ctx.fillStyle = 'rgba(50,40,30,0.70)';
      ctx.font = `${Math.round(isMob ? Math.max(14, H * 0.030) : Math.max(12, H * 0.024))}px "EZRA Serif", "Song Myung", serif`;
      const stage = computeHangulStage(this.stats);
      let msg;
      if (stage <= 1) {
        msg = i18n('dojang.drawJamo').replace('{j}', curJamo);
      } else {
        msg = i18n('dojang.drawSyllable').replace('{s}', this.challenge.word ?? this.challenge.char).replace('{j}', curJamo);
      }
      ctx.fillText(msg, W / 2, instrY);
    }

    // Stroke counter dots - sliding window of max 10, centered on current stroke
    const MAX_DOTS  = 10;
    const dotY      = isMob ? mobDotY : H * 0.856;
    const dotR      = H * 0.009;
    const dotGap    = dotR * 3.5;
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
        ctx.fillStyle = 'rgba(50,170,90,0.9)';    // completed
      } else if (i === globalStrokeIdx) {
        ctx.fillStyle = 'rgba(40,40,40,0.85)';  // current
      } else {
        ctx.fillStyle = 'rgba(100,100,100,0.25)'; // upcoming
      }
      ctx.fill();
    }

    // Jamo name label above ghost area
    if (info) {
      const sz = Math.round(isMob ? Math.max(14, H * 0.028) : Math.max(12, H * 0.022));
      ctx.font = `${sz}px "Nanum Myeongjo", "Song Myung", serif`;
      ctx.fillStyle = 'rgba(60,45,30,0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${curJamo}ㅤ(${info.name})ㅤ·ㅤ${info.rom}`, W / 2, isMob ? mobLabelY : H * 0.15);
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

    // Click-outside to close book / inspector
    const bookBackdrop = document.getElementById('dojang-book-modal');
    if (bookBackdrop) {
      bookBackdrop.addEventListener('mousedown', (e) => {
        if (this.bookOpen && e.target === bookBackdrop) this.closeBook();
      });
    }
    const inspBackdrop = document.getElementById('dojang-inspector-modal');
    if (inspBackdrop) {
      inspBackdrop.addEventListener('mousedown', (e) => {
        if (this.inspectorOpen && e.target === inspBackdrop) this.closeInspector();
      });
    }

    // ESC: close modals in priority order, or open pause
    this._keyHandler = (e) => {
      if (!document.body.classList.contains('phase-dojang') || e.key !== 'Escape') return;
      const cheatMenu = document.getElementById('dojang-cheat-menu');
      if (cheatMenu) { cheatMenu.remove(); this._idleStart = performance.now(); return; }
      if (this.bookOpen)      { this.closeBook();      return; }
      if (this.inspectorOpen) { this.closeInspector(); return; }
      this.togglePause(); // opens if closed, closes if open
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  _startStroke(x, y) {
    this._restartTapCount = 0; // any drawn stroke resets cheat counter
    this.drawing = true;
    this.points  = [{ x, y }];
    this.lastPt  = { x, y };
    this._lastMoveTime = performance.now();
    this._idleStart    = performance.now();
    this._currentWidth = null;
    this._poolR = 0;
    this.sCtx.beginPath();
    this.sCtx.moveTo(x, y);
  }

  _moveStroke(x, y) {
    // Speed-based stroke width: slow = thick (ink pooling), fast = thin
    const now = performance.now();
    let speed = 0;
    if (this._lastMoveTime !== null && this.lastPt) {
      const dt = Math.max(1, now - this._lastMoveTime);
      speed = Math.hypot(x - this.lastPt.x, y - this.lastPt.y) / dt;
    }
    this._lastMoveTime = now;
    // If exiting a pool (first move after stationary), start line at pool diameter
    // so the stroke tapers naturally from the blob size down to normal width.
    if (this._poolR > 0) {
      this.points[0].w = this._poolR * 2; // record pool size on the start point for replay
      this._currentWidth = this._poolR * 2;
    }
    this._poolR = 0;
    const isMob = window.innerHeight < 600;
    const minW = isMob ? 4 : 5, maxW = isMob ? 14 : 20;
    const targetW = maxW - (maxW - minW) * Math.min(1, speed / 1.0);
    // EMA smoothing: prevents sudden width jumps that create visible dots
    this._currentWidth = this._currentWidth
      ? this._currentWidth * 0.65 + targetW * 0.35
      : targetW;
    const lw = this._currentWidth;

    this.points.push({ x, y, w: lw }); // store width per point for authentic replay

    // Draw segment
    this.sCtx.beginPath();
    this.sCtx.moveTo(this.lastPt.x, this.lastPt.y);
    this.sCtx.lineTo(x, y);
    this.sCtx.strokeStyle = '#333333';
    this.sCtx.lineWidth   = lw;
    this.sCtx.lineCap  = 'round';
    this.sCtx.lineJoin = 'round';
    this.sCtx.stroke();
    // Fill a circle at the endpoint to bridge width transitions between segments
    this.sCtx.beginPath();
    this.sCtx.arc(x, y, lw / 2, 0, Math.PI * 2);
    this.sCtx.fillStyle = '#333333';
    this.sCtx.fill();

    this.sCtx.beginPath();
    this.sCtx.moveTo(x, y);
    this.lastPt = { x, y };
  }

  _endStroke(x, y) {
    this.drawing = false;
    // If released while still pooling, commit the blob to the END of the path
    if (this._poolR > 0) {
      const lastIdx = this.points.length - 1;
      if (lastIdx >= 0) this.points[lastIdx].poolEnd = this._poolR;
      this._currentWidth = this._poolR * 2;
      this._poolR = 0;
    }
    if (x !== this.lastPt?.x || y !== this.lastPt?.y) {
      this._moveStroke(x, y);
    }
    this._validateStroke();
  }

  // ── Stroke validation ──────────────────────────────────────
  _validateStroke() {
    const pts = this.points;
    if (pts.length < 2) { this._onError(); return; }

    // Draw mode: accept any stroke that meets minimum length
    if (this._cheat.drawMode) {
      const len = pts.reduce((acc, p, i) => i === 0 ? 0 : acc + Math.hypot(p.x - pts[i-1].x, p.y - pts[i-1].y), 0);
      if (len >= MIN_STROKE_LEN) { this._onStrokeOk(); return; }
    }

    // Proximity check: strokes within a jamo must be drawn near each other
    if (!this._isNearExisting(pts)) { this._onError(); return; }

    // Multi-syllable word: first stroke of each new syllable must start to the RIGHT
    // of the rightmost point of all completed strokes (enforces left-to-right writing order).
    {
      const cb = this.challenge.charBoundaries;
      const { jamoIdx: ji, strokeIdx: si, completedPaths: cp } = this.challenge;
      if (cb && cb.length > 1 && si === 0 && cb.slice(1).includes(ji) && cp.length > 0) {
        let maxCompX = 0;
        for (const { pts: rp } of cp) for (const p of rp) { if (p.x > maxCompX) maxCompX = p.x; }
        if (pts[0].x < maxCompX - 15) { this._onError(); return; }
      }
    }

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
      if (valid) {
        // Circle must start at the top (≈270° from center), with ±65° tolerance
        let cx = 0, cy = 0;
        for (const p of pts) { cx += p.x; cy += p.y; }
        cx /= pts.length; cy /= pts.length;
        const startAngle = (Math.atan2(pts[0].y - cy, pts[0].x - cx) * 180 / Math.PI + 360) % 360;
        let angleDiff = Math.abs(startAngle - 270);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;
        if (angleDiff > 65) valid = false;
      }

    } else if (Array.isArray(strokeDef.a)) {
      // Compound stroke (L-shape, 7-shape, etc.): scan split points to find the bend.
      // Fixed 1/3–2/3 splits fail when the first segment is short (e.g. quick horizontal
      // before a long downstroke in ㄱ/ㅋ/ㄲ) — so try every 5% and keep the best.
      if (pts.length < 6 || len < MIN_STROKE_LEN * 1.5) { this._onError(); return; }
      const n  = pts.length;
      const t  = strokeDef.t ?? 45;
      const lo = Math.max(1, Math.floor(n * 0.10));
      const hi = Math.min(n - 2, Math.floor(n * 0.80));
      const step = Math.max(1, Math.floor(n * 0.05));
      let bestD1 = 999, bestD2 = 999, bestBend = 0;
      for (let si = lo; si <= hi; si += step) {
        const px  = pts[si];
        const dx1 = px.x - start.x, dy1 = px.y - start.y;
        const dx2 = end.x - px.x,   dy2 = end.y - px.y;
        if (Math.hypot(dx1, dy1) < 4 || Math.hypot(dx2, dy2) < 4) continue;
        const sa1 = (Math.atan2(dy1, dx1) * 180 / Math.PI + 360) % 360;
        const sa2 = (Math.atan2(dy2, dx2) * 180 / Math.PI + 360) % 360;
        let sd1 = Math.abs(sa1 - strokeDef.a[0]); if (sd1 > 180) sd1 = 360 - sd1;
        let sd2 = Math.abs(sa2 - strokeDef.a[1]); if (sd2 > 180) sd2 = 360 - sd2;
        let sbend = Math.abs(sa1 - sa2);           if (sbend > 180) sbend = 360 - sbend;
        if (sbend < 15) continue; // must be an actual bend, not a near-straight stroke
        if (sd1 + sd2 < bestD1 + bestD2) { bestD1 = sd1; bestD2 = sd2; bestBend = sbend; }
      }
      valid = bestD1 <= t && bestD2 <= t && bestBend >= 15;

    } else {
      // Simple directional stroke: check direction AND straightness
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const drawnAngle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const tolerance  = strokeDef.t ?? 35;
      let diff = Math.abs(drawnAngle - strokeDef.a);
      if (diff > 180) diff = 360 - diff;
      // Also reject if the stroke is too curvy (lots of direction changes or deviation)
      valid = diff <= tolerance && this._isStraightEnough(pts, len);
    }

    if (valid && !this._checkStrokeOrder(strokeDef, pts)) valid = false;

    // bsr (below-start-right): new stroke's start must be below AND right of ref stroke's start.
    // strokeDef.bsr = index of the reference stroke within the current jamo.
    if (valid && strokeDef.bsr !== undefined) {
      const { strokeIdx, completedPaths } = this.challenge;
      const refIdx = completedPaths.length - strokeIdx + strokeDef.bsr;
      if (refIdx >= 0 && completedPaths[refIdx]) {
        const refStart = completedPaths[refIdx].pts[0];
        const newStart = pts[0];
        const MIN = 8;
        if (newStart.x < refStart.x - MIN || newStart.y < refStart.y - MIN) valid = false;
      }
    }

    // betweenVerts: horizontal stroke's x-midpoint must fall between the two reference verticals.
    if (valid && strokeDef.betweenVerts) {
      const [vi0, vi1] = strokeDef.betweenVerts;
      const { strokeIdx: sIdx, completedPaths } = this.challenge;
      const base  = completedPaths.length - sIdx;
      const path0 = completedPaths[base + vi0];
      const path1 = completedPaths[base + vi1];
      if (path0 && path1) {
        const cx0 = this._pathCenter(path0.pts).x;
        const cx1 = this._pathCenter(path1.pts).x;
        const minX = Math.min(cx0, cx1) - 15;
        const maxX = Math.max(cx0, cx1) + 15;
        const newMidX = (pts[0].x + pts[pts.length - 1].x) / 2;
        if (newMidX < minX || newMidX > maxX) valid = false;
      }
    }

    // vertAbove: this stroke's center Y must be ABOVE (smaller Y) the avg center Y of refs.
    // Used to ensure ㅗ/ㅛ bar is truly at the top, not confused with ㅜ/ㅠ.
    if (valid && strokeDef.vertAbove !== undefined) {
      const { strokeIdx: sIdx, completedPaths } = this.challenge;
      const base    = completedPaths.length - sIdx;
      const refs    = strokeDef.vertAbove.map(ri => completedPaths[base + ri]).filter(Boolean);
      if (refs.length) {
        const avgRefY = refs.reduce((s, r) => s + this._pathCenter(r.pts).y, 0) / refs.length;
        if (this._pathCenter(pts).y > avgRefY + 15) valid = false;
      }
    }

    // vertBelow: this stroke's center Y must be BELOW (larger Y) the avg center Y of refs.
    // Used to ensure ㅜ/ㅠ legs hang below their bar, not confused with ㅗ/ㅛ.
    if (valid && strokeDef.vertBelow !== undefined) {
      const { strokeIdx: sIdx, completedPaths } = this.challenge;
      const base    = completedPaths.length - sIdx;
      const refs    = strokeDef.vertBelow.map(ri => completedPaths[base + ri]).filter(Boolean);
      if (refs.length) {
        const avgRefY = refs.reduce((s, r) => s + this._pathCenter(r.pts).y, 0) / refs.length;
        if (this._pathCenter(pts).y < avgRefY - 15) valid = false;
      }
    }

    // stayLeftOf: no point of this stroke may exceed the max-X of the reference stroke + margin.
    // Used for ㅋ stroke 2 (middle bar must not extend past the right edge of the ㄱ body).
    if (valid && strokeDef.stayLeftOf !== undefined) {
      const { strokeIdx: sIdx, completedPaths } = this.challenge;
      const base    = completedPaths.length - sIdx;
      const refPath = completedPaths[base + strokeDef.stayLeftOf.ref];
      if (refPath) {
        const refMaxX = Math.max(...refPath.pts.map(p => p.x));
        const newMaxX = Math.max(...pts.map(p => p.x));
        const margin  = strokeDef.stayLeftOf.margin ?? 15;
        if (newMaxX > refMaxX + margin) valid = false;
      }
    }

    // Double consonant L→R ordering: the first stroke of the right copy must start
    // to the RIGHT of the center-of-mass of all left-copy strokes.
    if (valid) {
      const halfIdx = DOUBLE_CONS_HALF[curJamo];
      if (halfIdx !== undefined && this.challenge.strokeIdx === halfIdx) {
        const { strokeIdx: sIdx, completedPaths } = this.challenge;
        const firstCopyPaths = completedPaths.slice(-sIdx);
        let totalX = 0, totalPts = 0;
        for (const { pts: rpts } of firstCopyPaths) {
          for (const p of rpts) { totalX += p.x; totalPts++; }
        }
        if (totalPts > 0 && pts[0].x < (totalX / totalPts) + 10) valid = false;
      }
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

    // First stroke of a new syllable in a multi-syllable word: handled separately (right-of check)
    const _cb = this.challenge.charBoundaries;
    if (_cb && strokeIdx === 0 && _cb.length > 1 && _cb.slice(1).includes(jamoIdx)) return true;

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
                        || (curJamo === 'ㅃ' && (strokeIdx === 4 || strokeIdx === 5))
                        || (curJamo === 'ㅁ' && strokeIdx === 1)
                        // Compound vowels: the ㅣ bar (or shared strokes) often lands
                        // far from prior strokes — give it extra proximity room.
                        || (curJamo === 'ㅚ' && strokeIdx === 2)
                        || (curJamo === 'ㅟ' && strokeIdx === 2)
                        || (curJamo === 'ㅢ' && strokeIdx === 1)
                        || (curJamo === 'ㅘ' && strokeIdx === 2)
                        || (curJamo === 'ㅞ' && (strokeIdx === 2 || strokeIdx === 3))
                        || (curJamo === 'ㅙ' && (strokeIdx === 2 || strokeIdx === 3));
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

    // Expand bbox - for the first stroke of a new jamo, use asymmetric margins:
    // generous downward/rightward (new jamo goes right or below) but tight
    // upward/leftward (new jamo must never appear above or left of existing strokes).
    if (strokeIdx === 0) {
      const snap = size * 0.08; // ~22px for size=280
      minX -= snap;
      minY -= snap;
      maxX += margin;
      maxY += margin;
    } else {
      minX -= margin; minY -= margin;
      maxX += margin; maxY += margin;
    }

    // Accept if the start point OR centroid falls within the expanded bbox.
    // Start point is used for compound strokes (↓→ etc.) whose centroid drifts far from
    // the connection point with the previous stroke (e.g. ㄷ stroke 2 goes well below stroke 1).
    const inBbox = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
    const sx = pts[0].x, sy = pts[0].y;
    if (inBbox(sx, sy)) return true;
    let sumX = 0, sumY = 0;
    for (const p of pts) { sumX += p.x; sumY += p.y; }
    const cx = sumX / pts.length, cy = sumY / pts.length;
    return inBbox(cx, cy);
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
    // Allow up to 12% of stroke length as deviation
    return maxDev <= Math.max(8, 0.12 * len);
  }

  // Returns the center (midpoint of first and last point) of a path
  _pathCenter(pts) {
    const s = pts[0], e = pts[pts.length - 1];
    return { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
  }

  // For repeated same-direction strokes in a jamo, enforce spatial ordering:
  //   repeated ↓ (angle ~90°) → each new stroke must be to the RIGHT (larger centerX)
  //   repeated → (angle ~0°)  → each new stroke must be BELOW (larger centerY)
  // Returns true if position is acceptable, false to reject.
  _checkStrokeOrder(strokeDef, newPts) {
    if (!this.challenge) return true;
    const { jamos, jamoIdx, strokeIdx, completedPaths } = this.challenge;
    if (strokeIdx === 0) return true; // first stroke of jamo: no constraint

    const expectedAngle = Array.isArray(strokeDef.a) ? strokeDef.a[0] : strokeDef.a;
    if (expectedAngle === 'circle') return true;

    // Only enforce ordering when the immediately preceding stroke has the same direction.
    // This handles ㅠ (→↓↓ — consecutive ↓s) while leaving complex compounds like
    // ㅙ (↓→↓→↓) unaffected, since their same-direction strokes are not adjacent.
    const jamoStrokes = JAMO_STROKES[jamos[jamoIdx]] || [];
    const prevDef = jamoStrokes[strokeIdx - 1];
    if (!prevDef) return true;
    // Compound strokes (L-shapes etc.) must not be matched by direction — skip ordering
    if (Array.isArray(prevDef.a)) return true;
    const prevAngle = prevDef.a;
    if (prevAngle !== expectedAngle) return true; // previous stroke has a different direction

    const jamoCompletedPaths = completedPaths.slice(-strokeIdx);
    let prevMatchPts = null;
    const pathOffset = jamoCompletedPaths.length - 1;
    if (pathOffset >= 0 && jamoCompletedPaths[pathOffset]) {
      prevMatchPts = jamoCompletedPaths[pathOffset].pts;
    }

    if (!prevMatchPts) return true;

    const prevCenter = this._pathCenter(prevMatchPts);
    const newCenter  = this._pathCenter(newPts);
    const isVertical = Math.abs(((expectedAngle % 360 + 360) % 360) - 90) < 45; // ~90° = ↓
    const MIN_OFFSET = 8; // minimum pixel separation to enforce ordering

    if (isVertical) {
      // ↓ strokes: new must be to the RIGHT of previous (larger X)
      return newCenter.x >= prevCenter.x - MIN_OFFSET;
    } else {
      // → strokes: new must be BELOW previous (larger Y)
      return newCenter.y >= prevCenter.y - MIN_OFFSET;
    }
  }

  _onStrokeOk() {
    this.errors = 0;

    // Record the completed path so we can redraw it in green
    this.challenge.completedPaths.push({ pts: [...this.points] });
    this._updateRestartBtn();

    // Redraw canvas: completed strokes in green, in-progress cleared
    this._clearStrokes();
    this._redrawCompletedStrokes();

    this.challenge.strokeIdx++;
    this.challenge.globalStrokeIdx++;
    if (this.challenge.globalStrokeIdx === 1) this._firstStrokeErrors = 0;

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
    } else if (isFirstTime && !G.dictProgressionDisabled) {
      this._announce(i18n('dojang.jamoUnlocked').replace('{j}', curJamo));
      this._showLeafModal(curJamo);
    }

    saveDojangStats(this.stats);
    this._syncHUD();

    this.challenge.jamoIdx++;

    // For multi-syllable challenges, keep challenge.char pointing at current syllable
    if (this.challenge.charBoundaries && this.challenge.chars) {
      let ci = 0;
      for (let k = this.challenge.charBoundaries.length - 1; k >= 0; k--) {
        if (this.challenge.charBoundaries[k] <= this.challenge.jamoIdx) { ci = k; break; }
      }
      this.challenge.char = this.challenge.chars[Math.min(ci, this.challenge.chars.length - 1)];
    }

    if (this.challenge.jamoIdx >= jamos.length) {
      this._onChallengeComplete();
    } else {
      this.challenge.strokeIdx = 0;
      this.errors = 0;
    }
  }

  _onChallengeComplete() {
    const { char, jamos } = this.challenge;

    const stageBefore = computeHangulStage(this.stats);
    let didTrack = false;

    // Track CV syllables (cho + jung only) for stage 2→3 unlock
    if (jamos.length === 2 && !this.stats.seenSyllables.includes(char)) {
      this.stats.seenSyllables.push(char);
      didTrack = true;
    }

    // Track CVC syllables (cho + jung + jong) for stage 3→4 unlock
    if (jamos.length === 3 && !this.stats.seenBatchimSyllables.includes(char)) {
      this.stats.seenBatchimSyllables.push(char);
      didTrack = true;
    }

    const stageAfter = computeHangulStage(this.stats);
    if (stageAfter > stageBefore) {
      this._announceStageUp(stageAfter);
      this._syncHUD();
    }
    if (didTrack) saveDojangStats(this.stats);

    this.flash = { type: 'ok', t: 0, dur: 0.4 };
    this.nextDelay = 0.55;
    // Keep strokes visible until _nextChallenge() clears them after the delay
  }

  _announceStageUp(newStage) {
    const msgs = {
      1: i18n('dojang.phaseUp2'),
      2: i18n('dojang.phaseUpCV'),
      3: i18n('dojang.phaseUp3'),
      4: i18n('dojang.phaseUp4'),
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
      this._firstStrokeErrors++;
      if (this._firstStrokeErrors >= 2 && !this.inspectorOpen) {
        const jp = this.stats?.jamoProgress || {};
        const pct = PHASE1_JAMOS.reduce((s, j) => s + (jp[j]?.count || 0), 0)
                  / (PHASE1_JAMOS.length * MAX_JAMO_COUNT);
        if (pct < 0.05) {
          this._firstStrokeErrors = 0;
          this.openInspector();
        }
      }
      return;
    }

    this.errors++;
    this._totalErrors++;
    if (this.errors >= _maxErrors(this.challenge.jamos.length)) {
      sfx('doMajorError', 0.8);
      // Reset entire character - clear all ink and restart from first jamo
      this.errors = 0;
      this._firstStrokeErrors = 0;
      this.challenge.jamoIdx   = 0;
      this.challenge.strokeIdx = 0;
      this.challenge.globalStrokeIdx = 0;
      this.challenge.completedPaths  = [];
      this.challenge.char = this.challenge.chars?.[0] ?? this.challenge.char;
      this._clearStrokes();
      this._announce(i18n('dojang.resetJamo'));
      this._updateRestartBtn();
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
    this._lastMoveTime = null;
    this._currentWidth = null;
    this._poolR = 0;
    this.sCtx.beginPath();
  }

  _redrawCompletedStrokes() {
    const ctx = this.sCtx;
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(30,140,70,1)';
    ctx.fillStyle   = 'rgba(30,140,70,1)';
    (this.challenge?.completedPaths || []).forEach(({ pts }) => {
      if (pts.length < 2) return;
      // Draw pool dot at start point if one was recorded
      if (pts[0].w) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, pts[0].w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Replay each segment at its original width for authentic appearance
      for (let i = 1; i < pts.length; i++) {
        const lw = pts[i].w ?? Math.max(5, Math.min(10, this.strokeCanvas.width * 0.008));
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, lw / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Draw pool blob at the end if released while pooling
      const last = pts[pts.length - 1];
      if (last?.poolEnd) {
        ctx.beginPath();
        ctx.arc(last.x, last.y, last.poolEnd, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // ── Challenge generation ──────────────────────────────────
  _nextChallenge() {
    this._clearStrokes();
    this.errors = 0;
    this._totalErrors = 0;
    this._idleStart = performance.now();

    // Check if words/complex syllables should occasionally appear
    const jp = this.stats.jamoProgress || {};
    const globalPct = PHASE1_JAMOS.reduce((s, j) => s + (jp[j]?.count || 0), 0)
                      / (PHASE1_JAMOS.length * MAX_JAMO_COUNT);
    const wordsUnlocked = globalPct >= WORDS_UNLOCK_PCT;

    const lastChar = this.challenge?.char ?? null;
    const stage = computeHangulStage(this.stats);
    let char;
    let attempts = 0;
    do {
      if (stage === 4) {
        // Stage 5 (Words): full multi-syllable words, some syllable review
        const rnd = Math.random();
        if (rnd < 0.70) {
          // 70%: full word from dictionary
          char = WORD_DICT[Math.floor(Math.random() * WORD_DICT.length)].text;
        } else if (rnd < 0.85) {
          // 15%: CVC syllable review
          char = ALL_CVC_SYLLABLES[Math.floor(Math.random() * ALL_CVC_SYLLABLES.length)];
        } else if (rnd < 0.95) {
          // 10%: CV syllable review
          char = ALL_CV_SYLLABLES[Math.floor(Math.random() * ALL_CV_SYLLABLES.length)];
        } else {
          // 5%: complex syllable
          char = COMPLEX_SYLLABLES[Math.floor(Math.random() * COMPLEX_SYLLABLES.length)];
        }
      } else {
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
      }
      // pickNextChallenge can return __words__ only for stage 4, handled above
      if (char === '__words__') char = WORD_DICT[Math.floor(Math.random() * WORD_DICT.length)].text;
      attempts++;
    } while (char === (this.challenge?.word ?? this.challenge?.char) && attempts < 5);

    this.challenge = this._buildChallenge(char);
    this._speakText(this.challenge.word ?? this.challenge.char);
    this._updateRestartBtn();
  }

  _buildChallenge(text) {
    const chars = [...text]; // one element per Korean syllable (spread handles astral chars too)
    const allJamos = chars.flatMap(c => syllableToJamos(c));
    // charBoundaries[i] = jamo index where chars[i] starts
    const charBoundaries = [];
    let idx = 0;
    for (const c of chars) {
      charBoundaries.push(idx);
      idx += syllableToJamos(c).length;
    }
    const totalStrokes = allJamos.reduce((sum, j) => sum + (JAMO_STROKES[j]?.length || 0), 0);
    return {
      word:            chars.length > 1 ? text : null,
      chars,
      charBoundaries,
      char:            chars[0],  // current syllable being drawn (updates as you progress)
      jamos:           allJamos,
      jamoIdx:         0,
      strokeIdx:       0,
      totalStrokes,
      globalStrokeIdx: 0,
      completedPaths:  [],
    };
  }

  // Restart current character from the beginning (bound to ❌ button)
  restartChallenge() {
    if (!this.challenge) return;
    const hadProgress = this.challenge.globalStrokeIdx > 0;
    if (!hadProgress) {
      this._restartTapCount++;
      if (this._restartTapCount >= 5) {
        this._restartTapCount = 0;
        this._openCheatMenu();
        return;
      }
    } else {
      this._restartTapCount = 0;
    }
    this.challenge.jamoIdx = 0;
    this.challenge.strokeIdx = 0;
    this.challenge.globalStrokeIdx = 0;
    this.challenge.completedPaths = [];
    this.challenge.char = this.challenge.chars?.[0] ?? this.challenge.char;
    this.errors = 0;
    this._firstStrokeErrors = 0;
    this._clearStrokes();
    this._updateRestartBtn();
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
    if (getVolume() <= 0) return;
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
      const isMastered = PHASE1_JAMOS.every(j => (jp[j]?.count || 0) >= MAX_JAMO_COUNT);
      if (isMastered) {
        phaseEl.textContent = i18n('dojang.masterTitle');
      } else {
        const stageLabels = ['phase1','phase2','phaseCV','phase3','phase4'];
        phaseEl.textContent = i18n(`dojang.${stageLabels[Math.min(stage, 4)] || 'phase4'}`);
      }
    }

    // Speak button: show muted icon when TTS is unavailable
    const speakBtn = document.getElementById('dojang-btn-speak');
    if (speakBtn) {
      const canSpeak = G.ttsEnabled && typeof speechSynthesis !== 'undefined';
      speakBtn.textContent = canSpeak ? '🔊' : '🔇';
      speakBtn.style.opacity = canSpeak ? '' : '0.4';
      speakBtn.disabled = !canSpeak;
    }

    this._updateRestartBtn();
  }

  _updateRestartBtn() {
    const btn = document.getElementById('dojang-btn-restart');
    if (!btn) return;
    const hasProgress = this.challenge && this.challenge.globalStrokeIdx > 0;
    btn.style.opacity = hasProgress ? '1' : '0.4';
  }

  // ── Dev cheat menu ────────────────────────────────────────
  _openCheatMenu() {
    if (document.getElementById('dojang-cheat-menu')) return;
    const panel = document.createElement('div');
    panel.id = 'dojang-cheat-menu';
    const gm = this._cheat.ghostMode;
    const dm = this._cheat.drawMode;
    panel.innerHTML = `
      <div id="djc-box">
        <div class="djc-title">${i18n('dojang.cheat.title')}</div>
        <div class="djc-row">
          <button id="djc-skip-phase">${i18n('dojang.cheat.skipChallenge')}</button>
          <button id="djc-skip-stage">${i18n('dojang.cheat.skipStage')}</button>
        </div>
        <div class="djc-row">
          <input id="djc-prog-input" type="number" min="0" max="100" value="50">%
          <button id="djc-set-prog" style="margin-left: auto">${i18n('dojang.cheat.setProgress')}</button>
        </div>
        <div class="djc-row">
          <span style="margin-right: auto">${i18n('dojang.cheat.ghost')}:</span>
          <button class="djc-ghost-btn${gm==='auto'?' djc-active':''}" data-ghost="auto">${i18n('dojang.cheat.ghostAuto')}</button>
          <button class="djc-ghost-btn${gm==='show'?' djc-active':''}" data-ghost="show">${i18n('dojang.cheat.ghostAlways')}</button>
          <button class="djc-ghost-btn${gm==='hide'?' djc-active':''}" data-ghost="hide">${i18n('dojang.cheat.ghostNever')}</button>
        </div>
        <div class="djc-row">
          <button id="djc-draw-mode" style="width: 100%" class="${dm?'djc-active':''}">${i18n('dojang.cheat.drawMode')}: ${dm?'ON':'OFF'}</button>
        </div>
        <div class="djc-row">
          <button id="djc-reset" style="width: 100%" class="djc-danger">${i18n('dojang.cheat.reset')}</button>
        </div>
        <button id="djc-close" class="djc-close">✕</button>
      </div>
    `;
    (document.getElementById('scr-dojang') || document.body).appendChild(panel);

    const _closeCheat = () => { panel.remove(); this._idleStart = performance.now(); };
    panel.querySelector('#djc-close').addEventListener('click', _closeCheat);
    panel.addEventListener('mousedown', (e) => { if (e.target === panel) _closeCheat(); });

    panel.querySelector('#djc-skip-phase').addEventListener('click', () => {
      // Mark current jamos as seen so STARTER_ORDER advances to the next one
      if (this.challenge) {
        this.challenge.jamos.forEach(j => {
          if (!this.stats.seenJamos.includes(j)) this.stats.seenJamos.push(j);
        });
      }
      this._nextChallenge();
      this._announce(i18n('dojang.cheat.skipped'));
    });

    panel.querySelector('#djc-skip-stage').addEventListener('click', () => {
      const stage = computeHangulStage(this.stats);
      if (!this.stats.jamoProgress) this.stats.jamoProgress = {};
      // Entry counts scale with stage: more practice expected to reach each stage
      // stage 0→1: ~5% per jamo, stage 1→2: ~15%, stage 2→3: ~40%
      const entryCounts = [
        Math.round(MAX_JAMO_COUNT * 0.05),  // stage 0→1
        Math.round(MAX_JAMO_COUNT * 0.15),  // stage 1→2
        Math.round(MAX_JAMO_COUNT * 0.40),  // stage 2→3
      ];
      const count = entryCounts[stage] ?? null;
      if (stage === 0) {
        INTRO_JAMOS.forEach(j => {
          if (!this.stats.seenJamos.includes(j)) this.stats.seenJamos.push(j);
          this.stats.jamoProgress[j] = { count: Math.max(this.stats.jamoProgress[j]?.count || 0, count) };
        });
      } else if (stage === 1) {
        PHASE1_JAMOS.forEach(j => {
          if (!this.stats.seenJamos.includes(j)) this.stats.seenJamos.push(j);
          this.stats.jamoProgress[j] = { count: Math.max(this.stats.jamoProgress[j]?.count || 0, count) };
        });
      } else if (stage === 2) {
        ALL_CV_SYLLABLES.forEach(s => { if (!this.stats.seenSyllables.includes(s)) this.stats.seenSyllables.push(s); });
        PHASE1_JAMOS.forEach(j => {
          this.stats.jamoProgress[j] = { count: Math.max(this.stats.jamoProgress[j]?.count || 0, Math.round(MAX_JAMO_COUNT * 0.40)) };
        });
      } else if (stage === 3) {
        if (!this.stats.seenBatchimSyllables) this.stats.seenBatchimSyllables = [];
        ALL_CVC_SYLLABLES.forEach(s => { if (!this.stats.seenBatchimSyllables.includes(s)) this.stats.seenBatchimSyllables.push(s); });
        PHASE1_JAMOS.forEach(j => {
          this.stats.jamoProgress[j] = { count: Math.max(this.stats.jamoProgress[j]?.count || 0, Math.round(MAX_JAMO_COUNT * 0.60)) };
        });
      } else {
        // Already at stage 4 (words): set to 100%
        this.stats.seenJamos = [];
        this.stats.seenSyllables = [];
        this.stats.seenBatchimSyllables = [];
        this.stats.jamoProgress = {};
        PHASE1_JAMOS.forEach(j => { this.stats.jamoProgress[j] = { count: MAX_JAMO_COUNT }; });
        INTRO_JAMOS.forEach(j => { if (!this.stats.seenJamos.includes(j)) this.stats.seenJamos.push(j); });
        PHASE1_JAMOS.forEach(j => { if (!this.stats.seenJamos.includes(j)) this.stats.seenJamos.push(j); });
        ALL_CV_SYLLABLES.forEach(s => { if (!this.stats.seenSyllables.includes(s)) this.stats.seenSyllables.push(s); });
        ALL_CVC_SYLLABLES.forEach(s => { if (!this.stats.seenBatchimSyllables.includes(s)) this.stats.seenBatchimSyllables.push(s); });
      }
      saveDojangStats(this.stats);
      this._nextChallenge();
      this._syncHUD();
      this._announce(i18n('dojang.cheat.stageUnlocked').replace('{n}', stage + 1));
    });

    panel.querySelector('#djc-set-prog').addEventListener('click', () => {
      const pct = Math.max(0, Math.min(100, parseInt(panel.querySelector('#djc-prog-input').value) || 0));
      const targetCount = Math.round(pct / 100 * MAX_JAMO_COUNT);
      // Reset everything and rebuild stage arrays to match the target %
      this.stats.seenJamos = [];
      this.stats.seenSyllables = [];
      this.stats.seenBatchimSyllables = [];
      this.stats.jamoProgress = {};
      PHASE1_JAMOS.forEach(j => {
        this.stats.jamoProgress[j] = { count: targetCount };
      });
      // Populate seen arrays to put the player in the correct stage for this %
      // Stage thresholds: 5%→all INTRO seen, 15%→all PHASE1 seen,
      // 40%→all CV syllables seen, 60%→all CVC syllables seen
      if (pct >= 5)  INTRO_JAMOS.forEach(j => { if (!this.stats.seenJamos.includes(j)) this.stats.seenJamos.push(j); });
      if (pct >= 15) PHASE1_JAMOS.forEach(j => { if (!this.stats.seenJamos.includes(j)) this.stats.seenJamos.push(j); });
      if (pct >= 40) ALL_CV_SYLLABLES.forEach(s => { if (!this.stats.seenSyllables.includes(s)) this.stats.seenSyllables.push(s); });
      if (pct >= 60) ALL_CVC_SYLLABLES.forEach(s => { if (!this.stats.seenBatchimSyllables.includes(s)) this.stats.seenBatchimSyllables.push(s); });
      saveDojangStats(this.stats);
      this._nextChallenge();
      this._syncHUD();
      this._announce(i18n('dojang.cheat.progressSet').replace('{n}', pct));
    });

    panel.querySelectorAll('.djc-ghost-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._cheat.ghostMode = btn.dataset.ghost;
        panel.querySelectorAll('.djc-ghost-btn').forEach(b => b.classList.remove('djc-active'));
        btn.classList.add('djc-active');
      });
    });

    const drawBtn = panel.querySelector('#djc-draw-mode');
    drawBtn.addEventListener('click', () => {
      this._cheat.drawMode = !this._cheat.drawMode;
      drawBtn.textContent = `${i18n('dojang.cheat.drawMode')}: ${this._cheat.drawMode?'ON':'OFF'}`;
      drawBtn.classList.toggle('djc-active', this._cheat.drawMode);
    });

    panel.querySelector('#djc-reset').addEventListener('click', () => {
      if (!confirm('Reset all dojang progress?')) return;
      this.stats = freshStats();
      saveDojangStats(this.stats);
      this._nextChallenge();
      this._syncHUD();
      _closeCheat();
    });
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
    if (this.paused) {
      this._clearStrokes();
    } else {
      this._redrawCompletedStrokes(); // restore ink after unpausing
    }
  }

  _showPauseMenu(show) {
    const el = document.getElementById('dojang-pause-overlay');
    if (el) el.classList.toggle('off', !show);
    if (!show) return;

    const ttsToggle = document.getElementById('dojang-chk-tts');
    const ttsRow = ttsToggle?.closest('.dojang-pause-tts-row');
    const unavailable = !!document.getElementById('chk-tts')?.disabled;
    if (ttsToggle) {
      ttsToggle.checked = !!G.ttsEnabled;
      ttsToggle.disabled = unavailable;
    }
    ttsRow?.classList.toggle('tts-unsupported', unavailable);
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

    const countTip   = i18n('dojang.timesWritten');
    const strokesTip = i18n('dojang.strokeCountTip');

    const progDisabled = G.dictProgressionDisabled;
    const rows = DOJANG_BOOK_ORDER.map(j => {
      const count   = jp[j]?.count || 0;
      const strokes = (JAMO_STROKES[j] || []).length;
      const bar     = Math.min(100, Math.round(count / MAX_JAMO_COUNT * 100));
      const info    = JAMO_INFO[j];
      const hasDesc = progDisabled || count >= 1;

      let descHtml = '';
      if (hasDesc) {
        const baseText = i18n(`jamo_desc.${j}.base`);
        const firstLine = baseText.split('\n')[0];
        const jamoName  = (firstLine.match(/\*\*([^*]+)\*\*/) || [])[1] || (info?.name || '');
        const jamoSound = (firstLine.match(/·\s*(.+)/) || [])[1]?.trim() || '';
        const bodyMd = baseText.replace(/^[^\n]*\n*/, '');
        const showBatchim = (progDisabled || count >= BATCHIM_UNLOCK_COUNT) && JAMO_HAS_BATCHIM.has(j);
        const batchimText = showBatchim ? i18n(`jamo_desc.${j}.batchim`) : '';
        const batchimHtml = batchimText ? `<div class="dj-batchim-section"><div class="dj-batchim-header">${i18n('dojang.batchimSection')}</div>${parseLessonMarkdown(batchimText)}</div>` : '';
        const dblKey = `jamo_desc.${j}.double_batchim`;
        const dblRaw = showBatchim ? i18n(dblKey) : '';
        const dblHtml = (dblRaw && dblRaw !== dblKey) ? `<div class="dj-batchim-section dj-double-batchim-section"><div class="dj-batchim-header">${i18n('dojang.doubleBatchimSection')}</div>${parseLessonMarkdown(dblRaw)}</div>` : '';
        descHtml = jamoFontPreview(j, jamoName, jamoSound) + parseLessonMarkdown(bodyMd) + batchimHtml + dblHtml;
      }

      return `<div class="dj-book-row${hasDesc ? ' has-desc' : ''}">
        <div class="dj-book-row-main">
          <span class="dj-book-jamo">${j}</span>
          <span class="dj-book-name" data-tooltip="${i18n('dojang.tooltipName')}">${info?.name || ''}${info?.nameRom ? `<span class="dj-book-name-rom"> (${info.nameRom}${info.nameMR && info.nameMR !== info.nameRom ? ' / ' + info.nameMR : ''})</span>` : ''}</span>
          <span class="dj-book-rom" data-tooltip="${i18n('dojang.tooltipRom')}">${info?.rom || ''}</span>
          <div class="dj-book-bar-wrap"${progDisabled ? ' style="visibility:hidden"' : ''}><div class="dj-book-bar" style="width:${bar}%"></div></div>
          <span class="dj-book-count"${progDisabled ? ' style="visibility:hidden"' : ''} data-tooltip="${countTip}">${count}</span>
          <span class="dj-book-strokes" data-tooltip="${strokesTip}">${strokes}획</span>
          ${hasDesc ? '<button class="dj-book-expand-btn">▼</button>' : '<span></span>'}
        </div>
        ${hasDesc ? `<div class="dj-book-desc off">${descHtml}</div>` : ''}
      </div>`;
    }).join('');

    const currentStageLabel = isMastered ? i18n('dojang.masterTitle') : (stageLabels[stage] || stageLabels[4]);
    const stageSteps = stageLabels.map((lbl, i) => {
      const done    = i < stage || isMastered;
      const current = i === stage && !isMastered;
      const cls     = done ? 'dj-stage-done' : current ? 'dj-stage-current' : 'dj-stage-future';
      return `<span class="dj-stage-step ${cls}" title="${lbl}">${i + 1}</span>`;
    });
    const stagePipeline = stageSteps.join('<span class="dj-stage-arrow">→</span>');
    const completedList = stageLabels
      .slice(0, isMastered ? stageLabels.length : stage)
      .map(lbl => `<span class="dj-stage-check">✓ ${lbl}</span>`)
      .join('');

    body.innerHTML = `
      <div class="dj-book-header">
        <div class="dj-book-stat">
          <span class="dj-book-stat-val">${globalPct}%</span>
          <span class="dj-book-stat-lbl">${i18n('dojang.globalProgress')}</span>
        </div>
        <div class="dj-book-stage-pipeline">
          <div class="dj-stage-name">${currentStageLabel}</div>
          <div class="dj-stage-row">${stagePipeline}</div>
          ${completedList ? `<div class="dj-stage-checks">${completedList}</div>` : ''}
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
  _showLeafModal(jamo) {
    if (G.lang === 'ko') return;
    if (localStorage.getItem('krr_dojang_noLeafModal') === '1') return;
    const modal = document.getElementById('dojang-leaf-modal');
    const body  = document.getElementById('dojang-leaf-body');
    if (!modal || !body) return;

    const info      = JAMO_INFO[jamo];
    const baseText  = i18n(`jamo_desc.${jamo}.base`);
    const firstLine = baseText.split('\n')[0];
    const jamoName  = (firstLine.match(/\*\*([^*]+)\*\*/) || [])[1] || (info?.name || '');
    const jamoSound = (firstLine.match(/·\s*(.+)/) || [])[1]?.trim() || '';
    const bodyMd    = baseText.replace(/^[^\n]*\n*/, '');
    const displayName = jamoName + (info?.nameRom ?? info?.rom ? ` (${info?.nameRom ?? info?.rom})` : '');
    body.innerHTML  = jamoFontPreview(jamo, displayName, jamoSound) + parseLessonMarkdown(bodyMd);

    // i18n the no-spoil button text (may have been set before lang was ready)
    const nospoilBtn = document.getElementById('dojang-leaf-nospoil');
    if (nospoilBtn) nospoilBtn.textContent = i18n('dojang.leafNoSpoil');

    modal.classList.remove('off');

    const close = () => {
      modal.classList.add('off');
      this._idleStart = performance.now(); // reset inspector timer after leaf modal closes
      this._totalErrors = 0;
    };
    document.getElementById('dojang-leaf-close')?.addEventListener('click', close, { once: true });
    document.getElementById('dojang-leaf-nospoil')?.addEventListener('click', () => {
      localStorage.setItem('krr_dojang_noLeafModal', '1');
      close();
    }, { once: true });
    modal.addEventListener('click', e => {
      if (e.target === modal) close();
    }, { once: true });
  }

  openInspector() {
    if (!this.challenge || document.getElementById('dojang-cheat-menu')) return;
    this.inspectorOpen = true;
    this._showInspector(true);
    this._renderInspector(0);
  }

  closeInspector() {
    this.inspectorOpen = false;
    this._showInspector(false);
    this._idleStart = performance.now(); // restart idle timer so inspector doesn't re-open immediately
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
      const animSvg = _makeStrokeAnimSVG(s.a);
      return `<div class="dj-insp-stroke-row">
        <span class="dj-insp-arrow">${animSvg}</span>
        <span class="dj-insp-num">&#${9311 + i + 1};</span>
      </div>`;
    }).join('');

    body.innerHTML = `
      <div class="dj-insp-card">
        <div class="dj-insp-name">${info?.name || ''} · ${info?.rom || ''}</div>
        <div class="dj-insp-strokes">${strokeRows}</div>
        <div class="dj-insp-char">${j}</div>
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
