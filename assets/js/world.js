/* ================================================================
   WORLD - dungeon generation + room management + navigation
================================================================ */
import { G, resetRoomState, savePersistentState, recordWorldReached } from './state.js';
import { get as i18n } from './i18n.js';
import { genRoomEnemies, initRoomSpawner, setRoomClearedCallback, announce, dismissAnnounce, flashAnnounce, addToInventory, mkMonster, collectCoins, explodeCoins, finalizePendingCombat, detachGroundItems, hydrateGroundItems } from './combat.js';
import { mpSend, getMpTemplates } from './multiplayer.js';
import { rollModifierChoices, PERMANENTS } from '../data/items.js';
import { POWERUP_DEFS, POWERUP_KEYS } from '../data/items.js';
import { WORD_DICT } from '../data/words.js';
import { getNextLesson } from '../data/lessons.js';

/* ================================================================
   WORLD DEFINITIONS
================================================================ */
// All weathers the game supports
export const ALL_WEATHERS = ['clear', 'foggy', 'drizzle', 'raining', 'snowing', 'blizzard', 'fall', 'blossom'];

export const WORLDS = [
  // ── World 0: 태권도 도장 (Taekwondo Dojang) — fixed tutorial world ─
  {
    id: 'taekwondo_dojang',
    name: '태권도 도장',
    emoji: '🥋',           transport: '🏃',
    bgTop: '#e8f0ff',      bgBot: '#fff8ee',
    bossEmoji: '🥷',       // base ninja (no skin tone)
    bossName: '사범',
    biome: 'dojang',
    forbiddenWeathers: ['foggy','drizzle','raining','snowing','blizzard','fall','blossom'],
    wind: 0.10,
    floorColor:     '#a93226',  floorColorAlt: '#1a6ea8',  // red + blue dojang mat
    wallColor:      '#c8bfb0',  altWallColor:  '#b5a898',  // warm grey walls
    fixedLighting: '12:00',
    isDojangTutorial: true,
    noLearning: true,
  },
  // ── World 1: 경복궁, Seoul ─────────────────────────
  {
    id: 'palace',
    name: '경복궁',
    emoji: '🏯',           transport: '🏇',
    bgTop: '#0c1528',      bgBot: '#101e10',
    bossEmoji: '👺',       // Dokkaebi - Korean goblin
    bossName: '도깨비',
    biome: 'palace',
    forbiddenWeathers: [],
    wind: 0.22,
    floorColor:     '#141828',  floorColorAlt: '#0e1220',
    wallColor:      '#1e3d70',  altWallColor:  '#2e58a0',  // indigo palace stone; door arch brighter
  },
  // ── World 1: 제주도, Jeju Island ───────────────────────────────
  {
    id: 'jeju',
    name: '제주도',
    emoji: '🌋',           transport: '✈️',
    bgTop: '#050a00',      bgBot: '#0f1a05',
    bossEmoji: '🗿',       // Dol hareubang - iconic Jeju stone guardian statue
    bossName: '돌하르방',
    biome: 'jungle',
    forbiddenWeathers: ['snowing', 'blizzard'],
    wind: 0.58,
    floorColor:     '#101c06',  floorColorAlt: '#0c1604',
    wallColor:      '#1a2e08',  altWallColor:  '#2e4e14',  // dark volcanic rock; door lighter green-black
  },
  // ── World 2: 해운대, Busan ─────────────────────────────────────
  {
    id: 'haeundae',
    name: '해운대',
    emoji: '🏖️',          transport: '🚆',
    bgTop: '#050814',      bgBot: '#0a1228',
    bossEmoji: '🦑',       // Giant squid - Busan seafood icon turned monster
    bossName: '대왕오징어',
    biome: 'beach',
    forbiddenWeathers: ['snowing', 'blizzard'],
    wind: 0.78,
    floorColor:     '#0e2038',  floorColorAlt: '#0a1a30',
    wallColor:      '#0a2448',  altWallColor:  '#183e70',  // deep ocean wall; door shows city-glow blue
    fixedLighting: '21:00',
    unfitForTutorial: true,
  },
  // ── World 3: 명동, Seoul ───────────────────────────────────────
  {
    id: 'myeongdong',
    name: '명동',
    emoji: '🏙️',          transport: '🚇',
    bgTop: '#070810',      bgBot: '#0f1025',
    bossEmoji: '🤖',       // AI/tech city boss
    bossName: '인공지능',
    biome: 'city',
    forbiddenWeathers: ['snowing', 'blizzard'],
    wind: 0.30,
    floorColor:     '#1a1438',  floorColorAlt: '#12102c',
    wallColor:      '#180e40',  altWallColor:  '#2e1c70',  // dark neon-city wall; door glows purple
    fixedLighting: '22:00',
    unfitForTutorial: true,
  },
  // ── World 4: 설악산, Gangwon-do ───────────────────────────────
  {
    id: 'seoraksan',
    name: '설악산',
    emoji: '⛰️',          transport: '🧗',
    bgTop: '#060c14',      bgBot: '#0c1520',
    bossEmoji: '🐯',       // Baekho - white tiger, legendary Korean mountain spirit
    bossName: '백호',
    biome: 'ice',
    forbiddenWeathers: ['clear', 'blossom'],
    wind: 0.66,
    floorColor:     '#1c2830',  floorColorAlt: '#141e28',
    wallColor:      '#162035',  altWallColor:  '#263455',  // cold granite; door cracks let in icy light
  },
  // ── World 5: 백두산 (legendary) ───────────────────────────────
  {
    id: 'baekdu',
    name: '백두산',
    emoji: '🏔️',          transport: '🧗',
    bgTop: '#000810',      bgBot: '#000c20',
    bossEmoji: '🐲',       // Divine dragon - guardian of Korea's sacred mountain
    bossName: '신룡',
    biome: 'volcano',
    forbiddenWeathers: ['clear', 'raining', 'drizzle'],
    wind: 0.72,
    floorColor:     '#001028',  floorColorAlt: '#000c1e',
    wallColor:      '#021630',  altWallColor:  '#0a2648',  // volcanic dark; door hints at the crater lake
    fixedLighting: '02:00',
    unfitForTutorial: true,
  },
  // ── World 6: 인사동, Seoul ─────────────────────────────────────
  {
    id: 'insadong',
    name: '인사동',
    emoji: '🏮',           transport: '🏃',
    bgTop: '#0e0a04',      bgBot: '#1a1008',
    bossEmoji: '🦊',       // Gumiho - nine-tailed fox from Korean mythology
    bossName: '구미호',
    biome: 'ruins',
    forbiddenWeathers: [],
    wind: 0.24,
    floorColor:     '#2a1808',  floorColorAlt: '#1e1004',
    wallColor:      '#3e2208',  altWallColor:  '#5e3818',  // dark amber wood; door lit by paper lanterns
  },
  // ── World 7: 동해, East Sea ────────────────────────────────────
  {
    id: 'eastsea',
    name: '동해',
    emoji: '⛴️',           transport: '🛥️',
    bgTop: '#000c1a',      bgBot: '#00142a',
    bossEmoji: '🦈',       // Great white shark - deep East Sea
    bossName: '상어왕',
    biome: 'ocean',
    forbiddenWeathers: ['snowing', 'blizzard','blossom','fall'],
    wind: 0.88,
    floorColor:     '#001628',  floorColorAlt: '#001020',
    wallColor:      '#001c38',  altWallColor:  '#003058',  // abyssal dark; door shows faint bioluminescence
  },
  // ── World 8: 전주 한옥마을 ─────────────────────────────────────
  {
    id: 'jeonju',
    name: '전주',
    emoji: '🏘️',          transport: '🚌',
    bgTop: '#120804',      bgBot: '#200e08',
    bossEmoji: '🎭',       // Tal mask - worn in traditional Talchum mask dance
    bossName: '탈춤왕',
    biome: 'traditional',
    forbiddenWeathers: [],
    wind: 0.28,
    floorColor:     '#341a08',  floorColorAlt: '#281206',
    wallColor:      '#4a2608',  altWallColor:  '#703c14',  // dark clay tile; door opens to warm lantern glow
  },
  // ── World 9: 경주 (Ancient Silla Capital) ─────────────────────
  {
    id: 'gyeongju',
    name: '경주',
    emoji: '🏛️',          transport: '🚲',
    bgTop: '#080808',      bgBot: '#101008',
    bossEmoji: '💀',       // Ancient Silla king's ghost - Daereungwon burial mounds
    bossName: '신라왕',
    biome: 'ruins',
    forbiddenWeathers: ['blizzard'],
    wind: 0.54,
    floorColor:     '#1a1806',  floorColorAlt: '#141204',
    wallColor:      '#1c1a06',  altWallColor:  '#363410',  // ochre stone; door glows faint gold
    fixedLighting: '00:30',
    unfitForTutorial: true,
  },
  // ── World 10: 여의도 벚꽃, Seoul ──────────────────────────────
  {
    id: 'yeouido',
    name: '여의도',
    emoji: '🌸',           transport: '🛳️',
    bgTop: '#100608',      bgBot: '#180c14',
    bossEmoji: '🐍',       // Serpent lurking beneath the sakura
    bossName: '꽃뱀',
    biome: 'spring',
    forbiddenWeathers: ['clear', 'snowing', 'blizzard', 'foggy', 'fall'],
    wind: 0.42,
    floorColor:     '#2c0c1a',  floorColorAlt: '#200812',
    wallColor:      '#3c0e20',  altWallColor:  '#601830',  // deep rose; door glows with pink petal light
    fixedLighting: '20:30',
    unfitForTutorial: true,
  },
  // ── World 11: 독도, East Sea ───────────────────────────────────
  {
    id: 'dokdo',
    name: '독도',
    emoji: '🪨',           transport: '🚤',
    bgTop: '#040c16',      bgBot: '#081420',
    bossEmoji: '🦅',       // Steller's sea eagle - endemic to Dokdo's rocky cliffs
    bossName: '독수리',
    biome: 'ocean',
    forbiddenWeathers: ['fall','blossom'],
    wind: 0.92,
    floorColor:     '#0e1a28',  floorColorAlt: '#0a1420',
    wallColor:      '#101c2e',  altWallColor:  '#1e3048',  // dark basalt; door opens to grey pre-dawn sea
    fixedLighting: '05:00',
    unfitForTutorial: true,
  },
  // ── World 12: 강남, Seoul ──────────────────────────────────────
  {
    id: 'gangnam',
    name: '강남',
    emoji: '💎',           transport: '🚗',
    bgTop: '#030305',      bgBot: '#060610',
    bossEmoji: '💵',       // Gold boss - luxury and excess
    bossName: '황금신',
    biome: 'city',
    forbiddenWeathers: ['snowing', 'blizzard', 'foggy'],
    wind: 0.34,
    floorColor:     '#0a0a1c',  floorColorAlt: '#060612',
    wallColor:      '#0c0c28',  altWallColor:  '#1a1a48',  // near-black marble; door reveals gold-lit corridor
    fixedLighting: '23:30',
    unfitForTutorial: true,
  },
  // ── World 13: 용궁 (Dragon Palace - mythological) ─────────────
  {
    id: 'yonggoong',
    name: '용궁',
    emoji: '🐉',           transport: '🐟',  // 별주부전 - rabbit rides turtle to Dragon Palace
    bgTop: '#001414',      bgBot: '#002020',
    bossEmoji: '🐉',       // 용왕 - Dragon King of the Sea
    bossName: '용왕',
    biome: 'ocean',
    forbiddenWeathers: ['drizzle','raining','snowing','blizzard','fall','blossom'],
    wind: 0.52,
    floorColor:     '#003030',  floorColorAlt: '#002424',
    wallColor:      '#004040',  altWallColor:  '#007070',  // deep jade; door shimmers with jade luminescence
    fixedLighting: '02:00',
    unfitForTutorial: true,
  },
  // ── World 14: 우주 (Korean Space Program) ─────────────────────
  {
    id: 'cosmos',
    name: '우주',
    emoji: '🌌',           transport: '🚀',
    bgTop: '#000004',      bgBot: '#00000a',
    bossEmoji: '👾',       // Space invader - cosmic void boss
    bossName: '우주괴물',
    biome: 'cosmos',
    forbiddenWeathers: ['foggy','drizzle','raining','snowing','blizzard','fall','blossom'],
    wind: 0.18,
    floorColor:     '#060012',  floorColorAlt: '#04000c',
    wallColor:      '#080018',  altWallColor:  '#140030',  // void black; door cracks show deep space purple
    fixedLighting: '02:00',
    unfitForTutorial: true,
  },
];

