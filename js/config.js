// ============================================================
//  Fight On A Baseplate — game configuration
//  Everything tweakable lives here: keys, teams, items, prices.
// ============================================================

// Supabase (Realtime only — no tables needed). Anon/public key is safe in the browser.
export const SUPABASE_URL = 'https://peztvgqqsffcztdfqchx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlenR2Z3Fxc2ZmY3p0ZGZxY2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1MTIyOTEsImV4cCI6MjExMTA4ODI5MX0.jSOjHRIFnxLFZgnlTQRJKFEBjm3ybPrP9CD02a_0rsw';

export const VERSION = '4.0';

// One block = 3 world units. Cell (gx,gy,gz) spans
// x: gx*3-1.5..gx*3+1.5, y: gy*3-3..gy*3, z: gz*3-1.5..gz*3+1.5
// Island surface is the top of gy=0 (y=0).
export const B = 3;

export const TEAMS = {
  blue:   { name:'Blue',   color:0x2f8cff, css:'#2f8cff', cx:0,   cz:34,  fx:0,  fz:-1 },
  red:    { name:'Red',    color:0xef4444, css:'#ef4444', cx:0,   cz:-34, fx:0,  fz:1  },
  green:  { name:'Green',  color:0x34c759, css:'#34c759', cx:34,  cz:0,   fx:-1, fz:0  },
  yellow: { name:'Yellow', color:0xffcc1f, css:'#ffcc1f', cx:-34, cz:0,   fx:1,  fz:0  },
};
export const TEAM_KEYS = ['blue','red','green','yellow'];

export const PHYS = {
  gravity: 66,
  jump: 21,
  walk: 15.5,
  halfW: 0.85,
  height: 5,
  voidY: -38,
};

export const COMBAT = {
  reach: 7.6,          // melee reach (world units, horizontal)
  coneCos: 0.45,       // how wide the melee cone is (cos of half-angle)
  cooldown: 330,       // ms between swings
  kb: 19,              // horizontal knockback speed
  kbUp: 10.5,          // upward knockback speed
  regenDelay: 5000,    // ms out of combat before natural regen
  regenRate: 3,        // hp per second
  respawn: 5000,       // ms
  spawnProtect: 2000,  // ms of invulnerability after respawn
  fallSafe: 13.5,      // can fall 4.5 blocks safely
  fallDmg: 2.6,        // hp per unit fallen past that
  placeReach: 15,
  mineReach: 15,
};

// ---------- ITEMS ----------
// type: block | sword | pickaxe | bow | ammo | throw | food | potion
export const ITEMS = {
  wool:          { name:'Wool',          icon:'🧶', type:'block', block:'wool', stack:64 },
  planks:        { name:'Wood Planks',   icon:'🪵', type:'block', block:'planks', stack:64 },
  stone_brick:   { name:'Stone Brick',   icon:'🧱', type:'block', block:'stone_brick', stack:64 },
  obsidian:      { name:'Obsidian',      icon:'🟪', type:'block', block:'obsidian', stack:64 },

  wood_sword:    { name:'Wood Sword',    icon:'🗡️', type:'sword', tier:0, dmg:12, color:0x9c6b3d },
  stone_sword:   { name:'Stone Sword',   icon:'🗡️', type:'sword', tier:1, dmg:16, color:0x8d8d8d },
  iron_sword:    { name:'Iron Sword',    icon:'⚔️', type:'sword', tier:2, dmg:21, color:0xe6e6e6 },
  diamond_sword: { name:'Diamond Sword', icon:'💎', type:'sword', tier:3, dmg:28, color:0x5ee8ff },
  emerald_sword: { name:'Emerald Sword', icon:'💚', type:'sword', tier:4, dmg:35, color:0x39ff88 },

  shears:    { name:'Shears',  icon:'✂️', type:'shears', stack:1 },
  axe:       { name:'Axe',     icon:'🪓', type:'axe', stack:1, color:0x8d8d8d },
  wood_pickaxe:    { name:'Wood Pickaxe',    icon:'⛏️', type:'pickaxe', tier:1, speed:1.5, color:0x9c6b3d },
  stone_pickaxe:   { name:'Stone Pickaxe',   icon:'⛏️', type:'pickaxe', tier:2, speed:2.0, color:0x8d8d8d },
  iron_pickaxe:    { name:'Iron Pickaxe',    icon:'⛏️', type:'pickaxe', tier:3, speed:2.7, color:0xe6e6e6 },
  diamond_pickaxe: { name:'Diamond Pickaxe', icon:'⛏️', type:'pickaxe', tier:4, speed:3.6, color:0x5ee8ff },

  bow:       { name:'Bow',          icon:'🏹', type:'bow', stack:1 },
  arrow:     { name:'Arrow',        icon:'➶',  type:'ammo', stack:64 },
  fireball:  { name:'Fireball',     icon:'🔥', type:'throw', stack:16 },
  tnt:       { name:'TNT',          icon:'🧨', type:'throw', stack:16 },
  telepearl: { name:'Telepearl',    icon:'🔮', type:'throw', stack:8 },
  balloon:   { name:'Balloon',      icon:'🎈', type:'balloon', stack:3 },
  gapple:    { name:'Golden Apple', icon:'🍏', type:'food', stack:16, heal:40 },
  speed_pot: { name:'Speed Potion', icon:'🧪', type:'potion', stack:4, effect:'speed', dur:30000 },
  jump_pot:  { name:'Jump Potion',  icon:'🫧', type:'potion', stack:4, effect:'jump', dur:30000 },
};

