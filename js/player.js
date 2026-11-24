// Local player: input, movement, camera, and in-match actions (mine, build, fight, use).
import { THREE, mat, blockMaterial } from './engine.js';
import { G } from './state.js';
import { PHYS, COMBAT, ITEMS, BLOCKS } from './config.js';
import { moveEntity } from './physics.js';
import { raycast, getCell, toCell, toCellY, cellX, cellY, boxHits } from './grid.js';
import { itemMesh } from './avatar.js';
import { swing, useItem, trackFall } from './combat.js';
import { placeBlock, breakBlock, canPlace } from './actions.js';
import { selectSlot, openInventory, closeInventory, renderHotbar } from './invui.js';
import { openShop, openUpgrades, closeShop, closeUpgrades } from './shop.js';
import { openChat, closeChat, $, toast } from './ui.js';
import { sfx, toggleMute } from './audio.js';

const keys = G.input.keys;
let hooks = { onEscape: null, onInteract: null, onTab: null };
export function setPlayerHooks(h) { Object.assign(hooks, h); }

// ---------- INPUT ----------
export function initInput() {
  const cv = G.renderer.domElement;
  addEventListener('keydown', e => {
    if (G.input.typing) {
      if (e.code === 'Enter') closeChat(true);
      else if (e.code === 'Escape') closeChat(false);
      return;
    }
    if (G.mode === 'boot' || document.activeElement?.tagName === 'INPUT') return;
    if (['Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.repeat) return;
    if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 9 && G.mode === 'match') selectSlot(n - 1); }
    if (e.code === 'KeyE' && G.mode === 'match') { if (G.uiOpen === 'inv') closeInventory(); else if (!G.uiOpen) openInventory(); }
    if (e.code === 'Escape') { closeAll(); hooks.onEscape?.(); }
    if (e.code === 'KeyV') toggleFirstPerson();
    if (e.code === 'KeyF') hooks.onInteract?.();
    if (e.code === 'KeyM') toast(toggleMute() ? 'Sound muted' : 'Sound on');
    if (e.code === 'KeyB') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
    if ((e.code === 'KeyT' || e.code === 'Enter' || e.code === 'Slash') && !G.uiOpen) { e.preventDefault(); openChat(); }
    if (e.code === 'Tab') hooks.onTab?.(true);
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Tab') hooks.onTab?.(false); });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; G.input.mouseL = G.input.mouseR = false; });

  cv.addEventListener('mousedown', e => {
    if (G.uiOpen || G.input.typing) return;
    if (!document.pointerLockElement) {
      if (e.button === 2) { G.input.orbit = true; return; }
      cv.requestPointerLock?.()?.catch?.(() => {});
      return;
    }
    if (e.button === 0) { G.input.mouseL = true; primaryDown(); }
    if (e.button === 2) { G.input.mouseR = true; secondaryDown(); }
  });
  addEventListener('mouseup', e => {
    if (e.button === 0) G.input.mouseL = false;
    if (e.button === 2) { G.input.mouseR = false; G.input.orbit = false; }
    if (bowCharge.on && !G.input.mouseL && !G.input.mouseR) releaseBow();
  });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    if (!document.pointerLockElement && !G.input.orbit) return;
    const s = .0024 * G.settings.sens;
    G.cam.yaw -= e.movementX * s;
    G.cam.pitch = Math.max(-1.35, Math.min(1.25, G.cam.pitch - e.movementY * s));
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.deltaY < 0) { if (!G.cam.first) { G.cam.dist = Math.max(4, G.cam.dist - 1.8); if (G.cam.dist <= 4) toggleFirstPerson(true); } }
    else { if (G.cam.first) { toggleFirstPerson(false); G.cam.dist = 7; } else G.cam.dist = Math.min(30, G.cam.dist + 1.8); }
  }, { passive: false });
  document.addEventListener('pointerlockchange', () => { G.input.locked = !!document.pointerLockElement; $('crosshair').classList.toggle('on', G.input.locked); });
}

export function closeAll() { closeInventory(); closeShop(); closeUpgrades(); }

function toggleFirstPerson(v) {
  G.cam.first = v ?? !G.cam.first;
  if (!G.cam.first && G.cam.dist < 6) G.cam.dist = 12;
}

