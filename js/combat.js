// Melee, damage, deaths, projectiles and explosions.
import { THREE, mat, box, burst } from './engine.js';
import { G } from './state.js';
import { ITEMS, ARMOR, PROT_MULT, COMBAT, TEAMS, BLOCKS } from './config.js';
import { getCell, toCell, toCellY, removeCell, cellX, cellY } from './grid.js';
import { canFit } from './physics.js';
import { sfx } from './audio.js';
import { popNumber, killfeed, teamSpan, toast, bigMessage } from './ui.js';

// ---------- DAMAGE ----------
export function meleeDamage(e) {
  const id = e.heldItem(); const it = id && ITEMS[id];
  let d = it?.type === 'sword' ? it.dmg : it?.type === 'pickaxe' ? 8 : 5;
  if (it?.type === 'sword') d += 3 * (G.match?.teamUp[e.team]?.sharp || 0);
  return d;
}

// Find the enemy in front of `e` (dir = horizontal look direction).
export function meleeTarget(e, dir) {
  let best = null, bd = COMBAT.reach;
  for (const o of G.entities.values()) {
    if (o === e || !o.alive || o.team === e.team || !o.avatar.group.visible) continue;
    const dx = o.pos.x - e.pos.x, dz = o.pos.z - e.pos.z, dy = o.pos.y - e.pos.y;
    const h = Math.hypot(dx, dz); if (h > bd || Math.abs(dy) > 6) continue;
    if (h > 1.4 && (dx * dir.x + dz * dir.z) / h < COMBAT.coneCos) continue;
    best = o; bd = h;
  }
  return best;
}

// Swing (returns hit entity or null). Caller handles cooldown.
export function swing(e, dir) {
  e.lastSwing = performance.now(); e.atkSeq++; e.avatar.swing();
  const t = meleeTarget(e, dir);
  if (t && e.kit === 'vampire') e.hp = Math.min(e.maxHp, e.hp + 3);
  if (t) { dealDamage(t, meleeDamage(e), { id: e.id, name: e.name, team: e.team, x: e.pos.x, y: e.pos.y, z: e.pos.z, source: 'melee' }); if (e.kind === 'local') G.match?.shake?.(.18); }
  else if (e.kind === 'local') sfx.swing();
  return t;
}

// Route damage to whoever owns the victim.
export function dealDamage(victim, raw, src) {
  if (!victim || !victim.alive) return;
  if (victim.kind === 'local' || victim.kind === 'bot') applyHit(victim, raw, src);
  else {
    G.match?.send?.('hit', { v: victim.id, raw, src });
    // instant feedback for the attacker
    victim.avatar.flash(); victim.avatar.hitstop(.075); sfx.hit();
    popNumber(victim.pos, '-' + Math.round(raw * damageMult(victim)), '#ffd34e');
    const d = new THREE.Vector3(victim.pos.x - src.x, 0, victim.pos.z - src.z);
    if (d.lengthSq() > .01) { d.normalize(); victim.target.addScaledVector(d, .9 * (src.kb ?? 1)); }
  }
}

export function damageMult(v) { return (ARMOR[v.armor]?.mult ?? 1) * PROT_MULT[G.match?.teamUp[v.team]?.prot || 0]; }

