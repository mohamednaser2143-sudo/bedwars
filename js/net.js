// Supabase Realtime networking: hub presence, party lobbies, match messages.
// No tables needed — only Broadcast + Presence on public channels.
import { SUPABASE_URL, SUPABASE_ANON_KEY, TEAM_KEYS, MAP_KEYS, COSMETICS, MAPS } from './config.js';
import { G } from './state.js';

export let sb = null;
export let online = false;
try {
  // loaded lazily so Solo mode still works if Supabase can't be reached
  const { createClient } = await Promise.race([
    import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Supabase load timeout')), 7000)),
  ]);
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fob-auth' }, realtime: { params: { eventsPerSecond: 60 } } });
  online = true;
} catch (err) { console.error('Supabase init failed', err); }

function sendOn(ch, k, d = {}) {
  if (!ch) return;
  try { const r = ch.send({ type: 'broadcast', event: 'g', payload: { ...d, k, from: G.myId } }); r?.catch?.(() => {}); } catch {}
}
function presentIds(ch) { try { return Object.keys(ch?.presenceState() || {}); } catch { return []; } }

// ================= HUB =================
let hub = null;
export const hubEvents = { onPos: null, onLeave: null, onChat: null, onCount: null, onInvite: null, onPeople: null };
let hubMeta = {};
export async function joinHub() {
  if (!online || hub) return false;
  try {
    const ch = sb.channel('fob-hub-v2', { config: { broadcast: { self: false }, presence: { key: G.myId } } });
    ch.on('broadcast', { event: 'g' }, (m) => {
      const p = m.payload || {}; if (p.from === G.myId) return;
      if (p.k === 'pos') hubEvents.onPos?.(p.from, p.n, p.d, p.l, p.lk, p.em);
      else if (p.k === 'chat') hubEvents.onChat?.(p.n, p.t);
      else if (p.k === 'hello') { lastHubPos = 0; }
      else if (p.k === 'invite') hubEvents.onInvite?.(p);
    });
    ch.on('presence', { event: 'leave' }, ({ key }) => hubEvents.onLeave?.(key));
    ch.on('presence', { event: 'sync' }, () => { hubEvents.onCount?.(presentIds(ch).length); hubEvents.onPeople?.(); });
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), 10000); ch.subscribe(st => { if (st === 'SUBSCRIBED') { clearTimeout(t); res(); } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(t); rej(new Error(st)); } }); });
    hub = ch;
    await ch.track({ n: G.name, ...hubMeta });
    sendOn(hub, 'hello');
    return true;
  } catch (err) { console.warn('Hub connect failed', err); try { if (hub) sb.removeChannel(hub); } catch {} hub = null; return false; }
}
export async function leaveHub() { const ch = hub; hub = null; if (ch) { try { await ch.untrack(); } catch {} try { await sb.removeChannel(ch); } catch {} } }
let lastHubPos = 0, lastHubSig = '';
export function sendHubPos(e, force = false) {
  if (!hub) return; const now = performance.now(); if (!force && now - lastHubPos < 200) return;
  const d = [+e.pos.x.toFixed(1), +e.pos.y.toFixed(1), +e.pos.z.toFixed(1), +e.yaw.toFixed(2)];
  const sig = d.join(','); if (!force && sig === lastHubSig && now - lastHubPos < 2000) return;
  lastHubSig = sig; lastHubPos = now; sendOn(hub, 'pos', { n: G.name, l: hubMeta.lvl || 1, d, lk: hubMeta.lk, em: e.emote ? [e.emote.id, e.emote.seq] : null });
}
export function sendHubChat(t) { sendOn(hub, 'chat', { n: G.name, t }); }
// what other hub players can see about us (level, account id, public party)
let metaTimer = null;
export function setHubMeta(m) {
  Object.assign(hubMeta, m);
  for (const k of Object.keys(hubMeta)) if (hubMeta[k] == null) delete hubMeta[k];
  clearTimeout(metaTimer);
  metaTimer = setTimeout(() => { if (hub) hub.track({ n: G.name, ...hubMeta }).catch?.(() => {}); }, 250);
}
export function hubPeople() {
  try { return Object.entries(hub?.presenceState() || {}).map(([id, arr]) => ({ id, ...(arr[0] || {}) })); } catch { return []; }
}
export function sendInvite(toUid, code) { sendOn(hub, 'invite', { to: toUid, code, n: G.name }); }

