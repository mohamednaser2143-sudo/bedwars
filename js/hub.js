// The hub lobby: a 3D plaza where everyone online spawns, walks around and picks a mode.
import { THREE, disposeGroup } from './engine.js';
import { G, saveSettings } from './state.js';
import { TEAMS, TEAM_KEYS, BOT_DIFF, BOT_NAMES, PHYS, VERSION } from './config.js';
import { clearGrid } from './grid.js';
import { buildHubMap } from './maps.js';
import { Entity } from './entity.js';
import { updateLocalMovement, setPlayerHooks, setNpcHook, closeAll } from './player.js';
import { startMatch } from './match.js';
import { $, show, hide, toast, esc, chatLine, setChatHandler, canChat } from './ui.js';
import { sfx, setVolume } from './audio.js';
import * as net from './net.js';

let hub = null;
const hubColor = (n) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TEAM_KEYS[h % 4]; };

export function enterHub() {
  G.mode = 'hub'; G.match = null; closeAll();
  if (G.world) { G.scene.remove(G.world); disposeGroup(G.world); }
  G.world = new THREE.Group(); G.scene.add(G.world);
  G.entities.clear(); clearGrid();
  const info = buildHubMap();
  hub = { info, inPortal: null, remotes: new Map() };
  const e = new Entity({ id: G.myId, name: G.name, team: hubColor(G.name), kind: 'local' });
  e.pos.set(info.spawn.x, info.spawn.y, info.spawn.z); e.yaw = info.spawn.yaw;
  e.addToWorld(); G.local = e;
  G.cam.yaw = info.spawn.yaw - Math.PI; G.cam.pitch = -.18; G.cam.dist = 15; G.cam.first = false;
  hide('matchHud'); hide('hotbarWrap'); hide('endScreen'); hide('deathScreen');
  show('hubHud', 'block');
  $('hubName').textContent = G.name; $('hubVer').textContent = 'v' + VERSION;
  setNetStatus();
  setChatHandler(text => { if (!canChat()) return; chatLine(G.name, text, TEAMS[e.team].css); net.sendHubChat(text); });
  setPlayerHooks({ onInteract: () => openPanel(nearPortal() || 'multi'), onTab: null, onEscape: () => closePanel() });
  setNpcHook(null);
  net.hubEvents.onPos = onHubPos; net.hubEvents.onLeave = onHubLeave; net.hubEvents.onChat = (n, t) => chatLine(n, t, TEAMS[hubColor(n)].css);
  net.hubEvents.onCount = (c) => { $('hubOnline').textContent = c + ' online'; };
  net.partyEvents.onChat = (n, t) => chatLine('[Party] ' + n, t, '#8feaff');
  net.joinHub().then(ok => setNetStatus(ok));
  if (net.P.code && net.P.status === 'lobby') openPanel('party');
}

function setNetStatus(ok) {
  const el = $('hubNet');
  if (!net.online) { el.textContent = '● OFFLINE — Solo only'; el.className = 'net off'; }
  else if (ok === false) { el.textContent = '● Could not reach Supabase'; el.className = 'net off'; }
  else { el.textContent = '● ONLINE'; el.className = 'net on'; }
}

function onHubPos(id, name, d) {
  if (G.mode !== 'hub') return;
  let r = hub.remotes.get(id);
  if (!r) { r = new Entity({ id, name: name || 'Player', team: hubColor(name || 'P'), kind: 'remote' }); r.pos.set(d[0], d[1], d[2]); r.addToWorld(); hub.remotes.set(id, r); }
  r.target.set(d[0], d[1], d[2]); r.targetYaw = d[3];
}
function onHubLeave(id) { const r = hub?.remotes.get(id); if (r) { r.removeFromWorld(); hub.remotes.delete(id); } }

function nearPortal() {
  for (const p of hub.info.portals) if (Math.hypot(G.local.pos.x - p.pos.x, G.local.pos.z - p.pos.z) < 7) return p.id;
  return null;
}

