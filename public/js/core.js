'use strict';
/* Core: state, API client, live events, voice, dialogs, printing, local backup. Shared by every screen. */

const App = {
  token: null, // a person's session
  device: null, // shared device (staff-list screen) token
  user: null,
  settings: {},
  tenant: null,
  disabled: [],
  kitchenMode: 'full',
  info: null,
  connected: false,
  readyItems: [],
  badges: {},
};

const MIN = 60000;
const ROLE_ICONS = { owner: 'key-round', admin: 'shield-check', cashier: 'wallet', waiter: 'user-round', chef: 'chef-hat' };
const roleName = (r) => ({ owner: t('Boshliq'), admin: t('Admin'), cashier: t('Kassir'), waiter: t('Ofitsant'), chef: t('Oshpaz') }[r] || r);
const statusName = (s) => ({ new: t('Yangi'), cooking: t('Tayyorlanmoqda'), ready: t('Tayyor'), served: t('Berildi'), cancelled: t('Bekor') }[s] || s);
const methodName = (m) => ({ cash: t('Naqd'), card: t('Karta'), transfer: t("O'tkazma") }[m] || m);
const METHOD_ICONS = { cash: 'banknote', card: 'credit-card', transfer: 'smartphone' };
const ROOM_TYPES = ['banket', 'vip', 'supa', 'stol', 'zal', 'boshqa'];
const roomTypeName = (k) => ({ banket: t('Banket'), vip: 'VIP', supa: t('Supa'), stol: t('Stol'), zal: t('Zal'), boshqa: t('Boshqa'), soboy: t('Olib ketish') }[k] || k);
const ROOM_TYPE_ICONS = { banket: 'party-popper', vip: 'star', supa: 'sofa', stol: 'utensils', zal: 'store', boshqa: 'door-open', soboy: 'shopping-bag' };

// ---------- Formatting ----------
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function num(n) { return Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/[\s,]/g, ' '); }
function moneyText(n) { return `${num(n)} ${App.settings.currency || "so'm"}`; }
function money(n) { return esc(moneyText(n)); }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtTime(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDate(ts) { const d = new Date(ts); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
function fmtDateTime(ts) { return ts ? `${fmtDate(ts)} ${fmtTime(ts)}` : '—'; }
function fmtDuration(ms) {
  const s = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(s / 60);
  const out = m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  return ms < 0 ? `-${out}` : out;
}
function localDay(ts = Date.now()) { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function dayStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function toLocalInput(ts) { const d = new Date(ts); return `${localDay(ts)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function moduleOn(m) { return !m || !(App.disabled || []).includes(m); }
function can(...roles) { return !!App.user && roles.includes(App.user.role); }
function initials(name) { return String(name).split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase(); }
// FLOWI wordmark, inline so it takes the text colour (white on the lock screen, navy on cards).
const FLOWI_PATH = 'M0 4 199 4 199 54 62 54 62 120 183 120 183 169 62 169 62 262 0 262ZM241 4 303 4 303 212 436 212 436 262 241 262ZM452.5 133.5a143 133.5 0 1 1 286 0a143 133.5 0 1 1 -286 0ZM515.5 132.5a80.5 81 0 1 0 161 0a80.5 81 0 1 0 -161 0ZM755 4 820 4 879.5 182.5 939 4 997 4 911 262 841 262ZM1008.5 35.5 1059.5 188.5 1121 4 1182 4 1096 262 1028 262 980.5 119.5ZM1218 4 1279 4 1279 262 1218 262Z';
function flowiLogo(height = 22) {
  return `<svg class="flowi" viewBox="0 0 1280 267" height="${height}" role="img" aria-label="FLOWI"><path fill="currentColor" fill-rule="evenodd" d="${FLOWI_PATH}"/></svg>`;
}
function placeName(o) {
  if (o.takeaway) return `${t('Olib ketish')} #${o.id}${o.label ? ` · ${o.label}` : ''}`;
  return o.room ? o.room.name : o.room_name || '';
}

// ---------- Storage ----------
function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key));
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
  return val;
}