// Apply a hit to an entity simulated on this computer.
export function applyHit(v, raw, src) {
  if (!v.alive || !G.match || G.match.over) return;
  const now = performance.now();
  if (now < v.invulnUntil) return;
  if (src.team === v.team && src.id !== v.id) return; // no friendly fire
  let dmg = Math.max(1, Math.round(raw * damageMult(v)));
  if (src.id === v.id) dmg = v.kit === 'bomber' ? 0 : Math.max(1, Math.round(dmg * .3)); // fireball jumping
  if (src.source === 'fall') dmg = Math.max(1, Math.round(raw * (v.kit === 'ninja' ? .4 : 1))); // armor doesn't help with falls
  v.hp = Math.max(0, v.hp - dmg); if (dmg > 0) v.lastHurt = now;
  if (src.id !== v.id && src.source !== 'void' && src.source !== 'fall') v.lastHit = { id: src.id, name: src.name, team: src.team, at: now };
  // combo knockback: each hit from the same attacker in quick succession pushes harder
  if (src.source === 'melee') {
    if (v.comboFrom === src.id && now - v.comboAt < 1300) v.combo = Math.min(5, (v.combo || 1) + 1); else v.combo = 1;
    v.comboFrom = src.id; v.comboAt = now;
  }
  const comboMult = src.source === 'melee' ? 1 + (v.combo - 1) * .09 : 1;
  const d = new THREE.Vector3(v.pos.x - src.x, 0, v.pos.z - src.z);
  if (d.lengthSq() > .01 && src.source !== 'fall') {
    d.normalize(); const k = (src.kb ?? 1) * comboMult;
    v.kb.x = d.x * COMBAT.kb * k; v.kb.z = d.z * COMBAT.kb * k;
    // airborne victims get less lift so combos keep them low and in reach
    const up = COMBAT.kbUp * (src.kbUp ?? (src.kb ?? 1)) * (v.onGround ? 1 : .62);
    v.vel.y = Math.max(v.vel.y * .4, up);
    v.onGround = false;
  }
  v.avatar.flash(); v.avatar.hitstop(.075);
  popNumber(v.pos, '-' + dmg, v.kind === 'local' ? '#ff6b6b' : v.combo > 2 ? '#ff9b3d' : '#ffd34e');
  if (v.kind === 'local') { sfx.hurt(); G.match.onLocalHurt?.(src.source === 'fall' ? .15 : .35); } else sfx.hit();
  if (v.hp <= 0) killEntity(v, src.source || 'melee');
}

// Fall damage: call every physics step for entities simulated here.
export function trackFall(e, wasGround) {
  if (G.mode !== 'match' || !e.alive) return;
  if (wasGround && !e.onGround) e.fallTop = e.pos.y;
  else if (!e.onGround) e.fallTop = Math.max(e.fallTop ?? e.pos.y, e.pos.y);
  else if (!wasGround && e.onGround && e.fallTop != null) {
    const drop = e.fallTop - e.pos.y; e.fallTop = null;
    if (drop > COMBAT.fallSafe) applyHit(e, (drop - COMBAT.fallSafe) * COMBAT.fallDmg, { id: 'fall', name: 'Fall', team: null, x: e.pos.x, y: e.pos.y, z: e.pos.z, source: 'fall' });
  }
}

// Death of an entity simulated here (local player or our bot). Broadcasts a kill event.
export function killEntity(v, cause) {
  if (v.dead) return;
  const now = performance.now(), m = G.match;
  v.dead = true; v.hp = 0; v.setVisible(false);
  v.vel.set(0, 0, 0); v.kb.set(0, 0, 0);
  const bedAlive = m.beds[v.team]?.alive;
  const final = !bedAlive;
  if (final) v.finalDead = true; else v.respawnAt = now + COMBAT.respawn;
  const k = v.lastHit && now - v.lastHit.at < 10000 ? v.lastHit : null;
  const ev = { victim: v.id, victimName: v.name, victimTeam: v.team, killer: k?.id || null, killerName: k?.name || null, killerTeam: k?.team || null, final, cause };
  applyDeathPenalty(v);
  onKillEvent(ev);
  m.send('kill', ev);
  burst(v.center(), TEAMS[v.team].color, 18, 12);
}

function applyDeathPenalty(v) {
  // keep armor; pickaxe drops one tier; sword back to wood; lose everything else
  const pick = v.inv.best('pickaxe');
  const order = ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe'];
  const keepPick = pick ? order[Math.max(0, order.indexOf(pick) - 1)] : null;
  const bow = v.inv.has('bow');
  v.inv.clear();
  v.inv.add('wood_sword', 1);
  if (keepPick) v.inv.add(keepPick, 1);
  if (bow) v.inv.add('bow', 1);
}

export function onKillEvent(ev) {
  const m = G.match; if (!m) return;
  const vc = TEAMS[ev.victimTeam]?.css || '#fff', kc = TEAMS[ev.killerTeam]?.css || '#fff';
  const tag = ev.final ? ' <span class="final">FINAL KILL!</span>' : '';
  const how = ev.cause === 'fall' ? (ev.killer ? 'fell to their death escaping' : 'fell from a high place') : ev.cause === 'void' ? (ev.killer ? 'was knocked into the void by' : 'fell into the void') : ev.cause === 'arrow' ? 'was shot by' : ev.cause === 'explosion' ? 'was blown up by' : 'was slain by';
  if (ev.killer) killfeed(`${teamSpan(ev.victimName, vc)} ${how} ${teamSpan(ev.killerName, kc)}${tag}`);
  else killfeed(`${teamSpan(ev.victimName, vc)} ${how}${tag}`);
  const vs = m.statFor(ev.victim, ev.victimName, ev.victimTeam); if (vs) vs.deaths++;
  if (ev.killer) { const ks = m.statFor(ev.killer, ev.killerName, ev.killerTeam); if (ks) { ks.kills++; if (ev.final) ks.finals++; } }
  if (ev.killer === G.local?.id) { sfx.kill(); if (ev.final) bigMessage('FINAL KILL', ev.victimName, '#ff5252', 1500); }
  if (ev.victim === G.local?.id) {
    sfx.death();
    m.onLocalDeath?.(ev);
  }
  const e = G.entities.get(ev.victim);
  if (e && e.kind === 'remote') { e.dead = true; e.finalDead = ev.final; e.setVisible(false); }
  m.checkElimination?.();
}

