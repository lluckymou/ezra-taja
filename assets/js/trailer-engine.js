/* ================================================================
   TRAILER ENGINE

   A deliberately thin film adapter around Ezra's actual renderer.
   It builds a small, deterministic dungeon only so the production page can
   render real rooms, trees, doors, ocean/cosmos and combat layers without
   booting the game UI itself.
================================================================ */
import { G } from './state.js';
import { WORLDS, COLS, ROWS } from './world.js';
import {
  initRenderer,
  drawBackground,
  drawPuddles,
  drawTrees,
  drawEnvironmentObject,
  drawDoors,
  drawRoomNpc,
  getTreeDepths,
  getEnvironmentDepths,
} from './renderer.js?trailer-tree-scale-v1';
import {
  drawMonsters,
  drawProjs,
  drawParts,
  drawBossTether,
  drawBossBadge,
} from './combat.js';
import { loadLanguages, setLanguage } from './i18n.js';
import { WORD_DICT } from '../data/words.js';

const CENTER = { col: 3, row: 3 };
const OPPOSITE = { N: 'S', E: 'W', S: 'N', W: 'E' };
const DELTA = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

function roomCell(col, row) {
  return {
    col,
    row,
    type: 'combat',
    connections: new Set(),
    cleared: false,
    visited: true,
  };
}

function makeDungeon(world, { roomType = 'combat', bossDoor = false, cleared = false } = {}) {
  // This cell happens to select the dojang's red/blue mat pattern instead of
  // a flat red variant; it keeps the tutorial shot recognizably a dojang.
  const center = world?.isDojangTutorial ? { col: 5, row: 1 } : CENTER;
  const grid = Array.from({ length: COLS * ROWS }, (_, index) => {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    return roomCell(col, row);
  });
  const get = (col, row) => grid[row * COLS + col];
  const current = get(center.col, center.row);
  current.type = roomType;
  current.cleared = cleared;
  current.connections = new Set(['N', 'E', 'S', 'W']);

  for (const dir of current.connections) {
    const [dc, dr] = DELTA[dir];
    const adjacent = get(center.col + dc, center.row + dr);
    adjacent.connections = new Set([OPPOSITE[dir]]);
    adjacent.visited = true;
  }

  if (bossDoor) get(center.col, center.row - 1).type = 'boss';
  return { worldDef: world, grid, start: { ...center }, runSeed: 73691 };
}

function sizeFor(base) {
  const raw = G.vH / 1080;
  const soft = raw <= 1 ? raw : 1 + (raw - 1) * 0.45;
  return Math.round(base * soft);
}

function makeMonster({
  word,
  boss = false,
  hit = 0,
  death = 0,
  x,
  y,
  id = null,
  hp = null,
  maxHp = null,
  emoji = null,
  bossEmoji = null,
  wieldIcon = undefined,
  special = null,
  labelColor = null,
  baseSize = null,
  spawnProgress = null,
  spawnDuration = 0.65,
}) {
  const entry = WORD_DICT.find(item => item.text === word) || { text: word, emoji: '👾' };
  const resolvedMaxHp = Math.max(1, maxHp ?? hp ?? (boss ? 4 : 1));
  const resolvedHp = Math.max(1, (hp ?? resolvedMaxHp) - Math.floor(hit * (resolvedMaxHp - 1)));
  const resolvedSize = baseSize ?? (boss ? 108 : 58);
  const resolvedId = id ?? (boss ? 770 : 330);
  const resolvedEmoji = emoji || entry.emoji;
  const monster = {
    id: resolvedId,
    type: boss ? 'boss' : 'normal',
    special,
    bossEmoji: boss ? (bossEmoji || G.dungeon.worldDef.bossEmoji) : null,
    emoji: resolvedEmoji,
    wieldIcon: wieldIcon === undefined ? (entry.secondaryEmoji || null) : wieldIcon,
    hpIcon: '📃',
    labelColor: labelColor ?? (boss ? '#ffd700' : null),
    x,
    y,
    hp: resolvedHp,
    maxHp: resolvedMaxHp,
    words: [word],
    wi: 0,
    wordEmojis: [resolvedEmoji],
    get word() { return this.words[this.wi] || this.words[0]; },
    get size() { return sizeFor(resolvedSize); },
    baseSize: resolvedSize,
    baseSpd: 0,
    get spd() { return 0; },
    tracking: false,
    dead: false,
    flash: Math.max(0, 1 - hit * 1.8),
    wob: Math.sin(G.gameTime * 3.2 + resolvedId * 0.01) * 0.18,
    scl: 1 + death * 0.22,
    sclDir: 1,
    fleeing: death > 0.01,
    fleeAlpha: Math.max(0, 1 - death),
    isProjectileMonster: false,
    isVerbAdj: false,
    isNumeric: false,
    spawnAnim: spawnProgress == null ? null : {
      t: Math.max(0, Math.min(1, spawnProgress)) * spawnDuration,
      dur: spawnDuration,
      landNY: y / G.vH,
    },
  };
  return monster;
}