// ================= PARTY / MATCH =================
let party = null;               // channel
export const P = { code: null, isHost: false, hostId: null, players: {}, settings: { mode: 'solos', bots: true, diff: 'normal', public: false, quick: false }, status: 'none', me: { kit: 'default', lvl: 1 } };
export const partyEvents = { onUpdate: null, onStart: null, onClosed: null, onError: null };
let matchHandler = null, leaveHandler = null, joinTimers = [];
const LOBBY_KINDS = new Set(['join_req', 'lobby', 'reject', 'closed', 'start', 'team_req', 'pchat', 'pinfo']);

export function onMatch(fn) { matchHandler = fn; }
export function onPresenceLeave(fn) { leaveHandler = fn; }
export function sendMatch(k, d) { sendOn(party, k, d); }
export function sendParty(k, d) { sendOn(party, k, d); }
export function authorityId(hostId) {
  const ids = presentIds(party);
  if (!ids.length || ids.includes(hostId)) return hostId;
  return ids.sort()[0];
}
export const teamCap = () => P.settings.mode === 'duos' ? 2 : 1;

// what a player tells the party host about themselves (checked so nobody can send junk)
function cleanInfo(p) {
  const lk = p.look || {}, ok = (id, kind) => COSMETICS[id]?.kind === kind ? id : undefined;
  return {
    kit: String(p.kit || 'default').slice(0, 20), lvl: Math.max(1, Math.min(200, +p.lvl || 1)),
    look: { skin: ok(lk.skin, 'skin') || 'skin_default', bed: ok(lk.bed, 'bed') || 'bed_default', kill: ok(lk.kill, 'kill') || 'kill_default', name: ok(lk.name, 'name') || 'name_white' },
    uid: typeof p.uid === 'string' ? p.uid.slice(0, 40) : null, rating: Math.max(0, Math.min(5000, +p.rating || 1000)),
    vote: MAP_KEYS.includes(p.vote) ? p.vote : null,
  };
}
function code6() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
function freeTeam(skip) {
  const cap = teamCap();
  for (const t of TEAM_KEYS) { if (t === skip) continue; const n = Object.values(P.players).filter(p => p.team === t).length; if (n < cap) return t; }
  return null;
}

async function connectParty(code) {
  const ch = sb.channel('fob-party-' + code, { config: { broadcast: { self: false }, presence: { key: G.myId } } });
  ch.on('broadcast', { event: 'g' }, (m) => { const p = m.payload || {}; if (p.from === G.myId) return; try { onPartyMsg(p); } catch (e) { console.error(e); } });
  ch.on('presence', { event: 'leave' }, ({ key }) => onPartyLeave(key));
  ch.on('presence', { event: 'sync' }, () => { if (P.isHost && P.status === 'lobby') { const ids = new Set(presentIds(ch)); let ch2 = false; for (const id of Object.keys(P.players)) if (!ids.has(id)) { delete P.players[id]; ch2 = true; } if (ch2) pushLobby(); } });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), 10000); ch.subscribe(st => { if (st === 'SUBSCRIBED') { clearTimeout(t); res(); } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(t); rej(new Error(st)); } }); });
  await ch.track({ n: G.name });
  return ch;
}

export async function createParty(customCode = null, settings = {}) {
  if (!online) throw new Error('offline');
  await leaveParty();
  const code = customCode || code6();
  party = await connectParty(code);
  Object.assign(P, { code, isHost: true, hostId: G.myId, players: { [G.myId]: { name: G.name, team: 'blue', ...cleanInfo(P.me) } }, status: 'lobby' });
  P.settings = { mode: 'solos', bots: true, diff: 'normal', public: false, quick: false, ranked: false, ...settings };
  pushLobby();
  return code;
}
export async function joinParty(code) {
  if (!online) throw new Error('offline');
  await leaveParty();
  party = await connectParty(code);
  Object.assign(P, { code, isHost: false, hostId: null, players: {}, status: 'joining' });
  sendOn(party, 'join_req', { n: G.name, ...P.me });
  joinTimers.push(setInterval(() => { if (P.status === 'joining') sendOn(party, 'join_req', { n: G.name, ...P.me }); }, 1200));
  return new Promise((resolve, reject) => {
    joinTimers.push(setTimeout(() => { if (P.status === 'joining') { leaveParty(); reject(new Error('notfound')); } }, 7000));
    P._resolveJoin = resolve; P._rejectJoin = reject;
  });
}
function clearJoin() { for (const t of joinTimers) { clearInterval(t); clearTimeout(t); } joinTimers = []; }
export async function leaveParty() {
  clearJoin();
  if (party) {
    if (P.isHost && P.status === 'lobby') sendOn(party, 'closed');
    const ch = party; party = null;
    try { await ch.untrack(); } catch {} try { await sb.removeChannel(ch); } catch {}
  }
  Object.assign(P, { code: null, isHost: false, hostId: null, players: {}, status: 'none' });
  matchHandler = null;
  setHubMeta({ pc: null, pn: null, pm: null, pcap: null });
}
function pushLobby() {
  if (!P.isHost) return;
  sendOn(party, 'lobby', { players: P.players, settings: P.settings }); partyEvents.onUpdate?.();
  // public parties show up in everyone's Multiplayer menu
  if (P.settings.public && P.status === 'lobby') setHubMeta({ pc: P.code, pn: Object.keys(P.players).length, pm: P.settings.mode, pcap: teamCap() * 4 });
  else setHubMeta({ pc: null, pn: null, pm: null, pcap: null });
}
export function setMyPartyInfo(me) {
  Object.assign(P.me, me);
  if (!P.code) return;
  if (P.isHost) { if (P.players[G.myId]) Object.assign(P.players[G.myId], cleanInfo({ ...P.players[G.myId], ...me })); pushLobby(); }
  else sendOn(party, 'pinfo', me);
}

