/* ================================================================
   SFX - Sound Effects System
   Web Audio API based, polyphonic (multiple simultaneous sounds).
   Volume stored in localStorage under 'krr_sfx_vol' (0–1, default 0.5).
   Each play() call gets a tiny random pitch shift (±4%) for variety.
================================================================ */

const STORAGE_KEY = 'krr_sfx_vol';

let _ctx = null;
let _masterGain = null;
let _vol = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '0.5');

// Decoded AudioBuffer cache
const _cache = {};

function _getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = _vol;
    _masterGain.connect(_ctx.destination);
  }
  return _ctx;
}

async function _load(path) {
  if (_cache[path]) return _cache[path];
  const ctx = _getCtx();
  const res = await fetch(path);
  const buf = await res.arrayBuffer();
  const decoded = await ctx.decodeAudioData(buf);
  _cache[path] = decoded;
  return decoded;
}

// Preload all sounds eagerly on first user interaction
const SOUNDS = {
  // Roguelite combat & navigation
  roomClear:       'assets/sounds/short_victory_chime.mp3',
  worldClear:      'assets/sounds/level_up_fanfare.mp3',
  arrowShoot:      'assets/sounds/arrow_shoot.mp3',
  playerDamage:    'assets/sounds/damage_player.mp3',
  damageBlocked:   'assets/sounds/damage_blocked.mp3',
  monsterDamage:   'assets/sounds/monster_damage.mp3',
  monsterDeath:    'assets/sounds/monster_death.mp3',
  freezeHit:       'assets/sounds/player_freezing.mp3',
  musicianNote:    'assets/sounds/musician_note_shoot.mp3',
  teleport:        'assets/sounds/teleport_whoosh.mp3',
  roomNavigate:    'assets/sounds/room_navigate_teleport.mp3',
  itemPickup:      'assets/sounds/item_pickup_pluck.mp3',
  itemUse:         'assets/sounds/item_use.mp3',
  // UI
  bookOpen:        'assets/sounds/book_page_flip.mp3',
  bookTabFlip:     'assets/sounds/book_page.mp3',
  mapOpen:         'assets/sounds/paper_rustle_fold_unfold.mp3',
  backpackOpen:    'assets/sounds/ctrl_menu_backpack_zip_open.mp3',
  invNavigate:     'assets/sounds/item_pickup_pluck.mp3',
  uiHover:         'assets/sounds/ui_hover_soft.mp3',
  uiClick:         'assets/sounds/ui_button_click.mp3',
  diceRoll:        'assets/sounds/dice_roll.mp3',
  // Teacher
  lessonDone:      'assets/sounds/soft_success_ding.mp3',
  testAnswer:      'assets/sounds/ui_button_click.mp3',
  testWin:         'assets/sounds/short_victory_chime.mp3',
  testGiveup:      'assets/sounds/minor_error.mp3',
  // Dojang
  doStrokeOk:      'assets/sounds/correct_short_tone.mp3',
  doMinorError:    'assets/sounds/minor_error.mp3',
  doMajorError:    'assets/sounds/major_error_buzz.mp3',
};

// Preload after first interaction so AudioContext can be created
let _preloaded = false;
export function preloadSFX() {
  if (_preloaded) return;
  _preloaded = true;
  _getCtx(); // create context
  for (const path of Object.values(SOUNDS)) {
    _load(path).catch(() => {}); // silent fail if file missing
  }
}

/**
 * Play a named sound.
 * @param {string} name  - key from SOUNDS
 * @param {number} [vol] - optional per-call volume multiplier (0–1)
 */
export function play(name, vol = 1) {
  if (_vol <= 0) return;
  const path = SOUNDS[name];
  if (!path) return;
  const ctx = _getCtx();
  if (ctx.state === 'suspended') ctx.resume();

  _load(path).then(buf => {
    const src  = ctx.createBufferSource();
    src.buffer = buf;
    // Tiny random pitch shift: ±4%
    src.playbackRate.value = 0.96 + Math.random() * 0.08;

    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(_masterGain);
    src.start();
  }).catch(() => {});
}

export function getVolume() { return _vol; }

export function setVolume(v) {
  _vol = Math.max(0, Math.min(1, v));
  if (_masterGain) _masterGain.gain.value = _vol;
  localStorage.setItem(STORAGE_KEY, String(_vol));
}
