'use strict';
/* App shell: routing, navigation, live event reactions (voice, banners, badges). */

const NAV_ORDER = {
  owner: ['dashboard', 'rooms', 'kitchen', 'cashier', 'history', 'reports', 'finance', 'payroll', 'reservations', 'stoplist', 'menuadmin', 'staff', 'halls', 'audit', 'settings'],
  admin: ['dashboard', 'rooms', 'kitchen', 'cashier', 'history', 'reports', 'finance', 'reservations', 'stoplist', 'menuadmin', 'staff', 'halls', 'audit', 'settings'],
  cashier: ['cashier', 'history', 'rooms', 'dashboard', 'reports', 'finance', 'reservations', 'stoplist', 'settings'],
  waiter: ['rooms', 'ready', 'settings'],
  chef: ['kitchen', 'stoplist', 'settings'],
};
let currentView = null;
let currentParams = [];
let currentData = null;
let loadSeq = 0;

// Which platform section (switched on/off per choyxona) each screen belongs to.
const VIEW_MODULE = {
  kitchen: 'kitchen', ready: 'kitchen', stoplist: 'stoplist', dashboard: 'reports', reports: 'reports', finance: 'finance',
  payroll: 'payroll', reservations: 'reservations', audit: 'audit', history: 'history',
};
function navKeys() { return NAV_ORDER[App.user.role].filter((k) => moduleOn(VIEW_MODULE[k])); }
function homeRoute() { return `#/${navKeys()[0]}`; }

function applyTheme() {
  const t = store('cp_theme') || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}

function parseHash() {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  return { name: parts[0] || '', params: parts.slice(1) };
}

function navHtml() {
  const { name } = parseHash();
  return navKeys().map((k) => {
    const v = Views[k];
    const b = v.badge && App.badges[v.badge] ? `<span class="badge">${App.badges[v.badge]}</span>` : '';
    const active = name === k || (k === 'rooms' && name === 'room');
    return `<a href="#/${k}" class="${active ? 'active' : ''}" data-nav="${k}"><span class="ico">${v.icon}</span><span>${v.title}</span>${b}</a>`;
  }).join('');
}

function shellHtml() {
  return `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><img src="/icon.svg" alt=""><div><b>${esc(App.settings.name)}</b><span>Choyxona Pro</span></div></div>
      <nav class="nav">${navHtml()}</nav>
      <div class="me"><b>${esc(App.user.name)}</b><br><span class="muted">${ROLE_NAMES[App.user.role]}</span> · <span class="conn"></span>
        <div style="margin-top:8px"><button class="btn sm block" data-logout>Chiqish</button></div></div>
    </aside>
    <main class="main">
      <div class="mobile-top"><img src="/icon.svg" alt=""><b>${esc(App.settings.name)}</b><span class="spacer"></span>
        <span class="small muted">${esc(App.user.name)}</span><span class="conn"></span><button class="btn sm" data-logout>Chiqish</button></div>
      ${subscriptionBanner()}
      <div id="view"></div>
    </main>
    <nav class="bottom-nav">${navHtml()}</nav>
  </div><div id="ready-banner"></div>`;
}

