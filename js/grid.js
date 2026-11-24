// Voxel grid: every solid thing players can stand on, build on or break.
import { THREE, BLOCK_GEO, blockMaterial } from './engine.js';
import { G } from './state.js';
import { BLOCKS } from './config.js';

const cells = new Map();
const K = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);

export const toCell = (v) => Math.floor((v + 1.5) / 3);     // x or z
export const toCellY = (y) => Math.floor(y / 3) + 1;
export const cellX = (gx) => gx * 3;                          // centre
export const cellY = (gy) => gy * 3 - 1.5;
export const cellId = (gx, gy, gz) => `${gx}_${gy}_${gz}`;
export function parseId(id) { const [a, b, c] = id.split('_').map(Number); return [a, b, c]; }

// little "pop" when a block is placed
const pops = [];
export function updateBlockAnims(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt;
    const k = Math.min(1, p.t / .09); p.m.scale.setScalar(.78 + .22 * k + Math.sin(k * Math.PI) * .06); p.m.updateMatrix();
    if (k >= 1) pops.splice(i, 1);
  }
}

export function getCell(gx, gy, gz) { return cells.get(K(gx, gy, gz)); }
export function clearGrid() { cells.clear(); }
export function allCells() { return cells; }

// type: block type key from BLOCKS. opts: {team, mesh(bool), h(0..1 height), bedTeam}
export function setCell(gx, gy, gz, type, opts = {}) {
  const k = K(gx, gy, gz);
  if (cells.has(k)) return null;
  const def = BLOCKS[type] || {};
  const c = { gx, gy, gz, type, team: opts.team || null, h: opts.h ?? 1, breakable: !def.unbreakable && opts.breakable !== false, bedTeam: opts.bedTeam || null, mesh: null, placedBy: opts.placedBy || null };
  if (opts.mesh !== false && type !== 'ground' && type !== 'bed') {
    const m = new THREE.Mesh(BLOCK_GEO, blockMaterial(type, c.team));
    m.position.set(cellX(gx), cellY(gy), gz * 3);
    m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    if (opts.pop !== false && G.mode === 'match') { m.scale.setScalar(.78); pops.push({ m, t: 0 }); }
    m.updateMatrix();
    G.world.add(m); c.mesh = m;
  }
  cells.set(k, c);
  return c;
}
export function removeCell(gx, gy, gz) {
  const k = K(gx, gy, gz); const c = cells.get(k);
  if (!c) return null;
  if (c.mesh) G.world.remove(c.mesh);
  cells.delete(k);
  return c;
}

// Is any solid cell overlapping this AABB?
export function boxHits(minX, minY, minZ, maxX, maxY, maxZ) {
  const x0 = toCell(minX), x1 = toCell(maxX - 1e-6), z0 = toCell(minZ), z1 = toCell(maxZ - 1e-6);
  const y0 = toCellY(minY), y1 = toCellY(maxY - 1e-6);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
    const c = cells.get(K(x, y, z)); if (!c) continue;
    const bot = y * 3 - 3, top = bot + 3 * c.h;
    if (maxY > bot && minY < top) return c;
  }
  return null;
}

// Highest surface under a point (for bots / spawns). Returns y or null.
export function groundBelow(x, y, z, maxDrop = 60) {
  const gx = toCell(x), gz = toCell(z);
  for (let gy = toCellY(y); gy >= toCellY(y - maxDrop); gy--) {
    const c = cells.get(K(gx, gy, gz)); if (c) return gy * 3 - 3 + 3 * c.h;
  }
  return null;
}

// Voxel ray march (Amanatides & Woo). Returns {gx,gy,gz,cell,nx,ny,nz,dist} or null.
export function raycast(origin, dir, maxDist, skip) {
  const d = dir.clone().normalize();
  let px = (origin.x + 1.5) / 3, py = origin.y / 3 + 1, pz = (origin.z + 1.5) / 3;
  let gx = Math.floor(px), gy = Math.floor(py), gz = Math.floor(pz);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = sx ? Math.abs(3 / d.x) : Infinity, tdy = sy ? Math.abs(3 / d.y) : Infinity, tdz = sz ? Math.abs(3 / d.z) : Infinity;
  let tmx = sx > 0 ? (gx + 1 - px) * tdx : sx < 0 ? (px - gx) * tdx : Infinity;
  let tmy = sy > 0 ? (gy + 1 - py) * tdy : sy < 0 ? (py - gy) * tdy : Infinity;
  let tmz = sz > 0 ? (gz + 1 - pz) * tdz : sz < 0 ? (pz - gz) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 200 && t <= maxDist; i++) {
    const c = cells.get(K(gx, gy, gz));
    if (c && !(skip && skip(c))) return { gx, gy, gz, cell: c, nx, ny, nz, dist: t };
    if (tmx < tmy && tmx < tmz) { gx += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { gy += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { gz += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

export function hasNeighbor(gx, gy, gz) {
  return !!(getCell(gx + 1, gy, gz) || getCell(gx - 1, gy, gz) || getCell(gx, gy + 1, gz) || getCell(gx, gy - 1, gz) || getCell(gx, gy, gz + 1) || getCell(gx, gy, gz - 1));
}

// Would a block at this cell overlap any living entity?
export function cellBlockedByEntity(gx, gy, gz) {
  const minX = gx * 3 - 1.5, maxX = gx * 3 + 1.5, minY = gy * 3 - 3, maxY = gy * 3, minZ = gz * 3 - 1.5, maxZ = gz * 3 + 1.5;
  for (const e of G.entities.values()) {
    if (e.dead || !e.avatar.group.visible) continue;
    const p = e.pos, w = .8;
    if (p.x + w > minX && p.x - w < maxX && p.z + w > minZ && p.z - w < maxZ && p.y + 4.9 > minY && p.y < maxY) return true;
  }
  return false;
}
