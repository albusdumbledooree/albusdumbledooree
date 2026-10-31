'use strict';
/*
 * Hisobot: one page, simple tabs, the same on a phone and a big screen.
 * At the top: the period and the worker ("Hammasi" or one person — then every tab shows only theirs).
 * - Umumiy: sales, costs, profit, payment types, hours;
 * - Taomlar: by category, each dish — how many, how much, profit;
 * - Xodimlar: each worker's numbers; tap one for their whole day (timeline, checks, dishes);
 * - Smenalar: cash shifts with the difference at closing;
 * - Shubhali: things worth a second look (a dish removed after the bill was printed, big discounts…).
 */
UI.rep = UI.rep || { tab: 'general', user: '' };
const REP_TABS = () => [['general', 'chart-column', t('Umumiy')], ['dishes', 'utensils', W('Taomlar')], ['staff', 'users', t('Xodimlar')],
  ['shifts', 'wallet', t('Smenalar')], ['alerts', 'triangle-alert', t('Shubhali')]];
const SUS_NAMES = () => ({
  after_print: t('Chek chop etilgandan keyin taom olib tashlangan'), cooked_cancel: t('Tayyor taom bekor qilingan'),
  discount: t('Katta chegirma'), long_open: t('Chek juda uzoq ochiq turgan'), order_cancel: t('Butun chek bekor qilingan'), shortage: t('Kassada kamomad'),
});
const STORY_NAMES = () => ({ ...AUDIT_NAMES(), kitchen_accept: t('Oshxona qabul qildi'), item_served: t('Mijozga berildi'), order_open: t('Chek ochdi') });
const pctOf = (v, total) => (total > 0 ? Math.round((v / total) * 100) : 0);
const repQuery = () => { const r = periodRange(); return `from=${r.from}&to=${r.to}${UI.rep.user ? `&user=${UI.rep.user}` : ''}`; };

