// Entry point: boot, name prompt, main loop.
import { G, loadSettings, saveSettings } from './state.js';
import { initEngine, updateEnvironment, updateParticles } from './engine.js';
import { initInput, updateCamera, closeAll } from './player.js';
import { enterHub, updateHub, openPanel, closePanel } from './hub.js';
import { updateMatch, setMatchExit, leaveMatch, matchPresenceLeft } from './match.js';
import { closeShop, closeUpgrades } from './shop.js';
import { closeInventory } from './invui.js';
import { $, show, hide, toast } from './ui.js';
import * as net from './net.js';
import { allCells, updateBlockAnims } from './grid.js';

loadSettings();
initEngine();
initInput();
setMatchExit(() => enterHub());
net.onPresenceLeave(matchPresenceLeft);

// ---------- buttons ----------
$('btnSolo').onclick = () => openPanel('solo');
$('btnMulti').onclick = () => openPanel('multi');
$('btnSettings').onclick = () => openPanel('settings');
$('panelClose').onclick = () => closePanel();
$('shopClose').onclick = () => closeShop();
$('upClose').onclick = () => closeUpgrades();
$('invClose').onclick = () => closeInventory();
$('endBack').onclick = () => leaveMatch();
$('spectateBtn').onclick = () => hide('deathScreen');
$('leaveBtn').onclick = () => { if (G.match?.over || confirm('Leave this match and go back to the hub?')) leaveMatch(); };
for (const id of ['shop', 'upgrades', 'invScreen', 'menuPanel']) $(id).addEventListener('pointerdown', (e) => { if (e.target.id === id) { closeAll(); closePanel(); } });

// ---------- name prompt ----------
function begin() {
  hide('nameModal'); hide('loading');
  enterHub();
  loop.last = performance.now(); requestAnimationFrame(loop);
}
function askName() {
  show('nameModal');
  const inp = $('nameInput'); inp.value = G.name || ''; inp.focus();
  const go = () => {
    const n = inp.value.trim().replace(/\s+/g, ' ').slice(0, 16);
    if (n.length < 2) { toast('Pick a name with at least 2 characters'); return; }
    G.name = n; saveSettings(); begin();
  };
  $('nameGo').onclick = go;
  inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
}
hide('loading');
if (G.name) begin(); else askName();

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
  G.renderer.render(G.scene, G.camera);
}

// handy for debugging from the browser console: FOB.G
window.FOB = { G, cells: allCells };