function monsterBottom(monster) {
  const hpRatio = monster.maxHp > 1 ? monster.hp / monster.maxHp : 1;
  const drawSize = monster.size * (monster.maxHp > 1 ? (0.55 + hpRatio * 0.45) : 1);
  return monster.y + drawSize * (monster.scl || 1) * 0.5;
}

function drawDepthSorted(monsters) {
  const objects = [
    ...getTreeDepths().map(tree => ({ kind: 'tree', id: tree.id, bottomY: tree.baseY })),
    ...getEnvironmentDepths().map(object => ({ kind: 'environment', id: object.id, bottomY: object.baseY })),
    ...monsters.map(monster => ({ kind: 'monster', monster, bottomY: monsterBottom(monster) })),
  ];
  objects.sort((a, b) => {
    const distance = a.bottomY - b.bottomY;
    return distance || (a.kind === 'monster' ? 1 : -1);
  });

  for (const object of objects) {
    if (object.kind === 'tree') drawTrees('back', object.id);
    else if (object.kind === 'environment') drawEnvironmentObject(object.id);
    else drawMonsters({ bodyFilter: candidate => candidate === object.monster });
  }
}

function addPlayerProjectile({ monster, progress, hit = 0, emoji = '🔥', impactBurst = true }) {
  if (!monster || progress <= 0 || progress >= 1) return;
  const startX = G.W * 0.5;
  const startY = G.vH * 0.665;
  G.room.projs.push({
    x: startX + (monster.x - startX) * progress,
    y: startY + (monster.y - startY) * progress,
    emoji,
    rot: progress * 1.2,
    rs: 0,
    size: Math.round(48 * G.vH / 1080),
    born: performance.now() - Math.min(340, 90 + progress * 250),
    dead: false,
  });
  if (impactBurst && hit > 0.9) {
    G.room.parts.push(
      { x: monster.x, y: monster.y, emoji: '💥', size: Math.max(26, monster.size * 0.72), life: 0.78 },
      { x: monster.x - monster.size * 0.35, y: monster.y - monster.size * 0.22, emoji: '✨', size: 22, life: 0.72 },
      { x: monster.x + monster.size * 0.36, y: monster.y - monster.size * 0.08, emoji: '⭐', size: 18, life: 0.7 },
    );
  }
}

function addDeathBurst({ monster, progress = 0 }) {
  if (!monster || progress <= 0 || progress >= 0.55) return;
  const fade = Math.max(0, 1 - progress / 0.55);
  G.room.parts.push(
    { x: monster.x, y: monster.y, emoji: '💥', size: Math.max(32, monster.size * (0.78 + progress * 0.2)), life: fade },
    { x: monster.x - monster.size * 0.32, y: monster.y - monster.size * 0.20, emoji: '✨', size: 22, life: fade * 0.82 },
    { x: monster.x + monster.size * 0.34, y: monster.y - monster.size * 0.10, emoji: '⭐', size: 18, life: fade * 0.78 },
  );
}

function addEnemyProjectile({ monster, progress, emoji = '🗡️' }) {
  if (!monster || progress <= 0 || progress >= 1) return;
  const targetX = G.W * 0.5;
  const targetY = G.vH * 0.665;
  G.room.projs.push({
    x: monster.x + (targetX - monster.x) * progress,
    y: monster.y + (targetY - monster.y) * progress,
    emoji,
    rot: -progress * 1.1,
    rs: 0,
    size: Math.round(42 * G.vH / 1080),
    born: performance.now() - Math.min(340, 90 + progress * 250),
    dead: false,
  });
}

