// Supabase Realtime networking: hub presence, party lobbies, match messages.
// No tables needed — only Broadcast + Presence on public channels.
import { SUPABASE_URL, SUPABASE_ANON_KEY, TEAM_KEYS } from './config.js';
import { G } from './state.js';

let sb = null;
export let online = false;
try {
  // loaded lazily so Solo mode still works if Supabase can't be reached
  const { createClient } = await Promise.race([
    import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Supabase load timeout')), 7000)),
  ]);
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 60 } } });
  online = true;
} catch (err) { console.error('Supabase init failed', err); }

function sendOn(ch, k, d = {}) {
  if (!ch) return;
  try { const r = ch.send({ type: 'broadcast', event: 'g', payload: { ...d, k, from: G.myId } }); r?.catch?.(() => {}); } catch {}
}
function presentIds(ch) { try { return Object.keys(ch?.presenceState() || {}); } catch { return []; } }

// ================= HUB =================
let hub = null;
export const hubEvents = { onPos: null, onLeave: null, onChat: null, onCount: null };
export async function joinHub() {
  if (!online || hub) return false;
  try {
    const ch = sb.channel('fob-hub-v2', { config: { broadcast: { self: false }, presence: { key: G.myId } } });
    ch.on('broadcast', { event: 'g' }, (m) => {
      const p = m.payload || {}; if (p.from === G.myId) return;
      if (p.k === 'pos') hubEvents.onPos?.(p.from, p.n, p.d);
      else if (p.k === 'chat') hubEvents.onChat?.(p.n, p.t);
      else if (p.k === 'hello') { lastHubPos = 0; }
    });
    ch.on('presence', { event: 'leave' }, ({ key }) => hubEvents.onLeave?.(key));
    ch.on('presence', { event: 'sync' }, () => hubEvents.onCount?.(presentIds(ch).length));
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), 10000); ch.subscribe(st => { if (st === 'SUBSCRIBED') { clearTimeout(t); res(); } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(t); rej(new Error(st)); } }); });
    hub = ch;
    await ch.track({ n: G.name });
    sendOn(hub, 'hello');
    return true;
  } catch (err) { console.warn('Hub connect failed', err); try { if (hub) sb.removeChannel(hub); } catch {} hub = null; return false; }
}
export async function leaveHub() { const ch = hub; hub = null; if (ch) { try { await ch.untrack(); } catch {} try { await sb.removeChannel(ch); } catch {} } }
let lastHubPos = 0, lastHubSig = '';
export function sendHubPos(e) {
  if (!hub) return; const now = performance.now(); if (now - lastHubPos < 200) return;
  const d = [+e.pos.x.toFixed(1), +e.pos.y.toFixed(1), +e.pos.z.toFixed(1), +e.yaw.toFixed(2)];
  const sig = d.join(','); if (sig === lastHubSig && now - lastHubPos < 2000) return;
  lastHubSig = sig; lastHubPos = now; sendOn(hub, 'pos', { n: G.name, d });
}
export function sendHubChat(t) { sendOn(hub, 'chat', { n: G.name, t }); }

// ================= PARTY / MATCH =================
let party = null;               // channel
export const P = { code: null, isHost: false, hostId: null, players: {}, settings: { mode: 'solos', bots: true, diff: 'normal' }, status: 'none' };
export const partyEvents = { onUpdate: null, onStart: null, onClosed: null, onError: null };
let matchHandler = null, leaveHandler = null, joinTimers = [];
const LOBBY_KINDS = new Set(['join_req', 'lobby', 'reject', 'closed', 'start', 'team_req', 'pchat']);

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

export async function createParty() {
  if (!online) throw new Error('offline');
  await leaveParty();
  const code = code6();
  party = await connectParty(code);
  Object.assign(P, { code, isHost: true, hostId: G.myId, players: { [G.myId]: { name: G.name, team: 'blue' } }, status: 'lobby' });
  P.settings = { mode: 'solos', bots: true, diff: 'normal' };
  pushLobby();
  return code;
}
export async function joinParty(code) {
  if (!online) throw new Error('offline');
  await leaveParty();
  party = await connectParty(code);
  Object.assign(P, { code, isHost: false, hostId: null, players: {}, status: 'joining' });
  sendOn(party, 'join_req', { n: G.name });
  joinTimers.push(setInterval(() => { if (P.status === 'joining') sendOn(party, 'join_req', { n: G.name }); }, 1200));
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
}
function pushLobby() { if (!P.isHost) return; sendOn(party, 'lobby', { players: P.players, settings: P.settings }); partyEvents.onUpdate?.(); }

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
  const roster = Object.entries(P.players).map(([id, p]) => ({ id, name: p.name, team: p.team }));
  if (P.settings.bots) {
    const cap = teamCap(); let i = 0;
    const names = ['Rex', 'Nova', 'Blaze', 'Pixel', 'Turbo', 'Echo', 'Viper', 'Frost'];
    for (const t of TEAM_KEYS) {
      const have = roster.filter(r => r.team === t).length;
      for (let k = have; k < cap; k++) roster.push({ id: 'bot_' + t + k + '_' + Math.random().toString(36).slice(2, 6), name: names[i++ % names.length] + ' (Bot)', team: t, bot: true, diff: P.settings.diff });
    }
  }
  P.status = 'playing';
  const msg = { roster, hostId: G.myId };
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
        P.players[p.from] = { name: String(p.n || 'Player').slice(0, 16), team: t };
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
