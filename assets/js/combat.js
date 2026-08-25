/* ================================================================
   COMBAT ENGINE
   Ported from typing-game.html with roguelite adaptations:
   - G.room.monsters instead of G.monsters
   - Monsters spawn from all 4 edges, move toward room center
   - Room-clear detection triggers navigate mode
================================================================ */
import { G, incrementWordKillCount, incrementWordConjugationCount, savePersistentState } from './state.js';
import { MP, mpSend } from './multiplayer.js';
import { LESSONS_BASE } from '../data/lessons.js';
import { POWERUP_DEFS, POWERUP_KEYS, rollPowerupDrop, formatKoreanNumber } from '../data/items.js';
import { WORD_DICT } from '../data/words.js';
import { get as i18n, wordTr } from './i18n.js';
import { play as sfx } from './sfx.js';
import { genSinoNumber, genNativeNumber, sinoSpelling, nativeSpelling } from '../data/numbers.js';


// Parse lesson word string, handling disambiguation like 'text:emoji'
function parseLessonWord(str) {
  if (str.includes(':')) {
    const [text, emoji] = str.split(':');
    return { text, emoji };
  } else {
    return { text: str, emoji: null };
  }
}

/* ================================================================
   JAMO UTILITIES (verbatim from typing-game.html)
================================================================ */
export function countJamo(str) {
  let n = 0;
  for (const ch of str) {
    const c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) {
      n += 2 + (((c - 0xAC00) % 28) > 0 ? 1 : 0);
    } else if (c > 0x20) n++;
  }
  return n;
}

export function countJamoKeys(str) {
  let n = 0;
  for (const ch of str) {
    const c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) {
      const v    = c - 0xAC00;
      const jong = v % 28;
      const jung = Math.floor(v / 28) % 21;
      const cho  = Math.floor(v / 28 / 21);
      const CHO_DOUBLE  = new Set([1,3,6,9,13]);
      const JUNG_2      = new Set([2,5,8,9,10,13,14,15,19]);
      const JONG_2      = new Set([3,4,5,8,9,10,11,12,13,14,17]);
      n += CHO_DOUBLE.has(cho) ? 2 : 1;
      n += JUNG_2.has(jung) ? 2 : 1;
      if (jong > 0) n += JONG_2.has(jong) ? 2 : 1;
    } else if (c > 0x20) n += 1;
  }
  return n;
}

function countSyllables(words) {
  return words.reduce((n, w) => {
    for (const ch of w) {
      const c = ch.charCodeAt(0);
      if (c >= 0xAC00 && c <= 0xD7A3) n++;
    }
    return n;
  }, 0);
}

function monsterKeyCount(words) {
  return words.reduce((s, w) => s + countJamoKeys(w), 0);
}

/* ================================================================
   WORD DIFFICULTY SCALING
================================================================ */
function maxDiffForWave(wn) {
  if (wn === 1) return 2;
  if (wn === 2) return 3;
  if (wn === 3) return 4;
  if (wn === 4) return 5;
  if (wn <= 6)  return 6;
  if (wn <= 8)  return 7;
  if (wn <= 10) return 8;
  if (wn <= 14) return 10;
  if (wn <= 18) return 12;
  if (wn <= 24) return 15;
  if (wn <= 32) return 18;
  if (wn <= 40) return 22;
  return Math.min(28, 22 + Math.floor((wn - 40) * 0.3));
}

function minDiffForWave(wn) {
  return Math.max(2, Math.floor(maxDiffForWave(wn) * 0.4));
}

function pickWordsForRoom(waveNum, count, opts = {}) {
  const {
    noVerbAdj = false,
    enforceWaveMinDifficulty = false,
    minDifficultyQuota = count,
  } = opts;
  const effectiveWave = Math.max(1, waveNum + (G.run?.difficultyOffset || 0));
  const maxD = maxDiffForWave(effectiveWave);
  const minD = minDiffForWave(effectiveWave);

  // ── VOCABULARY DIFFICULTY - Decoupled from world/wave ────────
  // Base pool: words with rel >= G.relThreshold (starts at 90, lowered by 5 per lesson)
  // Lesson pool: words explicitly unlocked by completed lessons (bypass threshold)
  const threshold = G.relThreshold ?? 90;

  // Collect lesson-unlocked words
  const unlockedSet = new Set();
  (G.completedLessons || []).forEach(id => {
    const lesson = LESSONS_BASE.find(l => l.id === id);
    lesson?.unlockedWords?.forEach(w => {
      const { text } = parseLessonWord(w);
      unlockedSet.add(text);
    });
  });

  const vaOk = w => !(noVerbAdj && (w.category === 'verb' || w.category === 'adjective'));
  const isInPool = w => (w.rel != null && w.rel >= threshold) || unlockedSet.has(w.text);

  // Allow longer words at any wave (jamo difficulty decoupled from vocab difficulty)
  const effectiveMaxD = Math.max(maxD, 15);
  let pool = WORD_DICT.filter(w => w.d <= effectiveMaxD && isInPool(w) && vaOk(w));

  // Fallback: widen jamo window but keep vocab gate
  if (pool.length < count) pool = WORD_DICT.filter(w => isInPool(w) && vaOk(w));
  // Last resort: base pool with progressively lower threshold floor
  if (pool.length < count) pool = WORD_DICT.filter(w => (w.rel != null && w.rel >= 70) && vaOk(w));
  if (pool.length < count) pool = WORD_DICT.filter(vaOk);

  // Avoid words already used in this room (across all waves)
  const roomUsed = G.room?.usedWords || new Set();
  const sh = [...pool].sort(() => Math.random() - 0.5);
  let orderedPool = sh;
  if (enforceWaveMinDifficulty) {
    // Normal rooms stay broad so they remain vocabulary-first. Bosses opt in
    // here: most of their health bar must use the minimum difficulty that the
    // wave already calculated, while a small number of breaths can stay easy.
    const hard = sh.filter(w => w.d >= minD);
    const easy = sh.filter(w => w.d < minD);
    const hardQuota = Math.max(0, Math.min(count, minDifficultyQuota));
    orderedPool = [
      ...hard.slice(0, hardQuota),
      ...easy,
      ...hard.slice(hardQuota),
    ];
  }
  const out = [];
  for (const w of orderedPool) {
    if (!roomUsed.has(w.text)) { out.push(w.text); roomUsed.add(w.text); }
    if (out.length >= count) break;
  }
  // Fallback if pool exhausted (very small pools)
  while (out.length < count) out.push(orderedPool[out.length % orderedPool.length]?.text || '가');
  if (G.room) G.room.usedWords = roomUsed;
  return out;
}

export function pickWordsForMonster(waveNum, hp, opts = {}) {
  // Multi-HP monsters never get verb/adj words (conjugation only works for 1-HP)
  const noVerbAdj = hp > 1 ? true : (opts.noVerbAdj || false);
  const effectiveWave = hp <= 1 ? waveNum : Math.max(1, waveNum - (hp - 1) * 4);
  return pickWordsForRoom(effectiveWave, hp, { noVerbAdj });
}

function pickBossWords(waveNum, count) {
  // Keep roughly one word in five as a recovery beat, but make the rest meet
  // the existing wave minimum. This changes bosses only, not room vocabulary.
  const breatherCount = count >= 5 ? Math.max(1, Math.round(count * 0.2)) : 0;
  const words = pickWordsForRoom(waveNum, count, {
    enforceWaveMinDifficulty: true,
    minDifficultyQuota: count - breatherCount,
  });
  // Spread the recovery words across the fight instead of leaving an easy
  // final phase after all of the demanding ones.
  return words.sort(() => Math.random() - 0.5);
}

/* ================================================================
   VERB/ADJECTIVE CONJUGATION ROLLER
================================================================ */
export function rollConjugation(entry) {
  const vars = entry.textVariations;
  if (!vars) return null;

  const isAdj = entry.category === 'adjective';

  // Gate: conjugations only available after lesson 19 (basic verbs + 해요체)
  const verbsUnlocked = G.verbCountingUnlocked || G.completedLessons?.includes('19');
  if (!verbsUnlocked) {
    // Always return infinitive (다 form) if verbs lesson not done
    return { isInfinitive: true, conjugatedText: entry.text };
  }

  // ~25% chance: use infinitive (the 다 form as-is)
  if (Math.random() < 0.25) {
    return { isInfinitive: true, conjugatedText: entry.text };
  }

  // Adjective modifier form - only after lesson 20
  const modifierUnlocked = G.modifierUnlocked || G.completedLessons?.includes('20');
  if (isAdj && modifierUnlocked && vars.modifier && Math.random() < 0.20) {
    return { isInfinitive: false, isModifier: true, conjugatedText: vars.modifier };
  }

  // Available formalities gated by lessons
  const formalities = ['haeyoche']; // always available after lesson 19
  if (G.banmalUnlocked || G.completedLessons?.includes('21')) formalities.push('banmal');
  if (G.hasipsiocheUnlocked || G.completedLessons?.includes('28')) formalities.push('hasipsioche');

  const formality = formalities[Math.floor(Math.random() * formalities.length)];
  const tenses = ['present', 'past', 'future'];
  const tense = tenses[Math.floor(Math.random() * tenses.length)];

  const formsForFormality = vars[formality];
  if (!formsForFormality) return { isInfinitive: true, conjugatedText: entry.text };

  let conjugatedText, futureIdx = 0;
  if (tense === 'future') {
    const futArr = formsForFormality.future;
    if (Array.isArray(futArr)) {
      futureIdx = Math.floor(Math.random() * futArr.length);
      conjugatedText = futArr[futureIdx];
    } else {
      conjugatedText = futArr;
    }
  } else {
    conjugatedText = formsForFormality[tense];
  }

  if (!conjugatedText) return { isInfinitive: true, conjugatedText: entry.text };
  return { isInfinitive: false, isModifier: false, formality, tense, futureIdx, conjugatedText };
}

/* ================================================================
   SPEED MODEL (verbatim constants from typing-game.html)
================================================================ */
const READ_SEC_PER_SYL_BASE = 4.2;  // more reading time per syllable (gentler start)
const READ_SEC_REDUCTION    = 0.03; // Cut in half: progression is 50% slower
const READ_SEC_MIN          = 0.40;
const KPS_BASE              = 0.48; // slightly slower initial typing expectation
const KPS_PER_WORLD         = 0.035; // Cut in half: typing speed expectation rises slower
const KPS_CAP               = 3.5;

export function monsterSpeed(words, isBoss) {
  const keys   = monsterKeyCount(words);
  const syls   = countSyllables(words);
  const world  = G.run?.worldIdx || 0;

  const readSec = Math.max(READ_SEC_MIN, READ_SEC_PER_SYL_BASE - world * READ_SEC_REDUCTION);
  const kps     = Math.min(KPS_CAP, KPS_BASE + world * KPS_PER_WORLD);
  const totalSec = syls * readSec + keys / kps;

  const actualTravel = G.vH * 0.88 + 70;
  const basePxPerSec = actualTravel / Math.max(0.5, totalSec);
  let spd = basePxPerSec;

  // Wave speed caps (scaled to screen)
  const REF_H = 800;
  const scale = G.vH / REF_H;
  // World 0 (dojang): all rooms same speed regardless of dojang level
  const wn = G.run?.worldIdx === 0 ? 1 : (G.room?.wave || 1);
  const waveCap = (wn <= 3  ? 45 :
                   wn <= 5  ? 62 :
                   wn <= 10 ? 88 :
                   wn <= 20 ? 130 : Infinity) * scale;
  spd = Math.min(spd, waveCap);
  if (isBoss) spd *= 0.55;
  spd *= 0.88; // global slight reduction for better playability
  // Sloth modifier: all enemies 40% slower
  if (G.run?.slothPerk) spd *= 0.6;

  const maxJitter = Math.min(0.20, 0.05 + world * 0.025);
  const jitter = -maxJitter + Math.random() * 2 * maxJitter;
  spd *= 1 + jitter;
  return Math.max(15 * scale, spd);
}

/* ================================================================
   MONSTER CONSTANTS
================================================================ */
const GENERIC_MONSTERS = ['💩','👹','👺','👻','👽','👾','🤖','🧌','🧟','🧟‍♀️','🕷️','🦟','🦠','🪳','🐀','🐁','🎃','🦇','🦅','🥷'];

/* ── Dojang tutorial word pools (by ring difficulty level) ── */
// Level 1: individual jamo from the standard Korean keyboard layout
const DOJANG_JAMO_L1 = ['ㅂ','ㅈ','ㄷ','ㄱ','ㅅ','ㅛ','ㅕ','ㅑ','ㅐ','ㅔ','ㅁ','ㄴ','ㅇ','ㄹ','ㅎ','ㅗ','ㅓ','ㅏ','ㅣ','ㅋ','ㅌ','ㅊ','ㅍ','ㅠ','ㅜ','ㅡ'];
// Level 2: double/tense consonants + simple syllables + ㅘ-family compound vowels
const DOJANG_JAMO_L2  = ['ㅃ','ㅉ','ㄸ','ㄲ','ㅆ','ㅒ','ㅖ'];
const DOJANG_COMBS_L2 = ['야','다','개','나','고','도','바','사','가','오','노','소','미','비','이','지','기','우','두','부','수','아'];
const DOJANG_VOWELS_L2 = ['봐','과','화','와','놔','봐','계','예','폐','세','혜','얘'];
// Level 3: harder compound vowels (ㅝ/ㅚ/ㅟ/ㅢ) without batchim
const DOJANG_WORDS_L3 = ['훠','뭐','줘','둬','쉬','뒤','위','외','쇠','최','봬','왜','웨','궤','의'];
// Level 4: compound vowels WITH batchim
const DOJANG_WORDS_L4 = ['봤','왔','됐','쇔','획','뭣','권','뭔','뒀','줬'];

function _dojangNinjaEmoji() {
  // 90% light tones (🥷🏻 🥷🏼), 10% darker tones
  return Math.random() < 0.9
    ? (Math.random() < 0.5 ? '🥷🏻' : '🥷🏼')
    : (['🥷🏽','🥷🏾','🥷🏿'])[Math.floor(Math.random() * 3)];
}

function _pickDojangWords(level) {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  switch (level) {
    case 1: return [pick(DOJANG_JAMO_L1)];
    case 2: {
      const r = Math.random();
      if (r < 0.30) return [pick(DOJANG_JAMO_L2)];
      if (r < 0.65) return [pick(DOJANG_COMBS_L2)];
      return [pick(DOJANG_VOWELS_L2)];
    }
    case 3: return [pick(DOJANG_WORDS_L3)];
    case 4: return [pick(DOJANG_WORDS_L4)];
    default: return [pick(DOJANG_JAMO_L1)];
  }
}

function genDojangRoomEnemies(cell) {
  if (cell._templates) return cell._templates;
  const level = cell.dojangLevel || 1;
  const count = cell.enemyCount || 3;
  const templates = [];
  for (let i = 0; i < count; i++) {
    const words  = _pickDojangWords(level);
    const ninja  = _dojangNinjaEmoji();
    const spawn = rollTemplateSpawnPosition(templates.slice(-Math.max(1, groupSize(level))), words, 1);
    templates.push({ type:'normal', hp:1, maxHp:1, words, wordEmoji: ninja, wordEmojis: [ninja],
      spawnNX: spawn.spawnNX, spawnNY: spawn.spawnNY, bodySize: spawn.bodySize,
      wieldIcon: false, special: null });
  }
  cell._templates = templates;
  return templates;
}

function genDojangBoss() {
  // Boss is the 사범 (instructor): random 1-2 char dictionary words, no learning
  const candidates = WORD_DICT.filter(w => w.text.length <= 2 && (w.rel ?? 0) >= 80);
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const words = shuffled.slice(0, 5).map(w => w.text);
  if (!words.length) words.push('도');
  return [{ type:'boss', hp:5, maxHp:5, words, bossEmoji:'🥷', special: null, spdMult:1, bossPhase:0, wieldIcon: false }];
}
const INSTRUMENTS       = ['🎤','🎹','🥁','🪘','🪇','🎷','🎺','🪗','🎸','🎻'];
const NOTES             = ['🎶','🎵','🎼'];
const ARROW_SYLS_EASY   = ['가','나','다','마','바','사','아','자','하','라','카','타','파'];
const ARROW_SYLS_HARD   = ['꽃','닭','삶','읽','많','싫','밝','흙','넋','낚','볶','닮'];
const NOTE_SYLS         = ['아','야','어','여','오','요','우','유','으','이','와','워'];
const ICE_CONSONANTS    = ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

const SPECIAL_WIELD_COLOR = {
  archer:'#4466bb', musician:'#ff99cc', ice:'#88ddff', warrior:'#bbbbbb',
  eruptor:'#ff8800', king:'#ffd700',
};

export const WEAPONS = {
  magic:   { label:'Magic',   e:['🔮','🪄','💫','🌀','⚡','🔥','❄️','🌪️','🧿','💠','🌙','☄️'] },
  love:    { label:'Love',    e:['💘','❤️','💖','💗','💓','💞','💕','🩷','🧡','💛','💚','💙','💜'] },
  weapons: { label:'Weapons', e:['🗡️','🪓','🔪','💣','🧨','⛏️','🪚','🔨','🪃'] },
  ocean:   { label:'Ocean',   e:['🌊','🐙','🦈','🐬','🐟','🐠','🦑','🦀','🐚'] },
  elements:{ label:'Elements',e:['🔥','💧','💨','🪨','❄️','⚡','🌪️','🧊','☄️'] },
  animals: { label:'Animals', e:['🐶','🐱','🐯','🦁','🐘','🦒','🐵','🐸','🐍','🦅','🐝','🦋'] },
};

let _id = 0;

function rollTemplateSpawnPosition(existing, words = [], hp = 1) {
  const scale = Math.max(0.75, G.vH / 800);
  const labelSize = Math.max(20, Math.round((G.hangulSize || 38) * G.vH / 1080));
  const labelChars = Math.max(1, [...words.join('')].length);
  const labelWidth = Math.max(72, labelChars * labelSize * 0.72 + 26);
  const labelHeight = labelSize * 1.35;
  const bodySize = Math.round((40 + Math.max(1, hp) * 18)
    * Math.min(1.45, Math.max(0.72, G.vH / 1080)) * (G.touchMode ? 1.14 : 1));

  const roll = () => {
    const edge = Math.random();
    if (edge < 0.25) {
      return { x: 80 + Math.random() * Math.max(1, G.W - 160), y: G.vH * (0.13 + Math.random() * 0.04) };
    }
    if (edge < 0.5) {
      return { x: G.W * (0.84 + Math.random() * 0.09), y: G.vH * (0.13 + Math.random() * 0.18) };
    }
    if (edge < 0.75) {
      return { x: G.W * (0.07 + Math.random() * 0.09), y: G.vH * (0.13 + Math.random() * 0.18) };
    }
    return { x: 80 + Math.random() * Math.max(1, G.W - 160), y: G.vH * (0.13 + Math.random() * 0.05) };
  };

  const footprint = other => {
    const otherWords = other.words || [];
    const otherSize = Math.max(20, Math.round((G.hangulSize || 38) * G.vH / 1080));
    const otherWidth = Math.max(72, Math.max(1, [...otherWords.join('')].length) * otherSize * 0.72 + 26);
    const otherHeight = otherSize * 1.35;
    const dx = other.spawnNX * G.W;
    const dy = other.spawnNY * G.vH;
    return { dx, dy, width: otherWidth, height: otherHeight, body: other.bodySize || 58 };
  };

  let best = null;
  let bestClearance = -Infinity;
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate = roll();
    let minClearance = Infinity;
    let valid = true;
    for (const other of existing) {
      if (other.spawnNX == null || other.spawnNY == null) continue;
      const o = footprint(other);
      const dx = candidate.x - o.dx;
      const dy = candidate.y - o.dy;
      const dist = Math.hypot(dx, dy);
      const labelGap = (labelWidth + o.width) * 0.5 + 30 * scale;
      const bodyGap = Math.max(105 * scale, (bodySize + o.body) * 0.72);
      // If labels share a horizontal band, enforce a wider horizontal gap so
      // two Korean words cannot sit on top of each other while spawning.
      const required = Math.abs(dy) < Math.max(labelHeight, o.height)
        ? labelGap
        : bodyGap;
      const clearance = dist - required;
      minClearance = Math.min(minClearance, clearance);
      if (clearance < 0) valid = false;
    }
    if (valid) {
      return { spawnNX: candidate.x / G.W, spawnNY: candidate.y / G.vH, bodySize };
    }
    if (minClearance > bestClearance) {
      bestClearance = minClearance;
      best = candidate;
    }
  }

  const fallback = best || roll();
  return { spawnNX: fallback.x / G.W, spawnNY: fallback.y / G.vH, bodySize };
}