export const ARMOR = [
  { name:'Leather', color:0x9a5b34, mult:1.00 },
  { name:'Iron',    color:0xc9d1d8, mult:0.80 },
  { name:'Diamond', color:0x5ee8ff, mult:0.64 },
  { name:'Emerald', color:0x39ff88, mult:0.52 },
];

// Block types placed in the world.
// hard = ms to break by hand. blast: which explosions break it.
export const BLOCKS = {
  ground:      { hard:Infinity, unbreakable:true },
  stone:       { hard:Infinity, unbreakable:true },
  wool:        { hard:420,  blast:['fireball','tnt'] },
  planks:      { hard:1100, blast:['fireball','tnt'] },
  stone_brick: { hard:1900, blast:['tnt'] },
  obsidian:    { hard:7500, blast:[] },
  bed:         { hard:1700, blast:[] },
};

// ---------- SHOP ----------
// cost: [currency, amount]. give: item id + count, or armor tier.
export const SHOP = [
  { cat:'Blocks', icon:'🧱', items:[
    { id:'wool',        n:16, cost:['iron',8] },
    { id:'planks',      n:12, cost:['gold',4] },
    { id:'stone_brick', n:12, cost:['iron',24] },
    { id:'obsidian',    n:4,  cost:['emerald',4] },
  ]},
  { cat:'Combat', icon:'⚔️', items:[
    { id:'stone_sword',   n:1, cost:['iron',20] },
    { id:'iron_sword',    n:1, cost:['gold',8] },
    { id:'diamond_sword', n:1, cost:['emerald',4] },
    { id:'emerald_sword', n:1, cost:['emerald',12] },
  ]},
  { cat:'Armor', icon:'🛡️', items:[
    { armor:1, cost:['gold',12] },
    { armor:2, cost:['emerald',6] },
    { armor:3, cost:['emerald',16] },
  ]},
  { cat:'Tools', icon:'⛏️', items:[
    { id:'wood_pickaxe',    n:1, cost:['iron',10] },
    { id:'stone_pickaxe',   n:1, cost:['iron',20] },
    { id:'iron_pickaxe',    n:1, cost:['gold',6] },
    { id:'diamond_pickaxe', n:1, cost:['emerald',3] },
    { id:'shears', n:1, cost:['iron',20] },
    { id:'axe',    n:1, cost:['iron',12] },
  ]},
  { cat:'Ranged', icon:'🏹', items:[
    { id:'bow',   n:1, cost:['gold',12] },
    { id:'arrow', n:8, cost:['gold',2] },
  ]},
  { cat:'Utility', icon:'🧪', items:[
    { id:'gapple',    n:1, cost:['gold',3] },
    { id:'balloon',   n:3, cost:['gold',6] },
    { id:'fireball',  n:1, cost:['iron',40] },
    { id:'tnt',       n:1, cost:['gold',6] },
    { id:'telepearl', n:1, cost:['emerald',4] },
    { id:'speed_pot', n:1, cost:['emerald',1] },
    { id:'jump_pot',  n:1, cost:['emerald',1] },
  ]},
];

