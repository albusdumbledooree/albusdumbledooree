'use strict';
/* Platform panel for the site owner: create businesses, give each boss a login, track subscriptions,
   open any business as its boss, restore it from a backup, set the support contact. */

const P = { admin: null, tenants: [], search: '', filter: 'all', modules: {}, types: {} };
const DAY_MS = 24 * 60 * MIN;
const TOKEN_KEY = 'cp_ptoken';
const TYPE_ICONS = { choyxona: 'house', restoran: 'utensils', fastfood: 'sandwich', market: 'shopping-cart', clothing: 'shirt' };

// Overrides core.js: the platform session is stored separately from business logins.
function endSession() {
  App.token = null;
  P.admin = null;
  store(TOKEN_KEY, null);
  render();
}

function siteUrl(code) { return `${location.origin}/c/${code}`; }

function slugify(s) {
  return s.toLowerCase().replace(/[ʻʼ'`‘’]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 30);
}

function randomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const a = new Uint32Array(8);
  crypto.getRandomValues(a);
  return [...a].map((n) => chars[n % chars.length]).join('');
}

function isoDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dateEndTs(v) { return v ? new Date(`${v}T23:59`).getTime() : null; }
function daysLeft(t) { return t.paid_until ? Math.floor((t.paid_until - Date.now()) / DAY_MS) : null; }
function typeName(k) { return P.types[k] || k; }

function credentialsText(t, username, password) {
  return `FLOWI — ${t.name}\n\nKirish manzili: ${siteUrl(t.code)}\nKod: ${t.code}\nLogin: ${username}\nParol: ${password}\n\nBirinchi kirgandan keyin Sozlamalar bo'limida parolni o'zgartiring. Xodimlarni "Xodimlar" bo'limida o'zingiz qo'shasiz.`;
}

function showCredentials(t, username, password) {
  const text = credentialsText(t, username, password);
  openModal({
    title: `${icon('circle-check')} Tayyor — boshliqqa yuboring`,
    body: `<p class="muted small">Bu ma'lumotni Telegram yoki SMS orqali boshliqqa yuboring. Parol boshqa ko'rsatilmaydi.</p>
      <textarea id="cred" rows="10" readonly style="font-family:monospace">${esc(text)}</textarea>`,
    actions: [{ label: 'Yopish', onClick: () => {} }, { label: 'Nusxa olish', cls: 'primary', icon: 'copy', onClick: async () => {
      try { await navigator.clipboard.writeText(text); toast('Nusxa olindi', 'ok'); } catch {
        const ta = document.getElementById('cred'); ta.select(); document.execCommand('copy'); toast('Nusxa olindi', 'ok');
      }
      return false;
    } }],
  });
}

// ---------- Screens ----------
function loginHtml() {
  return `<div class="login-wrap"><form class="card login" id="plogin">
    <div class="brand">${flowiLogo(30)}<span class="muted">Platforma boshqaruvi</span></div>
    <div class="stack">
      <label class="field">Login<input name="username" autocomplete="username" autocapitalize="none" required></label>
      <label class="field">Parol<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn primary lg block">${icon('log-in', 20)} Kirish</button>
    </div>
    <p class="small muted" style="margin-top:14px">Bu sahifa faqat sayt egasi uchun. Xodimlar <a href="/">bosh sahifadan</a> kiradi.</p>
  </form></div>`;
}

function tenantCard(t) {
  const d = daysLeft(t);
  const due = t.paid_until == null ? '<span class="muted">Muddat yo\'q</span>'
    : `<span class="${d < 0 ? 'red' : d <= 5 ? 'warn' : ''}"><b>${fmtDate(t.paid_until)}</b> · ${d < 0 ? `${-d} kun o'tdi` : `${d} kun qoldi`}</span>`;
  const mods = Object.keys(P.modules).length;
  return `<article class="tcard ${t.status === 'blocked' ? 'blocked' : ''}">
    <header><span class="tc-ic">${icon(TYPE_ICONS[t.business_type] || 'store', 22)}</span>
      <div class="grow"><b>${esc(t.name)}</b><span class="small muted">${esc(typeName(t.business_type))}</span></div>
      ${t.status === 'active' ? '<span class="chip green">Faol</span>' : '<span class="chip red">Bloklangan</span>'}</header>
    <div class="tc-rows">
      <span>${icon('link', 15)}</span><span><span class="chip">${esc(t.code)}</span> <a href="${esc(siteUrl(t.code))}" target="_blank" rel="noopener">ochish ${icon('external-link', 13)}</a></span>
      <span>${icon('user-round', 15)}</span><span>${esc(t.contact_name || '—')} ${t.phone ? `· ${esc(t.phone)}` : ''}<br><span class="small muted">Login: ${(t.owners || []).map(esc).join(', ') || '—'}</span></span>
      <span>${icon('calendar', 15)}</span><span>${due}${t.monthly_fee ? ` · ${money(t.monthly_fee)}/oy` : ''}</span>
      <span>${icon('layers', 15)}</span><span class="small">Bo'limlar: ${mods - (t.disabled_modules || []).length}/${mods} · Oshxona: ${esc({ full: "to'liq", notify: 'xabar', off: "o'chiq" }[t.kitchen_mode] || t.kitchen_mode)}</span>
      ${t.support && t.support.text ? `<span>${icon('life-buoy', 15)}</span><span class="small">${esc(t.support.text)}</span>` : ''}
    </div>
    ${t.error ? `<p class="small red">${esc(t.error)}</p>` : `<div class="tc-stats">
      <div><b>${t.staff}</b><span>xodim</span></div><div><b>${t.orders_30d}</b><span>chek / 30 kun</span></div>
      <div><b>${num(t.sales_30d)}</b><span>savdo / 30 kun</span></div></div>
      <p class="small muted">Oxirgi faollik: ${t.last_activity ? fmtDateTime(t.last_activity) : '—'}</p>`}
    <footer>
      <button class="btn sm primary" data-imp="${t.id}" title="Boshliq sifatida kirish">${icon('log-in', 16)} Kirish</button>
      <button class="btn sm" data-edit="${t.id}">${icon('pencil', 16)} Tahrirlash</button>
      <button class="btn sm" data-term="${t.id}" title="To'lov muddatini o'zgartirish">${icon('calendar', 16)} Muddat</button>
      <button class="icon-btn" data-more="${t.id}" title="Boshqa">${icon('ellipsis-vertical', 18)}</button>
    </footer></article>`;
}

function mainHtml() {
  const q = P.search.toLowerCase();
  const list = P.tenants.filter((t) => (P.filter === 'all' || t.business_type === P.filter || (P.filter === 'blocked' && t.status === 'blocked'))
    && (!q || `${t.name} ${t.code} ${t.contact_name} ${t.phone}`.toLowerCase().includes(q)));
  const active = P.tenants.filter((t) => t.status === 'active');
  const due = active.filter((t) => { const d = daysLeft(t); return d !== null && d <= 5; });
  const types = [...new Set(P.tenants.map((t) => t.business_type))];
  return `<header class="ptop">${flowiLogo(22)}<b class="hide-xs">Platforma</b>${P.release ? `<span class="chip">v${esc(P.release)}</span>` : ''}<span class="grow"></span>
      <span class="muted small hide-xs">${esc(P.admin.name)}</span>
      <button class="icon-btn" id="psettings" title="Yordam kontakti">${icon('life-buoy')}</button>
      <button class="icon-btn" id="pw" title="Parol">${icon('key-round')}</button>
      <button class="icon-btn" id="logout" title="Chiqish">${icon('log-out')}</button></header>
  <main class="pmain">
    ${P.admin.default_password ? `<div class="notice red">${icon('triangle-alert', 18)} Siz standart parol bilan kirdingiz. <a href="#" id="pw2">Hoziroq parolni o'zgartiring</a>.</div>` : ''}
    <div class="kpis">
      ${kpiP('Bizneslar', P.tenants.length, `${active.length} faol`, 'store')}
      ${kpiP('Oylik tushum (reja)', money(active.reduce((s, t) => s + (t.monthly_fee || 0), 0)), '', 'coins', 'good')}
      ${kpiP("To'lov yaqin / o'tgan", due.length, due.map((t) => esc(t.name)).join(', '), 'calendar', due.length ? 'bad' : '')}
      ${kpiP('Bloklangan', P.tenants.length - active.length, '', 'ban')}
    </div>
    <div class="ptools">
      <input type="search" id="psearch" placeholder="Qidirish: nomi, kod, telefon" value="${esc(P.search)}">
      <div class="seg">${[['all', 'Hammasi'], ...types.map((k) => [k, typeName(k)]), ['blocked', 'Bloklangan']].map(([k, n]) => `<button class="${P.filter === k ? 'active' : ''}" data-filter="${k}">${n}</button>`).join('')}</div>
      <button class="btn primary" id="add">${icon('plus', 18)} Yangi biznes</button>
    </div>
    ${list.length ? `<div class="tgrid">${list.map(tenantCard).join('')}</div>`
      : `<div class="card">${emptyState('store', P.tenants.length ? 'Hech narsa topilmadi' : "Hali biznes qo'shilmagan. \"Yangi biznes\" tugmasini bosing.")}</div>`}
    <p class="muted small" style="margin-top:16px">Har bir biznesning ma'lumotlari alohida faylda saqlanadi va har kuni avtomatik zaxiralanadi.
      Xodimlar kirishi uchun: <b>${esc(location.origin)}/c/&lt;kod&gt;</b></p>
  </main>`;
}
function kpiP(label, value, sub, ic, cls = '') {
  return `<div class="kpi ${cls}"><div class="kpi-ic">${icon(ic, 22)}</div><div><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
}
function emptyState(ic, text) { return `<div class="empty">${icon(ic, 56)}<div>${text}</div></div>`; }

async function load() {
  [P.tenants, P.modules, P.types, { release: P.release }] = await Promise.all([GET('/api/platform/tenants'), GET('/api/platform/modules'), GET('/api/platform/types'), GET('/api/platform/release')]);
}

// ---------- Forms ----------
const KITCHEN_MODES = { full: "To'liq: oshpaz qabul qiladi → tayyor → ofitsantga xabar", notify: "Faqat xabar: oshxona ko'radi/chop etadi, qabul qilish shart emas", off: "O'chiq: oshxonaga hech narsa bormaydi" };
const TYPE_DEFAULTS = { choyxona: ['full', []], restoran: ['full', []], fastfood: ['notify', ['reservations']], market: ['off', ['reservations']], clothing: ['off', ['reservations']] };

function typeSelect(cur = 'choyxona') {
  return `<label class="field">Biznes turi<select name="business_type">${Object.entries(P.types).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
}
function kitchenModeHtml(mode = 'full') {
  return `<label class="field">Oshxona rejimi<select name="kitchen_mode">${Object.entries(KITCHEN_MODES)
    .map(([k, v]) => `<option value="${k}" ${mode === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
}
function modulesHtml(disabled = []) {
  return `<h3 class="ph3">${icon('layers', 18)} Bo'limlar (paket)</h3>
    <p class="small muted" style="margin:0 0 8px">Belgini olib tashlasangiz, shu biznesda o'sha bo'lim yopiladi. Sotuv, menyu, kassa va xodimlar doim ishlaydi.</p>
    <div class="row" style="margin-bottom:8px"><button type="button" class="btn sm" data-mods="all">Hammasi</button><button type="button" class="btn sm" data-mods="none">Faqat asosiy</button></div>
    <div class="form-grid">${Object.entries(P.modules).map(([k, n]) => `<label class="check"><input type="checkbox" name="mod_${k}" ${disabled.includes(k) ? '' : 'checked'}> ${esc(n)}</label>`).join('')}</div>`;
}
function supportHtml(s = {}) {
  return `<h3 class="ph3">${icon('life-buoy', 18)} Yordam kontakti</h3>
    <p class="small muted" style="margin:0 0 8px">Bo'sh qolsa, umumiy kontakt (yuqoridagi ${icon('life-buoy', 13)} tugma) ko'rsatiladi.</p>
    <div class="form-grid"><label class="field">Matn<input name="support_text" value="${esc(s.text || '')}" placeholder="To'lov va yordam: @flowi_support"></label>
      <label class="field">Havola (ixtiyoriy)<input name="support_link" value="${esc(s.link || '')}" placeholder="https://t.me/flowi_bot"></label></div>`;
}
function bindModules(form) {
  form.querySelectorAll('[data-mods]').forEach((b) => b.onclick = () => {
    form.querySelectorAll('input[name^="mod_"]').forEach((c) => { c.checked = b.dataset.mods === 'all'; });
  });
}
function bindTypeDefaults(form) {
  form.business_type.addEventListener('change', () => {
    const [mode, off] = TYPE_DEFAULTS[form.business_type.value] || TYPE_DEFAULTS.choyxona;
    form.kitchen_mode.value = mode;
    form.querySelectorAll('input[name^="mod_"]').forEach((c) => { c.checked = !off.includes(c.name.slice(4)); });
  });
}
function readForm(d) {
  d.disabled_modules = Object.keys(P.modules).filter((k) => !d[`mod_${k}`]);
  for (const k of Object.keys(P.modules)) delete d[`mod_${k}`];
  d.support = { text: d.support_text || '', link: d.support_link || '' };
  delete d.support_text; delete d.support_link;
  d.paid_until = dateEndTs(d.paid_until);
  d.monthly_fee = Number(d.monthly_fee) || 0;
  return d;
}

// ---------- Render ----------
async function render() {
  applyThemeP();
  const app = document.getElementById('app');
  if (!P.admin) {
    app.innerHTML = loginHtml();
    const f = app.querySelector('#plogin');
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await POST('/api/platform/login', formData(f));
        App.token = r.token; store(TOKEN_KEY, r.token); P.admin = r.admin;
        await load(); render();
      } catch (err) { toastError(err); }
    };
    return;
  }
  const active = document.activeElement && document.activeElement.id === 'psearch';
  app.innerHTML = `<div class="platform">${mainHtml()}</div>`;
  bind(app);
  if (active) { const s = app.querySelector('#psearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}

function applyThemeP() {
  const t = store('cp_theme') || 'light';
  if (t === 'dark') document.documentElement.dataset.theme = 'dark';
  else document.documentElement.removeAttribute('data-theme');
}

async function reload() {
  try { await load(); render(); } catch (e) { toastError(e); }
}

function bind(root) {
  const byId = (id) => P.tenants.find((t) => t.id === Number(id));
  root.querySelector('#logout').onclick = async () => { try { await POST('/api/platform/logout'); } catch { /* ignore */ } endSession(); };
  const pw = () => openModal({
    title: `${icon('key-round')} Parolni o'zgartirish`,
    body: `<div class="stack"><label class="field">Eski parol<input type="password" name="old_password" required></label>
      <label class="field">Yangi parol (kamida 8 belgi)<input type="password" name="new_password" required minlength="8"></label></div>`,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
      await PUT('/api/platform/me/password', formData(f));
      P.admin.default_password = false; toast("Parol o'zgartirildi", 'ok'); render();
    } }],
  });
  root.querySelector('#pw').onclick = pw;
  const pw2 = root.querySelector('#pw2');
  if (pw2) pw2.onclick = (e) => { e.preventDefault(); pw(); };
  root.querySelector('#psettings').onclick = platformSettings;
  const s = root.querySelector('#psearch');
  s.oninput = () => { P.search = s.value; render(); };
  root.querySelectorAll('[data-filter]').forEach((b) => b.onclick = () => { P.filter = b.dataset.filter; render(); });
  root.querySelector('#add').onclick = () => addTenant();
  root.querySelectorAll('[data-imp]').forEach((b) => b.onclick = () => impersonate(byId(b.dataset.imp)));
  root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editTenant(byId(b.dataset.edit)));
  root.querySelectorAll('[data-term]').forEach((b) => b.onclick = () => termDialog(byId(b.dataset.term)));
  root.querySelectorAll('[data-more]').forEach((b) => b.onclick = () => moreMenu(byId(b.dataset.more)));
}