function deltaChip(cur, prev) {
  if (!prev && !cur) return '';
  if (!prev) return `<span class="chip green">${t('yangi')}</span>`;
  const p = Math.round(((cur - prev) / prev) * 100);
  return `<span class="chip ${p >= 0 ? 'green' : 'red'}" title="${esc(t("O'tgan davr bilan"))}">${p >= 0 ? '↑' : '↓'} ${Math.abs(p)}%</span>`;
}
// Dishes by category: a row per category that opens to its dishes.
function categoriesHtml(cats, total) {
  if (!cats.length) return `<div class="card">${emptyState('utensils', t("Bu davrda sotuv yo'q"))}</div>`;
  return `<div class="card rep-cats">${cats.map((c) => `<details class="rep-cat"><summary>
      <span class="grow"><b>${esc(t(c.name))}</b> <span class="small muted">${t('{0} ta', num(c.qty))}</span></span>
      <span class="pnl-bar"><i class="blue" style="width:${pctOf(c.revenue, total)}%"></i></span><span class="small muted pnl-pct">${pctOf(c.revenue, total)}%</span>
      <b class="num rep-sum">${num(c.revenue)}</b></summary>
    <div class="rep-dishes">${c.dishes.map((d) => `<div><span class="grow">${esc(d.name)}</span><span class="rep-qty">${num(d.qty)} ${t('ta')}</span>
      <span class="num">${num(d.revenue)}</span>${d.has_cost ? `<span class="small ${d.profit >= 0 ? 'green-t' : 'red-t'} rep-profit">${t('foyda')} ${num(d.profit)}</span>` : '<span class="rep-profit"></span>'}</div>`).join('')}</div></details>`).join('')}</div>`;
}
function staffCards(rows, period) {
  if (!rows.length) return `<div class="card">${emptyState('users', t("Bu davrda xodimlar faoliyati yo'q"))}</div>`;
  return `<div class="rep-staff">${rows.map((r) => `<a class="card rep-person" href="#/staffday/${r.id}">
      <div class="row" style="flex-wrap:nowrap;gap:10px"><span class="avatar ${r.role}">${esc(initials(r.name))}</span>
        <div class="grow"><b>${esc(r.name)}</b><div class="small muted">${esc(staffJob(r))}${r.work_in ? ` · ${fmtTime(r.work_in)}–${r.work_out ? fmtTime(r.work_out) : t('ishda')}` : ''}</div></div>
        ${r.revenue ? `<b class="num">${money(r.revenue)}</b>` : ''}${icon('chevron-right', 18)}</div>
      <div class="rep-chips">${r.checks ? `<span class="chip">${icon('receipt', 13)} ${t('{0} chek', r.checks)}</span>` : ''}
        ${r.guests ? `<span class="chip">${icon('users', 13)} ${r.guests}</span>` : ''}
        ${r.avg ? `<span class="chip">${t("o'rtacha")} ${num(r.avg)}</span>` : ''}
        ${r.closed ? `<span class="chip">${icon('wallet', 13)} ${t('{0} ta yopdi', r.closed)} · ${num(r.closed_sum)}</span>` : ''}
        ${r.discount ? `<span class="chip orange">${t('chegirma')} ${num(r.discount)}</span>` : ''}
        ${r.cancels ? `<span class="chip red">${t('{0} ta bekor', r.cancels)}</span>` : ''}
        ${!r.checks && !r.closed && r.actions ? `<span class="chip">${t('{0} ta amal', r.actions)}</span>` : ''}</div></a>`).join('')}</div>
    <p class="small muted">${icon('info', 14)} ${t("Xodimni bosing — uning {0} nima qilgani daqiqama-daqiqa chiqadi.", period)}</p>`;
}
function shiftsHtml(rows) {
  if (!rows.length) return `<div class="card">${emptyState('wallet', t("Bu davrda kassa smenasi ochilmagan"))}</div>`;
  return `<div class="card fx-list">${rows.map((s) => `<div class="fx-row">
      <div class="fx-name"><b>${esc(s.cashier_name)}</b><span class="small muted">${fmtDateTime(s.opened_at)} → ${s.closed_at ? fmtDateTime(s.closed_at) : t('ochiq')}</span></div>
      <span class="small muted">${t('Kutilgan')}<br><b class="num">${s.expected_cash != null ? num(s.expected_cash) : '—'}</b></span>
      <span class="small muted">${t('Kassada')}<br><b class="num">${s.closing_cash != null ? num(s.closing_cash) : '—'}</b></span>
      <div>${s.diff == null ? `<span class="chip">${t('ochiq')}</span>` : s.diff === 0 ? `<span class="chip green">${icon('check', 13)} ${t('Teng')}</span>`
        : s.diff < 0 ? `<span class="chip red">${t('Kamomad')} ${num(-s.diff)}</span>` : `<span class="chip orange">${t('Ortiqcha')} ${num(s.diff)}</span>`}</div></div>`).join('')}</div>`;
}
function alertsHtml(rows) {
  if (!rows.length) return `<div class="card">${emptyState('shield-check', t("Shubhali holat topilmadi"))}</div>`;
  return `<div class="card fx-list">${rows.map((a) => `<div class="fx-row sus ${a.level}">
      <div class="fx-name"><b>${esc(SUS_NAMES()[a.kind] || a.kind)}</b>
        <span class="small muted">${fmtDateTime(a.at)} · ${esc(a.user || '')}${a.text ? ` · ${esc(a.text)}` : ''}</span></div>
      <b class="num">${a.amount ? money(a.amount) : ''}</b>
      <div>${a.order_id ? `<button class="btn sm" data-story="${a.order_id}">${icon('receipt', 14)} #${a.order_id}</button>` : ''}</div></div>`).join('')}</div>
    <p class="small muted">${icon('info', 14)} ${t("Bu ro'yxat ayblov emas — shunchaki qarab chiqishga arziydigan holatlar. Chek raqamini bosing: kim, qachon, nima qilgani ko'rinadi.")}</p>`;
}

