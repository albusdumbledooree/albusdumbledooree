'use strict';
/* Management screens: checks history, reports, cash book, payroll, reservations, menu, staff, settings. */

// ---------- Shared pieces ----------
function kpi(label, value, sub = '', cls = '', ic = 'chart-column') {
  return `<div class="kpi ${cls}"><div class="kpi-ic">${icon(ic, 22)}</div><div><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
}
// ---------- QR menu: codes and printing ----------
const guestUrl = (key) => `${location.origin}/q/${key}`;
function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
// A4 sheets, four table cards per page: logo, place, room, QR code, a line in Uzbek and Russian.
function printQr(rooms) {
  const s = App.settings;
  const logo = App.info && App.info.logo ? `${location.origin}${App.info.logo}` : '';
  const w = window.open('', '_blank');
  if (!w) return toast(t("Brauzer yangi oynani to'sib qo'ydi — ruxsat bering"), 'warn');
  const card = (r) => `<div class="c">${logo ? `<img class="l" src="${esc(logo)}" alt="">` : ''}<div class="v">${esc(s.name)}</div>
    <div class="r">${esc(r.name)}</div><div class="q">${qrSvg(guestUrl(r.qr_token))}</div>
    <div class="t">${moduleOn('qrorder') ? 'Menyu va buyurtma — skanerlang' : "Menyuni ko'rish uchun skanerlang"}</div>
    <div class="t ru">${moduleOn('qrorder') ? 'Меню и заказ — отсканируйте' : 'Отсканируйте, чтобы открыть меню'}</div><div class="f">flowi.uz</div></div>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR — ${esc(s.name)}</title><style>
    @page { size: A4; margin: 10mm; } * { box-sizing: border-box; } body { margin: 0; font-family: Inter, Arial, sans-serif; color: #0b1f33; }
    .g { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; } .c { border: 1.5px dashed #9aa3b2; border-radius: 6mm; height: 132mm; padding: 7mm 6mm;
      display: flex; flex-direction: column; align-items: center; text-align: center; break-inside: avoid; }
    .l { height: 14mm; max-width: 50mm; object-fit: contain; } .v { font-size: 13pt; font-weight: 700; margin-top: 2mm; }
    .r { font-size: 22pt; font-weight: 800; margin: 2mm 0 3mm; } .q svg { width: 62mm; height: 62mm; display: block; }
    .t { font-size: 12pt; font-weight: 700; margin-top: 3mm; } .ru { font-weight: 500; color: #475569; margin-top: 1mm; } .f { margin-top: auto; font-size: 9pt; color: #94a3b8; }
  </style></head><body><div class="g">${rooms.map(card).join('')}</div><script>window.onload = () => setTimeout(() => window.print(), 300);<\/script></body></html>`);
  w.document.close();
}
const dishPhoto = (id) => `/media/${encodeURIComponent((App.info && App.info.code) || '')}/${id}`;
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

// The selected check on the left (like the order screen), the list of checks on the right.
function checkDetailHtml(o) {
  if (!o) return `<aside class="checkpane hist-pane">${emptyState('receipt', t('Chekni tanlang'))}</aside>`;
  const share = perPerson(o);
  const permsOf = App.user.perms || {};
  return `<aside class="checkpane hist-pane">
    <div class="cp-head"><span class="avatar">${icon(o.takeaway ? 'shopping-bag' : 'receipt', 18)}</span>
      <div class="grow"><b>${t('Chek')} #${o.id}</b><span class="small muted">${esc(placeName(o))} · ${icon('user-round', 12)} ${esc(o.waiter.name)} · ${icon('users', 12)} ${o.guests}</span></div>
      ${o.status === 'cancelled' ? `<span class="chip red">${t('Bekor')}</span>` : ''}</div>
    <div class="cp-body">
      <p class="small muted" style="margin:8px 0">${icon('clock', 12)} ${fmtDateTime(o.opened_at)} → ${fmtDateTime(o.closed_at)}${o.cashier ? ` · ${icon('wallet', 12)} ${esc(o.cashier.name)}` : ''}${o.print_count ? ` · ${icon('printer', 12)} ${o.print_count}` : ''}</p>
      ${o.items.map((i, n) => `<div class="line ${i.status === 'cancelled' ? 'cancelled' : ''}"><span class="q">${n + 1}</span><span class="n">${esc(i.name)} <span class="muted">× ${i.qty}</span></span><span class="p">${num(i.price * i.qty)}</span></div>`).join('')}
      ${o.cancel_reason ? `<p class="small" style="color:var(--red);margin-top:8px">${esc(o.cancel_reason)}</p>` : ''}
    </div>
    <div class="cp-foot"><div class="sum-rows num">
      <span>${W('Taomlar')}</span><span class="right">${money(o.subtotal)}</span>
      <span>${o.service_amount ? esc(serviceLabel(o)) : t('Xizmat haqi')}</span><span class="right">${money(o.service_amount)}</span>
      <span>${t('Chegirma')}</span><span class="right">${o.discount ? '−' : ''}${money(o.discount)}</span>
      ${o.refunded ? `<span style="color:var(--red)">${t('Qaytarildi')}</span><span class="right" style="color:var(--red)">−${money(o.refunded)}</span>` : ''}
      <span class="total">${t('Jami')}</span><span class="total right">${money(o.total)}</span>
      ${share ? `<span class="share">${t('{0} kishi — har biriga', o.guests)}</span><span class="share right">${money(share)}</span>` : ''}
      ${['cash', 'card', 'transfer'].filter((m) => o[`paid_${m}`]).map((m) => `<span class="small muted">${methodName(m)}</span><span class="right small muted">${money(o[`paid_${m}`])}</span>`).join('')}</div>
      ${o.status === 'closed' ? `<div class="order-actions">
        ${can('owner', 'admin', 'cashier') && o.refunded < o.total ? `<button class="btn" id="h-refund">${icon('undo-2', 18)} ${t('Qaytarish')}</button>` : ''}
        ${permsOf.print ? `<button class="btn primary" id="h-print">${icon('printer', 18)} ${t('Chop etish')}</button>` : ''}</div>` : ''}
    </div></aside>`;
}

Views.history = {
  title: () => t('Cheklar'), icon: () => 'receipt', roles: ['owner', 'admin', 'cashier'], refreshOn: ['finance'], module: 'history',
  async load() {
    const list = await GET(`/api/checks?${histQuery({ limit: 100 })}`);
    const sel = UI.hist.sel && (list.rows.some((r) => r.id === UI.hist.sel) ? UI.hist.sel : null);
    list.order = sel ? await GET(`/api/orders/${sel}`).catch(() => null) : null;
    if (list.order && list.order.status === 'closed') LocalBackup.save(list.order);
    return list;
  },
  render(d) {
    const h = UI.hist;
    const r = histRange();
    const s = d.sums;
    const cancelled = h.status === 'cancelled';
    const label = h.period === 'all' ? (s.first_at ? t('{0} dan beri', fmtDate(s.first_at)) : '') : `${fmtDate(r.from)}${r.to - r.from > 24 * 60 * MIN ? ` — ${fmtDate(r.to - 1)}` : ''}`;
    return `<div class="split">
      ${checkDetailHtml(d.order)}
      <section class="split-main">
        <div class="toolbar">
          <div class="seg">${HIST_PERIODS().map(([k, n]) => `<button class="${h.period === k ? 'active' : ''}" data-hp="${k}">${n}</button>`).join('')}</div>
          ${h.period === 'custom' ? `<input type="date" id="h-from" value="${h.from || localDay()}" style="width:auto"> — <input type="date" id="h-to" value="${h.to || localDay()}" style="width:auto">` : ''}
          <div class="seg"><button class="${!cancelled ? 'active' : ''}" data-hs="closed">${t('Yopilgan')}</button><button class="${cancelled ? 'active' : ''}" data-hs="cancelled">${t('Bekor qilingan')}</button></div>
          <div class="scan" style="max-width:280px">${icon('search', 18)}<input type="search" id="h-q" placeholder="${esc(t('Chek raqami, xona yoki ofitsant'))}" value="${esc(h.q)}"></div>
          <span class="grow"></span><span class="muted small">${label}</span>
          ${moduleOn('export') ? `<button class="btn" id="hist-export" ${s.count ? '' : 'disabled'}>${icon('file-spreadsheet', 18)} Excel</button>` : ''}</div>
        <div class="card flush">${d.rows.length ? `<div class="table-wrap"><table class="list">
          <tr><th>#</th><th>${t('Ochildi')} / ${t('Yopildi')}</th><th>${t('Joy')}</th><th>${roleName('waiter')}</th><th class="right">${icon('users', 15)}</th><th>${cancelled ? t('Sabab') : t("To'lov")}</th><th class="right">${t('Jami')}</th></tr>
          ${d.rows.map((o) => `<tr class="clickable ${d.order && d.order.id === o.id ? 'selected' : ''}" data-view="${o.id}"><td><b>${o.id}</b></td>
            <td class="small">${fmtTime(o.opened_at)} → ${fmtDateTime(o.closed_at)}</td>
            <td>${o.takeaway ? `${icon(isShop() ? 'shopping-cart' : 'shopping-bag', 15)} ${esc(o.label || (isShop() ? t('Sotuv') : t('Olib ketish')))}` : `${esc(o.room_number)} · ${esc(o.room_name)}`}</td>
            <td>${esc(o.waiter_name)}</td><td class="right">${o.guests}</td>
            <td class="small">${cancelled ? esc(o.cancel_reason || '—') : ['cash', 'card', 'transfer'].filter((m) => o[`paid_${m}`]).map((m) => icon(METHOD_ICONS[m], 16)).join(' ')}</td>
            <td class="right num"><b>${num(o.total)}</b></td></tr>`).join('')}
        </table></div>
        ${d.rows.length < s.count ? `<div class="row" style="justify-content:center;margin:10px 0"><button class="btn" id="h-more">${t("Yana ko'rsatish")} (${d.rows.length} / ${s.count})</button></div>` : ''}`
        : emptyState('receipt', h.period === 'today' ? t('Bugun hali chek yopilmagan') : t("Bu davrda chek yo'q"))}
        <div class="list-foot"><span>${t('Cheklar')}: <b>${s.count}</b> · ${t('{0} mehmon', s.guests)}</span><span class="grow"></span>
          ${cancelled ? '' : `<span>${icon('banknote', 15)} ${num(s.cash)}</span><span>${icon('credit-card', 15)} ${num(s.card)}</span><span>${icon('smartphone', 15)} ${num(s.transfer)}</span>`}
          <span class="big">${t('Jami')}: ${money(s.total)}</span></div></div>
      </section></div>`;
  },
  bind(root, d) {
    const h = UI.hist;
    root.querySelectorAll('[data-hp]').forEach((b) => b.onclick = () => { h.period = b.dataset.hp; refreshView(); });
    root.querySelectorAll('[data-hs]').forEach((b) => b.onclick = () => { h.status = b.dataset.hs; h.sel = null; refreshView(); });
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
      h.sel = Number(b.dataset.view);
      try {
        const o = await GET(`/api/orders/${h.sel}`);
        if (o.status === 'closed') LocalBackup.save(o);
        renderView({ ...d, order: o });
        if (window.matchMedia('(max-width: 1000px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) { toastError(e); }
    });
    const pr = root.querySelector('#h-print');
    if (pr) pr.onclick = () => printCheck(d.order.id);
    const rf = root.querySelector('#h-refund');
    if (rf) rf.onclick = () => refundDialog(d.order);
    (root.querySelector('#hist-export') || {}).onclick = async () => {
      try {
        const res = await fetch(`/api/checks/export?${histQuery()}`, { headers: { Authorization: `Bearer ${App.token}` } });
        if (!res.ok) throw new Error(tServer((await res.json()).error));
        downloadBlob(`cheklar_${h.period}_${localDay()}.csv`, await res.blob());
      } catch (e) { toastError(e); }
    };
  },
};

// ---------- Money: one quiet entry that opens reports, the cash book and payroll ----------
const MONEY_PAGES = () => [
  ['reports', 'chart-column', t('Hisobot'), t("Kirim, chiqim va foyda — kunlar bo'yicha")],
  ['finance', 'arrow-right-left', t('Kirim-chiqim'), t('Xarajat va boshqa kirimlarni yozish')],
  ['payroll', 'hand-coins', t('Ish haqi'), t('Maosh, avans, xarajat, bonus va jarima')],
  ['attendance', 'calendar', t('Davomat'), t("Kim keldi, kunlik ish haqini berish")],
  ['customers', 'book-user', t('Mijozlar'), t('Qarz daftari, keshbek va doimiy mijozlar')],
  ['inventory', 'warehouse', t('Ombor'), t("Masalliqlar qoldig'i, kirim va tex-karta")],
  ['branches', 'network', t('Filiallar'), t("Hamma filial savdosi bitta jadvalda")],
];
Views.money = {
  title: () => t('Moliya'), icon: () => 'chart-column', roles: ['owner', 'admin', 'cashier'],
  on: () => MONEY_PAGES().some(([k]) => viewOn(k)),
  render() {
    return `<div class="page-head"><h1>${t('Moliya')}</h1>${App.settings.finance_lock && App.financeKey ? `<button class="btn sm" id="fin-lock">${icon('lock', 16)} ${t('Qulflash')}</button>` : ''}</div>
      <div class="money-tiles">${MONEY_PAGES().filter(([k]) => viewOn(k)).map(([k, ic, n, d]) => `<a class="money-tile" href="#/${k}">${icon(ic, 32)}<b>${n}</b><span class="small muted">${d}</span></a>`).join('')}
        ${can('owner') ? MONEY_PAGES().filter(([k]) => planLocked(Views[k].module)).map(([k, ic, n, d]) => `<button type="button" class="money-tile locked" data-upgrade="${esc(n)}">${icon(ic, 32)}<b>${n} ${icon('lock', 16)}</b><span class="small muted">${d}</span></button>`).join('') : ''}</div>
      <p class="small muted" style="margin-top:14px">${icon('eye-off', 14)} ${t("Bu bo'lim begona ko'zdan uzoqroq turishi uchun menyuning eng chetida.")}${can('owner') ? ` ${t('Kim ko\'rishi va parol: Sozlamalar → Ruxsatlar.')}` : ''}</p>`;
  },
  bind(root) {
    const l = root.querySelector('#fin-lock');
    if (l) l.onclick = () => { App.financeKey = null; toast(t('Qulflandi'), 'ok'); refreshView(); };
    root.querySelectorAll('[data-upgrade]').forEach((b) => b.onclick = () => upgradeDialog(b.dataset.upgrade));
  },
};

// Goods (or dishes) brought back: chosen lines and amounts, money paid back, stock returned.
function refundDialog(o) {
  const lines = o.items.filter((i) => i.status !== 'cancelled' && i.qty > (i.refunded_qty || 0));
  const form = openModal({
    title: `${icon('undo-2')} ${t('Qaytarish')} · ${t('Chek')} #${o.id}`, size: 'wide',
    body: `<div class="table-wrap"><table><tr><th>${W('Taom')}</th><th class="right">${t('Narxi')}</th><th style="width:130px">${t('Soni')}</th></tr>
      ${lines.map((i) => `<tr><td><b>${esc(i.name)}</b>${i.refunded_qty ? ` <span class="small muted">(${t('qaytarilgan')}: ${i.refunded_qty})</span>` : ''}</td><td class="right num">${money(i.price)}</td>
        <td><input type="number" min="0" max="${i.qty - (i.refunded_qty || 0)}" value="0" data-ref="${i.id}" style="min-height:38px"></td></tr>`).join('')}</table></div>
      <div class="form-grid" style="margin-top:12px">
        <label class="field">${t("Pul qanday qaytariladi")}<select name="method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label>
        <label class="field">${t('Sabab')}<input name="reason"></label></div>
      <p class="lead" id="ref-sum" style="margin-top:12px"></p>`,
    actions: [{ label: t('Bekor') }, { label: t('Qaytarish'), cls: 'danger', icon: 'undo-2', onClick: async (f) => {
      const items = [...f.querySelectorAll('[data-ref]')].map((x) => ({ item_id: Number(x.dataset.ref), qty: Number(x.value) || 0 })).filter((x) => x.qty > 0);
      if (!items.length) { toast(t('Soni kiriting'), 'warn'); return false; }
      const r = await POST(`/api/orders/${o.id}/refund`, { items, method: f.method.value, reason: f.reason.value });
      toast(t('{0} qaytarildi', moneyText(r.refunded)), 'ok', 8000);
      refreshView();
    } }],
  });
  const sum = () => {
    const v = [...form.querySelectorAll('[data-ref]')].reduce((s, x) => s + (Number(x.value) || 0) * lines.find((i) => i.id === Number(x.dataset.ref)).price, 0);
    form.querySelector('#ref-sum').innerHTML = v ? `${t('Qaytariladi')}: <b>${money(Math.min(v, o.total - (o.refunded || 0)))}</b>` : '';
  };
  form.addEventListener('input', sum);
}