// Subscription term: add or take away days, a week (e.g. a bonus), months or a year, or pick the date.
const TERM_STEPS = [['-m1', '−1 oy'], ['-d7', '−1 hafta'], ['-d1', '−1 kun'], ['+d1', '+1 kun'], ['+d7', '+1 hafta'], ['+m1', '+1 oy'], ['+m3', '+3 oy'], ['+m6', '+6 oy'], ['+m12', '+1 yil']];
function termDialog(t) {
  let until = t.paid_until || null;
  const form = openModal({
    title: `${icon('calendar')} ${esc(t.name)} — to'lov muddati`,
    body: `<p class="lead" id="term-now"></p>
      <div class="term-steps">${TERM_STEPS.map(([k, n]) => `<button type="button" class="btn ${k[0] === '-' ? 'red-text' : ''}" data-step="${k}">${n}</button>`).join('')}</div>
      <label class="field" style="margin-top:12px">Yoki sanani tanlang<input type="date" name="date"></label>
      <label class="field" style="margin-top:12px">Oylik narx (so'm)<input type="number" name="monthly_fee" min="0" value="${t.monthly_fee || 0}"></label>
      <p class="small muted" style="margin-top:8px">Qo'shish bugundan yoki joriy muddatdan (qaysi biri keyin bo'lsa) hisoblanadi. Masalan, bonus uchun "+1 hafta".</p>`,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
      await PUT(`/api/platform/tenants/${t.id}`, { paid_until: until, monthly_fee: Number(f.monthly_fee.value) || 0 });
      toast(until ? `${t.name}: ${fmtDate(until)} gacha` : `${t.name}: muddatsiz`, 'ok'); reload();
    } }],
  });
  const show = () => {
    const d = until ? Math.floor((until - Date.now()) / DAY_MS) : null;
    form.querySelector('#term-now').innerHTML = until
      ? `Muddat: <b>${fmtDate(until)}</b> gacha <span class="${d < 0 ? 'red' : 'muted'}">(${d < 0 ? `${-d} kun o'tgan` : `${d} kun qoldi`})</span>`
      : 'Muddat belgilanmagan';
    form.date.value = until ? isoDate(until) : '';
  };
  form.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
    const k = b.dataset.step;
    const sign = k[0] === '-' ? -1 : 1;
    const n = Number(k.slice(2)) * sign;
    // Adding counts from today if the term already ran out; taking away counts from the current end.
    const base = new Date(sign > 0 ? Math.max(Date.now(), until || 0) : (until || Date.now()));
    if (k[1] === 'm') base.setMonth(base.getMonth() + n); else base.setDate(base.getDate() + n);
    base.setHours(23, 59, 0, 0);
    until = base.getTime();
    show();
  });
  form.date.onchange = () => { until = dateEndTs(form.date.value); show(); };
  show();
}