/* ================================================================
   DUNGEON GENERATION - recursive backtracking maze
================================================================ */
const COLS = 8;
const ROWS = 6;

function emptyCell(col, row) {
  return {
    col, row,
    type: 'normal',
    connections: new Set(),   // 'N'|'S'|'E'|'W'
    visited: false,
    cleared: false,
    isTent: false,
    hopDist: -1,
    waveNum: 1,
    enemyCount: 4,
    // room-type payloads (populated at generation time)
    shopItems: null,       // shop: array of {itemKey, price}
    itemChoices: null,     // modifier: array of 3 choices
    treasureItems: null,   // treasure: array of item keys
    rewardCollected: false,
    // Persistent floor drops for this room. DOM elements are recreated on entry.
    droppedOrbs: [],
  };
}

function idx(col, row) { return row * COLS + col; }

const DIRS = [
  { dir: 'N', dc: 0,  dr: -1, opp: 'S' },
  { dir: 'S', dc: 0,  dr:  1, opp: 'N' },
  { dir: 'E', dc:  1, dr: 0,  opp: 'W' },
  { dir: 'W', dc: -1, dr: 0,  opp: 'E' },
];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function _modifierChoicesHaveOwnedPermanent(choices) {
  const owned = new Set(G.run?.permanents || []);
  return (choices || []).some(choice => choice.type === 'permanent'
    && owned.has(choice.item?.id));
}

function carve(grid, col, row) {
  grid[idx(col, row)]._mazeVisited = true; // maze-only flag, reset after generation
  const dirs = shuffle([...DIRS]);
  for (const { dir, dc, dr, opp } of dirs) {
    const nc = col + dc, nr = row + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
    if (grid[idx(nc, nr)]._mazeVisited) continue;
    grid[idx(col, row)].connections.add(dir);
    grid[idx(nc, nr)].connections.add(opp);
    carve(grid, nc, nr);
  }
}

function bfsDist(grid, startCol, startRow) {
  const q = [{ col: startCol, row: startRow, d: 0 }];
  grid[idx(startCol, startRow)].hopDist = 0;
  while (q.length) {
    const { col, row, d } = q.shift();
    const cell = grid[idx(col, row)];
    for (const { dir, dc, dr } of DIRS) {
      if (!cell.connections.has(dir)) continue;
      const nc = col + dc, nr = row + dr;
      const neighbor = grid[idx(nc, nr)];
      if (neighbor.hopDist === -1) {
        neighbor.hopDist = d + 1;
        q.push({ col: nc, row: nr, d: d + 1 });
      }
    }
  }
}

function ensureMinConnections(grid) {
  for (const cell of grid) {
    while (cell.connections.size < 3) {
      const candidates = DIRS.filter(({ dir, dc, dr }) => {
        const nc = cell.col + dc, nr = cell.row + dr;
        return nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && !cell.connections.has(dir);
      });
      if (!candidates.length) break;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      cell.connections.add(pick.dir);
      grid[idx(cell.col + pick.dc, cell.row + pick.dr)].connections.add(pick.opp);
    }
  }
}

function graphDistanceMap(grid, origin) {
  const distances = new Map([[idx(origin.col, origin.row), 0]]);
  const queue = [origin];
  while (queue.length) {
    const current = queue.shift();
    const currentDistance = distances.get(idx(current.col, current.row));
    for (const { dir, dc, dr } of DIRS) {
      if (!current.connections.has(dir)) continue;
      const nc = current.col + dc, nr = current.row + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const neighbor = grid[idx(nc, nr)];
      const key = idx(nc, nr);
      if (!distances.has(key)) {
        distances.set(key, currentDistance + 1);
        queue.push(neighbor);
      }
    }
  }
  return distances;
}

function chooseSpreadCell(grid, candidates, anchors = []) {
  if (!candidates.length) return null;
  if (!anchors.length) return candidates[Math.floor(Math.random() * candidates.length)];

  const anchorMaps = anchors.map(anchor => graphDistanceMap(grid, anchor));
  const scored = candidates.map(cell => {
    const distances = anchorMaps.map(map => map.get(idx(cell.col, cell.row)) ?? 0);
    const minDistance = Math.min(...distances);
    const averageDistance = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
    // Min distance keeps special rooms apart; the average distance prevents
    // all later rooms from drifting back into the same local pocket.
    const score = minDistance * 5 + averageDistance * 0.35 + Math.random() * 1.5;
    return { cell, minDistance, score };
  });

  // Prefer at least two graph steps of separation whenever the map allows it,
  // and three when there are enough candidates. Choosing among the top slice
  // preserves procedural variety instead of producing one fixed arrangement.
  const comfortablySeparated = scored.filter(entry => entry.minDistance >= 3);
  const separated = comfortablySeparated.length
    ? comfortablySeparated
    : scored.filter(entry => entry.minDistance >= 2);
  const pool = separated.length ? separated : scored;
  pool.sort((a, b) => b.score - a.score);
  const topCount = Math.max(1, Math.ceil(pool.length * 0.30));
  return pool[Math.floor(Math.random() * topCount)].cell;
}

/** Append more worlds to an existing sequence, using its tail as history. */
const _DOJANG_DEF = () => WORLDS.find(w => w.isDojangTutorial);
const _NON_DOJANG = () => WORLDS.filter(w => !w.isDojangTutorial);

function extendWorldSequence(seq, n = 10) {
  const history = seq.slice(-10).map(w => w.id);
  for (let i = 0; i < n; i++) {
    const avail = _NON_DOJANG().filter(w => !history.slice(-10).includes(w.id));
    const pool = avail.length > 0 ? avail : _NON_DOJANG();
    const next = pool[Math.floor(Math.random() * pool.length)];
    seq.push(next);
    history.push(next.id);
  }
}

/** Generate the initial world sequence for a run (worlds 0..n-1).
 *  World 0: always Taekwondo Dojang.
 *  Worlds 1-3: only fit-for-tutorial worlds.
 *  World 4: 66% fit-for-tutorial, 34% any world.
 *  World 5+: equal chances for all worlds. */
export function generateWorldSequence(n = 14) {
  const dojang = _DOJANG_DEF();
  const history = ['forest', dojang.id];
  const result = [dojang]; // index 0 is always dojang
  for (let i = 1; i < n; i++) {
    let avail = _NON_DOJANG().filter(w => !history.slice(-10).includes(w.id));
    if (i <= 3) {
      const fit = avail.filter(w => !w.unfitForTutorial);
      avail = fit.length ? fit : _NON_DOJANG().filter(w => !w.unfitForTutorial);
    } else if (i === 4) {
      const fit = avail.filter(w => !w.unfitForTutorial);
      if (fit.length && Math.random() < 0.66) avail = fit;
    }
    if (!avail.length) avail = _NON_DOJANG();
    const next = avail[Math.floor(Math.random() * avail.length)];
    result.push(next);
    history.push(next.id);
  }
  return result;
}

/** Trim worlds already passed from the front of the sliding window. */
function trimWorldSequence() {
  const run = G.run;
  if (!run?.worldSequence) return;
  const keepFrom = (run.worldIdx ?? 0); // keep current world onwards
  const toRemove = keepFrom - run.worldSeqOffset;
  if (toRemove > 0) {
    run.worldSequence.splice(0, toRemove);
    run.worldSeqOffset += toRemove;
  }
}

/* Pick a world def - uses the pre-seeded sliding-window sequence. */
export function pickWorldDef(worldIdx) {
  // If a world was confirmed by the portal NPC, use it (and consume the lock)
  if (worldIdx !== 0 && G.run?.confirmedNextWorld) {
    const locked = G.run.confirmedNextWorld;
    G.run.confirmedNextWorld = null;
    return locked;
  }
  const run = G.run;
  const seq = run?.worldSequence;
  if (seq) {
    const i = worldIdx - (run.worldSeqOffset ?? 0);
    // Keep at least 10 worlds ahead of current position
    while (seq.length < i + 10) extendWorldSequence(seq, 10);
    return seq[i];
  }
  // fallback (no active run state)
  if (worldIdx === 0) return _DOJANG_DEF();
  const history = run?.worldHistory || [];
  let avail = _NON_DOJANG().filter(w => !history.slice(-10).includes(w.id));
  if (worldIdx <= 3) {
    const fit = avail.filter(w => !w.unfitForTutorial);
    avail = fit.length ? fit : _NON_DOJANG().filter(w => !w.unfitForTutorial);
  } else if (worldIdx === 4) {
    const fit = avail.filter(w => !w.unfitForTutorial);
    if (fit.length && Math.random() < 0.66) avail = fit;
  }
  if (!avail.length) avail = _NON_DOJANG();
  return avail[Math.floor(Math.random() * avail.length)];
}

