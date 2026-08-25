import { getRoomWind } from './environment.js';

/* ================================================================
   PROCEDURAL ROOM TREES
   Natural, deterministic landmarks for the 2.5D room renderer.

   Trees are generated from a room seed instead of stored as sprites.  The
   same tree therefore survives redraws, resize, reloads and multiplayer
   blueprint reconstruction without adding collision/pathfinding state.
================================================================ */

const TAU = Math.PI * 2;

const PALETTES = {
  summer: {
    leaves: ['#567b3b', '#6f9347', '#83a856', '#3f6938'],
    flowers: [],
    trunk: ['#4f3825', '#67472d', '#38291e'],
  },
  spring: {
    leaves: ['#6e9c4e', '#87b65c', '#a5c975', '#4f8245'],
    flowers: ['#f3a7bd', '#f8c7d5', '#df789e'],
    trunk: ['#503728', '#6c4930', '#38291f'],
  },
  autumn: {
    leaves: ['#bd6e2e', '#d48b2f', '#a84b2f', '#8b5a2e'],
    flowers: [],
    trunk: ['#4a3021', '#614029', '#302219'],
  },
  winter: {
    leaves: ['#745238', '#916b47', '#5d4935'],
    flowers: ['#edf4fa'],
    trunk: ['#3f332a', '#554237', '#28231f'],
  },
};

// Water and space get their own future flora systems; ordinary trees would
// read as accidental scenery there.
const TREELESS_BIOMES = new Set(['ocean', 'cosmos']);
const FLOWER_FALLBACK = ['#f3a7bd', '#f8c7d5', '#df789e', '#ffd9e5'];
const EVERGREEN_LEAVES = ['#285f3b', '#377c47', '#4b9052', '#1e4b32'];

// Themes exposed by the room cheat panel. "auto" keeps the biome's natural
// selection; the other values force a family while still randomizing its shape.
export const TREE_THEMES = ['auto', 'broadleaf', 'palm', 'pine', 'blossom', 'bare', 'street'];

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seedFor(...parts) {
  return hashString(parts.join('|')) || 1;
}

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function seasonFor(world) {
  if (world?.treeSeason) return world.treeSeason;
  if (world?.biome === 'spring' || world?.id === 'yeouido') return 'spring';
  if (world?.biome === 'ice') return 'winter';
  if (world?.biome === 'volcano') return 'autumn';
  return 'summer';
}

function speciesFor(world, rng, theme = 'auto') {
  if (theme && theme !== 'auto' && TREE_THEMES.includes(theme)) return theme;
  const biome = world?.biome;
  if (biome === 'beach' || biome === 'jungle') {
    return rng() < 0.48 ? 'palm' : 'broadleaf';
  }
  if (biome === 'ice') return rng() < 0.74 ? 'pine' : 'bare';
  if (biome === 'volcano') return rng() < 0.65 ? 'pine' : 'bare';
  if (biome === 'spring') return rng() < 0.72 ? 'blossom' : 'broadleaf';
  if (biome === 'city') return rng() < 0.35 ? 'street' : 'broadleaf';
  if (biome === 'ocean') return rng() < 0.55 ? 'palm' : 'broadleaf';
  if (biome === 'palace' || biome === 'traditional' || biome === 'ruins') {
    return rng() < 0.18 ? 'pine' : 'broadleaf';
  }
  return 'broadleaf';
}

function makeBranch(angle, len, depth, maxDepth, rng, leafMode) {
  const node = {
    angle,
    len,
    depth,
    phase: rng() * TAU,
    children: [],
    leaf: false,
    leafMode,
  };

  if (depth >= maxDepth || len < 0.035) {
    node.leaf = true;
    node.buds = [];
    if (leafMode !== 'bare') {
      // Street trees keep the branching silhouette but carry only a fraction
      // of the normal buds, so they read as sparse urban trees from a distance.
      const count = leafMode === 'sparse'
        ? (rng() < 0.32 ? 1 : 0)
        : 2 + Math.floor(rng() * 3);
      for (let i = 0; i < count; i++) {
        node.buds.push({
          angle: rng() * TAU,
          distance: rng() * 1.8,
          radius: 0.8 + rng() * 0.35,
          tone: rng(),
          flower: rng(),
        });
      }
    }
    return node;
  }

  const count = depth < 2 ? 2 : (rng() < 0.18 ? 3 : 2);
  const spread = 0.28 + rng() * 0.28;
  for (let i = 0; i < count; i++) {
    const centered = count === 2 ? (i ? 1 : -1) : (i - 1);
    const childAngle = centered * spread + (rng() - 0.5) * 0.18;
    const ratio = depth < 1
      ? 0.66 + rng() * 0.12
      : 0.52 + rng() * 0.28;
    node.children.push(makeBranch(childAngle, len * ratio, depth + 1, maxDepth, rng, leafMode));
  }
  return node;
}

