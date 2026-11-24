// Builds the match map and the hub lobby.
import { THREE, mat, box, tex, repeatTex, textSprite } from './engine.js';
import { G } from './state.js';
import { TEAMS, TEAM_KEYS, MAPS } from './config.js';
import { setCell } from './grid.js';
import { Avatar } from './avatar.js';

// A floating island: ground cells (collision) + textured visual + rocky underside.
function island(cx, cz, half, { top = 'grass', side = null, under = 'dirt', trim = null, layers = 3 } = {}) {
  for (let x = cx - half; x <= cx + half; x++) for (let z = cz - half; z <= cz + half; z++) setCell(x, 0, z, 'ground', { mesh: false });
  const n = half * 2 + 1, w = n * 3;
  const sideT = repeatTex(tex(side || (top === 'grass' ? 'grassSide' : top)), n, 1);
  const topT = repeatTex(tex(top), n, n);
  const sideM = mat(0xffffff, { map: sideT }), topM = mat(0xffffff, { map: topT }), botM = mat(0xffffff, { map: repeatTex(tex(under), n, n) });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 3, w), [sideM, sideM, topM, botM, sideM, sideM]);
  slab.position.set(cx * 3, -1.5, cz * 3); slab.receiveShadow = true; slab.castShadow = true;
  G.world.add(slab);
  let s = w, y = -3;
  for (let i = 0; i < layers; i++) {
    s *= 0.72; const h = 5 + i * 1.5; y -= h / 2;
    const m = box(s, h, s, mat(0xffffff, { map: repeatTex(tex(i === 0 ? under : (under === 'netherrack' ? 'netherrack' : 'stone')), Math.max(1, s / 6), 1) }));
    m.position.set(cx * 3, y, cz * 3); m.castShadow = false; G.world.add(m); y -= h / 2;
  }
  if (trim != null) {
    const tm = mat(trim, { emissive: trim, ei: .25 });
    for (const [dx, dz, ww, dd] of [[0, -w / 2, w, .5], [0, w / 2, w, .5], [-w / 2, 0, .5, w], [w / 2, 0, .5, w]]) {
      const t = box(ww + .5, .35, dd + .5, tm); t.position.set(cx * 3 + dx, .1, cz * 3 + dz); t.castShadow = false; G.world.add(t);
    }
  }
}

function lamp(x, z, color) {
  const p = box(.8, 6, .8, mat(0x3b4350)); p.position.set(x, 3, z); G.world.add(p);
  const l = box(1.6, 1.6, 1.6, mat(color, { emissive: color, ei: .9 })); l.position.set(x, 6.6, z); G.world.add(l);
}

// design: a bed cosmetic id (bed_default, bed_striped, ...)
function bedMesh(team, design = 'bed_default') {
  const g = new THREE.Group(), c = TEAMS[team].color;
  let frameC = 0x6b3f1f, blanket = mat(c), pillowC = 0xffffff, headC = 0x7a4b28, frameOpt = {};
  if (design === 'bed_striped') blanket = mat(0xffffff, { map: tex('stripes', c) });
  else if (design === 'bed_candy') { blanket = mat(0xffffff, { map: tex('candy') }); frameC = 0xf4f4f4; headC = 0xff9ee0; pillowC = 0xffd6f2; }
  else if (design === 'bed_checker') blanket = mat(0xffffff, { map: tex('checker', c) });
  else if (design === 'bed_royal') { frameC = 0xe0b32e; headC = 0xe0b32e; frameOpt = { metal: .8, rough: .25 }; pillowC = 0xfff2c2; }
  else if (design === 'bed_lava') { blanket = mat(0xff5a14, { emissive: 0xff3a00, ei: .8 }); frameC = 0x2a1a14; headC = 0x2a1a14; }
  else if (design === 'bed_space') { blanket = mat(0xffffff, { map: tex('stars'), emissive: 0x3a1a7a, ei: .35 }); frameC = 0x1b1530; headC = 0x2a2148; pillowC = 0xb47dff; }
  const frame = box(2.8, .7, 5.8, mat(frameC, frameOpt)); frame.position.y = .4;
  const matt = box(2.7, .5, 5.5, mat(0xf3f3f3)); matt.position.y = 1;
  const bl = box(2.8, .55, 3.6, blanket); bl.position.set(0, 1.2, -.9);
  const pillow = box(2.2, .5, 1.1, mat(pillowC)); pillow.position.set(0, 1.35, 2.1);
  const head = box(2.9, 2, .4, mat(headC, frameOpt)); head.position.set(0, 1.1, 2.85);
  g.add(frame, matt, bl, pillow, head);
  if (design === 'bed_royal') { const crown = box(1.2, .5, .3, mat(0xffd34e, { emissive: 0x7a5a00, ei: .5, metal: .8 })); crown.position.set(0, 2.35, 2.85); g.add(crown); }
  return g;
}

