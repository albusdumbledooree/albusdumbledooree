'use strict';
/* Platform panel for the site owner: create choyxonas, give each boss a login, track subscriptions. */

const P = { admin: null, tenants: [], search: '', modules: {} };
const DAY_MS = 24 * 60 * MIN;
const TOKEN_KEY = 'cp_ptoken';

// Overrides core.js: the platform session is stored separately from choyxona logins.
function logoutLocal() {
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

function daysLeft(t) { return t.paid_until ? Math.ceil((t.paid_until - Date.now()) / DAY_MS) : null; }

function credentialsText(t, username, password) {
  return `Choyxona Pro — ${t.name}\n\nKirish manzili: ${siteUrl(t.code)}\nChoyxona kodi: ${t.code}\nLogin: ${username}\nParol: ${password}\n\nBirinchi kirgandan keyin Sozlamalar bo'limida parolni o'zgartiring. Xodimlarni "Xodimlar" bo'limida o'zingiz qo'shasiz.`;
}

function showCredentials(t, username, password) {
  const text = credentialsText(t, username, password);
  openModal({
    title: '✅ Tayyor — boshliqqa yuboring',
    body: `<p class="muted small">Bu ma'lumotni Telegram yoki SMS orqali choyxona boshlig'iga yuboring. Parol boshqa ko'rsatilmaydi.</p>
      <textarea id="cred" rows="10" readonly style="font-family:monospace">${esc(text)}</textarea>`,
    actions: [{ label: '📋 Nusxa olish', cls: 'primary', onClick: async () => {
      try { await navigator.clipboard.writeText(text); toast('Nusxa olindi', 'ok'); } catch {
        const ta = document.getElementById('cred'); ta.select(); document.execCommand('copy'); toast('Nusxa olindi', 'ok');
      }
      return false;
    } }, { label: 'Yopish', onClick: () => {} }],
  });
}

// ---------- Screens ----------
function loginHtml() {
  return `<div class="login-wrap"><form class="card login" id="plogin">
    <div class="brand"><img src="/icon.svg" alt=""><div><b>Choyxona Pro</b><span>Platforma boshqaruvi</span></div></div>
    <div class="stack">
      <label class="field">Login<input name="username" autocomplete="username" autocapitalize="none" required></label>
      <label class="field">Parol<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn primary lg block">Kirish</button>
    </div>
    <p class="demo">Bu sahifa faqat sayt egasi uchun. Choyxona xodimlari <a href="/">bosh sahifadan</a> kiradi.</p>
  </form></div>`;
}

function tenantRow(t) {
  const d = daysLeft(t);
  const due = t.paid_until == null ? '<span class="muted">—</span>'
    : `<span style="color:${d < 0 ? 'var(--danger)' : d <= 5 ? 'var(--accent)' : 'inherit'}"><b>${fmtDate(t.paid_until)}</b><br><span class="small">${d < 0 ? `${-d} kun o'tdi` : `${d} kun qoldi`}</span></span>`;
  return `<tr style="${t.status === 'blocked' ? 'opacity:.6' : ''}">
    <td><b>${esc(t.name)}</b><br><span class="chip">${esc(t.code)}</span>
      <a class="small" href="${esc(siteUrl(t.code))}" target="_blank" rel="noopener">ochish ↗</a></td>
    <td>${esc(t.contact_name || '—')}<br><span class="small muted">${esc(t.phone || '')}</span>
      <br><span class="small muted">Login: ${(t.owners || []).map(esc).join(', ') || '—'}</span></td>
    <td>${t.status === 'active' ? '<span class="chip ready">Faol</span>' : '<span class="chip cancelled" style="text-decoration:none">Bloklangan</span>'}
      <br><span class="small muted" title="${esc((t.disabled_modules || []).map((m) => P.modules[m]).join(', '))}">Bo'limlar: ${Object.keys(P.modules).length - (t.disabled_modules || []).length}/${Object.keys(P.modules).length}</span></td>
    <td>${due}</td>
    <td class="right num">${t.monthly_fee ? money(t.monthly_fee) : '—'}</td>
    <td class="small">${t.error ? `<span style="color:var(--danger)">${esc(t.error)}</span>` : `👥 ${t.staff} xodim · 🏠 ${t.rooms} xona<br>
      🧾 ${t.orders_30d} chek / 30 kun<br>💰 ${money(t.sales_30d)}<br>
      <span class="muted">Oxirgi faollik: ${t.last_activity ? fmtDateTime(t.last_activity) : '—'}</span>`}</td>
    <td class="actions">
      <button class="btn sm" data-copy="${t.id}" title="Kirish havolasini nusxalash">🔗</button>
      <button class="btn sm" data-extend="${t.id}" title="To'lov muddatini 1 oyga uzaytirish">+1 oy</button>
      <button class="btn sm" data-edit="${t.id}" title="Tahrirlash">✏️</button>
      <button class="btn sm" data-reset="${t.id}" title="Boshliq parolini tiklash">🔑</button>
      ${t.status === 'active' ? `<button class="btn sm danger-text" data-block="${t.id}">⛔ Bloklash</button>` : `<button class="btn sm ok" data-unblock="${t.id}">✅ Faollashtirish</button>`}
    </td></tr>`;
}

function mainHtml() {
  const list = P.tenants.filter((t) => !P.search || `${t.name} ${t.code} ${t.contact_name} ${t.phone}`.toLowerCase().includes(P.search.toLowerCase()));
  const active = P.tenants.filter((t) => t.status === 'active');
  const due = active.filter((t) => { const d = daysLeft(t); return d !== null && d <= 5; });
  return `<div class="main" style="max-width:1400px;margin:0 auto">
    <div class="page-head"><img src="/icon.svg" alt="" style="width:36px"><h1>Choyxona Pro · Platforma</h1><span class="spacer"></span>
      <span class="muted small">${esc(P.admin.name)}</span>
      <button class="btn sm" id="pw">🔒 Parol</button><button class="btn sm" id="logout">Chiqish</button></div>
    ${P.admin.default_password ? `<div class="toast error" style="margin-bottom:14px">⚠ Siz standart parol bilan kirdingiz. Xavfsizlik uchun <a href="#" id="pw2">hoziroq parolni o'zgartiring</a>.</div>` : ''}
    <div class="kpis">
      <div class="kpi prime"><div class="label">Choyxonalar</div><div class="value">${P.tenants.length}</div><div class="sub">${active.length} faol</div></div>
      <div class="kpi good"><div class="label">Oylik tushum (reja)</div><div class="value">${money(active.reduce((s, t) => s + (t.monthly_fee || 0), 0))}</div></div>
      <div class="kpi ${due.length ? 'bad' : ''}"><div class="label">To'lov muddati yaqin / o'tgan</div><div class="value">${due.length}</div>
        <div class="sub">${due.map((t) => esc(t.name)).join(', ')}</div></div>
      <div class="kpi"><div class="label">Bloklangan</div><div class="value">${P.tenants.length - active.length}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Choyxonalar</h2><span class="spacer"></span>
        <input type="search" id="psearch" placeholder="🔎 Qidirish..." value="${esc(P.search)}" style="max-width:240px">
        <button class="btn primary" id="add">➕ Yangi choyxona</button></div>
      ${list.length ? `<div class="table-wrap"><table>
        <tr><th>Choyxona</th><th>Boshliq</th><th>Holat</th><th>To'langan muddat</th><th class="right">Oylik narx</th><th>Faollik</th><th></th></tr>
        ${list.map(tenantRow).join('')}</table></div>`
      : emptyStateP('🏪', P.tenants.length ? 'Hech narsa topilmadi' : "Hali choyxona qo'shilmagan. \"Yangi choyxona\" tugmasini bosing.")}
    </div>
    <p class="muted small" style="margin-top:14px">Har bir choyxonaning ma'lumotlari alohida faylda saqlanadi va boshqalariga ko'rinmaydi.
      Xodimlar kirish uchun: <b>${esc(location.origin)}/c/&lt;kod&gt;</b> havolasini ochadi yoki bosh sahifada choyxona kodini yozadi.</p>
  </div>`;
}
function emptyStateP(icon, text) { return `<div class="empty"><span class="big">${icon}</span>${text}</div>`; }

async function load() {
  [P.tenants, P.modules] = await Promise.all([GET('/api/platform/tenants'), GET('/api/platform/modules')]);
}

// Checkboxes: ticked = the section is on for this choyxona.
function modulesHtml(disabled = []) {
  return `<h3 style="margin-top:14px">Bo'limlar (paket)</h3>
    <p class="small muted" style="margin:0 0 8px">Belgini olib tashlasangiz, bu choyxonada o'sha bo'lim yopiladi. Xonalar, buyurtma, menyu, kassa va xodimlar doim ishlaydi.</p>
    <div class="row" style="margin-bottom:8px"><button type="button" class="btn sm" data-mods="all">Hammasi</button><button type="button" class="btn sm" data-mods="none">Faqat asosiy</button></div>
    <div class="form-grid">${Object.entries(P.modules).map(([k, n]) => `<label class="check"><input type="checkbox" name="mod_${k}" ${disabled.includes(k) ? '' : 'checked'}> ${esc(n)}</label>`).join('')}</div>`;
}
function bindModules(form) {
  form.querySelectorAll('[data-mods]').forEach((b) => b.onclick = () => {
    form.querySelectorAll('input[name^="mod_"]').forEach((c) => { c.checked = b.dataset.mods === 'all'; });
  });
}
function readModules(d) {
  const off = Object.keys(P.modules).filter((k) => !d[`mod_${k}`]);
  for (const k of Object.keys(P.modules)) delete d[`mod_${k}`];
  return off;
}

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
  const focusSearch = document.activeElement && document.activeElement.id === 'psearch';
  app.innerHTML = mainHtml();
  bind(app);
  if (focusSearch) { const s = app.querySelector('#psearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}

function applyThemeP() {
  const t = store('cp_theme') || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}

async function reload() {
  try { await load(); render(); } catch (e) { toastError(e); }
}

function bind(root) {
  const byId = (id) => P.tenants.find((t) => t.id === Number(id));
  root.querySelector('#logout').onclick = async () => { try { await POST('/api/platform/logout'); } catch { /* ignore */ } logoutLocal(); };
  const pw = () => openModal({
    title: "Parolni o'zgartirish",
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
  const s = root.querySelector('#psearch');
  s.oninput = () => { P.search = s.value; render(); };
  root.querySelector('#add').onclick = () => addTenant();

  root.querySelectorAll('[data-copy]').forEach((b) => b.onclick = async () => {
    const url = siteUrl(byId(b.dataset.copy).code);
    try { await navigator.clipboard.writeText(url); toast(`Nusxa olindi: ${url}`, 'ok'); } catch { prompt('Havola:', url); }
  });
  root.querySelectorAll('[data-extend]').forEach((b) => b.onclick = async () => {
    const t = byId(b.dataset.extend);
    const base = new Date(Math.max(Date.now(), t.paid_until || 0));
    base.setMonth(base.getMonth() + 1);
    try { await PUT(`/api/platform/tenants/${t.id}`, { paid_until: base.getTime() }); toast(`${t.name}: ${fmtDate(base)} gacha uzaytirildi`, 'ok'); reload(); } catch (e) { toastError(e); }
  });
  root.querySelectorAll('[data-block]').forEach((b) => b.onclick = async () => {
    const t = byId(b.dataset.block);
    if (!(await confirmModal('Bloklash', `"${esc(t.name)}" bloklansinmi? Barcha xodimlari darhol tizimdan chiqariladi. Ma'lumotlar o'chmaydi.`, 'Bloklash'))) return;
    try { await PUT(`/api/platform/tenants/${t.id}`, { status: 'blocked' }); reload(); } catch (e) { toastError(e); }
  });
  root.querySelectorAll('[data-unblock]').forEach((b) => b.onclick = async () => {
    try { await PUT(`/api/platform/tenants/${b.dataset.unblock}`, { status: 'active' }); reload(); } catch (e) { toastError(e); }
  });
  root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editTenant(byId(b.dataset.edit)));
  root.querySelectorAll('[data-reset]').forEach((b) => b.onclick = () => resetOwner(byId(b.dataset.reset)));
}

function addTenant() {
  const form = openModal({
    title: 'Yangi choyxona', wide: true,
    body: `<div class="form-grid">
      <label class="field">Choyxona nomi<input name="name" required placeholder="Navro'z choyxonasi"></label>
      <label class="field">Kod (kirish havolasi uchun)<input name="code" required placeholder="navruz" autocapitalize="none"></label>
      <label class="field">Boshliq ismi<input name="owner_name" required placeholder="Akmal aka"></label>
      <label class="field">Telefon<input name="phone" type="tel" value="+998 "></label>
      <label class="field">Boshliq logini<input name="owner_username" required autocapitalize="none" value="boshliq"></label>
      <label class="field">Boshliq paroli<input name="owner_password" required value="${randomPassword()}"></label>
      <label class="field">To'langan muddat (gacha)<input type="date" name="paid_until" value="${isoDate(Date.now() + 30 * DAY_MS)}"></label>
      <label class="field">Oylik narx (so'm)<input type="number" name="monthly_fee" min="0" value="300000"></label>
    </div>
    <p class="small muted" id="code-url" style="margin:8px 0 0"></p>
    <label class="check" style="margin-top:12px"><input type="checkbox" name="sample" checked> Namuna menyu va xonalar qo'shilsin (boshliq keyin o'zgartiradi)</label>
    ${modulesHtml()}
    <label class="field" style="margin-top:12px">Izoh (faqat sizga ko'rinadi)<textarea name="notes" rows="2"></textarea></label>`,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Yaratish', cls: 'primary', onClick: async (f) => {
      const d = formData(f);
      d.paid_until = dateEndTs(d.paid_until);
      d.monthly_fee = Number(d.monthly_fee) || 0;
      d.code = d.code.trim().toLowerCase();
      if (d.phone.trim() === '+998') d.phone = '';
      d.disabled_modules = readModules(d);
      const t = await POST('/api/platform/tenants', d);
      await load(); render();
      showCredentials(t, d.owner_username, d.owner_password);
      return false;
    } }],
  });
  bindModules(form);
  let codeTouched = false;
  const showUrl = () => { form.querySelector('#code-url').textContent = form.code.value ? `Kirish havolasi: ${siteUrl(form.code.value.toLowerCase())}` : ''; };
  form.code.oninput = () => { codeTouched = true; showUrl(); };
  form.name.oninput = () => { if (!codeTouched) { form.code.value = slugify(form.name.value); showUrl(); } };
}

