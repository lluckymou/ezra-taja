/* ================================================================
   HANGUL INPUT — 2-beolsik (두벌식) Korean IME for QWERTY keyboards
================================================================ */

// Standard 2-beolsik QWERTY → Jamo mapping
export const QWERTY_TO_JAMO = {
  q:'ㅂ', w:'ㅈ', e:'ㄷ', r:'ㄱ', t:'ㅅ', y:'ㅛ', u:'ㅕ', i:'ㅑ', o:'ㅐ', p:'ㅔ',
  a:'ㅁ', s:'ㄴ', d:'ㅇ', f:'ㄹ', g:'ㅎ', h:'ㅗ', j:'ㅓ', k:'ㅏ', l:'ㅣ',
  z:'ㅋ', x:'ㅌ', c:'ㅊ', v:'ㅍ', b:'ㅠ', n:'ㅜ', m:'ㅡ',
  // Shift: tensed consonants + compound vowels ㅒ/ㅖ
  Q:'ㅃ', W:'ㅉ', E:'ㄸ', R:'ㄲ', T:'ㅆ', O:'ㅒ', P:'ㅖ',
};

// Initial consonants (초성) — 19 entries
const INITIAL = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
// Vowels (중성) — 21 entries
const VOWEL  = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
// Final consonants (종성) — 28 entries (index 0 = no final)
const FINAL  = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

const INITIAL_IDX = Object.fromEntries(INITIAL.map((j, i) => [j, i]));
const VOWEL_IDX   = Object.fromEntries(VOWEL.map((j, i) => [j, i]));
// Simple (non-compound) final: jamo → 1-based index in FINAL
const FINAL_IDX   = Object.fromEntries(FINAL.slice(1).map((j, i) => [j, i + 1]));

// Compound vowels: "v1+v2" → combined vowel jamo
const COMP_VOWEL = {
  'ㅗ+ㅏ':'ㅘ', 'ㅗ+ㅐ':'ㅙ', 'ㅗ+ㅣ':'ㅚ',
  'ㅜ+ㅓ':'ㅝ', 'ㅜ+ㅔ':'ㅞ', 'ㅜ+ㅣ':'ㅟ',
  'ㅡ+ㅣ':'ㅢ',
};

// Compound finals: "c1+c2" → index in FINAL
const COMP_FINAL_IDX = {
  'ㄱ+ㅅ':3,  'ㄴ+ㅈ':5,  'ㄴ+ㅎ':6,
  'ㄹ+ㄱ':9,  'ㄹ+ㅁ':10, 'ㄹ+ㅂ':11, 'ㄹ+ㅅ':12,
  'ㄹ+ㅌ':13, 'ㄹ+ㅍ':14, 'ㄹ+ㅎ':15, 'ㅂ+ㅅ':18,
};

export class HangulComposer {
  constructor() { this.reset(); }

  reset() {
    this._c1  = null; // initial consonant jamo
    this._v1  = null; // vowel jamo
    this._c2  = null; // tentative final consonant jamo
    this._c2b = null; // second jamo of a compound final
  }

  get isEmpty() {
    return this._c1 === null && this._v1 === null;
  }

  /** Current composing character (empty string if nothing in flight). */
  get composing() {
    return this.isEmpty ? '' : this._build();
  }

  _build(c1 = this._c1, v1 = this._v1, c2 = this._c2, c2b = this._c2b) {
    if (v1 === null) return c1 || '';
    if (c1 === null && c2 === null) return v1; // bare vowel → jamo directly (ㅠ, ㅘ, ㅢ …)
    const ci = c1 !== null ? (INITIAL_IDX[c1] ?? 11) : 11; // ㅇ when vowel has a final consonant
    const vi = VOWEL_IDX[v1] ?? 0;
    let fi = 0;
    if (c2 !== null) {
      fi = c2b !== null
        ? (COMP_FINAL_IDX[c2 + '+' + c2b] ?? 0)
        : (FINAL_IDX[c2] ?? 0);
    }
    return String.fromCharCode(0xAC00 + (ci * 21 + vi) * 28 + fi);
  }

  /**
   * Feed one jamo into the composer.
   * Returns any text that got committed (may be empty string).
   */
  input(jamo) {
    const isVowel = VOWEL_IDX[jamo] !== undefined;
    let out = '';

    if (isVowel) {
      if (this._v1 !== null && this._c2 === null) {
        // Have initial+vowel — try compound vowel
        const comp = COMP_VOWEL[this._v1 + '+' + jamo];
        if (comp) {
          this._v1 = comp;
        } else {
          // No compound: commit current syllable, start bare vowel
          out = this._build(); this.reset(); this._v1 = jamo;
        }
      } else if (this._v1 !== null && this._c2 !== null) {
        // Have initial+vowel+final — vowel steals the final as next initial
        if (this._c2b !== null) {
          // Compound final: c2 stays, c2b becomes next initial
          out = this._build(this._c1, this._v1, this._c2, null);
          const next = this._c2b; this.reset(); this._c1 = next; this._v1 = jamo;
        } else {
          // Single final: migrates to next syllable initial
          out = this._build(this._c1, this._v1, null, null);
          const next = this._c2; this.reset(); this._c1 = next; this._v1 = jamo;
        }
      } else if (this._c1 !== null) {
        // Have initial consonant only
        this._v1 = jamo;
      } else {
        // Empty — bare vowel (will render with ㅇ placeholder)
        this._v1 = jamo;
      }
    } else {
      // Consonant
      if (this._c2b !== null) {
        // Commit everything, start fresh
        out = this._build(); this.reset(); this._c1 = jamo;
      } else if (this._c2 !== null) {
        // Try compound final
        if (COMP_FINAL_IDX[this._c2 + '+' + jamo] !== undefined) {
          this._c2b = jamo;
        } else {
          out = this._build(); this.reset(); this._c1 = jamo;
        }
      } else if (this._v1 !== null) {
        // Try to set as final consonant
        if (FINAL_IDX[jamo] !== undefined) {
          this._c2 = jamo;
        } else {
          // Not a valid final (ㄸ/ㅃ/ㅉ) — commit current, new syllable
          out = this._build();
          this.reset();
          this._c1 = jamo;
        }
      } else if (this._c1 !== null) {
        // Consecutive consonants — commit first as bare jamo
        out = this._c1; this.reset(); this._c1 = jamo;
      } else {
        // Empty
        this._c1 = jamo;
      }
    }

    return out;
  }

  /** Commit whatever is currently composing and reset. */
  commitCurrent() {
    if (this.isEmpty) return '';
    const ch = this._build();
    this.reset();
    return ch;
  }

  /**
   * Handle backspace.
   * Returns true  → consumed one composing step (caller updates display).
   * Returns false → composition was empty (caller deletes previous committed char).
   */
  backspace() {
    if (this._c2b !== null) { this._c2b = null; return true; }
    if (this._c2  !== null) { this._c2  = null; return true; }
    if (this._v1  !== null) { this._v1  = null; return true; }
    if (this._c1  !== null) { this._c1  = null; return true; }
    return false;
  }
}
