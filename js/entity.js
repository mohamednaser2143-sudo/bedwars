import { THREE } from './engine.js';
import { G } from './state.js';
import { Avatar } from './avatar.js';
import { ITEMS } from './config.js';

// ---------- INVENTORY ----------
// 36 slots: 0-8 = hotbar, 9-35 = backpack. Currency is separate (res).
export class Inventory {
  constructor() { this.slots = new Array(36).fill(null); this.res = { iron: 0, gold: 0, diamond: 0, emerald: 0 }; }
  count(id) { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.n; return n; }
  has(id) { return this.count(id) > 0; }
  find(pred) { return this.slots.findIndex(s => s && pred(s, ITEMS[s.id])); }
  add(id, n = 1) {
    const def = ITEMS[id]; const max = def?.stack || 1;
    // swords and pickaxes replace the lower tier in the same slot
    if (def && (def.type === 'sword' || def.type === 'pickaxe')) {
      const i = this.find((s, d) => d?.type === def.type);
      if (i >= 0) { this.slots[i] = { id, n: 1 }; return true; }
    }
    for (const s of this.slots) if (s && s.id === id && s.n < max) { const take = Math.min(n, max - s.n); s.n += take; n -= take; if (!n) return true; }
    while (n > 0) {
      const i = this.slots.findIndex(s => !s); if (i < 0) return false;
      const take = Math.min(n, max); this.slots[i] = { id, n: take }; n -= take;
    }
    return true;
  }
  remove(id, n = 1) {
    for (let i = 35; i >= 0 && n > 0; i--) { const s = this.slots[i]; if (s && s.id === id) { const t = Math.min(n, s.n); s.n -= t; n -= t; if (!s.n) this.slots[i] = null; } }
    return n === 0;
  }
  takeFromSlot(i, n = 1) { const s = this.slots[i]; if (!s) return false; s.n -= n; if (s.n <= 0) this.slots[i] = null; return true; }
  best(type) { let b = null; for (const s of this.slots) { const d = s && ITEMS[s.id]; if (d && d.type === type && (!b || d.tier > ITEMS[b].tier)) b = s.id; } return b; }
  firstBlock() { const i = this.find((s, d) => d?.type === 'block'); return i; }
  swap(a, b) { const t = this.slots[a]; this.slots[a] = this.slots[b]; this.slots[b] = t; }
  clear() { this.slots.fill(null); for (const k in this.res) this.res[k] = 0; }
}

// ---------- ENTITY ----------
// kind: 'local' (you), 'bot' (simulated here), 'remote' (another player or someone else's bot)
export class Entity {
  constructor({ id, name, team, kind }) {
    this.id = id; this.name = name; this.team = team; this.kind = kind;
    this.avatar = new Avatar({ team, name: kind === 'local' ? '' : name });
    this.pos = this.avatar.group.position;
    this.vel = new THREE.Vector3(); this.kb = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.onGround = false;
    this.hp = 100; this.maxHp = 100; this.kit = 'default'; this.dead = false; this.finalDead = false; this.respawnAt = 0;
    this.armor = 0; this.held = null; this.atkSeq = 0; this.lastSwing = 0;
    this.inv = new Inventory();
    this.lastHurt = 0; this.lastHit = null; this.invulnUntil = 0;
    this.effects = { speed: 0, jump: 0, slow: 0 };
    this.stats = { kills: 0, finals: 0, beds: 0, deaths: 0 };
    this.target = new THREE.Vector3(); this.targetYaw = 0; // remote interpolation
    this.connected = true;
  }
  get alive() { return !this.dead && !this.finalDead; }
  center() { return new THREE.Vector3(this.pos.x, this.pos.y + 2.6, this.pos.z); }
  forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  setVisible(v) { this.avatar.group.visible = v; }
  addToWorld() { G.world.add(this.avatar.group); G.entities.set(this.id, this); }
  removeFromWorld() { if (this.avatar.group.parent) this.avatar.group.parent.remove(this.avatar.group); G.entities.delete(this.id); }
  heldItem() { return this.kind === 'local' ? this.inv.slots[G.selected]?.id || null : this.held; }
}