export function requestTeam(team) {
  if (P.isHost) { assignTeam(G.myId, team); return; }
  sendOn(party, 'team_req', { team });
}
function assignTeam(id, team) {
  const n = Object.entries(P.players).filter(([pid, p]) => p.team === team && pid !== id).length;
  if (n >= teamCap() || !P.players[id]) return;
  P.players[id].team = team; pushLobby();
}
export function setSettings(s) {
  if (!P.isHost) return;
  Object.assign(P.settings, s);
  if (P.settings.mode === 'solos') { // re-spread players if a team now has too many
    const used = {}; for (const [id, p] of Object.entries(P.players)) { if (used[p.team]) { const t = TEAM_KEYS.find(k => !Object.values(P.players).some(q => q.team === k)); if (t) p.team = t; } used[p.team] = 1; }
  }
  pushLobby();
}
export function sendPartyChat(t) { sendOn(party, 'pchat', { n: G.name, t }); }

// Host starts: builds roster (players + bots) and tells everyone.
export function startPartyMatch() {
  if (!P.isHost) return null;
  const roster = Object.entries(P.players).map(([id, p]) => ({ id, name: p.name, team: p.team, kit: p.kit || 'default', lvl: p.lvl || 1, look: p.look, uid: p.uid, rating: p.rating }));
  if (P.settings.bots) {
    const cap = teamCap(); let i = 0;
    const names = ['Rex', 'Nova', 'Blaze', 'Pixel', 'Turbo', 'Echo', 'Viper', 'Frost'];
    for (const t of TEAM_KEYS) {
      const have = roster.filter(r => r.team === t).length;
      for (let k = have; k < cap; k++) roster.push({ id: 'bot_' + t + k + '_' + Math.random().toString(36).slice(2, 6), name: names[i++ % names.length] + ' (Bot)', team: t, bot: true, diff: P.settings.diff });
    }
  }
  P.status = 'playing';
  // map: most votes wins (ties and no votes = random)
  const tally = {}; for (const p of Object.values(P.players)) if (p.vote) tally[p.vote] = (tally[p.vote] || 0) + 1;
  const top = Math.max(0, ...Object.values(tally)), best = Object.keys(tally).filter(k => tally[k] === top);
  const map = best.length ? best[Math.floor(Math.random() * best.length)] : MAP_KEYS[Math.floor(Math.random() * MAP_KEYS.length)];
  const msg = { roster, hostId: G.myId, kind: P.settings.ranked ? 'ranked' : P.settings.quick ? 'quick' : 'mp', map, ranked: P.settings.rankedId || null };
  setHubMeta({ pc: null, pn: null, pm: null, pcap: null });
  sendOn(party, 'start', msg);
  return msg;
}

