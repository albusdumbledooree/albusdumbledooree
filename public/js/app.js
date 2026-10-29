'use strict';
/* App shell: navigation, routing, live reactions (voice, banners, badges), auto-lock, boot. */

// Money pages (reports, cash book, payroll) are not in the main list: they sit behind one quiet "Moliya" entry.
function navOrder(role) {
  // A door shop opens on "Bugun" (today's tasks and numbers) and keeps the menu short.
  if (isDoors()) {
    return {
      owner: ['today', 'pos', 'menuadmin', 'history', 'staff', 'settings', 'money'],
      admin: ['today', 'pos', 'menuadmin', 'history', 'staff', 'settings', 'money'],
      cashier: ['today', 'pos', 'history', 'settings', 'money'],
      waiter: ['today', 'pos', 'settings'],
      chef: ['today', 'settings'],
    }[role];
  }
  const home = isShop() ? ['pos', 'today'] : App.biz === 'fastfood' ? ['pos', 'rooms', 'today'] : ['rooms', 'today'];
  return {
    owner: [...home, 'kitchen', 'history', 'reservations', 'menuadmin', 'staff', 'settings', 'money'],
    admin: [...home, 'kitchen', 'history', 'reservations', 'menuadmin', 'staff', 'settings', 'money'],
    cashier: [...home, 'history', 'reservations', 'stoplist', 'settings', 'money'],
    waiter: [...home, 'ready', 'settings'],
    chef: ['kitchen', 'today', 'stoplist', 'inventory', 'settings'],
  }[role];
}
const CHILD_OF = { room: 'rooms', order: 'rooms', soboy: 'rooms', reports: 'money', finance: 'money', payroll: 'money', attendance: 'staff', customers: 'money', inventory: 'money', branches: 'money',
  profit: 'money', purchases: 'money', debts: 'money', masters: 'money' };
let currentView = null;
let currentParams = [];
let currentData = null;
let loadSeq = 0;

function viewOn(name) {
  const v = Views[name];
  if (!v || v.public || !v.roles.includes(App.user.role)) return false;
  if (v.on && !v.on()) return false;
  if (v.module === 'kitchen') return App.kitchenMode !== 'off';
  return moduleOn(v.module);
}
function navKeys() { return navOrder(App.user.role).filter(viewOn); }
function homeRoute() { return `#/${navKeys()[0]}`; }

function applyTheme() {
  if ((store('cp_theme') || 'light') === 'dark') document.documentElement.dataset.theme = 'dark';
  else document.documentElement.removeAttribute('data-theme');
}

function parseHash() {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  return { name: parts[0] || '', params: parts.slice(1) };
}

// A child page lights up its parent tab, unless the role has no such tab (chef opens Ombor directly).
const parentOf = (name) => (CHILD_OF[name] && Views[CHILD_OF[name]].roles.includes(App.user?.role) ? CHILD_OF[name] : name);

function navHtml() {
  const { name } = parseHash();
  const active = parentOf(name);
  return navKeys().map((k) => {
    const v = Views[k];
    const b = v.badge && App.badges[v.badge] ? `<span class="badge">${App.badges[v.badge]}</span>` : '';
    return `<a href="#/${k}" class="nav-item ${k === 'money' ? 'nav-quiet' : ''} ${active === k ? 'active' : ''}" title="${esc(v.title())}">${icon(v.icon(), 22)}<span>${esc(v.title())}</span>${b}</a>`;
  }).join('');
}
function brandHtml() {
  const logo = App.info && App.info.logo;
  return `${logo ? `<img src="${esc(logo)}" alt="">` : flowiLogo(18)}<span class="venue" id="top-title"></span>`;
}

/* Every working screen has the same frame (like a cash-desk program):
   the sections across the top, the page in the middle, the state of the device at the bottom. */