function configureState({ world, time, language, roomType, bossDoor, cleared, weather, doorLabels = false, npc = null, treeScale = 1 }) {
  G.W = canvas.width;
  G.H = canvas.height;
  G.vH = canvas.height;
  G.isMob = G.W < 600;
  // The trailer shows rooms in readable daylight instead of inheriting a
  // world's live night-cycle moment. The underlying room renderer is intact.
  G.phase = 'title';
  G.mode = (cleared || npc) ? 'navigate' : 'combat';
  G.last = time * 1000;
  G.gameTime = 168 + time;
  G.weather = weather || 'clear';
  G.weatherEnabled = 0;
  G.treeDetails = 2;
  G.treeScale = treeScale;
  G.translationEnabled = true;
  G.varyFonts = false;
  G.hangulSize = Math.max(28, Math.round(G.vH * 0.047));
  G.showHanjaOnMonsters = false;
  G.wordHiddenStatus = {};
  G.run = { worldIdx: WORLDS.indexOf(world), seed: 73691 };
  G.dungeon = makeDungeon(world, { roomType, bossDoor, cleared });
  G.currentRoom = { ...G.dungeon.start };
  G.doorLabelAlpha = doorLabels ? 0.96 : 0;
  G.room = {
    monsters: [],
    projs: [],
    parts: [],
    coins: [],
    openDoors: [],
    revealedHidden: false,
  };
  if (npc) {
    const cell = G.dungeon.grid.find(candidate => candidate.col === G.currentRoom.col && candidate.row === G.currentRoom.row);
    G.room.npc = {
      type: npc.type || roomType,
      emoji: npc.emoji,
      word: npc.word,
      cell,
      x: G.W / 2,
      y: G.vH * 0.42,
      active: true,
    };
  }
  setLanguage(language);
}

let canvas;
let weatherCanvas;
let dayNightCanvas;

/**
 * Create the real-game scene canvas used by trailer.html. The canvas remains
 * offscreen; trailer.html can crop and zoom it without redrawing a fake room.
 */
export async function createTrailerGameRenderer() {
  canvas = document.createElement('canvas');
  canvas.id = 'gc';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', width: '1px', height: '1px', left: '-10000px', top: '0', opacity: '0', pointerEvents: 'none',
  });
  document.body.append(canvas);

  weatherCanvas = document.createElement('canvas');
  dayNightCanvas = document.createElement('canvas');
  initRenderer(canvas, weatherCanvas, dayNightCanvas);
  await loadLanguages();

  return {
    canvas,
    worlds: WORLDS,
    render({
      worldId,
      time = 0,
      language = 'pt',
      word = '호랑이',
      boss = false,
      bossDoor = false,
      cleared = false,
      projectile = -1,
      hit = 0,
      death = 0,
      actors = null,
      playerShots = [],
      enemyShots = [],
      roomType = null,
      doorLabels = false,
      npc = null,
      treeScale = 1,
    } = {}) {
      const world = WORLDS.find(candidate => candidate.id === worldId) || WORLDS[1];
      const actorSpecs = actors || (word ? [{ word, boss, hit, death }] : []);
      const hasBoss = boss || actorSpecs.some(actor => actor.boss);
      configureState({
        world,
        time,
        language,
        roomType: roomType || (hasBoss ? 'boss' : 'combat'),
        bossDoor,
        cleared,
        doorLabels,
        npc,
        treeScale,
      });
      const monsters = actorSpecs.map((actor, index) => {
        const actorBoss = actor.boss ?? boss;
        return makeMonster({
          ...actor,
          boss: actorBoss,
          id: actor.id ?? (actorBoss ? 770 : 330 + index),
          x: actor.x ?? G.W * (actorBoss ? 0.54 : 0.56),
          y: actor.y ?? G.vH * (actorBoss ? 0.34 : 0.37),
        });
      });
      G.room.monsters.push(...monsters);

      drawBackground();
      drawPuddles();
      drawDoors();
      // Mirror the in-game resolution: once the boss is gone, its portrait
      // and tether break with it instead of remaining as a detached overlay.
      const activeBoss = monsters.find(monster => monster.type === 'boss');
      const bossAliveForTether = activeBoss && activeBoss.fleeAlpha > 0.42;
      if (bossAliveForTether) drawBossTether();
      if (monsters.length) drawDepthSorted(monsters);
      else {
        drawTrees();
        drawEnvironmentObject();
      }
      if (bossAliveForTether) drawBossBadge();
      if (word && monsters[0]) addPlayerProjectile({ monster: monsters[0], progress: projectile, hit });
      for (const shot of playerShots) {
        addPlayerProjectile({
          monster: monsters[shot.target ?? 0],
          progress: shot.progress,
          hit: shot.hit,
          emoji: shot.emoji || '🔥',
          impactBurst: shot.impactBurst !== false,
        });
      }
      actorSpecs.forEach((actor, index) => {
        if (actor.burstOnDeath) addDeathBurst({ monster: monsters[index], progress: actor.death });
      });
      for (const shot of enemyShots) {
        addEnemyProjectile({
          monster: monsters[shot.source ?? 0],
          progress: shot.progress,
          emoji: shot.emoji || '🗡️',
        });
      }
      drawProjs();
      drawParts();
      drawRoomNpc();
      return canvas;
    },
  };
}