function moreMenu(t) {
  const acts = [
    ['copy', 'link', 'Kirish havolasini nusxalash'],
    ['reset', 'key-round', 'Boshliq parolini tiklash'],
    ['backups', 'database', 'Zaxiradan tiklash'],
    t.status === 'active' ? ['block', 'ban', 'Bloklash'] : ['unblock', 'circle-check', 'Faollashtirish'],
  ];
  const form = openModal({ title: `${icon(TYPE_ICONS[t.business_type] || 'store')} ${esc(t.name)}`,
    body: `<div class="stack">${acts.map(([k, ic, n]) => `<button type="button" class="btn lg block ${k === 'block' ? 'red-text' : ''}" data-act="${k}" style="justify-content:flex-start">${icon(ic)} ${n}</button>`).join('')}</div>` });
  form.querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => {
    closeModal();
    const k = b.dataset.act;
    if (k === 'copy') {
      const url = siteUrl(t.code);
      try { await navigator.clipboard.writeText(url); toast(`Nusxa olindi: ${url}`, 'ok'); } catch { prompt('Havola:', url); }
    } else if (k === 'reset') resetOwner(t);
    else if (k === 'backups') backups(t);
    else if (k === 'block') {
      if (!(await confirmModal('Bloklash', `"${esc(t.name)}" bloklansinmi? Barcha xodimlari darhol tizimdan chiqariladi. Ma'lumotlar o'chmaydi.`, 'Bloklash'))) return;
      try { await PUT(`/api/platform/tenants/${t.id}`, { status: 'blocked' }); reload(); } catch (e) { toastError(e); }
    } else if (k === 'unblock') {
      try { await PUT(`/api/platform/tenants/${t.id}`, { status: 'active' }); reload(); } catch (e) { toastError(e); }
    }
  });
}