function buildBroadleaf(rng, leafMode = 'leaf') {
  return makeBranch(-Math.PI / 2, 0.34, 0, 7, rng, leafMode);
}

function drawBroadleaf(ctx, tree, palette, t, wind, light) {
  const size = tree.size;
  const baseX = tree.x;
  const baseY = tree.baseY;
  const root = tree.root;
  const trunkColor = palette.trunk[0];

  function drawNode(node, x, y, parentAngle) {
    const sway = wind * (0.006 + node.depth * 0.003) *
      Math.sin(t * (1.05 + node.depth * 0.08) + node.phase);
    const abs = parentAngle + node.angle + sway;
    const len = node.len * size;
    const x2 = x + Math.cos(abs) * len;
    const y2 = y + Math.sin(abs) * len;
    const width = Math.max(1.1, size * 0.032 * Math.pow(0.80, node.depth));

    ctx.lineWidth = width;
    ctx.strokeStyle = palette.trunk[node.depth % palette.trunk.length];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (node.leaf) {
      const r = Math.max(3, size * (node.depth < 4 ? 0.026 : 0.020));
      for (const bud of node.buds || []) {
        const a = bud.angle;
        const d = bud.distance * r;
        const isFlower = node.leafMode === 'blossom' && bud.flower < 0.68;
        const colors = isFlower
          ? (palette.flowers.length ? palette.flowers : FLOWER_FALLBACK)
          : palette.leaves;
        const budScale = isFlower ? 1.28 : 1;
        ctx.fillStyle = colors[Math.floor(bud.tone * colors.length) % colors.length];
        ctx.beginPath();
        ctx.ellipse(x2 + Math.cos(a) * d, y2 + Math.sin(a) * d,
          r * bud.radius * budScale, r * (0.62 + bud.radius * 0.18) * budScale,
          a, 0, TAU);
        ctx.fill();
      }
      return;
    }
    for (const child of node.children) drawNode(child, x2, y2, abs);
  }

  ctx.save();
  ctx.globalAlpha *= light < 0.35 ? 0.86 : 1;
  drawNode(root, baseX, baseY, 0);
  ctx.restore();
}

function drawPine(ctx, tree, palette, t, wind, light) {
  const size = tree.size;
  const x = tree.x;
  const y = tree.baseY;
  const topY = y - size * 0.92;

  ctx.strokeStyle = palette.trunk[0];
  ctx.lineWidth = Math.max(2, size * 0.035);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + Math.sin(t * 0.8 + tree.phase) * wind * 6, y - size * 0.48, x, topY);
  ctx.stroke();

  const tiers = 7;
  for (let i = 0; i < tiers; i++) {
    const p = i / (tiers - 1);
    const cy = y - size * (0.22 + p * 0.65);
    const half = size * (0.14 + (1 - p) * 0.23);
    const sway = Math.sin(t * 1.1 + tree.phase + i) * wind * (2 + i * 0.4);
    // Pine needles are evergreen. Winter changes the atmosphere and bare
    // companion trees, but never turns conifers brown.
    ctx.strokeStyle = EVERGREEN_LEAVES[i % EVERGREEN_LEAVES.length];
    ctx.lineWidth = Math.max(1.2, size * 0.018);
    for (let j = 0; j < 7; j++) {
      const q = j / 6;
      const bx = x + sway + (q - 0.5) * half * 2;
      ctx.beginPath();
      // Every needle cluster starts at the trunk. Previously each stroke
      // started at its outer endpoint, which made the foliage float beside
      // the tree instead of growing from it.
      ctx.moveTo(x + sway, cy + size * 0.035);
      ctx.lineTo(bx + (q - 0.5) * half * 0.55, cy - size * (0.08 + (1 - p) * 0.08));
      ctx.stroke();
    }
  }
}

