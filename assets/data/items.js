/* ================================================================
   ITEMS - consumables, permanents, shop catalog
================================================================ */

export function formatKoreanNumber(num) {
  if (num < 10000) return num.toLocaleString();
  
  const units = [
    { name: '만', value: 10000 },
    { name: '억', value: 100000000 },
    { name: '조', value: 1000000000000 },
    { name: '경', value: 10000000000000000 },
    { name: '해', value: 100000000000000000000 },
    { name: '자', value: 1000000000000000000000000 },
    { name: '양', value: 10000000000000000000000000000 },
    { name: '구', value: 100000000000000000000000000000000 },
  ];
  
  // Find the appropriate unit
  for (let i = units.length - 1; i >= 0; i--) {
    if (num >= units[i].value) {
      const quotient = num / units[i].value;
      // For 구 and above, show full number
      if (i === units.length - 1) {
        return Math.floor(quotient).toLocaleString('ko-KR') + units[i].name;
      }
      // For other units, round down to nearest integer (no decimals for cleaner display)
      return Math.floor(quotient) + units[i].name;
    }
  }
  return num.toLocaleString();
}

export const POWERUP_DEFS = {
  '❤️‍🩹': { id:'heal',       rarity:0.18, cooldown: 0  },
  '💛':    { id:'maxheal',    rarity:0.08, cooldown: 0  },
  '⚡':    { id:'stun',       rarity:0.15, cooldown: 8  },
  '🔥':    { id:'crit',       rarity:0.12, cooldown: 10 },
  '⏱️':   { id:'slow',       rarity:0.12, cooldown: 15 },
  '🎯':    { id:'autokill',   rarity:0.09, cooldown: 12 },
  '⏰':    { id:'freeze',     rarity:0.06, cooldown: 20 },
  '🎁':    { id:'double',     rarity:0.05, cooldown: 30 },
  '🎲':    { id:'mystery',    rarity:0.02, cooldown: 3  },
  '⚔️':   { id:'cleave',     rarity:0.01, cooldown: 0  },
  '💣':    { id:'bomb',       rarity:0.03, cooldown: 5  },
  '🛡️':   { id:'shield',     rarity:0.05, cooldown: 0  },
  '📙':    { id:'dictionary', rarity:0.02, cooldown: 0  },
  '🔑':    { id:'masterkey',  rarity:0.02, cooldown: 0  },
  '🏯':    { id:'worldskip',  rarity:0.01, cooldown: 0  },
  '🔇':    { id:'noise',      rarity:0.04, cooldown: 0  },
  '🤑':    { id:'greedy',     rarity:0.05, cooldown: 20 },
  '🕳️':   { id:'wormhole',   rarity:0.02, cooldown: 0  },
  '⛺':    { id:'tent',       rarity:0.03, cooldown: 0  },
  '📖':    { id:'worldguide', rarity:0,    cooldown: 0  },
};
export const POWERUP_KEYS = Object.keys(POWERUP_DEFS);

/* ================================================================
   RUN MODIFIERS - permanent upgrades that persist for the current run
================================================================ */
export const PERMANENTS = [
  { id: 'block',         emoji: '🛡️', onAcquire: (G) => { G.run.blockChance = true; } },
  { id: 'lucky',         emoji: '🍀', onAcquire: (G) => { G.run.dropMult = (G.run.dropMult || 1) * 2; } },
  { id: 'thorn_armor',   emoji: '🌵', onAcquire: (G) => { G.run.halfDamage = true; } },
  { id: 'treasure',      emoji: '💰', onAcquire: (G) => { G.run.treasurePerk = true; } },
  { id: 'double_shot',   emoji: '🏹', onAcquire: (G) => { G.run.doubleShot = true; } },
  { id: 'ancient_scroll',emoji: '📜', onAcquire: (G) => { G.run.scrollPerk = true; } },
  { id: 'sloth',         emoji: '⏳', onAcquire: (G) => { G.run.slothPerk = true; } },
  { id: 'phoenix_heart', emoji: '❤️‍🔥', onAcquire: (G) => {
    G.run.phoenixHeart = true;
    G.playerHP = Math.min(G.playerMax, G.playerHP + 1);
  } },
  { id: 'magnet',        emoji: '🧲', onAcquire: (G) => { G.run.coinMult = (G.run.coinMult || 1) * 3; } },
  { id: 'dummy_turtle',  emoji: '🐢', onAcquire: (G) => { G.run.dummyTurtle = true; } },
  { id: 'god_run',       emoji: '🪷', onAcquire: (G) => { G.run.godRunActive = true; } },
  { id: 'crystal_ball',  emoji: '🔮', onAcquire: (G) => { G.run.mapRevealed = true; } },
  { id: 'wall_breaker',  emoji: '⛏️', onAcquire: (G) => { G.run.wallBreaker = true; } },
  { id: 'punching_glove',emoji: '🥊', onAcquire: (G) => { G.run.punchingGlove = true; } },
];