// ---------- MOVEMENT ----------
const tmp = new THREE.Vector3();
export function updateLocalMovement(dt) {
  const e = G.local; if (!e || !e.alive) return;
  const k = G.input.typing || G.uiOpen === 'inv' || G.uiOpen === 'shop' || G.uiOpen === 'up' ? {} : keys;
  let ix = 0, iz = 0;
  if (k.KeyW) iz -= 1; if (k.KeyS) iz += 1; if (k.KeyA) ix -= 1; if (k.KeyD) ix += 1;
  const yaw = G.cam.yaw;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let mx = fx * -iz + rx * ix, mz = fz * -iz + rz * ix;
  const len = Math.hypot(mx, mz);
  const now = performance.now();
  let sp = PHYS.walk; if (e.effects.speed > now) sp *= 1.35; if (e.effects.slow > now) sp *= .5;
  e.crouch = !!(k.ShiftLeft || k.ShiftRight); e.avatar.crouch = e.crouch;
  if (e.crouch) sp *= .38;
  if (bowCharge.on) sp *= .55;
  if (len > 0) { mx /= len; mz /= len; }
  // a bit of acceleration so movement feels less robotic
  const a = 1 - Math.exp(-(e.onGround ? 18 : 6) * dt);
  e.vel.x += (mx * sp - e.vel.x) * a; e.vel.z += (mz * sp - e.vel.z) * a;
  if (k.Space && e.onGround) { e.vel.y = PHYS.jump * (e.effects.jump > now ? 1.32 : 1); e.onGround = false; }
  // crouching never walks you off an edge (like sneaking in Minecraft)
  if (e.crouch && e.onGround && e.vel.y <= 0) {
    if (!supported(e.pos.x + (e.vel.x + e.kb.x) * dt, e.pos.y, e.pos.z)) { e.vel.x = 0; e.kb.x = 0; }
    if (!supported(e.pos.x, e.pos.y, e.pos.z + (e.vel.z + e.kb.z) * dt)) { e.vel.z = 0; e.kb.z = 0; }
  }
  const wasGround = e.onGround;
  moveEntity(e, dt);
  trackFall(e, wasGround);
  // facing: shift-lock style when the mouse is locked, else face where we walk
  if (G.input.locked || G.cam.first) e.yaw = yaw + Math.PI;
  else if (len > 0) { const want = Math.atan2(mx, mz); let d = want - e.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); e.yaw += d * Math.min(1, dt * 14); }
  e.avatar.group.rotation.y = e.yaw;
  e.avatar.setHeld(G.mode === 'match' ? e.heldItem() : null);
  e.avatar.animate(dt, len > 0 && e.onGround, !e.onGround);
}

// is there a block under any part of the player's feet at (x,z)?
function supported(x, y, z) {
  const w = PHYS.halfW - .25;
  return !!boxHits(x - w, y - .35, z - w, x + w, y - .01, z + w);
}

// ---------- CAMERA ----------
let viewModel = null, vmId = null, shakeAmt = 0, bob = 0;
export function shake(a) { shakeAmt = Math.max(shakeAmt, a); }
export function updateCamera(dt) {
  const e = G.local, cam = G.camera; if (!e) return;
  const head = new THREE.Vector3(e.pos.x, e.pos.y + (e.crouch ? 3.7 : 4.4), e.pos.z);
  const dir = new THREE.Vector3(-Math.sin(G.cam.yaw) * Math.cos(G.cam.pitch), Math.sin(G.cam.pitch), -Math.cos(G.cam.yaw) * Math.cos(G.cam.pitch));
  if (G.cam.first || !e.alive) {
    cam.position.copy(head);
    if (!e.alive) cam.position.y += 6;
  } else {
    const side = G.input.locked ? new THREE.Vector3(Math.cos(G.cam.yaw), 0, -Math.sin(G.cam.yaw)).multiplyScalar(1.6) : new THREE.Vector3();
    const target = head.clone().add(side);
    let d = G.cam.dist;
    const hit = raycast(target, dir.clone().negate(), d);
    if (hit) d = Math.max(1.5, hit.dist - .6);
    cam.position.copy(target).addScaledVector(dir, -d);
  }
  if (shakeAmt > 0) { cam.position.x += (Math.random() - .5) * shakeAmt; cam.position.y += (Math.random() - .5) * shakeAmt; shakeAmt = Math.max(0, shakeAmt - dt * 2.5); }
  cam.lookAt(cam.position.clone().add(dir));
  e.avatar.group.visible = e.alive && !G.cam.first;
  // first-person held item
  const id = G.mode === 'match' ? e.heldItem() : null;
  if (!viewModel) { viewModel = new THREE.Group(); cam.add(viewModel); }
  if (vmId !== id) { viewModel.clear(); vmId = id; if (id) { const m = itemMesh(id, e.team); m.scale.setScalar(.32); viewModel.add(m); } }
  viewModel.visible = G.cam.first && e.alive && !!id;
  if (viewModel.visible) {
    const moving = Math.hypot(e.vel.x, e.vel.z) > 2 && e.onGround; bob += dt * (moving ? 9 : 2);
    const sw = e.avatar.swingT < 1 ? Math.sin(e.avatar.swingT * Math.PI) : 0;
    viewModel.position.set(.62 + Math.cos(bob) * .02, -.55 + Math.abs(Math.sin(bob)) * .03 - sw * .1, -1.1 + sw * .2);
    viewModel.rotation.set(-.35 - sw * 1.1, -.35, .15);
  }
}

