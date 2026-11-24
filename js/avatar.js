import { THREE, mat, box, textSprite, tex, blockMaterial } from './engine.js';
import { ITEMS, ARMOR, TEAMS } from './config.js';

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
    this.shirtMat = m(color); this.pantsMat = m(pants);
    const skin = m(0xf5cd2f);
    const g = this.group;
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
  setName(name, team) {
    if (this.tag) { this.group.remove(this.tag); this.tag.material.map.dispose(); }
    this.tag = textSprite(name, { color: TEAMS[team]?.css || '#fff', bg: 'rgba(5,10,18,.62)', scale: .55 });
    this.tag.position.y = 6.6; this.group.add(this.tag);
  }
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
    if (s.flashT > 0) {
      s.flashT -= dt;
      const on = s.flashT > 0;
      for (const m of s.mats) { m.emissive?.setHex(on ? 0xff2020 : 0x000000); m.emissiveIntensity = on ? .7 : 1; }
    }
  }
}
