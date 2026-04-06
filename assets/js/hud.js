/* ================================================================
   HUD — DOM-based UI: lives, wallet, world indicator, permanent
   items bar, all special-room screens, game over
================================================================ */
import { G, savePersistentState } from './state.js';
import { get as i18n, wordTr } from './i18n.js';
import { PERMANENTS, generateShopInventory, POWERUP_DEFS, formatKoreanNumber } from '../data/items.js';
import { pickModifierItem, shopBuy, collectTreasure, startNewWorld } from './world.js';
import { currentCell } from './world.js';
import { addToInventory, flashAnnounce } from './combat.js';
import { LESSONS_BASE } from '../data/lessons.js';
import { WORD_DICT } from '../data/words.js';

/* ================================================================
   LIVE HUD UPDATE
================================================================ */
export function updateHud() {
  updateLives();
  updateWallet();
  updateWorldIndicator();
  updatePermanentBar();
  updateInventoryBar();
}

export function updateLives() {
  const el = document.getElementById('hud-lives');
  if (!el) return;
  const hp  = G.playerHP  || 0;
  const max = G.playerMax || 5;
  let html = '';
  for (let i = 0; i < max; i++) {
    html += i < hp ? '<span class="heart full">❤️</span>' : '<span class="heart empty">🖤</span>';
  }
  el.innerHTML = html;
}

export function updateWallet() {
  const el = document.getElementById('hs-val');
  if (!el) return;
  el.textContent = formatKoreanNumber(G.run?.wallet ?? 0);
  const lbl = document.getElementById('hs-best-lbl');
  if (lbl) {
    lbl.textContent = i18n('hud.pending') + ': ';
  }
  const pendingEl = document.getElementById('hs-best');
  if (pendingEl) pendingEl.textContent = formatKoreanNumber(G.room?.roomPool || 0) + '원';
}

export function updateWorldIndicator() {
  const el = document.getElementById('hud-world');
  if (!el || !G.dungeon) return;
  const world = G.dungeon.worldDef;
  const { col, row } = G.currentRoom || { col: 0, row: 0 };
  const colLetter = String.fromCharCode(65 + col); // A-H
  const worldName = i18n('worlds.' + world.id + '.name') || world.name;
  el.textContent = `${world.emoji} ${worldName}  ${colLetter}${row + 1}`;
}

export function updatePermanentBar() {
  const permBar = document.getElementById('perm-bar');
  const tooltip = document.getElementById('shop-tooltip');
  const perms = G.run?.permanents || [];
  if (!permBar) return;
  permBar.innerHTML = '';
  for (const id of perms) {
    const def = PERMANENTS.find(p => p.id === id);
    if (!def) continue;
    const slot = document.createElement('div');
    slot.className = 'perm-slot';
    slot.textContent = def.emoji;
    if (tooltip) {
      slot.addEventListener('mouseenter', e => {
        const _name = i18n('items.' + def.id + '.name');
        const _desc = i18n('items.' + def.id + '.desc');
        tooltip.textContent = `${def.emoji} ${_name}: ${_desc}`;
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.right = 'auto';
        tooltip.style.top  = (e.clientY - 38)  + 'px';
        tooltip.classList.add('show');
      });
      slot.addEventListener('mousemove', e => {
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.right = 'auto';
        tooltip.style.top  = (e.clientY - 38)  + 'px';
      });
      slot.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
    }
    permBar.appendChild(slot);
  }
}

export function updateInventoryBar() {
  const bar = document.getElementById('inv-bar');
  if (!bar) return;
  const stacks = G.inventory?.stacks || [];
  bar.innerHTML = '';
  stacks.forEach((stack, i) => {
    const key = stack.item; // stack.item is the emoji key string
    const def = POWERUP_DEFS[key] || {};
    const el = document.createElement('div');
    el.className = 'inv-slot' + (i === G.inventory.sel ? ' selected' : '');
    el.innerHTML = `<span class="inv-emoji">${key}</span>` +
      (stack.count > 1 ? `<span class="inv-count">×${stack.count}</span>` : '');
    el.title = (def.id ? i18n('items.' + def.id + '.name') : null) || key;
    bar.appendChild(el);
  });
}