// ---------- API ----------
async function api(method, path, body, token = App.token) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && token && token === App.token) {
    endSession();
    throw new Error(t('Sessiya tugadi, qayta kiring'));
  }
  if (!res.ok) {
    const err = new Error(tServer((data && data.error) || `${t('Xatolik')} (${res.status})`));
    err.status = res.status;
    throw err;
  }
  return data;
}
const GET = (p) => api('GET', p);
const POST = (p, b) => api('POST', p, b || {});
const PUT = (p, b) => api('PUT', p, b || {});
const DEL = (p) => api('DELETE', p);

// Ends the person's session. On a shared device this returns to the staff list, otherwise to the login form.
function endSession() {
  App.token = null;
  App.user = null;
  store('cp_token', null);
  Live.stop();
  location.hash = App.device ? '#/lock' : '#/login';
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
      'item_accepted', 'bill_requested', 'stoplist', 'payroll']) {
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
    el.title = App.connected ? t('Jonli aloqa bor') : t("Aloqa yo'q — qayta ulanmoqda");
  });
}

// ---------- Voice & sound ----------
const Voice = {
  prefs() { return { enabled: true, rate: 0.95, pitch: 1.1, voiceURI: '', ...(store('cp_voice') || {}) }; },
  save(p) { store('cp_voice', { ...this.prefs(), ...p }); },
  voices() { return 'speechSynthesis' in window ? speechSynthesis.getVoices() : []; },
  // Female voice in the interface language. For Uzbek, Turkish reads Uzbek Latin well, then Russian.
  pick() {
    const all = this.voices();
    const p = this.prefs();
    if (p.voiceURI) {
      const v = all.find((x) => x.voiceURI === p.voiceURI);
      if (v) return v;
    }
    const female = /female|woman|ayol|zira|seda|yelda|filiz|emel|milena|irina|alena|svetlana|dariya|madina|samantha|victoria|karen|tessa|moira|google (türkçe|русский|us english|uk english female)/i;
    const male = /\bmale\b|erkak|pavel|dmitri|yuri|cem|tolga|maxim|david|mark|daniel|alex\b/i;
    const order = { uz: ['uz', 'tr', 'kk', 'ru', 'en'], ru: ['ru', 'uk', 'en'], en: ['en'] }[LANG];
    for (const lang of order) {
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
        const tt = this.ctx.currentTime + i * 0.16;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.35, tt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.35);
        o.connect(g).connect(this.ctx.destination);
        o.start(tt); o.stop(tt + 0.4);
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
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' }[LANG];
      u.rate = p.rate; u.pitch = p.pitch; u.volume = 1;
      speechSynthesis.speak(u);
    }, 550);
  },
};
document.addEventListener('pointerdown', () => Voice.unlock(), { once: true });

const UZ_UNITS = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
const UZ_TENS = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"];
function uzNumber(n) {
  if (!n) return 'nol';
  const h = Math.floor(n / 100) % 10; const tn = Math.floor(n / 10) % 10; const u = n % 10;
  return [h ? `${h > 1 ? UZ_UNITS[h] + ' ' : ''}yuz` : '', UZ_TENS[tn], UZ_UNITS[u]].filter(Boolean).join(' ');
}
// "Uchinchi xona" in Uzbek; other languages read the number themselves.
function spokenRoom(number, name) {
  const n = Number(number);
  if (!(Number.isInteger(n) && n > 0 && n < 1000)) return name;
  if (LANG !== 'uz') return t('{0}-xona', n);
  const w = uzNumber(n);
  return `${/[aeiou]$/.test(w) ? `${w}nchi` : `${w}inchi`} xona`;
}
const spokenQty = (q) => (LANG === 'uz' ? uzNumber(q) : String(q));

function notifySystem(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try { new Notification(title, { body, icon: '/icon-192.png', tag: title + body }); } catch { /* ignore */ }
}