export const CURRENCY = {
  iron:    { name:'Iron',     icon:'⬜', css:'#e8e8e8' },
  gold:    { name:'Gold',     icon:'🟨', css:'#ffd34e' },
  diamond: { name:'Diamonds', icon:'💎', css:'#62e7ff' },
  emerald: { name:'Emeralds', icon:'🟩', css:'#58ff8b' },
};

// ---------- TEAM UPGRADES (paid with diamonds) ----------
export const UPGRADES = {
  sharp: { name:'Sharpened Swords', icon:'⚔️', costs:[4,8,12], desc:l=>`+${(l + 1) * 3} sword damage for the whole team` },
  prot:  { name:'Protection',       icon:'🛡️', costs:[2,4,8],  desc:l=>`Team takes ${[8,15,22][l]}% less damage` },
  haste: { name:'Mining Haste',     icon:'⛏️', costs:[2,4],    desc:l=>`Team mines ${[25,50][l]}% faster` },
  forge: { name:'Forge',            icon:'🔥', costs:[2,4,6],  desc:l=>['Iron & gold +50% faster','Iron & gold +100% faster','Generator also drops emeralds'][l] },
  heal:  { name:'Heal Pool',        icon:'💚', costs:[1],      desc:l=>'Regeneration while on your island' },
  trap:  { name:'Alarm Trap',       icon:'🚨', costs:[1],      desc:l=>'Warns you and slows the first enemy who enters your base', rebuy:true },
};
export const PROT_MULT = [1, 0.92, 0.85, 0.78];

// ---------- GENERATORS ----------
export const GEN = {
  ironEvery: 1100, goldEvery: 6500, ironCap: 48, goldCap: 12,
  diamondEvery: [26000, 19000, 13000], diamondCap: 5,   // per tier (I, II, III)
  emeraldEvery: [45000, 34000, 24000], emeraldCap: 4,
  pickupRange: 5.5,
};

// Match timeline (seconds after the start)
export const TIMELINE = [
  { at: 300, tier: 1, title: 'DIAMOND II  •  EMERALD II', sub: 'Generators are faster!' },
  { at: 600, tier: 2, title: 'DIAMOND III  •  EMERALD III', sub: 'Generators are at max speed!' },
  { at: 840, warn: true, title: 'SUDDEN DEATH IN 60s', sub: 'All beds will be destroyed!' },
  { at: 900, sudden: true, title: 'SUDDEN DEATH', sub: 'All beds destroyed — last team standing wins!' },
];

// ---------- KITS ----------
// price in coins (no level needed — lvl is always 1). These ids/prices must match supabase/setup.sql.
export const KITS = {
  default: { name: 'Default', icon: '🙂', price: 0,    lvl: 1,   desc: 'No ability. Pure skill.' },
  builder: { name: 'Builder', icon: '🧱', price: 0,    lvl: 1,   desc: '+16 wool every spawn and places blocks faster.' },
  archer:  { name: 'Archer',  icon: '🏹', price: 400,  lvl: 1,   desc: 'Spawns with a bow + 8 arrows. Arrows deal +25% damage.' },
  miner:   { name: 'Miner',   icon: '⛏️', price: 400,  lvl: 1,   desc: 'Spawns with a pickaxe and mines 40% faster.' },
  medic:   { name: 'Medic',   icon: '💉', price: 700,  lvl: 1,   desc: 'Health regenerates sooner and twice as fast.' },
  tank:    { name: 'Tank',    icon: '🛡️', price: 900,  lvl: 1,   desc: '130 max health, but 10% slower.' },
  bomber:  { name: 'Bomber',  icon: '💣', price: 1200, lvl: 1,   desc: 'Starts with a fireball. Your own explosions never hurt you.' },
  ninja:   { name: 'Ninja',   icon: '🥷', price: 1500, lvl: 1,  desc: '12% faster and takes 60% less fall damage.' },
  vampire: { name: 'Vampire', icon: '🧛', price: 2200, lvl: 1,  desc: 'Heals 3 health every time your sword hits.' },
};
export const levelNeed = (l) => 100 + (l - 1) * 40; // XP to go from level l to l+1