/* ================================================================
   MONSTER FACTORY
================================================================ */
export function mkMonster(tmpl) {
  const isBoss = tmpl.type === 'boss';
  // baseSize: reference size at 1080px viewport height (used by the `size` getter below).
  // Reference: 1080px tall screen → boss=108, 1hp-normal=58
  const baseSize = isBoss ? 108 : (40 + (tmpl.hp || 1) * 18);
  // Compute current size once for local use (spawn positioning, etc.).
  const vhRaw   = G.vH / 1080;
  const vhScale = vhRaw <= 1 ? vhRaw : 1 + (vhRaw - 1) * 0.45; // softer above 1080
  const touchBoost = G.touchMode ? 1.14 : 1;
  const size    = Math.round(baseSize * vhScale * touchBoost);
  let spd = G.run?.worldIdx === 0
    ? 28 * (G.vH / 800)   // dojang: fixed slow speed for all rooms
    : monsterSpeed(tmpl.words, isBoss);
  if (G.run?.worldIdx !== 0 && tmpl.spdMult) spd *= tmpl.spdMult;

  // Spawn position & animation
  // spawnNX/spawnNY: normalized landing coords (0..1) so position survives window resize.
  let x, y, spawnNX, spawnNY, spawnAnim = null;
  if (isBoss) {
    // Boss falls from top like any monster, but always lands at center
    const landNY = 0.14;
    x = G.W / 2;
    y = -(size * 3);
    spawnNX = 0.5;
    spawnNY = landNY;
    spawnAnim = { t: 0, dur: tmpl.spawnDur ?? 0.9, landNY };
  } else if (tmpl.isProjectileMonster) {
    // Projectile monsters spawn near their parent - keep current door logic
    const doors = G.room?.openDoors;
    if (doors && doors.length > 0) {
      const door = doors[Math.floor(Math.random() * doors.length)];
      x = door.x + (Math.random() - 0.5) * size * 0.5;
      y = door.y + (Math.random() - 0.5) * size * 0.5;
    } else {
      x = 60 + Math.random() * (G.W - 120);
      y = -(size + 20);
    }
    spawnNX = x / G.W;
    spawnNY = y / G.vH;
  } else if (tmpl.spawnNX !== undefined && tmpl.spawnNY !== undefined) {
    // Use pre-computed position from template (ensures all clients see same landing spot)
    const landX = tmpl.spawnNX * G.W;
    const landY = tmpl.spawnNY * G.vH;
    x = landX;
    y = -(size * 3);
    spawnNX = tmpl.spawnNX;
    spawnNY = tmpl.spawnNY;
    spawnAnim = { t: 0, dur: tmpl.spawnDur ?? 0.65, landNY: tmpl.spawnNY };
  } else {
    // Normal monsters: always spawn near room borders, with spacing check
    const MIN_DIST = Math.max(60, size * 1.8);
    function rollLandPos(edgeOverride) {
      const edge = edgeOverride ?? Math.random();
      if (edge < 0.25) {
        // Top edge - just below ceiling (wallH ≈ 13%)
        return { lx: 80 + Math.random() * (G.W - 160), ly: G.vH * (0.13 + Math.random() * 0.04) };
      } else if (edge < 0.5) {
        // Right edge - far right, below ceiling
        return { lx: G.W * (0.84 + Math.random() * 0.09), ly: G.vH * (0.13 + Math.random() * 0.18) };
      } else if (edge < 0.75) {
        // Left edge - far left, below ceiling
        return { lx: G.W * (0.07 + Math.random() * 0.09), ly: G.vH * (0.13 + Math.random() * 0.18) };
      } else {
        // Upper-center - just below ceiling
        return { lx: 80 + Math.random() * (G.W - 160), ly: G.vH * (0.13 + Math.random() * 0.05) };
      }
    }
    let landX, landY;
    const existing = G.room?.monsters?.filter(m => !m.dead) || [];
    let best = rollLandPos(), bestDist = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      const { lx, ly } = best;
      const minD = existing.reduce((d, m) => Math.min(d, Math.hypot(lx - m.x, ly - m.y)), Infinity);
      if (minD >= MIN_DIST) { landX = lx; landY = ly; break; }
      if (minD > bestDist) { bestDist = minD; landX = lx; landY = ly; }
      best = rollLandPos();
    }
    if (landX === undefined) { landX = best.lx; landY = best.ly; } // fallback
    x = landX;
    y = -(size * 3);
    spawnNX = landX / G.W;
    spawnNY = landY / G.vH;
    spawnAnim = { t: 0, dur: tmpl.spawnDur ?? 0.65, landNY: landY / G.vH };
  }

  // Wield icon - use secondaryEmoji from current word if available
  // (unless already provided in tmpl from saved state)
  let wieldIcon = tmpl.wieldIcon !== undefined ? tmpl.wieldIcon : null;
  if (wieldIcon === null) {
    const firstWord = tmpl.words?.[0];
    const firstEntry = firstWord && WORD_DICT.find(w => w.text === firstWord);
    if (firstEntry?.secondaryEmoji) {
      wieldIcon = firstEntry.secondaryEmoji;
    }
  }

  // HP icon - based on special; if no special, use 📃
  // (unless already provided in tmpl from saved state)
  let hpIcon = tmpl.hpIcon !== undefined ? tmpl.hpIcon : '📃';
  if (tmpl.hpIcon === undefined) {
    if (tmpl.special === 'archer')   hpIcon = '🏹';
    if (tmpl.special === 'ice')      hpIcon = '❄️';
    if (tmpl.special === 'warrior')  hpIcon = '🛡️';
    if (tmpl.special === 'musician') hpIcon = '🎵';
    if (tmpl.special === 'eruptor')  hpIcon = '🌋';
    if (tmpl.special === 'king')     hpIcon = '👑';
  }

  const labelColor = tmpl.special ? (SPECIAL_WIELD_COLOR[tmpl.special] || '#ffdd88') : null;

  let emoji;
  if (isBoss) {
    // The battle body shows the current word's emoji; the persistent boss icon
    // is rendered separately in the upper-left badge and tether.
    const firstWord = tmpl.words?.[0];
    const firstEntry = firstWord && WORD_DICT.find(w => w.text === firstWord);
    emoji = firstEntry?.emoji || tmpl.bossEmoji || '🐉';
  } else if (tmpl.wordEmoji) {
    emoji = tmpl.wordEmoji; // word-emoji monster!
  } else {
    // Fallback: look up emoji from first word in WORD_DICT
    const firstWord = tmpl.words?.[0];
    const dictEntry = firstWord && WORD_DICT.find(w => w.text === firstWord);
    emoji = dictEntry?.emoji || '👾';
  }

  const wordEmojis = tmpl.wordEmojis ? [...tmpl.wordEmojis] : [emoji];

  return {
    id:       ++_id,
    _mpId:    tmpl._mpId ?? null,  // stable ID shared with partner for sync
    type:     tmpl.type || 'normal',
    special:  tmpl.special || null,
    bossEmoji: tmpl.bossEmoji || null,
    emoji, wieldIcon, hpIcon, labelColor,
    x, y,
    spawnNX, spawnNY,  // normalized spawn coords - survives resize
    progress: 0,       // 0 = at spawn, 1 = at player; screen-independent movement state
    hp: tmpl.hp, maxHp: tmpl.maxHp,
    words: [...tmpl.words], wi: 0,
    wordEmojis,
    get word() { return this.words[this.wi] || this.words[0]; },
    baseSize,
    // Dynamic getter: emoji size scales with current viewport, just like spd does.
    get size() {
      const r = G.vH / 1080;
      const s = r <= 1 ? r : 1 + (r - 1) * 0.45;
      return Math.round(this.baseSize * s * (G.touchMode ? 1.14 : 1));
    },
    baseSpd: spd,
    get spd() { return this.baseSpd * (G.vH / G.H); }, // CRITICAL: keep as getter
    tracking: false, dead: false,
    flash: 0,
    wob: Math.random() * Math.PI * 2,
    scl: 1, sclDir: 1,
    parentId: tmpl.parentId || null,
    isProjectileMonster: tmpl.isProjectileMonster || false,
    isIce: tmpl.isIce || false,
    isVerbAdj:       tmpl.isVerbAdj     || false,
    verbAdjType:     tmpl.verbAdjType   || null,
    conjugation:     tmpl.conjugation   || null,
    verbAdjDictWord: tmpl.verbAdjDictWord || null,
    isNumeric:      tmpl.isNumeric      || false,
    numericValue:   tmpl.numericValue   ?? null,
    numericSystem:  tmpl.numericSystem  ?? null,
    _tutorialStop:  tmpl._tutorialStop  || false,
    _openingAttackStop: tmpl._openingAttackStop || false,
    spawnAnim,
  };
}

/* ================================================================
   ROOM WAVE SYSTEM
================================================================ */
export function initRoomSpawner(templates) {
  G.room.wTemplates = [...templates];
  G.room.wPrepared = [];
  G.room.wPending = 0;
  G.room.pendingWordLoad = 0;
  G.room.wKilled   = 0;
  G.room.wTotal    = templates.length;
  G.room.wPhase    = 'spawning';
  const openingCount = Math.min(groupSize(G.room.wave || 1), G.room.wTemplates.length);
  const tutorialState = G.run?.tutorial;
  if (openingCount > 0 && tutorialState && !tutorialState.openingAttackGateUsed) {
    tutorialState.openingAttackGateUsed = true;
    G.room.openingAttackPending = true;
    G.room.openingAttackGroupSize = openingCount;
    for (let i = 0; i < openingCount; i++) {
      G.room.wTemplates[i]._openingAttackStop = true;
    }
  }
  // Tutorial: first monster(s) spawning in worlds 0-1
  if ((G.run?.worldIdx ?? 0) <= 1 && tutorialState && !tutorialState.firstMonsterShown) {
    tutorialState.firstMonsterShown = true;
    if (typeof window !== 'undefined') window._showTutorial?.('⚔️', 'tutorial.typeToKill', null, { allowDuringCombat: true, autoClose: 30 });
    for (let i = 0; i < openingCount; i++) G.room.wTemplates[i]._tutorialStop = true;
  }
  sendNextGroup();
}

/** Release every member of the opening group after the first valid attack. */
export function releaseOpeningAttack({ broadcast = true } = {}) {
  const room = G.room;
  if (!room?.openingAttackPending) return false;
  room.openingAttackPending = false;
  for (const m of room.monsters || []) {
    if (m._openingAttackStop) m._openingAttackStop = false;
  }
  if (broadcast && G.mp?.active) {
    mpSend({
      type: 'opening_attack_started',
      col: G.currentRoom?.col ?? null,
      row: G.currentRoom?.row ?? null,
    });
  }
  return true;
}

function groupSize(wn) {
  const base = wn <= 3 ? 1 : wn <= 7 ? 2 : wn <= 15 ? 2 : wn <= 25 ? 3 : 4;
  // Co-op: minimum group of 2 so both players always have a monster to fight simultaneously
  return G.mp?.active ? Math.max(2, base) : base;
}

function wordCap(wn) {
  if (wn <= 5)  return 5;
  if (wn <= 10) return 7;
  if (wn <= 20) return 10;
  return 13;
}

function _prepared(room) {
  return room.wPrepared || (room.wPrepared = []);
}

function _templateCount(room) {
  return (room.wTemplates?.length || 0) + _prepared(room).length;
}

function _takeNextTemplate(room) {
  return _prepared(room).shift() || room.wTemplates?.shift() || null;
}

function _isFlowEligible(room = G.room) {
  // The tutorial should retain its deliberate cadence. Co-op remains on the
  // conservative cap until spawn timing is made host-authoritative.
  return !!room && !G.mp?.active && !(G.run?.tutorial && (G.run?.worldIdx ?? 0) <= 1);
}

function _recordSuccessfulFire(room) {
  if (!_isFlowEligible(room)) return;
  const now = performance.now();
  const flow = room.flow || (room.flow = { level: 0, rapidStreak: 0, lastFireAt: 0 });
  const gap = flow.lastFireAt ? now - flow.lastFireAt : null;
  flow.lastFireAt = now;

  if (gap == null) return;
  if (gap <= 1450) flow.rapidStreak = Math.min(8, (flow.rapidStreak || 0) + 1);
  else flow.rapidStreak = Math.max(0, (flow.rapidStreak || 0) - 2);

  flow.level = flow.rapidStreak >= 6 ? 2 : flow.rapidStreak >= 3 ? 1 : 0;
}

function _targetCap(room) {
  const base = groupSize(room.wave || 1);
  const bonus = _isFlowEligible(room) ? (room.flow?.level || 0) : 0;
  return Math.min(4, base + bonus);
}

function _normalMonsters(room, { includeCommitted = true } = {}) {
  return room.monsters.filter(m =>
    !m.dead && !m.isProjectileMonster && (includeCommitted || !m.defeatCommitted)
  );
}

function _maybeFinishEmptyRoom(room) {
  if (G.room !== room || room.wPhase !== 'spawning') return;
  if (_templateCount(room) > 0 || (room.wPending || 0) > 0) return;
  // A committed final kill stays visible until its projectile connects. Do not
  // pay rewards or remove it from the room before that visual resolution.
  if (_normalMonsters(room).length === 0) onRoomCleared();
}

function _scheduleMonsterSpawn(room, tmpl, { delay = 0, spawnDur = null } = {}) {
  if (!tmpl) return false;
  room.wPending = (room.wPending || 0) + 1;
  room.pendingWordLoad = (room.pendingWordLoad || 0) + (tmpl.words?.length || 1);
  const scheduledTemplate = spawnDur == null ? tmpl : { ...tmpl, spawnDur };

  setTimeout(() => {
    // A queued callback must never populate a room that has since been left.
    if (G.room === room && G.phase === 'run' && room.wPhase === 'spawning') {
      room.monsters.push(mkMonster(scheduledTemplate));
    }
    room.wPending = Math.max(0, (room.wPending || 0) - 1);
    room.pendingWordLoad = Math.max(0, (room.pendingWordLoad || 0) - (tmpl.words?.length || 1));
    _maybeFinishEmptyRoom(room);
  }, Math.max(0, delay));
  return true;
}

function sendNextGroup({ count = null, stagger = null, spawnDur = null } = {}) {
  const room = G.room;
  if (!room || !_templateCount(room)) return;
  const wn = room.wave || 1;
  const n = count ?? groupSize(wn);
  // Entrance groups remain cinematic. Reactive combat spawns use their own,
  // much tighter stagger below.
  const groupStagger = stagger ?? (wn <= 4 ? 1000 : wn <= 8 ? 700 : wn <= 15 ? 500 : 350);
  for (let i = 0; i < n && _templateCount(room) > 0; i++) {
    const tmpl = _takeNextTemplate(room);
    _scheduleMonsterSpawn(room, tmpl, { delay: i * groupStagger, spawnDur });
  }
}

// Reserve a template as soon as the player has completed a valid word. It is
// intentionally invisible until Enter, so a correction/backspace never creates
// a phantom enemy, but the generator work is already out of the critical path.
export function primeNextSpawn() {
  const room = G.room;
  if (!room || room.wPhase !== 'spawning' || room.exitUnlocked) return false;
  if (_prepared(room).length || !room.wTemplates?.length) return false;
  _prepared(room).push(room.wTemplates.shift());
  return true;
}

// Keep an appropriate number of readable targets on screen. A normal player
// gets the historical group size; sustained fast typing earns one or two
// additional incoming targets, with no fixed post-kill downtime.
function _maybeTriggerSpawn({ projectileFlightMs = 0 } = {}) {
  const room = G.room;
  if (!room || room.wPhase !== 'spawning' || room.exitUnlocked || !_templateCount(room)) return;

  const active = _normalMonsters(room, { includeCommitted: false }).length;
  const cap = _targetCap(room);
  let slots = Math.max(0, cap - active - (room.wPending || 0));
  let wordLoad = _normalMonsters(room, { includeCommitted: false })
    .reduce((sum, m) => sum + (m.words?.length || 1), 0) + (room.pendingWordLoad || 0);
  const flowLevel = _isFlowEligible(room) ? (room.flow?.level || 0) : 0;
  const stagger = flowLevel >= 2 ? 70 : flowLevel >= 1 ? 110 : 150;
  const spawnDur = projectileFlightMs > 0
    ? Math.max(0.28, Math.min(0.65, projectileFlightMs / 1000 * 0.9))
    : 0.42;

  for (let i = 0; i < slots && _templateCount(room) > 0; i++) {
    const tmpl = _takeNextTemplate(room);
    const nextWords = tmpl.words?.length || 1;
    if (wordLoad + nextWords > wordCap(room.wave || 1)) {
      _prepared(room).unshift(tmpl);
      break;
    }
    _scheduleMonsterSpawn(room, tmpl, { delay: i * stagger, spawnDur });
    wordLoad += nextWords;
  }
}

export function onMonsterRemoved(m) {
  G.room.wKilled++;
  if (G.run && !m?.isProjectileMonster) G.run.monstersKilled++;
  // Tutorial: hide "type to kill" when first (tutorial) monster dies
  if (m?._tutorialStop && typeof window !== 'undefined') window._hideTutorial?.();
  const remaining = G.room.monsters.filter(m => !m.dead && !m.isProjectileMonster).length
                  + _templateCount(G.room)
                  + (G.room.wPending || 0); // include in-flight stagger spawns
  if (remaining === 0 && G.room.wPhase === 'spawning') {
    onRoomCleared();
    return;
  }
  _maybeTriggerSpawn();
}

function checkStall() {
  if (G.room.wPhase !== 'spawning') return;
  const realAlive = G.room.monsters.filter(m => !m.dead && !m.isProjectileMonster).length;
  const templatesLeft = _templateCount(G.room) + (G.room.wPending || 0);
  if (realAlive === 0 && templatesLeft === 0) onRoomCleared();
}

/* ================================================================
   FLEE EFFECTS
================================================================ */
export function startFleeEffects(cell) {
  // 1. Stop pending spawns
  if (G.room.wPhase === 'spawning') G.room.wPhase = 'fled';

  // 2. Save room state snapshot for when player returns
  const spawnedIdx = cell._templates
    ? cell._templates.length - (G.room.wTemplates?.length || 0) - (G.room.wPrepared?.length || 0) - (G.room.wPending || 0)
    : 0;

  cell._savedRoom = {
    spawnedIdx: Math.max(0, spawnedIdx),
    wKilled: G.room.wKilled || 0,
    wTotal:  G.room.wTotal  || 0,
    openingAttackPending: !!G.room.openingAttackPending,
    openingAttackGroupSize: G.room.openingAttackGroupSize || 0,
    monsters: G.room.monsters.filter(m => !m.dead).map(m => ({
      type: m.type, hp: m.hp, maxHp: m.maxHp,
      words: [...(m.words || [])], word: m.word,
      wordEmoji: m.emoji,            // m.emoji is what mkMonster derived; no wordEmoji prop on monster
      wordEmojis: m.wordEmojis ? [...m.wordEmojis] : undefined,
      emoji: m.emoji, special: m.special, spdMult: m.spdMult,
      wieldIcon: m.wieldIcon, hpIcon: m.hpIcon,
      bossEmoji: m.bossEmoji, bossPhase: m.bossPhase,
      isIce: m.isIce, isProjectileMonster: m.isProjectileMonster,
      isVerbAdj: m.isVerbAdj, verbAdjType: m.verbAdjType,
      conjugation: m.conjugation, verbAdjDictWord: m.verbAdjDictWord,
      isNumeric: m.isNumeric || false,
      numericValue: m.numericValue ?? null,
      numericSystem: m.numericSystem ?? null,
      _openingAttackStop: !!m._openingAttackStop,
      spawnNX: m.spawnNX ?? (m.x / G.W),
    })),
  };

  // 3. Trigger flee animation on alive monsters
  for (const m of G.room.monsters) {
    if (m.dead) continue;
    m.fleeing = true;
    m.fleeAlpha = 1;
    m.fleeVY = -(220 + Math.random() * 120);
  }

  // 3b. Explode coins on flee (pool is lost)
  explodeCoins();

  // Floor drops belong to the room in the current dungeon. Fleeing removes
  // their DOM nodes, but deliberately keeps their records for re-entry.
  detachGroundItems(cell);
}