function onPartyMsg(p) {
  if (!LOBBY_KINDS.has(p.k)) { if (P.status === 'playing') matchHandler?.(p); return; }
  switch (p.k) {
    case 'join_req':
      if (!P.isHost) return;
      if (P.status !== 'lobby') { sendOn(party, 'reject', { to: p.from, reason: 'started' }); return; }
      if (!P.players[p.from]) {
        const t = freeTeam(); if (!t) { sendOn(party, 'reject', { to: p.from, reason: 'full' }); return; }
        P.players[p.from] = { name: String(p.n || 'Player').slice(0, 16), team: t, ...cleanInfo(p) };
      }
      pushLobby(); return;
    case 'lobby':
      if (P.isHost) return;
      P.hostId = p.from; P.players = p.players || {}; P.settings = p.settings || P.settings;
      if (P.status === 'joining' && P.players[G.myId]) { P.status = 'lobby'; clearJoin(); P._resolveJoin?.(P.code); }
      partyEvents.onUpdate?.(); return;
    case 'reject':
      if (p.to !== G.myId) return;
      clearJoin(); const r = p.reason; leaveParty(); P._rejectJoin?.(new Error(r)); partyEvents.onError?.(r); return;
    case 'team_req': if (P.isHost) assignTeam(p.from, p.team); return;
    case 'pinfo': if (P.isHost && P.players[p.from]) { Object.assign(P.players[p.from], cleanInfo({ ...P.players[p.from], ...p })); pushLobby(); } return;
    case 'closed': if (p.from === P.hostId && P.status !== 'playing') { leaveParty(); partyEvents.onClosed?.(); } return;
    case 'pchat': partyEvents.onChat?.(p.n, p.t); return;
    case 'start':
      if (P.isHost || P.status === 'playing') return;
      if (!p.roster?.some(r => r.id === G.myId)) { partyEvents.onError?.('started'); leaveParty(); return; }
      P.status = 'playing'; partyEvents.onStart?.(p); return;
  }
}
function onPartyLeave(id) {
  if (!id || id === G.myId) return;
  if (P.status === 'playing') { leaveHandler?.(id); return; }
  if (P.isHost) { if (P.players[id]) { delete P.players[id]; pushLobby(); } }
  else if (id === P.hostId) { leaveParty(); partyEvents.onClosed?.(); }
}

// ================= QUICK PLAY (matchmaking queue) =================
// Everyone waiting joins one channel. The player who has waited longest is the matchmaker:
// once 2+ are waiting it counts down (or goes straight away at 4), picks a party code and
// tells the group to join it. Empty teams are filled with bots.
let queue = null, qTimer = null;
export const Q = { on: false, count: 0, left: 0, deadline: 0, ranked: false };
export const queueEvents = { onUpdate: null, onGo: null };
function qMembers() {
  try { return Object.entries(queue?.presenceState() || {}).map(([id, a]) => ({ id, ...(a[0] || {}) })).sort((x, y) => (x.t - y.t) || (x.id < y.id ? -1 : 1)); } catch { return []; }
}
export async function joinQueue(ranked = false) {
  if (!online || queue) return;
  Q.ranked = ranked;
  const ch = sb.channel(ranked ? 'fob-queue-ranked-v1' : 'fob-queue-v1', { config: { broadcast: { self: false }, presence: { key: G.myId } } });
  ch.on('broadcast', { event: 'g' }, (m) => {
    const p = m.payload || {}; if (p.from === G.myId) return;
    if (p.k === 'qgo' && p.ids?.includes(G.myId)) { const r = Q.ranked; leaveQueue(); queueEvents.onGo?.({ code: p.code, host: false, ranked: r }); }
    if (p.k === 'qtick') { Q.left = p.left; queueEvents.onUpdate?.(); }
  });
  ch.on('presence', { event: 'sync' }, () => qEval());
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), 10000); ch.subscribe(st => { if (st === 'SUBSCRIBED') { clearTimeout(t); res(); } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(t); rej(new Error(st)); } }); });
  queue = ch; Q.on = true; Q.deadline = 0; Q.left = 0;
  await ch.track({ n: G.name, t: Date.now() });
  qTimer = setInterval(qEval, 1000);
}
function qEval() {
  if (!queue) return;
  const list = qMembers(); Q.count = list.length;
  if (list[0]?.id === G.myId && list.length >= 2) {
    const now = Date.now();
    if (!Q.deadline) Q.deadline = now + (Q.ranked ? 15000 : 12000);
    Q.left = Math.max(0, Math.ceil((Q.deadline - now) / 1000));
    sendOn(queue, 'qtick', { left: Q.left });
    if (list.length >= 4 || now >= Q.deadline) {
      const group = list.slice(0, 4).map(x => x.id);
      const code = code6();
      sendOn(queue, 'qgo', { code, ids: group });
      const r = Q.ranked; leaveQueue();
      queueEvents.onGo?.({ code, host: true, ids: group, ranked: r });
      return;
    }
  } else if (list[0]?.id === G.myId) { Q.deadline = 0; Q.left = 0; }
  queueEvents.onUpdate?.();
}
export async function leaveQueue() {
  clearInterval(qTimer); qTimer = null;
  const ch = queue; queue = null; Q.on = false; Q.count = 0; Q.left = 0; Q.deadline = 0;
  if (ch) { try { await ch.untrack(); } catch {} try { await sb.removeChannel(ch); } catch {} }
  queueEvents.onUpdate?.();
}
export function partySize() { return Object.keys(P.players).length; }
