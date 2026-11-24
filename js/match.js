// Match lifecycle: setup, generators, respawns, sync, HUD, win screen.
import { THREE, disposeGroup, setSpriteText, burst } from './engine.js';
import { G } from './state.js';
import { TEAMS, TEAM_KEYS, GEN, COMBAT, PHYS, ITEMS, ARMOR, UPGRADES, CURRENCY, TIMELINE, KITS, MAPS, MAP_KEYS, DEFAULT_LOOK, COSMETICS, TIPS, rankOf } from './config.js';
import { A, submitMatch, levelProgress, myLook, rankedFinish, refreshProfile } from './account.js';
import { Avatar } from './avatar.js';
import { textSprite, mat as mkMat, box as mkBox } from './engine.js';
import { applyTheme } from './engine.js';
import { clearGrid, setCell, removeCell, getCell, cellX, cellY } from './grid.js';
import { moveEntity } from './physics.js';
import { buildMatchMap } from './maps.js';
import { Entity } from './entity.js';
import { initBotAI, updateBot } from './bots.js';
import { applyHit, killEntity, trackFall, balloonLift, onKillEvent, updateProjectiles, clearProjectiles, remoteProjectile, remoteProjectileEnd } from './combat.js';
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
  const mapId = MAPS[cfg.map] ? cfg.map : MAP_KEYS[Math.floor(Math.random() * MAP_KEYS.length)];
  // cosmetics: each player's look; a team's bed uses its first real player's bed design
  const looks = {}, bedLooks = {};
  for (const r of cfg.roster) {
    looks[r.id] = r.id === G.myId ? myLook() : r.bot ? botLook(r.id) : { ...DEFAULT_LOOK, ...(r.look || {}) };
    if (!r.bot && !bedLooks[r.team]) bedLooks[r.team] = looks[r.id].bed;
  }
  applyTheme(MAPS[mapId].theme);
  const map = buildMatchMap(teams, mapId, bedLooks);
  const m = G.match = {
    online: !!cfg.online, hostId: cfg.hostId || G.myId, teams, over: false, startedAt: performance.now(), tier: 0, nextEvent: 0, sudden: false,
    beds: map.beds, spawns: map.spawns, gens: map.gens, npcs: map.npcs, noBuild: map.noBuild,
    teamUp: Object.fromEntries(TEAM_KEYS.map(t => [t, { sharp: 0, prot: 0, haste: 0, forge: 0, heal: 0, trap: 0 }])),
    stats: {}, roster: cfg.roster, looks, mapId, islands: map.islands, extent: map.extent, ranked: cfg.ranked || null, elimOrder: [], kind: cfg.kind || (cfg.online ? 'mp' : 'solo'), diff: cfg.diff || null, myBlocks: 0, myArrows: 0, submitted: false,
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
    e.kit = KITS[r.kit] ? r.kit : 'default'; e.maxHp = e.kit === 'tank' ? 130 : 100; e.hp = e.maxHp;
    e.avatar.setLook(looks[r.id]);
    if (kind !== 'local') e.avatar.setName(r.lvl ? `[${r.lvl}] ${r.name}` : r.name, r.team, true);
    e.inv.add('wood_sword', 1); e.held = 'wood_sword'; e.avatar.setHeld('wood_sword');
    kitItems(e, true);
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
  bigMessage('BED WARS', `${MAPS[mapId].icon} ${MAPS[mapId].name}${cfg.ranked ? '  •  RANKED' : ''}`, T.css, 3200);
  setTimeout(() => { if (G.match === m) toast('💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)]); }, 4000);
  setChatHandler(text => { if (!canChat()) return; chatLine(G.name, text, T.css); m.send('chat', { n: G.name, t: text, tm: G.local.team }); });
  setPlayerHooks({ onInteract: interact, onTab: (on) => { if (on) renderScoreboard(); $('scoreboard').style.display = on ? 'block' : 'none'; }, onEscape: null });
  setNpcHook(() => npcInFront() ? (interact(), true) : false);
  if (m.online) net.onMatch(onNet);
  G.renderer.domElement.focus();
}

// starting items from kits (every spawn), plus one-time extras at match start
function kitItems(e, first) {
  if (e.kit === 'builder') e.inv.add('wool', 16);
  if (e.kit === 'archer') { if (!e.inv.has('bow')) e.inv.add('bow', 1); e.inv.add('arrow', 8); }
  if (e.kit === 'miner' && !e.inv.best('pickaxe')) e.inv.add('wood_pickaxe', 1);
  if (e.kit === 'bomber' && first) e.inv.add('fireball', 1);
}

// bots get a random hat so matches look lively
function botLook(id) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hats = Object.keys(COSMETICS).filter(k => COSMETICS[k].kind === 'skin');
  return { ...DEFAULT_LOOK, skin: hats[h % hats.length] };
}

function spawnAt(e) {
  const s = G.match.spawns[e.team];
  e.pos.set(s.x + (Math.random() - .5) * 2, s.y + .5, s.z + (Math.random() - .5) * 2);
  e.yaw = s.yaw; e.avatar.group.rotation.y = s.yaw;
  e.vel.set(0, 0, 0); e.kb.set(0, 0, 0);
  e.target.copy(e.pos); e.targetYaw = e.yaw;
}

function respawn(e) {
  spawnAt(e); e.hp = e.maxHp; e.dead = false; e.setVisible(true); e.fallTop = null;
  e.invulnUntil = performance.now() + COMBAT.spawnProtect; e.lastHit = null;
  kitItems(e, false);
  e.held = e.inv.best('sword'); e.avatar.setHeld(e.held); e.avatar.setArmor(e.armor);
  if (e.kind === 'local') { hide('deathScreen'); renderHotbar(true); renderResources(); toast('Respawned!'); sendState(true); }
}

// ---------- LOCAL EVENTS ----------
let deathTimer = null;
function onLocalDeath(ev) {
  const e = G.local; renderHotbar(true); renderResources();
  show('deathScreen');
  $('deathTitle').textContent = ev.final ? 'FINAL DEATH' : 'YOU DIED';
  const kc = TEAMS[ev.killerTeam]?.css || '#fff', kn = `<b style="color:${kc}">${esc(ev.killerName || '')}</b>`;
  $('killedBy').innerHTML = ev.killer
    ? (ev.cause === 'void' ? `Knocked into the void by ${kn}` : ev.cause === 'arrow' ? `Shot by ${kn}` : ev.cause === 'explosion' ? `Blown up by ${kn}` : ev.cause === 'fall' ? `Fell escaping ${kn}` : `Killed by ${kn}`)
    : ev.cause === 'void' ? 'You fell into the void' : ev.cause === 'fall' ? 'You fell from a high place' : 'You died';
  if (ev.final) { $('deathText').textContent = 'Your bed is gone. You are out — you can keep watching.'; $('spectateBtn').style.display = 'inline-block'; }
  else {
    $('spectateBtn').style.display = 'none';
    clearInterval(deathTimer);
    const tick = () => { const s = Math.max(0, Math.ceil((e.respawnAt - performance.now()) / 1000)); $('deathText').textContent = `Respawning in ${s}...`; if (s <= 0) clearInterval(deathTimer); };
    tick(); deathTimer = setInterval(tick, 250);
  }
  sendState(true);
}
function onLocalHurt(sh = .35) { shake(sh); const v = $('hurtFx'); v.classList.remove('on'); void v.offsetWidth; v.classList.add('on'); sendState(true); }

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
  const d = [+e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2), +e.yaw.toFixed(2), Math.round(e.hp), e.dead ? 1 : 0, e.finalDead ? 1 : 0, e.heldItem() || '', e.armor, e.atkSeq, e.balloons, e.emote?.id || '', e.emote?.seq || 0];
  const sig = d.join('|');
  if (!force && sig === lastSig && now - lastSend < 1000) return;
  lastSig = sig; lastSend = now;
  m.send('s', { d });
}
function sendBots() {
  const m = G.match, now = performance.now(); if (!m.online || now - lastBots < 150) return; lastBots = now;
  const l = [];
  for (const e of G.entities.values()) if (e.kind === 'bot') l.push([e.id, +e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2), +e.yaw.toFixed(2), Math.round(e.hp), e.dead ? 1 : 0, e.finalDead ? 1 : 0, e.held || '', e.armor, e.atkSeq, e.balloons, '', 0]);
  if (l.length) m.send('bots', { l });
}
function applyRemoteState(e, d) {
  const [x, y, z, yaw, hp, dead, fd, held, armor, atk, bal = 0, emo = '', emoSeq = 0] = d;
  e.balloons = bal; e.avatar.setBalloons(bal);
  if (emo && emoSeq !== e.emoteSeqSeen) { e.emoteSeqSeen = emoSeq; e.avatar.playEmote?.(emo); }
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
    case 'rank': showRankResult(p.res || {}); break;
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
  for (const t of m.teams) if (!alive.includes(t) && !m.elimOrder.includes(t)) m.elimOrder.push(t);
  if (alive.length <= 1) { const w = alive[0] || null; m.send('end', { winner: w }); endMatch(w); if (m.ranked) finishRanked(w); }
}