// ---------- Toasts & dialogs ----------
function toast(msg, kind = 'info', ms = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon({ ok: 'circle-check', error: 'circle-x', warn: 'triangle-alert' }[kind] || 'info', 18)}<span></span>`;
  el.querySelector('span').textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function toastError(e) { toast(e && e.message ? e.message : String(e), 'error', 6000); }

function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* openModal({ title, body, size: 'wide'|'full', actions: [{label, cls, icon, onClick(form) -> false keeps open}] }) */
function openModal({ title, body, size = '', actions = [], onMount, onClose }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-back"><form class="modal ${size}" novalidate>
    <div class="modal-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="${esc(t('Yopish'))}">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>
    ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button type="${i === actions.length - 1 ? 'submit' : 'button'}" class="btn ${a.cls || ''}" data-i="${i}">${a.icon ? icon(a.icon, 18) : ''}${a.label}</button>`).join('')}</div>` : ''}
  </form></div>`;
  const form = root.querySelector('form');
  const close = () => { closeModal(); if (onClose) onClose(); };
  root.querySelector('.modal-back').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-back')) close(); });
  root.querySelector('[data-close]').onclick = close;
  const run = async (a, btn) => {
    btn.disabled = true;
    try {
      const keep = a.onClick ? await a.onClick(form) : undefined;
      if (keep !== false) closeModal();
    } catch (e) { toastError(e); } finally { btn.disabled = false; }
  };
  root.querySelectorAll('.modal-foot .btn').forEach((btn) => {
    if (btn.type === 'button') btn.onclick = () => run(actions[btn.dataset.i], btn);
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const btn = form.querySelector('.modal-foot button[type=submit]');
    if (btn) run(actions[btn.dataset.i], btn);
  };
  const first = form.querySelector('.modal-body input:not([type=checkbox]):not([readonly]), .modal-body select, .modal-body textarea');
  if (first && !('ontouchstart' in window)) setTimeout(() => first.focus(), 30);
  if (onMount) onMount(form);
  return form;
}

function confirmModal(title, text, okLabel = t('Ha'), cls = 'danger') {
  return new Promise((resolve) => {
    openModal({ title, body: `<p class="lead">${text}</p>`, onClose: () => resolve(false), actions: [
      { label: t("Yo'q"), onClick: () => resolve(false) },
      { label: okLabel, cls, onClick: () => resolve(true) },
    ] });
  });
}

