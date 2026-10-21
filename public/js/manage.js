'use strict';
/* Management screens: checks history, reports, cash book, payroll, reservations, menu, staff, settings. */

// ---------- Shared pieces ----------
function kpi(label, value, sub = '', cls = '', ic = 'chart-column') {
  return `<div class="kpi ${cls}"><div class="kpi-ic">${icon(ic, 22)}</div><div><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
}
function hbars(rows, { red = false } = {}) {
  if (!rows.length) return `<p class="muted">${t("Ma'lumot yo'q")}</p>`;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => `<div class="hbar"><span>${esc(r.label)}</span><span class="track"><span class="fill ${red ? 'red' : ''}" style="width:${(r.value / max) * 100}%"></span></span><span class="num">${money(r.value)}</span></div>`).join('');
}
function barChart(series) {
  if (!series.length) return '';
  const W = 760; const H = 240; const L = 56; const B = 26; const T = 10;
  const max = Math.max(1, ...series.map((s) => Math.max(s.income, s.expense)));
  const bw = (W - L - 10) / series.length;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const short = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));
  const grid = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - 6}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(max * f) + 4}" text-anchor="end">${short(Math.round(max * f))}</text>`).join('');
  const step = Math.ceil(series.length / 16);
  const bars = series.map((s, i) => {
    const x = L + i * bw;
    const w = Math.max(2, bw / 2 - 2);
    const label = s.key.length > 5 ? `${s.key.slice(8)}.${s.key.slice(5, 7)}` : s.key;
    return `<rect class="bar-in" x="${x + 2}" y="${y(s.income)}" width="${w}" height="${H - B - y(s.income)}" rx="3"><title>${s.key}: ${num(s.income)}</title></rect>
      <rect class="bar-out" x="${x + 2 + w}" y="${y(s.expense)}" width="${w}" height="${H - B - y(s.expense)}" rx="3"><title>${s.key}: ${num(s.expense)}</title></rect>
      ${i % step === 0 ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${label}</text>` : ''}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${bars}</svg>
    <div class="legend" style="margin:6px 0 0"><span><i style="background:var(--primary)"></i>${t('Kirim')}</span><span><i style="background:var(--red)"></i>${t('Chiqim')}</span></div>`;
}

// Period picker shared by reports and the cash book.
const PERIODS = () => [['today', t('Bugun')], ['yesterday', t('Kecha')], ['week', t('Hafta')], ['month', t('Oy')], ['prevmonth', t("O'tgan oy")], ['custom', t('Sana')]];
UI.period = store('cp_period') || { preset: 'today', from: '', to: '' };
function periodRange(p = UI.period) {
  const today = dayStart();
  const day = 24 * 60 * MIN;
  switch (p.preset) {
    case 'yesterday': return { from: today.getTime() - day, to: today.getTime() };
    case 'week': { const m = new Date(today); m.setDate(today.getDate() - ((today.getDay() + 6) % 7)); return { from: m.getTime(), to: today.getTime() + day }; }
    case 'month': return { from: new Date(today.getFullYear(), today.getMonth(), 1).getTime(), to: today.getTime() + day };
    case 'prevmonth': return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime(), to: new Date(today.getFullYear(), today.getMonth(), 1).getTime() };
    case 'custom': return { from: (p.from ? new Date(`${p.from}T00:00`) : today).getTime(), to: (p.to ? new Date(`${p.to}T00:00`) : today).getTime() + day };
    default: return { from: today.getTime(), to: today.getTime() + day };
  }
}
function periodPicker() {
  const p = UI.period;
  const r = periodRange();
  return `<div class="row" style="margin-bottom:16px"><div class="seg">${PERIODS().map(([k, n]) => `<button class="${p.preset === k ? 'active' : ''}" data-period="${k}">${n}</button>`).join('')}</div>
    ${p.preset === 'custom' ? `<input type="date" id="p-from" value="${p.from || localDay(r.from)}" style="width:auto"> — <input type="date" id="p-to" value="${p.to || localDay(r.to - 1)}" style="width:auto">` : ''}
    <span class="muted small">${fmtDate(r.from)}${r.to - r.from > 24 * 60 * MIN ? ` — ${fmtDate(r.to - 1)}` : ''}</span></div>`;
}
function bindPeriod(root) {
  root.querySelectorAll('[data-period]').forEach((b) => b.onclick = () => { UI.period = { ...UI.period, preset: b.dataset.period }; store('cp_period', UI.period); refreshView(); });
  const f = root.querySelector('#p-from'); const to = root.querySelector('#p-to');
  if (f) f.onchange = to.onchange = () => { UI.period = { preset: 'custom', from: f.value, to: to.value }; store('cp_period', UI.period); refreshView(); };
}

// ---------- Checks history ----------
// Opens on today's checks; a new day starts empty. "Hammasi" shows everything since the first check.
const HIST_PERIODS = () => [['today', t('Bugun')], ['yesterday', t('Kecha')], ['d7', t('1 hafta')], ['d30', t('1 oy')], ['all', t('Hammasi')], ['custom', t('Sana')]];
UI.hist = { period: 'today', from: '', to: '', status: 'closed', q: '' };
function histRange() {
  const h = UI.hist;
  const today = dayStart().getTime();
  const day = 24 * 60 * MIN;
  switch (h.period) {
    case 'yesterday': return { from: today - day, to: today };
    case 'd7': return { from: today - 6 * day, to: today + day };
    case 'd30': return { from: today - 29 * day, to: today + day };
    case 'all': return {};
    case 'custom': return { from: h.from ? new Date(`${h.from}T00:00`).getTime() : today, to: (h.to ? new Date(`${h.to}T00:00`).getTime() : today) + day };
    default: return { from: today, to: today + day };
  }
}
function histQuery(extra = {}) {
  const r = histRange();
  const p = new URLSearchParams({ status: UI.hist.status, ...(UI.hist.q ? { q: UI.hist.q } : {}), ...extra });
  if (r.from) p.set('from', r.from);
  if (r.to) p.set('to', r.to);
  return p.toString();
}

Views.history = {
  title: () => t('Cheklar'), icon: () => 'receipt', roles: ['owner', 'admin', 'cashier'], refreshOn: ['finance'], module: 'history',
  async load() { return GET(`/api/checks?${histQuery({ limit: 100 })}`); },
  render(d) {
    const h = UI.hist;
    const r = histRange();
    const s = d.sums;
    const cancelled = h.status === 'cancelled';
    const label = h.period === 'all' ? (s.first_at ? t('{0} dan beri', fmtDate(s.first_at)) : '') : `${fmtDate(r.from)}${r.to - r.from > 24 * 60 * MIN ? ` — ${fmtDate(r.to - 1)}` : ''}`;
    return `<div class="page-head"><h1>${t('Cheklar tarixi')}</h1><span class="muted">${label}</span>
      <button class="btn" id="hist-export" ${s.count ? '' : 'disabled'}>${icon('file-spreadsheet', 18)} Excel</button></div>
      <div class="row" style="margin-bottom:12px"><div class="seg">${HIST_PERIODS().map(([k, n]) => `<button class="${h.period === k ? 'active' : ''}" data-hp="${k}">${n}</button>`).join('')}</div>
        ${h.period === 'custom' ? `<input type="date" id="h-from" value="${h.from || localDay()}" style="width:auto"> — <input type="date" id="h-to" value="${h.to || localDay()}" style="width:auto">` : ''}</div>
      <div class="row" style="margin-bottom:16px">
        <div class="seg"><button class="${!cancelled ? 'active' : ''}" data-hs="closed">${icon('circle-check', 16)} ${t('Yopilgan')}</button><button class="${cancelled ? 'active' : ''}" data-hs="cancelled">${icon('ban', 16)} ${t('Bekor qilingan')}</button></div>
        <input type="search" id="h-q" placeholder="${esc(t('Chek raqami, xona yoki ofitsant'))}" value="${esc(h.q)}" style="max-width:300px"></div>
      <div class="kpis">
        ${kpi(t('Cheklar'), s.count, t('{0} mehmon', s.guests), '', 'receipt')}
        ${cancelled ? '' : `${kpi(t('Jami'), money(s.total), s.count ? `${t("O'rtacha")}: ${money(Math.round(s.total / s.count))}` : '', 'good', 'coins')}
        ${kpi(t('Naqd'), money(s.cash), '', '', 'banknote')}${kpi(t('Karta'), money(s.card), '', '', 'credit-card')}${kpi(t("O'tkazma"), money(s.transfer), '', '', 'smartphone')}`}
      </div>
      <div class="card">${d.rows.length ? `<div class="table-wrap"><table>
        <tr><th>#</th><th>${t('Vaqt')}</th><th>${t('Joy')}</th><th>${t('Ofitsant')}</th><th class="right">${icon('users', 15)}</th><th class="right">${t('Jami')}</th><th>${cancelled ? t('Sabab') : t("To'lov")}</th></tr>
        ${d.rows.map((o) => `<tr class="clickable" data-view="${o.id}"><td><b>${o.id}</b></td><td>${fmtDateTime(o.closed_at)}</td>
          <td>${o.takeaway ? `${icon('shopping-bag', 15)} ${esc(o.label || t('Olib ketish'))}` : `${esc(o.room_number)} · ${esc(o.room_name)}`}</td>
          <td>${esc(o.waiter_name)}</td><td class="right">${o.guests}</td><td class="right num"><b>${money(o.total)}</b></td>
          <td class="small">${cancelled ? esc(o.cancel_reason || '—') : ['cash', 'card', 'transfer'].filter((m) => o[`paid_${m}`]).map((m) => icon(METHOD_ICONS[m], 16)).join(' ')}</td></tr>`).join('')}
      </table></div>
      ${d.rows.length < s.count ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" id="h-more">${t("Yana ko'rsatish")} (${d.rows.length} / ${s.count})</button></div>` : ''}`
      : emptyState('receipt', h.period === 'today' ? t('Bugun hali chek yopilmagan') : t("Bu davrda chek yo'q"))}</div>`;
  },
  bind(root, d) {
    const h = UI.hist;
    root.querySelectorAll('[data-hp]').forEach((b) => b.onclick = () => { h.period = b.dataset.hp; refreshView(); });
    root.querySelectorAll('[data-hs]').forEach((b) => b.onclick = () => { h.status = b.dataset.hs; refreshView(); });
    const f = root.querySelector('#h-from'); const to = root.querySelector('#h-to');
    if (f) f.onchange = to.onchange = () => { h.from = f.value; h.to = to.value; refreshView(); };
    const q = root.querySelector('#h-q');
    let timer;
    q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { h.q = q.value.trim(); refreshView(); }, 350); };
    const more = root.querySelector('#h-more');
    if (more) more.onclick = async () => {
      more.disabled = true;
      try { const next = await GET(`/api/checks?${histQuery({ limit: 200, offset: d.rows.length })}`); renderView({ ...d, rows: [...d.rows, ...next.rows] }); } catch (e) { toastError(e); more.disabled = false; }
    };
    root.querySelectorAll('[data-view]').forEach((b) => b.onclick = async () => {
      let o;
      try { o = await GET(`/api/orders/${b.dataset.view}`); } catch (e) { return toastError(e); }
      if (o.status === 'closed') LocalBackup.save(o);
      const share = perPerson(o);
      openModal({
        title: `${icon('receipt')} ${t('Chek')} #${o.id} · ${esc(placeName(o))}`, size: 'wide',
        body: `<p class="small muted">${icon('clock', 13)} ${fmtDateTime(o.opened_at)} → ${fmtDateTime(o.closed_at)} · ${icon('user-round', 13)} ${esc(o.waiter.name)}
          ${o.cashier ? ` · ${icon('wallet', 13)} ${esc(o.cashier.name)}` : ''} · ${icon('users', 13)} ${o.guests}${o.print_count ? ` · ${icon('printer', 13)} ${o.print_count}` : ''}</p>
          <div class="receipt" style="background:var(--panel-2);border-radius:14px;padding:8px 14px">${o.items.map((i) => `<div class="line ${i.status === 'cancelled' ? 'cancelled' : ''}"><span class="q">${i.qty}×</span><span class="n">${esc(i.name)}</span><span class="p">${money(i.price * i.qty)}</span></div>`).join('')}</div>
          <div class="sum-rows num" style="margin-top:12px"><span>${t('Taomlar')}</span><span class="right">${money(o.subtotal)}</span>
            ${o.service_amount ? `<span>${esc(serviceLabel(o))}</span><span class="right">${money(o.service_amount)}</span>` : ''}
            ${o.discount ? `<span>${t('Chegirma')}</span><span class="right">−${money(o.discount)}</span>` : ''}
            <span class="total">${t('Jami')}</span><span class="total right">${money(o.total)}</span>
            ${share ? `<span class="share">${t('{0} kishi — har biriga', o.guests)}</span><span class="share right">${money(share)}</span>` : ''}
            ${['cash', 'card', 'transfer'].filter((m) => o[`paid_${m}`]).map((m) => `<span>${methodName(m)}</span><span class="right">${money(o[`paid_${m}`])}</span>`).join('')}</div>`,
        actions: [{ label: t('Yopish') }, ...(o.status === 'closed' && (App.user.perms || {}).print ? [{ label: t('Chop etish'), cls: 'primary', icon: 'printer', onClick: () => { printCheck(o.id); return false; } }] : [])],
      });
    });
    root.querySelector('#hist-export').onclick = async () => {
      try {
        const res = await fetch(`/api/checks/export?${histQuery()}`, { headers: { Authorization: `Bearer ${App.token}` } });
        if (!res.ok) throw new Error(tServer((await res.json()).error));
        downloadBlob(`cheklar_${h.period}_${localDay()}.csv`, await res.blob());
      } catch (e) { toastError(e); }
    };
  },
};

