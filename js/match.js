// Match lifecycle: setup, generators, respawns, sync, HUD, win screen.
import { THREE, disposeGroup, setSpriteText, burst } from './engine.js';
import { G } from './state.js';
import { TEAMS, TEAM_KEYS, GEN, COMBAT, PHYS, ITEMS, ARMOR, UPGRADES, CURRENCY } from './config.js';
import { clearGrid, setCell, removeCell, getCell, cellX, cellY } from './grid.js';
import { moveEntity } from './physics.js';
import { buildMatchMap } from './maps.js';
import { Entity } from './entity.js';
import { initBotAI, updateBot } from './bots.js';
import { applyHit, killEntity, onKillEvent, updateProjectiles, clearProjectiles, remoteProjectile, remoteProjectileEnd } from './combat.js';
import { applyBedDestroyed, destroyBed } from './actions.js';
import { updateLocalMovement, updateMatchActions, resetActions, shake, setPlayerHooks, setNpcHook, closeAll } from './player.js';
import { buildHotbar, renderHotbar, renderResources, selectSlot } from './invui.js';
import { openShop, openUpgrades } from './shop.js';
import { $, show, hide, toast, bigMessage, esc, chatLine, setChatHandler, canChat } from './ui.js';
import { sfx } from './audio.js';
import * as net from './net.js';

let onExit = null;
export function setMatchExit(fn) { onExit = fn; }

// cfg: { online, hostId, roster:[{id,name,team,bot,diff}] }
export function startMatch(cfg) {
  G.mode = 'match';
  if (G.world) { G.scene.remove(G.world); disposeGroup(G.world); }
  G.world = new THREE.Group(); G.scene.add(G.world);
  G.entities.clear(); clearGrid(); clearProjectiles(); resetActions(); closeAll();

  const teams = [...new Set(cfg.roster.map(r => r.team))];
  const map = buildMatchMap(teams);
  const m = G.match = {
    online: !!cfg.online, hostId: cfg.hostId || G.myId, teams, over: false, startedAt: performance.now(),
    beds: map.beds, spawns: map.spawns, gens: map.gens, npcs: map.npcs, noBuild: map.noBuild,
    teamUp: Object.fromEntries(TEAM_KEYS.map(t => [t, { sharp: 0, prot: 0, haste: 0, forge: 0, heal: 0, trap: 0 }])),
    stats: {}, roster: cfg.roster,
    send: (k, d) => { if (m.online) net.sendMatch(k, d); },
    isAuth: () => !m.online || net.authorityId(m.hostId) === G.myId,
    statFor: (id, name, team) => { if (!id) return null; return m.stats[id] ||= { name, team, kills: 0, finals: 0, beds: 0, deaths: 0 }; },
    teamAlive: (t) => m.beds[t]?.alive || [...G.entities.values()].some(e => e.team === t && !e.finalDead && e.connected),
    checkElimination, shake, onLocalDeath, onLocalHurt, onLocalChanged: () => sendState(true), onBedsChanged: renderTeams,
  };
  m.wasAuth = m.isAuth();

  for (const r of cfg.roster) {
    const kind = r.id === G.myId ? 'local' : r.bot && m.isAuth() ? 'bot' : 'remote';
    const e = new Entity({ id: r.id, name: r.name, team: r.team, kind });
    e.isBot = !!r.bot; e.diff = r.diff || 'normal';
    e.inv.add('wood_sword', 1); e.held = 'wood_sword'; e.avatar.setHeld('wood_sword');
    spawnAt(e);
    if (kind === 'bot') initBotAI(e, e.diff);
    e.addToWorld();
    m.statFor(e.id, e.name, e.team);
    if (kind === 'local') G.local = e;
  }
  G.selected = 0;
  // camera faces the middle
  const sp = m.spawns[G.local.team]; G.cam.yaw = sp.yaw - Math.PI; G.cam.pitch = -.2; G.cam.first = false; G.cam.dist = 15;

  // UI
  hide('hubHud'); hide('menuPanel'); hide('endScreen'); hide('deathScreen');
  show('matchHud', 'block'); show('hotbarWrap', 'flex');
  buildHotbar(); renderHotbar(true); renderResources(); renderTeams();
  const T = TEAMS[G.local.team];
  $('teamBadge').textContent = T.name.toUpperCase() + ' TEAM'; $('teamBadge').style.background = T.css;
  bigMessage('BED WARS', `Protect your bed and destroy the others!`, T.css, 3200);
  setChatHandler(text => { if (!canChat()) return; chatLine(G.name, text, T.css); m.send('chat', { n: G.name, t: text, tm: G.local.team }); });
  setPlayerHooks({ onInteract: interact, onTab: (on) => { if (on) renderScoreboard(); $('scoreboard').style.display = on ? 'block' : 'none'; }, onEscape: null });
  setNpcHook(() => npcInFront() ? (interact(), true) : false);
  if (m.online) net.onMatch(onNet);
  G.renderer.domElement.focus();
}

