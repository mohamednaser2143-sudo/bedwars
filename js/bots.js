// Bot AI. Runs only on the match authority (solo player or multiplayer host).
import { THREE } from './engine.js';
import { G } from './state.js';
import { BOT_DIFF, COMBAT, BLOCKS, ITEMS, SHOP, PHYS, UPGRADES } from './config.js';
import { getCell, toCell, toCellY, groundBelow, raycast } from './grid.js';
import { swing, useItem } from './combat.js';
import { placeBlock, breakBlock, canPlace } from './actions.js';
import { tryBuy, tryUpgrade } from './shop.js';

const entry = (id) => { for (const c of SHOP) for (const it of c.items) if (it.id === id) return it; return null; };
const armorEntry = (t) => { for (const c of SHOP) for (const it of c.items) if (it.armor === t) return it; return null; };

export function initBotAI(b, diff) {
  b.ai = { diff, mode: 'home', nextThink: 0, target: null, targetTeam: null, mining: null, lastPlace: 0, defended: false, defendList: null, lastPos: b.pos.clone(), stuckT: 0, trail: [], strafe: Math.random() < .5 ? 1 : -1, shopped: 0 };
}

function enemiesOf(b) { const out = []; for (const e of G.entities.values()) if (e.alive && e.team !== b.team && e.avatar.group.visible) out.push(e); return out; }
function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function think(b) {
  const ai = b.ai, D = BOT_DIFF[ai.diff], m = G.match;
  const foes = enemiesOf(b);
  let near = null, nd = D.aggro;
  for (const e of foes) { const d = dist2(e.pos, b.pos); if (d < nd && Math.abs(e.pos.y - b.pos.y) < 14) { nd = d; near = e; } }
  const bed = m.beds[b.team];
  if (bed.alive) for (const e of foes) if (dist2(e.pos, bed.mesh.position) < 20 && dist2(e.pos, b.pos) < 60) { near = e; break; }
  if (near) { ai.mode = 'fight'; ai.target = near; return; }
  if (ai.mode === 'fight') ai.mode = 'attack';
  const wool = b.inv.count('wool');
  if (wool < 10 || (ai.mode === 'home' && b.inv.res.iron < 16 && performance.now() - ai.shopped > 4000)) { ai.mode = 'home'; return; }
  if (!ai.defended && bed.alive) { ai.mode = 'defend'; return; }
  // pick a team to attack
  const alive = Object.keys(m.beds).filter(t => t !== b.team && m.teamAlive(t));
  if (!alive.length) { ai.mode = 'idle'; return; }
  if (!ai.targetTeam || !alive.includes(ai.targetTeam)) {
    alive.sort((a, c) => (m.beds[c].alive - m.beds[a].alive) || dist2(m.spawns[a], b.pos) - dist2(m.spawns[c], b.pos));
    ai.targetTeam = alive[0];
  }
  ai.mode = 'attack';
}

function speedOf(b) { const D = BOT_DIFF[b.ai.diff]; let s = PHYS.walk * D.speed; if (b.effects.speed > performance.now()) s *= 1.35; if (b.effects.slow > performance.now()) s *= .5; return s; }

