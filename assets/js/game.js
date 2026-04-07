/* ================================================================
   GAME — main RAF loop, title screen, input, mobile
================================================================ */
import { G, resetRunState, loadPersistentState, savePersistentState } from './state.js';
import {
  tickMonsters, tickProjs, tickParts, tickCoins,
  tickGroundItems, tickActiveEffect,
  checkBubbleCollisions,
  drawMonsters, drawProjs, drawParts, drawCoins,
  tickAnnounce, tickFreeze,
  addToInventory, invNavigate, invUse,
  tryCollectGroundItem,
  killAllEnemies, fire, hitMonster,
  refreshLives, refreshInventoryUI, refreshBubbleDisplay,
  setWeaponGroup, WEAPONS, flashAnnounce,
  mkMonster, spawnGroundItem, startFleeEffects,
  spawnMissParticles, collectCoins, explodeCoins,
  initRoomSpawner, setRoomClearedCallback, setCoinsCollectedCallback, rollConjugation,
} from './combat.js';
import {
  drawBackground, drawDoors, drawNavPrompt, drawMenuBackground,
  drawTransition, drawWorldTransition, drawRoomLabel, drawRoomNpc,
  tickWeather, drawWeather, drawDayNight,
  initRenderer, initWeather, startWeatherFade, getDayBrightness,
} from './renderer.js';
import { initMap, updateMap, updateMapExtras, syncClockToGame, getWeatherLabel } from './map.js';
import {
  setShopRenderer, setModifierRenderer, setTreasureRenderer, setCasinoRenderer, setTeacherRenderer,
  setCombatRef,
  getAvailableDirs, DIR_NAMES,
  currentCell, getCell, enterRoom, navigate,
  startRun, startNewWorld, collectTreasure,
  tryNpcInteract, openAllConnections,
  peekNextWorldDef,
  WORLDS, ALL_WEATHERS, COLS, ROWS,
} from './world.js';
import {
  renderShopScreen, renderModifierScreen, renderTreasureScreen, renderCasinoScreen, renderTeacherScreen,
  updatePermanentBar as hudUpdatePermanentBar,
  parseLessonMarkdown,
} from './hud.js';
import { loadLanguages, setLanguage, getAvailableLanguages, getLangMeta, get as i18n, wordTr } from './i18n.js';
import { HangulComposer, QWERTY_TO_JAMO } from './hangul-input.js';
import { WORD_DICT } from '../data/words.js';
import { POWERUP_DEFS, formatKoreanNumber } from '../data/items.js';
import { LESSONS_BASE } from '../data/lessons.js';

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
    'skrullOutline','pizza','hola','diamond','deer','bear','bat',
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
  diamond:'Diamond', deer:'Deer', bear:'Bear', bat:'Bat',
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
  { id:'weapon', row1: null,         row2: null, special: 'weapon' },
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
  if (tab.special === 'weapon') {
    bar?.classList.add('weapon-mode');
    return;
  }
  bar?.classList.remove('weapon-mode');
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