Views.reports = {
  title: () => t('Hisobot'), icon: () => 'chart-column', roles: ['owner', 'admin', 'cashier'], refreshOn: ['finance', 'rooms'], module: 'reports', on: () => !!App.money.reports,
  async load() {
    const r = periodRange();
    const [stats, staff, rep] = await Promise.all([GET(`/api/stats?${repQuery()}`), GET('/api/staff-list').catch(() => []),
      UI.rep.tab === 'general' && !UI.rep.user ? GET(`/api/reports?from=${r.from}&to=${r.to}`) : null]);
    return { stats, staff, rep };
  },
  render(d) {
    const s = d.stats.summary;
    const tab = UI.rep.tab;
    const tabs = REP_TABS().map(([k, ic, n]) => `<button class="${tab === k ? 'active' : ''}" data-rtab="${k}">${icon(ic, 16)} ${n}${k === 'alerts' && d.stats.suspicious_count ? ` <span class="badge">${d.stats.suspicious_count}</span>` : ''}</button>`).join('');
    const who = `<label class="rep-who">${icon('user-round', 16)}<select id="rep-user"><option value="">${t('Hamma xodimlar')}</option>
      ${d.staff.map((u) => `<option value="${u.id}" ${String(UI.rep.user) === String(u.id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>`;
    let body = '';
    if (tab === 'general') {
      const r = d.rep;
      body = `<div class="kpis">
          ${kpi(t('Savdo'), money(s.revenue), `${t('{0} chek', s.checks)} · ${t("o'rtacha {0}", num(s.avg))} ${deltaChip(s.revenue, d.stats.prev.revenue)}`, 'good', 'trending-up')}
          ${r ? kpi(t('Chiqim'), money(r.expense), '', 'bad', 'arrow-right-left') : kpi(W('Taomlar'), t('{0} ta', num(s.dishes_qty)), '', '', 'utensils')}
          ${r ? kpi(t('Foyda'), money(r.net_profit), '', r.net_profit >= 0 ? 'good' : 'bad', 'coins') : kpi(t('Chegirma'), money(s.discount), '', s.discount ? 'warn' : '', 'percent')}
          ${kpi(t('Mehmonlar'), s.guests, `${t('Xizmat haqi')}: ${money(s.service)}`, '', 'users')}</div>
        ${r ? `<div class="card"><div class="card-head"><h2>${r.hourly ? t("Soatlar bo'yicha") : t("Kunlar bo'yicha")}</h2></div>${barChart(r.series)}</div>` : ''}
        <div class="grid grid-2" style="margin-top:16px">
          <div class="card"><div class="card-head"><h2>${t("To'lov turlari")}</h2></div>
            ${hbars([{ label: t('Naqd'), value: s.cash }, { label: t('Karta'), value: s.card }, { label: t("O'tkazma"), value: s.transfer }, ...(s.debt ? [{ label: t('Qarzga'), value: s.debt }] : []), ...(s.bonus ? [{ label: t('Bonus bilan'), value: s.bonus }] : []), ...(s.staff ? [{ label: t('Xodim hisobiga'), value: s.staff }] : [])].filter((x) => x.value))}</div>
          ${r ? `<div class="card"><div class="card-head"><h2>${t('Xarajatlar')}</h2></div>${hbars(r.expense_by_category.map((x) => ({ label: x.key, value: x.value })), { red: true })}</div>` : ''}
          <div class="card"><div class="card-head"><h2>${t("Eng ko'p sotilgan")}</h2><a href="#" data-rtab="dishes" class="small">${t('Hammasi')} →</a></div>
            ${hbars(d.stats.categories.flatMap((c) => c.dishes).sort((a, b) => b.qty - a.qty).slice(0, 8).map((x) => ({ label: `${x.name} (${x.qty})`, value: x.revenue })))}</div>
          ${!UI.rep.user ? `<div class="card"><div class="card-head"><h2>${isShop() ? t('Sotuvchilar') : t('Ofitsantlar')}</h2><a href="#" data-rtab="staff" class="small">${t('Batafsil')} →</a></div>
            ${hbars(d.stats.staff.filter((x) => x.revenue).map((x) => ({ label: `${x.name} (${x.checks})`, value: x.revenue })))}</div>` : ''}
        </div>
        ${s.cancelled_qty ? `<p class="small muted">${icon('ban', 14)} ${t('Bekor qilingan taomlar: {0} ta — {1}', s.cancelled_qty, moneyText(s.cancelled_amount))}</p>` : ''}`;
    } else if (tab === 'dishes') {
      body = `<div class="row" style="gap:8px;margin-bottom:12px"><span class="chip">${t('{0} ta taom', num(s.dishes_qty))}</span><span class="chip">${money(s.revenue)}</span>
          ${s.cancelled_qty ? `<span class="chip red">${t('bekor')}: ${s.cancelled_qty} · ${num(s.cancelled_amount)}</span>` : ''}</div>
        ${categoriesHtml(d.stats.categories, d.stats.categories.reduce((x, c) => x + c.revenue, 0))}`;
    } else if (tab === 'staff') body = staffCards(d.stats.staff, UI.period.preset === 'today' ? t('bugun') : t('shu davrda'));
    else if (tab === 'shifts') body = shiftsHtml(d.stats.shifts);
    else body = alertsHtml(d.stats.suspicious);
    return `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Hisobot')}</h1>
        ${moduleOn('export') ? `<button class="btn" id="csv">${icon('file-spreadsheet', 18)}<span class="hide-sm"> Excel</span></button>` : ''}</div>
      ${periodPicker()}
      <div class="rep-bar">${who}</div>
      ${d.stats.user ? `<div class="notice blue slim">${icon('user-round', 16)} <span>${t('Faqat {0} ning natijalari', esc(d.stats.user.name))} · <a href="#/staffday/${d.stats.user.id}">${t('Kun bo\'yi nima qildi')} →</a></span></div>` : ''}
      <div class="seg rep-tabs">${tabs}</div>${body}`;
  },
  bind(root, d) {
    bindPeriod(root);
    root.querySelectorAll('[data-rtab]').forEach((b) => b.onclick = (e) => { e.preventDefault(); UI.rep.tab = b.dataset.rtab; refreshView(true); });
    root.querySelector('#rep-user').onchange = (e) => { UI.rep.user = e.target.value; refreshView(true); };
    root.querySelectorAll('[data-story]').forEach((b) => b.onclick = () => checkStory(Number(b.dataset.story)));
    const csv = root.querySelector('#csv');
    if (csv) csv.onclick = () => {
      const s = d.stats.summary; const r = periodRange();
      downloadCsv(`hisobot_${localDay(r.from)}_${localDay(r.to - 1)}.csv`, [
        [t('Hisobot'), `${fmtDate(r.from)} — ${fmtDate(r.to - 1)}`, d.stats.user ? d.stats.user.name : t('Hamma xodimlar')], [],
        [t('Savdo'), s.revenue], [t('Cheklar'), s.checks], [t('Mehmonlar'), s.guests], [t("O'rtacha chek"), s.avg], [t('Xizmat haqi'), s.service], [t('Chegirma'), s.discount],
        [t('Naqd'), s.cash], [t('Karta'), s.card], [t("O'tkazma"), s.transfer], [],
        [W('Taomlar'), t('Soni'), t('Summa'), t('Foyda')],
        ...d.stats.categories.flatMap((c) => [[c.name, c.qty, c.revenue, c.has_cost ? c.profit : ''], ...c.dishes.map((x) => [`   ${x.name}`, x.qty, x.revenue, x.has_cost ? x.profit : ''])]), [],
        [t('Xodim'), t('Cheklar'), t('Mehmonlar'), t('Savdo'), t('Chegirma'), t('Bekor'), t('Yopgan cheklari')],
        ...d.stats.staff.map((x) => [x.name, x.checks, x.guests, x.revenue, x.discount, x.cancels, x.closed_sum]), [],
        [t('Shubhali'), t('Vaqt'), t('Xodim'), t('Chek'), t('Summa')],
        ...d.stats.suspicious.map((a) => [SUS_NAMES()[a.kind], fmtDateTime(a.at), a.user, a.order_id ? `#${a.order_id}` : '', a.amount]),
      ]);
    };
  },
};