function shellHtml() {
  return `<div class="shell">
    <header class="topnav">
      <div class="brandbox">${brandHtml()}</div>
      <nav class="tabs">${navHtml()}</nav>
      <div class="tright">
        <span class="me-chip"><span class="avatar ${App.user.role}">${esc(initials(App.user.name))}</span><span class="hide-sm">${esc(App.user.name)}</span></span>
        ${App.settings.att_qr && can('owner', 'admin', 'cashier') ? `<button class="icon-btn" id="top-wqr" title="${esc(t('Davomat QR'))}">${icon('qr-code')}</button>` : ''}
        ${Work.state && Work.state.rules.clock && Work.state.open ? `<button class="btn sm wk-out" id="top-out" title="${esc(t('Ishni tugatdim'))}">${icon('clock', 16)}<span class="hide-sm">${t('Ishni tugatdim')}</span></button>` : ''}
        ${Screen.standalone() && !Screen.canFullscreen() ? '' : Screen.button('top-full')}
        <button class="icon-btn lockbtn" id="top-exit" title="${esc(t('Chiqish'))}">${icon(App.device ? 'lock' : 'log-out')}</button>
      </div>
    </header>
    ${App.platformSession ? `<div class="notice blue slim">${icon('shield-check', 18)} ${t('Platforma orqali boshliq sifatida kirdingiz. Amallar tarixga yoziladi.')}</div>` : ''}
    ${subscriptionBanner()}
    ${can('owner', 'admin') && !App.user.has_pin && App.device ? `<div class="notice slim">${icon('key-round', 18)} <span>${t("Ish stolida sizning ismingizga parol qo'yilmagan — ismingizni bosgan har kim kira oladi.")}
      <a href="#/settings" id="set-pin">${t("Parol qo'yish")}</a></span></div>` : ''}
    <main class="content" id="view"></main>
    <footer class="statusbar">${statusBarHtml()}</footer>
    <nav class="tabbar">${navHtml()}</nav>
  </div><div id="ready-banner"></div>`;
}

// Bottom line: live connection, order printer, folder backup, version, date and time.
function statusBarHtml() {
  const dot = (on, label) => `<span class="sb-item"><i class="${on ? 'on' : ''}"></i>${label}</span>`;
  return `<span class="sb-item conn-item"><i class="conn"></i>${t('Jonli aloqa')}</span>
    ${App.device ? dot(OrderPrinter.on(), t('Buyurtma printeri')) : ''}
    ${App.device && App.device.name ? `<span class="sb-item">${icon('monitor-smartphone', 14)} ${esc(App.device.name)}</span>` : ''}
    <span class="grow"></span>
    <span class="sb-item muted" title="${esc(App.version || '')}">FLOWI ${App.info && App.info.release ? `v${esc(App.info.release)}` : ''}</span>
    <span class="sb-item"><b>${esc(fmtDate(Date.now()))}</b> · <b data-clock>${fmtTime(Date.now())}</b></span>`;
}

// Reminds the boss when the subscription set on the platform is about to run out.
function subscriptionBanner() {
  const p = App.plan;
  // Term over: everyone sees why nothing new can be written; the data is all still there.
  if (p && p.read_only) return `<div class="notice slim red">${icon('lock', 18)} ${t("Obuna muddati tugagan — faqat ko'rish rejimi. Barcha ma'lumotlar saqlanib turibdi. Yangi buyurtma yozish uchun to'lovni yangilang.")}</div>`;
  if (p && p.paid_until && p.paid_until < Date.now() && can('owner', 'admin')) {
    return `<div class="notice slim red">${icon('triangle-alert', 18)} ${t("Obuna muddati {0} da tugagan. {1} dan keyin dastur faqat ko'rish rejimiga o'tadi.", fmtDate(p.paid_until), fmtDateTime(p.grace_until))}</div>`;
  }
  const n = can('owner', 'admin') && subscriptionNotice(App.tenant && App.tenant.paid_until);
  return n ? `<div class="notice slim ${n.cls}">${icon('triangle-alert', 18)} ${n.text}</div>` : '';
}

function updateNav() {
  document.querySelectorAll('.topnav .tabs, .tabbar').forEach((n) => { n.innerHTML = navHtml(); });
  const sb = document.querySelector('.statusbar');
  if (sb) { sb.innerHTML = statusBarHtml(); updateConn(); }
}

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
  // Work hours / the place: until the worker "came" (and is inside), this screen stands in front of the program.
  if (Work.gate) { currentView = null; Work.render(app); return; }
  const navName = parentOf(name);
  if (!Views[name] || !viewOn(navName) || !viewOn(name)) { location.hash = homeRoute(); return; }
  const view = Views[name];
  if (!document.getElementById('view')) {
    app.innerHTML = shellHtml();
    app.querySelector('#top-exit').onclick = logout;
    const wq = app.querySelector('#top-wqr');
    if (wq) wq.onclick = () => Work.showQr();
    const wo = app.querySelector('#top-out');
    if (wo) wo.onclick = () => Work.clockOut();
    const sp = app.querySelector('#set-pin');
    if (sp) sp.onclick = () => { UI.settingsTab = 'me'; };
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
    if (e.status === 423) return financeLockScreen(el);
    el.innerHTML = emptyState('triangle-alert', esc(e.message));
  }
}