/* ================================================================
   SHOP GENERATION
   Always: heal, dictionary, slow
   50%: master key
   Worlds 1–5: dummy_turtle (if not owned)
   Rest: random pool scaled by world
================================================================ */
export function generateShopInventory(G, worldIdx) {
  const items = [];
  const ownedPerms = new Set(G.run?.permanents || []);

  function mkCon(key, p) { return { type: 'consumable', itemKey: key, price: p, basePrice: p }; }
  function mkMod(id,  p) { return { type: 'modifier',   permId:  id,  price: p, basePrice: p }; }

  // Always-present consumables
  items.push(mkCon('❤️‍🩹', _wPrice(worldIdx, 200)));
  items.push(mkCon('📙',    _wPrice(worldIdx, 100)));
  items.push(mkCon('⏱️',   _wPrice(worldIdx, 500)));
  items.push(mkCon('📖',   300)); // World Guide - flat price, no world scaling
  // Tent: always available in worlds with a day/night cycle
  if (!G.dungeon?.worldDef?.fixedLighting) items.push(mkCon('⛺', _wPrice(worldIdx, 350)));

  // 20% chance for master key
  if (Math.random() < 0.2) {
    items.push(mkCon('🔑', _wPrice(worldIdx, 900)));
  }

  // Dummy Turtle in worlds 1–5 (beginner item, only when relevant)
  if (worldIdx <= 4 && !ownedPerms.has('dummy_turtle')) {
    items.push(mkMod('dummy_turtle', _wPrice(worldIdx, 600)));
  }

  // Random pool
  const allCons = ['💛','⚡','🔥','🎯','⏰','🎁','💣','🛡️','⚔️','🔇','🤑','🕳️','🏯'];
  const allMods = ['block','lucky','thorn_armor','treasure','double_shot','ancient_scroll','sloth',
                   'phoenix_heart','magnet','god_run','crystal_ball','wall_breaker','punching_glove'];

  const usedCons = new Set(items.filter(i => i.itemKey).map(i => i.itemKey));
  const usedMods = new Set(items.filter(i => i.permId).map(i => i.permId));

  const availCons = allCons.filter(k => !usedCons.has(k));
  const availMods = allMods.filter(id => {
    if (usedMods.has(id) || ownedPerms.has(id)) return false;
    if (id === 'wall_breaker' && worldIdx < 1) return false;
    return true;
  });

  // 2–3 random consumables
  const shuffCons = [...availCons].sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(3, shuffCons.length); i++) {
    items.push(mkCon(shuffCons[i], _conPrice(worldIdx, shuffCons[i])));
  }

  // 2–3 random modifiers
  const shuffMods = [...availMods].sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(3, shuffMods.length); i++) {
    items.push(mkMod(shuffMods[i], _modPrice(worldIdx, shuffMods[i])));
  }

  // Sort by price ascending
  return items.sort((a, b) => a.price - b.price);
}

