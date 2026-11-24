import { THREE, mat, box, textSprite, tex, blockMaterial } from './engine.js';
import { ITEMS, ARMOR, TEAMS, COSMETICS } from './config.js';

let faceTex = null;
function getFace() {
  if (faceTex) return faceTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#f5cd2f'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#1b1b1b'; x.fillRect(19, 22, 7, 10); x.fillRect(38, 22, 7, 10);
  x.lineWidth = 4; x.strokeStyle = '#1b1b1b'; x.beginPath(); x.arc(32, 36, 13, 0.25 * Math.PI, 0.75 * Math.PI); x.stroke();
  faceTex = new THREE.CanvasTexture(c); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.magFilter = THREE.NearestFilter;
  return faceTex;
}

// Builds the mesh for an item held in a hand (also used for the first-person view model).
export function itemMesh(id, team) {
  const it = ITEMS[id]; const g = new THREE.Group();
  if (!it) return g;
  if (it.type === 'sword') {
    const blade = box(.22, 2.6, .5, mat(it.color, { metal: .6, rough: .3 })); blade.position.y = 1.55;
    const guard = box(.9, .2, .6, mat(0x3a2a1a)); guard.position.y = .2;
    const grip = box(.2, .7, .2, mat(0x5a3a1f)); grip.position.y = -.2;
    g.add(blade, guard, grip);
  } else if (it.type === 'pickaxe') {
    const h = box(.18, 2.6, .18, mat(0x7b4b2a)); h.position.y = .9;
    const head = box(1.7, .3, .3, mat(it.color, { metal: .5, rough: .35 })); head.position.y = 2.1;
    g.add(h, head);
  } else if (it.type === 'bow') {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.1, .1, 6, 16, Math.PI), mat(0x8b5a2b));
    arc.rotation.z = -Math.PI / 2; arc.position.y = 1;
    const str = box(.04, 2.2, .04, mat(0xeeeeee)); str.position.set(0, 1, 0);
    g.add(arc, str);
  } else if (it.type === 'block') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), blockMaterial(it.block, team)); b.position.y = .6; b.castShadow = true; g.add(b);
  } else if (id === 'tnt') {
    const b = box(1, 1, 1, mat(0xd63a2a)); b.position.y = .6; const band = box(1.02, .35, 1.02, mat(0xf2f2f2)); band.position.y = .6; g.add(b, band);
  } else if (id === 'fireball') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(.5, 10, 10), mat(0xff6b22, { emissive: 0xff4400, ei: .8 })); s.position.y = .6; g.add(s);
  } else if (id === 'telepearl') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(.42, 10, 10), mat(0x22c7b8, { emissive: 0x0a5a50, metal: .3, rough: .2 })); s.position.y = .6; g.add(s);
  } else if (it.type === 'food') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(.45, 10, 10), mat(0xf2c230, { metal: .5, rough: .3 })); s.position.y = .6; g.add(s);
  } else if (it.type === 'potion') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.3, .4, .8, 10), mat(id === 'speed_pot' ? 0x6ad7ff : 0x7cff6a, { transparent: true, opacity: .85 })); b.position.y = .6; g.add(b);
  } else if (it.type === 'shears') {
    const a = box(.18, 1.4, .1, mat(0xdddddd, { metal: .7, rough: .3 })); a.position.set(-.12, 1, 0); a.rotation.z = .2;
    const b = box(.18, 1.4, .1, mat(0xdddddd, { metal: .7, rough: .3 })); b.position.set(.12, 1, 0); b.rotation.z = -.2;
    const h = box(.6, .4, .14, mat(0xd63a2a)); h.position.y = .2; g.add(a, b, h);
  } else if (it.type === 'axe') {
    const h = box(.18, 2.4, .18, mat(0x7b4b2a)); h.position.y = .9;
    const head = box(.9, .8, .16, mat(0xcccccc, { metal: .5, rough: .35 })); head.position.set(.35, 1.9, 0); g.add(h, head);
  } else if (it.type === 'balloon') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(.5, 10, 10), mat(TEAMS[team]?.color ?? 0xff4466, { rough: .3 })); s.position.y = 1.3; s.scale.y = 1.2;
    const st = box(.03, 1, .03, mat(0xffffff)); st.position.y = .5; g.add(s, st);
  } else if (it.type === 'ammo') {
    const a = box(.1, 1.4, .1, mat(0x8b5a2b)); a.position.y = .7; g.add(a);
  }
  return g;
}