// ---------- Reports: income, expenses, profit ----------
Views.reports = {
  title: () => t('Hisobot'), icon: () => 'chart-column', roles: ['owner', 'admin', 'cashier'], refreshOn: ['finance'], module: 'reports', on: () => !!App.money.reports,
  async load() { const r = periodRange(); return { rep: await GET(`/api/reports?from=${r.from}&to=${r.to}`) }; },
  render({ rep: r }) {
    const s = r.sales;
    return `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Hisobot')}</h1>${moduleOn('export') ? `<button class="btn" id="csv">${icon('file-spreadsheet', 18)} Excel</button>` : ''}</div>
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
          ${hbars([{ label: t('Naqd'), value: s.cash }, { label: t('Karta'), value: s.card }, { label: t("O'tkazma"), value: s.transfer }, ...(s.debt ? [{ label: t('Qarzga'), value: s.debt }] : []), ...(s.bonus ? [{ label: t('Bonus bilan'), value: s.bonus }] : []), ...(s.staff ? [{ label: t('Xodim hisobiga'), value: s.staff }] : []), ...(r.other_income ? [{ label: t('Boshqa kirim'), value: r.other_income }] : [])])}</div>
        <div class="card"><div class="card-head"><h2>${t('Xarajatlar')}</h2></div>${hbars(r.expense_by_category.map((x) => ({ label: x.key, value: x.value })), { red: true })}</div>
        <div class="card"><div class="card-head"><h2>${t('Eng ko\'p sotilgan')}</h2></div>${hbars(r.dishes.slice(0, 8).map((d) => ({ label: `${d.name} (${d.qty})`, value: d.revenue })))}</div>
        <div class="card"><div class="card-head"><h2>${isShop() ? t('Sotuvchilar') : t('Ofitsantlar')}</h2></div>${hbars(r.waiters.map((w) => ({ label: `${w.name} (${w.orders})`, value: w.total })))}</div>
      </div>`;
  },
  bind(root, { rep: r }) {
    bindPeriod(root);
    (root.querySelector('#csv') || {}).onclick = async () => {
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
  title: () => t('Kirim-chiqim'), icon: () => 'arrow-right-left', roles: ['owner', 'admin', 'cashier'], refreshOn: ['finance'], module: 'finance', on: () => !!App.money.finance,
  async load() { const r = periodRange(); return { txs: await GET(`/api/transactions?from=${r.from}&to=${r.to}`) }; },
  render({ txs }) {
    const f = UI.txFilter || 'all';
    const list = txs.filter((x) => f === 'all' || (f === 'sales' ? x.order_id : f === 'income' ? x.type === 'income' && !x.order_id : x.type === f));
    const inc = txs.filter((x) => x.type === 'income').reduce((s, x) => s + x.amount, 0);
    const exp = txs.filter((x) => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
    return `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Kirim-chiqim')}</h1>
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
const ENTRY_TYPES = () => ({ payment: [t("To'lov"), 'served', 'banknote'], advance: [t('Avans'), 'served', 'wallet'], bonus: [t('Bonus'), 'ready', 'gift'],
  fine: [t('Jarima'), 'red', 'triangle-alert'], deduction: [t('Xodim xarajati'), 'red', 'utensils'] });
const EXPENSE_KINDS = () => [['Ovqat', t('Ovqat')], ['Ichimlik', t('Ichimlik')], ['Boshqa', t('Boshqa')]];
// Attendance marks: present / absent / day off / sick; the boss taps a cell to go to the next one.
const ATT = () => ({ present: [t('Keldi'), '✓', 'on'], absent: [t('Kelmadi'), '✕', 'off'], dayoff: [t('Dam olish'), 'D', 'rest'], sick: [t('Kasal'), 'K', 'sick'] });
const ATT_NEXT = { '': 'present', present: 'absent', absent: 'dayoff', dayoff: 'sick', sick: 'clear' };
const attStatus = (src) => (!src ? '' : src === 'auto' || src === 'manual' ? 'present' : src);
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
  if (b < 0) return `<b style="color:var(--blue)">${t("Ortiqcha berilgan")}: ${money(-b)}</b>`;
  return `<span class="chip green">${t('Teng')}</span>`;
}

Views.payroll = {
  title: () => t('Ish haqi'), icon: () => 'hand-coins', roles: ['owner'], refreshOn: ['finance'], module: 'payroll',
  async load() { return GET(`/api/payroll?month=${UI.payMonth}`); },
  render(d) {
    const tt = d.totals;
    const att = new Map(d.attendance.map((a) => [`${a.user_id}|${a.day}`, a.source]));
    const noAdvance = d.staff.filter((r) => r.advance_missing);
    return `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Ish haqi')}</h1>
      <a class="btn" href="#/attendance">${icon('calendar', 18)} ${t('Bugungi davomat')}</a>
      <button class="icon-btn" data-month="-1">${icon('chevron-left')}</button><b>${monthTitle(d.month)}</b><button class="icon-btn" data-month="1">${icon('chevron-right')}</button></div>
      ${noAdvance.length ? `<div class="notice">${icon('wallet', 18)} <span>${t("Avans kuni o'tdi — hali avans berilmagan")}: ${noAdvance.map((r) => `<a href="#" data-adv="${r.id}"><b>${esc(r.name)}</b></a>`).join(', ')}</span></div>` : ''}
      <div class="kpis">
        ${kpi(t('Hisoblangan'), money(tt.accrued), '', '', 'hand-coins')}
        ${kpi(t('Berilgan'), money(tt.paid), '', '', 'banknote')}
        ${kpi(t('Xarajat / jarima'), `${money(tt.deduction)} / ${money(tt.fine)}`, tt.bonus ? `${t('Bonus')}: ${money(tt.bonus)}` : '', '', 'utensils')}
        ${kpi(t('Choyxona qarzi'), money(tt.owed), t('xodimlarga berish kerak'), tt.owed ? 'warn' : 'good', 'wallet')}
      </div>
      <div class="card"><div class="card-head"><h2>${t('Xodimlar')}</h2></div>
      ${d.staff.length ? `<div class="table-wrap"><table>
        <tr><th>${t('Xodim')}</th><th>${t('Maosh')}</th><th class="right">${t('Kun')}</th><th class="right">${t('Hisoblangan')}</th><th class="right">${t('Xarajat')}</th><th class="right">${t('Berilgan')}</th><th>${t('Holat')}</th><th></th></tr>
        ${d.staff.map((r) => `<tr style="${r.active ? '' : 'opacity:.6'}">
          <td><div class="row" style="flex-wrap:nowrap"><span class="avatar ${r.role}">${esc(initials(r.name))}</span><div><b>${esc(r.name)}</b><br><span class="small muted">${roleName(r.role)}</span></div></div></td>
          <td class="small">${rateText(r.rate)}</td><td class="right">${r.days_worked}</td>
          <td class="right num">${money(r.accrued)}${r.bonus || r.fine ? `<br><span class="small muted">+${num(r.bonus)} / −${num(r.fine)}</span>` : ''}</td>
          <td class="right num">${r.deduction ? `−${money(r.deduction)}` : '—'}</td>
          <td class="right num">${r.paid ? money(r.paid) : '—'}${r.advance ? `<br><span class="small muted">${t('avans')} ${num(r.advance)}</span>` : ''}</td><td>${balanceHtml(r.balance)}</td>
          <td class="actions"><button class="btn sm primary" data-pay="${r.id}">${icon('banknote', 16)} ${t("To'lash")}</button>
            ${r.rate && r.rate.pay_type === 'monthly' ? `<button class="btn sm" data-adv="${r.id}">${icon('wallet', 16)} ${t('Avans')}</button>` : ''}
            <button class="icon-btn" data-ded="${r.id}" title="${esc(t('Xodim xarajati'))}">${icon('utensils', 18)}</button>
            <button class="icon-btn" data-bonus="${r.id}" title="${esc(t('Bonus'))}">${icon('gift', 18)}</button>
            <button class="icon-btn" data-fine="${r.id}" title="${esc(t('Jarima'))}">${icon('triangle-alert', 18)}</button>
            <button class="icon-btn" data-rate="${r.id}" title="${esc(t('Maosh'))}">${icon('sliders-horizontal', 18)}</button>
            <button class="icon-btn" data-hist="${r.id}" title="${esc(t('Tarix'))}">${icon('history', 18)}</button></td></tr>`).join('')}
      </table></div>` : emptyState('users', t("Xodimlar yo'q"))}</div>
      <div class="card"><div class="card-head"><h2>${t('Davomat')}</h2><span class="small muted">${t("Dasturga kirgan kun o'zi belgilanadi. Katakni bosing: ✓ keldi → ✕ kelmadi → D dam olish → K kasal → bo'sh.")}</span></div>
        <div class="table-wrap"><table class="att">
          <tr><th>${t('Xodim')}</th>${d.days.map((day) => `<th class="c ${day === d.today ? 'today' : ''}">${Number(day.slice(8))}</th>`).join('')}<th class="right">${t('Jami')}</th></tr>
          ${d.staff.filter((r) => r.active).map((r) => `<tr><td><b>${esc(r.name)}</b></td>${d.days.map((day) => {
            const st = attStatus(att.get(`${r.id}|${day}`));
            const a = ATT()[st];
            return `<td class="c ${day === d.today ? 'today' : ''}"><button class="att-cell ${a ? a[2] : ''}" ${day > d.today ? 'disabled' : ''}
              data-att="${r.id}" data-day="${day}" data-st="${st}" title="${day}${a ? ` · ${a[0]}` : ''}">${a ? a[1] : ''}</button></td>`;
          }).join('')}<td class="right"><b>${r.days_worked}</b></td></tr>`).join('')}
        </table></div></div>`;
  },
  bind(root, d) {
    const byId = (id) => d.staff.find((r) => r.id === Number(id));
    root.querySelectorAll('[data-month]').forEach((b) => b.onclick = () => { UI.payMonth = shiftMonth(UI.payMonth, Number(b.dataset.month)); refreshView(); });
    root.querySelectorAll('[data-att]').forEach((b) => b.onclick = async () => {
      try { await POST('/api/attendance', { user_id: Number(b.dataset.att), day: b.dataset.day, status: ATT_NEXT[b.dataset.st] }); refreshView(); } catch (e) { toastError(e); }
    });
    root.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => payEntry(byId(b.dataset.pay), 'payment'));
    root.querySelectorAll('[data-bonus]').forEach((b) => b.onclick = () => payEntry(byId(b.dataset.bonus), 'bonus'));
    root.querySelectorAll('[data-fine]').forEach((b) => b.onclick = () => payEntry(byId(b.dataset.fine), 'fine'));
    root.querySelectorAll('[data-adv]').forEach((b) => b.onclick = (e) => { e.preventDefault(); payEntry(byId(b.dataset.adv), 'advance'); });
    root.querySelectorAll('[data-ded]').forEach((b) => b.onclick = () => payEntry(byId(b.dataset.ded), 'deduction'));
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
        ${type === 'deduction' ? `<label class="field">${t('Nima uchun')}<select name="kind">${EXPENSE_KINDS().map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>` : ''}
        <label class="field">${t('Summa')}<input type="number" name="amount" min="1" required value="${type === 'payment' && r.balance > 0 ? r.balance
          : type === 'advance' && r.rate && r.rate.pay_type === 'monthly' ? Math.round(r.rate.amount / 2) : ''}"></label>
        ${type === 'payment' || type === 'advance' ? `<label class="field">${t("To'lov turi")}<select name="method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label>` : ''}
        <label class="field">${t('Sana')}<input type="date" name="day" value="${today}" max="${today}"></label></div>
      <label class="field" style="margin-top:12px">${type === 'fine' ? t('Sabab (majburiy)') : t('Izoh')}<input name="note" ${type === 'fine' ? 'required' : ''}></label>
      ${type === 'payment' || type === 'advance' ? `<p class="small muted" style="margin-top:10px">${t("To'lov kassada \"Ish haqi\" xarajati bo'lib yoziladi.")}</p>` : ''}
      ${type === 'deduction' ? `<p class="small muted" style="margin-top:10px">${t("Summa xodimning ish haqidan ushlanadi. Choyxonada yegan ovqatni kassada \"Xodim hisobiga\" bilan yopsangiz, o'zi yoziladi.")}</p>` : ''}`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: type === 'fine' || type === 'deduction' ? 'danger' : 'primary', onClick: async (f) => {
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

// ---------- Attendance: who came today; daily workers are paid in the evening ----------
UI.attDay = UI.attDay || localDay();
Views.attendance = {
  title: () => t('Davomat'), icon: () => 'calendar', roles: ['owner', 'admin'], refreshOn: ['payroll', 'finance'], module: 'payroll',
  async load() { return GET(`/api/attendance?day=${UI.attDay}`); },
  render(d) {
    const A = ATT();
    const c = d.counts;
    const dayLabel = d.day === d.today ? t('Bugun') : fmtDate(new Date(`${d.day}T12:00`).getTime());
    const row = (r) => {
      const daily = r.rate && r.rate.pay_type === 'daily';
      return `<div class="att-row">
        <div class="att-who"><span class="avatar ${r.role}">${esc(initials(r.name))}</span><div><b>${esc(r.name)}</b>
          <span class="small muted">${roleName(r.role)}${d.can_pay && r.rate ? ` · ${rateText(r.rate)}` : ''}${r.auto ? ` · ${t('dasturga kirgan')}` : ''}</span></div></div>
        <div class="att-btns">${Object.entries(A).map(([k, [n, , cls]]) => `<button class="att-btn ${cls} ${r.status === k ? 'active' : ''}" data-set="${r.id}" data-st="${k}">${n}</button>`).join('')}</div>
        ${d.can_pay ? `<div class="att-money">
          ${daily ? `<span class="small muted">${t('Ishladi')} <b>${num(r.earned)}</b>${r.spent ? ` · ${t('xarajat')} <b class="red">−${num(r.spent)}</b>` : ''}${r.paid ? ` · ${t('berildi')} <b>${num(r.paid)}</b>` : ''}</span>
            ${r.day_due > 0 ? `<button class="btn ok" data-daypay="${r.id}">${icon('banknote', 18)} ${t("To'lash")} ${money(r.day_due)}</button>`
              : r.earned ? `<span class="chip green">${icon('check', 14)} ${t("To'langan")}</span>` : ''}`
            : `<span class="small muted">${t('Oy bo\'yicha')}:</span> ${balanceHtml(r.balance)}${r.spent ? ` <span class="small muted">· ${t('bugun xarajat')} −${num(r.spent)}</span>` : ''}`}
        </div>` : ''}
      </div>`;
    };
    return `<div class="page-head"><a class="btn sm" href="${can('owner') ? '#/payroll' : '#/staff'}">${icon('arrow-left', 16)}</a><h1>${t('Davomat')}</h1>
        <button class="icon-btn" data-day="-1">${icon('chevron-left')}</button><b>${esc(dayLabel)}</b>
        <button class="icon-btn" data-day="1" ${d.day >= d.today ? 'disabled' : ''}>${icon('chevron-right')}</button></div>
      <div class="row" style="gap:8px;margin-bottom:14px">
        <span class="chip green">${A.present[0]}: ${c.present}</span><span class="chip red">${A.absent[0]}: ${c.absent}</span>
        <span class="chip">${A.dayoff[0]}: ${c.dayoff}</span><span class="chip">${A.sick[0]}: ${c.sick}</span>
        ${c.unmarked ? `<span class="chip orange">${t('Belgilanmagan')}: ${c.unmarked}</span>` : ''}</div>
      ${d.staff.length ? `<div class="card att-list">${d.staff.map(row).join('')}</div>` : emptyState('users', t("Xodimlar yo'q"))}
      <p class="small muted" style="margin-top:12px">${icon('info', 14)} ${t("Dasturga kirgan xodim o'zi \"Keldi\" bo'ladi. Kunlik maoshli xodim kechqurun \"To'lash\" bilan pulini oladi: ishlagan kuni − shu kungi xarajatlari (ovqat, ichimlik).")}</p>`;
  },
  bind(root, d) {
    root.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => {
      const x = new Date(`${UI.attDay}T12:00`); x.setDate(x.getDate() + Number(b.dataset.day));
      UI.attDay = [localDay(x.getTime()), d.today].sort()[0]; refreshView();
    });
    root.querySelectorAll('[data-set]').forEach((b) => b.onclick = async () => {
      const r = d.staff.find((x) => x.id === Number(b.dataset.set));
      const status = r.status === b.dataset.st ? 'clear' : b.dataset.st;
      try { await POST('/api/attendance', { user_id: r.id, day: d.day, status }); refreshView(); } catch (e) { toastError(e); }
    });
    root.querySelectorAll('[data-daypay]').forEach((b) => b.onclick = () => {
      const r = d.staff.find((x) => x.id === Number(b.dataset.daypay));
      openModal({
        title: `${icon('banknote')} ${esc(r.name)} — ${t('kunlik ish haqi')}`,
        body: `<div class="sum-rows num"><span>${t('Ishladi')}</span><span class="right">${money(r.earned + r.bonus)}</span>
            ${r.spent ? `<span>${t('Xarajatlari (ovqat, ichimlik)')}</span><span class="right">−${money(r.spent)}</span>` : ''}
            ${r.fine ? `<span>${t('Jarima')}</span><span class="right">−${money(r.fine)}</span>` : ''}
            ${r.paid ? `<span>${t('Berilgan')}</span><span class="right">−${money(r.paid)}</span>` : ''}
            <span style="grid-column:1/-1" class="big-total">${money(r.day_due)}</span></div>
          <div class="form-grid" style="margin-top:12px"><label class="field">${t('Summa')}<input type="number" name="amount" min="1" value="${r.day_due}"></label>
            <label class="field">${t("To'lov turi")}<select name="method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label></div>
          <p class="small muted" style="margin-top:10px">${t("To'lov kassada \"Ish haqi\" xarajati bo'lib yoziladi.")}</p>`,
        actions: [{ label: t('Bekor') }, { label: t("To'lash"), cls: 'ok', icon: 'banknote', onClick: async (f) => {
          const x = formData(f);
          await POST('/api/attendance/pay', { user_id: r.id, day: d.day, amount: Number(x.amount), method: x.method });
          toast(t('Saqlandi'), 'ok'); refreshView();
        } }],
      });
    });
  },
};

// ---------- Pro: customers and debts ----------
UI.cust = UI.cust || { tab: 'all', q: '' };
const MOVE_KINDS = () => ({ cashback: [t('Keshbek'), 'green'], redeem: [t('Bonus ishlatildi'), ''], debt: [t('Qarzga yozildi'), 'red'], debt_pay: [t("Qarz to'landi"), 'green'] });
Views.customers = {
  title: () => t('Mijozlar'), icon: () => 'book-user', roles: ['owner', 'admin', 'cashier'], module: 'customers', refreshOn: ['finance'],
  async load() { return GET(`/api/customers?q=${encodeURIComponent(UI.cust.q)}${UI.cust.tab === 'debt' ? '&debt=1' : ''}`); },
  render(d) {
    const tt = d.totals;
    return `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Mijozlar')}</h1>
        <input type="search" id="cust-q" placeholder="${esc(t('Ism yoki telefon'))}" value="${esc(UI.cust.q)}" style="max-width:240px">
        <button class="btn primary" id="cust-add">${icon('plus', 18)} ${t('Mijoz')}</button></div>
      <div class="kpis">
        ${kpi(t('Mijozlar'), num(tt.count), '', '', 'book-user')}
        ${moduleOn('debts') ? kpi(t('Umumiy qarz'), money(tt.debt), t('mijozlar choyxonaga qarz'), tt.debt ? 'warn' : '', 'notebook-pen') : ''}
        ${moduleOn('customers') ? kpi(t('Bonuslar'), money(tt.bonus), t('Keshbek: chekning {0}%', App.settings.cashback_pct), '', 'gift') : ''}
      </div>
      ${moduleOn('debts') ? `<div class="seg" style="margin:4px 0 14px">${[['all', t('Hammasi')], ['debt', t('Qarzdorlar')]].map(([k, n]) => `<button class="${UI.cust.tab === k ? 'active' : ''}" data-ctab="${k}">${n}</button>`).join('')}</div>` : ''}
      <div class="card">${d.rows.length ? `<div class="table-wrap"><table>
        <tr><th>${t('Mijoz')}</th><th>${t('Telefon')}</th><th class="right">${t('Tashrif')}</th><th class="right">${t('Jami xarid')}</th>
          ${moduleOn('customers') ? `<th class="right">${t('Bonus')}</th>` : ''}${moduleOn('debts') ? `<th class="right">${t('Qarz')}</th>` : ''}<th>${t('Oxirgi tashrif')}</th></tr>
        ${d.rows.map((c) => `<tr class="clickable" data-cust="${c.id}"><td><b>${esc(c.name)}</b>${c.note ? `<br><span class="small muted">${esc(c.note)}</span>` : ''}</td>
          <td>${esc(c.phone || '—')}</td><td class="right">${c.visits}</td><td class="right num">${money(c.spent)}</td>
          ${moduleOn('customers') ? `<td class="right num">${c.bonus ? money(c.bonus) : '—'}</td>` : ''}
          ${moduleOn('debts') ? `<td class="right num">${c.debt ? `<b class="red">${money(c.debt)}</b>` : '—'}</td>` : ''}
          <td class="small muted">${c.last_visit ? fmtDateTime(c.last_visit) : '—'}</td></tr>`).join('')}
      </table></div>` : emptyState('book-user', UI.cust.tab === 'debt' ? t("Qarzdor mijoz yo'q") : t("Hali mijoz yo'q. Kassada to'lov oynasida mijozni tanlang yoki shu yerdan qo'shing."))}</div>`;
  },
  bind(root, d) {
    const qi = root.querySelector('#cust-q');
    let tm = null;
    qi.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { UI.cust.q = qi.value; refreshView(); }, 350); };
    root.querySelectorAll('[data-ctab]').forEach((b) => b.onclick = () => { UI.cust.tab = b.dataset.ctab; refreshView(); });
    root.querySelector('#cust-add').onclick = () => customerForm();
    root.querySelectorAll('[data-cust]').forEach((r) => r.onclick = () => customerCard(Number(r.dataset.cust)));
  },
};

function customerForm(c = {}) {
  openModal({
    title: `${icon('book-user')} ${c.id ? esc(c.name) : t('Yangi mijoz')}`,
    body: `<div class="form-grid"><label class="field">${t('Ism')}<input name="name" value="${esc(c.name || '')}" required></label>
      <label class="field">${t('Telefon')}<input name="phone" type="tel" value="${esc(c.phone || '+998 ')}"></label></div>
      <label class="field" style="margin-top:12px">${t('Izoh')}<input name="note" value="${esc(c.note || '')}"></label>`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
      const x = formData(f);
      if (x.phone.trim() === '+998') x.phone = '';
      await (c.id ? PUT(`/api/customers/${c.id}`, x) : POST('/api/customers', x));
      toast(t('Saqlandi'), 'ok'); refreshView();
    } }],
  });
}

async function customerCard(id) {
  let c;
  try { c = await GET(`/api/customers/${id}`); } catch (e) { return toastError(e); }
  const K = MOVE_KINDS();
  const form = openModal({
    title: `${icon('book-user')} ${esc(c.name)}`, size: 'wide',
    body: `<div class="kpis">
        ${kpi(t('Tashrif'), c.visits, c.last_visit ? fmtDateTime(c.last_visit) : '', '', 'calendar')}
        ${kpi(t('Jami xarid'), money(c.spent), '', '', 'wallet')}
        ${moduleOn('customers') ? kpi(t('Bonus'), money(c.bonus), '', '', 'gift') : ''}
        ${moduleOn('debts') ? kpi(t('Qarz'), money(c.debt), '', c.debt ? 'bad' : 'good', 'notebook-pen') : ''}</div>
      <p class="muted">${icon('smartphone', 15)} ${esc(c.phone || '—')}${c.note ? ` · ${esc(c.note)}` : ''}</p>
      ${c.moves.length ? `<div class="table-wrap"><table><tr><th>${t('Sana')}</th><th>${t('Turi')}</th><th class="right">${t('Summa')}</th><th>${t('Chek')}</th><th>${t('Kim')}</th></tr>
        ${c.moves.map((m) => `<tr><td class="small">${fmtDateTime(m.created_at)}</td><td><span class="chip ${(K[m.kind] || [])[1] || ''}">${esc((K[m.kind] || [m.kind])[0])}</span>${m.note ? ` <span class="small muted">${esc(m.note)}</span>` : ''}</td>
          <td class="right num">${money(m.amount)}</td><td>${m.order_id ? `#${m.order_id}` : (m.method ? methodName(m.method) : '')}</td><td class="small muted">${esc(m.user_name || '')}</td></tr>`).join('')}
      </table></div>` : `<p class="muted">${t("Hali harakat yo'q")}</p>`}`,
    actions: [{ label: t('Yopish') }, { label: t('Tahrirlash'), cls: '', icon: 'pencil', onClick: () => { customerForm(c); return false; } },
      ...(moduleOn('debts') && c.debt > 0 ? [{ label: t("Qarz to'lovi"), cls: 'ok', icon: 'banknote', onClick: () => { debtPayment(c); return false; } }] : [])],
  });
  return form;
}

function debtPayment(c) {
  openModal({
    title: `${icon('banknote')} ${esc(c.name)} — ${t("qarz to'lovi")}`,
    body: `<p class="lead">${t('Qarzi')}: <b class="red">${money(c.debt)}</b></p>
      <div class="form-grid"><label class="field">${t('Summa')}<input type="number" name="amount" min="1" max="${c.debt}" value="${c.debt}"></label>
        <label class="field">${t("To'lov turi")}<select name="method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label></div>
      <label class="field" style="margin-top:12px">${t('Izoh')}<input name="note"></label>
      <p class="small muted" style="margin-top:10px">${t("Pul kassaga \"Qarz to'lovi\" bo'lib tushadi. Savdo chek yopilgan kuni hisoblangan, shuning uchun foydaga qayta qo'shilmaydi.")}</p>`,
    actions: [{ label: t('Bekor') }, { label: t('Qabul qilish'), cls: 'ok', icon: 'check', onClick: async (f) => {
      const x = formData(f);
      await POST(`/api/customers/${c.id}/pay`, { amount: Number(x.amount), method: x.method, note: x.note });
      toast(t('Saqlandi'), 'ok'); refreshView();
    } }],
  });
}

// ---------- Pro: ingredients, stock and recipes ----------
UI.inv = UI.inv || { tab: 'items' };
const UNIT_NAMES = () => ({ kg: t('kg'), g: t('g'), l: t('litr'), ml: t('ml'), dona: t('dona') });
const qtyText = (v, unit) => `${Math.round(v * 1000) / 1000} ${UNIT_NAMES()[unit] || unit}`;
const STOCK_MOVES = () => ({ in: [t('Kirim'), 'green'], sale: [t('Sotuv'), ''], writeoff: [t('Hisobdan chiqarildi'), 'red'], count: [t('Sanoq'), 'orange'], refund: [t('Qaytarildi'), 'green'] });
Views.inventory = {
  title: () => t('Ombor'), icon: () => 'warehouse', roles: ['owner', 'admin', 'cashier', 'chef'], module: 'inventory', refreshOn: ['inventory', 'finance', 'menu'],
  async load() {
    const list = await GET('/api/ingredients');
    if (UI.inv.tab === 'moves' && can('owner', 'admin')) list.moves = await GET('/api/inventory/moves');
    return list;
  },
  render(d) {
    const manage = can('owner', 'admin');
    const tabs = manage ? `<div class="seg" style="margin-bottom:14px">${[['items', t('Masalliqlar')], ['moves', t('Harakatlar')]].map(([k, n]) => `<button class="${UI.inv.tab === k ? 'active' : ''}" data-itab="${k}">${n}</button>`).join('')}</div>` : '';
    const low = d.rows.filter((r) => r.low);
    const head = `<div class="page-head">${can('owner', 'admin', 'cashier') ? `<a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a>` : ''}<h1>${t('Ombor')}</h1>
        ${can('owner', 'admin', 'cashier') ? `<button class="btn ok" id="inv-in">${icon('package-plus', 18)} ${t('Kirim')}</button>` : ''}
        ${manage ? `<button class="btn primary" id="inv-add">${icon('plus', 18)} ${t('Masalliq')}</button>` : ''}</div>`;
    if (UI.inv.tab === 'moves' && d.moves) {
      const M = STOCK_MOVES();
      return `${head}${tabs}<div class="card">${d.moves.length ? `<div class="table-wrap"><table>
        <tr><th>${t('Sana')}</th><th>${t('Masalliq')}</th><th>${t('Turi')}</th><th class="right">${t('Miqdor')}</th><th class="right">${t('Summa')}</th><th>${t('Izoh')}</th><th>${t('Kim')}</th></tr>
        ${d.moves.map((m) => `<tr><td class="small">${fmtDateTime(m.created_at)}</td><td><b>${esc(m.ingredient)}</b></td>
          <td><span class="chip ${(M[m.kind] || [])[1] || ''}">${esc((M[m.kind] || [m.kind])[0])}</span>${m.order_id ? ` <span class="small muted">#${m.order_id}</span>` : ''}</td>
          <td class="right num ${m.qty < 0 ? 'red' : ''}">${m.qty > 0 ? '+' : ''}${qtyText(m.qty, m.unit)}</td><td class="right num">${m.amount ? money(Math.abs(m.amount)) : '—'}</td>
          <td class="small">${esc(m.note || '')}</td><td class="small muted">${esc(m.user_name || '')}</td></tr>`).join('')}</table></div>` : emptyState('warehouse', t("Hali harakat yo'q"))}</div>`;
    }
    return `${head}${tabs}
      <div class="kpis">
        ${kpi(t('Masalliqlar'), d.rows.length, '', '', 'warehouse')}
        ${kpi(t('Ombordagi qiymat'), money(d.value), t('qoldiq × oxirgi narx'), '', 'coins')}
        ${kpi(t('Kam qolgan'), d.low, low.map((r) => esc(r.name)).join(', '), d.low ? 'bad' : 'good', 'triangle-alert')}</div>
      <div class="card">${d.rows.length ? `<div class="table-wrap"><table>
        <tr><th>${t('Masalliq')}</th><th class="right">${t('Qoldiq')}</th><th class="right">${t('Minimal')}</th><th class="right">${t('Narx (1 birlik)')}</th><th class="right">${t('Qiymat')}</th><th class="right">${t('Taomlarda')}</th><th></th></tr>
        ${d.rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td>
          <td class="right num ${r.low ? 'red' : ''}"><b>${qtyText(r.stock, r.unit)}</b>${r.low ? ` ${icon('triangle-alert', 14)}` : ''}</td>
          <td class="right num">${r.min_stock ? qtyText(r.min_stock, r.unit) : '—'}</td><td class="right num">${money(r.cost)}</td><td class="right num">${money(Math.max(0, r.value))}</td>
          <td class="right">${r.dishes || '—'}</td>
          <td class="actions">${can('owner', 'admin', 'chef') ? `<button class="btn sm" data-wo="${r.id}">${icon('trash-2', 15)} ${t('Chiqarish')}</button><button class="btn sm" data-cnt="${r.id}">${icon('list', 15)} ${t('Sanoq')}</button>` : ''}
            ${manage ? `<button class="icon-btn" data-ied="${r.id}">${icon('pencil', 18)}</button><button class="icon-btn danger" data-idel="${r.id}">${icon('x', 18)}</button>` : ''}</td></tr>`).join('')}
      </table></div>` : emptyState('warehouse', t("Masalliq qo'shing (guruch, go'sht, yog'…), so'ng Menyu bo'limida har taomga tex-karta yozing — sotilganda ombordan o'zi ayiriladi."))}</div>`;
  },
  bind(root, d) {
    const byId = (id) => d.rows.find((r) => r.id === Number(id));
    root.querySelectorAll('[data-itab]').forEach((b) => b.onclick = () => { UI.inv.tab = b.dataset.itab; refreshView(); });
    const add = root.querySelector('#inv-add'); if (add) add.onclick = () => ingredientForm({}, d.units);
    const inb = root.querySelector('#inv-in'); if (inb) inb.onclick = () => receiveForm(d.rows);
    root.querySelectorAll('[data-ied]').forEach((b) => b.onclick = () => ingredientForm(byId(b.dataset.ied), d.units));
    root.querySelectorAll('[data-wo]').forEach((b) => b.onclick = () => adjustForm(byId(b.dataset.wo), 'writeoff'));
    root.querySelectorAll('[data-cnt]').forEach((b) => b.onclick = () => adjustForm(byId(b.dataset.cnt), 'count'));
    root.querySelectorAll('[data-idel]').forEach((b) => b.onclick = async () => {
      const r = byId(b.dataset.idel);
      if (!(await confirmModal(t("O'chirish"), t('"{0}" o\'chirilsinmi? U tex-kartalardan ham olib tashlanadi.', esc(r.name)), t("O'chirish")))) return;
      try { await DEL(`/api/ingredients/${r.id}`); refreshView(); } catch (e) { toastError(e); }
    });
  },
};

function ingredientForm(r = {}, units = ['kg', 'g', 'l', 'ml', 'dona']) {
  openModal({
    title: `${icon('warehouse')} ${r.id ? esc(r.name) : t('Yangi masalliq')}`,
    body: `<div class="form-grid"><label class="field">${t('Nomi')}<input name="name" value="${esc(r.name || '')}" required placeholder="${esc(t('Masalan: Guruch'))}"></label>
      <label class="field">${t("O'lchov")}<select name="unit">${units.map((u) => `<option value="${u}" ${r.unit === u ? 'selected' : ''}>${UNIT_NAMES()[u] || u}</option>`).join('')}</select></label>
      <label class="field">${t('Narx (1 birlik uchun)')}<input type="number" name="cost" min="0" value="${r.cost ?? ''}"></label>
      <label class="field">${t('Minimal qoldiq (ogohlantirish)')}<input type="number" name="min_stock" min="0" step="0.001" value="${r.min_stock ?? ''}"></label>
      ${r.id ? '' : `<label class="field">${t('Hozirgi qoldiq')}<input type="number" name="stock" min="0" step="0.001"></label>`}</div>`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
      const x = formData(f);
      await (r.id ? PUT(`/api/ingredients/${r.id}`, x) : POST('/api/ingredients', x));
      toast(t('Saqlandi'), 'ok'); refreshView();
    } }],
  });
}