// ---------- ITEM USE (bow, throwables, food, potions) ----------
let pid = 0;
const newId = (e) => `${e.id.slice(0, 6)}${Date.now().toString(36)}${(pid++).toString(36)}`;

export function useItem(e, slot, origin, dir, power = 1) {
  const s = e.inv.slots[slot]; if (!s) return false;
  const it = ITEMS[s.id]; const now = performance.now();
  if (it.type === 'bow') {
    if (now - (e._lastBow || 0) < 250) return false;
    if (!e.inv.has('arrow')) { if (e.kind === 'local') toast('No arrows! Buy some in the shop'); return false; }
    e._lastBow = now; e.inv.remove('arrow', 1);
    power = Math.max(.15, Math.min(1, power));
    spawnProjectile({ id: newId(e), type: 'arrow', owner: e, pos: origin, vel: dir.clone().multiplyScalar(34 + 62 * power), power: power * (e.kit === 'archer' ? 1.25 : 1) });
    sfx.bow(); e.avatar.swing(); return true;
  }
  if (it.type === 'throw') {
    if (now - (e._lastThrow || 0) < 450) return false;
    e._lastThrow = now;
    if (s.id === 'fireball') spawnProjectile({ id: newId(e), type: 'fireball', owner: e, pos: origin, vel: dir.clone().multiplyScalar(38) });
    else if (s.id === 'telepearl') spawnProjectile({ id: newId(e), type: 'telepearl', owner: e, pos: origin, vel: dir.clone().multiplyScalar(48) });
    else if (s.id === 'tnt') {
      const p = e.pos.clone().addScaledVector(e.forward(), 3.5); p.y += 1;
      spawnProjectile({ id: newId(e), type: 'tnt', owner: e, pos: p, vel: new THREE.Vector3(0, 6, 0) });
      if (e.kind === 'local') toast('TNT lit — run!');
    }
    e.inv.takeFromSlot(slot, 1); e.avatar.swing(); sfx.swing(); return true;
  }
  if (it.type === 'food') {
    if (e.hp >= e.maxHp) { if (e.kind === 'local') toast('You are already at full health'); return false; }
    e.hp = Math.min(e.maxHp, e.hp + it.heal); e.inv.takeFromSlot(slot, 1); sfx.eat();
    if (e.kind === 'local') popNumber(e.pos, '+' + it.heal, '#6dff86');
    return true;
  }
  if (it.type === 'potion') {
    e.effects[it.effect] = now + it.dur; e.inv.takeFromSlot(slot, 1); sfx.eat();
    if (e.kind === 'local') toast(it.name + ' active for 30s!', 'good');
    return true;
  }
  return false;
}

// ---------- PROJECTILES ----------
const projs = new Map();
export function clearProjectiles() { for (const p of projs.values()) p.mesh.parent?.remove(p.mesh); projs.clear(); }

function projMesh(type, team) {
  if (type === 'arrow') { const g = new THREE.Group(); const s = box(.14, .14, 1.6, mat(0x8b5a2b)); const tip = box(.26, .26, .3, mat(0xcccccc)); tip.position.z = .8; const f = box(.4, .05, .3, mat(TEAMS[team]?.color ?? 0xffffff)); f.position.z = -.7; g.add(s, tip, f); return g; }
  if (type === 'fireball') { const m = new THREE.Mesh(new THREE.SphereGeometry(.8, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff7a22 })); const glow = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffb03b, transparent: true, opacity: .35 })); m.add(glow); return m; }
  if (type === 'telepearl') return new THREE.Mesh(new THREE.SphereGeometry(.45, 10, 10), mat(0x22c7b8, { emissive: 0x0a7a70 }));
  const g = new THREE.Group(); const b = box(2.6, 2.6, 2.6, mat(0xd63a2a)); const band = box(2.65, .9, 2.65, mat(0xf2f2f2)); g.add(b, band); g.userData.body = b; return g;
}