/** Return the next n worlds from the pre-seeded sequence. */
export function previewNextWorlds(n = 5) {
  if (!G.run) return [];
  const run = G.run;
  const seq = run.worldSequence;
  if (seq) {
    const offset = run.worldSeqOffset ?? 0;
    const from = (run.worldIdx ?? 0) + 1 - offset;
    while (seq.length < from + n) extendWorldSequence(seq, 10);
    return seq.slice(from, from + n);
  }
  // fallback
  const history = [...(G.run.worldHistory || [])];
  const current = G.dungeon?.worldDef?.id;
  if (current) history.push(current);
  const result = [];
  for (let i = 0; i < n; i++) {
    const avail = WORLDS.filter(w => !history.slice(-10).includes(w.id));
    const pool = avail.length > 0 ? avail : WORLDS;
    const next = pool[Math.floor(Math.random() * pool.length)];
    result.push(next);
    history.push(next.id);
  }
  return result;
}

/** Peek at the world def for worldIdx without mutating run state.
 *  Extends the sequence if needed so the emoji is available before startNewWorld runs. */
export function peekNextWorldDef(worldIdx) {
  const run = G.run;
  if (!run) return null;
  const seq = run.worldSequence;
  if (!seq) return null;
  const offset = run.worldSeqOffset || 0;
  const i = worldIdx - offset;
  while (seq.length <= i + 1) extendWorldSequence(seq, 5);
  return seq[i] || null;
}

/* ================================================================
   DOJANG DUNGEON — fixed-layout 8×6 tutorial map
   Ring layout (number = difficulty level):
     4 3 3 3 3 3 3 4
     4 3 2 2 2 2 3 4
     4 3 2 1 1 2 3 4
     4 3 2 1 1 2 3 4
     4 3 2 2 2 2 3 4
     4 3 3 3 3 3 3 4
   Level-4 corners house boss / shop / casino / modifier.
   Spawn is one of the four level-1 centre cells.
================================================================ */
function _dojangLevel(col, row) {
  if (col === 0 || col === COLS - 1) return 4;           // outer columns (incl. corners)
  if (row === 0 || row === ROWS - 1) return 3;           // top/bottom rows (non-corner)
  if (col === 1 || col === COLS - 2) return 3;           // second-from-edge columns
  if (col === 2 || col === COLS - 3) return 2;           // col 2 and 5
  if (row === 1 || row === ROWS - 2) return 2;           // rows 1 and 4, cols 3-4
  return 1;                                              // centre 2×2
}

function generateDojangDungeon() {
  const grid = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      grid.push(emptyCell(c, r));

  // Tag every cell with its dojang level and wave number
  for (const cell of grid) {
    cell.dojangLevel = _dojangLevel(cell.col, cell.row);
    cell.waveNum     = cell.dojangLevel;
    cell.scrollReward = null;
  }

  // Assign special rooms to the four corners: boss + shop + casino + modifier
  const corners = [
    grid[idx(0, 0)], grid[idx(COLS - 1, 0)],
    grid[idx(0, ROWS - 1)], grid[idx(COLS - 1, ROWS - 1)],
  ];
  shuffle(corners);
  corners[0].type = 'boss';  corners[0].waveNum = 5; corners[0].enemyCount = 1;
  corners[1].type = 'shop';
  corners[2].type = 'casino';
  corners[3].type = 'modifier';
  const bossCell = corners[0];

  // Choose spawn randomly from the four centre level-1 cells
  const level1Cells = [
    grid[idx(3, 2)], grid[idx(4, 2)],
    grid[idx(3, 3)], grid[idx(4, 3)],
  ];
  const startCell = level1Cells[Math.floor(Math.random() * level1Cells.length)];
  const startCol = startCell.col;
  const startRow = startCell.row;

  // Build connections:
  //  - Corners only connect N or S (no E/W)
  //  - Spawn cell cannot exit toward level-2 cells
  //  - Adjacent cells connect if |level difference| ≤ 1
  function isCorner(c, r) {
    return (c === 0 || c === COLS - 1) && (r === 0 || r === ROWS - 1);
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[idx(c, r)];
      const lv   = _dojangLevel(c, r);
      for (const { dir, dc, dr, opp } of DIRS) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        if (cell.connections.has(dir)) continue;
        const nlv = _dojangLevel(nc, nr);
        if (isCorner(c, r)  && (dir === 'E' || dir === 'W')) continue;
        if (isCorner(nc, nr) && (dir === 'E' || dir === 'W')) continue;
        // Spawn cell is isolated from higher-difficulty rings (no entry or exit)
        if (c === startCol && r === startRow && nlv > lv) continue;
        if (nc === startCol && nr === startRow && lv > nlv) continue;
        if (Math.abs(lv - nlv) > 1) continue;
        cell.connections.add(dir);
        grid[idx(nc, nr)].connections.add(opp);
      }
    }
  }

  // BFS hop distances from spawn
  bfsDist(grid, startCol, startRow);
  const maxHops = Math.max(...grid.map(c => c.hopDist === -1 ? 0 : c.hopDist));

  // Enemy counts for combat rooms scaled by level
  for (const cell of grid) {
    if (cell.type === 'normal') {
      cell.enemyCount = 2 + cell.dojangLevel; // L1→3, L2→4, L3→5, L4→6
    }
  }

  // Reset visited
  for (const cell of grid) cell.visited = false;

  return {
    grid,
    start:    { col: startCol, row: startRow },
    bossRoom: { col: bossCell.col, row: bossCell.row },
    worldDef: _DOJANG_DEF(),
    maxHops,
  };
}

