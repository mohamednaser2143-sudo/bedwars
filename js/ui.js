// Small DOM helpers shared by every screen.
import { THREE } from './engine.js';
import { G } from './state.js';

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function show(id, display = 'flex') { const e = $(id); if (e) e.style.display = display; }
export function hide(id) { const e = $(id); if (e) e.style.display = 'none'; }

export function toast(text, kind = '') {
  const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = text;
  $('toasts').appendChild(d); setTimeout(() => d.remove(), 2600);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
export function bigMessage(title, sub = '', color = '#fff', ms = 2600) {
  const e = $('bigmsg'); e.innerHTML = `<div class="bmT" style="color:${color}">${esc(title)}</div><div class="bmS">${esc(sub)}</div>`;
  e.classList.remove('on'); void e.offsetWidth; e.classList.add('on');
  clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), ms);
}
export function killfeed(html) {
  const d = document.createElement('div'); d.className = 'kf'; d.innerHTML = html;
  $('killfeed').appendChild(d); setTimeout(() => d.remove(), 6000);
  while ($('killfeed').children.length > 6) $('killfeed').firstChild.remove();
}
export function teamSpan(name, css) { return `<b style="color:${css}">${esc(name)}</b>`; }

const v = new THREE.Vector3();
export function popNumber(pos, text, color = '#ffd34e') {
  v.copy(pos); v.y += 5.5; v.project(G.camera);
  if (v.z > 1) return;
  const d = document.createElement('div'); d.className = 'pop'; d.textContent = text; d.style.color = color;
  d.style.left = ((v.x * .5 + .5) * innerWidth) + 'px'; d.style.top = ((-v.y * .5 + .5) * innerHeight) + 'px';
  document.body.appendChild(d); setTimeout(() => d.remove(), 800);
}

// ---------- CHAT ----------
let chatHandler = null;
export function setChatHandler(fn) { chatHandler = fn; }
export function chatLine(name, text, css = '#fff', system = false) {
  const d = document.createElement('div'); d.className = 'chatLine';
  d.innerHTML = system ? `<i>${esc(text)}</i>` : `<b style="color:${css}">${esc(name)}:</b> ${esc(text)}`;
  $('chatLog').appendChild(d);
  while ($('chatLog').children.length > 30) $('chatLog').firstChild.remove();
  $('chatLog').scrollTop = 1e9;
  d._t = setTimeout(() => d.classList.add('old'), 9000);
}
export function openChat() {
  const box = $('chatInput'); G.input.typing = true; box.style.display = 'block'; box.value = ''; box.focus();
  $('chat').classList.add('open');
  if (document.pointerLockElement) document.exitPointerLock();
}
export function closeChat(sendIt) {
  const box = $('chatInput'); const text = box.value.trim().slice(0, 120);
  box.style.display = 'none'; box.blur(); G.input.typing = false; $('chat').classList.remove('open');
  if (sendIt && text && chatHandler) chatHandler(text);
  G.renderer.domElement.focus();
}
let lastChat = 0;
export function canChat() { const n = performance.now(); if (n - lastChat < 900) return false; lastChat = n; return true; }