// ---------- Reports: income, expenses, profit ----------
Views.reports = {
  title: () => t('Hisobot'), icon: () => 'chart-column', roles: ['owner', 'admin', 'cashier'], refreshOn: ['finance'], module: 'reports',
  async load() { const r = periodRange(); return { rep: await GET(`/api/reports?from=${r.from}&to=${r.to}`) }; },
  render({ rep: r }) {
    const s = r.sales;
    return `<div class="page-head"><h1>${t('Hisobot')}</h1><button class="btn" id="csv">${icon('file-spreadsheet', 18)} Excel</button></div>
      ${periodPicker()}
      <div class="kpis">
        ${kpi(t('Kirim'), money(r.gross_income), t('{0} chek · o\'rtacha {1}', s.orders, moneyText(s.avg_check)), 'good', 'trending-up')}
        ${kpi(t('Chiqim'), money(r.expense), '', 'bad', 'arrow-right-left')}
        ${kpi(t('Foyda'), money(r.net_profit), '', r.net_profit >= 0 ? 'good' : 'bad', 'coins')}
        ${kpi(t('Mehmonlar'), s.guests, `${t('Xizmat haqi')}: ${money(s.service)}`, '', 'users')}
      </div>
      <div class="card"><div class="card-head"><h2>${r.hourly ? t("Soatlar bo'yicha") : t("Kunlar bo'yicha")}</h2></div>${barChart(r.series)}</div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>${t("To'lov turlari")}</h2></div>
          ${hbars([{ label: t('Naqd'), value: s.cash }, { label: t('Karta'), value: s.card }, { label: t("O'tkazma"), value: s.transfer }, ...(r.other_income ? [{ label: t('Boshqa kirim'), value: r.other_income }] : [])])}</div>
        <div class="card"><div class="card-head"><h2>${t('Xarajatlar')}</h2></div>${hbars(r.expense_by_category.map((x) => ({ label: x.key, value: x.value })), { red: true })}</div>
        <div class="card"><div class="card-head"><h2>${t('Eng ko\'p sotilgan')}</h2></div>${hbars(r.dishes.slice(0, 8).map((d) => ({ label: `${d.name} (${d.qty})`, value: d.revenue })))}</div>
        <div class="card"><div class="card-head"><h2>${t('Ofitsantlar')}</h2></div>${hbars(r.waiters.map((w) => ({ label: `${w.name} (${w.orders})`, value: w.total })))}</div>
      </div>`;
  },
  bind(root, { rep: r }) {
    bindPeriod(root);
    root.querySelector('#csv').onclick = async () => {
      const txs = moduleOn('finance') ? await GET(`/api/transactions?from=${r.from}&to=${r.to}`) : [];
      downloadCsv(`hisobot_${localDay(r.from)}_${localDay(r.to - 1)}.csv`, [
        [t('Hisobot'), `${fmtDate(r.from)} — ${fmtDate(r.to - 1)}`], [],
        [t('Kirim'), r.gross_income], [t('Chiqim'), r.expense], [t('Foyda'), r.net_profit], [t('Cheklar'), r.sales.orders],
        [t('Naqd'), r.sales.cash], [t('Karta'), r.sales.card], [t("O'tkazma"), r.sales.transfer], [t('Xizmat haqi'), r.sales.service], [t('Chegirma'), r.sales.discount], [],
        [t('Taomlar')], ...r.dishes.map((d) => [d.name, d.qty, d.revenue]), [],
        [t('Kirim-chiqim')], ...txs.map((x) => [fmtDateTime(x.created_at), x.type === 'income' ? t('Kirim') : t('Chiqim'), x.category, methodName(x.method), x.amount, x.note]),
      ]);
    };
  },
};

// ---------- Cash book ----------
function openTransaction(type) {
  const cats = type === 'expense' ? App.settings.expense_categories : App.settings.income_categories;
  openModal({
    title: `${icon(type === 'expense' ? 'minus' : 'plus')} ${type === 'expense' ? t('Xarajat') : t('Kirim')}`,
    body: `<div class="form-grid">
      <label class="field">${t('Summa')}<input type="number" name="amount" min="1" required></label>
      <label class="field">${t('Kategoriya')}<select name="category">${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="field">${t("To'lov turi")}<select name="method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label>
      </div><label class="field" style="margin-top:12px">${t('Izoh')}<input name="note" placeholder="${esc(t("Masalan: 20 kg go'sht"))}"></label>`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: type === 'expense' ? 'warn' : 'primary', onClick: async (f) => {
      const d = formData(f);
      if (!d.amount) { toast(t('Summani kiriting'), 'warn'); return false; }
      await POST('/api/transactions', { ...d, type });
      toast(t('Saqlandi'), 'ok');
      refreshView();
    } }],
  });
}

