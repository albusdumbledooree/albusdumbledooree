'use strict';
/* App shell: navigation, routing, live reactions (voice, banners, badges), auto-lock, boot. */

const NAV_ORDER = {
  owner: ['rooms', 'kitchen', 'history', 'reports', 'finance', 'payroll', 'reservations', 'menuadmin', 'staff', 'settings'],
  admin: ['rooms', 'kitchen', 'history', 'reports', 'finance', 'reservations', 'menuadmin', 'staff', 'settings'],
  cashier: ['rooms', 'history', 'reports', 'finance', 'reservations', 'stoplist', 'settings'],
  waiter: ['rooms', 'ready', 'settings'],
  chef: ['kitchen', 'stoplist', 'settings'],
};
const CHILD_OF = { room: 'rooms', order: 'rooms', soboy: 'rooms' };
let currentView = null;
let currentParams = [];
let currentData = null;
let loadSeq = 0;

function viewOn(name) {
  const v = Views[name];
  if (!v || v.public || !v.roles.includes(App.user.role)) return false;
  if (v.module === 'kitchen') return App.kitchenMode !== 'off';
  return moduleOn(v.module);
}
function navKeys() { return NAV_ORDER[App.user.role].filter(viewOn); }
function homeRoute() { return `#/${navKeys()[0]}`; }

function applyTheme() {
  if ((store('cp_theme') || 'light') === 'dark') document.documentElement.dataset.theme = 'dark';
  else document.documentElement.removeAttribute('data-theme');
}

function parseHash() {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  return { name: parts[0] || '', params: parts.slice(1) };
}

function navHtml() {
  const { name } = parseHash();
  const active = CHILD_OF[name] || name;
  return navKeys().map((k) => {
    const v = Views[k];
    const b = v.badge && App.badges[v.badge] ? `<span class="badge">${App.badges[v.badge]}</span>` : '';
    return `<a href="#/${k}" class="nav-item ${active === k ? 'active' : ''}">${icon(v.icon(), 24)}<span>${esc(v.title())}</span>${b}</a>`;
  }).join('');
}

