// Every menu panel in the hub: play modes, party, quick play, kits, missions, profile,
// leaderboards, friends, settings, account and the admin panel.
import { G, saveSettings } from './state.js';
import { TEAMS, TEAM_KEYS, BOT_DIFF, BOT_NAMES, KITS, levelNeed, COSMETICS, MAPS, MAP_KEYS, RANKS, rankOf } from './config.js';
import { startMatch } from './match.js';
import { $, show, hide, toast, esc } from './ui.js';
import { sfx, setVolume } from './audio.js';
import * as net from './net.js';
import {
  A, signIn, signUp, signOut, playAsGuest, validName, levelProgress, myKit, myLevel, ownsKit, buyKit, setKit,
  getMissions, claimMission, leaderboard, history, myFriends, addFriend, respondFriend, removeFriend,
  isAdmin, adminFind, adminSetPassword, adminUpdate, refreshProfile,
  ownsCosmetic, buyCosmetic, equipCosmetic, myLook, myRating, rankedStart,
} from './account.js';

let hooks = { reenter: null, refreshCard: null, refreshBoard: null };
export function setMenuHooks(h) {
  Object.assign(hooks, h);
  // these must work even when no panel is open
  net.partyEvents.onStart = (msg) => { closePanel(); net.leaveHub(); startMatch({ online: true, hostId: msg.hostId, roster: msg.roster, kind: msg.kind || 'mp', map: msg.map, ranked: msg.ranked }); };
  net.partyEvents.onClosed = () => { toast('The party was closed'); if (G.uiOpen === 'panel' && current === 'party') openPanel('multi'); };
  net.partyEvents.onError = (r) => toast(r === 'full' ? 'Party is full' : 'That match already started');
  net.queueEvents.onGo = onQuickGo;
  net.queueEvents.onUpdate = () => {};
}