Views.finance = {
  title: () => t('Kirim-chiqim'), icon: () => 'arrow-right-left', roles: ['owner', 'admin', 'cashier'], refreshOn: ['finance'], module: 'finance',
  async load() { const r = periodRange(); return { txs: await GET(`/api/transactions?from=${r.from}&to=${r.to}`) }; },
  render({ txs }) {
    const f = UI.txFilter || 'all';
    const list = txs.filter((x) => f === 'all' || (f === 'sales' ? x.order_id : f === 'income' ? x.type === 'income' && !x.order_id : x.type === f));
    const inc = txs.filter((x) => x.type === 'income').reduce((s, x) => s + x.amount, 0);
    const exp = txs.filter((x) => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
    return `<div class="page-head"><h1>${t('Kirim-chiqim')}</h1>
      <button class="btn" id="add-income">${icon('plus', 18)} ${t('Kirim')}</button><button class="btn warn" id="add-expense">${icon('minus', 18)} ${t('Xarajat')}</button></div>
      ${periodPicker()}
      <div class="kpis">${kpi(t('Kirim'), money(inc), '', 'good', 'plus')}${kpi(t('Chiqim'), money(exp), '', 'bad', 'minus')}${kpi(t('Balans'), money(inc - exp), '', inc - exp >= 0 ? '' : 'bad', 'wallet')}</div>
      <div class="card"><div class="seg" style="margin-bottom:12px">${[['all', t('Hammasi')], ['sales', t('Savdo')], ['income', t('Boshqa kirim')], ['expense', t('Xarajatlar')]]
        .map(([k, n]) => `<button class="${f === k ? 'active' : ''}" data-f="${k}">${n}</button>`).join('')}</div>
      ${list.length ? `<div class="table-wrap"><table><tr><th>${t('Vaqt')}</th><th>${t('Kategoriya')}</th><th>${t('Izoh')}</th><th class="right">${t('Summa')}</th><th></th></tr>
        ${list.map((x) => `<tr><td>${fmtDateTime(x.created_at)}</td><td>${icon(x.type === 'income' ? 'plus' : 'minus', 15)} ${esc(x.category)} <span class="muted small">· ${methodName(x.method)}</span></td>
          <td class="small">${esc(x.note)}${x.user_name ? ` <span class="muted">· ${esc(x.user_name)}</span>` : ''}</td>
          <td class="right num" style="color:${x.type === 'expense' ? 'var(--red)' : 'var(--green)'}"><b>${x.type === 'expense' ? '−' : '+'}${money(x.amount)}</b></td>
          <td class="actions">${App.user.role === 'owner' && !x.order_id ? `<button class="icon-btn ghost danger" data-del="${x.id}">${icon('trash-2', 18)}</button>` : ''}</td></tr>`).join('')}
      </table></div>` : emptyState('arrow-right-left', t("Bu davrda yozuv yo'q"))}</div>`;
  },
  bind(root) {
    bindPeriod(root);
    root.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { UI.txFilter = b.dataset.f; renderView(currentData); });
    root.querySelector('#add-expense').onclick = () => openTransaction('expense');
    root.querySelector('#add-income').onclick = () => openTransaction('income');
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal(t("O'chirish"), t("Bu yozuv o'chirilsinmi?"), t("O'chirish")))) return;
      try { await DEL(`/api/transactions/${b.dataset.del}`); refreshView(); } catch (e) { toastError(e); }
    });
  },
};

// ---------- Payroll (boss only) ----------
const MONTHS = () => [t('Yanvar'), t('Fevral'), t('Mart'), t('Aprel'), t('May'), t('Iyun'), t('Iyul'), t('Avgust'), t('Sentabr'), t('Oktabr'), t('Noyabr'), t('Dekabr')];
const PAY_TYPES = () => ({ monthly: t('Oylik'), daily: t('Kunlik'), none: t('Faqat foiz') });
const ENTRY_TYPES = () => ({ payment: [t("To'lov"), 'served', 'banknote'], bonus: [t('Bonus'), 'ready', 'gift'], fine: [t('Jarima'), 'red', 'triangle-alert'] });
UI.payMonth = UI.payMonth || localDay().slice(0, 7);
function monthTitle(m) { const [y, mm] = m.split('-').map(Number); return `${MONTHS()[mm - 1]} ${y}`; }
function shiftMonth(m, n) { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function rateText(r) {
  if (!r) return `<span class="chip red">${t('Belgilanmagan')}</span>`;
  const base = r.pay_type === 'none' ? '' : `${PAY_TYPES()[r.pay_type]}: ${money(r.amount)}`;
  return `${base}${r.sales_pct ? `${base ? ' + ' : ''}${t('{0}% savdodan', r.sales_pct)}` : ''}`;
}
function balanceHtml(b) {
  if (b > 0) return `<b style="color:var(--orange)">${t('Berish kerak')}: ${money(b)}</b>`;
  if (b < 0) return `<b style="color:var(--blue)">${t('Avans')}: ${money(-b)}</b>`;
  return `<span class="chip green">${t('Teng')}</span>`;
}

Views.payroll = {
  title: () => t('Ish haqi'), icon: () => 'hand-coins', roles: ['owner'], refreshOn: ['finance'], module: 'payroll',
  async load() { return GET(`/api/payroll?month=${UI.payMonth}`); },
  render(d) {
    const tt = d.totals;
    const att = new Map(d.attendance.map((a) => [`${a.user_id}|${a.day}`, a.source]));
    return `<div class="page-head"><h1>${t('Ish haqi')}</h1>
      <button class="icon-btn" data-month="-1">${icon('chevron-left')}</button><b>${monthTitle(d.month)}</b><button class="icon-btn" data-month="1">${icon('chevron-right')}</button></div>
      <div class="kpis">
        ${kpi(t('Hisoblangan'), money(tt.accrued), '', '', 'hand-coins')}
        ${kpi(t('Berilgan'), money(tt.paid), '', '', 'banknote')}
        ${kpi(t('Bonus / jarima'), `${money(tt.bonus)} / ${money(tt.fine)}`, '', '', 'gift')}
        ${kpi(t('Choyxona qarzi'), money(tt.owed), t('xodimlarga berish kerak'), tt.owed ? 'warn' : 'good', 'wallet')}
      </div>
      <div class="card"><div class="card-head"><h2>${t('Xodimlar')}</h2></div>
      ${d.staff.length ? `<div class="table-wrap"><table>
        <tr><th>${t('Xodim')}</th><th>${t('Maosh')}</th><th class="right">${t('Kun')}</th><th class="right">${t('Hisoblangan')}</th><th class="right">${t('Berilgan')}</th><th>${t('Holat')}</th><th></th></tr>
        ${d.staff.map((r) => `<tr style="${r.active ? '' : 'opacity:.6'}">
          <td><div class="row" style="flex-wrap:nowrap"><span class="avatar ${r.role}">${esc(initials(r.name))}</span><div><b>${esc(r.name)}</b><br><span class="small muted">${roleName(r.role)}</span></div></div></td>
          <td class="small">${rateText(r.rate)}</td><td class="right">${r.days_worked}</td>
          <td class="right num">${money(r.accrued)}${r.bonus || r.fine ? `<br><span class="small muted">+${num(r.bonus)} / −${num(r.fine)}</span>` : ''}</td>
          <td class="right num">${r.paid ? money(r.paid) : '—'}</td><td>${balanceHtml(r.balance)}</td>
          <td class="actions"><button class="btn sm primary" data-pay="${r.id}">${icon('banknote', 16)} ${t("To'lash")}</button>
            <button class="icon-btn" data-bonus="${r.id}" title="${esc(t('Bonus'))}">${icon('gift', 18)}</button>
            <button class="icon-btn" data-fine="${r.id}" title="${esc(t('Jarima'))}">${icon('triangle-alert', 18)}</button>
            <button class="icon-btn" data-rate="${r.id}" title="${esc(t('Maosh'))}">${icon('sliders-horizontal', 18)}</button>
            <button class="icon-btn" data-hist="${r.id}" title="${esc(t('Tarix'))}">${icon('history', 18)}</button></td></tr>`).join('')}
      </table></div>` : emptyState('users', t("Xodimlar yo'q"))}</div>
      <div class="card"><div class="card-head"><h2>${t('Davomat')}</h2><span class="small muted">${t('Tizimga kirgan kun o\'zi belgilanadi. Bosib o\'zgartiring.')}</span></div>
        <div class="table-wrap"><table class="att">
          <tr><th>${t('Xodim')}</th>${d.days.map((day) => `<th class="c ${day === d.today ? 'today' : ''}">${Number(day.slice(8))}</th>`).join('')}<th class="right">${t('Jami')}</th></tr>
          ${d.staff.filter((r) => r.active).map((r) => `<tr><td><b>${esc(r.name)}</b></td>${d.days.map((day) => {
            const src = att.get(`${r.id}|${day}`);
            const on = src && src !== 'absent';
            return `<td class="c ${day === d.today ? 'today' : ''}"><button class="att-cell ${on ? 'on' : src === 'absent' ? 'off' : ''}" ${day > d.today ? 'disabled' : ''}
              data-att="${r.id}" data-day="${day}" data-on="${on ? 1 : 0}" title="${day}">${on ? '✓' : src === 'absent' ? '✕' : ''}</button></td>`;
          }).join('')}<td class="right"><b>${r.days_worked}</b></td></tr>`).join('')}
        </table></div></div>`;
  },
  bind(root, d) {
    const byId = (id) => d.staff.find((r) => r.id === Number(id));
    root.querySelectorAll('[data-month]').forEach((b) => b.onclick = () => { UI.payMonth = shiftMonth(UI.payMonth, Number(b.dataset.month)); refreshView(); });
    root.querySelectorAll('[data-att]').forEach((b) => b.onclick = async () => {
      try { await POST('/api/payroll/attendance', { user_id: Number(b.dataset.att), day: b.dataset.day, present: b.dataset.on !== '1' }); refreshView(); } catch (e) { toastError(e); }
    });
    root.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => payEntry(byId(b.dataset.pay), 'payment'));
    root.querySelectorAll('[data-bonus]').forEach((b) => b.onclick = () => payEntry(byId(b.dataset.bonus), 'bonus'));
    root.querySelectorAll('[data-fine]').forEach((b) => b.onclick = () => payEntry(byId(b.dataset.fine), 'fine'));
    root.querySelectorAll('[data-rate]').forEach((b) => b.onclick = () => payRate(byId(b.dataset.rate)));
    root.querySelectorAll('[data-hist]').forEach((b) => b.onclick = () => payHistory(byId(b.dataset.hist)));
  },
};

