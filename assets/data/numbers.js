/* ================================================================
   NUMBERS — Korean number utilities for numeric monsters
   - sinoSpelling(n)         : 0-999,999,999 → Korean string
   - sinoRequiredWords(n)    : required word texts for that number
   - nativeSpelling(n)       : 1-99 → Korean native string
   - nativeRequiredWords(n)  : required word texts for native number
   - genSinoNumber(knownSet) : generate random valid sino number
   - genNativeNumber(knownSet): generate random valid native number
================================================================ */

const SINO_UNITS = ['','일','이','삼','사','오','육','칠','팔','구'];

// Native Korean tens (20-90 only; 10=열 is separate)
const NATIVE_TENS  = ['','','스물','서른','마흔','쉰','예순','일흔','여든','아흔'];
// Native Korean units 1-9 (standalone forms: 하나, 둘, etc.)
const NATIVE_UNITS = ['','하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉'];

// ── Internal helpers ─────────────────────────────────────────────

// Sino-Korean for a 4-digit chunk (1-9999), drop-일 rule applied
function sino4(n) {
  const c = Math.floor(n / 1000);
  const b = Math.floor((n % 1000) / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  let s = '';
  if (c === 1) s += '천'; else if (c > 1) s += SINO_UNITS[c] + '천';
  if (b === 1) s += '백'; else if (b > 1) s += SINO_UNITS[b] + '백';
  if (t === 1) s += '십'; else if (t > 1) s += SINO_UNITS[t] + '십';
  if (u > 0) s += SINO_UNITS[u];
  return s;
}

// Required word texts for a 4-digit chunk (1-9999), drop-일 rule
function req4(n) {
  const c = Math.floor(n / 1000);
  const b = Math.floor((n % 1000) / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const words = new Set();
  if (c > 0) { if (c > 1) words.add(SINO_UNITS[c]); words.add('천'); }
  if (b > 0) { if (b > 1) words.add(SINO_UNITS[b]); words.add('백'); }
  if (t > 0) { if (t > 1) words.add(SINO_UNITS[t]); words.add('십'); }
  if (u > 0) words.add(SINO_UNITS[u]);
  return words;
}

// ── Public API ───────────────────────────────────────────────────

// Sino-Korean spelling for 0-999,999,999
export function sinoSpelling(n) {
  if (n === 0) return '영';
  const eok  = Math.floor(n / 100000000);
  const manN = Math.floor((n % 100000000) / 10000);
  const last = n % 10000;
  let s = '';
  // Eok group (100M–900M): coefficient 1 drops (억 alone = 100M)
  if (eok  > 0) { if (eok  > 1) s += SINO_UNITS[eok];  s += '억'; }
  // Man group (10K–9999×10K): coefficient 1 drops (만 alone = 10K)
  if (manN > 0) { if (manN > 1) s += sino4(manN); s += '만'; }
  if (last > 0) s += sino4(last);
  return s;
}

// Required word texts for a sino number
export function sinoRequiredWords(n) {
  if (n === 0) return new Set(['영']);
  const eok  = Math.floor(n / 100000000);
  const manN = Math.floor((n % 100000000) / 10000);
  const last = n % 10000;
  const words = new Set();
  // eok=1 → just '억' (no 일); eok>1 → digit word + '억'
  if (eok  > 0) { if (eok  > 1) words.add(SINO_UNITS[eok]); words.add('억'); }
  // manN=1 → just '만' (no 일); manN>1 → req4(manN) + '만'
  if (manN > 0) { if (manN > 1) for (const w of req4(manN)) words.add(w); words.add('만'); }
  if (last > 0) for (const w of req4(last)) words.add(w);
  return words;
}

// Native Korean spelling for 1-99
export function nativeSpelling(n) {
  if (n < 1 || n > 99) return '';
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 0) return NATIVE_UNITS[u];
  if (t === 1) return u === 0 ? '열' : '열' + NATIVE_UNITS[u];
  return u === 0 ? NATIVE_TENS[t] : NATIVE_TENS[t] + NATIVE_UNITS[u];
}

// Required word texts for a native number (1-99)
export function nativeRequiredWords(n) {
  if (n < 1 || n > 99) return new Set();
  const t = Math.floor(n / 10);
  const u = n % 10;
  const words = new Set();
  if (t === 0) { words.add(NATIVE_UNITS[u]); return words; }
  if (t === 1) { words.add('열'); if (u > 0) words.add(NATIVE_UNITS[u]); return words; }
  words.add(NATIVE_TENS[t]);
  if (u > 0) words.add(NATIVE_UNITS[u]);
  return words;
}

// Generate a random valid sino number (1-999,999,999) where all required
// words are in knownSet. Returns null if none possible.
export function genSinoNumber(knownSet) {
  const has = w => knownSet.has(w);

  // Enumerate all valid 1-9999 numbers (fast, max 9999 iterations)
  const small = [];
  for (let n = 1; n <= 9999; n++) {
    if ([...req4(n)].every(has)) small.push(n);
  }
  if (!small.length) return null;

  // Build candidate pool with weighted probability toward smaller numbers
  const candidates = [];

  // 1-9999: always eligible
  for (const n of small) candidates.push(n);

  // 10000+ requires 만
  if (has('만')) {
    // man chunk can be 1 (just 만, drop 일) or any valid small
    const manChunks = [1, ...small];
    const shuffled = [...manChunks].sort(() => Math.random() - 0.5);
    for (const mc of shuffled.slice(0, 12)) {
      // Validate: mc=1 needs only '만'; mc>1 needs req4(mc) + '만'
      if (mc > 1 && ![...req4(mc)].every(has)) continue;
      const last4opts = [0, ...small.slice(0, 6)];
      for (const l4 of last4opts) {
        const n = mc * 10000 + l4;
        if (n >= 10000 && n <= 999999999) candidates.push(n);
      }
    }
  }

  // 100,000,000+ requires 억
  if (has('억')) {
    // eok coefficient 1-9 (1 drops 일)
    const eokDigits = [1, ...[2,3,4,5,6,7,8,9].filter(d => has(SINO_UNITS[d]))];
    const ec = eokDigits[Math.floor(Math.random() * eokDigits.length)];
    // Add simple eok numbers: N억, N억만, N억XXXX
    candidates.push(ec * 100000000);
    if (has('만') && small.length > 0) {
      const mc = small[Math.floor(Math.random() * small.length)];
      const n = ec * 100000000 + mc * 10000;
      if (n <= 999999999) candidates.push(n);
    }
  }

  // Validate all candidates (defensive check)
  const valid = candidates.filter(n =>
    n >= 1 && n <= 999999999 && [...sinoRequiredWords(n)].every(has)
  );
  if (!valid.length) return null;

  // Weighted random: prefer smaller numbers (1/log10 weighting)
  let totalW = 0;
  const weights = valid.map(n => {
    const w = 1 / (Math.log10(n + 1) + 0.5);
    totalW += w;
    return w;
  });
  let r = Math.random() * totalW;
  for (let i = 0; i < valid.length; i++) {
    r -= weights[i];
    if (r <= 0) return valid[i];
  }
  return valid[valid.length - 1];
}

// Generate a random valid native number (1-99) where all required
// words are in knownSet. Returns null if none possible.
export function genNativeNumber(knownSet) {
  const valid = [];
  for (let n = 1; n <= 99; n++) {
    if ([...nativeRequiredWords(n)].every(w => knownSet.has(w))) valid.push(n);
  }
  if (!valid.length) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}