// Walk toward a point, bridging gaps and digging/jumping over walls. Returns distance left.
function moveTo(b, tx, tz, stop = 1.5, ty = null) {
  const ai = b.ai, D = BOT_DIFF[ai.diff];
  const dx = tx - b.pos.x, dz = tz - b.pos.z, d = Math.hypot(dx, dz);
  if (d < stop) { b.vel.x = b.vel.z = 0; return d; }
  let nx = dx / d, nz = dz / d;
  // long trips: travel along one axis at a time so bridges are straight lines (diagonal bridges are deadly)
  if (d > 12 && ai.mode !== 'fight') {
    if (!ai.axis || (ai.axis === 'z' && Math.abs(dz) < 1.5) || (ai.axis === 'x' && Math.abs(dx) < 1.5)) ai.axis = Math.abs(dz) >= Math.abs(dx) ? 'z' : 'x';
    if (ai.axis === 'z' && Math.abs(dz) >= 1.5) { nx = 0; nz = Math.sign(dz); }
    else if (ai.axis === 'x' && Math.abs(dx) >= 1.5) { nx = Math.sign(dx); nz = 0; }
  } else ai.axis = null;
  b.yaw = Math.atan2(nx, nz);
  const ax = b.pos.x + nx * 2.4, az = b.pos.z + nz * 2.4;
  const ground = groundBelow(ax, b.pos.y + .5, az, 7);
  if (ground === null && b.onGround) {
    // gap ahead: bridge if we have blocks, otherwise stop at the edge
    const bi = b.inv.firstBlock();
    const gx = toCell(ax), gz = toCell(az), gy = toCellY(b.pos.y - .5);
    if (bi >= 0 && performance.now() - ai.lastPlace > D.bridge) {
      if (canPlace(gx, gy, gz)) { const s = b.inv.slots[bi]; placeBlock(gx, gy, gz, ITEMS[s.id].block, b.team); b.inv.takeFromSlot(bi, 1); b.held = s.id; ai.lastPlace = performance.now(); b.avatar.swing(); }
      else if (!getCell(gx, gy, gz)) {
        // diagonal: fill the side cell first so the bridge connects
        const cx = toCell(b.pos.x), cz = toCell(b.pos.z);
        for (const [x, z] of [[gx, cz], [cx, gz]]) if (canPlace(x, gy, z)) { const s = b.inv.slots[bi]; placeBlock(x, gy, z, ITEMS[s.id].block, b.team); b.inv.takeFromSlot(bi, 1); ai.lastPlace = performance.now(); break; }
      }
    }
    b.vel.x = nx * 1.2; b.vel.z = nz * 1.2; // creep forward slowly while bridging
    if (bi < 0) { b.vel.x = b.vel.z = 0; if (ai.mode !== 'fight') ai.mode = 'home'; }
    return d;
  }
  const sp = speedOf(b);
  b.vel.x = nx * sp; b.vel.z = nz * sp;
  // obstacle ahead?
  if (b.hitWall && b.onGround) {
    const gx = toCell(b.pos.x + nx * 1.9), gz = toCell(b.pos.z + nz * 1.9), gy = toCellY(b.pos.y + .5);
    const wall = getCell(gx, gy, gz);
    if (wall && !getCell(gx, gy + 1, gz) && !getCell(gx, gy + 2, gz) && !getCell(toCell(b.pos.x), gy + 2, toCell(b.pos.z))) b.vel.y = PHYS.jump;
    else if (wall && wall.breakable && wall.type !== 'bed') startMine(b, wall);
    else if (getCell(gx, gy + 1, gz)?.breakable) startMine(b, getCell(gx, gy + 1, gz));
  }
  if (ty != null && ty > b.pos.y + 2.5 && b.onGround && b.hitWall) b.vel.y = PHYS.jump;
  return d;
}

function mineTime(b, cell) {
  const pick = b.inv.best('pickaxe'); let sp = pick ? ITEMS[pick].speed : 1;
  sp *= 1 + .25 * (G.match.teamUp[b.team]?.haste || 0);
  return BLOCKS[cell.type].hard / sp;
}
function startMine(b, cell) {
  if (b.ai.mining && b.ai.mining.cell === cell) return;
  b.ai.mining = { cell, t: 0, need: mineTime(b, cell) * (1.2 - BOT_DIFF[b.ai.diff].speed * .2) };
  b.held = b.inv.best('pickaxe') || b.held;
}
function updateMining(b, dt) {
  const mi = b.ai.mining; if (!mi) return false;
  const c = mi.cell;
  if (getCell(c.gx, c.gy, c.gz) !== c) { b.ai.mining = null; return false; }
  const center = new THREE.Vector3(c.gx * 3, c.gy * 3 - 1.5, c.gz * 3);
  if (center.distanceTo(b.center()) > 10) { b.ai.mining = null; return false; }
  b.vel.x = b.vel.z = 0;
  b.yaw = Math.atan2(center.x - b.pos.x, center.z - b.pos.z);
  mi.t += dt * 1000;
  if (Math.random() < dt * 4) b.avatar.swing();
  if (mi.t >= mi.need) { breakBlock(c.gx, c.gy, c.gz, b); b.ai.mining = null; }
  return true;
}