// Ranked: the host reports every player's placement (1 = winning team) to the database.
async function finishRanked(winner) {
  const m = G.match; const order = [...m.elimOrder].reverse(); // last eliminated = 2nd place
  const place = {}; if (winner) place[winner] = 1;
  order.forEach((t, i) => { if (!place[t]) place[t] = (winner ? 2 : 1) + i; });
  const placements = {};
  for (const r of m.roster) if (r.uid && !r.bot) placements[r.uid] = place[r.team] || m.teams.length;
  try {
    const res = await rankedFinish(m.ranked, placements);
    m.send('rank', { res }); showRankResult(res);
  } catch (err) { $('endRank').innerHTML = `<div class="muted small">Ranked result not saved: ${esc(err.message)}</div>`; }
}
function showRankResult(res) {
  const mine = A.user && res[A.user.id]; if (!mine) return;
  const rk = rankOf(mine.rating);
  $('endRank').innerHTML = `<div class="rankRes"><span style="color:${rk.color}">${rk.icon} ${rk.name}</span> <b>${mine.rating}</b> <span class="${mine.delta >= 0 ? 'win' : 'loss'}">${mine.delta >= 0 ? '+' : ''}${mine.delta}</span></div>`;
  refreshProfile().catch(() => {});
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
  $('endRank').innerHTML = m.ranked ? '<div class="muted small">Updating ranked rating…</div>' : '';
  show('endScreen');
  showPodium();
  sendResults(!!won);
}