// Opens the business in a new tab with the boss's screens; the visit is written to its history.
async function impersonate(t) {
  const tab = window.open('about:blank', '_blank');
  try {
    const r = await POST(`/api/platform/tenants/${t.id}/impersonate`);
    const url = `${location.origin}/c/${r.code}#/imp/${r.token}`;
    if (tab) tab.location = url; else location.href = url;
  } catch (e) { if (tab) tab.close(); toastError(e); }
}

function addTenant() {
  const form = openModal({
    title: `${icon('plus')} Yangi biznes`, size: 'wide',
    body: `<div class="form-grid">
      ${typeSelect()}
      <label class="field">Nomi<input name="name" required placeholder="Navro'z choyxonasi"></label>
      <label class="field">Kod (kirish havolasi uchun)<input name="code" required placeholder="navruz" autocapitalize="none"></label>
      <label class="field">Boshliq ismi<input name="owner_name" required placeholder="Akmal aka"></label>
      <label class="field">Telefon<input name="phone" type="tel" value="+998 "></label>
      <label class="field">Boshliq logini<input name="owner_username" required autocapitalize="none" value="boshliq"></label>
      <label class="field">Boshliq paroli<input name="owner_password" required value="${randomPassword()}"></label>
      <label class="field">To'langan muddat (gacha)<input type="date" name="paid_until" value="${isoDate(Date.now() + 30 * DAY_MS)}"></label>
      <label class="field">Oylik narx (so'm)<input type="number" name="monthly_fee" min="0" value="300000"></label>
    </div>
    <p class="small muted" id="code-url" style="margin:8px 0 0"></p>
    <label class="check" style="margin-top:12px"><input type="checkbox" name="sample" checked> Namuna ma'lumotlar qo'shilsin (menyu yoki mahsulotlar; boshliq keyin o'zgartiradi)</label>
    <div style="margin-top:12px">${kitchenModeHtml()}</div>
    ${modulesHtml()}
    ${supportHtml()}
    <label class="field" style="margin-top:12px">Izoh (faqat sizga ko'rinadi)<textarea name="notes" rows="2"></textarea></label>`,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Yaratish', cls: 'primary', onClick: async (f) => {
      const d = readForm(formData(f));
      d.code = d.code.trim().toLowerCase();
      if (d.phone.trim() === '+998') d.phone = '';
      const t = await POST('/api/platform/tenants', d);
      await load(); render();
      showCredentials(t, d.owner_username, d.owner_password);
      return false;
    } }],
  });
  bindModules(form);
  bindTypeDefaults(form);
  let codeTouched = false;
  const showUrl = () => { form.querySelector('#code-url').textContent = form.code.value ? `Kirish havolasi: ${siteUrl(form.code.value.toLowerCase())}` : ''; };
  form.code.oninput = () => { codeTouched = true; showUrl(); };
  form.name.oninput = () => { if (!codeTouched) { form.code.value = slugify(form.name.value); showUrl(); } };
}