function payEntry(r, type) {
  const [name, , ic] = ENTRY_TYPES()[type];
  const today = localDay();
  openModal({
    title: `${icon(ic)} ${esc(r.name)} — ${name}`,
    body: `${type === 'payment' ? `<p>${balanceHtml(r.balance)}</p>` : ''}
      <div class="form-grid">
        <label class="field">${t('Summa')}<input type="number" name="amount" min="1" required value="${type === 'payment' && r.balance > 0 ? r.balance : ''}"></label>
        ${type === 'payment' ? `<label class="field">${t("To'lov turi")}<select name="method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label>` : ''}
        <label class="field">${t('Sana')}<input type="date" name="day" value="${today}" max="${today}"></label></div>
      <label class="field" style="margin-top:12px">${type === 'fine' ? t('Sabab (majburiy)') : t('Izoh')}<input name="note" ${type === 'fine' ? 'required' : ''}></label>
      ${type === 'payment' ? `<p class="small muted" style="margin-top:10px">${t("To'lov kassada \"Ish haqi\" xarajati bo'lib yoziladi.")}</p>` : ''}`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: type === 'fine' ? 'danger' : 'primary', onClick: async (f) => {
      const x = formData(f);
      if (!x.amount) { toast(t('Summani kiriting'), 'warn'); return false; }
      await POST('/api/payroll/entries', { ...x, user_id: r.id, type, amount: Number(x.amount) });
      toast(t('Saqlandi'), 'ok'); refreshView();
    } }],
  });
}

function payRate(r) {
  const cur = r.rate || { pay_type: r.role === 'waiter' ? 'daily' : 'monthly', amount: '', sales_pct: 0 };
  const form = openModal({
    title: `${icon('sliders-horizontal')} ${esc(r.name)} — ${t('Maosh')}`,
    body: `<div class="form-grid">
        <label class="field">${t('Maosh turi')}<select name="pay_type">${Object.entries(PAY_TYPES()).map(([k, v]) => `<option value="${k}" ${cur.pay_type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field" id="amount-f">${t('Summa')}<input type="number" name="amount" min="0" value="${cur.amount}"></label>
        <label class="field">${t('Savdodan foiz, %')}<input type="number" name="sales_pct" min="0" max="50" step="0.5" value="${cur.sales_pct || 0}"></label>
        <label class="field">${t('Qachondan')}<input type="date" name="from_day" value="${r.rate ? localDay() : ''}"></label></div>
      <p class="small muted" style="margin-top:10px">${t("Oylik — har kuni bir kunlik ulush. Kunlik — faqat kelgan kunlar. Foiz — ofitsantning yopilgan cheklaridan.")}</p>`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
      const x = formData(f);
      await PUT(`/api/payroll/rates/${r.id}`, { pay_type: x.pay_type, amount: Number(x.amount) || 0, sales_pct: Number(x.sales_pct) || 0, from_day: x.from_day });
      toast(t('Saqlandi'), 'ok'); refreshView();
    } }],
  });
  const sync = () => { form.querySelector('#amount-f').style.display = form.pay_type.value === 'none' ? 'none' : ''; };
  form.pay_type.onchange = sync; sync();
}

async function payHistory(r) {
  let h;
  try { h = await GET(`/api/payroll/users/${r.id}`); } catch (e) { return toastError(e); }
  openModal({
    title: `${icon('history')} ${esc(r.name)}`, size: 'wide',
    body: `<p>${balanceHtml(h.balance)}</p>
      ${h.entries.length ? `<div class="table-wrap"><table><tr><th>${t('Sana')}</th><th>${t('Turi')}</th><th class="right">${t('Summa')}</th><th>${t('Izoh')}</th><th></th></tr>
        ${h.entries.map((e) => { const [n, c, ic] = ENTRY_TYPES()[e.type]; return `<tr><td>${esc(e.day)}</td><td><span class="chip ${c}">${icon(ic, 14)} ${n}</span></td>
          <td class="right num">${money(e.amount)}</td><td>${esc(e.note)}</td>
          <td class="actions"><button type="button" class="icon-btn ghost danger" data-del-entry="${e.id}">${icon('trash-2', 18)}</button></td></tr>`; }).join('')}
      </table></div>` : `<p class="muted">${t("Hali yozuv yo'q")}</p>`}`,
    actions: [{ label: t('Yopish') }],
    onMount: (f) => f.querySelectorAll('[data-del-entry]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal(t("O'chirish"), t("Bu yozuv o'chirilsinmi?"), t("O'chirish")))) return;
      try { await DEL(`/api/payroll/entries/${b.dataset.delEntry}`); toast(t("O'chirildi"), 'ok'); refreshView(); } catch (e) { toastError(e); }
    }),
  });
}

// ---------- Reservations ----------
Views.reservations = {
  title: () => t('Bronlar'), icon: () => 'calendar', roles: ['owner', 'admin', 'cashier'], refreshOn: ['rooms'], module: 'reservations',
  async load() {
    const [list, rooms] = await Promise.all([GET(`/api/reservations?from=${dayStart().getTime()}`), GET('/api/rooms?all=1')]);
    return { list, rooms };
  },
  render({ list }) {
    const st = { active: `<span class="chip new">${t('Kutilmoqda')}</span>`, arrived: `<span class="chip green">${t('Keldi')}</span>`, cancelled: `<span class="chip red">${t('Bekor')}</span>` };
    return `<div class="page-head"><h1>${t('Bronlar')}</h1><button class="btn primary" id="add">${icon('plus', 18)} ${t('Yangi bron')}</button></div>
      <div class="card">${list.length ? `<div class="table-wrap"><table><tr><th>${t('Vaqt')}</th><th>${t('Xona')}</th><th>${t('Mijoz')}</th><th class="right">${icon('users', 15)}</th><th class="right">${t('Avans')}</th><th></th><th></th></tr>
        ${list.map((x) => `<tr><td><b>${fmtDateTime(x.starts_at)}</b></td><td>${esc(x.room_number)} · ${esc(x.room_name)}</td>
          <td>${esc(x.customer)}<br><span class="small muted">${esc(x.phone)}${x.note ? ` · ${esc(x.note)}` : ''}</span></td>
          <td class="right">${x.guests}</td><td class="right num">${x.deposit ? money(x.deposit) : '—'}</td><td>${st[x.status]}</td>
          <td class="actions">${x.status === 'active' ? `<button class="btn sm ok" data-st="arrived" data-id="${x.id}">${icon('check', 16)}</button>
            <button class="icon-btn" data-edit="${x.id}">${icon('pencil', 18)}</button><button class="icon-btn danger" data-st="cancelled" data-id="${x.id}">${icon('x', 18)}</button>` : ''}</td></tr>`).join('')}
      </table></div>` : emptyState('calendar', t("Kelgusi bronlar yo'q"))}</div>`;
  },
  bind(root, { list, rooms }) {
    const edit = (x = {}) => openModal({
      title: `${icon('calendar')} ${x.id ? t('Bronni tahrirlash') : t('Yangi bron')}`,
      body: `<div class="form-grid">
        <label class="field">${t('Xona')}<select name="room_id">${rooms.filter((r) => r.active).map((r) => `<option value="${r.id}" ${r.id === x.room_id ? 'selected' : ''}>${esc(r.number)} · ${esc(r.name)} (${r.capacity})</option>`).join('')}</select></label>
        <label class="field">${t('Sana va vaqt')}<input type="datetime-local" name="starts_at" value="${toLocalInput(x.starts_at || Date.now() + 3600000)}" required></label>
        <label class="field">${t('Mijoz')}<input name="customer" value="${esc(x.customer || '')}" required></label>
        <label class="field">${t('Telefon')}<input name="phone" type="tel" value="${esc(x.phone || '+998 ')}"></label>
        <label class="field">${t('Mehmonlar')}<input type="number" name="guests" min="1" value="${x.guests || 10}"></label>
        <label class="field">${t('Avans')}<input type="number" name="deposit" min="0" value="${x.deposit || 0}"></label>
        <label class="field">${t('Avans turi')}<select name="deposit_method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label>
      </div><label class="field" style="margin-top:12px">${t('Izoh')}<textarea name="note">${esc(x.note || '')}</textarea></label>`,
      actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
        const d = formData(f);
        d.room_id = Number(d.room_id);
        d.starts_at = new Date(d.starts_at).getTime();
        if (x.id) await PUT(`/api/reservations/${x.id}`, d); else await POST('/api/reservations', d);
        toast(t('Saqlandi'), 'ok'); refreshView();
      } }],
    });
    root.querySelector('#add').onclick = () => edit();
    root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => edit(list.find((x) => x.id === Number(b.dataset.edit))));
    root.querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => {
      try { await POST(`/api/reservations/${b.dataset.id}/status`, { status: b.dataset.st }); refreshView(); } catch (e) { toastError(e); }
    });
  },
};