// Send my match to the database (XP, coins, missions). Guests just see a hint.
async function sendResults(won, early = false) {
  const m = G.match; if (!m || m.submitted) return;
  m.submitted = true;
  const box = $('endRewards');
  const st = m.stats[G.myId] || { kills: 0, finals: 0, beds: 0, deaths: 0 };
  const seconds = Math.round((performance.now() - m.startedAt) / 1000);
  if (A.guest) { box.innerHTML = `<div class="rw muted">Playing as a guest — <b>create an account</b> to earn XP, coins and kits.</div>`; return; }
  if (seconds < 45) { box.innerHTML = `<div class="rw muted">Match too short for XP (under 45 seconds).</div>`; return; }
  box.innerHTML = '<div class="rw muted">Saving your progress…</div>';
  try {
    const r = await submitMatch({ mode: m.kind, diff: m.kind === 'solo' ? m.diff : null, won, kills: st.kills, finals: st.finals, beds: st.beds, deaths: st.deaths, blocks: m.myBlocks, arrows: m.myArrows, seconds });
    if (!r) return;
    if (early) toast(`Progress saved: +${r.xp_gain} XP, +${r.coin_gain} coins`, 'good');
    const lp = levelProgress();
    box.innerHTML = `<div class="rw"><span class="xpG">+${r.xp_gain} XP</span><span class="coinG">+${r.coin_gain} 🪙</span>${r.mult !== 1 ? `<span class="muted">×${r.mult} ${m.kind === 'solo' ? (m.diff || '') + ' bots' : 'multiplayer'} bonus</span>` : ''}</div>
      <div class="lvlRow"><b>Level ${lp.level}</b><div class="xpBar"><div style="width:${lp.into / lp.need * 100}%"></div></div><small>${lp.into} / ${lp.need} XP</small></div>
      ${r.leveled_up ? `<div class="lvlUp">⭐ LEVEL UP! You're now level ${r.level} ⭐</div>` : ''}`;
    if (r.leveled_up) sfx.win();
  } catch (err) { box.innerHTML = `<div class="rw muted">Couldn't save progress: ${esc(err.message)}</div>`; }
}
// ---------- MVP PODIUM ----------
const score = (s) => s.finals * 3 + s.kills + s.beds * 4;
function showPodium() {
  const m = G.match;
  const top = Object.entries(m.stats).sort((a, b) => score(b[1]) - score(a[1])).slice(0, 3);
  const base = new THREE.Vector3(0, 130, 0), g = new THREE.Group(); g.position.copy(base); G.world.add(g);
  const floor = mkBox(40, 1, 24, mkMat(0x1b2333)); floor.position.y = -.5; g.add(floor);
  const spots = [[0, 4.5, '#ffd34e', '1st'], [-7, 3, '#d9e2ec', '2nd'], [7, 1.8, '#e3a36b', '3rd']];
  top.forEach(([id, st], i) => {
    const [x, h, col, lbl] = spots[i];
    const ped = mkBox(6, h, 6, mkMat(parseInt(col.slice(1), 16), { metal: .4, rough: .4 })); ped.position.set(x, h / 2, 0); g.add(ped);
    const a = new Avatar({ team: st.team, tag: false }); a.setLook(m.looks[id]); a.setName(st.name, st.team, true);
    a.group.position.set(x, h, 0); a.group.rotation.y = 0; g.add(a.group);
    a.playEmote(i === 0 ? 'emote_cheer' : i === 1 ? 'emote_wave' : 'emote_flex'); a.emoteT = -9999; // keep the pose going
    const lab = textSprite(`${lbl}  •  ${st.kills}K ${st.finals}F ${st.beds}B`, { color: col, bg: 'rgba(6,12,22,.85)', scale: .6 }); lab.position.set(x, h + 9, 0); g.add(lab);
    m.podiumAvatars = (m.podiumAvatars || []).concat(a);
  });
  $('endScreen').classList.add('podium');
  G.podiumCam = { pos: base.clone().add(new THREE.Vector3(0, 7, 22)), target: base.clone().add(new THREE.Vector3(0, 5, 0)) };
}