/* ================================================================
   ROOM CLEAR
================================================================ */
let _onRoomClearedCallback = null;
export function setRoomClearedCallback(cb) { _onRoomClearedCallback = cb; }

let _onCoinsCollectedCallback = null;
export function setCoinsCollectedCallback(cb) { _onCoinsCollectedCallback = cb; }

function onRoomCleared() {
  if (G.room.wPhase === 'clear') return;
  G.room.wPhase = 'clear';
  G.room.exitUnlocked = true;
  G.room.clearPending = false;
  G.mode = 'navigate';
  sfx('roomClear');
  if (_onRoomClearedCallback) _onRoomClearedCallback();
}

// Finish a logically-cleared room before its room object is discarded. This is
// called by enterRoom when a hyper typer has already walked through a door
// while the last projectile was still travelling.
export function finalizePendingCombat() {
  const room = G.room;
  if (!room?.clearPending || room.wPhase === 'clear') return false;
  for (const m of [...room.monsters]) {
    if (!m.dead && m.defeatCommitted) hitMonster(m);
  }
  _maybeFinishEmptyRoom(room);
  return true;
}

/* ================================================================
   ROOM ENEMY GENERATION (adapted from genWave)
================================================================ */
function calcHP(wn) {
  if (wn < 5)  return 1;
  if (wn < 8)  return Math.random() < 0.12 ? 2 : 1;
  if (wn < 12) return Math.random() < 0.08 ? 3 : Math.random() < 0.25 ? 2 : 1;
  if (wn < 20) { const r = Math.random(); return r < 0.05 ? 4 : r < 0.18 ? 3 : r < 0.40 ? 2 : 1; }
  const r = Math.random(); return r < 0.06 ? 5 : r < 0.15 ? 4 : r < 0.28 ? 3 : r < 0.50 ? 2 : 1;
}

function roomBudget(wn, enemyCount) {
  // enemyCount is pre-set by dungeon generator; budget = sum of HP points
  const base = 1 + Math.floor(wn / 3);
  return enemyCount * base;
}

function specialCap(wn) {
  if (wn < 5)  return 0;
  if (wn < 10) return 1;
  if (wn < 20) return 1;
  return 2;
}

function specialChance(wn) {
  if (wn < 5)  return 0;
  if (wn < 10) return 0.12;
  if (wn < 20) return 0.20;
  return 0.28;
}

function pickSpecialType(wn) {
  const pool = ['archer', 'musician'];
  if (wn >= 10) pool.push('ice', 'warrior');
  return pool[Math.floor(Math.random() * pool.length)];
}

function _applyVerbAdjConj(tmpl) {
  const dictEntry = WORD_DICT.find(d => d.text === tmpl.words[0]);
  if (!dictEntry?.textVariations) return;
  if (dictEntry.category !== 'verb' && dictEntry.category !== 'adjective') return;
  const conj = rollConjugation(dictEntry);
  if (!conj) return;
  tmpl.isVerbAdj     = true;
  tmpl.verbAdjType   = dictEntry.category;
  tmpl.conjugation   = conj;
  tmpl.verbAdjDictWord = dictEntry.text;   // original 다-form for translation lookup
  tmpl.words         = [conj.conjugatedText];
  tmpl.wordEmoji     = dictEntry.emoji;
  tmpl.wordEmojis    = [dictEntry.emoji];
}

function genNumericTemplate() {
  // Only available after the numbers lesson (lesson id '3')
  if (!G.completedLessons?.includes('3')) return null;

  // Build known word set from learned words + lesson-unlocked words
  const knownSet = new Set((G.learnedWords || []).map(lw => lw.text));
  (G.completedLessons || []).forEach(id => {
    const lesson = LESSONS_BASE.find(l => l.id === id);
    lesson?.unlockedWords?.forEach(w => {
      const { text } = parseLessonWord(w);
      knownSet.add(text);
    });
  });

  const sinoN   = genSinoNumber(knownSet);
  const nativeN = genNativeNumber(knownSet);
  if (!sinoN && !nativeN) return null;

  // Choose system: bias 60% toward sino
  const useSino = !nativeN || (sinoN && Math.random() < 0.60);
  let numericValue, numericSystem, spelling;
  if (useSino && sinoN) {
    numericValue  = sinoN;
    numericSystem = 'sino';
    spelling      = sinoSpelling(sinoN);
  } else if (nativeN) {
    numericValue  = nativeN;
    numericSystem = 'native';
    spelling      = nativeSpelling(nativeN);
  } else {
    return null;
  }

  return {
    type: 'normal', hp: 1, maxHp: 1,
    words: [spelling], wordEmoji: '#️⃣', wordEmojis: ['#️⃣'],
    wieldIcon: '🔢',
    isNumeric: true, numericValue, numericSystem,
  };
}

export function genRoomEnemies(cell) {
  // Deterministic per-room: return cached templates if already generated
  if (cell._templates) return cell._templates;

  // Dojang tutorial: use jamo-based enemies, no dictionary words
  if (G.dungeon?.worldDef?.isDojangTutorial) {
    if (cell.type === 'boss') {
      const t = genDojangBoss();
      cell._templates = t;
      return t;
    }
    return genDojangRoomEnemies(cell);
  }

  const wn = cell.waveNum;

  if (cell.type === 'boss') {
    // In multiplayer each player fights their own boss (2 bosses total in room)
    const t = genBoss(wn);
    cell._templates = t;
    return t;
  }

  // In multiplayer, double the enemy count (two monsters spawn simultaneously)
  const mpMult = (G.mp?.active) ? 2 : 1;
  const count = (cell.enemyCount || 2) * mpMult;
  const templates = [];
  let spent = 0;
  const budget = count * Math.max(1, Math.floor(wn / 4));
  let specialCount = 0;
  const cap    = specialCap(wn);
  const chance = specialChance(wn);

  while (spent < budget && templates.length < count * 3) {
    const hp  = calcHP(wn);
    if (spent + hp > budget + 1 && templates.length > 0) break;

    const words = pickWordsForMonster(wn, hp);
    const wordEmojis = words.map(w => WORD_DICT.find(d => d.text === w)?.emoji || null);
    const wordEmoji = wordEmojis[0];

    let tmpl = { type:'normal', hp, maxHp:hp, words, wordEmoji, wordEmojis };

    if (specialCount < cap && Math.random() < chance) {
      // Specials: always noVerbAdj (specials have special visual mechanics that conflict)
      const stype = pickSpecialType(wn);
      const specialWords = pickWordsForMonster(wn, 1, { noVerbAdj: true });
      const specialEmojis = specialWords.map(w => WORD_DICT.find(d => d.text === w)?.emoji || null);
      tmpl = { type:'normal', hp:1, maxHp:1, words:specialWords, wordEmoji:specialEmojis[0],
               wordEmojis:specialEmojis, special:stype, spdMult:0.55 };
      specialCount++;
      spent += 1;
    } else {
      spent += hp;
    }

    // Apply conjugation to 1-HP normal (non-special) monsters with verb/adj words
    if (!tmpl.special && tmpl.hp === 1) {
      _applyVerbAdjConj(tmpl);
    }

    const spawn = rollTemplateSpawnPosition(templates.slice(-Math.max(1, groupSize(wn))), tmpl.words, tmpl.hp);
    tmpl.spawnNX = spawn.spawnNX;
    tmpl.spawnNY = spawn.spawnNY;
    tmpl.bodySize = spawn.bodySize;

    templates.push(tmpl);
  }

  // Inject a numeric monster (~28% chance, requires numbers lesson)
  const numericTmpl = genNumericTemplate();
  if (numericTmpl && Math.random() < 0.28) {
    const spawn = rollTemplateSpawnPosition(templates.slice(-Math.max(1, groupSize(wn))), numericTmpl.words, numericTmpl.hp);
    numericTmpl.spawnNX = spawn.spawnNX;
    numericTmpl.spawnNY = spawn.spawnNY;
    numericTmpl.bodySize = spawn.bodySize;
    templates.push(numericTmpl);
  }

  // Guarantee at least 1 enemy
  if (!templates.length) {
    const words = pickWordsForMonster(wn, 1);
    const wordEmojis = words.map(w => WORD_DICT.find(d => d.text === w)?.emoji || null);
    const fallback = { type:'normal', hp:1, maxHp:1, words, wordEmoji: wordEmojis[0], wordEmojis };
    _applyVerbAdjConj(fallback);
    const spawn = rollTemplateSpawnPosition(templates.slice(-Math.max(1, groupSize(wn))), fallback.words, fallback.hp);
    fallback.spawnNX = spawn.spawnNX;
    fallback.spawnNY = spawn.spawnNY;
    fallback.bodySize = spawn.bodySize;
    templates.push(fallback);
  }

  cell._templates = templates;
  return templates;
}

function genBoss(wn) {
  const worldIdx = G.run?.worldIdx || 0;
  const hp = Math.min(4 + worldIdx, 12); // Stretched: reaches max HP at world 8 instead of 4
  // Boss words: skip the hp-based reduction and boost waveNum for harder words
  const bossWn = wn + 10;
  const words = pickBossWords(bossWn, hp);
  // Every boss must have a special - no exceptions, not even in tutorial
  const bossSpecials = ['archer', 'ice', 'musician', 'warrior', 'eruptor', 'king'];
  const bossSpecial = bossSpecials[Math.floor(Math.random() * bossSpecials.length)];
  const world = G.dungeon?.worldDef;
  return [{
    type: 'boss', hp, maxHp: hp, words,
    bossEmoji: world?.bossEmoji || '🐉',
    special: bossSpecial,
    spdMult: 0.40, // Bosses with specials always get 0.40 speed multiplier
    bossPhase: 0,
  }];
}

/* ================================================================
   PROJECTILE SYSTEM
================================================================ */
let _wgroup = 'magic';
let _nextSpell = '🔮';
export function setWeaponGroup(wg) { _wgroup = wg; rollNextSpell(); }
export function getNextSpell() { return _nextSpell; }

function rollNextSpell() {
  const we = WEAPONS[_wgroup]?.e || WEAPONS.magic.e;
  _nextSpell = we[Math.floor(Math.random() * we.length)];
  const ico = document.getElementById('spell-ico');
  if (ico) ico.textContent = _nextSpell;
}

function _willShotDefinitelyKill(m) {
  if (!m || m.dead || m.isProjectileMonster) return false;
  // Bosses can synchronously create phase reinforcements when hit. Keep their
  // finale on the established resolution path until that special case has a
  // dedicated cinematic-aware unlock flow.
  if (m.type === 'boss') return false;
  if (m.special === 'warrior' && m.shielded) return false;
  // The shield effect consumes the incoming hit, so do not unlock a room on
  // a prediction that we already know will be blocked.
  if (G.run?.shieldHits > 0) return false;
  // A stored critical can be spent by another in-flight projectile first
  // (for example, a double shot), so only base one-damage kills are safe to
  // resolve ahead of impact.
  return m.hp <= 1;
}

function _maybeUnlockRoomExit(room) {
  if (!room || room.exitUnlocked || room.wPhase !== 'spawning') return false;
  if (_templateCount(room) > 0 || (room.wPending || 0) > 0) return false;
  const stillFighting = _normalMonsters(room, { includeCommitted: false });
  if (stillFighting.length) return false;
  // Gameplay can advance immediately; the normal clear callback still runs on
  // impact so coins, vocabulary, map state, and boss rewards stay one-shot.
  room.exitUnlocked = true;
  room.clearPending = true;
  G.mode = 'navigate';
  return true;
}

// Projectile travel begins at the original pace. A 60 WPM attempt (using the
// game's 5-jamo WPM convention) is that baseline: 200 ms per jamo. The bonus
// scales continuously until 120 WPM, where it reaches the deliberate 2× cap.
const PROJECTILE_BASE_SPEED = 520;
const PROJECTILE_BASE_MS_PER_JAMO = 200;
const PROJECTILE_MAX_TYPING_MULTIPLIER = 2;

export function projectileSpeedMultiplierForTyping(typedJamo, elapsedMs) {
  const jamo = Math.max(1, Number(typedJamo) || 1);
  const elapsed = Number(elapsedMs);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 1;
  const baselineMs = jamo * PROJECTILE_BASE_MS_PER_JAMO;
  return Math.max(1, Math.min(
    PROJECTILE_MAX_TYPING_MULTIPLIER,
    baselineMs / Math.max(1, elapsed),
  ));
}

export function fire(monster, { typedJamo = null, typingDurationMs = null } = {}) {
  if (!monster || monster.dead || monster.firedAt || monster.defeatCommitted) return false;
  // Starting the first valid projectile is enough to release the opening group;
  // do not make the player wait for that projectile to travel before movement resumes.
  releaseOpeningAttack();
  sfx('arrowShoot');
  const emoji = _nextSpell || '🔮';
  const px    = G.W / 2;
  const emojiElF = document.getElementById('pl-emoji');
  let py;
  if (emojiElF) {
    const r = emojiElF.getBoundingClientRect();
    py = r.top + r.height * 0.5;
  } else {
    const paEl = document.getElementById('player-area');
    py = G.vH - (paEl ? paEl.offsetHeight + 10 : 90) - 30;
  }
  const dx    = monster.x - px, dy = monster.y - py;
  const d     = Math.hypot(dx, dy) || 1;
  const typingSpeedMult = projectileSpeedMultiplierForTyping(typedJamo, typingDurationMs);
  const spd   = PROJECTILE_BASE_SPEED * (G.run?.projSpeedMult || 1) * typingSpeedMult;
  const projectileFlightMs = d / spd * 1000;
  const room = G.room;

  G.room.projs.push({
    x: px, y: py, emoji,
    tid: monster.id,
    vx: dx/d * spd, vy: dy/d * spd,
    rot: 0, rs: (Math.random() - 0.5) * 18,
    size: Math.round(48 * G.vH / 1080), dead: false,
    speed: spd,
    born: performance.now(),
  });

  if (G.run?.doubleShot) {
    // Second projectile targets a different alive monster
    const others = (G.room?.monsters || []).filter(m =>
      !m.dead && !m.firedAt && !m.defeatCommitted && m.id !== monster.id
    );
    const t2 = others[Math.floor(Math.random() * others.length)];
    if (t2) {
      const dx2 = t2.x - px, dy2 = t2.y - py, d2 = Math.hypot(dx2, dy2) || 1;
      G.room.projs.push({
        x: px, y: py, emoji,
        tid: t2.id,
        vx: dx2/d2 * spd, vy: dy2/d2 * spd,
        rot: 0, rs: -(Math.random() - 0.5) * 18,
        size: Math.round(40 * G.vH / 1080), dead: false,
        speed: spd,
        born: performance.now(),
      });
      t2.firedAt = true;
      if (_willShotDefinitelyKill(t2)) t2.defeatCommitted = true;
    }
  }

  // Mark primary target as in-flight. If this is the final deterministic hit,
  // navigation opens now while the projectile remains visible and resolves.
  monster.firedAt = true;
  if (_willShotDefinitelyKill(monster)) monster.defeatCommitted = true;
  _recordSuccessfulFire(room);
  _maybeUnlockRoomExit(room);
  _maybeTriggerSpawn({ projectileFlightMs });

  // Multiplayer: broadcast projectile so partner can see it in their view
  if (G.mp?.active) {
    mpSend({
      type:  'proj_fire',
      emoji, px, py,
      projectileSpeed: spd,
      mpId:  monster._mpId ?? null,
      words: monster.words,  // fallback for _mpId lookup
    });
  }

  rollNextSpell();
  return true;
}

/* ================================================================
   PARTICLES
================================================================ */
export function explode(x, y, sz) {
  G.room.parts.push({ x, y, emoji:'💥', size: sz * 0.95, life:1, vy:-50 });
  for (let i = 0; i < 6; i++) {
    const a = Math.random()*Math.PI*2, s = 40+Math.random()*100;
    G.room.parts.push({
      x, y,
      emoji: ['⭐','✨','💫','🌟'][i % 4],
      size: 10 + Math.random() * 13, life:1,
      vx: Math.cos(a)*s, vy: Math.sin(a)*s,
    });
  }
}

/* ================================================================
   HIT & DAMAGE
================================================================ */
let _onHitCallback = null;
export function setOnHitCallback(cb) { _onHitCallback = cb; }

export function hitMonster(m) {
  if (m.special === 'warrior' && m.shielded) { m.firedAt = false; m.defeatCommitted = false; return; }
  if (m.type === 'boss' && m.special === 'king' && m.kingWaiting) { m.firedAt = false; m.defeatCommitted = false; return; }

  // The first valid hit releases the entire opening group, including in co-op.
  releaseOpeningAttack();

  // Shield perk
  if (G.run?.shieldHits > 0 && !m.isProjectileMonster) {
    G.run.shieldHits--;
    m.firedAt = false;
    m.defeatCommitted = false;
    sfx('damageBlocked');
    flashAnnounce('🛡️ Blocked!', '#88aaff');
    return;
  }

  let dmg = (G.critShots > 0) ? 2 : 1;
  if (G.critShots > 0) {
    G.critShots--;
    if (G.critShots === 0) { G.activeEffect = null; refreshInventoryUI(); }
  }
  // Punching Glove: 20% crit chance
  const gloveGrit = G.run?.punchingGlove && Math.random() < 0.20;
  if (gloveGrit) { dmg = 2; flashAnnounce('🥊 Critical!', '#ff9900'); }

  m.flash = 1;
  m.hp -= dmg;
  explode(m.x, m.y, m.size);


  // Score → room pool (added to wallet only on room clear, lost on flee)
  const mult = (G.activeEffect?.type === 'double') ? 2 : 1;
  let coinMult = G.run?.coinMult || 1;
  if (G.run?.treasurePerk) coinMult *= 1.3 + Math.random() * 0.7;
  if (G.activeEffect?.type === 'greedy') coinMult *= 3;
  if (G.run?.godRunActive) coinMult *= 5;
  const coinGain = Math.floor((G.room.wave || 1) * m.maxHp * coinMult * mult);
  G.room.roomPool = (G.room.roomPool || 0) + coinGain;

  // Boss phase check
  if (m.type === 'boss' && !m.dead) {
    const pct = m.hp / m.maxHp;
    if (m.bossPhase === 0 && pct <= 0.5) {
      m.bossPhase = 1;
      spawnBossReinforcements(m);
    } else if (m.bossPhase === 1 && pct <= 0.25) {
      m.bossPhase = 2;
      // Non-King bosses get one compact final wave. It adds concurrent targets
      // instead of simply inflating their HP; the King keeps its established
      // ninja cadence and quantity.
      if (m.special !== 'king') spawnBossReinforcements(m, { latePhase: true });
      // Force activate special ability
      if (m.special === 'eruptor') { m.eruptActive = 5; m.nextFireball = 0; }
      if (m.special === 'king' && !m.kingWaiting) { m.kingCooldown = 0; }
    }
  }

  if (m.hp <= 0) {
    m.dead = true;
    // ── Multiplayer: broadcast kill so P2 removes same monster ──
    if (G.mp?.active && !m.isProjectileMonster) {
      // Send word entries so partner can sync vocabulary progress
      const wordEntries = m.words.map(w => {
        const def = WORD_DICT.find(d => d.text === w);
        const entry = { text: w, emoji: def?.emoji || m.emoji || '', category: def?.category || '' };
        // Include conjugation data for verbs/adjectives so partner can sync conjugation counts
        if ((def?.category === 'verb' || def?.category === 'adjective') &&
            m.conjugation?.tense && m.conjugation?.formality) {
          entry.conjKey       = `${m.conjugation.tense}-${m.conjugation.formality}`;
          entry.verbDictWord  = m.verbAdjDictWord || w;
        }
        return entry;
      });
      mpSend({ type: 'monster_kill', words: m.words, mpId: m._mpId ?? null, wordEntries });
    }
    sfx(m.isProjectileMonster ? 'monsterDamage' : 'monsterDeath');
    const killBonus = Math.floor((G.room.wave || 1) * m.maxHp * 4 * coinMult * mult);
    G.room.roomPool = (G.room.roomPool || 0) + killBonus;
    // Update pending counter live
    const _pEl = document.getElementById('hs-best');
    if (_pEl) _pEl.textContent = formatKoreanNumber(G.room.roomPool);
    const _pRow = document.getElementById('hs-best-row');
    if (_pRow) _pRow.hidden = false;

    // Spawn coin particles from dead monster (1–3 coins)
    if (!m.isProjectileMonster) spawnCoins(m.x, m.y, 1 + Math.floor(Math.random() * 3));

    // Track kill counts for memorization system (nouns only - not verbs/adjectives)
    if (!m.isProjectileMonster && m.type !== 'boss') {
      for (const w of m.words) {
        const wordDef = WORD_DICT.find(d => d.text === w);
        // Only track non-verb, non-adjective words for hidden word system
        // (verbs/adjectives have their own separate system with different mechanics)
        if (wordDef && wordDef.category !== 'verb' && wordDef.category !== 'adjective') {
          incrementWordKillCount(w);
        }
        // Track conjugation usage for verbs/adjectives (only when tense+formality are known)
        else if (wordDef && (wordDef.category === 'verb' || wordDef.category === 'adjective') && m.conjugation?.tense && m.conjugation?.formality) {
          const conjKey = `${m.conjugation.tense}-${m.conjugation.formality}`;
          incrementWordConjugationCount(m.verbAdjDictWord || w, conjKey);
        }
      }
    }

    // Track learned words (skip in dojang tutorial; only real vocabulary)
    if (!m.isProjectileMonster && !G.dungeon?.worldDef?.noLearning) {
      if (!G.learnedWords) G.learnedWords = [];
      const newWordsList = [];
      for (const w of m.words) {
        if (!G.learnedWords.find(lw => lw.text === w)) {
          const wordDef = WORD_DICT.find(d => d.text === w);
          if (wordDef) {  // Only track real vocabulary words (not numeric compounds)
            G.learnedWords.push({ text: w, emoji: wordDef.emoji || '' });
            newWordsList.push({ text: w, emoji: wordDef.emoji || '' });
          }
        }
      }
      if (newWordsList.length) {
        savePersistentState();
        showDictUnlockNotif(newWordsList);
      }
    }
    if (m.type === 'boss') killBossMinions(m.id);
    if (!m.isProjectileMonster) {
      onMonsterRemoved(m);
      if (m.type !== 'boss' && shouldDropItem()) {
        spawnGroundItem(m.x, m.y - 20);
      }
    } else {
      checkStall();
    }
  } else {
    // This target is ready for its next word as soon as the hit resolves.
    // Keeping firedAt strictly in-flight prevents duplicate projectiles while
    // still allowing multi-HP enemies to remain part of the target cap.
    m.firedAt = false;
    m.defeatCommitted = false;
    // Knockback: push away from player
    {
      const emojiElK = document.getElementById('pl-emoji');
      let kbPy;
      if (emojiElK) {
        const r = emojiElK.getBoundingClientRect();
        kbPy = r.top + r.height * 0.5;
      } else {
        const paEl = document.getElementById('player-area');
        kbPy = G.vH - (paEl ? paEl.offsetHeight + 10 : 90) + 10;
      }
      const dx = m.x - G.W / 2, dy = m.y - kbPy;
      const dist = Math.hypot(dx, dy) || 1;
      const kbPow = G.run?.punchingGlove ? 200 : 100;
      m.kbVx = (dx / dist) * kbPow;
      m.kbVy = (dy / dist) * kbPow;
    }
    // Stun briefly at new position
    m._stunned = true;
    m._stunnedTimer = 0.35;
    // Shapeshift to next word
    const oldEmoji = m.emoji;
    m.wi = Math.min(m.wi + 1, m.words.length - 1);
    const nextDef = WORD_DICT.find(d => d.text === m.words[m.wi]);
    if (nextDef) {
      m.emoji = nextDef.emoji;
      if (m.wieldIcon !== false) {
        m.wieldIcon = nextDef.secondaryEmoji || null;
      }
    }
    m.shapeshift = { t: 0, dur: 0.75, from: oldEmoji };
    m.scl = 1.3;
  }
}