// ---------- COSMETICS (bought with coins; ids/prices must match supabase/setup.sql) ----------
// kind: skin | bed | kill | name | emote
export const COSMETICS = {
  skin_default:  { kind:'skin', name:'No Hat',        icon:'🙂', price:0 },
  skin_cap:      { kind:'skin', name:'Baseball Cap',  icon:'🧢', price:150 },
  skin_ninja:    { kind:'skin', name:'Ninja Band',    icon:'🥷', price:300 },
  skin_wizard:   { kind:'skin', name:'Wizard Hat',    icon:'🧙', price:400 },
  skin_viking:   { kind:'skin', name:'Viking Helmet', icon:'🪖', price:500 },
  skin_knight:   { kind:'skin', name:'Knight Helmet', icon:'⚔️', price:600 },
  skin_robot:    { kind:'skin', name:'Robot Head',    icon:'🤖', price:800 },
  skin_crown:    { kind:'skin', name:'Royal Crown',   icon:'👑', price:1000 },
  skin_halo:     { kind:'skin', name:'Halo',          icon:'😇', price:1200 },

  bed_default:   { kind:'bed', name:'Team Bed',       icon:'🛏️', price:0 },
  bed_striped:   { kind:'bed', name:'Striped',        icon:'🦓', price:200 },
  bed_candy:     { kind:'bed', name:'Candy',          icon:'🍬', price:400 },
  bed_checker:   { kind:'bed', name:'Checkerboard',   icon:'🏁', price:250 },
  bed_royal:     { kind:'bed', name:'Royal Gold',     icon:'👑', price:600 },
  bed_lava:      { kind:'bed', name:'Lava',           icon:'🌋', price:700 },
  bed_space:     { kind:'bed', name:'Galaxy',         icon:'🌌', price:800 },

  kill_default:  { kind:'kill', name:'Poof',          icon:'💨', price:0 },
  kill_hearts:   { kind:'kill', name:'Hearts',        icon:'💖', price:300 },
  kill_fireworks:{ kind:'kill', name:'Fireworks',     icon:'🎆', price:300 },
  kill_coins:    { kind:'kill', name:'Coin Shower',   icon:'🪙', price:400 },
  kill_lightning:{ kind:'kill', name:'Lightning',     icon:'⚡', price:500 },
  kill_ghost:    { kind:'kill', name:'Ghost',         icon:'👻', price:500 },
  kill_rainbow:  { kind:'kill', name:'Rainbow',       icon:'🌈', price:700 },

  name_white:    { kind:'name', name:'White',         icon:'⚪', price:0,   color:'#ffffff' },
  name_cyan:     { kind:'name', name:'Ice Blue',      icon:'🔵', price:200, color:'#62e7ff' },
  name_pink:     { kind:'name', name:'Bubblegum',     icon:'🩷', price:200, color:'#ff7ad9' },
  name_red:      { kind:'name', name:'Crimson',       icon:'🔴', price:200, color:'#ff5252' },
  name_purple:   { kind:'name', name:'Royal Purple',  icon:'🟣', price:250, color:'#b47dff' },
  name_gold:     { kind:'name', name:'Gold',          icon:'🟡', price:300, color:'#ffd34e' },
  name_rainbow:  { kind:'name', name:'Rainbow',       icon:'🌈', price:1000, color:'rainbow' },

  emote_wave:    { kind:'emote', name:'Wave',         icon:'👋', price:0 },
  emote_cheer:   { kind:'emote', name:'Cheer',        icon:'🙌', price:0 },
  emote_sit:     { kind:'emote', name:'Sit',          icon:'🪑', price:150 },
  emote_bow:     { kind:'emote', name:'Bow',          icon:'🙇', price:150 },
  emote_laugh:   { kind:'emote', name:'Laugh',        icon:'😂', price:200 },
  emote_dance:   { kind:'emote', name:'Dance',        icon:'🕺', price:250 },
  emote_flex:    { kind:'emote', name:'Flex',         icon:'💪', price:300 },
  emote_spin:    { kind:'emote', name:'Spin',         icon:'🌀', price:300 },
};
export const FREE_COSMETICS = Object.keys(COSMETICS).filter(k => COSMETICS[k].price === 0);
export const DEFAULT_LOOK = { skin:'skin_default', bed:'bed_default', kill:'kill_default', name:'name_white' };