// The boss chose to protect money pages with a password: ask for it inside the page.
function financeLockScreen(el) {
  el.innerHTML = `<form class="card finance-lock" id="fin-unlock">${icon('lock', 40)}<h2>${t("Moliya bo'limi")}</h2>
    <p class="muted">${t('Davom etish uchun moliya parolini kiriting')}</p>
    <input type="password" name="code" autocomplete="off" required>
    <button class="btn primary lg block">${icon('lock-open', 20)} ${t('Ochish')}</button></form>`;
  const f = el.querySelector('#fin-unlock');
  if (!('ontouchstart' in window)) f.code.focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await POST('/api/finance/unlock', { code: f.code.value });
      App.financeKey = r.finance_key;
      refreshView(true);
    } catch (err) { f.code.value = ''; toastError(err); }
  };
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
  App.biz = me.business_type || 'choyxona';
  App.money = me.money || {};
  App.plan = me.plan || null;
  App.branchCount = me.branches || 0;
  App.modulesAll = me.modules || {};
  App.platformSession = !!me.platform_session;
  Work.load(me.work);
  if (!App.info || App.info.code !== me.tenant.code) await loadInfo(me.tenant.code);
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
    const changed = JSON.stringify([me.disabled, me.kitchen_mode, me.business_type, me.money]) !== JSON.stringify([App.disabled, App.kitchenMode, App.biz, App.money]);
    const workBefore = JSON.stringify([Work.gate, App.settings.att_qr, Work.state && Work.state.rules]);
    App.settings = me.settings; App.disabled = me.disabled || []; App.kitchenMode = me.kitchen_mode; App.user = me.user;
    Work.load(me.work);
    const workChanged = workBefore !== JSON.stringify([Work.gate, App.settings.att_qr, Work.state && Work.state.rules]);
    App.biz = me.business_type || 'choyxona'; App.money = me.money || {};
    const termChanged = JSON.stringify([me.tenant, me.plan && { ...me.plan, staff_used: 0 }]) !== JSON.stringify([App.tenant, App.plan && { ...App.plan, staff_used: 0 }]);
    App.tenant = me.tenant; App.plan = me.plan || null; App.branchCount = me.branches || 0;
    await loadInfo(me.tenant.code);
    if (changed || termChanged || workChanged) { document.getElementById('app').innerHTML = ''; render(); } else updateNav();
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
    const tk = await GET('/api/tasks');
    App.badges.tasks = tk.overdue.length + tk.today.length;
    App.guestReqs = moduleOn('qrorder') && ['owner', 'admin', 'cashier', 'waiter'].includes(role) ? await GET('/api/guest-requests') : [];
    App.workAsks = App.settings.att_clock && ['owner', 'admin', 'cashier'].includes(role) ? await GET('/api/work/pending') : [];
    updateNav();
    renderReadyBanner();
  } catch { /* ignore */ }
}

