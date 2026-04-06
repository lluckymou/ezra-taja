/* ================================================================
   WORLD — dungeon generation + room management + navigation
================================================================ */
import { G, resetRoomState } from './state.js';
import { get as i18n } from './i18n.js';
import { genRoomEnemies, initRoomSpawner, setRoomClearedCallback, announce, dismissAnnounce, flashAnnounce, addToInventory, mkMonster, collectCoins, explodeCoins } from './combat.js';
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
  // ── World 0: 경복궁, Seoul ─────────────────────────
  {
    id: 'palace',
    name: '경복궁',
    emoji: '🏯',           transport: '🏇',
    bgTop: '#0c1528',      bgBot: '#101e10',
    bossEmoji: '👺',       // Dokkaebi — Korean goblin
    bossName: '도깨비',
    biome: 'palace',
    forbiddenWeathers: [],
    floorColor:     '#141828',  floorColorAlt: '#0e1220',
    wallColor:      '#1e3d70',  altWallColor:  '#2e58a0',  // indigo palace stone; door arch brighter
  },
  // ── World 1: 제주도, Jeju Island ───────────────────────────────
  {
    id: 'jeju',
    name: '제주도',
    emoji: '🌋',           transport: '✈️',
    bgTop: '#050a00',      bgBot: '#0f1a05',
    bossEmoji: '🗿',       // Dol hareubang — iconic Jeju stone guardian statue
    bossName: '돌하르방',
    biome: 'jungle',
    forbiddenWeathers: ['snowing', 'blizzard'],
    floorColor:     '#101c06',  floorColorAlt: '#0c1604',
    wallColor:      '#1a2e08',  altWallColor:  '#2e4e14',  // dark volcanic rock; door lighter green-black
  },
  // ── World 2: 해운대, Busan ─────────────────────────────────────
  {
    id: 'haeundae',
    name: '해운대',
    emoji: '🏖️',          transport: '🚆',
    bgTop: '#050814',      bgBot: '#0a1228',
    bossEmoji: '🦑',       // Giant squid — Busan seafood icon turned monster
    bossName: '대왕오징어',
    biome: 'beach',
    forbiddenWeathers: ['snowing', 'blizzard'],
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
    bossEmoji: '🐯',       // Baekho — white tiger, legendary Korean mountain spirit
    bossName: '백호',
    biome: 'ice',
    forbiddenWeathers: ['clear'],
    floorColor:     '#1c2830',  floorColorAlt: '#141e28',
    wallColor:      '#162035',  altWallColor:  '#263455',  // cold granite; door cracks let in icy light
  },
  // ── World 5: 백두산 (legendary) ───────────────────────────────
  {
    id: 'baekdu',
    name: '백두산',
    emoji: '🏔️',          transport: '🧗',
    bgTop: '#000810',      bgBot: '#000c20',
    bossEmoji: '🐲',       // Divine dragon — guardian of Korea's sacred mountain
    bossName: '신룡',
    biome: 'volcano',
    forbiddenWeathers: ['clear', 'raining', 'drizzle'],
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
    bossEmoji: '🦊',       // Gumiho — nine-tailed fox from Korean mythology
    bossName: '구미호',
    biome: 'ruins',
    forbiddenWeathers: [],
    floorColor:     '#2a1808',  floorColorAlt: '#1e1004',
    wallColor:      '#3e2208',  altWallColor:  '#5e3818',  // dark amber wood; door lit by paper lanterns
  },
  // ── World 7: 동해, East Sea ────────────────────────────────────
  {
    id: 'eastsea',
    name: '동해',
    emoji: '🌊',           transport: '🛥️',
    bgTop: '#000c1a',      bgBot: '#00142a',
    bossEmoji: '🦈',       // Great white shark — deep East Sea
    bossName: '상어왕',
    biome: 'ocean',
    forbiddenWeathers: ['snowing', 'blizzard'],
    floorColor:     '#001628',  floorColorAlt: '#001020',
    wallColor:      '#001c38',  altWallColor:  '#003058',  // abyssal dark; door shows faint bioluminescence
  },
  // ── World 8: 전주 한옥마을 ─────────────────────────────────────
  {
    id: 'jeonju',
    name: '전주 한옥마을',
    emoji: '🏘️',          transport: '🚌',
    bgTop: '#120804',      bgBot: '#200e08',
    bossEmoji: '🎭',       // Tal mask — worn in traditional Talchum mask dance
    bossName: '탈춤왕',
    biome: 'traditional',
    forbiddenWeathers: [],
    floorColor:     '#341a08',  floorColorAlt: '#281206',
    wallColor:      '#4a2608',  altWallColor:  '#703c14',  // dark clay tile; door opens to warm lantern glow
  },
  // ── World 9: 경주 (Ancient Silla Capital) ─────────────────────
  {
    id: 'gyeongju',
    name: '경주',
    emoji: '🏛️',          transport: '🚲',
    bgTop: '#080808',      bgBot: '#101008',
    bossEmoji: '💀',       // Ancient Silla king's ghost — Daereungwon burial mounds
    bossName: '신라왕',
    biome: 'ruins',
    forbiddenWeathers: ['snowing', 'blizzard'],
    floorColor:     '#1a1806',  floorColorAlt: '#141204',
    wallColor:      '#1c1a06',  altWallColor:  '#363410',  // ochre stone; door glows faint gold
    fixedLighting: '00:30',
    unfitForTutorial: true,
  },
  // ── World 10: 여의도 벚꽃, Seoul ──────────────────────────────
  {
    id: 'yeouido',
    name: '여의도 벚꽃',
    emoji: '🌸',           transport: '🛳️',
    bgTop: '#100608',      bgBot: '#180c14',
    bossEmoji: '🐍',       // Serpent lurking beneath the sakura
    bossName: '꽃뱀',
    biome: 'spring',
    forbiddenWeathers: ['snowing', 'blizzard', 'foggy'],
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
    bossEmoji: '🦅',       // Steller's sea eagle — endemic to Dokdo's rocky cliffs
    bossName: '독수리',
    biome: 'ocean',
    forbiddenWeathers: [],
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
    bossEmoji: '💵',       // Gold boss — luxury and excess
    bossName: '황금신',
    biome: 'city',
    forbiddenWeathers: ['snowing', 'blizzard', 'foggy'],
    floorColor:     '#0a0a1c',  floorColorAlt: '#060612',
    wallColor:      '#0c0c28',  altWallColor:  '#1a1a48',  // near-black marble; door reveals gold-lit corridor
    fixedLighting: '23:30',
    unfitForTutorial: true,
  },
  // ── World 13: 용궁 (Dragon Palace — mythological) ─────────────
  {
    id: 'yonggoong',
    name: '용궁',
    emoji: '🐉',           transport: '🐢',  // 별주부전 — rabbit rides turtle to Dragon Palace
    bgTop: '#001414',      bgBot: '#002020',
    bossEmoji: '🐉',       // 용왕 — Dragon King of the Sea
    bossName: '용왕',
    biome: 'ocean',
    forbiddenWeathers: ['clear', 'raining', 'drizzle', 'snowing', 'blizzard'],
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
    bossEmoji: '👾',       // Space invader — cosmic void boss
    bossName: '우주괴물',
    biome: 'cosmos',
    forbiddenWeathers: ['raining', 'drizzle', 'snowing', 'blizzard', 'foggy'],
    floorColor:     '#060012',  floorColorAlt: '#04000c',
    wallColor:      '#080018',  altWallColor:  '#140030',  // void black; door cracks show deep space purple
    fixedLighting: '02:00',
    unfitForTutorial: true,
  },
];