// ---------- MAPS ----------
// dist = how far bases are from the middle (in blocks). theme = textures + sky.
export const MAPS = {
  classic: { name:'Classic Islands', icon:'🌳', dist:34, mid:5, diamond:18, pillars:'corners',
    theme:{ top:'grass', side:'grassSide', under:'dirt', midTop:'stone', sky:[0x2b74e0,0xbfe0ff,0x7fa9d6], fog:0xbfe0ff, sun:0xfff3dd, hemi:[0xdff1ff,0x5a6a52], clouds:0xffffff } },
  frost:   { name:'Frostbite',       icon:'❄️', dist:30, mid:6, diamond:16, pillars:'ring',
    theme:{ top:'snow', side:'snowSide', under:'ice', midTop:'ice', sky:[0x7fb6e8,0xeaf6ff,0xc9def0], fog:0xe4f1fb, sun:0xffffff, hemi:[0xf2f8ff,0x8aa0b5], clouds:0xffffff, snow:true } },
  desert:  { name:'Desert Ruins',    icon:'🏜️', dist:37, mid:6, diamond:19, pillars:'ruins',
    theme:{ top:'sand', side:'sandSide', under:'sandstone', midTop:'sandstone', sky:[0x3d8ce0,0xffe2b0,0xd9a873], fog:0xf6dcae, sun:0xfff0c8, hemi:[0xfff2d8,0x8a6b45], clouds:0xfff8ee } },
  nether:  { name:'Nether',          icon:'🔥', dist:32, mid:5, diamond:17, pillars:'spikes',
    theme:{ top:'netherrack', side:'netherrack', under:'netherrack', midTop:'netherbrick', sky:[0x1a0505,0x5a1408,0x2a0503], fog:0x4a1206, sun:0xffb080, hemi:[0xff9a70,0x2a0a05], clouds:null, lava:true } },
};
export const MAP_KEYS = Object.keys(MAPS);

// ---------- RANKED ----------
export const RANKS = [
  { name:'Bronze',   min:0,    color:'#cd7f32', icon:'🥉' },
  { name:'Silver',   min:1100, color:'#c0c8d2', icon:'🥈' },
  { name:'Gold',     min:1250, color:'#ffd34e', icon:'🥇' },
  { name:'Platinum', min:1400, color:'#62e7ff', icon:'💠' },
  { name:'Diamond',  min:1550, color:'#b47dff', icon:'💎' },
];
export const rankOf = (r) => { let k = RANKS[0]; for (const x of RANKS) if (r >= x.min) k = x; return k; };

export const TIPS = [
  'Crouch (Shift) to stop yourself falling off edges while bridging.',
  'Hold the mouse to charge your bow — full power does 4× the damage.',
  'Balloons only lift you with all 3. Archers can pop them!',
  'Cover your bed with wool, then wood, then stone brick for a strong defence.',
  'Diamond and emerald generators speed up at 5 and 10 minutes.',
  'Sudden Death destroys every bed at 15:00 — be ready.',
  'Shears break wool almost instantly. An axe chews through wood.',
  'Land hits in a row for combo knockback.',
  'Press X to open the emote wheel.',
  'Hard bots give 1.6× XP, multiplayer gives 1.3×.',
  'Ranked matches move your rating up or down — climb from Bronze to Diamond!',
  'Fireball jumping: shoot a fireball at your feet to launch yourself.',
];

export const BOT_NAMES = ['Rex','Nova','Blaze','Pixel','Turbo','Echo','Viper','Frost','Bolt','Mochi','Zed','Kiwi','Orbit','Rook','Juno','Dash'];
export const BOT_DIFF = {
  easy:   { label:'Easy',   speed:0.78, react:520, hit:0.55, cd:700, bridge:420, aggro:20 },
  normal: { label:'Normal', speed:0.9,  react:330, hit:0.75, cd:480, bridge:280, aggro:26 },
  hard:   { label:'Hard',   speed:1.0,  react:180, hit:0.92, cd:360, bridge:190, aggro:34 },
};