function spawnAt(e) {
  const s = G.match.spawns[e.team];
  e.pos.set(s.x + (Math.random() - .5) * 2, s.y + .5, s.z + (Math.random() - .5) * 2);
  e.yaw = s.yaw; e.avatar.group.rotation.y = s.yaw;
  e.vel.set(0, 0, 0); e.kb.set(0, 0, 0);
  e.target.copy(e.pos); e.targetYaw = e.yaw;
}

function respawn(e) {
  spawnAt(e); e.hp = 100; e.dead = false; e.setVisible(true);
  e.invulnUntil = performance.now() + COMBAT.spawnProtect; e.lastHit = null;
  e.held = e.inv.best('sword'); e.avatar.setHeld(e.held); e.avatar.setArmor(e.armor);
  if (e.kind === 'local') { hide('deathScreen'); renderHotbar(true); renderResources(); toast('Respawned!'); sendState(true); }
}

// ---------- LOCAL EVENTS ----------
let deathTimer = null;
function onLocalDeath(ev) {
  const e = G.local; renderHotbar(true); renderResources();
  show('deathScreen');
  $('deathTitle').textContent = ev.final ? 'FINAL DEATH' : 'YOU DIED';
  if (ev.final) { $('deathText').textContent = 'Your bed is gone. You are out — you can keep watching.'; $('spectateBtn').style.display = 'inline-block'; }
  else {
    $('spectateBtn').style.display = 'none';
    clearInterval(deathTimer);
    const tick = () => { const s = Math.max(0, Math.ceil((e.respawnAt - performance.now()) / 1000)); $('deathText').textContent = `Respawning in ${s}...`; if (s <= 0) clearInterval(deathTimer); };
    tick(); deathTimer = setInterval(tick, 250);
  }
  sendState(true);
}
function onLocalHurt() { const v = $('hurtFx'); v.classList.remove('on'); void v.offsetWidth; v.classList.add('on'); sendState(true); }

function npcInFront() {
  const e = G.local; const look = new THREE.Vector3(-Math.sin(G.cam.yaw), 0, -Math.cos(G.cam.yaw));
  for (const n of G.match.npcs) {
    if (n.team !== e.team) continue;
    const d = new THREE.Vector3(n.pos.x - e.pos.x, 0, n.pos.z - e.pos.z); const l = d.length();
    if (l < 8 && (l < 2.5 || d.normalize().dot(look) > .55)) return n;
  }
  return null;
}
function nearNpc() { const e = G.local; let best = null, bd = 8; for (const n of G.match.npcs) { if (n.team !== e.team) continue; const d = Math.hypot(n.pos.x - e.pos.x, n.pos.z - e.pos.z); if (d < bd) { bd = d; best = n; } } return best; }
function interact() {
  if (G.mode !== 'match' || !G.local.alive || G.uiOpen) return;
  const n = npcInFront() || nearNpc();
  if (!n) { toast('Walk up to your Item Shop or Team Upgrades NPC'); return; }
  if (n.type === 'shop') openShop(); else openUpgrades();
}