function editTenant(t) {
  const form = openModal({
    title: `${icon('pencil')} ${esc(t.name)}`, size: 'wide',
    body: `<div class="form-grid">
      ${typeSelect(t.business_type)}
      <label class="field">Nomi<input name="name" value="${esc(t.name)}" required></label>
      <label class="field">Boshliq ismi<input name="contact_name" value="${esc(t.contact_name || '')}"></label>
      <label class="field">Telefon<input name="phone" value="${esc(t.phone || '')}"></label>
      <label class="field">To'langan muddat (gacha)<input type="date" name="paid_until" value="${t.paid_until ? isoDate(t.paid_until) : ''}"></label>
      <label class="field">Oylik narx<input type="number" name="monthly_fee" min="0" value="${t.monthly_fee || 0}"></label>
    </div>
    <div style="margin-top:12px">${kitchenModeHtml(t.kitchen_mode)}</div>
    ${modulesHtml(t.disabled_modules)}
    ${supportHtml(t.support)}
    <label class="field" style="margin-top:12px">Izoh<textarea name="notes" rows="3">${esc(t.notes || '')}</textarea></label>
    <p class="small muted" style="margin-top:10px">Kod: <b>${esc(t.code)}</b> (o'zgartirilmaydi) · Yaratilgan: ${fmtDate(t.created_at)}<br>
      Menyu, xodimlar, xonalar va sozlamalarni o'zgartirish uchun kartadagi <b>Kirish</b> tugmasini bosing — biznes boshlig'i ko'radigan ekran ochiladi.</p>`,
    onMount: bindModules,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
      await PUT(`/api/platform/tenants/${t.id}`, readForm(formData(f)));
      toast('Saqlandi', 'ok'); reload();
    } }],
  });
  bindTypeDefaults(form);
}