function editTenant(t) {
  openModal({
    title: `${t.name} — tahrirlash`,
    body: `<div class="form-grid">
      <label class="field">Nomi<input name="name" value="${esc(t.name)}" required></label>
      <label class="field">Boshliq ismi<input name="contact_name" value="${esc(t.contact_name || '')}"></label>
      <label class="field">Telefon<input name="phone" value="${esc(t.phone || '')}"></label>
      <label class="field">To'langan muddat (gacha)<input type="date" name="paid_until" value="${t.paid_until ? isoDate(t.paid_until) : ''}"></label>
      <label class="field">Oylik narx<input type="number" name="monthly_fee" min="0" value="${t.monthly_fee || 0}"></label>
    </div><label class="field" style="margin-top:12px">Izoh<textarea name="notes" rows="3">${esc(t.notes || '')}</textarea></label>
    ${modulesHtml(t.disabled_modules)}
    <p class="small muted">Kod: <b>${esc(t.code)}</b> (o'zgartirilmaydi) · Yaratilgan: ${fmtDate(t.created_at)}</p>`,
    wide: true,
    onMount: bindModules,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
      const d = formData(f);
      d.paid_until = dateEndTs(d.paid_until);
      d.monthly_fee = Number(d.monthly_fee) || 0;
      d.disabled_modules = readModules(d);
      await PUT(`/api/platform/tenants/${t.id}`, d);
      toast('Saqlandi', 'ok'); reload();
    } }],
  });
}

function resetOwner(t) {
  openModal({
    title: `🔑 ${t.name} — boshliq parolini tiklash`,
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

(async function boot() {
  applyThemeP();
  App.token = store(TOKEN_KEY);
  App.settings = { currency: "so'm" };
  if (App.token) {
    try { P.admin = await GET('/api/platform/me'); await load(); } catch { App.token = null; P.admin = null; store(TOKEN_KEY, null); }
  }
  render();
})();