export function updateHub(dt) {
  if (!hub) return;
  const e = G.local;
  updateLocalMovement(dt);
  if (e.pos.y < PHYS.voidY) { const s = hub.info.spawn; e.pos.set(s.x, s.y + 2, s.z); e.vel.set(0, 0, 0); toast('Whoops! Back to spawn'); }
  net.sendHubPos(e);
  for (const r of hub.remotes.values()) {
    const gap = r.pos.distanceTo(r.target);
    if (gap > 20) r.pos.copy(r.target); else r.pos.lerp(r.target, 1 - Math.exp(-10 * dt));
    let d = r.targetYaw - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); r.yaw += d * Math.min(1, dt * 10);
    r.avatar.group.rotation.y = r.yaw; r.avatar.animate(dt, gap > .2, r.pos.y > .4);
  }
  for (const p of hub.info.portals) p.glow.material.opacity = .4 + Math.sin(performance.now() / 300) * .15;
  const np = nearPortal();
  if (np && hub.inPortal !== np && !G.uiOpen) { hub.inPortal = np; openPanel(np); }
  if (!np) hub.inPortal = null;
  $('clickToPlay').style.display = !G.input.locked && !G.uiOpen ? 'block' : 'none';
}

// ================= PANELS =================
let soloCfg = { diff: 'normal', layout: '4' };
export function openPanel(which) {
  G.uiOpen = 'panel'; if (document.pointerLockElement) document.exitPointerLock();
  show('menuPanel'); sfx.click();
  const body = $('panelBody');
  if (which === 'solo') {
    $('panelTitle').textContent = '🤖 Solo vs Bots';
    body.innerHTML = `
      <p class="muted">Play a full BedWars match against computer players. Works offline too.</p>
      <div class="lbl">BOT DIFFICULTY</div>
      <div class="seg" id="segDiff">${Object.entries(BOT_DIFF).map(([k, d]) => `<button data-v="${k}" class="${soloCfg.diff === k ? 'on' : ''}">${d.label}</button>`).join('')}</div>
      <div class="lbl">MATCH TYPE</div>
      <div class="seg" id="segLayout">
        <button data-v="2" class="${soloCfg.layout === '2' ? 'on' : ''}">1v1 (2 teams)</button>
        <button data-v="4" class="${soloCfg.layout === '4' ? 'on' : ''}">Solos (4 teams)</button>
        <button data-v="d" class="${soloCfg.layout === 'd' ? 'on' : ''}">Duos (bot teammate)</button>
      </div>
      <button class="bigBtn" id="soloStart">▶ START MATCH</button>`;
    body.querySelector('#segDiff').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; soloCfg.diff = b.dataset.v; openPanel('solo'); };
    body.querySelector('#segLayout').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; soloCfg.layout = b.dataset.v; openPanel('solo'); };
    body.querySelector('#soloStart').onclick = startSolo;
  } else if (which === 'multi') {
    if (net.P.code) return openPanel('party');
    $('panelTitle').textContent = '🌐 Multiplayer';
    body.innerHTML = net.online ? `
      <p class="muted">Create a private party and send the code to your friends, or join theirs.</p>
      <button class="bigBtn" id="mpCreate">＋ CREATE PARTY</button>
      <div class="lbl">JOIN WITH CODE</div>
      <div class="row"><input id="mpCode" maxlength="6" placeholder="ABC123" autocomplete="off"><button class="btn" id="mpJoin">JOIN</button></div>
      <p class="muted small" id="mpStatus"></p>` : `<p class="muted">Multiplayer needs a connection to Supabase, which couldn't be reached. Check your internet (or ad-blocker / VPN) and refresh. Solo vs Bots still works.</p>`;
    if (!net.online) return;
    const code = body.querySelector('#mpCode');
    code.oninput = () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
    code.onkeydown = (ev) => { if (ev.key === 'Enter') body.querySelector('#mpJoin').click(); };
    body.querySelector('#mpCreate').onclick = async () => {
      $('mpStatus').textContent = 'Creating party...';
      try { await net.createParty(); openPanel('party'); toast('Party created — share the code!', 'good'); }
      catch { $('mpStatus').textContent = 'Could not create a party. Try again.'; }
    };
    body.querySelector('#mpJoin').onclick = async () => {
      const c = code.value.trim(); if (c.length !== 6) { $('mpStatus').textContent = 'Codes are 6 characters'; return; }
      $('mpStatus').textContent = 'Looking for party ' + c + '...';
      try { await net.joinParty(c); openPanel('party'); toast('Joined the party!', 'good'); }
      catch (err) { $('mpStatus').textContent = err.message === 'full' ? 'That party is full.' : err.message === 'started' ? 'That match already started.' : 'Party not found. Check the code.'; }
    };
  } else if (which === 'party') renderParty();
  else if (which === 'settings') renderSettings();
}
export function closePanel() { hide('menuPanel'); if (G.uiOpen === 'panel') G.uiOpen = null; net.partyEvents.onUpdate = null; }