function spawnBossReinforcements(boss, { latePhase = false } = {}) {
  const room = G.room;
  const wn = room.wave;
  const biome = G.dungeon?.worldDef?.id || 'forest';
  // The King retains the old 2–3 generic reinforcement count; its dedicated
  // ninja summons are intentionally untouched. Other bosses make the fight
  // denser at half health and receive a smaller final-wave pulse.
  const count = boss.special === 'king'
    ? 2 + Math.floor(Math.random() * 2)
    : latePhase ? 2 : 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const words = pickWordsForMonster(wn, 1, biome);
    const entry = WORD_DICT.find(w => w.text === words[0]);
    setTimeout(() => {
      if (G.phase === 'run' && G.room === room && !boss.dead) {
        room.monsters.push(mkMonster({
          // Reinforcements test multitarget pressure, not repeated copies of
          // a word. One word therefore always means one decisive hit.
          type:'normal', hp:1, maxHp:1, words,
          wordEmoji: entry?.emoji || null,
          spdMult: latePhase ? 1.15 : 1.1,
        }));
      }
    }, i * (latePhase ? 500 : 550));
  }
  flashAnnounce('🐉 Reinforcements!', '#ff8800');
}

function killBossMinions(bossId) {
  for (const m of G.room.monsters) {
    if (!m.dead && m.parentId === bossId) {
      explode(m.x, m.y, m.size);
      m.dead = true;
    }
  }
}

export function hurtPlayer(dmg = 1) {
  if (G.godMode) return;
  // Block perk: 20% chance to block
  if (G.run?.blockChance && Math.random() < 0.20) {
    flashAnnounce('🛡️ Blocked!', '#88aaff');
    return;
  }
  // Thorn Armor: halve damage; 33% full block if hit is only 1
  if (G.run?.halfDamage) {
    if (dmg === 1 && Math.random() < 0.33) {
      flashAnnounce('🌵 Blocked!', '#44cc44');
      return;
    }
    dmg = Math.max(1, Math.ceil(dmg * 0.5));
  }
  // Dummy Turtle: 50% damage reduction in worlds 1–5
  const wi = G.run?.worldIdx ?? 0;
  if (G.run?.dummyTurtle && wi >= 1 && wi <= 5) {
    dmg = Math.max(1, Math.ceil(dmg * 0.5));
  }
  G.playerHP = Math.max(0, G.playerHP - dmg);
  if (G.run) G.run.damageTaken = (G.run.damageTaken || 0) + dmg;
  sfx('playerDamage');
  refreshLives();
  const plEmoji = document.getElementById('player-emoji');
  if (plEmoji) {
    plEmoji.style.transform = 'scale(1.5) rotate(-15deg)';
    const overlay = document.getElementById('freeze-overlay');
    if (overlay) {
      overlay.style.background = 'rgba(255,80,80,0.25)';
      setTimeout(() => { overlay.style.background = ''; }, 350);
    }
    setTimeout(() => { if (plEmoji) plEmoji.style.transform = ''; }, 220);
  }
  if (G.playerHP <= 0) {
    G.phase = 'gameover';
    // Notify game via global callback
    if (typeof window !== 'undefined' && window._onGameOver) window._onGameOver(false);
  }
}

export function freezePlayer(dur) {
  sfx('freezeHit');
  G.frozen = true;
  G.freezeTimer = dur;
  const inp = document.getElementById('typing');
  if (inp) inp.classList.add('frozen');
  const overlay = document.getElementById('freeze-overlay');
  if (overlay) overlay.classList.add('on');
}

/* ================================================================
   SPECIAL MONSTER TICK HELPERS (verbatim from original)
================================================================ */
export function tickSpecialMonster(m, dt, px, py) {
  const fullyVisible = m.y > m.size * 0.6;
  if (!fullyVisible) return;
  const yPct = m.y / G.vH;
  const shootProb = Math.max(0.05, Math.min(1.0, 1.0 - (yPct - 0.15) / 0.65));

  if (m.special === 'archer') {
    if (m.arrowCooldown === undefined) m.arrowCooldown = 5 + Math.random() * 5; // initial grace period
    if (m.shootPause === undefined) m.shootPause = 0;
    if (m.shootPause > 0) { m.shootPause -= dt; return; }
    m.arrowCooldown -= dt;
    const hasArrow = G.room.monsters.some(a => a.parentId === m.id && !a.dead);
    if (m.arrowCooldown <= 0 && !hasArrow) {
      if (Math.random() < shootProb) { m.shootPause = 1.2; spawnArrow(m, px, py); }
      m.arrowCooldown = 7 + Math.random() * 5;
    }
  }

  if (m.special === 'musician') {
    if (m.noteCooldown === undefined) m.noteCooldown = 4 + Math.random() * 4;
    if (m.shootPause === undefined) m.shootPause = 0;
    if (m.shootPause > 0) { m.shootPause -= dt; }
    else {
      m.noteCooldown -= dt;
      if (m.noteCooldown <= 0) {
        m.shootPause = 1.0;
        m.noteCooldown = 5 + Math.random() * 4;
        spawnNote(m);
      }
    }
  }

  if (m.special === 'ice') {
    if (m.iceCooldown === undefined) m.iceCooldown = 5 + Math.random() * 4;
    if (m.shootPause === undefined) m.shootPause = 0;
    if (m.shootPause > 0) { m.shootPause -= dt; }
    else {
      m.iceCooldown -= dt;
      if (m.iceCooldown <= 0) {
        if (Math.random() < shootProb) { m.shootPause = 1.1; spawnIce(m, px, py); }
        m.iceCooldown = 8 + Math.random() * 6;
      }
    }
  }

  if (m.special === 'warrior') {
    if (m.shieldTimer === undefined) m.shieldTimer = 3 + Math.random() * 4;
    if (m.shielded === undefined) m.shielded = false;
    if (m.shieldDur === undefined) m.shieldDur = 0;
    if (m.shielded) {
      m.shieldDur -= dt;
      if (m.shieldDur <= 0) { m.shielded = false; m.shieldTimer = 3 + Math.random() * 4; }
    } else {
      m.shieldTimer -= dt;
      if (m.shieldTimer <= 0) { m.shielded = true; m.shieldDur = 2.0; }
    }
  }
}

export function tickBossSpecial(m, dt, px, py) {
  if (!m.special || m.type !== 'boss') return;

  if (m.special === 'eruptor') {
    if (m.eruptCooldown === undefined) m.eruptCooldown = 6 + Math.random() * 4;
    if (m.eruptActive === undefined) m.eruptActive = 0;
    if (m.eruptActive > 0) {
      m.eruptActive -= dt;
      if (m.eruptActive <= 0) m.eruptCooldown = 5 + Math.random() * 4;
      if (m.nextFireball === undefined) m.nextFireball = 0;
      m.nextFireball -= dt;
      if (m.nextFireball <= 0) {
        m.nextFireball = 0.7 + Math.random() * 0.5;
        spawnFireball(px, py);
      }
      return;
    }
    m.eruptCooldown -= dt;
    if (m.eruptCooldown <= 0) { m.eruptActive = 3.5; m.nextFireball = 0; }
  }

  if (m.special === 'king') {
    if (m.kingWaiting === undefined) m.kingWaiting = false;
    if (m.kingCooldown === undefined) m.kingCooldown = 7 + Math.random() * 4;
    if (m.kingNinjaQueued === undefined) m.kingNinjaQueued = 0;
    if (m.kingNinjaSpawnCooldown === undefined) m.kingNinjaSpawnCooldown = 0;
    if (m.kingWaiting) {
      const alive = G.room.monsters.filter(n => n.parentId === m.id && !n.dead).length;
      // A wave can contain up to four ninjas overall, but no more than two
      // can be active. The cooldown does not run while both slots are full,
      // so every refill gives the player a genuine typing grace period.
      if (m.kingNinjaQueued > 0 && alive < 2) {
        m.kingNinjaSpawnCooldown = Math.max(0, m.kingNinjaSpawnCooldown - dt);
        if (m.kingNinjaSpawnCooldown <= 0) {
          spawnNinja(m);
          m.kingNinjaQueued--;
          m.kingNinjaSpawnCooldown = 0.75;
          return;
        }
      }
      if (m.kingNinjaQueued <= 0 && alive === 0) {
        m.kingWaiting = false;
        m.kingNinjaSpawnCooldown = 0;
        m.kingCooldown = 6 + Math.random() * 4;
      }
      return;
    }
    m.kingCooldown -= dt;
    if (m.kingCooldown <= 0) {
      m.kingWaiting = true;
      m.kingNinjaQueued = 2 + Math.floor(Math.random() * 3);
      // The first ninja enters on the next update. Each later spawn gets a
      // visible grace period rather than arriving as a four-enemy swarm.
      m.kingNinjaSpawnCooldown = 0;
    }
  }

  if (m.special === 'archer') tickSpecialMonster(m, dt, px, py);
}

function spawnArrow(archer, px, py) {
  const wn = G.room.wave || 1;
  const syl = wn >= 10 && Math.random() < 0.3
    ? ARROW_SYLS_HARD[Math.floor(Math.random() * ARROW_SYLS_HARD.length)]
    : ARROW_SYLS_EASY[Math.floor(Math.random() * ARROW_SYLS_EASY.length)];
  const dx = px - archer.x, dy = py - archer.y;
  const d  = Math.hypot(dx, dy) || 1;
  const speed = 110 + Math.random() * 40;
  G.room.monsters.push({
    id: ++_id, type:'arrow', special:null,
    emoji:'➷', parentId: archer.id,
    x: archer.x, y: archer.y,
    spawnNX: archer.x / G.W, spawnNY: archer.y / G.vH, progress: 0,
    hp:1, maxHp:1,
    words:[syl], wi:0,
    get word() { return this.words[this.wi]; },
    size:32, baseSpd: speed,
    get spd() { return this.baseSpd * (G.vH/G.H); },
    tracking:true, dead:false, flash:0, wob:0, scl:1, sclDir:1,
    vx: dx/d*speed, vy: dy/d*speed,
    angle: Math.atan2(dy, dx),
    isProjectileMonster:true,
  });
}

function spawnNote(musician) {
  if (G.room?.noiseCancelled) return; // Noise Cancel consumable active
  sfx('musicianNote', 0.6);
  const syl = NOTE_SYLS[Math.floor(Math.random() * NOTE_SYLS.length)];
  const nx = musician.x + (Math.random()-0.5)*60;
  const ny = musician.y;
  G.room.monsters.push({
    id: ++_id, type:'note', special:null,
    emoji: NOTES[Math.floor(Math.random()*NOTES.length)], parentId: musician.id,
    x: nx, y: ny,
    spawnNX: nx / G.W, spawnNY: ny / G.vH, progress: 0,
    hp:1, maxHp:1,
    words:[syl], wi:0,
    get word() { return this.words[this.wi]; },
    size:28, baseSpd: 75 + Math.random()*50,
    get spd() { return this.baseSpd * (G.vH/G.H); },
    tracking:true, dead:false, flash:0, wob:0, scl:1, sclDir:1,
    isProjectileMonster:true,
  });
}

function spawnIce(ice, px, py) {
  const cons = ICE_CONSONANTS[Math.floor(Math.random()*ICE_CONSONANTS.length)];
  const dx = px - ice.x, dy = py - ice.y;
  const d  = Math.hypot(dx, dy) || 1;
  const speed = 90 + Math.random()*35;
  G.room.monsters.push({
    id:++_id, type:'iceball', special:null,
    emoji:'🧊', parentId:ice.id,
    x:ice.x, y:ice.y,
    spawnNX: ice.x / G.W, spawnNY: ice.y / G.vH, progress: 0,
    hp:1, maxHp:1,
    words:[cons], wi:0,
    get word() { return this.words[this.wi]; },
    size:30, baseSpd:speed,
    get spd() { return this.baseSpd * (G.vH/G.H); },
    tracking:true, dead:false, flash:0, wob:0, scl:1, sclDir:1,
    vx:dx/d*speed, vy:dy/d*speed,
    isProjectileMonster:true, isIce:true,
  });
}

function spawnFireball(px, py) {
  const easyWords = ['가','나','다','마','바','사','아','자','하'];
  const syl = easyWords[Math.floor(Math.random()*easyWords.length)];
  const angle = Math.random() * Math.PI * 2;
  const spawnR = 150 + Math.random() * 80;
  const x = px + Math.cos(angle) * spawnR;
  const y = Math.max(50, (G.vH * 0.15) + Math.random() * G.vH * 0.3);
  G.room.monsters.push({
    id:++_id, type:'fireball', special:null,
    emoji:'🔥',
    x, y,
    spawnNX: x / G.W, spawnNY: y / G.vH, progress: 0,
    hp:1, maxHp:1,
    words:[syl], wi:0,
    get word() { return this.words[this.wi]; },
    size:30, baseSpd: 100 + Math.random() * 40,
    get spd() { return this.baseSpd * (G.vH/G.H); },
    tracking:true, dead:false, flash:0, wob:0, scl:1, sclDir:1,
    isProjectileMonster:true,
  });
}

function spawnNinja(king) {
  const wn = G.room.wave || 1;
  const biome = G.dungeon?.worldDef?.id || 'forest';
  const words = pickWordsForMonster(wn, 1, biome);
  const nx = king.x + (Math.random()-0.5)*200;
  const ny = king.y + Math.random()*100;
  G.room.monsters.push({
    id:++_id, type:'normal', special:null,
    emoji:'🥷', parentId:king.id,
    x: nx, y: ny,
    spawnNX: nx / G.W, spawnNY: ny / G.vH, progress: 0,
    // A King ninja is an urgent projectile-style add: one word, one hit.
    // Keeping it at two HP with one word made it reappear as the same word.
    hp:1, maxHp:1, words, wi:0,
    get word() { return this.words[this.wi]; },
    size:44, baseSpd: monsterSpeed(words, false) * 1.5,
    get spd() { return this.baseSpd * (G.vH/G.H); },
    tracking:true, dead:false, flash:0, wob:Math.random()*Math.PI*2, scl:1, sclDir:1,
    isProjectileMonster:true,
    autokillTargetable:true,
    alwaysRevealWord:true,
  });
}