// ---------- AIM HELPERS ----------
export function aimRay() {
  const cam = G.camera, e = G.local;
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const head = new THREE.Vector3(e.pos.x, e.pos.y + 4.4, e.pos.z);
  // start the ray next to the player's head so blocks behind us are ignored
  const t = Math.max(0, head.clone().sub(cam.position).dot(dir));
  const origin = cam.position.clone().addScaledVector(dir, t);
  return { origin, dir, head };
}
function aimHit(reach) {
  const { origin, dir, head } = aimRay();
  const h = raycast(origin, dir, reach + 6);
  if (!h) return null;
  const c = new THREE.Vector3(cellX(h.gx), cellY(h.gy), h.gz * 3);
  if (c.distanceTo(head) > reach) return null;
  return h;
}

// ---------- MATCH ACTIONS ----------
let mining = null, lastPlace = 0, npcHook = null;
export function setNpcHook(fn) { npcHook = fn; }

function heldDef() { const s = G.local.inv.slots[G.selected]; return s ? ITEMS[s.id] : null; }

function primaryDown() {
  if (G.mode !== 'match') { G.local.avatar.swing(); sfx.swing(); return; }
  const e = G.local; if (!e.alive || G.match?.over) return;
  if (npcHook?.()) return;
  const d = heldDef();
  if (d?.type === 'block') { tryPlace(); return; }
  if (d && ['bow', 'throw', 'food', 'potion'].includes(d.type)) { useHeld(); return; }
  attackOrMine();
}
function secondaryDown() {
  if (G.mode !== 'match') return;
  const d = heldDef();
  if (d?.type === 'block') tryPlace();
  else if (d && ['bow', 'throw', 'food', 'potion'].includes(d.type)) useHeld();
}

// ---------- BOW CHARGE ----------
export const bowCharge = { on: false, start: 0, slot: -1 };
const BOW_FULL = 900; // ms to fully draw
function startBow() {
  const e = G.local;
  if (!e.inv.has('arrow')) { toast('No arrows! Buy some in the shop'); return; }
  bowCharge.on = true; bowCharge.start = performance.now(); bowCharge.slot = G.selected;
}
function bowPower() { return Math.min(1, (performance.now() - bowCharge.start) / BOW_FULL); }
function releaseBow() {
  if (!bowCharge.on) return;
  const power = bowPower(); bowCharge.on = false; G.local.avatar.aim = 0;
  $('bowCharge').style.display = 'none';
  if (G.selected !== bowCharge.slot || !G.local.alive || power < .12) return;
  const e = G.local, { dir } = aimRay();
  const o = new THREE.Vector3(e.pos.x, e.pos.y + 4, e.pos.z).addScaledVector(dir, 2.2);
  if (useItem(e, G.selected, o, dir, power)) { renderHotbar(true); G.match.onLocalChanged?.(); }
}
function updateBow() {
  const el = $('bowCharge');
  if (!bowCharge.on) return;
  if (G.selected !== bowCharge.slot || !G.local.alive || G.uiOpen) { bowCharge.on = false; G.local.avatar.aim = 0; el.style.display = 'none'; return; }
  const p = bowPower(); G.local.avatar.aim = p;
  el.style.display = 'block'; el.style.setProperty('--p', p);
  el.classList.toggle('full', p >= 1);
}