function npc(x, z, yaw, shirt, label, labelColor, bg) {
  const a = new Avatar({ shirt, pants: 0x222833, tag: false });
  a.group.position.set(x, 0, z); a.group.rotation.y = yaw; a.group.scale.setScalar(.95);
  G.world.add(a.group);
  const s = textSprite(label, { color: labelColor, bg, scale: .7 }); s.position.set(x, 7.6, z); G.world.add(s);
  const pad = box(6, .3, 6, mat(shirt, { emissive: shirt, ei: .15 })); pad.position.set(x, .15, z); pad.castShadow = false; G.world.add(pad);
  return a;
}

// ---------------- MATCH MAP ----------------
// mapId: key of MAPS. bedLooks: { team: bed cosmetic id }
export function buildMatchMap(teamsInPlay, mapId = 'classic', bedLooks = {}) {
  const M = MAPS[mapId] || MAPS.classic, th = M.theme;
  const info = { spawns: {}, beds: {}, gens: [], npcs: [], noBuild: [], islands: [], map: mapId };
  const isl = (cx, cz, half, opts) => { island(cx, cz, half, opts); info.islands.push({ cx, cz, half, kind: opts.kind || 'base' }); };
  for (const t of TEAM_KEYS) {
    const T = TEAMS[t], f = { x: T.fx, z: T.fz }, r = { x: -T.fz, z: T.fx };
    const cx0 = -T.fx * M.dist, cz0 = -T.fz * M.dist;
    const L = (a, b) => [cx0 + r.x * a + f.x * b, cz0 + r.z * a + f.z * b];
    const yaw = Math.atan2(f.x, f.z);
    isl(cx0, cz0, 7, { top: th.top, side: th.side, under: th.under, trim: T.color, kind: 'base', team: t });
    const [sx, sz] = L(0, -1);
    info.spawns[t] = { x: sx * 3, y: .1, z: sz * 3, yaw };
    info.noBuild.push([sx, sz, 1]);
    // generator
    const [gx, gz] = L(0, -5);
    const pad = box(8.6, .5, 8.6, mat(0x50565f, { map: tex('metal', 0x50565f) })); pad.position.set(gx * 3, .25, gz * 3); G.world.add(pad);
    const core = box(3, 1.6, 3, mat(0x9aa1ab, { metal: .6, rough: .4 })); core.position.set(gx * 3, 1.3, gz * 3); G.world.add(core);
    const gl = textSprite('Generator', { color: '#fff', scale: .55 }); gl.position.set(gx * 3, 5.2, gz * 3); G.world.add(gl);
    info.gens.push({ kind: 'team', team: t, pos: new THREE.Vector3(gx * 3, 0, gz * 3), iron: 0, gold: 0, emerald: 0, tI: 0, tG: 0, tE: 0, label: gl, lastTxt: '' });
    info.noBuild.push([gx, gz, 1]);
    // shop + upgrades
    const [px, pz] = L(5, -3), [ux, uz] = L(-5, -3);
    const shop = npc(px * 3, pz * 3, yaw, 0x8e44ad, 'ITEM SHOP', '#ffe45c', 'rgba(48,18,62,.9)');
    const up = npc(ux * 3, uz * 3, yaw, 0x22b866, 'TEAM UPGRADES', '#7dffb0', 'rgba(12,60,42,.9)');
    info.npcs.push({ type: 'shop', team: t, pos: shop.group.position, avatar: shop }, { type: 'up', team: t, pos: up.group.position, avatar: up });
    info.noBuild.push([px, pz, 1], [ux, uz, 1]);
    lamp((cx0 + r.x * 7 + f.x * 7) * 3, (cz0 + r.z * 7 + f.z * 7) * 3, T.color);
    lamp((cx0 - r.x * 7 + f.x * 7) * 3, (cz0 - r.z * 7 + f.z * 7) * 3, T.color);
    // bed (2 cells along forward)
    if (teamsInPlay.includes(t)) {
      const [b1x, b1z] = L(0, 3), [b2x, b2z] = L(0, 4);
      const cells = [[b1x, 1, b1z], [b2x, 1, b2z]];
      for (const c of cells) setCell(c[0], c[1], c[2], 'bed', { h: .55, bedTeam: t, mesh: false });
      const m = bedMesh(t, bedLooks[t]); m.position.set((b1x + b2x) * 1.5, 0, (b1z + b2z) * 1.5); m.rotation.y = yaw + Math.PI; G.world.add(m);
      info.beds[t] = { alive: true, cells, mesh: m };
    } else info.beds[t] = { alive: false, cells: [], mesh: new THREE.Group() };
    // diamond island in front of the base
    const dcx = -T.fx * M.diamond, dcz = -T.fz * M.diamond;
    isl(dcx, dcz, 2, { top: th.midTop, side: th.midTop, under: th.under, layers: 2, kind: 'diamond' });
    const dcore = box(2.4, 2.4, 2.4, mat(0x5ee8ff, { emissive: 0x1aa6c4, ei: .6, metal: .3, rough: .3 })); dcore.position.set(dcx * 3, 2.2, dcz * 3); G.world.add(dcore);
    const dl = textSprite('💎 Diamond', { color: '#7eeaff', bg: 'rgba(10,40,55,.85)', scale: .6 }); dl.position.set(dcx * 3, 6.5, dcz * 3); G.world.add(dl);
    info.gens.push({ kind: 'diamond', pos: new THREE.Vector3(dcx * 3, 0, dcz * 3), n: 0, t: 0, label: dl, spin: dcore, lastTxt: '' });
  }
  // middle emerald island
  const mh = M.mid;
  isl(0, 0, mh, { top: th.midTop, side: th.midTop, under: th.under, layers: 3, kind: 'mid' });
  const deco = th.top === 'netherrack' ? 'netherbrick' : th.midTop === 'sandstone' ? 'sandstone' : 'stone';
  const pillar = (x, z, h) => { for (let y = 1; y <= h; y++) { const c = setCell(x, y, z, 'stone', { mesh: false }); const m = box(3, 3, 3, mat(0xffffff, { map: tex(deco) })); m.position.set(x * 3, y * 3 - 1.5, z * 3); G.world.add(m); } };
  if (M.pillars === 'corners') for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) pillar(x, z, 2);
  else if (M.pillars === 'ring') for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; pillar(Math.round(Math.cos(a) * 4), Math.round(Math.sin(a) * 4), i % 2 ? 1 : 3); }
  else if (M.pillars === 'ruins') { for (const [x, z, h] of [[-4, -2, 2], [-4, -1, 3], [-4, 0, 1], [4, 1, 3], [4, 2, 2], [-1, 4, 2], [0, 4, 3], [1, -4, 1], [2, -4, 2]]) pillar(x, z, h); }
  else if (M.pillars === 'spikes') for (const [x, z, h] of [[-3, -3, 4], [3, 3, 4], [3, -3, 2], [-3, 3, 2], [0, 4, 1], [0, -4, 1]]) pillar(x, z, h);
  const ecore = box(2.8, 2.8, 2.8, mat(0x39ff80, { emissive: 0x17a84e, ei: .7, metal: .3, rough: .3 })); ecore.position.set(0, 2.4, 0); G.world.add(ecore);
  const el = textSprite('🟩 Emerald', { color: '#7dffb0', bg: 'rgba(10,55,35,.85)', scale: .7 }); el.position.set(0, 7.2, 0); G.world.add(el);
  info.gens.push({ kind: 'emerald', pos: new THREE.Vector3(0, 0, 0), n: 0, t: 0, label: el, spin: ecore, lastTxt: '' });
  info.extent = (M.dist + 9) * 3;
  return info;
}