function drawPalm(ctx, tree, palette, t, wind, light) {
  const size = tree.size;
  const x = tree.x;
  const y = tree.baseY;
  const lean = Math.sin(t * 0.55 + tree.phase) * wind * 10;
  const topX = x + lean + tree.lean;
  const topY = y - size * 0.83;

  ctx.strokeStyle = palette.trunk[0];
  ctx.lineWidth = Math.max(2, size * 0.033);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + tree.lean * 0.35, y - size * 0.4, topX, topY);
  ctx.stroke();

  const leafColors = palette.leaves;
  const fallbackFrondCount = tree.palmStyle === 'radial' ? 17 : 11;
  const fronds = tree.fronds || Array.from({ length: fallbackFrondCount }, (_, i) => ({
    angle: tree.palmStyle === 'radial'
      ? (i / fallbackFrondCount) * TAU
      : (i - 5) * 0.22,
    reach: tree.palmStyle === 'radial' ? 0.25 : 0.20 + i * 0.001,
  }));
  const radial = tree.palmStyle === 'radial';
  for (let i = 0; i < fronds.length; i++) {
    const a = radial ? fronds[i].angle : -Math.PI / 2 + fronds[i].angle;
    const reach = size * fronds[i].reach;
    const ex = topX + Math.cos(a) * reach;
    const ey = topY + Math.sin(a) * reach * (radial ? 0.84 : 0.65);
    ctx.strokeStyle = leafColors[i % leafColors.length];
    ctx.lineWidth = Math.max(1.1, size * 0.012);
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo((topX + ex) / 2 + Math.sin(t + i) * wind * 3, (topY + ey) / 2, ex, ey);
    ctx.stroke();
  }
}

function drawSingleTree(ctx, tree, palette, t, wind, light) {
  ctx.save();
  ctx.translate(0, Math.sin(t * 0.7 + tree.phase) * wind * 1.5);
  const species = tree.species;
  if (species === 'palm') drawPalm(ctx, tree, palette, t, wind, light);
  else if (species === 'pine') drawPine(ctx, tree, palette, t, wind, light);
  else drawBroadleaf(ctx, tree, palette, t, wind, light);
  ctx.restore();
}

function drawFrontSlice(ctx, tree, palette, t, wind, light) {
  // A lower slice of the landmark is redrawn after monsters.  This gives the
  // trunk/roots a real near-plane without making the whole canopy float over
  // every actor in the room.
  const sliceTop = tree.baseY - tree.size * 0.25;
  ctx.save();
  ctx.beginPath();
  ctx.rect(tree.x - tree.size * 0.55, sliceTop, tree.size * 1.1, tree.size * 0.32);
  ctx.clip();
  ctx.globalAlpha *= 0.92;
  drawSingleTree(ctx, tree, palette, t, wind, light);
  ctx.restore();
}

const PLAN_CACHE = new Map();
const ROOM_OVERRIDES = new Map();
const SPRITE_CACHE = new Map();

function roomKey(world, cell, seed) {
  return `${seed}|${world?.id}|${cell?.col}|${cell?.row}`;
}

function invalidateRoomPlan(world, cell, seed) {
  const prefix = roomKey(world, cell, seed) + '|';
  for (const key of PLAN_CACHE.keys()) {
    if (key.startsWith(prefix)) PLAN_CACHE.delete(key);
  }
  // A new generation can introduce a different shape. Keep old room bitmaps
  // bounded instead of retaining every visited room forever.
  SPRITE_CACHE.clear();
}