function receiveForm(rows) {
  if (!rows.length) return toast(t("Avval masalliq qo'shing"), 'warn');
  const line = (first) => `<div class="recv-line form-grid" style="grid-template-columns:2fr 1fr 1fr auto;align-items:end">
      <label class="field">${first ? t('Masalliq') : ''}<select name="ing">${rows.map((r) => `<option value="${r.id}">${esc(r.name)} (${UNIT_NAMES()[r.unit] || r.unit})</option>`).join('')}</select></label>
      <label class="field">${first ? t('Miqdor') : ''}<input type="number" name="qty" min="0" step="0.001" placeholder="${esc(t('Miqdor'))}"></label>
      <label class="field">${first ? t('Narx (1 birlik)') : ''}<input type="number" name="price" min="0"></label>
      <button type="button" class="icon-btn danger" data-rm>${icon('x', 18)}</button></div>`;
  const form = openModal({
    title: `${icon('package-plus')} ${t('Omborga kirim')}`, size: 'wide',
    body: `<div id="recv-lines" class="stack">${line(true)}</div>
      <button type="button" class="btn sm" id="recv-more" style="margin-top:10px">${icon('plus', 16)} ${t('Yana masalliq')}</button>
      <div id="recv-sum" class="lead" style="margin-top:12px"></div>
      <label class="check" style="margin-top:8px"><input type="checkbox" name="paid" checked> ${t('Kassadan to\'landi ("Mahsulotlar" xarajati bo\'lib yoziladi)')}</label>
      <div class="form-grid" style="margin-top:8px"><label class="field">${t("To'lov turi")}<select name="method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label>
        <label class="field">${t('Izoh (yetkazib beruvchi)')}<input name="note"></label></div>`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'ok', icon: 'check', onClick: async (f) => {
      const items = [...f.querySelectorAll('.recv-line')].map((l) => ({ ingredient_id: Number(l.querySelector('[name=ing]').value), qty: l.querySelector('[name=qty]').value, price: l.querySelector('[name=price]').value }))
        .filter((x) => Number(x.qty) > 0);
      if (!items.length) { toast(t('Miqdorni kiriting'), 'warn'); return false; }
      const r = await POST('/api/inventory/receive', { items, paid: f.paid.checked, method: f.method.value, note: f.note.value });
      toast(`${t('Saqlandi')} · ${moneyText(r.total)}`, 'ok'); refreshView();
    } }],
  });
  const fill = (l) => {
    const sel = l.querySelector('[name=ing]');
    const set = () => { const r = rows.find((x) => x.id === Number(sel.value)); l.querySelector('[name=price]').value = r ? r.cost : ''; };
    sel.onchange = () => { set(); sum(); }; set();
    l.querySelector('[data-rm]').onclick = () => { if (form.querySelectorAll('.recv-line').length > 1) { l.remove(); sum(); } };
  };
  const sum = () => {
    const total = [...form.querySelectorAll('.recv-line')].reduce((s, l) => s + (Number(l.querySelector('[name=qty]').value) || 0) * (Number(l.querySelector('[name=price]').value) || 0), 0);
    form.querySelector('#recv-sum').innerHTML = `${t('Jami')}: <b>${money(Math.round(total))}</b>`;
  };
  form.querySelectorAll('.recv-line').forEach(fill);
  form.querySelector('#recv-more').onclick = () => { form.querySelector('#recv-lines').insertAdjacentHTML('beforeend', line()); fill(form.querySelector('.recv-line:last-child')); };
  form.addEventListener('input', sum);
  sum();
}