// ---------------- HUB LOBBY ----------------
export function buildHubMap() {
  island(0, 0, 11, { top: 'plaza', layers: 4 });
  // grass beds and trees around the edge
  const tree = (x, z) => {
    const t = box(1.6, 7, 1.6, mat(0x7a4b28)); t.position.set(x, 3.5, z); G.world.add(t);
    const l = box(7, 6, 7, mat(0x3faa3a, { map: tex('grass') })); l.position.set(x, 9, z); G.world.add(l);
    setCell(Math.round(x / 3), 1, Math.round(z / 3), 'ground', { mesh: false });
    setCell(Math.round(x / 3), 2, Math.round(z / 3), 'ground', { mesh: false });
  };
  for (const [x, z] of [[-27, 27], [27, 27], [-27, -12], [27, -12], [-12, 30], [12, 30]]) tree(x, z);
  // central statue: a giant bed
  const ped = box(9, 2, 9, mat(0x8b9096, { map: tex('stone_brick') })); ped.position.set(0, 1, 6); G.world.add(ped);
  for (let x = -1; x <= 1; x++) for (let z = 1; z <= 3; z++) setCell(x, 1, z, 'ground', { mesh: false, h: 2 / 3 });
  const big = bedMesh('blue', 'bed_royal'); big.scale.setScalar(1.3); big.position.set(0, 2, 6); big.rotation.y = .5; G.world.add(big);
  const title = textSprite('FIGHT ON A BASEPLATE', { color: '#ffffff', bg: 'rgba(6,14,28,.75)', scale: 1.6, font: 'bold 54px "Segoe UI",Arial' });
  title.position.set(0, 16, -32); G.world.add(title);
  // portals
  const portal = (x, z, color, label, sub) => {
    const pm = mat(0x2d3440, { map: tex('stone_brick') });
    const l = box(2.4, 12, 2.4, pm); l.position.set(x - 6, 6, z); G.world.add(l);
    const r = box(2.4, 12, 2.4, pm); r.position.set(x + 6, 6, z); G.world.add(r);
    const top = box(14.4, 2.4, 2.4, pm); top.position.set(x, 12.6, z); G.world.add(top);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 11), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .55, side: THREE.DoubleSide }));
    glow.position.set(x, 6, z); G.world.add(glow);
    const pad = box(12, .3, 7, mat(color, { emissive: color, ei: .5 })); pad.position.set(x, .15, z + 2); pad.castShadow = false; G.world.add(pad);
    const s1 = textSprite(label, { color: '#fff', bg: 'rgba(6,14,28,.85)', scale: 1 }); s1.position.set(x, 16, z); G.world.add(s1);
    const s2 = textSprite(sub, { color: '#cfe3ff', bg: null, scale: .55 }); s2.position.set(x, 14.6, z); G.world.add(s2);
    for (const gx of [Math.round((x - 6) / 3), Math.round((x + 6) / 3)]) for (let gy = 1; gy <= 4; gy++) setCell(gx, gy, Math.round(z / 3), 'ground', { mesh: false });
    return { glow, pos: new THREE.Vector3(x, 0, z + 2) };
  };
  const solo = portal(-15, -21, 0xffa53b, 'SOLO VS BOTS', 'Practice against AI');
  const multi = portal(15, -21, 0x3bb8ff, 'MULTIPLAYER', 'Play with friends');
  // help board
  const board = textSprite('WASD move • Space jump • Click to look • E inventory • F talk • T chat', { color: '#fff', bg: 'rgba(6,14,28,.8)', scale: .8, font: 'bold 34px "Segoe UI",Arial' });
  board.position.set(0, 6, 31); G.world.add(board);
  lamp(-30, -30, 0xffa53b); lamp(30, -30, 0x3bb8ff); lamp(-30, 30, 0xffffff); lamp(30, 30, 0xffffff);
  return { spawn: { x: 0, y: .1, z: 18, yaw: Math.PI }, portals: [{ id: 'solo', ...solo }, { id: 'multi', ...multi }] };
}