function buildPlan({ world, cell, seed, theme = 'auto', nonce = 0 }) {
  if (!world || world.isDojangTutorial || world.biome === 'dojang' || TREELESS_BIOMES.has(world.biome)) return [];

  const rng = rngFrom(seedFor(seed, world.id, cell.col, cell.row, theme, nonce));
  const special = ['shop', 'modifier', 'treasure', 'casino', 'teacher'].includes(cell.type);
  const count = special ? 1 : (rng() < 0.28 ? 2 : 1);
  const positions = special
    ? [{ x: 0.18, base: 0.67 }]
    : count > 1
      // Two landmarks always occupy opposite sides of the room. The old
      // independent random picks could stack both trees on one side.
      ? [{ x: 0.19, base: 0.64 + rng() * 0.035 },
         { x: 0.81, base: 0.64 + rng() * 0.035 }]
      : [{ x: rng() < 0.5 ? 0.20 : 0.80, base: 0.64 + rng() * 0.035 }];
  const season = seasonFor(world);
  const trees = [];

  for (let i = 0; i < count; i++) {
    const p = positions[i];
    const treeSeed = seedFor(seed, world.id, cell.col, cell.row, i, 'tree', theme, nonce);
    const treeRng = rngFrom(treeSeed);
    const species = speciesFor(world, treeRng, theme);
    const leafMode = species === 'blossom' ? 'blossom'
      : species === 'bare' ? 'bare'
      : species === 'street' ? 'sparse'
      : 'leaf';
    const size = 0.32 + treeRng() * 0.13;
    const palmStyle = species === 'palm' && treeRng() < (2 / 3) ? 'radial' : 'upright';
    const frondCount = palmStyle === 'radial' ? 17 : 11;
    const tree = {
      x: p.x + (treeRng() - 0.5) * 0.018,
      base: p.base,
      size,
      species: species === 'bare' ? 'broadleaf' : species,
      leafMode,
      lean: (treeRng() - 0.5) * 0.10,
      phase: treeRng() * TAU,
      cacheId: treeSeed,
      treeId: String(treeSeed),
      root: buildBroadleaf(treeRng, leafMode),
      season,
      palmStyle,
      fronds: Array.from({ length: frondCount }, (_, j) => ({
        angle: palmStyle === 'radial'
          ? (j / frondCount) * TAU + (treeRng() - 0.5) * 0.14
          : (j - 5) * 0.22 + (treeRng() - 0.5) * 0.08,
        reach: palmStyle === 'radial'
          ? 0.21 + treeRng() * 0.16
          : 0.20 + treeRng() * 0.15,
      })),
    };
    trees.push(tree);
  }
  return trees;
}

function getPlan(world, cell, seed) {
  const baseKey = roomKey(world, cell, seed);
  const override = ROOM_OVERRIDES.get(baseKey);
  const key = `${baseKey}|${override?.mode || 'default'}|${override?.theme || 'auto'}|${override?.nonce || 0}`;
  if (!PLAN_CACHE.has(key)) {
    PLAN_CACHE.set(key, override?.mode === 'empty'
      ? []
      : buildPlan({
        world,
        cell,
        seed,
        theme: override?.theme || 'auto',
        nonce: override?.nonce || 0,
      }));
  }
  return PLAN_CACHE.get(key);
}

export function clearTreeCache() {
  PLAN_CACHE.clear();
  SPRITE_CACHE.clear();
}

export function clearRoomTrees({ world, cell, seed = 0 } = {}) {
  if (!world || !cell) return;
  const key = roomKey(world, cell, seed);
  ROOM_OVERRIDES.set(key, { mode: 'empty', nonce: Date.now() });
  invalidateRoomPlan(world, cell, seed);
}

export function generateRoomTrees({ world, cell, seed = 0, theme = 'auto' } = {}) {
  if (!world || !cell) return;
  const key = roomKey(world, cell, seed);
  const safeTheme = TREE_THEMES.includes(theme) ? theme : 'auto';
  ROOM_OVERRIDES.set(key, {
    mode: 'generated',
    theme: safeTheme,
    nonce: Math.floor(Math.random() * 0x7fffffff),
  });
  invalidateRoomPlan(world, cell, seed);
}

export function getRoomTreeDepths({ world, cell, seed = 0, H = 0, details = 2 } = {}) {
  if (!world || !cell || details <= 0 || world.isDojangTutorial || world.biome === 'dojang') return [];
  return getPlan(world, cell, seed).map(tree => ({
    id: tree.treeId,
    baseY: tree.base * H,
  }));
}

function createSpriteCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