// ---------- Menu (with "Tugadi" switches) ----------
Views.menuadmin = {
  title: () => t('Menyu'), icon: () => 'utensils', roles: ['owner', 'admin'], refreshOn: ['menu'],
  async load() { return GET('/api/menu'); },
  render({ categories, dishes }) {
    const groups = [...categories, { id: null, name: t("Bo'limsiz"), icon: '' }].map((c) => ({ c, ds: dishes.filter((d) => (d.category_id ?? null) === c.id) }));
    return `<div class="page-head"><h1>${t('Menyu')}</h1>
      <button class="btn" id="add-cat">${icon('plus', 18)} ${t("Bo'lim")}</button><button class="btn primary" id="add-dish">${icon('plus', 18)} ${t('Taom')}</button></div>
      ${groups.filter((g) => g.c.id || g.ds.length).map(({ c, ds }) => `<div class="card"><div class="card-head"><h2>${esc(c.icon)} ${esc(c.name)}</h2>
        ${c.id ? `<button class="icon-btn" data-edit-cat="${c.id}">${icon('pencil', 18)}</button><button class="icon-btn danger" data-del-cat="${c.id}">${icon('trash-2', 18)}</button>` : ''}</div>
        ${ds.length ? `<div class="table-wrap"><table>
        ${ds.map((d) => `<tr><td style="width:44px;font-size:24px">${esc(d.icon)}</td><td><b>${esc(d.name)}</b><br><span class="small muted">${d.needs_kitchen ? `${icon('chef-hat', 13)} ${d.prep_minutes} ${t('daq')}` : `${icon('check', 13)} ${t('Darhol')}`}</span></td>
          <td class="right num"><b>${money(d.price)}</b></td>
          <td class="actions">${d.available ? `<button class="btn sm" data-stop="${d.id}" title="${esc(t('Tugadi'))}">${icon('ban', 16)}</button>` : `<button class="btn sm danger" data-start="${d.id}">${icon('ban', 16)} ${t('Tugadi')}</button>`}
            <button class="icon-btn" data-edit="${d.id}">${icon('pencil', 18)}</button><button class="icon-btn danger" data-del="${d.id}">${icon('trash-2', 18)}</button></td></tr>`).join('')}
        </table></div>` : `<p class="muted">${t("Bu bo'limda taom yo'q")}</p>`}</div>`).join('')}`;
  },
  bind(root, { categories, dishes }) {
    const editCat = (c = {}) => openModal({
      title: `${icon('list')} ${c.id ? t("Bo'limni tahrirlash") : t("Yangi bo'lim")}`,
      body: `<div class="form-grid"><label class="field">${t('Nomi')}<input name="name" value="${esc(c.name || '')}" required></label>
        <label class="field">${t('Belgi (emoji)')}<input name="icon" value="${esc(c.icon || '🍽️')}"></label>
        <label class="field">${t('Tartib')}<input type="number" name="sort" value="${c.sort ?? categories.length}"></label></div>`,
      actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
        const d = formData(f);
        if (c.id) await PUT(`/api/categories/${c.id}`, d); else await POST('/api/categories', d);
        refreshView();
      } }],
    });
    const editDish = (d = {}) => openModal({
      title: `${icon('utensils')} ${d.id ? esc(d.name) : t('Yangi taom')}`, size: 'wide',
      body: `<div class="form-grid">
        <label class="field">${t('Nomi')}<input name="name" value="${esc(d.name || '')}" required></label>
        <label class="field">${t("Bo'lim")}<select name="category_id"><option value="">—</option>${categories.map((c) => `<option value="${c.id}" ${c.id === d.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field">${t('Narxi')}<input type="number" name="price" min="0" value="${d.price ?? ''}" required></label>
        <label class="field">${t('Tannarxi')}<input type="number" name="cost" min="0" value="${d.cost ?? 0}"></label>
        <label class="field">${t('Tayyorlash vaqti (daq)')}<input type="number" name="prep_minutes" min="0" value="${d.prep_minutes ?? 15}"></label>
        <label class="field">${t('Belgi (emoji)')}<input name="icon" value="${esc(d.icon || '🍽️')}"></label>
        <label class="field">${t("Qoldiq (bo'sh = cheksiz)")}<input type="number" name="stock" min="0" value="${d.stock ?? ''}"></label>
        <input type="hidden" name="unit" value="${esc(d.unit || 'porsiya')}"></div>
        <label class="check" style="margin-top:14px"><input type="checkbox" name="needs_kitchen" ${d.needs_kitchen === 0 ? '' : 'checked'}> ${icon('chef-hat', 18)} ${t('Oshxonada tayyorlanadi')}</label>`,
      actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
        const x = formData(f);
        x.category_id = x.category_id ? Number(x.category_id) : null;
        x.stock = x.stock === '' ? null : x.stock;
        if (d.id) await PUT(`/api/dishes/${d.id}`, x); else await POST('/api/dishes', x);
        toast(t('Saqlandi'), 'ok'); refreshView();
      } }],
    });
    root.querySelector('#add-cat').onclick = () => editCat();
    root.querySelector('#add-dish').onclick = () => editDish();
    root.querySelectorAll('[data-edit-cat]').forEach((b) => b.onclick = () => editCat(categories.find((c) => c.id === Number(b.dataset.editCat))));
    root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editDish(dishes.find((d) => d.id === Number(b.dataset.edit))));
    const avail = async (id, available) => { try { await POST(`/api/dishes/${id}/availability`, { available }); refreshView(); } catch (e) { toastError(e); } };
    root.querySelectorAll('[data-stop]').forEach((b) => b.onclick = () => avail(b.dataset.stop, false));
    root.querySelectorAll('[data-start]').forEach((b) => b.onclick = () => avail(b.dataset.start, true));
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal(t("Taomni o'chirish"), t("Taom menyudan olib tashlansinmi?"), t("O'chirish")))) return;
      try { await DEL(`/api/dishes/${b.dataset.del}`); refreshView(); } catch (e) { toastError(e); }
    });
    root.querySelectorAll('[data-del-cat]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal(t("Bo'limni o'chirish"), t("Bo'lim o'chirilsinmi?"), t("O'chirish")))) return;
      try { await DEL(`/api/categories/${b.dataset.delCat}`); refreshView(); } catch (e) { toastError(e); }
    });
  },
};

// ---------- Staff: PIN and per-person rights ----------
function canEditRole(role) {
  return App.user.role === 'owner' || (App.user.role === 'admin' && ['cashier', 'waiter', 'chef'].includes(role));
}
Views.staff = {
  title: () => t('Xodimlar'), icon: () => 'users', roles: ['owner', 'admin'],
  async load() { return { users: await GET('/api/users') }; },
  render({ users }) {
    const order = ['owner', 'admin', 'cashier', 'waiter', 'chef'];
    return `<div class="page-head"><h1>${t('Xodimlar')}</h1><button class="btn primary" id="add">${icon('plus', 18)} ${t('Xodim')}</button></div>
      <div class="card"><div class="table-wrap"><table>
      ${order.flatMap((role) => users.filter((u) => u.role === role)).map((u) => `<tr style="${u.active ? '' : 'opacity:.5'}" class="${canEditRole(u.role) ? 'clickable' : ''}" data-edit="${u.id}">
        <td><div class="row" style="flex-wrap:nowrap"><span class="avatar ${u.role}">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><br><span class="small muted">${icon(ROLE_ICONS[u.role], 13)} ${roleName(u.role)}</span></div></div></td>
        <td>${u.has_pin ? `<span class="chip green">${icon('key-round', 14)} PIN</span>` : `<span class="chip red">${icon('key-round', 14)} ${t("PIN yo'q")}</span>`}</td>
        <td>${u.perms.print ? `<span class="chip" title="${esc(t('Chek chiqaradi'))}">${icon('printer', 14)}</span>` : ''} ${u.perms.close ? `<span class="chip" title="${esc(t('Chek yopadi'))}">${icon('wallet', 14)}</span>` : ''}</td>
        <td class="small muted">${u.role === 'waiter' ? (u.rooms.map((r) => esc(r.number)).join(', ') || '—') : ''}</td>
        <td class="actions">${u.active ? '' : `<span class="chip">${t('Bloklangan')}</span>`} ${canEditRole(u.role) ? icon('chevron-right', 18) : ''}</td></tr>`).join('')}
      </table></div></div>
      <p class="small muted" style="margin-top:12px">${icon('info', 14)} ${t("Ofitsantni xonaga biriktirish: Sozlamalar → Xonalar.")}</p>`;
  },
  bind(root, { users }) {
    const permSel = (name, val, def) => `<select name="${name}"><option value="" ${val === null ? 'selected' : ''}>${t('Lavozim bo\'yicha')} (${def ? t('Ha') : t("Yo'q")})</option>
      <option value="1" ${val === 1 ? 'selected' : ''}>${t('Ha')}</option><option value="0" ${val === 0 ? 'selected' : ''}>${t("Yo'q")}</option></select>`;
    const DEF = { cashier: [1, 1], waiter: [1, 0], chef: [0, 0] };
    const edit = (u = {}) => {
      const roles = ['owner', 'admin', 'cashier', 'waiter', 'chef'].filter(canEditRole);
      const role = u.role || 'waiter';
      const boss = (r) => r === 'owner' || r === 'admin';
      const form = openModal({
        title: `${icon('user')} ${u.id ? esc(u.name) : t('Yangi xodim')}`, size: 'wide',
        body: `<div class="form-grid">
          <label class="field">${t("To'liq ism")}<input name="name" value="${esc(u.name || '')}" required></label>
          <label class="field">${t('Lavozim')}<select name="role">${roles.map((r) => `<option value="${r}" ${role === r ? 'selected' : ''}>${roleName(r)}</option>`).join('')}</select></label>
          <label class="field"><span id="pin-label"></span><input name="pin" inputmode="numeric" autocomplete="off" placeholder="${u.id ? esc(t("O'zgartirish uchun yozing")) : ''}"></label>
          <label class="field">${t('Telefon')}<input name="phone" type="tel" value="${esc(u.phone || '')}"></label></div>
          <div id="perm-box" style="margin-top:14px"><h3 style="margin-bottom:8px">${t('Huquqlar')}</h3><div class="form-grid">
            <label class="field"><span>${icon('printer', 15)} ${t('Printerdan chek chiqarish')}</span>${permSel('perm_print', u.perm_print ?? null, (DEF[role] || [1])[0])}</label>
            <label class="field"><span>${icon('wallet', 15)} ${t('Chekni yopish (to\'lov qabul qilish)')}</span>${permSel('perm_close', u.perm_close ?? null, (DEF[role] || [1, 1])[1])}</label></div></div>
          <details style="margin-top:14px"><summary class="muted" style="cursor:pointer">${t('Shaxsiy telefon uchun login (ixtiyoriy)')}</summary><div class="form-grid" style="margin-top:10px">
            <label class="field">${t('Login')}<input name="username" autocapitalize="none" value="${esc(u.username || '')}"></label>
            <label class="field">${t('Parol')}<input name="password" autocomplete="new-password"></label></div></details>
          ${u.id && u.id !== App.user.id ? `<label class="check" style="margin-top:14px"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> ${t('Faol (o\'chirilsa tizimga kira olmaydi)')}</label>` : ''}`,
        actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
          const d = formData(f);
          if (!d.pin) delete d.pin;
          if (!d.password) delete d.password;
          if (!d.username) delete d.username;
          d.perm_print = d.perm_print === '' ? null : d.perm_print === '1';
          d.perm_close = d.perm_close === '' ? null : d.perm_close === '1';
          if (!u.id && !d.pin) { toast(t('PIN kiriting'), 'warn'); return false; }
          if (u.id) await PUT(`/api/users/${u.id}`, d); else await POST('/api/users', d);
          toast(t('Saqlandi'), 'ok'); refreshView();
        } }],
      });
      const sync = () => {
        const r = form.role.value;
        form.querySelector('#pin-label').textContent = boss(r) ? t('Parol (4–32 belgi)') : t('PIN (1–4 raqam)');
        form.pin.inputMode = boss(r) ? 'text' : 'numeric';
        form.querySelector('#perm-box').style.display = boss(r) ? 'none' : '';
      };
      form.role.onchange = sync; sync();
    };
    root.querySelector('#add').onclick = () => edit();
    root.querySelectorAll('tr.clickable[data-edit]').forEach((b) => b.onclick = () => edit(users.find((u) => u.id === Number(b.dataset.edit))));
  },
};

// ---------- Settings ----------
const AUDIT_NAMES = () => ({
  login: t('Kirdi'), pin_login: t('PIN bilan kirdi'), order_open: t('Chek ochdi'), items_add: t("Taom qo'shdi"), item_ready: t('Taom tayyor'), item_cancel: t('Taomni bekor qildi'),
  order_close: t('Chekni yopdi'), order_cancel: t('Chekni bekor qildi'), order_transfer: t("Chekni ko'chirdi"), check_print: t('Chek chiqardi'), price_change: t("Narxni o'zgartirdi"),
  dish_create: t("Taom qo'shdi"), dish_update: t('Taomni tahrirladi'), dish_delete: t("Taomni o'chirdi"), dish_stopped: t('Tugadi deb belgiladi'), dish_available: t('Bor deb belgiladi'),
  user_create: t("Xodim qo'shdi"), user_update: t('Xodimni tahrirladi'), expense_add: t("Xarajat qo'shdi"), income_add: t("Kirim qo'shdi"), transaction_delete: t("Yozuvni o'chirdi"),
  shift_open: t('Smena ochdi'), shift_close: t('Smena yopdi'), settings_update: t("Sozlamalarni o'zgartirdi"), room_create: t("Xona qo'shdi"), room_update: t('Xonani tahrirladi'),
  reservation_create: t('Bron qildi'), reservation_update: t('Bronni tahrirladi'), reservation_status: t('Bron holati'), password_change: t("Parolini o'zgartirdi"), pin_change: t("PIN o'zgartirdi"),
  device_add: t('Qurilma uladi'), device_remove: t('Qurilmani uzdi'), pay_payment: t("Ish haqi to'ladi"), pay_bonus: t('Bonus yozdi'), pay_fine: t('Jarima yozdi'),
});
const SETTINGS_TABS = () => [
  ['general', 'store', t('Muassasa'), ['owner', 'admin']],
  ['rooms', 'door-open', t('Xonalar'), ['owner', 'admin']],
  ['rights', 'shield-check', t('Ruxsatlar'), ['owner', 'admin']],
  ['devices', 'monitor-smartphone', t('Qurilmalar'), ['owner', 'admin']],
  ['audit', 'history', t('Amallar tarixi'), ['owner', 'admin'], 'audit'],
  ['backup', 'database', t('Zaxira'), ['owner', 'admin', 'cashier']],
  ['me', 'user', t('Mening sozlamalarim'), ['owner', 'admin', 'cashier', 'waiter', 'chef']],
];

Views.settings = {
  title: () => t('Sozlamalar'), icon: () => 'settings', roles: ['owner', 'admin', 'cashier', 'waiter', 'chef'], refreshOn: ['settings'],
  tabs() { return SETTINGS_TABS().filter(([, , , roles, mod]) => roles.includes(App.user.role) && moduleOn(mod)); },
  async load() {
    const tabs = this.tabs();
    if (!tabs.some(([k]) => k === UI.settingsTab)) UI.settingsTab = tabs[0][0];
    const tab = UI.settingsTab;
    const data = { tab };
    if (tab === 'rooms') [data.rooms, data.users] = await Promise.all([GET('/api/rooms?all=1'), GET('/api/users')]);
    if (tab === 'devices') data.devices = await GET('/api/devices');
    if (tab === 'audit') data.rows = await GET('/api/audit?limit=300');
    if (tab === 'backup') data.local = await LocalBackup.all();
    if (tab === 'me' && App.user.role !== 'owner' && moduleOn('payroll')) data.pay = await GET('/api/my/payroll').catch(() => null);
    return data;
  },
  render(d) {
    const tabs = this.tabs();
    return `<div class="page-head"><h1>${t('Sozlamalar')}</h1></div>
      <div class="seg" style="margin-bottom:16px">${tabs.map(([k, ic, n]) => `<button class="${d.tab === k ? 'active' : ''}" data-tab="${k}">${icon(ic, 16)} ${n}</button>`).join('')}</div>
      ${this[`tab_${d.tab}`](d)}`;
  },
  bind(root, d) {
    root.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { UI.settingsTab = b.dataset.tab; refreshView(); });
    const fn = this[`bind_${d.tab}`];
    if (fn) fn.call(this, root, d);
  },

  tab_general() {
    const s = App.settings;
    return `<form id="org-form" class="card"><div class="form-grid">
        <label class="field">${t('Nomi')}<input name="name" value="${esc(s.name)}"></label>
        <label class="field">${t('Manzil')}<input name="address" value="${esc(s.address)}"></label>
        <label class="field">${t('Telefon')}<input name="phone" value="${esc(s.phone)}"></label>
        <label class="field">${t('Valyuta')}<input name="currency" value="${esc(s.currency)}"></label></div>
      <h3 style="margin:18px 0 10px">${icon('percent', 18)} ${t('Xizmat haqi')}</h3>
      <div class="form-grid">
        <label class="field">${t('Turi')}<select name="service_type"><option value="percent" ${s.service_type !== 'per_guest' ? 'selected' : ''}>${t('Foizda (taomlar summasidan)')}</option>
          <option value="per_guest" ${s.service_type === 'per_guest' ? 'selected' : ''}>${t('Odam boshiga')}</option></select></label>
        <label class="field" id="sv-pct">${t('Foiz, %')}<input type="number" name="service_pct" min="0" max="50" step="0.5" value="${s.service_pct}"></label>
        <label class="field" id="sv-guest">${t('Bir kishi uchun')} (${esc(s.currency)})<input type="number" name="service_per_guest" min="0" step="500" value="${s.service_per_guest}"></label></div>
      <p class="small muted" style="margin-top:8px">${t("Xizmat haqi faqat shu yerda o'zgaradi. Olib ketishda xizmat haqi olinmaydi.")}</p>
      <h3 style="margin:18px 0 10px">${icon('printer', 18)} ${t('Chek')}</h3>
      <div class="form-grid">
        <label class="field">${t('Chek ostidagi matn')}<input name="receipt_footer" value="${esc(s.receipt_footer)}"></label>
        <label class="field">${t('Printer kengligi')}<select name="receipt_width">${['80', '58'].map((w) => `<option value="${w}" ${String(s.receipt_width || '80') === w ? 'selected' : ''}>${w} mm</option>`).join('')}</select></label></div>
      <h3 style="margin:18px 0 10px">${icon('list', 18)} ${t('Kategoriyalar')}</h3>
      <div class="form-grid">
        <label class="field">${t('Xarajat kategoriyalari (har biri yangi qatorda)')}<textarea name="expense_categories" rows="6">${esc(s.expense_categories.join('\n'))}</textarea></label>
        <label class="field">${t('Kirim kategoriyalari')}<textarea name="income_categories" rows="6">${esc(s.income_categories.join('\n'))}</textarea></label></div>
      <button class="btn primary" style="margin-top:16px">${icon('check', 18)} ${t('Saqlash')}</button></form>`;
  },
  bind_general(root) {
    const f = root.querySelector('#org-form');
    const sync = () => {
      f.querySelector('#sv-pct').style.display = f.service_type.value === 'percent' ? '' : 'none';
      f.querySelector('#sv-guest').style.display = f.service_type.value === 'per_guest' ? '' : 'none';
    };
    f.service_type.onchange = sync; sync();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(f);
      d.expense_categories = d.expense_categories.split('\n').map((x) => x.trim()).filter(Boolean);
      d.income_categories = d.income_categories.split('\n').map((x) => x.trim()).filter(Boolean);
      try { App.settings = await PUT('/api/settings', d); toast(t('Saqlandi'), 'ok'); render(); } catch (err) { toastError(err); }
    };
  },

  tab_rooms({ rooms }) {
    return `<div class="card"><div class="card-head"><h2>${t('Xonalar va stollar')}</h2><button class="btn primary" id="add-room">${icon('plus', 18)} ${t('Xona')}</button></div>
      <div class="table-wrap"><table>${rooms.map((r) => `<tr class="clickable" data-room="${r.id}" style="${r.active ? '' : 'opacity:.5'}">
        <td style="width:60px"><b style="font-size:22px">${esc(r.number)}</b></td><td><b>${esc(r.name)}</b><br><span class="small muted">${icon(ROOM_TYPE_ICONS[r.type] || 'door-open', 13)} ${roomTypeName(r.type)} · ${icon('users', 13)} ${r.capacity}</span></td>
        <td>${r.waiters.map((w) => `<span class="chip">${icon('user-round', 13)} ${esc(w.name)}</span>`).join(' ') || `<span class="chip red">${t('Ofitsant yo\'q')}</span>`}</td>
        <td class="actions">${icon('chevron-right', 18)}</td></tr>`).join('')}</table></div></div>`;
  },
  bind_rooms(root, { rooms, users }) {
    const waiters = users.filter((u) => u.role === 'waiter' && u.active);
    const edit = (r = {}) => openModal({
      title: `${icon('door-open')} ${r.id ? esc(r.name) : t('Yangi xona')}`,
      body: `<div class="form-grid">
        <label class="field">${t('Raqami')}<input name="number" value="${esc(r.number || String(rooms.length + 1))}" required></label>
        <label class="field">${t('Nomi')}<input name="name" value="${esc(r.name || '')}" placeholder="Banket 1" required></label>
        <label class="field">${t('Turi')}<select name="type">${ROOM_TYPES.map((k) => `<option value="${k}" ${r.type === k ? 'selected' : ''}>${roomTypeName(k)}</option>`).join('')}</select></label>
        <label class="field">${t("Sig'imi (kishi)")}<input type="number" name="capacity" min="1" value="${r.capacity || 10}"></label></div>
        <h3 style="margin:16px 0 8px">${t('Ofitsantlar')}</h3>
        <div class="stack">${waiters.map((w) => `<label class="check"><input type="checkbox" name="waiter_ids" data-multi="1" value="${w.id}" ${r.waiters && r.waiters.some((x) => x.id === w.id) ? 'checked' : ''}> ${esc(w.name)}</label>`).join('') || `<p class="muted">${t("Avval ofitsant qo'shing")}</p>`}</div>
        ${r.id ? `<label class="check" style="margin-top:14px"><input type="checkbox" name="active" ${r.active ? 'checked' : ''}> ${t('Faol')}</label>` : ''}`,
      actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
        const d = formData(f);
        d.waiter_ids = d.waiter_ids || [];
        d.capacity = Number(d.capacity) || 1;
        if (r.id) await PUT(`/api/rooms/${r.id}`, d); else await POST('/api/rooms', d);
        toast(t('Saqlandi'), 'ok'); refreshView();
      } }],
    });
    root.querySelector('#add-room').onclick = () => edit();
    root.querySelectorAll('[data-room]').forEach((b) => b.onclick = () => edit(rooms.find((r) => r.id === Number(b.dataset.room))));
  },

  tab_rights() {
    const s = App.settings;
    return `<form id="rights-form" class="card">
      <div class="switch-row"><span style="color:var(--red)">${icon('ban', 24)}</span><div class="grow"><b>${t('Ofitsant yuborilgan taomni bekor qila oladi')}</b>
        <span class="small muted">${t("Faqat siz bergan maxsus kod bilan. O'chiq bo'lsa — faqat kassir yoki boshliq bekor qiladi.")}</span></div>
        <input type="checkbox" name="waiter_cancel" ${s.waiter_cancel ? 'checked' : ''}></div>
      <div class="switch-row"><span>${icon('key-round', 24)}</span><div class="grow"><b>${t('Bekor qilish kodi')}</b>
        <span class="small muted">${s.has_cancel_code ? t("Kod o'rnatilgan. Yangisini yozsangiz almashadi.") : t("Kod hali o'rnatilmagan.")}</span></div>
        <input name="cancel_code" inputmode="numeric" placeholder="4–8 ${esc(t('raqam'))}" style="max-width:160px" autocomplete="off"></div>
      <div class="switch-row"><span>${icon('lock', 24)}</span><div class="grow"><b>${t('Avtomatik qulf')}</b>
        <span class="small muted">${t("Umumiy qurilmada shuncha daqiqa hech narsa bosilmasa, xodimlar ro'yxatiga qaytadi. 0 — o'chiq.")}</span></div>
        <input type="number" name="auto_lock_minutes" min="0" max="240" value="${s.auto_lock_minutes}" style="max-width:110px"></div>
      <p class="small muted" style="margin-top:10px">${icon('info', 14)} ${t("Har bir xodimning chek chiqarish va chek yopish huquqi: Xodimlar bo'limida.")}</p>
      <button class="btn primary" style="margin-top:12px">${icon('check', 18)} ${t('Saqlash')}</button></form>`;
  },
  bind_rights(root) {
    const f = root.querySelector('#rights-form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(f);
      if (!d.cancel_code) delete d.cancel_code;
      if (d.waiter_cancel && !App.settings.has_cancel_code && !d.cancel_code) return toast(t('Bekor qilish kodini kiriting'), 'warn');
      try { App.settings = await PUT('/api/settings', d); toast(t('Saqlandi'), 'ok'); refreshView(); } catch (err) { toastError(err); }
    };
  },

  tab_devices({ devices }) {
    return `<div class="card"><div class="card-head"><h2>${t('Ulangan qurilmalar')}</h2></div>
      <p class="small muted">${t("Bu qurilmalarda xodimlar ro'yxati va PIN orqali kiriladi. Yo'qolgan yoki begona qurilmani uzing.")}</p>
      ${devices.length ? `<div class="table-wrap"><table>${devices.map((x) => `<tr><td>${icon('monitor-smartphone', 18)} <b>${esc(x.name)}</b>${App.device && App.device.name === x.name ? ` <span class="chip green">${t('Shu qurilma')}</span>` : ''}</td>
        <td class="small muted">${t('Ulandi')}: ${fmtDateTime(x.created_at)}${x.created_by_name ? ` · ${esc(x.created_by_name)}` : ''}<br>${t('Oxirgi faollik')}: ${fmtDateTime(x.last_seen)}</td>
        <td class="actions"><button class="btn sm red-text" data-del-device="${x.id}">${icon('log-out', 16)} ${t('Uzish')}</button></td></tr>`).join('')}</table></div>`
      : emptyState('monitor-smartphone', t("Ulangan qurilma yo'q"))}</div>`;
  },
  bind_devices(root) {
    root.querySelectorAll('[data-del-device]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal(t('Qurilmani uzish'), t('Bu qurilma uzilsinmi?'), t('Uzish')))) return;
      try { await DEL(`/api/devices/${b.dataset.delDevice}`); refreshView(); } catch (e) { toastError(e); }
    });
  },

  tab_audit({ rows }) {
    const names = AUDIT_NAMES();
    return `<div class="card"><div class="table-wrap"><table><tr><th>${t('Vaqt')}</th><th>${t('Xodim')}</th><th>${t('Amal')}</th><th>${t('Tafsilot')}</th></tr>
      ${rows.map((a) => `<tr><td class="small">${fmtDateTime(a.created_at)}</td><td>${esc(a.user_name || '—')}</td>
        <td>${/cancel|delete|price|print/.test(a.action) ? `<b style="color:var(--red)">${esc(names[a.action] || a.action)}</b>` : esc(names[a.action] || a.action)}</td>
        <td class="small">${esc(a.details)}</td></tr>`).join('')}</table></div></div>`;
  },

  tab_backup({ local }) {
    return `<div class="card"><div class="card-head"><h2>${icon('database')} ${t('Shu kompyuterdagi nusxa')}</h2></div>
      <p>${t("Yopilgan har bir chek shu kompyuter xotirasiga ham avtomatik saqlanadi. Internet yoki server ishlamay qolsa ham ularni ko'rish va yuklab olish mumkin.")}</p>
      <div class="kpis" style="margin:12px 0">${kpi(t('Saqlangan cheklar'), local.length, local.length ? `${fmtDate(local[local.length - 1].closed_at)} — ${fmtDate(local[0].closed_at)}` : '', '', 'database')}</div>
      <div class="row"><button class="btn primary" id="bk-export" ${local.length ? '' : 'disabled'}>${icon('file-spreadsheet', 18)} ${t("Excel'ga yuklash")}</button>
        <button class="btn" id="bk-sync">${icon('refresh-cw', 18)} ${t('Bugungi cheklarni serverdan olish')}</button></div>
      <p class="small muted" style="margin-top:12px">${icon('info', 14)} ${t("Kassa smenasi yopilganda kunlik cheklar Excel fayl bo'lib yuklab olinadi.")}</p></div>`;
  },
  bind_backup(root, { local }) {
    root.querySelector('#bk-export').onclick = () => downloadCsv(`zaxira_cheklar_${localDay()}.csv`, LocalBackup.rows(local));
    root.querySelector('#bk-sync').onclick = async (e) => {
      e.target.disabled = true;
      try {
        const from = dayStart().getTime();
        const list = await GET(`/api/checks?from=${from}&to=${from + 24 * 60 * MIN}&limit=500`);
        const full = [];
        for (const r of list.rows) full.push(await GET(`/api/orders/${r.id}`));
        await LocalBackup.save(full);
        toast(t('{0} ta chek saqlandi', full.length), 'ok');
        refreshView();
      } catch (err) { toastError(err); e.target.disabled = false; }
    };
  },

  tab_me({ pay }) {
    const v = Voice.prefs();
    const voices = Voice.voices();
    const picked = Voice.pick();
    const boss = can('owner', 'admin');
    return `<div class="grid grid-2">
      <div class="card"><div class="card-head"><h2>${icon('languages')} ${t('Til va ko\'rinish')}</h2></div>
        <div class="stack">${langSelect('me-lang')}
          <div class="seg">${[['light', 'sun', t("Yorug'")], ['dark', 'moon', t("Qorong'i")]].map(([k, ic, n]) => `<button class="${(store('cp_theme') || 'light') === k ? 'active' : ''}" data-theme="${k}">${icon(ic, 16)} ${n}</button>`).join('')}</div>
          <button class="btn" id="install">${icon('download', 18)} ${t("Ilovani o'rnatish (ish stoli / telefon)")}</button>
          ${Screen.canFullscreen() ? `<button class="btn" id="full">${icon('maximize', 18)} ${t("To'liq ekran")}</button>` : ''}</div></div>
      <div class="card"><div class="card-head"><h2>${icon('volume-2')} ${t('Ovozli xabar')}</h2></div>
        <form id="voice-form" class="stack">
          <label class="check"><input type="checkbox" name="enabled" ${v.enabled ? 'checked' : ''}> ${t('Ovozli xabarlar yoqilgan')}</label>
          <label class="field">${t('Ovoz')}<select name="voiceURI"><option value="">${t('Avtomatik')} (${picked ? esc(picked.name) : t('topilmadi')})</option>
            ${voices.map((x) => `<option value="${esc(x.voiceURI)}" ${x.voiceURI === v.voiceURI ? 'selected' : ''}>${esc(x.name)} (${esc(x.lang)})</option>`).join('')}</select></label>
          <label class="field">${t('Tezlik')}<input type="range" name="rate" min="0.6" max="1.4" step="0.05" value="${v.rate}"></label>
          <div class="row"><button type="button" class="btn primary" id="test-voice">${icon('volume-2', 18)} ${t("Sinab ko'rish")}</button>
            <button type="button" class="btn" id="notif">${icon('bell', 18)} ${t('Bildirishnomalar')}</button></div></form></div>
      <div class="card"><div class="card-head"><h2>${icon('key-round')} ${boss ? t('Kirish paroli (umumiy qurilma)') : t('PIN kod')}</h2></div>
        <form id="pin-form" class="stack"><label class="field">${boss ? t('Yangi parol (4–32 belgi)') : t('Yangi PIN (1–4 raqam)')}<input name="pin" type="password" ${boss ? '' : 'inputmode="numeric" maxlength="4"'} autocomplete="new-password" required></label>
          <button class="btn primary">${t('Saqlash')}</button></form></div>
      <div class="card"><div class="card-head"><h2>${icon('lock')} ${t('Login paroli')}</h2></div>
        <form id="pw-form" class="stack">
          <label class="field">${t('Eski parol')}<input type="password" name="old_password" required autocomplete="current-password"></label>
          <label class="field">${t('Yangi parol')}<input type="password" name="new_password" required autocomplete="new-password"></label>
          <button class="btn primary">${t("Parolni o'zgartirish")}</button></form></div>
      ${pay ? `<div class="card" style="grid-column:1/-1"><div class="card-head"><h2>${icon('hand-coins')} ${t('Mening ish haqim')}</h2></div>
        <div class="kpis">${kpi(t('Maosh'), rateText(pay.rate), '', '', 'sliders-horizontal')}${kpi(t('Bu oy'), money(pay.accrued), t('{0} ish kuni', pay.days_worked), '', 'calendar')}
          ${kpi(t('Olingan'), money(pay.paid), '', '', 'banknote')}${kpi(t('Holat'), balanceHtml(pay.balance), '', '', 'wallet')}</div>
        ${pay.entries.length ? `<div class="table-wrap" style="margin-top:12px"><table>${pay.entries.slice(0, 12).map((e) => { const [n, c, ic] = ENTRY_TYPES()[e.type]; return `<tr><td>${esc(e.day)}</td><td><span class="chip ${c}">${icon(ic, 14)} ${n}</span></td><td class="right num">${money(e.amount)}</td><td>${esc(e.note)}</td></tr>`; }).join('')}</table></div>` : ''}</div>` : ''}
    </div>`;
  },
  bind_me(root) {
    bindLang(root, 'me-lang');
    root.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { store('cp_theme', b.dataset.theme); applyTheme(); refreshView(); });
    root.querySelector('#install').onclick = installApp;
    const full = root.querySelector('#full');
    if (full) full.onclick = () => Screen.toggleFull();
    const vf = root.querySelector('#voice-form');
    vf.oninput = () => { const d = formData(vf); Voice.save({ enabled: d.enabled, voiceURI: d.voiceURI, rate: Number(d.rate) }); };
    root.querySelector('#test-voice').onclick = () => Voice.say(t('Diqqat! {0}. {1}, {2} porsiya tayyor. Olib keting.', spokenRoom(3, ''), "Sho'rva", spokenQty(2)), 'ready');
    root.querySelector('#notif').onclick = async () => {
      if (!('Notification' in window)) return toast(t("Brauzer bildirishnomani qo'llamaydi"), 'warn');
      const p = await Notification.requestPermission();
      toast(p === 'granted' ? t('Ruxsat berildi') : t('Ruxsat berilmadi'), p === 'granted' ? 'ok' : 'warn');
    };
    if ('speechSynthesis' in window && !Voice.voices().length) speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; renderView(currentData); };
    const pf = root.querySelector('#pin-form');
    pf.onsubmit = async (e) => {
      e.preventDefault();
      try { await PUT('/api/me/pin', formData(pf)); pf.reset(); toast(t('Saqlandi'), 'ok'); } catch (err) { toastError(err); }
    };
    const pw = root.querySelector('#pw-form');
    pw.onsubmit = async (e) => {
      e.preventDefault();
      try { await PUT('/api/me/password', formData(pw)); pw.reset(); toast(t("Parol o'zgartirildi"), 'ok'); } catch (err) { toastError(err); }
    };
  },
};

// ---------- Install as an app (PWA) ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
async function installApp() {
  if (deferredInstall) {
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null;
    return;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  openModal({
    title: `${icon('download')} ${t("Ilovani o'rnatish")}`,
    body: standalone ? `<p>${t("Ilova allaqachon o'rnatilgan.")}</p>` : ios
      ? `<ol class="stack" style="padding-left:20px"><li>${t('Safari brauzerida oching')}</li><li>${t('Pastdagi "Ulashish" tugmasini bosing')} (□↑)</li><li>${t('"На экран «Домой»" / "Add to Home Screen" ni tanlang')}</li></ol>`
      : `<ol class="stack" style="padding-left:20px"><li>${t('Chrome yoki Edge brauzerida oching')}</li><li>${t("Manzil qatoridagi o'rnatish belgisini yoki menyudagi \"Ilovani o'rnatish\" ni bosing")}</li>
        <li>${t("Android: menyu → \"Bosh ekranga qo'shish\"")}</li></ol><p class="small muted">${t("Eslatma: o'rnatish faqat https:// manzilida ishlaydi.")}</p>`,
    actions: [{ label: t('Yopish') }],
  });
}