/* ================================================================
   TICK FUNCTIONS
================================================================ */
export function tickMonsters(dt) {
  // Periodic stall check: if no monsters and no pending spawns, clear the room
  if (G.room?.wPhase === 'spawning') {
    G.room._stallTimer = (G.room._stallTimer || 0) + dt;
    if (G.room._stallTimer > 5) {
      G.room._stallTimer = 0;
      checkStall();
    }
  }

  const px      = G.W / 2;
  const paEl    = document.getElementById('player-area');
  const emojiEl = document.getElementById('pl-emoji');
  // Target = center of player emoji; fallback to legacy player-area calculation
  let py;
  if (emojiEl) {
    const r = emojiEl.getBoundingClientRect();
    py = r.top + r.height * 0.5;
  } else {
    const paH = paEl ? paEl.offsetHeight + 10 : 90;
    py = G.vH - paH + 10;
  }
  // Proportional collision radius: ~5% of viewport height, regardless of which emoji is shown.
  // Center-to-center distance so there's no "hit in the air" artifact when emojis change.
  const hitR = G.vH * 0.05;

  // Target: player position at bottom
  const targetX = px;
  const targetY = py;

  for (const m of G.room.monsters) {
    if (m.dead) continue;

    // Flee animation - move upward, fade out, then remove
    if (m.fleeing) {
      m.fleeAlpha = Math.max(0, (m.fleeAlpha ?? 1) - dt * 2.2);
      m.y += (m.fleeVY ?? -260) * dt;
      if (m.fleeAlpha <= 0 || m.y < -(m.size * 4 + 80)) m.dead = true;
      continue;
    }

    // Walking animation
    m.wob += dt * 1.2;
    m.scl += dt * 0.35 * m.sclDir;
    if (m.scl > 1.025) m.sclDir = -1;
    if (m.scl < 0.975) m.sclDir =  1;

    // Spawn animation - freeze until landing is complete
    if (m.spawnAnim && m.spawnAnim.t < m.spawnAnim.dur) {
      m.spawnAnim.t += dt;
      const prog = Math.min(1, m.spawnAnim.t / m.spawnAnim.dur);
      // Ease-in fall: monster descends from off-screen to landing y during first 80%
      const fallProg = Math.min(1, prog / 0.80);
      const eased = fallProg * fallProg; // ease-in
      // Recompute landY from normalized value so resize mid-fall stays correct
      const landY = m.spawnAnim.landNY * G.vH;
      m.x = m.spawnNX * G.W;
      m.y = -(m.size * 3) + (landY - (-(m.size * 3))) * eased;
      // Impact flash
      if (prog >= 0.79 && prog < 0.84) m.flash = 1.5;
      continue; // skip normal movement & collision during spawn
    }

    // The final word was accepted, so this monster is already out of the
    // gameplay state. Let the projectile/impact finish visually, but never let
    // it walk into or damage a player during that short overlap window.
    if (m.defeatCommitted) {
      if (m.flash > 0) m.flash -= dt * 5;
      continue;
    }

    // Knockback - integrate velocity into a position offset (kbX/kbY) separate from
    // the progress path, so the path-based position stays correct after resize.
    if (m.kbVx || m.kbVy) {
      m.kbX = (m.kbX || 0) + m.kbVx * dt;
      m.kbY = (m.kbY || 0) + m.kbVy * dt;
      const decay = Math.pow(0.04, dt); // fast decay ~0.35s
      m.kbVx *= decay;
      m.kbVy *= decay;
      if (Math.abs(m.kbVx) < 0.5) m.kbVx = 0;
      if (Math.abs(m.kbVy) < 0.5) m.kbVy = 0;
      // Clamp to spawn boundary - redirect upward force sideways
      const minY = G.vH * 0.13;
      const pathY = m.spawnNY * G.vH + m.progress * (targetY - m.spawnNY * G.vH);
      if (pathY + m.kbY < minY && m.kbVy < 0) {
        m.kbY = minY - pathY;
        m.kbVx += (m.spawnNX * G.W) >= G.W / 2 ? Math.abs(m.kbVy) : -Math.abs(m.kbVy);
        m.kbVy = 0;
      }
    }
    // Decay the kb offset itself so monsters glide back onto the path
    if (m.kbX || m.kbY) {
      const offDecay = Math.pow(0.08, dt);
      m.kbX = (m.kbX || 0) * offDecay;
      m.kbY = (m.kbY || 0) * offDecay;
      if (Math.abs(m.kbX) < 0.5) m.kbX = 0;
      if (Math.abs(m.kbY) < 0.5) m.kbY = 0;
    }
    // Shapeshift animation tick
    if (m.shapeshift) {
      m.shapeshift.t += dt;
      if (m.shapeshift.t >= m.shapeshift.dur) m.shapeshift = null;
    }

    // Special ticks
    // Bosses with archer/ice/musician/warrior also use tickSpecialMonster;
    // eruptor and king are boss-exclusive and handled by tickBossSpecial only.
    const bossOnlySpecials = ['eruptor', 'king'];
    if (m.special && (m.type !== 'boss' || !bossOnlySpecials.includes(m.special))) tickSpecialMonster(m, dt, px, py);
    if (m.type === 'boss') tickBossSpecial(m, dt, px, py);

    const paused = (m.shootPause > 0)
      || (m.special === 'eruptor' && m.eruptActive > 0)
      || (m.special === 'king'    && m.kingWaiting)
      || m._freezePaused
      || (m._stunned && (m._stunnedTimer = Math.max(0, (m._stunnedTimer||0) - dt)) > 0);

    if (!paused) {
      if (m._stunned) m._stunned = false;
      if (!m.tracking && (
        (m.type === 'arrow' || m.type === 'note' || m.type === 'iceball' || m.type === 'fireball') ||
        Math.abs(m.spawnNX * G.W - G.W/2) < G.W * 0.8
      )) m.tracking = true;

      let spdMult = G.activeEffect?.type === 'slow' ? 0.6 : 1.0;
      if (G.run?.godRunActive) spdMult *= 3;
      // Hard cognitive-limit cap: no monster can ever move faster than this,
      // regardless of wave, world, or God Run. God Run just reaches the cap sooner.
      const SPD_CAP = 230 * (G.vH / 800);
      const effSpd = Math.min(m.spd * spdMult, SPD_CAP);

      // Progress-based movement along the direct spawn→player path.
      const spawnX = m.spawnNX * G.W;
      const spawnY = m.spawnNY * G.vH;
      const totalDist = Math.hypot(targetX - spawnX, targetY - spawnY) || 1;
      m.progress += effSpd * dt / totalDist;

      // Opening group: cap progress so every member waits just before hitting.
      if (G.room?.openingAttackPending && m._openingAttackStop) {
        if (m.progress >= 0.65) m.progress = 0.65;
      }

      if (m.type === 'arrow') {
        const sx = m.spawnNX * G.W, sy = m.spawnNY * G.vH;
        m.angle = Math.atan2(targetY - sy, targetX - sx);
      }
    }

    // Derive pixel position from progress along the direct path + knockback offset.
    // Recalculated every frame so resize automatically repositions the monster.
    {
      const spawnX = m.spawnNX * G.W;
      const spawnY = m.spawnNY * G.vH;
      m.x = spawnX + m.progress * (targetX - spawnX) + (m.kbX || 0);
      m.y = spawnY + m.progress * (targetY - spawnY) + (m.kbY || 0);
    }

    if (m.flash > 0) m.flash -= dt * 5;

    // Collision with player (tutorial monster is capped before hitR - no collision possible)
    if (Math.hypot(m.x - px, m.y - py) < hitR) {
      explode(m.x, m.y, m.size);
      m.dead = true;
      if (m.isIce) {
        freezePlayer(2.0);
      } else {
        hurtPlayer(m.hp);
      }
      if (!m.isProjectileMonster) onMonsterRemoved(m);
      else checkStall();
    }
  }
  G.room.monsters = G.room.monsters.filter(m => !m.dead);
}

export function tickProjs(dt) {
  const defaultProjSpeed = PROJECTILE_BASE_SPEED * (G.run?.projSpeedMult || 1);
  for (const p of G.room.projs) {
    const t = G.room.monsters.find(m => m.id === p.tid && !m.dead);
    if (!t) { p.dead = true; continue; }
    const dx = t.x - p.x, dy = t.y - p.y;
    const d  = Math.hypot(dx, dy) || 1;
    const speed = Number.isFinite(p.speed) ? p.speed : defaultProjSpeed;
    p.vx = (dx/d) * speed;
    p.vy = (dy/d) * speed;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.rs * dt;
    if (Math.hypot(p.x - t.x, p.y - t.y) < t.size * 0.4 + 8) {
      if (!p._fromP2) hitMonster(t); // ghost P2 projectiles don't trigger local hit (kill comes via monster_kill msg)
      p.dead = true;
    }
    if (p.x<-100||p.x>G.W+100||p.y<-200||p.y>G.vH+100) p.dead = true;
  }
  G.room.projs = G.room.projs.filter(p => !p.dead);
}

export function tickParts(dt) {
  for (const p of G.room.parts) {
    p.life -= dt * 2.2;
    p.y += (p.vy||0)*dt; if(p.vy) p.vy*=0.93;
    p.x += (p.vx||0)*dt; if(p.vx) p.vx*=0.90;
  }
  G.room.parts = G.room.parts.filter(p => p.life > 0);
}

/* ================================================================
   POWERUP / INVENTORY (verbatim from typing-game.html)
================================================================ */
export function shouldDropItem() {
  // In the taekwondo dojang world, only drop items in border rooms (harder outer ring).
  // COLS=8, ROWS=6 are the fixed dojang grid dimensions from world.js.
  if (G.dungeon?.worldDef?.id === 'taekwondo_dojang') {
    const { col, row } = G.currentRoom || {};
    if (col == null || !(col === 0 || col === 7 || row === 0 || row === 5)) return false;
  }
  let base = 0.06;
  base *= (G.run?.dropMult || 1);
  return Math.random() < base;
}

// Hanja pools by wave tier (verbatim from typing-game.html)
export const HANJA_T1 = '人白北南小四軍水母學中外二敎金王東日木韓六西五室國火山青生民七年八三兄先女一門父萬弟寸九土長校大月十'.split('');
export const HANJA_T2 = '前電左道家午動全手正不時平農方安工物孝力答子間足江右車場後內海上下事名空姓自市話食世立男活漢每記直氣'.split('');
export const HANJA_T3 = '紙所草出育老地入便林語字里天登算秋千有數植口來住夕歌主川色村冬問同百面祖夫夏旗洞命休重邑花文然心春少'.split('');
export const HANJA_T4 = '業功作發形樂注始科藥短界分術雪幸昨代體明共才飲題線半角消運聞和第急等成勇社公弱清神堂用集高意書今會童省信對球身光放利果圖庭部班風讀各戰音表新窗反計理現'.split('');

// Hanja → Korean reading (for dictionary-item toggle display)
export const HANJA_TO_HANGUL = {
  人:'인',白:'백',北:'북',南:'남',小:'소',四:'사',軍:'군',水:'수',母:'모',學:'학',
  中:'중',外:'외',二:'이',敎:'교',金:'금',王:'왕',東:'동',日:'일',木:'목',韓:'한',
  六:'육',西:'서',五:'오',室:'실',國:'국',火:'화',山:'산',青:'청',生:'생',民:'민',
  七:'칠',年:'년',八:'팔',三:'삼',兄:'형',先:'선',女:'여',一:'일',門:'문',父:'부',
  萬:'만',弟:'제',寸:'촌',九:'구',土:'토',長:'장',校:'교',大:'대',月:'월',十:'십',
  前:'전',電:'전',左:'좌',道:'도',家:'가',午:'오',動:'동',全:'전',手:'수',正:'정',
  不:'불',時:'시',平:'평',農:'농',方:'방',安:'안',工:'공',物:'물',孝:'효',力:'력',
  答:'답',子:'자',間:'간',足:'족',江:'강',右:'우',車:'차',場:'장',後:'후',內:'내',
  海:'해',上:'상',下:'하',事:'사',名:'명',空:'공',姓:'성',自:'자',市:'시',話:'화',
  食:'식',世:'세',立:'립',男:'남',活:'활',漢:'한',每:'매',記:'기',直:'직',氣:'기',
  紙:'지',所:'소',草:'초',出:'출',育:'육',老:'노',地:'지',入:'입',便:'편',林:'림',
  語:'어',字:'자',里:'리',天:'천',登:'등',算:'산',秋:'추',千:'천',有:'유',數:'수',
  植:'식',口:'구',來:'래',住:'주',夕:'석',歌:'가',主:'주',川:'천',色:'색',村:'촌',
  冬:'동',問:'문',同:'동',百:'백',面:'면',祖:'조',夫:'부',夏:'하',旗:'기',洞:'동',
  命:'명',休:'휴',重:'중',邑:'읍',花:'화',文:'문',然:'연',心:'심',春:'춘',少:'소',
  業:'업',功:'공',作:'작',發:'발',形:'형',樂:'락',注:'주',始:'시',科:'과',藥:'약',
  短:'단',界:'계',分:'분',術:'술',雪:'설',幸:'행',昨:'작',代:'대',體:'체',明:'명',
  共:'공',才:'재',飮:'음',題:'제',線:'선',半:'반',角:'각',消:'소',運:'운',聞:'문',
  和:'화',第:'제',急:'급',等:'등',成:'성',勇:'용',社:'사',公:'공',弱:'약',清:'청',
  神:'신',堂:'당',用:'용',集:'집',高:'고',意:'의',書:'서',今:'금',會:'회',童:'동',
  省:'성',信:'신',對:'대',球:'구',身:'신',光:'광',放:'방',利:'이',果:'과',圖:'도',
  庭:'정',部:'부',班:'반',風:'풍',讀:'독',各:'각',戰:'전',音:'음',表:'표',新:'신',
  窗:'창',反:'반',計:'계',理:'리',現:'현',
};

// Complex hangul syllable builder for non-hanja mode

function buildComplexSyl() {
  // Use direct Unicode indices - only simple codas to avoid IME cluster ambiguity
  // Onset 0-18, Vowel 0-20, Coda: simple single-consonant codas only
  const SIMPLE_CODA_IDX = [1,2,4,7,8,16,17,19,20,21,22,23,24,25,26,27];
  const oi = Math.floor(Math.random() * 19);  // 19 standard onsets
  const vi = Math.floor(Math.random() * 21);  // 21 vowels
  const ci = SIMPLE_CODA_IDX[Math.floor(Math.random() * SIMPLE_CODA_IDX.length)];
  return String.fromCharCode(0xAC00 + oi * 21 * 28 + vi * 28 + ci);
}

function pickHanjaForWave(wn) {
  if (!G.hanjaEnabled) {
    // Non-hanja: complex syllables scaled by tier
    const tier = wn < 10 ? 1 : wn < 20 ? 2 : wn < 30 ? 3 : wn < 50 ? 4 : 5;
    const cnt = 1 + Math.floor(Math.random() * tier);
    return Array.from({ length: cnt }, buildComplexSyl).join('');
  }
  // Tier unlocks every 5 worlds. T1 always has 2× weight so easier hanjas dominate.
  const wi = G.run?.worldIdx || 0;
  let pool = [...HANJA_T1, ...HANJA_T1]; // T1 at 2× weight - always the most common
  if (wi >= 5)  pool = pool.concat(HANJA_T2);          // T2 at 1× from world 5
  if (wi >= 10) pool = pool.concat(HANJA_T2, HANJA_T3); // T2 gets 2×, T3 at 1× from world 10
  if (wi >= 15) pool = pool.concat(HANJA_T3, HANJA_T4); // T3 gets 2×, T4 at 1× from world 15
  return pool[Math.floor(Math.random() * pool.length)];
}

function _currentGroundCell() {
  const room = G.currentRoom;
  return G.dungeon?.grid?.find(cell => cell.col === room?.col && cell.row === room?.row) || null;
}

function _groundWorldKey() {
  return `${G.dungeon?.runSeed ?? G.run?.seed ?? 'run'}:${G.run?.worldIdx ?? G.dungeon?.worldDef?.id ?? 0}`;
}

function _groundContext(cell) {
  return {
    worldKey: _groundWorldKey(),
    col: cell?.col ?? G.currentRoom?.col,
    row: cell?.row ?? G.currentRoom?.row,
    roomKey: `${cell?.col ?? G.currentRoom?.col}:${cell?.row ?? G.currentRoom?.row}`,
  };
}

function _newGroundId(cell) {
  const side = G.mp?.active ? (G.mp.isHost ? 'h' : 'g') : 'l';
  const random = Math.random().toString(36).slice(2, 10);
  return `${_groundWorldKey()}:${cell.col}:${cell.row}:${side}:${Date.now().toString(36)}:${random}`;
}

function _normalizeGroundRecord(record, cell = _currentGroundCell()) {
  const maxLife = Math.max(1, Number(record.maxLife ?? record.life ?? 180));
  const expiresAt = Number.isFinite(Number(record.expiresAt))
    ? Number(record.expiresAt)
    : G.gameTime + maxLife;
  return {
    id: record.id || _newGroundId(cell),
    xNorm: Math.max(0, Math.min(1, Number(record.xNorm ?? (record.x / G.W)) || 0.5)),
    yNorm: Math.max(0, Math.min(1, Number(record.yNorm ?? (record.y / G.vH)) || 0.5)),
    keys: [...(record.keys || [])],
    keyIdx: Math.max(0, Math.min((record.keys || []).length - 1, Number(record.keyIdx) || 0)),
    item: record.item,
    isHanja: !!record.isHanja,
    coinType: record.coinType || 'gold',
    spawnedAt: Number(record.spawnedAt ?? (expiresAt - maxLife)),
    maxLife,
    expiresAt,
  };
}

function _recordFromEntry(entry) {
  return {
    id: entry.id,
    xNorm: entry.xNorm,
    yNorm: entry.yNorm,
    keys: [...entry.keys],
    keyIdx: entry.keyIdx,
    item: entry.item,
    isHanja: !!entry.isHanja,
    coinType: entry.coinType || entry.el?.dataset?.coin || 'gold',
    spawnedAt: entry.spawnedAt,
    maxLife: entry.maxLife,
    expiresAt: entry.expiresAt,
  };
}

function _pruneGroundCell(cell) {
  if (!cell?.droppedOrbs) return [];
  const expired = cell.droppedOrbs.filter(orb => Number(orb.expiresAt) <= G.gameTime).map(orb => orb.id);
  if (expired.length) cell.droppedOrbs = cell.droppedOrbs.filter(orb => !expired.includes(orb.id));
  return expired;
}

function _groundLabelText(record) {
  const key = record.keys[record.keyIdx];
  if (record.isHanja && G.room?.hanjaToggle && G.room._hjFlip) return HANJA_TO_HANGUL[key] || key;
  return key || '';
}

function _refreshGroundLabel(entry) {
  const label = entry.el?.querySelector('.gitem-hanja');
  if (label) label.textContent = _groundLabelText(entry);
}

function _renderGroundRecord(record) {
  const x = record.xNorm * G.W;
  const y = record.yNorm * G.vH;
  const el = document.createElement('div');
  el.className = 'gitem';
  el.dataset.coin = record.coinType;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  el.style.transform = 'translate(-50%,-50%)';

  const svgSz = Math.max(48, Math.round(84 * G.vH / 1080));
  el.style.width  = svgSz + 'px';
  el.style.height = svgSz + 'px';
  const r = 24, cx = 28, cy = 28, circ = 2*Math.PI*r;
  el.innerHTML = `
    <svg viewBox="0 0 56 56" width="${svgSz}" height="${svgSz}">
      <g class="gitem-coin-group">
        <circle class="gitem-coin-fill" cx="${cx}" cy="${cy}" r="${r}"/>
        <ellipse class="gitem-coin-sheen" cx="${cx+10}" cy="${cy}" rx="10" ry="${r-2}"/>
        <circle class="gitem-coin-arc gitem-ring-arc" cx="${cx}" cy="${cy}" r="${r}"
          stroke-dasharray="${circ} ${circ}" stroke-dashoffset="0"
          stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
      </g>
    </svg>
    <div class="gitem-hanja" style="font-size:${Math.max(10, Math.round(svgSz * 0.45))}px"></div>`;
  _refreshGroundLabel({ ...record, el });
  document.getElementById('ground-items')?.appendChild(el);

  const entry = {
    ...record,
    keys: [...record.keys],
    x,
    y,
    life: Math.max(0, record.expiresAt - G.gameTime),
    el,
  };
  G.room.groundItems.push(entry);
  return entry;
}

/** Persist the currently rendered drops into their dungeon cell. */
export function persistGroundItems(cell = _currentGroundCell()) {
  if (!cell || !G.room?.groundItems || cell !== _currentGroundCell()) return;
  // An earlier navigation path may already have detached the visuals. Do not
  // let that second detach overwrite valid cell records with an empty array.
  if (!G.room.groundItems.length) return;
  _pruneGroundCell(cell);
  cell.droppedOrbs = G.room.groundItems.map(_recordFromEntry);
}

/** Remove only the visual layer when leaving a room; records remain in cell. */
export function detachGroundItems(cell = _currentGroundCell()) {
  if (!cell || cell !== _currentGroundCell()) return;
  persistGroundItems(cell);
  for (const gi of G.room?.groundItems || []) gi.el?.remove();
  if (G.room) G.room.groundItems = [];
}

/** Recreate active drop visuals after resetRoomState() created a new room. */
export function hydrateGroundItems(cell) {
  if (!cell || cell !== _currentGroundCell() || !G.room) return;
  _pruneGroundCell(cell);
  for (const record of cell.droppedOrbs || []) _renderGroundRecord(_normalizeGroundRecord(record, cell));
}

/** Add or update a canonical drop, optionally rendering it if this is active room. */
export function upsertGroundItemRecord(cell, incoming) {
  if (!cell) return null;
  _pruneGroundCell(cell);
  const record = _normalizeGroundRecord(incoming, cell);
  const index = (cell.droppedOrbs || []).findIndex(orb => orb.id === record.id);
  if (index >= 0) cell.droppedOrbs[index] = record;
  else cell.droppedOrbs.push(record);

  if (cell === _currentGroundCell() && G.room) {
    const runtime = G.room.groundItems.find(gi => gi.id === record.id);
    if (runtime) {
      Object.assign(runtime, record, { keys: [...record.keys], life: Math.max(0, record.expiresAt - G.gameTime) });
      _refreshGroundLabel(runtime);
    } else {
      return _renderGroundRecord(record);
    }
  }
  return record;
}

export function getGroundItemRecord(cell, id) {
  return cell?.droppedOrbs?.find(orb => orb.id === id) || null;
}