let current = null;
const body = () => $('panelBody');
const title = (t) => { $('panelTitle').textContent = t; };
const seg = (id, opts, val) => `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(val) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const onSeg = (id, fn) => { const el = body().querySelector('#' + id); if (el) el.onclick = (e) => { const b = e.target.closest('button'); if (b) { sfx.click(); fn(b.dataset.v); } }; };
const needAccount = (what) => `<div class="empty">🔒 ${what} needs an account.<br><button class="btn" id="goAcc">Sign in / Sign up</button></div>`;
const wireNeedAccount = () => { const b = body().querySelector('#goAcc'); if (b) b.onclick = () => openPanel('account'); };
const fmtTime = (s) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : `${Math.floor(s / 60)}m`;

export function openPanel(which) {
  G.uiOpen = 'panel'; current = which; if (document.pointerLockElement) document.exitPointerLock();
  show('menuPanel'); sfx.click();
  body().onclick = null;
  const map = { solo: renderSolo, multi: renderMulti, party: renderParty, quick: () => renderQuick(false), ranked: () => renderQuick(true), locker: renderLocker, kits: renderKits, missions: renderMissions, profile: renderProfile, leader: renderLeader, friends: renderFriends, settings: renderSettings, account: renderAccount, admin: renderAdmin };
  (map[which] || renderMulti)();
}
export function closePanel() {
  if ((current === 'quick' || current === 'ranked') && net.Q.on) net.leaveQueue();
  hide('menuPanel'); if (G.uiOpen === 'panel') G.uiOpen = null; current = null; net.partyEvents.onUpdate = null;
}

// ================= SOLO =================
let soloCfg = { diff: 'normal', layout: '4', map: 'random' };
const mapPicker = (id, cur, votes = null) => `<div class="mapPick" id="${id}">${[['random', '🎲', 'Random'], ...MAP_KEYS.map(k => [k, MAPS[k].icon, MAPS[k].name])].map(([k, ic, n]) => `<button data-v="${k}" class="${cur === k ? 'on' : ''}"><span>${ic}</span>${n}${votes ? `<small> • ${votes[k] || 0} vote${votes[k] === 1 ? '' : 's'}</small>` : ''}</button>`).join('')}</div>`;
function renderSolo() {
  title('🤖 Solo vs Bots');
  const mult = { easy: '×0.5', normal: '×1', hard: '×1.6' };
  body().innerHTML = `
    <p class="muted">A full BedWars match against computer players. Harder bots give more XP.</p>
    <div class="lbl">BOT DIFFICULTY</div>
    ${seg('segDiff', Object.entries(BOT_DIFF).map(([k, d]) => [k, `${d.label} <small>${mult[k]} XP</small>`]), soloCfg.diff)}
    <div class="lbl">MATCH TYPE</div>
    ${seg('segLayout', [['2', '1v1 (2 teams)'], ['4', 'Solos (4 teams)'], ['d', 'Duos (bot teammate)']], soloCfg.layout)}
    <div class="lbl">MAP</div>${mapPicker('soloMap', soloCfg.map)}
    <div class="lbl">YOUR KIT</div>${kitPicker()}
    <button class="bigBtn" id="soloStart">▶ START MATCH</button>`;
  onSeg('segDiff', v => { soloCfg.diff = v; renderSolo(); });
  onSeg('segLayout', v => { soloCfg.layout = v; renderSolo(); });
  body().querySelector('#soloMap').onclick = (e) => { const b = e.target.closest('button'); if (b) { soloCfg.map = b.dataset.v; sfx.click(); renderSolo(); } };
  wireKitPicker(renderSolo);
  body().querySelector('#soloStart').onclick = startSolo;
}
function startSolo() {
  const roster = [{ id: G.myId, name: G.name, team: 'blue', kit: myKit(), lvl: myLevel(), look: myLook() }]; let n = 0;
  const pick = () => BOT_NAMES[(n++ + Math.floor(Math.random() * 16)) % BOT_NAMES.length] + ' (Bot)';
  const teams = soloCfg.layout === '2' ? ['blue', 'red'] : TEAM_KEYS;
  const per = soloCfg.layout === 'd' ? 2 : 1;
  for (const t of teams) for (let k = t === 'blue' ? 1 : 0; k < per; k++) roster.push({ id: `bot_${t}_${k}`, name: pick(), team: t, bot: true, diff: soloCfg.diff });
  closePanel(); net.leaveHub();
  startMatch({ online: false, roster, kind: 'solo', diff: soloCfg.diff, map: soloCfg.map === 'random' ? null : soloCfg.map });
}

// small kit chooser used by the solo + party screens
function kitPicker() {
  const k = myKit();
  return `<div class="kitPick">${Object.entries(KITS).filter(([id]) => ownsKit(id)).map(([id, d]) => `<button data-k="${id}" class="${id === k ? 'on' : ''}" title="${esc(d.desc)}">${d.icon} ${d.name}</button>`).join('')}<button class="more" data-k="__shop">＋ More kits</button></div>`;
}
function wireKitPicker(rerender) {
  const el = body().querySelector('.kitPick'); if (!el) return;
  el.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k === '__shop') { openPanel('kits'); return; }
    try { await setKit(b.dataset.k); saveSettings(); net.setMyPartyInfo({ kit: myKit() }); hooks.refreshCard?.(); sfx.click(); rerender(); } catch (err) { toast(err.message); }
  };
}

// ================= MULTIPLAYER =================
function renderMulti() {
  if (net.P.code) return renderParty();
  title('🌐 Multiplayer');
  if (!net.online) { body().innerHTML = `<p class="muted">Multiplayer needs Supabase, which couldn't be reached. Check your internet (or ad-blocker / VPN) and refresh. Solo vs Bots still works.</p>`; return; }
  const pubs = net.hubPeople().filter(p => p.pc);
  body().innerHTML = `
    <button class="bigBtn quick" id="mpQuick">⚡ QUICK PLAY <small>— get matched with other players</small></button>
    <button class="bigBtn ranked" id="mpRanked">🏅 RANKED <small>— real players only, win to climb</small></button>
    <div class="twoCol">
      <div><div class="lbl">MAKE A PARTY</div><button class="btn wide" id="mpCreate">＋ CREATE PARTY</button></div>
      <div><div class="lbl">JOIN WITH CODE</div><div class="row"><input id="mpCode" maxlength="6" placeholder="ABC123" autocomplete="off"><button class="btn" id="mpJoin">JOIN</button></div></div>
    </div>
    <div class="lbl">PUBLIC PARTIES</div>
    <div class="list">${pubs.length ? pubs.map(p => `<div class="li"><b>${esc(p.n)}'s party</b><span class="muted">${p.pm === 'duos' ? 'Duos' : 'Solos'} • ${p.pn}/${p.pcap}</span><button class="btn sm" data-code="${esc(p.pc)}">JOIN</button></div>`).join('') : '<div class="muted small">No public parties right now. Make one and set it to Public!</div>'}</div>
    <p class="muted small" id="mpStatus"></p>`;
  const b = body(), code = b.querySelector('#mpCode');
  code.oninput = () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  code.onkeydown = (ev) => { if (ev.key === 'Enter') b.querySelector('#mpJoin').click(); };
  b.querySelector('#mpQuick').onclick = () => openPanel('quick');
  b.querySelector('#mpRanked').onclick = () => { if (A.guest) { toast('Ranked needs an account'); openPanel('account'); } else openPanel('ranked'); };
  b.querySelector('#mpCreate').onclick = async () => {
    $('mpStatus').textContent = 'Creating party...';
    try { await net.createParty(); openPanel('party'); toast('Party created — share the code!', 'good'); }
    catch { $('mpStatus').textContent = 'Could not create a party. Try again.'; }
  };
  const join = async (c) => {
    if (c.length !== 6) { $('mpStatus').textContent = 'Codes are 6 characters'; return; }
    $('mpStatus').textContent = 'Looking for party ' + c + '...';
    try { await net.joinParty(c); openPanel('party'); toast('Joined the party!', 'good'); }
    catch (err) { $('mpStatus') && ($('mpStatus').textContent = err.message === 'full' ? 'That party is full.' : err.message === 'started' ? 'That match already started.' : 'Party not found. Check the code.'); }
  };
  b.querySelector('#mpJoin').onclick = () => join(code.value.trim());
  b.querySelectorAll('.li [data-code]').forEach(x => x.onclick = () => join(x.dataset.code));
}
export async function joinByInvite(code) {
  try { await net.joinParty(code); openPanel('party'); toast('Joined the party!', 'good'); } catch { toast('That party is gone or full'); }
}
export function inviteToast(from, code) {
  const d = document.createElement('div'); d.className = 'toast invite';
  d.innerHTML = `📨 <b>${esc(from)}</b> invited you to a party <button class="miniBtn">JOIN</button>`;
  d.querySelector('button').onclick = () => { d.remove(); joinByInvite(code); };
  $('toasts').appendChild(d); setTimeout(() => d.remove(), 12000);
  sfx.pickup();
}

function renderParty() {
  const P = net.P;
  if (!P.code) { renderMulti(); return; }
  net.partyEvents.onUpdate = () => { if (G.uiOpen === 'panel' && current === 'party') renderParty(); };
  title('👥 Party');
  const cap = net.teamCap(), S = P.settings;
  const teams = TEAM_KEYS.map(t => {
    const ps = Object.entries(P.players).filter(([, p]) => p.team === t);
    const slots = [];
    for (let i = 0; i < cap; i++) { const pl = ps[i]; slots.push(pl ? `<div class="ps ${pl[0] === G.myId ? 'me' : ''}"><span class="lv">${pl[1].lvl || 1}</span>${esc(pl[1].name)}${pl[0] === P.hostId ? ' 👑' : ''} <span title="kit">${KITS[pl[1].kit]?.icon || ''}</span></div>` : `<div class="ps empty">${S.bots ? '🤖 Bot' : 'Open'}</div>`); }
    return `<div class="pteam" data-t="${t}" style="--c:${TEAMS[t].css}"><b>${TEAMS[t].name}</b>${slots.join('')}<small>click to join</small></div>`;
  }).join('');
  body().innerHTML = `
    <div id="partyBox">
      <div class="codeRow"><span>PARTY CODE</span><b id="pcode">${P.code}</b><button class="btn" id="pcopy">COPY</button>${!A.guest ? '<button class="btn" id="pinv">INVITE FRIENDS</button>' : ''}</div>
      <div class="pteams">${teams}</div>
      <div class="lbl">YOUR KIT</div>${kitPicker()}
      <div class="lbl">VOTE FOR A MAP</div>${mapPicker('pMap', P.players[G.myId]?.vote || '', voteCount())}
      ${P.isHost ? `
      <div class="lbl">MODE</div>${seg('pMode', [['solos', 'Solos (1 per team)'], ['duos', 'Duos (2 per team)']], S.mode)}
      <div class="lbl">EMPTY SLOTS</div>${seg('pBots', [['1', 'Fill with bots'], ['0', 'Leave empty']], S.bots ? '1' : '0')}
      ${S.bots ? seg('pDiff', Object.entries(BOT_DIFF).map(([k, d]) => [k, d.label]), S.diff) : ''}
      <div class="lbl">WHO CAN JOIN</div>${seg('pPub', [['0', '🔒 Private (code only)'], ['1', '🌍 Public (listed for everyone)']], S.public ? '1' : '0')}
      <button class="bigBtn" id="pStart">▶ START MATCH</button>` : `<p class="muted">Waiting for the host to start… (${S.mode === 'duos' ? 'Duos' : 'Solos'}${S.bots ? ', bots fill empty slots' : ''})</p>`}
      <button class="btn ghost" id="pLeave">← Leave party</button>
    </div>`;
  const b = body();
  b.querySelector('#pcopy').onclick = async () => { try { await navigator.clipboard.writeText(P.code); toast('Code copied!'); } catch { toast('Code: ' + P.code); } };
  b.querySelector('#pinv')?.addEventListener('click', () => openPanel('friends'));
  b.querySelector('.pteams').onclick = (ev) => { const t = ev.target.closest('.pteam'); if (t) { net.requestTeam(t.dataset.t); sfx.click(); } };
  b.querySelector('#pLeave').onclick = async () => { await net.leaveParty(); openPanel('multi'); };
  wireKitPicker(renderParty);
  b.querySelector('#pMap').onclick = (e) => { const x = e.target.closest('button'); if (!x) return; sfx.click(); net.setMyPartyInfo({ vote: x.dataset.v === 'random' ? null : x.dataset.v }); if (!P.isHost) { P.players[G.myId] && (P.players[G.myId].vote = x.dataset.v); renderParty(); } };
  if (P.isHost) {
    onSeg('pMode', v => net.setSettings({ mode: v }));
    onSeg('pBots', v => net.setSettings({ bots: v === '1' }));
    onSeg('pDiff', v => net.setSettings({ diff: v }));
    onSeg('pPub', v => net.setSettings({ public: v === '1' }));
    b.querySelector('#pStart').onclick = hostStart;
  }
}
function voteCount() { const v = {}; for (const p of Object.values(net.P.players)) if (p.vote) v[p.vote] = (v[p.vote] || 0) + 1; return v; }
function hostStart() {
  const P = net.P, S = P.settings;
  const teamsUsed = new Set(Object.values(P.players).map(p => p.team));
  if (!S.bots && teamsUsed.size < 2) { toast('Need players on at least 2 teams (or turn on bots)'); return; }
  const msg = net.startPartyMatch(); if (!msg) return;
  closePanel(); net.leaveHub();
  startMatch({ online: true, hostId: G.myId, roster: msg.roster, kind: msg.kind, map: msg.map, ranked: msg.ranked });
}

// ================= QUICK PLAY =================
let queuedAt = 0;
async function renderQuick(ranked = net.Q.ranked) {
  current = ranked ? 'ranked' : 'quick';
  title(ranked ? '🏅 Ranked' : '⚡ Quick Play');
  const Q = net.Q;
  if (ranked && A.guest) { body().innerHTML = needAccount('Ranked'); wireNeedAccount(); return; }
  if (Q.on && Q.ranked !== ranked) await net.leaveQueue();
  if (!Q.on) {
    body().innerHTML = '<p class="muted">Joining the queue…</p>';
    try { await net.leaveParty(); await net.joinQueue(ranked); queuedAt = Date.now(); } catch { body().innerHTML = '<p class="muted">Could not join the queue. Try again.</p>'; return; }
  }
  const waited = Math.floor((Date.now() - queuedAt) / 1000);
  body().innerHTML = `
    <div class="queue"><div class="spin"></div>
      <b>${Q.count <= 1 ? 'Searching for players…' : `${Q.count} players found`}</b>
      <p class="muted">${Q.count >= 2 ? (Q.left ? `Match starts in ${Q.left}s (or as soon as 4 join)` : 'Starting…') : `Waiting ${waited}s • ${ranked ? 'ranked needs at least 2 players, no bots' : 'matches fill empty teams with bots'}`}</p>
      ${ranked ? (() => { const rk = rankOf(myRating()); return `<p><b style="color:${rk.color}">${rk.icon} ${rk.name} • ${myRating()}</b></p>`; })() : ''}
    </div>
    <div class="lbl">YOUR KIT</div>${kitPicker()}
    ${!ranked && waited > 25 && Q.count <= 1 ? '<button class="btn wide" id="qBots">Nobody around — play vs Normal bots instead</button>' : ''}
    <button class="btn ghost" id="qCancel">Cancel</button>`;
  wireKitPicker(() => renderQuick(ranked));
  body().querySelector('#qCancel').onclick = async () => { await net.leaveQueue(); openPanel('multi'); };
  body().querySelector('#qBots')?.addEventListener('click', async () => { await net.leaveQueue(); soloCfg = { diff: 'normal', layout: '4' }; startSolo(); });
  clearTimeout(renderQuick._t); renderQuick._t = setTimeout(() => { if ((current === 'quick' || current === 'ranked') && G.uiOpen === 'panel' && net.Q.on) renderQuick(ranked); }, 1000);
}
async function onQuickGo({ code, host, ids, ranked }) {
  if (current === 'quick' || current === 'ranked') body().innerHTML = '<div class="queue"><div class="spin"></div><b>Match found! Connecting…</b></div>';
  try {
    if (host) {
      await net.createParty(code, { mode: 'solos', bots: !ranked, diff: 'normal', quick: true, ranked: !!ranked });
      const t0 = Date.now();
      while (net.partySize() < ids.length && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 250));
      if (ranked) {
        const uids = Object.values(net.P.players).map(p => p.uid).filter(Boolean);
        if (uids.length < 2) { toast('Not enough players joined — back to the queue'); await net.leaveParty(); openPanel('ranked'); return; }
        net.P.settings.rankedId = await rankedStart(uids);
      }
      hostStart();
    } else {
      await net.joinParty(code); // the host starts the match automatically
    }
  } catch { toast('Matchmaking failed — try again'); openPanel('multi'); }
}

// ================= KITS =================
function renderKits() {
  title('🎒 Kits');
  const p = A.profile, lvl = myLevel(), cur = myKit();
  body().innerHTML = `
    <p class="muted">Kits give you a special ability every match. Buy them with coins from playing. ${A.guest ? '<b>Guests can only use free kits.</b>' : `You have <b class="coins">🪙 ${p.coins}</b>`}</p>
    <div class="cards kits">${Object.entries(KITS).map(([id, k]) => {
      const owned = ownsKit(id), locked = lvl < k.lvl;
      const st = id === cur ? '<span class="price owned">EQUIPPED</span>' : owned ? '<button class="btn sm" data-eq="' + id + '">EQUIP</button>'
        : A.guest ? '<span class="price muted">Account needed</span>' : locked ? `<span class="price muted">🔒 Level ${k.lvl}</span>` : `<button class="btn sm buy" data-buy="${id}">🪙 ${k.price}</button>`;
      return `<div class="card kit ${id === cur ? 'eq' : ''} ${!owned && locked ? 'poor' : ''}"><div class="cIco">${k.icon}</div><b>${k.name}</b><small>${esc(k.desc)}</small>${st}</div>`;
    }).join('')}</div>`;
  body().onclick = async (e) => {
    const eq = e.target.closest('[data-eq]'), buy = e.target.closest('[data-buy]');
    try {
      if (eq) { await setKit(eq.dataset.eq); saveSettings(); net.setMyPartyInfo({ kit: myKit() }); sfx.click(); toast(KITS[eq.dataset.eq].name + ' equipped'); }
      else if (buy) { if (!confirm(`Buy ${KITS[buy.dataset.buy].name} for ${KITS[buy.dataset.buy].price} coins?`)) return; await buyKit(buy.dataset.buy); net.setMyPartyInfo({ kit: myKit() }); sfx.buy(); toast(KITS[buy.dataset.buy].name + ' unlocked!', 'good'); }
      else return;
      hooks.refreshCard?.(); renderKits();
    } catch (err) { sfx.deny(); toast(err.message); }
  };
}

// ================= MISSIONS =================
async function renderMissions() {
  title('📜 Missions');
  body().onclick = null;
  if (A.guest) { body().innerHTML = needAccount('Missions'); wireNeedAccount(); return; }
  body().innerHTML = '<p class="muted">Loading…</p>';
  let ms; try { ms = await getMissions(); } catch (err) { body().innerHTML = `<p class="muted">${esc(err.message)}</p>`; return; }
  if (current !== 'missions') return;
  const now = new Date(), endDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const dow = (now.getUTCDay() + 6) % 7, endWeek = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7 - dow);
  const left = (t) => fmtTime(Math.max(0, (t - now) / 1000));
  const card = (m) => `<div class="mission ${m.claimed ? 'done' : m.progress >= m.goal ? 'ready' : ''}">
      <div class="mTop"><b>${esc(m.title)}</b><span class="rew">+${m.reward_xp} XP • 🪙 ${m.reward_coins}</span></div>
      <div class="xpBar"><div style="width:${Math.min(100, m.progress / m.goal * 100)}%"></div></div>
      <div class="mBot"><small>${m.progress} / ${m.goal}</small>${m.claimed ? '<span class="price owned">CLAIMED ✓</span>' : m.progress >= m.goal ? `<button class="btn sm buy" data-claim="${m.id}">CLAIM</button>` : ''}</div></div>`;
  body().innerHTML = `
    <div class="lbl">DAILY <span class="muted">— resets in ${left(endDay)}</span></div>${ms.filter(m => m.period === 'daily').map(card).join('')}
    <div class="lbl">WEEKLY <span class="muted">— resets in ${left(endWeek)}</span></div>${ms.filter(m => m.period === 'weekly').map(card).join('')}
    <p class="muted small">Missions update after every match you finish (45 seconds or longer).</p>`;
  body().onclick = async (e) => {
    const c = e.target.closest('[data-claim]'); if (!c) return;
    try { const r = await claimMission(c.dataset.claim); sfx.buy(); toast(`+${r.reward_xp} XP, +${r.reward_coins} coins!`, 'good'); hooks.refreshCard?.(); renderMissions(); } catch (err) { toast(err.message); }
  };
}

// ================= PROFILE + LEADERBOARD =================
async function renderProfile() {
  title('👤 Profile');
  body().onclick = null;
  if (A.guest) { body().innerHTML = needAccount('A profile'); wireNeedAccount(); return; }
  try { await refreshProfile(); } catch {}
  const p = A.profile, lp = levelProgress();
  const kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
  const wr = p.games ? Math.round(p.wins / p.games * 100) : 0, rk = rankOf(p.rating ?? 1000);
  body().innerHTML = `
    <div class="profTop"><div class="bigLvl">${lp.level}</div><div><b class="pName">${esc(p.username)}</b>${p.is_admin ? ' <span class="adminTag">ADMIN</span>' : ''}
      <div class="xpBar"><div style="width:${lp.into / lp.need * 100}%"></div></div><small>${lp.into} / ${lp.need} XP to level ${lp.level + 1} • ${p.xp} total XP • 🪙 ${p.coins}</small></div></div>
    <div class="statGrid">
      ${[['Rank', `<span style="color:${rk.color}">${rk.icon} ${rk.name}</span>`], ['Rating', p.rating ?? 1000], ['Ranked games', p.ranked_games ?? 0], ['Ranked wins', p.ranked_wins ?? 0], ['Games', p.games], ['Wins', p.wins], ['Win rate', wr + '%'], ['Kills', p.kills], ['Final kills', p.finals], ['Beds broken', p.beds], ['Deaths', p.deaths], ['K/D', kd], ['Blocks placed', p.blocks], ['Time played', fmtTime(p.play_seconds)], ['Kits owned', p.kits.length + '/' + Object.keys(KITS).length], ['Member since', new Date(p.created_at).toLocaleDateString()]].map(([k, v]) => `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join('')}
    </div>
    <div class="row" style="margin-top:10px"><button class="btn" id="toLeader">🏆 Leaderboards</button><button class="btn" id="toLocker">🎨 Locker</button><button class="btn" id="toMissions">📜 Missions</button></div>
    <div class="lbl">RECENT MATCHES</div><div class="list" id="hist"><div class="muted small">Loading…</div></div>`;
  body().querySelector('#toLeader').onclick = () => openPanel('leader');
  body().querySelector('#toLocker').onclick = () => openPanel('locker');
  body().querySelector('#toMissions').onclick = () => openPanel('missions');
  try {
    const h = await history(); if (current !== 'profile') return;
    $('hist').innerHTML = h.length ? h.map(r => `<div class="li"><b class="${r.won ? 'win' : 'loss'}">${r.won ? 'WIN' : 'LOSS'}</b><span>${r.mode === 'solo' ? `Solo • ${r.diff || ''} bots` : r.mode === 'quick' ? 'Quick Play' : 'Party'}</span><span class="muted">${r.kills}K ${r.finals}F ${r.beds}B • ${fmtTime(r.seconds)}</span><span class="xpG">+${r.xp} XP</span><small class="muted">${new Date(r.created_at).toLocaleDateString()}</small></div>`).join('') : '<div class="muted small">No matches yet — go play one!</div>';
  } catch { $('hist').innerHTML = '<div class="muted small">Could not load history</div>'; }
}
let lbCfg = { stat: 'xp', weekly: false };
async function renderLeader() {
  title('🏆 Leaderboards');
  body().onclick = null;
  const statName = { xp: 'XP', rating: 'Rating', kills: 'Kills', finals: 'Final kills', beds: 'Beds', wins: 'Wins' };
  body().innerHTML = `${seg('lbStat', Object.entries(statName), lbCfg.stat)}<div style="height:6px"></div>${seg('lbTime', [['0', 'All time'], ['1', 'This week']], lbCfg.weekly ? '1' : '0')}
    <div class="list lb" id="lbList"><div class="muted small">Loading…</div></div>`;
  onSeg('lbStat', v => { lbCfg.stat = v; renderLeader(); });
  onSeg('lbTime', v => { lbCfg.weekly = v === '1'; renderLeader(); });
  if (!net.online) { $('lbList').innerHTML = '<div class="muted small">Offline</div>'; return; }
  try {
    const rows = await leaderboard(lbCfg.stat, lbCfg.weekly, 50); if (current !== 'leader') return;
    $('lbList').innerHTML = rows.length ? rows.map((r, i) => `<div class="li ${r.username === A.profile?.username ? 'me' : ''}"><b class="rank r${i + 1}">${i + 1}</b><span class="lv">${r.level}</span><b>${esc(r.username)}</b>${lbCfg.stat === 'rating' ? `<span style="color:${rankOf(r.value).color}">${rankOf(r.value).icon} ${rankOf(r.value).name}</span>` : ''}<span class="val">${r.value} ${statName[lbCfg.stat]}</span></div>`).join('') : '<div class="muted small">Nobody yet. Be the first!</div>';
  } catch (err) { $('lbList').innerHTML = `<div class="muted small">${esc(err.message)}</div>`; }
}

// ================= FRIENDS =================
async function renderFriends() {
  title('🤝 Friends');
  body().onclick = null;
  if (A.guest) { body().innerHTML = needAccount('Friends'); wireNeedAccount(); return; }
  body().innerHTML = `<div class="row"><input id="frName" maxlength="16" placeholder="Add a friend by username"><button class="btn" id="frAdd">ADD</button></div><div class="list" id="frList"><div class="muted small">Loading…</div></div>`;
  const b = body();
  b.querySelector('#frAdd').onclick = async () => {
    const n = b.querySelector('#frName').value.trim(); if (!n) return;
    try { const r = await addFriend(n); toast(r === 'ok' ? 'You are now friends!' : 'Friend request sent', 'good'); renderFriends(); } catch (err) { toast(err.message); }
  };
  let fr; try { fr = await myFriends(); } catch (err) { $('frList').innerHTML = `<div class="muted small">${esc(err.message)}</div>`; return; }
  if (current !== 'friends') return;
  const online = new Set(net.hubPeople().map(p => p.uid).filter(Boolean));
  $('frList').innerHTML = fr.length ? fr.map(f => `<div class="li"><span class="dot ${online.has(f.id) ? 'on' : ''}"></span><span class="lv">${f.level}</span><b>${esc(f.username)}</b>
      ${f.incoming ? `<button class="btn sm buy" data-acc="${f.id}">ACCEPT</button><button class="btn sm" data-dec="${f.id}">DECLINE</button>`
      : f.status === 'pending' ? '<span class="muted small">request sent</span>'
      : `${online.has(f.id) ? '<span class="muted small">in the lobby</span>' : '<span class="muted small">offline</span>'}${net.P.code && online.has(f.id) ? `<button class="btn sm buy" data-inv="${f.id}">INVITE</button>` : ''}<button class="btn sm ghost" data-rm="${f.id}">✕</button>`}</div>`).join('')
    : '<div class="muted small">No friends yet. Add someone by their username!</div>';
  if (!net.P.code) $('frList').insertAdjacentHTML('beforeend', '<p class="muted small">Tip: create a party first, then you can invite online friends straight into it.</p>');
  b.onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    try {
      if (t.dataset.acc) { await respondFriend(t.dataset.acc, true); toast('Friend added!', 'good'); }
      else if (t.dataset.dec) await respondFriend(t.dataset.dec, false);
      else if (t.dataset.rm) { if (!confirm('Remove this friend?')) return; await removeFriend(t.dataset.rm); }
      else if (t.dataset.inv) { net.sendInvite(t.dataset.inv, net.P.code); toast('Invite sent!'); return; }
      else return;
      renderFriends();
    } catch (err) { toast(err.message); }
  };
}