// ---------- SYNC ----------
let lastSend = 0, lastBots = 0, lastSig = '';
function sendState(force = false) {
  const m = G.match; if (!m?.online) return;
  const e = G.local, now = performance.now();
  if (!force && now - lastSend < 110) return;
  const d = [+e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2), +e.yaw.toFixed(2), Math.round(e.hp), e.dead ? 1 : 0, e.finalDead ? 1 : 0, e.heldItem() || '', e.armor, e.atkSeq];
  const sig = d.join('|');
  if (!force && sig === lastSig && now - lastSend < 1000) return;
  lastSig = sig; lastSend = now;
  m.send('s', { d });
}
function sendBots() {
  const m = G.match, now = performance.now(); if (!m.online || now - lastBots < 150) return; lastBots = now;
  const l = [];
  for (const e of G.entities.values()) if (e.kind === 'bot') l.push([e.id, +e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2), +e.yaw.toFixed(2), Math.round(e.hp), e.dead ? 1 : 0, e.finalDead ? 1 : 0, e.held || '', e.armor, e.atkSeq]);
  if (l.length) m.send('bots', { l });
}
function applyRemoteState(e, d) {
  const [x, y, z, yaw, hp, dead, fd, held, armor, atk] = d;
  const jump = e.target.distanceTo(new THREE.Vector3(x, y, z)) > 16;
  e.target.set(x, y, z); e.targetYaw = yaw;
  if (jump) e.pos.copy(e.target);
  e.hp = hp; e.dead = !!dead; e.finalDead = !!fd; e.held = held || null;
  if (e.armor !== armor) { e.armor = armor; e.avatar.setArmor(armor); }
  e.avatar.setHeld(e.held);
  if (atk !== e.atkSeq) { e.atkSeq = atk; e.avatar.swing(); }
  e.setVisible(!e.dead && !e.finalDead);
}

function onNet(p) {
  const m = G.match; if (!m || p.from === G.myId) return;
  switch (p.k) {
    case 's': { const e = G.entities.get(p.from); if (e && e.kind === 'remote') applyRemoteState(e, p.d); break; }
    case 'bots': for (const d of p.l) { const e = G.entities.get(d[0]); if (e && e.kind === 'remote') applyRemoteState(e, d.slice(1)); } break;
    case 'hit': { const v = G.entities.get(p.v); if (v && (v.kind === 'local' || v.kind === 'bot')) applyHit(v, p.raw, p.src); break; }
    case 'kill': onKillEvent(p); break;
    case 'proj': remoteProjectile(p); break;
    case 'projEnd': remoteProjectileEnd(p); break;
    case 'blk': setCell(p.c[0], p.c[1], p.c[2], p.t, { team: p.tm }); break;
    case 'blkRm': for (const c of p.c) { const cell = getCell(c[0], c[1], c[2]); if (cell && cell.type !== 'bed') { removeCell(c[0], c[1], c[2]); burst(new THREE.Vector3(cellX(c[0]), cellY(c[1]), c[2] * 3), cell.type === 'wool' ? TEAMS[cell.team]?.color ?? 0xffffff : 0x999999, 8, 9); } } break;
    case 'bedBreak': if (m.isAuth()) destroyBed(p.team, p.by, p.byTeam, p.byId); break;
    case 'bed': applyBedDestroyed(p.team, p.by, p.byTeam, p.byId); break;
    case 'upg': if (m.teamUp[p.team]) m.teamUp[p.team][p.key] = p.lvl; if (p.team === G.local.team && p.from !== G.myId && p.lvl > 0) toast(`${UPGRADES[p.key].name} unlocked by a teammate!`, 'good'); break;
    case 'gen': if (m.gens[p.i]) m.gens[p.i].n = p.n; break;
    case 'claim': if (m.isAuth()) { const g = m.gens[p.i]; if (g && g.n > 0) { m.send('grant', { to: p.from, i: p.i, n: g.n, cur: g.kind }); g.n = 0; m.send('gen', { i: p.i, n: 0 }); } } break;
    case 'grant': if (p.to === G.myId) { G.local.inv.res[p.cur] += p.n; sfx.pickup(); toast(`+${p.n} ${CURRENCY[p.cur].name}`); renderResources(); } break;
    case 'fx': if (p.v === G.myId || G.entities.get(p.v)?.kind === 'bot') { const e = G.entities.get(p.v); if (e) e.effects.slow = performance.now() + p.ms; } break;
    case 'end': if (!m.over) endMatch(p.winner); break;
    case 'chat': chatLine(p.n, p.t, TEAMS[p.tm]?.css || '#fff'); break;
    case 'left': playerLeft(p.id); break;
  }
}

