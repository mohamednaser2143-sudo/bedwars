import * as THREE from 'three';
import { G } from './state.js';
import { TEAMS } from './config.js';

export { THREE };

// ---------- RENDERER / SCENE ----------
export function initEngine() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = G.settings.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.id = 'game';
  renderer.domElement.tabIndex = 0;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe0ff, 220, 720);
  const camera = new THREE.PerspectiveCamera(G.settings.fov, innerWidth / innerHeight, 0.1, 2000);
  scene.add(camera); // camera children (first-person view model) need it in the scene

  hemi = new THREE.HemisphereLight(0xdff1ff, 0x5a6a52, 0.95); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.1);
  sun.position.set(80, 160, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  makeSky(scene);

  G.renderer = renderer; G.scene = scene; G.camera = camera; G.sun = sun;
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

let sky, clouds, hemi = null, lavaPlane = null, snow = null;
function makeSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2b74e0) }, mid: { value: new THREE.Color(0xbfe0ff) }, low: { value: new THREE.Color(0x7fa9d6) } },
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top;uniform vec3 mid;uniform vec3 low;varying vec3 vP;void main(){float h=vP.y;vec3 c=h>0.?mix(mid,top,pow(clamp(h*1.4,0.,1.),.7)):mix(mid,low,clamp(-h*2.5,0.,1.));gl_FragColor=vec4(c,1.);}',
  });
  sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), mat);
  sky.renderOrder = -10;
  scene.add(sky);
  // sun disc
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false }));
  sunDisc.position.set(400, 800, 300); sunDisc.lookAt(0, 0, 0); sky.add(sunDisc);
  // blocky clouds
  clouds = new THREE.Group();
  const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 38; i++) {
    const g = new THREE.Group();
    const n = 2 + Math.floor(Math.random() * 4);
    for (let j = 0; j < n; j++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(18 + Math.random() * 30, 6, 14 + Math.random() * 22), cm);
      c.position.set(j * 16 - n * 8, Math.random() * 3, (Math.random() - .5) * 14);
      g.add(c);
    }
    g.position.set((Math.random() - .5) * 1400, 120 + Math.random() * 80, (Math.random() - .5) * 1400);
    clouds.add(g);
  }
  scene.add(clouds);
}

// Colours/sky/weather for a map theme (see MAPS in config.js)
export function applyTheme(th) {
  const u = sky.material.uniforms;
  u.top.value.setHex(th.sky[0]); u.mid.value.setHex(th.sky[1]); u.low.value.setHex(th.sky[2]);
  G.scene.fog.color.setHex(th.fog);
  G.sun.color.setHex(th.sun); hemi.color.setHex(th.hemi[0]); hemi.groundColor.setHex(th.hemi[1]);
  clouds.visible = th.clouds != null;
  if (th.clouds != null) for (const c of clouds.children) for (const b of c.children) b.material.color.setHex(th.clouds);
  if (lavaPlane) { G.scene.remove(lavaPlane); lavaPlane = null; }
  if (th.lava) { lavaPlane = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshBasicMaterial({ color: 0xff5a14, fog: false })); lavaPlane.rotation.x = -Math.PI / 2; lavaPlane.position.y = -70; G.scene.add(lavaPlane); }
  if (snow) { G.scene.remove(snow); snow = null; }
  if (th.snow) {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 160; pos[i * 3 + 1] = Math.random() * 80; pos[i * 3 + 2] = (Math.random() - .5) * 160; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: .5, transparent: true, opacity: .85 }));
    G.scene.add(snow);
  }
}

export function updateEnvironment(dt) {
  const cam = G.camera.position;
  sky.position.copy(cam);
  for (const c of clouds.children) { c.position.x += dt * 4; if (c.position.x > 700) c.position.x = -700; }
  if (lavaPlane) lavaPlane.material.color.setHSL(.04, 1, .45 + Math.sin(performance.now() / 700) * .05);
  if (snow) {
    snow.position.set(cam.x, cam.y - 40, cam.z);
    const a = snow.geometry.attributes.position, arr = a.array;
    for (let i = 1; i < arr.length; i += 3) { arr[i] -= dt * 6; if (arr[i] < 0) arr[i] += 80; }
    a.needsUpdate = true;
  }
  // shadows follow the camera target so they stay sharp near the player
  const p = G.local ? G.local.pos : cam;
  G.sun.position.set(p.x + 80, p.y + 160, p.z + 60);
  G.sun.target.position.set(p.x, p.y, p.z);
}