// ================= ACCOUNT (sign in / sign up) =================
// Shared by the start screen and the hub. onDone() runs after a successful login.
export function authForm(el, onDone, { allowGuest = true } = {}) {
  let mode = 'login';
  const draw = () => {
    el.innerHTML = `
      ${seg('authTab', [['login', 'Log in'], ['signup', 'Create account'], ...(allowGuest ? [['guest', 'Play as guest']] : [])], mode)}
      ${mode === 'guest' ? `
        <p class="muted small">Guests can play everything, but XP, coins, kits and stats are <b>not saved</b>.</p>
        <input id="auName" maxlength="16" placeholder="Pick a name" autocomplete="off" value="${esc(G.name || '')}">
        <button class="bigBtn" id="auGo">PLAY AS GUEST ▶</button>`
      : !net.online ? `<p class="muted">Accounts need Supabase, which couldn't be reached. You can still play as a guest.</p>`
      : `
        <input id="auName" maxlength="16" placeholder="Username" autocomplete="username">
        <input id="auPass" type="password" maxlength="64" placeholder="Password${mode === 'signup' ? ' (6+ characters)' : ''}" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}">
        ${mode === 'signup' ? '<input id="auPass2" type="password" maxlength="64" placeholder="Repeat password" autocomplete="new-password"><p class="muted small">Username: 3–16 letters, numbers or _. No email needed — if you forget your password, ask the admin to reset it.</p>' : ''}
        <button class="bigBtn" id="auGo">${mode === 'signup' ? 'CREATE ACCOUNT ▶' : 'LOG IN ▶'}</button>`}
      <p class="authErr" id="auErr"></p>`;
    el.querySelector('#authTab').onclick = (e) => { const b = e.target.closest('button'); if (b) { mode = b.dataset.v; draw(); } };
    const go = el.querySelector('#auGo'); if (!go) return;
    const err = (t) => { el.querySelector('#auErr').textContent = t; };
    const submit = async () => {
      const name = el.querySelector('#auName').value.trim();
      if (mode === 'guest') {
        const n = name.replace(/\s+/g, ' ').slice(0, 16);
        if (n.length < 2) return err('Pick a name with at least 2 characters');
        playAsGuest(n); saveSettings(); onDone(); return;
      }
      const pw = el.querySelector('#auPass').value;
      if (mode === 'signup') {
        if (!validName(name)) return err('Username: 3–16 letters, numbers or _');
        if (pw !== el.querySelector('#auPass2').value) return err("Passwords don't match");
      }
      go.disabled = true; go.textContent = 'Please wait…'; err('');
      try {
        if (mode === 'signup') await signUp(name, pw); else await signIn(name, pw);
        if (A.profile?.banned) { await signOut(); go.disabled = false; draw(); return err('This account is banned.'); }
      } catch (e) { go.disabled = false; go.textContent = mode === 'signup' ? 'CREATE ACCOUNT ▶' : 'LOG IN ▶'; return err(e.message); }
      saveSettings(); onDone();
    };
    go.onclick = submit;
    el.querySelectorAll('input').forEach(i => i.onkeydown = (e) => { if (e.key === 'Enter') submit(); });
    el.querySelector('input')?.focus();
  };
  draw();
}
function renderAccount() {
  title(A.guest ? '🔑 Sign in' : '🔑 Account');
  body().onclick = null;
  if (A.guest) { authForm(body(), () => { closePanel(); toast('Welcome, ' + G.name + '!', 'good'); hooks.reenter?.(); }, { allowGuest: false }); return; }
  body().innerHTML = `<p>Signed in as <b>${esc(A.profile.username)}</b>.</p><button class="btn" id="logout">Log out</button>`;
  body().querySelector('#logout').onclick = async () => { await net.leaveParty(); await signOut(); location.reload(); };
}

// ================= SETTINGS =================
function renderSettings() {
  title('⚙️ Settings');
  body().onclick = null;
  const s = G.settings;
  body().innerHTML = `
    <div class="lbl">ACCOUNT</div>
    <div class="row">${A.guest ? `<span>Guest: <b>${esc(G.name)}</b></span><button class="btn" id="setAcc">Sign in / Sign up</button>` : `<span>Signed in as <b>${esc(A.profile.username)}</b></span><button class="btn" id="setAcc">Log out</button>`}</div>
    ${A.guest ? `<div class="lbl">GUEST NAME</div><div class="row"><input id="setName" maxlength="16" value="${esc(G.name)}"><button class="btn" id="setNameBtn">SAVE</button></div>` : ''}
    <div class="lbl">MOUSE SENSITIVITY <span id="sensV">${s.sens.toFixed(1)}</span></div><input type="range" id="setSens" min="0.3" max="3" step="0.1" value="${s.sens}">
    <div class="lbl">VOLUME <span id="volV">${Math.round(s.volume * 100)}%</span></div><input type="range" id="setVol" min="0" max="1" step="0.05" value="${s.volume}">
    <div class="lbl">FIELD OF VIEW <span id="fovV">${s.fov}</span></div><input type="range" id="setFov" min="55" max="100" step="1" value="${s.fov}">
    <div class="lbl">SHADOWS</div>${seg('setSh', [['1', 'On'], ['0', 'Off (faster)']], s.shadows ? '1' : '0')}
    <p class="muted small">Controls: WASD move • Space jump • Shift crouch • Click to lock mouse • 1-9 hotbar • E inventory • F shop • V first person • Scroll zoom • T chat • Tab scores • M mute • B fullscreen</p>`;
  const b = body();
  b.querySelector('#setAcc').onclick = async () => { if (A.guest) openPanel('account'); else { await net.leaveParty(); await signOut(); location.reload(); } };
  b.querySelector('#setNameBtn')?.addEventListener('click', () => { const n = b.querySelector('#setName').value.trim().replace(/\s+/g, ' ').slice(0, 16); if (n.length < 2) return; G.name = n; saveSettings(); toast('Name saved'); closePanel(); hooks.reenter?.(); });
  b.querySelector('#setSens').oninput = (e) => { s.sens = +e.target.value; $('sensV').textContent = s.sens.toFixed(1); saveSettings(); };
  b.querySelector('#setVol').oninput = (e) => { setVolume(+e.target.value); $('volV').textContent = Math.round(s.volume * 100) + '%'; saveSettings(); };
  b.querySelector('#setFov').oninput = (e) => { s.fov = +e.target.value; $('fovV').textContent = s.fov; G.camera.fov = s.fov; G.camera.updateProjectionMatrix(); saveSettings(); };
  onSeg('setSh', v => { s.shadows = v === '1'; G.renderer.shadowMap.enabled = s.shadows; G.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); }); saveSettings(); renderSettings(); });
}

// ================= ADMIN =================
let adminSel = null;
async function renderAdmin(q = adminRenderAdminQ) {
  title('🛠️ Admin');
  body().onclick = null;
  if (!isAdmin()) { body().innerHTML = '<p class="muted">Admins only.</p>'; return; }
  body().innerHTML = `
    <div class="row"><input id="adQ" placeholder="Search username" value="${esc(q)}"><button class="btn" id="adGo">SEARCH</button></div>
    <div class="list" id="adList"><div class="muted small">Searching…</div></div><div id="adUser"></div>`;
  const b = body();
  const search = () => { adminRenderAdminQ = b.querySelector('#adQ').value.trim(); renderAdmin(adminRenderAdminQ); };
  b.querySelector('#adGo').onclick = search;
  b.querySelector('#adQ').onkeydown = (e) => { if (e.key === 'Enter') search(); };
  let users; try { users = await adminFind(q); } catch (err) { $('adList').innerHTML = `<div class="muted small">${esc(err.message)}</div>`; return; }
  if (current !== 'admin') return;
  $('adList').innerHTML = users.length ? users.map(u => `<div class="li click ${adminSel === u.id ? 'me' : ''}" data-u="${u.id}"><span class="lv">${u.level}</span><b>${esc(u.username)}</b>${u.is_admin ? '<span class="adminTag">ADMIN</span>' : ''}${u.banned ? '<span class="banTag">BANNED</span>' : ''}<span class="muted small">🪙 ${u.coins} • ${u.games} games</span></div>`).join('') : '<div class="muted small">No players found</div>';
  $('adList').onclick = (e) => { const r = e.target.closest('[data-u]'); if (!r) return; adminSel = r.dataset.u; showUser(users.find(u => u.id === adminSel)); };
  if (adminSel) { const u = users.find(x => x.id === adminSel); if (u) showUser(u); }
}
let adminRenderAdminQ = '';
function showUser(u) {
  const el = $('adUser'); if (!el || !u) return;
  el.innerHTML = `
    <div class="adCard">
      <div class="mTop"><b class="pName">${esc(u.username)}</b><span class="muted small">joined ${new Date(u.created_at).toLocaleDateString()}</span></div>
      <p class="small">Login username: <b>${esc(u.username)}</b> • Level ${u.level} • ${u.xp} XP • 🪙 ${u.coins} • ${u.kills} kills<br>Kits: ${u.kits.map(k => KITS[k]?.icon + ' ' + (KITS[k]?.name || k)).join(', ')}</p>
      <div class="lbl">RESET PASSWORD</div>
      <div class="row"><input id="adPw" placeholder="New password (6+ characters)"><button class="btn buy" id="adPwGo">SET</button></div>
      <p class="muted small">Tell the player their username and this new password. They can log in straight away.</p>
      <div class="lbl">COINS / XP</div>
      <div class="row"><input id="adCoins" type="number" placeholder="Coins (+ or -)"><input id="adXp" type="number" placeholder="XP (+ or -)"><button class="btn" id="adGive">APPLY</button></div>
      <div class="lbl">GIVE KIT</div>
      <div class="row"><select id="adKit">${Object.entries(KITS).filter(([id]) => !u.kits.includes(id)).map(([id, k]) => `<option value="${id}">${k.icon} ${k.name}</option>`).join('')}</select><button class="btn" id="adKitGo">GIVE</button></div>
      <div class="lbl">GIVE COSMETIC</div>
      <div class="row"><select id="adCos">${Object.entries(COSMETICS).filter(([id, c]) => c.price > 0).map(([id, c]) => `<option value="${id}">${c.icon} ${c.name} (${c.kind})</option>`).join('')}</select><button class="btn" id="adCosGo">GIVE</button></div>
      <div class="lbl">RENAME</div>
      <div class="row"><input id="adName" maxlength="16" placeholder="New username"><button class="btn" id="adNameGo">RENAME</button></div>
      <div class="row" style="margin-top:12px">
        <button class="btn ${u.banned ? '' : 'danger'}" id="adBan">${u.banned ? 'Unban' : 'Ban player'}</button>
        <button class="btn" id="adAdm">${u.is_admin ? 'Remove admin' : 'Make admin'}</button>
      </div>
      <p class="muted small">Note: renaming changes the login username too.</p>
    </div>`;
  const run = async (fn, msg) => { try { await fn(); toast(msg, 'good'); renderAdmin(adminRenderAdminQ); } catch (err) { toast(err.message); } };
  el.querySelector('#adPwGo').onclick = () => { const pw = el.querySelector('#adPw').value; if (pw.length < 6) return toast('At least 6 characters'); run(() => adminSetPassword(u.id, pw), `Password for ${u.username} changed`); };
  el.querySelector('#adGive').onclick = () => run(() => adminUpdate(u.id, { add_coins: +el.querySelector('#adCoins').value || 0, add_xp: +el.querySelector('#adXp').value || 0 }), 'Updated');
  el.querySelector('#adKitGo').onclick = () => { const k = el.querySelector('#adKit').value; if (k) run(() => adminUpdate(u.id, { give_kit: k }), 'Kit given'); };
  el.querySelector('#adCosGo').onclick = () => { const k = el.querySelector('#adCos').value; if (k) run(() => adminUpdate(u.id, { give_cosmetic: k }), 'Cosmetic given'); };
  el.querySelector('#adNameGo').onclick = () => { const n = el.querySelector('#adName').value.trim(); if (!validName(n)) return toast('3–16 letters, numbers or _'); run(async () => { await renameUser(u, n); }, 'Renamed'); };
  el.querySelector('#adBan').onclick = () => { if (!u.banned && !confirm(`Ban ${u.username}?`)) return; run(() => adminUpdate(u.id, { banned: !u.banned }), u.banned ? 'Unbanned' : 'Banned'); };
  el.querySelector('#adAdm').onclick = () => { if (!confirm(u.is_admin ? `Remove admin from ${u.username}?` : `Make ${u.username} an admin? They will be able to change any account.`)) return; run(() => adminUpdate(u.id, { is_admin: !u.is_admin }), 'Updated'); };
}
// A rename must also change the hidden login email, which needs the database function.
async function renameUser(u, n) { await adminUpdate(u.id, { username: n }); }

// ================= LOCKER (cosmetics) =================
let lockerTab = 'skin';
function renderLocker() {
  title('🎨 Locker');
  const tabs = [['skin', '🎩 Hats'], ['bed', '🛏️ Beds'], ['kill', '💥 Kill effects'], ['name', '🏷️ Name colours'], ['emote', '🕺 Emotes']];
  const look = myLook();
  const items = Object.entries(COSMETICS).filter(([, c]) => c.kind === lockerTab);
  body().innerHTML = `
    <p class="muted">Spend coins on cosmetics. ${A.guest ? '<b>Guests can only use the free ones.</b>' : `You have <b class="coins">🪙 ${A.profile.coins}</b>`} ${lockerTab === 'emote' ? 'Press <b>X</b> in game to emote.' : ''}</p>
    ${seg('lkTab', tabs, lockerTab)}
    <div class="cards" style="margin-top:10px">${items.map(([id, c]) => {
      const owned = ownsCosmetic(id), on = lockerTab !== 'emote' && look[lockerTab] === id;
      const st = on ? '<span class="price owned">EQUIPPED</span>' : owned ? (lockerTab === 'emote' ? '<span class="price owned">OWNED</span>' : `<button class="btn sm" data-eq="${id}">EQUIP</button>`)
        : A.guest ? '<span class="price muted">Account needed</span>' : `<button class="btn sm buy" data-buy="${id}">🪙 ${c.price}</button>`;
      const prev = c.kind === 'name' ? `<b style="${c.color === 'rainbow' ? 'background:linear-gradient(90deg,#ff5252,#ffe45c,#4dff8a,#38c6ff,#b47dff);-webkit-background-clip:text;color:transparent' : 'color:' + c.color}">${esc(G.name)}</b>` : '';
      return `<div class="card ${on ? 'eq kit' : ''}"><div class="cIco lockerPrev">${c.icon}</div><b>${c.name}</b>${prev ? `<small>${prev}</small>` : ''}${st}</div>`;
    }).join('')}</div>`;
  onSeg('lkTab', v => { lockerTab = v; renderLocker(); });
  body().onclick = async (e) => {
    const eq = e.target.closest('[data-eq]'), buy = e.target.closest('[data-buy]');
    try {
      if (eq) { await equipCosmetic(eq.dataset.eq); sfx.click(); toast(COSMETICS[eq.dataset.eq].name + ' equipped'); }
      else if (buy) { const c = COSMETICS[buy.dataset.buy]; if (!confirm(`Buy ${c.name} for ${c.price} coins?`)) return; await buyCosmetic(buy.dataset.buy); sfx.buy(); toast(c.name + ' unlocked!', 'good'); }
      else return;
      hooks.refreshCard?.(); renderLocker();
    } catch (err) { sfx.deny(); toast(err.message); }
  };
}
