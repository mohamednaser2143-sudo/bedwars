// ============================================================
//  Fight On A Baseplate — game configuration
//  Everything tweakable lives here: keys, teams, items, prices.
// ============================================================

// Supabase (Realtime only — no tables needed). Anon/public key is safe in the browser.
export const SUPABASE_URL = 'https://xqftxszpozrpuzhsnyho.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZnR4c3pwb3pycHV6aHNueWhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNTY0MTcsImV4cCI6MjEwNzYzMjQxN30.JZQ7DkEmvGomqSsmrATG1Kwus_mxMksMbW7dJvh-VM4';

export const VERSION = '2.0 Stage 1';

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
  voidY: -30,
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

  wood_pickaxe:    { name:'Wood Pickaxe',    icon:'⛏️', type:'pickaxe', tier:1, speed:1.5, color:0x9c6b3d },
  stone_pickaxe:   { name:'Stone Pickaxe',   icon:'⛏️', type:'pickaxe', tier:2, speed:2.0, color:0x8d8d8d },
  iron_pickaxe:    { name:'Iron Pickaxe',    icon:'⛏️', type:'pickaxe', tier:3, speed:2.7, color:0xe6e6e6 },
  diamond_pickaxe: { name:'Diamond Pickaxe', icon:'⛏️', type:'pickaxe', tier:4, speed:3.6, color:0x5ee8ff },

  bow:       { name:'Bow',          icon:'🏹', type:'bow', stack:1 },
  arrow:     { name:'Arrow',        icon:'➶',  type:'ammo', stack:64 },
  fireball:  { name:'Fireball',     icon:'🔥', type:'throw', stack:16 },
  tnt:       { name:'TNT',          icon:'🧨', type:'throw', stack:16 },
  telepearl: { name:'Telepearl',    icon:'🔮', type:'throw', stack:8 },
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
  ]},
  { cat:'Ranged', icon:'🏹', items:[
    { id:'bow',   n:1, cost:['gold',12] },
    { id:'arrow', n:8, cost:['gold',2] },
  ]},
  { cat:'Utility', icon:'🧪', items:[
    { id:'gapple',    n:1, cost:['gold',3] },
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
  sharp: { name:'Sharpened Swords', icon:'⚔️', costs:[4],      desc:l=>'+3 sword damage for the whole team' },
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
  diamondEvery: 26000, diamondCap: 4,
  emeraldEvery: 45000, emeraldCap: 3,
  pickupRange: 5.5,
};

export const BOT_NAMES = ['Rex','Nova','Blaze','Pixel','Turbo','Echo','Viper','Frost','Bolt','Mochi','Zed','Kiwi','Orbit','Rook','Juno','Dash'];
export const BOT_DIFF = {
  easy:   { label:'Easy',   speed:0.78, react:520, hit:0.55, cd:700, bridge:420, aggro:20 },
  normal: { label:'Normal', speed:0.9,  react:330, hit:0.75, cd:480, bridge:280, aggro:26 },
  hard:   { label:'Hard',   speed:1.0,  react:180, hit:0.92, cd:360, bridge:190, aggro:34 },
};
