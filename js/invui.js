// Hotbar + inventory screen (E). Click one slot, then another, to swap them.
import { G } from './state.js';
import { ITEMS, ARMOR, CURRENCY } from './config.js';
import { $, esc } from './ui.js';
import { sfx } from './audio.js';

let built = false, picked = -1, lastSig = '';

function slotHTML(s, i, extra = '') {
  const it = s && ITEMS[s.id];
  return `<div class="slot ${extra}" data-i="${i}">${i < 9 ? `<span class="key">${i + 1}</span>` : ''}${it ? `<span class="ico">${it.icon}</span><span class="nm">${esc(it.name)}</span>${s.n > 1 ? `<span class="count">${s.n}</span>` : ''}` : ''}</div>`;
}

export function buildHotbar() {
  if (built) return; built = true;
  $('hotbar').addEventListener('pointerdown', e => {
    const el = e.target.closest('.slot'); if (!el) return;
    e.stopPropagation(); selectSlot(+el.dataset.i);
  });
  $('invGrid').addEventListener('pointerdown', onInvClick);
  $('invHot').addEventListener('pointerdown', onInvClick);
}

export function selectSlot(i) {
  if (i < 0 || i > 8) return;
  if (G.selected !== i) sfx.click();
  G.selected = i; lastSig = '';
  renderHotbar(true);
}

export function renderHotbar(force = false) {
  const inv = G.local?.inv; if (!inv) return;
  const sig = G.selected + '|' + inv.slots.slice(0, 9).map(s => s ? s.id + s.n : '-').join(',');
  if (!force && sig === lastSig) return; lastSig = sig;
  let h = ''; for (let i = 0; i < 9; i++) h += slotHTML(inv.slots[i], i, i === G.selected ? 'active' : '');
  $('hotbar').innerHTML = h;
  const it = inv.slots[G.selected] && ITEMS[inv.slots[G.selected].id];
  const lbl = $('heldLabel'); lbl.textContent = it ? it.name : ''; lbl.classList.remove('on'); void lbl.offsetWidth; if (it) lbl.classList.add('on');
}

export function renderResources() {
  const inv = G.local?.inv; if (!inv) return;
  let h = '';
  for (const k of Object.keys(CURRENCY)) h += `<div class="res" style="color:${CURRENCY[k].css}"><span>${CURRENCY[k].icon}</span><b>${inv.res[k]}</b></div>`;
  if ($('resBox').innerHTML !== h) $('resBox').innerHTML = h;
}

function onInvClick(e) {
  const el = e.target.closest('.slot'); if (!el) return;
  const i = +el.dataset.i; const inv = G.local.inv;
  if (picked < 0) { if (inv.slots[i]) { picked = i; sfx.click(); } }
  else { if (picked !== i) inv.swap(picked, i); picked = -1; sfx.click(); }
  renderInventory(); renderHotbar(true);
}

export function renderInventory() {
  const inv = G.local.inv;
  let g = ''; for (let i = 9; i < 36; i++) g += slotHTML(inv.slots[i], i, i === picked ? 'picked' : '');
  let h = ''; for (let i = 0; i < 9; i++) h += slotHTML(inv.slots[i], i, i === picked ? 'picked' : '');
  $('invGrid').innerHTML = g; $('invHot').innerHTML = h;
  const ar = ARMOR[G.local.armor];
  let cur = ''; for (const k of Object.keys(CURRENCY)) cur += `<span style="color:${CURRENCY[k].css}">${CURRENCY[k].icon} ${inv.res[k]} ${CURRENCY[k].name}</span>`;
  $('invInfo').innerHTML = `<span>🛡️ ${ar.name} Armor</span>${cur}`;
}

export function openInventory() {
  if (!G.local || G.uiOpen) return;
  picked = -1; G.uiOpen = 'inv'; renderInventory();
  $('invScreen').style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
}
export function closeInventory() { $('invScreen').style.display = 'none'; if (G.uiOpen === 'inv') G.uiOpen = null; picked = -1; }
