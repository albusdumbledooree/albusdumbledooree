'use strict';
/* Platform panel for the site owner: create businesses, give each boss a login, track subscriptions,
   open any business as its boss, restore it from a backup, set the support contact. */

const P = { admin: null, tenants: [], search: '', filter: 'all', modules: {}, types: {}, plans: {}, terms: {}, tab: 'biz', leads: null, leadStatus: '', leadQ: '', tg: {} };
const DAY_MS = 24 * 60 * MIN;
const TOKEN_KEY = 'cp_ptoken';
const TYPE_ICONS = { choyxona: 'house', restoran: 'utensils', fastfood: 'sandwich', market: 'shopping-cart', clothing: 'shirt', doors: 'door-open' };

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
const PLAN_KEYS = ['start', 'biznes', 'pro'];
function planName(k) { return (P.plans[k] || {}).name || k; }
function staffLimit(n) { return n > 0 ? `${n} tagacha` : 'cheksiz'; }

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
    <p class="small muted" style="margin-top:14px">Bu sahifa faqat sayt egasi uchun. Bizneslar o'z havolasi orqali kiradi: <b>/c/&lt;kod&gt;</b>.</p>
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
      <span>${icon('star', 15)}</span><span><span class="chip plan-${esc(t.plan_info.key)}">${esc(t.plan_info.name)}</span>${t.is_branch ? ' <span class="chip">Filial</span>' : ''}${branchNote(t)}
        · <b>${money(t.plan_info.fee)}</b>/oy${t.monthly_fee ? ' <span class="small muted">(maxsus narx)</span>' : ''}
        ${t.plan_info.max_staff > 0 && !t.error ? `<br><span class="small ${t.staff - (t.owners || []).length >= t.plan_info.max_staff ? 'warn' : 'muted'}">Xodimlar: ${t.staff - (t.owners || []).length}/${t.plan_info.max_staff}</span>` : ''}</span>
      ${t.shared && t.shared.length ? `<span>${icon('triangle-alert', 15)}</span><span class="small warn" title="Oxirgi 7 kunda bu hisoblar band paytida boshqa qurilmadan ochilgan">Hisob almashib ishlatilyapti: ${t.shared.map((x) => `${esc(x.name)} (${x.c} marta)`).join(', ')}</span>` : ''}
      <span>${icon('calendar', 15)}</span><span>${due}${t.plan_info.read_only ? ' <span class="chip red">Faqat ko\'rish</span>' : ''}</span>
      <span>${icon('layers', 15)}</span><span class="small">Bo'limlar: ${t.plan_info.modules.filter((m) => !(t.disabled_modules || []).includes(m)).length}/${mods} · Oshxona: ${esc({ full: "to'liq", notify: 'xabar', off: "o'chiq" }[t.kitchen_mode] || t.kitchen_mode)}</span>
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
  return `<header class="ptop">${flowiLogo(22)}<b class="hide-xs">Platforma</b>${P.release ? `<span class="chip">v${esc(P.release)}</span>` : ''}<span class="grow"></span>
      <span class="muted small hide-xs">${esc(P.admin.name)}</span>
      <button class="btn sm" id="pplans" title="Tariflar va narxlar">${icon('star', 16)} <span class="hide-xs">Tariflar</span></button>
      <button class="icon-btn ${P.tg.chat_id ? '' : 'warn-dot'}" id="ptg" title="Telegram bot (arizalar)">${icon('send')}</button>
      <button class="icon-btn" id="psettings" title="Yordam kontakti">${icon('life-buoy')}</button>
      <button class="icon-btn" id="pw" title="Parol">${icon('key-round')}</button>
      <button class="icon-btn" id="logout" title="Chiqish">${icon('log-out')}</button></header>
  <main class="pmain">
    <div class="seg ptabs"><button class="${P.tab === 'biz' ? 'active' : ''}" data-tab="biz">${icon('store', 16)} Bizneslar</button>
      <button class="${P.tab === 'leads' ? 'active' : ''}" data-tab="leads">${icon('inbox', 16)} Arizalar${P.leads && P.leads.counts.new ? ` <span class="badge">${P.leads.counts.new}</span>` : ''}</button></div>
    ${P.tab === 'leads' ? leadsHtml() : bizHtml()}
  </main>`;
}
function bizHtml() {
  const q = P.search.toLowerCase();
  const list = P.tenants.filter((t) => (P.filter === 'all' || t.business_type === P.filter || (P.filter === 'blocked' && t.status === 'blocked'))
    && (!q || `${t.name} ${t.code} ${t.contact_name} ${t.phone}`.toLowerCase().includes(q)));
  const active = P.tenants.filter((t) => t.status === 'active');
  const due = active.filter((t) => { const d = daysLeft(t); return d !== null && d <= 5; });
  const types = [...new Set(P.tenants.map((t) => t.business_type))];
  return `
    ${P.admin.default_password ? `<div class="notice red">${icon('triangle-alert', 18)} Siz standart parol bilan kirdingiz. <a href="#" id="pw2">Hoziroq parolni o'zgartiring</a>.</div>` : ''}
    <div class="kpis">
      ${kpiP('Bizneslar', P.tenants.length, `${active.length} faol`, 'store')}
      ${kpiP('Oylik tushum (reja)', money(active.reduce((s, t) => s + t.plan_info.fee, 0)), PLAN_KEYS.map((k) => `${planName(k)}: ${active.filter((t) => t.plan_info.key === k).length}`).join(' · '), 'coins', 'good')}
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
      Xodimlar kirishi uchun: <b>${esc(location.origin)}/c/&lt;kod&gt;</b></p>`;
}

// ---------- Applications from the front page ----------
const LEAD_CLS = { new: 'blue', called: 'orange', connected: 'green', rejected: '' };
function leadsHtml() {
  const L = P.leads;
  if (!L) return `<div class="card">${emptyState('inbox', 'Yuklanmoqda…')}</div>`;
  const c = L.counts;
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const conv = total ? Math.round((c.connected / total) * 100) : 0;
  const tgWarn = !P.tg.chat_id
    ? `<div class="notice">${icon('send', 18)} Telegram bot ulanmagan — arizalar shu yerda saqlanadi, lekin xabar kelmaydi. <a href="#" id="tg-link">Botni ulash</a></div>`
    : L.unsent ? `<div class="notice red">${icon('triangle-alert', 18)} ${L.unsent} ta ariza Telegramga hali yetib bormadi — server qayta urinib turibdi.${P.tg.error ? ` (${esc(P.tg.error)})` : ''}</div>` : '';
  return `${tgWarn}
    <div class="kpis">
      ${kpiP('Yangi arizalar', c.new, "hali qo'ng'iroq qilinmagan", 'inbox', c.new ? 'bad' : '')}
      ${kpiP('Shu oy', L.month, `jami ${total} ta`, 'calendar')}
      ${kpiP('Ulandi', c.connected, `${conv}% arizadan mijoz chiqdi`, 'circle-check', 'good')}
      ${kpiP("Qo'ng'iroq qilindi", c.called, `rad etildi: ${c.rejected}`, 'phone')}
    </div>
    ${L.sources.length ? `<div class="card" style="margin-bottom:14px"><b>${icon('link', 16)} Arizalar qayerdan kelyapti</b>
      <div class="lead-src">${L.sources.map((x) => `<span class="chip">${esc(x.source)}: <b>${x.c}</b>${x.won ? ` · ✅ ${x.won}` : ''}</span>`).join('')}</div>
      <p class="small muted" style="margin:8px 0 0">Reklamada havolaga belgi qo'ying: <b>${esc(location.origin)}/?from=instagram</b>, <b>?from=telegram</b>, <b>?from=banner</b> — shu yerda ko'rinadi.</p></div>` : ''}
    <div class="ptools">
      <input type="search" id="lsearch" placeholder="Qidirish: ism, telefon, biznes, shahar" value="${esc(P.leadQ)}">
      <div class="seg">${[['', 'Hammasi'], ...Object.entries(L.statuses)].map(([k, n]) => `<button class="${P.leadStatus === k ? 'active' : ''}" data-lstatus="${k}">${n}${k ? ` (${c[k]})` : ''}</button>`).join('')}</div>
    </div>
    ${L.rows.length ? `<div class="tgrid">${L.rows.map(leadCard).join('')}</div>`
      : `<div class="card">${emptyState('inbox', total ? 'Hech narsa topilmadi' : `Hali ariza yo'q. Bosh sahifadagi anketa: <a href="/#boglanish" target="_blank" rel="noopener">${esc(location.host)}</a>`)}</div>`}`;
}
// +998901234567 → +998 90 123 45 67
function fmtPhone(p) { const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(p || ''); return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p; }
function leadCard(l) {
  const L = P.leads;
  const tenant = l.tenant_id && P.tenants.find((t) => t.id === l.tenant_id);
  const plan = l.plan ? planName(l.plan) : '';
  return `<article class="tcard lead ${l.status}">
    <header><span class="tc-ic">${icon('user-round', 22)}</span>
      <div class="grow"><b>${esc(l.name)}</b><span class="small muted">#${l.id} · ${fmtDateTime(l.created_at)}</span></div>
      <span class="chip ${LEAD_CLS[l.status]}">${esc(L.statuses[l.status])}</span></header>
    <div class="tc-rows">
      <span>${icon('phone', 15)}</span><span><a href="tel:${esc(l.phone)}"><b>${esc(fmtPhone(l.phone))}</b></a>${l.call_time ? ` <span class="small muted">· qulay vaqt ${esc(l.call_time)}</span>` : ''}</span>
      ${l.business || l.type || l.city || l.staff ? `<span>${icon('store', 15)}</span><span>${[l.business && `<b>${esc(l.business)}</b>`, l.type && esc(L.types[l.type] || l.type), l.city && esc(l.city), l.staff ? `${l.staff} xodim` : ''].filter(Boolean).join(' · ')}</span>` : ''}
      ${plan ? `<span>${icon('star', 15)}</span><span>Tarif: <b>${esc(plan)}</b></span>` : ''}
      ${l.note ? `<span>${icon('message-square', 15)}</span><span>${esc(l.note)}</span>` : ''}
      ${l.source ? `<span>${icon('link', 15)}</span><span class="small muted">Manba: ${esc(l.source)}</span>` : ''}
      ${l.admin_note ? `<span>${icon('pencil', 15)}</span><span class="small"><i>${esc(l.admin_note)}</i></span>` : ''}
      ${tenant ? `<span>${icon('circle-check', 15)}</span><span class="small">Biznes: <b>${esc(tenant.name)}</b> (${esc(tenant.code)})</span>` : ''}
      ${!l.tg_sent && P.tg.chat_id ? `<span>${icon('clock', 15)}</span><span class="small warn">Telegramga yuborilishi kutilmoqda</span>` : ''}
    </div>
    <footer class="lead-foot">
      <select data-lst="${l.id}" class="lead-st">${Object.entries(L.statuses).map(([k, n]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <button class="btn sm" data-lnote="${l.id}">${icon('pencil', 16)} Izoh</button>
      ${tenant ? '' : `<button class="btn sm primary" data-lbiz="${l.id}" title="Shu arizadan biznes ochish">${icon('plus', 16)} Biznes ochish</button>`}
    </footer></article>`;
}
async function loadLeads() {
  const qs = new URLSearchParams({ status: P.leadStatus, q: P.leadQ });
  [P.leads, P.tg] = await Promise.all([GET(`/api/platform/leads?${qs}`), GET('/api/platform/telegram')]);
}
async function setLead(id, body) {
  try { await PUT(`/api/platform/leads/${id}`, body); await loadLeads(); render(); } catch (e) { toastError(e); }
}
function bindLeads(root) {
  const byId = (id) => P.leads.rows.find((l) => l.id === Number(id));
  const tl = root.querySelector('#tg-link');
  if (tl) tl.onclick = (e) => { e.preventDefault(); telegramDialog(); };
  const ls = root.querySelector('#lsearch');
  if (ls) {
    let tm = null;
    ls.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { P.leadQ = ls.value; try { await loadLeads(); render(); } catch (e) { toastError(e); } }, 350); };
  }
  root.querySelectorAll('[data-lstatus]').forEach((b) => b.onclick = async () => { P.leadStatus = b.dataset.lstatus; try { await loadLeads(); render(); } catch (e) { toastError(e); } });
  root.querySelectorAll('[data-lst]').forEach((sel) => sel.onchange = () => setLead(sel.dataset.lst, { status: sel.value }));
  root.querySelectorAll('[data-lnote]').forEach((b) => b.onclick = () => {
    const l = byId(b.dataset.lnote);
    openModal({
      title: `${icon('pencil')} ${esc(l.name)} — izoh`,
      body: `<label class="field">Faqat sizga ko'rinadi (Telegramdagi xabarga ham qo'shiladi)<textarea name="admin_note" rows="4">${esc(l.admin_note)}</textarea></label>`,
      actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: (f) => setLead(l.id, { admin_note: f.admin_note.value }) }],
    });
  });
  root.querySelectorAll('[data-lbiz]').forEach((b) => b.onclick = () => addTenant(byId(b.dataset.lbiz)));
}