// ---------- MATERIAL / MESH HELPERS ----------
export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.82, metalness: opts.metal ?? 0, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1, map: opts.map || null, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
}
export function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- PROCEDURAL PIXEL TEXTURES ----------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvasTex(draw, size = 32, seed = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); draw(x, size, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
function shade(c, f) {
  const r = Math.min(255, Math.max(0, ((c >> 16) & 255) * f)), g = Math.min(255, Math.max(0, ((c >> 8) & 255) * f)), b = Math.min(255, Math.max(0, (c & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function noise(x, s, r, base, amt) { for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) { x.fillStyle = shade(base, 1 - amt / 2 + r() * amt); x.fillRect(i, j, 1, 1); } }

const texCache = {};
export function tex(kind, color = 0xffffff) {
  const key = kind + ':' + color;
  if (texCache[key]) return texCache[key];
  let t;
  if (kind === 'grass') t = canvasTex((x, s, r) => noise(x, s, r, 0x5fbf3f, .28));
  else if (kind === 'grassSide') t = canvasTex((x, s, r) => { noise(x, s, r, 0x8a5a36, .3); for (let i = 0; i < s; i++) { const h = 5 + Math.floor(r() * 4); for (let j = 0; j < h; j++) { x.fillStyle = shade(0x5fbf3f, .85 + r() * .3); x.fillRect(i, j, 1, 1); } } });
  else if (kind === 'dirt') t = canvasTex((x, s, r) => noise(x, s, r, 0x8a5a36, .32));
  else if (kind === 'stone') t = canvasTex((x, s, r) => noise(x, s, r, 0x8b9096, .25));
  else if (kind === 'wool') t = canvasTex((x, s, r) => { noise(x, s, r, color, .16); x.globalAlpha = .18; x.fillStyle = '#000'; for (let i = 0; i < s; i += 4) { x.fillRect(0, i, s, 1); x.fillRect(i + 2, 0, 1, s); } });
  else if (kind === 'planks') t = canvasTex((x, s, r) => { noise(x, s, r, 0xb4834d, .18); x.fillStyle = shade(0xb4834d, .6); for (let j = 0; j < s; j += 8) x.fillRect(0, j, s, 1); for (let j = 0; j < s; j += 8) x.fillRect(((j / 8) % 2) * 16 + 4, j, 1, 8); });
  else if (kind === 'stone_brick') t = canvasTex((x, s, r) => { noise(x, s, r, 0x9da3a8, .2); x.fillStyle = shade(0x9da3a8, .55); for (let j = 0; j < s; j += 8) { x.fillRect(0, j, s, 1); const o = (j / 8) % 2 ? 8 : 0; for (let i = o; i < s; i += 16) x.fillRect(i, j, 1, 8); } });
  else if (kind === 'obsidian') t = canvasTex((x, s, r) => { noise(x, s, r, 0x241634, .5); for (let i = 0; i < 18; i++) { x.fillStyle = shade(0x6a3fa0, .7 + r() * .6); x.fillRect(r() * s | 0, r() * s | 0, 2, 1); } });
  else if (kind === 'metal') t = canvasTex((x, s, r) => { noise(x, s, r, color, .12); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 0, s, 2); x.fillRect(0, s - 2, s, 2); x.fillRect(0, 0, 2, s); x.fillRect(s - 2, 0, 2, s); });
  else if (kind === 'plaza') t = canvasTex((x, s, r) => { noise(x, s, r, 0xcfd4da, .12); x.fillStyle = shade(0xcfd4da, .78); x.fillRect(0, 0, s, 1); x.fillRect(0, 0, 1, s); x.fillRect(0, 16, s, 1); x.fillRect(16, 0, 1, s); });
  else if (kind === 'snow') t = canvasTex((x, s, r) => noise(x, s, r, 0xf2f7fb, .08));
  else if (kind === 'snowSide') t = canvasTex((x, s, r) => { noise(x, s, r, 0x8a5a36, .3); for (let i = 0; i < s; i++) { const h = 6 + Math.floor(r() * 4); for (let j = 0; j < h; j++) { x.fillStyle = shade(0xf2f7fb, .92 + r() * .08); x.fillRect(i, j, 1, 1); } } });
  else if (kind === 'ice') t = canvasTex((x, s, r) => { noise(x, s, r, 0x9fd4f2, .14); x.strokeStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(r() * s, r() * s); x.lineTo(r() * s, r() * s); x.stroke(); } });
  else if (kind === 'sand') t = canvasTex((x, s, r) => noise(x, s, r, 0xe8cf8f, .14));
  else if (kind === 'sandSide' || kind === 'sandstone') t = canvasTex((x, s, r) => { noise(x, s, r, 0xd9bb7a, .14); x.fillStyle = shade(0xd9bb7a, .82); for (let j = 4; j < s; j += 9) x.fillRect(0, j, s, 2); });
  else if (kind === 'netherrack') t = canvasTex((x, s, r) => { noise(x, s, r, 0x7a2a26, .4); for (let i = 0; i < 20; i++) { x.fillStyle = shade(0x4a1212, .8 + r() * .4); x.fillRect(r() * s | 0, r() * s | 0, 2, 2); } });
  else if (kind === 'netherbrick') t = canvasTex((x, s, r) => { noise(x, s, r, 0x3a1418, .3); x.fillStyle = '#1a0608'; for (let j = 0; j < s; j += 8) { x.fillRect(0, j, s, 1); const o = (j / 8) % 2 ? 8 : 0; for (let i = o; i < s; i += 16) x.fillRect(i, j, 1, 8); } });
  else if (kind === 'stripes') t = canvasTex((x, s) => { x.fillStyle = hex(color); x.fillRect(0, 0, s, s); x.fillStyle = '#ffffff'; for (let i = 0; i < s; i += 8) x.fillRect(i, 0, 4, s); });
  else if (kind === 'candy') t = canvasTex((x, s) => { x.fillStyle = '#ff7ad9'; x.fillRect(0, 0, s, s); x.fillStyle = '#ffffff'; for (let i = -s; i < s; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 4, 0); x.lineTo(i + 4 + s, s); x.lineTo(i + s, s); x.fill(); } });
  else if (kind === 'checker') t = canvasTex((x, s) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111111' : hex(color); x.fillRect(i * 8, j * 8, 8, 8); } });
  else if (kind === 'stars') t = canvasTex((x, s, r) => { x.fillStyle = '#120a2e'; x.fillRect(0, 0, s, s); for (let i = 0; i < 26; i++) { x.fillStyle = r() < .3 ? '#b47dff' : '#ffffff'; x.fillRect(r() * s | 0, r() * s | 0, 1, 1); } });
  else t = canvasTex((x, s, r) => noise(x, s, r, color, .2));
  texCache[key] = t;
  return t;
}
export function repeatTex(t, rx, ry) { const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); return c; }

// One shared geometry + material per block type/team → cheap to draw thousands.
export const BLOCK_GEO = new THREE.BoxGeometry(3, 3, 3);
const blockMats = {};
export function blockMaterial(type, team) {
  const key = type + ':' + (team || '');
  if (blockMats[key]) return blockMats[key];
  let m;
  if (type === 'wool') m = mat(0xffffff, { map: tex('wool', TEAMS[team]?.color ?? 0xeeeeee), rough: 1 });
  else if (type === 'planks') m = mat(0xffffff, { map: tex('planks'), rough: .95 });
  else if (type === 'stone_brick') m = mat(0xffffff, { map: tex('stone_brick'), rough: .9 });
  else if (type === 'obsidian') m = mat(0xffffff, { map: tex('obsidian'), rough: .4, metal: .2 });
  else if (type === 'stone') m = mat(0xffffff, { map: tex('stone'), rough: .9 });
  else m = mat(0xcccccc);
  blockMats[key] = m;
  return m;
}

// ---------- TEXT SPRITES ----------
export function textSprite(text, { color = '#fff', bg = 'rgba(0,0,0,.6)', scale = 1, font = 'bold 44px "Segoe UI",Arial' } = {}) {
  const c = document.createElement('canvas'); const x = c.getContext('2d');
  x.font = font; const w = Math.ceil(x.measureText(text).width) + 48;
  c.width = Math.max(128, w); c.height = 84;
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (bg) { x.fillStyle = bg; roundRect(x, 4, 8, c.width - 8, 68, 18); x.fill(); }
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.55)'; x.strokeText(text, c.width / 2, 43);
  if (color === 'rainbow') { const gr = x.createLinearGradient(24, 0, c.width - 24, 0); ['#ff5252', '#ffb13b', '#ffe45c', '#4dff8a', '#38c6ff', '#b47dff'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col)); x.fillStyle = gr; }
  else x.fillStyle = color;
  x.fillText(text, c.width / 2, 43);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  const h = 2.2 * scale; sp.scale.set(h * c.width / c.height, h, 1);
  return sp;
}
function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
export function setSpriteText(sp, text, opts) { const n = textSprite(text, opts); sp.material.map.dispose(); sp.material.map = n.material.map; sp.scale.copy(n.scale); }

export function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry && o.geometry !== BLOCK_GEO) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (!Object.values(blockMats).includes(m)) { if (m.map && !Object.values(texCache).includes(m.map)) m.map.dispose(); m.dispose(); }
    }
  });
}

// ---------- PARTICLES ----------
const parts = [];
const partGeo = new THREE.BoxGeometry(.35, .35, .35);
export function burst(pos, color, n = 10, speed = 9, life = 0.6) {
  const m = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(partGeo, m);
    p.position.copy(pos);
    p.userData = { v: new THREE.Vector3((Math.random() - .5) * speed, Math.random() * speed * .9, (Math.random() - .5) * speed), life, age: 0 };
    G.scene.add(p); parts.push(p);
  }
}
export function updateParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i], u = p.userData;
    u.age += dt; u.v.y -= 30 * dt; p.position.addScaledVector(u.v, dt);
    const s = Math.max(.01, 1 - u.age / u.life); p.scale.setScalar(s);
    if (u.age >= u.life) { G.scene.remove(p); parts.splice(i, 1); }
  }
}