// p: {id,type,owner(Entity)|ownerInfo,pos,vel,sim}
export function spawnProjectile({ id, type, owner, pos, vel, sim = true, ownerInfo, power = 1 }) {
  if (projs.has(id)) return;
  const info = ownerInfo || { id: owner.id, name: owner.name, team: owner.team };
  const mesh = projMesh(type, info.team); mesh.position.copy(pos); G.world.add(mesh);
  const p = { id, type, owner: info, mesh, vel: vel.clone(), age: 0, sim, power, fuse: type === 'tnt' ? 3 : 0, life: type === 'arrow' ? 4 : type === 'fireball' ? 3.2 : type === 'telepearl' ? 5 : 3.5 };
  projs.set(id, p);
  if (sim) G.match?.send?.('proj', { id, type, o: info, p: [pos.x, pos.y, pos.z].map(n => +n.toFixed(2)), v: [vel.x, vel.y, vel.z].map(n => +n.toFixed(2)) });
}
export function remoteProjectile(d) {
  spawnProjectile({ id: d.id, type: d.type, ownerInfo: d.o, pos: new THREE.Vector3(...d.p), vel: new THREE.Vector3(...d.v), sim: false });
}
export function remoteProjectileEnd(d) {
  const p = projs.get(d.id); if (p) { p.mesh.parent?.remove(p.mesh); projs.delete(d.id); }
  if (d.boom) explosionFx(new THREE.Vector3(...d.at), d.boom);
}
function endProj(p, boom = null, at = null) {
  p.mesh.parent?.remove(p.mesh); projs.delete(p.id);
  if (p.sim) G.match?.send?.('projEnd', { id: p.id, boom, at: at ? [at.x, at.y, at.z].map(n => +n.toFixed(2)) : null });
}

function solidAt(v) { const c = getCell(toCell(v.x), toCellY(v.y), toCell(v.z)); if (!c) return null; const bot = toCellY(v.y) * 3 - 3; return v.y < bot + 3 * c.h ? c : null; }
function entityAt(v, owner, r = 1.4) {
  for (const e of G.entities.values()) {
    if (!e.alive || e.id === owner.id || e.team === owner.team || !e.avatar.group.visible) continue;
    if (Math.abs(v.x - e.pos.x) < r && Math.abs(v.z - e.pos.z) < r && v.y > e.pos.y - .3 && v.y < e.pos.y + 5.3) return e;
  }
  return null;
}

export function updateProjectiles(dt) {
  for (const p of [...projs.values()]) {
    p.age += dt;
    const m = p.mesh;
    if (p.type === 'tnt') {
      // falls onto the ground, then counts down
      p.vel.y -= 40 * dt; m.position.y += p.vel.y * dt;
      const below = m.position.clone(); below.y -= 1.3;
      const under = solidAt(below);
      if (under) { p.vel.y = 0; m.position.y = under.gy * 3 - 3 + 3 * under.h + 1.3; }
      p.fuse -= dt; const flash = Math.sin(p.age * (p.fuse < 1 ? 40 : 14)) > 0;
      m.userData.body.material.emissive.setHex(flash ? 0xffffff : 0); m.userData.body.material.emissiveIntensity = .55;
      if (p.fuse <= 0 && p.sim) { explode(m.position.clone(), 'tnt', p.owner); endProj(p, 'tnt', m.position); }
      else if (p.fuse < -1.5) endProj(p);
      continue;
    }
    if (p.type !== 'fireball') p.vel.y -= (p.type === 'arrow' ? 24 : 30) * dt;
    const step = p.vel.clone().multiplyScalar(dt);
    const n = Math.max(1, Math.ceil(step.length() / 0.8));
    step.divideScalar(n);
    let done = false;
    for (let i = 0; i < n && !done; i++) {
      m.position.add(step);
      if (p.type === 'arrow') m.lookAt(m.position.clone().add(p.vel));
      if (!p.sim) { if (solidAt(m.position)) { m.parent?.remove(m); projs.delete(p.id); done = true; } continue; }
      const hitE = p.type !== 'telepearl' ? entityAt(m.position, p.owner, p.type === 'fireball' ? 2 : 1.3) : null;
      const hitB = solidAt(m.position);
      if (hitE || hitB) {
        done = true;
        if (p.type === 'arrow') {
          if (hitE && p.owner.id === G.local?.id && G.match) G.match.myArrows++;
          if (hitE) dealDamage(hitE, Math.round(5 + 15 * p.power), { ...p.owner, x: m.position.x - p.vel.x * .05, y: m.position.y, z: m.position.z - p.vel.z * .05, source: 'arrow', kb: .35 + .45 * p.power, kbUp: .45 });
          endProj(p);
        } else if (p.type === 'fireball') {
          const at = m.position.clone().addScaledVector(p.vel.clone().normalize(), -1);
          explode(at, 'fireball', p.owner); endProj(p, 'fireball', at);
        } else if (p.type === 'telepearl') {
          const back = m.position.clone().addScaledVector(p.vel.clone().normalize(), -1.2);
          telepearlLand(p.owner, back); endProj(p);
        }
      }
    }
    if (!done && (p.age > p.life || m.position.y < -60)) {
      if (p.type === 'fireball' && p.sim) { explode(m.position.clone(), 'fireball', p.owner); endProj(p, 'fireball', m.position); }
      else endProj(p);
    }
  }
}