function playerLeft(id) {
  const e = G.entities.get(id); const m = G.match;
  if (e && e.kind === 'remote' && !e.isBot) { e.connected = false; e.finalDead = true; e.setVisible(false); toast(`${e.name} left the match`); }
  // if the host left, the next player takes over the bots
  if (m.isAuth() && !m.wasAuth) {
    m.wasAuth = true;
    for (const b of G.entities.values()) if (b.isBot && b.kind === 'remote') {
      b.kind = 'bot'; b.pos.copy(b.target); b.inv.clear(); b.inv.add(b.held && ITEMS[b.held]?.type === 'sword' ? b.held : 'wood_sword', 1); b.inv.add('wool', 32); b.inv.res.iron = 20;
      initBotAI(b, b.diff);
    }
    toast('You are now hosting this match');
  }
  checkElimination();
}
export function matchPresenceLeft(id) { if (G.mode === 'match') onNet({ k: 'left', id, from: '_' }); }

// ---------- ELIMINATION / WIN ----------
function checkElimination() {
  const m = G.match; if (!m || m.over || !m.isAuth()) return;
  if (performance.now() - m.startedAt < 1500) return;
  const alive = m.teams.filter(t => m.teamAlive(t));
  if (alive.length <= 1) { const w = alive[0] || null; m.send('end', { winner: w }); endMatch(w); }
}

function endMatch(winner) {
  const m = G.match; m.over = true; closeAll();
  if (document.pointerLockElement) document.exitPointerLock();
  const won = winner && winner === G.local.team;
  if (won) sfx.win(); else sfx.death();
  hide('deathScreen');
  $('endTitle').textContent = won ? 'VICTORY!' : winner ? 'DEFEAT' : 'GAME OVER';
  $('endTitle').style.color = won ? '#ffd34e' : '#ff5252';
  $('endSub').innerHTML = winner ? `<b style="color:${TEAMS[winner].css}">${TEAMS[winner].name} Team</b> wins the match` : 'No team survived';
  $('endStats').innerHTML = scoreTable();
  show('endScreen');
}
function scoreTable() {
  const rows = Object.entries(G.match.stats).sort((a, b) => (b[1].finals * 3 + b[1].kills + b[1].beds * 4) - (a[1].finals * 3 + a[1].kills + a[1].beds * 4));
  return `<table><tr><th>Player</th><th>Kills</th><th>Finals</th><th>Beds</th><th>Deaths</th></tr>${rows.map(([id, s]) => `<tr class="${id === G.myId ? 'me' : ''}"><td style="color:${TEAMS[s.team]?.css}">${esc(s.name)}</td><td>${s.kills}</td><td>${s.finals}</td><td>${s.beds}</td><td>${s.deaths}</td></tr>`).join('')}</table>`;
}
function renderScoreboard() { $('scoreboard').innerHTML = '<div class="sbT">SCOREBOARD — hold Tab</div>' + scoreTable(); }

export function leaveMatch() {
  clearInterval(deathTimer);
  hide('endScreen'); hide('deathScreen'); hide('matchHud'); hide('hotbarWrap'); hide('scoreboard');
  if (G.match?.online) net.leaveParty();
  G.match = null;
  for (const e of [...G.entities.values()]) e.removeFromWorld();
  clearProjectiles();
  onExit?.();
}