function promptModal(title, label, { required = false, value = '' } = {}) {
  return new Promise((resolve) => {
    openModal({ title, body: `<label class="field">${esc(label)}<input name="v" value="${esc(value)}"></label>`, onClose: () => resolve(null), actions: [
      { label: t('Bekor'), onClick: () => resolve(null) },
      { label: t('Tasdiqlash'), cls: 'primary', onClick: (f) => {
        const v = f.v.value.trim();
        if (required && !v) { toast(t('Iltimos, kiriting'), 'warn'); return false; }
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
    } else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (el.type === 'number') out[el.name] = el.value === '' ? '' : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

// Number pad used for PINs and guest counts. Resolves with the typed string, or null.
function keypadHtml(maxLen, masked = true) {
  return `<div class="pin-dots" data-max="${maxLen}">${masked ? '' : '<span class="pin-value">0</span>'}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" class="key" data-k="${n}">${n}</button>`).join('')}
      <button type="button" class="key muted" data-k="clear">${icon('x', 22)}</button><button type="button" class="key" data-k="0">0</button>
      <button type="button" class="key muted" data-k="back">${icon('delete', 22)}</button></div>`;
}
function bindKeypad(root, { maxLen, masked = true, onChange, onFull }) {
  let value = '';
  const dots = root.querySelector('.pin-dots');
  const draw = () => {
    if (masked) dots.innerHTML = Array.from({ length: Math.max(maxLen, value.length) }, (_, i) => `<i class="${i < value.length ? 'on' : ''}"></i>`).join('');
    else dots.querySelector('.pin-value').textContent = value || '0';
    if (onChange) onChange(value);
  };
  const press = (k) => {
    if (k === 'back') value = value.slice(0, -1);
    else if (k === 'clear') value = '';
    else if (value.length < maxLen) value += k;
    draw();
    if (onFull && value.length === maxLen) onFull(value);
  };
  root.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => press(b.dataset.k));
  const onKey = (e) => {
    if (!document.body.contains(dots)) return document.removeEventListener('keydown', onKey);
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
  };
  document.addEventListener('keydown', onKey);
  draw();
  return { get: () => value, reset: () => { value = ''; draw(); }, shake: () => { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); } };
}

// ---------- Printing ----------
// Thermal printers (58/80 mm) work through the normal system printer driver.
// With Chrome started as "chrome --kiosk-printing" receipts print without the dialog.
function printDoc(title, body) {
  const narrow = String(App.settings.receipt_width) === '58';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:${narrow ? 11 : 12}px/1.35 "Courier New",monospace;width:${narrow ? 48 : 72}mm;margin:0 auto;padding:3mm 0;color:#000}
    h1{font-size:${narrow ? 14 : 16}px;text-align:center;margin:0}.c{text-align:center}.r{text-align:right;white-space:nowrap}
    table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}hr{border:0;border-top:1px dashed #000;margin:6px 0}
    .big{font-size:${narrow ? 13 : 15}px;font-weight:bold}.huge{font-size:${narrow ? 16 : 20}px;font-weight:bold}
    @page{size:${narrow ? 58 : 80}mm auto;margin:0}
  </style></head><body>${body}</body></html>`;
  // A fresh frame per print, so two receipts in a row never overwrite each other.
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

function serviceLabel(o) {
  return o.service_type === 'per_guest'
    ? t('Xizmat haqi ({0} kishi × {1})', o.guests, moneyText(o.service_pct))
    : t('Xizmat haqi {0}%', o.service_pct);
}
function perPerson(o) { return o.guests > 1 ? Math.round(o.total / o.guests) : 0; }

// Prints the bill; the server checks the permission and counts the print.
async function printCheck(orderId) {
  try { printReceipt(await POST(`/api/orders/${orderId}/print`)); } catch (e) { toastError(e); }
}

function printReceipt(o) {
  const s = App.settings;
  const live = o.items.filter((i) => i.status !== 'cancelled');
  const lines = live.map((i) => `<tr><td>${esc(i.name)}<br><small>${i.qty} × ${money(i.price)}</small></td><td class="r">${money(i.qty * i.price)}</td></tr>`).join('');
  const share = perPerson(o);
  printDoc(`${t('Chek')} #${o.id}`, `
    <h1>${esc(s.name)}</h1>${s.address ? `<div class="c">${esc(s.address)}</div>` : ''}${s.phone ? `<div class="c">${esc(s.phone)}</div>` : ''}
    <hr><div>${t('Chek')}: #${o.id}${o.status !== 'closed' ? ` (${t('hisob')})` : ''}</div><div>${esc(placeName(o))}</div>
    <div>${t('Ofitsant')}: ${esc(o.waiter.name)}</div><div>${t('Mehmonlar')}: ${o.guests}</div>
    <div>${t('Ochildi')}: ${fmtDateTime(o.opened_at)}</div>${o.closed_at ? `<div>${t('Yopildi')}: ${fmtDateTime(o.closed_at)}</div>` : ''}
    <hr><table>${lines}</table><hr><table>
    <tr><td>${t('Taomlar')}</td><td class="r">${money(o.subtotal)}</td></tr>
    ${o.service_amount ? `<tr><td>${esc(serviceLabel(o))}</td><td class="r">${money(o.service_amount)}</td></tr>` : ''}
    ${o.discount ? `<tr><td>${t('Chegirma')}</td><td class="r">-${money(o.discount)}</td></tr>` : ''}
    <tr class="big"><td>${t('JAMI')}</td><td class="r">${money(o.total)}</td></tr>
    ${share ? `<tr><td>${t('{0} kishi — har biriga', o.guests)}</td><td class="r">${money(share)}</td></tr>` : ''}
    ${o.status === 'closed' ? ['cash', 'card', 'transfer'].filter((m) => o[`paid_${m}`]).map((m) => `<tr><td>${methodName(m)}</td><td class="r">${money(o[`paid_${m}`])}</td></tr>`).join('') : ''}
    </table><hr>${o.cashier ? `<div>${t('Kassir')}: ${esc(o.cashier.name)}</div>` : ''}<div class="c">${esc(s.receipt_footer || '')}</div>`);
}

// Kitchen ticket: big place name, dishes and notes — no prices.
function printKitchenTicket(tk) {
  printDoc(`${t('Oshxona')} #${tk.order_id}`, `<div class="c huge">${esc(tk.room)}</div>
    <div class="c">${t('Chek')} #${tk.order_id} · ${esc(tk.waiter || '')} · ${fmtTime(tk.at || Date.now())}</div><hr>
    <table>${tk.items.map((i) => `<tr class="big"><td>${i.qty} ×</td><td>${esc(i.name)}${i.note ? `<br><small>* ${esc(i.note)}</small>` : ''}</td></tr>`).join('')}</table><hr>`);
}

function downloadCsv(filename, rows) {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Local backup of checks (IndexedDB on this computer) ----------
// Every check closed or seen on a money device is copied here, so it survives a server or internet failure.
const LocalBackup = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB'));
      const req = indexedDB.open('choyxona-backup', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('checks', { keyPath: 'key' });
      req.onsuccess = () => { this.db = req.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  },
  async save(orders) {
    try {
      const db = await this.open();
      const code = (App.tenant && App.tenant.code) || '';
      await new Promise((resolve, reject) => {
        const txn = db.transaction('checks', 'readwrite');
        for (const o of [].concat(orders)) if (o && o.status === 'closed') txn.objectStore('checks').put({ key: `${code}#${o.id}`, code, saved_at: Date.now(), order: o });
        txn.oncomplete = resolve;
        txn.onerror = () => reject(txn.error);
      });
    } catch { /* backup must never break the cash desk */ }
  },
  async all() {
    try {
      const db = await this.open();
      const code = (App.tenant && App.tenant.code) || '';
      return await new Promise((resolve, reject) => {
        const req = db.transaction('checks').objectStore('checks').getAll();
        req.onsuccess = () => resolve(req.result.filter((r) => r.code === code).map((r) => r.order).sort((a, b) => b.closed_at - a.closed_at));
        req.onerror = () => reject(req.error);
      });
    } catch { return []; }
  },
  rows(orders) {
    return [[t('Chek'), t('Yopildi'), t('Joy'), t('Ofitsant'), t('Mehmonlar'), t('Taomlar'), t('Taomlar summasi'), t('Xizmat haqi'), t('Chegirma'), t('Jami'), t('Naqd'), t('Karta'), t("O'tkazma")],
      ...orders.map((o) => [o.id, fmtDateTime(o.closed_at), placeName(o), o.waiter && o.waiter.name, o.guests,
        o.items.filter((i) => i.status !== 'cancelled').map((i) => `${i.name} x${i.qty}`).join(', '),
        o.subtotal, o.service_amount, o.discount, o.total, o.paid_cash, o.paid_card, o.paid_transfer])];
  },
};

// ---------- Screen: keep awake, full screen ----------
const Screen = {
  lock: null,
  async keepAwake() {
    try {
      if ('wakeLock' in navigator && !this.lock && document.visibilityState === 'visible') {
        this.lock = await navigator.wakeLock.request('screen');
        this.lock.addEventListener('release', () => { this.lock = null; });
      }
    } catch { /* not allowed now; retried on the next visit */ }
  },
  canFullscreen() { return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen); },
  isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
  toggleFull() {
    const el = document.documentElement;
    if (this.isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch(() => {});
  },
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Screen.keepAwake(); });
document.addEventListener('pointerdown', () => Screen.keepAwake());

// Live timers: [data-eta] counts down, [data-since] counts up.
function tickTimers() {
  const now = Date.now();
  document.querySelectorAll('[data-eta]').forEach((el) => {
    const left = Number(el.dataset.eta) - now;
    el.textContent = left >= 0 ? fmtDuration(left) : `+${fmtDuration(-left)}`;
    el.classList.toggle('late', left < 0);
    const card = el.closest('.ticket');
    if (card && card.classList.contains('cooking')) card.classList.toggle('late', left < 0);
  });
  document.querySelectorAll('[data-since]').forEach((el) => { el.textContent = fmtDuration(now - Number(el.dataset.since)); });
  document.querySelectorAll('[data-clock]').forEach((el) => { el.textContent = fmtTime(now); });
}
setInterval(tickTimers, 1000);