function telepearlLand(owner, at) {
  const e = G.entities.get(owner.id); if (!e || !e.alive || (e.kind !== 'local' && e.kind !== 'bot')) return;
  // find a spot that fits the player, scanning upward
  for (let dy = 0; dy < 12; dy += .5) {
    if (canFit(at.x, at.y - 2 + dy, at.z)) {
      e.pos.set(at.x, at.y - 2 + dy, at.z); e.vel.set(0, 0, 0); e.kb.set(0, 0, 0); e.fallTop = null;
      sfx.pearl(); burst(e.center(), 0x22c7b8, 16, 8);
      if (e.kind === 'local') G.match?.onLocalChanged?.();
      return;
    }
  }
}

// ---------- EXPLOSIONS ----------
const BOOM = {
  fireball: { r: 7.5, dmg: 22, kb: 1.6, kbUp: 1.5, blocks: 1 },
  tnt:      { r: 11,  dmg: 45, kb: 1.9, kbUp: 1.7, blocks: 2 },
};
function explosionFx(pos, type) {
  const cfg = BOOM[type] || BOOM.fireball;
  const s = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb13b, transparent: true, opacity: .8, depthWrite: false }));
  s.position.copy(pos); G.world.add(s);
  const t0 = performance.now();
  const tick = () => { const q = (performance.now() - t0) / 350; if (q >= 1 || !s.parent) { s.parent?.remove(s); return; } s.scale.setScalar(1 + cfg.r * q); s.material.opacity = .8 * (1 - q); requestAnimationFrame(tick); };
  tick();
  burst(pos, 0xff8a2a, 24, 18, .8); burst(pos, 0x555555, 14, 10, 1.1);
  sfx.boom();
  if (G.local && G.local.pos.distanceTo(pos) < 40) G.match?.shake?.(type === 'tnt' ? .9 : .5);
}
// Runs on the owner's computer: damages everyone in range and breaks blocks.
function explode(pos, type, owner) {
  const cfg = BOOM[type]; explosionFx(pos, type);
  for (const e of G.entities.values()) {
    if (!e.alive) continue;
    const c = e.center(); const d = c.distanceTo(pos); if (d > cfg.r) continue;
    if (e.team === owner.team && e.id !== owner.id) continue;
    const fall = 1 - (d / cfg.r) * .7;
    dealDamage(e, cfg.dmg * fall, { ...owner, x: pos.x, y: pos.y, z: pos.z, source: 'explosion', kb: cfg.kb * fall, kbUp: cfg.kbUp * fall });
  }
  const gx = toCell(pos.x), gy = toCellY(pos.y), gz = toCell(pos.z), R = cfg.blocks, removed = [];
  for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) {
    if (x * x + y * y + z * z > R * R + 1) continue;
    const c = getCell(gx + x, gy + y, gz + z);
    if (!c || !c.breakable || c.type === 'bed') continue;
    if (!(BLOCKS[c.type]?.blast || []).includes(type)) continue;
    removeCell(c.gx, c.gy, c.gz); removed.push([c.gx, c.gy, c.gz]);
  }
  if (removed.length) G.match?.send?.('blkRm', { c: removed });
}