export function generateDungeon(worldIdx) {
  // World 0 is always the fixed dojang tutorial map
  if (worldIdx === 0) return generateDojangDungeon();

  const grid = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      grid.push(emptyCell(c, r));

  // Player starts near center of grid
  const startCol = Math.max(1, Math.min(COLS - 2, Math.floor(COLS / 2) - 1 + Math.floor(Math.random() * 3)));
  const startRow = Math.max(1, Math.min(ROWS - 2, Math.floor(ROWS / 2) - 1 + Math.floor(Math.random() * 3)));
  carve(grid, startCol, startRow);

  // BFS to find hop distances from player spawn
  bfsDist(grid, startCol, startRow);
  ensureMinConnections(grid);

  // ensureMinConnections adds shortcuts. Recompute distances after those
  // edges are present so boss placement uses the real playable route length,
  // not the stale distance from the pre-shortcut maze.
  for (const cell of grid) cell.hopDist = -1;
  bfsDist(grid, startCol, startRow);

  const maxHops = Math.max(...grid.map(c => c.hopDist));

  // Boss room: must be on edge/corner, far from spawn, with a single entrance
  const isEdge   = c => c.col === 0 || c.col === COLS - 1 || c.row === 0 || c.row === ROWS - 1;
  const isCorner = c => (c.col === 0 || c.col === COLS - 1) && (c.row === 0 || c.row === ROWS - 1);
  function edgeScore(cell) {
    return cell.hopDist + (isCorner(cell) ? 4 : isEdge(cell) ? 2 : 0);
  }
  const minBossHops = 4;
  let bossPool = grid.filter(c => isEdge(c) && c.hopDist >= minBossHops);
  // A pathological maze may have no qualifying edge room after shortcuts;
  // preserve the distance rule before relaxing the edge/corner preference.
  if (!bossPool.length) bossPool = grid.filter(c => c.hopDist >= minBossHops);
  if (!bossPool.length) {
    // The current 8×6 topology always has a distant room, but keep a safe
    // farthest-room fallback if the topology is changed in the future.
    bossPool = [...grid].sort((a, b) => b.hopDist - a.hopDist);
  }
  bossPool.sort((a, b) => edgeScore(b) - edgeScore(a));
  const bossCell = bossPool[0];
  bossCell.type = 'boss';

  // Trim boss to exactly one entrance: keep the connection toward the lowest-hopDist neighbor
  {
    const bossCons = [...bossCell.connections];
    if (bossCons.length > 1) {
      let keepDir = bossCons[0], bestHop = Infinity;
      for (const dir of bossCons) {
        const { dc, dr } = DIRS.find(d => d.dir === dir);
        const nc = bossCell.col + dc, nr = bossCell.row + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        const nb = grid[idx(nc, nr)];
        if (nb && nb.hopDist < bestHop) { bestHop = nb.hopDist; keepDir = dir; }
      }
      for (const dir of bossCons) {
        if (dir === keepDir) continue;
        bossCell.connections.delete(dir);
        const { dc, dr, opp } = DIRS.find(d => d.dir === dir);
        const nc = bossCell.col + dc, nr = bossCell.row + dr;
        if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS)
          grid[idx(nc, nr)]?.connections.delete(opp);
      }
    }
  }

  // Classify remaining rooms by hop distance
  const normal = grid.filter(c => c !== bossCell);
  const hopThresholds = {
    shop:     Math.floor(maxHops * 0.75),
    modifier: Math.floor(maxHops * 0.55),
    treasure: Math.floor(maxHops * 0.35),
  };

  const isSpecialCandidate = (cell, minHop = 0) =>
    cell.type === 'normal'
    && !(cell.col === startCol && cell.row === startRow)
    && cell.hopDist >= minHop;

  // Special rooms are spread using graph distance. The boss is an anchor so
  // the map does not put every discoverable room in the same far-away pocket.
  const specialAnchors = [bossCell];

  // Pick 1 shop (high distance)
  const shopCandidates = normal.filter(c => c.hopDist >= hopThresholds.shop && c.type === 'normal');
  if (shopCandidates.length) {
    const pick = chooseSpreadCell(grid, shopCandidates, [bossCell]);
    pick.type = 'shop';
    specialAnchors.push(pick);
  }

  // Pick 2–3 modifier rooms. Their old hard 55% threshold made all gifts
  // occupy the same distant band, so use a broader pool plus graph spacing.
  const modCount = 2 + (maxHops > 8 ? 1 : 0);
  const minSpecialHop = Math.max(2, Math.floor(maxHops * 0.25));
  const modCandidates = normal.filter(c => isSpecialCandidate(c, minSpecialHop));
  for (let i = 0; i < Math.min(modCount, modCandidates.length); i++) {
    const pick = chooseSpreadCell(grid, modCandidates, specialAnchors);
    if (!pick) break;
    pick.type = 'modifier';
    specialAnchors.push(pick);
    modCandidates.splice(modCandidates.indexOf(pick), 1);
  }

  // Pick 1–2 treasure rooms from the same broad pool, while spacing them from
  // gifts and the other special rooms already placed.
  const treasCount = 1 + (maxHops > 6 ? 1 : 0);
  const treasCandidates = normal.filter(c => isSpecialCandidate(c, minSpecialHop));
  for (let i = 0; i < Math.min(treasCount, treasCandidates.length); i++) {
    const pick = chooseSpreadCell(grid, treasCandidates, specialAnchors);
    if (!pick) break;
    pick.type = 'treasure';
    specialAnchors.push(pick);
    treasCandidates.splice(treasCandidates.indexOf(pick), 1);
  }

  // Pick 1 casino room: world 2 (old world 1) at 33% (secret), world 3+ at 66%
  const casinoChance = worldIdx === 2 ? 0.33 : (worldIdx >= 3 ? 0.66 : 0);
  if (casinoChance > 0 && Math.random() < casinoChance) {
    const casinoCandidates = normal.filter(c => isSpecialCandidate(c, minSpecialHop));
    if (casinoCandidates.length) {
      // Mid-range hop distance for casino
      const midHop = Math.floor(maxHops * 0.4);
      const midCandidates = casinoCandidates.filter(c => c.hopDist >= midHop);
      const pool = midCandidates.length ? midCandidates : casinoCandidates;
      const pick = chooseSpreadCell(grid, pool, specialAnchors);
      if (pick) {
        pick.type = 'casino';
        specialAnchors.push(pick);
      }
    }
  }

  // Pick 1 teacher room.
  // World 1 (Palace): always adjacent to spawn (so tutorial is easy to find).
  // World 2+: 60% chance, placed at high hop distance.
  if (worldIdx === 1) {
    // Find cells directly connected to the spawn cell
    const spawnCell = grid[idx(startCol, startRow)];
    const adjacentToSpawn = [...spawnCell.connections]
      .map(dir => {
        const d = DIRS.find(d => d.dir === dir);
        return d ? grid[idx(startCol + d.dc, startRow + d.dr)] : null;
      })
      .filter(c => c && c.type === 'normal');
    const pool = adjacentToSpawn.length
      ? adjacentToSpawn
      : normal.filter(c => c.type === 'normal'); // fallback
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) { pick.type = 'teacher'; pick.teacherRevealed = true; }
  } else if (Math.random() < 0.6) {
      const teacherCandidates = normal.filter(c => isSpecialCandidate(c, hopThresholds.modifier));
      if (teacherCandidates.length) {
        const highHop = Math.floor(maxHops * 0.8);
        const highCandidates = teacherCandidates.filter(c => c.hopDist >= highHop);
        const pool = highCandidates.length ? highCandidates : teacherCandidates;
        const pick = chooseSpreadCell(grid, pool, specialAnchors);
        if (pick) {
          pick.teacherRevealed = true;
          pick.type = 'teacher';
          specialAnchors.push(pick);
        }
      }
  }

  // Assign waveNum and enemyCount to each cell.
  // Softer difficulty curve: +8 per world (was +12), within-world range 0-6 (was 0-10),
  // difficulty cap raised to world 5 so progression feels longer.
  const worldDef = pickWorldDef(worldIdx);
  const effIdx = Math.min(worldIdx, 10); // Difficulty now peaks at World 10
  // Softer world-2 entry: half the multiplier for the first real world,
  // then shift the curve so world 3 feels like old world 2, etc.
  const diffBase = effIdx <= 1 ? effIdx * 2 : (effIdx - 1) * 4;
  for (const cell of grid) {
    if (cell.type === 'boss') {
      cell.waveNum = diffBase + 8;
      cell.enemyCount = 1;
    } else {
      const noise = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
      cell.waveNum = Math.max(1, diffBase + Math.floor(cell.hopDist / Math.max(maxHops, 1) * 6) + 1 + noise);
      cell.enemyCount = 3 + Math.floor(cell.hopDist / Math.max(maxHops, 1) * 3);
    }
  }

  // Pre-roll special room payloads
  for (const cell of grid) {
    if (cell.type === 'modifier') {
      // Choices generated fresh when entering (G needed for owned permanents)
      // Leave null, will be generated on first visit
    }
    if (cell.type === 'treasure') {
      // Random consumable keys as loot
      const keys = POWERUP_KEYS.filter(k => POWERUP_DEFS[k].rarity > 0);
      cell.treasureItems = [
        keys[Math.floor(Math.random() * keys.length)],
        keys[Math.floor(Math.random() * keys.length)],
      ];
    }
    // Ancient Scroll: pre-seed 50% chance of a consumable reward per normal room
    if (cell.type === 'normal') {
      if (Math.random() < 0.5) {
        const keys = POWERUP_KEYS.filter(k => POWERUP_DEFS[k].rarity > 0);
        cell.scrollReward = keys[Math.floor(Math.random() * keys.length)];
      } else {
        cell.scrollReward = null;
      }
    }
  }

  // Every day/night world contains one hidden, already-safe camp. It is not
  // shown until the player visits the room or uses the World Guide, and does
  // not consume a tent item when discovered.
  if (!worldDef.fixedLighting) {
    const campCandidates = grid.filter(cell =>
      cell.type === 'normal'
      && !(cell.col === startCol && cell.row === startRow)
      && cell !== bossCell
    );
    const campCell = campCandidates[Math.floor(Math.random() * campCandidates.length)];
    if (campCell) {
      campCell.type = 'tent';
      campCell.isTent = true;
      campCell.cleared = true;
      campCell.waveNum = 0;
      campCell.enemyCount = 0;
      campCell.scrollReward = null;
    }
  }

  // Reset visited flag for player tracking (was used by carve for maze generation)
  for (const cell of grid) {
    cell.visited = false;
    delete cell._mazeVisited;
  }

  // In world 1 (Palace), reveal the shop cell on the map from the start (but not teleportable)
  if (worldIdx === 1) {
    const shopCell = grid.find(c => c.type === 'shop');
    if (shopCell) shopCell.shopRevealed = true;
  }

  return {
    grid,
    start: { col: startCol, row: startRow },
    bossRoom: { col: bossCell.col, row: bossCell.row },
    worldDef,
    maxHops,
  };
}

/* ================================================================
   DUNGEON SERIALIZATION / RECONSTRUCTION (for multiplayer sync)
================================================================ */

/** Serialize dungeon to a plain JSON-safe object for sending to guest. */
export function serializeDungeon(dungeon, worldIdx) {
  return {
    worldIdx,
    worldDefId: dungeon.worldDef.id,
    runSeed:   dungeon.runSeed ?? G.run?.seed ?? null,
    start:    { col: dungeon.start.col,    row: dungeon.start.row    },
    bossRoom: { col: dungeon.bossRoom.col, row: dungeon.bossRoom.row },
    maxHops:  dungeon.maxHops,
    cells: dungeon.grid.map(cell => ({
      col:          cell.col,
      row:          cell.row,
      type:         cell.type,
      connections:  [...cell.connections],
      waveNum:      cell.waveNum,
      enemyCount:   cell.enemyCount,
      hopDist:      cell.hopDist,
      treasureItems:   cell.treasureItems   || null,
      scrollReward:    cell.scrollReward    ?? null,
      shopRevealed:    cell.shopRevealed    || false,
      teacherRevealed: cell.teacherRevealed || false,
      cleared:         !!cell.cleared,
      isTent:          !!cell.isTent,
      droppedOrbs: (cell.droppedOrbs || []).map(orb => ({ ...orb, keys: [...(orb.keys || [])] })),
    })),
  };
}

/** Reconstruct a dungeon object from a blueprint received from host. */
export function reconstructDungeon(blueprint) {
  const worldDef = WORLDS.find(w => w.id === blueprint.worldDefId) || WORLDS[0];
  const grid = blueprint.cells.map(c => {
    const cell = emptyCell(c.col, c.row);
    cell.type           = c.type;
    cell.connections    = new Set(c.connections);
    cell.waveNum        = c.waveNum;
    cell.enemyCount     = c.enemyCount;
    cell.hopDist        = c.hopDist;
    cell.treasureItems  = c.treasureItems  || undefined;
    cell.scrollReward   = c.scrollReward   ?? null;
    cell.shopRevealed   = c.shopRevealed   || false;
    cell.teacherRevealed = c.teacherRevealed || false;
    cell.isTent         = !!c.isTent || c.type === 'tent';
    cell.cleared        = !!c.cleared || cell.isTent;
    cell.droppedOrbs    = (c.droppedOrbs || []).map(orb => ({ ...orb, keys: [...(orb.keys || [])] }));
    cell.visited        = false;
    return cell;
  });
  return {
    grid,
    start:    blueprint.start,
    bossRoom: blueprint.bossRoom,
    worldDef,
    maxHops:  blueprint.maxHops,
    runSeed:  blueprint.runSeed ?? null,
  };
}

/** Serialize monster templates for sending to guest (words + stats only). */
export function serializeTemplates(templates) {
  return templates.map((t, idx) => ({
    _mpId:    t._mpId ?? idx,
    type:     t.type,
    hp:       t.hp,
    maxHp:    t.maxHp,
    words:    t.words,
    wordEmoji:  t.wordEmoji  || null,
    wordEmojis: t.wordEmojis || [],
    special:    t.special    || null,
    wieldIcon:  t.wieldIcon  || null,
    isNumeric:  t.isNumeric  || false,
    spawnNX:    t.spawnNX    ?? null,
    spawnNY:    t.spawnNY    ?? null,
    isVerbAdj:       t.isVerbAdj       || false,
    verbAdjType:     t.verbAdjType     || null,
    conjugation:     t.conjugation     || null,
    verbAdjDictWord: t.verbAdjDictWord || null,
    _tutorialStop:    t._tutorialStop || false,
    _openingAttackStop: t._openingAttackStop || false,
  }));
}

/** Reconstruct templates from serialized form (guest side). */
export function deserializeTemplates(serialized) {
  return serialized.map(s => ({
    _mpId:    s._mpId,
    type:     s.type,
    hp:       s.hp,
    maxHp:    s.maxHp,
    words:    s.words,
    wordEmoji:  s.wordEmoji,
    wordEmojis: s.wordEmojis,
    special:    s.special,
    wieldIcon:  s.wieldIcon,
    isNumeric:  s.isNumeric,
    spawnNX:    s.spawnNX ?? undefined,
    spawnNY:    s.spawnNY ?? undefined,
    isVerbAdj:       s.isVerbAdj       || false,
    verbAdjType:     s.verbAdjType     || null,
    conjugation:     s.conjugation     || null,
    verbAdjDictWord: s.verbAdjDictWord || null,
    _tutorialStop:    s._tutorialStop || false,
    _openingAttackStop: s._openingAttackStop || false,
  }));
}