function shellHtml() {
  return `<div class="shell">
    <aside class="rail"><div class="logo"><img src="/icon.svg" alt=""></div>${navHtml()}</aside>
    <div class="main">
      <header class="topbar">
        <div class="title grow" id="top-title"></div>
        <span class="conn" title=""></span>
        <span class="clock hide-sm" data-clock>${fmtTime(Date.now())}</span>
        <span class="me-chip hide-sm"><span class="avatar ${App.user.role}">${esc(initials(App.user.name))}</span>${esc(App.user.name)}</span>
        ${Screen.canFullscreen() ? `<button class="icon-btn" id="top-full" title="${esc(t("To'liq ekran"))}">${icon('maximize')}</button>` : ''}
        <button class="icon-btn" id="top-exit" title="${esc(t('Chiqish'))}">${icon(App.device ? 'lock' : 'log-out')}</button>
      </header>
      ${subscriptionBanner()}
      <div class="content" id="view"></div>
    </div>
    <nav class="tabbar">${navHtml()}</nav>
  </div><div id="ready-banner"></div>`;
}

// Reminds the boss when the subscription set on the platform is about to run out.
function subscriptionBanner() {
  const until = App.tenant && App.tenant.paid_until;
  if (!until || !can('owner', 'admin')) return '';
  const days = Math.ceil((until - Date.now()) / (24 * 60 * MIN));
  if (days > 5) return '';
  return `<div class="notice ${days < 0 ? 'red' : ''}" style="margin:12px 20px 0">${icon('triangle-alert', 18)} ${days < 0
    ? t("Obuna muddati {0} da tugagan. Iltimos, to'lovni amalga oshiring.", fmtDate(until))
    : t('Obuna muddati {0} kundan keyin ({1}) tugaydi.', days, fmtDate(until))}</div>`;
}

function updateNav() { document.querySelectorAll('.rail, .tabbar').forEach((n) => { n.innerHTML = (n.classList.contains('rail') ? '<div class="logo"><img src="/icon.svg" alt=""></div>' : '') + navHtml(); }); }

async function render() {
  applyTheme();
  const app = document.getElementById('app');
  const { name, params } = parseHash();
  if (!App.user) {
    currentView = null;
    const view = App.device ? Views.lock : Views.setup;
    if (App.device && name !== 'lock') { location.hash = '#/lock'; return; }
    if (!App.device && !['setup', 'login'].includes(name)) { location.hash = '#/setup'; return; }
    try {
      const data = view.load ? await view.load() : {};
      app.innerHTML = view.render(data);
      if (view.bind) view.bind(app, data);
      tickTimers();
    } catch (e) {
      if (App.device && (e.status === 401 || e.status === 403)) { App.device = null; store('cp_device', null); location.hash = '#/setup'; toastError(e); return; }
      app.innerHTML = `<div class="setup-wrap"><div class="card setup">${emptyState('triangle-alert', esc(e.message))}<button class="btn block" onclick="location.reload()">${icon('refresh-cw', 18)} ${t('Qayta urinish')}</button></div></div>`;
    }
    return;
  }
  const navName = CHILD_OF[name] || name;
  if (!Views[name] || !viewOn(navName)) { location.hash = homeRoute(); return; }
  const view = Views[name];
  if (!document.getElementById('view')) {
    app.innerHTML = shellHtml();
    app.querySelector('#top-exit').onclick = logout;
    const full = app.querySelector('#top-full');
    if (full) full.onclick = () => Screen.toggleFull();
    updateConn();
  }
  if (currentView !== view) { UI.search = ''; UI.drawer = false; window.scrollTo(0, 0); }
  currentView = view;
  currentParams = params;
  updateNav();
  const title = view.title() || (Views[navName] ? Views[navName].title() : '');
  // The page has its own heading; the top bar shows which choyxona this is.
  document.getElementById('top-title').textContent = App.settings.name || '';
  document.title = `${title} · ${App.settings.name || 'FLOWI'}`;
  await refreshView(true);
  renderReadyBanner();
}

async function logout() {
  try { await POST('/api/logout'); } catch { /* ignore */ }
  endSession();
}

async function refreshView(showLoading = false) {
  const view = currentView;
  if (!view || view.public) return;
  const el = document.getElementById('view');
  if (!el) return;
  const seq = ++loadSeq;
  if (showLoading) el.innerHTML = `<div class="empty">${icon('refresh-cw', 32)}</div>`;
  try {
    const data = view.load ? await view.load(currentParams) : {};
    if (seq !== loadSeq || view !== currentView || data === null) return;
    renderView(data);
  } catch (e) {
    if (seq !== loadSeq) return;
    el.innerHTML = emptyState('triangle-alert', esc(e.message));
  }
}

// Re-render the current view, keeping focus and caret in the input being typed in.
function renderView(data) {
  currentData = data;
  const el = document.getElementById('view');
  if (!el) return;
  const active = document.activeElement;
  const focusId = active && el.contains(active) && active.id ? active.id : null;
  const caret = focusId && 'selectionStart' in active ? active.selectionStart : null;
  const scroll = window.scrollY;
  const paneScroll = (el.querySelector('.cp-body') || {}).scrollTop;
  el.innerHTML = currentView.render(data, currentParams);
  if (currentView.bind) currentView.bind(el, data, currentParams);
  tickTimers();
  if (focusId) {
    const f = document.getElementById(focusId);
    if (f) { f.focus(); try { if (caret != null) f.setSelectionRange(caret, caret); } catch { /* ignore */ } }
  }
  const pane = el.querySelector('.cp-body');
  if (pane && paneScroll != null) pane.scrollTop = paneScroll;
  window.scrollTo(0, scroll);
}

// ---------- Session ----------
async function startSession(token) {
  App.token = token;
  store('cp_token', token);
  await afterLogin();
  location.hash = homeRoute();
  render();
}

async function afterLogin() {
  const me = await GET('/api/me');
  App.user = me.user;
  App.settings = me.settings;
  App.tenant = me.tenant;
  App.disabled = me.disabled || [];
  App.kitchenMode = me.kitchen_mode || 'full';
  document.getElementById('app').innerHTML = '';
  Live.start();
  refreshBadges();
  Screen.keepAwake();
  touchActivity();
}

// ---------- Auto-lock on shared devices ----------
let lastActivity = Date.now();
function touchActivity() { lastActivity = Date.now(); }
['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, touchActivity, { passive: true }));
setInterval(() => {
  const mins = App.settings.auto_lock_minutes;
  if (App.user && App.device && mins > 0 && Date.now() - lastActivity > mins * MIN) logout();
}, 15000);

// ---------- Live reactions ----------
const refreshSoon = (() => {
  let timer = null;
  return () => { clearTimeout(timer); timer = setTimeout(() => refreshView(), 250); };
})();

Live.on('*', (type) => {
  if (currentView && currentView.refreshOn && currentView.refreshOn.includes(type)) refreshSoon();
  if (['rooms', 'kitchen', 'kitchen_new', 'item_ready'].includes(type)) refreshBadges();
});
Live.on('settings', async () => {
  try {
    const me = await GET('/api/me');
    const changed = JSON.stringify(me.disabled) !== JSON.stringify(App.disabled) || me.kitchen_mode !== App.kitchenMode;
    App.settings = me.settings; App.disabled = me.disabled || []; App.kitchenMode = me.kitchen_mode; App.user = me.user;
    if (changed) { updateNav(); render(); }
  } catch { /* ignore */ }
});
Live.on('item_ready', (d) => {
  if (d.waiter_id !== App.user.id) return;
  Voice.say(t('Diqqat! {0}. {1}, {2} porsiya tayyor. Olib keting.', spokenRoom(d.room_number, d.room), d.name, spokenQty(d.qty)), 'ready');
  notifySystem(t('Buyurtma tayyor'), `${d.room}: ${d.name} × ${d.qty}`);
  toast(t('{0}: {1} × {2} tayyor!', d.room, d.name, d.qty), 'ok', 8000);
});
Live.on('item_accepted', (d) => toast(t('{0} qabul qildi: {1} — taxminan {2} da tayyor', d.chef, d.name, fmtTime(d.eta_at)), 'info', 6000));
Live.on('kitchen_new', (d) => {
  if (store('cp_kprint')) printKitchenTicket(d);
  if (App.user.role !== 'chef') return;
  Voice.say(t('Yangi buyurtma. {0}. {1}.', d.room, d.items.map((i) => `${i.name}, ${spokenQty(i.qty)}`).join('; ')), 'new');
  notifySystem(t('Yangi buyurtma'), `${d.room}: ${d.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}`);
});
Live.on('kitchen_cancel', (d) => {
  if (App.user.role !== 'chef') return;
  Voice.say(t('Diqqat! {0}. {1} bekor qilindi.', d.room, d.name), 'alert');
  toast(t('Bekor qilindi: {0} × {1} ({2})', d.name, d.qty, d.room), 'error', 10000);
});
Live.on('bill_requested', (d) => {
  if (App.user.role === 'cashier') Voice.say(t("{0} hisob so'ramoqda.", d.room), 'new');
  toast(t("{0} hisob so'ramoqda", d.room), 'warn', 8000);
});
Live.on('stoplist', (d) => toast(t('"{0}" tugadi', d.name), 'warn', 6000));
Live.on('payroll', (d) => {
  const text = { payment: t('Sizga {0} ish haqi berildi', moneyText(d.amount)), bonus: t('Sizga {0} bonus yozildi', moneyText(d.amount)), fine: t('Sizga {0} jarima yozildi', moneyText(d.amount)) }[d.type];
  if (text) toast(text, d.type === 'fine' ? 'warn' : 'ok', 8000);
});

async function refreshBadges() {
  try {
    const role = App.user.role;
    if (role === 'waiter' && App.kitchenMode !== 'off') {
      App.readyItems = await GET('/api/my/ready');
      App.badges.ready = App.readyItems.length;
    }
    if (['chef', 'owner', 'admin'].includes(role) && App.kitchenMode !== 'off') App.badges.kitchen = (await GET('/api/kitchen')).load.pending;
    if (['cashier', 'owner', 'admin'].includes(role)) App.badges.bills = (await GET('/api/orders?status=open')).filter((o) => o.bill_requested).length;
    updateNav();
    renderReadyBanner();
  } catch { /* ignore */ }
}

function renderReadyBanner() {
  const el = document.getElementById('ready-banner');
  if (!el || !App.user) return;
  const items = App.user.role === 'waiter' ? App.readyItems : [];
  if (!items.length || parseHash().name === 'ready') { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="ready-banner"><div class="rb-head">${icon('bell', 20)} ${t('Tayyor — olib keting!')}</div>
    ${items.slice(0, 3).map((i) => `<div class="rb-item"><div class="grow"><b>${esc(i.room_name)}</b> · ${i.qty}× ${esc(i.name)}</div>
      <button class="btn sm" data-banner-serve="${i.id}">${icon('hand', 16)} ${t('Oldim')}</button></div>`).join('')}
    ${items.length > 3 ? `<a href="#/ready" style="color:#fff">+${items.length - 3}</a>` : ''}</div>`;
  el.querySelectorAll('[data-banner-serve]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await POST(`/api/items/${b.dataset.bannerServe}/serve`); await refreshBadges(); refreshSoon(); } catch (e) { toastError(e); }
  });
}

// ---------- Boot ----------
window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => { if (!document.hidden && App.user) { refreshView(); refreshBadges(); } });

(async function boot() {
  applyTheme();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // A personal link https://site/c/<code> fills in the choyxona code on this device.
  const m = /^\/c\/([a-z0-9-]+)\/?$/i.exec(location.pathname);
  if (m) store('cp_code', m[1].toLowerCase());
  App.device = store('cp_device');
  if (App.device && m && App.device.code !== m[1].toLowerCase()) { App.device = null; store('cp_device', null); }
  App.token = store('cp_token');
  if (App.token) {
    try { await afterLogin(); } catch { App.token = null; store('cp_token', null); }
  }
  if (!App.user) {
    const code = (App.device && App.device.code) || store('cp_code');
    if (code) await loadInfo(code);
  }
  if (App.user && (!location.hash || ['#/login', '#/setup', '#/lock'].includes(location.hash))) location.hash = homeRoute();
  render();
})();