// ---------- Telegram bot for applications ----------
async function telegramDialog() {
  let st;
  try { st = await GET('/api/platform/telegram'); } catch (e) { return toastError(e); }
  P.tg = st;
  const steps = !st.configured ? `
      <ol class="stack" style="padding-left:20px;margin:0 0 12px">
        <li>Telegramda <a href="https://t.me/BotFather" target="_blank" rel="noopener"><b>@BotFather</b></a> ni oching → <b>/newbot</b> → bot nomi va username (oxiri <b>bot</b>) ni yozing.</li>
        <li>U bergan <b>tokenni</b> (masalan <code>7012345678:AAH...</code>) shu yerga joylang va "Saqlash" ni bosing.</li></ol>
      <label class="field">Bot tokeni<input name="token" autocomplete="off" spellcheck="false" placeholder="7012345678:AAH…"></label>`
    : !st.chat_id ? `
      <p>Bot: <b>@${esc(st.bot)}</b> ✅ — endi xabar qaysi chatga kelishini tanlang:</p>
      <div class="stack">
        <a class="btn primary" href="https://t.me/${esc(st.bot)}?start=${esc(st.link_code)}" target="_blank" rel="noopener">${icon('send', 18)} O'zimning Telegramimga</a>
        <a class="btn" href="https://t.me/${esc(st.bot)}?startgroup=${esc(st.link_code)}" target="_blank" rel="noopener">${icon('users', 18)} Guruhga (jamoa bilan)</a></div>
      <p class="small muted" style="margin-top:12px">Tugma ishlamasa, botga (yoki bot qo'shilgan guruhga) shu xabarni yozing: <b>/start ${esc(st.link_code)}</b>
        <br>Kod bir martalik. Ulangach bu oyna o'zi yangilanadi.</p>
      <p class="small muted" id="tg-wait">${icon('clock', 14)} Kutilmoqda…</p>`
    : `
      <p>Bot: <b>@${esc(st.bot)}</b> → <b>${esc(st.chat_title || st.chat_id)}</b> ✅</p>
      <p class="small muted">Yangi ariza kelganda shu chatga xabar keladi. Xabar ostidagi tugmalar ("Qo'ng'iroq qilindi", "Ulandi", "Rad etildi") holatni platformada ham o'zgartiradi.
        Bu tugmalarni faqat shu chat bosa oladi.</p>
      ${st.error ? `<div class="notice red">${icon('triangle-alert', 16)} ${esc(st.error)}</div>` : ''}`;
  const form = openModal({
    title: `${icon('send')} Telegram bot — arizalar`,
    body: steps,
    actions: !st.configured
      ? [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
        await PUT('/api/platform/telegram', { token: f.token.value.trim() }); telegramDialog(); return false;
      } }]
      : [{ label: "Botni o'chirish", cls: 'red-text', onClick: async () => {
        if (!confirm("Bot uzilsinmi? Arizalar saqlanishda davom etadi, faqat Telegramga xabar kelmaydi.")) return false;
        await DEL('/api/platform/telegram'); await reloadTg(); toast('Bot uzildi', 'ok');
      } },
      ...(st.chat_id ? [{ label: 'Boshqa chatga ulash', onClick: async () => { await POST('/api/platform/telegram/relink'); telegramDialog(); return false; } },
        { label: 'Sinov xabari', cls: 'primary', icon: 'send', onClick: async () => { await POST('/api/platform/telegram/test'); toast('Yuborildi — Telegramni tekshiring', 'ok'); return false; } }]
        : [{ label: 'Yopish', onClick: () => {} }])],
  });
  if (st.configured && !st.chat_id) {
    // Wait for the code from Telegram, then show the linked state.
    const tick = async () => {
      if (!document.body.contains(form)) return;
      try { const s2 = await GET('/api/platform/telegram'); if (s2.chat_id) { P.tg = s2; toast('Bot ulandi ✅', 'ok'); telegramDialog(); render(); return; } } catch { /* keep waiting */ }
      setTimeout(tick, 2500);
    };
    setTimeout(tick, 2500);
  }
}
async function reloadTg() { try { P.tg = await GET('/api/platform/telegram'); render(); } catch (e) { toastError(e); } }
function kpiP(label, value, sub, ic, cls = '') {
  return `<div class="kpi ${cls}"><div class="kpi-ic">${icon(ic, 22)}</div><div><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
}
function emptyState(ic, text) { return `<div class="empty">${icon(ic, 56)}<div>${text}</div></div>`; }

async function load() {
  [P.tenants, P.modules, P.types, { release: P.release }, { plans: P.plans, terms: P.terms }] = await Promise.all([GET('/api/platform/tenants'),
    GET('/api/platform/modules'), GET('/api/platform/types'), GET('/api/platform/release'), GET('/api/platform/plans'), loadLeads()]);
}

// ---------- Forms ----------
const KITCHEN_MODES = { full: "To'liq: oshpaz qabul qiladi → tayyor → ofitsantga xabar", notify: "Faqat xabar: oshxona ko'radi/chop etadi, qabul qilish shart emas", off: "O'chiq: oshxonaga hech narsa bormaydi" };
const TYPE_DEFAULTS = { choyxona: ['full', []], restoran: ['full', []], fastfood: ['notify', ['reservations']], market: ['off', ['reservations']], clothing: ['off', ['reservations']], doors: ['off', ['reservations']] };

function typeSelect(cur = 'choyxona') {
  return `<label class="field">Biznes turi<select name="business_type">${Object.entries(P.types).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
}
function kitchenModeHtml(mode = 'full') {
  return `<label class="field">Oshxona rejimi<select name="kitchen_mode">${Object.entries(KITCHEN_MODES)
    .map(([k, v]) => `<option value="${k}" ${mode === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
}
function planFields(t = {}) {
  const cur = t.plan || 'biznes';
  return `<label class="field">Tarif<select name="plan">${PLAN_KEYS.map((k) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(planName(k))} — ${money(P.plans[k].price)}/oy · xodim ${staffLimit(P.plans[k].max_staff)}</option>`).join('')}</select></label>
    <label class="field">Maxsus oylik narx (0 = tarif narxi)<input type="number" name="monthly_fee" min="0" value="${t.monthly_fee || 0}"></label>
    <label class="check" style="align-self:end"><input type="checkbox" name="is_branch" ${t.is_branch ? 'checked' : ''}> Qo'shimcha filial (${money(P.terms.branch_price)}/oy)</label>
    ${t.id ? parentField(t) : ''}`;
}
// A branch points at its main business; the main owner then sees all branches side by side (Pro).
function parentField(t) {
  const hasKids = P.tenants.some((x) => x.parent_id === t.id);
  const mains = P.tenants.filter((x) => x.id !== t.id && !x.parent_id);
  return `<label class="field">Asosiy biznes (bu filial bo'lsa)<select name="parent_id" ${hasKids ? 'disabled title="Bu biznesning o\'z filiallari bor"' : ''}>
    <option value="">— Mustaqil biznes —</option>${mains.map((x) => `<option value="${x.id}" ${t.parent_id === x.id ? 'selected' : ''}>${esc(x.name)} (${esc(x.code)})</option>`).join('')}</select></label>`;
}
// Sections outside the chosen plan are shown greyed out: they are closed by the plan itself.
function syncPlanModules(form) {
  if (!form.plan) return;
  const inPlan = (P.plans[form.plan.value] || {}).modules || [];
  form.querySelectorAll('input[name^="mod_"]').forEach((c) => {
    const on = inPlan.includes(c.name.slice(4));
    c.disabled = !on;
    c.closest('label').classList.toggle('muted', !on);
    c.closest('label').title = on ? '' : 'Bu tarifga kirmaydi';
  });
}
function modulesHtml(disabled = []) {
  return `<h3 class="ph3">${icon('layers', 18)} Bo'limlar</h3>
    <p class="small muted" style="margin:0 0 8px">Xira bo'limlar tanlangan tarifga kirmaydi. Belgini olib tashlab, tarifdagi bo'limni ham yopish mumkin. Sotuv, menyu, kassa va xodimlar doim ishlaydi.</p>
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
  if (form.plan) { form.plan.addEventListener('change', () => syncPlanModules(form)); syncPlanModules(form); }
}
function bindTypeDefaults(form) {
  form.business_type.addEventListener('change', () => {
    const [mode, off] = TYPE_DEFAULTS[form.business_type.value] || TYPE_DEFAULTS.choyxona;
    form.kitchen_mode.value = mode;
    form.querySelectorAll('input[name^="mod_"]').forEach((c) => { c.checked = !off.includes(c.name.slice(4)); });
  });
}
function readForm(d, form) {
  // A greyed-out (not in plan) section keeps the tick it had, so moving to a bigger plan opens it again.
  d.disabled_modules = Object.keys(P.modules).filter((k) => (form ? !form[`mod_${k}`].checked : !d[`mod_${k}`]));
  for (const k of Object.keys(P.modules)) delete d[`mod_${k}`];
  d.support = { text: d.support_text || '', link: d.support_link || '' };
  delete d.support_text; delete d.support_link;
  d.paid_until = dateEndTs(d.paid_until);
  d.monthly_fee = Number(d.monthly_fee) || 0;
  d.is_branch = !!d.is_branch;
  if ('parent_id' in d) d.parent_id = Number(d.parent_id) || null;
  return d;
}

function branchNote(t) {
  const main = t.parent_id && P.tenants.find((x) => x.id === t.parent_id);
  if (main) return ` <span class="small muted">← ${esc(main.name)}</span>`;
  const kids = P.tenants.filter((x) => x.parent_id === t.id).length;
  return kids ? ` <span class="chip">${icon('network', 12)} ${kids} filial</span>` : '';
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
  const active = document.activeElement && ['psearch', 'lsearch'].includes(document.activeElement.id) ? document.activeElement.id : null;
  app.innerHTML = `<div class="platform">${mainHtml()}</div>`;
  bind(app);
  const s = active && app.querySelector(`#${active}`);
  if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
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
  root.querySelector('#pplans').onclick = plansDialog;
  root.querySelector('#ptg').onclick = telegramDialog;
  root.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { P.tab = b.dataset.tab; render(); });
  if (P.tab === 'leads') return bindLeads(root);
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
      <p style="margin-top:12px">Tarif: <b>${esc(t.plan_info.name)}</b> · <b>${money(t.plan_info.fee)}</b>/oy
        <span class="muted">· 1 yil = ${P.terms.yearly_months} oy narxi: <b>${money(t.plan_info.fee * P.terms.yearly_months)}</b></span></p>
      <p class="small muted" style="margin-top:8px">Qo'shish bugundan yoki joriy muddatdan (qaysi biri keyin bo'lsa) hisoblanadi. Masalan, bonus uchun "+1 hafta".
        Muddat tugagach ${P.terms.grace_days} kun ishlayveradi, keyin faqat ko'rish rejimiga o'tadi (ma'lumot o'chmaydi).</p>`,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
      await PUT(`/api/platform/tenants/${t.id}`, { paid_until: until });
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

function addTenant(lead = null) {
  const pre = lead || {};
  const form = openModal({
    title: `${icon('plus')} Yangi biznes`, size: 'wide',
    body: `<div class="form-grid">
      ${typeSelect(P.types[pre.type] ? pre.type : 'choyxona')}
      <label class="field">Nomi<input name="name" required placeholder="Navro'z choyxonasi" value="${esc(pre.business || '')}"></label>
      <label class="field">Kod (kirish havolasi uchun)<input name="code" required placeholder="navruz" autocapitalize="none"></label>
      <label class="field">Boshliq ismi<input name="owner_name" required placeholder="Akmal aka" value="${esc(pre.name || '')}"></label>
      <label class="field">Telefon<input name="phone" type="tel" value="${esc(pre.phone || '+998 ')}"></label>
      <label class="field">Boshliq logini<input name="owner_username" required autocapitalize="none" value="boshliq"></label>
      <label class="field">Boshliq paroli<input name="owner_password" required value="${randomPassword()}"></label>
      <label class="field">To'langan muddat (gacha) — ${P.terms.trial_days} kun bepul sinov<input type="date" name="paid_until" value="${isoDate(Date.now() + P.terms.trial_days * DAY_MS)}"></label>
      ${planFields(pre.plan ? { plan: pre.plan } : {})}
    </div>
    <p class="small muted" id="code-url" style="margin:8px 0 0"></p>
    <label class="check" style="margin-top:12px"><input type="checkbox" name="sample" checked> Namuna ma'lumotlar qo'shilsin (menyu yoki mahsulotlar; boshliq keyin o'zgartiradi)</label>
    <div style="margin-top:12px">${kitchenModeHtml()}</div>
    ${modulesHtml()}
    ${supportHtml()}
    <label class="field" style="margin-top:12px">Izoh (faqat sizga ko'rinadi)<textarea name="notes" rows="2"></textarea></label>`,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Yaratish', cls: 'primary', onClick: async (f) => {
      const d = readForm(formData(f), f);
      d.code = d.code.trim().toLowerCase();
      if (d.phone.trim() === '+998') d.phone = '';
      const t = await POST('/api/platform/tenants', d);
      if (lead) await PUT(`/api/platform/leads/${lead.id}`, { status: 'connected', tenant_id: t.id }).catch(() => {});
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
      ${planFields(t)}
    </div>
    <div style="margin-top:12px">${kitchenModeHtml(t.kitchen_mode)}</div>
    ${modulesHtml(t.disabled_modules)}
    ${supportHtml(t.support)}
    <label class="field" style="margin-top:12px">Izoh<textarea name="notes" rows="3">${esc(t.notes || '')}</textarea></label>
    <p class="small muted" style="margin-top:10px">Kod: <b>${esc(t.code)}</b> (o'zgartirilmaydi) · Yaratilgan: ${fmtDate(t.created_at)}<br>
      Menyu, xodimlar, xonalar va sozlamalarni o'zgartirish uchun kartadagi <b>Kirish</b> tugmasini bosing — biznes boshlig'i ko'radigan ekran ochiladi.</p>`,
    onMount: bindModules,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
      await PUT(`/api/platform/tenants/${t.id}`, readForm(formData(f), f));
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

// Plans: the platform owner sets names, prices, staff limits and sections; every business follows its plan at once.
function plansDialog() {
  const col = (k) => {
    const p = P.plans[k];
    return `<div class="plan-col card"><h3 class="ph3">${icon('star', 18)} <span class="chip plan-${k}">${esc(p.name)}</span></h3>
      <label class="field">Nomi<input name="${k}_name" value="${esc(p.name)}" required maxlength="30"></label>
      <label class="field">Narx (so'm / oy)<input type="number" name="${k}_price" min="0" value="${p.price}" required></label>
      <label class="field">Xodimlar soni (0 = cheksiz)<input type="number" name="${k}_max_staff" min="0" value="${p.max_staff}" required></label>
      <label class="field">Bir ofitsant bir vaqtda nechta qurilmada (0 = cheksiz)<input type="number" name="${k}_devices_per_staff" min="0" value="${p.devices_per_staff}" required></label>
      <p class="small muted" style="margin:10px 0 6px">Bo'limlar</p>
      <div class="stack" style="gap:6px">${Object.entries(P.modules).map(([m, n]) => `<label class="check"><input type="checkbox" name="${k}_mod_${m}" ${p.modules.includes(m) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div>
      <p class="small muted" style="margin-top:10px">Yillik: <b data-year="${k}"></b></p></div>`;
  };
  const tm = P.terms;
  const form = openModal({
    title: `${icon('star')} Tariflar va narxlar`, size: 'wide',
    body: `<p class="muted" style="margin-top:0">O'zgarishlar barcha bizneslarga darhol qo'llanadi. Maxsus narx qo'yilgan bizneslar o'z narxida qoladi.
        Tarif pasaysa hech narsa o'chmaydi — faqat yangi xodim qo'shish yoki yopilgan bo'limga kirish to'xtaydi.</p>
      <div class="plan-cols">${PLAN_KEYS.map(col).join('')}</div>
      <h3 class="ph3">${icon('sliders-horizontal', 18)} Umumiy shartlar</h3>
      <div class="form-grid">
        <label class="field">Qo'shimcha filial narxi (so'm / oy)<input type="number" name="branch_price" min="0" value="${tm.branch_price}" required></label>
        <label class="field">Yillik to'lov necha oy narxida<input type="number" name="yearly_months" min="1" max="12" value="${tm.yearly_months}" required></label>
        <label class="field">Muddat tugagach ishlash (kun)<input type="number" name="grace_days" min="0" max="60" value="${tm.grace_days}" required></label>
        <label class="field">Yangi biznesga bepul sinov (kun)<input type="number" name="trial_days" min="0" max="365" value="${tm.trial_days}" required></label>
      </div>`,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', icon: 'save', onClick: async (f) => {
      const plans = Object.fromEntries(PLAN_KEYS.map((k) => [k, {
        name: f[`${k}_name`].value.trim(), price: Number(f[`${k}_price`].value), max_staff: Number(f[`${k}_max_staff`].value),
        devices_per_staff: Number(f[`${k}_devices_per_staff`].value),
        modules: Object.keys(P.modules).filter((m) => f[`${k}_mod_${m}`].checked),
      }]));
      const terms = Object.fromEntries(['branch_price', 'yearly_months', 'grace_days', 'trial_days'].map((n) => [n, Number(f[n].value)]));
      const r = await PUT('/api/platform/plans', { plans, terms });
      P.plans = r.plans; P.terms = r.terms;
      toast('Tariflar saqlandi', 'ok'); reload();
    } }],
  });
  const years = () => PLAN_KEYS.forEach((k) => {
    form.querySelector(`[data-year="${k}"]`).innerHTML = money((Number(form[`${k}_price`].value) || 0) * (Number(form.yearly_months.value) || 0));
  });
  form.addEventListener('input', years);
  years();
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