/* ================================================================
   DUNGEON GENERATION — recursive backtracking maze
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
    hopDist: -1,
    waveNum: 1,
    enemyCount: 4,
    // room-type payloads (populated at generation time)
    shopItems: null,       // shop: array of {itemKey, price}
    itemChoices: null,     // modifier: array of 3 choices
    treasureItems: null,   // treasure: array of item keys
    rewardCollected: false,
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

/** Append more worlds to an existing sequence, using its tail as history. */
function extendWorldSequence(seq, n = 10) {
  const history = seq.slice(-10).map(w => w.id);
  for (let i = 0; i < n; i++) {
    const avail = WORLDS.filter(w => !history.slice(-10).includes(w.id));
    const pool = avail.length > 0 ? avail : WORLDS;
    const next = pool[Math.floor(Math.random() * pool.length)];
    seq.push(next);
    history.push(next.id);
  }
}

/** Generate the initial world sequence for a run (worlds 0..n-1). */
function generateWorldSequence(n = 14) {
  const history = ['forest'];
  const result = [];
  for (let i = 0; i < n; i++) {
    let avail = WORLDS.filter(w => !history.slice(-10).includes(w.id));
    if (i === 0) avail = avail.filter(w => !w.unfitForTutorial);
    if (!avail.length) avail = i === 0 ? WORLDS.filter(w => !w.unfitForTutorial) : WORLDS;
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

/* Pick a world def — uses the pre-seeded sliding-window sequence. */
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
  const history = run?.worldHistory || [];
  let avail = WORLDS.filter(w => !history.slice(-10).includes(w.id));
  if (worldIdx === 0) avail = avail.filter(w => !w.unfitForTutorial);
  if (!avail.length) avail = worldIdx === 0 ? WORLDS.filter(w => !w.unfitForTutorial) : WORLDS;
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

export function generateDungeon(worldIdx) {
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

  const maxHops = Math.max(...grid.map(c => c.hopDist));

  // Boss room: prefer corners/edges with high hop distance from player
  function edgeScore(cell) {
    const onCorner = (cell.col === 0 || cell.col === COLS - 1) && (cell.row === 0 || cell.row === ROWS - 1);
    const onEdge   = cell.col === 0 || cell.col === COLS - 1 || cell.row === 0 || cell.row === ROWS - 1;
    return cell.hopDist + (onCorner ? 4 : onEdge ? 2 : 0);
  }
  const sorted = [...grid].sort((a, b) => edgeScore(b) - edgeScore(a));
  const bossCell = sorted[0];
  bossCell.type = 'boss';

  // Classify remaining rooms by hop distance
  const normal = grid.filter(c => c !== bossCell);
  const hopThresholds = {
    shop:     Math.floor(maxHops * 0.75),
    modifier: Math.floor(maxHops * 0.55),
    treasure: Math.floor(maxHops * 0.35),
  };

  // Pick 1 shop (high distance)
  const shopCandidates = normal.filter(c => c.hopDist >= hopThresholds.shop && c.type === 'normal');
  if (shopCandidates.length) {
    const pick = shopCandidates[Math.floor(Math.random() * shopCandidates.length)];
    pick.type = 'shop';
  }

  // Pick 2–3 modifier rooms
  const modCount = 2 + (maxHops > 8 ? 1 : 0);
  const modCandidates = normal.filter(c => c.hopDist >= hopThresholds.modifier && c.type === 'normal');
  shuffle(modCandidates);
  for (let i = 0; i < Math.min(modCount, modCandidates.length); i++)
    modCandidates[i].type = 'modifier';

  // Pick 1–2 treasure rooms
  const treasCount = 1 + (maxHops > 6 ? 1 : 0);
  const treasCandidates = normal.filter(c => c.hopDist >= hopThresholds.treasure && c.type === 'normal');
  shuffle(treasCandidates);
  for (let i = 0; i < Math.min(treasCount, treasCandidates.length); i++)
    treasCandidates[i].type = 'treasure';

  // Pick 1 casino room: world 1 at 33% (secret), world 2+ at 66%
  const casinoChance = worldIdx === 1 ? 0.33 : (worldIdx >= 2 ? 0.66 : 0);
  if (casinoChance > 0 && Math.random() < casinoChance) {
    const casinoCandidates = normal.filter(c => c.type === 'normal');
    if (casinoCandidates.length) {
      // Mid-range hop distance for casino
      const midHop = Math.floor(maxHops * 0.4);
      const midCandidates = casinoCandidates.filter(c => c.hopDist >= midHop);
      const pool = midCandidates.length ? midCandidates : casinoCandidates;
      pool[Math.floor(Math.random() * pool.length)].type = 'casino';
    }
  }

  // Pick 1 teacher room.
  // World 0: always adjacent to spawn (so tutorial is easy to find).
  // World 1+: 60% chance, placed at high hop distance.
  if (worldIdx === 0) {
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
    const teacherCandidates = normal.filter(c => c.type === 'normal');
    if (teacherCandidates.length) {
      const highHop = Math.floor(maxHops * 0.8);
      const highCandidates = teacherCandidates.filter(c => c.hopDist >= highHop);
      const pool = highCandidates.length ? highCandidates : teacherCandidates;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      pick.teacherRevealed = true;
      pick.type = 'teacher';
    }
  }

  // Assign waveNum and enemyCount to each cell.
  // Softer difficulty curve: +8 per world (was +12), within-world range 0-6 (was 0-10),
  // difficulty cap raised to world 5 so progression feels longer.
  const worldDef = pickWorldDef(worldIdx);
  const effIdx = Math.min(worldIdx, 10); // Difficulty now peaks at World 10
  for (const cell of grid) {
    if (cell.type === 'boss') {
      cell.waveNum = (effIdx * 4) + 8; // Step reduced from 8 to 4
      cell.enemyCount = 1;
    } else {
      const noise = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
      cell.waveNum = Math.max(1, (effIdx * 4) + Math.floor(cell.hopDist / Math.max(maxHops, 1) * 6) + 1 + noise);
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

  // Reset visited flag for player tracking (was used by carve for maze generation)
  for (const cell of grid) {
    cell.visited = false;
    delete cell._mazeVisited;
  }

  // In world 0, reveal the shop cell on the map from the start (but not teleportable)
  if (worldIdx === 0) {
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
   ENTER ROOM
================================================================ */
export function enterRoom(col, row) {
  dismissAnnounce(); // fade out any active room title immediately on room change
  // Dismiss first-clear banner when entering a new room
  document.getElementById('first-clear-banner')?.classList.add('off');
  G.currentRoom = { col, row };
  G.doorLabelAlpha = 0; // fade labels in after transition completes
  const cell = getCell(col, row);
  if (!cell) return;

  // Mark as visited
  cell.visited = true;

  resetRoomState(cell.waveNum);
  // Reset per-room noise cancellation
  if (G.room) G.room.noiseCancelled = false;

  // Compute open door positions (exclude S — player enters from south area)
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
    return;
  }

  switch (cell.type) {
    case 'normal': {
      G.mode = 'combat';
      setRoomClearedCallback(() => onRoomCleared(cell));
      if (cell._savedRoom) {
        restoreSavedRoom(cell);
      } else if (G.worldTransition) {
        G.room._deferredTemplates = genRoomEnemies(cell); // defer spawn until animation ends
      } else {
        initRoomSpawner(genRoomEnemies(cell));
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
        G.room._deferredTemplates = genRoomEnemies(cell); // defer spawn until animation ends
      } else {
        initRoomSpawner(genRoomEnemies(cell));
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
      if (!cell.itemChoices) cell.itemChoices = rollModifierChoices(G);
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
      spawnRoomNpc('teacher', '🎓', cell);
      announce(i18n('world.teacherPrompt'), null);
      break;

    default:
      G.mode = 'navigate';
      cell.cleared = true;
  }

  // Tutorial box triggers on room entry
  // Always force-close any active tip on room change (panels must close on room change)
  window._hideTutorial?.(true);
  if (typeof window !== 'undefined' && G.run?.tutorial) {
    const tut  = G.run.tutorial;
    const wIdx = G.run.worldIdx;
    // Boss room (cleared) in world 0 → persistent "advance world" message (takes priority)
    if (cell.type === 'boss' && cell.cleared && wIdx === 0) {
      window._showTutorial?.('🐲', 'tutorial.typeToAdvance', null, { persist: true });
    } else {
      // Casino → luck hint (any world) — non-combat room, show immediately, auto-close 20s
      if (cell.type === 'casino' && !cell.casinoUsed) {
        window._showTutorial?.('🎰', 'tutorial.casinoLuck', null, { autoClose: 20 });
      }
      // World 0 special rooms (first visit) → interact hints — non-combat, auto-close 25s
      else if (wIdx === 0 && !cell.cleared) {
        if      (cell.type === 'shop')     window._showTutorial?.('🏪', 'tutorial.typeToBuy',  { room: i18n('map.legendShop') },     { autoClose: 25 });
        else if (cell.type === 'teacher')  window._showTutorial?.('🎓', 'tutorial.typeToTalk', { room: i18n('map.legendTeacher') },   { autoClose: 25 });
        else if (cell.type === 'treasure') window._showTutorial?.('💰', 'tutorial.typeToOpen', { room: i18n('map.legendTreasure') },  { autoClose: 25 });
        else if (cell.type === 'modifier') window._showTutorial?.('✨', 'tutorial.typeToOpen', { room: i18n('map.legendItem') },      { autoClose: 25 });
      }
    }
  }

  // Update minimap + HUD room code
  if (typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
  if (typeof window !== 'undefined' && window._hudUpdate) window._hudUpdate();
}

/* ================================================================
   RESTORE SAVED ROOM (after flee)
================================================================ */
function restoreSavedRoom(cell) {
  const saved = cell._savedRoom;
  delete cell._savedRoom;

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
    // No alive monsters to restore — just continue the spawner normally
    initRoomSpawner(remaining);
  } else {
    // Restored alive monsters are the current "group".
    // Set up the template queue WITHOUT calling sendNextGroup immediately —
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

  // Tutorial box triggers on combat room clear
  if (typeof window !== 'undefined' && G.run?.tutorial) {
    const tut  = G.run.tutorial;
    const wIdx = G.run.worldIdx;
    if (wIdx === 0) {
      tut.world0CombatCleared = (tut.world0CombatCleared || 0) + 1;
      const n = tut.world0CombatCleared;
      if (n === 1 && !tut.firstRoomClearShown) {
        tut.firstRoomClearShown = true;
        window._showTutorial?.('🧭', 'tutorial.typeToNavigate', null, { autoClose: 20 });
      } else if (n === 2 && !tut.mapHintShown) {
        tut.mapHintShown = true;
        window._showTutorial?.('🗺️', 'tutorial.pressMap', null, { autoClose: 25 });
      } else if (n >= 5) {
        window._showTutorial?.('🐲', 'tutorial.findBoss', null, { autoClose: 30 });
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
          window._showTutorial?.('🎓', 'tutorial.findTeacher', null, { autoClose: 30 });
        }
      }
    }
  }

  // Flush any tip that was queued during combat (item drops etc.)
  window._flushTutQueue?.();

  if (typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
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

  // Spawn portal NPC — player types next world's Korean name to advance
  spawnNextWorldNpc();

  // World 0: persistent "type to advance" tutorial
  if (G.run?.worldIdx === 0 && typeof window !== 'undefined') {
    window._showTutorial?.('🐲', 'tutorial.typeToAdvance', null, { persist: true });
  }
  // Flush any tip queued during boss fight
  window._flushTutQueue?.();
}

// setCombatRef kept for compatibility; no-op since addToInventory is imported directly
export function setCombatRef(_ref) {}

/* ================================================================
   NAVIGATE (between rooms)
================================================================ */
const DIR_DELTA = { N: [0,-1], S: [0,1], E: [1,0], W: [-1,0] };
const DIR_NAMES = { N: '북', S: '남', E: '동', W: '서' };

export function getAvailableDirs() {
  if (!G.currentRoom || !G.dungeon) return [];
  const cell = currentCell();
  if (!cell) return [];
  return [...cell.connections].filter(dir => {
    const [dc, dr] = DIR_DELTA[dir];
    const nc = cell.col + dc, nr = cell.row + dr;
    return nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS;
  });
}

export function navigate(dir) {
  if (G.mode !== 'navigate') return;
  if (G.phase !== 'run') return;

  const cell = currentCell();
  if (!cell || !cell.connections.has(dir)) return;

  const [dc, dr] = DIR_DELTA[dir];
  // Wrap around for wall-breaker border portals
  const nc = ((cell.col + dc) + COLS) % COLS;
  const nr = ((cell.row + dr) + ROWS) % ROWS;

  // Hide non-persistent tutorial when navigating
  if (typeof window !== 'undefined') window._hideTutorial?.();

  // Close any open screens
  hideAllScreens();

  // Explode any remaining ground items and uncollected coins when leaving
  for (const gi of (G.room?.groundItems || [])) {
    const label = gi.el?.querySelector?.('.gitem-hanja, .gitem-emoji');
    if (label) label.textContent = '💥';
    if (gi.el) {
      gi.el.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      gi.el.style.opacity = '0';
      gi.el.style.transform = 'translate(-50%, calc(-50% - 40px)) scale(1.5)';
      setTimeout(() => gi.el.remove(), 350);
    }
  }
  if (G.room) G.room.groundItems = [];
  explodeCoins();

  // Player exit animation
  const plEl = document.getElementById('pl-emoji');
  if (plEl) {
    plEl.classList.remove('entering');
    plEl.classList.add('exiting');
  }

  // Trigger fade transition
  G.transition = {
    phase: 'out',
    t: 0,
    dur: 0.3,
    cb: () => {
      enterRoom(nc, nr);
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
   ROOM NPC — interactive entity in special rooms
   Player types the NPC's word to trigger the room action.
================================================================ */
function spawnRoomNpc(type, emoji, cell) {
  // Themed word pools per room type (thematically fitting Korean words)
  const THEMED = {
    shop:     ['가게', '시장', '마트', '상점', '쇼핑', '상인', '물건'],
    tent:     ['텐트', '야영', '캠프'],
    modifier: ['선물', '마법', '능력', '강화', '아이템', '보상', '선택', '주문'],
    treasure: ['보물', '선물', '보석', '상금', '황금', '보따리', '상품', '수정'],
    casino:   ['카지노', '도박', '베팅', '갬블링', '복권', '주사위', '포커'],
    teacher:  ['선생님', '선생', '학습', '공부', '배우다', '수업'],
  };
  const pool = THEMED[type] || ['가게'];
  // Deterministic pick: same room always gets same word within a run
  const seed = (G.run?.seed || 0) + cell.col * 31 + cell.row * 7;
  const word = pool[((seed % pool.length) + pool.length) % pool.length];
  // Use the word's own emoji as NPC face (falls back to type emoji if not in dict)
  const wordEntry = WORD_DICT.find(w => w.text === word);
  const npcEmoji = wordEntry?.emoji || emoji;

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

/** Called by game.js when the player types in navigate mode */
export function tryNpcInteract(val) {
  const npc = G.room.npc;
  if (!npc || !npc.active) return false;
  if (val !== npc.word) return false;

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
    // Sleep — check cooldown
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
    // Teacher stays active — player can always return to review the lesson
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
    // Teacher always respawns — they never leave
    spawnRoomNpc('teacher', '🎓', cell);
  } else if (cell.isTent) {
    spawnRoomNpc('tent', '⛺', cell);
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
  spawnRoomNpc('tent', '⛺', cell);
  flashAnnounce(i18n('world.tentPitched'), '#88ddaa');
  if (typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
}
if (typeof window !== 'undefined') window._placeTent = placeTent;

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
  G.currentRoom = { ...G.dungeon.start };

  // Track biome history for infinite world rotation
  if (G.run.worldHistory) {
    G.run.worldHistory.push(G.dungeon.worldDef.id);
    if (G.run.worldHistory.length > 6) G.run.worldHistory.shift();
  }

  // Pre-generate "next worlds" preview (stable until next world transition)
  G.run.nextWorldsPreview = previewNextWorlds(7);

  hideAllScreens();

  // Enter start room without transition
  enterRoom(G.dungeon.start.col, G.dungeon.start.row);

  // Wall Breaker: permanent — re-open all connections in the new dungeon
  if (G.run.wallBreaker) openAllConnections();

  // Pick weather not forbidden by this world's biome
  const worldDef = G.dungeon.worldDef;
  if (G.weatherEnabled) {
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
}

export function startRun() {
  G.phase = 'run';
  G.run.worldIdx = 0;
  G.run.seed = Math.floor(Math.random() * 1e6); // per-run seed for deterministic room labels
  G.run.worldSequence = generateWorldSequence(14); // seed entire run upfront
  G.dungeon = generateDungeon(0);
  G.currentRoom = { ...G.dungeon.start };
  G.run.nextWorldsPreview = previewNextWorlds(7);
  enterRoom(G.dungeon.start.col, G.dungeon.start.row);

  const worldDef = G.dungeon.worldDef;
  G.weather = pickWorldWeather(worldDef);

  const _wn = i18n('worlds.' + worldDef.id + '.name') || worldDef.name;
  const _startMsg = `🌍 ${worldDef.emoji} ${_wn} — ${i18n('world.start')}`;
  if (G.worldTransition) {
    G.worldTransition.pendingAnnounce = _startMsg;
  } else {
    announce(_startMsg, null);
  }
}

/* ================================================================
   MODIFIER ROOM — pick item
================================================================ */
export function pickModifierItem(cell, choiceIdx) {
  if (!cell.itemChoices) return;
  const choice = cell.itemChoices[choiceIdx];
  if (!choice) return;

  if (choice.type === 'permanent') {
    const perm = choice.item;
    if (!G.run.permanents.includes(perm.id)) {
      G.run.permanents.push(perm.id);
      perm.onAcquire(G);
      flashAnnounce(`${perm.emoji} ${i18n('world.acquired')}`, '#ffcc44');
      // Side effects
      if (perm.id === 'crystal_ball' && typeof window !== 'undefined' && window._mapUpdate) window._mapUpdate();
      if (perm.id === 'wall_breaker') openAllConnections();
    }
  } else {
    // consumable
    addItemToInventory(choice.itemKey);
    flashAnnounce(`${choice.itemKey} ${i18n('world.acquired')}`, '#88ff44');
  }

  cell.rewardCollected = true;
  hideAllScreens();

  if (typeof window !== 'undefined' && window._hudUpdate) window._hudUpdate();
}

/* ================================================================
   SHOP — buy item
================================================================ */
export function shopBuy(cell, entry, price) {
  if (G.run.wallet < price) {
    flashAnnounce(i18n('world.notEnoughCoins'), '#ff4444');
    return false;
  }
  if (entry.type === 'modifier') {
    // Permanent upgrade — check not already owned
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
    flashAnnounce(`${entry.itemKey} ${i18n('world.purchased')}`, '#88ff44');
  }
  if (typeof window !== 'undefined' && window._hudUpdate) window._hudUpdate();
  return true;
}

/* ================================================================
   TREASURE ROOM — collect items
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
   WALL BREAKER — open all connections between cells
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