/* ================================================================
   SHOP SCREEN
================================================================ */
export function renderShopScreen(cell) {
  const scr = document.getElementById('scr-shop');
  if (!scr) return;
  ['scr-modifier', 'scr-treasure'].forEach(id => document.getElementById(id)?.classList.add('off'));
  scr.classList.remove('off');

  const body = document.getElementById('shop-items-grid');
  const tooltip = document.getElementById('shop-tooltip');
  if (!body) return;

  const wallet = G.run?.wallet || 0;
  const walletEl = document.getElementById('run-shop-wallet');
  if (walletEl) walletEl.textContent = `💰 ${formatKoreanNumber(wallet)}원`;
  // Generate shop inventory once per room visit; cache on cell
  if (!cell._shopInventory) {
    cell._shopInventory = generateShopInventory(G, G.run?.worldIdx || 0);
  }
  const inventory = cell._shopInventory;
  const consumables = inventory.filter(e => e.type === 'consumable');
  const modifiers   = inventory.filter(e => e.type === 'modifier');

  const sectionCons = i18n('shop.consumablesSection');
  const sectionMods = i18n('shop.upgradesSection');
  const modsSection = modifiers.length > 0 ? `
    <div class="shop-section-title">${sectionMods}</div>
    <div class="shop-grid" id="shop-modifiers-grid"></div>
  ` : '';
  body.innerHTML = `
    <div class="shop-section-title">${sectionCons}</div>
    <div class="shop-grid" id="shop-consumables-grid"></div>
    ${modsSection}
  `;

  // Compute effective price: base price × 2^(stack count in inventory)
  function effectivePrice(entry) {
    if (entry.type !== 'consumable') return entry.basePrice || entry.price;
    const stacks = G.inventory?.stacks || [];
    const stack = stacks.find(s => s.item === entry.itemKey);
    const count = stack?.count || 0;
    return Math.round((entry.basePrice || entry.price) * Math.pow(2, count));
  }

  function makeItem(entry) {
    let emoji, name, desc, canAfford, isSoldOut = false;
    const price = effectivePrice(entry);
    if (entry.type === 'consumable') {
      const def = POWERUP_DEFS[entry.itemKey];
      if (!def) return null;
      emoji = entry.itemKey;
      name  = i18n('items.' + def.id + '.name');
      desc  = i18n('items.' + def.id + '.desc');
      canAfford = wallet >= price;
    } else {
      const perm = PERMANENTS.find(p => p.id === entry.permId);
      if (!perm) return null;
      emoji = perm.emoji;
      name  = i18n('items.' + perm.id + '.name');
      desc  = i18n('items.' + perm.id + '.desc');
      isSoldOut = G.run?.permanents?.includes(entry.permId);
      canAfford = !isSoldOut && wallet >= price;
    }
    const div = document.createElement('div');
    div.className = 'shop-item' + (!canAfford ? ' sold-out' : '');
    const ownedLabel = i18n('shop.owned');
    const priceLabel = isSoldOut ? ownedLabel : `${formatKoreanNumber(price)}원`;
    const badge = isSoldOut ? `<div class="shop-item-count">✓</div>` : '';
    div.innerHTML = `
      <div class="shop-item-emoji">${emoji}</div>
      <div class="shop-item-name">${name}</div>
      <div class="shop-item-price">${priceLabel}</div>
      ${badge}`;
    if (canAfford) {
      div.onclick = () => {
        if (shopBuy(cell, entry, price)) renderShopScreen(cell);
      };
    }
    if (tooltip) {
      div.onmouseenter = e => {
        tooltip.textContent = desc;
        tooltip.style.left = e.clientX + 12 + 'px';
        tooltip.style.top  = e.clientY - 30 + 'px';
        tooltip.classList.add('show');
      };
      div.onmouseleave = () => tooltip.classList.remove('show');
    }
    return div;
  }

  const cGrid = body.querySelector('#shop-consumables-grid');
  const mGrid = body.querySelector('#shop-modifiers-grid');
  consumables.forEach(e => { const el = makeItem(e); if (el) cGrid.appendChild(el); });
  if (mGrid) modifiers.forEach(e => { const el = makeItem(e); if (el) mGrid.appendChild(el); });

  // Korean number guide: show if any item costs ≥ 10,000원
  const hasLargePrice = inventory.some(e => effectivePrice(e) >= 10000);
  let numGuide = body.querySelector('.shop-number-guide');
  if (hasLargePrice) {
    if (!numGuide) {
      numGuide = document.createElement('div');
      numGuide.className = 'shop-number-guide';
      body.appendChild(numGuide);
    }
    numGuide.innerHTML = '만: 10,000 · 억: 10<sup>8</sup> · 조: 10<sup>12</sup> · 경: 10<sup>16</sup> · 해: 10<sup>20</sup> · 자: 10<sup>24</sup> · 양: 10<sup>28</sup> · 구: 10<sup>32</sup>';
  } else if (numGuide) {
    numGuide.remove();
  }
}

/* ================================================================
   TEACHER SCREEN — Markdown processor + TTS
================================================================ */
function _inlineMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
}

