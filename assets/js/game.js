/* ================================================================
   GAME - main RAF loop, title screen, input, mobile
================================================================ */
import { G, resetRunState, loadPersistentState, savePersistentState, incrementWordKillCount, incrementWordConjugationCount } from './state.js';
import {
  tickMonsters, tickProjs, tickParts, tickCoins,
  tickGroundItems, tickActiveEffect,
  checkBubbleCollisions,
  drawMonsters, drawProjs, drawParts, drawCoins,
  tickAnnounce, tickFreeze,
  addToInventory, invNavigate, invUse,
  tryCollectGroundItem,
  killAllEnemies, fire, hitMonster, primeNextSpawn, countJamoKeys,
  refreshLives, refreshInventoryUI, refreshBubbleDisplay,
  clearCombatTransientVisuals, releaseOpeningAttack,
  setWeaponGroup, WEAPONS, flashAnnounce,
  mkMonster, spawnGroundItem, startFleeEffects,
  upsertGroundItemRecord, applyGroundItemProgress, groundItemSnapshot,
  getGroundItemRecord, removeGroundItem,
  spawnMissParticles, collectCoins, explodeCoins,
  initRoomSpawner, setRoomClearedCallback, setCoinsCollectedCallback, rollConjugation,
  onMonsterRemoved,
  drawBossTether, drawBossBadge,
  HANJA_T1, HANJA_T2, HANJA_T3, HANJA_T4, HANJA_TO_HANGUL,
} from './combat.js';
import {
  drawBackground, drawTrees, drawPuddles, drawEnvironmentObject, drawDoors, drawNavPrompt, drawMenuBackground,
  drawTransition, drawWorldTransition, drawRoomLabel, drawRoomNpc,
  tickWeather, drawWeather, drawDayNight,
  initRenderer, initWeather, startWeatherFade, getDayBrightness,
  setRoomDesignFloorPat, setRoomDesignWallStyle, clearRoomTrees, generateRoomTrees,
  getTreeDepths, getEnvironmentDepths,
} from './renderer.js';
import { initMap, updateMap, updateMapExtras, syncClockToGame, getWeatherLabel } from './map.js';
import {
  setShopRenderer, setModifierRenderer, setTreasureRenderer, setCasinoRenderer, setTeacherRenderer,
  setCombatRef,
  getAvailableDirs, DIR_NAMES,
  currentCell, getCell, enterRoom, navigate,
  startRun, startNewWorld, collectTreasure, pickModifierItem, shopBuy,
  tryNpcInteract, openAllConnections,
  peekNextWorldDef,
  WORLDS, ALL_WEATHERS, COLS, ROWS,
  serializeDungeon, reconstructDungeon, generateDungeon, generateWorldSequence,
  onMpTemplatesReceived,
} from './world.js';
import {
  renderShopScreen, renderModifierScreen, renderTreasureScreen, renderCasinoScreen, renderTeacherScreen,
  updatePermanentBar as hudUpdatePermanentBar,
  parseLessonMarkdown,
  jamoFontPreview,
} from './hud.js';
import { loadLanguages, setLanguage, getAvailableLanguages, getLangMeta, get as i18n, wordTr } from './i18n.js';
import { HangulComposer, QWERTY_TO_JAMO } from './hangul-input.js';
import { WORD_DICT } from '../data/words.js';
import { POWERUP_DEFS, POWERUP_KEYS, PERMANENTS, formatKoreanNumber } from '../data/items.js';
import { LESSONS_BASE, getNextLesson } from '../data/lessons.js';
import { dojangManager, loadDojangStats } from './dojang.js';
import {
  MP, mpSend, startHost, startGuest, leaveMultiplayer, genRoomCode,
  getHostPersistentSnapshot, applyHostPersistentState, storeMpTemplates,
} from './multiplayer.js';
import { computeHangulStage, PHASE1_JAMOS, DOJANG_BOOK_ORDER, MAX_JAMO_COUNT, JAMO_INFO, JAMO_STROKES, JAMO_HAS_BATCHIM, BATCHIM_UNLOCK_COUNT } from '../data/dojang-data.js';
import { play as sfx, preloadSFX, getVolume, setVolume, getMusicVolume, setMusicVolume, playMusic, stopMusic } from './sfx.js';

// ── App version (read from sw.js — single source of truth) ──────────────────
let APP_VERSION = '';
const _KR_NUMS = ['공','일','이','삼','사','오','육','칠','팔','구'];
function _versionBadgeHTML(v) {
  const ch = (n, h, cls) =>
    `<span class="vb-char${cls ? ' '+cls : ''}"><span class="vb-n">${n}</span><span class="vb-h">${h}</span></span>`;
  let html = ch('버전', 'Version', 'vb-label');
  for (const c of v) {
    if (/\d/.test(c)) html += ch(_KR_NUMS[+c], c);
    else if (c === '.') html += ch('점', '·');
    else if (c === '-') html += ch('ㅡ', '-');
  }
  return html;
}
fetch('sw.js').then(r => r.text()).then(t => {
  const m = t.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/);
  APP_VERSION = m ? m[1] : '';
  const badge = document.getElementById('version-badge');
  if (badge) badge.innerHTML = _versionBadgeHTML(APP_VERSION);
  document.querySelectorAll('.version-inline').forEach(el => el.textContent = 'v' + APP_VERSION);
}).catch(() => {});

// The HUD has a responsive base zoom in CSS. This preference is deliberately a
// multiplier, so a player's chosen size never replaces that responsive layout.
const HUD_UI_SIZE_STORAGE_KEY = 'krr_hud_ui_size';
const HUD_UI_SIZE_DEFAULT = 1;
const HUD_UI_SIZE_MIN = 0.75;
const HUD_UI_SIZE_MAX = 1.3;
let _hudUiSize = HUD_UI_SIZE_DEFAULT;

function _normaliseHudUiSize(value, fallback = HUD_UI_SIZE_DEFAULT) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < HUD_UI_SIZE_MIN || parsed > HUD_UI_SIZE_MAX) return fallback;
  return Math.round(parsed * 20) / 20;
}

function _formatHudUiSize(value) {
  const rounded = Math.round(value * 100) / 100;
  return `${Number(rounded.toFixed(2))}×`;
}

function _applyHudUiSize() {
  const hud = document.getElementById('hud');
  if (hud) {
    const baseZoom = Number.parseFloat(getComputedStyle(hud).getPropertyValue('--hud-base-zoom')) || 1.25;
    hud.style.zoom = String(Math.round(baseZoom * _hudUiSize * 1000) / 1000);
  }

  const slider = document.getElementById('pause-ui-size');
  if (slider) slider.value = String(Math.round(_hudUiSize * 100));
  const value = document.getElementById('pause-ui-size-value');
  if (value) value.textContent = _formatHudUiSize(_hudUiSize);
}

function _setHudUiSize(value, persist = false) {
  _hudUiSize = _normaliseHudUiSize(value, _hudUiSize);
  if (persist) localStorage.setItem(HUD_UI_SIZE_STORAGE_KEY, String(_hudUiSize));
  _applyHudUiSize();
}

function _restoreHudUiSize() {
  _hudUiSize = _normaliseHudUiSize(localStorage.getItem(HUD_UI_SIZE_STORAGE_KEY));
  _applyHudUiSize();
}

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
   AVATAAARS CREATOR
================================================================ */
const AVA_DEFAULTS = {
  top: 'shortWaved', hairColor: 'auburn', hatColor: 'blue02',
  accessories: 'none', accessoriesColor: 'black',
  facialHair: 'none', facialHairColor: 'auburn',
  clothing: 'hoodie', clothingColor: 'black', clothingGraphic: 'pizza',
  eyes: 'default', eyebrows: 'defaultNatural', mouth: 'default',
  skin: 'tanned',
};

const AVA_CATS = [
  { key: 'top', label: 'Hair', values: [
    'shortWaved','shortCurly','shortFlat','shortRound','sides',
    'theCaesar','theCaesarAndSidePart','dreads01','dreads02','frizzle',
    'shaggy','shaggyMullet','bigHair','bob','bun','curly','curvy',
    'dreads','frida','fro','froAndBand','longButNotTooLong','miaWallace',
    'shavedSides','straight01','straight02','straightAndStrand',
    'eyepatch','turban','hijab','hat',
    'winterHat01','winterHat02','winterHat03','winterHat04',
  ]},
  { key: 'hairColor', label: 'Hair Color', values: [
    'auburn','black','blonde','blondeGolden','brown','brownDark',
    'pastelPink','platinum','red','silverGray',
  ]},
  { key: 'skin', label: 'Skin', values: [
    'tanned','yellow','pale','light','brown','darkBrown','black',
  ]},
  { key: 'eyes', label: 'Eyes', values: [
    'default','happy','wink','winkWacky','squint','closed',
    'cry','eyeRoll','hearts','side','surprised','xDizzy',
  ]},
  { key: 'eyebrows', label: 'Eyebrows', values: [
    'defaultNatural','angryNatural','flatNatural','frownNatural',
    'raisedExcitedNatural','sadConcernedNatural','unibrowNatural','upDownNatural',
    'raisedExcited','angry','default','sadConcerned','upDown',
  ]},
  { key: 'mouth', label: 'Mouth', values: [
    'default','smile','twinkle','tongue','concerned','disbelief',
    'eating','grimace','sad','screamOpen','serious','vomit',
  ]},
  { key: 'clothing', label: 'Clothing', values: [
    'hoodie','blazerAndShirt','blazerAndSweater','collarAndSweater',
    'graphicShirt','overall','shirtCrewNeck','shirtScoopNeck','shirtVNeck',
  ]},
  { key: 'clothingColor', label: 'Clothing Color', values: [
    'black','blue01','blue02','blue03','gray01','gray02','heather',
    'pastelBlue','pastelGreen','pastelOrange','pastelRed','pastelYellow',
    'pink','red','white',
  ]},
  { key: 'clothingGraphic', label: 'Shirt Graphic', values: [
    'skrullOutline','pizza','hola','diamond','deer','bear','bat','korea',
  ]},
  { key: 'accessories', label: 'Accessories', values: [
    'none','kurt','prescription01','prescription02','round','sunglasses','wayfarers',
  ]},
  { key: 'facialHair', label: 'Facial Hair', values: [
    'none','beardLight','beardMagestic','beardMedium','moustaceFancy','moustacheMagnum',
  ]},
  { key: 'facialHairColor', label: 'Facial Hair Color', values: [
    'auburn','black','blonde','blondeGolden','brown','brownDark',
    'pastelPink','platinum','red','silverGray',
  ]},
  { key: 'hatColor', label: 'Hat Color', values: [
    'blue02','black','blue01','blue03','gray01','gray02','heather',
    'pastelBlue','pastelGreen','pastelOrange','pastelRed','pastelYellow',
    'pink','red','white',
  ]},
];

const AVA_VAL_LABELS = {
  shortWaved:'Short Waved', shortCurly:'Short Curly', shortFlat:'Short Flat',
  shortRound:'Short Round', sides:'Sides', theCaesar:'The Caesar',
  theCaesarAndSidePart:'Caesar Side Part', dreads01:'Dreads Short 1',
  dreads02:'Dreads Short 2', frizzle:'Frizzle', shaggy:'Shaggy',
  shaggyMullet:'Shaggy Mullet', bigHair:'Big Hair', bob:'Bob', bun:'Bun',
  curly:'Curly', curvy:'Curvy', dreads:'Dreads Long', frida:'Frida',
  fro:'Afro', froAndBand:'Afro & Band', longButNotTooLong:'Long',
  miaWallace:'Mia Wallace', shavedSides:'Shaved Sides',
  straight01:'Straight 1', straight02:'Straight 2',
  straightAndStrand:'Straight & Strand', eyepatch:'Eyepatch',
  turban:'Turban', hijab:'Hijab', hat:'Hat',
  winterHat01:'Winter Hat 1', winterHat02:'Winter Hat 2',
  winterHat03:'Winter Hat 3', winterHat04:'Winter Hat 4',
  auburn:'Auburn', black:'Black', blonde:'Blonde', blondeGolden:'Golden Blonde',
  brown:'Brown', brownDark:'Dark Brown', pastelPink:'Pastel Pink',
  platinum:'Platinum', red:'Red', silverGray:'Silver Gray',
  tanned:'Tanned', yellow:'Yellow', pale:'Pale', light:'Light',
  darkBrown:'Dark Brown',
  default:'Default', happy:'Happy', wink:'Wink', winkWacky:'Wacky Wink',
  squint:'Squint', closed:'Closed', cry:'Crying', eyeRoll:'Eye Roll',
  hearts:'Hearts', side:'Side', surprised:'Surprised', xDizzy:'Dizzy',
  defaultNatural:'Default Natural', angryNatural:'Angry Natural',
  flatNatural:'Flat Natural', frownNatural:'Frown Natural',
  raisedExcitedNatural:'Raised Natural', sadConcernedNatural:'Sad Natural',
  unibrowNatural:'Unibrow', upDownNatural:'Up/Down Natural',
  raisedExcited:'Raised', angry:'Angry', sadConcerned:'Sad', upDown:'Up/Down',
  smile:'Smile', twinkle:'Twinkle', tongue:'Tongue', concerned:'Concerned',
  disbelief:'Disbelief', eating:'Eating', grimace:'Grimace', sad:'Sad',
  screamOpen:'Scream', serious:'Serious', vomit:'Vomit',
  hoodie:'Hoodie', blazerAndShirt:'Blazer & Shirt',
  blazerAndSweater:'Blazer & Sweater', collarAndSweater:'Collar & Sweater',
  graphicShirt:'Graphic Shirt', overall:'Overall',
  shirtCrewNeck:'Crew Neck', shirtScoopNeck:'Scoop Neck', shirtVNeck:'V-Neck',
  blue01:'Blue 1', blue02:'Blue 2', blue03:'Blue 3',
  gray01:'Gray 1', gray02:'Gray 2', heather:'Heather',
  pastelBlue:'Pastel Blue', pastelGreen:'Pastel Green',
  pastelOrange:'Pastel Orange', pastelRed:'Pastel Red',
  pastelYellow:'Pastel Yellow', pink:'Pink', white:'White',
  skrullOutline:'Skull Outline', pizza:'Pizza', hola:'Hola!',
  diamond:'Diamond', deer:'Deer', bear:'Bear', bat:'Bat', korea:'Korea',
  none:'None', kurt:'Kurt', prescription01:'Prescription 1',
  prescription02:'Prescription 2', round:'Round',
  sunglasses:'Sunglasses', wayfarers:'Wayfarers',
  beardLight:'Light Beard', beardMagestic:'Majestic Beard',
  beardMedium:'Medium Beard', moustaceFancy:'Fancy Moustache',
  moustacheMagnum:'Magnum Moustache',
};

// Module-level avatar creator state
let _avaActiveTab = null;
let _avaOpts   = { ...AVA_DEFAULTS };

// Hat-type tops (use hatColor, not hairColor)
const _HAT_TOPS = new Set(['hat','winterHat01','winterHat02','winterHat03','winterHat04','hijab','turban']);

// Tab definitions: each maps to 1 or 2 AVA_CATS keys
const _AVA_TABS = [
  { id:'top',    row1:'top',         row2: o => _HAT_TOPS.has(o.top) ? 'hatColor' : 'hairColor',
                                     row3: o => o.top === 'froAndBand' ? 'hatColor' : null },
  { id:'beard',  row1:'facialHair',  row2: o => o.facialHair !== 'none' ? 'facialHairColor' : null },
  { id:'acc',    row1:'accessories', row2: null },
  { id:'cloth',  row1:'clothing',    row2: 'clothingColor',
                                     row3: o => o.clothing === 'graphicShirt' ? 'clothingGraphic' : null },
  { id:'skin',   row1:'skin',        row2: null },
  { id:'face',   row1:'mouth',       row2: null },
  { id:'eyes',   row1:'eyes',        row2: 'eyebrows' },
  { id:'weapon', row1: 'weapon',      row2: null },
];

function _makeAvatarSvg(opts) {
  if (typeof Avataaars === 'undefined') return null;
  return Avataaars.create({ style: 'transparent', ...(opts || AVA_DEFAULTS) });
}

/** Set the player avatar SVG (or emoji fallback) into a DOM element */
function setPlayerContent(el) {
  if (!el) return;
  const svg = _makeAvatarSvg(G.avatar);
  if (svg) { el.innerHTML = svg; }
  else { el.innerHTML = ''; el.textContent = G.hero; }
}

function _saveAvatarOpts() {
  localStorage.setItem('krr_avatar', JSON.stringify(_avaOpts));
  G.avatar = { ..._avaOpts };
}

function _refreshAvaPreview() {
  const preview = document.getElementById('ava-preview');
  if (preview) preview.innerHTML = _makeAvatarSvg(_avaOpts) || '';
  setPlayerContent(document.getElementById('pl-emoji'));
}

function _getAvaCatValues(catKey) {
  const cat = AVA_CATS.find(c => c.key === catKey);
  return cat ? cat.values : [];
}

function _getAvaTabRow2Key() {
  const tab = _AVA_TABS.find(t => t.id === _avaActiveTab);
  if (!tab || !tab.row2) return null;
  return typeof tab.row2 === 'function' ? tab.row2(_avaOpts) : tab.row2;
}

function _getAvaTabRow3Key() {
  const tab = _AVA_TABS.find(t => t.id === _avaActiveTab);
  if (!tab || !tab.row3) return null;
  return typeof tab.row3 === 'function' ? tab.row3(_avaOpts) : tab.row3;
}

function _avaLabel(val) {
  const key = 'ava.' + val;
  const tr = i18n(key);
  return tr !== key ? tr : (AVA_VAL_LABELS[val] || val);
}

function _refreshAvaEditBar() {
  const tab = _AVA_TABS.find(t => t.id === _avaActiveTab);
  if (!tab) return;
  const row1El = document.getElementById('ava-edit-row1');
  const row2El = document.getElementById('ava-edit-row2');
  const row3El = document.getElementById('ava-edit-row3');
  const lbl1   = document.getElementById('ava-edit-label1');
  const lbl2   = document.getElementById('ava-edit-label2');
  const lbl3   = document.getElementById('ava-edit-label3');
  const bar    = document.getElementById('ava-edit-bar');
  if (tab.row1 === 'weapon') {
    if (row2El) row2El.classList.add('hidden');
    if (row3El) row3El.classList.add('hidden');
    if (row1El) row1El.classList.remove('hidden');
    const wgId = localStorage.getItem('krr_wg') || 'weapons';
    const def = WEAPONS[wgId];
    const emojis = def ? def.e.slice(0, 3).join('') : '';
    const name = i18n('options.wg_' + wgId) || def?.label || wgId;
    if (lbl1) lbl1.textContent = emojis + ' ' + name;
    return;
  }
  if (row1El) row1El.classList.remove('hidden');
  const val1 = _avaOpts[tab.row1] || _getAvaCatValues(tab.row1)[0];
  if (lbl1) lbl1.textContent = _avaLabel(val1);
  const row2Key = _getAvaTabRow2Key();
  if (row2Key) {
    if (row2El) row2El.classList.remove('hidden');
    const val2 = _avaOpts[row2Key] || _getAvaCatValues(row2Key)[0];
    if (lbl2) lbl2.textContent = _avaLabel(val2);
  } else {
    if (row2El) row2El.classList.add('hidden');
  }
  const row3Key = _getAvaTabRow3Key();
  if (row3Key) {
    if (row3El) row3El.classList.remove('hidden');
    const val3 = _avaOpts[row3Key] || _getAvaCatValues(row3Key)[0];
    if (lbl3) lbl3.textContent = _avaLabel(val3);
  } else {
    if (row3El) row3El.classList.add('hidden');
  }
}

function _avaOpenTab(tabId) {
  _avaActiveTab = tabId;
  document.querySelectorAll('.ava-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.avaTab === tabId);
  });
  const bar = document.getElementById('ava-edit-bar');
  if (bar) bar.classList.add('open');
  document.getElementById('menu-main')?.classList.add('edit-open');
  _refreshAvaEditBar();
}

function _avaCloseTab() {
  _avaActiveTab = null;
  document.querySelectorAll('.ava-tab').forEach(btn => btn.classList.remove('active'));
  const bar = document.getElementById('ava-edit-bar');
  if (bar) { bar.classList.remove('open'); bar.classList.remove('weapon-mode'); }
  document.getElementById('menu-main')?.classList.remove('edit-open');
}

function _avaToggleEditMode() {
  const tabs = document.querySelectorAll('.ava-tabs');
  const isVisible = tabs.length > 0 && tabs[0].style.visibility === 'visible';
  if (isVisible) {
    _avaCloseEditMode();
    _avaCloseTab();
  } else {
    _avaOpenEditMode();
  }
}

function _avaOpenEditMode() {
  document.querySelectorAll('.ava-tabs').forEach(tab => {
    tab.style.visibility = 'visible';
    tab.style.opacity = '1';
  });
}

function _avaCloseEditMode() {
  document.querySelectorAll('.ava-tabs').forEach(tab => {
    tab.style.opacity = '0';
    setTimeout(() => tab.style.visibility = 'hidden', 300);
  });
}

function _avaStepEditRow(delta, rowN) {
  const tab = _AVA_TABS.find(t => t.id === _avaActiveTab);
  if (!tab) return;
  const catKey = rowN === 1 ? tab.row1 : rowN === 2 ? _getAvaTabRow2Key() : _getAvaTabRow3Key();
  if (!catKey) return;
  if (catKey === 'weapon') {
    const wgKeys = Object.keys(WEAPONS);
    const cur = localStorage.getItem('krr_wg') || 'weapons';
    const next = wgKeys[(wgKeys.indexOf(cur) + delta + wgKeys.length) % wgKeys.length];
    setWeaponGroup(next);
    localStorage.setItem('krr_wg', next);
    _refreshAvaEditBar();
    return;
  }
  const values = _getAvaCatValues(catKey);
  const cur = _avaOpts[catKey] || values[0];
  const idx = values.indexOf(cur);
  const next = values[(idx + delta + values.length) % values.length];
  _avaOpts[catKey] = next;
  _refreshAvaEditBar();
  _refreshAvaPreview();
  _saveAvatarOpts();
}

const _TAB_TOOLTIP_KEYS = {
  top: 'ava.tab_top', beard: 'ava.tab_beard', acc: 'ava.tab_acc',
  cloth: 'ava.tab_cloth', skin: 'ava.tab_skin', face: 'ava.tab_face',
  eyes: 'ava.tab_eyes', weapon: 'ava.tab_weapon',
};
function _updateAvaTabTooltips() {
  document.querySelectorAll('.ava-tab[data-ava-tab]').forEach(btn => {
    const key = _TAB_TOOLTIP_KEYS[btn.dataset.avaTab];
    if (key) btn.setAttribute('data-tooltip', i18n(key));
  });
}

// Hairs read as feminine → only valid on a character with no facial hair
const _FEMALE_HAIRS = new Set([
  'straight01','straight02','straightAndStrand','hijab',
  'winterHat03','winterHat04','shortRound','dreads02',
  'shaggy','shaggyMullet','bigHair','bob','bun','curly','curvy',
  'frida','froAndBand','longButNotTooLong','miaWallace','shavedSides',
]);
// Hairs that are so feminine a male character simply cannot have them
const _MALE_FORBIDDEN_HAIRS = new Set(['frida']);
// Ethnic/cultural tops that are rare in random generation (1 ticket vs 3 for regular)
const _RARE_TOPS = new Set(['turban', 'hijab']);
// Hairs that clash with facial hair (too feminine to combine)
const _BEARD_FORBIDDEN_HAIRS = new Set([
  'bob','curvy','longButNotTooLong','miaWallace','straight01','hijab',
]);

function _avaRandomize() {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const catVals = key => AVA_CATS.find(c => c.key === key).values;

  // 1. Male/female split (50/50)
  const isMale = Math.random() < 0.5;

  // 2. Facial hair - moustaches 2× rarer than beards within the facial-hair pool
  // moustaceFancy also forbidden on feminine hairs (resolved after hair is picked below)
  let facialHair;
  if (isMale) {
    if (Math.random() < 0.5) {
      // moustaches are very rare (~6% of facial-hair rolls); beards fill the rest
      if (Math.random() < 0.06) {
        facialHair = Math.random() < 0.5 ? 'moustaceFancy' : 'moustacheMagnum';
      } else {
        facialHair = pick(['beardLight','beardLight','beardMagestic','beardMagestic','beardMedium','beardMedium']);
      }
    } else {
      facialHair = 'none';
    }
  } else {
    facialHair = 'none';
  }

  // 3. Hair
  const allTops = catVals('top');
  let hairPool;
  if (facialHair !== 'none') {
    hairPool = allTops.filter(h => !_BEARD_FORBIDDEN_HAIRS.has(h) && !_MALE_FORBIDDEN_HAIRS.has(h));
  } else if (!isMale) {
    hairPool = allTops.filter(h => _FEMALE_HAIRS.has(h));
  } else {
    hairPool = allTops.filter(h => !_MALE_FORBIDDEN_HAIRS.has(h));
  }
  const top = pick(hairPool.flatMap(h => _RARE_TOPS.has(h) ? [h] : [h, h, h]));

  // moustaceFancy forbidden on feminine hairs - reroll to none if needed
  if (facialHair === 'moustaceFancy' && _FEMALE_HAIRS.has(top)) facialHair = 'none';

  // 4. Can character be read as a woman?
  const canBeWoman = _FEMALE_HAIRS.has(top) && facialHair === 'none';

  // 5. Skin - 25% light, 25% brown, 50% spread across 5 rarer tones
  let skin;
  const sr = Math.random();
  if      (sr < 0.28) skin = 'light';
  else if (sr < 0.53) skin = 'brown';
  else if (sr < 0.68) skin = 'pale';
  else if (sr < 0.83) skin = 'yellow';
  else if (sr < 0.91) skin = 'tanned';
  else if (sr < 0.96) skin = 'darkBrown';
  else                skin = 'black';

  // 6. Hair color - 33% black, rest equal; pink only for feminine combos and 2× rarer
  //    dreads (short 1, short 2, long) cannot be pink
  const DREADS_TOPS = new Set(['dreads01','dreads02','dreads']);
  let hairColor;
  if (Math.random() < 0.33) {
    hairColor = 'black';
  } else {
    const hcPool = [
      'auburn','auburn',
      'blonde','blonde',
      'blondeGolden','blondeGolden',
      'brown','brown',
      'brownDark','brownDark',
      'platinum','platinum',
      'red','red',
      'silverGray','silverGray',
    ];
    if (canBeWoman && !DREADS_TOPS.has(top)) hcPool.push('pastelPink'); // weight 1 vs 2 for others
    hairColor = pick(hcPool);
  }

  // dark skin tones → black hair only
  if (skin === 'darkBrown' || skin === 'black') hairColor = 'black';

  // 7. Eyes - xDizzy rare (weight 2); hearts rare and 2× rarer on males (weight 2 female / 1 male)
  //    base weight = 6 for normal eyes
  const eyesWeighted = [];
  for (const e of catVals('eyes')) {
    let w;
    if (e === 'xDizzy')  w = 2;
    else if (e === 'hearts') w = isMale ? 1 : 2;
    else w = 6;
    for (let i = 0; i < w; i++) eyesWeighted.push(e);
  }
  const eyes = pick(eyesWeighted);

  // 8. Eyebrows - hearts eyes: only natural/default eyebrows; no unibrow for feminine combos
  const HEARTS_EYEBROWS = new Set(['defaultNatural','frownNatural','raisedExcitedNatural','default']);
  let eyebrowsPool;
  if (eyes === 'hearts') {
    eyebrowsPool = catVals('eyebrows').filter(e => HEARTS_EYEBROWS.has(e));
  } else {
    eyebrowsPool = canBeWoman
      ? catVals('eyebrows').filter(e => e !== 'unibrowNatural')
      : catVals('eyebrows');
  }
  const eyebrows = pick(eyebrowsPool);

  // 9. Mouth - vomit never generated; negative mouths (concerned/scream/sad) 6× rarer
  //    hearts eyes: forbidden mouths grimace/sad/screamOpen/serious/concerned/disbelief
  const RARE_MOUTHS = new Set(['concerned','screamOpen','sad']);
  const HEARTS_FORBIDDEN_MOUTHS = new Set(['grimace','sad','screamOpen','serious','concerned','disbelief']);
  const mouthWeighted = [];
  for (const m of catVals('mouth').filter(m => m !== 'vomit')) {
    if (eyes === 'hearts' && HEARTS_FORBIDDEN_MOUTHS.has(m)) continue;
    const w = RARE_MOUTHS.has(m) ? 1 : 6;
    for (let i = 0; i < w; i++) mouthWeighted.push(m);
  }
  const mouth = pick(mouthWeighted);

  // 10. Clothing - overall only for feminine combos (and not hijab)
  const clothingPool = (canBeWoman && top !== 'hijab')
    ? catVals('clothing')
    : catVals('clothing').filter(c => c !== 'overall');
  const clothing = pick(clothingPool);

  // 11. Accessories - eyepatch forces none; kurt only for feminine combos; 40% chance of none
  //     sunglasses and wayfarers 2× rarer; forbidden with hearts eyes
  const RARE_ACCESSORIES = new Set(['sunglasses','wayfarers']);
  let accessories;
  if (top === 'eyepatch') {
    accessories = 'none';
  } else if (Math.random() < 0.4) {
    accessories = 'none';
  } else {
    const base = catVals('accessories').filter(a => {
      if (a === 'none') return false;
      if (!canBeWoman && a === 'kurt') return false;
      if (eyes === 'hearts' && RARE_ACCESSORIES.has(a)) return false;
      return true;
    });
    const accWeighted = [];
    for (const a of base) {
      const w = RARE_ACCESSORIES.has(a) ? 1 : 2;
      for (let i = 0; i < w; i++) accWeighted.push(a);
    }
    accessories = pick(accWeighted);
  }

  _avaOpts = {
    top,
    hairColor,
    skin,
    eyes,
    eyebrows,
    mouth,
    clothing,
    clothingColor:   pick(catVals('clothingColor')),
    clothingGraphic: clothing === 'graphicShirt'
      ? (Math.random() < 0.5 ? 'korea' : pick(catVals('clothingGraphic').filter(g => g !== 'korea')))
      : pick(catVals('clothingGraphic')),
    accessories,
    accessoriesColor: 'black',
    facialHair,
    facialHairColor: hairColor,
    hatColor:        pick(catVals('hatColor')),
  };

  _refreshAvaEditBar();
  _refreshAvaPreview();
  _saveAvatarOpts();

  if (WEAPONS) {
    const wgKeys = Object.keys(WEAPONS);
    const wg = wgKeys[Math.floor(Math.random() * wgKeys.length)];
    setWeaponGroup(wg);
    localStorage.setItem('krr_wg', wg);
    if (_avaActiveTab === 'weapon') _refreshAvaEditBar();
  }
}

/* ================================================================
   DOM REFS
================================================================ */
const canvas   = document.getElementById('gc');
const wxCanvas = document.getElementById('wx-canvas');
const dnCanvas = document.getElementById('dn-canvas');
const typingEl = document.getElementById('typing');
const paEl     = document.getElementById('player-area');
const mapEl    = document.getElementById('minimap-grid');
const hudEl    = document.getElementById('hud');

// Touch mode uses the custom on-screen keyboard exclusively. Native mobile
// keyboards must never be summoned by a text field receiving focus.
function _isNativeKeyboardField(el) {
  if (!el || typeof el.matches !== 'function') return false;
  if (el.matches('textarea')) return true;
  if (el.matches('[contenteditable]')) {
    return el.getAttribute('contenteditable') !== 'false' || !!el.dataset.touchOriginalReadonly;
  }
  if (!el.matches('input')) return false;
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(el.type);
}

function _setTouchInputLock(locked) {
  document.querySelectorAll('input, textarea, [contenteditable]').forEach(el => {
    if (!_isNativeKeyboardField(el)) return;

    if (locked) {
      if (!el.dataset.touchOriginalReadonly) {
        el.dataset.touchOriginalReadonly = el.hasAttribute('readonly') ? '1' : '0';
        el.dataset.touchOriginalInputmode = el.getAttribute('inputmode') ?? '';
        el.dataset.touchOriginalTabindex = el.getAttribute('tabindex') ?? '';
        el.dataset.touchOriginalHasTabindex = el.hasAttribute('tabindex') ? '1' : '0';
        el.dataset.touchOriginalContenteditable = el.getAttribute('contenteditable') ?? '';
        el.dataset.touchOriginalHasContenteditable = el.hasAttribute('contenteditable') ? '1' : '0';
      }
      el.setAttribute('readonly', 'readonly');
      el.setAttribute('inputmode', 'none');
      el.setAttribute('tabindex', '-1');
      if (el.matches('[contenteditable]')) el.setAttribute('contenteditable', 'false');
      el.blur();
      return;
    }

    if (el.dataset.touchOriginalReadonly === '1') el.setAttribute('readonly', 'readonly');
    else el.removeAttribute('readonly');
    if (el.dataset.touchOriginalInputmode) el.setAttribute('inputmode', el.dataset.touchOriginalInputmode);
    else el.removeAttribute('inputmode');
    if (el.dataset.touchOriginalHasTabindex === '1') el.setAttribute('tabindex', el.dataset.touchOriginalTabindex);
    else el.removeAttribute('tabindex');
    if (el.dataset.touchOriginalHasContenteditable === '1') el.setAttribute('contenteditable', el.dataset.touchOriginalContenteditable);
    else el.removeAttribute('contenteditable');
    delete el.dataset.touchOriginalReadonly;
    delete el.dataset.touchOriginalInputmode;
    delete el.dataset.touchOriginalTabindex;
    delete el.dataset.touchOriginalHasTabindex;
    delete el.dataset.touchOriginalContenteditable;
    delete el.dataset.touchOriginalHasContenteditable;
  });
}

function _focusTypingInput() {
  if (!typingEl || G.touchMode) {
    typingEl?.blur();
    return;
  }
  typingEl.focus();
}

// Prevent both user-initiated and programmatic focus from opening a native
// keyboard. Tapping the central field still means “space” in touch mode.
document.addEventListener('pointerdown', e => {
  if (!G.touchMode || !_isNativeKeyboardField(e.target)) return;
  e.preventDefault();
  e.target.blur?.();
  if (e.target === typingEl) _touchSpace();
}, true);

document.addEventListener('focusin', e => {
  if (G.touchMode && _isNativeKeyboardField(e.target)) e.target.blur?.();
}, true);

// Fullscreen prompt cycle helpers — assigned inside loadLanguages().then()
let _fsPromptTimer      = null;
let _startFsPromptCycle = () => {};
let _stopFsPromptCycle  = () => {};



/* ================================================================
   STARTUP MODALS  (donate + TTS warning)
================================================================ */
function _checkTTSCompat(cb) {
  if (typeof speechSynthesis === 'undefined') { cb(true); return; }
  let _done = false;
  function check() {
    if (_done) return;
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      _done = true;
      cb(!voices.some(v => v.lang && v.lang.toLowerCase().startsWith('ko')));
    }
  }
  check();
  if (!_done) {
    speechSynthesis.addEventListener('voiceschanged', check, { once: true });
    // Fallback: if voiceschanged never fires (e.g. Brave blocking TTS),
    // treat as incompatible after 2s
    setTimeout(() => { if (!_done) { _done = true; cb(true); } }, 2000);
  }
}

function _disableTTSToggle() {
  const card = document.getElementById('chk-tts')?.closest('.gopt-card');
  if (card) card.classList.add('tts-unsupported');
  const chk = document.getElementById('chk-tts');
  if (chk) { chk.checked = false; chk.disabled = true; }
  const pauseChk = document.getElementById('pause-chk-tts');
  if (pauseChk) { pauseChk.checked = false; pauseChk.disabled = true; }
  const dojangChk = document.getElementById('dojang-chk-tts');
  if (dojangChk) { dojangChk.checked = false; dojangChk.disabled = true; }
  dojangChk?.closest('.dojang-pause-tts-row')?.classList.add('tts-unsupported');
  G.ttsEnabled = false;
}

function _showDonateModal(count) {
  const modal = document.getElementById('donate-modal');
  if (!modal) return;
  const msgEl = document.getElementById('donate-msg');
  if (msgEl) msgEl.textContent = i18n('donate.body', { count });
  modal.classList.remove('off');
  document.getElementById('donate-close')?.addEventListener('click', () => {
    modal.classList.add('off');
  }, { once: true });
}

function _showTTSModal() {
  const modal = document.getElementById('tts-modal');
  if (!modal) return;
  modal.classList.remove('off');
  const close = () => modal.classList.add('off');
  document.getElementById('tts-modal-close')?.addEventListener('click', close, { once: true });
  modal.addEventListener('click', e => { if (e.target === modal) close(); }, { once: true });
}

function _checkStartupModals() {
  const lc = parseInt(localStorage.getItem('krr_launchCount') || '0');
  const showDonate = lc > 0 && lc % 10 === 0;

  if (showDonate) _showDonateModal(lc);

  _checkTTSCompat(incompatible => {
    if (!incompatible) return;
    _disableTTSToggle();
    if (!showDonate) _showTTSModal();
  });
}

/* ================================================================
   STARTUP ANIMATION
================================================================ */
let _keypressAudio = null;
function _playKeypressSound() {
  const sfxVol = parseFloat(localStorage.getItem('krr_sfx_vol') ?? '0.5');
  if (sfxVol <= 0) return;
  if (!_keypressAudio) _keypressAudio = new Audio('assets/sounds/keypress.mp3');
  const clone = _keypressAudio.cloneNode();
  clone.volume = 0.25 * sfxVol;
  clone.playbackRate = 0.6 + Math.random() * 0.75; // pitch variation
  clone.play().catch(() => {});
}

function _showLangSelectPanel(callback) {
  const langSel = document.getElementById('lang-select');
  if (!langSel) { callback?.(); return; }

  const btnsEl  = document.getElementById('lang-select-btns');
  if (btnsEl) {
    const langs = getAvailableLanguages();
    btnsEl.innerHTML = langs.map(({ code, name, icon }) =>
      `<button class="lang-btn" data-lang="${code}"><span class="lang-flag">${icon}</span><span class="lang-name">${name}</span></button>`
    ).join('');
  }

  const titleEl = document.getElementById('lang-select-title');
  let _langTitleTimer = null;
  if (titleEl) {
    const langs = getAvailableLanguages();
    const texts = langs.map(({ code }) => {
      const meta = getLangMeta(code);
      return meta?.select || meta?.name || code;
    }).filter(Boolean);
    let idx = 0;
    function showNext() {
      titleEl.style.opacity = '0';
      setTimeout(() => { titleEl.textContent = texts[idx % texts.length]; titleEl.style.opacity = '1'; idx++; }, 300);
    }
    if (texts.length) { showNext(); _langTitleTimer = setInterval(showNext, 2000); }
  }

  langSel.classList.remove('off');
  void langSel.offsetWidth;
  langSel.classList.add('visible');

  function onLangChosen(lang) {
    if (_langTitleTimer) { clearInterval(_langTitleTimer); _langTitleTimer = null; }
    localStorage.setItem('krr_lang', lang);
    if (lang === 'ko' && localStorage.getItem('krr_dict_prog') === null) {
      localStorage.setItem('krr_dict_prog', '1');
    }
    setLanguage(lang);
    applyLanguage();
    langSel.classList.remove('visible');
    setTimeout(() => { langSel.classList.add('off'); callback?.(); }, 500);
  }

  btnsEl?.addEventListener('click', e => {
    const btn = e.target.closest('.lang-btn');
    if (btn) onLangChosen(btn.dataset.lang);
  });
}

function runStartupAnimation(onPrepare, onDone) {
  const overlay  = document.getElementById('startup-overlay');
  const inner    = document.getElementById('startup-inner');
  const logo     = document.getElementById('startup-logo');
  const textEl   = document.getElementById('startup-text');
  if (!overlay) { onPrepare?.(); onDone?.(); return; }

  const text = 'lluc.dev';

  // Hide weather canvases so they can be revealed smoothly after the overlay is gone
  const _wxEl = document.getElementById('wx-canvas');
  const _dnEl = document.getElementById('dn-canvas');
  if (_wxEl) { _wxEl.style.transition = ''; _wxEl.style.opacity = '0'; }
  if (_dnEl) { _dnEl.style.transition = ''; _dnEl.style.opacity = '0'; }

  function finishOverlay() {
    // Increment launch counter (persists until user resets progress)
    const _lc = parseInt(localStorage.getItem('krr_launchCount') || '0') + 1;
    localStorage.setItem('krr_launchCount', String(_lc));
    // On mobile without fullscreen: hide everything until fullscreen is entered
    const needsFs = window.innerHeight < 500 && !(document.fullscreenElement || document.webkitFullscreenElement);
    const _gameEls = needsFs
      ? ['scr-title','gc','wx-canvas','dn-canvas'].map(id => document.getElementById(id)).filter(Boolean)
      : [];
    _gameEls.forEach(el => { el.style.visibility = 'hidden'; });
    // Prepare content (language, title screen) while overlay is still visible so there's no flash
    onPrepare?.();
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.classList.add('hidden');
      // Fade in weather canvases now that the overlay is fully gone
      if (_wxEl) { _wxEl.style.transition = 'opacity 0.6s ease'; _wxEl.style.opacity = '1'; }
      if (_dnEl) { _dnEl.style.transition = 'opacity 0.6s ease'; _dnEl.style.opacity = '1'; }
      if (needsFs) {
        window._showFsOverlay?.(() => {
          _gameEls.forEach(el => { el.style.visibility = ''; });
          onDone?.();
        });
      } else {
        onDone?.();
      }
    }, 650);
  }

  // Phase 1: logo appears (200ms delay, perfectly centered - no text yet)
  setTimeout(() => {
    logo.classList.add('visible');

    // Phase 2: 700ms after logo appears, text starts typing from scratch
    setTimeout(() => {
      textEl.classList.add('visible');
      let i = 0;
      const typeInterval = setInterval(() => {
        if (i < text.length) {
          ++i;
          textEl.innerHTML = '<span id="startup-typed">' + text.slice(0, i) + '<span id="startup-cursor">▌</span></span>';
          _playKeypressSound?.();
        } else {
          clearInterval(typeInterval);
          // Phase 3: after typing done, wait 600ms then finish
          setTimeout(finishOverlay, 600);
        }
      }, 200);
    }, 700);
  }, 200);
}

/* ================================================================
   INIT
================================================================ */
export function init() {
  // Load persistent cross-run state (word kills, lessons, vocab unlocks)
  loadPersistentState();
  _restoreHudUiSize();
  window.addEventListener('resize', _applyHudUiSize);
  // Restore touch mode preference; default ON for touch devices
  const _savedTouchMode = localStorage.getItem('krr_touchMode');
  if (_savedTouchMode === '1') {
    G.touchMode = true;
  } else if (_savedTouchMode === null && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
    G.touchMode = true;
  }
  // Multiplayer is opt-in because it adds an extra branch to the title flow.
  G.multiplayerBeta = localStorage.getItem('krr_multiplayer_beta') === '1';

  // Check if device is in portrait orientation
  const isPortrait = window.innerWidth < window.innerHeight * 0.75;

  // Load languages first, then run startup animation so lang-select callback can apply immediately
  loadLanguages().then(() => {
    // Apply saved language immediately so i18n() works in startup overlays
    const _earlyLang = localStorage.getItem('krr_lang');
    if (_earlyLang) setLanguage(_earlyLang);
    // Wake up voices to prevent activation warning
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
    buildLangSelector(); // rebuild dropdown from available langs
    // Refresh rotate overlay text now that languages are loaded
    window._updateRotateOverlayText?.();

    // Called while overlay is still fading - content builds underneath with no flash
    function startupPrepare() {
      const saved = localStorage.getItem('krr_lang') || 'en';
      setLanguage(saved);
      const sel = document.getElementById('sel-lang');
      if (sel) sel.value = saved;
      buildTitleScreen();
      buildCheatMenu();
      applyLanguage();
      showTitleScreen();
    }

    // Sequence: [rotate →] lang select (first launch only) → fullscreen (mobile) → lluc.dev
    function _startupSequence() {
      function startAnim() {
        const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        const needsFs = window.innerHeight < 500 && !inFs;
        const needsDesktopUnlock = window.innerHeight >= 500
          && parseInt(localStorage.getItem('krr_launchCount') || '0') >= 1;
        if (needsFs) {
          window._showFsOverlay?.(() => runStartupAnimation(startupPrepare, _checkStartupModals));
        } else if (needsDesktopUnlock) {
          window._showDesktopUnlockOverlay?.(() => runStartupAnimation(startupPrepare, _checkStartupModals));
        } else {
          runStartupAnimation(startupPrepare, _checkStartupModals);
        }
      }
      const isFirstTime = !localStorage.getItem('krr_lang');
      if (isFirstTime) {
        _showLangSelectPanel(startAnim);
      } else {
        startAnim();
      }
    }

    if (isPortrait) {
      window._registerStartupAnimation?.(() => _startupSequence());
    } else {
      _startupSequence();
    }
  }).catch(err => {
    console.error('Failed to load languages:', err);
    runStartupAnimation(null, null);
  });

  // ── Fullscreen overlay manager (mobile only) ─────────────────
  let _fsOverlayCallback = null;
  _startFsPromptCycle = function() {
    const promptEl = document.getElementById('fs-prompt');
    if (!promptEl) return;
    if (_fsPromptTimer) return; // already running
    // Use the player's saved language — no need to cycle through every language
    const savedLang = localStorage.getItem('krr_lang');
    if (savedLang) {
      promptEl.textContent = i18n('misc.fullscreenPrompt');
      return;
    }
    // First-time user: cycle through all languages so anyone can read it
    const langs = getAvailableLanguages();
    if (!langs.length) {
      promptEl.textContent = i18n('misc.fullscreenPrompt');
      return;
    }
    let _idx = 0;
    function showNext() {
      setLanguage(langs[_idx % langs.length].code);
      promptEl.textContent = i18n('misc.fullscreenPrompt');
      _idx++;
    }
    showNext();
    _fsPromptTimer = setInterval(showNext, 2000);
  }

  // Stop the cycling timer and clear prompt text
  _stopFsPromptCycle = function() {
    if (_fsPromptTimer) { clearInterval(_fsPromptTimer); _fsPromptTimer = null; }
    const promptEl = document.getElementById('fs-prompt');
    if (promptEl) promptEl.textContent = '';
  };

  window._showDesktopUnlockOverlay = function(cb) {
    const overlay = document.getElementById('fs-overlay');
    const prompt  = document.getElementById('fs-prompt');
    if (!overlay) { cb?.(); return; }
    if (prompt) prompt.textContent = i18n('misc.audioUnlock');
    overlay.classList.add('desktop-mode');
    overlay.classList.remove('off');
    function onClick() {
      overlay.removeEventListener('click', onClick);
      overlay.classList.remove('desktop-mode');
      overlay.classList.add('off');
      if (prompt) prompt.textContent = '';
      cb?.();
    }
    overlay.addEventListener('click', onClick);
  };

  window._showFsOverlay = function(cb) {
    _fsOverlayCallback = cb || null;
    _syncMobileFs(); // let _syncMobileFs decide visibility based on current state
    // Call cb immediately if fullscreen is not needed (large screen or already fullscreen)
    const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (window.innerHeight >= 500 || inFs) {
      const c = _fsOverlayCallback; _fsOverlayCallback = null; c?.(); return;
    }
    _startFsPromptCycle();
  };
  document.getElementById('fs-btn')?.addEventListener('click', () => {
    const cb = _fsOverlayCallback;
    _fsOverlayCallback = null;
    _enterMobileFullscreen(() => { _syncMobileFs(); cb?.(); });
  });
  document.getElementById('mtb-exit-fs')?.addEventListener('click', () => {
    const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
    if (exitFs) exitFs.call(document).catch(() => {});
  });
  // ─────────────────────────────────────────────────────────────

  initRenderer(canvas, wxCanvas, dnCanvas);
  _applyTouchZoom();
  initMap(mapEl);

  // Wire world.js renderers
  setShopRenderer(cell =>     { renderShopScreen(cell); });
  setModifierRenderer(cell => { renderModifierScreen(cell); });
  setTreasureRenderer(cell => { renderTreasureScreen(cell); });
  setCasinoRenderer(cell =>   { renderCasinoScreen(cell); });
  setTeacherRenderer(cell =>  { renderTeacherScreen(cell); });
  setCombatRef({ addToInventory, killAllEnemies });

  // ── Tutorial box ─────────────────────────────────────────────
  const _tutBox   = document.getElementById('tutorial-box');
  const _tutEmoji = document.getElementById('tutorial-emoji');
  const _tutText  = document.getElementById('tutorial-text');
  let _tutPersist    = false;
  let _tutAutoTimer  = null; // setTimeout handle for auto-close
  let _tutQueueTimer = null; // delayed flush handle; cancelled when leaving a room
  let _tutCurrentKey = null; // key of currently shown tip
  // Queue for tips triggered during combat (shown after combat clears)
  let _tutQueue = []; // [{emoji, msgKey, vars, opts}]

  function _clearTutTimer() {
    if (_tutAutoTimer) { clearTimeout(_tutAutoTimer); _tutAutoTimer = null; }
    if (_tutQueueTimer) { clearTimeout(_tutQueueTimer); _tutQueueTimer = null; }
  }

  // Keep the red boss-path hint below the active tutorial card. When the card
  // disappears, the CSS transition moves the hint back to its normal position.
  let _bossHintLayoutFrame = null;
  function _syncBossPathHintPosition() {
    if (!_bossPathHint) return;
    const defaultTop = window.innerWidth <= 600 ? '16%' : '19%';
    let top = defaultTop;
    if (_tutBox && !_tutBox.classList.contains('off')) {
      const rect = _tutBox.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) top = `${Math.ceil(rect.bottom + 14)}px`;
    }
    _bossPathHint.style.setProperty('--boss-path-top', top);
  }
  function _scheduleBossPathHintPosition() {
    if (_bossHintLayoutFrame) cancelAnimationFrame(_bossHintLayoutFrame);
    _bossHintLayoutFrame = requestAnimationFrame(() => {
      _bossHintLayoutFrame = null;
      _syncBossPathHintPosition();
    });
  }

  window._showTutorial = (emoji, msgKey, vars = null, opts = {}) => {
    if (!_tutBox) return;
    if (G.run?.tutorial?.suppressed) {
      _tutQueue = [];
      return;
    }
    if (G.phase !== 'run') return;
    // If in combat, queue it instead (unless it's allowed during combat)
    if (G.mode === 'combat' && !opts.allowDuringCombat) {
      // Replace queue (last queued tip wins unless higher priority replaces)
      const pri = opts.priority || 0;
      const topPri = _tutQueue.length ? (_tutQueue[0].opts?.priority || 0) : -1;
      if (!_tutQueue.length || pri >= topPri) {
        _tutQueue = [{ emoji, msgKey, vars, opts }];
      }
      return;
    }
    _clearTutTimer();
    _tutEmoji.textContent = emoji;
    _tutText.textContent  = vars ? i18n(msgKey, vars) : i18n(msgKey);
    _tutBox.classList.remove('off');
    _scheduleBossPathHintPosition();
    _tutPersist    = opts.persist || false;
    _tutCurrentKey = msgKey;
    if (G.run?.tutorial) G.run.tutorial.key = msgKey;
    // Auto-close after given seconds
    if (opts.autoClose) {
      _tutAutoTimer = setTimeout(() => window._hideTutorial(true), opts.autoClose * 1000);
    }
  };

  window._hideTutorial = (force = false) => {
    if (!_tutBox) return;
    if (_tutPersist && !force) return;
    _clearTutTimer();
    _tutBox.classList.add('off');
    if (G.run?.tutorial) G.run.tutorial.key = null;
    _tutPersist    = false;
    _tutCurrentKey = null;
    if (force) _tutQueue = [];
    _scheduleBossPathHintPosition();
  };

  // This is intentionally scoped to G.run: the player can mute guidance for
  // a busy attempt without opting out of it forever.
  window._hideTutorialsForRun = () => {
    if (G.run?.tutorial) {
      G.run.tutorial.suppressed = true;
      G.run.tutorial.key = null;
    }
    if (G.run) G.run.bossPathHintDismissed = true;
    _tutQueue = [];
    window._hideTutorial(true);
    if (_bossPathHint) _bossPathHint.classList.add('off');
    _scheduleBossPathHintPosition();
  };

  // Called after room is cleared - flush any queued tip
  window._flushTutQueue = () => {
    if (_tutQueue.length > 0) {
      const { emoji, msgKey, vars, opts } = _tutQueue.shift();
      _tutQueue = [];
      // Small delay so the "Room cleared" announce reads first
      _tutQueueTimer = setTimeout(() => {
        _tutQueueTimer = null;
        window._showTutorial(emoji, msgKey, vars, opts);
      }, 600);
    }
  };

  // Dedicated, low-noise hint for the red boss-path doors. It is independent
  // from the normal tutorial queue so other tips cannot accidentally dismiss it.
  const _bossPathHint = document.getElementById('boss-path-hint');
  window._showBossPathHint = () => {
    if (!_bossPathHint || G.phase !== 'run' || G.run?.tutorial?.suppressed || G.run?.bossPathHintDismissed) return;
    _bossPathHint.classList.remove('off');
    _scheduleBossPathHintPosition();
  };
  window._hideBossPathHint = () => {
    if (!_bossPathHint) return;
    _bossPathHint.classList.add('off');
    _scheduleBossPathHintPosition();
  };

  window.addEventListener('resize', _scheduleBossPathHintPosition);

  // Called when map is opened - dismiss map-related tip
  window._onMapOpen = () => {
    if (_tutCurrentKey === 'tutorial.pressMap') window._hideTutorial(true);
  };

  // Called when teacher screen opens - dismiss tutorial tip + hide player sprite
  window._onTeacherOpen = () => {
    if (_tutCurrentKey === 'tutorial.typeToTalk' || _tutCurrentKey === 'tutorial.findTeacher') {
      window._hideTutorial(true);
    }
    const pi = document.getElementById('player-inner');
    if (pi) pi.style.visibility = 'hidden';
    // kb-panels: only float above scr-teacher when test is active (set by hud.js)
    const pa = document.getElementById('player-area');
    if (pa) pa.style.padding = '15px';
  };

  // Wire global callbacks
  window._mapUpdate    = updateMap;
  window._bookUpdate   = updateBook;
  window._hudUpdate    = updateHudAll;
  window._worldRef     = { enterRoom };
  window._onGameOver   = (victory) => showGameOver(victory);
  // Music hook: called by world.js enterRoom after cell type is determined
  window._onRoomEntered = (cellType, roomCleared = false) => {
    if (G.worldTransition) return; // music deferred to onComplete; don't interrupt animation
    if (roomCleared)                                      playMusic(G.dungeon?.worldDef?.id, 0);
    else if (cellType === 'boss')                        playMusic('boss', 0);
    else if (cellType === 'tent' || cellType === 'camp') playMusic('camp', 0);
    else if (cellType === 'shop' || cellType === 'treasure') playMusic('gift', 0);
    else if (cellType === 'modifier')                    playMusic('modifier', 0);
    else if (cellType === 'casino')                      playMusic('casino', 0);
    else if (cellType === 'teacher')                     playMusic('study', 0);
    else if (G.dungeon?.worldDef?.id)                    playMusic(G.dungeon.worldDef.id, 0);
  };
  window._initWeather  = initWeather;
  window._syncClock    = syncClockToGame;
  window._worldSkip    = () => {
    if (G.phase !== 'run' || !G.run) return;
    triggerWorldTransition(G.run.worldIdx + 1);
  };
  window._wormhole     = () => {
    if (G.phase !== 'run' || !G.dungeon) return;
    const grid = G.dungeon.grid;
    const unvisited = grid.filter(c => !c.visited && c.type !== 'boss');
    if (!unvisited.length) {
      flashAnnounce(i18n('announce.wormholeNoRooms'), '#aa88ff');
      return;
    }
    const dest = unvisited[Math.floor(Math.random() * unvisited.length)];
    document.getElementById('map-panel')?.classList.add('off');
    G.transition = {
      phase: 'out', t: 0, dur: 0.3,
      cb: () => {
        enterRoom(dest.col, dest.row);
        G.transition = { phase: 'in', t: 0, dur: 0.3, cb: null };
        flashAnnounce('🕳️ Wormhole!', '#aa88ff');
      },
    };
  };
  window._saveState = savePersistentState;

  buildCheatMenu();

  // Draggable cheat menu (not in touch mode)
  {
    const el = document.getElementById('cheat-menu');
    if (el) {
      const handle = el.querySelector('#cheat-title') || el;
      let mx = 0, my = 0;
      handle.addEventListener('mousedown', e => {
        if (G.touchMode) return; // no drag in touch mode
        handle.style.cursor = 'move';
        e.preventDefault();
        mx = e.clientX; my = e.clientY;
        function drag(ev) {
          el.style.top  = (el.offsetTop  + ev.clientY - my) + 'px';
          el.style.left = (el.offsetLeft + ev.clientX - mx) + 'px';
          el.style.right = 'auto'; el.style.bottom = 'auto';
          mx = ev.clientX; my = ev.clientY;
        }
        function up() {
          document.removeEventListener('mousemove', drag);
          document.removeEventListener('mouseup', up);
        }
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', up);
      });
    }
  }

  // Start RAF
  requestAnimationFrame(loop);
}

/* ================================================================
   RAF LOOP
================================================================ */
let _lastTs = 0, _autoTimer = 0, _mapExtrasTimer = 0;
let _weatherCycleTimer = 0;
let _loreCancel = null; // set while lore animation is running; call to abort
// Ctrl quick-panel state
let _tabHintShown = false;
let _ctrlState = 'idle'; // 'idle' | 'holding' | 'open' | 'used'
let _ctrlHoldTimer = 0;
let _blurAmount = 0;

// 2-beolsik Korean IME state
let _imeEnabled   = false;
let _imeCommitted = '';
const _imeComposer = new HangulComposer();
let _latinAutoSeq = ''; // consecutive Latin chars typed; auto-switches to Korean after 3
// Shift / caps state for KB display (and touch mode)
// 'off' | 'shift' (one-shot) | 'caps'
let _kbShift = 'off';

function _setKbShift(state) {
  _kbShift = state;
  const panels = [document.getElementById('kb-left'), document.getElementById('kb-right')];
  panels.forEach(p => {
    if (!p) return;
    p.classList.toggle('shifted', state !== 'off');
  });
  // Update touch shift button label if present
  const shiftBtn = document.getElementById('kb-touch-shift');
  if (shiftBtn) {
    if (state === 'caps')  { shiftBtn.textContent = '⇪'; shiftBtn.classList.add('active', 'caps'); }
    else if (state === 'shift') { shiftBtn.textContent = '⇧'; shiftBtn.classList.add('active'); shiftBtn.classList.remove('caps'); }
    else                   { shiftBtn.textContent = '⇧'; shiftBtn.classList.remove('active', 'caps'); }
  }
}

// Depth is determined by the point where an object meets the floor, never by
// the top of its sprite. Canvas Y grows downward, so a larger bottomY is
// physically closer to the player and must be drawn later.
function _monsterBottomY(m) {
  const hpRatio = m.maxHp > 1 ? m.hp / m.maxHp : 1;
  const sizeScale = m.maxHp > 1 ? (0.55 + hpRatio * 0.45) : 1;
  const drawSize = m.size * sizeScale;
  let bodyScale = m.scl || 1;
  if (m.spawnAnim && m.spawnAnim.t < m.spawnAnim.dur) {
    const progress = m.spawnAnim.t / m.spawnAnim.dur;
    const impactProgress = Math.max(0, (progress - 0.78) / 0.22);
    const shadowProgress = Math.min(1, progress / 0.78);
    bodyScale *= progress < 0.78
      ? 1.8 - shadowProgress * 0.6
      : 1.2 - impactProgress * 0.2;
  }
  return m.y + drawSize * bodyScale * 0.5;
}

function _drawDepthSortedRoomObjects() {
  const treeDepths = getTreeDepths();
  const environmentDepths = getEnvironmentDepths();
  if (!treeDepths.length && !environmentDepths.length) {
    drawMonsters();
    return;
  }

  const objects = [
    ...treeDepths.map(tree => ({
      kind: 'tree',
      id: tree.id,
      bottomY: tree.baseY,
    })),
    ...environmentDepths.map(object => ({
      kind: 'environment',
      id: object.id,
      bottomY: object.baseY,
    })),
    ...(G.room?.monsters || [])
      .filter(monster => !monster.dead)
      .map(monster => ({
        kind: 'monster',
        monster,
        bottomY: _monsterBottomY(monster),
      })),
  ];

  // Far-to-near painter's order. The baseline is the depth-crossing rule: an
  // object is drawn after a monster while the monster's bottom is behind the
  // object's baseline. On an exact tie, the monster wins the overlap.
  objects.sort((a, b) => {
    const byY = a.bottomY - b.bottomY;
    if (byY) return byY;
    return a.kind === 'monster' ? 1 : -1;
  });

  for (const object of objects) {
    if (object.kind === 'tree') {
      // Draw the complete object at its depth, not only a lower trunk slice.
      // This lets branches/canopy occlude monsters that are behind the tree.
      drawTrees('back', object.id);
    } else if (object.kind === 'environment') {
      drawEnvironmentObject(object.id);
    } else {
      drawMonsters({
        bodyFilter: monster => monster === object.monster,
        drawLabels: true,
      });
    }
  }
}

let _hudFadeAlpha = 1;   // HUD opacity during ctrl interaction (1 = visible)
let _announceFadeAlpha = 1; // announce opacity (fades faster than HUD)
let _panelFadeAlpha = 0; // ctrl-panel opacity (0 = hidden, fades in on open)

let _recentUserGesture = false;
let _recentGestureTimer = null;
function _markRecentUserGesture() {
  _recentUserGesture = true;
  if (_recentGestureTimer) clearTimeout(_recentGestureTimer);
  _recentGestureTimer = setTimeout(() => { _recentUserGesture = false; _recentGestureTimer = null; }, 1500);
}

function loop(ts) {
  const dt = _lastTs ? Math.min((ts - _lastTs) / 1000, 0.08) : 0.016;
  _lastTs = ts;
  G.last  = ts;

  // Ctrl hold timer + progressive blur / HUD fade / panel fade
  // Suppress backpack/ctrl panel if NPC/teacher screen is open
  const _npcOpen = !document.getElementById('scr-teacher')?.classList.contains('off');
  if (_npcOpen && _ctrlState === 'holding') { _ctrlState = 'idle'; _ctrlHoldTimer = 0; }
  if (_ctrlState === 'holding') {
    _ctrlHoldTimer += dt;
    const prog = Math.min(1, _ctrlHoldTimer / 0.25); // reaches 1 in 0.25s
    _blurAmount    = prog * 20;
    _hudFadeAlpha  = 1 - prog;
    _announceFadeAlpha = Math.max(0, 1 - _ctrlHoldTimer / 0.25); // same rate: 0.25s
    _panelFadeAlpha = 0;
    if (_ctrlHoldTimer >= 0.25) {
      _ctrlState = 'open';
      openCtrlPanel();
    }
  } else if (_ctrlState === 'open') {
    _blurAmount    = 20;
    _hudFadeAlpha  = 0;
    _announceFadeAlpha = 0;
    _panelFadeAlpha = 1; // instant - total trigger time = hold time (250ms)
  } else if (_blurAmount > 0) {
    // Reverting after release/close
    _blurAmount   = Math.max(0, _blurAmount - dt * 80);
    _hudFadeAlpha = 1 - _blurAmount / 20;
    _announceFadeAlpha = 1 - _blurAmount / 20; // revert at same rate
    _panelFadeAlpha = 0;
  } else {
    _hudFadeAlpha  = 1;
    _announceFadeAlpha = 1;
    _panelFadeAlpha = 0;
  }
  // Blur canvases during ctrl interaction; fade overlay elements
  {
    const blurPx = _blurAmount > 0.2 ? Math.round((_blurAmount / 20) * 10) : 0;
    const blurFilter = blurPx > 0 ? `blur(${blurPx}px)` : '';
    canvas.style.filter    = blurFilter;
    wxCanvas.style.filter  = blurFilter;
    if (dnCanvas) dnCanvas.style.filter = blurFilter;
    // Fade overlay elements (player-area, bubbles) - but not during world/sleep transitions
    const fv = _blurAmount > 0.2 ? Math.max(0, 1 - _blurAmount / 20) : null;
    const fadeOp = fv !== null ? fv.toFixed(2) : '';
    if (!G.inTransition) {
      if (paEl) paEl.style.opacity = fadeOp;
    }
    const bubEl = document.getElementById('effect-bubble');
    if (bubEl) bubEl.style.opacity = fadeOp;
    // Only fade map panel when it's actually open
    const mapPanelEl = document.getElementById('map-panel');
    if (mapPanelEl && !mapPanelEl.classList.contains('off')) mapPanelEl.style.opacity = fadeOp;
    else if (mapPanelEl) mapPanelEl.style.opacity = '';
  }
  // Fade HUD during ctrl interaction
  if (hudEl) hudEl.style.opacity = G.phase === 'run' ? String(_hudFadeAlpha) : '';
  // Fade announce during ctrl interaction – only if it's actually visible
  {
    const announceEl = document.getElementById('announce-txt');
    if (announceEl && announceEl.classList.contains('on')) {
      // Only apply fade if announce is actively visible
      if (_announceFadeAlpha < 0.98) {
        announceEl.style.opacity = String(_announceFadeAlpha);
      } else {
        announceEl.style.opacity = '';
      }
    } else if (announceEl) {
      // If announce is not visible, clear any inline opacity
      announceEl.style.opacity = '';
    }
  }
  // Fade ctrl panel in when opening
  {
    const cp = document.getElementById('ctrl-panel');
    if (cp && !cp.classList.contains('off')) cp.style.opacity = String(_panelFadeAlpha);
  }

  resizeCanvas();
  const ctx = canvas.getContext('2d');
  const _dpr = window.devicePixelRatio || 1;
  ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  ctx.clearRect(0, 0, G.W, G.vH || window.innerHeight);

  // ── Dojang phase ─────────────────────────────────────────────
  if (G.phase === 'dojang') {
    dojangManager.tick(dt);
    dojangManager.draw(ctx);
    dojangManager.resizeStrokeCanvas();
    requestAnimationFrame(loop);
    return;
  }

  // Menu/title background: render a preview room
  if (G.phase === 'title' && G.menuPreview) {
    const { worldDef, openDirs, patIdx } = G.menuPreview;
    drawMenuBackground(worldDef, openDirs, patIdx);
    drawWeather();
    drawDayNight(); // always clear/redraw night overlay so stale darkness from a run never bleeds into menu
    // World-entry cinematic triggered from Play button
    if (G.worldTransition) {
      drawWorldTransition();
      tickWorldTransition(dt);
    }
    // Slow weather cycle for menu (every 2 min)
    _weatherCycleTimer += dt;
    if (_weatherCycleTimer >= 120) {
      _weatherCycleTimer = 0;
      if (G.weatherEnabled > 0) {
        const forbidden = new Set([...(worldDef.forbiddenWeathers || []), G.weather, 'clear', 'foggy', 'drizzle', 'raining', 'blizzard']);
        const allowed = ALL_WEATHERS.filter(w => !forbidden.has(w));
        if (allowed.length && Math.random() < 0.33) {
          startWeatherFade(allowed[Math.floor(Math.random() * allowed.length)]);
        }
      }
    }
    tickWeather(dt);
  }

  if (G.phase === 'run') {
    // Freeze time and game ticks while ctrl panel is open
    if (!G.ctrlPanelOpen) {
      G.gameTime += dt;
      tickWeather(dt);
      // Tutorial: night falls for first time → tent hint (skip worlds with fixed lighting)
      if (!G.dungeon?.worldDef?.fixedLighting) {
        const tut = G.run?.tutorial;
        if (tut && !tut.nightHintShown) {
          const hr = (G.gameTime % 420) / 420 * 24;
          if (hr >= 22 || hr < 3) {
            tut.nightHintShown = true;
            window._showTutorial?.('🌙', 'tutorial.buyTent', null, { autoClose: 15 });
          }
        }
      }
    }
    drawBackground();
    // Puddles belong to the floor plane: they are always behind every actor.
    drawPuddles();
    drawDoors();
    drawRoomLabel();

    if (!G.ctrlPanelOpen) {
      tickMonsters(dt);
      tickProjs(dt);
      tickParts(dt);
      tickCoins(dt);
      tickGroundItems(dt);
      tickActiveEffect(dt);
      tickFreeze(dt);
      checkBubbleCollisions();
      tickAnnounce(dt);
    }
    // The bot still needs to advance its own backpack workflow while the
    // Ctrl panel pauses the simulation.
    _tickBot(dt);

    drawBossTether();
    _drawDepthSortedRoomObjects();
    drawBossBadge();
    drawProjs();
    drawParts();
    drawCoins(ctx);
    drawRoomNpc();
    drawNavPrompt();
    drawWeather();
    drawDayNight();
    drawTransition();
    tickTransition(dt);
    drawWorldTransition();
    tickWorldTransition(dt);

    // Door label alpha: ramp up normally, ramp down during transitions
    if (G.transition || G.inTransition) {
      G.doorLabelAlpha = Math.max(0, (G.doorLabelAlpha || 0) - dt * 6);
      document.getElementById('spell-ico')?.classList.remove('visible');
    } else {
      G.doorLabelAlpha = Math.min(1, (G.doorLabelAlpha || 0) + dt * 3.5);
      document.getElementById('spell-ico')?.classList.add('visible');
    }

    updateHudRing();
    _applyDayNightEmoji();
    updateDoorButtons();
    _mapExtrasTimer += dt;
    if (_mapExtrasTimer >= 3) {
      _mapExtrasTimer = 0;
      if (!document.getElementById('map-panel')?.classList.contains('off')) updateMapExtras();
    }
    if (!G.ctrlPanelOpen) _weatherCycleTimer += dt;
    // In MP, only host drives weather changes; guest receives them via time_sync
    if (_weatherCycleTimer >= 120 && (!G.mp?.active || G.mp.isHost)) {
      _weatherCycleTimer = 0;
      if (G.weatherEnabled > 0 && Math.random() < 0.5 * G.weatherEnabled && G.dungeon) {
        const worldDef = G.dungeon.worldDef;
        const forbidden = new Set([...(worldDef.forbiddenWeathers || []), G.weather]);
        const allowed = ALL_WEATHERS.filter(w => !forbidden.has(w));
        if (allowed.length) {
          startWeatherFade(allowed[Math.floor(Math.random() * allowed.length)]);
        }
      }
    }

    // ── Multiplayer periodic sync ─────────────────────────────
    _mpTickSync(dt);

    if (G.autoShoot && G.mode === 'combat') {
      _autoTimer = (_autoTimer || 0) + dt;
      if (_autoTimer >= 0.5) {
        _autoTimer = 0;
        const px = G.W / 2;
        const paH = document.getElementById('player-area')?.offsetHeight + 10 || 90;
        const py = G.vH - paH;
        const alive = G.room?.monsters?.filter(_isTargetableMonster) || [];
        // Filter out monsters that already have projectiles bound to them
        const available = alive.filter(m => !G.room.projs.some(p => p.tid === m.id));
        // Target the closest available monster (no existing projectiles)
        const m = available.length ? available.reduce((best, cur) =>
          Math.hypot(cur.x - px, cur.y - py) < Math.hypot(best.x - px, best.y - py) ? cur : best
        ) : null;
        if (m) fire(m);
      }
    } else {
      _autoTimer = 0;
    }
  }

  requestAnimationFrame(loop);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(window.innerWidth);
  const h = Math.floor(G.vH || window.innerHeight);
  const pw = Math.floor(w * dpr);
  const ph = Math.floor(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width  = pw; canvas.height  = ph;
    canvas.style.width  = w + 'px'; canvas.style.height = h + 'px';
    wxCanvas.width = pw; wxCanvas.height = ph;
    wxCanvas.style.width = w + 'px'; wxCanvas.style.height = h + 'px';
    if (dnCanvas) {
      dnCanvas.width = pw; dnCanvas.height = ph;
      dnCanvas.style.width = w + 'px'; dnCanvas.style.height = h + 'px';
    }
    G.W = w; G.H = window.innerHeight;
  }
}

/* ================================================================
   TRANSITION TICK
================================================================ */
function tickTransition(dt) {
  if (!G.transition) return;
  G.transition.t += dt;
  if (G.transition.t >= G.transition.dur) {
    const cb = G.transition.cb;
    G.transition = null;
    if (cb) cb();
  }
}

/* ================================================================
   WORLD TRANSITION CINEMATIC
   Phases: wipe_in (bar L→R) → emoji (transport crosses screen) → wipe_out (bar shrinks L→R from right anchor)
================================================================ */
function triggerWorldTransition(worldIdx, guestEmoji) {
  if (G.worldTransition || G.phase !== 'run') return;
  sfx('worldClear');
  stopMusic(0); // let fanfare play alone; world music resumes after animation
  // Clear current room so player takes no damage during animation
  G.room.monsters = [];
  G.room.projs    = [];
  G.inTransition  = true;
  _setEffectBubbleUnderTransition(true);
  G.mode          = 'navigate';
  // Fade out player area and weather canvas for duration of animation
  paEl.style.transition = 'opacity 0.4s';
  paEl.style.opacity    = '0';
  wxCanvas.style.transition = 'opacity 0.4s';
  wxCanvas.style.opacity    = '0';

  // Get transport emoji — host uses world sequence, guest uses emoji sent by host
  const targetDef = peekNextWorldDef(worldIdx);
  const emoji = guestEmoji || targetDef?.transport || '🚀';

  // Multiplayer host: tell guest to start the same animation
  if (G.mp?.active && G.mp.isHost) {
    mpSend({ type: 'world_transition_start', emoji, worldIdx });
  }

  // Random direction: 0=top→bot, 1=bot→top, 2=left→right, 3=right→left
  const dir = Math.floor(Math.random() * 4);
  const pad = 80;
  const dirs = [
    { sx: G.W/2,      sy: -pad,       ex: G.W/2,      ey: G.vH+pad   }, // top → bot
    { sx: G.W/2,      sy: G.vH+pad,   ex: G.W/2,      ey: -pad       }, // bot → top
    { sx: -pad,       sy: G.vH/2,     ex: G.W+pad,    ey: G.vH/2     }, // left → right
    { sx: G.W+pad,    sy: G.vH/2,     ex: -pad,       ey: G.vH/2     }, // right → left
  ];
  const d = dirs[dir];

  G.worldTransition = {
    phase:        'wipe_in',
    t:            0,
    wipeProgress: 0,
    wipeDur:      0.5,
    emojiDur:     3.0,
    emoji,
    ex: d.sx, ey: d.sy,
    startX: d.sx, startY: d.sy,
    endX:   d.ex, endY:   d.ey,
    angle:       0,
    angleSpeed:  (Math.random() < 0.5 ? 1 : -1) * (2.5 + Math.random() * 2),
    pendingWorldIdx: worldIdx,
    pendingAnnounce: null,
  };
}
window._triggerWorldTransition = triggerWorldTransition;
window._applyMonsterSync = _applyMonsterSync;

/* ================================================================
   LORE ANIMATION - plays once when user clicks Play, before world transition
================================================================ */
function runLoreAnimation(onComplete) {
  // Cancel any in-progress lore animation before starting a fresh one.
  if (_loreCancel) { _loreCancel(); }

  // All geometry is in `let` so a resize handler can recompute everything mid-animation.
  let W = window.innerWidth, H = window.innerHeight;
  let CHAR_SIZE = Math.round(Math.min(W, H) * 0.22);   // avatar size in px
  let VILLAIN_SIZE = Math.round(CHAR_SIZE * 0.95);

  // --- DOM refs ---
  const overlay      = document.getElementById('lore-overlay');
  const playerOuter  = document.getElementById('lore-player-outer');
  const playerInner  = document.getElementById('lore-player-inner');
  const villainOuter = document.getElementById('lore-villain-outer');
  const villainInner = document.getElementById('lore-villain-inner');
  const speechEl     = document.getElementById('lore-speech');
  const particlesEl  = document.getElementById('lore-particles');
  // P2 follower (only shown in multiplayer co-op)
  const p2Outer      = document.getElementById('lore-p2-outer');
  const p2Inner      = document.getElementById('lore-p2-inner');
  if (!overlay) { onComplete(); return; }

  // P2 lore setup: show only when multiplayer is active with a connected peer
  const _mp2Active = G.mp?.active && G.mp?.p2?.avatar;
  if (p2Outer) {
    if (_mp2Active) {
      p2Outer.style.display = '';
      p2Outer.style.left    = (-CHAR_SIZE) + 'px';
      p2Outer.style.opacity = '0.85';
      if (p2Inner) {
        p2Inner.classList.remove('lore-walking');
        p2Inner.innerHTML = _makeAvatarSvg(G.mp.p2.avatar) || G.mp.p2.emoji || '🧑';
      }
    } else {
      p2Outer.style.display = 'none';
    }
  }

  // Reset display (may have been hidden by previous run's _cleanup)
  playerOuter.style.display  = '';
  playerOuter.style.left     = (-CHAR_SIZE) + 'px';
  villainOuter.style.display = 'none';
  villainOuter.style.opacity = '0';
  playerInner.classList.remove('lore-walking');
  playerInner.innerHTML = '';
  particlesEl.innerHTML = '';
  speechEl.innerHTML    = '';
  speechEl.style.opacity = '';

  let VILLAIN_LEFT       = Math.round(W * 0.65);
  let VILLAIN_CENTER_X   = VILLAIN_LEFT + Math.round(CHAR_SIZE / 2);
  let PLAYER_WALK_TARGET = Math.round(W * 0.28);
  let SPEECH_OFFSET_Y    = Math.round(CHAR_SIZE * 0.28); // px above head for speech bubbles

  // Declare state vars needed inside _applyLoreGeometry before the function.
  let playerX        = -CHAR_SIZE;
  let villainSpeechEl = null;
  let villainLaughEl  = null;

  // Apply geometry-derived DOM styles - called on init and on every resize.
  function _applyLoreGeometry() {
    W            = window.innerWidth;
    H            = window.innerHeight;
    CHAR_SIZE    = Math.round(Math.min(W, H) * 0.22);
    VILLAIN_SIZE = Math.round(CHAR_SIZE * 0.95);
    VILLAIN_LEFT         = Math.round(W * 0.65);
    VILLAIN_CENTER_X     = VILLAIN_LEFT + Math.round(CHAR_SIZE / 2);
    PLAYER_WALK_TARGET   = Math.round(W * 0.28);
    SPEECH_OFFSET_Y      = Math.round(CHAR_SIZE * 0.28);
    playerOuter.style.width  = CHAR_SIZE + 'px';
    playerOuter.style.height = (CHAR_SIZE + 20) + 'px';
    playerOuter.style.bottom = '-' + Math.min(Math.round(CHAR_SIZE * 0.28), 32) + 'px';
    if (p2Outer && _mp2Active) {
      const p2Size = Math.round(CHAR_SIZE * 0.85);
      p2Outer.style.width  = p2Size + 'px';
      p2Outer.style.height = (p2Size + 20) + 'px';
      p2Outer.style.bottom = '-' + Math.min(Math.round(p2Size * 0.28), 32) + 'px';
    }
    villainOuter.style.width  = CHAR_SIZE + 'px';
    villainOuter.style.height = CHAR_SIZE + 'px';
    villainOuter.style.marginTop = -(CHAR_SIZE / 2) + 'px';
    villainInner.style.fontSize  = VILLAIN_SIZE + 'px';
    villainInner.style.lineHeight = CHAR_SIZE + 'px';
    villainOuter.style.left = VILLAIN_LEFT + 'px';
    // Reposition live speech bubbles that were already inserted into the DOM.
    const vy = H * 0.5 - CHAR_SIZE * 0.5 + CHAR_SIZE * 0.18 - SPEECH_OFFSET_Y; // VILLAIN_HEAD_Y() - offset
    if (villainSpeechEl) {
      villainSpeechEl.style.left = VILLAIN_CENTER_X + 'px';
      villainSpeechEl.style.top  = vy + 'px';
      villainSpeechEl.style.maxWidth = Math.round(W * 0.5) + 'px';
    }
    if (villainLaughEl) {
      villainLaughEl.style.left = VILLAIN_CENTER_X + 'px';
      villainLaughEl.style.top  = vy + 'px';
    }
    // Reposition player speech bubble if visible
    if (speechEl && speechEl.style.opacity === '1') {
      const emitX = playerX + CHAR_SIZE * 0.5;
      const emitY = H - CHAR_SIZE * 0.72;
      speechEl.style.left     = emitX + 'px';
      speechEl.style.top      = (emitY - SPEECH_OFFSET_Y) + 'px';
      speechEl.style.maxWidth = Math.round(W * 0.55) + 'px';
    }
  }

  // Size the avatar and villain consistently
  _applyLoreGeometry();

  // Helper: render avatar with given expression overrides
  function renderAvatar(overrides) {
    const opts = { ...G.avatar, ...overrides };
    const svg = _makeAvatarSvg(opts);
    playerInner.innerHTML = svg || '';
    // P2 mirrors the same expression using their own avatar base
    if (p2Inner && _mp2Active && G.mp?.p2?.avatar) {
      const p2opts = { ...G.mp.p2.avatar, ...overrides };
      p2Inner.innerHTML = _makeAvatarSvg(p2opts) || '';
    }
  }

  // --- Lore phrases (i18n) ---
  const lorePhrase    = i18n('lore.wordsDisappearing');
  const villainPhrase = i18n('lore.villainSpeech');
  const speak2Phrase  = i18n('lore.playerSpeech2');
  const villainLaugh  = i18n('lore.villainLaugh');

  // --- State ---
  let elapsed   = 0;
  let rafId     = null;
  let prevTs    = null;
  let scenePhase = 'walk_in';  // current named phase
  let phaseT    = 0;           // elapsed within current phase
  let done      = false;

  // Speech letters
  let speechLetters = [];   // array of { el, char }
  let speechLetterIdx = 0;

  // Villain fade
  let villainOpacity = 0;

  // Show overlay + HUD (boost HUD z-index to float above overlay)
  overlay.style.display = 'block';
  const hudEl = document.getElementById('hud');
  if (hudEl) {
    hudEl.style.display = 'flex';
    hudEl.style.zIndex = '6000';
    hudEl.inert = false;
    hudEl.classList.add('lore-hud');
  }

  // Hide wave card during cutscene (and score card on mobile)
  const hcardWave  = document.getElementById('hcard-wave');
  const hcardScore = document.getElementById('hcard-score');
  if (hcardWave) hcardWave.style.opacity = '0';
  if (hcardScore && window.innerHeight < 500) hcardScore.classList.add('lore-pause-only');

  // Hide title screen behind overlay
  screenOff('scr-title');

  // Character geometry helpers - recomputed from W/H/CHAR_SIZE which update on resize.
  // playerOuter: bottom = -(CHAR_SIZE*0.28) → top of element = H + CHAR_SIZE*0.28 - (CHAR_SIZE+20) = H - CHAR_SIZE*0.72 - 20
  // Avataaars head occupies roughly top 30% of the SVG circle
  // villain: top = H*0.5 - CHAR_SIZE*0.5 (center anchored); 🧞‍♀️ head at ~18% from top
  const PLAYER_OUTER_TOP = () => H - CHAR_SIZE * 0.72 - 20;
  const PLAYER_HEAD_Y    = () => PLAYER_OUTER_TOP() + CHAR_SIZE * 0.12;
  const VILLAIN_OUTER_TOP = () => H * 0.5 - CHAR_SIZE * 0.5;
  const VILLAIN_HEAD_Y    = () => VILLAIN_OUTER_TOP() + CHAR_SIZE * 0.18;

  G.phase = 'lore';

  // Re-apply geometry on resize so mid-animation window resizes stay correct.
  window.addEventListener('resize', _applyLoreGeometry);

  // ── Phase helpers ────────────────────────────────────────────

  function startPhase(name) {
    scenePhase = name;
    phaseT     = 0;
    if (name === 'walk_in') {
      renderAvatar({ eyes: 'happy', eyebrows: 'defaultNatural', mouth: 'smile' });
      playerInner.classList.add('lore-walking');
      if (p2Inner && _mp2Active) p2Inner.classList.add('lore-walking');
    } else if (name === 'surprised') {
      renderAvatar({ eyes: 'surprised', eyebrows: 'raisedExcited', mouth: 'screamOpen' });
      playerInner.classList.remove('lore-walking');
      if (p2Inner && _mp2Active) p2Inner.classList.remove('lore-walking');
    } else if (name === 'books') {
      spawnBooks();
    } else if (name === 'disbelief') {
      renderAvatar({ eyes: 'surprised', eyebrows: 'raisedExcited', mouth: 'disbelief' });
    } else if (name === 'text_appear') {
      speechLetters = [];
      speechLetterIdx = 0;
      speechEl.innerHTML = '';
      // Center horizontally on the letter-emit point (head center), SPEECH_OFFSET_Y above it
      const emitX = playerX + CHAR_SIZE * 0.5;
      const emitY = H - CHAR_SIZE * 0.72;
      speechEl.style.left      = emitX + 'px';
      speechEl.style.top       = (emitY - SPEECH_OFFSET_Y) + 'px';
      speechEl.style.transform = 'translate(-50%, -100%)';
      speechEl.style.maxWidth  = Math.round(W * 0.55) + 'px';
      speechEl.style.textAlign = 'center';
      speechEl.style.whiteSpace = 'normal';
      speechEl.style.opacity = '1';
    } else if (name === 'text_explode') {
      explodeTextLetters();
    } else if (name === 'sad_speak') {
      renderAvatar({ eyes: 'cry', eyebrows: 'sadConcerned', mouth: 'sad' });
      speechEl.innerHTML = '';
      speechLetterIdx = 0;
    } else if (name === 'villain_in') {
      villainOpacity = 0;
      villainOuter.style.opacity = '0';
      villainOuter.style.display = 'block';
    } else if (name === 'villain_react') {
      // player reacts to villain
      renderAvatar({ eyes: 'surprised', eyebrows: 'raisedExcited', mouth: 'screamOpen' });
    } else if (name === 'word_rain') {
      spawnWordRain();
    } else if (name === 'villain_speak') {
      spawnVillainSpeech();
    } else if (name === 'player_speak2') {
      renderAvatar({ eyes: 'cry', eyebrows: 'sadConcerned', mouth: 'sad' });
      sadLetterIdx  = 0;
      sadLetterTimer = 0;
      speak2Active  = true;
    } else if (name === 'villain_exit') {
      spawnVillainLaugh();
    } else if (name === 'player_exit') {
      // Restore default look — set each avatar independently to avoid P1 overriding P2
      playerInner.innerHTML = _makeAvatarSvg(G.avatar) || '';
      if (p2Inner && _mp2Active && G.mp?.p2?.avatar) {
        p2Inner.innerHTML = _makeAvatarSvg(G.mp.p2.avatar) || '';
      }
      playerInner.classList.add('lore-walking');
      if (p2Inner && _mp2Active) p2Inner.classList.add('lore-walking');
    }
  }

  // ── Spawn books ──────────────────────────────────────────────
  const BOOK_EMOJIS = ['📖','📕','📘','📜','📒','📗','📙','📓','📔','📑','📋','📄','📃','📰'];
  const BOOK_WAVES  = 7;  // number of books to spawn over 2s
  let bookSpawnNext  = 0;
  let booksSpawned   = 0;

  function spawnBooks() {
    booksSpawned  = 0;
    bookSpawnNext = 0;
  }

  function tickBooks(dt) {
    bookSpawnNext -= dt;
    if (booksSpawned < BOOK_WAVES && bookSpawnNext <= 0) {
      bookSpawnNext = 0.27;
      booksSpawned++;
      const emoji = BOOK_EMOJIS[Math.floor(Math.random() * BOOK_EMOJIS.length)];
      const yPct  = 0.15 + Math.random() * 0.55;
      const y     = H * yPct;
      const el    = document.createElement('div');
      el.className = 'lore-book';
      el.textContent = emoji;
      el.style.fontSize = Math.round(CHAR_SIZE * 0.32) + 'px';
      const dur  = 1.4 + Math.random() * 0.5;
      const rot0 = Math.random() * 360;
      const rot1 = rot0 + (Math.random() < 0.5 ? 1 : -1) * (180 + Math.random() * 360);
      // shadow strengthens when at player height (gives depth illusion)
      const playerY = H - CHAR_SIZE * 0.5;
      const isNear  = Math.abs(y - playerY) < CHAR_SIZE * 0.5;
      if (isNear) el.style.zIndex = '2';  // in front of player
      el.style.top  = y + 'px';
      el.style.right = '-60px';
      el.style.transition = `right ${dur}s linear, transform ${dur}s linear`;
      particlesEl.appendChild(el);
      requestAnimationFrame(() => {
        el.style.right   = (W + 60) + 'px';
        el.style.transform = `rotate(${rot1}deg)`;
      });
      setTimeout(() => el.remove(), dur * 1000 + 100);
    }
  }

  // ── Text letter-by-letter appearance ─────────────────────────
  const _loreSpeechRate = Number(getLangMeta()?.loreSpeechRate) || 1;
  const LETTER_INTERVAL = 0.07 / _loreSpeechRate; // 70ms per letter, scaled by speech rate
  let   letterTimer      = 0;

  function tickTextAppear(dt) {
    letterTimer -= dt;
    if (letterTimer <= 0 && speechLetterIdx < lorePhrase.length) {
      letterTimer = LETTER_INTERVAL;
      const ch  = lorePhrase[speechLetterIdx++];
      const span = document.createElement('span');
      span.textContent = ch;
      speechEl.appendChild(span);
      speechLetters.push(span);
    }
  }

  function explodeTextLetters() {
    speechLetters.forEach(span => {
      const rect = span.getBoundingClientRect();
      const cx   = rect.left + rect.width / 2;
      const cy   = rect.top  + rect.height / 2;
      const angle = Math.random() * Math.PI * 2;
      const dist  = 80 + Math.random() * 200;
      const dx    = Math.cos(angle) * dist;
      const dy    = Math.sin(angle) * dist;
      const rot   = (Math.random() - 0.5) * 720;
      const dur   = 0.6 + Math.random() * 0.4;
      const el    = document.createElement('div');
      el.className = 'lore-letter';
      el.textContent = span.textContent;
      el.style.cssText = `left:${cx}px;top:${cy}px;color:#fff;font-size:${parseFloat(getComputedStyle(speechEl).fontSize)}px;transform:translate(-50%,-50%);transition:transform ${dur}s ease-out, opacity ${dur}s ease-out;`;
      particlesEl.appendChild(el);
      requestAnimationFrame(() => {
        el.style.transform  = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg)`;
        el.style.opacity    = '0';
      });
      setTimeout(() => el.remove(), (dur + 0.1) * 1000);
    });
    speechEl.innerHTML = '';
    speechLetters = [];
  }

  // ── Sad speaking: letters fly from head ──────────────────────
  const SAD_LETTER_INTERVAL = 0.10 / _loreSpeechRate;
  let   sadLetterIdx         = 0;
  let   sadLetterTimer       = 0;
  let   speak2Active         = false; // true when emitting speak2Phrase instead of lorePhrase

  function _spitLetter(ch) {
    if (ch === ' ') return;
    const headX    = playerX + CHAR_SIZE * 0.5;
    const headY    = H - CHAR_SIZE * 0.72;
    const angle    = -Math.PI * 0.9 + Math.random() * Math.PI * 1.8;
    const dist     = 100 + Math.random() * 180;
    const dx       = Math.cos(angle) * dist;
    const dy       = Math.sin(angle) * dist;
    const rot      = (Math.random() - 0.5) * 720;
    const fontSize = Math.round(CHAR_SIZE * 0.18);
    const dur      = 0.8 + Math.random() * 0.5;
    const hue      = Math.floor(Math.random() * 360);
    const el       = document.createElement('div');
    el.className   = 'lore-letter';
    el.textContent = ch;
    el.style.cssText = `left:${headX}px;top:${headY}px;color:hsl(${hue},80%,75%);font-size:${fontSize}px;transform:translate(-50%,-50%);transition:transform ${dur}s ease-out, opacity ${dur}s ease-out;`;
    particlesEl.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg)`;
      el.style.opacity   = '0';
    });
    setTimeout(() => el.remove(), (dur + 0.1) * 1000);
  }

  function tickSadSpeak(dt) {
    const phrase = speak2Active ? speak2Phrase : lorePhrase;
    sadLetterTimer -= dt;
    if (sadLetterTimer <= 0 && sadLetterIdx < phrase.length) {
      sadLetterTimer = SAD_LETTER_INTERVAL;
      _spitLetter(phrase[sadLetterIdx++]);
    }
  }

  // ── Villain speech - static, fades in then out ───────────────
  const VILLAIN_SPEAK_DUR = 3.5; // total phase duration (s)
  function spawnVillainSpeech() {
    if (villainSpeechEl) villainSpeechEl.remove();
    villainSpeechEl = document.createElement('div');
    villainSpeechEl.className = 'lore-villain-speech';
    villainSpeechEl.textContent = villainPhrase;
    const vy = VILLAIN_HEAD_Y() - SPEECH_OFFSET_Y;
    const fontSize = Math.round(Math.min(W, H) * 0.028);
    const maxW = Math.round(W * 0.5);
    villainSpeechEl.style.cssText = `position:absolute;left:${VILLAIN_CENTER_X}px;top:${vy}px;transform:translate(-50%,-100%);max-width:${maxW}px;text-align:center;color:#ffe082;font-size:${fontSize}px;font-weight:700;white-space:normal;line-height:1.3;text-shadow:0 0 12px rgba(0,0,0,.9),0 2px 4px rgba(0,0,0,1);pointer-events:none;opacity:0;transition:opacity 0.3s;`;
    overlay.appendChild(villainSpeechEl);
    requestAnimationFrame(() => { villainSpeechEl.style.opacity = '1'; });
  }

  // ── Villain exit laugh ────────────────────────────────────────
  function spawnVillainLaugh() {
    if (villainLaughEl) villainLaughEl.remove();
    villainLaughEl = document.createElement('div');
    const vy = VILLAIN_HEAD_Y() - SPEECH_OFFSET_Y;
    const fontSize = Math.round(Math.min(W, H) * 0.032);
    villainLaughEl.textContent = villainLaugh;
    villainLaughEl.style.cssText = `position:absolute;left:${VILLAIN_CENTER_X}px;top:${vy}px;transform:translate(-50%,-100%);color:#ffe082;font-size:${fontSize}px;font-weight:700;text-align:center;text-shadow:0 0 14px rgba(0,0,0,.9);pointer-events:none;opacity:0;transition:opacity 0.3s;`;
    overlay.appendChild(villainLaughEl);
    requestAnimationFrame(() => { villainLaughEl.style.opacity = '1'; });
  }

  // ── Word rain ─────────────────────────────────────────────────
  const RAIN_EMOJIS = WORD_DICT.map(w => w.emoji).filter(Boolean);
  let   rainTimer   = 0;
  const RAIN_INTERVAL = 0.07;

  function spawnWordRain() {
    rainTimer = 0;
  }

  function tickWordRain(dt) {
    rainTimer -= dt;
    if (rainTimer <= 0) {
      rainTimer = RAIN_INTERVAL;
      const emoji = RAIN_EMOJIS[Math.floor(Math.random() * RAIN_EMOJIS.length)];
      const x     = Math.random() * W;
      const angle = (Math.random() - 0.5) * 0.8; // slight diagonal
      const speed = 200 + Math.random() * 300; // px/s
      const size  = 1.4 + Math.random() * 0.8; // rem
      const dur   = (H + 100) / speed;
      const el    = document.createElement('div');
      el.className = 'lore-word-rain';
      el.textContent = emoji;
      const sizePx = Math.round(CHAR_SIZE * (0.22 + Math.random() * 0.14));
      el.style.cssText = `left:${x}px;top:-60px;font-size:${sizePx}px;transform:rotate(${angle * 57}deg);transition:top ${dur}s linear;`;
      particlesEl.appendChild(el);
      requestAnimationFrame(() => { el.style.top = (H + 60) + 'px'; });
      setTimeout(() => el.remove(), dur * 1000 + 100);
    }
  }

  // ── Finish / cleanup ─────────────────────────────────────────
  function _hideOverlay() {
    overlay.style.display = 'none';
    if (hudEl) {
      hudEl.style.display = 'none';
      hudEl.style.zIndex = '';
      hudEl.inert = false;
      hudEl.classList.remove('lore-hud');
    }
    if (hcardWave) hcardWave.style.opacity = '';
    if (hcardScore) {
      hcardScore.style.opacity = '';
      hcardScore.classList.remove('lore-pause-only');
    }
  }

  function _cleanup() {
    if (done) return;
    done = true;
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('resize', _applyLoreGeometry);
    window.removeEventListener('keydown', onSkipKey);
    particlesEl.innerHTML = '';
    speechEl.innerHTML    = '';
    playerOuter.style.display = 'none';
    if (p2Outer) { p2Outer.style.display = 'none'; if (p2Inner) p2Inner.classList.remove('lore-walking'); }
    villainOuter.style.display = 'none';
    playerInner.classList.remove('lore-walking');
    if (villainSpeechEl) { villainSpeechEl.remove(); villainSpeechEl = null; }
    if (villainLaughEl)  { villainLaughEl.remove();  villainLaughEl  = null; }
    if (_skipBtn) { _skipBtn.remove(); _skipBtn = null; }
    if (hudEl) {
      hudEl.style.zIndex = '';
      hudEl.inert = false;
      hudEl.classList.remove('lore-hud');
    }
    if (hcardWave) hcardWave.style.opacity = '';
    if (hcardScore) {
      hcardScore.style.opacity = '';
      hcardScore.classList.remove('lore-pause-only');
    }
    _loreCancel = null;
  }

  function finish() {
    _cleanup();
    G.phase = 'title'; // must be 'title' before triggerMenuPlayTransition ticks
    onComplete(); // calls triggerMenuPlayTransition → sets G.worldTransition
    // Keep overlay as black backdrop until wipe_in completes (onBlack fires)
    // so there's no flash of the room preview
    if (G.worldTransition) {
      const prevOnBlack = G.worldTransition.onBlack;
      G.worldTransition.onBlack = () => {
        _hideOverlay();
        if (prevOnBlack) prevOnBlack();
      };
    } else {
      _hideOverlay();
    }
  }

  // Called by goToMenu() - aborts lore and returns to title without triggering game start
  function cancel() {
    _cleanup();
    _hideOverlay();
    const ps = document.getElementById('scr-pause');
    if (ps) ps.style.zIndex = '';
    screenOff('scr-pause');
    screenOn('scr-title');
    G.phase = 'title';
  }

  _loreCancel = cancel;

  // Hidden skip: pressing Enter while lore is actively playing jumps straight to gameplay.
  // Disabled in co-op (both players must experience the lore together)
  const _mpActive = G.mp?.active;
  function onSkipKey(e) {
    if (_mpActive) return; // no skip in co-op
    if (e.key === 'Enter' && G.phase === 'lore') { e.preventDefault(); finish(); }
  }
  window.addEventListener('keydown', onSkipKey);

  // Visible skip button - shown from 2nd play onwards, hidden in co-op
  let _skipBtn = null;
  const _launchCount = parseInt(localStorage.getItem('krr_launchCount') || '0');
  if (_launchCount > 0 && !_mpActive) {
    _skipBtn = document.createElement('button');
    _skipBtn.id = 'lore-skip-btn';
    _skipBtn.textContent = i18n('lore.skip');
    _skipBtn.addEventListener('click', () => finish());
    document.getElementById('lore-overlay')?.appendChild(_skipBtn);
  }

  // ── Main RAF loop ─────────────────────────────────────────────
  function loop(ts) {
    if (done) return;
    if (G.phase === 'lore_paused') { prevTs = null; rafId = requestAnimationFrame(loop); return; }
    const dt = prevTs !== null ? Math.min((ts - prevTs) / 1000, 0.1) : 0;
    prevTs = ts;
    elapsed  += dt;
    phaseT   += dt;

    switch (scenePhase) {

      case 'walk_in': {
        // Walk from offscreen to PLAYER_WALK_TARGET over 2s
        const t  = Math.min(phaseT / 2.0, 1);
        playerX  = -CHAR_SIZE + (PLAYER_WALK_TARGET - (-CHAR_SIZE)) * easeOut(t);
        playerOuter.style.left = playerX + 'px';
        if (p2Outer && _mp2Active) p2Outer.style.left = Math.max(-CHAR_SIZE, playerX - 80) + 'px';
        if (t >= 1) startPhase('surprised');
        break;
      }

      case 'surprised': {
        playerOuter.style.left = playerX + 'px';
        if (phaseT >= 0.5) startPhase('books');
        break;
      }

      case 'books': {
        tickBooks(dt);
        if (phaseT >= 2.0) startPhase('disbelief');
        break;
      }

      case 'disbelief': {
        if (phaseT >= 0.5) startPhase('text_appear');
        break;
      }

      case 'text_appear': {
        tickTextAppear(dt);
        // done when all letters shown + 0.5s extra
        const allShown = speechLetterIdx >= lorePhrase.length;
        if (allShown && phaseT >= lorePhrase.length * LETTER_INTERVAL + 0.5) {
          startPhase('text_explode');
        }
        break;
      }

      case 'text_explode': {
        if (phaseT >= 0.5) startPhase('sad_speak');
        break;
      }

      case 'sad_speak': {
        tickSadSpeak(dt);
        const sadDone = sadLetterIdx >= lorePhrase.length;
        if (sadDone && phaseT >= lorePhrase.length * SAD_LETTER_INTERVAL + 0.3) {
          startPhase('villain_in');
        }
        break;
      }

      case 'villain_in': {
        villainOpacity = Math.min(phaseT / 0.8, 1);
        villainOuter.style.opacity = String(villainOpacity);
        if (villainOpacity >= 1) startPhase('villain_react');
        break;
      }

      case 'villain_react': {
        if (phaseT >= 0.3) startPhase('word_rain');
        break;
      }

      case 'word_rain': {
        tickWordRain(dt);
        if (phaseT >= 1.5) startPhase('villain_speak');
        break;
      }

      case 'villain_speak': {
        // fade out in the last 0.5s then move on
        if (phaseT >= VILLAIN_SPEAK_DUR - 0.5 && villainSpeechEl) {
          villainSpeechEl.style.transition = 'opacity 0.5s';
          villainSpeechEl.style.opacity = '0';
        }
        if (phaseT >= VILLAIN_SPEAK_DUR) startPhase('player_speak2');
        break;
      }

      case 'player_speak2': {
        tickSadSpeak(dt);
        const sp2Done = sadLetterIdx >= speak2Phrase.length;
        if (sp2Done && phaseT >= speak2Phrase.length * SAD_LETTER_INTERVAL + 0.4) {
          startPhase('villain_exit');
        }
        break;
      }

      case 'villain_exit': {
        // villain fades out while laugh text fades with it
        villainOpacity = Math.max(1 - phaseT / 1.5, 0);
        villainOuter.style.opacity = String(villainOpacity);
        if (villainLaughEl) villainLaughEl.style.opacity = String(villainOpacity);
        if (villainOpacity <= 0) {
          if (villainLaughEl) { villainLaughEl.remove(); villainLaughEl = null; }
          if (villainSpeechEl) { villainSpeechEl.remove(); villainSpeechEl = null; }
          startPhase('player_exit');
        }
        break;
      }

      case 'player_exit': {
        // Walk right fast - 2s to exit off screen
        const t  = Math.min(phaseT / 2.0, 1);
        playerX  = PLAYER_WALK_TARGET + (W + CHAR_SIZE * 2 - PLAYER_WALK_TARGET) * easeIn(t);
        playerOuter.style.left = playerX + 'px';
        if (p2Outer && _mp2Active) p2Outer.style.left = (playerX - 80) + 'px';
        if (t >= 1) { finish(); return; }
        break;
      }
    }

    rafId = requestAnimationFrame(loop);
  }

  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function easeIn(t)  { return t * t; }

  // Kick off
  startPhase('walk_in');
  rafId = requestAnimationFrame(loop);
}

// Play button → world-entry cinematic before starting run
function triggerMenuPlayTransition() {
  if (G.worldTransition) return;
  const emoji = WORLDS[0]?.transport || '🚀';
  const dir = Math.floor(Math.random() * 4);
  const pad = 80;
  const dirs = [
    { sx: G.W/2,   sy: -pad,      ex: G.W/2,   ey: G.vH+pad  },
    { sx: G.W/2,   sy: G.vH+pad,  ex: G.W/2,   ey: -pad      },
    { sx: -pad,    sy: G.vH/2,    ex: G.W+pad,  ey: G.vH/2   },
    { sx: G.W+pad, sy: G.vH/2,    ex: -pad,     ey: G.vH/2   },
  ];
  const d = dirs[dir];
  // Fanfare + silence before animation — same treatment as mid-run world transitions
  sfx('worldClear');
  stopMusic(0);
  // Hide weather+daynight during animation (same as in-run world transition)
  wxCanvas.style.transition = 'opacity 0.4s'; wxCanvas.style.opacity = '0';
  dnCanvas.style.transition = 'opacity 0.4s'; dnCanvas.style.opacity = '0';
  G.worldTransition = {
    phase: 'wipe_in', t: 0, wipeProgress: 0,
    wipeDur: 0.5, emojiDur: 2.5, emoji,
    ex: d.sx, ey: d.sy,
    startX: d.sx, startY: d.sy, endX: d.ex, endY: d.ey,
    angle: 0,
    angleSpeed: (Math.random() < 0.5 ? 1 : -1) * (2.5 + Math.random() * 2),
    onBlack: startNewRun,
    pendingWorldIdx: null,
    pendingAnnounce: null,
    onComplete: () => {
      // Restore weather/daynight canvases after animation
      wxCanvas.style.transition = ''; wxCanvas.style.opacity = '1';
      dnCanvas.style.transition = ''; dnCanvas.style.opacity = '1';
    },
  };
}

function triggerSleepAnimation(partnerSide = false) {
  if (G.worldTransition || G.phase !== 'run') return;
  // Block sleep if either player is in active combat
  if (!partnerSide) {
    if (G.mode === 'combat') return;
    playMusic('camp', 0);
    if (G.mp?.active && G.mp.p2?.inCombat) {
      flashAnnounce(i18n('announce.partnerInCombat') || '⚔️ Partner in combat!', '#ff8866');
      return;
    }
    // Broadcast sleep to partner before animating
    if (G.mp?.active) mpSend({ type: 'sleep' });
  }
  // Weighted sleep emoji: 16 singles + moon-phase group (counts as 1 total weight = 17)
  const SINGLES = ['😴','🧸','🌙','😪','🥱','💤','🛌🏼','🐑','💭','🏕️','⛺','🌚','🎑','⏳','⏰','😵‍💫'];
  const MOONS   = ['🌑','🌒','🌓','🌔','🌕'];
  const roll = Math.floor(Math.random() * (SINGLES.length + 1));
  const emoji = roll < SINGLES.length ? SINGLES[roll] : MOONS[Math.floor(Math.random() * MOONS.length)];

  const dir = Math.floor(Math.random() * 4);
  const pad = 80;
  const dirs = [
    { sx: G.W/2, sy: -pad,      ex: G.W/2,   ey: G.vH+pad },
    { sx: G.W/2, sy: G.vH+pad,  ex: G.W/2,   ey: -pad     },
    { sx: -pad,  sy: G.vH/2,    ex: G.W+pad, ey: G.vH/2   },
    { sx: G.W+pad, sy: G.vH/2,  ex: -pad,    ey: G.vH/2   },
  ];
  const d = dirs[dir];

  paEl.style.transition = 'opacity 0.4s'; paEl.style.opacity = '0';
  wxCanvas.style.transition = 'opacity 0.4s'; wxCanvas.style.opacity = '0';

  G.worldTransition = {
    phase: 'wipe_in', t: 0, wipeProgress: 0,
    wipeDur: 0.5, emojiDur: 2.5, emoji,
    ex: d.sx, ey: d.sy, startX: d.sx, startY: d.sy, endX: d.ex, endY: d.ey,
    angle: 0, angleSpeed: (Math.random() < 0.5 ? 1 : -1) * (1.5 + Math.random() * 1.5),
    pendingWorldIdx: null,
    pendingAnnounce: null,
    onBlack: () => {
      // Reset time to 8am; weather + HP restore only on the player who actually slept
      G.gameTime = 140; // 8/24 * 420 = 140s
      if (!partnerSide) {
        if (G.weatherEnabled > 0 && G.dungeon) {
          const worldDef = G.dungeon.worldDef;
          const forbidden = new Set([...(worldDef.forbiddenWeathers || [])]);
          const available = ['clear','drizzle','raining','snowing','blizzard','fall','blossom'].filter(w => !forbidden.has(w));
          if (available.length) startWeatherFade(available[Math.floor(Math.random() * available.length)]);
        }
        G.playerHP = Math.min(G.playerMax, G.playerHP + 2);
        refreshLives();
        if (G.run) G.run.tentCooldown = 120;
      }
    },
    onComplete: () => {
      flashAnnounce(i18n('announce.healFull'), '#aaffcc');
    },
  };
  G.inTransition = true;
  _setEffectBubbleUnderTransition(true);
}
window._triggerSleepAnimation = triggerSleepAnimation;

function tickWorldTransition(dt) {
  const wt = G.worldTransition;
  if (!wt) return;
  wt.t += dt;

  if (wt.phase === 'wipe_in') {
    wt.wipeProgress = Math.min(1, wt.t / wt.wipeDur);
    if (wt.wipeProgress >= 1) {
      // Screen fully black - run the "at black" action
      if (wt.onBlack) wt.onBlack();
      else {
        startNewWorld(wt.pendingWorldIdx);
        // Defer world music to after animation so fanfare plays alone
        wt.onComplete = () => { playMusic(G.dungeon?.worldDef?.id || 'palace', 0); };
      }
      wt.phase = 'emoji';
      wt.t     = 0;
    }
  } else if (wt.phase === 'emoji') {
    const p = Math.min(1, wt.t / wt.emojiDur);
    wt.ex    = wt.startX + (wt.endX - wt.startX) * p;
    wt.ey    = wt.startY + (wt.endY - wt.startY) * p;
    wt.angle += wt.angleSpeed * dt;
    if (p >= 1) {
      wt.phase        = 'wipe_out';
      wt.t            = 0;
      wt.wipeProgress = 1;
    }
  } else if (wt.phase === 'wipe_out') {
    wt.wipeProgress = Math.max(0, 1 - wt.t / wt.wipeDur);
    if (wt.wipeProgress <= 0) {
      const msg              = wt.pendingAnnounce;
      const pendingWeather   = wt.pendingWeather;
      const deferredTemplates = G.room?._deferredTemplates;
      G.worldTransition = null;
      G.inTransition    = false;
      _setEffectBubbleUnderTransition(false);
      // Restore player area and weather canvas (clear transition to avoid interfering with tickWeather crossfades)
      paEl.style.transition  = '';
      paEl.style.opacity     = '1';
      wxCanvas.style.transition = '';
      wxCanvas.style.opacity    = '1';
      // Effects persist across worlds; re-anchor the bubble after the wipe so
      // an active Auto Kill/Stun is visibly active in the new room as well.
      refreshBubbleDisplay();
      // Init weather for new world
      if (pendingWeather && window._initWeather) window._initWeather(pendingWeather);
      // Spawn monsters (deferred to avoid spawning during animation)
      if (deferredTemplates) {
        G.room._deferredTemplates = null;
        initRoomSpawner(deferredTemplates);
      } else if (G.room?.wPhase === 'waiting_templates') {
        // Guest is still waiting for host's room_templates — onMpTemplatesReceived will spawn when they arrive
      }
      // Optional post-animation callback (used by sleep/tent)
      if (wt.onComplete) wt.onComplete();
      if (msg) flashAnnounce(msg, '#aaddff');
    }
  }
}

/* ================================================================
   TITLE SCREEN
================================================================ */
function _benchmarkWeatherQuality() {
  // Run a 30ms JS compute benchmark using particle-like math (sin/cos/random).
  // Returns the recommended weatherEnabled value (0.1–1.0, never 0).
  const t0 = performance.now();
  let count = 0;
  while (performance.now() - t0 < 30) {
    Math.sin(count * 0.1); Math.cos(count * 0.15); Math.random();
    count++;
  }
  if (count > 200000) return 1;      // desktop / flagship
  if (count > 80000)  return 0.75;   // good mid-range
  if (count > 30000)  return 0.5;    // average mid-range
  if (count > 12000)  return 0.25;   // budget / older device
  return 0.1;                         // minimal — very slow device
}

function buildTitleScreen() {
  // ── Avatar creator ───────────────────────────────────────────
  // Restore saved avatar or use defaults
  const savedAvatar = localStorage.getItem('krr_avatar');
  if (savedAvatar) {
    try { _avaOpts = { ...AVA_DEFAULTS, ...JSON.parse(savedAvatar) }; } catch(e) { _avaOpts = { ...AVA_DEFAULTS }; }
  } else {
    _avaOpts = { ...AVA_DEFAULTS };
    _avaRandomize();
  }
  G.avatar = { ..._avaOpts };

  _refreshAvaPreview();

  document.getElementById('ava-randomize')?.addEventListener('click', () => {
    const btn = document.getElementById('ava-randomize');
    btn.classList.remove('spinning');
    void btn.offsetWidth; // reflow para reiniciar animação se clicar rápido
    btn.classList.add('spinning');
    btn.addEventListener('animationend', () => btn.classList.remove('spinning'), { once: true });
    sfx('diceRoll', 0.43);
    _avaRandomize();
  });
  document.getElementById('ava-edit')?.addEventListener('click', _avaToggleEditMode);
  document.getElementById('ava-edit-close')?.addEventListener('click', _avaCloseTab);
  document.getElementById('ava-edit-prev1')?.addEventListener('click', () => _avaStepEditRow(-1, 1));
  document.getElementById('ava-edit-next1')?.addEventListener('click', () => _avaStepEditRow(1, 1));
  document.getElementById('ava-edit-prev2')?.addEventListener('click', () => _avaStepEditRow(-1, 2));
  document.getElementById('ava-edit-next2')?.addEventListener('click', () => _avaStepEditRow(1, 2));
  document.getElementById('ava-edit-prev3')?.addEventListener('click', () => _avaStepEditRow(-1, 3));
  document.getElementById('ava-edit-next3')?.addEventListener('click', () => _avaStepEditRow(1, 3));
  _updateAvaTabTooltips();
  document.querySelectorAll('.ava-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.avaTab;
      if (_avaActiveTab === tabId) _avaCloseTab();
      else _avaOpenTab(tabId);
    });
  });

  setWeaponGroup(localStorage.getItem('krr_wg') || 'weapons');

  // Settings wiring
  document.getElementById('sel-lang')?.addEventListener('change', e => {
    setLanguage(e.target.value);
    localStorage.setItem('krr_lang', e.target.value);
    applyLanguage();
  });
  document.getElementById('chk-fonts')?.addEventListener('change', e => { G.varyFonts = e.target.checked; });
  document.getElementById('sel-weather')?.addEventListener('change', e => {
    G.weatherEnabled = parseFloat(e.target.value);
    localStorage.setItem('krr_weather', e.target.value);
  });
  document.getElementById('sel-details')?.addEventListener('change', e => {
    G.treeDetails = Math.max(0, Math.min(2, parseInt(e.target.value, 10) || 0));
    localStorage.setItem('krr_tree_details', String(G.treeDetails));
  });
  document.getElementById('chk-tts')?.addEventListener('change', e => {
    G.ttsEnabled = e.target.checked;
    const pause = document.getElementById('pause-chk-tts');
    if (pause) pause.checked = e.target.checked;
    const dojang = document.getElementById('dojang-chk-tts');
    if (dojang) dojang.checked = e.target.checked;
  });
  // Pause-screen toggles (mirror main settings)
  document.getElementById('pause-sel-weather')?.addEventListener('change', e => {
    G.weatherEnabled = parseFloat(e.target.value);
    localStorage.setItem('krr_weather', e.target.value);
    const main = document.getElementById('sel-weather');
    if (main) main.value = e.target.value;
  });
  document.getElementById('pause-chk-tts')?.addEventListener('change', e => {
    G.ttsEnabled = e.target.checked;
    const main = document.getElementById('chk-tts');
    if (main) main.checked = e.target.checked;
    const dojang = document.getElementById('dojang-chk-tts');
    if (dojang) dojang.checked = e.target.checked;
  });
  document.getElementById('dojang-chk-tts')?.addEventListener('change', e => {
    G.ttsEnabled = e.target.checked;
    const main = document.getElementById('chk-tts');
    if (main) main.checked = e.target.checked;
    const pause = document.getElementById('pause-chk-tts');
    if (pause) pause.checked = e.target.checked;
  });
  document.getElementById('pause-chk-translation')?.addEventListener('change', e => {
    G.translationEnabled = e.target.checked;
    localStorage.setItem('krr_trans', e.target.checked ? '1' : '0');
    const main = document.getElementById('chk-translation');
    if (main) main.checked = e.target.checked;
  });
  document.getElementById('pause-chk-hanja-monsters')?.addEventListener('change', e => {
    G.showHanjaOnMonsters = e.target.checked;
    localStorage.setItem('krr_hanja_mon', e.target.checked ? '1' : '0');
    const main = document.getElementById('chk-hanja-monsters');
    if (main) main.checked = e.target.checked;
  });
  document.getElementById('pause-ui-size')?.addEventListener('input', e => {
    _setHudUiSize(Number(e.target.value) / 100, true);
  });
  // SFX volume sliders (settings, pause, dojang-pause) - all in sync
  function _syncSfxSliders(v) {
    const pct = Math.round(v * 100);
    const emoji = v <= 0 ? '🔇' : '🔉';
    ['sfx-vol-slider','pause-sfx-vol','dojang-sfx-vol'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value !== String(pct)) el.value = String(pct);
    });
    ['sfx-vol-emoji','pause-sfx-emoji','dojang-sfx-emoji'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = emoji;
    });
  }
  function _onSfxSlider(e) { setVolume(e.target.value / 100); _syncSfxSliders(getVolume()); }
  document.getElementById('sfx-vol-slider')?.addEventListener('input', _onSfxSlider);
  document.getElementById('pause-sfx-vol')?.addEventListener('input', _onSfxSlider);
  document.getElementById('dojang-sfx-vol')?.addEventListener('input', _onSfxSlider);
  // Init slider positions from saved volume
  _syncSfxSliders(getVolume());

  // Music volume sliders (settings + pause)
  function _syncMusicSliders(v) {
    const pct = Math.round(v * 100);
    const emoji = v <= 0 ? '🔇' : '🎵';
    ['music-vol-slider','pause-music-vol'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value !== String(pct)) el.value = String(pct);
    });
    ['music-vol-emoji','pause-music-emoji'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = emoji;
    });
  }
  function _onMusicSlider(e) { setMusicVolume(e.target.value / 100); _syncMusicSliders(getMusicVolume()); }
  document.getElementById('music-vol-slider')?.addEventListener('input', _onMusicSlider);
  document.getElementById('pause-music-vol')?.addEventListener('input', _onMusicSlider);
  _syncMusicSliders(getMusicVolume());

  // hangulSize is determined by screen size at run start (hardcoded; no slider)
  document.getElementById('chk-hanja')?.addEventListener('change', e => {
    G.hanjaEnabled = e.target.checked;
    localStorage.setItem('krr_hanja', e.target.checked ? '1' : '0');
  });
  document.getElementById('chk-translation')?.addEventListener('change', e => {
    G.translationEnabled = e.target.checked;
    localStorage.setItem('krr_trans', e.target.checked ? '1' : '0');
  });
  document.getElementById('chk-hanja-monsters')?.addEventListener('change', e => {
    G.showHanjaOnMonsters = e.target.checked;
    localStorage.setItem('krr_hanja_mon', e.target.checked ? '1' : '0');
  });
  // Restore saved preferences (default: hanja ON, translation ON, hanja-on-monsters OFF)
  const savedHanja = localStorage.getItem('krr_hanja');
  G.hanjaEnabled = savedHanja !== null ? savedHanja === '1' : true;
  const elHanja = document.getElementById('chk-hanja');
  if (elHanja) elHanja.checked = G.hanjaEnabled;

  const savedTrans = localStorage.getItem('krr_trans');
  G.translationEnabled = savedTrans !== null ? savedTrans === '1' : true;
  const elTrans = document.getElementById('chk-translation');
  if (elTrans) elTrans.checked = G.translationEnabled;

  const savedHanjaMon = localStorage.getItem('krr_hanja_mon');
  G.showHanjaOnMonsters = savedHanjaMon !== null ? savedHanjaMon === '1' : false;
  const elHanjaMon = document.getElementById('chk-hanja-monsters');
  if (elHanjaMon) elHanjaMon.checked = G.showHanjaOnMonsters;

  // Restore or auto-detect weather quality
  const savedWeather = localStorage.getItem('krr_weather');
  const weatherVal = savedWeather !== null
    ? parseFloat(savedWeather)
    : _benchmarkWeatherQuality(); // first launch: auto-detect from device benchmark
  if (savedWeather === null) localStorage.setItem('krr_weather', String(weatherVal));
  G.weatherEnabled = weatherVal;
  const elWeather = document.getElementById('sel-weather');
  if (elWeather) elWeather.value = String(weatherVal);

  const savedTreeDetails = localStorage.getItem('krr_tree_details');
  G.treeDetails = savedTreeDetails !== null
    ? Math.max(0, Math.min(2, parseInt(savedTreeDetails, 10) || 0))
    : 2;
  const elTreeDetails = document.getElementById('sel-details');
  if (elTreeDetails) elTreeDetails.value = String(G.treeDetails);

  const savedDictProg = localStorage.getItem('krr_dict_prog');
  G.dictProgressionDisabled = savedDictProg === '1';
  const elDictProg = document.getElementById('chk-dict-prog');
  if (elDictProg) elDictProg.checked = G.dictProgressionDisabled;
  _syncDictTitles();
  document.getElementById('chk-dict-prog')?.addEventListener('change', e => {
    G.dictProgressionDisabled = e.target.checked;
    localStorage.setItem('krr_dict_prog', e.target.checked ? '1' : '0');
    _syncDictTitles();
    buildTitleDict();
    updateBook();
  });

  // Clickable doors — default ON
  const savedClickable = localStorage.getItem('krr_clickable_doors');
  G.clickableDoors = savedClickable !== null ? savedClickable === '1' : true;
  const elClickable = document.getElementById('chk-clickable-doors');
  if (elClickable) elClickable.checked = G.clickableDoors;
  document.getElementById('chk-clickable-doors')?.addEventListener('change', e => {
    G.clickableDoors = e.target.checked;
    localStorage.setItem('krr_clickable_doors', e.target.checked ? '1' : '0');
  });

  // Random menu music
  const savedRandMusic = localStorage.getItem('krr_random_menu_music');
  G.randomMenuMusic = savedRandMusic === '1';
  const elRandMusic = document.getElementById('chk-random-menu-music');
  if (elRandMusic) elRandMusic.checked = G.randomMenuMusic;
  document.getElementById('chk-random-menu-music')?.addEventListener('change', e => {
    G.randomMenuMusic = e.target.checked;
    localStorage.setItem('krr_random_menu_music', e.target.checked ? '1' : '0');
  });

  // Start button - show Dojang entry modal
  document.getElementById('btn-play')?.addEventListener('click', () => {
    _showDojangEntryModal();
  });

  // Dojang entry path selection and action buttons (delegated)
  document.addEventListener('click', e => {
    const pathBtn = e.target.closest('.dej-path-btn');
    if (pathBtn) { _dojangEntrySelectPath(pathBtn.dataset.path); return; }
    const card = e.target.closest('.dej-card[data-action]');
    if (card) { _dojangEntryAction(card.dataset.action); }
  });

  // Dojang in-session buttons (wired when entering dojang for first time)

  // In-run button: resume
  document.getElementById('btn-resume')?.addEventListener('click', resumeGame);
  document.getElementById('btn-menu')?.addEventListener('click', goToMenu);

  document.getElementById('btn-restart')?.addEventListener('click', goToMenu);

  // Title hi score
  const hiEl = document.getElementById('title-hi');
  if (hiEl && G.hiScore > 0) hiEl.textContent = `${i18n('title.bestScore')}: ${G.hiScore}원`;

  // Logo easter egg: click randomizes menu weather (5s cooldown)
  (function() {
    const logoGif = document.getElementById('menu-logo-gif');
    if (!logoGif) return;
    let _cooldown = false;
    logoGif.addEventListener('click', () => {
      if (G.phase !== 'title' || !G.menuPreview || _cooldown) return;
      const allowed = ALL_WEATHERS.filter(w => w !== 'clear' && w !== 'foggy' && w !== 'drizzle' && w !== 'raining' && w !== 'blizzard' && w !== G.weather);
      if (!allowed.length) return;
      startWeatherFade(allowed[Math.floor(Math.random() * allowed.length)]);
      _cooldown = true;
      logoGif.style.cursor = 'default';
      setTimeout(() => { _cooldown = false; logoGif.style.cursor = ''; }, 5000);
    });
  })();

  // My Dictionary button - opens floating modal
  document.getElementById('btn-my-dict')?.addEventListener('click', () => {
    document.getElementById('my-dict-modal')?.classList.remove('off');
    buildTitleDict();
  });
  // Settings button - opens settings modal (same behavior as My Dictionary)
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    document.getElementById('settings-modal')?.classList.remove('off');
  });

  // Close modals on backdrop click
  document.getElementById('my-dict-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('off');
  });
  document.getElementById('settings-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('off');
  });

  // Build dictionary panel with tabs
  buildTitleDict();
  document.getElementById('dict-search')?.addEventListener('input', e => buildTitleDict(e.target.value));
  document.querySelectorAll('#title-dict-tabs .dict-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#title-dict-tabs .dict-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _titleDictCat = btn.dataset.cat;
      buildTitleDict(document.getElementById('dict-search')?.value || '');
    };
  });

  const DIFFICULTY_ORDER = ['baby', 'easy', 'normal', 'hard', 'hardcore'];
  const DIFFICULTY_HEARTS = { baby: 50, easy: 20, normal: 10, hard: 5, hardcore: 1 };
  function _getDifficulty() {
    return localStorage.getItem('krr_difficulty') || (G.difficulty || 'normal');
  }
  function _setDifficulty(value) {
    G.difficulty = value;
    localStorage.setItem('krr_difficulty', value);
    const selDiff = document.getElementById('sel-difficulty');
    if (selDiff) selDiff.value = value;
  }
  _setDifficulty(_getDifficulty());

  document.getElementById('chk-touch')?.addEventListener('change', e => {
    G.touchMode = e.target.checked;
    localStorage.setItem('krr_touchMode', G.touchMode ? '1' : '0');
    if (G.phase === 'run') applyTouchMode();
  });

  const elMultiplayerBeta = document.getElementById('chk-multiplayer-beta');
  if (elMultiplayerBeta) elMultiplayerBeta.checked = G.multiplayerBeta;
  document.getElementById('chk-multiplayer-beta')?.addEventListener('change', e => {
    G.multiplayerBeta = e.target.checked;
    localStorage.setItem('krr_multiplayer_beta', G.multiplayerBeta ? '1' : '0');
    if (!G.multiplayerBeta) document.getElementById('dej-detail')?.classList.add('off');
  });

  document.getElementById('sel-difficulty')?.addEventListener('change', e => {
    _setDifficulty(e.target.value);
  });

  document.getElementById('settings-btn')?.addEventListener('click', () => {
    document.getElementById('settings-modal')?.classList.remove('off');
  });

  (function() {
    const btn = document.getElementById('title-reset-btn');
    if (!btn) return;
    let _resetPending = false;
    let _resetTimer = null;
    btn.addEventListener('click', () => {
      if (_resetPending) {
        localStorage.clear(); location.reload();
      } else {
        _resetPending = true;
        btn.textContent = i18n('misc.confirmResetConfirm');
        btn.style.color = '#e74c3c';
        _resetTimer = setTimeout(() => {
          _resetPending = false;
          btn.textContent = '↺ ' + i18n('misc.confirmReset');
          btn.style.color = '';
        }, 4000);
      }
    });
  })();

  // ── Export / Import progress (copy-paste code) ───────────────
  (() => {
    const MAGIC = 'EZRA1:';
    const modal     = document.getElementById('progress-modal');
    const titleEl   = document.getElementById('progress-modal-title');
    const descEl    = document.getElementById('progress-modal-desc');
    const codeEl    = document.getElementById('progress-modal-code');
    const copyBtn   = document.getElementById('progress-modal-copy');
    const loadBtn   = document.getElementById('progress-modal-load');
    const closeBtn  = document.getElementById('progress-modal-close');

    function openModal(mode) {
      copyBtn.classList.toggle('off', mode !== 'export');
      loadBtn.classList.toggle('off', mode !== 'import');
      if (mode === 'export') {
        titleEl.textContent = i18n('progress.exportTitle');
        descEl.textContent  = i18n('progress.exportDesc');
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('krr_')) data[k] = localStorage.getItem(k);
        }
        codeEl.value    = MAGIC + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
        codeEl.readOnly = true;
      } else {
        titleEl.textContent = i18n('progress.importTitle');
        descEl.textContent  = i18n('progress.importDesc');
        codeEl.value    = '';
        codeEl.readOnly = false;
      }
      modal.classList.remove('off');
      if (!G.touchMode) {
        codeEl.focus();
        if (mode === 'export') codeEl.select();
      } else {
        codeEl.blur();
      }
    }

    closeBtn?.addEventListener('click', () => modal.classList.add('off'));
    modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.add('off'); });

    copyBtn?.addEventListener('click', () => {
      navigator.clipboard?.writeText(codeEl.value).then(() => {
        copyBtn.textContent = i18n('progress.copied');
        setTimeout(() => { copyBtn.textContent = i18n('progress.copy'); }, 2000);
      }).catch(() => { codeEl.select(); document.execCommand('copy'); });
    });

    loadBtn?.addEventListener('click', () => {
      const raw = codeEl.value.trim();
      if (!raw.startsWith(MAGIC)) { alert(i18n('progress.importWrongFormat')); return; }
      try {
        const data = JSON.parse(decodeURIComponent(escape(atob(raw.slice(MAGIC.length)))));
        for (const [k, v] of Object.entries(data)) {
          if (k.startsWith('krr_')) localStorage.setItem(k, v);
        }
        alert(i18n('progress.importSuccess'));
        location.reload();
      } catch {
        alert(i18n('progress.importError'));
      }
    });

    // Use event delegation on document — same pattern as the SFX handler that always fires
    document.addEventListener('click', e => {
      if (e.target.closest('#export-progress-btn')) openModal('export');
      else if (e.target.closest('#import-progress-btn')) openModal('import');
    });
  })();

  // inv-slot click
  document.getElementById('inv-use-hover')?.addEventListener('click', () => {
    invUse(); refreshInventoryUI();
  });
  document.getElementById('inv-prev')?.addEventListener('click', () => {
    invNavigate(-1); refreshInventoryUI();
  });
  document.getElementById('inv-next')?.addEventListener('click', () => {
    invNavigate(1); refreshInventoryUI();
  });

  // HUD: ring-arc announces world name; clock announces weather - both modes
  document.querySelector('.wave-ring-wrap')?.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (G.phase !== 'run' || !G.dungeon) return;
    const world = G.dungeon.worldDef;
    const worldDisplayName = i18n('worlds.' + world.id + '.name') || world.name;
    const worldNum = (G.run?.worldIdx ?? 0) + 1 - (G.run?.expertMode ? 1 : 0);
    const worldLabel = i18n('hud.worldLabel', { n: worldNum });
    flashAnnounce(`${world.emoji} ${worldLabel} - ${worldDisplayName}`, '#88ddff');
  });

  {
    const clockEl    = document.getElementById('hud-clock');
    const clockIcon  = document.getElementById('hud-clock-icon');
    const tooltip    = document.getElementById('shop-tooltip');
    if (clockEl) {
      clockEl.style.pointerEvents = 'all';
      clockEl.style.cursor = 'pointer';
      clockEl.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (G.phase !== 'run' || !G.dungeon) return;
        flashAnnounce(getWeatherLabel(), '#aaddff');
      });
      // Keyboard mode: hover tooltip on clock icon
      if (tooltip && clockIcon) {
        clockIcon.addEventListener('mouseenter', e => {
          if (G.touchMode || G.phase !== 'run') return;
          tooltip.textContent = getWeatherLabel();
          tooltip.style.left  = (e.clientX + 12) + 'px';
          tooltip.style.right = 'auto';
          tooltip.style.top   = (e.clientY - 38) + 'px';
          tooltip.classList.add('show');
        });
        clockIcon.addEventListener('mousemove', e => {
          if (G.touchMode) return;
          tooltip.style.left = (e.clientX + 12) + 'px';
          tooltip.style.top  = (e.clientY - 38) + 'px';
        });
        clockIcon.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
      }
    }
  }

  // ── Wheel → horizontal scroll for tab rows ────────────────────
  function _horizWheel(el) {
    el?.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }
  _horizWheel(document.getElementById('wg-pick'));

  // ── Custom cursor tooltip (replaces native title on data-tooltip) ─
  if (!document.getElementById('custom-tooltip')) {
    const tip = document.createElement('div');
    tip.id = 'custom-tooltip';
    document.body.appendChild(tip);
    document.addEventListener('mousemove', e => {
      const el = e.target.closest('[data-tooltip]:not(.ava-tab)');
      if (el) {
        tip.textContent = el.dataset.tooltip;
        tip.style.display = 'block';
        const x = e.clientX + 14;
        const y = e.clientY - 36;
        tip.style.left = Math.min(x, window.innerWidth - tip.offsetWidth - 8) + 'px';
        tip.style.top  = Math.max(y, 8) + 'px';
      } else {
        tip.style.display = 'none';
      }
    });
    document.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  }

  // ── Cursor auto-hide: hide after 2s of no mouse movement while in-game ─
  if (!document.body.dataset.cursorHideInit) {
    document.body.dataset.cursorHideInit = '1';
    let _cursorHideTimer = null;
    document.addEventListener('mousemove', () => {
      document.body.classList.remove('cursor-hidden');
      if (_cursorHideTimer) clearTimeout(_cursorHideTimer);
      if (G.phase === 'run') {
        _cursorHideTimer = setTimeout(() => {
          if (G.phase === 'run') document.body.classList.add('cursor-hidden');
        }, 2000);
      }
    });
  }
}

function _initMenuPreview() {
  // Pick a random world (never the first one) and random open doors for menu background
  const candidates = WORLDS.filter(w => w.id !== 'tutorial' && !w.isDojangTutorial);
  const worldDef = candidates[Math.floor(Math.random() * candidates.length)];
  const allDirs = ['N', 'S', 'E', 'W'];
  const numDoors = 1 + Math.floor(Math.random() * 3); // 1–3 doors
  const shuffled = allDirs.sort(() => Math.random() - 0.5);
  const openDirs = shuffled.slice(0, numDoors);
  const patIdx = Math.floor(Math.random() * 6);
  G.menuPreview = { worldDef, openDirs, patIdx };
  // Start menu weather
  if (G.weatherEnabled > 0) {
    const allowed = ALL_WEATHERS.filter(w => w !== 'clear' && w !== 'foggy' && w !== 'drizzle' && w !== 'raining' && w !== 'blizzard');
    if (allowed.length) {
      const wx = allowed[Math.floor(Math.random() * allowed.length)];
      initWeather(wx);
      G.weather = wx;
    }
  }
}

function showTitleScreen() {
  closeCheatMenu();
  if (G.ctrlPanelOpen || _ctrlState !== 'idle') closeCtrlPanel();
  screenOff('scr-over'); screenOff('scr-pause');
  screenOff('scr-modifier'); screenOff('scr-shop'); screenOff('scr-treasure');
  window.closeTeacherScreen?.(); // also restores player-inner visibility + clears teacher-test-active
  window._hideTutorial?.(true);
  // Close map and book panels so they don't bleed into next run
  document.getElementById('map-panel')?.classList.add('off');
  document.body.classList.remove('map-open');
  document.getElementById('book-panel')?.classList.add('off');
  screenOn('scr-title');
  if (hudEl) { hudEl.style.display = 'none'; hudEl.style.opacity = ''; }
  if (paEl) paEl.style.display = 'none';
  G.phase = 'title';
  _syncCheatRunShortcut();
  document.body.classList.add('phase-title');
  G.gameTime = 210; // reset to midday so menu is always bright
  drawDayNight();   // immediately clear the night overlay canvas (was left dark if returning from a night run)
  _applyDayNightEmoji(); // immediately clear any night-time brightness filter
  playMusic('menu', 0);
  if (G.randomMenuMusic) {
    const worldIds = WORLDS.map(w => w.id);
    const pick = worldIds[Math.floor(Math.random() * worldIds.length)];
    _wikiMusicPreview = pick;
    playMusic(pick, 0);
  } else {
    _wikiMusicPreview = null;
  }
  // Mobile (height < 500px): always enable touch mode
  if (window.innerHeight < 500) {
    G.touchMode = true;
    const chkTouch = document.getElementById('chk-touch');
    if (chkTouch) chkTouch.checked = true;
  }
  _applyMenuZoom();
  // Initialize background room preview if not already set
  if (!G.menuPreview) _initMenuPreview();
  _weatherCycleTimer = 0;
}

const _DIFFICULTY_UI = {
  baby:     { emoji: '🍼', key: 'options.diffBaby', hearts: 50 },
  easy:     { emoji: '😊', key: 'options.diffEasy', hearts: 20 },
  normal:   { emoji: '⚔️', key: 'options.diffNormal', hearts: 10 },
  hard:     { emoji: '💪', key: 'options.diffHard', hearts: 5 },
  hardcore: { emoji: '💀', key: 'options.diffHardcore', hearts: 1 },
};

function _applyDifficultyLabels() {
  for (const selectId of ['sel-difficulty', 'mp-difficulty']) {
    const select = document.getElementById(selectId);
    if (!select) continue;
    for (const option of select.options) {
      const spec = _DIFFICULTY_UI[option.value];
      if (spec) option.textContent = `${spec.emoji} ${i18n(spec.key)}: ${spec.hearts} ❤️`;
    }
  }
}

function applyLanguage() {
  // Apply data-i18n text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const prefix = el.dataset.i18nPrefix || '';
    el.textContent = prefix + i18n(el.dataset.i18n);
  });
  // Apply data-i18n-placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = i18n(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = i18n(el.dataset.i18nTitle);
  });
  if (_avaActiveTab === 'weapon') _refreshAvaEditBar();
  // Rebuild weapon picker option labels in select elements (if any)
  document.querySelectorAll('[data-i18n-opt]').forEach(opt => {
    opt.textContent = i18n(opt.dataset.i18nOpt);
  });
  _applyDifficultyLabels();

  // Update rotate overlay text to match current language state
  if (window._updateRotateOverlayText) window._updateRotateOverlayText();
  // Update avatar tab tooltips
  _updateAvaTabTooltips();
  // Dynamic HUD strings are not data-i18n nodes, so repaint them too.
  updateHudAll();
}

// Rebuild the language selector dropdown from available JSON languages
function buildLangSelector() {
  const sel = document.getElementById('sel-lang');
  if (!sel) return;
  const langs = getAvailableLanguages();
  if (!langs.length) return;
  sel.innerHTML = '';
  langs.forEach(({ code, name, icon }) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = `${icon} ${name}`;
    if (code === (G.lang || 'en')) opt.selected = true;
    sel.appendChild(opt);
  });
}

let _titleDictCat = 'stats';
let _wikiMusicPreview = null; // world ID currently previewing music in main menu wiki

function _stopWikiMusicPreview() {
  if (!_wikiMusicPreview) return;
  _wikiMusicPreview = null;
  document.querySelectorAll('.wiki-world-music-btn.active').forEach(b => {
    b.textContent = '🎵';
    b.classList.remove('active');
  });
  playMusic('menu', 0);
}

// ── Dict title: swap "My Dictionary" ↔ "Dictionary" based on progression setting ──
function _syncDictTitles() {
  const text = G.dictProgressionDisabled ? i18n('dict.title') : i18n('dict.myDict');
  document.querySelectorAll('[data-i18n="dict.myDict"]').forEach(el => { el.textContent = text; });
  document.querySelectorAll('.dict-tab[data-cat="stats"]').forEach(el => {
    el.style.display = '';
  });
}

// ── Stats tab content (shared by book panel and my-dict modal) ──────────────────
function _renderStatsContent(menuOnly = false) {
  const r = 42, circ = +(2 * Math.PI * r).toFixed(2);

  function ring(pct, color, labelKey, line1, line2 = '') {
    const p = Math.min(1, Math.max(0, isNaN(pct) ? 0 : pct));
    const offset = +(circ * (1 - p)).toFixed(2);
    return `
      <div class="dict-stats-ring">
        <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
          <circle class="ring-track" cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="10"/>
          <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="10"
            stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
            stroke-linecap="round" transform="rotate(-90 50 50)"/>
          <text x="50" y="46" text-anchor="middle" fill="currentColor" font-size="16" font-weight="bold" font-family="inherit">${line1}</text>
          ${line2 ? `<text x="50" y="63" text-anchor="middle" fill="currentColor" opacity="0.5" font-size="11" font-family="inherit">${line2}</text>` : ''}
        </svg>
        <div class="dict-stats-label">${i18n(labelKey)}</div>
      </div>`;
  }

  // ── Existing 3 rings ──────────────────────────────────────────────
  const totalLessons  = LESSONS_BASE.length;
  const doneLessons   = (G.completedLessons || []).length;
  const totalWords    = WORD_DICT.length;
  const learnedList   = G.dictProgressionDisabled ? WORD_DICT : (G.learnedWords || []);
  const unlockedWords = learnedList.length;
  const masteredCount = learnedList.filter(w => {
    const d = WORD_DICT.find(e => e.text === w.text && e.emoji === w.emoji)
           || WORD_DICT.find(e => e.text === w.text) || w;
    if (d.category === 'verb' || d.category === 'adjective') {
      const conjs = G.wordConjugationCounts?.[w.text] || {};
      return Object.values(conjs).reduce((s, n) => s + n, 0) >= 10;
    }
    return G.wordHiddenStatus?.[w.text] === true;
  }).length;

  // ── 3 new rings ───────────────────────────────────────────────────
  const dojangStats = G.dojangStats || {};
  const jp          = dojangStats.jamoProgress || {};
  const jp_tot      = PHASE1_JAMOS.reduce((s, j) => s + (jp[j]?.count || 0), 0);
  const dojangMax   = PHASE1_JAMOS.length * MAX_JAMO_COUNT;

  const totalAllItems = POWERUP_KEYS.length + PERMANENTS.length;
  const itemsAcq      = G.itemsEverAcquired || 0;

  const seenWorlds  = G.seenWorlds || [];
  const totalWorlds = WORLDS.length;

  // ── Wiki accordion helpers ────────────────────────────────────────
  const WEATHER_MAP = { clear:'☀️', foggy:'🌫️', drizzle:'🌦️', raining:'🌧️',
                        snowing:'❄️', blizzard:'🌨️', fall:'🍁', blossom:'🌸' };
  const ALL_W = ['clear','foggy','drizzle','raining','snowing','blizzard','fall','blossom'];

  function worldWeatherIcons(w) {
    const forb = new Set(w.forbiddenWeathers || []);
    return ALL_W.filter(x => !forb.has(x)).map(x => WEATHER_MAP[x]).join(' ');
  }

  function priceRange(base) {
    // World 0 (×1.0) → World 4 (×10.0) as practical range
    const lo = Math.round(base * 1.0 / 10) * 10;
    const hi = Math.round(base * 10.0 / 10) * 10;
    return `<span class="wiki-price">${formatKoreanNumber(lo)}~${formatKoreanNumber(hi)}<b>원</b></span>`;
  }
  const CON_BASES = { '❤️‍🩹':200,'💛':350,'⚡':300,'🔥':400,'🎯':700,'⏰':600,'🎁':300,
    '💣':450,'🛡️':350,'⚔️':1200,'🔇':200,'🤑':300,'🕳️':700,'🏯':3000,'⛺':350,'📖':300,
    '📙':100,'⏱️':500,'🔑':900,'⏰':600,'🎲':200 };
  const MOD_BASES = { block:800,lucky:700,thorn_armor:900,treasure:1000,double_shot:1400,
    ancient_scroll:2000,sloth:700,phoenix_heart:1400,magnet:1000,dummy_turtle:600,
    god_run:1800,crystal_ball:1200,wall_breaker:1800,punching_glove:1200 };

  const learnedItems = G.learnedItems || [];
  const dictProgDisabled = G.dictProgressionDisabled;

  // ── World wiki rows ───────────────────────────────────────────────
  const worldRows = WORLDS.map(w => {
    const visited   = seenWorlds.includes(w.id);
    const revealed  = dictProgDisabled || visited;
    const timeTip   = w.fixedLighting ? `${w.fixedLighting} 🌙` : null;
    const weatherTip= worldWeatherIcons(w);
    const tipContent= [timeTip, weatherTip].filter(Boolean).join('\n');
    const tooltip   = tipContent ? ` data-tooltip="${tipContent}"` : '';
    const visitedBadge = visited
      ? `<span class="wiki-badge wiki-badge-visited">${i18n('dict.wikiVisited')}</span>` : '';
    const unknownCls = revealed ? '' : ' wiki-card-unknown';
    const title = revealed ? (i18n('worlds.'+w.id+'.name') || w.name) : '???????';
    const sub   = revealed ? `${w.bossEmoji} · ${i18n('worlds.'+w.id+'.desc') || ''}` : '???????';
    const isPreview = menuOnly && _wikiMusicPreview === w.id;
    const musicBtn = menuOnly ? `<button class="wiki-world-music-btn${isPreview ? ' active' : ''}" data-world-music="${w.id}">${isPreview ? '❌' : '🎵'}</button>` : '';
    return `<div class="wiki-card${visited ? ' wiki-card-seen' : ''}${unknownCls}">
      <div class="wiki-card-icon"${tooltip}>${w.emoji}</div>
      <div class="wiki-card-body">
        <div class="wiki-card-title">${title} ${visitedBadge}</div>
        <div class="wiki-card-sub">${sub}</div>
      </div>
      ${musicBtn}
    </div>`;
  }).join('');

  // ── Consumable items wiki rows ────────────────────────────────────
  const itemRows = POWERUP_KEYS.map(emoji => {
    const def = POWERUP_DEFS[emoji];
    if (!def) return '';
    const known = dictProgDisabled || learnedItems.includes(emoji);
    const base  = CON_BASES[emoji] || 300;
    const pr    = priceRange(base);
    const unknownCls = known ? '' : ' wiki-card-unknown';
    return `<div class="wiki-card${unknownCls}">
      <div class="wiki-card-icon">${emoji}</div>
      <div class="wiki-card-body">
        <div class="wiki-card-title">${known ? i18n('items.'+def.id+'.name') : '???????'}</div>
        <div class="wiki-card-sub">${pr} · <span class="wiki-desc">${known ? i18n('items.'+def.id+'.desc') : '???????'}</span></div>
      </div>
    </div>`;
  }).join('');

  // ── Permanent buffs wiki rows ─────────────────────────────────────
  const permRows = PERMANENTS.map(p => {
    const known = dictProgDisabled || learnedItems.includes(p.id);
    const base  = MOD_BASES[p.id] || 800;
    const pr    = priceRange(base);
    const unknownCls = known ? '' : ' wiki-card-unknown';
    return `<div class="wiki-card${unknownCls}">
      <div class="wiki-card-icon">${p.emoji}</div>
      <div class="wiki-card-body">
        <div class="wiki-card-title">${known ? i18n('items.'+p.id+'.name') : '???????'}</div>
        <div class="wiki-card-sub">${pr} · <span class="wiki-desc">${known ? i18n('items.'+p.id+'.desc') : '???????'}</span></div>
      </div>
    </div>`;
  }).join('');

  // ── Dojang wiki rows (same as dojang book, read-only) ─────────────
  const dojangRows = DOJANG_BOOK_ORDER.map(j => {
    const count   = jp[j]?.count || 0;
    const strokes = (JAMO_STROKES[j] || []).length;
    const bar     = Math.min(100, Math.round(count / MAX_JAMO_COUNT * 100));
    const info    = JAMO_INFO[j];
    const hasDesc = dictProgDisabled || count >= 1;
    let descHtml  = '';
    if (hasDesc) {
      const baseText    = i18n(`jamo_desc.${j}.base`);
      const firstLine   = baseText.split('\n')[0];
      const jamoName    = (firstLine.match(/\*\*([^*]+)\*\*/) || [])[1] || (info?.name || '');
      const jamoSound   = (firstLine.match(/·\s*(.+)/) || [])[1]?.trim() || '';
      const bodyMd      = baseText.replace(/^[^\n]*\n*/, '');
      const showBatchim = (dictProgDisabled || count >= BATCHIM_UNLOCK_COUNT) && JAMO_HAS_BATCHIM.has(j);
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
        <div class="dj-book-bar-wrap"${G.dictProgressionDisabled ? ' style="visibility:hidden"' : ''}><div class="dj-book-bar" style="width:${bar}%"></div></div>
        <span class="dj-book-count"${G.dictProgressionDisabled ? ' style="visibility:hidden"' : ''}>${count}</span>
        <span class="dj-book-strokes">${strokes}획</span>
        ${hasDesc ? '<button class="dj-book-expand-btn">▼</button>' : '<span></span>'}
      </div>
      ${hasDesc ? `<div class="dj-book-desc off">${descHtml}</div>` : ''}
    </div>`;
  }).join('');

  // ── Hanja wiki rows ──────────────────────────────────────────────
  // World indices are zero-based, matching the existing Hanja power-up unlocks:
  // tier 2 at world 5, tier 3 at world 10, and tier 4 at world 15.
  const hanjaTiers = [HANJA_T1, HANJA_T2, HANJA_T3, HANJA_T4];
  const hanjaUnlocks = [0, 5, 10, 15];
  const maxHanjaTier = dictProgDisabled
    ? hanjaTiers.length
    : hanjaUnlocks.filter(level => (G.maxWorldReached || 0) >= level).length;
  const hanjaRows = `<div class="hanja-wiki">${hanjaTiers.slice(0, maxHanjaTier).map((tier, tierIdx) => `
    <div class="hanja-tier">
      <div class="hanja-tier-label">Tier ${tierIdx + 1}</div>
      <div class="hanja-mini-grid">
        ${tier.map(hanja => {
          const hangul = HANJA_TO_HANGUL[hanja] || '';
          const href = `https://koreanhanja.app/${encodeURIComponent(hanja)}`;
          return `<a class="hanja-mini-card" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${hanja} ${hangul}">
            <span class="hanja-mini-char">${hanja}</span><span class="hanja-mini-divider" aria-hidden="true"></span><span class="hanja-mini-reading">${hangul}</span>
          </a>`;
        }).join('')}
      </div>
    </div>`).join('')}</div>`;

  // ── Accordion ─────────────────────────────────────────────────────
  function accordion(id, labelKey, body) {
    return `<div class="wiki-section" id="wiki-sec-${id}">
      <button class="wiki-header" onclick="this.parentElement.classList.toggle('open')">
        <span>${i18n(labelKey)}</span><span class="wiki-chevron">▼</span>
      </button>
      <div class="wiki-body">${body}</div>
    </div>`;
  }

  const ringsHtml = G.dictProgressionDisabled
    ? `<p class="dict-prog-disabled-msg">${i18n('dict.statsProgDisabled')}</p>`
    : `<div class="dict-stats">
      <div class="dict-stats-group">
        ${ring(doneLessons/totalLessons,    '#27ae60', 'dict.statsLessons',  Math.round(doneLessons/totalLessons*100)+'%',   doneLessons+'/'+totalLessons)}
        ${ring(unlockedWords/totalWords,    '#3498db', 'dict.statsWords',    Math.round(unlockedWords/totalWords*100)+'%',   unlockedWords+'/'+totalWords)}
        ${ring(masteredCount/(unlockedWords||1),'#9b59b6','dict.statsMastered',Math.round(masteredCount/(unlockedWords||1)*100)+'%',masteredCount+'/'+(unlockedWords||0))}
      </div>
      <div class="dict-stats-group">
        ${ring(jp_tot/dojangMax,               '#e67e22', 'dict.statsDojang',  Math.round(jp_tot/dojangMax*100)+'%', jp_tot.toLocaleString())}
        ${ring(itemsAcq/totalAllItems,         '#e74c3c', 'dict.statsItems',   Math.round(itemsAcq/totalAllItems*100)+'%', itemsAcq+'/'+totalAllItems)}
        ${ring(seenWorlds.length/totalWorlds,  '#1abc9c', 'dict.statsWorlds',  Math.round(seenWorlds.length/totalWorlds*100)+'%', seenWorlds.length+'/'+totalWorlds)}
      </div>
    </div>`;

  return `${ringsHtml}
    <div class="wiki-accordion">
      ${accordion('dojang','dict.wikiDojang', `<div class="dj-book-body-inner">${dojangRows}</div>`)}
      ${accordion('hanja','dict.wikiHanja', hanjaRows)}
      ${accordion('worlds','dict.wikiWorlds', worldRows)}
      ${accordion('items', 'dict.wikiItems',  itemRows)}
      ${accordion('perms', 'dict.wikiPerms',  permRows)}
    </div>`;
}

function _wireStatsInteractions(root) {
  // Wire dojang expand buttons inside the wiki accordion
  root.querySelectorAll('.dj-book-row.has-desc .dj-book-row-main').forEach(row => {
    row.addEventListener('click', () => {
      const parent = row.closest('.dj-book-row');
      parent.classList.toggle('expanded');
      const desc = parent.querySelector('.dj-book-desc');
      if (desc) desc.classList.toggle('off');
      const btn = parent.querySelector('.dj-book-expand-btn');
      if (btn) btn.textContent = parent.classList.contains('expanded') ? '▲' : '▼';
    });
  });
}

function _updateMyDictHeader() {
  const prefixEl = document.getElementById('my-dict-cat-prefix');
  if (!prefixEl) return;
  const activeTab = document.querySelector('#title-dict-tabs .dict-tab.active .tab-full');
  const tabText = activeTab?.textContent?.trim() || '';
  prefixEl.textContent = tabText ? `📒 ${tabText} — ` : '📒 ';
}

function _renderLessonsContent() {
  const completed = G.dictProgressionDisabled ? LESSONS_BASE.map(l => l.id) : (G.completedLessons || []);
  const lessons = LESSONS_BASE.filter(l => completed.includes(l.id));

  if (!lessons.length) {
    return `<div style="padding:24px 12px;text-align:center;color:rgb(0 0 0 / 40%);font-size:.85rem;">${i18n('dict.lessonsEmpty')}</div>`;
  }

  return lessons.map(lesson => {
    const contentKey = lesson.title_key.replace('.title', '') + '.content';
    const content = parseLessonMarkdown(i18n(contentKey));
    return `<div class="wiki-section">
      <button class="wiki-header" onclick="this.parentElement.classList.toggle('open')">
        <span>${lesson.emoji} ${i18n(lesson.title_key)}</span><span class="wiki-chevron">▼</span>
      </button>
      <div class="wiki-body"><div class="lesson-viewer-inner">${content}</div></div>
    </div>`;
  }).join('');
}

function buildTitleDict(filter) {
  const container = document.getElementById('dict-list');
  const searchWrap = document.getElementById('title-dict-search-wrap');
  if (!container) return;

  // Hide dict-panel-sub if dict progression is disabled
  const subEl = document.querySelector('.dict-panel-sub');
  if (subEl) subEl.style.display = G.dictProgressionDisabled ? 'none' : '';
  _syncDictTitles();
  _updateMyDictHeader();

  // ── Lessons tab: all completed lessons as wiki-header accordion ──
  if (_titleDictCat === 'lessons') {
    if (searchWrap) searchWrap.style.display = 'none';
    container.innerHTML = _renderLessonsContent();
    return;
  }

  if (_titleDictCat === 'stats') {
    if (searchWrap) searchWrap.style.display = 'none';
    container.innerHTML = _renderStatsContent(true);
    _wireStatsInteractions(container);
    return;
  }

  if (_titleDictCat === 'grammar') {
    if (searchWrap) searchWrap.style.display = 'none';
    container.innerHTML = GRAMMAR_HTML;
    return;
  }

  if (searchWrap) searchWrap.style.display = '';
  const _dictSearchEl = document.getElementById('dict-search');
  if (_dictSearchEl) {
    const _searchKeys = { noun: 'dict.searchNoun', verb: 'dict.searchVerb', adjective: 'dict.searchAdj', adverb: 'dict.searchAdverb' };
    _dictSearchEl.placeholder = i18n(_searchKeys[_titleDictCat] || 'dict.searchPlaceholder');
  }

  // Show placeholder if fewer than 3 learned words
  const learned = G.learnedWords || [];
  if (!G.dictProgressionDisabled && learned.length < 3) {
    container.innerHTML = `<div style="padding:24px 12px;text-align:center;color:rgb(0 0 0 / 40%);font-size:.85rem;">${i18n('dict.myDictEmpty')}</div>`;
    return;
  }

  // Resolve learned words to WORD_DICT entries
  let words = G.dictProgressionDisabled
    ? WORD_DICT.slice()
    : learned.map(lw =>
        WORD_DICT.find(d => d.text === lw.text && d.emoji === lw.emoji) ||
        WORD_DICT.find(d => d.text === lw.text) ||
        lw
      );

  if (_titleDictCat && _titleDictCat !== 'all') {
    if (_titleDictCat === 'noun') {
      words = words.filter(w => w.category !== 'verb' && w.category !== 'adjective' && w.category !== 'adverb');
    } else {
      words = words.filter(w => w.category === _titleDictCat);
    }
  }

  if (words.length === 0) {
    container.innerHTML = `<div style="padding:24px 12px;text-align:center;color:rgb(0 0 0 / 40%);font-size:.85rem;">${i18n('dict.tabEmpty')}</div>`;
    return;
  }

  const q = (filter || '').toLowerCase().trim();
  const showAll = q === '*';
  if (q && q !== '*') {
    words = words.filter(w =>
      w.text.includes(q) ||
      wordTr(w.text).toLowerCase().includes(q)
    );
  }

  // Limit to 50 entries if not showing all and not searching
  let truncated = false;
  if (!showAll && words.length > 50) {
    words = words.slice(0, 50);
    truncated = true;
  }

  container.innerHTML = words.map(w => renderDictEntry(w)).join('') + (truncated ? `<div style="padding:24px 12px;text-align:center;color:rgb(0 0 0 / 40%);font-size:.85rem;">${i18n('dict.listTooLarge')}</div>` : '');
}

/* ================================================================
   IN-RUN SHOP / TREASURE close helpers
================================================================ */
window.closeRunShop = function() { screenOff('scr-shop'); if (!G.touchMode && G.phase === 'run') typingEl?.focus(); };
window.closeTreasure = function() { screenOff('scr-treasure'); if (!G.touchMode && G.phase === 'run') typingEl?.focus(); };
window.closeTeacherScreen = function() {
  screenOff('scr-teacher');
  const pi = document.getElementById('player-inner');
  if (pi) pi.style.visibility = '';
  const pa = document.getElementById('player-area');
  if (pa) { pa.style.zIndex = ''; pa.style.padding = ''; }
  document.body.classList.remove('teacher-test-active');
  window._feedKeyToTestInput = null;
  window._backspaceTestInput = null;
  window._commitAndGetTestInput = null;
  window._getTestInputValue = null;
  if (!G.touchMode && G.phase === 'run') typingEl?.focus();
};
window.invUseClick   = function() { invUse(); refreshInventoryUI(); };

/* ================================================================
   CTRL QUICK-ACTION PANEL
================================================================ */
function openCtrlPanel() {
  sfx('backpackOpen', 0.8);
  G.ctrlPanelOpen = true;
  _ctrlState = 'open';
  _panelFadeAlpha = 1;
  // Show ctrl panel (opacity starts at 0, RAF fades it in)
  const panel = document.getElementById('ctrl-panel');
  if (!panel) return;
  panel.style.opacity = '0';
  panel.classList.remove('off');
  // Update wallet display
  const wv = document.getElementById('ctrl-wallet-val');
  if (wv) wv.textContent = formatKoreanNumber(G.run?.wallet ?? 0);
  refreshCtrlInv();
  _applyCtrlZoom();
}

function closeCtrlPanel() {
  G.ctrlPanelOpen = false;
  _panelFadeAlpha = 0;
  document.getElementById('ctrl-panel')?.classList.add('off');
  _ctrlState = 'idle';
  _ctrlHoldTimer = 0;
}

function refreshCtrlInv() {
  const inv    = G.inventory;
  const stacks = inv?.stacks || [];
  const sel    = inv?.sel ?? 0;
  const cur    = stacks[sel];
  const emEl   = document.getElementById('ctrl-inv-emoji');
  const nmEl   = document.getElementById('ctrl-inv-name');
  const dcEl   = document.getElementById('ctrl-inv-desc');
  const cnEl   = document.getElementById('ctrl-inv-count');
  const prevBtn = document.getElementById('ctrl-prev');
  const nextBtn = document.getElementById('ctrl-next');
  const useBtn  = document.getElementById('ctrl-use-btn');

  const dotsEl = document.getElementById('ctrl-inv-dots');
  if (!cur) {
    if (emEl)  { emEl.textContent = '🎒'; emEl.style.opacity = '0.18'; }
    if (nmEl)  nmEl.textContent = i18n('inventory.emptyBackpack');
    if (dcEl)  dcEl.textContent = '';
    if (cnEl)  cnEl.textContent = '';
    if (dotsEl) dotsEl.innerHTML = '';
    if (prevBtn) prevBtn.style.visibility = 'hidden';
    if (nextBtn) nextBtn.style.visibility = 'hidden';
    if (useBtn)  { useBtn.disabled = true; useBtn.textContent = '↓'; }
  } else {
    if (emEl)  { emEl.textContent = cur.item; emEl.style.opacity = '1'; }
    const def = POWERUP_DEFS[cur.item];
    if (nmEl)  nmEl.textContent = (def?.id ? i18n('items.' + def.id + '.name') : null) || cur.item;
    if (dcEl)  dcEl.textContent = def?.id ? i18n('items.' + def.id + '.desc') : '';
    if (cnEl)  cnEl.textContent = (cur.count ?? 1) > 1 ? `×${cur.count}` : '';
    if (dotsEl) {
      dotsEl.innerHTML = stacks.length > 1
        ? stacks.map((_, i) => `<span class="ctrl-dot${i === sel ? ' active' : ''}"></span>`).join('')
        : '';
    }
    if (prevBtn) prevBtn.style.visibility = stacks.length > 1 ? 'visible' : 'hidden';
    if (nextBtn) nextBtn.style.visibility = stacks.length > 1 ? 'visible' : 'hidden';
    const cooldowns  = G.run?.itemCooldowns || {};
    const lockActive = (G.run?._itemUseLock || 0) > 0;
    const cd = cooldowns[cur.item] || 0;
    const onCD = cd > 0;
    if (useBtn) {
      useBtn.disabled = lockActive || onCD;
      useBtn.textContent = onCD ? Math.ceil(cd) + '초' : '↓';
    }
  }
}

function ctrlInvNav(dir) {
  invNavigate(dir);
  refreshCtrlInv();
}

function ctrlPanelAction(action) {
  closeCtrlPanel();
  _ctrlState = 'used'; // Must release ctrl before re-opening
  if (action === 'use') {
    invUse(); refreshInventoryUI();
  } else if (action === 'map') {
    window.toggleMap(true);
  } else if (action === 'book') {
    window.toggleBook(true);
  }
}

window.ctrlPanelAction  = ctrlPanelAction;
window.ctrlInvNav       = ctrlInvNav;
window.closeCtrlPanel   = closeCtrlPanel;
window.openCtrlPanel    = openCtrlPanel;
window.ctrlPauseAction  = function() { closeCtrlPanel(); pauseGame(); };

/* ================================================================
   START / RESTART
================================================================ */
const DIFFICULTY = {
  baby:     { lives: 50, coinMult: 0.3 },
  easy:     { lives: 20, coinMult: 0.6 },
  normal:   { lives: 10, coinMult: 1.0 },
  hard:     { lives: 5,  coinMult: 1.0 },
  hardcore: { lives: 1,  coinMult: 1.0 },
};

/* ================================================================
   HANGUL DOJANG - entry modal + phase management
================================================================ */
function _showDojangEntryModal() {
  const modal = document.getElementById('dojang-entry-modal');
  if (!modal) return;
  modal.classList.remove('off');
  if (!G.avatar) G.avatar = JSON.parse(localStorage.getItem('krr_avatar') || 'null') || AVA_DEFAULTS;
  // Reset path selection state on each open
  document.querySelectorAll('.dej-path-btn').forEach(btn => btn.classList.remove('active'));
  const detail = document.getElementById('dej-detail');
  if (detail) detail.classList.add('off');
  // Close on outside click (delegated, runs once per open)
  const onOutside = (e) => {
    if (!e.target.closest('#dojang-entry-inner')) {
      _hideDojangEntryModal();
      modal.removeEventListener('click', onOutside);
    }
  };
  setTimeout(() => modal.addEventListener('click', onOutside), 0);
}

function _hideDojangEntryModal() {
  const modal = document.getElementById('dojang-entry-modal');
  if (modal) modal.classList.add('off');
}

function _dojangEntrySelectPath(path) {
  if (!G.multiplayerBeta) {
    // Keep the default onboarding to two clicks: Play → learning level.
    const soloAction = { '0': 'dojang', '1': 'solo-normal', '2': 'solo-expert' }[path];
    if (soloAction) _dojangEntryAction(soloAction);
    return;
  }

  const detail = document.getElementById('dej-detail');
  const titleEl = document.getElementById('dej-detail-title');
  const cardsEl = document.getElementById('dej-cards');
  if (!detail || !titleEl || !cardsEl) return;

  document.querySelectorAll('.dej-path-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.path === path);
  });

  const desc = [
    i18n('dojang.entry.desc0'),
    i18n('dojang.entry.desc1'),
    i18n('dojang.entry.desc2'),
  ];
  const descCoop  = i18n('dojang.entry.descCoop');
  const btnDojang = i18n('dojang.entry.btnDojang');
  const btnSolo   = i18n('dojang.entry.btnSolo');
  const btnCoop   = i18n('dojang.entry.btnCoop');

  const _soloCard = (action, d, emoji, label) => `
    <button class="dej-card" data-action="${action}">
      <div class="dej-card-desc">${d}</div>
      <div class="dej-card-bottom">
        <div class="dej-card-portrait"></div>
        <div class="dej-card-cta">
          <span class="dej-cta-emoji">${emoji}</span>
          <span class="dej-cta-label">${label}</span>
        </div>
      </div>
    </button>`;
  const _coopCard = (action, d, label) => `
    <button class="dej-card dej-card-coop" data-action="${action}">
      <span class="dej-beta">BETA</span>
      <div class="dej-card-desc">${d}</div>
      <div class="dej-card-bottom">
        <div class="dej-card-portrait dej-card-portrait-coop">🧑‍🤝‍🧑</div>
        <div class="dej-card-cta">
          <span class="dej-cta-emoji">⚔️</span>
          <span class="dej-cta-label">${label}</span>
        </div>
      </div>
    </button>`;

  if (path === '0') {
    titleEl.textContent = i18n('dojang.entry.diffNone');
    cardsEl.innerHTML = _soloCard('dojang', desc[0], '🥋', btnDojang);
  } else if (path === '1') {
    titleEl.textContent = i18n('dojang.entry.diffMedium');
    cardsEl.innerHTML = _soloCard('solo-normal', desc[1], '⚔️', btnSolo) + _coopCard('coop', descCoop, btnCoop);
  } else {
    titleEl.textContent = i18n('dojang.entry.diffHard');
    cardsEl.innerHTML = _soloCard('solo-expert', desc[2], '⚔️', btnSolo) + _coopCard('coop-expert', descCoop, btnCoop);
  }

  cardsEl.querySelectorAll('.dej-card-portrait:not(.dej-card-portrait-coop)').forEach(el => setPlayerContent(el));

  detail.dataset.path = path;
  detail.classList.remove('off');
}

function _dojangEntryAction(action) {
  const selDiff = document.getElementById('sel-difficulty');
  if (action === 'dojang') {
    _enterDojang();
  } else if (action === 'solo-normal') {
    _hideDojangEntryModal();
    playMusic('boss', 0);
    runLoreAnimation(() => triggerMenuPlayTransition());
  } else if (action === 'solo-expert') {
    G.skipIntroWorld = true;
    _hideDojangEntryModal();
    playMusic('boss', 0);
    runLoreAnimation(() => triggerMenuPlayTransition());
  } else if (action === 'coop') {
    _hideDojangEntryModal();
    _showMultiplayerModal();
  } else if (action === 'coop-expert') {
    G.skipIntroWorld = true;
    _hideDojangEntryModal();
    _showMultiplayerModal();
  }
}

function _enterDojang() {
  _hideDojangEntryModal();
  // Set up avatar in dojang before start() references it
  if (!G.avatar) G.avatar = JSON.parse(localStorage.getItem('krr_avatar') || 'null') || AVA_DEFAULTS;
  setPlayerContent(document.getElementById('pl-emoji'));

  G.phase = 'dojang';
  document.body.classList.remove('phase-title');
  document.body.classList.add('phase-dojang');
  stopMusic();

  // Show dojang screen, hide title
  screenOff('scr-title');
  screenOn('scr-dojang');

  // Show stroke canvas
  const dojangCanvas = document.getElementById('dojang-canvas');
  if (dojangCanvas) dojangCanvas.style.display = 'block';

  // Init manager if not done yet
  if (!dojangManager.strokeCanvas) {
    dojangManager.init(dojangCanvas);
    dojangManager.onExitToMenu = _dojangExitToMenu;

    // Wire up in-dojang UI buttons (once only)
    document.getElementById('dojang-pause-btn')?.addEventListener('click', () => dojangManager.togglePause());
    document.getElementById('dojang-book-btn')?.addEventListener('click', () => dojangManager.openBook());
    document.getElementById('dojang-book-close')?.addEventListener('click', () => dojangManager.closeBook());
    document.getElementById('dojang-inspector-btn')?.addEventListener('click', () => dojangManager.openInspector());
    document.getElementById('dojang-inspector-close')?.addEventListener('click', () => dojangManager.closeInspector());
    document.getElementById('dojang-btn-speak')?.addEventListener('click', () => dojangManager.speakCurrent());
    document.getElementById('dojang-btn-restart')?.addEventListener('click', () => dojangManager.restartChallenge());
    document.getElementById('dojang-btn-resume')?.addEventListener('click', () => dojangManager.togglePause());
    document.getElementById('dojang-btn-menu')?.addEventListener('click', _dojangExitToMenu);
  }

  // Hide weather canvases and roguelite player-area while in dojang
  wxCanvas.style.visibility = 'hidden';
  const dnCanvasEl = document.getElementById('dn-canvas');
  if (dnCanvasEl) dnCanvasEl.style.visibility = 'hidden';
  if (paEl) paEl.style.display = 'none';

  // Resize stroke canvas to current viewport
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(window.innerWidth), h = Math.floor(G.vH || window.innerHeight);
  dojangCanvas.width  = Math.floor(w * dpr);
  dojangCanvas.height = Math.floor(h * dpr);
  dojangCanvas.style.width  = w + 'px';
  dojangCanvas.style.height = h + 'px';
  const ctx2d = dojangCanvas.getContext('2d');
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

  dojangManager.start(G.dojangStats);
}

function _dojangExitToMenu() {
  clearCombatTransientVisuals();
  closeCheatMenu();
  dojangManager.exit();
  G.dojangStats = loadDojangStats();
  G.phase = 'title';
  document.body.classList.remove('phase-dojang');
  document.body.classList.add('phase-title');
  // Restore weather canvases and player-area
  wxCanvas.style.visibility = '';
  const dnCanvasEl2 = document.getElementById('dn-canvas');
  if (dnCanvasEl2) dnCanvasEl2.style.visibility = '';
  if (paEl) paEl.style.display = '';
  screenOff('scr-dojang');
  const dojangCanvas = document.getElementById('dojang-canvas');
  if (dojangCanvas) dojangCanvas.style.display = 'none';
  screenOn('scr-title');
  playMusic('menu', 0);
}

function _dojangStartAdventure() {
  dojangManager.exit();
  G.dojangStats = loadDojangStats();
  G.phase = 'title';
  document.body.classList.remove('phase-dojang');
  // Restore weather canvases (player-area is managed by startNewRun)
  wxCanvas.style.visibility = '';
  const dnCanvasEl3 = document.getElementById('dn-canvas');
  if (dnCanvasEl3) dnCanvasEl3.style.visibility = '';
  if (paEl) paEl.style.display = '';
  screenOff('scr-dojang');
  const dojangCanvas = document.getElementById('dojang-canvas');
  if (dojangCanvas) dojangCanvas.style.display = 'none';
  playMusic('boss', 0);
  runLoreAnimation(() => triggerMenuPlayTransition());
}

const TUTORIAL_POPUP_FINAL_RUN = 5;

function _beginTutorialRun() {
  const savedCount = Number.parseInt(localStorage.getItem('krr_adventureRunCount') || '0', 10);
  const runNumber = (Number.isFinite(savedCount) ? savedCount : 0) + 1;
  localStorage.setItem('krr_adventureRunCount', String(runNumber));
  if (G.run?.tutorial) {
    G.run.tutorial.runNumber = runNumber;
    G.run.tutorial.suppressed = runNumber >= TUTORIAL_POPUP_FINAL_RUN;
  }
}

function startNewRun() {
  resetRunState();
  _resetCheatRunState();
  _beginTutorialRun();
  const selectedDifficulty = document.getElementById('sel-difficulty')?.value || G.difficulty || localStorage.getItem('krr_difficulty') || 'normal';
  const diff = DIFFICULTY[selectedDifficulty] || DIFFICULTY.normal;
  G.playerMax = diff.lives;
  G.playerHP  = diff.lives;
  G.run.coinMult = diff.coinMult;
  G.run.expertMode = !!G.skipIntroWorld;
  G.hangulSize = window.innerWidth < 768 ? 34 : window.innerWidth >= 1600 ? 48 : 38;
  G.varyFonts = document.getElementById('chk-fonts')?.checked ?? true;
  G.weatherEnabled = parseFloat(document.getElementById('sel-weather')?.value ?? '1');
  G.treeDetails = parseInt(document.getElementById('sel-details')?.value ?? String(G.treeDetails ?? 2), 10);
  G.ttsEnabled = document.getElementById('chk-tts')?.checked ?? true;
  G.clickableDoors = document.getElementById('chk-clickable-doors')?.checked ?? false;
  G.touchMode = G.touchMode || (document.getElementById('chk-touch')?.checked ?? false);
  // Avatar is already set in G.avatar from buildTitleScreen; ensure fallback
  if (!G.avatar) G.avatar = JSON.parse(localStorage.getItem('krr_avatar') || 'null') || AVA_DEFAULTS;

  screenOff('scr-title'); screenOff('scr-over'); screenOff('scr-pause');
  screenOff('scr-modifier'); screenOff('scr-shop'); screenOff('scr-treasure');

  if (hudEl) hudEl.style.display = 'flex';
  if (paEl) {
    // Keep hidden during play-button transition; onComplete will show it
    if (G.worldTransition) {
      paEl.style.display = 'none';
    } else {
      paEl.style.display = 'flex';
      paEl.style.opacity = '1';
    }
  }

  setPlayerContent(document.getElementById('pl-emoji'));

  G.phase = 'run';
  _syncCheatRunShortcut();
  document.body.classList.remove('phase-title');
  startRun();
  // Update transition emoji to the actual first world's transport (known only after startRun)
  if (G.worldTransition && G.dungeon?.worldDef?.transport) {
    G.worldTransition.emoji = G.dungeon.worldDef.transport;
  }
  // If this was triggered from the Play button (transition in progress),
  // keep paEl hidden and delay world music until animation completes
  if (G.worldTransition) {
    if (paEl) { paEl.style.transition = ''; paEl.style.opacity = '0'; }
    const prevOnComplete = G.worldTransition.onComplete;
    G.worldTransition.onComplete = () => {
      if (paEl) { paEl.style.display = 'flex'; paEl.style.opacity = '1'; }
      playMusic(G.dungeon?.worldDef?.id || 'palace', 0);
      _focusTypingInput();
      _applyTouchZoom();
      setTimeout(_applyTouchZoom, 80);
      setTimeout(_applyTouchZoom, 250);
      if (prevOnComplete) prevOnComplete();
    };
  } else {
    playMusic(G.dungeon?.worldDef?.id || 'palace', 0);
  }
  initWeather(G.weather); // Initialize particles for the starting weather
  syncClockToGame();

  refreshLives();
  refreshInventoryUI();
  updateHudAll();
  setCoinsCollectedCallback(_onCoinsCollected);
  applyTouchMode();
  _applyTouchZoom();
  setTimeout(_applyTouchZoom, 80);
  setTimeout(_applyTouchZoom, 250);
  if (typingEl) typingEl.value = '';
  _resetWordTypingTimer();
  _imeCommitted = ''; _imeComposer.reset();
  _focusTypingInput();
  // Sync dungeon blueprint to guest if in multiplayer session
  if (window._mpOnRunStart) window._mpOnRunStart();
}

/* ================================================================
   PAUSE
================================================================ */
function renderDictEntry(w) {
  // Match by both text and emoji to handle homonyms (e.g. 이 = tooth vs. 이 = 2)
  const fullEntry = WORD_DICT.find(d => d.text === w.text && d.emoji === w.emoji)
    || WORD_DICT.find(d => d.text === w.text) || w;
  const translation = wordTr(fullEntry.text, fullEntry.emoji);
  const naverUrl = `https://korean.dict.naver.com/koendict/#/search?query=${encodeURIComponent(w.text)}`;
  const altsHtml = fullEntry?.alts?.length
    ? `<span class="dict-alts">${fullEntry.alts.join(' / ')}</span>`
    : '';
  const hanjaHtml = fullEntry?.hanja
    ? `<span class="dict-hanja" title="Hanja">${fullEntry.hanja}</span>`
    : '';

  const isVerbAdj = fullEntry?.category === 'verb' || fullEntry?.category === 'adjective';
  let killHtml = '';
  let untouched = false;

  if (isVerbAdj) {
    // Verb/adjective: per-formality × tense breakdown
    const conjs = G.wordConjugationCounts?.[w.text] || {};
    const FORMALITIES = { haeyoche: '해요체', banmal: '반말', hasipsioche: '하십시오체' };
    const TENSES      = { present: i18n('dict.tensePresent'), past: i18n('dict.tensePast'), future: i18n('dict.tenseFuture') };
    const totalKills = Object.values(conjs).reduce((s, n) => s + n, 0);
    if (totalKills === 0) {
      untouched = true;
    } else {
      // Build tooltip: group by formality, list non-zero tenses
      const lines = [];
      for (const [fKey, fLabel] of Object.entries(FORMALITIES)) {
        const parts = [];
        for (const [tKey, tLabel] of Object.entries(TENSES)) {
          const cnt = conjs[`${tKey}-${fKey}`] || 0;
          if (cnt > 0) parts.push(`${tLabel} ×${cnt}`);
        }
        if (parts.length) lines.push(`${fLabel}: ${parts.join(', ')}`);
      }
      const tooltipText = lines.join('\n');
      killHtml = tooltipText;
    }
  } else {
    // Noun: single kill count
    const kills = G.wordKillCounts?.[w.text] || 0;
    if (kills === 0) {
      untouched = true;
    } else {
      killHtml = `×${kills} ${i18n('dict.killed')}`;
    }
  }

  const tooltipAttr = killHtml ? ` data-tooltip="${killHtml.replace(/"/g, '&quot;')}"` : '';
  const secondaryEmojiHtml = fullEntry?.secondaryEmoji
    ? `<div style="position: relative; display: flex; align-items: flex-start;">
         <span class="dict-emoji">${w.emoji || fullEntry.emoji || ''}</span>
         <span class="dict-secondary-emoji">${fullEntry.secondaryEmoji}</span>
       </div>`
    : `<span class="dict-emoji">${w.emoji || fullEntry.emoji || ''}</span>`;
  return `<div class="dict-entry${untouched ? ' dict-untouched' : ''}"${tooltipAttr}>
    <div class="dict-entry-main">
      ${secondaryEmojiHtml}
      <span class="dict-text">${w.text}</span>
      ${altsHtml}
      ${hanjaHtml}
      <span class="dict-en">${translation}</span>
      <a class="dict-link" href="${naverUrl}" target="_blank">🔗</a>
    </div>
  </div>`;
}

const GRAMMAR_HTML = `
<div class="guide-section">
  <div class="guide-title">Tense</div>
  <div class="guide-row"><span class="guide-icon">▶</span> <b>Present</b> - 아요/어요 <span class="guide-ex">가요 "goes"</span></div>
  <div class="guide-row"><span class="guide-icon">⏪</span> <b>Past</b> - 았어요/었어요 <span class="guide-ex">갔어요 "went"</span></div>
  <div class="guide-row"><span class="guide-icon">⏩</span> <b>Future</b> - ㄹ 거예요 <span class="guide-ex">갈 거예요 "will go"</span></div>
</div>
<div class="guide-section">
  <div class="guide-title">Particles</div>
  <div class="guide-row"><span class="guide-tag">은/는</span> Topic marker <span class="guide-ex">저<b>는</b> "as for me"</span></div>
  <div class="guide-row"><span class="guide-tag">이/가</span> Subject marker <span class="guide-ex">고양이<b>가</b> "the cat (does)"</span></div>
  <div class="guide-row"><span class="guide-tag">을/를</span> Object marker <span class="guide-ex">밥<b>을</b> 먹어요 "eats rice"</span></div>
  <div class="guide-row"><span class="guide-tag">에</span> Location/Time <span class="guide-ex">집<b>에</b> 있어요 "is at home"</span></div>
  <div class="guide-row"><span class="guide-tag">에서</span> Action location <span class="guide-ex">학교<b>에서</b> 공부해요 "studies at school"</span></div>
  <div class="guide-row"><span class="guide-tag">와/과</span> And (noun+noun) <span class="guide-ex">사과<b>와</b> 배 "apple and pear"</span></div>
  <div class="guide-row"><span class="guide-tag">도</span> Also/Too <span class="guide-ex">저<b>도</b> 가요 "I also go"</span></div>
  <div class="guide-row"><span class="guide-tag">의</span> Possessive <span class="guide-ex">친구<b>의</b> 책 "friend's book"</span></div>
</div>
<div class="guide-section">
  <div class="guide-title">Politeness</div>
  <div class="guide-row">Verbs here use <b>-아요/어요</b> form (polite/informal). Informal drop the 요.</div>
</div>`;


window.pauseGame = function() {
  if (G.phase === 'lore') {
    G.phase = 'lore_paused';
    const ps = document.getElementById('scr-pause');
    if (ps) ps.style.zIndex = '6500'; // above lore overlay (5000)
    screenOn('scr-pause');
    return;
  }
  if (G.phase !== 'run') return;
  if (G.ctrlPanelOpen) closeCtrlPanel();
  // In co-op: show pause UI but keep game loop running (game must not freeze)
  if (G.mp?.active) {
    screenOn('scr-pause');
    _renderPauseStats();
    _syncPauseToggles();
    return;
  }
  G.phase = 'paused';
  screenOn('scr-pause');
  _renderPauseStats();
  _syncPauseToggles();
};

function _renderPauseStats() {
  const statsEl = document.getElementById('pause-run-stats');
  if (!statsEl || !G.run) return;
  statsEl.style.display = 'grid';
  const r = G.run;
  const inv = G.inventory?.stacks || [];
  const consumables = inv.reduce((sum, s) => sum + (s.count || 1), 0);
  statsEl.innerHTML = [
    [r.monstersKilled ?? 0, i18n('pause.stat.monsters')],
    [r.roomsCleared ?? 0, i18n('pause.stat.rooms')],
    [r.damageTaken ?? 0, i18n('pause.stat.damage')],
    [r.wallet ?? 0, i18n('pause.stat.wallet')],
    [(r.permanents?.length ?? 0) + consumables, i18n('pause.stat.items')],
    [r.coinsSpent ?? 0, i18n('pause.stat.spent')],
  ].map(([val, lbl]) => `<div class="pstat"><div class="pstat-val">${val}</div><div class="pstat-lbl">${lbl}</div></div>`).join('');
}

function _syncPauseToggles() {
  const pw = document.getElementById('pause-sel-weather');
  const pt = document.getElementById('pause-chk-tts');
  const ptr = document.getElementById('pause-chk-translation');
  const ph = document.getElementById('pause-chk-hanja-monsters');
  _applyHudUiSize();
  if (pw) pw.value = String(G.weatherEnabled ?? 1);
  if (pt) {
    pt.checked = G.ttsEnabled;
    const ttsUnsupported = !!document.getElementById('chk-tts')?.disabled;
    pt.disabled = ttsUnsupported;
    pt.closest('.pause-opt-row')?.classList.toggle('tts-unsupported', ttsUnsupported);
  }
  if (ptr) ptr.checked = G.translationEnabled ?? true;
  if (ph) ph.checked = G.showHanjaOnMonsters;
}

// Enter fullscreen + lock landscape (mobile only, called from ⛶ overlay button)
function _enterMobileFullscreen(cb) {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  try { screen.orientation?.lock('landscape').catch(() => {}); } catch (_) {}
  if (req) {
    req.call(el).catch(() => {}).finally(() => cb?.());
  } else {
    cb?.();
  }
}

function resumeGame() {
  if (G.phase === 'lore_paused') {
    G.phase = 'lore';
    const ps = document.getElementById('scr-pause');
    if (ps) ps.style.zIndex = ''; // restore
    screenOff('scr-pause');
    return;
  }
  // Co-op: close pause screen without touching ctrlPanelOpen (game was never paused)
  if (G.mp?.active && G.phase === 'run') {
    screenOff('scr-pause');
    _focusTypingInput();
    return;
  }
  if (G.phase !== 'paused') return;
  G.phase = 'run';
  screenOff('scr-pause');
  _focusTypingInput();
}

function goToMenu() {
  clearCombatTransientVisuals();
  if (_loreCancel) { _loreCancel(); }
  window._hideTutorial?.(true);
  // Disconnect multiplayer session cleanly
  if (G.mp?.active) {
    mpSend({ type: 'game_over', reason: 'host_left' });
    setTimeout(() => leaveMultiplayer(), 100);
    _hideMpDisconnectOverlay();
  }
  G.phase = 'title';
  // Clear inventory so stale items from last run don't bleed into next run's intro
  G.inventory = { stacks: [], sel: 0 };
  refreshInventoryUI();
  if (G.ctrlPanelOpen) closeCtrlPanel();
  // Reset IME to off (normal title screen state), then clean up DOM
  if (_imeEnabled) _imeToggle();
  // Always clear typing field so old characters don't bleed into the next run
  if (typingEl) typingEl.value = '';
  _resetWordTypingTimer();
  _imeCommitted = ''; _imeComposer.reset();
  // Remove touch-mode class for menu UI but keep G.touchMode preference intact
  if (G.touchMode) document.body.classList.remove('touch-mode');
  _cleanupTouchExtras();
  G.menuPreview = null; // pick a new random room each time
  if (G.run) G.run.wallet = 0;
  updateHudWallet();
  showTitleScreen();
}

/* ================================================================
   GAME OVER
================================================================ */
function showGameOver(victory) {
  window._hideTutorial?.(true);
  _syncCheatRunShortcut();
  screenOff('scr-modifier'); screenOff('scr-shop'); screenOff('scr-treasure');
  screenOn('scr-over');

  const score = (G.run?.roomsCleared ?? 0) * 100 + (G.run?.bossesKilled ?? 0) * 500 + (G.run?.wallet ?? 0);
  const victoryText = i18n('gameOver.victory');
  const defeatText = i18n('gameOver.defeat');
  document.getElementById('go-title').textContent = victory ? victoryText : defeatText;
  const bossCount = G.run?.bossesKilled ?? 0;
  const bossWord = bossCount === 1 ? i18n('gameOver.bossSingular') : i18n('gameOver.bossPlural');
  document.getElementById('go-detail').textContent =
    `${bossCount} ${bossWord} • ${G.run?.roomsCleared ?? 0} ${i18n('gameOver.rooms')} • ${score}원`;

  if (score > G.hiScore) {
    G.hiScore = score;
    localStorage.setItem('krr_hi', G.hiScore.toString());
    document.getElementById('go-hiscore').textContent = i18n('gameOver.newBest');
  } else {
    document.getElementById('go-hiscore').textContent = `${i18n('gameOver.bestLabel')} ${G.hiScore}원`;
  }
  // Save wallet then clear so the next run's lore screen starts at 0
  G.wallet += G.run?.wallet ?? 0;
  localStorage.setItem('krr_wallet', G.wallet.toString());
  if (G.run) G.run.wallet = 0;
  updateHudWallet();
}
window._onGameOver = showGameOver;

/* ================================================================
   HUD UPDATE
================================================================ */
function _applyDayNightEmoji() {
  const b = getDayBrightness();
  // Map brightness 0..1 to filter brightness 0.25..1 (never fully black)
  const fv = 0.25 + b * 0.75;
  const f = fv >= 0.99 ? '' : `brightness(${fv.toFixed(2)})`;
  const plEmoji = document.getElementById('pl-emoji');
  if (plEmoji) plEmoji.style.filter = f ? `drop-shadow(0 4px 8px rgba(0,0,0,.5)) ${f}` : 'drop-shadow(0 4px 8px rgba(0,0,0,.5))';
  const spellIco = document.getElementById('spell-ico');
  if (spellIco) spellIco.style.filter = f ? `drop-shadow(0 1px 3px rgba(0,0,0,.6)) ${f}` : 'drop-shadow(0 1px 3px rgba(0,0,0,.6))';
  _mpSyncP2Brightness();
}

let _chevronCoinsTimeout = null;

function _onCoinsCollected(amount) {
  if (!G.touchMode) return;
  const chevron = document.getElementById('pl-chevron');
  if (!chevron) return;
  if (_chevronCoinsTimeout) clearTimeout(_chevronCoinsTimeout);
  chevron.textContent = `+${amount}원`;
  chevron.classList.add('coins-flash');
  _chevronCoinsTimeout = setTimeout(() => {
    chevron.textContent = '⌃';
    chevron.classList.remove('coins-flash');
    _chevronCoinsTimeout = null;
  }, 2000);
}

function updateHudAll() {
  updateHudWallet();
  updateHudWorld();
  updatePermanentBar();
}

function updateHudWallet() {
  const el = document.getElementById('hs-val');
  const wallet = G.run?.wallet ?? 0;
  const pending = G.room?.roomPool || 0;
  if (el) el.textContent = `${formatKoreanNumber(wallet)}원`;
  const lbl = document.getElementById('hs-best-lbl');
  if (lbl) lbl.textContent = `${i18n('hud.pending')}: `;
  const pendingEl = document.getElementById('hs-best');
  if (pendingEl) pendingEl.textContent = pending > 0 ? formatKoreanNumber(pending) : '';
  const pendingRow = document.getElementById('hs-best-row');
  if (pendingRow) pendingRow.hidden = pending <= 0;
}

function updateHudWorld() {
  const world = G.dungeon?.worldDef;
  if (!world) return;
  const { col, row } = G.currentRoom || { col:0, row:0 };
  const colLetter = String.fromCharCode(65 + col);
  const worldDisplayName = i18n('worlds.' + world.id + '.name') || world.name;
  const worldNum = (G.run?.worldIdx ?? 0) + 1 - (G.run?.expertMode ? 1 : 0);
  const worldLabel = i18n('hud.worldLabel', { n: worldNum });
  const lblEl = document.getElementById('hud-world-lbl');
  if (lblEl) lblEl.textContent = `${worldLabel} - ${worldDisplayName}`;
  const bossEl = document.getElementById('hw-room');
  if (bossEl) bossEl.textContent = i18n('hud.roomLabel', { col: colLetter, row: row + 1 });
  const ringIcon = document.getElementById('ring-world-icon');
  if (ringIcon) ringIcon.textContent = world.emoji;
  const weatherIco = document.getElementById('weather-icon');
  if (weatherIco) weatherIco.textContent = world.emoji;
}

function updateHudRing() {
  const arc = document.getElementById('ring-arc');
  if (!arc) return;
  let pct = 0;
  const cell = currentCell();
  const isSpecial = cell && cell.type !== 'normal' && cell.type !== 'boss';
  const isCleared = cell?.cleared;

  if (isCleared || isSpecial) {
    // Cleared or special room: full ring
    pct = 100;
    arc.setAttribute('stroke', '#44cc77');
  } else if (G.phase === 'run' && G.mode === 'combat' && G.room) {
    // Active combat: show kill progress
    const total = (G.room.wTotal || 0);
    const killed = G.room.wKilled || 0;
    pct = total > 0 ? (killed / total) * 100 : 0;
    arc.setAttribute('stroke', '#4caf50');
  } else if (G.dungeon) {
    // Navigate: dungeon overall progress
    const total = G.dungeon.grid.length;
    const cleared = G.dungeon.grid.filter(c => c.cleared).length;
    pct = total > 0 ? (cleared / total) * 100 : 0;
    arc.setAttribute('stroke', '#667eea');
  }
  arc.setAttribute('stroke-dasharray', `${pct} ${100 - pct}`);
}

function updatePermanentBar() {
  hudUpdatePermanentBar();
}

/* ================================================================
   PLAYER DOOR ANIMATION
   Phases: fly-to-door → shrink+fade → black overlay → teleport →
           fade-in+grow from opposite door → walk-to-center
================================================================ */
const _ghost   = document.getElementById('pl-door-ghost');
const _overlay = document.getElementById('door-overlay');
const _ANIM_DIR_DELTA = { N: [0,-1], S: [0,1], E: [1,0], W: [-1,0] };

function navigateWithAnim(dir) {
  // Validate move BEFORE starting (avoid locking transition on bad dir)
  if (G.mode !== 'navigate' || G.phase !== 'run') return;
  if (G.inTransition) return;
  const cell = currentCell();
  if (!cell?.connections.has(dir)) return;

  const [dc, dr] = _ANIM_DIR_DELTA[dir];
  const nc = ((cell.col + dc) + COLS) % COLS;
  const nr = ((cell.row + dr) + ROWS) % ROWS;

  // Close any open special room screens
  ['scr-shop', 'scr-modifier', 'scr-treasure', 'scr-casino'].forEach(id =>
    document.getElementById(id)?.classList.add('off'));

  // Clear typing input to prevent cheating across rooms
  if (typingEl) typingEl.value = '';
  _resetWordTypingTimer();

  sfx('roomNavigate', 0.65);
  // Fall back to instant transition if ghost element missing
  if (!_ghost) { enterRoom(nc, nr, dir); _focusTypingInput(); return; }

  G.inTransition = true;

  const plEl = document.getElementById('pl-emoji');

  // Use real viewport bounds so ghost aligns with canvas/player positions
  const cvsBounds = canvas.getBoundingClientRect();
  const plBounds  = plEl?.getBoundingClientRect();

  // Player emoji centre in viewport coords
  const CENTER = plBounds
    ? { x: plBounds.left + plBounds.width  / 2, y: plBounds.top  + plBounds.height / 2 }
    : { x: cvsBounds.left + cvsBounds.width / 2, y: cvsBounds.bottom - 80 };

  // Convert canvas-space → viewport coords
  const toVP = (cx, cy) => ({ x: cvsBounds.left + cx, y: cvsBounds.top + cy });

  const wallH    = Math.floor(G.vH * 0.13);
  const wallSide = Math.floor(G.W  * 0.05);
  const wallBot  = Math.floor(G.vH * 0.07);

  const DOOR_POS = {
    N: toVP(G.W / 2,               wallH  * 0.55),
    S: toVP(G.W / 2,               G.vH - wallBot * 0.55),
    E: toVP(G.W - wallSide * 0.5,  G.vH * 0.5),  // match drawDoors ly: H*0.5
    W: toVP(wallSide * 0.5,        G.vH * 0.5),
  };
  const ENTRY_POS = {
    N: toVP(G.W / 2,               G.vH - wallBot * 0.55),
    S: toVP(G.W / 2,               wallH  * 0.55),
    E: toVP(wallSide * 0.5,        G.vH * 0.5),
    W: toVP(G.W - wallSide * 0.5,  G.vH * 0.5),
  };

  const target = DOOR_POS[dir];
  const entry  = ENTRY_POS[dir];

  // Hide real emoji; show ghost; hide bubbles during transition
  if (plEl) plEl.style.opacity = '0';
  _ghost.style.display = 'block'; // must be 'block' - '' inherits display:none from CSS
  { const bub = document.getElementById('effect-bubble'); if (bub) bub.style.opacity = '0'; }

  // Match ghost size to actual player emoji size (handles touch-mode resize)
  const plFontPx = plEl ? parseFloat(getComputedStyle(plEl).fontSize) : 64;
  const avatarSvg = _makeAvatarSvg(G.avatar);
  if (avatarSvg) {
    _ghost.innerHTML = avatarSvg;
    _ghost.style.fontSize = '';
    _ghost.style.width  = plFontPx + 'px';
    _ghost.style.height = plFontPx + 'px';
  } else {
    _ghost.innerHTML = '';
    _ghost.textContent = G.hero || '😊';
    _ghost.style.width  = '';
    _ghost.style.height = '';
    _ghost.style.fontSize = plFontPx + 'px';
  }
  const ghostSize = plFontPx / 2;
  function placeGhost(x, y, scale, opacity, animated, dur) {
    _ghost.style.transition = animated
      ? `left ${dur}ms ease, top ${dur}ms ease, transform ${dur}ms ease, opacity ${dur}ms ease`
      : 'none';
    _ghost.style.left      = (x - ghostSize) + 'px';
    _ghost.style.top       = (y - ghostSize) + 'px';
    _ghost.style.transform = `scale(${scale})`;
    _ghost.style.opacity   = String(opacity);
  }

  // ── Phase 1: ghost at player centre → walk to door (300ms, pos only) ──
  placeGhost(CENTER.x, CENTER.y, 1, 1, false);
  void _ghost.offsetWidth; // force reflow so transition applies
  placeGhost(target.x, target.y, 1, 1, true, 300); // only position changes

  // ── Phase 2: at 270ms start fading overlay to black (180ms → full at 450ms)
  setTimeout(() => {
    if (_overlay) { _overlay.style.transition = 'opacity 0.18s ease'; _overlay.style.opacity = '1'; }
  }, 270);

  // ── Phase 3: at 360ms (60ms pause at door) → shrink+fade in place (200ms) ─
  setTimeout(() => {
    placeGhost(target.x, target.y, 0.5, 0, true, 200); // pos unchanged, scale+opacity change
  }, 360);

  // ── Phase 4: at 450ms (full black) → enterRoom, teleport ghost to entry ──
  setTimeout(() => {
    placeGhost(entry.x, entry.y, 0.5, 0, false); // invisible+small, at entry door
    void _ghost.offsetWidth;

    enterRoom(nc, nr, dir); // direct call - skips G.transition canvas fade

    if (_overlay) { _overlay.style.transition = 'opacity 0.18s ease'; _overlay.style.opacity = '0'; }

    // ── Phase 5: at 510ms (60ms) → grow+fade in at entry (200ms) ─────
    setTimeout(() => {
      placeGhost(entry.x, entry.y, 1, 1, true, 200); // pos unchanged, scale+opacity change

      // ── Phase 6: at 790ms (80ms pause) → walk from entry to centre ─
      setTimeout(() => {
        placeGhost(CENTER.x, CENTER.y, 1, 1, true, 300); // only position changes

        // ── Phase 7: cross-fade ghost out / real emoji in (no blink) ──
        setTimeout(() => {
          // Fade real emoji in (it has 0.3s opacity transition in CSS)
          if (plEl) plEl.style.opacity = '1';
          // Fade ghost out simultaneously
          _ghost.style.transition = 'opacity 0.25s ease';
          _ghost.style.opacity = '0';
          // After cross-fade completes, hide ghost and unlock
          setTimeout(() => {
            _ghost.style.display = 'none';
            G.inTransition = false;
            refreshBubbleDisplay(); // re-show stun/autokill if still active
            _focusTypingInput();
          }, 260);
        }, 310);
      }, 280); // 200ms grow + 80ms pause
    }, 60);
  }, 450);
}

/* ================================================================
   MINIMAP
================================================================ */
function setMapPlaceholder(open) {
  if (!typingEl) return;
  typingEl.placeholder = open ? i18n('typing.mapPlaceholder') : i18n('typing.placeholder');
}
window._setMapPlaceholder = setMapPlaceholder;

let _mapOpenedWhileRunning = false;
let _dictCat = 'all';
let _bookOpenedWhileRunning = false;
window._mapCloseCleanup = function() {
  if (G.touchMode && _mapOpenedWhileRunning && G.phase === 'paused') G.phase = 'run';
  _mapOpenedWhileRunning = false;
  document.body.classList.remove('map-open');
};
window.toggleMap = function(quiet = false) {
  const panel = document.getElementById('map-panel');
  if (!panel) return;
  panel.classList.toggle('off');
  const mapOpen = !panel.classList.contains('off');
  sfx('mapOpen', 0.7);
  document.body.classList.toggle('map-open', mapOpen);
  if (mapOpen) {
    if (!quiet && !G.touchMode) flashAnnounce(i18n('announce.mapHint'), '#aaddff');
    window._onMapOpen?.();
    updateMap(); updateMapExtras();
    setMapPlaceholder(true);
    if (G.touchMode && G.phase === 'run') {
      _mapOpenedWhileRunning = true;
      G.phase = 'paused';
    }
  } else {
    setMapPlaceholder(false);
    if (G.touchMode && _mapOpenedWhileRunning && G.phase === 'paused') {
      G.phase = 'run';
    }
    _mapOpenedWhileRunning = false;
    if (!G.touchMode && G.phase === 'run') typingEl?.focus();
  }
};

document.getElementById('book-expand-btn')?.addEventListener('click', () => {
  const panel = document.getElementById('book-panel');
  panel?.classList.toggle('book-expanded');
});

document.getElementById('my-dict-expand-btn')?.addEventListener('click', () => {
  document.getElementById('my-dict-modal')?.classList.toggle('dict-expanded');
});

window.toggleBook = function(quiet = false) {
  const panel = document.getElementById('book-panel');
  if (!panel) return;
  panel.classList.toggle('off');
  const bookOpen = !panel.classList.contains('off');
  sfx('bookOpen', 0.7);
  document.body.classList.toggle('book-open', bookOpen);
  if (bookOpen) {
    if (!quiet && !G.touchMode) flashAnnounce(i18n('announce.bookHint'), '#aaddff');
    updateBook();
    if (G.touchMode && G.phase === 'run') {
      _bookOpenedWhileRunning = true;
      G.phase = 'paused';
    }
  } else {
    if (G.touchMode && _bookOpenedWhileRunning && G.phase === 'paused') {
      G.phase = 'run';
    }
    _bookOpenedWhileRunning = false;
    if (!G.touchMode && G.phase === 'run') typingEl?.focus();
  }
};

function updateBook() {
  const panel = document.getElementById('book-panel');
  const listEl = document.getElementById('book-dict-list');
  if (!listEl || !panel) return;

  // ── Wire static tabs once ────────────────────────────────────
  const tabContainer = panel.querySelector('.dict-tabs');
  if (tabContainer && !tabContainer.dataset.wired) {
    tabContainer.dataset.wired = '1';
    tabContainer.querySelectorAll('.dict-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        sfx('bookTabFlip', 0.6);
        panel.querySelectorAll('.dict-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        updateBook();
      });
    });
    const searchEl = document.getElementById('book-dict-search');
    if (searchEl) searchEl.addEventListener('input', updateBook);
  }

  // ── Determine active tab ──────────────────────────────────────
  const activeTab = panel.querySelector('.dict-tab.active');
  const category = activeTab?.dataset.cat || 'noun';

  // ── Hide/show search bar + update placeholder per tab ────────
  const searchWrap = document.getElementById('book-dict-search-wrap');
  if (searchWrap) searchWrap.style.display = (category === 'stats' || category === 'lessons') ? 'none' : '';
  const searchEl = document.getElementById('book-dict-search');
  if (searchEl) {
    const _searchKeys = { noun: 'dict.searchNoun', verb: 'dict.searchVerb', adjective: 'dict.searchAdj', adverb: 'dict.searchAdverb' };
    searchEl.placeholder = i18n(_searchKeys[category] || 'dict.searchPlaceholder');
  }

  // ── Stats tab ─────────────────────────────────────────────────
  if (category === 'stats') {
    listEl.innerHTML = _renderStatsContent();
    _wireStatsInteractions(listEl);
    return;
  }

  // ── Lessons tab: all completed lessons as wiki-header accordion ─
  if (category === 'lessons') {
    listEl.innerHTML = _renderLessonsContent();
    return;
  }

  // ── Word category tab ─────────────────────────────────────────
  const q = (searchEl?.value || '').toLowerCase().trim();

  const learned = G.dictProgressionDisabled ? WORD_DICT : (G.learnedWords || []);
  let words = (G.dictProgressionDisabled ? WORD_DICT : learned.map(lw =>
    WORD_DICT.find(d => d.text === lw.text && d.emoji === lw.emoji) ||
    WORD_DICT.find(d => d.text === lw.text) ||
    lw
  )).filter(w => {
    if (category === 'noun') return w.category !== 'verb' && w.category !== 'adjective' && w.category !== 'adverb';
    return w.category === category;
  });

  if (q) {
    words = words.filter(w =>
      w.text.includes(q) ||
      wordTr(w.text).toLowerCase().includes(q)
    );
  }

  // Limit to 50 entries if not showing all and not searching
  const showAll = q === '*';
  let truncated = false;
  if (!showAll && words.length > 50) {
    words = words.slice(0, 50);
    truncated = true;
  }

  if (!words.length) {
    listEl.innerHTML = `<div style="padding:24px 12px;text-align:center;color:rgb(0 0 0 / 40%);font-size:.85rem;">${i18n('dict.tabEmpty')}</div>`;
    return;
  }
  listEl.innerHTML = words.map(w => renderDictEntry(w)).join('') + (truncated ? `<div style="padding:24px 12px;text-align:center;color:rgb(0 0 0 / 40%);font-size:.85rem;">${i18n('dict.listTooLarge')}</div>` : '');
}

/* ================================================================
   IME (2-beolsik Korean) TOGGLE
================================================================ */
function _imeToggle() {
  _clearKeyHint?.(); // clear hint whenever IME state changes (defined later, safe via ?)
  _imeEnabled = !_imeEnabled;
  const btn   = document.getElementById('ime-toggle');
  const lp    = document.getElementById('kb-left');
  const rp    = document.getElementById('kb-right');
  const hanBtn = document.getElementById('kb-han-toggle');
  if (_imeEnabled) {
    _imeCommitted = typingEl ? typingEl.value : '';
    _imeComposer.reset();
    if (btn) { btn.textContent = '↹ㅤ한'; btn.classList.add('active'); }
    if (!G.touchMode) {
      lp?.classList.add('visible'); rp?.classList.add('visible');
      flashAnnounce('⌨️ ㅂㅈㄷㄱㅅㅛ');
    }
    lp?.classList.remove('latin-mode'); rp?.classList.remove('latin-mode');
    if (hanBtn) hanBtn.textContent = '한';
    _applyTouchZoom();
  } else {
    if (!_imeComposer.isEmpty) {
      _imeCommitted += _imeComposer.commitCurrent();
      if (typingEl) typingEl.value = _imeCommitted;
    }
    _imeCommitted = ''; _imeComposer.reset();
    if (btn) { btn.textContent = '↹ㅤ영'; btn.classList.remove('active'); }
    if (!G.touchMode) {
      lp?.classList.remove('visible'); rp?.classList.remove('visible');
      flashAnnounce('⌨️ QWERTY');
    }
    lp?.classList.add('latin-mode'); rp?.classList.add('latin-mode');
    if (hanBtn) hanBtn.textContent = '영';
    _applyTouchZoom();
  }
}

document.getElementById('ime-toggle')?.addEventListener('click', () => {
  _imeToggle();
  _focusTypingInput();
});

/* ================================================================
   KEY HINT — next-jamo guide for Dojang / World 2
================================================================ */
const _COMP_VOWEL_DECOMP = {
  ㅘ:['ㅗ','ㅏ'], ㅙ:['ㅗ','ㅐ'], ㅚ:['ㅗ','ㅣ'],
  ㅝ:['ㅜ','ㅓ'], ㅞ:['ㅜ','ㅔ'], ㅟ:['ㅜ','ㅣ'], ㅢ:['ㅡ','ㅣ'],
};
const _COMP_FINAL_DECOMP = {
  ㄳ:['ㄱ','ㅅ'], ㄵ:['ㄴ','ㅈ'], ㄶ:['ㄴ','ㅎ'],
  ㄺ:['ㄹ','ㄱ'], ㄻ:['ㄹ','ㅁ'], ㄼ:['ㄹ','ㅂ'], ㄽ:['ㄹ','ㅅ'],
  ㄾ:['ㄹ','ㅌ'], ㄿ:['ㄹ','ㅍ'], ㅀ:['ㄹ','ㅎ'], ㅄ:['ㅂ','ㅅ'],
};
const _KR_INITIAL = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const _KR_VOWEL   = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const _KR_FINAL   = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

// jamo → { key: 'a', shift: false }  (lowercase key preferred)
const _JAMO_TO_KEY = {};
for (const [k, jamo] of Object.entries(QWERTY_TO_JAMO)) {
  if (!_JAMO_TO_KEY[jamo]) _JAMO_TO_KEY[jamo] = { key: k.toLowerCase(), shift: k !== k.toLowerCase() };
}

function _wordToJamoSeq(word) {
  const out = [];
  for (const ch of word) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xAC00 && cp <= 0xD7A3) {
      const idx = cp - 0xAC00;
      const ci  = Math.floor(idx / (21 * 28));
      const vi  = Math.floor((idx % (21 * 28)) / 28);
      const fi  = idx % 28;
      out.push(_KR_INITIAL[ci]);
      const v = _KR_VOWEL[vi];
      out.push(...(_COMP_VOWEL_DECOMP[v] || [v]));
      if (fi > 0) {
        const f = _KR_FINAL[fi];
        out.push(...(_COMP_FINAL_DECOMP[f] || [f]));
      }
    } else if (cp >= 0x3131 && cp <= 0x3163) {
      out.push(ch); // bare jamo
    }
  }
  return out;
}

// Returns: next jamo string, null (word complete), or undefined (input mismatch)
function _getNextJamoForWord(word, currentTyped) {
  const seq = _wordToJamoSeq(word);
  if (!seq.length) return null;
  if (!currentTyped) return seq[0];
  const sim = new HangulComposer();
  let committed = '';
  for (let i = 0; i < seq.length; i++) {
    committed += sim.input(seq[i]);
    if (committed + sim.composing === currentTyped) {
      return i + 1 < seq.length ? seq[i + 1] : null;
    }
  }
  return undefined; // mismatch
}

let _kbHintKey = null;
let _kbHintShift = false;

function _getOrCreatePcShiftBadge() {
  let el = document.getElementById('kb-pc-shift');
  if (!el) {
    const wrap = document.createElement('div');
    wrap.className = 'kb-key-wrap';
    el = document.createElement('div');
    el.id = 'kb-pc-shift';
    el.className = 'kb-key kb-touch-special kb-pc-shift-badge';
    el.textContent = '⇧';
    wrap.appendChild(el);
    const rows = document.getElementById('kb-left')?.querySelectorAll('.kb-row');
    const lastRow = rows?.[rows.length - 1];
    lastRow?.insertBefore(wrap, lastRow.firstChild);
  }
  return el;
}

function _clearKeyHint() {
  document.body.classList.remove('kb-hint-mode');
  if (_kbHintKey) {
    const el = _kbHintKey === 'backspace'
      ? document.getElementById('kb-touch-backspace')
      : _kbKeyEls[_kbHintKey];
    el?.classList.remove('kb-hint');
    _kbHintKey = null;
  }
  if (_kbHintShift) {
    document.getElementById('kb-touch-shift')?.classList.remove('kb-hint');
    document.getElementById('kb-pc-shift')?.classList.remove('kb-hint');
    _kbHintShift = false;
  }
}

function _applyKeyHint(jamoKey, isBsp) {
  const newKey   = isBsp ? 'backspace' : (jamoKey?.key ?? null);
  const newShift = !isBsp && (jamoKey?.shift ?? false);
  if (newKey && newKey === _kbHintKey && newShift === _kbHintShift) return;
  _clearKeyHint();
  if (!newKey) return;
  if (!G.touchMode && G.dungeon?.worldDef?.isDojangTutorial) document.body.classList.add('kb-hint-mode');
  const el = isBsp
    ? document.getElementById('kb-touch-backspace')
    : _kbKeyEls[newKey];
  if (el) { el.classList.add('kb-hint'); _kbHintKey = newKey; }
  if (newShift) {
    document.getElementById('kb-touch-shift')?.classList.add('kb-hint');
    if (!G.touchMode) _getOrCreatePcShiftBadge().classList.add('kb-hint');
    _kbHintShift = true;
  }
}

function _updateKeyHint() {
  if (canvas) {
    const inCombat = G.phase === 'run' && G.mode === 'combat';
    canvas.style.pointerEvents = inCombat ? 'auto' : '';
    const val = (typingEl?.value || '').trim();
    canvas.style.cursor = (!G.touchMode && inCombat && _typedIsValidInput(val)) ? 'pointer' : '';
  }
  if (!_imeEnabled) { _clearKeyHint(); return; }
  const isDojang = G.dungeon?.worldDef?.isDojangTutorial;
  const isWorld2 = !isDojang && (G.run?.worldIdx ?? 0) === 1;
  if (G.phase !== 'run' || G.mode !== 'combat' || !(isDojang || isWorld2)) {
    _clearKeyHint(); return;
  }
  const targeted = new Set((G.room?.projs || []).map(p => p.tid));
  const monsters = (G.room?.monsters || []).filter(m => _isTargetableMonster(m) && !targeted.has(m.id));
  if (!monsters.length) { _clearKeyHint(); return; }
  const px = G.W / 2, py = G.vH * 0.85;
  let nearest = null, nd = Infinity;
  for (const m of monsters) {
    const d = Math.hypot(m.x - px, m.y - py);
    if (d < nd) { nd = d; nearest = m; }
  }
  if (!nearest?.words?.length) { _clearKeyHint(); return; }
  const next = _getNextJamoForWord(nearest.words[0], typingEl?.value ?? '');
  if (next === undefined)  _applyKeyHint(null, true);
  else if (next !== null)  _applyKeyHint(_JAMO_TO_KEY[next], false);
  else                     _clearKeyHint();
}

setInterval(_updateKeyHint, 150);

// Attach the custom HangulComposer to any auxiliary input (e.g. test write input)
// so that 한 mode is respected outside of the main typing field.
window._attachHangulToInput = (inputEl) => {
  if (!inputEl) return;
  const composer = new HangulComposer();
  let committed = '';

  inputEl.addEventListener('keydown', (e) => {
    if (!_imeEnabled) return;
    if (e.key === 'Enter' || e.key === 'Tab') return; // let other handlers fire
    const jamo = QWERTY_TO_JAMO[e.shiftKey ? e.key : e.key.toLowerCase()] ?? QWERTY_TO_JAMO[e.key];
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (!composer.backspace()) committed = committed.slice(0, -1);
      inputEl.value = committed + composer.composing;
      return;
    }
    if (!jamo) return;
    e.preventDefault();
    committed += composer.input(jamo);
    inputEl.value = committed + composer.composing;
  });

  // Commit any in-flight syllable before value is read (Enter key path)
  inputEl.addEventListener('keydown', (e) => {
    if (!_imeEnabled) return;
    if (e.key === 'Enter' && !composer.isEmpty) {
      // Only overwrite inputEl.value if OUR composer was managing the syllable.
      // When the system IME is active, composer is always empty - don't touch the value.
      committed += composer.commitCurrent();
      inputEl.value = committed;
    }
  }, true); // capture phase so value is committed before hud.js Enter handler fires

  // Expose handlers for touch kb-key routing
  window._feedKeyToTestInput = (k, shifted) => {
    const effectiveKey = shifted ? k.toUpperCase() : k;
    const jamo = QWERTY_TO_JAMO[effectiveKey] ?? QWERTY_TO_JAMO[k];
    if (!jamo) return;
    committed += composer.input(jamo);
    inputEl.value = committed + composer.composing;
  };
  window._backspaceTestInput = () => {
    if (!composer.backspace()) committed = committed.slice(0, -1);
    inputEl.value = committed + composer.composing;
  };
  window._commitAndGetTestInput = () => {
    committed += composer.commitCurrent();
    inputEl.value = committed;
    return committed;
  };
};

/* ================================================================
   MINI KEYBOARD DISPLAY (visual aid for Korean IME)
================================================================ */
const _KB_LEFT  = [['q','w','e','r','t'], ['a','s','d','f','g'], ['z','x','c','v']];
const _KB_RIGHT = [['y','u','i','o','p'], ['h','j','k','l'],     ['b','n','m']];
const _kbKeyEls = {}; // lowercase letter → .kb-key element

(function _buildKb() {
  const sides = [{ id: 'kb-left', rows: _KB_LEFT }, { id: 'kb-right', rows: _KB_RIGHT }];
  for (const { id, rows } of sides) {
    const panel = document.getElementById(id);
    if (!panel) continue;
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      for (const k of row) {
        const mainJamo  = QWERTY_TO_JAMO[k];
        const shiftJamo = QWERTY_TO_JAMO[k.toUpperCase()];

        // Wrapper (fixed-width column for each key)
        const wrap = document.createElement('div');
        wrap.className = 'kb-key-wrap';

        const keyEl = document.createElement('div');
        keyEl.className = 'kb-key' + (k === 'f' || k === 'j' ? ' kb-home' : '');

        if (shiftJamo && shiftJamo !== mainJamo) {
          const s = document.createElement('span');
          s.className = 'kb-shift-char';
          s.textContent = shiftJamo;
          keyEl.appendChild(s);
        }
        const m = document.createElement('span');
        m.className = 'kb-main-char';
        m.textContent = mainJamo;
        keyEl.appendChild(m);

        // Latin uppercase (for touch 영-mode display)
        const u = document.createElement('span');
        u.className = 'kb-latin-upper';
        u.textContent = k.toUpperCase();
        keyEl.appendChild(u);

        const l = document.createElement('span');
        l.className = 'kb-latin-char';
        l.textContent = k;
        keyEl.appendChild(l);

        _kbKeyEls[k] = keyEl;
        wrap.appendChild(keyEl);
        rowEl.appendChild(wrap);
      }
      panel.appendChild(rowEl);
    }
  }
}());

/* ================================================================
   TOUCH MODE
================================================================ */
let _bspRepeatTimer = null, _bspRepeatInterval = null;
let _touchKeysWired = false;
let _wordTypingStartedAt = null;
let _wordTypingRoom = null;

// This measures the typing attempt itself (first character after an empty
// field → Enter), rather than the player's reaction time before typing.
function _resetWordTypingTimer() {
  _wordTypingStartedAt = null;
  _wordTypingRoom = null;
}

function _trackWordTyping(rawValue = typingEl?.value) {
  const value = (rawValue || '').trim();
  if (!value) {
    _resetWordTypingTimer();
    return;
  }
  if (_wordTypingStartedAt == null || _wordTypingRoom !== G.room) {
    _wordTypingStartedAt = performance.now();
    _wordTypingRoom = G.room;
  }
}

function _consumeWordTypingDuration() {
  const startedAt = _wordTypingStartedAt;
  _resetWordTypingTimer();
  return startedAt == null ? null : Math.max(0, performance.now() - startedAt);
}

function _setEffectBubbleUnderTransition(underTransition) {
  document.getElementById('effect-bubble')?.classList.toggle('under-transition', !!underTransition);
}

function _updateEnterGlow() {
  const val = (typingEl?.value || '').trim();
  _trackWordTyping(val);
  _primeSpawnForCompletedInput(val);
  const enterBtn = document.getElementById('kb-touch-enter');
  if (!enterBtn) return;
  enterBtn.classList.toggle('has-input', _typedIsValidInput(val));
}

function _touchNumPress(digit) {
  if (G.phase !== 'run') return;
  if (_imeEnabled) {
    _imeCommitted += _imeComposer.commitCurrent(); // commit any in-flight syllable
    _imeCommitted += digit;
    if (typingEl) {
      typingEl.value = _imeCommitted;
      typingEl.setSelectionRange(typingEl.value.length, typingEl.value.length);
    }
  } else {
    if (typingEl) {
      typingEl.value += digit;
      typingEl.setSelectionRange(typingEl.value.length, typingEl.value.length);
    }
  }
  _updateEnterGlow();
}

function _touchKeyPress(k) {
  if (!G.touchMode) return; // on-screen keys are visual-only in keyboard mode
  if (G.phase !== 'run') return;
  const shifted = _kbShift !== 'off';

  // If teacher test is active, route to test write input
  if (window._feedKeyToTestInput) {
    window._feedKeyToTestInput(k, shifted);
    if (_kbShift === 'shift') _setKbShift('off');
  } else if (!document.getElementById('scr-teacher')?.classList.contains('off')) {
    // Teacher screen open but no write input (choice question) - do nothing
  } else if (!_imeEnabled) {
    // 영 mode: insert latin letter directly into the input value
    const char = shifted ? k.toUpperCase() : k;
    if (typingEl) typingEl.value += char;
    if (_kbShift === 'shift') _setKbShift('off');
  } else {
    // 한 mode: feed jamo
    const effectiveKey = shifted ? k.toUpperCase() : k;
    const jamo = QWERTY_TO_JAMO[effectiveKey] ?? QWERTY_TO_JAMO[k];
    if (jamo) _imeCommitted += _imeComposer.input(jamo);
    if (typingEl) {
      typingEl.value = _imeCommitted + _imeComposer.composing;
      typingEl.setSelectionRange(typingEl.value.length, typingEl.value.length);
    }
    if (_kbShift === 'shift') _setKbShift('off');
  }
  _updateEnterGlow();
  // Briefly light up the key
  const keyEl = _kbKeyEls[k];
  if (keyEl) {
    keyEl.classList.add('lit');
    clearTimeout(keyEl._litTimer);
    keyEl._litTimer = setTimeout(() => keyEl.classList.remove('lit'), 180);
  }
}

function _touchSpace() {
  if (G.phase !== 'run') return;
  if (_imeEnabled) {
    _imeCommitted += _imeComposer.commitCurrent();
    _imeCommitted += ' ';
    if (typingEl) {
      typingEl.value = _imeCommitted;
      typingEl.setSelectionRange(typingEl.value.length, typingEl.value.length);
    }
  } else {
    if (typingEl) {
      typingEl.value += ' ';
      typingEl.setSelectionRange(typingEl.value.length, typingEl.value.length);
    }
  }
  _updateEnterGlow();
}

function _touchBackspace() {
  if (window._backspaceTestInput) {
    window._backspaceTestInput();
  } else if (_imeEnabled) {
    if (!_imeComposer.backspace()) _imeCommitted = _imeCommitted.slice(0, -1);
    if (typingEl) typingEl.value = _imeCommitted + _imeComposer.composing;
  } else {
    if (typingEl) typingEl.value = typingEl.value.slice(0, -1);
  }
  _updateEnterGlow();
}

function _makeTouchKey(id, text) {
  const btn = document.createElement('button');
  btn.id = id; btn.type = 'button';
  btn.className = 'kb-key kb-touch-special';
  btn.textContent = text;
  return btn;
}

function _wrapTouchKey(btn) {
  const w = document.createElement('div');
  w.className = 'kb-key-wrap';
  const num = document.createElement('span');
  num.className = 'kb-key-num'; // empty = no digit label
  w.appendChild(num);
  w.appendChild(btn);
  return w;
}

function _buildTouchExtras() {
  const lp = document.getElementById('kb-left');
  const rp = document.getElementById('kb-right');
  if (!lp || !rp) return;

  // Remove previously-added extras (safe to call on replay)
  lp.querySelectorAll('.kb-num-row').forEach(el => el.remove());
  rp.querySelectorAll('.kb-num-row').forEach(el => el.remove());
  document.getElementById('kb-touch-shift')?.closest('.kb-key-wrap')?.remove();
  document.getElementById('kb-han-toggle')?.closest('.kb-key-wrap')?.remove();
  document.getElementById('kb-touch-backspace')?.closest('.kb-key-wrap')?.remove();
  document.getElementById('kb-touch-enter')?.closest('.kb-key-wrap')?.remove();

  const lRows = lp.querySelectorAll('.kb-row');
  const rRows = rp.querySelectorAll('.kb-row');

  // ── Shift (left of Z, prepend to kb-left row 2) ──
  const shiftBtn = _makeTouchKey('kb-touch-shift', '⇧');
  shiftBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (_kbShift === 'off')    _setKbShift('shift');
    else if (_kbShift === 'shift') _setKbShift('caps');
    else                           _setKbShift('off');
  });
  lRows[2]?.insertBefore(_wrapTouchKey(shiftBtn), lRows[2].firstChild);

  // ── 한/영 toggle (append to kb-right row 2) ──
  const hanBtn = _makeTouchKey('kb-han-toggle', '한');
  hanBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    _imeToggle();
    // update label and latin-mode class handled inside _imeToggle
  });
  rRows[2]?.appendChild(_wrapTouchKey(hanBtn));

  // ── Backspace ⌫ (after 한/영 in kb-right row 2) ──
  const bspBtn = _makeTouchKey('kb-touch-backspace', '⌫');
  const _stopBsp = () => { clearTimeout(_bspRepeatTimer); clearInterval(_bspRepeatInterval); };
  bspBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    _touchBackspace();
    _bspRepeatTimer = setTimeout(() => {
      _bspRepeatInterval = setInterval(_touchBackspace, 75);
    }, 380);
  });
  bspBtn.addEventListener('pointerup', _stopBsp);
  bspBtn.addEventListener('pointercancel', _stopBsp);
  rRows[2]?.appendChild(_wrapTouchKey(bspBtn));

  // ── Enter ⏎ (append to kb-right row 1) ──
  const enterBtn = _makeTouchKey('kb-touch-enter', '⏎');
  enterBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    // If teacher test write input is active, commit and submit
    if (window._commitAndGetTestInput) {
      const val = window._commitAndGetTestInput();
      window._submitTestAnswer?.(val);
      return;
    }
    if (_imeEnabled) {
      _imeCommitted += _imeComposer.commitCurrent();
      if (typingEl) typingEl.value = _imeCommitted || typingEl.value;
      _imeCommitted = ''; _imeComposer.reset();
    }
    onInput();
    if (_imeEnabled) _imeCommitted = typingEl ? typingEl.value : '';
    _updateEnterGlow();
  });
  rRows[1]?.appendChild(_wrapTouchKey(enterBtn));
}

function _applyTouchZoom() {
  const pa = document.getElementById('player-area');
  if (!pa) return;
  pa.style.zoom = '';
  requestAnimationFrame(() => {
    const lp = document.getElementById('kb-left');
    const pi = document.getElementById('player-inner');
    const rp = document.getElementById('kb-right');
    if (!lp || !pi || !rp) return;
    const style = getComputedStyle(pa);
    const avail = pa.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    // Panels always take space (visibility:hidden), so always count their widths
    const natural = lp.offsetWidth + pi.offsetWidth + rp.offsetWidth;
    if (natural > avail) pa.style.zoom = String(avail / natural);
  });
}

function _applyMenuZoom() {
  const wrap = document.getElementById('menu-wrap');
  if (!wrap) return;
  wrap.style.zoom = '';
  requestAnimationFrame(() => {
    const avail = (window.visualViewport?.height ?? window.innerHeight) * 0.97;
    const natural = wrap.scrollHeight;
    if (natural > avail) wrap.style.zoom = String(avail / natural);
  });
}

function _applyCtrlZoom() {
  const panel = document.getElementById('ctrl-panel');
  if (!panel) return;
  // Reset inline zoom so we measure natural CSS size (touch mode CSS already sets zoom:1)
  panel.querySelectorAll('.ctrl-actions, .ctrl-center').forEach(el => el.style.zoom = '');
  requestAnimationFrame(() => {
    const avW = window.innerWidth  * 0.90;
    const avH = (window.innerHeight - 120) * 0.95; // 120px headroom for wallet/esc
    let maxW = 0, totalH = 0;
    for (const child of panel.children) {
      if (getComputedStyle(child).position === 'absolute') continue;
      maxW = Math.max(maxW, child.offsetWidth);
      totalH += child.offsetHeight + 10;
    }
    const zoom = Math.min(maxW > avW ? avW / maxW : 1, totalH > avH ? avH / totalH : 1);
    if (zoom < 1) {
      panel.querySelectorAll('.ctrl-actions, .ctrl-center, #perm-bar').forEach(el => { el.style.zoom = String(zoom); });
    }
  });
}

function _cleanupTouchExtras() {
  const lp = document.getElementById('kb-left');
  const rp = document.getElementById('kb-right');
  // Remove dynamically-added touch rows/keys
  lp?.querySelectorAll('.kb-num-row').forEach(el => el.remove());
  rp?.querySelectorAll('.kb-num-row').forEach(el => el.remove());
  ['kb-touch-shift','kb-han-toggle','kb-touch-backspace','kb-touch-enter'].forEach(id => {
    document.getElementById(id)?.closest('.kb-key-wrap')?.remove();
  });
  // Hide KB panels (IME toggle will re-show if re-enabled in keyboard mode)
  lp?.classList.remove('visible');
  rp?.classList.remove('visible');
  // Reset cursor on KB key wrappers (touch mode sets them to pointer)
  Object.values(_kbKeyEls).forEach(el => { if (el.parentElement) el.parentElement.style.cursor = ''; });
}

function applyTouchMode() {
  if (!G.touchMode) {
    document.body.classList.remove('touch-mode');
    _setTouchInputLock(false);
    _cleanupTouchExtras();
    _applyTouchZoom();
    return;
  }
  document.body.classList.add('touch-mode');
  _setTouchInputLock(true);

  // Ensure Korean IME is active on every game start (resets stale 영-mode from previous game)
  if (!_imeEnabled) _imeToggle();

  if (!_touchKeysWired) {
    _touchKeysWired = true;

    // Wire all KB keys to touch handler (once - same DOM elements throughout session)
    Object.entries(_kbKeyEls).forEach(([k, el]) => {
      el.parentElement.style.cursor = 'pointer';
      el.addEventListener('pointerdown', e => { e.preventDefault(); _touchKeyPress(k); });
    });

    // Drag-up on player emoji → open ctrl panel
    const emojiWrap = document.getElementById('pl-emoji-wrap');
    if (emojiWrap) {
      let _dragStartY = 0, _dragging = false;
      emojiWrap.addEventListener('pointerdown', e => {
        _dragStartY = e.clientY; _dragging = true;
        emojiWrap.setPointerCapture(e.pointerId);
        e.stopPropagation();
      });
      emojiWrap.addEventListener('pointermove', e => {
        if (!_dragging || G.ctrlPanelOpen) return;
        if ((_dragStartY - e.clientY) > 28) {
          _dragging = false;
          openCtrlPanel();
          _ctrlState = 'open';
        }
      });
      emojiWrap.addEventListener('pointerup',     () => { _dragging = false; });
      emojiWrap.addEventListener('pointercancel', () => { _dragging = false; });
    }

  }

  // Build extra touch keys (re-runs each game start; cleans up previous extras internally)
  _buildTouchExtras();

  // Always show KB panels
  document.getElementById('kb-left')?.classList.add('visible');
  document.getElementById('kb-right')?.classList.add('visible');

  // Touch space button
  document.getElementById('touch-space-btn')?.addEventListener('pointerdown', e => {
    e.preventDefault();
    _touchSpace();
  });

  // Dynamic zoom: fit keyboards between the walls
  _applyTouchZoom();
  // Re-measure after layout settles (fixes clipping on first game start)
  setTimeout(_applyTouchZoom, 80);
  setTimeout(_applyTouchZoom, 250);
}

// Sync body.mobile-fs class and fs-overlay visibility
function _syncMobileFs() {
  // Don't interfere while the desktop audio-unlock overlay is active
  if (document.getElementById('fs-overlay')?.classList.contains('desktop-mode')) return;
  const isMobile = window.innerHeight < 500;
  const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  document.body.classList.toggle('mobile-fs', isMobile && inFs);
  const fsOverlay = document.getElementById('fs-overlay');
  const fsBtn = document.getElementById('fs-btn');
  if (!fsOverlay) return;
  if (!isMobile) {
    // Screen large enough or already truly fullscreen: hide overlay unconditionally
    fsOverlay.classList.add('off');
    _stopFsPromptCycle();
    fsBtn?.classList.remove('glow');
  } else if (!inFs) {
    // Mobile but not in fullscreen: request fullscreen
    fsOverlay.classList.remove('off');
    _startFsPromptCycle();
    fsBtn?.classList.add('glow');
  } else {
    // In fullscreen on mobile: hide overlay and stop cycle
    fsOverlay.classList.add('off');
    _stopFsPromptCycle();
    fsBtn?.classList.remove('glow');
  }
}

function _onFullscreenChange() {
  const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  _syncMobileFs();
  // Update G.vH to account for titlebar after fullscreen state change
  G.vH = Math.floor(window.visualViewport?.height ?? window.innerHeight);
  if (document.body.classList.contains('mobile-fs')) G.vH -= 20;
  resizeCanvas();
  if (!inFs && window.innerHeight < 500) {
    // Mobile exited fullscreen unexpectedly
    if (G.phase === 'run' || G.phase === 'lore') window.pauseGame();
  }
}
document.addEventListener('fullscreenchange', _onFullscreenChange);
document.addEventListener('webkitfullscreenchange', _onFullscreenChange);

// Re-apply zoom on orientation change / resize; update screen-size globals
window.addEventListener('resize', () => {
  _syncMobileFs();
  G.W  = Math.floor(window.innerWidth);
  G.vH = Math.floor(window.visualViewport?.height ?? window.innerHeight);
  // Subtract titlebar height from game viewport when mobile fullscreen is active
  if (document.body.classList.contains('mobile-fs')) G.vH -= 20;
  G.hangulSize = window.innerWidth < 768 ? 34 : window.innerWidth >= 1600 ? 48 : 38;
  resizeCanvas();
  _applyTouchZoom();
  if (G.ctrlPanelOpen) _applyCtrlZoom();
  if (G.phase === 'title') _applyMenuZoom();
});

/* ================================================================
   TYPING INPUT
================================================================ */
typingEl?.addEventListener('keydown', e => {
  // Touch mode: block ALL physical keyboard input - only pointer/touch events work
  if (G.touchMode) { e.preventDefault(); return; }

  // Block text-editing shortcuts that would modify selection or clipboard
  if (e.ctrlKey && !e.altKey && !e.metaKey) {
    const k = e.key.toLowerCase();
    if ('axzcy'.includes(k)) { e.preventDefault(); return; }
  }

  // Track shift/caps for KB panel visual
  if (e.key === 'Shift' && !e.repeat) {
    if (_kbShift === 'off') _setKbShift('shift');
  }
  if (e.key === 'CapsLock' && !e.repeat) {
    _setKbShift(_kbShift === 'caps' ? 'off' : 'caps');
  }

  // Enter - commit IME composition first, then fire onInput
  if (e.key === 'Enter') {
    if (_imeEnabled) {
      // Always commit (returns '' if nothing in flight)
      _imeCommitted += _imeComposer.commitCurrent();
      // Guard: fall back to whatever the input shows if _imeCommitted is somehow empty
      typingEl.value = _imeCommitted || typingEl.value;
      _imeCommitted = '';
      _imeComposer.reset();
    }
    e.preventDefault();
    onInput();
    if (_imeEnabled) _imeCommitted = typingEl.value; // sync after onInput clear
    return;
  }

  // Auto-switch to Korean after 3 Latin chars in Dojang world (PC only, not cheatcode prefix)
  if (!_imeEnabled && !G.touchMode && G.phase === 'run' && G.dungeon?.worldDef?.isDojangTutorial) {
    if (/^[a-zA-Z]$/.test(e.key)) {
      _latinAutoSeq = (_latinAutoSeq || '') + e.key.toLowerCase();
      if (_latinAutoSeq.length >= 3) {
        if (!_latinAutoSeq.startsWith('che')) {
          _latinAutoSeq = '';
          _imeToggle();
          _focusTypingInput();
        } else {
          _latinAutoSeq = ''; // was cheatcode prefix, reset
        }
      }
    } else if (e.key !== 'Shift' && e.key !== 'CapsLock') {
      _latinAutoSeq = '';
    }
  }

  // IME: only intercept a-z letters for Korean; everything else types naturally
  if (_imeEnabled) {
    const isSystem = e.ctrlKey || e.altKey || e.metaKey ||
                     e.key.startsWith('F') || e.key === 'Escape' || e.key === 'Tab' || e.key === 'Shift' || e.key === 'CapsLock';
    if (isSystem) return;

    if (/^[a-zA-Z]$/.test(e.key)) {
      // Letter → convert to jamo; prevent browser from inserting raw ASCII
      e.preventDefault();
      const k = e.key.toLowerCase();
      const jamo = QWERTY_TO_JAMO[e.key] ?? QWERTY_TO_JAMO[k];
      if (jamo) _imeCommitted += _imeComposer.input(jamo);
      const keyEl = _kbKeyEls[k];
      if (keyEl) {
        keyEl.classList.add('lit');
        clearTimeout(keyEl._litTimer);
        keyEl._litTimer = setTimeout(() => keyEl.classList.remove('lit'), 200);
      }
      typingEl.value = _imeCommitted + _imeComposer.composing;
      typingEl.setSelectionRange(typingEl.value.length, typingEl.value.length);
    } else if (e.key === 'Backspace' && !_imeComposer.isEmpty) {
      // Backspace with active composition: strip one composing step
      e.preventDefault();
      _imeComposer.backspace();
      typingEl.value = _imeCommitted + _imeComposer.composing;
      typingEl.setSelectionRange(typingEl.value.length, typingEl.value.length);
    } else {
      // Space, numbers, punctuation, Backspace on empty composer:
      // commit any in-flight syllable then let the browser handle the key
      const committed = _imeComposer.commitCurrent();
      if (committed) {
        _imeCommitted += committed;
        typingEl.value = _imeCommitted;
        typingEl.setSelectionRange(typingEl.value.length, typingEl.value.length);
      }
    }
  }
  _updateKeyHint();
  _updateEnterGlow();
});
typingEl?.addEventListener('paste', e => e.preventDefault());
// Block browser input only when a syllable is actively composing (protects mid-composition state)
typingEl?.addEventListener('beforeinput', e => {
  if (_imeEnabled && !_imeComposer.isEmpty) e.preventDefault();
});
// After browser inserts a char (space, number, etc.), sync _imeCommitted to the new field value
typingEl?.addEventListener('input', () => {
  if (_imeEnabled && typingEl) {
    if (_imeComposer.isEmpty) {
      _imeCommitted = typingEl.value; // browser added a char - accept it
    } else {
      typingEl.value = _imeCommitted + _imeComposer.composing; // safety net
    }
    typingEl.setSelectionRange(typingEl.value.length, typingEl.value.length);
  }
  // Check for Latin characters to show TAB hint (only if not in touch mode)
  if (!G.touchMode && !_tabHintShown && /[a-zA-Z]/.test(typingEl.value)) {
    flashAnnounce(i18n('announce.tabHint'), '#aaaaff');
    _tabHintShown = true;
  }
  _primeSpawnForCompletedInput(typingEl.value);
  _updateEnterGlow();
});
// Clear one-shot shift on keyup (caps persists until CapsLock pressed again)
typingEl?.addEventListener('keyup', e => {
  if (G.touchMode) return; // touch mode: physical keyboard does nothing
  if (e.key === 'Shift' && _kbShift === 'shift') _setKbShift('off');
});

// Warm up the TTS engine on first user interaction to eliminate first-speak delay
let _ttsWarmedUp = false;
function warmUpTTS() {
  if (_ttsWarmedUp || typeof speechSynthesis === 'undefined') return;
  _ttsWarmedUp = true;
  const utt = new SpeechSynthesisUtterance('');
  utt.volume = 0;
  speechSynthesis.speak(utt);
}
document.addEventListener('click', warmUpTTS, { once: true });
document.addEventListener('keydown', warmUpTTS, { once: true });

// Preload SFX on first interaction
function _initSFX() { preloadSFX(); }
document.addEventListener('click', _initSFX, { once: true });
document.addEventListener('keydown', _initSFX, { once: true });

// UI hover sfx (desktop only) and click sfx
document.addEventListener('mouseover', e => {
  if (window.matchMedia('(pointer:coarse)').matches) return;
  if (e.target.closest('button, .dict-tab, .kb-key, .dj-pause-btn, .dj-entry-btn, .pause-btn, .map-cell.can-teleport, .item-choice-card')) {
    sfx('uiHover', 0.25);
  }
});
document.addEventListener('click', e => {
  if (!e.target.closest('#casino-stop-btn, #ava-randomize, .dict-tab') &&
      e.target.closest('button, .dict-tab, .dj-pause-btn, .dj-entry-btn, .pause-btn, .item-choice-card, .gopt-toggle')) {
    sfx('uiClick', 0.35);
  }
});

// Wiki world music preview (main menu only)
document.addEventListener('click', e => {
  const btn = e.target.closest('.wiki-world-music-btn');
  if (!btn) return;
  const trackId = btn.dataset.worldMusic;
  if (_wikiMusicPreview === trackId) {
    _stopWikiMusicPreview();
  } else {
    document.querySelectorAll('.wiki-world-music-btn.active').forEach(b => {
      b.textContent = '🎵';
      b.classList.remove('active');
    });
    _wikiMusicPreview = trackId;
    btn.textContent = '❌';
    btn.classList.add('active');
    playMusic(trackId, 0);
  }
});

// Mobile dojang two-tap: first tap reveals lluc, second tap follows link
document.addEventListener('click', e => {
  const wrap = document.getElementById('menu-dojang-wrap');
  if (!wrap) return;
  const isMobileLandscape = window.innerHeight <= 500;
  if (!isMobileLandscape) return;
  if (e.target.closest('#menu-dojang-wrap')) {
    if (!wrap.classList.contains('dojang-revealed')) {
      e.preventDefault();
      wrap.classList.add('dojang-revealed');
    }
    // second tap: do nothing — let the <a> navigate naturally
  } else {
    wrap.classList.remove('dojang-revealed');
  }
});

// Speak a Korean word - cancels any ongoing speech immediately
function speakKorean(text) {
  if (!G.ttsEnabled || !text || typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'ko-KR';
  utt.rate = 0.85;
  speechSynthesis.speak(utt);
}

// Returns true if val is a valid submittable input: cheatcode, NPC in room, or alive monster.
function _typedIsValidInput(val) {
  if (!val) return false;
  if (val.toLowerCase() === 'cheatcode' || val === 'cheat챙ㄷ' || val === '촏ㅁㅅ챙ㄷ' || val === '초ㄸㅁㅆ첑ㄸ') return true;
  const npc = G.room?.npc;
  if (npc?.word && (val === npc.word || val === npc.word.replace(/\s+/g, ''))) return true;
  for (const m of (G.room?.monsters || [])) {
    if (!_isTargetableMonster(m)) continue;
    const all = [...m.words];
    for (const w of m.words) {
      const entry = WORD_DICT.find(d => d.text === w);
      if (entry?.alts) all.push(...entry.alts);
    }
    if (all.includes(val) || all.some(w => val.startsWith(w))) return true;
  }
  return false;
}

function _isTargetableMonster(m) {
  return !!m && !m.dead && !m.fleeing && !m.firedAt && !m.defeatCommitted;
}

// A completed word can reserve the next template before Enter. Only exact
// matches qualify: typing a common prefix must never create an enemy early.
function _primeSpawnForCompletedInput(rawValue) {
  if (G.phase !== 'run' || G.mode !== 'combat') return;
  const val = (rawValue || '').trim();
  if (!val) return;
  for (const m of (G.room?.monsters || [])) {
    if (!_isTargetableMonster(m)) continue;
    const all = [...(m.words || [])];
    for (const w of (m.words || [])) {
      const entry = WORD_DICT.find(d => d.text === w);
      if (entry?.alts) all.push(...entry.alts);
    }
    if (all.includes(val)) {
      primeNextSpawn();
      return;
    }
  }
}

// pointerdown preventDefault keeps typingEl focused while mouse is over canvas
// — this is what prevents the OS/browser IME composition from being cancelled.
canvas?.addEventListener('pointerdown', e => {
  if (G.phase !== 'run' || G.mode !== 'combat') return;
  e.preventDefault();
});

// Clicking the game canvas submits the current word (same as Enter).
// Touch mode: always fires. PC mode: only fires when input is valid (monster/NPC/cheatcode).
canvas?.addEventListener('click', () => {
  if (G.phase !== 'run' || G.mode !== 'combat') return;
  const val = (typingEl?.value || '').trim();
  if (!G.touchMode && !_typedIsValidInput(val)) return;
  if (!G.touchMode && typingEl && document.activeElement !== typingEl) typingEl.focus();
  if (_imeEnabled) {
    _imeCommitted += _imeComposer.commitCurrent();
    if (typingEl) typingEl.value = _imeCommitted || typingEl.value;
    _imeCommitted = ''; _imeComposer.reset();
  }
  onInput();
  if (_imeEnabled) _imeCommitted = typingEl ? typingEl.value : '';
  _updateEnterGlow();
});

function onInput() {
  if (G.phase !== 'run') return;
  _tabHintShown = false; // Re-arm the Latin character detection hint
  if (G.inTransition) { _resetWordTypingTimer(); typingEl.value = ''; return; }
  if (G.frozen) { _resetWordTypingTimer(); typingEl.value = ''; return; }
  const val = typingEl.value.trim();
  if (!val) {
    // Whitespace-only input - just clear the field
    _resetWordTypingTimer();
    typingEl.value = '';
    _imeCommitted = '';
    _imeComposer.reset();
    _updateEnterGlow();
    return;
  }
  const typingDurationMs = _consumeWordTypingDuration();
  const typedJamo = countJamoKeys(val);

  // Speak what was typed - queued, fires even on wrong input
  const _ttsVal = (val.toLowerCase() === 'cheatcode' || val === '촏ㅁㅅ챙ㄷ' || val === '초ㄸㅁㅆ첑ㄸ') ? '치트 코드' : val;
  speakKorean(_ttsVal);

  // Ground items can always be collected (combat or navigate)
  if (tryCollectGroundItem(val)) { typingEl.value = ''; return; }

  // Cheat code — case-insensitive + Korean-layout aliases — host only in co-op
  if (val.toLowerCase() === 'cheatcode' || val === '촏ㅁㅅ챙ㄷ' || val === '초ㄸㅁㅆ첑ㄸ') {
    typingEl.value = '';
    if (G.mp?.active && !G.mp.isHost) return; // guests can't cheat
    openCheatMenu();
    return;
  }

  // Room code teleportation: D4, D4방, or ㅇ4 (jamo alias)
  {
    const JAMO_TO_COL = { 'ㅁ':'A', 'ㅠ':'B', 'ㅊ':'C', 'ㅇ':'D', 'ㄷ':'E', 'ㄹ':'F', 'ㅎ':'G', 'ㅗ':'H' };
    const normalized = val.replace(/^([ㅁㅠㅊㅇㄷㄹㅎㅗ])/, m => JAMO_TO_COL[m]);
    const rm = /^([A-Ha-h])([1-6])방?$/.exec(normalized);
    if (rm) {
      const col = rm[1].toUpperCase().charCodeAt(0) - 65;
      const row = parseInt(rm[2]) - 1;
      const cell = getCell(col, row);
      typingEl.value = '';
      if (cell) {
        if (!cell.visited && !G.run?.mapRevealed) {
          flashAnnounce(i18n('world.roomLocked'), '#ff6666');
          speakKorean(`${rm[1].toUpperCase()} ${rm[2]} 방`);
          typingEl.style.color = '#ff4466';
          setTimeout(() => typingEl.style.color = '', 280);
          spawnMissParticles(val);
        } else {
            speakKorean(`${rm[1].toUpperCase()} ${rm[2]} 방`);
          document.getElementById('map-panel')?.classList.add('off');
          setMapPlaceholder(false);
          G.transition = {
            phase: 'out', t: 0, dur: 0.3,
            cb: () => {
              enterRoom(col, row);
              G.transition = { phase: 'in', t: 0, dur: 0.3, cb: null };
            },
          };
        }
      }
      return;
    }
  }

  if (G.mode === 'combat') {
    const DIR_KO = { '북': 'N', '남': 'S', '동': 'E', '서': 'W' };
    const dir = DIR_KO[val];
    if (dir && getAvailableDirs().includes(dir)) {
      // Flee is only allowed to already-visited rooms (unvisited rooms lock until current room is cleared)
      const fleeFromCell = currentCell();
      const [fdc, fdr] = _ANIM_DIR_DELTA[dir];
      const fAdj = getCell(((fleeFromCell?.col ?? 0) + fdc + COLS) % COLS, ((fleeFromCell?.row ?? 0) + fdr + ROWS) % ROWS);
      if (fAdj?.visited) {
        // Only flee if no monster has this word - killing always takes priority
        const monsters = G.room?.monsters?.filter(m => !m.dead && !m.fleeing) || [];
        const wordMatchesMonster = monsters.some(m => {
          const all = [...m.words];
          for (const w of m.words) {
            const entry = WORD_DICT.find(d => d.text === w);
            if (entry?.alts) all.push(...entry.alts);
          }
          return all.includes(val);
        });
        if (!wordMatchesMonster) {
          typingEl.value = '';
          G.run.fleeCount = (G.run.fleeCount || 0) + 1;
          const fleeMsg = i18n('announce.flee');
          flashAnnounce(fleeMsg, '#ff8800');
          const cell = currentCell();
          if (cell) startFleeEffects(cell);
          G.mode = 'navigate';
          navigateWithAnim(dir);
          return;
        }
      }
    }
  }

  if (G.mode === 'navigate') {
    // NPC interaction: shop / modifier room
    if (tryNpcInteract(val)) {
      typingEl.value = '';
      return;
    }

    // Direction navigation: 북/남/동/서
    const DIR_KO = { '북': 'N', '남': 'S', '동': 'E', '서': 'W' };
    const dir = DIR_KO[val];
    if (dir && getAvailableDirs().includes(dir)) {
      typingEl.value = '';
      navigateWithAnim(dir);
      return;
    }

    // Treasure collect
    const cell = currentCell();
    if (cell?.type === 'treasure' && !cell.rewardCollected) {
      if (val === '줍기' || val === '줍' || val === 'ㅈ') {
        collectTreasure(cell);
        typingEl.value = '';
        return;
      }
    }

    // Nothing matched in navigate mode - scatter
    typingEl.style.color = '#ff4466';
    setTimeout(() => typingEl.style.color = '', 280);
    spawnMissParticles(val);
    typingEl.value = '';
    return;
  }

  // Combat: fire at best-matching monster
  {
    const monsters = G.room?.monsters?.filter(_isTargetableMonster) || [];
    if (monsters.length) {
      // Build full candidate word list (main words + alts) for each monster
      function monsterWords(m) {
        const all = [...m.words];
        for (const w of m.words) {
          const entry = WORD_DICT.find(d => d.text === w);
          if (entry?.alts) all.push(...entry.alts);
        }
        return all;
      }
      let best = null, bestScore = Infinity;
      for (const m of monsters) {
        const allWords = monsterWords(m);
        if (allWords.includes(val)) { best = m; bestScore = 0; break; }
        for (const w of allWords) {
          if (val.startsWith(w)) {
            // val is longer but starts with a word (e.g. typed extra chars) - still a hit
            const score = Math.abs(w.length - val.length);
            if (score < bestScore) { bestScore = score; best = m; }
          }
        }
      }
      if (best) {
        fire(best, { typedJamo, typingDurationMs });
      } else {
        // Wrong word flash + letters scatter
        typingEl.style.color = '#ff4466';
        setTimeout(() => typingEl.style.color = '', 280);
        spawnMissParticles(val);
      }
    } else {
      // No monsters alive - scatter
      typingEl.style.color = '#ff4466';
      setTimeout(() => typingEl.style.color = '', 280);
      spawnMissParticles(val);
    }
  }
  typingEl.value = '';
}

/* ================================================================
   KEYBOARD SHORTCUTS
================================================================ */
document.addEventListener('keydown', e => {
  // Touch mode: block all physical keyboard input (use on-screen keyboard)
  if (G.touchMode && G.phase === 'run') { e.preventDefault(); return; }

  // Ctrl hold: start tracking (but not repeat events)
  if (e.key === 'Control' && !e.repeat && G.phase === 'run') {
    if (_ctrlState === 'idle') {
      _ctrlState = 'holding';
      _ctrlHoldTimer = 0;
    }
  }

  if (G.phase === 'run') {
    // Ctrl panel open: intercept action keys
    if (G.ctrlPanelOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); ctrlPanelAction('use'); return; }
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); ctrlPanelAction('map'); return; }
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); ctrlPanelAction('book'); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); ctrlInvNav(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); ctrlInvNav(1);  return; }
    }

    // Tab: toggle Korean IME mode
    if (e.key === 'Tab') {
      e.preventDefault();
      _latinAutoSeq = '';
      _imeToggle();
    }
    const teacherOpen = !document.getElementById('scr-teacher')?.classList.contains('off');
    // Ctrl+B: open Dictionary (skip if another input has focus, or teacher screen is open)
    if ((e.key === 'b' || e.key === 'B') && e.ctrlKey) {
      const inOtherInput = document.activeElement !== typingEl &&
        document.activeElement?.closest('input, textarea, select');
      if (!inOtherInput && !teacherOpen) { e.preventDefault(); window.toggleBook(true); }
    }
    // Ctrl+M: toggle Map (skip if another input has focus, or teacher screen is open)
    if ((e.key === 'm' || e.key === 'M') && e.ctrlKey) {
      const inOtherInput = document.activeElement !== typingEl &&
        document.activeElement?.closest('input, textarea, select');
      if (!inOtherInput && !teacherOpen) { e.preventDefault(); window.toggleMap(true); }
    }
    // Cheat: Enter instantly interacts with NPC if cheat menu is open
    if (!G.inTransition && e.key === 'Enter' && G.mode === 'navigate') {
      const cheatMenu = document.getElementById('cheat-menu');
      if (cheatMenu?.classList.contains('on') && G.room?.npc?.active) {
        e.preventDefault();
        tryNpcInteract(G.room.npc.word);
        return;
      }
    }
    // Enter to use item when not in typing field (blocked during NPC screen)
    if (!G.inTransition && !teacherOpen && e.key === 'Enter' && document.activeElement !== typingEl) {
      e.preventDefault();
      invUse(); refreshInventoryUI();
    }
  }
  if (e.key === 'Escape') {
    if (!document.getElementById('progress-modal')?.classList.contains('off')) {
      document.getElementById('progress-modal')?.classList.add('off');
      return;
    }
    if (!document.getElementById('my-dict-modal')?.classList.contains('off')) {
      document.getElementById('my-dict-modal')?.classList.add('off');
      return;
    }
    if (!document.getElementById('settings-modal')?.classList.contains('off')) {
      document.getElementById('settings-modal')?.classList.add('off');
      return;
    }

    if (G.ctrlPanelOpen) {
      closeCtrlPanel();
      if (e.ctrlKey) pauseGame(); // Ctrl+ESC = pause
      return;
    }
    // Close map if open and game is not paused - double ESC pauses
    const mapP = document.getElementById('map-panel');
    if (mapP && !mapP.classList.contains('off') && G.phase !== 'paused') {
      mapP.classList.add('off');
      document.body.classList.remove('map-open');
      setMapPlaceholder(false);
      if (G.touchMode && _mapOpenedWhileRunning && G.phase === 'paused') G.phase = 'run';
      _mapOpenedWhileRunning = false;
      if (!G.touchMode && G.phase === 'run') typingEl?.focus();
      return;
    }
    // Close book if open and game is not paused
    const bookP = document.getElementById('book-panel');
    if (bookP && !bookP.classList.contains('off') && G.phase !== 'paused') {
      bookP.classList.add('off');
      document.body.classList.remove('book-open');
      if (G.touchMode && _bookOpenedWhileRunning && G.phase === 'paused') G.phase = 'run';
      _bookOpenedWhileRunning = false;
      if (!G.touchMode && G.phase === 'run') typingEl?.focus();
      return;
    }
    // ESC: pause if running, resume if paused (disabled in touch mode - ctrl-panel handles it)
    if (G.touchMode) { closeCheatMenu(); return; }
    if (G.phase === 'lore') { pauseGame(); return; }
    if (G.phase === 'lore_paused') { resumeGame(); return; }
    if (G.phase === 'run') { pauseGame(); return; }
    if (G.phase === 'paused') {
      resumeGame();
      return;
    }
    closeCheatMenu();
  }
});

document.addEventListener('keyup', e => {
  if (e.key === 'Control') {
    if (_ctrlState === 'open') closeCtrlPanel();
    _ctrlState = 'idle';
    _ctrlHoldTimer = 0;
  }
});

// Keep typing input focused while game is running
typingEl?.addEventListener('blur', () => {
  if (G.touchMode || G.phase !== 'run' || G.ctrlPanelOpen) return;
  setTimeout(() => {
    if (G.phase !== 'run' || G.ctrlPanelOpen) return;
    const active = document.activeElement;
    // Let other inputs hold focus (dict search, cheat menu, pause, etc.)
    if (active && active !== typingEl && active.closest('#cheat-menu, #scr-pause, #book-panel, input, select, textarea')) return;
    _focusTypingInput();
  }, 50);
});

// Close ctrl panel when window loses focus (tab switch, alt-tab, etc.)
// In touch mode the panel is persistent - don't auto-close on blur.
window.addEventListener('blur', () => {
  // Always reset shift state on focus loss - prevents visual desync when caps/shift
  // is toggled outside the window (e.g. alt-tab with CapsLock on then turned off externally)
  if (_kbShift !== 'off') _setKbShift('off');
  if (G.touchMode) return;
  if (_ctrlState !== 'idle' || G.ctrlPanelOpen) {
    closeCtrlPanel();
    _ctrlState = 'idle';
    _ctrlHoldTimer = 0;
  }
});

/* ================================================================
   DOOR BUTTONS - fixed DOM buttons positioned over each door opening
================================================================ */
const DIR_DELTA_G = { N: [0,-1], S: [0,1], E: [1,0], W: [-1,0] };
const _doorBtns = {};

(function createDoorButtons() {
  for (const dir of ['N', 'S', 'E', 'W']) {
    const btn = document.createElement('button');
    btn.className = 'door-btn';
    btn.dataset.dir = dir;
    btn.style.display = 'none';
    btn.addEventListener('click', () => {
      if (G.phase !== 'run') return;
      const cell = currentCell();
      if (!cell?.connections.has(dir)) return;
      const [dc, dr] = DIR_DELTA_G[dir];
      const adjCol = ((cell.col + dc) + COLS) % COLS;
      const adjRow = ((cell.row + dr) + ROWS) % ROWS;
      const adj = getCell(adjCol, adjRow);
      if (!adj) return;
      if (adj.visited && G.mode === 'combat') {
        G.run.fleeCount = (G.run.fleeCount || 0) + 1;
        const fleeMsg = i18n('announce.flee');
        flashAnnounce(fleeMsg, '#ff8800');
        startFleeEffects(cell);
        G.mode = 'navigate';
      }
      // Small fee for using clickable doors
      if (G.run && G.clickableDoors) {
        G.run.wallet = Math.max(0, (G.run.wallet || 0) - 5);
        updateHudWallet();
      }
      navigateWithAnim(dir);
    });
    document.body.appendChild(btn);
    _doorBtns[dir] = btn;
  }
})();

function updateDoorButtons() {
  const alpha = G.doorLabelAlpha || 0;
  if (G.phase !== 'run' || !G.dungeon || alpha < 0.05) {
    for (const btn of Object.values(_doorBtns)) btn.style.display = 'none';
    return;
  }
  const cell = currentCell();
  const rect   = canvas.getBoundingClientRect();
  const cL = rect.left, cT = rect.top, cW = rect.width, cH = rect.height;
  const sx = cW / G.W, sy = cH / G.vH;
  const wallH    = Math.floor(G.vH * 0.13);
  const wallSide = Math.floor(G.W  * 0.05);
  const wallBot  = Math.floor(G.vH * 0.07);
  const doorW    = Math.min(90, G.W * 0.14);

  // Door bounding boxes in screen coords
  const DOOR_SCREEN = {
    N: { x1: cL + (G.W/2 - doorW/2)*sx, x2: cL + (G.W/2 + doorW/2)*sx, y1: cT,                        y2: cT + wallH*sy    },
    S: { x1: cL + (G.W/2 - doorW/2)*sx, x2: cL + (G.W/2 + doorW/2)*sx, y1: cT + (G.vH-wallBot)*sy,    y2: cT + cH          },
    E: { x1: cL + (G.W-wallSide)*sx,    x2: cL + cW,                    y1: cT + (G.vH/2-doorW/2)*sy,  y2: cT + (G.vH/2+doorW/2)*sy },
    W: { x1: cL,                        x2: cL + wallSide*sx,           y1: cT + (G.vH/2-doorW/2)*sy,  y2: cT + (G.vH/2+doorW/2)*sy },
  };
  for (const [dir, btn] of Object.entries(_doorBtns)) {
    if (!cell?.connections.has(dir)) { btn.style.display = 'none'; continue; }
    const [dc, dr] = DIR_DELTA_G[dir];
    const adjCol = ((cell.col + dc) + COLS) % COLS;
    const adjRow = ((cell.row + dr) + ROWS) % ROWS;
    const adj = getCell(adjCol, adjRow);
    const canGo = adj && (adj.visited || G.mode === 'navigate');
    if (!canGo) { btn.style.display = 'none'; continue; }

    // Open worlds hide the artwork only; the invisible hit targets remain in
    // the same positions as every other room.
    const d = DOOR_SCREEN[dir];
    btn.style.display = (G.clickableDoors || adj?.visited) ? 'block' : 'none';
    btn.style.left   = d.x1 + 'px';
    btn.style.top    = d.y1 + 'px';
    btn.style.width  = (d.x2 - d.x1) + 'px';
    btn.style.height = (d.y2 - d.y1) + 'px';
    btn.style.opacity = alpha;

    // Boss door tint: leads to boss room OR current room is boss
    const isBossDoor = adj.type === 'boss' || cell.type === 'boss';
    btn.classList.toggle('boss-door', isBossDoor);
  }
}

/* ================================================================
   MOBILE - visualViewport (verbatim from original)
================================================================ */
if ('visualViewport' in window) {
  function _applyVisualViewport() {
    const vvh = Math.floor(window.visualViewport.height);
    const oldVH = G.vH;
    if (vvh === oldVH) return;
    G.vH = vvh;
    const _dprVV = window.devicePixelRatio || 1;
    canvas.width   = Math.floor(G.W * _dprVV); canvas.height   = Math.floor(vvh * _dprVV);
    canvas.style.width = G.W + 'px'; canvas.style.height = vvh + 'px';
    wxCanvas.width = Math.floor(G.W * _dprVV); wxCanvas.height = Math.floor(vvh * _dprVV);
    wxCanvas.style.width = G.W + 'px'; wxCanvas.style.height = vvh + 'px';
    if (dnCanvas) {
      dnCanvas.width = Math.floor(G.W * _dprVV); dnCanvas.height = Math.floor(vvh * _dprVV);
      dnCanvas.style.width = G.W + 'px'; dnCanvas.style.height = vvh + 'px';
    }
    const kb = window.innerHeight - vvh;
    if (paEl) paEl.style.bottom = Math.max(0, kb) + 'px';
    if (oldVH > 0) {
      const ratio = vvh / oldVH;
      for (const m of (G.room?.monsters || [])) if (m.y > 0) m.y *= ratio;
    }
    document.body.style.height = vvh + 'px';
    window.scrollTo(0, 0);
  }
  window.visualViewport.addEventListener('resize', _applyVisualViewport);
  // Chrome mobile fires scroll (not resize) when the browser nav-bar appears/hides
  window.visualViewport.addEventListener('scroll', () => {
    window.scrollTo(0, 0);
    _applyVisualViewport();
  });
}

/* ================================================================
   TOUCH SWIPE
================================================================ */
(function() {
  let tx0 = 0, ty0 = 0, sw = false;
  document.addEventListener('touchstart', e => {
    if (G.phase !== 'run' || e.target === typingEl) return;
    const t = e.touches[0]; tx0 = t.clientX; ty0 = t.clientY; sw = true;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!sw || G.phase !== 'run') return; sw = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - tx0, dy = t.clientY - ty0;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx > ady && adx > 40) { if (G.inventory?.stacks?.length) { invNavigate(dx > 0 ? 1 : -1); refreshInventoryUI(); } }
    else if (ady > adx && dy > 40) { if (G.ctrlPanelOpen && G.inventory?.stacks?.length) { invUse(); refreshInventoryUI(); } }
  }, { passive: true });
})();

/* ================================================================
   KEEP FOCUS
================================================================ */
document.addEventListener('pointerdown', e => {
  _markRecentUserGesture();
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') _markRecentUserGesture();
});

document.addEventListener('pointerdown', e => {
  if (!typingEl || G.phase !== 'run') return;
  if (e.target === typingEl) return;
  if (e.target.closest('button, input, select, .menu-card, #cheat-menu, #map-panel, #book-panel')) return;
  if (G.touchMode) return;
  setTimeout(_focusTypingInput, 0);
});

/* ================================================================
   CHEAT MENU
================================================================ */
// The benchmark bot deliberately uses the same visible input and onInput()
// route as a human. It is a pacing test, not an alternate cheat kill path.
const _bot = {
  enabled: false,
  wpm: 100,
  autoMove: false,
  autoWorld: false,
  useItems: false,
  pickUpDrops: false,
  task: null,
  itemTask: null,
  uiTask: null,
  forcedDestination: null,
  hanjaPickupDecisions: new Map(),
  nextDecisionAt: 0,
  lastMode: null,
  lastRoomKey: '',
  stats: {
    startedAt: 0,
    jamoTyped: 0,
    wordsTyped: 0,
    idleMs: 0,
  },
  lastStatsPaintAt: 0,
};

// Deliberately centralized so playtesters can tune the bot's personality
// without having to chase conditionals through its decision loop.
const BOT_ITEM_THRESHOLDS = Object.freeze({
  critToughMonsters: 2,
  slowCrowd: 3,
  freezeCrowd: 4,
  cleaveCrowd: 4,
  greedyCrowd: 3,
  projectileInterruptSeconds: 3.25,
});

// Interface input is limited by perception and motor reaction, not just
// keyboard speed. Values are [fast 250 WPM, slow 20 WPM] in milliseconds.
const BOT_INTERFACE_TIMING = Object.freeze({
  openReaction: [300, 550],
  selectionScan: [230, 420],
  navigationStep: [160, 330],
  confirmUse: [220, 370],
  postUse: [220, 340],
  mapReview: [500, 850],
  screenOpenReaction: [360, 650],
  screenRead: [320, 600],
  screenClick: [180, 320],
  screenResult: [260, 480],
  screenClose: [180, 320],
  casinoSpin: [900, 1500],
  lessonRead: [1000, 1900],
  doorScan: [260, 480],
  nextDecision: [160, 280],
});

const BOT_ITEM_VALUE = Object.freeze({
  '🔑': 100, '📖': 96, '🏯': 94, '⚔️': 90, '🎯': 87,
  '⛺': 84, '💛': 82, '⏰': 78, '🔥': 75, '🛡️': 72,
  '❤️‍🩹': 70, '⏱️': 67, '🕳️': 64, '🤑': 61, '🎁': 59,
  '💣': 56, '⚡': 53, '🔇': 50, '🎲': 45, '📙': 0,
});

const BOT_PERMANENT_VALUE = Object.freeze({
  crystal_ball: 100, double_shot: 96, phoenix_heart: 94,
  wall_breaker: 91, ancient_scroll: 89, magnet: 87,
  punching_glove: 84, thorn_armor: 82, treasure: 79,
  block: 76, lucky: 73, god_run: 71, dummy_turtle: 68, sloth: 64,
});

function _botSetToggleButton(id, on) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.textContent = on ? 'ON' : 'OFF';
  btn.style.background = on ? '#27ae60' : '';
}

function _syncBotUi() {
  const slider = document.getElementById('c-bot-wpm');
  if (slider) slider.value = String(_bot.wpm);
  const value = document.getElementById('c-bot-wpm-val');
  if (value) value.textContent = `${_bot.wpm} WPM`;
  _botSetToggleButton('c-bot-toggle', _bot.enabled);
  _botSetToggleButton('c-bot-move', _bot.autoMove);
  _botSetToggleButton('c-bot-world', _bot.autoWorld);
  _botSetToggleButton('c-bot-items', _bot.useItems);
  _botSetToggleButton('c-bot-pickups', _bot.pickUpDrops);
}

function _resetBotStats() {
  _bot.stats = { startedAt: performance.now(), jamoTyped: 0, wordsTyped: 0, idleMs: 0 };
  _bot.lastStatsPaintAt = 0;
}

function _botEffectiveWpm(now = performance.now()) {
  const elapsed = Math.max(1000, now - (_bot.stats.startedAt || now));
  // Five jamo/keys is the familiar WPM unit; the bot's cadence itself is
  // driven by countJamoKeys(), not by visible Korean syllable count.
  return Math.round(_bot.stats.jamoTyped / 5 / (elapsed / 60000));
}

function _botInterfaceDelay(stage) {
  const [fast, slow] = BOT_INTERFACE_TIMING[stage] || BOT_INTERFACE_TIMING.selectionScan;
  const speedRatio = Math.max(0, Math.min(1, (_bot.wpm - 20) / 230));
  return Math.round(slow - (slow - fast) * speedRatio);
}

function _paintBotStats(now = performance.now()) {
  if (now - _bot.lastStatsPaintAt < 180) return;
  _bot.lastStatsPaintAt = now;
  const el = document.getElementById('c-bot-stats');
  if (!el) return;
  let state = 'Bot idle';
  if (_bot.enabled) {
    if (_bot.itemTask) state = `using ${_bot.itemTask.item}`;
    else if (_bot.uiTask) state = `visiting ${_bot.uiTask.kind}`;
    else if (_bot.task?.phase === 'erasing') state = 'retargeting';
    else if (_bot.task) state = `typing ${_bot.task.kind}`;
    else state = 'waiting';
  }
  el.textContent = `${state} · ${_botEffectiveWpm(now)} WPM · ${(_bot.stats.idleMs / 1000).toFixed(1)}s idle · ${_bot.stats.wordsTyped} inputs`;
}

function _clearBotTask({ clearInput = false } = {}) {
  _bot.task = null;
  _bot.itemTask = null;
  _bot.uiTask = null;
  _bot.forcedDestination = null;
  _bot.nextDecisionAt = performance.now() + 30;
  _bot.lastMode = G.mode;
  _bot.lastRoomKey = _botCellKey(currentCell());
  if (clearInput && typingEl) {
    typingEl.value = '';
    _imeCommitted = '';
    _imeComposer.reset();
    _updateEnterGlow();
  }
}

function _botMonsterById(id) {
  if (id == null) return null;
  return (G.room?.monsters || []).find(m => m.id === id && _isTargetableMonster(m)) || null;
}

function _botCanReadMonster(m) {
  const anim = m?.spawnAnim;
  return !anim || anim.t >= (anim.dur || 0) * 0.76;
}

function _botPlayerPosition() {
  const playerArea = document.getElementById('player-area');
  return {
    x: G.W * 0.5,
    y: G.vH - (playerArea ? playerArea.offsetHeight + 10 : 90) - 20,
  };
}

function _botThreatEta(m) {
  const player = _botPlayerPosition();
  const distance = Math.hypot((m.x || 0) - player.x, (m.y || 0) - player.y);
  const speed = Math.max(40, m.spd || m.baseSpd || 90);
  return distance / speed;
}

function _botIsKingMinion(m, monsters = G.room?.monsters || []) {
  if (!m?.parentId) return false;
  const parent = monsters.find(candidate => candidate.id === m.parentId);
  return parent?.type === 'boss' && parent.special === 'king';
}

function _botMonsterKind(m) {
  if (_botIsKingMinion(m)) return 'king minion';
  if (m?.isProjectileMonster) return 'projectile';
  return 'monster';
}

function _startBotTyping(word, kind, targetId = null) {
  if (!word || _bot.task || !typingEl) return false;
  const units = Array.from(word).map(char => ({
    char,
    keys: Math.max(1, countJamoKeys(char)),
  }));
  if (!units.length) return false;

  // Bot text is inserted syllable by syllable so the normal input listener can
  // exercise pre-spawn reservations before the synthetic Enter.
  _imeCommitted = '';
  _imeComposer.reset();
  typingEl.value = '';
  typingEl.dispatchEvent(new Event('input', { bubbles: true }));
  _bot.task = {
    phase: 'typing',
    kind,
    targetId,
    units,
    index: 0,
    text: '',
    nextAt: performance.now(),
  };
  return true;
}

function _startBotErase(target) {
  if (!target || !typingEl) return false;
  const units = Array.from(typingEl.value).map(char => ({
    char,
    keys: Math.max(1, countJamoKeys(char)),
  }));
  if (!units.length) {
    _bot.task = null;
    return _startBotTyping(target.word, _botMonsterKind(target), target.id);
  }

  _imeCommitted = '';
  _imeComposer.reset();
  _bot.task = {
    phase: 'erasing',
    kind: 'retarget',
    queuedTargetId: target.id,
    units,
    index: units.length,
    nextAt: performance.now(),
  };
  return true;
}

function _tickBotTyping(now) {
  const task = _bot.task;
  if (!task) return;
  const msPerJamo = 60000 / Math.max(1, _bot.wpm * 5);

  if (task.phase === 'erasing') {
    let safety = 0;
    while (task.index > 0 && now >= task.nextAt && safety++ < 8) {
      const unit = task.units[--task.index];
      typingEl.value = task.units.slice(0, task.index).map(entry => entry.char).join('');
      typingEl.setSelectionRange(typingEl.value.length, typingEl.value.length);
      typingEl.dispatchEvent(new Event('input', { bubbles: true }));
      _bot.stats.jamoTyped += unit.keys;
      task.nextAt += Math.max(12, unit.keys * msPerJamo);
    }
    if (task.index > 0 || now < task.nextAt + 35) return;

    const target = _botMonsterById(task.queuedTargetId) || _botTarget();
    _bot.task = null;
    if (target) _startBotTyping(target.word, _botMonsterKind(target), target.id);
    else _bot.nextDecisionAt = now + 35;
    return;
  }

  let safety = 0;
  while (task.index < task.units.length && now >= task.nextAt && safety++ < 8) {
    const unit = task.units[task.index++];
    task.text += unit.char;
    typingEl.value = task.text;
    typingEl.setSelectionRange(task.text.length, task.text.length);
    typingEl.dispatchEvent(new Event('input', { bubbles: true }));
    _bot.stats.jamoTyped += unit.keys;
    task.nextAt += Math.max(12, unit.keys * msPerJamo);
  }

  if (task.index < task.units.length || now < task.nextAt + 35) return;
  const typedKind = task.kind;
  const typedTargetId = task.targetId;
  _bot.task = null;
  _bot.stats.wordsTyped++;
  onInput();
  // Once the last chosen ground item is actually collected, pause before
  // looking for a door instead of snapping straight into the next room.
  if (typedKind === 'pickup' && typedTargetId != null
    && !(G.room?.groundItems || []).some(item => item.id === typedTargetId)
    && !_botNextPickup()) {
    _botQueueDoorScan(now);
  }
  const inputRecovery = typedKind === 'direction' ? 90 : 35;
  _bot.nextDecisionAt = Math.max(_bot.nextDecisionAt, now + inputRecovery);
}

function _botTarget() {
  const monsters = (G.room?.monsters || []).filter(m => _isTargetableMonster(m) && _botCanReadMonster(m));
  if (!monsters.length) return null;

  // King's ninja wave is intentionally tagged as a projectile monster in the
  // combat system. It must always win over the boss itself, otherwise the King
  // becomes untargetable while the bot keeps wasting a typed word on it.
  const kingMinions = monsters.filter(m => _botIsKingMinion(m, monsters));
  if (kingMinions.length) {
    return kingMinions.reduce((best, m) => _botThreatEta(m) < _botThreatEta(best) ? m : best);
  }

  const projectiles = monsters.filter(m => m.isProjectileMonster);
  if (projectiles.length) {
    return projectiles.reduce((best, m) => _botThreatEta(m) < _botThreatEta(best) ? m : best);
  }

  const regular = monsters.filter(m => m.type !== 'boss');
  if (regular.length) return regular.reduce((best, m) => (m.y > best.y ? m : best));
  return monsters.reduce((best, m) => (m.y > best.y ? m : best));
}

function _botShouldInterrupt(task, target) {
  if (task?.phase !== 'typing' || !task.targetId || !target || task.targetId === target.id) return false;
  const activeTarget = _botMonsterById(task.targetId);
  if (!activeTarget) return true;

  // A King minion is a hard interrupt: the boss is waiting for this exact
  // target to die, and those minions move significantly faster than normals.
  if (_botIsKingMinion(target)) return true;
  if (target.isProjectileMonster) {
    return _botThreatEta(target) <= BOT_ITEM_THRESHOLDS.projectileInterruptSeconds;
  }

  // A non-boss that has reached the player lane also interrupts a boss word.
  const player = _botPlayerPosition();
  return activeTarget.type === 'boss'
    && target.type !== 'boss'
    && target.y >= player.y - 150;
}

function _botCellKey(cell) {
  return cell ? cell.col + ',' + cell.row : '';
}

const _BOT_DIR_DELTA = { N:[0,-1], E:[1,0], S:[0,1], W:[-1,0] };
const _BOT_SPECIAL_PRIORITY = { modifier: 5, treasure: 4, shop: 3, casino: 2, teacher: 1 };

function _botNeighbour(cell, dir) {
  const [dc, dr] = _BOT_DIR_DELTA[dir] || [0, 0];
  let col = cell.col + dc;
  let row = cell.row + dr;
  if (G.run?.wallBreaker) {
    col = (col + COLS) % COLS;
    row = (row + ROWS) % ROWS;
  }
  return getCell(col, row);
}

function _botPathToCell(target) {
  const start = currentCell();
  if (!start || !target) return null;
  const startKey = _botCellKey(start);
  const targetKey = _botCellKey(target);
  if (startKey === targetKey) return { dir: null, distance: 0 };

  const visited = new Map([[startKey, { from: null, dir: null, distance: 0 }]]);
  const queue = [start];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const cell = queue[queueIndex++];
    if (_botCellKey(cell) === targetKey) break;
    for (const dir of cell.connections || []) {
      const next = _botNeighbour(cell, dir);
      const nextKey = _botCellKey(next);
      if (!next || visited.has(nextKey)) continue;
      visited.set(nextKey, {
        from: _botCellKey(cell),
        dir,
        distance: (visited.get(_botCellKey(cell))?.distance || 0) + 1,
      });
      queue.push(next);
    }
  }
  if (!visited.has(targetKey)) return null;

  let cursor = targetKey;
  let step = visited.get(cursor);
  while (step?.from && step.from !== startKey) {
    cursor = step.from;
    step = visited.get(cursor);
  }
  return { dir: step?.dir || null, distance: visited.get(targetKey)?.distance || 0 };
}

function _botTeacherHasStartableLesson(cell) {
  if (!cell || cell._botHandled || G.playerHP < G.playerMax) return false;
  const lesson = cell.currentLesson || getNextLesson(G.completedLessons || []);
  if (!lesson || (G.completedLessons || []).includes(lesson.id)) return false;
  try {
    const timestamps = JSON.parse(localStorage.getItem('krr_lesson_cooldowns') || '{}');
    const timestamp = timestamps[G.run?.worldIdx];
    return timestamp === undefined || Date.now() - timestamp >= 31 * 60 * 1000;
  } catch {
    return true;
  }
}

function _botCellNeedsVisit(cell) {
  if (!cell || cell._botHandled) return false;
  switch (cell.type) {
    case 'shop':     return true;
    case 'modifier': return !cell.rewardCollected;
    case 'treasure': return !cell.rewardCollected;
    case 'casino':   return !cell.casinoUsed;
    case 'teacher':  return _botTeacherHasStartableLesson(cell);
    default:         return false;
  }
}

function _botCellIsVisible(cell) {
  return !!(cell?.type === 'shop' || cell?.type === 'casino'
    || cell?.visited || cell?.guideRevealed || G.run?.mapRevealed);
}

function _botNearestSpecial(candidates) {
  let best = null;
  for (const cell of candidates) {
    const path = _botPathToCell(cell);
    if (!path) continue;
    const priority = _BOT_SPECIAL_PRIORITY[cell.type] || 0;
    if (!best || path.distance < best.path.distance
      || (path.distance === best.path.distance && priority > best.priority)) {
      best = { cell, path, priority };
    }
  }
  return best;
}

function _botForcedDestination() {
  const intent = _bot.forcedDestination;
  if (!intent || intent.worldIdx !== G.run?.worldIdx) {
    _bot.forcedDestination = null;
    return null;
  }
  const cell = getCell(intent.col, intent.row);
  if (!cell || (intent.type === 'casino' && cell.casinoUsed)) {
    _bot.forcedDestination = null;
    return null;
  }
  return cell;
}

function _botSetMasterKeyIntent() {
  const grid = G.dungeon?.grid || [];
  const casino = grid.find(cell => cell.type === 'casino' && !cell.visited && !cell.casinoUsed);
  const target = casino || grid.find(cell => cell.type === 'boss');
  if (!target) return;
  _bot.forcedDestination = {
    type: casino ? 'casino' : 'boss',
    col: target.col,
    row: target.row,
    worldIdx: G.run?.worldIdx,
  };
}

function _botAutoMoveDestination() {
  const start = currentCell();
  if (!start) return null;

  // Night-time rest takes precedence over loot and boss routing. A tent is a
  // reusable safe point, so do not burn another tent item when one is already
  // reachable in this world.
  const sleepTent = _botNearestTentToSleep();
  if (sleepTent && _botCellKey(sleepTent) !== _botCellKey(start)) return sleepTent;

  const forced = _botForcedDestination();
  if (forced) return forced;

  // A bright special door can be recognized when it is adjacent, even before
  // the map has revealed the rest of the dungeon.
  const adjacent = [];
  for (const dir of start.connections || []) {
    const cell = _botNeighbour(start, dir);
    if (_botCellNeedsVisit(cell)) adjacent.push(cell);
  }
  const direct = _botNearestSpecial(adjacent);
  if (direct) return direct.cell;

  const knownSpecials = (G.dungeon?.grid || []).filter(cell =>
    _botCellNeedsVisit(cell) && _botCellIsVisible(cell)
  );
  const visible = _botNearestSpecial(knownSpecials);
  if (visible) return visible.cell;

  return (G.dungeon?.grid || []).find(cell => cell.type === 'boss') || null;
}

function _botDirectionToBoss() {
  const boss = (G.dungeon?.grid || []).find(cell => cell.type === 'boss');
  return _botPathToCell(boss)?.dir || null;
}

function _botDirectionToAutoMove() {
  return _botPathToCell(_botAutoMoveDestination())?.dir || null;
}

function _botRoomHasNoLiveMonsters() {
  return !(G.room?.monsters || []).some(m => !m.dead && !m.fleeing && !m.defeatCommitted);
}

function _botQueueDoorScan(now) {
  _bot.nextDecisionAt = Math.max(
    _bot.nextDecisionAt || 0,
    now + _botInterfaceDelay('doorScan'),
  );
}

function _botObserveRoomClear(now) {
  const roomKey = _botCellKey(currentCell());
  const justUnlockedThisRoom = _bot.lastMode === 'combat'
    && _bot.lastRoomKey === roomKey
    && G.mode === 'navigate'
    && (G.room?.exitUnlocked || G.room?.wPhase === 'clear');
  if (justUnlockedThisRoom) _botQueueDoorScan(now);
  _bot.lastMode = G.mode;
  _bot.lastRoomKey = roomKey;
}

function _botNextPickup() {
  if (!_bot.pickUpDrops || G.mode !== 'navigate' || !_botRoomHasNoLiveMonsters()) return null;
  const roomKey = _botCellKey(currentCell());
  for (const groundItem of G.room?.groundItems || []) {
    const pickupKey = roomKey + ':' + groundItem.id;
    if (groundItem.isHanja) {
      if (!_bot.hanjaPickupDecisions.has(pickupKey)) {
        _bot.hanjaPickupDecisions.set(pickupKey, Math.random() < 0.5);
      }
      if (!_bot.hanjaPickupDecisions.get(pickupKey)) continue;
    }
    const word = groundItem.keys?.[groundItem.keyIdx];
    if (word) return { word, id: groundItem.id };
  }
  return null;
}

function _botItemStack(item) {
  return (G.inventory?.stacks || []).find(stack => stack.item === item) || null;
}

function _botItemCount(item) {
  return _botItemStack(item)?.count || 0;
}

function _botItemReady(item) {
  if (!_botItemStack(item) || (G.run?._itemUseLock || 0) > 0) return false;
  return (G.run?.itemCooldowns?.[item] || 0) <= 0;
}

function _botWorldHasDayNightCycle() {
  return !G.dungeon?.worldDef?.fixedLighting;
}

function _botIsNight() {
  if (!_botWorldHasDayNightCycle()) return false;
  const hour = ((G.gameTime || 0) % 420) / 420 * 24;
  return hour >= 20 || hour < 6;
}

function _botNearestTentToSleep() {
  if (!_bot.useItems || !_botWorldHasDayNightCycle() || !_botIsNight()
    || (G.run?.tentCooldown || 0) > 0) return null;

  let best = null;
  for (const cell of G.dungeon?.grid || []) {
    if (!cell.isTent) continue;
    const path = _botPathToCell(cell);
    if (!path || (best && path.distance >= best.path.distance)) continue;
    best = { cell, path };
  }
  return best?.cell || null;
}

function _botNeedsNewTentHere() {
  const cell = currentCell();
  return _bot.useItems
    && _botWorldHasDayNightCycle()
    && _botIsNight()
    && (G.run?.tentCooldown || 0) <= 0
    && _botItemCount('⛺') > 0
    && cell?.type === 'normal'
    && !cell.isTent
    && !G.room?.npc
    && !_botNearestTentToSleep();
}

function _botCanPitchTentHere() {
  return _botNeedsNewTentHere()
    && G.mode === 'navigate'
    && G.room?.wPhase === 'clear'
    && _botItemReady('⛺');
}

function _botShouldWaitForTentClear() {
  return _botNeedsNewTentHere()
    && G.mode === 'navigate'
    && G.room?.wPhase !== 'clear';
}

function _botCanSleepAtCurrentTent(npc = G.room?.npc) {
  const cell = currentCell();
  return _bot.useItems
    && _botWorldHasDayNightCycle()
    && _botIsNight()
    && (G.run?.tentCooldown || 0) <= 0
    && G.mode === 'navigate'
    && cell?.isTent
    && npc?.active
    && npc.type === 'tent'
    && !!npc.word;
}

function _botFindItemToUse() {
  if (!_bot.useItems || !G.run || (G.run._itemUseLock || 0) > 0) return null;
  const canUse = item => _botItemReady(item);
  const cell = currentCell();
  const monsters = (G.room?.monsters || []).filter(m => _isTargetableMonster(m));
  const crowd = monsters.length;
  const tough = monsters.filter(m => (m.hp || 0) > 2).length;

  // Camp before any teleporting or other backpack action. The predicate
  // mirrors the item's real usability check, not the early hyper-typing exit.
  if (_botCanPitchTentHere()) return '⛺';

  // Movement-changing items are deliberately used from a safe room state.
  if (canUse('🏯')) return '🏯';
  if (canUse('🔑')) return '🔑';
  if (canUse('📖')
    && !G.run.mapRevealed
    && !(G.run.permanents || []).includes('crystal_ball')
    && (G.dungeon?.grid || []).some(room => room
      && (room.isTent || (room.type !== 'normal' && room.type !== 'boss'))
      && !room.visited && !room.guideRevealed)) return '📖';
  if (canUse('🕳️')) return '🕳️';

  if (canUse('💛') && G.playerMax < 100) return '💛';
  if (canUse('❤️‍🩹') && G.playerMax - G.playerHP >= 2) return '❤️‍🩹';

  // These two are safe buffers, so the bot keeps them up whenever possible.
  if (canUse('🎁')) return '🎁';
  if (canUse('🛡️')) return '🛡️';

  if (G.mode !== 'combat') return null;
  if (canUse('🔇') && !G.room?.noiseCancelled && monsters.some(m => m.special === 'musician')) return '🔇';
  if (canUse('⚔️') && crowd >= BOT_ITEM_THRESHOLDS.cleaveCrowd && !cell?._botCleaveUsed) return '⚔️';
  if (canUse('🎯') && !G.autokillBubble) return '🎯';
  if (canUse('⏰') && crowd >= BOT_ITEM_THRESHOLDS.freezeCrowd) return '⏰';
  if (canUse('⏱️') && crowd >= BOT_ITEM_THRESHOLDS.slowCrowd) return '⏱️';
  if (canUse('🔥') && tough >= BOT_ITEM_THRESHOLDS.critToughMonsters) return '🔥';
  if (canUse('🤑') && crowd >= BOT_ITEM_THRESHOLDS.greedyCrowd && !cell?._botGreedyUsed) return '🤑';

  // These were not given an explicit threshold in the brief. The bot treats
  // them as last-resort crowd-control rather than letting them gather dust.
  if (canUse('💣') && crowd >= 3) return '💣';
  if (canUse('⚡') && crowd >= 3 && !G.stunBubble) return '⚡';
  if (canUse('🎲')) return '🎲';
  return null; // 📙 is intentionally ignored by the bot.
}

function _botAfterItemUse(item) {
  const cell = currentCell();
  if (item === '🔑') _botSetMasterKeyIntent();
  if (item === '⚔️' && cell) cell._botCleaveUsed = true;
  if (item === '🤑' && cell) cell._botGreedyUsed = true;
}

function _botBeginItemUse(item, now) {
  if (!item || _bot.itemTask || G.ctrlPanelOpen) return false;
  if (!_botItemReady(item)) return false;
  _bot.itemTask = { item, stage: 'open', nextAt: now };
  return true;
}

function _botFinishItemTask(now) {
  const item = _bot.itemTask?.item;
  if (G.ctrlPanelOpen) closeCtrlPanel();
  if (item === '🔑' || item === '📖') {
    document.getElementById('map-panel')?.classList.add('off');
  }
  _bot.itemTask = null;
  _bot.nextDecisionAt = now + _botInterfaceDelay('nextDecision');
}

function _tickBotItemTask(now) {
  const task = _bot.itemTask;
  if (!task || now < task.nextAt) return;

  if (task.stage === 'open') {
    openCtrlPanel();
    task.stage = 'select';
    task.nextAt = now + _botInterfaceDelay('openReaction');
    return;
  }

  if (task.stage === 'select') {
    const stacks = G.inventory?.stacks || [];
    const targetIndex = stacks.findIndex(stack => stack.item === task.item);
    if (targetIndex < 0) {
      _botFinishItemTask(now);
      return;
    }
    const selectedIndex = G.inventory.sel || 0;
    if (selectedIndex !== targetIndex) {
      const forward = (targetIndex - selectedIndex + stacks.length) % stacks.length;
      const backward = (selectedIndex - targetIndex + stacks.length) % stacks.length;
      invNavigate(forward <= backward ? 1 : -1);
      refreshCtrlInv();
      task.nextAt = now + _botInterfaceDelay('navigationStep');
      return;
    }
    task.stage = 'confirm';
    task.nextAt = now + _botInterfaceDelay('selectionScan');
    return;
  }

  if (task.stage === 'confirm') {
    task.stage = 'use';
    task.nextAt = now + _botInterfaceDelay('confirmUse');
    return;
  }

  if (task.stage === 'use') {
    // The final projectile can leave the room in navigate mode before its
    // impact runs. Do not attempt camp placement until that impact marks the
    // room genuinely clear; this also makes a stale backpack task harmless.
    if (task.item === '⛺' && !_botCanPitchTentHere()) {
      _botFinishItemTask(now);
      return;
    }
    if ((G.run?._itemUseLock || 0) > 0) {
      task.nextAt = now + 120;
      return;
    }
    const stack = _botItemStack(task.item);
    const before = stack?.count || 0;
    invUse();
    refreshCtrlInv();
    if ((stack?.count || 0) < before) _botAfterItemUse(task.item);
    if (G.inTransition || G.worldTransition) {
      _botFinishItemTask(now);
      return;
    }
    task.stage = 'close';
    const postUseStage = task.item === '🔑' || task.item === '📖' ? 'mapReview' : 'postUse';
    task.nextAt = now + _botInterfaceDelay(postUseStage);
    return;
  }

  _botFinishItemTask(now);
}

function _botConsumableUtility(item) {
  if (item === '📙') return Number.NEGATIVE_INFINITY;
  if (item === '⛺' && _botItemCount(item) >= 1) return Number.NEGATIVE_INFINITY;
  if (item === '❤️‍🩹' && _botItemCount(item) >= 3) return Number.NEGATIVE_INFINITY;

  let value = BOT_ITEM_VALUE[item] || 30;
  if (item === '⛺' && _botItemCount(item) === 0) value += 300;
  if (item === '❤️‍🩹') value += (3 - _botItemCount(item)) * 80;
  return value;
}

function _botEffectiveShopPrice(entry) {
  if (entry.type !== 'consumable') return entry.basePrice || entry.price || 0;
  return Math.round((entry.basePrice || entry.price || 0) * Math.pow(2, _botItemCount(entry.itemKey)));
}

function _botShopUtility(entry) {
  if (entry.type === 'modifier') {
    if ((G.run?.permanents || []).includes(entry.permId)) return Number.NEGATIVE_INFINITY;
    const firstModifierBonus = (G.run?.permanents || []).length === 0 ? 400 : 0;
    return 300 + firstModifierBonus + (BOT_PERMANENT_VALUE[entry.permId] || 50);
  }
  return _botConsumableUtility(entry.itemKey);
}

function _botChooseShopPurchase(cell) {
  const wallet = G.run?.wallet || 0;
  const choices = (cell?._shopInventory || [])
    .map(entry => ({ entry, price: _botEffectiveShopPrice(entry), utility: _botShopUtility(entry) }))
    .filter(choice => choice.price <= wallet && choice.utility > 0);
  choices.sort((a, b) => b.utility - a.utility || a.price - b.price);
  return choices[0] || null;
}

function _botChooseModifierChoice(cell) {
  const choices = cell?.itemChoices || [];
  const unownedModifiers = choices
    .map((choice, index) => ({ choice, index }))
    .filter(entry => entry.choice.type === 'permanent'
      && !(G.run?.permanents || []).includes(entry.choice.item.id));
  const candidates = unownedModifiers.length
    ? unownedModifiers
    : choices.map((choice, index) => ({ choice, index }));
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aValue = a.choice.type === 'permanent'
      ? (BOT_PERMANENT_VALUE[a.choice.item.id] || 50)
      : _botConsumableUtility(a.choice.itemKey);
    const bValue = b.choice.type === 'permanent'
      ? (BOT_PERMANENT_VALUE[b.choice.item.id] || 50)
      : _botConsumableUtility(b.choice.itemKey);
    return bValue - aValue;
  });
  return candidates[0].index;
}

function _botScreenOpen(id) {
  const screen = document.getElementById(id);
  return !!screen && !screen.classList.contains('off');
}

function _botMarkSpecialHandled(cell, now) {
  if (cell) cell._botHandled = true;
  if (G.room?.npc?.cell === cell) G.room.npc.active = false;
  _bot.uiTask = null;
  _bot.nextDecisionAt = now + _botInterfaceDelay('doorScan');
}

function _botMaybeStartUiTask(now) {
  if (!_bot.autoMove || _bot.uiTask) return false;
  const cell = currentCell();
  if (!cell) return false;
  const screens = [
    ['shop', 'scr-shop'],
    ['modifier', 'scr-modifier'],
    ['treasure', 'scr-treasure'],
    ['casino', 'scr-casino'],
    ['teacher', 'scr-teacher'],
  ];
  const activeScreen = screens.find(([kind, id]) => kind === cell.type && _botScreenOpen(id));
  if (!activeScreen) return false;
  // A modal appearing is not an instant decision. Even a fast typer needs a
  // beat to register which screen opened before moving the cursor/selection.
  _bot.uiTask = {
    kind: activeScreen[0],
    cell,
    stage: 'scan',
    nextAt: now + _botInterfaceDelay('screenOpenReaction'),
    purchases: 0,
  };
  return true;
}

function _scrollTeacherLessonToEnd() {
  const viewer = document.querySelector('#scr-teacher .lesson-viewer');
  if (!viewer) return false;

  // .lesson-viewer has content-height on desktop, while its .menu-card is the
  // actual scroll container. On a constrained layout the viewer itself can
  // become scrollable, so move both possible owners and let the overflowing
  // one visibly animate.
  const scrollTargets = [viewer, viewer.closest('#scr-teacher .menu-card')]
    .filter((el, index, all) => el && all.indexOf(el) === index);
  for (const target of scrollTargets) {
    const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
    if (typeof target.scrollTo === 'function') {
      target.scrollTo({ top: maxScroll, behavior: 'smooth' });
    } else {
      target.scrollTop = maxScroll;
    }
    target.dispatchEvent(new Event('scroll', { bubbles: true }));
  }
  return true;
}

function _tickBotUiTask(now) {
  const task = _bot.uiTask;
  if (!task || now < task.nextAt) return;
  if (_botCellKey(currentCell()) !== _botCellKey(task.cell)) {
    _bot.uiTask = null;
    _bot.nextDecisionAt = now + _botInterfaceDelay('nextDecision');
    return;
  }

  if (task.kind === 'shop') {
    if (task.stage === 'scan') {
      const purchase = task.purchases < 5 ? _botChooseShopPurchase(task.cell) : null;
      if (!purchase) {
        task.stage = 'leave';
        task.nextAt = now + _botInterfaceDelay('screenClose');
        return;
      }
      task.purchase = purchase;
      task.stage = 'buy';
      task.nextAt = now + _botInterfaceDelay('screenClick');
      return;
    }
    if (task.stage === 'buy') {
      const purchase = task.purchase;
      task.purchase = null;
      if (purchase && shopBuy(task.cell, purchase.entry, purchase.price)) {
        task.purchases++;
        renderShopScreen(task.cell);
        task.stage = 'scan';
        task.nextAt = now + _botInterfaceDelay('screenRead');
        return;
      }
    }
    window.closeRunShop?.();
    _botMarkSpecialHandled(task.cell, now);
    return;
  }

  if (task.kind === 'modifier') {
    if (task.stage === 'scan') {
      const choiceIndex = _botChooseModifierChoice(task.cell);
      if (choiceIndex === null) {
        task.stage = 'close';
        task.nextAt = now + _botInterfaceDelay('screenClose');
        return;
      }
      task.choiceIndex = choiceIndex;
      task.stage = 'choose';
      task.nextAt = now + _botInterfaceDelay('screenClick');
      return;
    }
    if (task.stage === 'choose') {
      const cards = document.querySelectorAll('#modifier-choices .item-choice-card');
      const card = cards[task.choiceIndex];
      if (card) card.click();
      else pickModifierItem(task.cell, task.choiceIndex);
      task.stage = 'result';
      task.nextAt = now + _botInterfaceDelay('screenResult');
      return;
    }
    document.getElementById('modifier-skip')?.click();
    _botMarkSpecialHandled(task.cell, now);
    return;
  }

  if (task.kind === 'treasure') {
    if (task.stage === 'scan') {
      task.stage = task.cell.rewardCollected ? 'close' : 'collect';
      task.nextAt = now + _botInterfaceDelay(task.cell.rewardCollected ? 'screenClose' : 'screenClick');
      return;
    }
    if (task.stage === 'collect') {
      const collect = document.getElementById('treasure-collect');
      if (collect) collect.click();
      else collectTreasure(task.cell);
      task.stage = 'result';
      task.nextAt = now + _botInterfaceDelay('screenResult');
      return;
    }
    window.closeTreasure?.();
    _botMarkSpecialHandled(task.cell, now);
    return;
  }

  if (task.kind === 'casino') {
    if (task.stage === 'scan') {
      // Let the reels be visible for a moment; a player has to react to a
      // moving screen before deciding when to stop it.
      task.stage = 'stop';
      task.nextAt = now + _botInterfaceDelay('casinoSpin');
      return;
    }
    if (task.stage === 'stop') {
      const stop = document.getElementById('casino-stop-btn');
      if (!stop || stop.classList.contains('hidden')) {
        task.nextAt = now + _botInterfaceDelay('screenRead');
        return;
      }
      stop.click();
      task.stage = 'review-result';
      task.nextAt = now + _botInterfaceDelay('screenResult');
      return;
    }
    if (task.stage === 'review-result') {
      task.stage = 'accept';
      task.nextAt = now + _botInterfaceDelay('screenClick');
      return;
    }
    if (task.stage === 'accept') {
      const accept = document.getElementById('casino-accept-btn');
      if (!accept || accept.classList.contains('hidden')) {
        task.nextAt = now + _botInterfaceDelay('screenRead');
        return;
      }
      accept.click();
      task.stage = 'result';
      task.nextAt = now + _botInterfaceDelay('screenResult');
      return;
    }
    _botMarkSpecialHandled(task.cell, now);
    return;
  }

  if (task.kind === 'teacher') {
    if (task.stage === 'scan') {
      const start = document.getElementById('btn-start-lesson');
      if (!start || start.classList.contains('disabled')) {
        task.stage = 'close';
        task.nextAt = now + _botInterfaceDelay('screenClose');
        return;
      }
      task.stage = 'start';
      task.nextAt = now + _botInterfaceDelay('screenClick');
      return;
    }
    if (task.stage === 'start') {
      const start = document.getElementById('btn-start-lesson');
      if (!start || start.classList.contains('disabled')) {
        task.stage = 'close';
        task.nextAt = now + _botInterfaceDelay('screenClose');
        return;
      }
      start.click();
      const readDuration = _botInterfaceDelay('lessonRead');
      task.lessonReadEndsAt = now + readDuration;
      // A real player usually reads the top first, performs one decisive
      // scroll through the lesson, then spends the remaining beat orienting at
      // the bottom before confirming that they understood it.
      task.stage = 'lesson-midpoint';
      task.nextAt = now + Math.round(readDuration / 2);
      return;
    }
    if (task.stage === 'lesson-midpoint') {
      if (!_scrollTeacherLessonToEnd()) {
        task.stage = 'close';
        task.nextAt = now + _botInterfaceDelay('screenClose');
        return;
      }
      task.stage = 'lesson-bottom-read';
      task.nextAt = Math.max(now, task.lessonReadEndsAt || now);
      return;
    }
    if (task.stage === 'lesson-bottom-read') {
      task.stage = 'understood';
      task.nextAt = now + _botInterfaceDelay('screenClick');
      return;
    }
    if (task.stage === 'understood') {
      document.getElementById('btn-lesson-done')?.click();
      task.stage = 'close';
      task.nextAt = now + _botInterfaceDelay('screenResult');
      return;
    }
    window.closeTeacherScreen?.();
    _botMarkSpecialHandled(task.cell, now);
  }
}

function _tickBot(dt) {
  if (!_bot.enabled) return;
  if (G.mp?.active) {
    _bot.enabled = false;
    _clearBotTask({ clearInput: true });
    _syncBotUi();
    flashAnnounce('🤖 Bot is single-player only', '#ff8844');
    return;
  }
  const now = performance.now();
  if (G.phase !== 'run' || G.inTransition || G.transition || G.worldTransition || G.frozen) {
    // World Skip and Wormhole can start a transition from the backpack. Do
    // not leave that panel open across a freshly created room.
    if (_bot.itemTask && G.ctrlPanelOpen) _botFinishItemTask(now);
    _paintBotStats(now);
    return;
  }

  _botObserveRoomClear(now);

  if (_bot.itemTask) {
    _tickBotItemTask(now);
    _paintBotStats(now);
    return;
  }
  if (_bot.uiTask || _botMaybeStartUiTask(now)) {
    _tickBotUiTask(now);
    _paintBotStats(now);
    return;
  }
  // A manually opened backpack should still pause the bot. Its own backpack
  // task is handled above and is allowed to advance while time is paused.
  if (G.ctrlPanelOpen) {
    _paintBotStats(now);
    return;
  }

  if (_bot.task) {
    if (G.mode === 'combat') {
      const threat = _botTarget();
      if (_botShouldInterrupt(_bot.task, threat)) _startBotErase(threat);
    }
    _tickBotTyping(now);
    _paintBotStats(now);
    return;
  }
  if (now < _bot.nextDecisionAt) {
    _paintBotStats(now);
    return;
  }

  const npc = G.room?.npc;
  if (_botCanSleepAtCurrentTent(npc)) {
    _startBotTyping(npc.word, 'tent');
    _paintBotStats(now);
    return;
  }

  // A fired final monster unlocks doors early for real hypertypers. A tent
  // cannot be placed until the visible impact has cleared the room, however,
  // so wait here instead of repeatedly opening the backpack and failing.
  if (_botShouldWaitForTentClear()) {
    _bot.stats.idleMs += dt * 1000;
    _paintBotStats(now);
    return;
  }

  // If a camp already exists, sleeping there is more valuable than picking up
  // loot, shopping, or using a movement item. Auto-move performs the trip;
  // when it is disabled the bot deliberately leaves movement to the player.
  const sleepTent = _botNearestTentToSleep();
  if (G.mode === 'navigate' && _bot.autoMove && sleepTent
    && _botCellKey(sleepTent) !== _botCellKey(currentCell())) {
    const dir = _botPathToCell(sleepTent)?.dir;
    if (dir) _startBotTyping(DIR_NAMES[dir] || dir, 'direction');
    else _bot.stats.idleMs += dt * 1000;
    _paintBotStats(now);
    return;
  }

  const item = _botFindItemToUse();
  if (_botBeginItemUse(item, now)) {
    _paintBotStats(now);
    return;
  }

  if (G.mode === 'combat') {
    const target = _botTarget();
    if (target) _startBotTyping(target.word, _botMonsterKind(target), target.id);
    else _bot.stats.idleMs += dt * 1000;
  } else if (G.mode === 'navigate') {
    const pickup = _botNextPickup();
    if (pickup) {
      _startBotTyping(pickup.word, 'pickup', pickup.id);
      _paintBotStats(now);
      return;
    }

    if (_bot.autoWorld && npc?.active && npc.type === 'next_world') {
      _startBotTyping(npc.word, 'world');
    } else if (_bot.autoMove && npc?.active && _botCellNeedsVisit(currentCell())) {
      _startBotTyping(npc.word, npc.type);
    } else if (_bot.autoMove) {
      const dir = _botDirectionToAutoMove();
      if (dir) _startBotTyping(DIR_NAMES[dir] || dir, 'direction');
      else _bot.stats.idleMs += dt * 1000;
    }
  }
  _paintBotStats(now);
}

function buildCheatMenu() {
  const shortcut = document.getElementById('cheat-run-shortcut');
  if (shortcut) {
    shortcut.onclick = event => {
      event.preventDefault();
      openCheatMenu();
    };
  }

  // Tab switching via event delegation
  document.addEventListener('click', e => {
    const tab = e.target.closest('#cheat-tabs .cheat-tab');
    if (!tab) return;
    const panelId = tab.dataset.cheatTab;
    document.querySelectorAll('#cheat-tabs .cheat-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('#cheat-menu .cheat-panel').forEach(p => p.classList.toggle('active', p.id === `cheat-panel-${panelId}`));
    if (panelId === 'room') _syncRoomColorInputs();
    if (panelId === 'bot') _syncBotUi();
  });
}

let _cheatOpenedWhileRunning = false;
let _cheatShortcutUnlockedThisRun = false;

function _syncCheatRunShortcut() {
  const shortcut = document.getElementById('cheat-run-shortcut');
  if (!shortcut) return;
  const isActiveRun = G.phase === 'run' || G.phase === 'paused';
  shortcut.hidden = !_cheatShortcutUnlockedThisRun || !isActiveRun;
}

function _resetCheatRunState() {
  _cheatOpenedWhileRunning = false;
  _cheatShortcutUnlockedThisRun = false;

  document.getElementById('cheat-menu')?.classList.remove('on');
  document.body.classList.remove('cheat-open');
  G.godMode = false;
  G.autoShoot = false;

  _bot.enabled = false;
  _bot.wpm = 100;
  _bot.autoMove = false;
  _bot.autoWorld = false;
  _bot.useItems = false;
  _bot.pickUpDrops = false;
  _bot.task = null;
  _bot.itemTask = null;
  _bot.uiTask = null;
  _bot.forcedDestination = null;
  _bot.hanjaPickupDecisions.clear();
  _bot.nextDecisionAt = 0;
  _bot.lastMode = null;
  _bot.lastRoomKey = '';
  _resetBotStats();

  _botSetToggleButton('c-god', false);
  _botSetToggleButton('c-auto', false);
  _syncBotUi();
  _paintBotStats();

  document.querySelectorAll('#cheat-tabs .cheat-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.cheatTab === 'game');
  });
  document.querySelectorAll('#cheat-menu .cheat-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === 'cheat-panel-game');
  });

  const tod = document.getElementById('c-tod');
  const todValue = document.getElementById('c-tod-val');
  if (tod) tod.value = '7';
  if (todValue) todValue.textContent = '7:00';

  const notif = document.getElementById('dict-unlock-notif');
  if (notif) {
    notif.classList.remove('on');
    notif.classList.add('off');
    notif.style.top = '';
    notif.style.left = '';
    notif.style.width = '';
  }
  _syncCheatRunShortcut();
}

function openCheatMenu() {
  populateCheatItemSel();
  populateCheatModSel();
  document.getElementById('cheat-menu')?.classList.add('on');
  document.body.classList.add('cheat-open');
  if (G.phase === 'run' || G.phase === 'paused') {
    _cheatShortcutUnlockedThisRun = true;
  }
  _botSetToggleButton('c-god', !!G.godMode);
  _botSetToggleButton('c-auto', !!G.autoShoot);
  _syncBotUi();
  _syncCheatRunShortcut();
  if (G.touchMode && G.phase === 'run') {
    _cheatOpenedWhileRunning = true;
    G.phase = 'paused';
  }
}
window.closeCheatMenu = function() {
  document.getElementById('cheat-menu')?.classList.remove('on');
  document.body.classList.remove('cheat-open');
  if (G.touchMode && _cheatOpenedWhileRunning && G.phase === 'paused') G.phase = 'run';
  _cheatOpenedWhileRunning = false;
  _syncCheatRunShortcut();
};
window.cheatToggleGod = function() {
  G.godMode = !G.godMode;
  const btn = document.getElementById('c-god');
  if (btn) { btn.textContent = G.godMode ? 'ON' : 'OFF'; btn.style.background = G.godMode ? '#27ae60' : ''; }
};
window.cheatToggleAuto = function() {
  G.autoShoot = !G.autoShoot;
  const btn = document.getElementById('c-auto');
  if (btn) { btn.textContent = G.autoShoot ? 'ON' : 'OFF'; btn.style.background = G.autoShoot ? '#27ae60' : ''; }
};
window.cheatToggleBot = function() {
  if (G.mp?.active) {
    flashAnnounce('🤖 Bot is single-player only', '#ff8844');
    return;
  }
  _bot.enabled = !_bot.enabled;
  if (_bot.enabled) {
    _clearBotTask({ clearInput: true });
    _bot.hanjaPickupDecisions.clear();
    _resetBotStats();
  } else {
    _clearBotTask({ clearInput: true });
  }
  _syncBotUi();
};
window.cheatToggleBotAutoMove = function() {
  _bot.autoMove = !_bot.autoMove;
  _syncBotUi();
};
// Kept as a debug-console compatibility alias for older recordings.
window.cheatToggleBotBoss = window.cheatToggleBotAutoMove;
window.cheatToggleBotWorld = function() {
  _bot.autoWorld = !_bot.autoWorld;
  _syncBotUi();
};
window.cheatToggleBotItems = function() {
  _bot.useItems = !_bot.useItems;
  _syncBotUi();
};
window.cheatToggleBotPickups = function() {
  _bot.pickUpDrops = !_bot.pickUpDrops;
  _syncBotUi();
};
document.getElementById('c-bot-wpm')?.addEventListener('input', e => {
  _bot.wpm = Math.max(20, Math.min(250, parseInt(e.target.value, 10) || 100));
  _syncBotUi();
});
window.cheatAddLives = function() {
  const n = parseInt(document.getElementById('c-lives-in')?.value) || 5;
  G.playerHP = Math.min(G.playerMax + n, 100);
  G.playerMax = Math.min(G.playerMax + n, 100);
  refreshLives();
};
window.cheatAddCoins = function() {
  if (G.run) { G.run.wallet += 9999; updateHudWallet(); }
};
window.cheatSetWeather = function() {
  const wx = document.getElementById('c-wx')?.value || 'clear';
  const worldDef = G.dungeon?.worldDef;
  const forbidden = new Set(worldDef?.forbiddenWeathers || []);
  if (worldDef?.biome === 'ice') forbidden.add('blossom');
  if (forbidden.has(wx)) {
    flashAnnounce('⚠️ Weather unavailable in this world', '#ff8888');
    return;
  }
  startWeatherFade(wx);
};
window.cheatSetTOD = function() {
  // Slider value = hour (0-24), map to gameTime within current cycle
  const v = parseFloat(document.getElementById('c-tod')?.value ?? 12);
  // Set G.gameTime so that getGameHour() returns v
  // hour = (gameTime % 420) / 420 * 24  →  gameTime = v / 24 * 420
  const cyclePos = (v / 24) * 420;
  G.gameTime = Math.floor(G.gameTime / 420) * 420 + cyclePos;
};
document.getElementById('c-tod')?.addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  const h = Math.floor(v), m = Math.round((v - h) * 60);
  const el = document.getElementById('c-tod-val');
  if (el) el.textContent = `${h}:${m.toString().padStart(2,'0')}`;
});

window.cheatNextWorld = function() {
  if (!G.run) return;
  triggerWorldTransition((G.run.worldIdx || 0) + 1);
};
window.cheatClearRoom = function() {
  killAllEnemies();
};
window.cheatClearRoomTrees = function() {
  if (!clearRoomTrees()) {
    flashAnnounce('⚠️ Run only', '#ff8888');
    return;
  }
  flashAnnounce(i18n('cheat.room.treesCleared'), '#9fd3ff');
};
window.cheatGenerateRoomTrees = function() {
  const theme = document.getElementById('c-tree-theme')?.value || 'auto';
  if (!generateRoomTrees(theme)) {
    flashAnnounce('⚠️ Run only', '#ff8888');
    return;
  }
  flashAnnounce(i18n('cheat.room.treesGenerated'), '#9fd3ff');
};
window.cheatGiveAll = function() {
  import('../data/items.js').then(({ PERMANENTS, POWERUP_KEYS, POWERUP_DEFS }) => {
    if (!G.run) return;
    for (const p of PERMANENTS) {
      if (!G.run.permanents.includes(p.id)) { G.run.permanents.push(p.id); p.onAcquire(G); }
    }
    if (G.run.permanents.includes('crystal_ball')) window._mapUpdate?.();
    if (G.run.permanents.includes('wall_breaker')) openAllConnections();
    // 99 of every consumable type
    const keys = POWERUP_KEYS.filter(k => POWERUP_DEFS[k].rarity > 0);
    for (const k of keys) for (let i = 0; i < 99; i++) addToInventory(k);
    updateHudAll(); refreshInventoryUI();
    const allItemsMsg = i18n('announce.allItems');
    flashAnnounce(allItemsMsg, '#ffdd44');
  });
};

window.cheatUnlockLessons = function() {
  G.completedLessons = LESSONS_BASE.map(l => l.id);
  G.verbCountingUnlocked = true;
  G.modifierUnlocked = true;
  G.banmalUnlocked = true;
  G.hasipsiocheUnlocked = true;
  LESSONS_BASE.forEach(lesson => {
    lesson.unlockedWords.forEach(w => {
      const { text, emoji } = parseLessonWord(w);
      if (!G.learnedWords.find(lw => lw.text === text)) {
        let wordDef;
        if (emoji) {
          wordDef = WORD_DICT.find(d => d.text === text && d.emoji === emoji);
        } else {
          wordDef = WORD_DICT.find(d => d.text === text);
        }
        G.learnedWords.push({ text, emoji: wordDef?.emoji || '🎓' });
      }
    });
  });
  savePersistentState();
  updateBook();
  buildTitleDict(document.getElementById('dict-search')?.value || '');
  flashAnnounce('🎓 Todas as aulas destravadas!', '#2ecc71');
};
window.cheatUnlockDict = function() {
  WORD_DICT.forEach(entry => {
    if (!G.learnedWords.find(lw => lw.text === entry.text)) {
      G.learnedWords.push({ text: entry.text, emoji: entry.emoji || '' });
    }
    G.wordKillCounts[entry.text] = 99;
    G.wordHiddenStatus[entry.text] = true;
  });
  const TENSES = ['present', 'past', 'future'];
  const FORMALITIES = ['haeyoche', 'banmal', 'hasipsioche'];
  WORD_DICT.forEach(entry => {
    if (entry.category === 'verb' || entry.category === 'adjective') {
      if (!G.wordConjugationCounts[entry.text]) G.wordConjugationCounts[entry.text] = {};
      for (const tense of TENSES) {
        for (const formality of FORMALITIES) {
          G.wordConjugationCounts[entry.text][`${tense}-${formality}`] = 99;
        }
      }
    }
  });
  savePersistentState();
  updateBook();
  buildTitleDict(document.getElementById('dict-search')?.value || '');
  flashAnnounce('📖 Dicionário completo desbloqueado!', '#7db4ff');
};
window.cheatSummonMonster = function() {
  if (G.phase !== 'run' || !G.room) return;
  const catFilter = document.getElementById('c-mon-type')?.value || 'all';
  const hp = Math.max(1, parseInt(document.getElementById('c-mon-hp')?.value) || 1);
  const waveNum = Math.max(1, parseInt(document.getElementById('c-mon-wave')?.value) || 1);
  const special = document.getElementById('c-mon-special')?.value || null;

  // Pick words from WORD_DICT filtered by category
  let pool = catFilter === 'all'
    ? WORD_DICT
    : WORD_DICT.filter(w => w.category === catFilter);
  if (!pool.length) pool = WORD_DICT;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const words = [];
  for (let i = 0; i < hp && i < shuffled.length; i++) words.push(shuffled[i].text);
  while (words.length < hp) words.push(shuffled[0]?.text || '가');

  const wordEmojis = words.map(w => WORD_DICT.find(d => d.text === w)?.emoji || '👾');
  const tmpl = {
    type: 'normal', hp, maxHp: hp,
    words, wordEmojis,
    spdMult: 1,
    special: special || null,
  };

  // Apply verb/adj conjugation for single-HP verb/adj monsters
  if (hp === 1 && !special) {
    const dictEntry = WORD_DICT.find(d => d.text === words[0]);
    if (dictEntry?.textVariations &&
        (dictEntry.category === 'verb' || dictEntry.category === 'adjective')) {
      const conj = rollConjugation(dictEntry);
      if (conj) {
        tmpl.isVerbAdj      = true;
        tmpl.verbAdjType    = dictEntry.category;
        tmpl.conjugation    = conj;
        tmpl.verbAdjDictWord = dictEntry.text;
        tmpl.words          = [conj.conjugatedText];
        tmpl.wordEmoji      = dictEntry.emoji;
        tmpl.wordEmojis     = [dictEntry.emoji];
      }
    }
  }

  // If room was already cleared, register a minimal clear callback so killing
  // the cheat monster returns to navigate mode
  if (G.room.wPhase === 'clear') {
    setRoomClearedCallback(() => {
      G.mode = 'navigate';
      flashAnnounce(i18n('announce.roomCleared'), '#44ff88');
    });
  }

  G.room.monsters.push(mkMonster(tmpl));
  G.room.wPhase = 'spawning';
  G.mode = 'combat';
};

window.cheatSpawnOrbs = function() {
  if (G.phase !== 'run' || !G.room) return;
  const count = Math.max(1, parseInt(document.getElementById('c-orb-count')?.value) || 3);
  const margin = 80;
  for (let i = 0; i < count; i++) {
    const x = margin + Math.random() * (G.W - margin * 2);
    const y = G.vH * 0.2 + Math.random() * (G.vH * 0.55);
    spawnGroundItem(x, y);
  }
};

window.cheatAddItem = function() {
  const sel = document.getElementById('c-item-sel');
  if (!sel || !sel.value) return;
  addToInventory(sel.value);
  refreshInventoryUI();
};

window.cheatAddMod = function() {
  const sel = document.getElementById('c-mod-sel');
  if (!sel || !sel.value || !G.run) return;
  import('../data/items.js').then(({ PERMANENTS }) => {
    const perm = PERMANENTS.find(p => p.id === sel.value);
    if (!perm) return;
    if (!G.run.permanents.includes(perm.id)) {
      G.run.permanents.push(perm.id);
      perm.onAcquire(G);
      // Side effects (same as shopBuy/pickModifierItem)
      if (perm.id === 'crystal_ball') window._mapUpdate?.();
      if (perm.id === 'wall_breaker') openAllConnections();
    }
    updateHudAll(); refreshInventoryUI();
  });
};

// Populate item selector in cheat menu
function populateCheatItemSel() {
  import('../data/items.js').then(({ POWERUP_DEFS, POWERUP_KEYS }) => {
    const sel = document.getElementById('c-item-sel');
    if (!sel) return;
    sel.innerHTML = POWERUP_KEYS.map(k => {
      const id = POWERUP_DEFS[k].id;
      const label = id ? i18n('items.' + id + '.name') : k;
      return `<option value="${k}">${k} ${label}</option>`;
    }).join('');
  });
}

function populateCheatModSel() {
  import('../data/items.js').then(({ PERMANENTS }) => {
    const sel = document.getElementById('c-mod-sel');
    if (!sel) return;
    sel.innerHTML = PERMANENTS.map(p =>
      `<option value="${p.id}">${p.emoji} ${i18n('items.' + p.id + '.name')}</option>`
    ).join('');
  });
}

// ── Room Design ──────────────────────────────────────────────────
// Wall texture styles (indices match drawWallPattern in renderer.js)
const CHEAT_WALL_STYLES = ['Fan Lines', 'Flat Lines', 'Grid', 'Wide Fan'];
// Floor pattern types (indices match _patIdx in drawBackground in renderer.js)
const CHEAT_FLOOR_PATS  = ['Large Checkerboard', 'Even Larger Chess', 'Planks ↕', 'Planks ↔', 'Solid', 'Solid Alt', 'Pixel Art', 'Cross'];

let _cheatWallIdx  = -1;
let _cheatFloorIdx = -1;
let _roomColorOrig = null;

function _backupRoomColors() {
  if (_roomColorOrig) return;
  const wd = G.dungeon?.worldDef;
  if (!wd) return;
  _roomColorOrig = { wallColor: wd.wallColor, altWallColor: wd.altWallColor, floorColor: wd.floorColor, floorColorAlt: wd.floorColorAlt };
}
function _syncRoomColorInputs() {
  const wd = G.dungeon?.worldDef;
  const wc = wd?.wallColor     || '#1e3d70';
  const wa = wd?.altWallColor  || '#2e58a0';
  const fc = wd?.floorColor    || '#141828';
  const fa = wd?.floorColorAlt || '#0e1220';
  const wMain = document.getElementById('c-wall-main');
  const wAlt  = document.getElementById('c-wall-alt');
  const fMain = document.getElementById('c-floor-main');
  const fAlt  = document.getElementById('c-floor-alt');
  if (wMain) wMain.value = wc;
  if (wAlt)  wAlt.value  = wa;
  if (fMain) fMain.value = fc;
  if (fAlt)  fAlt.value  = fa;
}
window.cheatRoomWall = function(dir) {
  _cheatWallIdx = ((_cheatWallIdx + dir) % CHEAT_WALL_STYLES.length + CHEAT_WALL_STYLES.length) % CHEAT_WALL_STYLES.length;
  setRoomDesignWallStyle(_cheatWallIdx);
  const nameEl = document.getElementById('c-wall-name');
  if (nameEl) nameEl.textContent = CHEAT_WALL_STYLES[_cheatWallIdx];
};
window.cheatRoomFloor = function(dir) {
  _cheatFloorIdx = ((_cheatFloorIdx + dir) % CHEAT_FLOOR_PATS.length + CHEAT_FLOOR_PATS.length) % CHEAT_FLOOR_PATS.length;
  setRoomDesignFloorPat(_cheatFloorIdx);
  const nameEl = document.getElementById('c-floor-name');
  if (nameEl) nameEl.textContent = CHEAT_FLOOR_PATS[_cheatFloorIdx];
};
window.cheatApplyRoomColors = function() {
  _backupRoomColors();
  const wd = G.dungeon?.worldDef;
  if (!wd) { flashAnnounce('⚠️ Run only', '#ff8888'); return; }
  wd.wallColor     = document.getElementById('c-wall-main')?.value  || wd.wallColor;
  wd.altWallColor  = document.getElementById('c-wall-alt')?.value   || wd.altWallColor;
  wd.floorColor    = document.getElementById('c-floor-main')?.value || wd.floorColor;
  wd.floorColorAlt = document.getElementById('c-floor-alt')?.value  || wd.floorColorAlt;
};
window.cheatResetRoomColors = function() {
  const wd = G.dungeon?.worldDef;
  if (wd && _roomColorOrig) { Object.assign(wd, _roomColorOrig); _roomColorOrig = null; }
  _cheatWallIdx = -1; _cheatFloorIdx = -1;
  setRoomDesignWallStyle(-1); setRoomDesignFloorPat(-1);
  const wn = document.getElementById('c-wall-name');  if (wn) wn.textContent = '—';
  const fn = document.getElementById('c-floor-name'); if (fn) fn.textContent = '—';
  _syncRoomColorInputs();
};

/* ================================================================
   SCREEN HELPERS
================================================================ */
function screenOn(id)  {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('off');
  el.inert = false;
}
function screenOff(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('off');
  el.inert = true;
}

/* ================================================================
   ORIENTATION LOCK - portrait (width < height × 0.75) shows rotate overlay
================================================================ */
(function() {
  const overlay = document.getElementById('rotate-overlay');
  const rotateText = document.getElementById('rotate-text');
  if (!overlay || !rotateText) return;
  let _pausedByRotation = false;
  let _startupAnimationPending = null;
  let _rotateLangTimer = null;
  let _rotateLangIndex = 0;

  function getRotateTextForLang(code) {
    const meta = getLangMeta(code);
    if (meta?.rotateDevice) return meta.rotateDevice;
    // fallback to i18n (current language context)
    return i18n('meta.rotateDevice');
  }

  function updateRotateOverlayText() {
    const chosenLang = localStorage.getItem('krr_lang');
    const langs = getAvailableLanguages();

    if (_rotateLangTimer) {
      clearInterval(_rotateLangTimer);
      _rotateLangTimer = null;
    }

    // Translations not yet loaded - show English fallback to avoid raw key flash
    if (!langs.length) {
      rotateText.textContent = 'Rotate your device';
      return;
    }

    if (!chosenLang && langs.length) {
      // Cycle through available meta.rotateDevice strings
      _rotateLangIndex = 0;
      function showNextLang() {
        const lang = langs[_rotateLangIndex % langs.length];
        rotateText.textContent = getRotateTextForLang(lang.code);
        _rotateLangIndex++;
      }
      showNextLang();
      _rotateLangTimer = setInterval(showNextLang, 2000);
    } else {
      rotateText.textContent = i18n('meta.rotateDevice');
    }
  }

  window._updateRotateOverlayText = updateRotateOverlayText;

  // ── Unsupported browser overlay lang cycling ──────────────
  (function() {
    const titleEl = document.getElementById('unsup-title');
    const descEl  = document.getElementById('unsup-desc');
    if (!titleEl || !descEl) return;

    let _unsupTimer = null;
    let _unsupIndex = 0;

    function updateUnsupText() {
      const langs = getAvailableLanguages();
      if (!langs.length) return; // translations not loaded yet

      if (_unsupTimer) { clearInterval(_unsupTimer); _unsupTimer = null; }

      function showNext() {
        const lang = langs[_unsupIndex % langs.length];
        const meta = getLangMeta(lang.code);
        titleEl.textContent = meta.unsupportedTitle || 'Browser not supported';
        descEl.textContent  = meta.unsupportedDesc  || 'EZRA does not run on Safari. Please open it in Chrome, Firefox, or Edge.';
        _unsupIndex++;
      }
      showNext();
      _unsupTimer = setInterval(showNext, 2000);
    }

    // Run once languages are loaded (same hook as rotate)
    const _origUpdateRotate = window._updateRotateOverlayText;
    window._updateRotateOverlayText = function() {
      _origUpdateRotate?.();
      updateUnsupText();
    };
  })();

  // Export function to set the startup animation callback
  window._registerStartupAnimation = function(fn) {
    _startupAnimationPending = fn;
  };

  function checkOrientation() {
    const tooPortrait = window.innerWidth < window.innerHeight * 0.75;
    overlay.classList.toggle('visible', tooPortrait);
    if (tooPortrait) {
      updateRotateOverlayText();
      if (G.phase === 'run') { _pausedByRotation = true; G.phase = 'paused'; }
    } else {
      // Changed to landscape
      if (_pausedByRotation && G.phase === 'paused') G.phase = 'run';
      _pausedByRotation = false;
      
      // If startup animation was pending, run it now after 200ms for rotation animation.
      // _startupSequence handles lang-select and fullscreen internally.
      if (_startupAnimationPending) {
        const fn = _startupAnimationPending;
        _startupAnimationPending = null;
        setTimeout(() => fn(), 200);
      }
    }
  }
  window.addEventListener('resize', checkOrientation);
  checkOrientation();
})();

/* ================================================================
   MULTIPLAYER - Modal, P2P session management, game event handlers
================================================================ */

// ── Helper: get current difficulty label ─────────────────────────
function _difficultyLabel() {
  const sel = document.getElementById('sel-difficulty');
  return sel ? sel.options[sel.selectedIndex]?.text : '⚔️ Normal: 10 ❤️';
}

// ── Modal open/close ─────────────────────────────────────────────
let _mpCurrentCode = null;

async function _showMultiplayerModal() {
  const modal = document.getElementById('mp-modal');
  if (!modal) return;

  // Reset guest role and code row
  modal.classList.remove('mp-role-guest');
  _mpSetCodeRowMode(false);

  // Generate a new room code and start hosting
  _mpCurrentCode = genRoomCode();
  const codeEl = document.getElementById('mp-room-code');
  if (codeEl) codeEl.textContent = _mpCurrentCode;

  // Show P1 avatar (own) and reset label to "You"
  const p1AvEl = document.getElementById('mp-p1-avatar');
  if (p1AvEl) {
    if (G.avatar && typeof Avataaars !== 'undefined') {
      p1AvEl.innerHTML = Avataaars.create({ style: 'transparent', ...G.avatar });
    } else {
      p1AvEl.textContent = G.hero || '😊';
    }
  }
  const p1Label = document.querySelector('#mp-slot-p1 .mp-slot-label');
  if (p1Label) { p1Label.dataset.i18n = 'multiplayer.you'; p1Label.textContent = i18n('multiplayer.you'); }

  // P2 slot: waiting state
  _mpResetP2Slot();

  // Init session settings from local prefs
  const mpDiffEl = document.getElementById('mp-difficulty');
  if (mpDiffEl) mpDiffEl.value = document.getElementById('sel-difficulty')?.value || 'normal';
  const mpHanjaEl = document.getElementById('mp-chk-hanja');
  if (mpHanjaEl) mpHanjaEl.checked = G.hanjaEnabled ?? true;
  const mpTransEl = document.getElementById('mp-chk-trans');
  if (mpTransEl) mpTransEl.checked = G.translationEnabled ?? true;
  const mpDictEl = document.getElementById('mp-chk-dict-prog');
  if (mpDictEl) mpDictEl.checked = G.dictProgressionDisabled ?? false;

  // Start button disabled until P2 connects
  const startBtn = document.getElementById('mp-start-btn');
  if (startBtn) { startBtn.disabled = true; startBtn.classList.remove('mp-guest-ready'); startBtn.dataset.i18n = 'multiplayer.startBtn'; startBtn.textContent = i18n('multiplayer.startBtn'); }

  modal.classList.remove('off');

  // Connect as host
  try {
    await startHost(_mpCurrentCode);
    G.mp = MP;
    _mpSetupCallbacks();
  } catch (e) {
    console.error('[MP] Failed to start host:', e);
    const js = document.getElementById('mp-join-status');
    if (js) js.textContent = i18n('multiplayer.errorConnect');
  }

  // Room code: click to copy
  if (codeEl) {
    codeEl.onclick = () => {
      navigator.clipboard?.writeText(_mpCurrentCode).catch(() => {});
      const hint = document.getElementById('mp-copy-hint');
      if (hint) { hint.textContent = i18n('multiplayer.copied'); setTimeout(() => { if (hint) hint.textContent = i18n('multiplayer.copyHint'); }, 1500); }
    };
  }
}

function _hideMultiplayerModal() {
  document.getElementById('mp-modal')?.classList.add('off');
}

function _mpSetCodeRowMode(inRoom) {
  document.getElementById('mp-code-row')?.classList.toggle('in-room', inRoom);
}

function _mpCleanup() {
  document.body.classList.remove('mp-active');
  const legendPartner = document.getElementById('map-legend-partner');
  if (legendPartner) legendPartner.style.display = 'none';
  _mpRestoreGuestSettings();
}

function _mpGetSessionSettings() {
  return {
    difficulty:              document.getElementById('mp-difficulty')?.value || 'normal',
    hanjaEnabled:            document.getElementById('mp-chk-hanja')?.checked ?? (G.hanjaEnabled ?? true),
    translationEnabled:      document.getElementById('mp-chk-trans')?.checked ?? (G.translationEnabled ?? true),
    dictProgressionDisabled: document.getElementById('mp-chk-dict-prog')?.checked ?? (G.dictProgressionDisabled ?? false),
  };
}

// Reads host's session settings into the guest read-only display spans.
function _mpApplyGuestSettingsDisplay(s) {
  const DIFF_LABELS = {
    baby: '🍼 Baby: 50 ❤️', easy: '😊 Easy: 20 ❤️', normal: '⚔️ Normal: 10 ❤️',
    hard: '💪 Hard: 5 ❤️',  hardcore: '💀 Hardcore: 1 ❤️',
  };
  const yn = (v) => v ? '✅' : '❌';
  const el = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  el('mp-diff-guest',  DIFF_LABELS[s.difficulty] || s.difficulty);
  el('mp-hanja-guest', yn(s.hanjaEnabled));
  el('mp-trans-guest', yn(s.translationEnabled));
  el('mp-dict-guest',  yn(s.dictProgressionDisabled)); // ✅ when the "disable" toggle is ON
}

// Swaps the modal player slots so host is on the left and self (guest) on the right.
function _mpSwapSlotsForGuest() {
  // Left slot → show host (MP.p2 = host from guest's perspective)
  const p1Av = document.getElementById('mp-p1-avatar');
  if (p1Av) {
    if (MP.p2.avatar && typeof Avataaars !== 'undefined') {
      p1Av.innerHTML = Avataaars.create({ style: 'transparent', ...MP.p2.avatar });
    } else {
      p1Av.textContent = MP.p2.emoji || '🤺';
    }
  }
  const p1Label = document.querySelector('#mp-slot-p1 .mp-slot-label');
  if (p1Label) { delete p1Label.dataset.i18n; p1Label.textContent = i18n('multiplayer.host') || 'Host'; }
  const p1Status = document.getElementById('mp-p1-status');
  if (p1Status) p1Status.textContent = '✅';

  // Right slot → show self (guest)
  const p2Inner = document.getElementById('mp-p2-avatar-inner');
  if (p2Inner) {
    if (G.avatar && typeof Avataaars !== 'undefined') {
      p2Inner.innerHTML = Avataaars.create({ style: 'transparent', ...G.avatar });
    } else {
      p2Inner.textContent = G.hero || '😊';
    }
  }
  const p2Slot = document.getElementById('mp-slot-p2');
  if (p2Slot) { p2Slot.classList.remove('mp-slot-waiting'); p2Slot.classList.add('mp-slot-connected'); }
  const p2Av = document.getElementById('mp-p2-avatar');
  if (p2Av) p2Av.classList.remove('mp-waiting-pulse');
  const p2Label = document.querySelector('#mp-slot-p2 .mp-slot-label');
  if (p2Label) { p2Label.dataset.i18n = 'multiplayer.you'; p2Label.textContent = i18n('multiplayer.you'); }
  const p2Status = document.getElementById('mp-p2-status');
  if (p2Status) { p2Status.classList.remove('mp-waiting-pulse'); p2Status.textContent = '✅'; }
}

// Save / restore guest's local settings when overridden by host session.
let _guestSavedSettings = null;
function _mpSaveGuestSettings() {
  _guestSavedSettings = {
    hanjaEnabled:            G.hanjaEnabled,
    translationEnabled:      G.translationEnabled,
    dictProgressionDisabled: G.dictProgressionDisabled,
  };
}
function _mpRestoreGuestSettings() {
  if (!_guestSavedSettings) return;
  G.hanjaEnabled            = _guestSavedSettings.hanjaEnabled;
  G.translationEnabled      = _guestSavedSettings.translationEnabled;
  G.dictProgressionDisabled = _guestSavedSettings.dictProgressionDisabled;
  _guestSavedSettings = null;
}

function _mpResetP2Slot() {
  const slot = document.getElementById('mp-slot-p2');
  const ava  = document.getElementById('mp-p2-avatar');
  const inner = document.getElementById('mp-p2-avatar-inner');
  const status = document.getElementById('mp-p2-status');
  if (slot) { slot.classList.remove('mp-slot-connected'); slot.classList.add('mp-slot-waiting'); }
  if (ava)  { ava.classList.add('mp-waiting-pulse'); }
  if (inner) inner.textContent = '⌛';
  if (status) { status.classList.add('mp-waiting-pulse'); status.dataset.i18n = 'multiplayer.waiting'; status.textContent = i18n('multiplayer.waiting'); }
}

// ── MP event callbacks ───────────────────────────────────────────
function _mpSetupCallbacks() {
  document.body.classList.add('mp-active');
  const legendPartner = document.getElementById('map-legend-partner');
  if (legendPartner) legendPartner.style.display = '';
  MP.onP2Join = (_peerId) => {
    if (MP.isHost) {
      if (G.phase === 'run' || G.phase === 'paused' || G.phase === 'transition') {
        // Game already running: send full resume payload so guest can rejoin
        const diff = document.getElementById('sel-difficulty')?.value || 'normal';
        mpSend({
          type:            'resume',
          hostAvatar:      G.avatar,
          hostEmoji:       G.hero,
          persistentState: getHostPersistentSnapshot(),
          difficulty:      diff,
          blueprint:       G.dungeon ? serializeDungeon(G.dungeon, G.run?.worldIdx || 0) : null,
          currentRoom:     G.currentRoom,
          gameTime:        G.gameTime,
          weather:         G.weather,
          hanjaEnabled:    G.hanjaEnabled,
          translationEnabled: G.translationEnabled,
          dictProgressionDisabled: G.dictProgressionDisabled,
        });
        _hideMpDisconnectOverlay();
      } else {
        // Lobby: send our identity + session settings to guest
        mpSend({
          type:            'welcome',
          avatar:          G.avatar,
          emoji:           G.hero,
          lang:            G.lang,
          sessionSettings: _mpGetSessionSettings(),
        });
      }
    } else {
      // Guest: announce ourselves to host
      mpSend({
        type:   'hello',
        avatar: G.avatar,
        emoji:  G.hero,
        lang:   G.lang,
      });
    }
    refreshLives();
  };

  MP.onP2Leave = () => {
    if (G.phase === 'run' || G.phase === 'paused' || G.phase === 'transition') {
      _showMpDisconnectOverlay();
    }
    refreshLives();
    if (typeof window._mapUpdate === 'function') window._mapUpdate();
  };

  MP.onMessage = _mpHandleMessage;
}

function _mpLocalGroundWorldKey() {
  return `${G.dungeon?.runSeed ?? G.run?.seed ?? 'run'}:${G.run?.worldIdx ?? G.dungeon?.worldDef?.id ?? 0}`;
}

function _mpGroundCell(msg) {
  if (!msg || msg.worldKey !== _mpLocalGroundWorldKey()) return null;
  return getCell(Number(msg.col), Number(msg.row));
}

function _mpSendGroundItemsForRoom(col, row) {
  if (!MP.isHost || !G.mp?.connected) return;
  const cell = getCell(col, row);
  if (!cell) return;
  for (const orb of cell.droppedOrbs || []) {
    if (orb.expiresAt <= G.gameTime) continue;
    mpSend({ type: 'ground_item_spawn', authoritative: true, ...groundItemSnapshot(orb, cell) });
  }
}

function _mpHandleGroundItemSpawn(msg) {
  const cell = _mpGroundCell(msg);
  if (!cell || !msg.id || !Array.isArray(msg.keys)) return;

  // The host stamps the shared expiry when accepting a guest-created drop.
  const life = Math.max(0, Number(msg.life ?? msg.maxLife ?? 180));
  const incoming = {
    ...msg,
    maxLife: Number(msg.maxLife ?? life),
    spawnedAt: msg.authoritative ? Number(msg.spawnedAt ?? (msg.expiresAt - life)) : G.gameTime,
    expiresAt: msg.authoritative ? Number(msg.expiresAt) : G.gameTime + life,
  };
  if (!Number.isFinite(incoming.expiresAt) || incoming.expiresAt <= G.gameTime) return;
  const record = upsertGroundItemRecord(cell, incoming);

  if (MP.isHost && !msg.authoritative && record) {
    mpSend({ type: 'ground_item_spawn', authoritative: true, ...groundItemSnapshot(record, cell) });
  }
}

function _mpHandleGroundItemProgress(msg) {
  const cell = _mpGroundCell(msg);
  if (!cell || !msg.id) return;
  const record = applyGroundItemProgress(cell, msg.id, msg.keyIdx);
  if (MP.isHost && !msg.authoritative && record) {
    mpSend({ type: 'ground_item_progress', authoritative: true,
      worldKey: msg.worldKey, roomKey: msg.roomKey, col: msg.col, row: msg.row,
      id: msg.id, keyIdx: record.keyIdx });
  }
}

function _mpApplyGroundItemCollectResult(msg) {
  const cell = _mpGroundCell(msg);
  if (!cell || !msg.id) return;
  const runtime = G.room?.groundItems?.find(gi => gi.id === msg.id);
  const won = !!runtime && runtime.collectRequestId === msg.winnerRequestId;
  const record = removeGroundItem(cell, msg.id);
  if (won && msg.accepted) {
    addToInventory(msg.item || record?.item);
    window._hideTutorial?.(true);
  }
}

function _mpHandleGroundItemCollectRequest(msg) {
  if (!MP.isHost) {
    mpSend(msg);
    return;
  }
  const cell = _mpGroundCell(msg);
  let orb = cell && getGroundItemRecord(cell, msg.id);
  if (cell && !orb && msg.groundItem) {
    // Recover from packet reordering: the collection request carries the
    // complete drop record as a fallback for the preceding spawn packet.
    _mpHandleGroundItemSpawn({
      ...msg.groundItem,
      authoritative: false,
      worldKey: msg.worldKey,
      col: msg.col,
      row: msg.row,
    });
    orb = getGroundItemRecord(cell, msg.id);
  }
  const accepted = !!orb && orb.expiresAt > G.gameTime && msg.keyIdx >= orb.keys.length - 1;
  const result = {
    type: 'ground_item_collect_result',
    worldKey: msg.worldKey,
    roomKey: msg.roomKey,
    col: msg.col,
    row: msg.row,
    id: msg.id,
    accepted,
    item: accepted ? orb.item : null,
    winnerRequestId: accepted ? msg.requestId : null,
  };
  if (accepted || orb?.expiresAt <= G.gameTime) removeGroundItem(cell, msg.id);
  mpSend(result);
  _mpApplyGroundItemCollectResult(result);
}

window._mpRequestGroundItemCollect = _mpHandleGroundItemCollectRequest;

// ── Message dispatch ─────────────────────────────────────────────
function _mpHandleMessage(msg) {
  switch (msg.type) {

    case 'hello': {
      // Host receives guest identity
      MP.p2.avatar  = msg.avatar || null;
      MP.p2.emoji   = msg.emoji  || '🤺';
      MP.p2.lang    = msg.lang   || 'en';
      MP.p2.ready   = true;
      _mpUpdateP2Slot();
      // Enable start button
      const btn = document.getElementById('mp-start-btn');
      if (btn) btn.disabled = false;
      break;
    }

    case 'welcome': {
      // Guest receives host identity + session settings
      MP.p2.avatar = msg.avatar || null;
      MP.p2.emoji  = msg.emoji  || '🤺';
      MP.p2.lang   = msg.lang   || 'en';
      MP.p2.ready  = true;

      // Switch modal to guest role: host on left, self on right
      document.getElementById('mp-modal')?.classList.add('mp-role-guest');
      _mpSwapSlotsForGuest();

      // Show host's settings as read-only
      if (msg.sessionSettings) _mpApplyGuestSettingsDisplay(msg.sessionSettings);

      // Start button: visible but non-interactive (host controls start)
      const btn = document.getElementById('mp-start-btn');
      if (btn) {
        btn.disabled = true;
        btn.classList.add('mp-guest-ready');
        btn.dataset.i18n = 'multiplayer.readyBtn';
        btn.textContent = i18n('multiplayer.readyBtn');
      }
      break;
    }

    case 'start': {
      // Guest: host started the game → apply host's state and run
      if (MP.isHost) break;
      applyHostPersistentState(msg.persistentState);
      if (msg.difficulty) {
        const DIFF = { baby:50, easy:20, normal:10, hard:5, hardcore:1 };
        G.playerMax = DIFF[msg.difficulty] || 10;
        G.difficulty = msg.difficulty;
      }
      if (msg.expertMode) G.skipIntroWorld = true;
      // Save guest's local settings then apply host's session settings
      _mpSaveGuestSettings();
      if (msg.hanjaEnabled            !== undefined) G.hanjaEnabled            = msg.hanjaEnabled;
      if (msg.translationEnabled      !== undefined) G.translationEnabled      = msg.translationEnabled;
      if (msg.dictProgressionDisabled !== undefined) G.dictProgressionDisabled = msg.dictProgressionDisabled;
      if (msg.dungeonBlueprint) MP._blueprintPending = msg.dungeonBlueprint;
      if (msg.skipIntroWorld) G.skipIntroWorld = true;
      _hideMultiplayerModal();
      if (msg.skipIntroWorld) {
        triggerMenuPlayTransition();
      } else {
        playMusic('boss', 0);
        runLoreAnimation(() => triggerMenuPlayTransition());
      }
      break;
    }

    case 'resume': {
      // Guest reconnected mid-run; host sends current game state to resume
      if (MP.isHost) break;
      MP.p2.avatar = msg.hostAvatar || null;
      MP.p2.emoji  = msg.hostEmoji  || '🤺';
      if (msg.persistentState) applyHostPersistentState(msg.persistentState);
      if (msg.hanjaEnabled            !== undefined) G.hanjaEnabled            = msg.hanjaEnabled;
      if (msg.translationEnabled      !== undefined) G.translationEnabled      = msg.translationEnabled;
      if (msg.dictProgressionDisabled !== undefined) G.dictProgressionDisabled = msg.dictProgressionDisabled;
      if (msg.difficulty) {
        const DIFF = { baby:50, easy:20, normal:10, hard:5, hardcore:1 };
        G.playerMax = DIFF[msg.difficulty] || 10;
        G.playerHP  = Math.min(G.playerHP || G.playerMax, G.playerMax);
        G.difficulty = msg.difficulty;
      }
      if (msg.blueprint) {
        G.dungeon      = reconstructDungeon(msg.blueprint);
        G.currentRoom  = msg.currentRoom || { ...G.dungeon.start };
      }
      if (msg.gameTime !== undefined) G.gameTime = msg.gameTime;
      if (msg.weather) startWeatherFade(msg.weather);
      // If guest is on title screen, start the run directly (skip lore)
      if (G.phase === 'title' || G.phase === 'gameover') {
        _hideMultiplayerModal(); // close join modal if open (reconnect flow)
        _hideMpDisconnectOverlay();
        resetRunState();
        _resetCheatRunState();
        screenOff('scr-title'); screenOff('scr-over');
        if (hudEl) hudEl.style.display = 'flex';
        if (paEl)  { paEl.style.display = 'flex'; paEl.style.opacity = '1'; }
        G.phase = 'run';
        document.body.classList.remove('phase-title');
        startRun(); // generates local dungeon (will be overwritten below)
        G.dungeon     = reconstructDungeon(msg.blueprint);
        G.currentRoom = msg.currentRoom || { ...G.dungeon.start };
        MP._incomingEnter = true;
        enterRoom(G.currentRoom.col, G.currentRoom.row);
        refreshLives();
        refreshInventoryUI();
        updateHudAll();
        _focusTypingInput();
      } else if (G.phase === 'run' || G.phase === 'paused') {
        // Already in-game: just teleport to host's room
        _hideMpDisconnectOverlay();
        MP._incomingEnter = true;
        enterRoom(G.currentRoom.col, G.currentRoom.row);
        if (G.phase === 'paused') G.phase = 'run';
      }
      break;
    }

    case 'room_enter': {
      // Partner moved to a different room — update their minimap marker
      const prevP2Room = MP.p2.currentRoom ? { ...MP.p2.currentRoom } : null;
      MP.p2.currentRoom = { col: msg.col, row: msg.row };
      if (msg.inCombat !== undefined) MP.p2.inCombat = msg.inCombat;
      if (typeof window._mapUpdate === 'function') window._mapUpdate();

      const myCol = G.currentRoom?.col, myRow = G.currentRoom?.row;
      const p2IsNowHere  = msg.col === myCol && msg.row === myRow;
      const p2WasHere    = prevP2Room?.col === myCol && prevP2Room?.row === myRow;

      // Drops are world state, so the host must answer even when it is in a
      // different room from the player requesting the sync.
      if (MP.isHost) _mpSendGroundItemsForRoom(msg.col, msg.row);

      if (p2IsNowHere && !p2WasHere) {
        // P2 just arrived in our room — play entrance animation
        _mpUpdateP2Sprite('mp-entering');
        // Host: if combat active, send current monster positions to guest
        if (MP.isHost && G.phase === 'run' && G.room?.wPhase === 'spawning') {
          const states = G.room.monsters
            .filter(m => !m.dead && !m.isProjectileMonster)
            .map(m => ({ mpId: m._mpId, nx: m.x / G.W, ny: m.y / G.vH, hp: m.hp, spawnDone: !m.spawnAnim }));
          if (states.length) mpSend({ type: 'monster_sync', col: G.currentRoom.col, row: G.currentRoom.row, states });
        }
      } else if (!p2IsNowHere && p2WasHere) {
        // P2 just left our room — play exit animation then hide
        _mpUpdateP2Sprite('mp-exiting');
      } else {
        _mpUpdateP2Sprite();
      }
      break;
    }

    case 'room_templates': {
      // Store templates and kick off spawning if guest was waiting for this room
      storeMpTemplates(msg.col, msg.row, msg.templates);
      onMpTemplatesReceived(msg.col, msg.row, msg.templates);
      break;
    }

    case 'proj_fire': {
      // Partner fired a projectile — add ghost proj to our room if we're in the same room
      if (!G.room?.monsters || !G.mp?.p2?.currentRoom) break;
      const sameRoom = G.currentRoom?.col === G.mp.p2.currentRoom.col &&
                       G.currentRoom?.row === G.mp.p2.currentRoom.row;
      if (!sameRoom) break;
      // Find the target monster by _mpId (fall back to word if not found)
      let target = msg.mpId != null
        ? G.room.monsters.find(m => !m.dead && m._mpId === msg.mpId)
        : null;
      if (!target && msg.words?.length) {
        target = G.room.monsters.find(m => !m.dead && m.words[0] === msg.words[0]);
      }
      if (!target) break;
      // Compute velocity from P2's spawn position toward the monster
      const px = msg.px ?? G.W / 2;
      const py = msg.py ?? (G.vH - 90);
      const dx = target.x - px, dy = target.y - py;
      const d  = Math.hypot(dx, dy) || 1;
      const spd = Number.isFinite(msg.projectileSpeed) ? msg.projectileSpeed : 520;
      G.room.projs.push({
        x: px, y: py,
        emoji: msg.emoji || '🔮',
        tid: target.id,
        vx: dx/d * spd, vy: dy/d * spd,
        rot: 0, rs: (Math.random() - 0.5) * 18,
        size: Math.round(48 * G.vH / 1080),
        speed: spd,
        dead: false,
        born: performance.now(),
        _fromP2: true, // ghost projectile — no local hitMonster on impact
      });
      break;
    }

    case 'monster_kill': {
      // P2 killed a monster - remove matching monster from our room + sync vocabulary
      if (!G.room?.monsters) break;
      releaseOpeningAttack({ broadcast: false });
      // Match by _mpId first (preferred), fall back to word if not found
      let target = msg.mpId != null
        ? G.room.monsters.find(m => !m.dead && !m.isProjectileMonster && m._mpId === msg.mpId)
        : null;
      if (!target) {
        target = G.room.monsters.find(m =>
          !m.dead && !m.isProjectileMonster && m.words[0] === (msg.words || [])[0]
        );
      }
      if (target) {
        target.dead = true;
        // Advance wave counter and maybe trigger room clear — same as local kill
        onMonsterRemoved(target);
      }
      // Always sync vocabulary progress regardless of same room (words carry cross-run)
      if (msg.wordEntries?.length) {
        if (!G.learnedWords) G.learnedWords = [];
        let changed = false;
        for (const entry of msg.wordEntries) {
          const { text, emoji, category, conjKey, verbDictWord } = entry;
          if (category !== 'verb' && category !== 'adjective') {
            incrementWordKillCount(text); // handles save internally
          } else if (conjKey) {
            incrementWordConjugationCount(verbDictWord || text, conjKey);
          }
          if (!G.learnedWords.find(lw => lw.text === text)) {
            G.learnedWords.push({ text, emoji: emoji || '' });
            changed = true;
          }
        }
        if (changed) savePersistentState();
      }
      break;
    }

    case 'opening_attack_started': {
      const sameRoom = msg.col == null || (
        G.currentRoom?.col === msg.col && G.currentRoom?.row === msg.row
      );
      if (sameRoom) releaseOpeningAttack({ broadcast: false });
      break;
    }

    case 'player_state': {
      // P2 HP / wallet / spell update
      MP.p2.hp     = msg.hp     ?? MP.p2.hp;
      MP.p2.hpMax  = msg.hpMax  ?? MP.p2.hpMax;
      MP.p2.wallet = msg.wallet ?? MP.p2.wallet;
      if (msg.spellEmoji) MP.p2.spellEmoji = msg.spellEmoji;
      refreshLives();
      break;
    }

    case 'ground_item_spawn': {
      // Store even when the partner is in another room. Rendering happens
      // immediately only if this cell is currently active.
      _mpHandleGroundItemSpawn(msg);
      break;
    }

    case 'ground_item_progress': {
      _mpHandleGroundItemProgress(msg);
      break;
    }

    case 'ground_item_collect_request': {
      _mpHandleGroundItemCollectRequest(msg);
      break;
    }

    case 'ground_item_collect_result': {
      _mpApplyGroundItemCollectResult(msg);
      break;
    }

    case 'ground_item_collect': {
      // Legacy clients may still emit the old event. It is intentionally
      // best-effort and never grants a second inventory item.
      const cell = msg.col != null ? getCell(msg.col, msg.row) : currentCell();
      if (cell) removeGroundItem(cell, msg.id);
      break;
    }

    case 'item_use_both': {
      // An item P2 used that affects both players
      import('./combat.js').then(({ useItemEffect }) => {
        if (typeof useItemEffect === 'function') useItemEffect(msg.item);
      }).catch(() => {});
      break;
    }

    case 'permanent_acquired': {
      // P2 acquired a permanent that doesn't affect our run (individual)
      break;
    }

    case 'teacher_lesson': {
      // Lesson completed by P2 - apply to our state too
      if (!G.completedLessons.includes(msg.lessonId)) {
        G.completedLessons.push(msg.lessonId);
        if (msg.relThreshold !== undefined) G.relThreshold = msg.relThreshold;
        savePersistentState();
      }
      break;
    }

    case 'teacher_pass': {
      // P2 passed a teacher test — mark and refresh local teacher UI banner
      MP._p2TeacherPasses.add(msg.lessonId || 'challenge');
      const teacherScr = document.getElementById('scr-teacher');
      if (teacherScr && !teacherScr.classList.contains('off')) {
        // Refresh the teacher screen so the banner updates
        if (typeof window._teacherRefresh === 'function') window._teacherRefresh();
        else if (typeof window._teacherBack === 'function') window._teacherBack();
      }
      break;
    }

    case 'game_over': {
      // P2 died or host left → game over for both
      const reason = msg.reason === 'host_left'
        ? i18n('multiplayer.hostLeft') || 'Host left the session.'
        : i18n('multiplayer.partnerDied');
      if (G.phase === 'run' || G.phase === 'paused') {
        flashAnnounce(reason, '#ff4444');
        _mpCleanup();
        leaveMultiplayer();
        G.mp = null;
        setTimeout(() => {
          if (typeof window._gameOver === 'function') window._gameOver();
        }, 1500);
      } else {
        // Lobby: host closed modal → kick guest back
        _hideMultiplayerModal();
        _mpCleanup();
        leaveMultiplayer();
        G.mp = null;
        flashAnnounce(reason, '#ff8844');
      }
      break;
    }

    case 'world_transition_start': {
      // Host started the world wipe — guest triggers the same animation
      if (MP.isHost) break;
      if (G.phase !== 'run' || G.worldTransition) break;
      triggerWorldTransition(msg.worldIdx ?? 0, msg.emoji);
      // Override onBlack: apply dungeon from upcoming world_change when it arrives
      if (G.worldTransition) {
        G.worldTransition._guestAwaitingBlueprint = true;
      }
      break;
    }

    case 'world_change': {
      // Guest follows host to the new world (same dungeon, independent navigation)
      if (MP.isHost) break;
      if (msg.blueprint) {
        G.dungeon = reconstructDungeon(msg.blueprint);
        G.currentRoom = { ...G.dungeon.start };
        // Track visited worlds for the guest (host already does this in startNewWorld)
        const _gwid = G.dungeon.worldDef?.id;
        if (_gwid) {
          if (!G.seenWorlds) G.seenWorlds = [];
          if (!G.seenWorlds.includes(_gwid)) { G.seenWorlds.push(_gwid); savePersistentState(); }
        }
      }
      if (msg.weather) startWeatherFade(msg.weather);
      // If the guest is mid-animation (triggered by world_transition_start), let it finish
      // and enter the room when wipe_out completes; otherwise enter now.
      if (G.worldTransition?._guestAwaitingBlueprint) {
        G.worldTransition._guestAwaitingBlueprint = false;
        // Patch onBlack to enter the start room at the right moment
        const _prevOnBlack = G.worldTransition.onBlack;
        G.worldTransition.onBlack = () => {
          if (_prevOnBlack) _prevOnBlack();
          MP._incomingEnter = true;
          enterRoom(G.dungeon.start.col, G.dungeon.start.row);
        };
      } else {
        // No animation running — enter immediately
        MP._incomingEnter = true;
        enterRoom(G.dungeon.start.col, G.dungeon.start.row);
      }
      break;
    }

    case 'time_sync': {
      // Sync game time + weather from host
      if (!MP.isHost) {
        if (msg.gameTime !== undefined) G.gameTime = msg.gameTime;
        if (msg.weather && msg.weather !== G.weather) startWeatherFade(msg.weather);
      }
      break;
    }

    case 'session_settings': {
      // Host changed a lobby setting — update guest's read-only display
      if (MP.isHost) break;
      if (msg.sessionSettings) _mpApplyGuestSettingsDisplay(msg.sessionSettings);
      break;
    }

    case 'monster_sync': {
      // Host sent current monster positions when guest entered the room mid-combat
      if (MP.isHost) break;
      // Validate this sync is for the current room (stale syncs from rooms we fled would corrupt state)
      if (msg.col != null && msg.row != null) {
        if (G.currentRoom?.col !== msg.col || G.currentRoom?.row !== msg.row) break;
      }
      if (!G.room?.monsters || !G.room.monsters.length) {
        // Monsters not yet spawned — store for application once they exist
        MP._pendingMonsterSync = { col: msg.col, row: msg.row, states: msg.states };
        break;
      }
      _applyMonsterSync(msg.states);
      break;
    }

    case 'dungeon_ready': {
      // Host is in the game; guest reconstructs dungeon if blueprint pending
      break;
    }

    case 'room_cleared': {
      // Partner cleared a combat room — mark it cleared in our dungeon too
      if (!G.dungeon) break;
      const cell = G.dungeon.grid.find(c => c.col === msg.col && c.row === msg.row);
      if (cell && !cell.cleared) {
        cell.cleared = true;
        // Clean up any stale fled-room snapshot so re-entry is clean
        delete cell._savedRoom;
        if (typeof window._mapUpdate === 'function') window._mapUpdate();
        // If we're currently in this room (e.g. mid-wait), unblock to navigate mode
        if (G.currentRoom?.col === msg.col && G.currentRoom?.row === msg.row &&
            G.mode !== 'navigate') {
          G.mode = 'navigate';
          G.room.wPhase = 'clear';
          G.room.monsters = [];
          G.room.projs    = [];
        }
      }
      // Partner is no longer in combat
      if (MP.p2.currentRoom?.col === msg.col && MP.p2.currentRoom?.row === msg.row) {
        MP.p2.inCombat = false;
      }
      break;
    }

    case 'room_npc': {
      // Partner placed/spawned an NPC (tent, next-world portal) — mirror it here
      if (!G.dungeon || !G.room) break;
      const sameRoom = G.currentRoom?.col === msg.col && G.currentRoom?.row === msg.row;
      if (sameRoom && msg.npc) {
        G.room.npc = { ...msg.npc, x: G.W / 2, y: G.vH * 0.42, active: true };
      }
      break;
    }

    case 'tent_placed': {
      // Partner set up a tent — mark the cell in our dungeon and spawn NPC if in same room
      if (!G.dungeon) break;
      const tentCell = G.dungeon.grid.find(c => c.col === msg.col && c.row === msg.row);
      if (!tentCell || tentCell.isTent) break;
      tentCell.isTent = true;
      tentCell.type   = 'tent';
      if (typeof window._mapUpdate === 'function') window._mapUpdate();
      const sameRoom = G.currentRoom?.col === msg.col && G.currentRoom?.row === msg.row;
      if (sameRoom) {
        // Trigger the NPC to appear in the current room view
        window._reopenTentNpc?.();
      }
      break;
    }

    case 'sleep': {
      // Partner started sleeping — play the sleep animation here too (no restore)
      if (typeof window._triggerSleepAnimation === 'function') {
        window._triggerSleepAnimation(true); // true = partner sleeping, skip HP restore
      }
      break;
    }

    case 'inv_nav': {
      // Partner cycled their equipped spell — store and update P2 spell-ico if visible
      if (msg.emoji) {
        MP.p2.spellEmoji = msg.emoji;
        const ico = document.getElementById('mp-p2-spell-ico');
        if (ico && ico.style.display !== 'none') ico.textContent = msg.emoji;
      }
      break;
    }
  }
}

// ── Update P2 avatar slot in modal ───────────────────────────────
function _mpUpdateP2Slot() {
  const slot   = document.getElementById('mp-slot-p2');
  const ava    = document.getElementById('mp-p2-avatar');
  const inner  = document.getElementById('mp-p2-avatar-inner');
  const status = document.getElementById('mp-p2-status');
  if (slot)   { slot.classList.remove('mp-slot-waiting'); slot.classList.add('mp-slot-connected'); }
  if (ava)    { ava.classList.remove('mp-waiting-pulse'); }
  if (inner) {
    if (MP.p2.avatar && typeof Avataaars !== 'undefined') {
      inner.innerHTML = Avataaars.create({ style: 'transparent', ...MP.p2.avatar });
    } else {
      inner.textContent = MP.p2.emoji || '🤺';
    }
  }
  if (status) {
    status.classList.remove('mp-waiting-pulse');
    status.textContent = '✅';
  }
  // Also update the in-game P2 sprite placeholder
  _mpUpdateP2Sprite();
}

// ── P2 in-game sprite ────────────────────────────────────────────
function _applyMonsterSync(states) {
  if (!G.room?.monsters) return;
  for (const state of states) {
    const m = G.room.monsters.find(m => !m.dead && m._mpId === state.mpId);
    if (!m) continue;
    m.spawnAnim = null; // always clear spawn animation — use host's actual position
    m.x = state.nx * G.W;
    m.y = state.ny * G.vH;
    if (state.hp !== undefined && state.hp < m.hp) m.hp = state.hp;
  }
}

function _mpUpdateP2Sprite(animClass) {
  const el = document.getElementById('mp-p2-sprite');
  if (!el) return;

  const hide = !MP.active || G.phase !== 'run' || G.worldTransition || G.transition;

  // Exit animation: play it even though sameRoom is already false (currentRoom updated first)
  if (animClass === 'mp-exiting' && !hide && el.style.display !== 'none') {
    el.classList.remove('mp-entering', 'mp-exiting');
    void el.offsetWidth;
    el.classList.add('mp-exiting');
    setTimeout(() => { if (el.classList.contains('mp-exiting')) el.style.display = 'none'; }, 260);
    return;
  }

  const p2Room = G.mp?.p2?.currentRoom;
  const sameRoom = !p2Room || (
    G.currentRoom?.col === p2Room.col && G.currentRoom?.row === p2Room.row
  );

  const spellEl = document.getElementById('mp-p2-spell-ico');

  if (hide || !sameRoom) {
    el.style.display = 'none';
    if (spellEl) spellEl.style.display = 'none';
    return;
  }

  // Set content if needed
  if (!el.innerHTML || el.innerHTML.trim() === '') {
    if (MP.p2.avatar && typeof Avataaars !== 'undefined') {
      el.innerHTML = Avataaars.create({ style: 'transparent', ...MP.p2.avatar });
    } else {
      el.innerHTML = MP.p2.emoji || '🤺';
    }
  }

  el.style.display = 'flex';

  // Show partner's spell-ico if they have one
  if (spellEl) {
    const spell = MP.p2.spellEmoji;
    if (spell) {
      spellEl.textContent = spell;
      spellEl.style.display = 'inline';
    } else {
      spellEl.style.display = 'none';
    }
  }

  // Entrance animation
  if (animClass === 'mp-entering') {
    el.classList.remove('mp-entering', 'mp-exiting');
    void el.offsetWidth;
    el.classList.add('mp-entering');
  }
}

// Apply day/night brightness to P2 sprite alongside P1
function _mpSyncP2Brightness() {
  const el = document.getElementById('mp-p2-sprite');
  const p1 = document.getElementById('pl-emoji');
  if (el && p1) el.style.filter = p1.style.filter || 'drop-shadow(0 4px 8px rgba(0,0,0,.5))';
}

// ── Wire teacher pass callback for multiplayer ────────────────────
window._onTeacherPass = (lessonId) => {
  if (!G.mp?.active) return;
  mpSend({ type: 'teacher_pass', lessonId: lessonId || 'challenge' });
  // Also mark locally so the banner shows "you passed" correctly
  // (teacher_pass is only sent TO partner, local state is tracked separately)
};

// ── Modal button wiring (called at DOMContentLoaded) ─────────────
document.addEventListener('DOMContentLoaded', () => {
  // Close button
  document.getElementById('mp-modal-close')?.addEventListener('click', () => {
    if (MP.active && MP.isHost && MP.connected) mpSend({ type: 'game_over', reason: 'host_left' });
    _mpCleanup();
    _hideMultiplayerModal();
    leaveMultiplayer();
    G.mp = null;
    _showDojangEntryModal();
  });

  // Join button
  document.getElementById('mp-join-btn')?.addEventListener('click', _mpTryJoin);
  document.getElementById('mp-join-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _mpTryJoin();
  });

  // Session settings: sync to guest in real-time when host changes anything
  document.addEventListener('change', e => {
    if (!MP.active || !MP.isHost || !MP.connected) return;
    if (!e.target.closest('#mp-session-settings')) return;
    mpSend({ type: 'session_settings', sessionSettings: _mpGetSessionSettings() });
  });

  // Start button
  document.getElementById('mp-start-btn')?.addEventListener('click', _mpStartGame);

  // In-room disconnect button (shown in mp-code-row when guest joined a room)
  document.addEventListener('click', async e => {
    if (!e.target.closest('#mp-leave-room-btn')) return;
    if (MP.active && MP.isHost && MP.connected) mpSend({ type: 'game_over', reason: 'host_left' });
    _mpCleanup();
    leaveMultiplayer(); G.mp = null;
    document.getElementById('mp-modal')?.classList.remove('mp-role-guest');
    _mpSetCodeRowMode(false);
    _mpCurrentCode = genRoomCode();
    const codeEl = document.getElementById('mp-room-code');
    if (codeEl) codeEl.textContent = _mpCurrentCode;
    document.getElementById('mp-join-status').textContent = '';
    try { await startHost(_mpCurrentCode); G.mp = MP; _mpSetupCallbacks(); } catch (_) {}
  });

  // Disconnect overlay leave button
  document.getElementById('mp-disconnect-leave-btn')?.addEventListener('click', () => {
    _hideMpDisconnectOverlay();
    _mpCleanup();
    leaveMultiplayer();
    G.mp = null;
    goToMenu();
  });
});

async function _mpTryJoin() {
  const input = document.getElementById('mp-join-input');
  const status = document.getElementById('mp-join-status');
  if (!input || !status) return;

  const code = input.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 8) {
    status.textContent = i18n('multiplayer.invalidCode');
    return;
  }
  const formatted = code.slice(0, 4) + '-' + code.slice(4, 8);

  // Prevent self-connection or reconnecting to current room
  if (formatted === _mpCurrentCode || (MP.active && formatted === MP.roomCode)) {
    status.textContent = i18n('multiplayer.selfConnect') || 'Cannot join your own room!';
    return;
  }

  status.textContent = i18n('multiplayer.connecting');

  // Leave current host room
  if (MP.active) { leaveMultiplayer(); G.mp = null; _mpSetCodeRowMode(false); }

  try {
    await startGuest(formatted);
    G.mp = MP;
    _mpSetupCallbacks();
    _mpSetCodeRowMode(true);
    status.textContent = i18n('multiplayer.waitingHost');
    // Update P1 avatar in modal
    const p1AvEl = document.getElementById('mp-p1-avatar');
    if (p1AvEl) {
      if (G.avatar && typeof Avataaars !== 'undefined') {
        p1AvEl.innerHTML = Avataaars.create({ style: 'transparent', ...G.avatar });
      } else {
        p1AvEl.textContent = G.hero || '😊';
      }
    }
    // Update room code display (it's the code we joined)
    const codeEl = document.getElementById('mp-room-code');
    if (codeEl) codeEl.textContent = formatted;
    _mpCurrentCode = formatted;
  } catch (e) {
    console.error('[MP] Failed to join:', e);
    status.textContent = i18n('multiplayer.errorConnect');
    // Re-host own code
    _mpCurrentCode = genRoomCode();
    try { await startHost(_mpCurrentCode); G.mp = MP; _mpSetupCallbacks(); } catch (_) {}
    const codeEl = document.getElementById('mp-room-code');
    if (codeEl) codeEl.textContent = _mpCurrentCode;
  }
}

function _mpStartGame() {
  if (!MP.active || !MP.isHost) return;

  const settings = _mpGetSessionSettings();
  const diffKey  = settings.difficulty;
  const snapshot = getHostPersistentSnapshot();
  const skipIntro = !!G.skipIntroWorld;
  const startIdx  = skipIntro ? 1 : 0;

  // Apply host settings locally too
  G.hanjaEnabled            = settings.hanjaEnabled;
  G.translationEnabled      = settings.translationEnabled;
  G.dictProgressionDisabled = settings.dictProgressionDisabled;

  // Pre-generate world sequence + dungeon so blueprint can be sent synchronously
  // before the guest's lore animation ends (eliminates race condition)
  resetRunState();
  _resetCheatRunState();
  const DIFF = { baby:50, easy:20, normal:10, hard:5, hardcore:1 };
  G.playerMax = DIFF[diffKey] || 10;
  G.playerHP  = G.playerMax;
  // Seed worldSequence first so generateDungeon picks the correct world (not a random fallback)
  G.run.worldSequence = generateWorldSequence(14);
  G.run.seed = Math.floor(Math.random() * 1e6);
  const preDungeon = generateDungeon(startIdx);
  preDungeon.runSeed = G.run.seed;
  const dungeonBlueprint = serializeDungeon(preDungeon, startIdx);
  MP._hostPreDungeon = preDungeon;

  mpSend({
    type:                    'start',
    difficulty:              diffKey,
    expertMode:              skipIntro,
    hanjaEnabled:            settings.hanjaEnabled,
    translationEnabled:      settings.translationEnabled,
    dictProgressionDisabled: settings.dictProgressionDisabled,
    persistentState:         snapshot,
    dungeonBlueprint,
    skipIntroWorld:          skipIntro,
  });

  _hideMultiplayerModal();
  playMusic('boss', 0);
  runLoreAnimation(() => triggerMenuPlayTransition());
}

// ── Disconnect overlay ───────────────────────────────────────────
function _showMpDisconnectOverlay() {
  const el = document.getElementById('mp-disconnect-overlay');
  if (!el) return;
  el.classList.remove('off');
  const codeEl = document.getElementById('mp-reconnect-code');
  if (codeEl) codeEl.textContent = MP.roomCode || '????';
  // Dim game with ctrlPanel blur instead of hard-pausing
  // so host's game keeps running while partner reconnects
  G.ctrlPanelOpen = true;
}

function _hideMpDisconnectOverlay() {
  document.getElementById('mp-disconnect-overlay')?.classList.add('off');
  if (G.mp?.active) G.ctrlPanelOpen = false;
}

// ── Override MP.onP2Join for reconnect (already handled in callbacks) ─

// ── Periodic state broadcast from player (HP + wallet) ───────────
let _mpSyncTimer = 0;
const _mpSyncInterval = 2; // seconds

function _mpTickSync(dt) {
  if (!G.mp?.active || !G.mp.connected) return;
  _mpSyncTimer += dt;
  if (_mpSyncTimer >= _mpSyncInterval) {
    _mpSyncTimer = 0;
    const _spellIcoEl = document.getElementById('spell-ico');
    mpSend({
      type:       'player_state',
      hp:         G.playerHP,
      hpMax:      G.playerMax,
      wallet:     G.run?.wallet ?? 0,
      spellEmoji: _spellIcoEl?.textContent || null,
    });
    // Host: sync game time + weather every interval
    if (G.mp.isHost) {
      mpSend({ type: 'time_sync', gameTime: G.gameTime, weather: G.weather });
    }
    // Keep P2 sprite visibility in sync (handles phase changes etc.)
    _mpUpdateP2Sprite();
  }
}

window._mpTickSync = _mpTickSync;

// ── Export for usage in startNewRun ──────────────────────────────
window._mpOnRunStart = function () {
  if (!G.mp?.active) return;
  // Blueprint was already sent/received in the 'start' message and applied in startRun.
  // This is a safety net: if guest somehow still has a pending blueprint, apply it now.
  if (!G.mp.isHost && MP._blueprintPending) {
    G.dungeon = reconstructDungeon(MP._blueprintPending);
    G.currentRoom = { ...G.dungeon.start };
    MP._blueprintPending = null;
    enterRoom(G.currentRoom.col, G.currentRoom.row);
  }
  _mpUpdateP2Sprite();
};

// Also handle dungeon_blueprint message (can arrive late)
(function _patchMpMessage() {
  const _base = MP.onMessage;
  const _extended = (msg) => {
    if (msg.type === 'dungeon_blueprint' && !MP.isHost) {
      if (G.phase === 'run' && G.dungeon) {
        G.dungeon = reconstructDungeon(msg.blueprint);
        G.currentRoom = { ...G.dungeon.start };
        enterRoom(G.currentRoom.col, G.currentRoom.row);
      } else {
        MP._blueprintPending = msg.blueprint;
      }
      return;
    }
    if (_base) _base(msg);
  };
  MP.onMessage = _extended;
})();

/* ================================================================
   BOOT
================================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