// Direction the local player last navigated (set in navigate(), cleared after mpSend)
let _mpLastNavDir = null;

// Cached graph distance from every room to the boss. The renderer uses an
// equivalent map for the red door glow; keeping the navigation check here
// lets the guidance popup use the same topology without reading canvas state.
let _bossDistanceCache = null;
function _getBossDistanceMap() {
  if (!G.dungeon) return null;
  if (_bossDistanceCache?.dungeon === G.dungeon) return _bossDistanceCache.map;
  const boss = G.dungeon.grid?.find(c => c.type === 'boss');
  if (!boss) { _bossDistanceCache = { dungeon: G.dungeon, map: null }; return null; }
  const dist = new Map([[`${boss.col},${boss.row}`, 0]]);
  const queue = [boss];
  while (queue.length) {
    const cur = queue.shift();
    const d = dist.get(`${cur.col},${cur.row}`);
    for (const dir of cur.connections) {
      const step = DIRS.find(x => x.dir === dir);
      if (!step) continue;
      const nc = cur.col + step.dc, nr = cur.row + step.dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const key = `${nc},${nr}`;
      if (!dist.has(key)) { dist.set(key, d + 1); queue.push(getCell(nc, nr)); }
    }
  }
  _bossDistanceCache = { dungeon: G.dungeon, map: dist };
  return dist;
}

export function isBossPathDirection(fromCol, fromRow, dir) {
  const from = getCell(fromCol, fromRow);
  if (!from?.connections.has(dir)) return false;
  const step = DIRS.find(x => x.dir === dir);
  if (!step) return false;
  const to = getCell(fromCol + step.dc, fromRow + step.dr);
  if (!to) return false;
  if (to.type === 'boss') return true;
  const dist = _getBossDistanceMap();
  const fromDist = dist?.get(`${from.col},${from.row}`);
  const toDist = dist?.get(`${to.col},${to.row}`);
  return fromDist != null && toDist != null && toDist < fromDist;
}

/* ================================================================
   GET CELL HELPER
================================================================ */
export function getCell(col, row) {
  return G.dungeon.grid[row * COLS + col] || null;
}

export function currentCell() {
  const { col, row } = G.currentRoom;
  return getCell(col, row);
}

/* ================================================================
   MULTIPLAYER TEMPLATE HELPER
   HOST: generate templates → broadcast → return
   GUEST: use received templates; if not yet arrived, defer spawning
          and wait up to 2 s before falling back to own generation
================================================================ */

// Cell the guest is waiting templates for (null when not waiting).
let _mpGuestAwaitingCell = null;

/** Called from game.js when a 'room_templates' message arrives. */
export function onMpTemplatesReceived(col, row, serialized) {
  getMpTemplates(col, row); // already stored by caller (storeMpTemplates)
  if (_mpGuestAwaitingCell?.col === col && _mpGuestAwaitingCell?.row === row) {
    const cell = _mpGuestAwaitingCell;
    _mpGuestAwaitingCell = null;
    cell._templates = deserializeTemplates(serialized);
    // Only spawn if we're still in this room and still in spawning phase
    if (G.currentRoom?.col === col && G.currentRoom?.row === row &&
        G.room?.wPhase === 'waiting_templates') {
      initRoomSpawner(cell._templates);
      // Apply any pending monster_sync that arrived before monsters were spawned (validate room)
      if (G.mp._pendingMonsterSync) {
        const pending = G.mp._pendingMonsterSync;
        G.mp._pendingMonsterSync = null;
        const syncCol = pending.col ?? col, syncRow = pending.row ?? row;
        if (syncCol === col && syncRow === row) {
          // Defer one tick so monsters are in the array before applying
          setTimeout(() => { if (typeof window._applyMonsterSync === 'function') window._applyMonsterSync(pending.states ?? pending); }, 50);
        }
      }
    }
  }
}

function _mpGetOrGenTemplates(cell) {
  if (!G.mp?.active) return genRoomEnemies(cell);

  if (!G.mp.isHost) {
    // Guest: use templates received from host if already here
    const received = getMpTemplates(cell.col, cell.row);
    if (received) {
      if (!cell._templates) cell._templates = deserializeTemplates(received);
      return cell._templates;
    }
    // Templates not yet arrived — defer spawning until they arrive
    _mpGuestAwaitingCell = cell;
    // Fallback: if templates don't arrive within 8 s, generate own
    setTimeout(() => {
      if (_mpGuestAwaitingCell === cell) {
        _mpGuestAwaitingCell = null;
        if (G.currentRoom?.col === cell.col && G.currentRoom?.row === cell.row &&
            G.room?.wPhase === 'waiting_templates') {
          initRoomSpawner(genRoomEnemies(cell));
        }
      }
    }, 8000);
    return null; // signals "deferred — caller must NOT call initRoomSpawner"
  }

  // Host: generate, stamp stable IDs (same ones guest will receive), then broadcast
  const templates = genRoomEnemies(cell);
  // Assign _mpId here so host monsters get the same IDs as the serialized version sent to guest
  templates.forEach((t, idx) => { t._mpId = idx; });
  if (G.mp.connected && templates?.length) {
    mpSend({
      type:      'room_templates',
      col:       cell.col,
      row:       cell.row,
      templates: serializeTemplates(templates),
    });
  }
  return templates;
}

/* ================================================================
   ENTER ROOM
================================================================ */
function closeMapOnRoomChange() {
  const panel = document.getElementById('map-panel');
  if (panel) panel.classList.add('off');

  if (typeof window !== 'undefined') {
    window._setMapPlaceholder?.(false);
    window._mapCloseCleanup?.();
  }
  document.body?.classList.remove('map-open');
}