export function removeGroundItem(cell, id, { removeElement = true } = {}) {
  const record = getGroundItemRecord(cell, id);
  if (!record) return null;
  const runtime = G.room?.groundItems?.find(gi => gi.id === id);
  if (removeElement) runtime?.el?.remove();
  if (G.room) G.room.groundItems = G.room.groundItems.filter(gi => gi.id !== id);
  cell.droppedOrbs = (cell.droppedOrbs || []).filter(orb => orb.id !== id);
  return record;
}

export function applyGroundItemProgress(cell, id, keyIdx) {
  const record = getGroundItemRecord(cell, id);
  if (!record) return null;
  record.keyIdx = Math.max(record.keyIdx || 0, Math.min(record.keys.length - 1, Number(keyIdx) || 0));
  const runtime = G.room?.groundItems?.find(gi => gi.id === id);
  if (runtime) {
    runtime.keyIdx = record.keyIdx;
    _refreshGroundLabel(runtime);
  }
  return record;
}

export function groundItemSnapshot(item, cell = _currentGroundCell()) {
  const record = item?.el ? _recordFromEntry(item) : _normalizeGroundRecord(item, cell);
  return {
    ..._groundContext(cell),
    ...record,
    x: record.xNorm * G.W,
    y: record.yNorm * G.vH,
    life: Math.max(0, record.expiresAt - G.gameTime),
  };
}

export function spawnGroundItem(x, y, precomputed = null) {
  const cell = _currentGroundCell();
  if (!cell || !G.room) return null;
  const wn   = G.room.wave || 1;
  const life = precomputed?.life ?? (60 + Math.random() * 180);
  // 1/3 of items are hanja-keyed in hanja mode; rest use hangul complex syllables
  // Hanja only from world 1 onwards — world 0 focuses on hangul fundamentals
  const useHanja = precomputed ? precomputed.isHanja : (G.hanjaEnabled && (G.run?.worldIdx || 0) >= 1 && Math.random() < 0.33);
  let keys;
  if (precomputed) {
    keys = [...(precomputed.keys || [])];
  } else if (useHanja) {
    const wi = G.run?.worldIdx || 0;
    const multiCnt = wi >= 15 ? (Math.random() < .4 ? 3 : 2) : wi >= 10 ? (Math.random() < .4 ? 2 : 1) : 1;
    let pool = [...HANJA_T1, ...HANJA_T1];
    if (wi >= 5)  pool = pool.concat(HANJA_T2);
    if (wi >= 10) pool = pool.concat(HANJA_T2, HANJA_T3);
    if (wi >= 15) pool = pool.concat(HANJA_T3, HANJA_T4);
    const aliveWords = new Set(G.room.monsters.filter(m => !m.dead).flatMap(m => m.words || []));
    keys = Array.from({ length: multiCnt }, () => {
      let key = pool[Math.floor(Math.random() * pool.length)];
      for (let tries = 0; tries < 8; tries++) {
        const reading = HANJA_TO_HANGUL[key];
        if (!reading || !aliveWords.has(reading)) break;
        key = pool[Math.floor(Math.random() * pool.length)];
      }
      return key;
    });
  } else {
    keys = [buildComplexSyl()];
  }
  const COIN_TYPES = ['gold','silver','bronze'];
  const coinType = precomputed?.coinType ?? COIN_TYPES[Math.floor(Math.random()*3)];
  const item = precomputed?.item ?? rollPowerupDrop(wn);
  const record = _normalizeGroundRecord({
    id: precomputed?.id || _newGroundId(cell),
    xNorm: precomputed?.xNorm ?? (x / G.W),
    yNorm: precomputed?.yNorm ?? (y / G.vH),
    keys,
    keyIdx: precomputed?.keyIdx ?? 0,
    item,
    isHanja: useHanja,
    coinType,
    spawnedAt: precomputed?.spawnedAt ?? G.gameTime,
    maxLife: precomputed?.maxLife ?? life,
    expiresAt: precomputed?.expiresAt ?? (G.gameTime + life),
  }, cell);
  const entry = upsertGroundItemRecord(cell, record);

  // Broadcast the full canonical record. A guest-created drop is stored and
  // relayed by the host even when the host is currently in another room.
  if (G.mp?.active && !precomputed) {
    mpSend({
      type: 'ground_item_spawn',
      authoritative: !!G.mp.isHost,
      ...groundItemSnapshot(entry, cell),
    });
  }

  // Tutorial: item drop hints in worlds 0-1 (first time each type) - queued, shows after combat
  if (!precomputed && (G.run?.worldIdx ?? 0) <= 1 && G.run?.tutorial && typeof window !== 'undefined') {
    const tut = G.run.tutorial;
    if (useHanja && !tut.hanjaDropShown) {
      tut.hanjaDropShown = true;
      window._showTutorial?.('漢', 'tutorial.pickHanja', null, { autoClose: 25, priority: 10 });
    } else if (!useHanja && !tut.hangulDropShown) {
      tut.hangulDropShown = true;
      window._showTutorial?.('🪙', 'tutorial.pickHangul', null, { autoClose: 25, priority: 10 });
    }
  }

  return entry;
}

export function tickGroundItems(dt) {
  // Expiry is based on the absolute run clock, so drops also expire while the
  // player is away from their room. Prune every cell; only the active cell has DOM.
  for (const cell of G.dungeon?.grid || []) _pruneGroundCell(cell);
  const cell = _currentGroundCell();
  if (cell) {
    const activeIds = new Set((cell.droppedOrbs || []).map(orb => orb.id));
    for (const gi of [...(G.room?.groundItems || [])]) {
      if (!activeIds.has(gi.id)) gi.el?.remove();
    }
    if (G.room) G.room.groundItems = G.room.groundItems.filter(gi => activeIds.has(gi.id));
  }
  // Dictionary item: flip hanja ↔ hangul reading every second
  if (G.room.hanjaToggle) {
    G.room._hjFlipTimer = (G.room._hjFlipTimer || 0) + dt;
    if (G.room._hjFlipTimer >= 1.0) {
      G.room._hjFlipTimer -= 1.0;
      G.room._hjFlip = !G.room._hjFlip;
      for (const gi of G.room.groundItems) {
        if (!gi.isHanja) continue;
        const label = gi.el.querySelector('.gitem-hanja');
        if (label) {
          const key = gi.keys[gi.keyIdx];
          label.textContent = G.room._hjFlip ? (HANJA_TO_HANGUL[key] || key) : key;
        }
      }
    }
  }

  // Dictionary item: flip hidden words visibility every 0.5 seconds (faster than hanja)
  if (G.room.revealedHidden) {
    G.room._hiddenFlipTimer = (G.room._hiddenFlipTimer || 0) + dt;
    if (G.room._hiddenFlipTimer >= 0.5) {
      G.room._hiddenFlipTimer -= 0.5;
      G.room._hiddenFlip = !G.room._hiddenFlip;
      // Trigger redraw of monsters to show/hide words
      if (typeof window !== 'undefined' && window._redrawMonsters) window._redrawMonsters();
    }
  }

  for (const gi of [...G.room.groundItems]) {
    // Keep saved normalized positions aligned with a resized viewport.
    gi.x = gi.xNorm * G.W;
    gi.y = gi.yNorm * G.vH;
    gi.el.style.left = gi.x + 'px';
    gi.el.style.top  = gi.y + 'px';
    gi.life = Math.max(0, gi.expiresAt - G.gameTime);
    const ratio = Math.max(0, gi.life / gi.maxLife);
    gi.el.style.opacity = Math.max(0.15, ratio * 0.85 + 0.15).toFixed(2);
    const arc = gi.el.querySelector('.gitem-ring-arc');
    if (arc) {
      const r = 24, circ = 2*Math.PI*r;
      arc.setAttribute('stroke-dasharray', `${(circ * ratio).toFixed(1)} ${circ}`);
    }
    if (gi.life <= 0) removeGroundItem(cell, gi.id);
  }
}

export function tryCollectGroundItem(val) {
  // Accept both the hanja itself and its hangul reading (mobile keyboards can't type hanja)
  const gi = G.room.groundItems.find(g => !g.collectPending && g.life > 0 && g.keys?.length && (() => {
    const key = g.keys[g.keyIdx];
    return key === val || HANJA_TO_HANGUL[key] === val;
  })());
  if (!gi) return false;
  gi.keyIdx++;
  if (gi.keyIdx < gi.keys.length) {
    gi.el.querySelector('.gitem-hanja').textContent = gi.keys[gi.keyIdx];
    gi.el.style.filter = 'brightness(1.8)';
    setTimeout(() => { if (gi.el) gi.el.style.filter = ''; }, 200);
    const cell = _currentGroundCell();
    if (cell) {
      persistGroundItems(cell);
      if (G.mp?.active) {
        mpSend({ type: 'ground_item_progress', authoritative: !!G.mp.isHost,
          ..._groundContext(cell), id: gi.id, keyIdx: gi.keyIdx });
      }
    }
    return true;
  }
  // Collect!
  const cell = _currentGroundCell();
  if (!cell) return false;
  if (G.mp?.active) {
    gi.collectPending = true;
    gi.collectRequestId = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    gi.el.style.opacity = '0.45';
    const request = {
      type: 'ground_item_collect_request',
      ..._groundContext(cell),
      id: gi.id,
      keyIdx: gi.keyIdx,
      requestId: gi.collectRequestId,
      // Include the record so the host can resolve a collection even if the
      // spawn packet and the collection packet cross in transit.
      groundItem: groundItemSnapshot(gi, cell),
    };
    if (typeof window !== 'undefined' && window._mpRequestGroundItemCollect) window._mpRequestGroundItemCollect(request);
    return true;
  }
  _finishGroundItemCollection(gi, cell);
  // Dismiss item-pickup tutorial tip when player collects an item
  if (typeof window !== 'undefined') window._hideTutorial?.(true);
  return true;
}

function _finishGroundItemCollection(gi, cell) {
  const hanjaEl = gi.el?.querySelector('.gitem-hanja');
  if (hanjaEl) {
    hanjaEl.textContent = gi.item;
    hanjaEl.style.transition = 'transform 0.7s ease, opacity 0.7s ease';
    hanjaEl.style.transform  = 'translateY(-40px) scale(1.5)';
    hanjaEl.style.opacity    = '0';
  }
  const svg = gi.el?.querySelector('svg');
  if (svg) { svg.style.transition = 'opacity 0.4s'; svg.style.opacity = '0'; }
  const item = gi.item;
  removeGroundItem(cell, gi.id, { removeElement: false });
  setTimeout(() => { if (gi.el) gi.el.remove(); }, 750);
  addToInventory(item);
}

export function addToInventory(item) {
  sfx('itemPickup');
  G.itemsEverAcquired = (G.itemsEverAcquired || 0) + 1;
  const stack = G.inventory.stacks.find(s => s.item === item);
  if (stack) stack.count++;
  else G.inventory.stacks.push({ item, count:1 });
  refreshInventoryUI();
}

export function refreshInventoryUI() {
  const inv = G.inventory;
  const invHud = document.getElementById('inv-hud');
  if (!invHud) return;
  if (!inv.stacks.length) { invHud.style.display = 'none'; return; }
  invHud.style.display = 'flex';
  inv.sel = Math.max(0, Math.min(inv.sel, inv.stacks.length - 1));
  const cur = inv.stacks[inv.sel];
  const cooldowns = G.run?.itemCooldowns || {};
  const lockActive = (G.run?._itemUseLock || 0) > 0;
  const curOnCD = cur ? (cooldowns[cur.item] || 0) > 0 : false;
  const unavailable = lockActive || curOnCD;

  const emojiEl = document.getElementById('inv-emoji');
  const countEl = document.getElementById('inv-count');
  const nameEl  = document.getElementById('inv-item-name');
  const useBtn  = document.getElementById('inv-use-hover');
  if (emojiEl) emojiEl.textContent = cur ? cur.item : '';
  if (countEl) countEl.textContent = cur && cur.count > 1 ? cur.count : '';
  const cdSecs = cur ? Math.ceil(cooldowns[cur.item] || 0) : 0;
  const _itemId = cur ? POWERUP_DEFS[cur.item]?.id : null;
  if (nameEl)  nameEl.textContent = cdSecs > 0 ? `${cdSecs}초` : (_itemId ? i18n('items.' + _itemId + '.name') : '');
  if (useBtn)  useBtn.disabled = unavailable;
  const prevBtn = document.getElementById('inv-prev');
  const nextBtn = document.getElementById('inv-next');
  if (prevBtn) prevBtn.style.display = inv.stacks.length >= 2 ? '' : 'none';
  if (nextBtn) nextBtn.style.display = inv.stacks.length >= 2 ? '' : 'none';
  invHud.classList.toggle('unavailable', unavailable);
  // Gray out the emoji when on per-item cooldown
  if (emojiEl) emojiEl.style.filter = curOnCD ? 'grayscale(1) opacity(0.45)' : '';

  // Wire tooltip on inv-slot (once)
  const slotEl = document.getElementById('inv-slot');
  if (slotEl && !slotEl._tooltipWired) {
    slotEl._tooltipWired = true;
    const tooltip = document.getElementById('shop-tooltip');
    if (tooltip) {
      slotEl.addEventListener('mouseenter', e => {
        const c = G.inventory.stacks[G.inventory.sel];
        const _cId = c ? POWERUP_DEFS[c.item]?.id : null;
        const desc = _cId ? i18n('items.' + _cId + '.desc') : '';
        if (!desc) return;
        tooltip.textContent = desc;
        tooltip.style.left = e.clientX + 12 + 'px';
        tooltip.style.top  = e.clientY - 30 + 'px';
        tooltip.classList.add('show');
      });
      slotEl.addEventListener('mousemove', e => {
        tooltip.style.left = e.clientX + 12 + 'px';
        tooltip.style.top  = e.clientY - 30 + 'px';
      });
      slotEl.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
    }
  }
}

export function invNavigate(dir) {
  if (!G.inventory.stacks.length) return;
  sfx('invNavigate', 0.5);
  G.inventory.sel = ((G.inventory.sel + dir) + G.inventory.stacks.length) % G.inventory.stacks.length;
  refreshInventoryUI();
  // Multiplayer: broadcast spell selection so partner's spell-ico stays in sync
  if (G.mp?.active) {
    const ico = document.getElementById('spell-ico');
    const emoji = ico?.textContent || _nextSpell || '🔮';
    mpSend({ type: 'inv_nav', emoji });
  }
}

function _checkItemUsable(item) {
  if (item === '⛺') {
    // Tent: only in a cleared normal room
    const cell = G.dungeon?.grid?.find(c => c.col === G.currentRoom?.col && c.row === G.currentRoom?.row);
    const ok = G.mode === 'navigate' && G.room?.wPhase === 'clear'
            && !cell?.isTent && !G.room?.npc;
    if (!ok) {
      flashAnnounce(i18n('world.tentAlreadyExists'), '#aa8844');
      return false;
    }
  }
  if (item === '📖') {
    // World Guide: refuse if crystal_ball (permanent reveal) or master key active (temp full reveal)
    if (G.run?.permanents?.includes('crystal_ball') || G.run?.mapRevealed) {
      flashAnnounce(i18n('world.worldGuideNoNew'), '#ff9944');
      return false;
    }
    // Refuse if all non-combat rooms are already guide-revealed or visited
    const grid = G.dungeon?.grid;
    if (!grid) { flashAnnounce(i18n('world.worldGuideNoNew'), '#ff9944'); return false; }
    const hasNew = grid.some(cell =>
      cell && (cell.isTent || (cell.type !== 'normal' && cell.type !== 'boss'))
        && !cell.visited && !cell.guideRevealed
    );
    if (!hasNew) {
      flashAnnounce(i18n('world.worldGuideNoNew'), '#ff9944');
      return false;
    }
  }
  return true;
}

export function invUse() {
  // Global 1-second use lock prevents misclick spam
  if ((G.run?._itemUseLock || 0) > 0) return;
  const inv = G.inventory;
  if (!inv.stacks.length) return;
  const stack = inv.stacks[inv.sel];
  if (!stack) return;
  sfx('itemUse');
  const item = stack.item === '🎲'
    ? POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)]
    : stack.item;
  // Per-item cooldown check
  const cooldowns = G.run?.itemCooldowns || {};
  if ((cooldowns[item] || 0) > 0) return;

  // Context validity check (some items only work in specific situations)
  if (!_checkItemUsable(item)) return;

  applyPowerup(item);
  // Mark the actual used item key as learned (not the 🎲 die itself)
  if (!G.learnedItems) G.learnedItems = [];
  if (!G.learnedItems.includes(item)) { G.learnedItems.push(item); savePersistentState(); }
  stack.count--;
  if (stack.count <= 0) inv.stacks.splice(inv.sel, 1);
  inv.sel = Math.min(inv.sel, Math.max(0, inv.stacks.length - 1));

  // Start global 1-second lock
  if (G.run) G.run._itemUseLock = 1.0;
  // Start per-item cooldown
  const def = POWERUP_DEFS[item];
  if (def?.cooldown > 0 && G.run) {
    if (!G.run.itemCooldowns) G.run.itemCooldowns = {};
    G.run.itemCooldowns[item] = def.cooldown;
  }
  refreshInventoryUI();
}