function _avaStepEditRow(delta, rowN) {
  const tab = _AVA_TABS.find(t => t.id === _avaActiveTab);
  if (!tab) return;
  const catKey = rowN === 1 ? tab.row1 : rowN === 2 ? _getAvaTabRow2Key() : _getAvaTabRow3Key();
  if (!catKey) return;
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
// Hairs that clash with facial hair (too feminine to combine)
const _BEARD_FORBIDDEN_HAIRS = new Set([
  'bob','curvy','longButNotTooLong','miaWallace','straight01','hijab',
]);

function _avaRandomize() {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const catVals = key => AVA_CATS.find(c => c.key === key).values;

  // 1. Male/female split (50/50)
  const isMale = Math.random() < 0.5;

  // 2. Facial hair — moustaches 2× rarer than beards within the facial-hair pool
  // moustaceFancy also forbidden on feminine hairs (resolved after hair is picked below)
  let facialHair;
  if (isMale) {
    if (Math.random() < 0.5) {
      // beards weight 2, moustaches weight 1
      const fhWeighted = [
        'beardLight','beardLight',
        'beardMagestic','beardMagestic',
        'beardMedium','beardMedium',
        'moustaceFancy',
        'moustacheMagnum',
      ];
      facialHair = pick(fhWeighted);
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
  const top = pick(hairPool);

  // moustaceFancy forbidden on feminine hairs — reroll to none if needed
  if (facialHair === 'moustaceFancy' && _FEMALE_HAIRS.has(top)) facialHair = 'none';

  // 4. Can character be read as a woman?
  const canBeWoman = _FEMALE_HAIRS.has(top) && facialHair === 'none';

  // 5. Skin — 25% light, 25% brown, 50% spread across 5 rarer tones
  let skin;
  const sr = Math.random();
  if (sr < 0.25)      skin = 'light';
  else if (sr < 0.50) skin = 'brown';
  else                skin = pick(['tanned','yellow','pale','darkBrown','black']);

  // 6. Hair color — 33% black, rest equal; pink only for feminine combos and 2× rarer
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

  // 7. Eyes — xDizzy rare (weight 2); hearts rare and 2× rarer on males (weight 2 female / 1 male)
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

  // 8. Eyebrows — hearts eyes: only natural/default eyebrows; no unibrow for feminine combos
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

  // 9. Mouth — vomit never generated; negative mouths (concerned/scream/sad) 6× rarer
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

  // 10. Clothing — overall only for feminine combos (and not hijab)
  const clothingPool = (canBeWoman && top !== 'hijab')
    ? catVals('clothing')
    : catVals('clothing').filter(c => c !== 'overall');
  const clothing = pick(clothingPool);

  // 11. Accessories — eyepatch forces none; kurt only for feminine combos; 40% chance of none
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
    clothingGraphic: pick(catVals('clothingGraphic')),
    accessories,
    accessoriesColor: 'black',
    facialHair,
    facialHairColor: hairColor,
    hatColor:        pick(catVals('hatColor')),
  };

  _refreshAvaEditBar();
  _refreshAvaPreview();
  _saveAvatarOpts();
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
  document.getElementById('tts-modal-close')?.addEventListener('click', () => {
    modal.classList.add('off');
  }, { once: true });
}

function _checkStartupModals() {
  const lc = parseInt(localStorage.getItem('krr_launchCount') || '0');
  const showDonate = lc > 0 && lc % 5 === 0;

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
function runStartupAnimation(onPrepare, onDone) {
  const overlay  = document.getElementById('startup-overlay');
  const inner    = document.getElementById('startup-inner');
  const logo     = document.getElementById('startup-logo');
  const textEl   = document.getElementById('startup-text');
  const langSel  = document.getElementById('lang-select');
  if (!overlay) { onPrepare?.(); onDone?.(); return; }

  const text = 'lluc.dev';
  const isFirstTime = !localStorage.getItem('krr_lang');

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

  function showLangSelect() {
    // Build buttons dynamically from available language metadata
    const btnsEl = document.getElementById('lang-select-btns');
    if (btnsEl) {
      const langs = getAvailableLanguages();
      btnsEl.innerHTML = langs.map(({ code, name, icon }) =>
        `<button class="lang-btn" data-lang="${code}"><span class="lang-flag">${icon}</span><span class="lang-name">${name}</span></button>`
      ).join('');
    }

    // Cycle #lang-select-title through each language's "select" text
    const titleEl = document.getElementById('lang-select-title');
    let _langTitleTimer = null;
    function cycleLangTitle() {
      const langs = getAvailableLanguages();
      const texts = langs.map(({ code }) => {
        const meta = getLangMeta(code);
        return meta?.select || meta?.name || code;
      }).filter(Boolean);
      if (!texts.length) return;
      let idx = 0;
      function showNext() {
        if (!titleEl) return;
        titleEl.style.opacity = '0';
        setTimeout(() => {
          titleEl.textContent = texts[idx % texts.length];
          titleEl.style.opacity = '1';
          idx++;
        }, 300);
      }
      showNext();
      _langTitleTimer = setInterval(showNext, 2000);
    }

    // Fade out startup-inner, then reveal lang-select buttons
    inner.classList.add('hidden-fade');
    setTimeout(() => {
      inner.style.display = 'none';
      langSel.classList.remove('startup-hidden');
      // Force reflow before transition
      void langSel.offsetWidth;
      langSel.classList.add('visible');
      cycleLangTitle();
    }, 420);

    langSel.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        if (_langTitleTimer) clearInterval(_langTitleTimer);
        localStorage.setItem('krr_lang', lang);
        finishOverlay();
      });
    });
    // Wire dynamically-created buttons (they may be added after the initial forEach)
    btnsEl?.addEventListener('click', e => {
      const btn = e.target.closest('.lang-btn');
      if (!btn) return;
      const lang = btn.dataset.lang;
      if (_langTitleTimer) clearInterval(_langTitleTimer);
      localStorage.setItem('krr_lang', lang);
      finishOverlay();
    });
  }

  // Phase 1: logo appears (200ms delay, perfectly centered — no text yet)
  setTimeout(() => {
    logo.classList.add('visible');

    // Phase 2: 700ms after logo appears, text starts typing from scratch
    setTimeout(() => {
      textEl.classList.add('visible');
      let i = 0;
      const typeInterval = setInterval(() => {
        if (i < text.length) {
          textEl.innerHTML = text.slice(0, ++i) + '<span id="startup-cursor">▌</span>';
        } else {
          clearInterval(typeInterval);
          // Phase 3: after typing done, wait 600ms
          setTimeout(() => {
            if (isFirstTime) {
              showLangSelect();
            } else {
              finishOverlay();
            }
          }, 600);
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
  // Restore touch mode preference; default ON for touch devices
  const _savedTouchMode = localStorage.getItem('krr_touchMode');
  if (_savedTouchMode === '1') {
    G.touchMode = true;
  } else if (_savedTouchMode === null && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
    G.touchMode = true;
  }

  // Check if device is in portrait orientation
  const isPortrait = window.innerWidth < window.innerHeight * 0.75;

  // Load languages first, then run startup animation so lang-select callback can apply immediately
  loadLanguages().then(() => {
    // Wake up voices to prevent activation warning
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
    buildLangSelector(); // rebuild dropdown from available langs
    // Refresh rotate overlay text now that languages are loaded
    window._updateRotateOverlayText?.();

    // Called while overlay is still fading — content builds underneath with no flash
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

    if (isPortrait) {
      // Register the callback to be called when orientation changes to landscape
      window._registerStartupAnimation?.(() => runStartupAnimation(startupPrepare, _checkStartupModals));
    } else {
      // Not in portrait, run animation immediately
      runStartupAnimation(startupPrepare, _checkStartupModals);
    }
  }).catch(err => {
    console.error('Failed to load languages:', err);
    runStartupAnimation(null, null);
  });

  // ── Fullscreen overlay manager (mobile only) ─────────────────
  let _fsOverlayCallback = null;
  // Cycling timer for #fs-prompt text
  let _fsPromptTimer = null;
  function _startFsPromptCycle() {
    const promptEl = document.getElementById('fs-prompt');
    if (!promptEl) return;
    if (_fsPromptTimer) return; // already running
    const langs = getAvailableLanguages();
    if (!langs.length) {
      promptEl.textContent = 'EZRA 타자 runs in full-screen on mobile. Tap above to go full-screen.';
      return;
    }
    let _idx = 0;
    function showNext() {
      const meta = getLangMeta(langs[_idx % langs.length].code);
      promptEl.textContent = meta.fullscreenPrompt || 'EZRA 타자 runs in full-screen on mobile.';
      _idx++;
    }
    showNext();
    _fsPromptTimer = setInterval(showNext, 2000);
  }

  window._showFsOverlay = function(cb) {
    _fsOverlayCallback = cb || null;
    _syncMobileFs(); // let _syncMobileFs decide visibility based on current state
    // If not mobile anymore, just call cb immediately
    if (window.innerHeight >= 500) { const c = _fsOverlayCallback; _fsOverlayCallback = null; c?.(); return; }
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
  setShopRenderer(cell => renderShopScreen(cell));
  setModifierRenderer(cell => renderModifierScreen(cell));
  setTreasureRenderer(cell => renderTreasureScreen(cell));
  setCasinoRenderer(cell => renderCasinoScreen(cell));
  setTeacherRenderer(cell => renderTeacherScreen(cell));
  setCombatRef({ addToInventory, killAllEnemies });

  // ── Tutorial box ─────────────────────────────────────────────
  const _tutBox   = document.getElementById('tutorial-box');
  const _tutEmoji = document.getElementById('tutorial-emoji');
  const _tutText  = document.getElementById('tutorial-text');
  let _tutPersist    = false;
  let _tutAutoTimer  = null; // setTimeout handle for auto-close
  let _tutCurrentKey = null; // key of currently shown tip
  // Queue for tips triggered during combat (shown after combat clears)
  let _tutQueue = []; // [{emoji, msgKey, vars, opts}]

  function _clearTutTimer() {
    if (_tutAutoTimer) { clearTimeout(_tutAutoTimer); _tutAutoTimer = null; }
  }

  window._showTutorial = (emoji, msgKey, vars = null, opts = {}) => {
    if (!_tutBox) return;
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
  };

  // Called after room is cleared — flush any queued tip
  window._flushTutQueue = () => {
    if (_tutQueue.length > 0) {
      const { emoji, msgKey, vars, opts } = _tutQueue.shift();
      _tutQueue = [];
      // Small delay so the "Room cleared" announce reads first
      setTimeout(() => window._showTutorial(emoji, msgKey, vars, opts), 600);
    }
  };

  // Called when map is opened — dismiss map-related tip
  window._onMapOpen = () => {
    if (_tutCurrentKey === 'tutorial.pressMap') window._hideTutorial(true);
  };

  // Called when teacher screen opens — dismiss teacher tip
  window._onTeacherOpen = () => {
    if (_tutCurrentKey === 'tutorial.typeToTalk' || _tutCurrentKey === 'tutorial.findTeacher') {
      window._hideTutorial(true);
    }
  };

  // Wire global callbacks
  window._mapUpdate    = updateMap;
  window._bookUpdate   = updateBook;
  window._hudUpdate    = updateHudAll;
  window._worldRef     = { enterRoom };
  window._onGameOver   = (victory) => showGameOver(victory);
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
    _panelFadeAlpha = 1; // instant — total trigger time = hold time (250ms)
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
    // Fade overlay elements (player-area, bubbles) — but not during world/sleep transitions
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

  // Menu/title background: render a preview room
  if (G.phase === 'title' && G.menuPreview) {
    const { worldDef, openDirs, patIdx } = G.menuPreview;
    drawMenuBackground(worldDef, openDirs, patIdx);
    drawWeather();
    // World-entry cinematic triggered from Play button
    if (G.worldTransition) {
      drawWorldTransition();
      tickWorldTransition(dt);
    }
    // Slow weather cycle for menu (every 2 min)
    _weatherCycleTimer += dt;
    if (_weatherCycleTimer >= 120) {
      _weatherCycleTimer = 0;
      if (G.weatherEnabled) {
        const forbidden = new Set([...(worldDef.forbiddenWeathers || []), G.weather, 'clear', 'foggy', 'raining', 'blizzard']);
        const allowed = ALL_WEATHERS.filter(w => !forbidden.has(w));
        if (allowed.length && Math.random() < 0.33) {
          startWeatherFade(allowed[Math.floor(Math.random() * allowed.length)]);
        }
      }
    }
    tickWeather(dt);
    G.gameTime += dt;
  }

  if (G.phase === 'run') {
    // Freeze time and game ticks while ctrl panel is open
    if (!G.ctrlPanelOpen) {
      G.gameTime += dt;
      tickWeather(dt);
      // Tutorial: night falls for first time in world 0 → tent hint
      if (G.run?.worldIdx === 0) {
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

    drawMonsters();
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
    if (_weatherCycleTimer >= 120) {
      _weatherCycleTimer = 0;
      if (Math.random() < 0.5 && G.weatherEnabled && G.dungeon) {
        const worldDef = G.dungeon.worldDef;
        const forbidden = new Set([...(worldDef.forbiddenWeathers || []), G.weather]);
        const allowed = ALL_WEATHERS.filter(w => !forbidden.has(w));
        if (allowed.length) {
          startWeatherFade(allowed[Math.floor(Math.random() * allowed.length)]);
        }
      }
    }

    if (G.autoShoot && G.mode === 'combat') {
      _autoTimer = (_autoTimer || 0) + dt;
      if (_autoTimer >= 0.5) {
        _autoTimer = 0;
        const px = G.W / 2;
        const paH = document.getElementById('player-area')?.offsetHeight + 10 || 90;
        const py = G.vH - paH;
        const alive = G.room?.monsters?.filter(m => !m.dead) || [];
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
function triggerWorldTransition(worldIdx) {
  if (G.worldTransition || G.phase !== 'run') return;
  // Clear current room so player takes no damage during animation
  G.room.monsters = [];
  G.room.projs    = [];
  G.inTransition  = true;
  G.mode          = 'navigate';
  // Fade out player area and weather canvas for duration of animation
  paEl.style.transition = 'opacity 0.4s';
  paEl.style.opacity    = '0';
  wxCanvas.style.transition = 'opacity 0.4s';
  wxCanvas.style.opacity    = '0';

  // Get transport emoji from the target world (peek without mutating)
  const targetDef = peekNextWorldDef(worldIdx);
  const emoji = targetDef?.transport || '🚀';

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

/* ================================================================
   LORE ANIMATION — plays once when user clicks Play, before world transition
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
  if (!overlay) { onComplete(); return; }

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

  // Apply geometry-derived DOM styles — called on init and on every resize.
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
  if (hudEl) { hudEl.style.display = 'flex'; hudEl.style.zIndex = '6000'; }

  // Hide wave card during cutscene (and score card on mobile)
  const hcardWave  = document.getElementById('hcard-wave');
  const hcardScore = document.getElementById('hcard-score');
  if (hcardWave) hcardWave.style.opacity = '0';
  if (hcardScore && window.innerHeight < 500) hcardScore.style.opacity = '0';

  // Hide title screen behind overlay
  const titleScr = document.getElementById('scr-title');
  if (titleScr) titleScr.classList.add('off');

  // Character geometry helpers — recomputed from W/H/CHAR_SIZE which update on resize.
  // playerOuter: bottom = -(CHAR_SIZE*0.28) → top of element = H + CHAR_SIZE*0.28 - (CHAR_SIZE+20) = H - CHAR_SIZE*0.72 - 20
  // Avataaars head occupies roughly top 30% of the SVG circle
  // villain: top = H*0.5 - CHAR_SIZE*0.5 (center anchored); 🦹 head at ~18% from top
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
    } else if (name === 'surprised') {
      renderAvatar({ eyes: 'surprised', eyebrows: 'raisedExcited', mouth: 'screamOpen' });
      playerInner.classList.remove('lore-walking');
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
      renderAvatar(G.avatar); // restore user's chosen look
      playerInner.classList.add('lore-walking');
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

  // ── Villain speech — static, fades in then out ───────────────
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
    if (hudEl) { hudEl.style.display = 'none'; hudEl.style.zIndex = ''; }
    if (hcardWave) hcardWave.style.opacity = '';
    if (hcardScore) hcardScore.style.opacity = '';
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
    villainOuter.style.display = 'none';
    playerInner.classList.remove('lore-walking');
    if (villainSpeechEl) { villainSpeechEl.remove(); villainSpeechEl = null; }
    if (villainLaughEl)  { villainLaughEl.remove();  villainLaughEl  = null; }
    if (_skipBtn) { _skipBtn.remove(); _skipBtn = null; }
    if (hudEl) hudEl.style.zIndex = '';
    if (hcardWave) hcardWave.style.opacity = '';
    if (hcardScore) hcardScore.style.opacity = '';
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

  // Called by goToMenu() — aborts lore and returns to title without triggering game start
  function cancel() {
    _cleanup();
    _hideOverlay();
    const ps = document.getElementById('scr-pause');
    if (ps) ps.style.zIndex = '';
    screenOff('scr-pause');
    if (titleScr) titleScr.classList.remove('off');
    G.phase = 'title';
  }

  _loreCancel = cancel;

  // Hidden skip: pressing Enter while lore is actively playing jumps straight to gameplay.
  function onSkipKey(e) { if (e.key === 'Enter' && G.phase === 'lore') { e.preventDefault(); finish(); } }
  window.addEventListener('keydown', onSkipKey);

  // Visible skip button — shown from 2nd play onwards
  let _skipBtn = null;
  const _launchCount = parseInt(localStorage.getItem('krr_launchCount') || '0');
  if (_launchCount > 0) {
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
        // Walk right fast — 2s to exit off screen
        const t  = Math.min(phaseT / 2.0, 1);
        playerX  = PLAYER_WALK_TARGET + (W + CHAR_SIZE * 2 - PLAYER_WALK_TARGET) * easeIn(t);
        playerOuter.style.left = playerX + 'px';
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

function triggerSleepAnimation() {
  if (G.worldTransition || G.phase !== 'run') return;
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
      // Reset time to 8am, change weather, heal player
      G.gameTime = 140; // 8/24 * 420 = 140s
      if (G.weatherEnabled && G.dungeon) {
        const worldDef = G.dungeon.worldDef;
        const forbidden = new Set([...(worldDef.forbiddenWeathers || [])]);
        const available = ['clear','drizzle','raining','snowing','blizzard','fall','blossom'].filter(w => !forbidden.has(w));
        if (available.length) startWeatherFade(available[Math.floor(Math.random() * available.length)]);
      }
      G.playerHP = Math.min(G.playerMax, G.playerHP + 2);
      refreshLives();
      if (G.run) G.run.tentCooldown = 120;
    },
    onComplete: () => {
      flashAnnounce(i18n('announce.healFull'), '#aaffcc');
    },
  };
  G.inTransition = true;
}
window._triggerSleepAnimation = triggerSleepAnimation;

function tickWorldTransition(dt) {
  const wt = G.worldTransition;
  if (!wt) return;
  wt.t += dt;

  if (wt.phase === 'wipe_in') {
    wt.wipeProgress = Math.min(1, wt.t / wt.wipeDur);
    if (wt.wipeProgress >= 1) {
      // Screen fully black — run the "at black" action
      if (wt.onBlack) wt.onBlack();
      else startNewWorld(wt.pendingWorldIdx);
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
      // Restore player area and weather canvas (clear transition to avoid interfering with tickWeather crossfades)
      paEl.style.transition  = '';
      paEl.style.opacity     = '1';
      wxCanvas.style.transition = '';
      wxCanvas.style.opacity    = '1';
      // Init weather for new world
      if (pendingWeather && window._initWeather) window._initWeather(pendingWeather);
      // Spawn monsters (deferred to avoid spawning during animation)
      if (deferredTemplates) {
        G.room._deferredTemplates = null;
        initRoomSpawner(deferredTemplates);
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
function buildTitleScreen() {
  // ── Avatar creator ───────────────────────────────────────────
  // Restore saved avatar or use defaults
  const savedAvatar = localStorage.getItem('krr_avatar');
  if (savedAvatar) {
    try { _avaOpts = { ...AVA_DEFAULTS, ...JSON.parse(savedAvatar) }; } catch(e) { _avaOpts = { ...AVA_DEFAULTS }; }
  } else {
    _avaOpts = { ...AVA_DEFAULTS };
  }
  G.avatar = { ..._avaOpts };

  _refreshAvaPreview();

  document.getElementById('ava-randomize')?.addEventListener('click', () => {
    const btn = document.getElementById('ava-randomize');
    btn.classList.remove('spinning');
    void btn.offsetWidth; // reflow para reiniciar animação se clicar rápido
    btn.classList.add('spinning');
    btn.addEventListener('animationend', () => btn.classList.remove('spinning'), { once: true });
    _avaRandomize();
  });
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

  // ── Weapon picker (in edit bar) ───────────────────────────────
  const wgPick = document.getElementById('wg-pick');
  const defaultWg = localStorage.getItem('krr_wg') || 'weapons';

  if (wgPick && WEAPONS) {
    Object.entries(WEAPONS).forEach(([id, def]) => {
      const btn = document.createElement('button');
      btn.className = 'wgbtn' + (id === defaultWg ? ' sel' : '');
      btn.innerHTML = `${def.e.slice(0,3).join('')} <span class="wg-lbl" data-i18n="options.wg_${id}">${def.label || id}</span>`;
      btn.onclick = () => {
        setWeaponGroup(id);
        localStorage.setItem('krr_wg', id);
        wgPick.querySelectorAll('.wgbtn').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
      };
      wgPick.appendChild(btn);
    });
    setWeaponGroup(defaultWg);
  }

  // Settings wiring
  document.getElementById('sel-lang')?.addEventListener('change', e => {
    setLanguage(e.target.value);
    localStorage.setItem('krr_lang', e.target.value);
    applyLanguage();
  });
  document.getElementById('chk-fonts')?.addEventListener('change', e => { G.varyFonts = e.target.checked; });
  document.getElementById('chk-weather')?.addEventListener('change', e => { G.weatherEnabled = e.target.checked; });
  document.getElementById('chk-tts')?.addEventListener('change', e => { G.ttsEnabled = e.target.checked; });
  // Pause-screen toggles (mirror main settings)
  document.getElementById('pause-chk-weather')?.addEventListener('change', e => {
    G.weatherEnabled = e.target.checked;
    const main = document.getElementById('chk-weather');
    if (main) main.checked = e.target.checked;
  });
  document.getElementById('pause-chk-tts')?.addEventListener('change', e => {
    G.ttsEnabled = e.target.checked;
    const main = document.getElementById('chk-tts');
    if (main) main.checked = e.target.checked;
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

  // Start button — show lore then play world-entry cinematic
  document.getElementById('btn-play')?.addEventListener('click', () => {
    runLoreAnimation(() => triggerMenuPlayTransition());
  });

  // In-run button: resume
  document.getElementById('btn-resume')?.addEventListener('click', resumeGame);
  document.getElementById('btn-menu')?.addEventListener('click', goToMenu);

  document.getElementById('btn-restart')?.addEventListener('click', goToMenu);

  // Title hi score
  const hiEl = document.getElementById('title-hi');
  if (hiEl && G.hiScore > 0) hiEl.textContent = `Best: ${G.hiScore}원`;

  // Logo easter egg: click randomizes menu weather (5s cooldown)
  (function() {
    const logoWrap = document.getElementById('menu-logo-wrap');
    if (!logoWrap) return;
    let _cooldown = false;
    logoWrap.addEventListener('click', () => {
      if (G.phase !== 'title' || !G.menuPreview || _cooldown) return;
      const allowed = ALL_WEATHERS.filter(w => w !== 'clear' && w !== 'foggy' && w !== 'raining' && w !== 'blizzard' && w !== G.weather);
      if (!allowed.length) return;
      startWeatherFade(allowed[Math.floor(Math.random() * allowed.length)]);
      _cooldown = true;
      logoWrap.style.cursor = 'default';
      setTimeout(() => { _cooldown = false; logoWrap.style.cursor = ''; }, 5000);
    });
  })();

  // My Dictionary button — opens floating modal
  document.getElementById('btn-my-dict')?.addEventListener('click', () => {
    document.getElementById('my-dict-modal')?.classList.remove('off');
    buildTitleDict();
  });
  // Settings button — opens settings modal (same behavior as My Dictionary)
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

  // Mode toggle button (touch/keyboard)
  const modeBtn = document.getElementById('mode-toggle-btn');
  const modeEmoji = document.getElementById('mode-toggle-emoji');
  const modeLabel = document.getElementById('mode-toggle-label');
  function _updateModeBtn() {
    const active = G.touchMode;
    if (modeEmoji) modeEmoji.textContent = active ? '📱' : '⌨️';
    if (modeLabel) modeLabel.setAttribute('data-i18n', active ? 'options.touchControlsBtn' : 'options.keyboardControls');
    if (modeLabel) modeLabel.textContent = i18n(active ? 'options.touchControlsBtn' : 'options.keyboardControls');
    modeBtn?.classList.toggle('active', active);
    const chkTouch = document.getElementById('chk-touch');
    if (chkTouch) chkTouch.checked = active;
  }

  const diffBtn = document.getElementById('difficulty-toggle-btn');
  const diffEmoji = document.getElementById('difficulty-toggle-emoji');
  const diffLabel = document.getElementById('difficulty-toggle-label');
  const DIFFICULTY_ORDER = ['baby', 'easy', 'normal', 'hard', 'hardcore'];
  const DIFFICULTY_META = {
    baby: { emoji: '🍼' },
    easy: { emoji: '😊' },
    normal: { emoji: '⚔️' },
    hard: { emoji: '😵' },
    hardcore: { emoji: '💀' },
  };
  const DIFFICULTY_HEARTS = { baby: 50, easy: 20, normal: 10, hard: 5, hardcore: 1 };
  function _getDifficulty() {
    return localStorage.getItem('krr_difficulty') || (G.difficulty || 'normal');
  }
  function _setDifficulty(value) {
    G.difficulty = value;
    localStorage.setItem('krr_difficulty', value);
    const meta = DIFFICULTY_META[value] || DIFFICULTY_META.normal;
    if (diffEmoji) diffEmoji.textContent = meta.emoji;
    const key = 'options.diff' + value.charAt(0).toUpperCase() + value.slice(1);
    if (diffLabel) diffLabel.textContent = i18n(key);
    const heartsEl = document.getElementById('difficulty-hearts-label');
    if (heartsEl) heartsEl.textContent = `${DIFFICULTY_HEARTS[value] ?? 10} ❤️`;
    const selDiff = document.getElementById('sel-difficulty');
    if (selDiff) selDiff.value = value;
  }
  function _cycleDifficulty() {
    const current = _getDifficulty();
    const idx = DIFFICULTY_ORDER.indexOf(current);
    const next = DIFFICULTY_ORDER[(idx + 1) % DIFFICULTY_ORDER.length];
    _setDifficulty(next);
  }
  _setDifficulty(_getDifficulty());

  function _updateModeAndDiff() {
    _updateModeBtn();
    _setDifficulty(_getDifficulty());
  }

  _updateModeAndDiff();

  modeBtn?.addEventListener('click', () => {
    G.touchMode = !G.touchMode;
    const chk = document.getElementById('chk-touch');
    if (chk) chk.checked = G.touchMode;
    _updateModeAndDiff();
    localStorage.setItem('krr_touchMode', G.touchMode ? '1' : '0');
    if (G.phase === 'run') applyTouchMode();
  });

  diffBtn?.addEventListener('click', () => {
    _cycleDifficulty();
  });

  document.getElementById('chk-touch')?.addEventListener('change', e => {
    G.touchMode = e.target.checked;
    _updateModeBtn();
    localStorage.setItem('krr_touchMode', G.touchMode ? '1' : '0');
    if (G.phase === 'run') applyTouchMode();
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

  // HUD: ring-arc announces world name; clock announces weather — both modes
  document.querySelector('.wave-ring-wrap')?.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (G.phase !== 'run' || !G.dungeon) return;
    const world = G.dungeon.worldDef;
    const worldDisplayName = i18n('worlds.' + world.id + '.name') || world.name;
    const worldSuffix = i18n('hud.worldSuffix');
    const worldNum = (G.run?.worldIdx ?? 0) + 1;
    const worldLabel = G.lang === 'ko' ? `${worldNum}${worldSuffix}` : `${worldSuffix} ${worldNum}`;
    flashAnnounce(`${world.emoji} ${worldLabel} — ${worldDisplayName}`, '#88ddff');
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
  _horizWheel(document.getElementById('title-dict-tabs'));
  _horizWheel(document.querySelector('#book-panel .dict-tabs'));

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
}

function _initMenuPreview() {
  // Pick a random world (never the first one) and random open doors for menu background
  const candidates = WORLDS.filter(w => w.id !== 'tutorial');
  const worldDef = candidates[Math.floor(Math.random() * candidates.length)];
  const allDirs = ['N', 'S', 'E', 'W'];
  const numDoors = 1 + Math.floor(Math.random() * 3); // 1–3 doors
  const shuffled = allDirs.sort(() => Math.random() - 0.5);
  const openDirs = shuffled.slice(0, numDoors);
  const patIdx = Math.floor(Math.random() * 6);
  G.menuPreview = { worldDef, openDirs, patIdx };
  // Start menu weather
  if (G.weatherEnabled) {
    const allowed = ALL_WEATHERS.filter(w => w !== 'clear' && w !== 'foggy' && w !== 'raining' && w !== 'blizzard');
    if (allowed.length) {
      const wx = allowed[Math.floor(Math.random() * allowed.length)];
      initWeather(wx);
      G.weather = wx;
    }
  }
}

function showTitleScreen() {
  if (G.ctrlPanelOpen || _ctrlState !== 'idle') closeCtrlPanel();
  screenOff('scr-over'); screenOff('scr-pause');
  screenOff('scr-modifier'); screenOff('scr-shop'); screenOff('scr-treasure');
  screenOn('scr-title');
  if (hudEl) { hudEl.style.display = 'none'; hudEl.style.opacity = ''; }
  if (paEl) paEl.style.display = 'none';
  G.phase = 'title';
  document.body.classList.add('phase-title');
  G.gameTime = 210; // reset to midday so menu is always bright
  // Mobile (height < 500px): always enable touch mode and clickable doors
  if (window.innerHeight < 500) {
    G.touchMode = true;
    G.clickableDoors = true;
    const chkTouch = document.getElementById('chk-touch');
    if (chkTouch) chkTouch.checked = true;
    const chkDoors = document.getElementById('chk-clickable-doors');
    if (chkDoors) chkDoors.checked = true;
  }
  _applyMenuZoom();
  // Initialize background room preview if not already set
  if (!G.menuPreview) _initMenuPreview();
  _weatherCycleTimer = 0;
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
  // Rebuild dynamically-created weapon picker labels (not in HTML, won't be covered above)
  const wgPick = document.getElementById('wg-pick');
  if (wgPick) {
    wgPick.querySelectorAll('.wgbtn .wg-lbl').forEach(lbl => {
      const key = lbl.dataset.i18n;
      if (key) lbl.textContent = i18n(key);
    });
  }
  // Rebuild weapon picker option labels in select elements (if any)
  document.querySelectorAll('[data-i18n-opt]').forEach(opt => {
    opt.textContent = i18n(opt.dataset.i18nOpt);
  });

  // Update rotate overlay text to match current language state
  if (window._updateRotateOverlayText) window._updateRotateOverlayText();
  // Update avatar tab tooltips
  _updateAvaTabTooltips();
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

let _titleDictCat = 'all';

function buildTitleDict(filter) {
  const container = document.getElementById('dict-list');
  const searchWrap = document.getElementById('title-dict-search-wrap');
  if (!container) return;

  // ── Add lesson tabs dynamically for completed lessons ─────────
  const titleTabContainer = document.getElementById('title-dict-tabs');
  if (titleTabContainer) {
    const existingLessonTabs = new Set(
      [...titleTabContainer.querySelectorAll('[data-cat]')]
        .filter(b => /^\d/.test(b.dataset.cat))
        .map(b => b.dataset.cat)
    );
    (G.completedLessons || []).forEach(id => {
      if (existingLessonTabs.has(id)) return;
      const lesson = LESSONS_BASE.find(l => l.id === id);
      if (!lesson) return;
      const btn = document.createElement('button');
      btn.className = 'dict-tab';
      btn.dataset.cat = id;
      btn.textContent = `${lesson.emoji} ${i18n(lesson.title_key)}`;
      btn.addEventListener('click', () => {
        document.querySelectorAll('#title-dict-tabs .dict-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _titleDictCat = id;
        buildTitleDict(document.getElementById('dict-search')?.value || '');
      });
      titleTabContainer.appendChild(btn);
    });
  }

  // ── Lesson tab: show markdown content ─────────────────────────
  if (/^\d/.test(_titleDictCat)) {
    if (searchWrap) searchWrap.style.display = 'none';
    const lesson = LESSONS_BASE.find(l => l.id === _titleDictCat);
    if (lesson) {
      const contentKey = lesson.title_key.replace('.title', '') + '.content';
      const md = i18n(contentKey);
      container.innerHTML = `<div class="lesson-viewer"><div class="lesson-viewer-inner">${parseLessonMarkdown(md)}</div></div>`;
    } else {
      container.innerHTML = '';
    }
    return;
  }

  if (_titleDictCat === 'grammar') {
    if (searchWrap) searchWrap.style.display = 'none';
    container.innerHTML = GRAMMAR_HTML;
    return;
  }

  if (searchWrap) searchWrap.style.display = '';

  // Show placeholder if fewer than 3 learned words
  const learned = G.learnedWords || [];
  if (learned.length < 3) {
    container.innerHTML = `<div style="padding:24px 12px;text-align:center;color:rgba(255,255,255,.4);font-size:.85rem;">${i18n('dict.myDictEmpty')}</div>`;
    return;
  }

  // Resolve learned words to WORD_DICT entries
  let words = learned.map(lw =>
    WORD_DICT.find(d => d.text === lw.text && d.emoji === lw.emoji) ||
    WORD_DICT.find(d => d.text === lw.text) ||
    lw
  );

  if (_titleDictCat && _titleDictCat !== 'all') {
    if (_titleDictCat === 'noun') {
      words = words.filter(w => w.category !== 'verb' && w.category !== 'adjective');
    } else {
      words = words.filter(w => w.category === _titleDictCat);
    }
  }

  if (words.length === 0) {
    container.innerHTML = `<div style="padding:24px 12px;text-align:center;color:rgba(255,255,255,.4);font-size:.85rem;">${i18n('dict.tabEmpty')}</div>`;
    return;
  }

  const q = (filter || '').toLowerCase().trim();
  if (q) {
    words = words.filter(w =>
      w.text.includes(q) ||
      wordTr(w.text).toLowerCase().includes(q)
    );
  }

  container.innerHTML = words.map(w => renderDictEntry(w)).join('');
}

/* ================================================================
   IN-RUN SHOP / TREASURE close helpers
================================================================ */
window.closeRunShop = function() { screenOff('scr-shop'); };
window.closeTreasure = function() { screenOff('scr-treasure'); };
window.invUseClick   = function() { invUse(); refreshInventoryUI(); };

/* ================================================================
   CTRL QUICK-ACTION PANEL
================================================================ */
function openCtrlPanel() {
  G.ctrlPanelOpen = true;
  _panelFadeAlpha = 0; // RAF fades panel in
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
    window.toggleMap();
  } else if (action === 'book') {
    window.toggleBook();
  }
}

window.ctrlPanelAction  = ctrlPanelAction;
window.ctrlInvNav       = ctrlInvNav;
window.closeCtrlPanel   = closeCtrlPanel;
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

function startNewRun() {
  resetRunState();
  const selectedDifficulty = document.getElementById('sel-difficulty')?.value || G.difficulty || localStorage.getItem('krr_difficulty') || 'normal';
  const diff = DIFFICULTY[selectedDifficulty] || DIFFICULTY.normal;
  G.playerMax = diff.lives;
  G.playerHP  = diff.lives;
  G.run.coinMult = diff.coinMult;
  G.hangulSize = window.innerWidth < 768 ? 29 : window.innerWidth >= 1600 ? 42 : 32;
  G.varyFonts = document.getElementById('chk-fonts')?.checked ?? true;
  G.weatherEnabled = document.getElementById('chk-weather')?.checked ?? true;
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
  document.getElementById('hs-best').textContent = '0원';

  G.phase = 'run';
  document.body.classList.remove('phase-title');
  startRun();
  // Update transition emoji to the actual first world's transport (known only after startRun)
  if (G.worldTransition && G.dungeon?.worldDef?.transport) {
    G.worldTransition.emoji = G.dungeon.worldDef.transport;
  }
  // If this was triggered from the Play button (transition in progress),
  // keep paEl hidden until animation completes
  if (G.worldTransition) {
    if (paEl) { paEl.style.transition = ''; paEl.style.opacity = '0'; }
    const prevOnComplete = G.worldTransition.onComplete;
    G.worldTransition.onComplete = () => {
      if (paEl) { paEl.style.display = 'flex'; paEl.style.opacity = '1'; }
      typingEl?.focus();
      _applyTouchZoom();
      setTimeout(_applyTouchZoom, 80);
      setTimeout(_applyTouchZoom, 250);
      if (prevOnComplete) prevOnComplete();
    };
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
  _imeCommitted = ''; _imeComposer.reset();
  typingEl?.focus();
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
  return `<div class="dict-entry${untouched ? ' dict-untouched' : ''}"${tooltipAttr}>
    <div class="dict-entry-main">
      <span class="dict-emoji">${w.emoji || fullEntry.emoji || ''}</span>
      <span class="dict-text">${w.text}</span>
      ${altsHtml}
      ${hanjaHtml}
      ${translation ? `<span class="dict-en">${translation}</span>` : ''}
      <a class="dict-link" href="${naverUrl}" target="_blank">🔗</a>
    </div>
  </div>`;
}

const GRAMMAR_HTML = `
<div class="guide-section">
  <div class="guide-title">Tense</div>
  <div class="guide-row"><span class="guide-icon">▶</span> <b>Present</b> — 아요/어요 <span class="guide-ex">가요 "goes"</span></div>
  <div class="guide-row"><span class="guide-icon">⏪</span> <b>Past</b> — 았어요/었어요 <span class="guide-ex">갔어요 "went"</span></div>
  <div class="guide-row"><span class="guide-icon">⏩</span> <b>Future</b> — ㄹ 거예요 <span class="guide-ex">갈 거예요 "will go"</span></div>
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
  const pw = document.getElementById('pause-chk-weather');
  const pt = document.getElementById('pause-chk-tts');
  const ptr = document.getElementById('pause-chk-translation');
  const ph = document.getElementById('pause-chk-hanja-monsters');
  if (pw) pw.checked = G.weatherEnabled;
  if (pt) {
    pt.checked = G.ttsEnabled;
    const ttsUnsupported = !!document.getElementById('chk-tts')?.disabled;
    pt.disabled = ttsUnsupported;
    pt.closest('.pause-opt-row')?.classList.toggle('tts-unsupported', ttsUnsupported);
  }
  if (ptr) ptr.checked = G.showTranslations ?? true;
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
  if (G.phase !== 'paused') return;
  G.phase = 'run';
  screenOff('scr-pause');
  typingEl?.focus();
}

function goToMenu() {
  if (_loreCancel) { _loreCancel(); }
  window._hideTutorial?.(true);
  G.phase = 'title';
  // Reset IME to off (normal title screen state), then clean up DOM
  if (_imeEnabled) _imeToggle();
  // Always clear typing field so old characters don't bleed into the next run
  if (typingEl) typingEl.value = '';
  _imeCommitted = ''; _imeComposer.reset();
  // Remove touch-mode class for menu UI but keep G.touchMode preference intact
  if (G.touchMode) document.body.classList.remove('touch-mode');
  _cleanupTouchExtras();
  G.menuPreview = null; // pick a new random room each time
  showTitleScreen();
}

/* ================================================================
   GAME OVER
================================================================ */
function showGameOver(victory) {
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
  // Save wallet
  G.wallet += G.run?.wallet ?? 0;
  localStorage.setItem('krr_wallet', G.wallet.toString());
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
  if (el) el.textContent = (G.run?.wallet ?? 0);
}

function updateHudWorld() {
  const world = G.dungeon?.worldDef;
  if (!world) return;
  const { col, row } = G.currentRoom || { col:0, row:0 };
  const colLetter = String.fromCharCode(65 + col);
  const worldDisplayName = i18n('worlds.' + world.id + '.name') || world.name;
  const worldSuffix = i18n('hud.worldSuffix');
  const worldNum = (G.run?.worldIdx ?? 0) + 1;
  const worldLabel = G.lang === 'ko' ? `${worldNum}${worldSuffix}` : `${worldSuffix} ${worldNum}`;
  const lblEl = document.getElementById('hud-world-lbl');
  if (lblEl) lblEl.textContent = `${worldLabel} - ${worldDisplayName}`;
  const bossEl = document.getElementById('hw-room');
  if (bossEl) bossEl.textContent = `${colLetter}${row + 1}방`;
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

  // Fall back to instant transition if ghost element missing
  if (!_ghost) { enterRoom(nc, nr); typingEl?.focus(); return; }

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
  _ghost.style.display = 'block'; // must be 'block' — '' inherits display:none from CSS
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

    enterRoom(nc, nr); // direct call — skips G.transition canvas fade

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
            typingEl?.focus();
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
window.toggleMap = function() {
  const panel = document.getElementById('map-panel');
  if (!panel) return;
  panel.classList.toggle('off');
  const mapOpen = !panel.classList.contains('off');
  document.body.classList.toggle('map-open', mapOpen);
  if (mapOpen) {
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
  }
};

document.getElementById('book-expand-btn')?.addEventListener('click', () => {
  const panel = document.getElementById('book-panel');
  panel?.classList.toggle('book-expanded');
});

window.toggleBook = function() {
  const panel = document.getElementById('book-panel');
  if (!panel) return;
  panel.classList.toggle('off');
  const bookOpen = !panel.classList.contains('off');
  document.body.classList.toggle('book-open', bookOpen);
  if (bookOpen) {
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
  }
};

function updateBook() {
  const panel = document.getElementById('book-panel');
  const listEl = document.getElementById('book-dict-list');
  if (!listEl || !panel) return;

  // ── Sync lesson tabs: only show completed lessons ─────────────
  const tabContainer = panel.querySelector('.dict-tabs');
  if (tabContainer) {
    const existingLessonTabs = new Set(
      [...tabContainer.querySelectorAll('[data-cat]')]
        .filter(b => /^\d/.test(b.dataset.cat))
        .map(b => b.dataset.cat)
    );
    (G.completedLessons || []).forEach(id => {
      if (existingLessonTabs.has(id)) return;
      const lesson = LESSONS_BASE.find(l => l.id === id);
      if (!lesson) return;
      const btn = document.createElement('button');
      btn.className = 'dict-tab';
      btn.dataset.cat = id;
      btn.textContent = `${lesson.emoji} ${i18n(lesson.title_key)}`;
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.dict-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        updateBook();
      });
      tabContainer.appendChild(btn);
    });

    // Wire static tabs once
    if (!tabContainer.dataset.wired) {
      tabContainer.dataset.wired = '1';
      tabContainer.querySelectorAll('.dict-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          panel.querySelectorAll('.dict-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          updateBook();
        });
      });
      const searchEl = document.getElementById('book-dict-search');
      if (searchEl) searchEl.addEventListener('input', updateBook);
    }
  }

  // ── Determine active tab ──────────────────────────────────────
  const activeTab = panel.querySelector('.dict-tab.active');
  const category = activeTab?.dataset.cat || 'noun';

  // ── Lesson tab: show markdown content ────────────────────────
  if (/^\d/.test(category)) {
    const lesson = LESSONS_BASE.find(l => l.id === category);
    if (lesson) {
      const contentKey = lesson.title_key.replace('.title', '') + '.content';
      const md = i18n(contentKey);
      listEl.innerHTML = `<div class="lesson-viewer"><div class="lesson-viewer-inner">${parseLessonMarkdown(md)}</div></div>`;
    } else {
      listEl.innerHTML = '';
    }
    return;
  }

  // ── Word category tab ─────────────────────────────────────────
  const searchEl = document.getElementById('book-dict-search');
  const q = (searchEl?.value || '').toLowerCase().trim();

  const learned = G.learnedWords || [];
  let words = learned.map(lw =>
    WORD_DICT.find(d => d.text === lw.text && d.emoji === lw.emoji) ||
    WORD_DICT.find(d => d.text === lw.text) ||
    lw
  ).filter(w => {
    if (category === 'noun') return w.category !== 'verb' && w.category !== 'adjective';
    return w.category === category;
  });

  if (q) {
    words = words.filter(w =>
      w.text.includes(q) ||
      wordTr(w.text).toLowerCase().includes(q)
    );
  }

  listEl.innerHTML = words.map(w => renderDictEntry(w)).join('');
}

/* ================================================================
   IME (2-beolsik Korean) TOGGLE
================================================================ */
function _imeToggle() {
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
  typingEl?.focus();
});

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

function _updateEnterGlow() {
  const enterBtn = document.getElementById('kb-touch-enter');
  if (!enterBtn) return;
  const hasContent = !!((_imeCommitted) || !_imeComposer.isEmpty || (typingEl?.value || '').trim());
  enterBtn.classList.toggle('has-input', hasContent);
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
  if (!_imeEnabled) {
    // 영 mode: insert latin letter directly into the input value
    const char = shifted ? k.toUpperCase() : k;
    if (typingEl) typingEl.value += char;
  } else {
    // 한 mode: feed jamo
    const effectiveKey = shifted ? k.toUpperCase() : k;
    const jamo = QWERTY_TO_JAMO[effectiveKey] ?? QWERTY_TO_JAMO[k];
    if (jamo) _imeCommitted += _imeComposer.input(jamo);
    if (typingEl) {
      typingEl.value = _imeCommitted + _imeComposer.composing;
      typingEl.setSelectionRange(typingEl.value.length, typingEl.value.length);
    }
  }
  if (_kbShift === 'shift') _setKbShift('off');
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
  if (_imeEnabled) {
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
  // Restore typing field for physical keyboard
  if (typingEl) {
    typingEl.removeAttribute('readonly');
    typingEl.removeAttribute('inputmode');
  }
  // Reset cursor on KB key wrappers (touch mode sets them to pointer)
  Object.values(_kbKeyEls).forEach(el => { if (el.parentElement) el.parentElement.style.cursor = ''; });
}

function applyTouchMode() {
  if (!G.touchMode) {
    document.body.classList.remove('touch-mode');
    _cleanupTouchExtras();
    _applyTouchZoom();
    return;
  }
  document.body.classList.add('touch-mode');

  // Ensure Korean IME is active on every game start (resets stale 영-mode from previous game)
  if (!_imeEnabled) _imeToggle();

  if (!_touchKeysWired) {
    _touchKeysWired = true;

    // Typing field: prevent system keyboard
    if (typingEl) {
      typingEl.setAttribute('inputmode', 'none');
      typingEl.setAttribute('readonly', 'readonly');
    }

    // Wire all KB keys to touch handler (once — same DOM elements throughout session)
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

  // Click on typing field = space (commits syllable + adds space)
  typingEl?.addEventListener('click', () => {
    if (!G.touchMode) return;
    _touchSpace();
  });

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
  const isMobile = window.innerHeight < 500;
  const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  document.body.classList.toggle('mobile-fs', isMobile && inFs);
  const fsOverlay = document.getElementById('fs-overlay');
  if (fsOverlay) {
    if (!isMobile) {
      // Screen large enough: hide overlay unconditionally
      fsOverlay.classList.add('off');
    } else if (!inFs) {
      // Mobile but not in fullscreen: request fullscreen
      fsOverlay.classList.remove('off');
    } else {
      fsOverlay.classList.add('off');
    }
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
  G.hangulSize = window.innerWidth < 768 ? 29 : window.innerWidth >= 1600 ? 42 : 32;
  resizeCanvas();
  _applyTouchZoom();
  if (G.ctrlPanelOpen) _applyCtrlZoom();
  if (G.phase === 'title') _applyMenuZoom();
});

/* ================================================================
   TYPING INPUT
================================================================ */
typingEl?.addEventListener('keydown', e => {
  // Touch mode: block ALL physical keyboard input — only pointer/touch events work
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

  // Enter — commit IME composition first, then fire onInput
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
      _imeCommitted = typingEl.value; // browser added a char — accept it
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

// Speak a Korean word — cancels any ongoing speech immediately
function speakKorean(text) {
  if (!G.ttsEnabled || !text || typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'ko-KR';
  utt.rate = 0.85;
  speechSynthesis.speak(utt);
}

function onInput() {
  if (G.phase !== 'run') return;
  _tabHintShown = false; // Re-arm the Latin character detection hint
  if (G.inTransition) { typingEl.value = ''; return; }
  if (G.frozen) { typingEl.value = ''; return; }
  const val = typingEl.value.trim();
  if (!val) {
    // Whitespace-only input — just clear the field
    typingEl.value = '';
    _imeCommitted = '';
    _imeComposer.reset();
    _updateEnterGlow();
    return;
  }

  // Speak what was typed — queued, fires even on wrong input
  speakKorean(val);

  // Ground items can always be collected (combat or navigate)
  if (tryCollectGroundItem(val)) { typingEl.value = ''; return; }

  // Cheat code (+ alias: "cheatcode" written on wrong keyboard layout)
  if (val === 'cheatcode' || val === '촏ㅁㅅ챙ㄷ') {
    typingEl.value = '';
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
        // Only flee if no monster has this word — killing always takes priority
        const monsters = G.room?.monsters?.filter(m => !m.dead) || [];
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
          const fleeMsg = G.lang === 'ko' ? '도망! 🏃' : G.lang === 'pt' ? 'Fuga! 🏃' : 'Flee! 🏃';
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

    // Nothing matched in navigate mode — scatter
    typingEl.style.color = '#ff4466';
    setTimeout(() => typingEl.style.color = '', 280);
    spawnMissParticles(val);
    typingEl.value = '';
    return;
  }

  // Combat: fire at best-matching monster
  {
    const monsters = G.room?.monsters?.filter(m => !m.dead) || [];
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
          if (w.startsWith(val) || val.startsWith(w)) {
            const score = Math.abs(w.length - val.length);
            if (score < bestScore) { bestScore = score; best = m; }
          }
        }
      }
      if (best) {
        fire(best);
      } else {
        // Wrong word flash + letters scatter
        typingEl.style.color = '#ff4466';
        setTimeout(() => typingEl.style.color = '', 280);
        spawnMissParticles(val);
      }
    } else {
      // No monsters alive — scatter
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
      _imeToggle();
    }
    // B: open Dictionary (skip if another input has focus, e.g. dict search)
    if (e.key === 'b' || e.key === 'B') {
      const inOtherInput = document.activeElement !== typingEl &&
        document.activeElement?.closest('input, textarea, select');
      if (!inOtherInput) { e.preventDefault(); window.toggleBook(); }
    }
    // M: toggle Map (skip if another input has focus)
    if (e.key === 'm' || e.key === 'M') {
      const inOtherInput = document.activeElement !== typingEl &&
        document.activeElement?.closest('input, textarea, select');
      if (!inOtherInput) { e.preventDefault(); window.toggleMap(); }
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
    // Enter to use item when not in typing field
    if (!G.inTransition && e.key === 'Enter' && document.activeElement !== typingEl) {
      e.preventDefault();
      invUse(); refreshInventoryUI();
    }
  }
  if (e.key === 'Escape') {
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
    // Close map if open and game is not paused — double ESC pauses
    const mapP = document.getElementById('map-panel');
    if (mapP && !mapP.classList.contains('off') && G.phase !== 'paused') {
      mapP.classList.add('off');
      document.body.classList.remove('map-open');
      setMapPlaceholder(false);
      if (G.touchMode && _mapOpenedWhileRunning && G.phase === 'paused') G.phase = 'run';
      _mapOpenedWhileRunning = false;
      return;
    }
    // ESC: pause if running, resume if paused (disabled in touch mode — ctrl-panel handles it)
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
  if (G.phase !== 'run' || G.ctrlPanelOpen) return;
  setTimeout(() => {
    if (G.phase !== 'run' || G.ctrlPanelOpen) return;
    const active = document.activeElement;
    // Let other inputs hold focus (dict search, cheat menu, pause, etc.)
    if (active && active !== typingEl && active.closest('#cheat-menu, #scr-pause, #book-panel, input, select, textarea')) return;
    typingEl.focus();
  }, 50);
});

// Close ctrl panel when window loses focus (tab switch, alt-tab, etc.)
// In touch mode the panel is persistent — don't auto-close on blur.
window.addEventListener('blur', () => {
  // Always reset shift state on focus loss — prevents visual desync when caps/shift
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
   DOOR BUTTONS — fixed DOM buttons positioned over each door opening
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
        const fleeMsg = G.lang === 'ko' ? '도망! 🏃' : G.lang === 'pt' ? 'Fuga! 🏃' : 'Flee! 🏃';
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

    const d = DOOR_SCREEN[dir];
    btn.style.display = G.clickableDoors ? 'block' : 'none';
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
   MOBILE — visualViewport (verbatim from original)
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
  setTimeout(() => typingEl.focus(), 0);
});

/* ================================================================
   CHEAT MENU
================================================================ */
function buildCheatMenu() {
  document.getElementById('cheat-reset-btn')?.addEventListener('click', () => {
    if (confirm(i18n('misc.confirmReset'))) { localStorage.clear(); location.reload(); }
  });
}

let _cheatOpenedWhileRunning = false;
function openCheatMenu() {
  populateCheatItemSel();
  populateCheatModSel();
  document.getElementById('cheat-menu')?.classList.add('on');
  document.body.classList.add('cheat-open');
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
    const allItemsMsg = G.lang === 'ko' ? '🎁 모든 아이템 지급!' : G.lang === 'pt' ? '🎁 Todos os itens!' : '🎁 All items!';
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
      if (!G.learnedWords.find(lw => lw.text === w)) {
        const wordDef = WORD_DICT.find(d => d.text === w);
        G.learnedWords.push({ text: w, emoji: wordDef?.emoji || '🎓' });
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

/* ================================================================
   SCREEN HELPERS
================================================================ */
function screenOn(id)  {
  const el = document.getElementById(id);
  if (el) el.classList.remove('off');
}
function screenOff(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('off');
}

/* ================================================================
   ORIENTATION LOCK — portrait (width < height × 0.75) shows rotate overlay
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

    // Translations not yet loaded — show English fallback to avoid raw key flash
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
        descEl.textContent  = meta.unsupportedDesc  || 'EZRA Taja does not run on Safari. Please open it in Chrome, Firefox, or Edge.';
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
      
      // If startup animation was pending, run it now after 200ms for rotation animation
      if (_startupAnimationPending) {
        setTimeout(() => {
          if (_startupAnimationPending) {
            _startupAnimationPending();
            _startupAnimationPending = null;
          }
        }, 200);
      }
    }
  }
  window.addEventListener('resize', checkOrientation);
  checkOrientation();
})();

/* ================================================================
   BOOT
================================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