export function enterRoom(col, row, fromDir = null) {
  // A hyper typer may cross a door while their final projectile is still in
  // flight. Resolve that old room once before replacing G.room so rewards and
  // map state cannot be lost with the outgoing animation.
  finalizePendingCombat();
  // Floor drops belong to the dungeon cell, not to the transient room object.
  // Detach their DOM nodes before resetRoomState replaces G.room.
  const previousRoom = G.currentRoom ? { ...G.currentRoom } : null;
  // A new run/reconstructed dungeon can replace G.dungeon before enterRoom;
  // never persist the previous run's transient room into the new dungeon.
  if (previousRoom && G.room?._groundDungeon === G.dungeon) {
    detachGroundItems(getCell(previousRoom.col, previousRoom.row));
  }
  // Room changes always dismiss the map, regardless of how navigation started.
  // The minimap click path used to do this itself, but door navigation and
  // room-code teleports could leave the panel visible over the new room.
  closeMapOnRoomChange();
  // The boss-path hint is a post-combat message. Never carry it into a new
  // combat or NPC room; it can be shown again only by the next room clear.
  window._hideBossPathHint?.();
  window._hideTutorial?.(true);
  dismissAnnounce(); // close any active room popup immediately on room change
  // Dismiss first-clear banner when entering a new room
  document.getElementById('first-clear-banner')?.classList.add('off');
  G.currentRoom = { col, row };
  G.doorLabelAlpha = 0; // fade labels in after transition completes

  // ── Multiplayer: broadcast room change to P2 ──────────────────
  if (G.mp?.active) {
    // Broadcast after room setup so G.mode is already set; capture nav dir before clearing
    const _fromDir = fromDir ?? _mpLastNavDir;
    _mpLastNavDir = null;
    setTimeout(() => {
      mpSend({ type: 'room_enter', col, row, fromDir: _fromDir, inCombat: G.mode === 'combat' });
    }, 0);
  }

  const cell = getCell(col, row);
  if (!cell) return;

  const isNewCombatRoom = !cell.visited && (cell.type === 'normal' || cell.type === 'boss');
  if (isNewCombatRoom && previousRoom && fromDir &&
      isBossPathDirection(previousRoom.col, previousRoom.row, fromDir)) {
    G.run.bossPathHintDismissed = true;
    window._hideBossPathHint?.();
  }

  // Mark as visited
  cell.visited = true;

  resetRoomState(cell.waveNum);
  hydrateGroundItems(cell);
  // Reset per-room noise cancellation
  if (G.room) G.room.noiseCancelled = false;

  // Compute open door positions (exclude S - player enters from south area)
  G.room.openDoors = [...cell.connections]
    .filter(d => d !== 'S')
    .map(dir => {
      if (dir === 'N') return { dir, x: G.W / 2, y: -60 };
      if (dir === 'E') return { dir, x: G.W + 60, y: G.vH * 0.35 };
      if (dir === 'W') return { dir, x: -60, y: G.vH * 0.35 };
      return null;
    }).filter(Boolean);

  // Ancient Scroll: give pre-seeded reward on first entry (cannot re-roll)
  if (G.run.scrollPerk && cell.type === 'normal' && cell.scrollReward && !cell.scrollGiven) {
    cell.scrollGiven = true;
    addItemToInventory(cell.scrollReward);
  }

  if (cell.cleared) {
    // Already cleared: navigate mode, re-open special room NPC/UI if applicable
    G.mode = 'navigate';
    G.room.wPhase = 'clear';
    reopenSpecialRoom(cell);
    // Keep the room code and minimap synchronized on re-entry too. This path
    // returns early, so it cannot rely on the common update block below.
    if (typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
    if (typeof window !== 'undefined' && window._hudUpdate) window._hudUpdate();
    if (typeof window !== 'undefined' && window._onRoomEntered) {
      window._onRoomEntered(cell.type, true);
    }
    return;
  }

  switch (cell.type) {
    case 'normal': {
      G.mode = 'combat';
      setRoomClearedCallback(() => onRoomCleared(cell));
      if (cell._savedRoom) {
        restoreSavedRoom(cell);
      } else if (G.worldTransition) {
        const t = _mpGetOrGenTemplates(cell);
        G.room._deferredTemplates = t; // null = guest waiting; handled in onMpTemplatesReceived
        if (t === null) G.room.wPhase = 'waiting_templates';
      } else {
        const t = _mpGetOrGenTemplates(cell);
        if (t !== null) { initRoomSpawner(t); }
        else G.room.wPhase = 'waiting_templates'; // guest waiting for host templates
      }
      break;
    }

    case 'boss': {
      G.mode = 'combat';
      setRoomClearedCallback(() => onBossDefeated(cell));
      const bossEmoji = G.dungeon?.worldDef?.bossEmoji || '🐉';
      const bossNameKo = G.dungeon?.worldDef?.bossName || 'Boss';
      announce(`${bossEmoji} ${bossNameKo}`, null);
      if (cell._savedRoom) {
        restoreSavedRoom(cell);
      } else if (G.worldTransition) {
        const t = _mpGetOrGenTemplates(cell);
        G.room._deferredTemplates = t;
        if (t === null) G.room.wPhase = 'waiting_templates';
      } else {
        const t = _mpGetOrGenTemplates(cell);
        if (t !== null) { initRoomSpawner(t); }
        else G.room.wPhase = 'waiting_templates';
      }
      break;
    }

    case 'shop':
      G.mode = 'navigate';
      spawnRoomNpc('shop', '🏪', cell);
      announce(i18n('world.shopPrompt'), null);
      break;

    case 'modifier':
      G.mode = 'navigate';
      // A room can be opened, left, and revisited after the same upgrade was
      // obtained elsewhere. Refresh that stale gift instead of displaying an
      // unclaimable duplicate; an exhausted modifier pool becomes items only.
      if (!cell.itemChoices || _modifierChoicesHaveOwnedPermanent(cell.itemChoices)) {
        cell.itemChoices = rollModifierChoices(G);
      }
      spawnRoomNpc('modifier', '✨', cell);
      announce(i18n('world.modifierPrompt'), null);
      break;

    case 'treasure':
      G.mode = 'navigate';
      if (!cell.rewardCollected) {
        spawnRoomNpc('treasure', '💰', cell);
        announce(i18n('world.treasurePrompt'), null);
      }
      break;

    case 'casino':
      G.mode = 'navigate';
      if (!cell.casinoUsed) {
        spawnRoomNpc('casino', '🎰', cell);
        announce(i18n('world.casinoPrompt'), null);
      }
      break;

    case 'teacher':
      G.mode = 'navigate';
      // Pick lesson once per cell (persists across re-entries this run)
      if (!cell.currentLesson) {
        cell.currentLesson = getNextLesson(G.completedLessons || []) || null;
      }
      spawnRoomNpc('teacher', '🧑‍🏫', cell);
      announce(i18n('world.teacherPrompt'), null);
      break;

    default:
      G.mode = 'navigate';
      cell.cleared = true;
  }

  // Tutorial box triggers on room entry. The previous room's tutorial was
  // force-closed at the top of enterRoom, before any new room prompt existed.
  if (typeof window !== 'undefined' && G.run?.tutorial) {
    const tut  = G.run.tutorial;
    const wIdx = G.run.worldIdx;
    // Boss room (cleared) in worlds 0-1 → persistent "advance world" message (takes priority)
    if (cell.type === 'boss' && cell.cleared && wIdx <= 1) {
      window._showTutorial?.('🐲', 'tutorial.typeToAdvance', null, { persist: true });
    } else {
      // Casino → luck hint (any world) - non-combat room, show immediately, auto-close 20s
      if (cell.type === 'casino' && !cell.casinoUsed) {
        window._showTutorial?.('🎰', 'tutorial.casinoLuck', null, { autoClose: 20 });
      }
      // Worlds 0-1 special rooms (first visit) → interact hints - non-combat, auto-close 25s
      else if (wIdx <= 1 && !cell.cleared) {
        if      (cell.type === 'shop')     window._showTutorial?.('🏪', 'tutorial.typeToBuy',  { room: i18n('map.legendShop') },     { autoClose: 25 });
        else if (cell.type === 'teacher')  window._showTutorial?.('🧑‍🏫', 'tutorial.typeToTalk', { room: i18n('map.legendTeacher') },   { autoClose: 25 });
        else if (cell.type === 'treasure') window._showTutorial?.('💰', 'tutorial.typeToOpen', { room: i18n('map.legendTreasure') },  { autoClose: 25 });
        else if (cell.type === 'modifier') window._showTutorial?.('✨', 'tutorial.typeToOpen', { room: i18n('map.legendItem') },      { autoClose: 25 });
      }
    }
  }

  // Update minimap + HUD room code
  if (typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
  if (typeof window !== 'undefined' && window._hudUpdate) window._hudUpdate();
  if (typeof window !== 'undefined' && window._onRoomEntered) {
    window._onRoomEntered(cell.type, false);
  }
}

/* ================================================================
   RESTORE SAVED ROOM (after flee)
================================================================ */
function restoreSavedRoom(cell) {
  const saved = cell._savedRoom;
  delete cell._savedRoom;
  G.room.openingAttackPending = !!saved.openingAttackPending;
  G.room.openingAttackGroupSize = saved.openingAttackGroupSize || 0;

  // Re-create alive monsters using mkMonster (gets fresh id, wob, scl, etc.)
  // then override position so they drop in from where they fled (top)
  for (const snap of saved.monsters) {
    const m = mkMonster(snap);
    // Drop in from top at the same x they fled from (clamped to play area)
    const restoreX = Math.max(60, Math.min(G.W - 60, (snap.spawnNX ?? 0.5) * G.W));
    const landNY = 0.05 + Math.random() * 0.12;
    m.spawnNX = restoreX / G.W;
    m.spawnNY = landNY;
    m.progress = 0;
    m.x = restoreX;
    m.y = -(m.size * 3);
    m.spawnAnim = { t: 0, dur: 0.55, landNY };
    G.room.monsters.push(m);
  }

  const remaining = (cell._templates || []).slice(saved.spawnedIdx);

  if (saved.monsters.length === 0) {
    // No alive monsters to restore - just continue the spawner normally
    initRoomSpawner(remaining);
  } else {
    // Restored alive monsters are the current "group".
    // Set up the template queue WITHOUT calling sendNextGroup immediately -
    // onMonsterRemoved will trigger the next group naturally as they die.
    G.room.wTemplates = [...remaining];
    G.room.wTotal    = saved.wTotal;
    G.room.wKilled   = saved.wKilled;
    G.room.wPhase    = 'spawning';
  }
}

/* ================================================================
   ROOM CLEAR CALLBACKS
================================================================ */
function onRoomCleared(cell) {
  cell.cleared = true;
  G.mode = 'navigate';
  G.run.roomsCleared++;

  collectCoins(); // fly coins to player and commit pool to wallet
  flashAnnounce(i18n('announce.roomCleared'), '#44ff88');
  // This is the only place that can call the hint: a normal combat room has
  // just become fully clear, and the player has not followed the boss route.
  if (cell?.type === 'normal' && !G.run?.bossPathHintDismissed) {
    window._showBossPathHint?.();
  }

  // Tutorial box triggers on combat room clear
  if (typeof window !== 'undefined' && G.run?.tutorial) {
    const tut  = G.run.tutorial;
    const wIdx = G.run.worldIdx;
    if (wIdx <= 1) {
      tut.world0CombatCleared = (tut.world0CombatCleared || 0) + 1;
      const n = tut.world0CombatCleared;
      if (n === 1 && !tut.firstRoomClearShown) {
        tut.firstRoomClearShown = true;
        window._showTutorial?.('🧭', G.clickableDoors ? 'tutorial.touchToNavigate' : 'tutorial.typeToNavigate', null, { autoClose: 20 });
      } else if (n === 2 && !tut.mapHintShown) {
        tut.mapHintShown = true;
        window._showTutorial?.('🗺️', 'tutorial.pressMap', null, { autoClose: 25 });
      } else if (n >= 5) {
        const _bossEmoji = G.dungeon?.worldDef?.bossEmoji || '🐲';
        window._showTutorial?.(`🗺️${_bossEmoji}`, 'tutorial.findBoss', null, { autoClose: 30 });
      }
    } else {
      // World 1+: teacher hint after 5 combat rooms if teacher exists, no interaction, no cooldown
      tut.combatClearedThisWorld = (tut.combatClearedThisWorld || 0) + 1;
      if (tut.combatClearedThisWorld >= 5 && tut.teacherHintShownWorld !== wIdx) {
        const hasTeacher = G.dungeon?.grid?.some(c => c.type === 'teacher');
        const cdTs = G.run.worldLessonCooldowns?.[wIdx];
        const onCd = cdTs !== undefined && (G.gameTime - cdTs) < 1860;
        if (hasTeacher && !tut.teacherInteractedThisWorld && !onCd) {
          tut.teacherHintShownWorld = wIdx;
          window._showTutorial?.('🧑‍🏫', 'tutorial.findTeacher', null, { autoClose: 30 });
        }
      }
    }
  }

  // Flush any tip that was queued during combat (item drops etc.)
  window._flushTutQueue?.();

  if (typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();

  // Multiplayer: broadcast room clear so partner's cell is also marked cleared
  if (G.mp?.active) {
    mpSend({ type: 'room_cleared', col: cell.col, row: cell.row });
  }
}

function spawnNextWorldNpc() {
  const next = G.run.nextWorldsPreview?.[0];
  if (!next) return;
  // Lock in the chosen world so pickWorldDef uses it instead of re-rolling
  G.run.confirmedNextWorld = next;
  G.room.npc = {
    type: 'next_world',
    emoji: next.emoji,
    word: next.name,
    worldId: next.id,
    x: G.W / 2,
    y: G.vH * 0.42,
    active: true,
  };
}

function onBossDefeated(cell) {
  cell.cleared = true;
  G.run.bossesKilled++;
  G.mode = 'navigate';

  // Boss reward: 200–500 원 added directly to pool then collected
  const bossReward = 200 + Math.floor(Math.random() * 301);
  G.room.roomPool = (G.room.roomPool || 0) + bossReward;
  collectCoins();

  flashAnnounce(i18n('announce.bossDefeated'), '#ffcc00');

  // Save wallet to persistent
  G.wallet += G.run.wallet;
  localStorage.setItem('krr_wallet', G.wallet.toString());

  // Spawn portal NPC - player types next world's Korean name to advance
  spawnNextWorldNpc();

  // Worlds 0-1: persistent "type to advance" tutorial
  if ((G.run?.worldIdx ?? 0) <= 1 && typeof window !== 'undefined') {
    window._showTutorial?.('🐲', 'tutorial.typeToAdvance', null, { persist: true });
  }
  // Flush any tip queued during boss fight
  window._flushTutQueue?.();

  // Multiplayer: broadcast boss room cleared so partner's cell is also marked cleared
  if (G.mp?.active) {
    const cell = G.dungeon?.grid?.find(c => c.col === G.currentRoom?.col && c.row === G.currentRoom?.row);
    if (cell) mpSend({ type: 'room_cleared', col: cell.col, row: cell.row });
  }
}

// setCombatRef kept for compatibility; no-op since addToInventory is imported directly
export function setCombatRef(_ref) {}

/* ================================================================
   NAVIGATE (between rooms)
================================================================ */
const DIR_DELTA = { N: [0,-1], S: [0,1], E: [1,0], W: [-1,0] };
const DIR_NAMES = { N: '북', S: '남', E: '동', W: '서' };

function isAvailableDir(cell, dir) {
  if (!cell?.connections.has(dir)) return false;
  const delta = DIR_DELTA[dir];
  if (!delta) return false;
  const [dc, dr] = delta;
  const nc = cell.col + dc, nr = cell.row + dr;
  // Wall Breaker deliberately creates border connections. They are portals to
  // the opposite edge, so typed navigation must expose the same doors that
  // the clickable-door layer already accepts.
  return G.run?.wallBreaker || (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS);
}

export function getAvailableDirs() {
  if (!G.currentRoom || !G.dungeon) return [];
  const cell = currentCell();
  if (!cell) return [];
  return [...cell.connections].filter(dir => isAvailableDir(cell, dir));
}

export function navigate(dir) {
  if (G.mode !== 'navigate') return;
  if (G.phase !== 'run') return;

  const cell = currentCell();
  if (!isAvailableDir(cell, dir)) return;

  const [dc, dr] = DIR_DELTA[dir];
  // Wrap around for wall-breaker border portals
  const nc = ((cell.col + dc) + COLS) % COLS;
  const nr = ((cell.row + dr) + ROWS) % ROWS;

  // All room popups belong to the room being left, including persistent tips.
  if (typeof window !== 'undefined') {
    window._hideTutorial?.(true);
    window._hideBossPathHint?.();
  }
  dismissAnnounce();
  document.getElementById('first-clear-banner')?.classList.add('off');

  // Close any open screens
  hideAllScreens();

  // Floor drops survive room changes; only their visual nodes are detached.
  detachGroundItems(cell);
  explodeCoins();

  // Player exit animation
  const plEl = document.getElementById('pl-emoji');
  if (plEl) {
    plEl.classList.remove('entering');
    plEl.classList.add('exiting');
  }

  // Record navigation direction for MP room_enter broadcast
  _mpLastNavDir = dir;

  // Trigger fade transition
  G.transition = {
    phase: 'out',
    t: 0,
    dur: 0.3,
    cb: () => {
      enterRoom(nc, nr, dir);
      G.transition = { phase: 'in', t: 0, dur: 0.3, cb: null };
      // Player entrance animation after transition
      if (plEl) {
        plEl.classList.remove('exiting');
        plEl.classList.add('entering');
        setTimeout(() => plEl.classList.remove('entering'), 500);
      }
    },
  };
}

/* ================================================================
   SPECIAL ROOM SCREENS
================================================================ */

// Forward-declared so game.js can wire the actual DOM rendering
let _shopRenderer = null;
let _modifierRenderer = null;
let _treasureRenderer = null;
let _casinoRenderer = null;
let _teacherRenderer = null;

export function setShopRenderer(fn) { _shopRenderer = fn; }
export function setModifierRenderer(fn) { _modifierRenderer = fn; }
export function setTreasureRenderer(fn) { _treasureRenderer = fn; }
export function setCasinoRenderer(fn) { _casinoRenderer = fn; }
export function setTeacherRenderer(fn) { _teacherRenderer = fn; }

function renderShopRoom(cell) {
  if (_shopRenderer) _shopRenderer(cell);
}

function showModifierScreen(cell) {
  if (_modifierRenderer) _modifierRenderer(cell);
}

function showTreasureRoom(cell) {
  if (_treasureRenderer) _treasureRenderer(cell);
}

function showCasinoRoom(cell) {
  if (_casinoRenderer) _casinoRenderer(cell);
}

function showTeacherScreen(cell) {
  if (_teacherRenderer) _teacherRenderer(cell);
}

function showGameOver(victory) {
  if (typeof window !== 'undefined' && window._onGameOver) {
    window._onGameOver(victory);
  }
}

function hideAllScreens() {
  ['scr-shop', 'scr-modifier', 'scr-treasure', 'scr-casino', 'scr-teacher'].forEach(id => {
    document.getElementById(id)?.classList.add('off');
  });
}

/* ================================================================
   ROOM NPC - interactive entity in special rooms
   Player types the NPC's word to trigger the room action.
================================================================ */
function spawnRoomNpc(type, emoji, cell) {
  // Themed word pools per room type (thematically fitting Korean words)
  const THEMED = {
    shop:     ['가게', '시장', '마트', '상점', '쇼핑', '상인'],
    tent:     ['텐트', '야영', '캠프'],
    modifier: ['선물', '마법', '능력', '강화', '아이템', '보상', '선택', '주문'],
    treasure: ['보물', '선물', '보석', '상금', '황금', '보따리', '상품', '수정'],
    casino:   ['카지노', '도박', '베팅', '갬블링', '복권', '주사위', '포커'],
    teacher:  ['선생님', '스승님', '공부', '배우다', '수업'],
  };
  const pool = THEMED[type] || ['가게'];
  // Deterministic pick: same room always gets same word within a run
  const seed = (G.run?.seed || 0) + cell.col * 31 + cell.row * 7;
  const isOceanTent = type === 'tent' && G.dungeon?.worldDef?.biome === 'ocean';
  // A canoe is an encampment in the ocean, never a literal tent.
  const word = isOceanTent ? '야영' : pool[((seed % pool.length) + pool.length) % pool.length];
  // Use the word's own emoji as NPC face (falls back to type emoji if not in dict)
  const wordEntry = WORD_DICT.find(w => w.text === word);
  const npcEmoji = type === 'tent' ? emoji : (wordEntry?.emoji || emoji);

  G.room.npc = {
    type,
    emoji: npcEmoji,
    word,
    cell,
    x: G.W / 2,
    y: G.vH * 0.42,
    active: true,
  };
}

function tentNpcEmoji() {
  return G.dungeon?.worldDef?.biome === 'ocean' ? '🛶' : '⛺';
}

/** Called by game.js when the player types in navigate mode */
export function tryNpcInteract(val) {
  const npc = G.room.npc;
  if (!npc || !npc.active) return false;
  if (val !== npc.word && val !== npc.word.replace(/\s+/g, '')) return false;

  const cell = npc.cell || currentCell();
  if (npc.type === 'shop') {
    renderShopRoom(cell);
    cell.cleared = true;
  } else if (npc.type === 'modifier') {
    showModifierScreen(cell);
    cell.cleared = true;
    npc.active = false;
  } else if (npc.type === 'treasure') {
    showTreasureRoom(cell);
    cell.cleared = true;
    npc.active = false;
  } else if (npc.type === 'casino') {
    showCasinoRoom(cell);
    cell.cleared = true;
    npc.active = false;
  } else if (npc.type === 'tent') {
    // Sleep - check cooldown
    const cd = G.run?.tentCooldown || 0;
    if (cd > 0) {
      const cdSec = Math.ceil(cd);
      flashAnnounce(i18n('world.sleepCooldown', { sec: cdSec }), '#8866aa');
    } else {
      if (window._triggerSleepAnimation) window._triggerSleepAnimation();
    }
    return true;
  } else if (npc.type === 'teacher') {
    showTeacherScreen(cell);
    // Mark teacher interaction for this world (for tutorial hint suppression)
    if (G.run?.tutorial) G.run.tutorial.teacherInteractedThisWorld = true;
    // Teacher stays active - player can always return to review the lesson
  } else if (npc.type === 'next_world') {
    npc.active = false;
    if (window._triggerWorldTransition) {
      window._triggerWorldTransition(G.run.worldIdx + 1);
    } else {
      startNewWorld(G.run.worldIdx + 1);
    }
  }
  return true;
}

/** Called when a special room is re-entered after clearing */
function reopenSpecialRoom(cell) {
  if (cell.type === 'shop') {
    spawnRoomNpc('shop', '🏪', cell);
  } else if (cell.type === 'treasure' && !cell.rewardCollected) {
    spawnRoomNpc('treasure', '💰', cell);
  } else if (cell.type === 'boss') {
    spawnNextWorldNpc();
  } else if (cell.type === 'casino' && !cell.casinoUsed) {
    spawnRoomNpc('casino', '🎰', cell);
  } else if (cell.type === 'teacher') {
    // Teacher always respawns - they never leave
    spawnRoomNpc('teacher', '🧑‍🏫', cell);
  } else if (cell.isTent) {
    spawnRoomNpc('tent', tentNpcEmoji(), cell);
  }
  // modifier: NPC gone after first pick
}

/** Place a tent in the current cleared normal room */
function placeTent() {
  const cell = currentCell();
  if (!cell || cell.type !== 'normal' || cell.isTent) return;
  cell.isTent = true;
  // Change cell.type to 'tent' so map/doors update
  cell.type = 'tent';
  spawnRoomNpc('tent', tentNpcEmoji(), cell);
  flashAnnounce(i18n('world.tentPitched'), '#88ddaa');
  if (typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
  // Multiplayer: broadcast tent placement to partner
  if (G.mp?.active) {
    mpSend({ type: 'tent_placed', col: cell.col, row: cell.row });
  }
}
if (typeof window !== 'undefined') {
  window._placeTent = placeTent;
  window._reopenTentNpc = () => {
    const cell = currentCell();
    if (cell?.isTent) spawnRoomNpc('tent', tentNpcEmoji(), cell);
  };
}

/* ================================================================
   INVENTORY HELPER (forward to combat.js addToInventory)
================================================================ */
function addItemToInventory(key) {
  addToInventory(key);
}

/* ================================================================
   START NEW WORLD / START RUN
================================================================ */

/** Pick a random weather allowed for this world (not in forbiddenWeathers). */
function pickWorldWeather(worldDef) {
  const forbidden = new Set(worldDef.forbiddenWeathers || []);
  const allowed = ALL_WEATHERS.filter(w => !forbidden.has(w));
  if (!allowed.length) return 'clear';
  return allowed[Math.floor(Math.random() * allowed.length)];
}

export function startNewWorld(worldIdx) {
  recordWorldReached(worldIdx);
  // Force-hide tutorial and reset per-world counters on world advance
  if (typeof window !== 'undefined') window._hideTutorial?.(true);
  if (G.run?.tutorial) {
    G.run.tutorial.combatClearedThisWorld = 0;
    G.run.tutorial.teacherInteractedThisWorld = false;
  }

  G.run.worldIdx = worldIdx;
  trimWorldSequence(); // drop worlds already visited from the front

  // Phoenix Heart: restore +1 HP on each new world
  if (G.run.phoenixHeart) {
    G.playerHP = Math.min(G.playerMax, G.playerHP + 1);
    flashAnnounce('❤️‍🔥 +1 HP (Phoenix Heart)', '#ff6644');
  }

  G.dungeon = generateDungeon(worldIdx);
  G.dungeon.runSeed = G.run.seed;
  G.currentRoom = { ...G.dungeon.start };

  // Track biome history for infinite world rotation
  if (G.run.worldHistory) {
    G.run.worldHistory.push(G.dungeon.worldDef.id);
    if (G.run.worldHistory.length > 6) G.run.worldHistory.shift();
  }

  // Track worlds ever visited (persistent, all-time)
  const _wid = G.dungeon.worldDef.id;
  if (!G.seenWorlds) G.seenWorlds = [];
  if (!G.seenWorlds.includes(_wid)) { G.seenWorlds.push(_wid); savePersistentState(); }

  // Pre-generate "next worlds" preview (stable until next world transition)
  G.run.nextWorldsPreview = previewNextWorlds(7);

  hideAllScreens();

  // Enter start room without transition
  enterRoom(G.dungeon.start.col, G.dungeon.start.row);

  // Wall Breaker: permanent - re-open all connections in the new dungeon
  if (G.run.wallBreaker) openAllConnections();

  // Pick weather not forbidden by this world's biome
  const worldDef = G.dungeon.worldDef;
  if (G.weatherEnabled > 0) {
    G.weather = pickWorldWeather(worldDef);
    G.wxParticles = [];
    if (G.worldTransition) {
      G.worldTransition.pendingWeather = G.weather; // defer until after wipe_out
    } else if (typeof window !== 'undefined' && window._initWeather) {
      window._initWeather(G.weather);
    }
  }

  // During world transition animation the announce fires after wipe-out completes
  const _wLabel = i18n('worlds.' + worldDef.id + '.name') || worldDef.name;
  const worldLabel = `🌍 ${worldDef.emoji} ${_wLabel}`;
  if (G.worldTransition) {
    G.worldTransition.pendingAnnounce = worldLabel;
  } else {
    announce(worldLabel, null);
  }
  if (typeof window !== 'undefined' && window._hudUpdate) window._hudUpdate();
  if (typeof window !== 'undefined' && window._syncClock) window._syncClock();

  // Multiplayer: after dungeon + weather are set, broadcast world change to guest
  if (G.mp?.active && G.mp.isHost && G.dungeon) {
    mpSend({
      type:      'world_change',
      blueprint: serializeDungeon(G.dungeon, worldIdx),
      weather:   G.weather || 'clear',
    });
  }
}

export function startRun() {
  G.phase = 'run';
  const _skipIntro = G.skipIntroWorld;
  G.skipIntroWorld = false;
  const _startIdx = _skipIntro ? 1 : 0;
  recordWorldReached(_startIdx);
  G.run.worldIdx = _startIdx;
  const _preRunSeed = G.mp?.active && G.mp.isHost ? G.mp._hostPreDungeon?.runSeed : null;
  G.run.seed = _preRunSeed ?? Math.floor(Math.random() * 1e6); // shared procedural scenery seed
  // Only generate worldSequence if not already seeded (MP host pre-seeds it before generateDungeon)
  if (!G.run.worldSequence?.length) G.run.worldSequence = generateWorldSequence(14);
  // Multiplayer host: reuse pre-generated dungeon so blueprint matches what was sent to guest
  if (G.mp?.active && G.mp.isHost && G.mp._hostPreDungeon) {
    G.dungeon = G.mp._hostPreDungeon;
    G.mp._hostPreDungeon = null;
  } else if (G.mp?.active && !G.mp.isHost && G.mp._blueprintPending) {
    // Multiplayer guest: use host's blueprint immediately (eliminates race condition)
    G.dungeon = reconstructDungeon(G.mp._blueprintPending);
    G.mp._blueprintPending = null;
  } else {
    G.dungeon = generateDungeon(_startIdx);
  }
  if (!G.dungeon.runSeed) G.dungeon.runSeed = G.run.seed;
  G.currentRoom = { ...G.dungeon.start };
  G.run.nextWorldsPreview = previewNextWorlds(7);

  // Track first world (startNewWorld handles worldIdx > 0; startRun never calls it for idx 0)
  const _startWid = G.dungeon.worldDef?.id;
  if (_startWid) {
    if (!G.seenWorlds) G.seenWorlds = [];
    if (!G.seenWorlds.includes(_startWid)) { G.seenWorlds.push(_startWid); savePersistentState(); }
  }

  enterRoom(G.dungeon.start.col, G.dungeon.start.row);

  const worldDef = G.dungeon.worldDef;
  G.weather = pickWorldWeather(worldDef);

  const _wn = i18n('worlds.' + worldDef.id + '.name') || worldDef.name;
  const _startMsg = `🌍 ${worldDef.emoji} ${_wn} - ${i18n('world.start')}`;
  if (G.worldTransition) {
    G.worldTransition.pendingAnnounce = _startMsg;
  } else {
    announce(_startMsg, null);
  }
}

/* ================================================================
   MODIFIER ROOM - pick item
================================================================ */
export function pickModifierItem(cell, choiceIdx) {
  if (!cell.itemChoices) return;
  const choice = cell.itemChoices[choiceIdx];
  if (!choice) return;

  // Defensive guard for a choice that became stale while its UI was open.
  // Never consume the room for a duplicate permanent; replace its offers.
  if (choice.type === 'permanent' && G.run.permanents.includes(choice.item?.id)) {
    cell.itemChoices = rollModifierChoices(G);
    return;
  }

  if (choice.type === 'permanent') {
    const perm = choice.item;
    if (!G.run.permanents.includes(perm.id)) {
      G.run.permanents.push(perm.id);
      perm.onAcquire(G);
      G.itemsEverAcquired = (G.itemsEverAcquired || 0) + 1;
      if (!G.learnedItems) G.learnedItems = [];
      if (!G.learnedItems.includes(perm.id)) { G.learnedItems.push(perm.id); savePersistentState(); }
      flashAnnounce(`${perm.emoji} ${i18n('world.acquired')}`, '#ffcc44');
      // Side effects
      if (perm.id === 'crystal_ball' && typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
      if (perm.id === 'wall_breaker') openAllConnections();
    }
  } else {
    // consumable
    addItemToInventory(choice.itemKey);
    if (!G.learnedItems) G.learnedItems = [];
    if (!G.learnedItems.includes(choice.itemKey)) { G.learnedItems.push(choice.itemKey); savePersistentState(); }
    flashAnnounce(`${choice.itemKey} ${i18n('world.acquired')}`, '#88ff44');
  }

  cell.rewardCollected = true;
  hideAllScreens();

  if (typeof window !== 'undefined' && window._hudUpdate) window._hudUpdate();
}

/* ================================================================
   SHOP - buy item
================================================================ */
export function shopBuy(cell, entry, price) {
  if (G.run.wallet < price) {
    flashAnnounce(i18n('world.notEnoughCoins'), '#ff4444');
    return false;
  }
  if (entry.type === 'modifier') {
    // Permanent upgrade - check not already owned
    if (G.run.permanents.includes(entry.permId)) {
      flashAnnounce(i18n('world.alreadyOwned'), '#ffaa44');
      return false;
    }
    G.run.wallet -= price;
    G.run.coinsSpent = (G.run.coinsSpent || 0) + price;
    G.run.itemsTaken = (G.run.itemsTaken || 0) + 1;
    const perm = PERMANENTS.find(p => p.id === entry.permId);
    if (perm) {
      G.run.permanents.push(perm.id);
      perm.onAcquire(G);
      G.itemsEverAcquired = (G.itemsEverAcquired || 0) + 1;
      if (!G.learnedItems) G.learnedItems = [];
      if (!G.learnedItems.includes(perm.id)) { G.learnedItems.push(perm.id); savePersistentState(); }
      flashAnnounce(`${perm.emoji}!`, '#aaffaa');
      // Side effects for special modifiers
      if (perm.id === 'crystal_ball' && typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
      if (perm.id === 'wall_breaker') openAllConnections();
    }
  } else {
    G.run.wallet -= price;
    G.run.coinsSpent = (G.run.coinsSpent || 0) + price;
    G.run.itemsTaken = (G.run.itemsTaken || 0) + 1;
    addItemToInventory(entry.itemKey);
    if (!G.learnedItems) G.learnedItems = [];
    if (!G.learnedItems.includes(entry.itemKey)) { G.learnedItems.push(entry.itemKey); savePersistentState(); }
    flashAnnounce(`${entry.itemKey} ${i18n('world.purchased')}`, '#88ff44');
  }
  if (typeof window !== 'undefined' && window._hudUpdate) window._hudUpdate();
  return true;
}

/* ================================================================
   TREASURE ROOM - collect items
================================================================ */
export function collectTreasure(cell) {
  if (cell.rewardCollected) return;
  cell.rewardCollected = true;
  if (cell.treasureItems) {
    for (const key of cell.treasureItems) {
      addItemToInventory(key);
    }
    flashAnnounce(i18n('announce.treasureAcquired'), '#ffcc44');
  }
  // Auto-close the treasure screen after collecting
  document.getElementById('scr-treasure')?.classList.add('off');
  if (typeof window !== 'undefined' && window._hudUpdate) window._hudUpdate();
}

/* ================================================================
   WALL BREAKER - open all connections between cells
================================================================ */
export function openAllConnections() {
  const grid = G.dungeon?.grid;
  if (!grid) return;
  for (const cell of grid) {
    for (const { dir, dc, dr, opp } of DIRS) {
      const nc = cell.col + dc, nr = cell.row + dr;
      // Normal in-bounds connection
      if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) {
        if (!cell.connections.has(dir)) {
          cell.connections.add(dir);
          grid[idx(nc, nr)].connections.add(opp);
        }
      } else {
        // Border wrap: pac-man style
        const wc = ((cell.col + dc) + COLS) % COLS;
        const wr = ((cell.row + dr) + ROWS) % ROWS;
        if (!cell.connections.has(dir)) {
          cell.connections.add(dir);
          grid[idx(wc, wr)].connections.add(opp);
        }
      }
    }
  }
  // Recompute open doors for current room
  const { col, row } = G.currentRoom || {};
  if (col !== undefined) {
    const cur = getCell(col, row);
    if (cur) {
      G.room.openDoors = [...cur.connections]
        .filter(d => d !== 'S')
        .map(dir => {
          if (dir === 'N') return { dir, x: G.W / 2, y: -60 };
          if (dir === 'E') return { dir, x: G.W + 60, y: G.vH * 0.35 };
          if (dir === 'W') return { dir, x: -60, y: G.vH * 0.35 };
          return null;
        }).filter(Boolean);
    }
  }
  if (typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
  flashAnnounce(i18n('announce.wallsConnected'), '#ffaa44');
}

/* ================================================================
   EXPORT WORLD CONSTANTS
================================================================ */
export { COLS, ROWS, DIR_NAMES, DIR_DELTA };