// ---------- One worker's whole day ----------
Views.staffday = {
  title: () => t('Xodimning kuni'), icon: () => 'user-round', roles: ['owner', 'admin', 'cashier'], module: 'reports', on: () => !!App.money.reports, refreshOn: ['finance', 'rooms'],
  async load(p) {
    if (!Number(p[0])) { location.hash = '#/reports'; return null; }
    return GET(`/api/stats/user/${Number(p[0])}?${(() => { const r = periodRange(); return `from=${r.from}&to=${r.to}`; })()}`);
  },
  render(d) { return personDayHtml(d, '#/reports'); },
  bind(root) { bindPersonDay(root); },
};
function personDayHtml(d, back) {
  const s = d.summary; const u = d.user;
  const line = (e) => `<div class="tl-row"><b class="tl-time">${fmtTime(e.at)}</b><span class="tl-dot ${e.action}"></span>
      <div class="grow"><span>${esc(STORY_NAMES()[e.action] || e.action)}</span>${e.details ? ` <span class="small muted">${esc(String(e.details).replace(/^#\d+:?\s*/, ''))}</span>` : ''}</div>
      ${e.order_id ? `<button class="btn sm" data-story="${e.order_id}">#${e.order_id}</button>` : ''}</div>`;
  const days = new Map();
  for (const e of d.timeline) { const k = fmtDate(e.at); if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
  return `<div class="page-head">${back ? `<a class="btn sm" href="${back}">${icon('arrow-left', 16)}</a>` : ''}<span class="avatar ${u.role}">${esc(initials(u.name))}</span>
      <div><h1 style="margin:0">${esc(u.name)}</h1><span class="small muted">${esc(staffJob(u))}</span></div></div>
    ${periodPicker()}
    <div class="kpis">${kpi(t('Savdo'), money(s.revenue), t('{0} chek', s.checks), 'good', 'trending-up')}${kpi(t('Mehmonlar'), s.guests, s.avg ? t("o'rtacha {0}", num(s.avg)) : '', '', 'users')}
      ${kpi(W('Taomlar'), t('{0} ta', num(s.dishes_qty)), s.cancelled_qty ? `${t('bekor')}: ${s.cancelled_qty}` : '', '', 'utensils')}
      ${d.closed.length ? kpi(t('Yopgan cheklari'), t('{0} ta', d.closed.length), money(d.closed.reduce((x, c) => x + c.total, 0)), '', 'wallet') : kpi(t('Chegirma'), money(s.discount), '', '', 'percent')}</div>
    ${d.suspicious.length ? `<h2 class="rep-h">${icon('triangle-alert', 18)} ${t('Shubhali')} (${d.suspicious.length})</h2>${alertsHtml(d.suspicious)}` : ''}
    <h2 class="rep-h">${icon('clock', 18)} ${t('Nima qildi')}</h2>
    <div class="card tl">${d.timeline.length ? [...days].map(([day, list]) => `${days.size > 1 ? `<div class="tl-day">${esc(day)}</div>` : ''}${list.map(line).join('')}`).join('')
      : `<p class="muted" style="margin:0">${t("Bu davrda amal yo'q")}</p>`}</div>
    ${d.checks.length ? `<h2 class="rep-h">${icon('receipt', 18)} ${t('Cheklari')} (${d.checks.length})</h2><div class="card fx-list">${d.checks.map((c) => `<div class="fx-row">
        <div class="fx-name"><b>#${c.id} · ${esc(c.room_name)}</b><span class="small muted">${fmtTime(c.opened_at)} → ${fmtTime(c.closed_at)} · ${icon('users', 12)} ${c.guests}${c.cashier_name ? ` · ${icon('wallet', 12)} ${esc(c.cashier_name)}` : ''}</span></div>
        <b class="num">${money(c.total)}</b><span>${c.discount ? `<span class="chip orange">−${num(c.discount)}</span>` : ''}</span>
        <div><button class="btn sm" data-story="${c.id}">${icon('history', 14)}</button></div></div>`).join('')}</div>` : ''}
    ${d.categories.length ? `<h2 class="rep-h">${icon('utensils', 18)} ${t('Sotgan taomlari')}</h2>${categoriesHtml(d.categories, s.revenue)}` : ''}`;
}
function bindPersonDay(root) {
  bindPeriod(root);
  root.querySelectorAll('[data-story]').forEach((b) => b.onclick = () => checkStory(Number(b.dataset.story)));
}

// A worker's own results (a waiter sees only theirs).
Views.mystats = {
  title: () => t('Mening natijalarim'), icon: () => 'chart-column', roles: ['admin', 'cashier', 'waiter', 'chef'], refreshOn: ['rooms', 'finance'],
  async load() { const r = periodRange(); return GET(`/api/my/stats?from=${r.from}&to=${r.to}`); },
  render(d) { return personDayHtml(d, '#/settings'); },
  bind(root) { bindPersonDay(root); },
};

// ---------- One check's story ----------
async function checkStory(id) {
  let d;
  try { d = await GET(`/api/orders/${id}/story`); } catch (e) { return toastError(e); }
  const o = d.order;
  openModal({
    title: `${icon('history')} ${t('Chek')} #${o.id} — ${esc(o.room_name)}`,
    body: `<div class="sum-rows small" style="margin-bottom:12px">
        <span>${t('Ochdi')}</span><span class="right"><b>${esc(o.waiter_name)}</b> · ${fmtDateTime(o.opened_at)}</span>
        <span>${o.status === 'cancelled' ? t('Bekor qilindi') : t('Yopdi')}</span><span class="right">${o.closed_at ? `<b>${esc(o.cashier_name || '—')}</b> · ${fmtDateTime(o.closed_at)}` : `<span class="chip">${t('ochiq')}</span>`}</span>
        ${o.closed_at ? `<span>${t('Davomiyligi')}</span><span class="right">${hoursText(Math.round((o.closed_at - o.opened_at) / MIN))}</span>` : ''}
        <span>${t('Jami')}</span><span class="right"><b>${money(o.total)}</b>${o.discount ? ` · ${t('chegirma')} ${num(o.discount)}` : ''}</span></div>
      <div class="tl">${d.events.map((e) => `<div class="tl-row"><b class="tl-time">${fmtTime(e.at)}</b><span class="tl-dot ${e.action}"></span>
        <div class="grow"><span>${esc(STORY_NAMES()[e.action] || e.action)}</span> <span class="small muted">${esc(String(e.details || '').replace(/^#\d+:?\s*/, ''))}</span>
        ${e.user ? `<div class="small"><b>${esc(e.user)}</b></div>` : ''}</div></div>`).join('')}</div>`,
  });
}
