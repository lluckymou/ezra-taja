/* ================================================================
   I18N - Internationalization system
   - Loads all language files from lang/
   - get(key, vars?) resolves nested dot-paths with English fallback
   - Interpolation: {{varName}} replaced by vars.varName
   - To add a new language: add lang/XX.json + list it in LANG_CODES
================================================================ */

import { G } from './state.js';

const LANG_CODES = ['en', 'pt', 'ko'];

let _translations = {};
let _currentLangCode = 'en';

// Load all language files
export async function loadLanguages() {
  for (const code of LANG_CODES) {
    try {
      const response = await fetch(`assets/lang/${code}.json`, { cache: 'no-cache' });
      if (response.ok) {
        _translations[code] = await response.json();
      }
    } catch (err) {
      console.error(`Failed to load language ${code}:`, err);
    }
  }
}

// Set current language; returns false if not loaded
export function setLanguage(langCode) {
  if (_translations[langCode]) {
    _currentLangCode = langCode;
    G.lang = langCode;
    return true;
  }
  // Unknown lang: keep current but set G.lang so the game knows
  G.lang = langCode;
  return false;
}

// Resolve a dot-path in an object (e.g. 'world.tentPitched')
function _resolve(obj, keys) {
  let v = obj;
  for (const k of keys) {
    if (v && typeof v === 'object') v = v[k];
    else return undefined;
  }
  return (v !== undefined && v !== null && typeof v !== 'object') ? v : undefined;
}

// Get translation by dot-path key (e.g. 'hud.pending')
// Falls back to English, then to the raw key string
export function get(key, vars) {
  const keys = key.split('.');
  let value = _resolve(_translations[_currentLangCode], keys);
  if (value === undefined) value = _resolve(_translations['en'], keys);
  if (value === undefined) return key;

  // Interpolate {{varName}} placeholders
  if (vars) {
    value = String(value).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
  }

  return String(value);
}

// Get the translation for a Korean word text in the current language.
// Looks up lang/XX.json → "words" → text key.
// If emoji is provided, first checks "emoji_words" (text:emoji key) to disambiguate homophones.
// Falls back to English, then returns empty string.
export function wordTr(text, emoji) {
  const key = emoji ? `${text}:${emoji}` : null;
  if (key) {
    const cur = _translations[_currentLangCode]?.emoji_words?.[key];
    if (cur) return cur;
    const en = _translations['en']?.emoji_words?.[key];
    if (en) return en;
  }
  const cur = _translations[_currentLangCode]?.words?.[text];
  if (cur) return cur;
  const en = _translations['en']?.words?.[text];
  return en || '';
}

// Get language metadata for a specific code (or current)
export function getLangMeta(langCode = _currentLangCode) {
  return _translations[langCode]?.meta || {};
}

// Get all loaded languages as [{code, name, icon}]
export function getAvailableLanguages() {
  return Object.entries(_translations).map(([code, data]) => ({
    code,
    name: data.meta?.name || code,
    icon: data.meta?.icon || '',
  }));
}

// Get current language code
export function getCurrentLanguage() {
  return _currentLangCode;
}