// ---------- HUD ----------
function renderTeams() {
  const m = G.match; if (!m) return;
  $('teamsBar').innerHTML = m.teams.map(t => {
    const alive = [...G.entities.values()].filter(e => e.team === t && !e.finalDead && e.connected).length;
    const ok = m.beds[t].alive;
    return `<div class="tb ${m.teamAlive(t) ? '' : 'out'}" style="--c:${TEAMS[t].css}"><span class="tbDot"></span><b>${TEAMS[t].name[0]}</b><span>${ok ? '🛏️✓' : alive ? alive : '✗'}</span></div>`;
  }).join('');
}
let hudT = 0;
function updateHud(dt) {
  hudT += dt; if (hudT < .1) return; hudT = 0;
  const e = G.local, m = G.match;
  $('hpFill').style.width = e.hp + '%';
  $('hpFill').style.background = e.hp > 60 ? '#3ddc6b' : e.hp > 30 ? '#ffc23d' : '#ff4b4b';
  $('hpText').textContent = Math.ceil(e.hp) + ' / 100';
  $('lowHp').style.opacity = e.alive && e.hp < 35 ? (1 - e.hp / 35) * .8 : 0;
  renderResources(); renderHotbar(); renderTeams();
  const now = performance.now(); const fx = [];
  if (e.effects.speed > now) fx.push(`⚡ ${Math.ceil((e.effects.speed - now) / 1000)}s`);
  if (e.effects.jump > now) fx.push(`🫧 ${Math.ceil((e.effects.jump - now) / 1000)}s`);
  if (e.effects.slow > now) fx.push(`🐌 ${Math.ceil((e.effects.slow - now) / 1000)}s`);
  const up = m.teamUp[e.team]; const ups = Object.keys(UPGRADES).filter(k => up[k]).map(k => UPGRADES[k].icon + (UPGRADES[k].costs.length > 1 ? up[k] : '')).join(' ');
  $('effects').textContent = [ARMOR[e.armor].name + ' armor', ups, ...fx].filter(Boolean).join('  •  ');
  const n = nearNpc();
  $('hint').style.display = n && !G.uiOpen && e.alive ? 'block' : 'none';
  if (n) $('hint').textContent = n.type === 'shop' ? '🛒 Press F or click — Item Shop' : '⚙️ Press F or click — Team Upgrades';
  if (!G.input.locked && !G.uiOpen && !m.over && e.alive) $('clickToPlay').style.display = 'block'; else $('clickToPlay').style.display = 'none';
}

// ---------- GENERATORS ----------
function genLabel(g, text) { if (g.lastTxt !== text) { g.lastTxt = text; setSpriteText(g.label, text, { color: g.kind === 'diamond' ? '#7eeaff' : g.kind === 'emerald' ? '#7dffb0' : '#fff', bg: 'rgba(8,14,24,.8)', scale: g.kind === 'team' ? .55 : .62 }); } }
function updateGens(dt) {
  const m = G.match, auth = m.isAuth();
  for (let i = 0; i < m.gens.length; i++) {
    const g = m.gens[i];
    if (g.spin) g.spin.rotation.y += dt * 1.5;
    if (g.kind === 'team') {
      // simulate a team generator if it belongs to us, or to bots we run
      const mine = g.team === G.local.team || (auth && [...G.entities.values()].some(e => e.kind === 'bot' && e.team === g.team));
      if (!mine) continue;
      const fl = m.teamUp[g.team].forge, mult = [1, 1.5, 2, 2][fl];
      g.tI += dt * 1000 * mult; g.tG += dt * 1000 * mult;
      while (g.tI >= GEN.ironEvery) { g.tI -= GEN.ironEvery; g.iron = Math.min(GEN.ironCap, g.iron + 1); }
      while (g.tG >= GEN.goldEvery) { g.tG -= GEN.goldEvery; g.gold = Math.min(GEN.goldCap, g.gold + 1); }
      if (fl >= 3) { g.tE += dt * 1000; if (g.tE >= 40000) { g.tE = 0; g.emerald = Math.min(2, g.emerald + 1); } }
      for (const e of G.entities.values()) {
        if (!e.alive || e.team !== g.team || (e.kind !== 'local' && e.kind !== 'bot')) continue;
        if (Math.hypot(e.pos.x - g.pos.x, e.pos.z - g.pos.z) < GEN.pickupRange && e.pos.y < 6 && (g.iron || g.gold || g.emerald)) {
          e.inv.res.iron += g.iron; e.inv.res.gold += g.gold; e.inv.res.emerald += g.emerald;
          if (e.kind === 'local') { sfx.pickup(); renderResources(); }
          g.iron = g.gold = g.emerald = 0;
        }
      }
      if (g.team === G.local.team) genLabel(g, `⬜ ${g.iron}  🟨 ${g.gold}${g.emerald ? '  🟩 ' + g.emerald : ''}`);
      continue;
    }
    // diamond / emerald (shared, authority decides)
    if (auth) {
      g.t += dt * 1000;
      const every = g.kind === 'diamond' ? GEN.diamondEvery : GEN.emeraldEvery, cap = g.kind === 'diamond' ? GEN.diamondCap : GEN.emeraldCap;
      if (g.t >= every) { g.t = 0; if (g.n < cap) { g.n++; m.send('gen', { i, n: g.n }); } }
    }
    if (g.n > 0) for (const e of G.entities.values()) {
      if (!e.alive || (e.kind !== 'local' && e.kind !== 'bot')) continue;
      if (Math.hypot(e.pos.x - g.pos.x, e.pos.z - g.pos.z) < GEN.pickupRange && Math.abs(e.pos.y - g.pos.y) < 6) {
        if (auth) {
          e.inv.res[g.kind] += g.n;
          if (e.kind === 'local') { sfx.pickup(); toast(`+${g.n} ${CURRENCY[g.kind].name}`); renderResources(); }
          g.n = 0; m.send('gen', { i, n: 0 });
        } else if (e.kind === 'local' && performance.now() - (g.lastClaim || 0) > 700) { g.lastClaim = performance.now(); m.send('claim', { i }); }
        break;
      }
    }
    const left = g.kind === 'diamond' ? GEN.diamondEvery - g.t : GEN.emeraldEvery - g.t;
    genLabel(g, `${g.kind === 'diamond' ? '💎' : '🟩'} ${g.n}${auth ? '  •  ' + Math.max(0, Math.ceil(left / 1000)) + 's' : ''}`);
  }
}