// Trees are detailed once into a small transparent bitmap. The main canvas
// only blits this bitmap each frame, avoiding hundreds of paths/ellipses per
// tree during the game loop.
function getTreeSprite(tree, palette) {
  const key = `${tree.cacheId}|${Math.round(tree.size)}|${tree.species}|${tree.leafMode}|${tree.season}`;
  if (SPRITE_CACHE.has(key)) return SPRITE_CACHE.get(key);

  const pad = Math.max(10, Math.ceil(tree.size * 0.12));
  const width = Math.max(32, Math.ceil(tree.size * 1.55 + pad * 2));
  const height = Math.max(32, Math.ceil(tree.size * 1.16 + pad * 2));
  const surface = createSpriteCanvas(width, height);
  const spriteCtx = surface?.getContext?.('2d');
  if (!surface || !spriteCtx) return null;

  const spriteTree = {
    ...tree,
    x: width / 2,
    baseY: height - pad,
  };
  drawSingleTree(spriteCtx, spriteTree, palette, 0, 0, 1);
  const sprite = { canvas: surface, baseX: spriteTree.x, baseY: spriteTree.baseY };
  SPRITE_CACHE.set(key, sprite);
  // Keep memory bounded when a player explores many worlds/rooms.
  while (SPRITE_CACHE.size > 48) SPRITE_CACHE.delete(SPRITE_CACHE.keys().next().value);
  return sprite;
}

function drawTreeSprite(ctx, sprite, tree, { time, wind, details, front }) {
  if (!sprite || typeof ctx.drawImage !== 'function') return;
  const sway = details >= 2
    ? Math.sin(time * 0.7 + tree.phase) * wind * tree.size * 0.018
    : 0;
  const lift = details >= 2
    ? Math.sin(time * 0.55 + tree.phase) * wind * 0.45
    : 0;
  const dx = tree.x - sprite.baseX + sway;
  const dy = tree.baseY - sprite.baseY + lift;

  ctx.save();
  if (front) {
    const sliceTop = tree.baseY - tree.size * 0.25;
    ctx.beginPath();
    ctx.rect(tree.x - tree.size * 0.55, sliceTop, tree.size * 1.1, tree.size * 0.32);
    ctx.clip();
    ctx.globalAlpha *= 0.92;
  }
  ctx.drawImage(sprite.canvas, dx, dy);
  ctx.restore();
}

export function drawRoomTrees(ctx, {
  world,
  cell,
  W,
  H,
  seed = 0,
  time = 0,
  light = 1,
  weather = 'clear',
  layer = 'back',
  details = 2,
  scale = 1,
  onlyTreeId = null,
} = {}) {
  if (!ctx || details <= 0 || !world || !cell || world.isDojangTutorial || world.biome === 'dojang') return;
  const trees = getPlan(world, cell, seed);
  if (!trees.length) return;

  const palette = PALETTES[seasonFor(world)] || PALETTES.summer;
  const weatherGust = details >= 2 && ['raining', 'drizzle', 'snowing', 'fall', 'blossom'].includes(weather)
    ? 0.18
    : 0;
  // Wind belongs to the world, with a deterministic room variation. Weather
  // adds only a small gust so the authored world personality remains visible.
  const wind = Math.min(1.25, getRoomWind(world, cell, seed) + weatherGust);
  const clampedLight = Math.max(0, Math.min(1, light));
  const treeScale = Number.isFinite(scale) ? Math.max(0.1, scale) : 1;

  ctx.save();
  // Day/night already has a dedicated overlay canvas. A small alpha shift is
  // much cheaper than applying a per-frame CSS filter to every tree bitmap.
  ctx.globalAlpha = clampedLight < 0.35 ? 0.86 : 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.rect(0, H * 0.13, W, H * 0.80);
  ctx.clip();

  for (const planTree of trees) {
    if (onlyTreeId !== null && String(planTree.treeId) !== String(onlyTreeId)) continue;
    const tree = {
      ...planTree,
      x: planTree.x * W,
      baseY: planTree.base * H,
      // Keep the baseline anchored, but let presentation-only views such as
      // the trailer shrink the full landmark around that baseline.
      size: planTree.size * H * treeScale,
    };
    const sprite = getTreeSprite(tree, palette);
    if (sprite) {
      drawTreeSprite(ctx, sprite, tree, {
        time,
        wind,
        details,
        front: layer === 'front',
      });
    } else if (layer === 'front') {
      // Non-browser fallback used by tests and very old environments.
      drawFrontSlice(ctx, tree, palette, time, wind, clampedLight);
    } else {
      drawSingleTree(ctx, tree, palette, time, wind, clampedLight);
    }
  }
  ctx.restore();
}