function adjustForm(r, kind) {
  openModal({
    title: `${icon(kind === 'count' ? 'list' : 'trash-2')} ${esc(r.name)} — ${kind === 'count' ? t('sanoq') : t('hisobdan chiqarish')}`,
    body: `<p class="muted">${t('Dasturda')}: <b>${qtyText(r.stock, r.unit)}</b></p>
      <label class="field">${kind === 'count' ? t('Haqiqatda qancha bor') : t('Qancha chiqariladi')} (${UNIT_NAMES()[r.unit] || r.unit})<input type="number" name="qty" min="0" step="0.001" required></label>
      <label class="field" style="margin-top:12px">${kind === 'count' ? t('Izoh') : t('Sabab (majburiy)')}<input name="note" ${kind === 'count' ? '' : 'required'} placeholder="${esc(kind === 'count' ? '' : t("Masalan: buzilgan, to'kilgan"))}"></label>`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: kind === 'count' ? 'primary' : 'danger', onClick: async (f) => {
      await POST('/api/inventory/adjust', { ingredient_id: r.id, kind, qty: f.qty.value, note: f.note.value });
      toast(t('Saqlandi'), 'ok'); refreshView();
    } }],
  });
}

// Recipe (tex-karta) of a dish: ingredients for one portion; the dish's cost follows it.
async function recipeDialog(dish) {
  let ings; let rec;
  try { [ings, rec] = await Promise.all([GET('/api/ingredients'), GET(`/api/dishes/${dish.id}/recipe`)]); } catch (e) { return toastError(e); }
  const rows = ings.rows;
  if (!rows.length) return toast(t("Avval Ombor bo'limida masalliq qo'shing"), 'warn');
  const line = (it = {}, i = 1) => `<div class="rec-line form-grid" style="grid-template-columns:2fr 1fr auto auto;align-items:end">
      <label class="field">${i ? '' : t('Masalliq')}<select name="ing">${rows.map((r) => `<option value="${r.id}" ${it.ingredient_id === r.id ? 'selected' : ''}>${esc(r.name)} (${UNIT_NAMES()[r.unit] || r.unit})</option>`).join('')}</select></label>
      <label class="field">${i ? '' : t('1 porsiyaga')}<input type="number" name="qty" min="0" step="0.001" value="${it.qty ?? ''}" placeholder="${esc(t('1 porsiyaga'))}"></label>
      <span class="rec-cost small muted" style="min-width:90px;padding-bottom:12px"></span>
      <button type="button" class="icon-btn danger" data-rm>${icon('x', 18)}</button></div>`;
  const form = openModal({
    title: `${icon('chef-hat')} ${esc(dish.name)} — ${t('tex-karta')}`, size: 'wide',
    body: `<p class="small muted" style="margin-top:0">${t("Bir porsiya uchun masalliqlar. Masalan, 1 osh: guruch 0.15 kg, go'sht 0.1 kg. Chek yopilganda ombordan o'zi ayiriladi, taomning tannarxi shu yerdan hisoblanadi.")}</p>
      <div id="rec-lines" class="stack">${(rec.items.length ? rec.items : [{}]).map(line).join('')}</div>
      <button type="button" class="btn sm" id="rec-more" style="margin-top:10px">${icon('plus', 16)} ${t('Yana masalliq')}</button>
      <div id="rec-sum" class="sum-rows num" style="margin-top:14px"></div>`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
      const items = [...f.querySelectorAll('.rec-line')].map((l) => ({ ingredient_id: Number(l.querySelector('[name=ing]').value), qty: l.querySelector('[name=qty]').value }))
        .filter((x) => Number(x.qty) > 0);
      const r = await PUT(`/api/dishes/${dish.id}/recipe`, { items });
      toast(`${t('Saqlandi')} · ${t('Tannarx')}: ${moneyText(r.cost)}`, 'ok'); refreshView();
    } }],
  });
  const calc = () => {
    let cost = 0;
    form.querySelectorAll('.rec-line').forEach((l) => {
      const r = rows.find((x) => x.id === Number(l.querySelector('[name=ing]').value));
      const c = r ? (Number(l.querySelector('[name=qty]').value) || 0) * r.cost : 0;
      cost += c;
      l.querySelector('.rec-cost').textContent = c ? `${num(Math.round(c))}` : '';
    });
    cost = Math.round(cost);
    const margin = dish.price ? Math.round(((dish.price - cost) / dish.price) * 100) : 0;
    form.querySelector('#rec-sum').innerHTML = `<span>${t('Tannarx')}</span><span class="right"><b>${money(cost)}</b></span>
      <span>${t('Narxi')}</span><span class="right">${money(dish.price)}</span>
      <span>${t('Foyda (ustama)')}</span><span class="right ${margin < 30 ? 'red' : ''}"><b>${money(dish.price - cost)} · ${margin}%</b></span>`;
  };
  const wire = (l) => { l.querySelector('[data-rm]').onclick = () => { l.remove(); calc(); }; };
  form.querySelectorAll('.rec-line').forEach(wire);
  form.querySelector('#rec-more').onclick = () => { form.querySelector('#rec-lines').insertAdjacentHTML('beforeend', line()); wire(form.querySelector('.rec-line:last-child')); calc(); };
  form.addEventListener('input', calc);
  form.addEventListener('change', calc);
  calc();
}

