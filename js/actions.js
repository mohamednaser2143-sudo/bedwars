// World-changing actions (blocks & beds) with network sync.
import { G } from './state.js';
import { setCell, removeCell, getCell, cellX, cellY, hasNeighbor, cellBlockedByEntity } from './grid.js';
import { THREE, burst } from './engine.js';
import { TEAMS } from './config.js';
import { sfx } from './audio.js';
import { toast, bigMessage, killfeed, teamSpan } from './ui.js';

const blockColor = { wool: null, planks: 0xb4834d, stone_brick: 0x9da3a8, obsidian: 0x3a2350, stone: 0x8b9096 };

export function canPlace(gx, gy, gz) {
  if (getCell(gx, gy, gz)) return false;
  if (gy > 18 || gy < -8) return false;
  if (!hasNeighbor(gx, gy, gz)) return false;
  if (cellBlockedByEntity(gx, gy, gz)) return false;
  // keep a small no-build zone around spawn points & generators
  for (const z of G.match?.noBuild || []) if (Math.abs(gx - z[0]) <= z[2] && Math.abs(gz - z[1]) <= z[2] && gy >= 1 && gy <= 3) return false;
  return true;
}

// Place a block locally and tell everyone. Returns true if placed.
export function placeBlock(gx, gy, gz, type, team, net = true) {
  const c = setCell(gx, gy, gz, type, { team });
  if (!c) return false;
  if (net) G.match?.send?.('blk', { c: [gx, gy, gz], t: type, tm: team });
  return true;
}

// Break a block (or bed). `by` = entity that broke it.
export function breakBlock(gx, gy, gz, by, net = true) {
  const c = getCell(gx, gy, gz);
  if (!c || !c.breakable) return false;
  if (c.type === 'bed') {
    if (c.bedTeam === by?.team) return false;
    if (G.match.isAuth()) destroyBed(c.bedTeam, by.name, by.team, by.id);
    else G.match.send('bedBreak', { team: c.bedTeam, by: by.name, byTeam: by.team, byId: by.id });
    return true;
  }
  removeCell(gx, gy, gz);
  burst(new THREE.Vector3(cellX(gx), cellY(gy), gz * 3), c.type === 'wool' ? TEAMS[c.team]?.color ?? 0xffffff : blockColor[c.type] ?? 0xaaaaaa, 12, 10);
  if (net) G.match?.send?.('blkRm', { c: [[gx, gy, gz]] });
  return true;
}

// Only the match authority calls this; everyone else receives the 'bed' message.
export function destroyBed(team, byName, byTeam, byId) {
  const bed = G.match?.beds[team];
  if (!bed || !bed.alive) return;
  applyBedDestroyed(team, byName, byTeam, byId);
  G.match.send('bed', { team, by: byName, byTeam, byId });
}

export function applyBedDestroyed(team, byName, byTeam, byId) {
  const bed = G.match?.beds[team];
  if (!bed || !bed.alive) return;
  bed.alive = false;
  for (const [x, y, z] of bed.cells) removeCell(x, y, z);
  bed.mesh.visible = false;
  burst(bed.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), TEAMS[team].color, 30, 14, .9);
  sfx.bed();
  const by = byName || 'Someone';
  killfeed(`🛏️ ${teamSpan(TEAMS[team].name + ' Bed', TEAMS[team].css)} was destroyed by ${teamSpan(by, TEAMS[byTeam]?.css || '#fff')}`);
  if (team === G.local?.team) bigMessage('BED DESTROYED!', 'You will no longer respawn', '#ff5252', 3200);
  else bigMessage(`${TEAMS[team].name.toUpperCase()} BED DESTROYED`, `by ${by}`, TEAMS[team].css, 2200);
  const st = G.match.statFor(byId, byName, byTeam); if (st) st.beds++;
  G.match.onBedsChanged?.();
}

export function canPlaceHere(gx, gy, gz) { return canPlace(gx, gy, gz); }
export { toast };
