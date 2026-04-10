/* ================================================================
   HANGUL DOJANG - Data Layer
   Stroke definitions, syllable math, progression config
================================================================ */

// ── Hangul syllable block math ────────────────────────────────
export const HANGUL_BASE = 0xAC00;
export const HANGUL_END  = 0xD7A3;

// Chosung (initial consonants): 19 total, indexed 0-18
export const CHOSUNGS = [
  'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ',
  'ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];

// Jungsung (vowels): 21 total, indexed 0-20
export const JUNGSUNGS = [
  'ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ',
  'ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ',
];

// Jongsung (final consonants): index 0 = none, 1-27 = consonants
export const JONGSUNGS = [
  '','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ',
  'ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ',
  'ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];

// Common simple jongsungs for Phase 3 practice (indices into JONGSUNGS)
const SIMPLE_JONG_IDX = [1, 4, 8, 16, 17, 19, 21]; // ㄱ ㄴ ㄹ ㅁ ㅂ ㅅ ㅇ

// Basic jungsung indices (no compound vowels) for Phase 2/3
const BASIC_JUNG_IDX = [0, 2, 4, 6, 8, 12, 13, 17, 18, 20]; // ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ

export function buildSyllable(choIdx, jungIdx, jongIdx = 0) {
  return String.fromCharCode(HANGUL_BASE + (choIdx * 21 + jungIdx) * 28 + jongIdx);
}

export function decomposeSyllable(syllable) {
  const c = syllable.charCodeAt(0);
  if (c < HANGUL_BASE || c > HANGUL_END) return null;
  const rel     = c - HANGUL_BASE;
  const jongIdx = rel % 28;
  const jungIdx = Math.floor(rel / 28) % 21;
  const choIdx  = Math.floor(rel / 588); // 588 = 21 * 28
  return {
    choIdx, jungIdx, jongIdx,
    cho:  CHOSUNGS[choIdx],
    jung: JUNGSUNGS[jungIdx],
    jong: JONGSUNGS[jongIdx],
  };
}

// Compound jongseong → constituent jamos (e.g. ㄺ → ['ㄹ','ㄱ'])
export const COMPOUND_JONGSEONG_MAP = {
  'ㄳ': ['ㄱ','ㅅ'], 'ㄵ': ['ㄴ','ㅈ'], 'ㄶ': ['ㄴ','ㅎ'],
  'ㄺ': ['ㄹ','ㄱ'], 'ㄻ': ['ㄹ','ㅁ'], 'ㄼ': ['ㄹ','ㅂ'],
  'ㄽ': ['ㄹ','ㅅ'], 'ㄾ': ['ㄹ','ㅌ'], 'ㄿ': ['ㄹ','ㅍ'],
  'ㅀ': ['ㄹ','ㅎ'], 'ㅄ': ['ㅂ','ㅅ'],
};

// Returns ordered jamos array for a composed syllable block.
// Compound batchim (e.g. ㄺ) are split into their constituent jamos.
export function syllableToJamos(syllable) {
  const d = decomposeSyllable(syllable);
  if (!d) return [syllable]; // bare jamo or non-hangul char
  const jamos = [d.cho, d.jung];
  if (d.jongIdx > 0) {
    const parts = COMPOUND_JONGSEONG_MAP[d.jong];
    if (parts) jamos.push(...parts);
    else       jamos.push(d.jong);
  }
  return jamos;
}


// ── Stroke definitions ────────────────────────────────────────
// Angle in degrees, measured clockwise from right in canvas coords:
//   0 = right (→)   90 = down (↓)   180 = left (←)   270 = up (↑)
//   45 = down-right (↘)   135 = down-left (↙)
// 'circle' = closed arc stroke
// Array [a,b] = compound stroke: first segment goes toward a, then bends toward b
//  t = tolerance in degrees (default 55°)

const D = 55; // default tolerance

export const JAMO_STROKES = {
  // ── Basic consonants (SVG-verified stroke counts) ─────────────
  // Compound [firstDir, secondDir] strokes capture L-shaped single motions
  'ㄱ': [{a:[0,90],  t:D}],                                      // 1: →↓ (L-shape)
  'ㄴ': [{a:[90,0],  t:D}],                                      // 1: ↓→ (rev-L)
  'ㄷ': [{a:0,t:D},  {a:[90,0],t:D}],                            // 2: →  then ↓→
  'ㄹ': [{a:[0,90],t:D}, {a:0,t:D}, {a:[90,0],t:D}],            // 3: →↓ → ↓→
  'ㅁ': [{a:90,t:D}, {a:[0,90],t:D}, {a:0,t:D}],                // 3: ↓  →↓  →
  'ㅂ': [{a:90,t:D}, {a:90,t:D}, {a:0,t:D}, {a:0,t:D}],        // 4: ↓↓ →→
  'ㅅ': [{a:135,t:D},{a:45,t:D}],                                // 2: ↙ ↘
  'ㅇ': [{a:'circle'}],                                           // 1: ○
  // ㅈ/ㅊ: stroke 1 is →↙ (like the number 7: horiz then bends down-left)
  // SVG arrow-1 confirms: h274.67 then l-115.46 127.56 (right then down-left)
  'ㅈ': [{a:[0,135],t:D}, {a:45,t:D}],                           // 2: →↙  ↘
  'ㅊ': [{a:0,t:60},  {a:[0,135],t:D}, {a:45,t:D}],              // 3: →   →↙  ↘
  'ㅋ': [{a:[0,90],t:D}, {a:0,t:D}],                             // 2: →↓  →
  'ㅌ': [{a:0,t:D},  {a:0,t:D},  {a:[90,0],t:D}],               // 3: →  →  ↓→
  'ㅍ': [{a:0,t:D},  {a:90,t:D}, {a:90,t:D}, {a:0,t:D}],       // 4: →  ↓  ↓  →
  // ㅎ: short → tick at top, long → bar, then ○
  'ㅎ': [{a:0,t:60}, {a:0,t:D},  {a:'circle'}],                  // 3: →  →  ○

  // ── Tense consonants ─────────────────────────────────────────
  'ㄲ': [{a:[0,90],t:D}, {a:[0,90],t:D}],                       // 2: ㄱ×2
  'ㄸ': [{a:0,t:D},{a:[90,0],t:D}, {a:0,t:D},{a:[90,0],t:D}],  // 4: ㄷ×2
  'ㅃ': [{a:90,t:D},{a:90,t:D},{a:0,t:D},{a:0,t:D},
          {a:90,t:D},{a:90,t:D},{a:0,t:D},{a:0,t:D}],           // 8: ㅂ×2
  'ㅆ': [{a:135,t:D},{a:45,t:D},{a:135,t:D},{a:45,t:D}],        // 4: ㅅ×2
  'ㅉ': [{a:[0,135],t:D},{a:45,t:D},{a:[0,135],t:D},{a:45,t:D}], // 4: ㅈ×2

  // ── Vowels ───────────────────────────────────────────────────
  // ㅓ/ㅕ/ㅔ/ㅖ: tick → (left-to-right) FIRST, then ↓ vertical
  'ㅣ': [{a:90,t:D}],                                            // 1: ↓
  'ㅡ': [{a:0,t:D}],                                             // 1: →
  'ㅏ': [{a:90,t:D},  {a:0,t:60}],                              // 2: ↓ →
  'ㅑ': [{a:90,t:D},  {a:0,t:60},  {a:0,t:60}],                 // 3: ↓ → →
  'ㅓ': [{a:0,t:60},  {a:90,t:D}],                              // 2: → ↓  (tick left-to-right first)
  'ㅕ': [{a:0,t:60},  {a:0,t:60},  {a:90,t:D}],                 // 3: → → ↓
  'ㅗ': [{a:90,t:60}, {a:0,t:D}],                               // 2: ↓ →
  'ㅛ': [{a:90,t:60}, {a:90,t:60}, {a:0,t:D}],                  // 3: ↓ ↓ →
  'ㅜ': [{a:0,t:D},   {a:90,t:60}],                             // 2: → ↓
  'ㅠ': [{a:0,t:D},   {a:90,t:60}, {a:90,t:60}],                // 3: → ↓ ↓
  'ㅐ': [{a:90,t:D},  {a:0,t:60},  {a:90,t:D}],                 // 3: ↓ → ↓
  'ㅒ': [{a:90,t:D},  {a:0,t:60},  {a:0,t:60},  {a:90,t:D}],   // 4: ↓ → → ↓
  'ㅔ': [{a:0,t:60},  {a:90,t:D},  {a:90,t:D}],                 // 3: → ↓ ↓
  'ㅖ': [{a:0,t:60},  {a:0,t:60},  {a:90,t:D},  {a:90,t:D}],   // 4: → → ↓ ↓
  'ㅢ': [{a:0,t:D},   {a:90,t:D}],                              // 2: → ↓
  'ㅚ': [{a:90,t:60}, {a:0,t:D},   {a:90,t:D}],                 // 3: ↓ → ↓ (ㅗ+ㅣ)
  'ㅟ': [{a:0,t:D},   {a:90,t:60}, {a:90,t:D}],                 // 3: → ↓ ↓ (ㅜ+ㅣ)
  'ㅘ': [{a:90,t:60}, {a:0,t:D},   {a:90,t:D},  {a:0,t:60}],   // 4: ↓ → ↓ →
  'ㅙ': [{a:90,t:60}, {a:0,t:D},   {a:90,t:D},  {a:0,t:60},{a:90,t:D}], // 5
  'ㅝ': [{a:0,t:D},   {a:90,t:60}, {a:0,t:60},  {a:90,t:D}],   // 4: → ↓ → ↓ (ㅜ+ㅓ)
  'ㅞ': [{a:0,t:D},   {a:90,t:60}, {a:0,t:60},  {a:90,t:D},{a:90,t:D}], // 5 (ㅜ+ㅔ)
};

// ── Jamo name & romanization ──────────────────────────────────
export const JAMO_INFO = {
  'ㄱ': { name: '기역',   rom: 'g/k'  },
  'ㄲ': { name: '쌍기역', rom: 'kk'   },
  'ㄴ': { name: '니은',   rom: 'n'    },
  'ㄷ': { name: '디귿',   rom: 'd/t'  },
  'ㄸ': { name: '쌍디귿', rom: 'tt'   },
  'ㄹ': { name: '리을',   rom: 'r/l'  },
  'ㅁ': { name: '미음',   rom: 'm'    },
  'ㅂ': { name: '비읍',   rom: 'b/p'  },
  'ㅃ': { name: '쌍비읍', rom: 'pp'   },
  'ㅅ': { name: '시옷',   rom: 's'    },
  'ㅆ': { name: '쌍시옷', rom: 'ss'   },
  'ㅇ': { name: '이응',   rom: 'ng/–' },
  'ㅈ': { name: '지읒',   rom: 'j'    },
  'ㅉ': { name: '쌍지읒', rom: 'jj'   },
  'ㅊ': { name: '치읓',   rom: 'ch'   },
  'ㅋ': { name: '키읔',   rom: 'k'    },
  'ㅌ': { name: '티읕',   rom: 't'    },
  'ㅍ': { name: '피읖',   rom: 'p'    },
  'ㅎ': { name: '히읗',   rom: 'h'    },
  'ㅏ': { name: '아',     rom: 'a'    },
  'ㅐ': { name: '애',     rom: 'ae'   },
  'ㅑ': { name: '야',     rom: 'ya'   },
  'ㅒ': { name: '얘',     rom: 'yae'  },
  'ㅓ': { name: '어',     rom: 'eo'   },
  'ㅔ': { name: '에',     rom: 'e'    },
  'ㅕ': { name: '여',     rom: 'yeo'  },
  'ㅖ': { name: '예',     rom: 'ye'   },
  'ㅗ': { name: '오',     rom: 'o'    },
  'ㅘ': { name: '와',     rom: 'wa'   },
  'ㅙ': { name: '왜',     rom: 'wae'  },
  'ㅚ': { name: '외',     rom: 'oe'   },
  'ㅛ': { name: '요',     rom: 'yo'   },
  'ㅜ': { name: '우',     rom: 'u'    },
  'ㅝ': { name: '워',     rom: 'wo'   },
  'ㅞ': { name: '웨',     rom: 'we'   },
  'ㅟ': { name: '위',     rom: 'wi'   },
  'ㅠ': { name: '유',     rom: 'yu'   },
  'ㅡ': { name: '으',     rom: 'eu'   },
  'ㅢ': { name: '의',     rom: 'ui'   },
  'ㅣ': { name: '이',     rom: 'i'    },
};

// Phase 1 jamos in pedagogical introduction order
export const PHASE1_JAMOS = [
  // Basic consonants
  'ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
  // Basic vowels
  'ㅏ','ㅑ','ㅓ','ㅕ','ㅗ','ㅛ','ㅜ','ㅠ','ㅡ','ㅣ',
  // Combined vowels
  'ㅐ','ㅒ','ㅔ','ㅖ','ㅘ','ㅙ','ㅚ','ㅝ','ㅞ','ㅟ','ㅢ',
  // Tense consonants
  'ㄲ','ㄸ','ㅃ','ㅆ','ㅉ',
];

// ── Progression constants ─────────────────────────────────────
export const MAX_JAMO_COUNT      = 200; // completions for full mastery bar
export const BATCHIM_UNLOCK_COUNT = 40; // 20% → unlock batchim in book dropdown
export const WORDS_UNLOCK_PCT    = 0.5; // 50% of all jamos → show words

// Stage definitions:
//  0 = intro jamos (14 basic cons + 10 basic vows)
//  1 = compound vowels + tense consonants (11 comp vows + 5 tense cons)
//  2 = CV syllables (all 19×21=399 combinations must be seen once)
//  3 = batchim (CVC syllables)
export const INTRO_JAMOS = PHASE1_JAMOS.slice(0, 24); // 14 basic cons + 10 basic vows
export const EXTRA_JAMOS = PHASE1_JAMOS.slice(24);    // 11 compound vows + 5 tense cons

// Precomputed list of all 19×21=399 CV syllables (no batchim)
export const ALL_CV_SYLLABLES = CHOSUNGS.flatMap((_, ci) =>
  JUNGSUNGS.map((_, ji) => buildSyllable(ci, ji, 0))
);

// Complex syllables for the 50%+ stage
export const COMPLEX_SYLLABLES = [
  '뾂','쀏','쀒','뾃','읽','짧','삶','닭','몫','흙',
  '앉','얹','핥','훑','밟','젊','밝','낡','긁','끓',
];

// ── Jamo descriptions ─────────────────────────────────────────
// Full text lives in assets/lang/{pt,en,ko}.json under the "jamo_desc" key.
// Jamos that have a batchim section (others have no batchim entry in the JSON).
export const JAMO_HAS_BATCHIM = new Set([
  'ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
  'ㄲ','ㄸ','ㅆ',
]);

// ── Hangul stage progression ──────────────────────────────────
// Stage 0: intro jamos (INTRO_JAMOS must all be seen once)
// Stage 1: compound vowels + tense (EXTRA_JAMOS must all be seen once)
// Stage 2: CV syllables (all 399 combinations must be written once)
// Stage 3: batchim (CVC syllables, random)

export function computeHangulStage(stats) {
  const seen = stats.seenJamos || [];
  const seenSyl = stats.seenSyllables || [];
  if (!INTRO_JAMOS.every(j => seen.includes(j))) return 0;
  if (!EXTRA_JAMOS.every(j => seen.includes(j))) return 1;
  if (ALL_CV_SYLLABLES.some(s => !seenSyl.includes(s))) return 2;
  return 3;
}

// Weighted random pick from pool [{item, w}]
function _pickWeighted(pool) {
  const total = pool.reduce((s, p) => s + p.w, 0);
  if (total <= 0) return pool[0]?.item;
  let r = Math.random() * total;
  for (const { item, w } of pool) { r -= w; if (r <= 0) return item; }
  return pool[pool.length - 1]?.item;
}

const BASIC_JUNG_SET = new Set(BASIC_JUNG_IDX);

export function pickNextChallenge(stats) {
  const jp        = stats.jamoProgress || {};
  const seen      = new Set(stats.seenJamos || []);
  const seenSyl   = new Set(stats.seenSyllables || []);
  const stage     = computeHangulStage(stats);
  const pool      = [];

  if (stage === 0) {
    for (const j of INTRO_JAMOS) {
      const count = jp[j]?.count || 0;
      pool.push({ item: j, w: seen.has(j) ? Math.max(1, 20 - count) : 60 });
    }
  } else if (stage === 1) {
    for (const j of EXTRA_JAMOS) {
      const count = jp[j]?.count || 0;
      pool.push({ item: j, w: seen.has(j) ? Math.max(1, 15 - count) : 55 });
    }
    for (const j of INTRO_JAMOS) {
      const count = jp[j]?.count || 0;
      pool.push({ item: j, w: Math.max(1, 8 - Math.floor(count / 5)) });
    }
  } else if (stage === 2) {
    // CV syllables: unseen have high weight; basic vowel combos weighted more
    for (let ci = 0; ci < CHOSUNGS.length; ci++) {
      for (let ji = 0; ji < JUNGSUNGS.length; ji++) {
        const syl = buildSyllable(ci, ji, 0);
        const basicVowel = BASIC_JUNG_SET.has(ji);
        if (!seenSyl.has(syl)) {
          pool.push({ item: syl, w: basicVowel ? 12 : 8 });
        } else {
          pool.push({ item: syl, w: basicVowel ? 2 : 1 });
        }
      }
    }
    // Occasional jamo review
    for (const j of PHASE1_JAMOS) {
      pool.push({ item: j, w: 1 });
    }
  } else {
    // Stage 3: batchim syllables
    for (let i = 0; i < 15; i++) {
      const ci = Math.floor(Math.random() * CHOSUNGS.length);
      const ji = Math.floor(Math.random() * JUNGSUNGS.length);
      const ki = SIMPLE_JONG_IDX[Math.floor(Math.random() * SIMPLE_JONG_IDX.length)];
      pool.push({ item: buildSyllable(ci, ji, ki), w: 5 });
    }
    // CV syllable review
    for (let i = 0; i < 5; i++) {
      const ci = Math.floor(Math.random() * CHOSUNGS.length);
      const ji = Math.floor(Math.random() * JUNGSUNGS.length);
      pool.push({ item: buildSyllable(ci, ji, 0), w: 2 });
    }
    // Rare jamo review
    for (const j of PHASE1_JAMOS) {
      pool.push({ item: j, w: 0.5 });
    }
  }

  return _pickWeighted(pool);
}
