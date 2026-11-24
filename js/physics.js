// Real collision: entities are boxes that slide along the voxel grid.
import { boxHits } from './grid.js';
import { PHYS } from './config.js';

function hit(p, hw, h) { return boxHits(p.x - hw, p.y, p.z - hw, p.x + hw, p.y + h, p.z + hw); }

// e: {pos (Vector3 feet), vel, kb, onGround}. Moves the entity for dt seconds.
export function moveEntity(e, dt) {
  const hw = PHYS.halfW, h = PHYS.height - 0.2, p = e.pos;
  e.vel.y = Math.max(-90, e.vel.y - PHYS.gravity * dt);
  const vx = e.vel.x + e.kb.x, vz = e.vel.z + e.kb.z;
  let dx = vx * dt, dy = e.vel.y * dt, dz = vz * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.6));
  dx /= steps; dy /= steps; dz /= steps;
  const wasGround = e.onGround; e.onGround = false; e.hitWall = false;
  for (let i = 0; i < steps; i++) {
    if (dx) { p.x += dx; if (hit(p, hw, h)) { p.x -= dx; e.kb.x = 0; e.hitWall = true; dx = 0; } }
    if (dz) { p.z += dz; if (hit(p, hw, h)) { p.z -= dz; e.kb.z = 0; e.hitWall = true; dz = 0; } }
    if (dy) {
      const prev = p.y; p.y += dy;
      if (hit(p, hw, h)) {
        // binary search the exact contact point so we don't float above blocks
        let lo = 0, hi = 1;
        for (let k = 0; k < 7; k++) { const mid = (lo + hi) / 2; p.y = prev + dy * mid; if (hit(p, hw, h)) hi = mid; else lo = mid; }
        p.y = prev + dy * lo;
        if (dy < 0) e.onGround = true;
        e.vel.y = 0; dy = 0;
      }
    }
  }
  // probe straight down so standing still still counts as grounded
  if (!e.onGround && e.vel.y <= 0) { p.y -= 0.05; if (hit(p, hw, h)) e.onGround = true; p.y += 0.05; }
  // knockback friction
  const f = Math.exp(-(e.onGround ? 9 : 2.6) * dt);
  e.kb.x *= f; e.kb.z *= f;
  if (Math.abs(e.kb.x) < .05) e.kb.x = 0; if (Math.abs(e.kb.z) < .05) e.kb.z = 0;
  return wasGround;
}

export function canFit(x, y, z) { return !boxHits(x - PHYS.halfW, y, z - PHYS.halfW, x + PHYS.halfW, y + PHYS.height - .2, z + PHYS.halfW); }