function scoreTable() {
  const rows = Object.entries(G.match.stats).sort((a, b) => (b[1].finals * 3 + b[1].kills + b[1].beds * 4) - (a[1].finals * 3 + a[1].kills + a[1].beds * 4));
  return `<table><tr><th>Player</th><th>Kills</th><th>Finals</th><th>Beds</th><th>Deaths</th></tr>${rows.map(([id, s]) => `<tr class="${id === G.myId ? 'me' : ''}"><td style="color:${TEAMS[s.team]?.css}">${esc(s.name)}</td><td>${s.kills}</td><td>${s.finals}</td><td>${s.beds}</td><td>${s.deaths}</td></tr>`).join('')}</table>`;
}
function renderScoreboard() { $('scoreboard').innerHTML = '<div class="sbT">SCOREBOARD — hold Tab</div>' + scoreTable(); }

export function leaveMatch() {
  clearInterval(deathTimer);
  if (G.match && !G.match.submitted && !G.match.over) sendResults(false, true); // left early: still counts kills/time
  $('endScreen').classList.remove('podium'); hide('specHint');
  hide('endScreen'); hide('deathScreen'); hide('matchHud'); hide('hotbarWrap'); hide('scoreboard');
  if (G.match?.online) net.leaveParty();
  G.match = null; G.podiumCam = null; G.spec = null;
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
  $('hpFill').style.width = (e.hp / e.maxHp * 100) + '%';
  $('hpFill').style.background = e.hp > 60 ? '#3ddc6b' : e.hp > 30 ? '#ffc23d' : '#ff4b4b';
  $('hpText').textContent = Math.ceil(e.hp) + ' / ' + e.maxHp;
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
      const every = (g.kind === 'diamond' ? GEN.diamondEvery : GEN.emeraldEvery)[m.tier], cap = g.kind === 'diamond' ? GEN.diamondCap : GEN.emeraldCap;
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
    const left = (g.kind === 'diamond' ? GEN.diamondEvery : GEN.emeraldEvery)[m.tier] - g.t;
    genLabel(g, `${g.kind === 'diamond' ? '💎' : '🟩'} ${['I', 'II', 'III'][m.tier]}  ×${g.n}${auth ? '  •  ' + Math.max(0, Math.ceil(left / 1000)) + 's' : ''}`);
  }
}