// ---------- Pro: branches side by side ----------
Views.branches = {
  title: () => t('Filiallar'), icon: () => 'network', roles: ['owner'], module: 'branches', on: () => (App.branchCount || 0) > 0,
  async load() { const r = periodRange(); return GET(`/api/branches?from=${r.from}&to=${r.to}`); },
  render(d) {
    const T = d.total;
    const best = Math.max(1, ...d.rows.map((r) => r.total));
    return `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Filiallar')}</h1></div>
      ${periodPicker()}
      <div class="kpis">
        ${kpi(t('Jami savdo'), money(T.total), t('{0} chek · o\'rtacha {1}', T.orders, money(T.avg_check)), 'good', 'trending-up')}
        ${kpi(t('Chiqim'), money(T.expense), '', '', 'arrow-right-left')}
        ${kpi(t('Foyda'), money(T.profit), '', T.profit >= 0 ? 'good' : 'bad', 'coins')}
        ${kpi(t('Mehmonlar'), num(T.guests), T.open_orders ? t('{0} ta ochiq chek', T.open_orders) : '', '', 'users')}</div>
      <div class="card"><div class="table-wrap"><table>
        <tr><th>${t('Filial')}</th><th class="right">${t('Savdo')}</th><th></th><th class="right">${t('Cheklar')}</th><th class="right">${t("O'rtacha chek")}</th>
          <th class="right">${t('Naqd')}</th><th class="right">${t('Karta')}</th><th class="right">${t('Qarzga')}</th><th class="right">${t('Chiqim')}</th><th class="right">${t('Foyda')}</th></tr>
        ${d.rows.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.main ? ` <span class="chip">${t('asosiy')}</span>` : ''}${r.open_orders ? `<br><span class="small muted">${t('{0} ta ochiq chek', r.open_orders)}</span>` : ''}</td>
          <td class="right num"><b>${money(r.total)}</b></td><td style="width:18%;min-width:80px"><span class="track br-track"><span class="fill" style="width:${(r.total / best) * 100}%"></span></span></td>
          <td class="right">${r.orders}</td><td class="right num">${money(r.avg_check)}</td><td class="right num">${money(r.cash)}</td><td class="right num">${money(r.card + r.transfer)}</td>
          <td class="right num">${r.debt ? money(r.debt) : '—'}</td><td class="right num">${money(r.expense)}</td><td class="right num ${r.profit < 0 ? 'red' : ''}"><b>${money(r.profit)}</b></td></tr>`).join('')}
        <tr style="background:var(--panel-2)"><td><b>${t('Jami')}</b></td><td class="right num"><b>${money(T.total)}</b></td><td></td><td class="right"><b>${T.orders}</b></td><td class="right num">${money(T.avg_check)}</td>
          <td class="right num">${money(T.cash)}</td><td class="right num">${money(T.card + T.transfer)}</td><td class="right num">${T.debt ? money(T.debt) : '—'}</td><td class="right num">${money(T.expense)}</td><td class="right num"><b>${money(T.profit)}</b></td></tr>
      </table></div></div>
      <p class="small muted" style="margin-top:10px">${icon('info', 14)} ${t("Har bir filialning batafsil hisobotini o'sha filial dasturida ko'rasiz. Filiallarni platforma egasi bog'laydi.")}</p>`;
  },
  bind(root) { bindPeriod(root); },
};

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
  title: () => W('Menyu'), icon: () => (isShop() ? 'package' : 'utensils'), roles: ['owner', 'admin'], refreshOn: ['menu'],
  async load() { return GET('/api/menu'); },
  render({ categories, dishes }) {
    const shop = isShop();
    const q = (UI.menuSearch || '').toLowerCase();
    const list = dishes.filter((d) => !q || `${d.name} ${d.barcode} ${d.size} ${d.color}`.toLowerCase().includes(q));
    const groups = [...categories, { id: null, name: t("Bo'limsiz"), icon: '' }].map((c) => ({ c, ds: list.filter((d) => (d.category_id ?? null) === c.id) }));
    const low = dishes.filter((d) => d.stock != null && d.stock <= 3);
    return `<div class="page-head"><h1>${W('Menyu')}</h1>
      <input type="search" id="menu-search" placeholder="${esc(shop ? t('Shtrix-kod yoki nomi') : t('Qidirish'))}" value="${esc(UI.menuSearch || '')}" style="max-width:240px">
      <button class="btn" id="add-cat">${icon('plus', 18)} ${t("Bo'lim")}</button><button class="btn primary" id="add-dish">${icon('plus', 18)} ${W('Taom')}</button></div>
      ${shop && low.length ? `<div class="notice">${icon('triangle-alert', 18)} ${t('Kam qolgan: {0}', low.map((d) => `${esc(d.name)}${d.size ? ` ${esc(d.size)}` : ''} (${d.stock})`).join(', '))}</div>` : ''}
      ${groups.filter((g) => (g.c.id && !q) || g.ds.length).map(({ c, ds }) => `<div class="card"><div class="card-head"><h2>${c.id ? `<i class="cat-dot" style="background:${catColor({ categories }, c.id)}"></i>` : ''}${esc(c.icon)} ${esc(c.name)}</h2>
        ${c.id ? `<button class="icon-btn" data-edit-cat="${c.id}">${icon('pencil', 18)}</button><button class="icon-btn danger" data-del-cat="${c.id}">${icon('trash-2', 18)}</button>` : ''}</div>
        ${ds.length ? `<div class="table-wrap"><table>
        ${ds.map((d) => `<tr><td style="width:44px;font-size:24px">${d.photo ? `<img class="dish-thumb" src="${dishPhoto(d.photo)}" alt="" loading="lazy">` : esc(d.icon)}</td><td><b>${esc(d.name)}</b>${d.size || d.color ? ` <span class="chip">${esc([d.size, d.color].filter(Boolean).join(' · '))}</span>` : ''}<br>
            <span class="small muted">${shop ? `${d.barcode ? `${icon('scan-barcode', 13)} ${esc(d.barcode)} · ` : ''}${icon('package', 13)} ${d.stock ?? '∞'} ${esc(d.unit)}`
              : d.needs_kitchen ? `${icon('chef-hat', 13)} ${d.prep_minutes} ${t('daq')}` : `${icon('check', 13)} ${t('Darhol')}`}</span></td>
          <td class="right num"><b>${money(d.price)}</b>${shop && d.cost ? `<br><span class="small muted">${money(d.cost)}</span>` : ''}</td>
          <td class="actions">${shop ? `<button class="btn sm" data-receive="${d.id}" title="${esc(t('Kirim qilish'))}">${icon('package-plus', 16)} ${t('Kirim')}</button>` : ''}${!shop && moduleOn('inventory') && can('owner', 'admin') ? `<button class="btn sm" data-recipe="${d.id}" title="${esc(t('Tex-karta'))}">${icon('chef-hat', 16)} ${t('Tex-karta')}</button>` : ''}${d.available ? `<button class="btn sm" data-stop="${d.id}" title="${esc(t('Tugadi'))}">${icon('ban', 16)}</button>` : `<button class="btn sm danger" data-start="${d.id}">${icon('ban', 16)} ${t('Tugadi')}</button>`}
            <button class="icon-btn" data-edit="${d.id}">${icon('pencil', 18)}</button><button class="icon-btn danger" data-del="${d.id}">${icon('trash-2', 18)}</button></td></tr>`).join('')}
        </table></div>` : `<p class="muted">${W("Bu bo'limda taom yo'q")}</p>`}</div>`).join('')}`;
  },
  bind(root, { categories, dishes }) {
    const ms = root.querySelector('#menu-search');
    ms.oninput = () => { UI.menuSearch = ms.value; renderView(currentData); };
    root.querySelectorAll('[data-receive]').forEach((b) => b.onclick = () => receiveDialog(dishes.find((d) => d.id === Number(b.dataset.receive))));
    const editCat = (c = {}) => openModal({
      title: `${icon('list')} ${c.id ? t("Bo'limni tahrirlash") : t("Yangi bo'lim")}`,
      body: `<div class="form-grid"><label class="field">${t('Nomi')}<input name="name" value="${esc(c.name || '')}" required></label>
        <label class="field">${t('Belgi (emoji)')}<input name="icon" value="${esc(c.icon || '🍽️')}"></label>
        <label class="field">${t('Tartib')}<input type="number" name="sort" value="${c.sort ?? categories.length}"></label></div>
        <div class="field" style="margin-top:12px">${t('Rangi (buyurtma ekranida taomlar shu rangda chiqadi)')}
          <div class="row" style="margin-top:6px"><input type="hidden" name="color" value="${esc(c.color || '')}">
            <button type="button" class="swatch auto ${c.color ? '' : 'on'}" data-col="">${t('Avto')}</button>
            ${CAT_COLORS.map((x) => `<button type="button" class="swatch ${c.color === x ? 'on' : ''}" data-col="${x}" style="background:${x}"></button>`).join('')}</div></div>`,
      onMount: (f) => f.querySelectorAll('[data-col]').forEach((b) => b.onclick = () => {
        f.color.value = b.dataset.col;
        f.querySelectorAll('[data-col]').forEach((x) => x.classList.toggle('on', x === b));
      }),
      actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
        const d = formData(f);
        if (c.id) await PUT(`/api/categories/${c.id}`, d); else await POST('/api/categories', d);
        refreshView();
      } }],
    });
    const shop = isShop();
    const editDish = (d = {}) => openModal({
      title: `${icon(shop ? 'package' : 'utensils')} ${d.id ? esc(d.name) : W('Yangi taom')}`, size: 'wide',
      body: `<div class="form-grid">
        <label class="field">${t('Nomi')}<input name="name" value="${esc(d.name || '')}" required></label>
        <label class="field">${t("Bo'lim")}<select name="category_id"><option value="">—</option>${categories.map((c) => `<option value="${c.id}" ${c.id === d.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field">${t('Narxi')}<input type="number" name="price" min="0" value="${d.price ?? ''}" required></label>
        <label class="field">${t('Tannarxi')}<input type="number" name="cost" min="0" value="${d.cost ?? 0}"></label>
        ${shop ? `<label class="field">${t('Shtrix-kod')}<input name="barcode" value="${esc(d.barcode || '')}" placeholder="${esc(t('Skanerlang yoki yozing'))}"></label>
          ${App.biz === 'clothing' ? `<label class="field">${t("O'lcham")}<input name="size" value="${esc(d.size || '')}" placeholder="S, M, L, 42"></label>
          <label class="field">${t('Rang')}<input name="color" value="${esc(d.color || '')}"></label>` : ''}
          <label class="field">${t("O'lchov birligi")}<select name="unit">${['dona', 'kg', 'litr', 'metr', 'quti', 'juft'].map((u) => `<option ${(d.unit || 'dona') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>`
        : `<label class="field">${t('Tayyorlash vaqti (daq)')}<input type="number" name="prep_minutes" min="0" value="${d.prep_minutes ?? 15}"></label>
          <input type="hidden" name="unit" value="${esc(d.unit || 'porsiya')}">`}
        <label class="field">${t('Belgi (emoji)')}<input name="icon" value="${esc(d.icon || (shop ? '📦' : '🍽️'))}"></label>
        <label class="field">${t("Qoldiq (bo'sh = cheksiz)")}<input type="number" name="stock" min="0" value="${d.stock ?? ''}"></label></div>
        ${shop ? '<input type="hidden" name="needs_kitchen" value="">' : `<label class="check" style="margin-top:14px"><input type="checkbox" name="needs_kitchen" ${d.needs_kitchen === 0 ? '' : 'checked'}> ${icon('chef-hat', 18)} ${t('Oshxonada tayyorlanadi')}</label>`}
        ${!shop && moduleOn('qrmenu') ? `<h3 style="margin:18px 0 8px">${icon('qr-code', 18)} ${t('QR-menyu uchun')}</h3>
        <div class="dish-photo-edit"><div class="dish-photo" id="dp-prev">${d.photo ? `<img src="${dishPhoto(d.photo)}" alt="">` : esc(d.icon || '🍽️')}</div>
          <div class="stack" style="gap:8px"><input type="hidden" name="photo" value="${d.photo || ''}">
            <label class="btn sm">${icon('image', 16)} ${t('Rasm tanlash')}<input type="file" accept="image/*" id="dp-file" hidden></label>
            <button type="button" class="btn sm" id="dp-del" ${d.photo ? '' : 'hidden'}>${icon('x', 16)} ${t("Rasmni olib tashlash")}</button>
            <span class="small muted">${t("Mijoz telefonida ko'rinadi. Kvadrat, yorug' rasm yaxshi chiqadi.")}</span></div></div>
        <label class="field" style="margin-top:12px">${t('Qisqa tavsif (mijozga)')}<textarea name="description" rows="2" maxlength="300" placeholder="${esc(t("Masalan: mol go'shti, sabzi, no'xat — 400 g"))}">${esc(d.description || '')}</textarea></label>` : ''}`,
      onMount: (f) => {
        const file = f.querySelector('#dp-file');
        if (!file) return;
        const prev = f.querySelector('#dp-prev');
        const del = f.querySelector('#dp-del');
        file.onchange = async () => {
          const fl = file.files[0];
          if (!fl) return;
          try {
            prev.innerHTML = `<span class="small muted">${t('Yuklanmoqda…')}</span>`;
            const r = await POST('/api/assets', { kind: 'dish', data: await imageToDataUrl(fl, 900, 'image/jpeg') });
            f.photo.value = r.id; prev.innerHTML = `<img src="${dishPhoto(r.id)}" alt="">`; del.hidden = false;
          } catch (e) { prev.textContent = d.icon || '🍽️'; toastError(e); }
        };
        del.onclick = () => { f.photo.value = ''; prev.textContent = f.icon.value || '🍽️'; del.hidden = true; };
      },
      actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
        const x = formData(f);
        x.category_id = x.category_id ? Number(x.category_id) : null;
        x.stock = x.stock === '' ? null : x.stock;
        if ('photo' in x) x.photo = x.photo ? Number(x.photo) : null;
        if (shop) { x.needs_kitchen = false; x.prep_minutes = 0; }
        if (d.id) await PUT(`/api/dishes/${d.id}`, x); else await POST('/api/dishes', x);
        toast(t('Saqlandi'), 'ok'); refreshView();
      } }],
    });
    root.querySelector('#add-cat').onclick = () => editCat();
    root.querySelector('#add-dish').onclick = () => editDish();
    root.querySelectorAll('[data-edit-cat]').forEach((b) => b.onclick = () => editCat(categories.find((c) => c.id === Number(b.dataset.editCat))));
    root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editDish(dishes.find((d) => d.id === Number(b.dataset.edit))));
    root.querySelectorAll('[data-recipe]').forEach((b) => b.onclick = () => recipeDialog(dishes.find((d) => d.id === Number(b.dataset.recipe))));
    const avail = async (id, available) => { try { await POST(`/api/dishes/${id}/availability`, { available }); refreshView(); } catch (e) { toastError(e); } };
    root.querySelectorAll('[data-stop]').forEach((b) => b.onclick = () => avail(b.dataset.stop, false));
    root.querySelectorAll('[data-start]').forEach((b) => b.onclick = () => avail(b.dataset.start, true));
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal(W("Taomni o'chirish"), W('Taom menyudan olib tashlansinmi?'), t("O'chirish")))) return;
      try { await DEL(`/api/dishes/${b.dataset.del}`); refreshView(); } catch (e) { toastError(e); }
    });
    root.querySelectorAll('[data-del-cat]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal(t("Bo'limni o'chirish"), t("Bo'lim o'chirilsinmi?"), t("O'chirish")))) return;
      try { await DEL(`/api/categories/${b.dataset.delCat}`); refreshView(); } catch (e) { toastError(e); }
    });
  },
};

// Goods arrived: stock grows; the purchase can be written down as an expense at once.
function receiveDialog(d) {
  openModal({
    title: `${icon('package-plus')} ${esc(d.name)} — ${t('Kirim qilish')}`,
    body: `<p class="muted">${t('Hozirgi qoldiq')}: <b>${d.stock ?? '∞'} ${esc(d.unit)}</b></p>
      <div class="form-grid"><label class="field">${t('Keldi (soni)')}<input type="number" name="qty" min="1" required></label>
        <label class="field">${t('Tannarxi (1 dona)')}<input type="number" name="cost" min="0" value="${d.cost || ''}"></label></div>
      ${moduleOn('finance') ? `<label class="check" style="margin-top:12px"><input type="checkbox" name="expense" checked> ${t('Xarajat sifatida yozilsin (Mahsulotlar)')}</label>` : ''}`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
      const x = formData(f);
      if (!x.qty) { toast(t('Soni kiriting'), 'warn'); return false; }
      await POST(`/api/dishes/${d.id}/receive`, { qty: x.qty, cost: x.cost, expense: !!x.expense });
      toast(t('Saqlandi'), 'ok'); refreshView();
    } }],
  });
}

// ---------- Staff: PIN and per-person rights ----------
function canEditRole(role) {
  return App.user.role === 'owner' || (App.user.role === 'admin' && ['cashier', 'waiter', 'chef'].includes(role));
}
Views.staff = {
  title: () => t('Xodimlar'), icon: () => 'users', roles: ['owner', 'admin'],
  async load() { return { users: await GET('/api/users') }; },
  render({ users }) {
    const order = ['owner', 'admin', 'cashier', 'waiter', 'chef'];
    const pl = App.plan;
    return `<div class="page-head"><h1>${t('Xodimlar')}</h1>${viewOn('attendance') ? `<a class="btn" href="#/attendance">${icon('calendar', 18)} ${t('Davomat')}</a>` : ''}${pl && pl.max_staff > 0 ? `<span class="chip ${pl.staff_used >= pl.max_staff ? 'red' : ''}" title="${esc(t('Tarif'))}: ${esc(pl.name)}">${icon('users', 14)} ${pl.staff_used}/${pl.max_staff}</span>` : ''}<button class="btn primary" id="add">${icon('plus', 18)} ${t('Xodim')}</button></div>
      <div class="card"><div class="table-wrap"><table>
      ${order.flatMap((role) => users.filter((u) => u.role === role)).map((u) => `<tr style="${u.active ? '' : 'opacity:.5'}" class="${canEditRole(u.role) ? 'clickable' : ''}" data-edit="${u.id}">
        <td><div class="row" style="flex-wrap:nowrap"><span class="avatar ${u.role}">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><br><span class="small muted">${icon(ROLE_ICONS[u.role], 13)} ${roleName(u.role)}</span></div></div></td>
        <td>${u.has_pin ? `<span class="chip green">${icon('key-round', 14)} PIN</span>` : `<span class="chip red">${icon('key-round', 14)} ${t("PIN yo'q")}</span>`}</td>
        <td>${u.perms.print ? `<span class="chip" title="${esc(t('Chek chiqaradi'))}">${icon('printer', 14)}</span>` : ''} ${u.perms.close ? `<span class="chip" title="${esc(t('Chek yopadi'))}">${icon('wallet', 14)}</span>` : ''}</td>
        <td class="small muted">${u.role === 'waiter' && !sellsAtCounter() ? (u.rooms.map((r) => esc(r.number)).join(', ') || '—') : ''}</td>
        <td class="actions">${u.active ? '' : `<span class="chip">${t('Bloklangan')}</span>`} ${canEditRole(u.role) ? icon('chevron-right', 18) : ''}</td></tr>`).join('')}
      </table></div></div>
      ${sellsAtCounter() ? '' : `<p class="small muted" style="margin-top:12px">${icon('info', 14)} ${t("Ofitsantni xonaga biriktirish: Sozlamalar → Xonalar.")}</p>`}`;
  },
  bind(root, { users }) {
    const permSel = (name, val, def) => `<select name="${name}"><option value="" ${val === null ? 'selected' : ''}>${t('Lavozim bo\'yicha')} (${def ? t('Ha') : t("Yo'q")})</option>
      <option value="1" ${val === 1 ? 'selected' : ''}>${t('Ha')}</option><option value="0" ${val === 0 ? 'selected' : ''}>${t("Yo'q")}</option></select>`;
    const DEF = { cashier: [1, 1], waiter: [1, 0], chef: [0, 0] };
    const edit = (u = {}) => {
      const roles = ['owner', 'admin', 'cashier', 'waiter', 'chef'].filter((r) => canEditRole(r) && !(isShop() && r === 'chef'));
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
  session_kicked: t('Boshqa qurilmadan kirdi (avvalgisi chiqarildi)'), device_add: t('Qurilma uladi'), device_remove: t('Qurilmani uzdi'), pay_payment: t("Ish haqi to'ladi"), pay_bonus: t('Bonus yozdi'), pay_fine: t('Jarima yozdi'),
  customer_create: t("Mijoz qo'shdi"), customer_update: t('Mijozni tahrirladi'), debt_pay: t("Qarz to'lovini oldi"), ingredient_save: t('Masalliqni saqladi'), ingredient_delete: t("Masalliqni o'chirdi"),
  stock_in: t('Omborga kirim qildi'), stock_receive: t('Omborga kirim qildi'), stock_count: t('Ombor sanog\'i'), stock_writeoff: t('Hisobdan chiqardi'), recipe_set: t('Tex-kartani saqladi'), staff_meal: t('Xodim hisobiga yopdi'),
  guest_approve: t('QR buyurtmani tasdiqladi'), guest_reject: t('QR buyurtmani rad etdi'), qr_renew: t('QR kodni yangiladi'),
});
const SETTINGS_TABS = () => [
  ['general', 'store', t('Muassasa'), ['owner', 'admin']],
  ['look', 'palette', t("Ko'rinish"), ['owner', 'admin']],
  ...(isShop() ? [] : [['rooms', 'door-open', App.biz === 'fastfood' ? t('Stollar') : t('Xonalar'), ['owner', 'admin']]]),
  ...(isShop() ? [] : [['qr', 'qr-code', t('QR-menyu'), ['owner', 'admin'], 'qrmenu']]),
  ['rights', 'shield-check', t('Ruxsatlar'), ['owner', 'admin']],
  ['devices', 'monitor-smartphone', t('Qurilmalar'), ['owner', 'admin']],
  ['audit', 'history', t('Amallar tarixi'), ['owner', 'admin'], 'audit'],
  ['backup', 'database', t('Zaxira'), ['owner', 'admin', 'cashier']],
  ['me', 'user', t('Mening sozlamalarim'), ['owner', 'admin', 'cashier', 'waiter', 'chef']],
  ...(App.plan ? [['plan', 'star', t('Mening tarifim'), ['owner']]] : []),
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
    if (tab === 'qr') data.qr = await GET('/api/qr');
    if (tab === 'audit') data.rows = await GET('/api/audit?limit=300');
    if (tab === 'backup') [data.local, data.folder] = await Promise.all([LocalBackup.all(), FolderBackup.status()]);
    if (tab === 'me' && App.user.role !== 'owner' && moduleOn('payroll')) data.pay = await GET('/api/my/payroll').catch(() => null);
    return data;
  },
  render(d) {
    const tabs = this.tabs();
    const moneyLink = viewOn('money') ? `<a class="btn sm nav-money-sm" href="#/money">${icon('eye-off', 16)} ${t('Moliya')}</a>` : '';
    return `<div class="page-head"><h1>${t('Sozlamalar')}</h1>${moneyLink}</div>
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
      ${moduleOn('payroll') ? `<h3 style="margin:18px 0 10px">${icon('utensils', 18)} ${t('Xodimlar ovqati')}</h3>
      <div class="form-grid"><label class="field">${t('Kassada "Xodim hisobiga" yopilgan chek ish haqidan qaysi narxda ushlanadi')}<select name="staff_meal_price">
        <option value="menu" ${s.staff_meal_price !== 'cost' ? 'selected' : ''}>${t('Menyu narxida')}</option>
        <option value="cost" ${s.staff_meal_price === 'cost' ? 'selected' : ''}>${t('Tannarxda (taomga kiritilgan tannarx)')}</option></select></label></div>` : ''}
      ${moduleOn('customers') ? `<h3 style="margin:18px 0 10px">${icon('gift', 18)} ${t('Keshbek')}</h3>
      <div class="form-grid"><label class="field">${t("Mijozga to'lagan pulining necha foizi bonus bo'lib qaytadi, %")}<input type="number" name="cashback_pct" min="0" max="30" step="0.5" value="${s.cashback_pct ?? 3}"></label></div>
      <p class="small muted" style="margin-top:8px">${t("Bonus keyingi tashrifda chekdan ayiriladi. 0 qo'ysangiz keshbek o'chadi.")}</p>` : ''}
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

  tab_look() {
    const s = App.settings;
    const bg = s.lock_bg || { mode: 'default' };
    const code = App.tenant.code;
    const modes = [['default', 'sparkles', t('Standart')], ['builtin', 'grid-2x2', t('Tayyor rasmlar')], ['auto', 'image', t('Har kuni boshqa')], ['color', 'palette', t('Rang')], ['image', 'upload', t("O'z rasmingiz")]];
    return `<div class="grid grid-2">
      <form class="card" id="logo-form"><div class="card-head"><h2>${icon('image')} ${t('Logotip')}</h2></div>
        <div class="logo-box">${s.logo ? `<img src="/media/${esc(code)}/${s.logo}" alt="">` : `<span class="muted">${t("Logotip yo'q")}</span>`}</div>
        <p class="small muted">${t("Ish stoli, yuqori panel va chekda chiqadi. PNG (shaffof fon) yoki JPG.")}</p>
        <div class="row"><label class="btn primary">${icon('upload', 18)} ${t('Yuklash')}<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg" hidden></label>
          ${s.logo ? `<button type="button" class="btn red-text" id="logo-del">${icon('trash-2', 18)} ${t("O'chirish")}</button>` : ''}</div></form>
      <form class="card" id="rlogo-form"><div class="card-head"><h2>${icon('printer')} ${t('Chekdagi logotip')}</h2></div>
        <label class="check"><input type="checkbox" id="rlogo-on" ${s.receipt_logo ? 'checked' : ''}> ${t("Chek tepasida logotip chiqsin")}</label>
        <div class="logo-box receipt-box" style="margin-top:10px">${s.receipt_logo_id || s.logo ? `<img src="/media/${esc(code)}/${s.receipt_logo_id || s.logo}" alt="">` : `<span class="muted">${t("Logotip yo'q")}</span>`}</div>
        <p class="small muted">${t("Chek printeri oq-qora chiqaradi. Alohida oq-qora logotip yuklasangiz, chekda o'sha chiqadi; bo'lmasa — asosiy logotip. PNG yoki JPG.")}</p>
        <div class="row"><label class="btn">${icon('upload', 18)} ${t('Chek uchun yuklash')}<input type="file" id="rlogo-file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg" hidden></label>
          ${s.receipt_logo_id ? `<button type="button" class="btn red-text" id="rlogo-del">${icon('trash-2', 18)} ${t("O'chirish")}</button>` : ''}</div></form>
      <form class="card" id="bg-form"><div class="card-head"><h2>${icon('monitor-smartphone')} ${t('Ish stoli foni')}</h2></div>
        <div class="seg" style="margin-bottom:12px">${modes.map(([k, ic, n]) => `<button type="button" class="${bg.mode === k ? 'active' : ''}" data-bgmode="${k}">${icon(ic, 16)} ${n}</button>`).join('')}</div>
        <div id="bg-extra"></div>
        <div class="bg-preview" id="bg-preview"></div>
        <p class="small muted" style="margin-top:8px">${icon('info', 14)} ${t("Yozuvlar har qanday fonda o'qiladigan bo'lishi uchun rang avtomatik moslashadi.")}</p></form>
    </div>`;
  },
  bind_look(root) {
    const s = App.settings;
    const code = App.tenant.code;
    const cur = { ...(s.lock_bg || { mode: 'default' }) };
    const colors = ['#0b1f33', '#0f766e', '#1e3a8a', '#4c1d95', '#7f1d1d', '#14532d', '#111827', '#f5f5f4', '#fde68a', '#bae6fd'];
    const save = async (patch, msg = t('Saqlandi')) => {
      try { App.settings = await PUT('/api/settings', patch); await loadInfo(code); toast(msg, 'ok'); updateNav(); refreshView(); } catch (e) { toastError(e); }
    };
    const preview = () => {
      const b = lockBackground({ ...cur, url: cur.image ? `/media/${code}/${cur.image}` : null });
      root.querySelector('#bg-preview').innerHTML = `<div class="lock mini ${b.cls}" style="${b.style}"><div class="lock-time"><div class="big">${fmtTime(Date.now())}</div><div class="date">${esc(longDate())}</div></div>
        <div class="mini-tiles"><span></span><span></span><span></span></div></div>`;
      const ex = root.querySelector('#bg-extra');
      if (cur.mode === 'color') {
        ex.innerHTML = `<div class="row">${colors.map((c) => `<button type="button" class="swatch ${cur.color === c ? 'on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
          <input type="color" id="bg-color" value="${cur.color || '#0b1f33'}" style="width:56px;padding:4px"></div>`;
        ex.querySelectorAll('[data-color]').forEach((b) => b.onclick = () => save({ lock_bg: { mode: 'color', color: b.dataset.color } }));
        ex.querySelector('#bg-color').onchange = (e) => save({ lock_bg: { mode: 'color', color: e.target.value } });
      } else if (cur.mode === 'image') {
        ex.innerHTML = `<label class="btn primary">${icon('upload', 18)} ${t('Rasm yuklash')}<input type="file" id="bg-file" accept="image/jpeg,image/png,image/webp" hidden></label>`;
        ex.querySelector('#bg-file').onchange = async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            const r = await POST('/api/assets', { kind: 'bg', data: await imageToDataUrl(f, 1920, 'image/jpeg') });
            await save({ lock_bg: { mode: 'image', image: r.id } });
          } catch (err) { toastError(err); }
        };
      } else if (cur.mode === 'builtin') {
        ex.innerHTML = `<div class="wall-grid">${Array.from({ length: WALLPAPERS }, (_, i) => i + 1).map((n) => `<button type="button" class="wall ${cur.n === n ? 'on' : ''}" data-wall="${n}"
          style="background-image:url('${wallpaperUrl(n, true)}')"></button>`).join('')}</div>`;
        ex.querySelectorAll('[data-wall]').forEach((b) => b.onclick = () => save({ lock_bg: { mode: 'builtin', n: Number(b.dataset.wall) } }));
      } else if (cur.mode === 'auto') {
        ex.innerHTML = `<p class="small muted">${t("Har kuni chiroyli rasmlardan biri o'zi tanlanadi. Internet shart emas.")}</p>`;
      } else ex.innerHTML = '';
    };
    root.querySelectorAll('[data-bgmode]').forEach((b) => b.onclick = () => {
      cur.mode = b.dataset.bgmode;
      root.querySelectorAll('[data-bgmode]').forEach((x) => x.classList.toggle('active', x === b));
      if (cur.mode === 'default' || cur.mode === 'auto') return save({ lock_bg: { mode: cur.mode } });
      if (cur.mode === 'color' && !cur.color) cur.color = '#0b1f33';
      if (cur.mode === 'color') return save({ lock_bg: { mode: 'color', color: cur.color } });
      if (cur.mode === 'image' && cur.image) return save({ lock_bg: { mode: 'image', image: cur.image } });
      if (cur.mode === 'builtin' && cur.n) return save({ lock_bg: { mode: 'builtin', n: cur.n } });
      preview();
    });
    preview();
    root.querySelector('#logo-file').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const r = await POST('/api/assets', { kind: 'logo', data: await imageToDataUrl(f, 800, f.type === 'image/jpeg' ? 'image/jpeg' : 'image/png') });
        await save({ logo: r.id });
      } catch (err) { toastError(err); }
    };
    const del = root.querySelector('#logo-del');
    if (del) del.onclick = () => save({ logo: '' }, t("O'chirildi"));
    root.querySelector('#rlogo-on').onchange = (e) => save({ receipt_logo: e.target.checked });
    root.querySelector('#rlogo-file').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const r = await POST('/api/assets', { kind: 'logo', data: await imageToDataUrl(f, 600, 'image/png') });
        await save({ receipt_logo_id: r.id, receipt_logo: true });
      } catch (err) { toastError(err); }
    };
    const rdel = root.querySelector('#rlogo-del');
    if (rdel) rdel.onclick = () => save({ receipt_logo_id: '' }, t("O'chirildi"));
  },

  tab_qr({ qr }) {
    const s = App.settings;
    const orders = moduleOn('qrorder');
    return `<div class="card"><p style="margin-top:0">${icon('info', 16)} ${t("Har bir xona uchun alohida QR kod. Mijoz telefon kamerasi bilan skanerlaydi — menyu rasmlar bilan ochiladi, ilova yoki login kerak emas.")}
        ${orders ? t("Mijoz buyurtma yuborsa, xona ofitsanti va kassirga xabar keladi; ular tasdiqlagandan keyingina chek ochiladi.") : ''}</p>
      ${orders ? `<form id="qr-form"><div class="form-grid">
          <label class="check" style="align-self:end"><input type="checkbox" name="qr_order" ${s.qr_order === '1' ? 'checked' : ''}> ${t("Mijozlar QR orqali buyurtma bersin, ofitsantni chaqirsin")}</label>
          <label class="field">${t('Buyurtma qabul qilish vaqti: dan')}<input type="time" name="qr_from" value="${esc(s.qr_from || '')}"></label>
          <label class="field">${t('gacha (ikkalasi bo\'sh = doim)')}<input type="time" name="qr_to" value="${esc(s.qr_to || '')}"></label></div>
          <button class="btn primary" style="margin-top:12px">${icon('check', 18)} ${t('Saqlash')}</button></form>`
        : `<div class="notice">${icon('lock', 18)} ${t("Hozir QR kod faqat menyuni ko'rsatadi. Mijoz QR orqali buyurtma berishi, ofitsantni chaqirishi — Biznes va Pro tariflarida.")}</div>`}</div>
    <div class="page-head" style="margin-top:18px"><h2 style="margin:0">${t('QR kodlar')}</h2>
      <button class="btn primary" id="qr-print-all" ${qr.length ? '' : 'disabled'}>${icon('printer', 18)} ${t('Hammasini chop etish')}</button></div>
    ${qr.length ? `<div class="qr-grid">${qr.map((r) => `<div class="card qr-card">
        <div class="qr-img">${qrSvg(guestUrl(r.qr_token))}</div>
        <b>${esc(r.name)}</b>${r.section ? `<span class="small muted">${esc(r.section)}</span>` : ''}
        <div class="row" style="gap:6px;justify-content:center;flex-wrap:wrap">
          <button class="btn sm" data-qr-print="${r.id}">${icon('printer', 16)} ${t('Chop etish')}</button>
          <a class="btn sm" href="${esc(guestUrl(r.qr_token))}" target="_blank" rel="noopener">${icon('external-link', 16)} ${t('Ochish')}</a>
          <button class="icon-btn" data-qr-renew="${r.id}" title="${esc(t('Yangi QR kod (eskisi ishlamay qoladi)'))}">${icon('refresh-cw', 18)}</button></div></div>`).join('')}</div>`
      : `<div class="card">${emptyState('qr-code', t("Avval Xonalar bo'limida xona qo'shing"))}</div>`}
    <p class="small muted">${icon('shield-check', 14)} ${t("QR kod ichida maxfiy kalit bor — xona raqamini taxmin qilib boshqa xonaga buyurtma berib bo'lmaydi. Kod tarqalib ketsa, ⟳ tugmasi bilan yangilang: eskisi darhol ishlamay qoladi.")}</p>`;
  },
  bind_qr(root, { qr }) {
    const f = root.querySelector('#qr-form');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(f);
      try { App.settings = await PUT('/api/settings', d); toast(t('Saqlandi'), 'ok'); } catch (err) { toastError(err); }
    };
    const byId = (id) => qr.find((r) => r.id === Number(id));
    const all = root.querySelector('#qr-print-all');
    if (all) all.onclick = () => printQr(qr);
    root.querySelectorAll('[data-qr-print]').forEach((b) => b.onclick = () => printQr([byId(b.dataset.qrPrint)]));
    root.querySelectorAll('[data-qr-renew]').forEach((b) => b.onclick = async () => {
      const r = byId(b.dataset.qrRenew);
      if (!(await confirmModal(t('Yangi QR kod'), t('"{0}" uchun yangi QR kod yaratilsinmi? Eski (chop etilgan) kod ishlamay qoladi — yangisini chop etib qo\'yasiz.', esc(r.name)), t('Yangilash')))) return;
      try { await POST(`/api/rooms/${r.id}/qr`); toast(t('Yangilandi — endi chop eting'), 'ok'); refreshView(); } catch (e) { toastError(e); }
    });
  },

  tab_rooms({ rooms }) {
    const sections = roomSections(rooms);
    const groups = [...sections.map((x) => [x, rooms.filter((r) => r.section === x)]), ['', rooms.filter((r) => !r.section)]].filter(([, rs]) => rs.length);
    return `<div class="card"><div class="card-head"><h2>${t('Xonalar va stollar')}</h2><button class="btn primary" id="add-room">${icon('plus', 18)} ${t('Xona')}</button></div>
      <p class="small muted">${icon('layers', 14)} ${t("Xonalarni bo'limlarga ajrating (masalan: 1-qavat, 2-qavat, Hovli). Xonani ochib \"Bo'lim\" maydoniga nom yozing.")}</p>
      ${groups.map(([sec, rs]) => `${sections.length ? `<h3 class="group-title">${icon('layers', 16)} ${sec ? esc(sec) : t("Bo'limsiz")}</h3>` : ''}
      <div class="table-wrap"><table>${rs.map((r) => `<tr class="clickable" data-room="${r.id}" style="${r.active ? '' : 'opacity:.5'}">
        <td style="width:60px"><b style="font-size:22px">${esc(r.number)}</b></td><td><b>${esc(r.name)}</b><br><span class="small muted">${icon(ROOM_TYPE_ICONS[r.type] || 'door-open', 13)} ${roomTypeName(r.type)} · ${icon('users', 13)} ${r.capacity}</span></td>
        <td>${r.waiters.map((w) => `<span class="chip">${icon('user-round', 13)} ${esc(w.name)}</span>`).join(' ') || `<span class="chip red">${t('Ofitsant yo\'q')}</span>`}</td>
        <td class="actions">${icon('chevron-right', 18)}</td></tr>`).join('')}</table></div>`).join('')}</div>
      <form class="card" id="types-form"><div class="card-head"><h2>${icon('list')} ${t('Xona turlari')}</h2>
        <button type="button" class="btn" id="add-type">${icon('plus', 18)} ${t('Tur')}</button></div>
        <p class="small muted">${t("Nomini o'zgartiring yoki yangi tur qo'shing (masalan: Tapchan, Kabina, Terassa).")}</p>
        <div class="types-list">${roomTypes().map((x) => `<div class="row type-row" data-key="${esc(x.key)}">
          <input name="tname" value="${esc(roomTypeName(x.key))}" maxlength="30" style="max-width:260px">
          <span class="small muted">${rooms.filter((r) => r.type === x.key).length} ${t('xona')}</span>
          ${rooms.some((r) => r.type === x.key) ? '' : `<button type="button" class="icon-btn ghost danger" data-del-type>${icon('trash-2', 18)}</button>`}</div>`).join('')}</div>
        <button class="btn primary" style="margin-top:12px">${icon('check', 18)} ${t('Saqlash')}</button></form>`;
  },
  bind_rooms(root, { rooms, users }) {
    const tf = root.querySelector('#types-form');
    const list = tf.querySelector('.types-list');
    tf.querySelector('#add-type').onclick = () => {
      list.insertAdjacentHTML('beforeend', `<div class="row type-row" data-key=""><input name="tname" placeholder="${esc(t('Yangi tur nomi'))}" maxlength="30" style="max-width:260px">
        <button type="button" class="icon-btn ghost danger" data-del-type>${icon('trash-2', 18)}</button></div>`);
      list.lastElementChild.querySelector('input').focus();
    };
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-del-type]'); if (b) b.closest('.type-row').remove(); });
    tf.onsubmit = async (e) => {
      e.preventDefault();
      const room_types = [...list.querySelectorAll('.type-row')].map((r) => ({ key: r.dataset.key, name: r.querySelector('input').value.trim() })).filter((x) => x.name);
      try { App.settings = await PUT('/api/settings', { room_types }); toast(t('Saqlandi'), 'ok'); refreshView(); } catch (err) { toastError(err); }
    };
    const waiters = users.filter((u) => u.role === 'waiter' && u.active);
    const edit = (r = {}) => openModal({
      title: `${icon('door-open')} ${r.id ? esc(r.name) : t('Yangi xona')}`,
      body: `<div class="form-grid">
        <label class="field">${t('Raqami')}<input name="number" value="${esc(r.number || String(rooms.length + 1))}" required></label>
        <label class="field">${t('Nomi')}<input name="name" value="${esc(r.name || '')}" placeholder="Banket 1" required></label>
        <label class="field">${t('Turi')}<select name="type">${roomTypes().map((x) => `<option value="${esc(x.key)}" ${r.type === x.key ? 'selected' : ''}>${esc(roomTypeName(x.key))}</option>`).join('')}</select></label>
        <label class="field">${t("Sig'imi (kishi)")}<input type="number" name="capacity" min="1" value="${r.capacity || 10}"></label>
        <label class="field">${t("Bo'lim (qavat)")}<input name="section" list="sections-list" value="${esc(r.section || '')}" placeholder="${esc(t('Masalan: 1-qavat'))}">
          <datalist id="sections-list">${roomSections(rooms).map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label></div>
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
      <div class="switch-row"><span>${icon('key-round', 24)}</span><div class="grow"><b>${t("PIN xato kiritilsa bloklash")}</b>
        <span class="small muted">${t("Xodim PIN kodni necha marta xato tersa, necha daqiqaga bloklanadi. 0 — hech qachon bloklanmaydi.")}</span></div>
        <input type="number" name="pin_lock_attempts" min="0" max="50" value="${s.pin_lock_attempts}" style="max-width:90px" title="${esc(t('Urinishlar'))}">
        <span class="small muted">${t('marta')} →</span>
        <input type="number" name="pin_lock_minutes" min="1" max="1440" value="${s.pin_lock_minutes}" style="max-width:90px" title="${esc(t('Daqiqa'))}">
        <span class="small muted">${t('daq')}</span></div>
      <div class="switch-row"><span>${icon('lock', 24)}</span><div class="grow"><b>${t('Avtomatik qulf')}</b>
        <span class="small muted">${t("Umumiy qurilmada shuncha daqiqa hech narsa bosilmasa, xodimlar ro'yxatiga qaytadi. 0 — o'chiq.")}</span></div>
        <input type="number" name="auto_lock_minutes" min="0" max="240" value="${s.auto_lock_minutes}" style="max-width:110px"></div>
      <p class="small muted" style="margin-top:10px">${icon('info', 14)} ${t("Har bir xodimning chek chiqarish va chek yopish huquqi: Xodimlar bo'limida.")}</p>
      ${can('owner') ? `<h3 style="margin:22px 0 4px">${icon('eye-off', 18)} ${t("Moliya bo'limlari")}</h3>
      <p class="small muted">${t("Hisobot, kirim-chiqim va ish haqini kim ko'rishini siz belgilaysiz. Ish haqini faqat boshliq ko'radi.")}</p>
      ${[['perm_admin_reports', 'shield-check', t('Admin hisobotni ko\'ra oladi')], ['perm_admin_finance', 'shield-check', t('Admin kirim-chiqimni ko\'ra oladi')],
        ['perm_cashier_reports', 'wallet', t('Kassir hisobotni ko\'ra oladi')], ['perm_cashier_finance', 'wallet', t('Kassir kirim-chiqimni ko\'ra oladi')]]
        .map(([k, ic, n]) => `<div class="switch-row"><span>${icon(ic, 22)}</span><div class="grow"><b>${n}</b></div><input type="checkbox" name="${k}" ${s[k] ? 'checked' : ''}></div>`).join('')}
      <div class="switch-row"><span>${icon('lock', 22)}</span><div class="grow"><b>${t("Moliya bo'limiga kirishda parol so'ralsin")}</b>
        <span class="small muted">${t("Yoqilsa, boshliq ham, admin va kassir ham parolni kiritib ochadi. 15 daqiqa ishlatilmasa yana yopiladi.")}</span></div>
        <input type="checkbox" name="finance_lock" ${s.finance_lock ? 'checked' : ''}></div>
      <div class="switch-row"><span>${icon('key-round', 22)}</span><div class="grow"><b>${t('Moliya paroli')}</b>
        <span class="small muted">${s.has_finance_code ? t("Parol o'rnatilgan. Yangisini yozsangiz almashadi.") : t("Parol hali o'rnatilmagan.")}</span></div>
        <input name="finance_code" type="password" placeholder="4–32 ${esc(t('belgi'))}" style="max-width:180px" autocomplete="new-password"></div>` : ''}
      <button class="btn primary" style="margin-top:12px">${icon('check', 18)} ${t('Saqlash')}</button></form>`;
  },
  bind_rights(root) {
    const f = root.querySelector('#rights-form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(f);
      if (!d.cancel_code) delete d.cancel_code;
      if (!d.finance_code) delete d.finance_code;
      if (d.waiter_cancel && !App.settings.has_cancel_code && !d.cancel_code) return toast(t('Bekor qilish kodini kiriting'), 'warn');
      if (d.finance_lock && !App.settings.has_finance_code && !d.finance_code) return toast(t('Moliya parolini kiriting'), 'warn');
      try {
        App.settings = await PUT('/api/settings', d);
        const me = await GET('/api/me');
        App.money = me.money;
        toast(t('Saqlandi'), 'ok'); updateNav(); refreshView();
      } catch (err) { toastError(err); }
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

  tab_backup({ local, folder }) {
    const owner = can('owner');
    const folderCard = !owner ? '' : `<div class="card"><div class="card-head"><h2>${icon('folder-open')} ${t('Kompyuterdagi zaxira papka')}</h2></div>
      <p>${t("Barcha ma'lumotlar (cheklar, menyu, xodimlar, kirim-chiqim) har 3 soatda shu kompyuterdagi \"FLOWI zaxira\" papkasiga o'zi saqlanadi. Saytda ma'lumot yo'qolsa, shu fayldan to'liq tiklanadi.")}</p>
      ${!App.device ? `<div class="notice">${icon('info', 18)} ${t("Avtomatik zaxira faqat ulangan qurilmada ishlaydi (kassa kompyuteri).")}</div>`
        : !FolderBackup.supported() ? `<div class="notice">${icon('info', 18)} ${t("Bu brauzer papkaga yozolmaydi. Kompyuterda Chrome yoki Edge'dan foydalaning yoki pastdagi tugma bilan yuklab oling.")}</div>`
        : folder.state === 'granted' ? `<div class="notice blue">${icon('circle-check', 18)} ${t('Papka ulangan: {0}', esc(folder.dir.name))}${folder.last ? ` · ${t('oxirgi nusxa')}: ${fmtDateTime(folder.last)}` : ''}</div>`
        : folder.state === 'prompt' ? `<div class="notice">${icon('triangle-alert', 18)} ${t('Brauzer papkaga yozish uchun ruxsat so\'rayapti')}</div>` : ''}
      <div class="row">
        ${App.device && FolderBackup.supported() ? (folder.state === 'none' ? `<button class="btn primary" id="fb-pick">${icon('folder-open', 18)} ${t('Papkani tanlash')}</button>`
          : `${folder.state === 'prompt' ? `<button class="btn primary" id="fb-allow">${icon('lock-open', 18)} ${t('Ruxsat berish')}</button>` : `<button class="btn primary" id="fb-now">${icon('save', 18)} ${t('Hozir saqlash')}</button>`}
            <button class="btn" id="fb-pick">${icon('folder-open', 18)} ${t('Boshqa papka')}</button><button class="btn red-text" id="fb-off">${icon('x', 18)} ${t("O'chirish")}</button>`) : ''}
        <button class="btn" id="fb-download">${icon('hard-drive-download', 18)} ${t('Zaxirani yuklab olish')}</button></div></div>
      <div class="card"><div class="card-head"><h2>${icon('rotate-ccw')} ${t('Zaxiradan tiklash')}</h2></div>
        <p>${t("Zaxira faylini (.db) tanlang — sayt shu fayldagi holatga to'liq qaytadi. Hozirgi ma'lumotlar oldin serverda alohida saqlab qo'yiladi, shuning uchun hech narsa yo'qolmaydi.")}</p>
        <div class="row"><label class="btn danger">${icon('upload', 18)} ${t('Faylni tanlash')}<input type="file" id="fb-restore" accept=".db,application/octet-stream" hidden></label>
          ${folder && folder.state === 'granted' ? `<button class="btn" id="fb-from-folder">${icon('folder-open', 18)} ${t('Papkadagi nusxalar')}</button>` : ''}</div></div>`;
    return `${folderCard}<div class="card"><div class="card-head"><h2>${icon('database')} ${t('Shu kompyuterdagi nusxa')}</h2></div>
      <p>${t("Yopilgan har bir chek shu kompyuter xotirasiga ham avtomatik saqlanadi. Internet yoki server ishlamay qolsa ham ularni ko'rish va yuklab olish mumkin.")}</p>
      <div class="kpis" style="margin:12px 0">${kpi(t('Saqlangan cheklar'), local.length, local.length ? `${fmtDate(local[local.length - 1].closed_at)} — ${fmtDate(local[0].closed_at)}` : '', '', 'database')}</div>
      <div class="row"><button class="btn primary" id="bk-export" ${local.length ? '' : 'disabled'}>${icon('file-spreadsheet', 18)} ${t("Excel'ga yuklash")}</button>
        <button class="btn" id="bk-sync">${icon('refresh-cw', 18)} ${t('Bugungi cheklarni serverdan olish')}</button></div>
      <p class="small muted" style="margin-top:12px">${icon('info', 14)} ${t("Kassa smenasi yopilganda kunlik cheklar Excel fayl bo'lib yuklab olinadi.")}</p></div>`;
  },
  bind_backup(root, { local }) {
    const on = (id, fn) => { const b = root.querySelector(id); if (b) b.onclick = fn; };
    const guard = (fn) => async () => { try { await fn(); } catch (e) { if (e.name !== 'AbortError') toastError(e); } };
    on('#fb-pick', guard(async () => { await FolderBackup.pick(); toast(t('Zaxira saqlandi'), 'ok'); refreshView(); }));
    on('#fb-allow', guard(async () => { if (await FolderBackup.allow()) toast(t('Zaxira saqlandi'), 'ok'); refreshView(); }));
    on('#fb-now', guard(async () => { const n = await FolderBackup.run(true); toast(t('Saqlandi: {0}', n), 'ok'); refreshView(); }));
    on('#fb-off', guard(async () => { await FolderBackup.forget(); refreshView(); }));
    on('#fb-download', guard(async () => {
      const res = await fetch('/api/backup/download', { headers: { Authorization: `Bearer ${App.token}` } });
      if (!res.ok) throw new Error(tServer((await res.json()).error));
      const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || 'flowi.db';
      downloadBlob(name, await res.blob());
    }));
    const restore = async (file) => {
      const ok = await confirmModal(t('Zaxiradan tiklash'), t("\"{0}\" faylidagi holat tiklansinmi? Hozirgi ma'lumotlar serverda alohida saqlanadi.", esc(file.name)), t('Tiklash'));
      if (!ok) return;
      try {
        await restoreBackup(file);
        toast(t("Ma'lumotlar tiklandi"), 'ok', 8000);
        setTimeout(() => location.reload(), 1200);
      } catch (e) { toastError(e); }
    };
    const rf = root.querySelector('#fb-restore');
    if (rf) rf.onchange = () => { if (rf.files[0]) restore(rf.files[0]); };
    on('#fb-from-folder', guard(async () => {
      const files = await FolderBackup.files();
      const form = openModal({ title: `${icon('folder-open')} ${t('Papkadagi nusxalar')}`,
        body: files.length ? `<div class="stack">${files.slice(0, 30).map((f, i) => `<button type="button" class="btn block" data-f="${i}" style="justify-content:flex-start">${icon('database', 18)} ${esc(f.name)}</button>`).join('')}</div>` : `<p class="muted">${t("Nusxa yo'q")}</p>`,
        actions: [{ label: t('Yopish') }] });
      form.querySelectorAll('[data-f]').forEach((b) => b.onclick = async () => { closeModal(); restore(await files[b.dataset.f].handle.getFile()); });
    }));
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

  // The boss sees the plan, the term and how much of the plan is used; closed parts lead to the support contact.
  tab_plan() {
    const p = App.plan;
    const left = p.paid_until ? Math.floor((p.paid_until - Date.now()) / (24 * 60 * MIN)) : null;
    const mods = Object.entries(App.modulesAll || {});
    return `<div class="card plan-card">
        <div class="row" style="gap:12px;align-items:center"><span class="plan-badge plan-${esc(p.key)}">${icon('star', 26)}</span>
          <div class="grow"><div class="muted small">${t('Tarif')}</div><h2 style="margin:0">${esc(p.name)}${p.is_branch ? ` <span class="chip">${t('Filial')}</span>` : ''}</h2></div>
          <div class="right"><div class="muted small">${t('Oylik narx')}</div><b style="font-size:20px">${money(p.fee)}</b></div></div>
        <div class="kpis" style="margin-top:16px">
          <div class="kpi"><div class="kpi-ic">${icon('calendar', 22)}</div><div><div class="label">${t("To'langan muddat")}</div>
            <div class="value">${p.paid_until ? fmtDate(p.paid_until) : '—'}</div>
            ${left !== null ? `<div class="sub ${left < 0 ? 'red' : left <= 5 ? 'warn' : ''}">${left < 0 ? t("{0} kun o'tdi", -left) : t('{0} kun qoldi', left)}</div>` : ''}</div></div>
          <div class="kpi"><div class="kpi-ic">${icon('users', 22)}</div><div><div class="label">${t('Xodimlar')}</div>
            <div class="value">${p.staff_used}${p.max_staff > 0 ? ` / ${p.max_staff}` : ''}</div><div class="sub">${p.max_staff > 0 ? t('tarif limiti') : t('cheksiz')}</div></div></div>
          ${p.devices_per_staff > 0 ? `<div class="kpi"><div class="kpi-ic">${icon('smartphone', 22)}</div><div><div class="label">${t('Bir ofitsant')}</div>
            <div class="value">${t('{0} ta qurilmada', p.devices_per_staff)}</div><div class="sub">${t('bir vaqtda; boshqa qurilmadan kirsa, avvalgisi chiqadi')}</div></div></div>` : ''}
        </div>
        ${p.read_only ? `<div class="notice red" style="margin-top:14px">${icon('lock', 18)} ${t("Obuna muddati tugagan — faqat ko'rish rejimi. Barcha ma'lumotlar saqlanib turibdi. Yangi buyurtma yozish uchun to'lovni yangilang.")}</div>` : ''}
        <h3 style="margin:18px 0 10px">${icon('layers', 18)} ${t("Tarifdagi bo'limlar")}</h3>
        <div class="plan-mods">${mods.map(([k, n]) => {
          const on = p.modules.includes(k);
          return `<${on ? 'div' : 'button type="button"'} class="plan-mod ${on ? 'on' : 'off'}" ${on ? '' : `data-upgrade="${esc(t(n))}"`}>${icon(on ? 'circle-check' : 'lock', 18)} ${esc(t(n))}</${on ? 'div' : 'button'}>`;
        }).join('')}</div>
        <p class="small muted" style="margin-top:14px">${icon('info', 14)} ${t("Sotuv, buyurtmalar, oshxona, kassa, menyu va xodimlar barcha tariflarda bor. Tarifni o'zgartirish yoki to'lov uchun:")}</p>
        ${supportHtml()}
      </div>`;
  },
  bind_plan(root) {
    root.querySelectorAll('[data-upgrade]').forEach((b) => b.onclick = () => upgradeDialog(b.dataset.upgrade));
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
          <button class="btn" id="full">${icon('maximize', 18)} ${t("To'liq ekran")}</button>
          ${keyboardSelect()}</div></div>
      ${App.device ? `<div class="card"><div class="card-head"><h2>${icon('printer')} ${t('Buyurtma printeri')}</h2></div>
        <label class="check"><input type="checkbox" id="order-print" ${OrderPrinter.on() ? 'checked' : ''}> ${t('Shu qurilmadan har bir yangi buyurtmani chop etish')}</label>
        <p class="small muted" style="margin-top:8px">${t("Ofitsant yoki kassir yozgan har bir buyurtma (taomlar, soni, izoh) shu kompyuterga ulangan printerdan chiqadi. Xodimlar ro'yxati ochiq turganda ham ishlaydi.")}</p>
        <div class="notice blue" style="margin:10px 0 8px">${icon('info', 18)} <span>${t("Chek chiqqanda chop etish oynasi ochilmasligi uchun FLOWI'ni maxsus yorliq orqali oching: yuklab oling, ish stoliga qo'ying va shu bilan ishga tushiring. Chek darhol asosiy printerdan chiqadi.")}</span></div>
        <button class="btn primary" id="kiosk-bat">${icon('download', 18)} ${t('Kassa yorlig\'ini yuklab olish (Windows)')}</button></div>` : ''}
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
    root.querySelector('#kb-mode').onchange = (e) => { Keyboard.setMode(e.target.value); toast(t('Saqlandi'), 'ok'); };
    const kb = root.querySelector('#kiosk-bat');
    if (kb) kb.onclick = downloadKioskLauncher;
    const op = root.querySelector('#order-print');
    if (op) op.onchange = () => { OrderPrinter.set(op.checked); toast(op.checked ? t('Yangi buyurtmalar shu qurilmada avtomatik chop etiladi') : t("Avtomatik chop etish o'chirildi"), 'ok'); };
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
      try {
        await PUT('/api/me/pin', formData(pf)); pf.reset(); toast(t('Saqlandi'), 'ok');
        if (!App.user.has_pin) { App.user.has_pin = true; document.getElementById('app').innerHTML = ''; render(); }
      } catch (err) { toastError(err); }
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