function resetOwner(t) {
  openModal({
    title: `${icon('key-round')} ${esc(t.name)} — boshliq paroli`,
    body: `<p class="muted small">Boshliq parolini unutgan bo'lsa, yangi parol bering. Login bo'sh qolsa, asosiy boshliq (${esc((t.owners || [])[0] || '—')}) paroli tiklanadi.
      Yangi login yozsangiz va u mavjud bo'lmasa — yangi boshliq yaratiladi.</p>
      <div class="form-grid"><label class="field">Login (ixtiyoriy)<input name="username" autocapitalize="none" placeholder="${esc((t.owners || [])[0] || '')}"></label>
      <label class="field">Yangi parol<input name="password" required value="${randomPassword()}"></label></div>`,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Tiklash', cls: 'primary', onClick: async (f) => {
      const d = formData(f);
      const r = await POST(`/api/platform/tenants/${t.id}/reset-owner`, d);
      await load(); render();
      showCredentials(t, r.username, d.password);
      return false;
    } }],
  });
}

// Dated server copies of one business; any of them can be put back (the current state is saved first).
async function backups(t) {
  let list;
  try { list = await GET(`/api/platform/tenants/${t.id}/backups`); } catch (e) { return toastError(e); }
  const when = (s) => s.slice(0, 10).split('-').reverse().join('.') + ' ' + s.slice(11, 16).replace('-', ':');
  const form = openModal({
    title: `${icon('database')} ${esc(t.name)} — zaxiralar`, size: 'wide',
    body: `<p class="small muted">Server har kuni avtomatik nusxa oladi (oxirgi 30 kun). Tiklashdan oldin hozirgi holat ham alohida saqlanadi.</p>
      ${list.length ? `<div class="table-wrap"><table><tr><th>Sana</th><th>Turi</th><th class="right">Hajmi</th><th></th></tr>
        ${list.map((b, i) => `<tr><td><b>${when(b.stamp)}</b></td><td>${b.kind === 'daily' ? 'Kunlik' : 'Tiklashdan oldingi'}</td>
          <td class="right">${(b.size / 1024).toFixed(0)} KB</td><td class="actions"><button type="button" class="btn sm danger" data-restore="${i}">${icon('rotate-ccw', 16)} Tiklash</button></td></tr>`).join('')}</table></div>`
        : emptyState('database', "Hali zaxira yo'q. Birinchi nusxa server ishga tushgandan bir daqiqa keyin olinadi.")}`,
    actions: [{ label: 'Yopish', onClick: () => {} }],
  });
  form.querySelectorAll('[data-restore]').forEach((b) => b.onclick = async () => {
    const x = list[b.dataset.restore];
    closeModal();
    if (!(await confirmModal('Zaxiradan tiklash', `"${esc(t.name)}" ${when(x.stamp)} holatiga qaytarilsinmi? Shu vaqtdan keyingi o'zgarishlar alohida faylda saqlanib qoladi.`, 'Tiklash'))) return;
    try { await POST(`/api/platform/tenants/${t.id}/restore`, { stamp: x.stamp, kind: x.kind }); toast('Tiklandi', 'ok'); reload(); } catch (e) { toastError(e); }
  });
}

async function platformSettings() {
  let s;
  try { s = await GET('/api/platform/settings'); } catch (e) { return toastError(e); }
  openModal({
    title: `${icon('life-buoy')} Yordam kontakti`,
    body: `<p class="small muted">Har bir biznesning ish stoli va kirish sahifasida chiqadi (to'lov va yordam uchun). Telegram username yozsangiz (@...), bosilganda Telegram ochiladi.</p>
      <div class="stack"><label class="field">Matn<input name="support_text" value="${esc(s.support_text)}" placeholder="To'lov va yordam: @flowi_support"></label>
      <label class="field">Havola (ixtiyoriy)<input name="support_link" value="${esc(s.support_link)}" placeholder="https://t.me/flowi_bot"></label></div>`,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
      await PUT('/api/platform/settings', formData(f));
      toast('Saqlandi', 'ok');
    } }],
  });
}

(async function boot() {
  applyThemeP();
  App.token = store(TOKEN_KEY);
  App.settings = { currency: "so'm" };
  if (App.token) {
    try { P.admin = await GET('/api/platform/me'); await load(); } catch { App.token = null; P.admin = null; store(TOKEN_KEY, null); }
  }
  render();
})();
