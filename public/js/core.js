'use strict';
/* Core: API client, live events, voice announcer, UI helpers. Shared by every view. */

const App = {
  token: null,
  user: null,
  settings: {},
  menu: null,
  connected: false,
  readyItems: [],
  badges: {},
};

const ROLE_NAMES = { owner: 'Ega', admin: 'Admin', cashier: 'Kassir', waiter: 'Ofitsant', chef: 'Oshpaz' };
const STATUS_NAMES = { new: 'Yangi', cooking: 'Tayyorlanmoqda', ready: 'Tayyor', served: 'Berildi', cancelled: 'Bekor' };
const METHOD_NAMES = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma" };
const ROOM_TYPES = { banket: ['Banket', '🎉'], vip: ['VIP', '⭐'], supa: ['Supa', '🛋️'], stol: ['Stol', '🍽️'], zal: ['Zal', '🏛️'], boshqa: ['Boshqa', '📍'] };
const MIN = 60000;

// ---------- Formatting ----------
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/,/g, ' ')} ${esc(App.settings.currency || "so'm")}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
function fmtTime(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDate(ts) { const d = new Date(ts); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
function fmtDateTime(ts) { return ts ? `${fmtDate(ts)} ${fmtTime(ts)}` : '—'; }
function fmtDuration(ms) {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(s / 60);
  const out = m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  return neg ? `-${out}` : out;
}
function toLocalInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dayStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// ---------- API ----------
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(App.token ? { Authorization: `Bearer ${App.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && App.token) {
    logoutLocal();
    throw new Error('Sessiya tugadi, qayta kiring');
  }
  if (!res.ok) throw new Error((data && data.error) || `Xatolik (${res.status})`);
  return data;
}
const GET = (p) => api('GET', p);
const POST = (p, b) => api('POST', p, b || {});
const PUT = (p, b) => api('PUT', p, b || {});
const DEL = (p) => api('DELETE', p);

function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key));
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
  return val;
}

function logoutLocal() {
  App.token = null;
  App.user = null;
  store('cp_token', null);
  Live.stop();
  location.hash = '#/login';
  if (typeof render === 'function') render();
}

// ---------- Live updates (SSE) ----------
const Live = {
  es: null,
  handlers: {},
  retry: null,
  start() {
    this.stop();
    this.es = new EventSource(`/api/events?token=${encodeURIComponent(App.token)}`);
    this.es.addEventListener('hello', () => { App.connected = true; updateConn(); });
    this.es.onerror = () => {
      App.connected = false; updateConn();
      if (this.es && this.es.readyState === EventSource.CLOSED) {
        clearTimeout(this.retry);
        this.retry = setTimeout(() => App.token && this.start(), 3000);
      }
    };
    for (const type of ['rooms', 'kitchen', 'menu', 'finance', 'settings', 'kitchen_new', 'kitchen_cancel', 'item_ready',
      'item_accepted', 'bill_requested', 'stoplist']) {
      this.es.addEventListener(type, (e) => {
        let data = {};
        try { data = JSON.parse(e.data); } catch { /* ignore */ }
        (this.handlers[type] || []).forEach((fn) => fn(data));
        (this.handlers['*'] || []).forEach((fn) => fn(type, data));
      });
    }
  },
  stop() { if (this.es) this.es.close(); this.es = null; App.connected = false; },
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
};
function updateConn() {
  document.querySelectorAll('.conn').forEach((el) => {
    el.classList.toggle('on', App.connected);
    el.title = App.connected ? 'Jonli aloqa bor' : "Aloqa yo'q — qayta ulanmoqda";
  });
}

// ---------- Voice & sound ----------
const Voice = {
  prefs() {
    return { enabled: true, rate: 0.95, pitch: 1.1, voiceURI: '', ...(store('cp_voice') || {}) };
  },
  save(p) { store('cp_voice', { ...this.prefs(), ...p }); },
  voices() { return 'speechSynthesis' in window ? speechSynthesis.getVoices() : []; },
  // Prefer an Uzbek voice, then Turkish (reads Uzbek Latin well), then Russian; within each prefer female voices.
  pick() {
    const all = this.voices();
    const p = this.prefs();
    if (p.voiceURI) {
      const v = all.find((x) => x.voiceURI === p.voiceURI);
      if (v) return v;
    }
    const female = /female|woman|ayol|zira|seda|yelda|filiz|emel|milena|irina|alena|svetlana|dariya|madina|samantha|victoria|karen|tessa|moira|google (türkçe|русский)/i;
    const male = /\bmale\b|erkak|pavel|dmitri|yuri|cem|tolga|maxim|david|mark/i;
    for (const lang of ['uz', 'tr', 'kk', 'ru', 'en']) {
      const list = all.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
      if (!list.length) continue;
      return list.find((v) => female.test(v.name)) || list.find((v) => !male.test(v.name)) || list[0];
    }
    return null;
  },
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
    } catch { /* ignore */ }
  },
  chime(kind = 'ready') {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = kind === 'ready' ? [784, 988, 1319] : kind === 'alert' ? [523, 523] : [659, 880];
      notes.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const t = this.ctx.currentTime + i * 0.16;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(this.ctx.destination);
        o.start(t); o.stop(t + 0.4);
      });
    } catch { /* ignore */ }
  },
  say(text, kind) {
    const p = this.prefs();
    this.chime(kind);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (!p.enabled || !('speechSynthesis' in window)) return;
    setTimeout(() => {
      const u = new SpeechSynthesisUtterance(text);
      const v = this.pick();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'uz-UZ';
      u.rate = p.rate; u.pitch = p.pitch; u.volume = 1;
      speechSynthesis.speak(u);
    }, 550);
  },
};
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
document.addEventListener('pointerdown', () => Voice.unlock(), { once: true });

function notifySystem(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try { new Notification(title, { body, icon: '/icon.svg', tag: title + body }); } catch { /* ignore */ }
}

// ---------- Toasts & modals ----------
function toast(msg, kind = 'info', ms = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function toastError(e) { toast(e && e.message ? e.message : String(e), 'error', 6000); }

function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* openModal({ title, body, wide, actions: [{label, cls, onClick(form) -> false keeps open}] }) */
function openModal({ title, body, wide = false, actions = [], onMount }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-back"><form class="modal ${wide ? 'wide' : ''}" novalidate>
    <div class="card-head"><h2>${esc(title)}</h2><span class="spacer"></span><button type="button" class="btn ghost sm" data-close>✕</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot">${actions.map((a, i) => `<button type="${i === actions.length - 1 ? 'submit' : 'button'}" class="btn ${a.cls || ''}" data-i="${i}">${a.label}</button>`).join('')}</div>
  </form></div>`;
  const form = root.querySelector('form');
  root.querySelector('.modal-back').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-back')) closeModal(); });
  root.querySelector('[data-close]').onclick = closeModal;
  const run = async (a, btn) => {
    btn.disabled = true;
    try {
      const keep = await a.onClick(form);
      if (keep !== false) closeModal();
    } catch (e) { toastError(e); } finally { btn.disabled = false; }
  };
  root.querySelectorAll('.modal-foot .btn').forEach((btn) => {
    const a = actions[btn.dataset.i];
    if (btn.type === 'button') btn.onclick = () => run(a, btn);
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const btn = form.querySelector('.modal-foot button[type=submit]');
    if (btn) run(actions[btn.dataset.i], btn);
  };
  const first = form.querySelector('.modal-body input, .modal-body select, .modal-body textarea');
  if (first) setTimeout(() => first.focus(), 30);
  if (onMount) onMount(form);
  return form;
}

function confirmModal(title, text, okLabel = 'Ha', cls = 'danger') {
  return new Promise((resolve) => {
    openModal({ title, body: `<p>${text}</p>`, actions: [
      { label: 'Yo\'q', onClick: () => resolve(false) },
      { label: okLabel, cls, onClick: () => resolve(true) },
    ] });
    document.querySelector('.modal-back [data-close]').addEventListener('click', () => resolve(false));
  });
}

function promptModal(title, label, { required = false, value = '' } = {}) {
  return new Promise((resolve) => {
    openModal({ title, body: `<label class="field">${esc(label)}<input name="v" value="${esc(value)}"></label>`, actions: [
      { label: 'Bekor', onClick: () => resolve(null) },
      { label: 'Tasdiqlash', cls: 'primary', onClick: (f) => {
        const v = f.v.value.trim();
        if (required && !v) { toast('Iltimos, kiriting', 'warn'); return false; }
        resolve(v);
      } },
    ] });
  });
}

function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi) { (out[el.name] = out[el.name] || []); if (el.checked) out[el.name].push(Number(el.value)); }
      else out[el.name] = el.checked;
    } else if (el.type === 'number') out[el.name] = el.value === '' ? '' : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

// ---------- Receipt ----------
function printReceipt(o) {
  const s = App.settings;
  const live = o.items.filter((i) => i.status !== 'cancelled');
  const lines = live.map((i) => `<tr><td>${esc(i.name)}<br><small>${i.qty} × ${money(i.price)}</small></td><td class="r">${money(i.qty * i.price)}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Chek #${o.id}</title><style>
    body{font:12px/1.35 "Courier New",monospace;width:72mm;margin:0 auto;padding:4mm 0;color:#000}
    h1{font-size:16px;text-align:center;margin:0}.c{text-align:center}.r{text-align:right;white-space:nowrap}
    table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}hr{border:0;border-top:1px dashed #000;margin:6px 0}
    .big{font-size:15px;font-weight:bold}@page{size:80mm auto;margin:0}
  </style></head><body>
    <h1>${esc(s.name)}</h1>${s.address ? `<div class="c">${esc(s.address)}</div>` : ''}${s.phone ? `<div class="c">${esc(s.phone)}</div>` : ''}
    <hr><div>Chek: #${o.id}${o.status !== 'closed' ? ' (hisob)' : ''}</div><div>Xona: ${esc(o.room.number)} — ${esc(o.room.name)}</div>
    <div>Ofitsant: ${esc(o.waiter.name)}</div><div>Mehmonlar: ${o.guests}</div>
    <div>Ochildi: ${fmtDateTime(o.opened_at)}</div>${o.closed_at ? `<div>Yopildi: ${fmtDateTime(o.closed_at)}</div>` : ''}
    <hr><table>${lines}</table><hr><table>
    <tr><td>Taomlar</td><td class="r">${money(o.subtotal)}</td></tr>
    <tr><td>Xizmat haqi ${o.service_pct}%</td><td class="r">${money(o.service_amount)}</td></tr>
    ${o.discount ? `<tr><td>Chegirma</td><td class="r">-${money(o.discount)}</td></tr>` : ''}
    <tr class="big"><td>JAMI</td><td class="r">${money(o.total)}</td></tr>
    ${o.status === 'closed' ? ['cash', 'card', 'transfer'].filter((m) => o[`paid_${m}`]).map((m) => `<tr><td>${METHOD_NAMES[m]}</td><td class="r">${money(o[`paid_${m}`])}</td></tr>`).join('') : ''}
    </table><hr>${o.cashier ? `<div>Kassir: ${esc(o.cashier.name)}</div>` : ''}<div class="c">${esc(s.receipt_footer || '')}</div>
  </body></html>`;
  const frame = document.getElementById('print-frame');
  frame.srcdoc = html;
  frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); frame.onload = null; };
}

function downloadCsv(filename, rows) {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Live timers: elements with data-eta (countdown) or data-since (elapsed) update every second.
function tickTimers() {
  const t = Date.now();
  document.querySelectorAll('[data-eta]').forEach((el) => {
    const left = Number(el.dataset.eta) - t;
    el.textContent = left >= 0 ? `⏱ ${fmtDuration(left)}` : `⚠ ${fmtDuration(-left)} kechikdi`;
    el.style.color = left < 0 ? 'var(--danger)' : '';
    const card = el.closest('.ticket');
    if (card && card.classList.contains('cooking')) card.classList.toggle('late', left < 0);
  });
  document.querySelectorAll('[data-since]').forEach((el) => { el.textContent = fmtDuration(t - Number(el.dataset.since)); });
}
setInterval(tickTimers, 1000);