// Reminds the boss when the subscription set on the platform is about to run out.
function subscriptionBanner() {
  const until = App.tenant && App.tenant.paid_until;
  if (!until || !['owner', 'admin'].includes(App.user.role)) return '';
  const days = Math.ceil((until - Date.now()) / (24 * 60 * MIN));
  if (days > 5) return '';
  return `<div class="toast ${days < 0 ? 'error' : 'warn'}" style="margin-bottom:12px">${days < 0
    ? `⚠ Obuna muddati ${fmtDate(until)} da tugagan. Iltimos, to'lovni amalga oshiring.`
    : `⏳ Obuna muddati ${days} kundan keyin (${fmtDate(until)}) tugaydi.`}</div>`;
}

function updateNav() {
  document.querySelectorAll('.nav, .bottom-nav').forEach((n) => { n.innerHTML = navHtml(); });
}

async function render() {
  applyTheme();
  const app = document.getElementById('app');
  const { name, params } = parseHash();
  if (!App.user) {
    if (name !== 'login') { location.hash = '#/login'; return; }
    currentView = Views.login;
    app.innerHTML = Views.login.render();
    Views.login.bind(app);
    return;
  }
  const view = Views[name];
  if (!view || view.public || !view.roles.includes(App.user.role) || !moduleOn(VIEW_MODULE[name])) { location.hash = homeRoute(); return; }
  if (!document.getElementById('view')) {
    app.innerHTML = shellHtml();
    app.querySelectorAll('[data-logout]').forEach((b) => b.onclick = async () => {
      try { await POST('/api/logout'); } catch { /* ignore */ }
      logoutLocal();
    });
    updateConn();
  }
  if (currentView !== view) { UI.search = ''; window.scrollTo(0, 0); }
  currentView = view;
  currentParams = params;
  updateNav();
  document.title = `${view.title} · ${App.settings.name}`;
  await refreshView(true);
  updateReadyBanner();
}

async function refreshView(showLoading = false) {
  const view = currentView;
  if (!view || view.public) return;
  const el = document.getElementById('view');
  if (!el) return;
  const seq = ++loadSeq;
  if (showLoading) el.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
  try {
    const data = view.load ? await view.load(currentParams) : {};
    if (seq !== loadSeq || view !== currentView) return;
    renderView(data);
  } catch (e) {
    if (seq !== loadSeq) return;
    el.innerHTML = emptyState('⚠️', esc(e.message));
  }
}

// Re-render the current view, keeping focus and caret in the input the user is typing in.
function renderView(data) {
  currentData = data;
  const el = document.getElementById('view');
  if (!el) return;
  const active = document.activeElement;
  const focusId = active && el.contains(active) && active.id ? active.id : null;
  const caret = focusId && 'selectionStart' in active ? active.selectionStart : null;
  const scroll = window.scrollY;
  el.innerHTML = currentView.render(data, currentParams);
  if (currentView.bind) currentView.bind(el, data, currentParams);
  tickTimers();
  if (focusId) {
    const f = document.getElementById(focusId);
    if (f) { f.focus(); try { if (caret != null) f.setSelectionRange(caret, caret); } catch { /* ignore */ } }
  }
  window.scrollTo(0, scroll);
}

// ---------- Live reactions ----------
const refreshSoon = (() => {
  let t = null;
  return () => { clearTimeout(t); t = setTimeout(() => refreshView(), 250); };
})();

const UZ_UNITS = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
const UZ_TENS = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"];
function uzNumber(n) {
  if (!n) return 'nol';
  const h = Math.floor(n / 100) % 10; const t = Math.floor(n / 10) % 10; const u = n % 10;
  return [h ? `${h > 1 ? UZ_UNITS[h] + ' ' : ''}yuz` : '', UZ_TENS[t], UZ_UNITS[u]].filter(Boolean).join(' ');
}
function uzOrdinal(n) {
  const w = uzNumber(n);
  return /[aeiou]$/.test(w) ? `${w}nchi` : `${w}inchi`;
}
function roomSpeech(number, name) {
  const n = Number(number);
  return Number.isInteger(n) && n > 0 && n < 1000 ? `${uzOrdinal(n)} xona` : name;
}

Live.on('*', (type) => {
  if (currentView && currentView.refreshOn && currentView.refreshOn.includes(type)) refreshSoon();
  if (['rooms', 'kitchen', 'kitchen_new', 'item_ready'].includes(type)) refreshBadges();
});
Live.on('settings', async () => {
  try {
    const me = await GET('/api/me');
    const changed = JSON.stringify(me.disabled) !== JSON.stringify(App.disabled);
    App.settings = me.settings;
    App.disabled = me.disabled || [];
    if (changed) { updateNav(); render(); }
  } catch { /* ignore */ }
});

Live.on('item_ready', (d) => {
  if (d.waiter_id !== App.user.id) return;
  const text = `Diqqat! ${roomSpeech(d.room_number, d.room)}. ${d.name}, ${uzNumber(d.qty)} porsiya tayyor. Olib keting.`;
  Voice.say(text, 'ready');
  notifySystem('🔔 Buyurtma tayyor', `${d.room}: ${d.name} × ${d.qty}`);
  toast(`🔔 ${d.room}: ${d.name} × ${d.qty} tayyor!`, 'ok', 8000);
  updateReadyBanner();
});
Live.on('item_accepted', (d) => {
  toast(`👨‍🍳 ${d.chef} qabul qildi: ${d.name} (${d.room}) — taxminan ${fmtTime(d.eta_at)} da tayyor`, 'info', 6000);
});
Live.on('kitchen_new', (d) => {
  if (store('cp_kprint')) printKitchenTicket(d);
  if (App.user.role !== 'chef') return;
  const list = d.items.map((i) => `${i.name}, ${uzNumber(i.qty)}`).join('; ');
  Voice.say(`Yangi buyurtma. ${d.room}. ${list}.`, 'new');
  notifySystem('🆕 Yangi buyurtma', `${d.room}: ${d.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}`);
});
Live.on('kitchen_cancel', (d) => {
  if (App.user.role !== 'chef') return;
  Voice.say(`Diqqat! ${d.room}. ${d.name} bekor qilindi.`, 'alert');
  toast(`❌ Bekor qilindi: ${d.name} × ${d.qty} (${d.room})`, 'error', 10000);
});
Live.on('bill_requested', (d) => {
  if (App.user.role !== 'cashier') { toast(`🧾 ${d.room} hisob so'ramoqda`, 'info'); return; }
  Voice.say(`${d.room} hisob so'ramoqda.`, 'new');
  toast(`🧾 ${d.room} hisob so'ramoqda`, 'warn', 8000);
});
Live.on('payroll', (d) => {
  const text = { payment: `💵 Sizga ${moneyText(d.amount)} ish haqi berildi`, bonus: `🎁 Sizga ${moneyText(d.amount)} bonus yozildi`, fine: `⚠ Sizga ${moneyText(d.amount)} jarima yozildi` }[d.type];
  if (text) toast(text, d.type === 'fine' ? 'warn' : 'ok', 8000);
});
Live.on('stoplist', (d) => toast(`⛔ "${d.name}" tugadi (${d.by})`, 'warn', 6000));

