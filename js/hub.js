// The hub lobby: a 3D plaza where everyone online spawns, walks around and picks a mode.
import { THREE, disposeGroup, mat, box, applyTheme } from './engine.js';
import { G } from './state.js';
import { TEAMS, TEAM_KEYS, PHYS, VERSION, KITS, MAPS, rankOf } from './config.js';
import { clearGrid } from './grid.js';
import { buildHubMap } from './maps.js';
import { Entity } from './entity.js';
import { updateLocalMovement, setPlayerHooks, setNpcHook, closeAll } from './player.js';
import { $, show, hide, toast, esc, chatLine, setChatHandler, canChat } from './ui.js';
import { A, levelProgress, myKit, myLevel, leaderboard, isAdmin, myLook, myRating } from './account.js';
import { openPanel, closePanel, setMenuHooks, inviteToast } from './menus.js';
import * as net from './net.js';

let hub = null;
const hubColor = (n) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TEAM_KEYS[h % 4]; };
export { openPanel, closePanel };

export function enterHub() {
  G.mode = 'hub'; G.match = null; closeAll();
  if (G.world) { G.scene.remove(G.world); disposeGroup(G.world); }
  G.world = new THREE.Group(); G.scene.add(G.world);
  G.entities.clear(); clearGrid();
  applyTheme(MAPS.classic.theme);
  const info = buildHubMap();
  hub = { info, inPortal: null, remotes: new Map(), board: makeBoard() };
  const e = new Entity({ id: G.myId, name: G.name, team: hubColor(G.name), kind: 'local' });
  e.pos.set(info.spawn.x, info.spawn.y, info.spawn.z); e.yaw = info.spawn.yaw;
  e.addToWorld(); G.local = e;
  e.avatar.setLook(myLook());
  G.onEmote = () => net.sendHubPos(G.local, true);
  G.cam.yaw = info.spawn.yaw - Math.PI; G.cam.pitch = -.18; G.cam.dist = 15; G.cam.first = false;
  hide('matchHud'); hide('hotbarWrap'); hide('endScreen'); hide('deathScreen');
  show('hubHud', 'block');
  $('hubVer').textContent = 'v' + VERSION;
  renderAccountCard(); setNetStatus();
  setChatHandler(text => { if (!canChat()) return; chatLine(G.name, text, TEAMS[e.team].css); net.sendHubChat(text); });
  setPlayerHooks({ onInteract: () => openPanel(nearPortal() || 'multi'), onTab: null, onEscape: () => closePanel() });
  setNpcHook(null);
  setMenuHooks({ reenter: () => net.leaveHub().then(enterHub), refreshCard: renderAccountCard, refreshBoard: refreshBoard });
  net.hubEvents.onPos = onHubPos; net.hubEvents.onLeave = onHubLeave; net.hubEvents.onChat = (n, t) => chatLine(n, t, TEAMS[hubColor(n)].css);
  net.hubEvents.onCount = (c) => { $('hubOnline').textContent = c + ' online'; };
  net.hubEvents.onInvite = (p) => { if (A.user && p.to === A.user.id) inviteToast(p.n, p.code); };
  net.partyEvents.onChat = (n, t) => chatLine('[Party] ' + n, t, '#8feaff');
  const lk = myLook();
  net.setHubMeta({ uid: A.user?.id || null, lvl: myLevel(), lk: [lk.skin, lk.name] });
  net.setMyPartyInfo({ kit: myKit(), lvl: myLevel(), look: lk, uid: A.user?.id || null, rating: myRating() });
  net.joinHub().then(ok => setNetStatus(ok));
  refreshBoard();
  if (net.P.code && net.P.status === 'lobby') openPanel('party');
}

export function renderAccountCard() {
  $('hubName').textContent = G.name;
  const lp = levelProgress();
  if (A.guest) {
    $('hubLevel').innerHTML = `<span class="lvlBadge guest">GUEST</span> <span class="muted small">Progress isn't saved</span> <button class="miniBtn" id="guestSignIn">Sign in / Sign up</button>`;
    $('guestSignIn').onclick = () => openPanel('account');
  } else {
    const p = A.profile, rk = rankOf(p.rating ?? 1000);
    $('hubLevel').innerHTML = `<span class="lvlBadge">LV ${lp.level}</span><span class="rankBadge" style="color:${rk.color}" title="Ranked rating">${rk.icon} ${rk.name} ${p.rating ?? 1000}</span><div class="xpBar small"><div style="width:${lp.into / lp.need * 100}%"></div></div><span class="small">${lp.into}/${lp.need} XP</span> <span class="coins">🪙 ${p.coins}</span> <span class="small muted">${KITS[p.kit]?.icon || ''} ${KITS[p.kit]?.name || ''}</span>`;
  }
  $('btnAdmin').style.display = isAdmin() ? 'inline-flex' : 'none';
  const lk = myLook(); net.setHubMeta({ lvl: myLevel(), lk: [lk.skin, lk.name] });
  G.local?.avatar.setLook(lk);
  net.setMyPartyInfo({ look: lk, kit: myKit(), lvl: myLevel(), rating: myRating() });
}