function useHeld() {
  if (heldDef()?.type === 'bow') { startBow(); return; }
  const e = G.local, { origin, dir } = aimRay();
  const o = new THREE.Vector3(e.pos.x, e.pos.y + 4, e.pos.z).addScaledVector(dir, 2.2);
  if (useItem(e, G.selected, o, dir)) { renderHotbar(true); G.match.onLocalChanged?.(); }
}

function attackOrMine() {
  const e = G.local, now = performance.now();
  const h = aimHit(COMBAT.mineReach);
  const look = new THREE.Vector3(-Math.sin(G.cam.yaw), 0, -Math.cos(G.cam.yaw));
  if (now - e.lastSwing >= COMBAT.cooldown) {
    const t = swing(e, look);
    if (t) { mining = null; return; }
  }
  if (h && h.cell.breakable && !(h.cell.type === 'bed' && h.cell.bedTeam === e.team)) {
    if (!mining || mining.cell !== h.cell) mining = { cell: h.cell, t: 0, need: mineTime(h.cell) };
  }
}

export function mineTime(cell) {
  const e = G.local; const pick = e.inv.best('pickaxe');
  let sp = pick ? ITEMS[pick].speed : 1;
  const held = heldDef(); if (held?.type === 'pickaxe') sp *= 1.15;
  sp *= 1 + .25 * (G.match?.teamUp[e.team]?.haste || 0);
  return BLOCKS[cell.type].hard / sp;
}

// Pick the cell a block would go into.
// 1) pillar: jumping while looking straight down → under your feet
// 2) aiming at a wall/face at chest height or above → exactly that face
// 3) looking down toward an edge → extend the floor in front of you (snapped to a straight line)
function placeTarget() {
  const e = G.local;
  const feetGy = toCellY(e.pos.y - .5);
  if (G.cam.pitch < -1.0 && !e.onGround) {
    const gx = toCell(e.pos.x), gz = toCell(e.pos.z);
    if (canPlace(gx, feetGy, gz) && e.pos.y > feetGy * 3 - .01) return [gx, feetGy, gz];
  }
  const h = aimHit(COMBAT.placeReach);
  let face = null;
  if (h && (h.nx || h.ny || h.nz)) {
    const gx = h.gx + h.nx, gy = h.gy + h.ny, gz = h.gz + h.nz;
    if (canPlace(gx, gy, gz)) face = [gx, gy, gz];
  }
  if (face && (G.cam.pitch > -.25 || face[1] > feetGy)) return face;
  if (G.cam.pitch < -.12 && (e.onGround || e.crouch)) {
    const b = bridgeCell(e, feetGy);
    if (b) return b;
  }
  return face;
}
// Bridge assist: walk the look direction outward from our feet and take the first empty,
// attachable cell at floor level. Directions within ~25° of an axis snap to that axis so
// bridges come out perfectly straight.
function bridgeCell(e, gy) {
  let lx = -Math.sin(G.cam.yaw), lz = -Math.cos(G.cam.yaw);
  if (Math.abs(lx) < .42) lx = 0; else if (Math.abs(lz) < .42) lz = 0;
  const l = Math.hypot(lx, lz); lx /= l; lz /= l;
  const cx = toCell(e.pos.x), cz = toCell(e.pos.z);
  for (let d = 1.2; d <= 6.5; d += .6) {
    const gx = toCell(e.pos.x + lx * d), gz = toCell(e.pos.z + lz * d);
    if (Math.abs(gx - cx) > 2 || Math.abs(gz - cz) > 2) break;
    if (getCell(gx, gy, gz)) continue;          // already floor here, look further out
    if (canPlace(gx, gy, gz)) return [gx, gy, gz];
    // diagonal step: fill a side cell first so the bridge stays connected
    for (const [x, z] of [[gx, cz], [cx, gz]]) if (!getCell(x, gy, z) && canPlace(x, gy, z)) return [x, gy, z];
    break;
  }
  return null;
}
function tryPlace() {
  const now = performance.now(); if (now - lastPlace < 90) return;
  const e = G.local, s = e.inv.slots[G.selected]; if (!s) return;
  const t = placeTarget(); if (!t) return;
  if (placeBlock(t[0], t[1], t[2], ITEMS[s.id].block, e.team)) {
    lastPlace = now; e.inv.takeFromSlot(G.selected, 1); e.avatar.swing(); sfx.place(); renderHotbar(true);
  }
}

