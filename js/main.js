// Entry point: boot, name prompt, main loop.
import { G, loadSettings, saveSettings } from './state.js';
import { initEngine, updateEnvironment, updateParticles } from './engine.js';
import { initInput, updateCamera, closeAll } from './player.js';
import { enterHub, updateHub, openPanel, closePanel } from './hub.js';
import { authForm } from './menus.js';
import { A, restoreSession, signOut } from './account.js';
import { updateMatch, setMatchExit, leaveMatch, matchPresenceLeft } from './match.js';
import { closeShop, closeUpgrades } from './shop.js';
import { closeInventory } from './invui.js';
import { $, show, hide, toast } from './ui.js';
import * as net from './net.js';
import { allCells, updateBlockAnims } from './grid.js';
import { updateFx } from './fx.js';

loadSettings();
initEngine();
initInput();
setMatchExit(() => enterHub());
net.onPresenceLeave(matchPresenceLeft);

// ---------- buttons ----------
const btn = { btnSolo: 'solo', btnMulti: 'multi', btnQuick: 'quick', btnRanked: 'ranked', btnKits: 'kits', btnLocker: 'locker', btnMissions: 'missions', btnProfile: 'profile', btnLeader: 'leader', btnFriends: 'friends', btnSettings: 'settings', btnAdmin: 'admin' };
for (const [id, panel] of Object.entries(btn)) $(id).onclick = () => openPanel(panel);
$('panelClose').onclick = () => closePanel();
$('shopClose').onclick = () => closeShop();
$('upClose').onclick = () => closeUpgrades();
$('invClose').onclick = () => closeInventory();
$('endBack').onclick = () => leaveMatch();
$('spectateBtn').onclick = () => hide('deathScreen');
$('leaveBtn').onclick = () => { if (G.match?.over || confirm('Leave this match and go back to the hub?')) leaveMatch(); };
for (const id of ['shop', 'upgrades', 'invScreen', 'menuPanel']) $(id).addEventListener('pointerdown', (e) => { if (e.target.id === id) { closeAll(); closePanel(); } });

// ---------- start screen ----------
let started = false;
function begin() {
  hide('nameModal'); hide('loading');
  enterHub();
  if (!started) { started = true; loop.last = performance.now(); requestAnimationFrame(loop); }
}
async function boot() {
  // already logged in on this device? jump straight in
  if (await restoreSession()) {
    if (A.profile.banned) { await signOut(); hide('loading'); show('bannedModal'); return; }
    begin(); return;
  }
  hide('loading'); show('nameModal');
  authForm($('authBody'), begin);
}
boot();

// ---------- main loop (fixed 60 Hz simulation, render every frame) ----------
const STEP = 1 / 60;
let acc = 0;
function loop(t) {
  requestAnimationFrame(loop);
  let dt = Math.min(.25, (t - loop.last) / 1000); loop.last = t;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 8) {
    if (G.mode === 'hub') updateHub(STEP);
    else if (G.mode === 'match') updateMatch(STEP);
    G.time += STEP; acc -= STEP; steps++;
  }
  if (steps >= 8) acc = 0;
  updateCamera(dt);
  updateEnvironment(dt);
  updateParticles(dt);
  updateBlockAnims(dt);
  updateFx(dt);
  G.renderer.render(G.scene, G.camera);
}

// handy for debugging from the browser console: FOB.G
window.FOB = { G, cells: allCells };