// ---------- MAIN UPDATE ----------
const _v = new THREE.Vector3();
export function updateMatch(dt) {
  const m = G.match; if (!m) return;
  const now = performance.now(), auth = m.isAuth();
  if (auth && !m.wasAuth) playerLeft(null);
  if (!m.over) {
    updateLocalMovement(dt);
    updateMatchActions(dt);
  }
  for (const e of G.entities.values()) {
    if (e.kind === 'remote') {
      // smooth remote movement
      const gap = e.pos.distanceTo(e.target);
      if (gap > 16) e.pos.copy(e.target); else e.pos.lerp(e.target, 1 - Math.exp(-14 * dt));
      let d = e.targetYaw - e.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); e.yaw += d * Math.min(1, dt * 14);
      e.avatar.group.rotation.y = e.yaw;
      e.avatar.animate(dt, gap > .15, false);
      continue;
    }
    if (e.dead) {
      if (!e.finalDead && now >= e.respawnAt && !m.over) respawn(e);
      continue;
    }
    if (e.kind === 'bot') {
      if (m.over) continue;
      updateBot(e, dt);
      moveEntity(e, dt);
      e.avatar.group.rotation.y = e.yaw;
      e.avatar.setHeld(e.held);
      e.avatar.animate(dt, Math.hypot(e.vel.x, e.vel.z) > 1, !e.onGround);
    }
    // regen + heal pool
    if (e.hp < 100 && now - e.lastHurt > COMBAT.regenDelay) e.hp = Math.min(100, e.hp + COMBAT.regenRate * dt);
    if (m.teamUp[e.team].heal && e.hp < 100) { const s = m.spawns[e.team]; if (Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < 24) e.hp = Math.min(100, e.hp + 2.5 * dt); }
    // void
    if (e.pos.y < PHYS.voidY && !m.over) { e.lastHurt = now; killEntity(e, 'void'); if (e.kind === 'local') sendState(true); }
  }
  // alarm traps (checked by whoever runs that team)
  for (const t of m.teams) {
    if (!m.teamUp[t].trap) continue;
    const runs = t === G.local.team || (auth && [...G.entities.values()].some(e => e.kind === 'bot' && e.team === t));
    if (!runs) continue;
    const s = m.spawns[t];
    for (const e of G.entities.values()) {
      if (!e.alive || e.team === t) continue;
      if (Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < 22) {
        m.teamUp[t].trap = 0; m.send('upg', { team: t, key: 'trap', lvl: 0 });
        if (e.kind === 'local' || e.kind === 'bot') e.effects.slow = now + 4000; else m.send('fx', { v: e.id, ms: 4000 });
        if (t === G.local.team) { sfx.alarm(); bigMessage('🚨 TRAP TRIGGERED', `${e.name} entered your base!`, '#ff5252', 2400); }
        break;
      }
    }
  }
  updateProjectiles(dt);
  updateGens(dt);
  if (!m.over) { sendState(); if (auth) sendBots(); }
  if (Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) checkElimination();
  updateHud(dt);
}