function shop(b) {
  const inv = b.inv, ai = b.ai; let bought = 0;
  const buy = (it) => { if (it && tryBuy(b, it) === 'ok') { bought++; return true; } return false; };
  for (let i = 0; i < 3 && inv.count('wool') < 40 && inv.res.iron >= 8; i++) buy(entry('wool'));
  const sword = inv.best('sword'), st = sword ? ITEMS[sword].tier : -1;
  if (st < 1) buy(entry('stone_sword'));
  if (b.armor < 1) buy(armorEntry(1));
  if (st < 2) buy(entry('iron_sword'));
  if (!inv.best('pickaxe')) buy(entry('wood_pickaxe'));
  else if (ITEMS[inv.best('pickaxe')].tier < 2) buy(entry('stone_pickaxe'));
  if (b.armor < 2) buy(armorEntry(2));
  if (st < 3) buy(entry('diamond_sword'));
  if (inv.count('gapple') < 2) buy(entry('gapple'));
  if (ai.diff !== 'easy') { for (const k of ['sharp', 'prot', 'forge', 'haste']) if (tryUpgrade(b, k) === 'ok') bought++; }
  if (ai.diff === 'hard' && inv.count('fireball') < 1) buy(entry('fireball'));
  if (ai.diff !== 'easy' && inv.count('balloon') < 3 && inv.res.gold >= 10) buy(entry('balloon'));
  ai.shopped = performance.now();
  // equip best sword
  b.held = inv.best('sword');
  return bought;
}

function defendList(b) {
  const bed = G.match.beds[b.team]; const out = []; const seen = new Set();
  const add = (x, y, z) => { const k = x + ',' + y + ',' + z; if (!seen.has(k) && !getCell(x, y, z)) { seen.add(k); out.push([x, y, z]); } };
  for (const [x, y, z] of bed.cells) { add(x, y + 1, z); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) add(x + dx, y, z + dz); }
  return out;
}