// ---------- building / mining visuals ----------
let ghost = null, ghostType = '', outline = null, crack = null;
function makeVisuals() {
  ghost = new THREE.Group();
  ghost.add(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .4, depthWrite: false })));
  ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.04, 3.04, 3.04)), new THREE.LineBasicMaterial({ color: 0xffffff })));
  outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.06, 3.06, 3.06)), new THREE.LineBasicMaterial({ color: 0x111111 }));
  crack = new THREE.Mesh(new THREE.BoxGeometry(3.08, 3.08, 3.08), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
  ghost.visible = outline.visible = crack.visible = false;
  G.scene.add(ghost, outline, crack);
}
function showGhost(t, type, team) {
  const key = type + team;
  if (ghostType !== key) {
    ghostType = key;
    const src = blockMaterial(type, team);
    ghost.children[0].material.map = src.map || null; ghost.children[0].material.color.setHex(src.map ? 0xffffff : 0xcccccc); ghost.children[0].material.needsUpdate = true;
  }
  const x = cellX(t[0]), y = cellY(t[1]), z = t[2] * 3;
  // glide toward the new cell instead of teleporting — feels much smoother when bridging
  if (!ghost.visible || ghost.position.distanceTo(new THREE.Vector3(x, y, z)) > 7) ghost.position.set(x, y, z);
  else ghost.position.lerp(new THREE.Vector3(x, y, z), .55);
  ghost.children[0].material.opacity = .32 + Math.sin(performance.now() / 160) * .08;
  ghost.visible = true;
}

export function updateMatchActions(dt) {
  const e = G.local;
  if (!ghost) makeVisuals();
  ghost.visible = outline.visible = crack.visible = false;
  updateBow();
  const bar = $('mineBar');
  if (!e.alive || G.uiOpen || !G.input.locked || G.match?.over) { mining = null; bar.style.display = 'none'; return; }
  const d = heldDef();
  if (d?.type === 'block') {
    const t = placeTarget();
    if (t) showGhost(t, d.block, e.team);
    if (G.input.mouseL || G.input.mouseR) tryPlace();
    mining = null;
  } else {
    const h = aimHit(COMBAT.mineReach);
    const target = h && h.cell.breakable && !(h.cell.type === 'bed' && h.cell.bedTeam === e.team) ? h.cell : null;
    if (target) { outline.position.set(cellX(target.gx), cellY(target.gy), target.gz * 3); outline.scale.set(1, target.h, 1); outline.position.y -= 1.5 * (1 - target.h); outline.visible = true; }
    if (G.input.mouseL && (!d || d.type === 'sword' || d.type === 'pickaxe' || d.type === 'ammo')) {
      // keep swinging / mining while held
      if (performance.now() - e.lastSwing >= COMBAT.cooldown + 40) attackOrMine();
      if (mining && mining.cell !== target) mining = null;
      if (!mining && target) mining = { cell: target, t: 0, need: mineTime(target) };
      if (mining) {
        mining.t += dt * 1000;
        if (Math.random() < dt * 6) { sfx.mineTick(); e.avatar.swing(); }
        const c = mining.cell;
        crack.position.copy(outline.position); crack.scale.copy(outline.scale);
        crack.material.opacity = Math.min(.6, mining.t / mining.need * .6); crack.visible = true;
        if (mining.t >= mining.need) {
          if (getCell(c.gx, c.gy, c.gz) === c && breakBlock(c.gx, c.gy, c.gz, e)) sfx.break();
          mining = null;
        }
      }
    } else mining = null;
  }
  if (mining) {
    bar.style.display = 'block';
    bar.firstElementChild.style.width = Math.min(100, mining.t / mining.need * 100) + '%';
    $('mineText').textContent = mining.cell.type === 'bed' ? 'BREAKING BED' : '';
  } else { bar.style.display = 'none'; $('mineText').textContent = ''; }
}
export function resetActions() { mining = null; bowCharge.on = false; if (ghost) ghost.visible = outline.visible = crack.visible = false; }