export function applyPowerup(item) {
  switch(item) {
    case '❤️‍🩹':
      G.playerHP = Math.min(G.playerMax, G.playerHP + 2);
      refreshLives();
      flashAnnounce('❤️‍🩹 +2 HP!', '#ff6b9d');
      break;
    case '💛':
      if (G.playerMax < 100) {
        const wasFull = G.playerHP >= G.playerMax;
        G.playerMax = Math.min(100, G.playerMax + 1);
        if (wasFull) G.playerHP = G.playerMax;
        refreshLives();
        flashAnnounce('💛 +1 Max HP!', '#ffd700');
      }
      break;
    case '⚡':
      G.stunBubble = true;
      showBubble();
      G.activeEffect = { type:'stun', timer:60 };
      flashAnnounce('⚡ Stun bubble!', '#ffe066');
      break;
    case '🔥':
      G.critShots = 5;
      G.activeEffect = { type:'crit', timer:999 };
      flashAnnounce('🔥 Crit x5!', '#ff6600');
      break;
    case '⏱️':
      G.activeEffect = { type:'slow', timer:20 };
      flashAnnounce('⏱️ Slow 20s!', '#aaffaa');
      break;
    case '🎯':
      G.autokillBubble = true;
      showBubble();
      G.activeEffect = { type:'autokill', timer:60 };
      flashAnnounce('🎯 Auto-kill!', '#ff4444');
      break;
    case '⏰':
      G.activeEffect = { type:'freeze', timer:5 };
      flashAnnounce('⏰ Time Freeze 5s!', '#88ddff');
      break;
    case '🎁':
      G.activeEffect = { type:'double', timer:30 };
      flashAnnounce('🎁 2x Coins 30s!', '#ffd700');
      break;
    case '💣':
      for (const m of G.room.monsters) if (!m.dead) { m.hp = Math.max(0, m.hp - 3); if (m.hp <= 0) { explode(m.x,m.y,m.size); m.dead=true; if(!m.isProjectileMonster) onMonsterRemoved(m); else checkStall(); } }
      G.room.monsters = G.room.monsters.filter(m=>!m.dead);
      flashAnnounce('💣 Bomb!', '#ff8800');
      break;
    case '🛡️':
      G.run.shieldHits = (G.run.shieldHits || 0) + 1;
      flashAnnounce('🛡️ Shield!', '#88aaff');
      break;
    case '⚔️':
      for (const m of G.room.monsters) { if (!m.dead) { explode(m.x,m.y,m.size); m.dead=true; } }
      G.room.monsters = []; G.room.projs = [];
      if (G.room.wPhase === 'spawning') { G.room.wTemplates = []; G.room.wPrepared = []; onRoomCleared(); }
      flashAnnounce('⚔️ CLEAVE!', '#ff2244');
      break;
    case '📙': {
      // Dictionary: hanja orbs now toggle between hanja char and hangul reading every second
      // AND reveal hidden words by making them flash between visible and hidden
      if (G.room) {
        G.room.hanjaToggle = true;
        G.room._hjFlipTimer = 0;
        G.room._hjFlip = false;
        G.room.revealedHidden = true; // REVEAL HIDDEN WORDS (Vision Point 2)
        G.room._hiddenFlipTimer = 0;
        G.room._hiddenFlip = false;
      }
      const hanjaMsg = i18n('announce.hanjaToggle');
      flashAnnounce(hanjaMsg, '#ffd700');
      break;
    }
    case '🔑':
      // Temporarily reveal all rooms; fog returns after teleporting
      G.run.mapRevealed = true;
      if (typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
      // Open the map panel so player can see + use it
      document.getElementById('map-panel')?.classList.remove('off');
      const mapMsg = i18n('announce.mapRevealed');
      flashAnnounce(mapMsg, '#aaffff');
      break;
    case '🏯':
      // World Skip - advance to next world via game.js hook
      if (typeof window !== 'undefined' && window._worldSkip) window._worldSkip();
      else flashAnnounce('🏯 World Skip!', '#ffd700');
      break;
    case '🔇':
      // Noise Cancel - silence all musicians this room
      if (G.room) G.room.noiseCancelled = true;
      flashAnnounce('🔇 Musicians silenced!', '#ccccff');
      break;
    case '🤑':
      // Greedy Eyes - triple coins for 30s
      G.activeEffect = { type:'greedy', timer:30 };
      flashAnnounce('🤑 Triple coins 30s!', '#ffd700');
      break;
    case '🕳️':
      // Wormhole - teleport to random unvisited room
      if (typeof window !== 'undefined' && window._wormhole) window._wormhole();
      else flashAnnounce('🕳️ Wormhole!', '#aa88ff');
      break;
    case '⛺':
      // Tent - place camp in current cleared normal room
      if (typeof window !== 'undefined' && window._placeTent) window._placeTent();
      break;
    case '📖': {
      // World Guide - reveal all non-combat non-boss rooms (no teleport allowed)
      const grid = G.dungeon?.grid;
      if (grid) {
        for (const cell of grid) {
          if (cell && (cell.isTent || (cell.type !== 'normal' && cell.type !== 'boss')) && !cell.visited) {
            cell.guideRevealed = true;
          }
        }
        if (typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
        document.getElementById('map-panel')?.classList.remove('off');
      }
      flashAnnounce(i18n('world.worldGuideRevealed'), '#aaddff');
      break;
    }
  }
}

export function tickActiveEffect(dt) {
  // Tick per-item cooldowns
  if (G.run) {
    if (G.run._itemUseLock > 0) {
      G.run._itemUseLock = Math.max(0, G.run._itemUseLock - dt);
      if (G.run._itemUseLock <= 0) refreshInventoryUI();
    }
    const cd = G.run.itemCooldowns;
    if (cd) {
      let changed = false;
      for (const key of Object.keys(cd)) {
        const prev = cd[key];
        cd[key] = Math.max(0, cd[key] - dt);
        if (cd[key] <= 0) { delete cd[key]; changed = true; }
        else if (Math.ceil(cd[key]) !== Math.ceil(prev)) changed = true; // update each second
      }
      if (changed) refreshInventoryUI();
    }
    // Tent sleep cooldown
    if ((G.run.tentCooldown || 0) > 0) {
      G.run.tentCooldown = Math.max(0, G.run.tentCooldown - dt);
    }
  }

  if (!G.activeEffect) return;
  const ef = G.activeEffect;
  ef.timer -= dt;
  if (ef.type === 'freeze' && ef.timer > 0) {
    G.room.monsters.forEach(m => m._freezePaused = true);
  } else if (ef.type === 'freeze' && ef.timer <= 0) {
    G.room.monsters.forEach(m => { delete m._freezePaused; });
  }
  if (ef.timer <= 0) {
    if (ef.type === 'stun' || ef.type === 'autokill') hideBubble();
    if (ef.type === 'stun')     G.stunBubble = false;
    if (ef.type === 'autokill') G.autokillBubble = false;
    G.activeEffect = null;
    refreshInventoryUI();
  }
}

export function checkBubbleCollisions() {
  if (!G.stunBubble && !G.autokillBubble) return;
  const px = G.W / 2;
  const paEl = document.getElementById('player-area');
  const py = G.vH - (paEl ? paEl.offsetHeight + 10 : 90) - 20;
  const r  = G.stunBubble ? 180 : 130;
  for (const m of G.room.monsters) {
    // Projectile-style enemies are usually excluded from bubbles, but King
    // ninjas are urgent adds rather than untargetable shots. Preserve their
    // bot-priority flag while allowing Auto Kill to consume them normally.
    const canAutoKill = G.autokillBubble && (!m.isProjectileMonster || m.autokillTargetable);
    const canStun = G.stunBubble && !m.isProjectileMonster;
    if (m.dead || (!canAutoKill && !canStun)) continue;
    const dist = Math.hypot(m.x - px, m.y - py);
    if (dist < r + m.size * 0.3) {
      if (canAutoKill) {
        explode(m.x,m.y,m.size); m.dead=true;
        if (!m.isProjectileMonster) onMonsterRemoved(m); else checkStall();
        hideBubble(); G.autokillBubble = false;
        if (G.activeEffect?.type === 'autokill') { G.activeEffect=null; refreshInventoryUI(); }
      } else if (canStun && !m._stunned) {
        m._stunned = true; m._stunnedTimer = 3.0;
        hideBubble(); G.stunBubble = false;
        if (G.activeEffect?.type === 'stun') { G.activeEffect=null; refreshInventoryUI(); }
      }
    }
  }
}

export function refreshBubbleDisplay() {
  const bub = document.getElementById('effect-bubble');
  if (!bub) return;
  if (!G.stunBubble && !G.autokillBubble) { bub.style.display = 'none'; return; }
  const px = G.W / 2;
  const paEl = document.getElementById('player-area');
  const py = G.vH - (paEl ? paEl.offsetHeight + 10 : 90) - 20;

  if (G.stunBubble && G.autokillBubble) {
    // Yellow outer (stun r=180) with red inner (autokill r=130)
    const r = 180, inner = 130, off = r - inner;
    bub.style.cssText = `display:block;width:${r*2}px;height:${r*2}px;
      left:${px-r}px;top:${py-r}px;
      border:4px solid rgba(255,220,50,.9);
      background:rgba(255,220,50,.06);
      box-shadow:0 0 22px rgba(255,220,50,.5);
      opacity:1;`;
    bub.innerHTML = `<div style="position:absolute;left:${off}px;top:${off}px;
      width:${inner*2}px;height:${inner*2}px;border-radius:50%;
      border:4px solid rgba(255,60,60,.9);background:rgba(255,60,60,.08);
      box-shadow:0 0 16px rgba(255,60,60,.6);"></div>`;
  } else if (G.stunBubble) {
    const r = 180;
    bub.style.cssText = `display:block;width:${r*2}px;height:${r*2}px;
      left:${px-r}px;top:${py-r}px;
      border:4px solid rgba(255,220,50,.9);background:rgba(255,220,50,.12);
      box-shadow:0 0 22px rgba(255,220,50,.5);opacity:1;`;
    bub.innerHTML = '';
  } else {
    const r = 130;
    bub.style.cssText = `display:block;width:${r*2}px;height:${r*2}px;
      left:${px-r}px;top:${py-r}px;
      border:4px solid rgba(255,60,60,.9);background:rgba(255,60,60,.10);
      box-shadow:0 0 22px rgba(255,60,60,.5);opacity:1;`;
    bub.innerHTML = '';
  }
}

function showBubble() {
  if (G.inTransition) return; // deferred - will be shown by refreshBubbleDisplay after transition
  refreshBubbleDisplay();
}

function hideBubble() {
  const bub = document.getElementById('effect-bubble');
  if (!bub) return;
  bub.style.opacity = '0';
  setTimeout(() => { if (bub && !G.stunBubble && !G.autokillBubble) bub.style.display = 'none'; }, 400);
}

// Leaving a run must remove combat-only visuals immediately. The title screen
// can be shown without a new run being created, so resetting only on the next
// game start leaves the old effect bubble visible over the menu.
export function clearCombatTransientVisuals() {
  G.activeEffect = null;
  G.stunBubble = false;
  G.autokillBubble = false;
  G.critShots = 0;
  G.frozen = false;
  G.freezeTimer = 0;
  if (G.run) {
    G.run.shieldHits = 0;
    G.run._itemUseLock = 0;
  }

  const bub = document.getElementById('effect-bubble');
  if (bub) {
    bub.style.display = 'none';
    bub.style.opacity = '0';
    bub.innerHTML = '';
  }
  document.getElementById('typing')?.classList.remove('frozen');
  const freezeOverlay = document.getElementById('freeze-overlay');
  if (freezeOverlay) {
    freezeOverlay.classList.remove('on');
    freezeOverlay.style.background = '';
  }
}

/* ================================================================
   UI HELPERS
================================================================ */
export function refreshLives() {
  const el = document.getElementById('pl-lives');
  if (!el) return;

  if (G.mp?.active) {
    // ── Multiplayer: show two inline HP blocks ──────────────────
    el.classList.add('mp-lives');
    const fmt = (hp, max) =>
      Array.from({length: Math.min(max, 12)}, (_, i) => i < hp ? '❤️' : '🖤').join('') +
      (max > 12 ? ` ${hp}/${max}` : '');
    const p1AvaEl = document.getElementById('pl-emoji');
    const p1AvaSvg = p1AvaEl?.querySelector('svg');
    const p1AvaHtml = p1AvaSvg
      ? p1AvaSvg.outerHTML
      : (G.hero || '🧙');
    const p2 = G.mp.p2;
    const p2AvaEl = document.getElementById('mp-p2-sprite');
    const p2AvaSvg = p2AvaEl?.querySelector('svg');
    const p2AvaHtml = p2AvaSvg
      ? p2AvaSvg.outerHTML
      : (p2?.emoji || '🤺');

    el.innerHTML =
      `<span class="mp-lives-block">` +
        `<span class="mp-lives-avatar">${p1AvaHtml}</span>` +
        `<span class="mp-lives-hp">${fmt(G.playerHP, G.playerMax)}</span>` +
        `<span class="mp-lives-wallet">` +
          `${formatKoreanNumber(G.run?.wallet ?? 0)}원` +
        `</span>` +
      `</span>` +
      `<span class="mp-lives-sep">│</span>` +
      `<span class="mp-lives-block${!G.mp.connected ? ' mp-p2-dead' : ''}">` +
        `<span class="mp-lives-avatar">${p2AvaHtml}</span>` +
        `<span class="mp-lives-hp">${fmt(p2?.hp ?? 0, p2?.hpMax ?? 5)}</span>` +
        `<span class="mp-lives-wallet">` +
          `${formatKoreanNumber(p2?.wallet ?? 0)}원` +
        `</span>` +
      `</span>`;
    return;
  }

  el.classList.remove('mp-lives');
  el.textContent = Array.from({length: G.playerMax}, (_, i) => i < G.playerHP ? '❤️' : '🖤').join('');
}

let _dictNotifTimer = null;
function showDictUnlockNotif(words) {
  const notif = document.getElementById('dict-unlock-notif');
  if (!notif) return;
  const hcard = document.getElementById('hcard-wave');
  if (hcard) {
    const r = hcard.getBoundingClientRect();
    notif.style.left  = r.left + 'px';
    notif.style.top   = (r.bottom + 6) + 'px';
    notif.style.width = r.width + 'px';
  }
  notif.innerHTML = '📒 ' + words.map(w => (w.emoji ? w.emoji + ' ' : '') + w.text).join(' • ');
  notif.classList.remove('off');
  void notif.offsetWidth;
  notif.classList.add('on');
  if (_dictNotifTimer) clearTimeout(_dictNotifTimer);
  _dictNotifTimer = setTimeout(() => {
    notif.classList.remove('on');
    setTimeout(() => { notif.classList.add('off'); _dictNotifTimer = null; }, 250);
  }, 3000);
}

let _announceDomTimer = null;
let _flashAnnounceTimer = null;

function clearAnnounceTimers() {
  if (_announceDomTimer) {
    clearTimeout(_announceDomTimer);
    _announceDomTimer = null;
  }
  if (_flashAnnounceTimer) {
    clearTimeout(_flashAnnounceTimer);
    _flashAnnounceTimer = null;
  }
}

export function flashAnnounce(msg, color) {
  const el = document.getElementById('announce-txt');
  if (!el) return;
  clearAnnounceTimers();
  el.style.color = color || '#fff';
  el.innerHTML = msg;
  el.classList.add('on');
  _flashAnnounceTimer = setTimeout(() => {
    el.classList.remove('on');
    el.style.color = '';
    _flashAnnounceTimer = null;
  }, 1200);
}

// Immediately dismiss any active announcement (e.g. when leaving a room).
// Room changes must also cancel pending DOM timers, otherwise an old popup can
// disappear over the announcement that belongs to the newly entered room.
export function dismissAnnounce() {
  clearAnnounceTimers();
  const annTxt = document.getElementById('announce-txt');
  if (annTxt) {
    annTxt.classList.remove('on');
    annTxt.style.color = '';
  }
  G.announceQ = null;
}

export function announce(msg, cb) {
  const annTxt = document.getElementById('announce-txt');
  if (annTxt) {
    clearAnnounceTimers();
    annTxt.style.color = '';
    annTxt.innerHTML = msg.replace(/\n/g, '<br>');
    annTxt.classList.add('on');
    // DOM-level fallback: dismiss after 4s regardless of game-loop state
    _announceDomTimer = setTimeout(() => {
      annTxt.classList.remove('on');
      G.announceQ = null;
      _announceDomTimer = null;
    }, 4000);
  }
  G.announceQ = { cb, timer: 2.1, fading: false, fadeTimer: 0.38 };
}

export function tickAnnounce(dt) {
  if (!G.announceQ) return;
  const q = G.announceQ;
  const annTxt = document.getElementById('announce-txt');
  if (!q.fading) {
    q.timer -= dt;
    if (q.timer <= 0) {
      if (annTxt) annTxt.classList.remove('on');
      q.fading = true;
    }
  } else {
    q.fadeTimer -= dt;
    if (q.fadeTimer <= 0) {
      G.announceQ = null;
      if (q.cb) q.cb();
    }
  }
}

function updateWalletDisplay() {
  const el = document.getElementById('hs-val');
  if (!el) return;
  const wallet = G.run?.wallet || 0;
  const pending = G.room?.roomPool || 0;
  el.textContent = `${formatKoreanNumber(wallet)}원`;
  const lbl = document.getElementById('hs-best-lbl');
  if (lbl) lbl.textContent = i18n('hud.pending') + ': ';
  const pendingEl = document.getElementById('hs-best');
  if (pendingEl) pendingEl.textContent = pending > 0 ? formatKoreanNumber(pending) : '';
  const pendingRow = document.getElementById('hs-best-row');
  if (pendingRow) pendingRow.hidden = pending <= 0;
  if (typeof window !== 'undefined' && window._hudUpdate) window._hudUpdate();
}

/* ================================================================
   FREEZE TIMER TICK
================================================================ */
export function tickFreeze(dt) {
  if (!G.frozen) return;
  G.freezeTimer -= dt;
  if (G.freezeTimer <= 0) {
    G.frozen = false;
    G.freezeTimer = 0;
    const inp = document.getElementById('typing');
    if (inp) inp.classList.remove('frozen');
    const overlay = document.getElementById('freeze-overlay');
    if (overlay) overlay.classList.remove('on');
  }
}

/* ================================================================
   SHOP (in-room)
================================================================ */
/* ================================================================
   DRAW FUNCTIONS - render monsters, projs, particles on main canvas
================================================================ */
function getCtx() {
  const c = document.getElementById('gc');
  return c ? c.getContext('2d') : null;
}

function getActiveBoss() {
  return G.room?.monsters?.find(m => m.type === 'boss' && !m.dead) || null;
}

function getBossBadgeLayout() {
  const iconSize = Math.max(54, Math.min(94, G.vH * 0.085));
  return {
    x: Math.max(iconSize * 0.82, Math.min(G.W * 0.12, 170)),
    y: Math.max(170, G.vH * 0.22),
    iconSize,
  };
}

function getBossTetherTarget(boss) {
  const hpRatio = boss.maxHp > 1 ? boss.hp / boss.maxHp : 1;
  const drawSize = boss.size * (boss.maxHp > 1 ? (0.55 + hpRatio * 0.45) : 1);
  let y = boss.y;
  // During the falling entrance, keep the tether attached to the landing point
  // instead of stretching off-screen with the temporary spawn position.
  if (boss.spawnAnim && boss.spawnAnim.t < boss.spawnAnim.dur) {
    y = boss.spawnAnim.landNY * G.vH;
  }
  return { x: boss.x, y, drawSize };
}

function buildBossTetherPath(ctx, sx, sy, tx, ty, wave) {
  const dx = tx - sx;
  const dy = ty - sy;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = -dy / distance;
  const ny = dx / distance;
  const curve = Math.min(48, Math.max(12, distance * 0.06)) * wave;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.bezierCurveTo(
    sx + dx * 0.28 + nx * curve,
    sy + dy * 0.28 + ny * curve,
    sx + dx * 0.72 - nx * curve * 0.72,
    sy + dy * 0.72 - ny * curve * 0.72,
    tx, ty,
  );
}

/** Draw the animated tether behind the boss monster. */
export function drawBossTether() {
  const ctx = getCtx();
  const boss = getActiveBoss();
  if (!ctx || !boss) return;

  const { x: ax, y: ay, iconSize } = getBossBadgeLayout();
  const { x: tx, y: ty, drawSize } = getBossTetherTarget(boss);
  const time = performance.now() * 0.001;
  const pulse = 0.78 + Math.sin(time * 3.2) * 0.22;
  const hitPulse = Math.max(0, Math.min(1, Number(boss.leashPulse) || 0));
  const sx = ax + iconSize * 0.48;
  const sy = ay + iconSize * 0.14;
  const wave = Math.sin(time * 2.5 + boss.id * 0.7);
  const endY = ty - drawSize * 0.04;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = Math.min(1, pulse + hitPulse * 0.55);

  buildBossTetherPath(ctx, sx, sy, tx, endY, wave);
  ctx.shadowColor = 'rgba(255, 180, 48, .9)';
  ctx.shadowBlur = 18 + pulse * 8 + hitPulse * 42;
  ctx.strokeStyle = 'rgba(255, 190, 55, .28)';
  ctx.lineWidth = 9 + hitPulse * 5;
  ctx.stroke();

  buildBossTetherPath(ctx, sx, sy, tx, endY, wave);
  ctx.shadowBlur = 7 + hitPulse * 18;
  ctx.strokeStyle = hitPulse > 0 ? 'rgba(255, 246, 181, 1)' : 'rgba(255, 218, 112, .95)';
  ctx.lineWidth = 2.6 + hitPulse * 2.5;
  ctx.stroke();

  buildBossTetherPath(ctx, sx, sy, tx, endY, wave);
  ctx.shadowBlur = 0;
  ctx.setLineDash([5, 11]);
  ctx.lineDashOffset = -time * 34;
  ctx.strokeStyle = 'rgba(255, 247, 190, .82)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/** Draw the boss icon above room actors so scenery cannot hide it. */
export function drawBossBadge() {
  const ctx = getCtx();
  const boss = getActiveBoss();
  if (!ctx || !boss) return;

  const { x, y, iconSize } = getBossBadgeLayout();
  const bossEmoji = boss.bossEmoji || G.dungeon?.worldDef?.bossEmoji || '🐉';
  const bossName = G.dungeon?.worldDef?.bossName || '';
  const radius = iconSize * 0.62;
  const pulse = 0.78 + Math.sin(performance.now() * 0.003) * 0.22;

  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = 'rgba(255, 188, 45, .75)';
  ctx.shadowBlur = 14 + pulse * 8;
  ctx.fillStyle = 'rgba(23, 11, 8, .82)';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255, 213, 92, ${0.58 + pulse * 0.22})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = `${iconSize}px 'Noto Color Emoji', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bossEmoji, 0, 0);

  if (bossName) {
    ctx.font = `bold ${Math.max(10, Math.floor(iconSize * 0.19))}px 'Noto Sans KR', sans-serif`;
    ctx.fillStyle = 'rgba(255, 235, 170, .92)';
    ctx.shadowColor = 'rgba(0, 0, 0, .9)';
    ctx.shadowBlur = 4;
    ctx.fillText(bossName, 0, radius + Math.max(12, iconSize * 0.22));
  }
  ctx.restore();
}

export function drawMonsters({
  bodyFilter = null,
  labelFilter = null,
  drawBodies = true,
  drawLabels = true,
} = {}) {
  const ctx = getCtx();
  if (!ctx || !G.room) return;
  const monsters = G.room.monsters;

  // Pass 1: bodies
  if (drawBodies) for (const m of monsters) {
    if (m.dead || (bodyFilter && !bodyFilter(m))) continue;

    // ── Spawn animation (falling from ceiling) ──────────────────
    if (m.spawnAnim && m.spawnAnim.t < m.spawnAnim.dur) {
      const prog = m.spawnAnim.t / m.spawnAnim.dur;
      // Trailer drops are intentionally very quick. Hide the first fraction
      // so a newly spawned emoji never sits frozen and bright before falling.
      if (m.trailerSpawn && prog < 0.34) continue;
      const hpRatio  = m.maxHp > 1 ? m.hp / m.maxHp : 1;
      const drawSz   = m.size * (m.maxHp > 1 ? (0.55 + hpRatio * 0.45) : 1);

      // Shadow on "floor": starts 2.5× size, shrinks as monster descends
      const shadowProg  = Math.min(1, prog / 0.78); // 0→1 during fall phase
      const shadowScale = Math.max(0, 2.5 - shadowProg * 2.0); // 2.5 → 0.5
      if (shadowScale > 0.06) {
        const shadowY = m.spawnAnim.landNY * G.vH;
        ctx.save();
        ctx.globalAlpha = 0.38 * (shadowScale / 2.5);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(m.x, shadowY,
          drawSz * shadowScale * 0.55,
          drawSz * shadowScale * 0.17,
          0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Monster: visible from the start, starts huge (2.2×) → 1× on impact
      const impactProg = Math.max(0, (prog - 0.78) / 0.22); // 0→1 after impact
      const mScale = prog < 0.78 ? 1.8 - shadowProg * 0.6   // 1.8 → 1.2 during fall
                                 : 1.2 - impactProg * 0.2;   // 1.2 → 1.0 on landing
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(mScale, mScale);
      if (m.flash > 0) ctx.filter = `brightness(${1 + m.flash * 2.5})`;
      ctx.shadowColor = 'rgba(0,0,0,0.82)';
      ctx.shadowBlur  = 14;
      ctx.shadowOffsetY = 3;
      ctx.font = `${drawSz}px 'Noto Color Emoji', serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m.emoji, 0, 0);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.filter = 'none';
      ctx.restore();
      continue; // skip normal body
    }
    // ────────────────────────────────────────────────────────────

    ctx.save();
    if (m.fleeing) ctx.globalAlpha = m.fleeAlpha ?? 1;
    ctx.translate(m.x, m.y);
    const hpRatio   = m.maxHp > 1 ? m.hp / m.maxHp : 1;
    const sizeScale = m.maxHp > 1 ? (0.55 + hpRatio * 0.45) : 1;
    const drawSz    = m.size * sizeScale;

    if (m.type === 'arrow' && m.angle !== undefined) {
      ctx.rotate(m.angle - Math.PI / 4);
    } else {
      ctx.translate(Math.sin(m.wob) * 3, 0);
    }
    ctx.scale(m.scl, m.scl);

    if (m.flash > 0) ctx.filter = `brightness(${1 + m.flash * 2.5})`;
    const shadowPulse = 0.5 + 0.5 * Math.abs(Math.sin(m.wob));
    ctx.shadowColor   = 'rgba(0,0,0,0.82)';
    ctx.shadowBlur    = 12 + shadowPulse * 10;
    ctx.shadowOffsetY = 3 + shadowPulse * 4;
    ctx.font = `${drawSz}px 'Noto Color Emoji', serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (m.shapeshift) {
      const prog = Math.min(1, m.shapeshift.t / m.shapeshift.dur);
      // Old emoji fades out and scales up (exits dramatically)
      ctx.save();
      ctx.globalAlpha = 1 - prog;
      ctx.font = `${drawSz * (1 + prog * 0.5)}px 'Noto Color Emoji', serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m.shapeshift.from, 0, 0);
      ctx.restore();
      // New emoji pops in (enters from big → normal)
      const popScale = 1 + Math.max(0, 0.7 - prog * 1.4);
      ctx.save();
      ctx.globalAlpha = prog;
      ctx.scale(popScale, popScale);
      ctx.font = `${drawSz}px 'Noto Color Emoji', serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m.emoji, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(m.emoji, 0, 0);
    }
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.filter = 'none';

    // Wield icon
    if (m.wieldIcon || (m.special === 'warrior' && m.shielded)) {
      const isBlocking = m.special === 'warrior' && m.shielded;
      const icon = isBlocking ? '🛡️' : m.wieldIcon;
      const wSz = Math.max(14, drawSz * 0.42);
      const shieldScale = isBlocking ? 2.2 : 1.0;
      ctx.font = `${wSz * shieldScale}px 'Noto Color Emoji', serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, drawSz * 0.38, drawSz * 0.4);
    }

    // HP hearts - or VERB/ADJ conjugation label for verb/adjective monsters
    if (!m.isProjectileMonster) {
      const sz  = Math.max(8, 13 - m.maxHp * 0.5);
      const labelY = -(drawSz * 0.6 + 14);
      ctx.textBaseline = 'middle';

      if (m.isVerbAdj) {
        const isVerb = m.verbAdjType === 'verb';
        const typeName = isVerb ? i18n('hud.verbLabel') : i18n('hud.adjectiveLabel');
        const conj = m.conjugation;
        let labelText;
        if (!conj || conj.isInfinitive) {
          labelText = typeName;
        } else if (conj.isModifier) {
          labelText = `${typeName}: ✨`;
        } else {
          const tenseIcon    = conj.tense === 'past' ? '⏪' : conj.tense === 'present' ? '⏺️' : '⏩';
          const formalIcon   = conj.formality === 'banmal' ? '🧢' : conj.formality === 'haeyoche' ? '🎩' : '👑';
          labelText = `${typeName}: ${tenseIcon}${formalIcon}`;
        }
        ctx.font = `bold ${sz}px "Noto Sans KR", 'Noto Color Emoji', sans-serif`;
        ctx.fillStyle   = '#ffaa44';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth   = 2.5;
        ctx.strokeText(labelText, 0, labelY);
        ctx.fillText(labelText, 0, labelY);
      } else if (m.isNumeric) {
        // Show "Sino" or "Native" label for values < 100; 100+ has no label (always sino)
        if (m.numericSystem && m.numericValue < 100) {
          const labelText = m.numericSystem === 'native'
            ? i18n('number.native')
            : i18n('number.sino');
          ctx.font = `bold ${sz}px "Noto Sans KR", sans-serif`;
          ctx.fillStyle   = '#88ffdd';
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.lineWidth   = 2.5;
          ctx.strokeText(labelText, 0, labelY);
          ctx.fillText(labelText, 0, labelY);
        }
      } else {
        // For normal monsters: show HP icon if monster has more than 1 HP
        // (single-HP monsters don't show health indicator)
        if (m.hp > 1) {
          ctx.font = `${sz}px 'Noto Color Emoji', serif`;
          ctx.fillText((m.hpIcon || '📃').repeat(Math.max(0, m.hp)), 0, labelY);
        }
      }
    }
    ctx.restore();
  }

  if (!drawLabels) return;

  // Pass 2: word labels
  const LABEL_FONTS = ['"Pretendard"', '"Song Myung"', '"Nanum Myeongjo"'];
  const shouldDrawLabel = labelFilter || bodyFilter;
  for (const m of monsters) {
    // A deterministic final hit has already removed this enemy from gameplay.
    // Keep its body for the projectile impact, but remove the obsolete word so
    // a fast player never reads two targets that no longer exist.
    if (m.dead || m.defeatCommitted) continue;
    // While a multi-HP target has an in-flight hit bound to it, its current
    // word is no longer actionable. Hide it until impact reveals its next
    // form/word, rather than presenting a stale typing target.
    if (m.maxHp > 1 && m.firedAt) continue;
    if (shouldDrawLabel && !shouldDrawLabel(m)) continue;
    if (m.fleeing) continue;
    // Hide label until monster lands (last 25% of spawn)
    if (m.spawnAnim && m.spawnAnim.t < m.spawnAnim.dur) {
      const prog = m.spawnAnim.t / m.spawnAnim.dur;
      if (prog < 0.76) continue;
    }
    if (m.special === 'warrior' && m.shielded && m.shieldDur > 1.0) continue;
    if (m.type === 'boss' && m.special === 'king' && m.kingWaiting) continue;

    const hpRatio   = m.maxHp > 1 ? m.hp / m.maxHp : 1;
    const sizeScale = m.maxHp > 1 ? (0.55 + hpRatio * 0.45) : 1;
    const drawSz    = m.size * sizeScale;

    ctx.save();
    ctx.translate(m.x, m.y);

    const playerHard = G.difficulty === 'hard' || G.difficulty === 'hardcore';
    const fontFace = (G.varyFonts && (playerHard || G.run?.expertMode || (G.run?.worldIdx ?? 0) >= 2))
      ? LABEL_FONTS[m.id % LABEL_FONTS.length] : '"Noto Sans KR"';
    const word     = m.word || '';
    const wordSz   = Math.max(20, Math.round((G.hangulSize || 38) * G.vH / 1080) - word.length * 0.3);
    ctx.font        = `bold ${wordSz}px ${fontFace}, 'Noto Color Emoji', sans-serif`;
    ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,1)';
    ctx.shadowBlur  = 6; ctx.shadowOffsetY = 2;
    ctx.strokeStyle = 'rgba(0,0,0,.98)';
    ctx.lineWidth   = 5;
    ctx.fillStyle   = m.labelColor || (m.type === 'boss' ? '#ffd700' : '#fff');

    if (word) {
      const belowY = drawSz * 0.6 + 18;
      
      // Check if this word should be hidden (after 5+ kills on nouns, or conjugation threshold on verbs/adj)
      // But if dictionary item is active, flash between hidden and visible
      // Dojang (world 0) always shows words — it's a learning environment
      const wordDef = WORD_DICT.find(d => d.text === (m.verbAdjDictWord || word));
      const isNoun = wordDef && wordDef.category !== 'verb' && wordDef.category !== 'adjective';
      let shouldHideWord = false;

      if (m.alwaysRevealWord || G.run?.worldIdx === 0) {
        shouldHideWord = false;
      } else if (isNoun) {
        // Noun hiding: based on kill count
        shouldHideWord = G.wordHiddenStatus[word];
      } else if (wordDef && (wordDef.category === 'verb' || wordDef.category === 'adjective')) {
        // Verb/adj hiding: based on total conjugation usage (sum of all conjugation counts)
        const conjCounts = G.wordConjugationCounts[m.verbAdjDictWord || word];
        if (conjCounts) {
          const totalConjugations = Object.values(conjCounts).reduce((sum, count) => sum + count, 0);
          // Hide after 10+ total conjugations (more lenient than nouns since there are 9 forms)
          shouldHideWord = totalConjugations >= 10;
        }
      }
      
      // If dictionary reveals hidden words, flash visibility
      if (shouldHideWord && G.room?.revealedHidden) {
        shouldHideWord = !G.room._hiddenFlip; // Flip every 0.5s
      }

      // Render word name (or placeholder if hidden)
      if (!shouldHideWord) {
        ctx.strokeText(word, 0, belowY);
        ctx.shadowBlur = 0;
        ctx.fillText(word, 0, belowY);
      } else {
        // Word is hidden - show placeholder to indicate there IS a word here
        ctx.strokeText('???', 0, belowY);
        ctx.shadowBlur = 0;
        ctx.fillText('???', 0, belowY);
      }

      // For verb/adj monsters use the original 다-form to look up translation & hanja
      const entry = wordDef;
      // subLineY = vertical position for the next label below the word
      let subLineY = belowY + wordSz + 2;

      // Numeric monsters: show Arabic numeral; others: show translation hint
      if (m.isNumeric && m.numericValue != null) {
        const numStr = m.numericValue.toLocaleString();
        const numSz = Math.max(9, wordSz * 0.85);
        ctx.font = `bold ${numSz}px "Noto Sans KR", monospace, sans-serif`;
        ctx.fillStyle   = 'rgba(255,220,100,0.95)';
        ctx.lineWidth   = 2.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.strokeText(numStr, 0, subLineY);
        ctx.fillText(numStr, 0, subLineY);
      } else if (G.translationEnabled && !m.isProjectileMonster && wordDef && !G.dungeon?.worldDef?.noLearning) {
        const trans = wordTr(wordDef.text, wordDef.emoji);
        if (trans) {
          const transSz = Math.max(7, wordSz * 0.62);
          ctx.font      = `${transSz}px "Noto Sans KR", sans-serif`;
          ctx.fillStyle = 'rgba(180,210,255,0.72)';
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = 'rgba(0,0,0,0.9)';
          ctx.strokeText(trans, 0, subLineY);
          ctx.fillText(trans, 0, subLineY);
          subLineY += transSz + (G.showHanjaOnMonsters ? 6 : 2);
        }
      }

      // Hanja - shown only when toggle on; below translation (or in translation spot if off)
      if (G.showHanjaOnMonsters && entry?.hanja) {
        const hSz = Math.max(8, wordSz * 0.6);
        ctx.font = `${hSz}px 'Noto Color Emoji', serif`;
        ctx.fillStyle = 'rgba(255, 200, 80, 0.85)';
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(entry.hanja, 0, subLineY);
        ctx.fillText(entry.hanja, 0, subLineY);
      }
    }
    ctx.restore();
  }
}