async function refreshBadges() {
  try {
    const role = App.user.role;
    if (role === 'waiter') {
      App.readyItems = await GET('/api/my/ready');
      App.badges.ready = App.readyItems.length;
    }
    if (['chef', 'owner', 'admin'].includes(role) && moduleOn('kitchen')) {
      const k = await GET('/api/kitchen');
      App.badges.kitchen = k.load.pending;
    }
    if (['cashier', 'owner', 'admin'].includes(role)) {
      const open = await GET('/api/orders?status=open');
      App.badges.bills = open.filter((o) => o.bill_requested).length;
    }
    updateNav();
    renderReadyBanner();
  } catch { /* ignore */ }
}

async function updateReadyBanner() {
  if (App.user && App.user.role === 'waiter') await refreshBadges();
}

function renderReadyBanner() {
  const el = document.getElementById('ready-banner');
  if (!el) return;
  const items = App.user.role === 'waiter' ? App.readyItems : [];
  if (!items.length || parseHash().name === 'ready') { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="ready-banner"><b>🔔 Tayyor taomlar — olib keting!</b>
    ${items.slice(0, 4).map((i) => `<div class="rb-item"><div><b>${esc(i.room_number)}-xona</b> · ${esc(i.name)} × ${i.qty}</div>
      <button class="btn sm" data-banner-serve="${i.id}">✋ Oldim</button></div>`).join('')}
    ${items.length > 4 ? `<a href="#/ready" style="color:#fff">Yana ${items.length - 4} ta →</a>` : ''}</div>`;
  el.querySelectorAll('[data-banner-serve]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await POST(`/api/items/${b.dataset.bannerServe}/serve`); await refreshBadges(); refreshSoon(); } catch (e) { toastError(e); }
  });
}

// ---------- Boot ----------
async function afterLogin() {
  const me = await GET('/api/me');
  App.user = me.user;
  App.settings = me.settings;
  App.tenant = me.tenant;
  App.disabled = me.disabled || [];
  document.getElementById('app').innerHTML = '';
  Live.start();
  refreshBadges();
}

window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => { if (!document.hidden && App.user) { refreshView(); refreshBadges(); } });

(async function boot() {
  applyTheme();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // A personal link https://site/c/<code> remembers the choyxona code on this device.
  const m = /^\/c\/([a-z0-9-]+)\/?$/i.exec(location.pathname);
  if (m && m[1].toLowerCase() !== store('cp_code')) { store('cp_code', m[1].toLowerCase()); store('cp_token', null); }
  const code = store('cp_code');
  if (code) {
    try { App.info = await GET(`/api/info?code=${encodeURIComponent(code)}`); } catch (e) {
      App.info = null;
      if (!store('cp_token')) setTimeout(() => toast(`${e.message}: "${code}". Kodni tekshiring.`, 'error', 8000), 300);
    }
  }
  App.token = store('cp_token');
  if (App.token) {
    try { await afterLogin(); } catch { App.token = null; store('cp_token', null); }
  }
  if (App.user && (!location.hash || location.hash === '#/login')) location.hash = homeRoute();
  render();
})();
