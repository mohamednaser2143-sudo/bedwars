// Item shop + team upgrades. tryBuy/tryUpgrade work for players and bots.
import { G } from './state.js';
import { SHOP, ITEMS, ARMOR, CURRENCY, UPGRADES } from './config.js';
import { $, esc, toast } from './ui.js';
import { sfx } from './audio.js';
import { renderHotbar, renderResources } from './invui.js';

export function entryStatus(e, it) {
  const inv = e.inv;
  if (it.armor != null) { if (e.armor >= it.armor) return 'owned'; }
  else {
    const d = ITEMS[it.id];
    if (d.type === 'sword' || d.type === 'pickaxe') { const b = inv.best(d.type); if (b && ITEMS[b].tier >= d.tier) return 'owned'; }
    if (d.type === 'bow' && inv.has('bow')) return 'owned';
  }
  if (inv.res[it.cost[0]] < it.cost[1]) return 'poor';
  return 'ok';
}
export function tryBuy(e, it) {
  const st = entryStatus(e, it); if (st !== 'ok') return st;
  if (it.armor != null) { e.armor = it.armor; e.avatar.setArmor(e.armor); }
  else if (!e.inv.add(it.id, it.n)) return 'full';
  e.inv.res[it.cost[0]] -= it.cost[1];
  return 'ok';
}

export function upgradeLevel(team, key) { return G.match?.teamUp[team]?.[key] || 0; }
export function upgradeStatus(e, key) {
  const u = UPGRADES[key], lvl = upgradeLevel(e.team, key);
  if (lvl >= u.costs.length) return 'owned';
  if (e.inv.res.diamond < u.costs[lvl]) return 'poor';
  return 'ok';
}
export function tryUpgrade(e, key) {
  const st = upgradeStatus(e, key); if (st !== 'ok') return st;
  const lvl = upgradeLevel(e.team, key);
  e.inv.res.diamond -= UPGRADES[key].costs[lvl];
  G.match.teamUp[e.team][key] = lvl + 1;
  G.match.send?.('upg', { team: e.team, key, lvl: lvl + 1 });
  return 'ok';
}

// ---------- UI ----------
let tab = 0;
function priceHTML(c) { const cur = CURRENCY[c[0]]; return `<span class="price" style="color:${cur.css}">${cur.icon} ${c[1]} ${cur.name}</span>`; }

export function renderShop() {
  const e = G.local;
  $('shopTabs').innerHTML = SHOP.map((c, i) => `<button class="tab ${i === tab ? 'on' : ''}" data-t="${i}">${c.icon} ${c.cat}</button>`).join('');
  $('shopItems').innerHTML = SHOP[tab].items.map((it, i) => {
    const st = entryStatus(e, it);
    const name = it.armor != null ? ARMOR[it.armor].name + ' Armor' : ITEMS[it.id].name;
    const icon = it.armor != null ? '🛡️' : ITEMS[it.id].icon;
    const sub = it.armor != null ? `Take ${Math.round((1 - ARMOR[it.armor].mult) * 100)}% less damage` : (ITEMS[it.id].dmg ? `${ITEMS[it.id].dmg} damage` : ITEMS[it.id].speed ? `Mines ${ITEMS[it.id].speed}× faster` : it.n > 1 ? `×${it.n}` : '');
    return `<div class="card ${st}" data-i="${i}"><div class="cIco" style="${it.armor != null ? 'filter:hue-rotate(' + it.armor * 60 + 'deg)' : ''}">${icon}</div><b>${esc(name)}${it.n > 1 ? ` ×${it.n}` : ''}</b><small>${esc(sub)}</small>${st === 'owned' ? '<span class="price owned">OWNED</span>' : priceHTML(it.cost)}</div>`;
  }).join('');
  renderShopRes();
}
function renderShopRes() {
  const inv = G.local.inv; let h = '';
  for (const k of Object.keys(CURRENCY)) h += `<span style="color:${CURRENCY[k].css}">${CURRENCY[k].icon} ${inv.res[k]}</span>`;
  $('shopRes').innerHTML = h; $('upRes').innerHTML = h;
}

export function renderUpgrades() {
  const e = G.local;
  $('upItems').innerHTML = Object.entries(UPGRADES).map(([k, u]) => {
    const lvl = upgradeLevel(e.team, k), st = upgradeStatus(e, k);
    const max = u.costs.length, nextDesc = lvl < max ? u.desc(lvl) : u.desc(max - 1);
    const pips = u.costs.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    const label = k === 'trap' ? (lvl ? 'ARMED' : '') : (lvl >= max ? 'MAX' : '');
    return `<div class="card ${st}" data-k="${k}"><div class="cIco">${u.icon}</div><b>${u.name}${max > 1 ? ' ' + ['I', 'II', 'III'][Math.min(lvl, max - 1)] : ''}</b><small>${esc(nextDesc)}</small><div class="pips">${pips}</div>${st === 'owned' ? `<span class="price owned">${label || 'MAX'}</span>` : priceHTML(['diamond', u.costs[lvl]])}</div>`;
  }).join('');
  renderShopRes();
}

let wired = false;
function wire() {
  if (wired) return; wired = true;
  $('shopTabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (!b) return; tab = +b.dataset.t; sfx.click(); renderShop(); });
  $('shopItems').addEventListener('click', e => {
    const c = e.target.closest('.card'); if (!c) return;
    const it = SHOP[tab].items[+c.dataset.i];
    const r = tryBuy(G.local, it);
    if (r === 'ok') { sfx.buy(); G.match?.onLocalChanged?.(); }
    else { sfx.deny(); toast(r === 'poor' ? `Not enough ${CURRENCY[it.cost[0]].name}` : r === 'owned' ? 'You already have this' : 'Inventory full'); }
    renderShop(); renderHotbar(true); renderResources();
  });
  $('upItems').addEventListener('click', e => {
    const c = e.target.closest('.card'); if (!c) return;
    const r = tryUpgrade(G.local, c.dataset.k);
    if (r === 'ok') { sfx.buy(); toast(UPGRADES[c.dataset.k].name + ' purchased for your team!', 'good'); }
    else { sfx.deny(); toast(r === 'poor' ? 'Not enough Diamonds' : 'Already maxed'); }
    renderUpgrades(); renderResources();
  });
}
export function openShop() { wire(); G.uiOpen = 'shop'; renderShop(); $('shop').style.display = 'flex'; if (document.pointerLockElement) document.exitPointerLock(); }
export function closeShop() { $('shop').style.display = 'none'; if (G.uiOpen === 'shop') G.uiOpen = null; }
export function openUpgrades() { wire(); G.uiOpen = 'up'; renderUpgrades(); $('upgrades').style.display = 'flex'; if (document.pointerLockElement) document.exitPointerLock(); }
export function closeUpgrades() { $('upgrades').style.display = 'none'; if (G.uiOpen === 'up') G.uiOpen = null; }