// ---------- TIMELINE: generator tiers + sudden death ----------
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updateTimeline() {
  const m = G.match; if (m.over) return;
  const t = (performance.now() - m.startedAt) / 1000;
  while (m.nextEvent < TIMELINE.length && t >= TIMELINE[m.nextEvent].at) {
    const ev = TIMELINE[m.nextEvent++];
    if (ev.tier) m.tier = ev.tier;
    if (ev.sudden) {
      m.sudden = true;
      if (m.isAuth()) for (const tm of m.teams) if (m.beds[tm].alive) destroyBed(tm, 'Sudden Death', null, null);
    }
    bigMessage(ev.title, ev.sub, ev.sudden || ev.warn ? '#ff5252' : '#7eeaff', 3000);
    if (ev.sudden || ev.warn) sfx.alarm(); else sfx.win();
  }
  const next = TIMELINE.slice(m.nextEvent).find(e => !e.warn);
  const el = $('timer');
  if (next) el.innerHTML = `<span>${next.sudden ? '☠️ Sudden Death' : next.tier === 1 ? '💎 Diamond II' : '💎 Diamond III'}</span> <b>${fmt(next.at - t)}</b>`;
  else el.innerHTML = `<span class="sd">☠️ SUDDEN DEATH</span> <b>${fmt(t)}</b>`;
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
      const wg = e.onGround;
      balloonLift(e, dt);
      moveEntity(e, dt);
      e.avatar.setBalloons(e.balloons);
      trackFall(e, wg);
      e.avatar.group.rotation.y = e.yaw;
      e.avatar.setHeld(e.held);
      e.avatar.animate(dt, Math.hypot(e.vel.x, e.vel.z) > 1, !e.onGround);
    }
    // regen + heal pool
    const medic = e.kit === 'medic';
    if (e.hp < e.maxHp && now - e.lastHurt > (medic ? 2000 : COMBAT.regenDelay)) e.hp = Math.min(e.maxHp, e.hp + COMBAT.regenRate * (medic ? 2 : 1) * dt);
    if (m.teamUp[e.team].heal && e.hp < e.maxHp) { const s = m.spawns[e.team]; if (Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < 24) e.hp = Math.min(e.maxHp, e.hp + 2.5 * dt); }
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
  updateTimeline();
  updateProjectiles(dt);
  updateGens(dt);
  if (!m.over) { sendState(); if (auth) sendBots(); }
  if (Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) checkElimination();
  for (const a of m.podiumAvatars || []) a.animate(dt, false, false);
  updateHud(dt);
  drawMinimap(dt);
}

// ---------- MINI-MAP ----------
let mmT = 0;
function drawMinimap(dt) {
  mmT += dt; if (mmT < .1) return; mmT = 0;
  const m = G.match, cv = $('minimap'); if (!cv || m.over) return;
  const x = cv.getContext('2d'); if (!x) return;
  const W = cv.width, s = W / 2 / m.extent, c = W / 2;
  const P = (wx, wz) => [c + wx * s, c + wz * s];
  x.clearRect(0, 0, W, W);
  x.fillStyle = 'rgba(6,12,22,.72)'; x.beginPath(); x.arc(c, c, c - 1, 0, Math.PI * 2); x.fill();
  for (const i of m.islands) {
    const [px, pz] = P(i.cx * 3, i.cz * 3), hw = (i.half * 2 + 1) * 3 * s;
    x.fillStyle = i.kind === 'mid' ? '#5a6f5a' : i.kind === 'diamond' ? '#4c6670' : '#4a7a40';
    x.fillRect(px - hw / 2, pz - hw / 2, hw, hw);
  }
  for (const g of m.gens) { if (g.kind === 'team') continue; const [px, pz] = P(g.pos.x, g.pos.z); x.fillStyle = g.kind === 'diamond' ? '#62e7ff' : '#4dff8a'; x.fillRect(px - 2, pz - 2, 4, 4); }
  for (const t of m.teams) {
    const b = m.beds[t]; const [px, pz] = P(b.mesh.position.x, b.mesh.position.z);
    x.fillStyle = TEAMS[t].css; x.fillRect(px - 4, pz - 4, 8, 8);
    if (!b.alive) { x.strokeStyle = '#ff2a2a'; x.lineWidth = 2; x.beginPath(); x.moveTo(px - 5, pz - 5); x.lineTo(px + 5, pz + 5); x.moveTo(px + 5, pz - 5); x.lineTo(px - 5, pz + 5); x.stroke(); }
  }
  const me = G.local;
  for (const e of G.entities.values()) {
    if (!e.alive || e === me) continue;
    const near = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z) < 40;
    if (e.team !== me.team && !near) continue;
    const [px, pz] = P(e.pos.x, e.pos.z);
    x.fillStyle = TEAMS[e.team].css; x.beginPath(); x.arc(px, pz, 3.2, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#000'; x.lineWidth = 1; x.stroke();
  }
  // you: an arrow pointing where the camera looks
  const [px, pz] = P(me.pos.x, me.pos.z), a = -G.cam.yaw;
  x.save(); x.translate(px, pz); x.rotate(a); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -7); x.lineTo(5, 5); x.lineTo(0, 2); x.lineTo(-5, 5); x.closePath(); x.fill(); x.restore();
}