function startSolo() {
  const me = { id: G.myId, name: G.name, team: 'blue' };
  const roster = [me]; let n = 0;
  const pick = () => BOT_NAMES[(n++ + Math.floor(Math.random() * 16)) % BOT_NAMES.length] + ' (Bot)';
  const teams = soloCfg.layout === '2' ? ['blue', 'red'] : TEAM_KEYS;
  const per = soloCfg.layout === 'd' ? 2 : 1;
  for (const t of teams) {
    const have = t === 'blue' ? 1 : 0;
    for (let k = have; k < per; k++) roster.push({ id: `bot_${t}_${k}`, name: pick(), team: t, bot: true, diff: soloCfg.diff });
  }
  closePanel(); net.leaveHub();
  startMatch({ online: false, roster });
}

function renderParty() {
  const P = net.P;
  if (!P.code) { openPanel('multi'); return; }
  net.partyEvents.onUpdate = () => { if (G.uiOpen === 'panel' && $('partyBox')) renderParty(); };
  net.partyEvents.onClosed = () => { toast('The party was closed'); if (G.uiOpen === 'panel') openPanel('multi'); };
  net.partyEvents.onError = (r) => toast(r === 'full' ? 'Party is full' : 'That match already started');
  net.partyEvents.onStart = (msg) => { closePanel(); net.leaveHub(); startMatch({ online: true, hostId: msg.hostId, roster: msg.roster }); };
  $('panelTitle').textContent = '👥 Party';
  const cap = net.teamCap(), S = P.settings;
  const teams = TEAM_KEYS.map(t => {
    const ps = Object.entries(P.players).filter(([, p]) => p.team === t);
    const slots = [];
    for (let i = 0; i < cap; i++) { const pl = ps[i]; slots.push(pl ? `<div class="ps ${pl[0] === G.myId ? 'me' : ''}">${esc(pl[1].name)}${pl[0] === P.hostId ? ' 👑' : ''}</div>` : `<div class="ps empty">${S.bots ? '🤖 Bot' : 'Open'}</div>`); }
    return `<div class="pteam" data-t="${t}" style="--c:${TEAMS[t].css}"><b>${TEAMS[t].name}</b>${slots.join('')}<small>click to join</small></div>`;
  }).join('');
  $('panelBody').innerHTML = `
    <div id="partyBox">
      <div class="codeRow"><span>PARTY CODE</span><b id="pcode">${P.code}</b><button class="btn" id="pcopy">COPY</button></div>
      <div class="pteams">${teams}</div>
      ${P.isHost ? `
      <div class="lbl">MODE</div>
      <div class="seg" id="pMode"><button data-v="solos" class="${S.mode === 'solos' ? 'on' : ''}">Solos (1 per team)</button><button data-v="duos" class="${S.mode === 'duos' ? 'on' : ''}">Duos (2 per team)</button></div>
      <div class="lbl">EMPTY SLOTS</div>
      <div class="seg" id="pBots"><button data-v="1" class="${S.bots ? 'on' : ''}">Fill with bots</button><button data-v="0" class="${!S.bots ? 'on' : ''}">Leave empty</button></div>
      ${S.bots ? `<div class="seg" id="pDiff">${Object.entries(BOT_DIFF).map(([k, d]) => `<button data-v="${k}" class="${S.diff === k ? 'on' : ''}">${d.label}</button>`).join('')}</div>` : ''}
      <button class="bigBtn" id="pStart">▶ START MATCH</button>` : `<p class="muted">Waiting for the host to start… (${S.mode === 'duos' ? 'Duos' : 'Solos'}${S.bots ? ', bots fill empty slots' : ''})</p>`}
      <button class="btn ghost" id="pLeave">← Leave party</button>
    </div>`;
  const b = $('panelBody');
  b.querySelector('#pcopy').onclick = async () => { try { await navigator.clipboard.writeText(P.code); toast('Code copied!'); } catch { toast('Code: ' + P.code); } };
  b.querySelector('.pteams').onclick = (ev) => { const t = ev.target.closest('.pteam'); if (t) { net.requestTeam(t.dataset.t); sfx.click(); } };
  b.querySelector('#pLeave').onclick = async () => { await net.leaveParty(); openPanel('multi'); };
  if (P.isHost) {
    b.querySelector('#pMode').onclick = (ev) => { const x = ev.target.closest('button'); if (x) net.setSettings({ mode: x.dataset.v }); };
    b.querySelector('#pBots').onclick = (ev) => { const x = ev.target.closest('button'); if (x) net.setSettings({ bots: x.dataset.v === '1' }); };
    b.querySelector('#pDiff')?.addEventListener('click', (ev) => { const x = ev.target.closest('button'); if (x) net.setSettings({ diff: x.dataset.v }); });
    b.querySelector('#pStart').onclick = () => {
      const teamsUsed = new Set(Object.values(P.players).map(p => p.team));
      if (!S.bots && teamsUsed.size < 2) { toast('Need players on at least 2 teams (or turn on bots)'); return; }
      const msg = net.startPartyMatch(); if (!msg) return;
      closePanel(); net.leaveHub();
      startMatch({ online: true, hostId: G.myId, roster: msg.roster });
    };
  }
}