function setNetStatus(ok) {
  const el = $('hubNet');
  if (!net.online) { el.textContent = '● OFFLINE — Solo only'; el.className = 'net off'; }
  else if (ok === false) { el.textContent = '● Could not reach Supabase'; el.className = 'net off'; }
  else { el.textContent = '● ONLINE'; el.className = 'net on'; }
}

function onHubPos(id, name, d, lvl, lk, em) {
  if (G.mode !== 'hub') return;
  let r = hub.remotes.get(id);
  if (!r) {
    r = new Entity({ id, name: name || 'Player', team: hubColor(name || 'P'), kind: 'remote' });
    r.avatar.setName(`[${lvl || 1}] ${name || 'Player'}`, r.team);
    r.pos.set(d[0], d[1], d[2]); r.addToWorld(); hub.remotes.set(id, r);
  }
  if (lk) r.avatar.setLook({ skin: lk[0], name: lk[1] });
  if (em && em[1] !== r.emoteSeqSeen) { r.emoteSeqSeen = em[1]; r.avatar.playEmote(em[0]); }
  r.target.set(d[0], d[1], d[2]); r.targetYaw = d[3];
}
function onHubLeave(id) { const r = hub?.remotes.get(id); if (r) { r.removeFromWorld(); hub.remotes.delete(id); } }

function nearPortal() {
  for (const p of hub.info.portals) if (Math.hypot(G.local.pos.x - p.pos.x, G.local.pos.z - p.pos.z) < 7) return p.id;
  return null;
}

// ---------- 3D leaderboard board ----------
function makeBoard() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 640;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const frame = box(17, 21, .8, mat(0x2d3440)); frame.position.z = -.5; g.add(frame);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(16, 20), new THREE.MeshBasicMaterial({ map: t })); g.add(face);
  const post = box(1.2, 4, 1.2, mat(0x2d3440)); post.position.y = -12; g.add(post);
  g.position.set(26, 14, 14); g.rotation.y = -Math.PI / 2 + .35;
  G.world.add(g);
  const b = { canvas: c, tex: t };
  drawBoard(b, null);
  return b;
}
function drawBoard(b, rows) {
  const x = b.canvas.getContext('2d'); if (!x) return;
  const gr = x.createLinearGradient(0, 0, 0, 640); gr.addColorStop(0, '#13223a'); gr.addColorStop(1, '#0a1220');
  x.fillStyle = gr; x.fillRect(0, 0, 512, 640);
  x.fillStyle = '#ffd34e'; x.font = 'bold 40px Segoe UI, Arial'; x.textAlign = 'center'; x.fillText('🏆 TOP PLAYERS', 256, 62);
  x.font = '18px Segoe UI, Arial'; x.fillStyle = '#9fc3e6'; x.fillText('by total XP', 256, 92);
  x.textAlign = 'left';
  if (!rows) { x.fillStyle = '#7d8ea3'; x.font = '24px Segoe UI'; x.fillText(net.online ? 'Loading…' : 'Offline', 40, 160); }
  else if (!rows.length) { x.fillStyle = '#7d8ea3'; x.font = '24px Segoe UI'; x.fillText('No players yet — be the first!', 40, 160); }
  else rows.slice(0, 10).forEach((r, i) => {
    const y = 140 + i * 50;
    x.fillStyle = i % 2 ? '#ffffff08' : '#ffffff12'; x.fillRect(24, y - 32, 464, 44);
    x.fillStyle = ['#ffd34e', '#d9e2ec', '#e3a36b'][i] || '#fff'; x.font = 'bold 26px Segoe UI'; x.fillText(`${i + 1}.`, 36, y);
    x.fillStyle = '#fff'; x.fillText(String(r.username).slice(0, 16), 84, y);
    x.fillStyle = '#62e7ff'; x.font = 'bold 20px Segoe UI'; x.textAlign = 'right'; x.fillText(`Lv ${r.level}`, 476, y); x.textAlign = 'left';
  });
  b.tex.needsUpdate = true;
}
async function refreshBoard() {
  if (!hub?.board || !net.online) return;
  try { drawBoard(hub.board, await leaderboard('xp', false, 10)); } catch { drawBoard(hub.board, []); }
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
