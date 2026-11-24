// Accounts (username + password), profile, progression, kits, missions, friends, admin.
// All the rules (XP, coins, prices) are enforced by the database functions in supabase/setup.sql.
import { sb, online } from './net.js';
import { G } from './state.js';
import { KITS, levelNeed, COSMETICS, FREE_COSMETICS, DEFAULT_LOOK, rankOf } from './config.js';

export const A = { user: null, profile: null, guest: true };
const EMAIL_DOMAIN = 'players.example.com';
const toEmail = (u) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
export const validName = (u) => /^[A-Za-z0-9_]{3,16}$/.test(u);

function errText(e) {
  const m = (e?.message || String(e || '')).toLowerCase();
  if (m.includes('invalid login')) return 'Wrong username or password';
  if (m.includes('already registered') || m.includes('already been registered')) return 'That username is taken';
  if (m.includes('password should be') || m.includes('at least 6')) return 'Password must be at least 6 characters';
  if (m.includes('email not confirmed')) return 'Turn OFF "Confirm email" in Supabase (see README)';
  if (m.includes('rate limit')) return 'Too many attempts — wait a minute';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Could not reach the server';
  return e?.message || 'Something went wrong';
}
async function rpc(name, args) {
  if (!sb) throw new Error('offline');
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(errText(error));
  return data;
}

export async function restoreSession() {
  if (!online || !sb) return false;
  try {
    const { data } = await sb.auth.getSession();
    if (!data?.session) return false;
    A.user = data.session.user; A.guest = false;
    await refreshProfile();
    return !!A.profile;
  } catch { return false; }
}
export async function refreshProfile() {
  if (!A.user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', A.user.id).single();
  if (error) throw new Error(errText(error));
  A.profile = data; G.name = data.username;
  return data;
}
export async function signUp(username, password) {
  username = username.trim();
  if (!validName(username)) throw new Error('Username: 3–16 letters, numbers or _');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  if (!(await rpc('username_available', { name: username }))) throw new Error('That username is taken');
  const { data, error } = await sb.auth.signUp({ email: toEmail(username), password, options: { data: { username } } });
  if (error) throw new Error(errText(error));
  if (!data.session) {
    // email confirmation is switched on in Supabase → try logging straight in
    const r = await sb.auth.signInWithPassword({ email: toEmail(username), password });
    if (r.error) throw new Error(errText(r.error));
    A.user = r.data.user;
  } else A.user = data.user;
  A.guest = false;
  // the profile row is created by a database trigger; give it a moment
  for (let i = 0; i < 6; i++) { try { await refreshProfile(); if (A.profile) break; } catch { await new Promise(r => setTimeout(r, 400)); } }
  if (!A.profile) throw new Error('Account made, but the profile is missing — did you run setup.sql?');
}
export async function signIn(username, password) {
  if (!username.trim() || !password) throw new Error('Enter your username and password');
  const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(username), password });
  if (error) throw new Error(errText(error));
  A.user = data.user; A.guest = false;
  await refreshProfile();
}
export async function signOut() { try { await sb?.auth.signOut(); } catch {} A.user = null; A.profile = null; A.guest = true; }
export function playAsGuest(name) { A.user = null; A.profile = null; A.guest = true; G.name = name; }

// ---------- progression ----------
export function levelProgress(p = A.profile) {
  if (!p) return { level: 1, into: 0, need: levelNeed(1) };
  let xp = p.xp, l = 1; while (xp >= levelNeed(l) && l < 200) { xp -= levelNeed(l); l++; }
  return { level: l, into: xp, need: levelNeed(l) };
}
export const myLevel = () => A.profile?.level || 1;
export const myKit = () => {
  const k = A.profile?.kit || G.settings.guestKit || 'default';
  if (A.guest) return KITS[k] && KITS[k].price === 0 ? k : 'default';
  return k;
};
export const ownsKit = (k) => A.guest ? KITS[k]?.price === 0 && KITS[k]?.lvl <= 1 : !!A.profile?.kits?.includes(k);

export async function submitMatch(stats) {
  if (A.guest || !A.user) return null;
  const res = await rpc('submit_match', { p: stats });
  await refreshProfile();
  return res;
}
export async function buyKit(id) { const r = await rpc('buy_kit', { kit_id: id }); await refreshProfile(); return r; }
export async function setKit(id) {
  if (A.guest) { G.settings.guestKit = id; return id; }
  const r = await rpc('set_kit', { kit_id: id }); A.profile.kit = id; return r;
}
export const getMissions = () => rpc('get_missions');
export async function claimMission(id) { const r = await rpc('claim_mission', { mission_id: id }); await refreshProfile(); return r; }
export const leaderboard = (stat = 'xp', weekly = false, lim = 10) => rpc('leaderboard', { stat, weekly, lim });
export async function history() {
  if (A.guest) return [];
  const { data, error } = await sb.from('match_results').select('*').eq('user_id', A.user.id).order('created_at', { ascending: false }).limit(15);
  if (error) throw new Error(errText(error)); return data;
}

// ---------- cosmetics ----------
export const ownsCosmetic = (id) => A.guest ? FREE_COSMETICS.includes(id) : !!A.profile?.cosmetics?.includes(id) || FREE_COSMETICS.includes(id);
export function myLook() {
  if (A.guest) return { ...DEFAULT_LOOK };
  return { ...DEFAULT_LOOK, ...(A.profile?.equipped || {}) };
}
export const myEmotes = () => Object.keys(COSMETICS).filter(k => COSMETICS[k].kind === 'emote' && ownsCosmetic(k));
export async function buyCosmetic(id) { const r = await rpc('buy_cosmetic', { item: id }); await refreshProfile(); return r; }
export async function equipCosmetic(id) { const r = await rpc('equip_cosmetic', { item: id }); A.profile.equipped = r; return r; }

// ---------- ranked ----------
export const myRating = () => A.profile?.rating ?? 1000;
export const myRank = () => rankOf(myRating());
export const rankedStart = (ids) => rpc('ranked_start', { player_ids: ids });
export const rankedFinish = (id, placements) => rpc('ranked_finish', { match_id: id, placements });

// ---------- friends ----------
export const myFriends = () => rpc('my_friends');
export const addFriend = (name) => rpc('send_friend_request', { friend_name: name });
export const respondFriend = (id, accept) => rpc('respond_friend', { other: id, accept });
export const removeFriend = (id) => rpc('remove_friend', { other: id });

// ---------- admin ----------
export const isAdmin = () => !!A.profile?.is_admin;
export const adminFind = (q) => rpc('admin_find', { q });
export const adminSetPassword = (id, pw) => rpc('admin_set_password', { target: id, new_password: pw });
export const adminUpdate = (id, changes) => rpc('admin_update', { target: id, changes });