function renderSettings() {
  $('panelTitle').textContent = '⚙️ Settings';
  const s = G.settings;
  $('panelBody').innerHTML = `
    <div class="lbl">DISPLAY NAME</div><div class="row"><input id="setName" maxlength="16" value="${esc(G.name)}"><button class="btn" id="setNameBtn">SAVE</button></div>
    <div class="lbl">MOUSE SENSITIVITY <span id="sensV">${s.sens.toFixed(1)}</span></div><input type="range" id="setSens" min="0.3" max="3" step="0.1" value="${s.sens}">
    <div class="lbl">VOLUME <span id="volV">${Math.round(s.volume * 100)}%</span></div><input type="range" id="setVol" min="0" max="1" step="0.05" value="${s.volume}">
    <div class="lbl">FIELD OF VIEW <span id="fovV">${s.fov}</span></div><input type="range" id="setFov" min="55" max="100" step="1" value="${s.fov}">
    <div class="lbl">SHADOWS</div><div class="seg" id="setSh"><button data-v="1" class="${s.shadows ? 'on' : ''}">On</button><button data-v="0" class="${!s.shadows ? 'on' : ''}">Off (faster)</button></div>
    <p class="muted small">Controls: WASD move • Space jump • Click to lock mouse • 1-9 hotbar • E inventory • F shop/interact • V first person • Scroll zoom • T chat • Tab scores • M mute • B fullscreen</p>`;
  const b = $('panelBody');
  b.querySelector('#setNameBtn').onclick = () => { const n = b.querySelector('#setName').value.trim().replace(/\s+/g, ' ').slice(0, 16); if (!n) return; G.name = n; saveSettings(); toast('Name saved — rejoining hub'); closePanel(); net.leaveHub().then(enterHub); };
  b.querySelector('#setSens').oninput = (e) => { s.sens = +e.target.value; $('sensV').textContent = s.sens.toFixed(1); saveSettings(); };
  b.querySelector('#setVol').oninput = (e) => { setVolume(+e.target.value); $('volV').textContent = Math.round(s.volume * 100) + '%'; saveSettings(); };
  b.querySelector('#setFov').oninput = (e) => { s.fov = +e.target.value; $('fovV').textContent = s.fov; G.camera.fov = s.fov; G.camera.updateProjectionMatrix(); saveSettings(); };
  b.querySelector('#setSh').onclick = (e) => { const x = e.target.closest('button'); if (!x) return; s.shadows = x.dataset.v === '1'; G.renderer.shadowMap.enabled = s.shadows; G.scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } }); saveSettings(); renderSettings(); };
}