export function drawProjs() {
  const ctx = getCtx();
  if (!ctx || !G.room) return;
  const now = performance.now();
  for (const p of G.room.projs) {
    ctx.save();
    // P2 ghost projectiles: slightly transparent to distinguish from local player's
    if (p._fromP2) ctx.globalAlpha = 0.72;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    const age     = Math.min(1, (now - (p.born || now)) / 350);
    const arcT    = Math.sin(age * Math.PI);
    const sizeMult = p._fromP2 ? 0.85 : 1; // P2 projectiles slightly smaller
    const drawSize = p.size * (0.55 + arcT * 0.55) * sizeMult;
    const shadowSz = 4 + arcT * 18;
    ctx.shadowColor   = p._fromP2 ? 'rgba(100,180,255,0.6)' : 'rgba(0,0,0,0.5)';
    ctx.shadowBlur    = shadowSz;
    ctx.shadowOffsetY = 2 + arcT * 8;
    ctx.font = `${drawSize}px 'Noto Color Emoji', serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.emoji, 0, 0);
    if (p.jamo) {
      // Trailer-only enemy projectiles carry a readable typing clue. It makes
      // a hit feel like a missed multitasking prompt instead of an arbitrary
      // projectile, while leaving normal game projectiles unchanged.
      ctx.save();
      ctx.rotate(-p.rot);
      ctx.font = `bold ${Math.max(20, drawSize * 1.0)}px 'Noto Sans KR', sans-serif`;
      ctx.fillStyle = 'rgba(255, 247, 225, .96)';
      ctx.shadowColor = 'rgba(0, 0, 0, .95)';
      ctx.shadowBlur = Math.max(3, drawSize * 0.24);
      ctx.lineWidth = Math.max(1.8, drawSize * 0.07);
      ctx.strokeStyle = 'rgba(0, 0, 0, .9)';
      ctx.strokeText(p.jamo, 0, drawSize * 1.02);
      ctx.fillText(p.jamo, 0, drawSize * 1.02);
      ctx.restore();
    }
    ctx.restore();
  }
}

export function drawParts() {
  const ctx = getCtx();
  if (!ctx || !G.room) return;
  for (const p of G.room.parts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.font = `bold ${p.size}px ${p.fontOverride || "'Noto Color Emoji', serif"}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (p.color) {
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = p.color;
    }
    ctx.fillText(p.emoji, p.x, p.y);
    ctx.restore();
  }
}

/* ================================================================
   COIN SYSTEM - fall from monsters, collect on clear, explode on flee
================================================================ */
function spawnCoins(x, y, count) {
  if (!G.room) return;
  for (let i = 0; i < count; i++) {
    const gold = Math.random() < 0.4; // 40% gold, 60% silver
    const a = Math.random() * Math.PI * 2;
    const spd = 40 + Math.random() * 80;
    G.room.coins.push({
      x, y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      r: (9 + Math.random() * 5) * G.vH / 1080,
      gold,
      state: 'falling', // 'falling' | 'resting' | 'flying' | 'done'
      alpha: 1,
    });
  }
}

export function tickCoins(dt) {
  if (!G.room?.coins) return;
  const px = G.W / 2, py = G.vH * 0.85;

  for (const c of G.room.coins) {
    if (c.state === 'falling') {
      // Top-down bounce: coins spread out and settle near spawn point
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= Math.pow(0.12, dt); // fast horizontal decel
      c.vy *= Math.pow(0.12, dt); // fast vertical decel
      const speed = Math.hypot(c.vx, c.vy);
      if (speed < 4) { c.vx = 0; c.vy = 0; c.state = 'resting'; }
    } else if (c.state === 'flying') {
      const dx = px - c.x, dy = py - c.y;
      const dist = Math.hypot(dx, dy) || 1;
      const spd = 900;
      c.x += (dx / dist) * spd * dt;
      c.y += (dy / dist) * spd * dt;
      if (Math.hypot(c.x - px, c.y - py) < 18) c.state = 'done';
    } else if (c.state === 'exploding') {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= Math.pow(0.1, dt);
      c.vy *= Math.pow(0.1, dt);
      c.alpha = Math.max(0, c.alpha - dt * 2.5);
      if (c.alpha <= 0) c.state = 'done';
    }
  }
  G.room.coins = G.room.coins.filter(c => c.state !== 'done');
}

export function drawCoins(ctx) {
  if (!ctx || !G.room?.coins) return;
  for (const c of G.room.coins) {
    if (c.state === 'done') continue;
    ctx.save();
    ctx.globalAlpha = c.alpha ?? 1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = c.gold ? '#f5c518' : '#c0c0c0';
    ctx.shadowColor = c.gold ? 'rgba(255,200,0,0.6)' : 'rgba(180,180,180,0.5)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = c.gold ? '#7a5500' : '#555';
    ctx.font = `bold ${Math.floor(c.r * 1.1)}px 'Noto Color Emoji', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('₩', c.x, c.y + Math.floor(c.r * 0.1));
    ctx.restore();
  }
}

export function collectCoins() {
  if (!G.room) return;
  // Move all resting coins toward player
  for (const c of G.room.coins) {
    if (c.state === 'resting' || c.state === 'falling') c.state = 'flying';
  }
  // Commit room pool to wallet
  const amount = G.room.roomPool || 0;
  G.run.wallet = (G.run.wallet || 0) + amount;
  if (amount > 0) G.run.coinsEarned = (G.run.coinsEarned || 0) + amount;
  G.room.roomPool = 0;
  updateWalletDisplay();
  if (amount > 0 && _onCoinsCollectedCallback) _onCoinsCollectedCallback(amount);
}

export function explodeCoins() {
  if (!G.room) return;
  for (const c of G.room.coins) {
    if (c.state === 'resting' || c.state === 'falling') {
      c.state = 'exploding';
      const ea = Math.random() * Math.PI * 2;
      const es = 80 + Math.random() * 200;
      c.vx = Math.cos(ea) * es;
      c.vy = Math.sin(ea) * es;
    }
  }
  G.room.roomPool = 0; // lost on flee
}

export function spawnMissParticles(text) {
  if (!G.room) return;
  const cx = G.W / 2;
  const cy = G.vH * 0.78;
  for (let i = 0; i < text.length; i++) {
    const spread = (i - (text.length - 1) / 2) * 0.22;
    const angle = -Math.PI / 2 + spread + (Math.random() - 0.5) * 1.2;
    const spd = 130 + Math.random() * 220;
    G.room.parts.push({
      x: cx + (Math.random() - 0.5) * 40,
      y: cy,
      emoji: text[i],
      size: 20 + Math.random() * 8,
      life: 1,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      color: '#ffe066',
      fontOverride: '"Noto Sans KR", "Noto Color Emoji", sans-serif',
    });
  }
}

export function killAllEnemies() {
  if (!G.room) return;
  // Clear pending spawn queue so no more enemies arrive
  G.room.wTemplates = [];
  G.room.wPrepared = [];
  G.room.wPending = 0;
  G.room.pendingWordLoad = 0;
  for (const m of [...G.room.monsters]) {
    if (!m.dead) {
      m.hp = 0;
      m.dead = true;
      m.flash = 1;
      explode(m.x, m.y, m.size);
    }
  }
  onMonsterRemoved();
}

// renderShopRoom removed - shop rendering is handled by hud.js renderShopScreen
