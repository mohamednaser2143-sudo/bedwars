// Shared game state. Every module imports G and reads/writes it.
export const G = {
  mode: 'boot',            // 'boot' | 'hub' | 'match'
  scene: null, camera: null, renderer: null, sun: null,
  world: null,             // THREE.Group holding the current map (hub or match)
  local: null,             // local player Entity
  entities: new Map(),     // id -> Entity (players, remotes, bots) in the current world
  match: null,             // current match state (match.js)
  time: 0,                 // seconds since start
  now: () => performance.now(),
  myId: (crypto.randomUUID ? crypto.randomUUID() : 'p' + Date.now() + Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20),
  name: '',
  settings: { sens: 1, volume: 0.6, shadows: true, fov: 72 },
  cam: { yaw: 0, pitch: -0.25, dist: 15, first: false },
  input: { keys: {}, mouseL: false, mouseR: false, locked: false, typing: false },
  uiOpen: null,            // name of an open overlay (inventory/shop/etc) or null
  selected: 0,             // hotbar slot 0..8
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('fob_settings') || '{}');
    Object.assign(G.settings, s);
    G.name = localStorage.getItem('fob_name') || '';
  } catch {}
}
export function saveSettings() {
  try {
    localStorage.setItem('fob_settings', JSON.stringify(G.settings));
    localStorage.setItem('fob_name', G.name);
  } catch {}
}