function renderReadyBanner() {
  const el = document.getElementById('ready-banner');
  if (!el || !App.user) return;
  const items = App.user.role === 'waiter' && parseHash().name !== 'ready' ? App.readyItems || [] : [];
  const reqs = App.guestReqs || [];
  const asks = App.workAsks || [];
  if (!items.length && !reqs.length && !asks.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="float-stack">${asks.length ? workAskHtml(asks) : ''}${reqs.length ? guestBannerHtml(reqs) : ''}
    ${items.length ? `<div class="ready-banner"><div class="rb-head">${icon('bell', 20)} ${t('Tayyor — olib keting!')}</div>
    ${items.slice(0, 3).map((i) => `<div class="rb-item"><div class="grow"><b>${esc(i.room_name)}</b> · ${i.qty}× ${esc(i.name)}</div>
      <button class="btn sm" data-banner-serve="${i.id}">${icon('hand', 16)} ${t('Oldim')}</button></div>`).join('')}
    ${items.length > 3 ? `<a href="#/ready" style="color:#fff">+${items.length - 3}</a>` : ''}</div>` : ''}</div>`;
  bindGuestBanner(el);
  bindWorkAsks(el);
  el.querySelectorAll('[data-banner-serve]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await POST(`/api/items/${b.dataset.bannerServe}/serve`); await refreshBadges(); refreshSoon(); } catch (e) { toastError(e); }
  });
}

// ---------- QR menu: what guests send from the table ----------
function guestReqLine(g) {
  if (g.kind === 'waiter') return t('ofitsantni chaqirmoqda');
  if (g.kind === 'bill') return t("hisob so'ramoqda");
  return `${t('{0} ta taom', g.items.reduce((s, i) => s + i.qty, 0))} · ${moneyText(g.total)}`;
}
function guestBannerHtml(reqs) {
  return `<div class="guest-banner"><div class="rb-head">${icon('concierge-bell', 20)} ${t("Mijozlardan so'rov")} <span class="badge">${reqs.length}</span></div>
    ${reqs.slice(0, 4).map((g) => `<div class="rb-item"><div class="grow"><b>${esc(g.room)}</b> · ${guestReqLine(g)}
        <span class="small" style="opacity:.8">· ${fmtTime(g.created_at)}</span></div>
      ${g.kind === 'order' ? `<button class="btn sm" data-greq="${g.id}">${icon('eye', 16)} ${t("Ko'rish")}</button>`
        : `<button class="btn sm" data-gdone="${g.id}">${icon('check', 16)} ${t('Bordim')}</button>`}</div>`).join('')}
    ${reqs.length > 4 ? `<div class="small">+${reqs.length - 4}</div>` : ''}</div>`;
}
function bindGuestBanner(el) {
  el.querySelectorAll('[data-greq]').forEach((b) => b.onclick = () => guestRequestDialog((App.guestReqs || []).find((g) => g.id === Number(b.dataset.greq))));
  el.querySelectorAll('[data-gdone]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await POST(`/api/guest-requests/${b.dataset.gdone}/done`); } catch (e) { toastError(e); }
    refreshBadges();
  });
}
// The worker checks what the guest asked for, may lower a quantity or drop a dish, then approves: the check opens.
function guestRequestDialog(g) {
  if (!g) return;
  const qty = Object.fromEntries(g.items.map((i) => [i.dish_id, i.qty]));
  const form = openModal({
    title: `${icon('concierge-bell')} ${esc(g.room)} — ${t("mijoz buyurtmasi")}`,
    body: `<p class="small muted" style="margin-top:0">${t('Yuborildi')}: ${fmtTime(g.created_at)} · ${t("Tasdiqlagandan keyin chekka yoziladi va oshxonaga boradi.")}</p>
      <div class="stack" id="greq-lines">${g.items.map((i) => `<div class="greq-line ${i.available ? '' : 'off'}" data-dish="${i.dish_id}">
          <div class="grow"><b>${esc(i.name)}</b>${i.available ? '' : ` <span class="chip red">${t('tugagan')}</span>`}
            ${i.note ? `<div class="small muted">${icon('message-square', 13)} ${esc(i.note)}</div>` : ''}<div class="small muted">${moneyText(i.price)}</div></div>
          <div class="qty-step"><button type="button" class="icon-btn" data-gm="${i.dish_id}">−</button><b data-gq="${i.dish_id}">${i.qty}</b>
            <button type="button" class="icon-btn" data-gp="${i.dish_id}">+</button></div></div>`).join('')}</div>
      ${g.note ? `<div class="notice" style="margin-top:12px">${icon('message-square', 18)} ${esc(g.note)}</div>` : ''}
      <div class="lead" style="margin-top:12px">${t('Jami')}: <b id="greq-total"></b></div>`,
    actions: [{ label: t('Bekor') }, { label: t('Rad etish'), cls: 'danger', onClick: () => { rejectGuestRequest(g); return false; } },
      { label: t('Tasdiqlash'), cls: 'ok', icon: 'check', onClick: async () => {
        const items = g.items.map((i) => ({ dish_id: i.dish_id, qty: qty[i.dish_id] }));
        if (!items.some((i) => i.qty > 0)) { toast(t("Taom qolmadi — so'rovni rad eting"), 'warn'); return false; }
        const r = await POST(`/api/guest-requests/${g.id}/approve`, { items });
        toast(t('Tasdiqlandi — {0} chekiga yozildi', g.room), 'ok');
        refreshBadges(); refreshSoon();
        if (r.order && ['waiter', 'cashier'].includes(App.user.role)) location.hash = `#/order/${r.order.id}`;
      } }],
  });
  const sync = () => {
    form.querySelectorAll('[data-gq]').forEach((b) => { b.textContent = qty[b.dataset.gq]; b.closest('.greq-line').classList.toggle('zero', !qty[b.dataset.gq]); });
    form.querySelector('#greq-total').textContent = moneyText(g.items.reduce((s, i) => s + i.price * qty[i.dish_id], 0));
  };
  const max = Object.fromEntries(g.items.map((i) => [i.dish_id, i.qty]));
  form.querySelectorAll('[data-gm]').forEach((b) => b.onclick = () => { qty[b.dataset.gm] = Math.max(0, qty[b.dataset.gm] - 1); sync(); });
  form.querySelectorAll('[data-gp]').forEach((b) => b.onclick = () => { qty[b.dataset.gp] = Math.min(max[b.dataset.gp], qty[b.dataset.gp] + 1); sync(); });
  sync();
}
function rejectGuestRequest(g) {
  const reasons = [t('Bu taom tugagan'), t('Ofitsant hozir keladi'), t("Oshxona yopilgan")];
  openModal({
    title: `${icon('x')} ${esc(g.room)} — ${t('rad etish')}`,
    body: `<p class="small muted" style="margin-top:0">${t("Sababni mijoz o'z telefonida ko'radi.")}</p>
      <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">${reasons.map((r) => `<button type="button" class="btn sm" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      <label class="field">${t('Sabab')}<input name="reason" maxlength="200"></label>`,
    onMount: (f) => f.querySelectorAll('[data-reason]').forEach((b) => b.onclick = () => { f.reason.value = b.dataset.reason; }),
    actions: [{ label: t('Bekor') }, { label: t('Rad etish'), cls: 'danger', onClick: async (f) => {
      await POST(`/api/guest-requests/${g.id}/reject`, { reason: f.reason.value });
      toast(t('Rad etildi'), 'ok'); refreshBadges();
    } }],
  });
}
Live.on('guest', () => refreshBadges());
Live.on('tasks', () => refreshBadges());
Live.on('guest_request', (d) => {
  const text = d.kind === 'waiter' ? t('{0}: ofitsantni chaqirmoqda', d.room) : d.kind === 'bill' ? t("{0}: hisob so'ramoqda", d.room) : t('{0}: QR orqali yangi buyurtma', d.room);
  Voice.say(d.kind === 'waiter' ? t('{0} sizni chaqirmoqda.', d.room) : d.kind === 'bill' ? t("{0} hisob so'ramoqda.", d.room) : t('{0} dan yangi buyurtma. Tasdiqlang.', d.room), 'new');
  notifySystem(t("Mijozdan so'rov"), text);
  toast(text, 'warn', 8000);
  refreshBadges();
});

// ---------- Boot ----------
window.addEventListener('hashchange', () => { if (App.user) closeModal(); render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && App.user) { refreshView(); refreshBadges(); } });

(async function boot() {
  applyTheme();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // A personal link https://site/c/<code> fills in the choyxona code on this device.
  const m = /^\/c\/([a-z0-9-]+)\/?$/i.exec(location.pathname);
  if (m) store('cp_code', m[1].toLowerCase());
  App.device = store('cp_device');
  // /app (an installed icon) on a device that was never connected: the device setup asks for the business code.
  // (An iPhone home-screen app does not share Safari's storage, so it can start here knowing nothing.)
  if (App.device && m && App.device.code !== m[1].toLowerCase()) { App.device = null; store('cp_device', null); }
  App.token = store('cp_token');
  // Opened from the platform panel ("Boshliq sifatida kirish"): the session key comes in the link.
  const imp = /^#\/imp\/([A-Za-z0-9_]+)$/.exec(location.hash);
  if (imp) { App.token = imp[1]; store('cp_token', App.token); history.replaceState(null, '', location.pathname); }
  if (App.token) {
    try { await afterLogin(); } catch { App.token = null; store('cp_token', null); }
  }
  if (!App.user) {
    const code = (App.device && App.device.code) || store('cp_code');
    if (code) await loadInfo(code);
  }
  if (App.user && (!location.hash || ['#/login', '#/setup', '#/lock'].includes(location.hash))) location.hash = homeRoute();
  if (App.device) { FolderBackup.run(); OrderPrinter.sync(); }
  render();
})();