// Price helpers
function _wPrice(worldIdx, base) {
  const mult = [1.0, 1.8, 3.5, 6.0, 10.0, 15.0, 20.0, 26.0][Math.min(worldIdx, 7)];
  return Math.round(base * mult / 10) * 10;
}

function _conPrice(worldIdx, key) {
  const bases = {
    '💛':350, '⚡':300, '🔥':400, '🎯':700, '⏰':600, '🎁':300,
    '💣':450, '🛡️':350, '⚔️':1200, '🔇':200, '🤑':300, '🕳️':700, '🏯':3000, '⛺':350, '📖':300,
  };
  return _wPrice(worldIdx, bases[key] || 300);
}

function _modPrice(worldIdx, id) {
  const bases = {
    block:800, lucky:700, thorn_armor:900, treasure:1000, double_shot:1400,
    ancient_scroll:2000, sloth:700, phoenix_heart:1400,
    magnet:1000, dummy_turtle:600, god_run:1800,
    crystal_ball:1200, wall_breaker:1800, punching_glove:1200,
  };
  return _wPrice(worldIdx, bases[id] || 800);
}

// Legacy catalog - kept empty; callers should use generateShopInventory instead
export const SHOP_CATALOG = [];

/* ================================================================
   POWERUP DROP ROLL
================================================================ */
export function rollPowerupDrop(waveNum) {
  const r = Math.random();
  let acc = 0;
  for (const [k, d] of Object.entries(POWERUP_DEFS)) {
    if (d.rarity <= 0) continue;
    acc += d.rarity;
    if (r < acc) return k;
  }
  return '❤️‍🩹';
}

/* ================================================================
   MODIFIER ROOM CHOICES - 2 consumables + 1 permanent
================================================================ */
export function rollModifierChoices(G) {
  const ownedPerms = new Set(G.run.permanents);
  const availablePerms = PERMANENTS.filter(p => !ownedPerms.has(p.id));
  const consumableKeys = POWERUP_KEYS.filter(k => POWERUP_DEFS[k].rarity > 0);
  const choices = [];
  
  const roll = Math.random();
  
  if (roll < 0.05 && availablePerms.length >= 3) {
    // 5% (1/20): 3 permanents
    for (let i = 0; i < 3 && availablePerms.length > 0; i++) {
      const idx = Math.floor(Math.random() * availablePerms.length);
      const perm = availablePerms[idx];
      choices.push({ type: 'permanent', item: perm });
      availablePerms.splice(idx, 1);
    }
  } else if (roll < 0.15 && availablePerms.length >= 2) {
    // 10% (1/10): 1 consumable + 2 permanents
    const consumKey = consumableKeys[Math.floor(Math.random() * consumableKeys.length)];
    choices.push({ type: 'consumable', itemKey: consumKey, item: POWERUP_DEFS[consumKey] });
    
    for (let i = 0; i < 2 && availablePerms.length > 0; i++) {
      const idx = Math.floor(Math.random() * availablePerms.length);
      const perm = availablePerms[idx];
      choices.push({ type: 'permanent', item: perm });
      availablePerms.splice(idx, 1);
    }
  } else if (roll < 0.65) {
    // 50% (default): 1 permanent + 2 consumables
    if (availablePerms.length) {
      const perm = availablePerms[Math.floor(Math.random() * availablePerms.length)];
      choices.push({ type: 'permanent', item: perm });
    }
    
    while (choices.length < 3 && consumableKeys.length > 0) {
      const key = consumableKeys[Math.floor(Math.random() * consumableKeys.length)];
      choices.push({ type: 'consumable', itemKey: key, item: POWERUP_DEFS[key] });
    }
  } else {
    // 35%: 3 consumables
    while (choices.length < 3 && consumableKeys.length > 0) {
      const key = consumableKeys[Math.floor(Math.random() * consumableKeys.length)];
      choices.push({ type: 'consumable', itemKey: key, item: POWERUP_DEFS[key] });
    }
  }
  
  return choices.sort(() => Math.random() - 0.5).slice(0, 3);
}