export function updateBot(b, dt) {
  if (!b.alive || !G.match || G.match.over) return;
  const ai = b.ai, D = BOT_DIFF[ai.diff], now = performance.now(), m = G.match;
  // fell off? pop the balloons (if we have them) and float home
  if (!b.onGround && b.pos.y < -4 && !b.balloons) { const bi = b.inv.find(s => s.id === 'balloon'); if (bi >= 0) useItem(b, bi, null, null); }
  if (b.balloons) {
    const sp = m.spawns[b.team], dx = sp.x - b.pos.x, dz = sp.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    const s = speedOf(b) * .7; b.vel.x = dx / d * s; b.vel.z = dz / d * s; b.yaw = Math.atan2(dx, dz);
    return;
  }
  if (now >= ai.nextThink) { ai.nextThink = now + D.react * (.7 + Math.random() * .6); think(b); }
  if (updateMining(b, dt)) return;

  // breadcrumb trail so bots can walk back over their own bridges
  const sp0 = m.spawns[b.team], away = dist2(b.pos, sp0) > 21;
  if (!away) ai.trail.length = 0;
  else if (b.onGround) { const last = ai.trail[ai.trail.length - 1]; if (!last || dist2(last, b.pos) > 2.5) { ai.trail.push(b.pos.clone()); if (ai.trail.length > 300) ai.trail.shift(); } }

  // stuck detection
  ai.stuckT += dt;
  if (ai.stuckT > 1.6) {
    if (ai.lastPos.distanceTo(b.pos) < 1.5 && (Math.abs(b.vel.x) + Math.abs(b.vel.z)) > 1 && b.onGround) { b.vel.y = PHYS.jump; ai.strafe *= -1; }
    ai.lastPos.copy(b.pos); ai.stuckT = 0;
  }

  if (ai.mode === 'fight' && ai.target) {
    const t = ai.target;
    if (!t.alive) { ai.target = null; ai.mode = 'attack'; return; }
    b.held = b.inv.best('sword');
    const d = dist2(t.pos, b.pos);
    moveTo(b, t.pos.x, t.pos.z, 3, t.pos.y);
    if (d < 9) { // strafe a little
      const sx = Math.cos(b.yaw) * ai.strafe * 4, sz = -Math.sin(b.yaw) * ai.strafe * 4;
      b.vel.x += sx; b.vel.z += sz;
      if (Math.random() < dt * .5) ai.strafe *= -1;
    }
    b.yaw = Math.atan2(t.pos.x - b.pos.x, t.pos.z - b.pos.z);
    if (d < COMBAT.reach - .6 && Math.abs(t.pos.y - b.pos.y) < 5 && now - b.lastSwing > D.cd) {
      if (Math.random() < D.hit) swing(b, b.forward());
      else { b.lastSwing = now; b.avatar.swing(); }
    }
    if (b.hp < 45) { const gi = b.inv.find(s => s.id === 'gapple'); if (gi >= 0 && now - (ai.lastEat || 0) > 3000) { ai.lastEat = now; useItem(b, gi, null, null); } }
    if (ai.diff === 'hard' && d > 10 && d < 30 && now - (ai.lastFb || 0) > 6000) {
      const fi = b.inv.find(s => s.id === 'fireball');
      if (fi >= 0) { ai.lastFb = now; const o = b.center().add(new THREE.Vector3(0, 1.2, 0)); const dir = t.center().sub(o).normalize(); o.addScaledVector(dir, 2); useItem(b, fi, o, dir); }
    }
    return;
  }
  if (ai.mode === 'home') {
    if (away && ai.trail.length && b.inv.firstBlock() < 0) {
      const t = ai.trail[ai.trail.length - 1];
      if (dist2(t, b.pos) < 1.6) ai.trail.pop(); else moveTo(b, t.x, t.z, 0.8);
      return;
    }
    const gen = m.gens.find(g => g.kind === 'team' && g.team === b.team);
    const npcShop = m.npcs.find(n => n.type === 'shop' && n.team === b.team);
    if (b.inv.res.iron < 16 && b.inv.res.gold < 8) { moveTo(b, gen.pos.x, gen.pos.z, 1.5); return; }
    if (moveTo(b, npcShop.pos.x, npcShop.pos.z, 5) < 6) { shop(b); ai.nextThink = 0; ai.mode = 'attack'; }
    return;
  }
  if (ai.mode === 'defend') {
    const bed = m.beds[b.team];
    if (!ai.defendList) ai.defendList = defendList(b);
    const bi = b.inv.firstBlock();
    if (!ai.defendList.length || bi < 0 || !bed.alive) { ai.defended = true; ai.mode = 'attack'; return; }
    const c = bed.mesh.position;
    if (moveTo(b, c.x + 4, c.z + 4, 3) < 6 && now - ai.lastPlace > D.bridge * 1.4) {
      const [x, y, z] = ai.defendList.shift();
      if (canPlace(x, y, z)) { const s = b.inv.slots[bi]; placeBlock(x, y, z, ITEMS[s.id].block, b.team); b.inv.takeFromSlot(bi, 1); ai.lastPlace = now; b.avatar.swing(); }
    }
    return;
  }
  if (ai.mode === 'attack' && ai.targetTeam) {
    const bed = m.beds[ai.targetTeam];
    if (bed.alive) {
      const c = bed.mesh.position;
      const d = moveTo(b, c.x, c.z, 4.2, 0);
      if (d < 8) {
        // dig through the defence toward the bed
        const eye = b.center().add(new THREE.Vector3(0, 1.4, 0));
        const dir = new THREE.Vector3(c.x, 1, c.z).sub(eye);
        const h = raycast(eye, dir, 12);
        if (h && h.cell.breakable && (h.cell.type !== 'bed' || h.cell.bedTeam !== b.team)) startMine(b, h.cell);
      }
    } else {
      const sp = m.spawns[ai.targetTeam];
      // hunt remaining players of that team
      let prey = null; for (const e of G.entities.values()) if (e.alive && e.team === ai.targetTeam) { prey = e; break; }
      if (prey) moveTo(b, prey.pos.x, prey.pos.z, 3); else moveTo(b, sp.x, sp.z, 3);
    }
    return;
  }
  b.vel.x = b.vel.z = 0;
}