export function parseLessonMarkdown(md) {
  if (!md) return '<p><em>—</em></p>';

  // 1. Process <speak='word'> tags (self-closing, with or without backtick wrapping)
  md = md.replace(/`?<speak='([^']+)'>`?/g, (_, word) => {
    const safe = word.replace(/'/g, "\\'");
    return `<button class="md-speak-btn" onclick="window._speak('${safe}')">🔊 <span class="md-speak-word">${word}</span></button>`;
  });

  // 2. Process <word='word'> tags — show emoji + hangul + translation inline
  md = md.replace(/`?<word='([^']+)'>`?/g, (_, word) => {
    const entry = WORD_DICT.find(e => e.text === word);
    if (!entry) return `<span class="md-word-inline">${word}</span>`;
    const wield = entry.secondaryEmoji || entry.emoji || '';
    const tr = wordTr(word);
    return `<span class="md-word-entry">${wield ? `<span class="md-word-wield">${wield}</span> ` : ''}<strong class="md-word-hangul">${word}</strong>${tr ? ` <span class="md-word-tr">(${tr})</span>` : ''}</span>`;
  });

  // 3. Process line by line
  const lines = md.split('\n');
  const out = [];
  let inTable = false;
  let tableRows = [];

  const flushTable = () => {
    if (!tableRows.length) return;
    const [head, ...body] = tableRows;
    const headHtml = head.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
    out.push(`<table class="md-table"><thead><tr>${headHtml}</tr></thead><tbody>${body.map(r => `<tr>${r}</tr>`).join('')}</tbody></table>`);
    tableRows = [];
    inTable = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('|')) {
      if (/^\|[\s\-:|]+\|/.test(line)) continue; // separator row
      const cells = line.replace(/^\||\|$/g, '').split('|').map(c => `<td>${_inlineMarkdown(c.trim())}</td>`).join('');
      inTable = true;
      tableRows.push(cells);
      continue;
    }

    if (inTable) { flushTable(); }

    if (!line) { out.push('<div class="md-br"></div>'); continue; }

    if (line.startsWith('#### ')) { out.push(`<h4 class="md-h4">${_inlineMarkdown(line.slice(5))}</h4>`); continue; }
    if (line.startsWith('### ')) { out.push(`<h3 class="md-h3">${_inlineMarkdown(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## '))  { out.push(`<h3 class="md-h3">${_inlineMarkdown(line.slice(3))}</h3>`); continue; }

    if (line.startsWith('* ') || line.startsWith('- ')) {
      out.push(`<li class="md-li">${_inlineMarkdown(line.slice(2))}</li>`); continue;
    }
    if (/^\d+\.\s/.test(line)) {
      out.push(`<li class="md-li">${_inlineMarkdown(line.replace(/^\d+\.\s/, ''))}</li>`); continue;
    }
    if (line.startsWith('> ')) {
      out.push(`<blockquote class="md-quote">${_inlineMarkdown(line.slice(2))}</blockquote>`); continue;
    }

    out.push(`<p class="md-p">${_inlineMarkdown(line)}</p>`);
  }

  if (inTable) flushTable();

  return out.join('\n');
}

// Global helper for speak buttons
window._speak = (txt) => {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(txt); u.lang = 'ko-KR'; speechSynthesis.speak(u);
  }
};

/* ================================================================
   TEACHER EVALUATION (CHALLENGE) SYSTEM
================================================================ */
let _testState = null; // { questions: [], cur: 0, hits: 0, prize: null, won: 0 }

function generateGibberish(correct) {
  // Swap specific jamos: ㅓ/ㅏ, ㅇ/ㅁ, ㅂ/ㅍ, ㅈ/ㅊ, ㄱ/ㅋ/ㄲ
  const swaps = { 'ㅓ':'ㅏ', 'ㅏ':'ㅓ', 'ㅇ':'ㅁ', 'ㅁ':'ㅇ', 'ㅂ':'ㅍ', 'ㅍ':'ㅂ', 'ㅈ':'ㅊ', 'ㅊ':'ㅈ', 'ㄱ':'ㅋ', 'ㅋ':'ㄲ', 'ㄲ':'ㄱ' };
  let result = '';
  for (const char of correct) {
    const code = char.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const v = code - 0xAC00;
      let jong = v % 28, jung = Math.floor(v / 28) % 21, cho = Math.floor(v / 28 / 21);
      // Simple swap logic for testing complexity
      if (Math.random() < 0.5) jung = (jung + 1) % 21;
      else cho = (cho + 1) % 19;
      result += String.fromCharCode(0xAC00 + (cho * 21 + jung) * 28 + jong);
    } else {
      result += char;
    }
  }
  return result;
}

function buildQuestions() {
  // Build pool from all words the player has encountered (kills + lessons)
  const pool = (G.learnedWords || [])
    .map(w => WORD_DICT.find(d => d.text === w.text))
    .filter(Boolean);
  if (pool.length < 10) return []; // Too few words to test

  const questions = [];
  const types = ['ko_to_trans', 'emoji_to_ko', 'emoji_to_write', 'ko_to_emoji', 'listen_to_write', 'listen_to_choice', 'conj_choice'];
  
  for (let i = 0; i < 20; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const correct = pool[Math.floor(Math.random() * pool.length)];
    const options = [correct];
    
    // Generate 7 distractors
    while (options.length < 8) {
      if (type === 'listen_to_choice') {
        options.push({ text: generateGibberish(correct.text), isFake: true });
      } else {
        const rand = WORD_DICT[Math.floor(Math.random() * WORD_DICT.length)];
        if (!options.find(o => o.text === rand.text)) options.push(rand);
      }
    }
    
    questions.push({ type, correct, options: options.sort(() => Math.random() - 0.5) });
  }
  return questions;
}

export function startTeacherChallenge(container, cell) {
  const questions = buildQuestions();
  if (!questions.length) {
    document.getElementById('scr-teacher').classList.add('off');
    flashAnnounce(i18n('teacher.notEnoughWords'), '#ff4444');
    return;
  }

  // Prize: Random unowned modifier + Won per hit
  const unowned = PERMANENTS.filter(p => !G.run?.permanents?.includes(p.id));
  const prizeMod = unowned.length ? unowned[Math.floor(Math.random() * unowned.length)] : null;
  const wonPerHit = ((G.run?.worldIdx || 0) + 1) * 50;

  _testState = { questions, cur: 0, hits: 0, prize: prizeMod, won: 0, wonPerHit, cell };

  // Ensure Korean IME is on for written questions
  const toggle = document.getElementById('ime-toggle');
  if (toggle && !toggle.classList.contains('active')) toggle.click();

  renderQuestion();
}

function renderQuestion() {
  const scr = document.getElementById('scr-teacher');
  const container = scr.querySelector('.menu-card');
  const q = _testState.questions[_testState.cur];

  const dotsHtml = Array.from({ length: 20 }, (_, i) => {
    const cls = i < _testState.cur ? 'done' : i === _testState.cur ? 'current' : '';
    return `<span class="test-dot${cls ? ' ' + cls : ''}"></span>`;
  }).join('');
  const headerHtml = `<div class="test-header">
    <div class="test-dots">${dotsHtml}</div>
    <span class="test-hits">${i18n('teacher.hitsCount', { hits: _testState.hits })}</span>
  </div>
  <button class="pause-btn test-giveup-btn" id="test-giveup">❌ ${i18n('teacher.giveUp')}</button>`;

  let contentHtml = '';

  // Helper: render emoji safely (use secondaryEmoji as wield icon like monsters do)
  const wieldEmoji = (entry) => (entry.secondaryEmoji || entry.emoji || '❓');

  switch (q.type) {
    case 'ko_to_trans':
      contentHtml = `<div class="test-big-word">${q.correct.text}</div>
        <div class="test-grid-2">
          ${q.options.map(o => {
            const tr = wordTr(o.text) || o.text;
            return `<button class="pause-btn test-ans-btn" data-answer="${o.text.replace(/"/g,'&quot;')}">${tr}</button>`;
          }).join('')}
        </div>`;
      break;

    case 'emoji_to_ko':
      contentHtml = `<div class="test-big-emoji">${wieldEmoji(q.correct)}</div>
        <div class="test-grid-4">
          ${q.options.map(o => `<button class="pause-btn test-ko-btn test-ans-btn" data-answer="${o.text.replace(/"/g,'&quot;')}">${o.text}</button>`).join('')}
        </div>`;
      break;

    case 'ko_to_emoji':
      contentHtml = `<div class="test-big-word">${q.correct.text}</div>
        <div class="test-grid-4">
          ${q.options.map(o => `<button class="pause-btn test-emoji-btn test-ans-btn" data-answer="${o.text.replace(/"/g,'&quot;')}">${wieldEmoji(o)}</button>`).join('')}
        </div>`;
      break;

    case 'emoji_to_write':
    case 'listen_to_write': {
      const isListen = q.type === 'listen_to_write';
      contentHtml = `
        ${isListen
          ? `<button class="pause-btn md-speak-btn test-listen-btn" id="test-listen-play">${i18n('teacher.listenBtn')}</button>`
          : `<div class="test-big-emoji">${wieldEmoji(q.correct)}</div>`}
        <p>${isListen ? i18n('teacher.listenWrite') : i18n('teacher.writeEmoji')}</p>
        <input type="text" id="test-write-input" class="cheat-inp test-write-inp" autocomplete="off" autocorrect="off">
        <button class="pause-btn" id="test-write-submit" style="background:#27ae60; margin-top:8px">→</button>
      `;
      break;
    }

    case 'listen_to_choice': {
      contentHtml = `<button class="pause-btn md-speak-btn test-listen-btn" id="test-listen-play">${i18n('teacher.listenBtn')}</button>
        <div class="test-grid-2">
          ${q.options.map(o => `<button class="pause-btn test-ko-btn test-ans-btn" data-answer="${o.text.replace(/"/g,'&quot;')}">${o.text}</button>`).join('')}
        </div>`;
      break;
    }

    case 'conj_choice': {
      const entry = q.correct;
      contentHtml = `<p class="test-prompt">${i18n('teacher.conjugationPrompt')}</p>
        <div class="test-big-word">${entry.text} <span style="font-size:1rem;opacity:.6">(해요체)</span></div>
        <div class="test-grid-2">
          ${q.options.map(o => {
            const conjText = o.textVariations?.haeyoche?.present || generateGibberish(o.text.replace('다', '') + '요');
            return `<button class="pause-btn test-ko-btn test-ans-btn" data-answer="${conjText.replace(/"/g,'&quot;')}">${conjText}</button>`;
          }).join('')}
        </div>`;
      break;
    }
  }

  container.innerHTML = headerHtml + contentHtml;

  // Wire answer buttons via data attributes (safe from quote/injection issues)
  container.querySelectorAll('.test-ans-btn').forEach(btn => {
    btn.addEventListener('click', () => window._submitTestAnswer(btn.dataset.answer));
  });
  // Wire listen button
  const listenBtn = container.querySelector('#test-listen-play');
  if (listenBtn) {
    listenBtn.addEventListener('click', () => window._speak(q.correct.text));
    if (q.type === 'listen_to_write' || q.type === 'listen_to_choice') {
      window._speak(q.correct.text);
    }
  }
  // Wire write submit
  const writeSubmit = container.querySelector('#test-write-submit');
  if (writeSubmit) {
    writeSubmit.addEventListener('click', () => {
      const inp = container.querySelector('#test-write-input');
      if (inp) window._submitTestAnswer(inp.value);
    });
  }
  const inp = container.querySelector('#test-write-input');
  if (inp) {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); window._submitTestAnswer(inp.value); } });
    setTimeout(() => inp.focus(), 100);
  }
  // Wire give-up button
  container.querySelector('#test-giveup')?.addEventListener('click', () => {
    _testState.cur = 20;
    if (_testState.cell) _testState.cell.gaveUp = true;
    finishTest();
  });
}

window._submitTestAnswer = (val) => {
  const q = _testState.questions[_testState.cur];
  const correctText = q.type === 'conj_choice'
    ? (q.correct.textVariations?.haeyoche?.present || q.correct.text)
    : q.correct.text;

  if (val.trim() === correctText) {
    _testState.hits++;
    _testState.won += _testState.wonPerHit;
    flashAnnounce(i18n('teacher.correct'), '#27ae60');
  } else {
    flashAnnounce(`${i18n('teacher.wrongPrefix')} ${correctText}`, '#e74c3c');
  }

  _testState.cur++;
  if (_testState.cur < 20) {
    renderQuestion();
  } else {
    finishTest();
  }
};

function finishTest() {
  const scr = document.getElementById('scr-teacher');
  const container = scr.querySelector('.menu-card');
  const passed = _testState.hits >= 16; // 80% threshold

  if (passed) {
    G.relThreshold = 0; // Passed the final test — all vocab unlocked
    if (_testState.prize && G.run) {
      G.run.permanents.push(_testState.prize.id);
      _testState.prize.onAcquire(G);
    }
    if (G.run) G.run.wallet += _testState.won;
    savePersistentState();

    container.innerHTML = `
      <h1 style="color:#27ae60">${i18n('teacher.passed')}</h1>
      <p>${_testState.hits}/20</p>
      <div class="test-reward-box">
        <p>💰 ${i18n('teacher.wonLabel')} ${formatKoreanNumber(_testState.won)}원</p>
        ${_testState.prize ? `<p>🎁 ${i18n('teacher.itemLabel')} ${_testState.prize.emoji} ${i18n('items.' + _testState.prize.id + '.name')}</p>` : ''}
      </div>
      <p style="font-size:0.8rem; opacity:0.7; margin-top:8px">${i18n('teacher.vocabNote')}</p>
      <div style="text-align:center; margin-top:16px">
        <button class="pause-btn" onclick="document.getElementById('scr-teacher').classList.add('off')">${i18n('teacher.close')}</button>
      </div>
    `;
    flashAnnounce(i18n('teacher.vocabExpanded'), '#ffd700');
  } else {
    container.innerHTML = `
      <h1 style="color:#e74c3c">${i18n('teacher.failed')}</h1>
      <p>${_testState.hits}/20</p>
      <div style="text-align:center; margin-top:16px">
        <button class="pause-btn" onclick="document.getElementById('scr-teacher').classList.add('off')">${i18n('teacher.retryNextWorld')}</button>
      </div>
    `;
  }
}

const LESSON_COOLDOWN_SECS = 1860; // 31 minutes of gametime per world

function getLessonCooldownRemaining() {
  const cd = G.run?.worldLessonCooldowns;
  if (!cd) return 0;
  const ts = cd[G.run?.worldIdx];
  if (ts === undefined) return 0;
  return Math.max(0, LESSON_COOLDOWN_SECS - (G.gameTime - ts));
}

export function renderTeacherScreen(cell) {
  const scr = document.getElementById('scr-teacher');
  if (!scr) return;
  scr.classList.remove('off');

  const container = document.getElementById('teacher-content');
  const lesson = cell.currentLesson;

  const isHealthy = G.playerHP >= G.playerMax;
  const alreadyLearned = lesson && G.completedLessons?.includes(lesson.id);
  const gaveUp = cell.gaveUp === true;
  const cdRemaining = getLessonCooldownRemaining();
  const onCooldown = cdRemaining > 0;
  const cdMins = Math.ceil(cdRemaining / 60);

  // Build lesson card — disabled if on cooldown or not full health
  let lessonCardHtml = '';
  if (lesson) {
    const disabledCls = (onCooldown || !isHealthy) ? 'disabled' : '';
    const tooltipAttr = onCooldown
      ? `data-tooltip="${i18n('teacher.lessonOnCooldown')}"`
      : '';
    lessonCardHtml = `
      <div class="item-choice-card teacher-lesson-card ${disabledCls}" id="btn-start-lesson" ${tooltipAttr}>
        <div class="choice-badge">${i18n('teacher.lessonBadge')}</div>
        <div class="choice-emoji">${lesson.emoji}</div>
        <div class="choice-name">${i18n(lesson.title_key)}</div>
        ${alreadyLearned ? '<div class="choice-desc" style="color:#3aaf80">✓</div>' : ''}
        ${onCooldown ? `<div class="teacher-lesson-cooldown">${cdMins}분</div>` : ''}
      </div>`;
  }

  container.innerHTML = `
    <p class="teacher-warning-msg">${i18n('teacher.difficultyWarning')}</p>
    <div id="teacher-main-ui" style="display:flex; gap:15px; margin-top:16px; justify-content:center; flex-wrap:wrap;">
      ${lessonCardHtml}
      ${gaveUp ? '' : `
      <div class="item-choice-card teacher-challenge-card" id="btn-start-challenge">
        <div class="choice-badge">${i18n('teacher.challengeBadge')}</div>
        <div class="choice-emoji">💪</div>
        <div class="choice-name">${i18n('teacher.challengeTitle')}</div>
      </div>`}
    </div>
    ${lesson && !isHealthy && !onCooldown ? `<p class="teacher-health-warning">${i18n('teacher.fullHealthRequired')}</p>` : ''}
    <div style="text-align:center; margin-top:16px">
      <button class="pause-btn teacher-exit-btn" onclick="document.getElementById('scr-teacher').classList.add('off')">${i18n('teacher.exit')}</button>
    </div>
  `;

  if (lesson && !onCooldown) {
    container.querySelector('#btn-start-lesson').onclick = () => {
      if (!isHealthy) return;
      showLessonContent(container, lesson, cell);
    };
  }

  if (!gaveUp) {
    container.querySelector('#btn-start-challenge').onclick = () => {
      startTeacherChallenge(container, cell);
    };
  }
}

function showLessonContent(container, lesson, cell) {
  const contentKey = lesson.title_key.replace('.title', '') + '.content';
  const content = i18n(contentKey);
  // Back button brings teacher main menu back
  window._teacherBack = () => renderTeacherScreen(cell);

  container.innerHTML = `
    <div class="lesson-viewer">
      <div class="lesson-viewer-inner">${parseLessonMarkdown(content)}</div>
      <div style="text-align:center; padding:16px 0 4px">
        <button id="btn-lesson-done" class="pause-btn" style="background:#27ae60; min-width:120px">${i18n('teacher.understood')}</button>
      </div>
    </div>
    <div style="text-align:center; margin-top:8px">
      <button class="pause-btn" onclick="window._teacherBack()" style="opacity:0.7">${i18n('teacher.back')}</button>
    </div>
  `;

  container.querySelector('#btn-lesson-done').onclick = () => {
    if (!G.completedLessons) G.completedLessons = [];
    if (!G.completedLessons.includes(lesson.id)) {
      G.completedLessons.push(lesson.id);
      // Record cooldown timestamp for this world
      if (G.run) {
        if (!G.run.worldLessonCooldowns) G.run.worldLessonCooldowns = {};
        G.run.worldLessonCooldowns[G.run.worldIdx] = G.gameTime;
      }
      // Add lesson's words to learnedWords pool (cross-run)
      if (!G.learnedWords) G.learnedWords = [];
      lesson.unlockedWords.forEach(w => {
        if (!G.learnedWords.find(lw => lw.text === w)) {
          const wordDef = WORD_DICT.find(d => d.text === w);
          G.learnedWords.push({ text: w, emoji: wordDef?.emoji || '🎓' });
        }
      });
      // Lower vocab threshold by 5 per lesson (floor 0)
      G.relThreshold = Math.max(0, (G.relThreshold ?? 90) - 5);
      // Apply lesson flags
      if (lesson.unlockVerbCounting)  G.verbCountingUnlocked  = true;
      if (lesson.unlockModifier)      G.modifierUnlocked      = true;
      if (lesson.unlockBanmal)        G.banmalUnlocked        = true;
      if (lesson.unlockHasipsioche)   G.hasipsiocheUnlocked   = true;
      savePersistentState();
      flashAnnounce(i18n('teacher.lessonDone'), '#27ae60');
    }
    document.getElementById('scr-teacher').classList.add('off');
  };
}

window._teacherRenderer = renderTeacherScreen;

/* ================================================================
   MODIFIER SCREEN (item choice)
================================================================ */
export function renderModifierScreen(cell) {
  const scr = document.getElementById('scr-modifier');
  if (!scr) return;
  ['scr-shop', 'scr-treasure'].forEach(id => document.getElementById(id)?.classList.add('off'));
  scr.classList.remove('off');

  const container = document.getElementById('modifier-choices');
  if (!container) return;
  container.innerHTML = '';

  const badgePerm = i18n('hud.permanent');
  const badgeCons = i18n('hud.consumable');

  (cell.itemChoices || []).forEach((choice, i) => {
    const div = document.createElement('div');
    div.className = 'item-choice-card';
    if (choice.type === 'permanent') {
      const name = i18n('items.' + choice.item.id + '.name');
      const desc = i18n('items.' + choice.item.id + '.desc');
      div.classList.add('permanent');
      div.innerHTML = `
        <div class="choice-badge">${badgePerm}</div>
        <div class="choice-emoji">${choice.item.emoji}</div>
        <div class="choice-name">${name}</div>
        <div class="choice-desc">${desc}</div>`;
    } else {
      const def = POWERUP_DEFS[choice.itemKey] || {};
      const name = (def.id ? i18n('items.' + def.id + '.name') : null) || choice.itemKey;
      const desc = (def.id ? i18n('items.' + def.id + '.desc') : null) || '';
      div.innerHTML = `
        <div class="choice-badge">${badgeCons}</div>
        <div class="choice-emoji">${choice.itemKey}</div>
        <div class="choice-name">${name}</div>
        <div class="choice-desc">${desc}</div>`;
    }
    div.onclick = () => {
      pickModifierItem(cell, i);
      document.getElementById('scr-modifier')?.classList.add('off');
      updateHud();
    };
    container.appendChild(div);
  });

  // Skip button
  const skip = document.getElementById('modifier-skip');
  if (skip) skip.onclick = () => scr.classList.add('off');
}

/* ================================================================
   TREASURE SCREEN
================================================================ */
export function renderTreasureScreen(cell) {
  const scr = document.getElementById('scr-treasure');
  if (!scr) return;
  ['scr-shop', 'scr-modifier'].forEach(id => document.getElementById(id)?.classList.add('off'));
  scr.classList.remove('off');

  const container = document.getElementById('treasure-items');
  if (!container) return;
  container.innerHTML = '';

  if (cell.rewardCollected) {
    const msg = i18n('treasure.alreadyCollected');
    container.innerHTML = `<div class="already-collected">${msg}</div>`;
    return;
  }

  (cell.treasureItems || []).forEach(key => {
    const def = POWERUP_DEFS[key];
    if (!def) return;
    const name = i18n('items.' + def.id + '.name');
    const div = document.createElement('div');
    div.className = 'treasure-item';
    div.innerHTML = `<span class="t-emoji">${key}</span><span class="t-name">${name}</span>`;
    container.appendChild(div);
  });

  const collectBtn = document.getElementById('treasure-collect');
  if (collectBtn) {
    collectBtn.onclick = () => {
      collectTreasure(cell); // collectTreasure auto-closes the screen
      updateHud();
    };
  }
}

/* ================================================================
   CASINO SCREEN
================================================================ */
const BAD_OUTCOMES = [
  { id: 'clean_start', emoji: '🧼', apply(G) { if (G.inventory) G.inventory.stacks = []; } },
  { id: 'tragedy',     emoji: '🎭', apply(G) { if (G.run) G.run.permanents = []; } },
  { id: 'abduction',   emoji: '🛸', apply(G) {
    const dest = G.run?.nextWorldsPreview?.[4];
    if (dest) G.run.confirmedNextWorld = dest;
    startNewWorld((G.run?.worldIdx || 0) + 5);
  } },
];

let _casinoInterval = null;

export function renderCasinoScreen(cell) {
  const scr = document.getElementById('scr-casino');
  if (!scr) return;
  ['scr-shop', 'scr-modifier', 'scr-treasure'].forEach(id =>
    document.getElementById(id)?.classList.add('off'));
  scr.classList.remove('off');

  // Build item pool: shop-style goods + bad outcomes
  const shopInv = generateShopInventory(G, G.run?.worldIdx || 0);
  const goodItems = shopInv.map(e => {
    if (e.type === 'consumable') {
      const def = POWERUP_DEFS[e.itemKey];
      if (!def) return null;
      const name = i18n('items.' + def.id + '.name');
      return { emoji: e.itemKey, name, isBad: false, itemKey: e.itemKey };
    } else {
      const perm = PERMANENTS.find(p => p.id === e.permId);
      if (!perm) return null;
      const name = i18n('items.' + perm.id + '.name');
      return { emoji: perm.emoji, name, isBad: false, permId: e.permId };
    }
  }).filter(Boolean);

  const pool = [...goodItems, ...BAD_OUTCOMES.map(b => {
    const name = i18n('casino.' + b.id + '.name');
    const desc = i18n('casino.' + b.id + '.desc');
    return { emoji: b.emoji, name, desc, isBad: true, badId: b.id };
  })];
  if (!pool.length) pool.push({ emoji: '❓', name: '?', isBad: false });

  // Clear any previous spin interval
  if (_casinoInterval) { clearInterval(_casinoInterval); _casinoInterval = null; }

  const slotEls = [
    document.getElementById('casino-slot-0'),
    document.getElementById('casino-slot-1'),
    document.getElementById('casino-slot-2'),
  ];
  const stopBtn   = document.getElementById('casino-stop-btn');
  const acceptBtn = document.getElementById('casino-accept-btn');
  if (!slotEls[0] || !stopBtn || !acceptBtn) return;

  // 3 independently cycling slot indices
  const slotIdx = [0, 1, 2].map(i => (i * Math.floor(pool.length / 3)) % pool.length);

  function renderSlots() {
    slotEls.forEach((el, i) => {
      if (!el) return;
      const item = pool[slotIdx[i]];
      el.innerHTML = `<div class="casino-slot-emoji">${item.emoji}</div><div class="casino-slot-name">${item.name}</div>`;
      el.classList.toggle('bad-outcome', !!item.isBad);
    });
  }
  renderSlots();

  stopBtn.classList.remove('hidden');
  acceptBtn.classList.add('hidden');
  slotEls.forEach(el => el && el.classList.remove('hidden', 'casino-result'));

  _casinoInterval = setInterval(() => {
    slotIdx[0] = (slotIdx[0] + 1) % pool.length;
    slotIdx[1] = (slotIdx[1] + Math.floor(Math.random() * 3) + 1) % pool.length;
    slotIdx[2] = (slotIdx[2] + Math.floor(Math.random() * 2) + 1) % pool.length;
    renderSlots();
  }, 100);

  // Track the chosen result index
  let resultIdx = 0;

  stopBtn.onclick = () => {
    if (_casinoInterval) { clearInterval(_casinoInterval); _casinoInterval = null; }

    // Pick 1 random result from the 3 stopped slots
    const pick = Math.floor(Math.random() * 3);
    resultIdx = slotIdx[pick];
    const result = pool[resultIdx];

    // Show only the chosen item — centre it, hide others
    slotEls.forEach((el, i) => {
      if (!el) return;
      if (i === pick) {
        el.classList.add('casino-result');
        el.innerHTML = `<div class="casino-slot-emoji">${result.emoji}</div><div class="casino-slot-name">${result.name}</div>`;
        el.classList.toggle('bad-outcome', !!result.isBad);
      } else {
        el.classList.add('hidden');
      }
    });

    stopBtn.classList.add('hidden');
    acceptBtn.classList.remove('hidden');
  };

  acceptBtn.onclick = () => {
    const item = pool[resultIdx];
    if (item.isBad) {
      const bad = BAD_OUTCOMES.find(b => b.id === item.badId);
      if (bad) bad.apply(G);
    } else if (item.itemKey) {
      addToInventory(item.itemKey);
    } else if (item.permId) {
      if (!G.run.permanents.includes(item.permId)) {
        G.run.permanents.push(item.permId);
        PERMANENTS.find(p => p.id === item.permId)?.onAcquire?.(G);
      }
    }
    cell.casinoUsed = true;
    scr.classList.add('off');
    if (_casinoInterval) { clearInterval(_casinoInterval); _casinoInterval = null; }
    updateHud();
  };
}

/* ================================================================
   GAME OVER / VICTORY SCREEN
================================================================ */
export function showGameOver(victory) {
  // Delegate to game.js handler which uses the correct scr-over element
  if (typeof window !== 'undefined' && window._onGameOver) {
    window._onGameOver(victory);
  }
}

/* ================================================================
   TITLE SCREEN
================================================================ */
export function showTitle() {
  ['scr-over','scr-pause','scr-modifier','scr-shop','scr-treasure'].forEach(
    id => document.getElementById(id)?.classList.add('off'));
  const scr = document.getElementById('scr-title');
  if (scr) scr.classList.remove('off');

  const hiEl = document.getElementById('title-hi');
  if (hiEl) {
    const hiLabel = i18n('title.bestScore') + ': ';
    hiEl.textContent = G.hiScore > 0 ? `${hiLabel}${G.hiScore}` : '';
  }
  const walletEl = document.getElementById('title-wallet');
  if (walletEl) walletEl.textContent = G.wallet > 0 ? `💰 ${G.wallet}원` : '';
}

/* ================================================================
   FREEZE OVERLAY
================================================================ */
export function setFreezeOverlay(on) {
  const el = document.getElementById('freeze-overlay');
  if (!el) return;
  el.classList.toggle('on', on);
}

/* ================================================================
   CHEAT MENU
================================================================ */
export function initCheatMenu() {
  const btn = document.getElementById('cheat-toggle');
  const menu = document.getElementById('cheat-menu');
  if (!btn || !menu) return;

  btn.onclick = () => menu.classList.toggle('hidden');

  document.getElementById('cheat-god')?.addEventListener('click', () => {
    G.godMode = !G.godMode;
    const el = document.getElementById('cheat-god');
    const onText = i18n('cheat.godModeOn');
    const offText = i18n('cheat.godModeOff');
    el.textContent = G.godMode ? onText : offText;
    el.classList.toggle('active', G.godMode);
  });

  document.getElementById('cheat-autoshoot')?.addEventListener('click', () => {
    G.autoShoot = !G.autoShoot;
    const el = document.getElementById('cheat-autoshoot');
    const onText = i18n('cheat.autoshootOn');
    const offText = i18n('cheat.autoshootOff');
    el.textContent = G.autoShoot ? onText : offText;
    el.classList.toggle('active', G.autoShoot);
  });

  document.getElementById('cheat-give-all')?.addEventListener('click', () => {
    import('../data/items.js').then(({ PERMANENTS, POWERUP_KEYS, POWERUP_DEFS }) => {
      if (!G.run) return;
      for (const p of PERMANENTS) {
        if (!G.run.permanents.includes(p.id)) {
          G.run.permanents.push(p.id);
          p.onAcquire(G);
        }
      }
      const keys = POWERUP_KEYS.filter(k => POWERUP_DEFS[k].rarity > 0);
      import('./combat.js').then(({ addToInventory }) => {
        for (const k of keys.slice(0, 6)) addToInventory(k);
        updateHud();
      });
    });
  });

  document.getElementById('cheat-unlock-lessons')?.addEventListener('click', () => {
    G.completedLessons = LESSONS_BASE.map(l => l.id);
    G.verbCountingUnlocked = true;
    G.modifierUnlocked = true;
    G.banmalUnlocked = true;
    G.hasipsiocheUnlocked = true;
    if (!G.learnedWords) G.learnedWords = [];
    LESSONS_BASE.forEach(lesson => {
      lesson.unlockedWords.forEach(w => {
        if (!G.learnedWords.find(lw => lw.text === w)) {
          const wordDef = WORD_DICT.find(d => d.text === w);
          G.learnedWords.push({ text: w, emoji: wordDef?.emoji || '🎓' });
        }
      });
    });
    savePersistentState();
    if (window._hudUpdate) window._hudUpdate();
    flashAnnounce('🎓 Todas as aulas destravadas!', '#2ecc71');
  });

  document.getElementById('cheat-unlock-dict')?.addEventListener('click', () => {
    if (!G.learnedWords) G.learnedWords = [];
    // Add all WORD_DICT entries to learnedWords
    WORD_DICT.forEach(entry => {
      if (!G.learnedWords.find(lw => lw.text === entry.text)) {
        G.learnedWords.push({ text: entry.text, emoji: entry.emoji || '' });
      }
    });
    // Set kill counts + hidden status to 99 for all words
    WORD_DICT.forEach(entry => {
      G.wordKillCounts[entry.text] = 99;
      G.wordHiddenStatus[entry.text] = true;
    });
    // Set all conjugation combos to 99 for verbs/adjectives
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
    flashAnnounce('📖 Dicionário completo desbloqueado!', '#7db4ff');
  });

  document.getElementById('cheat-maxhp')?.addEventListener('click', () => {
    if (!G.run) return;
    G.playerMax = 20; G.playerHP = 20;
    updateLives();
  });

  document.getElementById('cheat-coins')?.addEventListener('click', () => {
    if (!G.run) return;
    G.run.wallet += 9999;
    updateWallet();
  });

  document.getElementById('cheat-clearroom')?.addEventListener('click', () => {
    import('./combat.js').then(({ killAllEnemies }) => {
      if (killAllEnemies) killAllEnemies();
    });
  });

  document.getElementById('cheat-nextworld')?.addEventListener('click', () => {
    import('./world.js').then(({ startNewWorld }) => {
      if (G.run) {
        const next = Math.min((G.run.worldIdx || 0) + 1, 4);
        startNewWorld(next);
        menu.classList.add('hidden');
      }
    });
  });
}

// Expose updateHud globally so world.js can call it
if (typeof window !== 'undefined') {
  window._hudUpdate = updateHud;
}