export class Avatar {
  constructor({ team = 'blue', name = '', shirt, pants = 0x24324a, tag = true } = {}) {
    const color = shirt ?? TEAMS[team]?.color ?? 0x888888;
    this.group = new THREE.Group();
    this.mats = [];
    const m = (c) => { const x = mat(c); this.mats.push(x); return x; };
    this.shirtMat = m(color); this.pantsMat = m(pants); this.basePants = pants;
    const skin = m(0xf5cd2f);
    const g = this.body = new THREE.Group(); this.group.add(g);
    this.torso = box(2, 2, 1, this.shirtMat); this.torso.position.y = 3; g.add(this.torso);
    const faceMat = new THREE.MeshStandardMaterial({ map: getFace(), roughness: .8 }); this.mats.push(faceMat);
    this.head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), [skin, skin, skin, skin, faceMat, skin]);
    this.head.castShadow = true; this.head.position.y = 4.6; g.add(this.head);
    const limb = (x, y, w, material) => { const p = new THREE.Group(); p.position.set(x, y, 0); const mm = box(w, 2, 1, material); mm.position.y = -1; p.add(mm); g.add(p); return p; };
    this.la = limb(-1.5, 4, 1, this.shirtMat);
    this.ra = limb(1.5, 4, 1, this.shirtMat);
    this.ll = limb(-.5, 2, 1, this.pantsMat);
    this.rl = limb(.5, 2, 1, this.pantsMat);
    // hand anchor at the end of the right arm
    this.hand = new THREE.Group(); this.hand.position.set(0, -1.9, .35); this.hand.rotation.x = Math.PI / 2.4; this.ra.add(this.hand);
    // armor overlay
    this.armor = new THREE.Group();
    this.armorMat = m(ARMOR[0].color);
    const chest = box(2.14, 2.06, 1.14, this.armorMat); chest.position.y = 3;
    const sl = box(1.12, .9, 1.12, this.armorMat); sl.position.set(-1.5, 3.6, 0);
    const sr = box(1.12, .9, 1.12, this.armorMat); sr.position.set(1.5, 3.6, 0);
    const helm = box(1.32, .5, 1.32, this.armorMat); helm.position.y = 5.1;
    this.armor.add(chest, sl, sr, helm); this.armor.visible = false; g.add(this.armor);
    this.heldId = null; this.heldMesh = null; this.team = team;
    this.walk = 0; this.swingT = 1; this.flashT = 0; this.stopT = 0; this.crouch = false; this.aim = 0;
    if (tag && name) this.setName(name, team);
  }
  // name tag: text in the player's name colour, background tinted with their team colour
  setName(name, team, teamBg = false) {
    if (this.tag) { this.group.remove(this.tag); this.tag.material.map.dispose(); this.tag = null; }
    if (!name) return;
    this._tagArgs = [name, team, teamBg];
    const col = this.nameColor && this.nameColor !== '#ffffff' ? this.nameColor : (teamBg ? '#ffffff' : TEAMS[team]?.css || '#fff');
    const c = TEAMS[team]?.color ?? 0x101820;
    const bg = teamBg ? `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},.55)` : 'rgba(5,10,18,.62)';
    this.tag = textSprite(name, { color: col, bg, scale: .55 });
    this.tag.position.y = 6.6; this.group.add(this.tag);
  }
  // cosmetics: { skin, name } (bed + kill effects are handled by the map/effects code)
  setLook(look) {
    if (!look) return;
    const nc = COSMETICS[look.name]?.color || null;
    if (nc !== this.nameColor) { this.nameColor = nc; if (this._tagArgs) this.setName(...this._tagArgs); }
    if (look.skin === this.skinId) return;
    this.skinId = look.skin;
    if (this.hat) { this.head.remove(this.hat); this.hat = null; }
    this.pantsMat.color.setHex(this.basePants);
    const h = this.hat = new THREE.Group(); this.head.add(h);
    const M = (c, o) => mat(c, o);
    switch (look.skin) {
      case 'skin_cap': { const t = box(1.3, .35, 1.3, M(0xd63a2a)); t.position.y = .75; const br = box(1.3, .1, .7, M(0xb02a1e)); br.position.set(0, .6, .9); h.add(t, br); break; }
      case 'skin_ninja': { const b = box(1.26, .22, 1.26, M(0x111111)); b.position.y = .25; const t1 = box(.15, .5, .12, M(0x111111)); t1.position.set(-.2, .05, -.7); t1.rotation.z = .4; h.add(b, t1); this.pantsMat.color.setHex(0x151515); break; }
      case 'skin_wizard': { const br = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, .12, 16), M(0x5a2a9a)); br.position.y = .65; const cone = new THREE.Mesh(new THREE.ConeGeometry(.7, 1.8, 16), M(0x6a34b8)); cone.position.y = 1.55; cone.rotation.z = .15; const star = box(.25, .25, .05, M(0xffe45c, { emissive: 0xaa8800, ei: .6 })); star.position.set(0, 1.3, .55); h.add(br, cone, star); break; }
      case 'skin_viking': { const hel = box(1.32, .55, 1.32, M(0x8a8f96, { metal: .6, rough: .4 })); hel.position.y = .55; h.add(hel); for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(.18, .9, 8), M(0xf3ead2)); horn.position.set(sx * .85, .9, 0); horn.rotation.z = -sx * .9; h.add(horn); } break; }
      case 'skin_knight': { const hel = box(1.38, 1.38, 1.38, M(0xb8bec6, { metal: .7, rough: .3 })); const slit = box(.9, .12, .05, M(0x111111)); slit.position.set(0, .1, .7); const plume = box(.15, .6, .9, M(0xd63a2a)); plume.position.set(0, .95, -.1); h.add(hel, slit, plume); break; }
      case 'skin_robot': { const hel = box(1.3, 1.3, 1.3, M(0x9aa1ab, { metal: .8, rough: .25 })); const visor = box(1, .3, .05, M(0x38e0ff, { emissive: 0x18b0d0, ei: 1 })); visor.position.set(0, .1, .66); const ant = box(.08, .6, .08, M(0x555555)); ant.position.y = .95; const tip = box(.2, .2, .2, M(0xff5252, { emissive: 0xaa0000, ei: 1 })); tip.position.y = 1.3; h.add(hel, visor, ant, tip); break; }
      case 'skin_crown': { const gold = M(0xffcc33, { metal: .9, rough: .2, emissive: 0x6a4a00, ei: .4 }); const ring = box(1.3, .35, 1.3, gold); ring.position.y = .78; h.add(ring); for (const [x, z] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5], [0, .55], [0, -.55]]) { const sp = box(.22, .4, .22, gold); sp.position.set(x, 1.1, z); h.add(sp); } const gem = box(.2, .2, .06, M(0xff2a6a, { emissive: 0xaa0033, ei: .8 })); gem.position.set(0, .8, .67); h.add(gem); break; }
      case 'skin_halo': { const t = new THREE.Mesh(new THREE.TorusGeometry(.6, .08, 8, 24), new THREE.MeshBasicMaterial({ color: 0xfff2a0 })); t.rotation.x = Math.PI / 2; t.position.y = 1.1; h.add(t); h.userData.halo = t; break; }
    }
  }
  // emotes: wave, cheer, sit, bow, laugh, dance, flex, spin
  playEmote(id) { this.emoteId = id; this.emoteT = 0; }
  stopEmote() { this.emoteId = null; this.body.position.y = 0; this.body.rotation.set(0, 0, 0); for (const l of [this.la, this.ra, this.ll, this.rl, this.torso, this.head]) l.rotation.set(0, 0, 0); }
  setTeam(team) {
    this.team = team; this.shirtMat.color.setHex(TEAMS[team]?.color ?? 0x888888);
  }
  setArmor(tier) {
    this.armor.visible = tier > 0;
    this.armorMat.color.setHex(ARMOR[tier]?.color ?? ARMOR[0].color);
  }
  setHeld(id) {
    if (id === this.heldId) return;
    this.heldId = id;
    if (this.heldMesh) { this.hand.remove(this.heldMesh); }
    this.heldMesh = id ? itemMesh(id, this.team) : null;
    if (this.heldMesh) this.hand.add(this.heldMesh);
  }
  swing() { this.swingT = 0; }
  animateEmote(t) {
    const s = this, w = Math.sin(t * 10), b = s.body;
    b.position.y = 0; b.rotation.set(0, 0, 0);
    for (const l of [s.la, s.ra, s.ll, s.rl]) l.rotation.set(0, 0, 0);
    s.torso.rotation.set(0, 0, 0); s.head.rotation.set(0, 0, 0);
    switch (s.emoteId) {
      case 'emote_wave': s.ra.rotation.z = 2.6 + w * .35; break;
      case 'emote_cheer': s.la.rotation.z = -2.7; s.ra.rotation.z = 2.7; b.position.y = Math.abs(Math.sin(t * 7)) * .9; break;
      case 'emote_sit': b.position.y = -1.7; s.ll.rotation.x = -1.5; s.rl.rotation.x = -1.5; s.la.rotation.x = -.4; s.ra.rotation.x = -.4; break;
      case 'emote_bow': s.torso.rotation.x = .7; s.head.rotation.x = .5; s.la.rotation.x = .3; s.ra.rotation.x = .3; break;
      case 'emote_laugh': s.torso.rotation.z = Math.sin(t * 18) * .08; s.head.rotation.x = -.35; s.la.rotation.x = -1.2; s.ra.rotation.x = -1.2; b.position.y = Math.abs(Math.sin(t * 9)) * .2; break;
      case 'emote_dance': s.la.rotation.z = -1.2 - w * .9; s.ra.rotation.z = 1.2 - w * .9; s.ll.rotation.x = Math.max(0, w) * -.8; s.rl.rotation.x = Math.max(0, -w) * -.8; b.rotation.y = Math.sin(t * 5) * .5; b.position.y = Math.abs(w) * .3; break;
      case 'emote_flex': s.la.rotation.z = -1.5; s.ra.rotation.z = 1.5; s.la.rotation.x = -1.4 * Math.min(1, t * 3); s.ra.rotation.x = -1.4 * Math.min(1, t * 3); s.torso.rotation.x = -.1; break;
      case 'emote_spin': b.rotation.y = t * 12; s.la.rotation.z = -1.5; s.ra.rotation.z = 1.5; break;
    }
  }
  setBalloons(n) {
    if (n === this.balloonN) return; this.balloonN = n;
    if (!this.balloonG) { this.balloonG = new THREE.Group(); this.balloonG.position.y = 5.2; this.group.add(this.balloonG); }
    this.balloonG.clear();
    const cols = [TEAMS[this.team]?.color ?? 0xff4466, 0xffffff, 0xffd34e];
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2, x = Math.cos(a) * .9, z = Math.sin(a) * .9;
      const b = new THREE.Mesh(new THREE.SphereGeometry(.85, 12, 10), mat(cols[i % 3], { rough: .25 })); b.scale.y = 1.2; b.position.set(x, 4.2, z);
      const s = box(.04, 4, .04, mat(0xeeeeee)); s.position.set(x / 2, 2, z / 2); s.rotation.z = -x * .2; s.rotation.x = z * .2; s.castShadow = false;
      this.balloonG.add(b, s);
    }
  }
  hitstop(t) { this.stopT = Math.max(this.stopT, t); }
  flash() { this.flashT = .18; }
  animate(dt, moving, airborne) {
    const s = this;
    // hit freeze: hold the pose for a few frames so hits feel heavy
    if (s.stopT > 0) { s.stopT -= dt; dt *= .1; }
    // crouch: lean forward and sink a little
    const cy = s.crouch ? -.45 : 0;
    s.torso.rotation.x += ((s.crouch ? .35 : 0) - s.torso.rotation.x) * Math.min(1, dt * 14);
    s.torso.position.y = 3 + cy; s.head.position.y = 4.6 + cy * 1.6; s.la.position.y = 4 + cy * 1.3; s.ra.position.y = 4 + cy * 1.3; s.armor.position.y = cy;
    if (moving) s.walk += dt * 11; else s.walk *= .85;
    const sw = moving ? Math.sin(s.walk) * .75 : 0;
    s.la.rotation.x = airborne ? -.5 : sw;
    s.ll.rotation.x = airborne ? .35 : -sw;
    s.rl.rotation.x = airborne ? -.35 : sw;
    if (s.swingT < 1) {
      s.swingT = Math.min(1, s.swingT + dt * 4.5);
      const a = Math.sin(s.swingT * Math.PI);
      s.ra.rotation.x = -.4 - a * 1.6; s.ra.rotation.y = -a * .6;
    } else if (s.aim > 0) {
      // drawing a bow: both arms up and forward, pulled back as it charges
      s.ra.rotation.x = -1.55; s.ra.rotation.y = -.2; s.la.rotation.x = -1.45 + s.aim * .25; s.la.rotation.y = .5;
    } else {
      s.ra.rotation.x = s.heldId ? -.35 + (airborne ? -.3 : -sw * .4) : -sw; s.ra.rotation.y = 0; s.la.rotation.y = 0;
    }
    if (s.balloonG && s.balloonN) s.balloonG.rotation.y += dt * .6;
    if (s.hat?.userData.halo) s.hat.userData.halo.position.y = 1.1 + Math.sin(performance.now() / 400) * .08;
    if (s.emoteId) {
      if (moving && s.emoteId !== 'emote_spin') s.stopEmote();
      else { s.emoteT += dt; if (s.emoteT > 2.8) s.stopEmote(); else { s.animateEmote(s.emoteT); return; } }
    }
    if (s.flashT > 0) {
      s.flashT -= dt;
      const on = s.flashT > 0;
      for (const m of s.mats) { m.emissive?.setHex(on ? 0xff2020 : 0x000000); m.emissiveIntensity = on ? .7 : 1; }
    }
  }
}
