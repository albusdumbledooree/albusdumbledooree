'use strict';
/* Management screens: dashboard, reports, finance, reservations, staff, rooms, menu, settings, audit. */

// ---------- Period picker ----------
function periodRange(preset, custom = {}) {
  const today = dayStart();
  const day = 24 * 60 * MIN;
  switch (preset) {
    case 'yesterday': return { from: today.getTime() - day, to: today.getTime() };
    case 'week': {
      const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      return { from: monday.getTime(), to: today.getTime() + day };
    }
    case 'last7': return { from: today.getTime() - 6 * day, to: today.getTime() + day };
    case 'month': return { from: new Date(today.getFullYear(), today.getMonth(), 1).getTime(), to: today.getTime() + day };
    case 'prevmonth': return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime(), to: new Date(today.getFullYear(), today.getMonth(), 1).getTime() };
    case 'custom': {
      const f = custom.from ? new Date(custom.from + 'T00:00') : today;
      const t = custom.to ? new Date(custom.to + 'T00:00') : today;
      return { from: f.getTime(), to: t.getTime() + day };
    }
    default: return { from: today.getTime(), to: today.getTime() + day };
  }
}
const PERIODS = [['today', 'Bugun'], ['yesterday', 'Kecha'], ['week', 'Shu hafta'], ['last7', 'Oxirgi 7 kun'], ['month', 'Shu oy'], ['prevmonth', "O'tgan oy"], ['custom', 'Tanlash']];
UI.period = store('cp_period') || { preset: 'today', from: '', to: '' };

function periodPicker() {
  const p = UI.period;
  const iso = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const r = periodRange(p.preset, p);
  return `<div class="row" style="margin-bottom:14px"><div class="tabs">${PERIODS.map(([k, n]) => `<button class="tab ${p.preset === k ? 'active' : ''}" data-period="${k}">${n}</button>`).join('')}</div>
    ${p.preset === 'custom' ? `<input type="date" id="p-from" value="${p.from || iso(r.from)}" style="width:auto"> — <input type="date" id="p-to" value="${p.to || iso(r.to - 1)}" style="width:auto">` : ''}
    <span class="muted small">${fmtDate(r.from)} — ${fmtDate(r.to - 1)}</span></div>`;
}
function bindPeriod(root) {
  root.querySelectorAll('[data-period]').forEach((b) => b.onclick = () => { UI.period = { ...UI.period, preset: b.dataset.period }; store('cp_period', UI.period); refreshView(); });
  const f = root.querySelector('#p-from'); const t = root.querySelector('#p-to');
  if (f) f.onchange = t.onchange = () => { UI.period = { preset: 'custom', from: f.value, to: t.value }; store('cp_period', UI.period); refreshView(); };
}

// ---------- Charts ----------
function barChart(series) {
  if (!series.length) return '';
  const W = 760; const H = 240; const L = 56; const B = 26; const T = 10;
  const max = Math.max(1, ...series.map((s) => Math.max(s.income, s.expense)));
  const bw = (W - L - 10) / series.length;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const short = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${L}" x2="${W - 6}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="var(--border)"/><text x="${L - 6}" y="${y(max * f) + 4}" text-anchor="end">${short(Math.round(max * f))}</text>`).join('');
  const step = Math.ceil(series.length / 16);
  const bars = series.map((s, i) => {
    const x = L + i * bw;
    const w = Math.max(2, bw / 2 - 2);
    const label = s.key.length > 5 ? s.key.slice(8) + '.' + s.key.slice(5, 7) : s.key;
    return `<rect class="bar-in" x="${x + 2}" y="${y(s.income)}" width="${w}" height="${H - B - y(s.income)}" rx="2"><title>${s.key}: kirim ${s.income.toLocaleString('ru-RU')}</title></rect>
      <rect class="bar-out" x="${x + 2 + w}" y="${y(s.expense)}" width="${w}" height="${H - B - y(s.expense)}" rx="2"><title>${s.key}: chiqim ${s.expense.toLocaleString('ru-RU')}</title></rect>
      ${i % step === 0 ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${label}</text>` : ''}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${bars}</svg>
    <div class="legend" style="margin:6px 0 0"><span><i style="background:var(--primary)"></i>Kirim</span><span><i style="background:var(--danger)"></i>Chiqim</span></div>`;
}
function hbars(rows, { red = false, fmt = money } = {}) {
  if (!rows.length) return `<p class="muted">Ma'lumot yo'q</p>`;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => `<div class="hbar"><span>${esc(r.label)}</span><span class="track"><span class="fill ${red ? 'red' : ''}" style="width:${(r.value / max) * 100}%;display:block"></span></span><span class="num">${fmt(r.value)}</span></div>`).join('');
}
function kpi(label, value, sub = '', cls = '') {
  return `<div class="kpi ${cls}"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}

// ---------- Dashboard ----------
Views.dashboard = {
  title: 'Boshqaruv paneli', icon: '📊', roles: ['owner', 'admin', 'cashier'], nav: true, refreshOn: ['rooms', 'finance', 'kitchen', 'menu'],
  async load() { return GET('/api/dashboard'); },
  render({ today: r, live }) {
    return `<div class="page-head"><h1>Bugun · ${fmtDate(Date.now())}</h1><span class="spacer"></span><a class="btn" href="#/reports">📈 Batafsil hisobot</a></div>
      <div class="kpis">
        ${kpi('Savdo', money(r.sales.total), `${r.sales.orders} chek · o'rtacha ${money(r.sales.avg_check)}`, 'prime')}
        ${kpi('Xarajat', money(r.expense), '', 'bad')}
        ${kpi('Sof foyda', money(r.net_profit), 'savdo + kirim − xarajat', r.net_profit >= 0 ? 'good' : 'bad')}
        ${kpi('Mehmonlar', r.sales.guests, `Xizmat haqi: ${money(r.sales.service)}`)}
      </div>
      <div class="kpis">
        ${kpi('Band xonalar', `${live.open_orders} / ${live.rooms}`, `<a href="#/rooms">Xonalarni ko'rish →</a>`)}
        ${kpi('Oshxona navbati', live.pending + live.cooking, `${live.pending} yangi · ${live.cooking} tayyorlanmoqda`)}
        ${kpi('Olib ketilmagan', live.ready_waiting, 'tayyor taom ofitsantni kutmoqda', live.ready_waiting ? 'bad' : '')}
        ${kpi('Bugungi bronlar', live.reservations_today, `<a href="#/reservations">Bronlar →</a>`)}
      </div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h2>Soatlar bo'yicha</h2></div>${barChart(r.series)}</div>
        <div class="card"><div class="card-head"><h2>To'lov turlari</h2></div>
          ${hbars([{ label: '💵 Naqd', value: r.sales.cash }, { label: '💳 Karta', value: r.sales.card }, { label: "📱 O'tkazma", value: r.sales.transfer }])}
          <div class="card-head" style="margin-top:16px"><h2>⛔ Stop-list</h2></div>
          ${live.stopped.length ? live.stopped.map((n) => `<span class="chip cancelled" style="text-decoration:none;margin:2px">${esc(n)}</span>`).join('') : '<p class="muted">Hamma taomlar bor ✅</p>'}</div>
        <div class="card"><div class="card-head"><h2>Top taomlar</h2></div>${hbars(r.dishes.slice(0, 8).map((d) => ({ label: `${d.name} (${d.qty})`, value: d.revenue })))}</div>
        <div class="card"><div class="card-head"><h2>Ofitsantlar</h2></div>${hbars(r.waiters.map((w) => ({ label: `${w.name} (${w.orders})`, value: w.total })))}</div>
      </div>`;
  },
};

// ---------- Reports ----------
Views.reports = {
  title: 'Hisobotlar', icon: '📈', roles: ['owner', 'admin', 'cashier'], nav: true, refreshOn: ['finance'],
  async load() {
    const r = periodRange(UI.period.preset, UI.period);
    const [rep, rooms] = await Promise.all([GET(`/api/reports?from=${r.from}&to=${r.to}`), GET('/api/rooms?all=1')]);
    return { rep, rooms };
  },
  render({ rep: r }) {
    const s = r.sales;
    const margin = s.subtotal ? Math.round(((s.subtotal - s.food_cost) / s.subtotal) * 100) : 0;
    return `<div class="page-head"><h1>Hisobot</h1><span class="spacer"></span>
      <button class="btn" id="csv">⬇ Excel (CSV)</button><button class="btn" onclick="window.print()">🖨 Chop etish</button></div>
      ${periodPicker()}
      <div class="kpis">
        ${kpi('Umumiy savdo', money(s.total), `${s.orders} chek`, 'prime')}
        ${kpi("O'rtacha chek", money(s.avg_check), `${s.guests} mehmon`)}
        ${kpi('Boshqa kirim', money(r.other_income), 'avans va boshqalar')}
        ${kpi('Jami kirim', money(r.gross_income), '', 'good')}
        ${kpi('Jami xarajat', money(r.expense), '', 'bad')}
        ${kpi('Sof foyda', money(r.net_profit), '', r.net_profit >= 0 ? 'good' : 'bad')}
      </div>
      <div class="kpis">
        ${kpi('Taomlar summasi', money(s.subtotal))}
        ${kpi('Xizmat haqi', money(s.service))}
        ${kpi('Chegirmalar', money(s.discount))}
        ${kpi('Taomlar tannarxi', money(s.food_cost), `Marja: ${margin}%`)}
        ${kpi('Oshxona tezligi', `${r.kitchen.avg_minutes} daq`, `${r.kitchen.cooked} taom · ${r.kitchen.late} ta kechikkan`)}
        ${kpi('Bekor qilingan', r.cancelled.count, money(r.cancelled.amount), r.cancelled.count ? 'bad' : '')}
      </div>
      <div class="card"><div class="card-head"><h2>${r.hourly ? 'Soatlar' : 'Kunlar'} bo'yicha kirim / chiqim</h2></div>${barChart(r.series)}</div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>To'lov turlari</h2></div>
          ${hbars([{ label: '💵 Naqd', value: s.cash }, { label: '💳 Karta', value: s.card }, { label: "📱 O'tkazma", value: s.transfer }])}
          <p class="small muted">Kassaga naqd kirim: ${money(r.cash_flow.cash_in)} · naqd chiqim: ${money(r.cash_flow.cash_out)} · <b>qoldiq ${money(r.cash_flow.cash_in - r.cash_flow.cash_out)}</b></p></div>
        <div class="card"><div class="card-head"><h2>Xarajatlar</h2></div>${hbars(r.expense_by_category.map((x) => ({ label: x.key, value: x.value })), { red: true })}</div>
      </div>
      <div class="card"><div class="card-head"><h2>Taomlar bo'yicha</h2></div>
        ${r.dishes.length ? `<div class="table-wrap"><table><tr><th>Taom</th><th class="right">Soni</th><th class="right">Savdo</th><th class="right">Tannarx</th><th class="right">Foyda</th></tr>
        ${r.dishes.map((d) => `<tr><td>${esc(d.name)}</td><td class="right num">${d.qty}</td><td class="right num">${money(d.revenue)}</td><td class="right num">${money(d.cost)}</td><td class="right num"><b>${money(d.revenue - d.cost)}</b></td></tr>`).join('')}
        </table></div>` : `<p class="muted">Ma'lumot yo'q</p>`}</div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>Ofitsantlar</h2></div>
          ${r.waiters.length ? `<div class="table-wrap"><table><tr><th>Ofitsant</th><th class="right">Cheklar</th><th class="right">Mehmon</th><th class="right">Savdo</th><th class="right">Xizmat haqi</th></tr>
          ${r.waiters.map((w) => `<tr><td>${esc(w.name)}</td><td class="right">${w.orders}</td><td class="right">${w.guests}</td><td class="right num">${money(w.total)}</td><td class="right num">${money(w.service)}</td></tr>`).join('')}</table></div>` : `<p class="muted">Ma'lumot yo'q</p>`}</div>
        <div class="card"><div class="card-head"><h2>Xonalar</h2></div>${hbars(r.rooms.map((x) => ({ label: x.name || `#${x.key}`, value: x.value })))}</div>
      </div>
      ${r.cancelled.count ? `<div class="card"><div class="card-head"><h2>Bekor qilingan taomlar</h2></div><div class="table-wrap"><table>
        <tr><th>Vaqt</th><th>Taom</th><th class="right">Summa</th><th>Sabab</th></tr>
        ${r.cancelled.items.map((c) => `<tr><td>${fmtDateTime(c.created_at)}</td><td>${esc(c.name)} × ${c.qty}</td><td class="right num">${money(c.qty * c.price)}</td><td>${esc(c.cancel_reason || '—')}</td></tr>`).join('')}
      </table></div></div>` : ''}
      <div class="card"><div class="card-head"><h2>Cheklar (${r.orders.length})</h2></div>
        ${r.orders.length ? `<div class="table-wrap"><table><tr><th>#</th><th>Vaqt</th><th>Ofitsant</th><th class="right">Mehmon</th><th class="right">Chegirma</th><th class="right">Jami</th><th></th></tr>
        ${r.orders.slice().reverse().slice(0, 300).map((o) => `<tr><td>${o.id}</td><td>${fmtDateTime(o.closed_at)}</td><td>${esc(o.waiter)}</td><td class="right">${o.guests}</td>
          <td class="right num">${o.discount ? money(o.discount) : '—'}</td><td class="right num"><b>${money(o.total)}</b></td><td class="actions"><button class="btn sm" data-reprint="${o.id}">🖨</button></td></tr>`).join('')}
        </table></div>` : `<p class="muted">Ma'lumot yo'q</p>`}</div>`;
  },
  bind(root, { rep: r }) {
    bindPeriod(root);
    root.querySelectorAll('[data-reprint]').forEach((b) => b.onclick = async () => { try { printReceipt(await GET(`/api/orders/${b.dataset.reprint}`)); } catch (e) { toastError(e); } });
    root.querySelector('#csv').onclick = async () => {
      const txs = await GET(`/api/transactions?from=${r.from}&to=${r.to}`);
      const rows = [
        ['Hisobot', `${fmtDate(r.from)} — ${fmtDate(r.to - 1)}`], [],
        ['Umumiy savdo', r.sales.total], ['Cheklar', r.sales.orders], ["O'rtacha chek", r.sales.avg_check], ['Mehmonlar', r.sales.guests],
        ['Naqd', r.sales.cash], ['Karta', r.sales.card], ["O'tkazma", r.sales.transfer], ['Xizmat haqi', r.sales.service], ['Chegirma', r.sales.discount],
        ['Boshqa kirim', r.other_income], ['Xarajat', r.expense], ['Sof foyda', r.net_profit], [],
        ['TAOMLAR'], ['Taom', 'Soni', 'Savdo', 'Tannarx'], ...r.dishes.map((d) => [d.name, d.qty, d.revenue, d.cost]), [],
        ['CHEKLAR'], ['#', 'Vaqt', 'Ofitsant', 'Mehmon', 'Taomlar', 'Xizmat', 'Chegirma', 'Jami', 'Naqd', 'Karta', "O'tkazma"],
        ...r.orders.map((o) => [o.id, fmtDateTime(o.closed_at), o.waiter, o.guests, o.subtotal, o.service, o.discount, o.total, o.cash, o.card, o.transfer]), [],
        ['KIRIM-CHIQIM'], ['Vaqt', 'Turi', 'Kategoriya', "To'lov", 'Summa', 'Izoh', 'Kim'],
        ...txs.map((t) => [fmtDateTime(t.created_at), t.type === 'income' ? 'Kirim' : 'Chiqim', t.category, METHOD_NAMES[t.method], t.amount, t.note, t.user_name]),
      ];
      downloadCsv(`hisobot_${fmtDate(r.from)}_${fmtDate(r.to - 1)}.csv`, rows);
    };
  },
};

// ---------- Finance ----------
Views.finance = {
  title: 'Kirim-chiqim', icon: '💰', roles: ['owner', 'admin', 'cashier'], nav: true, refreshOn: ['finance'],
  async load() {
    const r = periodRange(UI.period.preset, UI.period);
    return { txs: await GET(`/api/transactions?from=${r.from}&to=${r.to}`) };
  },
  render({ txs }) {
    const f = UI.txFilter || 'all';
    const list = txs.filter((t) => f === 'all' || (f === 'sales' ? t.order_id : f === 'income' ? t.type === 'income' && !t.order_id : t.type === f));
    const inc = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return `<div class="page-head"><h1>Kirim-chiqim</h1><span class="spacer"></span>
      <button class="btn" id="add-income">➕ Kirim</button><button class="btn accent" id="add-expense">➖ Xarajat</button></div>
      ${periodPicker()}
      <div class="kpis">${kpi('Kirim', money(inc), '', 'good')}${kpi('Chiqim', money(exp), '', 'bad')}${kpi('Balans', money(inc - exp), '', inc - exp >= 0 ? 'prime' : 'bad')}</div>
      <div class="tabs" style="margin-bottom:10px">${[['all', 'Hammasi'], ['sales', 'Savdo'], ['income', 'Boshqa kirim'], ['expense', 'Xarajatlar']]
        .map(([k, n]) => `<button class="tab ${f === k ? 'active' : ''}" data-f="${k}">${n}</button>`).join('')}</div>
      <div class="card">${list.length ? `<div class="table-wrap"><table><tr><th>Vaqt</th><th>Turi</th><th>Kategoriya</th><th>To'lov</th><th>Izoh</th><th>Kim</th><th class="right">Summa</th><th></th></tr>
        ${list.map((t) => `<tr><td>${fmtDateTime(t.created_at)}</td><td>${t.type === 'income' ? '<span class="chip ready">Kirim</span>' : '<span class="chip cancelled" style="text-decoration:none">Chiqim</span>'}</td>
          <td>${esc(t.category)}</td><td>${METHOD_NAMES[t.method]}</td><td>${esc(t.note)}</td><td>${esc(t.user_name || '')}</td>
          <td class="right num"><b>${t.type === 'expense' ? '−' : '+'}${money(t.amount)}</b></td>
          <td class="actions">${App.user.role === 'owner' && !t.order_id ? `<button class="btn ghost sm danger-text" data-del="${t.id}">🗑</button>` : ''}</td></tr>`).join('')}
      </table></div>` : emptyState('📭', "Bu davrda yozuv yo'q")}</div>`;
  },
  bind(root) {
    bindPeriod(root);
    root.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { UI.txFilter = b.dataset.f; renderView(currentData); });
    root.querySelector('#add-expense').onclick = () => openTransaction('expense');
    root.querySelector('#add-income').onclick = () => openTransaction('income');
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal("O'chirish", "Bu yozuv o'chirilsinmi?", "O'chirish"))) return;
      try { await DEL(`/api/transactions/${b.dataset.del}`); refreshView(); } catch (e) { toastError(e); }
    });
  },
};

// ---------- Reservations ----------
Views.reservations = {
  title: 'Bronlar', icon: '📅', roles: ['owner', 'admin', 'cashier'], nav: true, refreshOn: ['rooms'],
  async load() {
    const [list, rooms] = await Promise.all([GET(`/api/reservations?from=${dayStart().getTime()}`), GET('/api/rooms?all=1')]);
    return { list, rooms };
  },
  render({ list }) {
    const st = { active: '<span class="chip new">Kutilmoqda</span>', arrived: '<span class="chip ready">Keldi</span>', cancelled: '<span class="chip cancelled">Bekor</span>' };
    return `<div class="page-head"><h1>Banket bronlari</h1><span class="spacer"></span><button class="btn primary" id="add">➕ Yangi bron</button></div>
      <div class="card">${list.length ? `<div class="table-wrap"><table><tr><th>Sana / vaqt</th><th>Xona</th><th>Mijoz</th><th class="right">Mehmon</th><th class="right">Avans</th><th>Holat</th><th></th></tr>
        ${list.map((x) => `<tr><td><b>${fmtDateTime(x.starts_at)}</b></td><td>${esc(x.room_number)} · ${esc(x.room_name)}</td>
          <td>${esc(x.customer)}<br><span class="small muted">${esc(x.phone)}${x.note ? ' · ' + esc(x.note) : ''}</span></td>
          <td class="right">${x.guests}</td><td class="right num">${x.deposit ? money(x.deposit) : '—'}</td><td>${st[x.status]}</td>
          <td class="actions">${x.status === 'active' ? `<button class="btn sm ok" data-st="arrived" data-id="${x.id}">Keldi</button>
            <button class="btn sm" data-edit="${x.id}">✏️</button><button class="btn sm danger-text" data-st="cancelled" data-id="${x.id}">Bekor</button>` : ''}</td></tr>`).join('')}
      </table></div>` : emptyState('📅', "Kelgusi bronlar yo'q")}</div>`;
  },
  bind(root, { list, rooms }) {
    const edit = (x = {}) => openModal({
      title: x.id ? 'Bronni tahrirlash' : 'Yangi bron',
      body: `<div class="form-grid">
        <label class="field">Xona<select name="room_id">${rooms.filter((r) => r.active).map((r) => `<option value="${r.id}" ${r.id === x.room_id ? 'selected' : ''}>${esc(r.number)} · ${esc(r.name)} (${r.capacity})</option>`).join('')}</select></label>
        <label class="field">Sana va vaqt<input type="datetime-local" name="starts_at" value="${toLocalInput(x.starts_at || Date.now() + 3600000)}" required></label>
        <label class="field">Mijoz ismi<input name="customer" value="${esc(x.customer || '')}" required></label>
        <label class="field">Telefon<input name="phone" type="tel" value="${esc(x.phone || '+998 ')}"></label>
        <label class="field">Mehmonlar<input type="number" name="guests" min="1" value="${x.guests || 10}"></label>
        <label class="field">Avans (oldindan to'lov)<input type="number" name="deposit" min="0" value="${x.deposit || 0}"></label>
        <label class="field">Avans to'lov turi<select name="deposit_method">${Object.entries(METHOD_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      </div><label class="field" style="margin-top:12px">Izoh (menyu, tadbir turi)<textarea name="note">${esc(x.note || '')}</textarea></label>`,
      actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
        const d = formData(f);
        d.room_id = Number(d.room_id);
        d.starts_at = new Date(d.starts_at).getTime();
        if (x.id) await PUT(`/api/reservations/${x.id}`, d); else await POST('/api/reservations', d);
        toast('Bron saqlandi', 'ok'); refreshView();
      } }],
    });
    root.querySelector('#add').onclick = () => edit();
    root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => edit(list.find((x) => x.id === Number(b.dataset.edit))));
    root.querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => {
      try { await POST(`/api/reservations/${b.dataset.id}/status`, { status: b.dataset.st }); refreshView(); } catch (e) { toastError(e); }
    });
  },
};

// ---------- Staff ----------
Views.staff = {
  title: 'Xodimlar', icon: '👥', roles: ['owner', 'admin'], nav: true,
  async load() { return { users: await GET('/api/users') }; },
  render({ users }) {
    const order = ['owner', 'admin', 'cashier', 'waiter', 'chef'];
    return `<div class="page-head"><h1>Xodimlar</h1><span class="spacer"></span><button class="btn primary" id="add">➕ Xodim qo'shish</button></div>
      <p class="muted">Boshliq — barcha huquqlarga ega va adminlarni tayinlaydi. Admin — kassir, ofitsant va oshpazlarni tayinlaydi. Ofitsantni xonaga biriktirish: <a href="#/halls">Xonalar sozlamasi</a>.</p>
      ${order.map((role) => {
        const list = users.filter((u) => u.role === role);
        if (!list.length) return '';
        return `<div class="card"><h3>${ROLE_NAMES[role]}lar (${list.length})</h3><div class="table-wrap"><table>
          <tr><th>Ism</th><th>Login</th><th>Telefon</th>${role === 'waiter' ? '<th>Xonalar</th>' : ''}<th>Holat</th><th></th></tr>
          ${list.map((u) => `<tr style="${u.active ? '' : 'opacity:.5'}"><td><b>${esc(u.name)}</b></td><td>${esc(u.username)}</td><td>${esc(u.phone)}</td>
            ${role === 'waiter' ? `<td>${u.rooms.map((r) => `<span class="chip">${esc(r.number)}</span>`).join(' ') || '<span class="muted small">yo\'q</span>'}</td>` : ''}
            <td>${u.active ? '<span class="chip ready">Faol</span>' : '<span class="chip">Bloklangan</span>'}</td>
            <td class="actions">${canEditRole(u.role) ? `<button class="btn sm" data-edit="${u.id}">✏️ Tahrirlash</button>` : ''}</td></tr>`).join('')}
        </table></div></div>`;
      }).join('')}`;
  },
  bind(root, { users }) {
    const edit = (u = {}) => {
      const roles = ['owner', 'admin', 'cashier', 'waiter', 'chef'].filter(canEditRole);
      openModal({
        title: u.id ? `${u.name} — tahrirlash` : "Yangi xodim",
        body: `<div class="form-grid">
          <label class="field">To'liq ism<input name="name" value="${esc(u.name || '')}" required></label>
          <label class="field">Lavozim<select name="role">${roles.map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_NAMES[r]}</option>`).join('')}</select></label>
          <label class="field">Login<input name="username" autocapitalize="none" value="${esc(u.username || '')}" required></label>
          <label class="field">${u.id ? 'Yangi parol (ixtiyoriy)' : 'Parol'}<input name="password" type="text" autocomplete="new-password" ${u.id ? '' : 'required'}></label>
          <label class="field">Telefon<input name="phone" type="tel" value="${esc(u.phone || '')}"></label>
          <label class="field">Oylik maosh<input name="salary" type="number" min="0" value="${u.salary || 0}"></label>
        </div>${u.id && u.id !== App.user.id ? `<label class="check" style="margin-top:12px"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Faol (o'chirsangiz tizimga kira olmaydi)</label>` : ''}`,
        actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
          const d = formData(f);
          d.salary = Number(d.salary) || 0;
          if (!d.password) delete d.password;
          if (u.id) await PUT(`/api/users/${u.id}`, d); else await POST('/api/users', d);
          toast('Saqlandi', 'ok'); refreshView();
        } }],
      });
    };
    root.querySelector('#add').onclick = () => edit();
    root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => edit(users.find((u) => u.id === Number(b.dataset.edit))));
  },
};
function canEditRole(role) {
  return App.user.role === 'owner' || (App.user.role === 'admin' && ['cashier', 'waiter', 'chef'].includes(role));
}

// ---------- Rooms setup ----------
Views.halls = {
  title: 'Xonalar sozlamasi', icon: '🏛️', roles: ['owner', 'admin'], nav: true,
  async load() {
    const [rooms, users] = await Promise.all([GET('/api/rooms?all=1'), GET('/api/users')]);
    return { rooms, waiters: users.filter((u) => u.role === 'waiter' && u.active) };
  },
  render({ rooms }) {
    return `<div class="page-head"><h1>Xonalar va stollar</h1><span class="spacer"></span><button class="btn primary" id="add">➕ Xona qo'shish</button></div>
      <p class="muted">Har bir banket xonasiga ofitsant biriktiring — ofitsant tizimga kirganda faqat o'z xonalarini ko'radi.</p>
      <div class="card"><div class="table-wrap"><table><tr><th>Raqam</th><th>Nomi</th><th>Turi</th><th class="right">Sig'imi</th><th>Ofitsantlar</th><th>Holat</th><th></th></tr>
      ${rooms.map((r) => `<tr style="${r.active ? '' : 'opacity:.5'}"><td><b style="font-size:18px">${esc(r.number)}</b></td><td>${esc(r.name)}</td>
        <td>${(ROOM_TYPES[r.type] || ROOM_TYPES.boshqa).join(' ')}</td><td class="right">${r.capacity}</td>
        <td>${r.waiters.map((w) => `<span class="chip">${esc(w.name)}</span>`).join(' ') || '<span class="chip cancelled" style="text-decoration:none">Biriktirilmagan</span>'}</td>
        <td>${r.active ? 'Faol' : 'Yopiq'}</td><td class="actions"><button class="btn sm" data-edit="${r.id}">✏️</button></td></tr>`).join('')}
      </table></div></div>`;
  },
  bind(root, { rooms, waiters }) {
    const edit = (r = {}) => openModal({
      title: r.id ? `${r.name} — tahrirlash` : 'Yangi xona',
      body: `<div class="form-grid">
        <label class="field">Raqami<input name="number" value="${esc(r.number || String(rooms.length + 1))}" required></label>
        <label class="field">Nomi<input name="name" value="${esc(r.name || '')}" placeholder="Banket 1" required></label>
        <label class="field">Turi<select name="type">${Object.entries(ROOM_TYPES).map(([k, [n, i]]) => `<option value="${k}" ${r.type === k ? 'selected' : ''}>${i} ${n}</option>`).join('')}</select></label>
        <label class="field">Sig'imi (kishi)<input type="number" name="capacity" min="1" value="${r.capacity || 10}"></label></div>
        <h3 style="margin-top:14px">Biriktirilgan ofitsantlar</h3>
        <div class="stack">${waiters.map((w) => `<label class="check"><input type="checkbox" name="waiter_ids" data-multi="1" value="${w.id}" ${r.waiters && r.waiters.some((x) => x.id === w.id) ? 'checked' : ''}> ${esc(w.name)}</label>`).join('') || '<p class="muted">Avval ofitsant qo\'shing</p>'}</div>
        ${r.id ? `<label class="check" style="margin-top:12px"><input type="checkbox" name="active" ${r.active ? 'checked' : ''}> Faol</label>` : ''}`,
      actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
        const d = formData(f);
        d.waiter_ids = d.waiter_ids || [];
        d.capacity = Number(d.capacity) || 1;
        if (r.id) await PUT(`/api/rooms/${r.id}`, d); else await POST('/api/rooms', d);
        toast('Saqlandi', 'ok'); refreshView();
      } }],
    });
    root.querySelector('#add').onclick = () => edit();
    root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => edit(rooms.find((r) => r.id === Number(b.dataset.edit))));
  },
};

// ---------- Menu setup ----------
Views.menuadmin = {
  title: 'Menyu', icon: '📋', roles: ['owner', 'admin'], nav: true, refreshOn: ['menu'],
  async load() { return GET('/api/menu'); },
  render({ categories, dishes }) {
    const groups = [...categories, { id: null, name: "Bo'limsiz", icon: '' }].map((c) => ({ c, ds: dishes.filter((d) => (d.category_id ?? null) === c.id) }));
    return `<div class="page-head"><h1>Menyu</h1><span class="spacer"></span>
      <button class="btn" id="add-cat">➕ Bo'lim</button><button class="btn primary" id="add-dish">➕ Taom qo'shish</button></div>
      ${groups.filter((g) => g.c.id || g.ds.length).map(({ c, ds }) => `<div class="card"><div class="card-head"><h3>${esc(c.icon)} ${esc(c.name)}</h3><span class="spacer"></span>
        ${c.id ? `<button class="btn sm" data-edit-cat="${c.id}">✏️</button><button class="btn sm danger-text" data-del-cat="${c.id}">🗑</button>` : ''}</div>
        ${ds.length ? `<div class="table-wrap"><table><tr><th>Taom</th><th class="right">Narx</th><th class="right">Tannarx</th><th class="right">Vaqt</th><th>Oshxona</th><th>Holat</th><th></th></tr>
        ${ds.map((d) => `<tr><td>${esc(d.icon)} <b>${esc(d.name)}</b> <span class="muted small">/ ${esc(d.unit)}</span></td>
          <td class="right num">${money(d.price)}</td><td class="right num">${money(d.cost)}</td><td class="right">${d.needs_kitchen ? `${d.prep_minutes} daq` : '—'}</td>
          <td>${d.needs_kitchen ? '🍳 Ha' : 'Yo\'q'}</td><td>${d.available ? '<span class="chip ready">Bor</span>' : '<span class="chip cancelled" style="text-decoration:none">Tugadi</span>'}</td>
          <td class="actions"><button class="btn sm" data-edit="${d.id}">✏️</button><button class="btn sm danger-text" data-del="${d.id}">🗑</button></td></tr>`).join('')}
        </table></div>` : `<p class="muted">Bu bo'limda taom yo'q</p>`}</div>`).join('')}`;
  },
  bind(root, { categories, dishes }) {
    const editCat = (c = {}) => openModal({
      title: c.id ? "Bo'limni tahrirlash" : "Yangi bo'lim",
      body: `<div class="form-grid"><label class="field">Nomi<input name="name" value="${esc(c.name || '')}" required></label>
        <label class="field">Belgi (emoji)<input name="icon" value="${esc(c.icon || '🍽️')}"></label>
        <label class="field">Tartib raqami<input type="number" name="sort" value="${c.sort ?? categories.length}"></label></div>`,
      actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
        const d = formData(f);
        if (c.id) await PUT(`/api/categories/${c.id}`, d); else await POST('/api/categories', d);
        refreshView();
      } }],
    });
    const editDish = (d = {}) => openModal({
      title: d.id ? `${d.name} — tahrirlash` : 'Yangi taom',
      body: `<div class="form-grid">
        <label class="field">Nomi<input name="name" value="${esc(d.name || '')}" required></label>
        <label class="field">Bo'lim<select name="category_id"><option value="">—</option>${categories.map((c) => `<option value="${c.id}" ${c.id === d.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field">Narxi<input type="number" name="price" min="0" value="${d.price ?? ''}" required></label>
        <label class="field">Tannarxi (xarajat)<input type="number" name="cost" min="0" value="${d.cost ?? 0}"></label>
        <label class="field">Tayyorlash vaqti (daq)<input type="number" name="prep_minutes" min="0" value="${d.prep_minutes ?? 15}"></label>
        <label class="field">O'lchov birligi<input name="unit" value="${esc(d.unit || 'porsiya')}"></label>
        <label class="field">Belgi (emoji)<input name="icon" value="${esc(d.icon || '🍽️')}"></label>
        <label class="field">Qoldiq (bo'sh = cheksiz)<input type="number" name="stock" min="0" value="${d.stock ?? ''}"></label>
      </div><label class="check" style="margin-top:12px"><input type="checkbox" name="needs_kitchen" ${d.needs_kitchen === 0 ? '' : 'checked'}> Oshxonada tayyorlanadi (o'chirilsa — non, ichimlik kabi darhol beriladi)</label>`,
      actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: 'primary', onClick: async (f) => {
        const x = formData(f);
        x.category_id = x.category_id ? Number(x.category_id) : null;
        x.stock = x.stock === '' ? null : x.stock;
        if (d.id) await PUT(`/api/dishes/${d.id}`, x); else await POST('/api/dishes', x);
        toast('Saqlandi', 'ok'); refreshView();
      } }],
    });
    root.querySelector('#add-cat').onclick = () => editCat();
    root.querySelector('#add-dish').onclick = () => editDish();
    root.querySelectorAll('[data-edit-cat]').forEach((b) => b.onclick = () => editCat(categories.find((c) => c.id === Number(b.dataset.editCat))));
    root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editDish(dishes.find((d) => d.id === Number(b.dataset.edit))));
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal("Taomni o'chirish", "Taom menyudan olib tashlansinmi? (hisobotlarda saqlanib qoladi)", "O'chirish"))) return;
      try { await DEL(`/api/dishes/${b.dataset.del}`); refreshView(); } catch (e) { toastError(e); }
    });
    root.querySelectorAll('[data-del-cat]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal("Bo'limni o'chirish", "Bo'lim o'chirilsinmi?", "O'chirish"))) return;
      try { await DEL(`/api/categories/${b.dataset.delCat}`); refreshView(); } catch (e) { toastError(e); }
    });
  },
};

// ---------- Settings ----------
Views.settings = {
  title: 'Sozlamalar', icon: '⚙️', roles: ['owner', 'admin', 'cashier', 'waiter', 'chef'], nav: true,
  async load() { return { s: App.settings }; },
  render({ s }) {
    const v = Voice.prefs();
    const voices = Voice.voices();
    const picked = Voice.pick();
    const manager = can('owner', 'admin');
    return `<div class="page-head"><h1>Sozlamalar</h1></div>
      <div class="grid grid-2">
      <div class="card"><h2>🔊 Ovozli xabar</h2>
        <p class="muted small">"Buyurtma tayyor" kabi xabarlarni ayol ovozida o'qib beradi. Telefoningizda o'zbek ovozi bo'lmasa, turkcha yoki ruscha ayol ovozi tanlanadi.</p>
        <form id="voice-form" class="stack">
          <label class="check"><input type="checkbox" name="enabled" ${v.enabled ? 'checked' : ''}> Ovozli xabarlar yoqilgan</label>
          <label class="field">Ovoz<select name="voiceURI"><option value="">Avtomatik (${picked ? esc(picked.name) : "ovoz topilmadi"})</option>
            ${voices.map((x) => `<option value="${esc(x.voiceURI)}" ${x.voiceURI === v.voiceURI ? 'selected' : ''}>${esc(x.name)} (${esc(x.lang)})</option>`).join('')}</select></label>
          <label class="field">Tezlik: <span id="rate-v">${v.rate}</span><input type="range" name="rate" min="0.6" max="1.4" step="0.05" value="${v.rate}"></label>
          <div class="row"><button type="button" class="btn primary" id="test-voice">▶ Sinab ko'rish</button>
            <button type="button" class="btn" id="notif">🔔 Bildirishnomalarga ruxsat</button></div>
        </form></div>
      <div class="card"><h2>👤 Mening hisobim</h2>
        <p>${esc(App.user.name)} · <span class="chip">${ROLE_NAMES[App.user.role]}</span></p>
        <form id="pw-form" class="stack">
          <label class="field">Eski parol<input type="password" name="old_password" required autocomplete="current-password"></label>
          <label class="field">Yangi parol<input type="password" name="new_password" required autocomplete="new-password"></label>
          <button class="btn primary">Parolni o'zgartirish</button></form>
        <h3 style="margin-top:16px">Mavzu</h3><div class="row">${[['auto', 'Avtomatik'], ['light', "☀️ Yorug'"], ['dark', '🌙 Qorong\'i']]
          .map(([k, n]) => `<button class="btn sm ${(store('cp_theme') || 'auto') === k ? 'primary' : ''}" data-theme="${k}">${n}</button>`).join('')}</div></div>
      ${manager ? `<div class="card" style="grid-column:1/-1"><h2>🏪 Muassasa</h2><form id="org-form">
        <div class="form-grid">
          <label class="field">Nomi<input name="name" value="${esc(s.name)}"></label>
          <label class="field">Manzil<input name="address" value="${esc(s.address)}"></label>
          <label class="field">Telefon<input name="phone" value="${esc(s.phone)}"></label>
          <label class="field">Xizmat haqi, %<input type="number" name="service_pct" min="0" max="50" step="0.5" value="${s.service_pct}"></label>
          <label class="field">Valyuta<input name="currency" value="${esc(s.currency)}"></label>
        </div>
        <label class="field" style="margin-top:12px">Chek ostidagi matn<input name="receipt_footer" value="${esc(s.receipt_footer)}"></label>
        <div class="form-grid" style="margin-top:12px">
          <label class="field">Xarajat kategoriyalari (har biri yangi qatorda)<textarea name="expense_categories" rows="7">${esc(s.expense_categories.join('\n'))}</textarea></label>
          <label class="field">Kirim kategoriyalari<textarea name="income_categories" rows="7">${esc(s.income_categories.join('\n'))}</textarea></label>
        </div>
        <button class="btn primary" style="margin-top:12px">Saqlash</button></form></div>` : ''}
      </div>`;
  },
  bind(root) {
    const vf = root.querySelector('#voice-form');
    vf.oninput = () => {
      const d = formData(vf);
      Voice.save({ enabled: d.enabled, voiceURI: d.voiceURI, rate: Number(d.rate) });
      root.querySelector('#rate-v').textContent = d.rate;
    };
    root.querySelector('#test-voice').onclick = () => Voice.say("Diqqat! Uchinchi xona. Sho'rva, ikki porsiya tayyor. Olib keting.", 'ready');
    root.querySelector('#notif').onclick = async () => {
      if (!('Notification' in window)) return toast("Brauzer bildirishnomani qo'llamaydi", 'warn');
      const p = await Notification.requestPermission();
      toast(p === 'granted' ? 'Ruxsat berildi ✅' : 'Ruxsat berilmadi', p === 'granted' ? 'ok' : 'warn');
    };
    if ('speechSynthesis' in window && !Voice.voices().length) speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; renderView(currentData); };
    root.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { store('cp_theme', b.dataset.theme); applyTheme(); renderView(currentData); });
    const pw = root.querySelector('#pw-form');
    pw.onsubmit = async (e) => {
      e.preventDefault();
      try { await PUT('/api/me/password', formData(pw)); pw.reset(); toast("Parol o'zgartirildi", 'ok'); } catch (err) { toastError(err); }
    };
    const org = root.querySelector('#org-form');
    if (org) org.onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(org);
      d.expense_categories = d.expense_categories.split('\n').map((x) => x.trim()).filter(Boolean);
      d.income_categories = d.income_categories.split('\n').map((x) => x.trim()).filter(Boolean);
      try { App.settings = await PUT('/api/settings', d); toast('Saqlandi', 'ok'); render(); } catch (err) { toastError(err); }
    };
  },
};

// ---------- Audit log ----------
const AUDIT_NAMES = {
  login: 'Tizimga kirdi', order_open: 'Chek ochdi', items_add: "Taom qo'shdi", item_ready: 'Taom tayyor', item_cancel: 'Taomni bekor qildi',
  order_close: 'Chekni yopdi', order_cancel: 'Chekni bekor qildi', order_transfer: "Chekni ko'chirdi", price_change: "Narxni o'zgartirdi",
  dish_create: "Taom qo'shdi", dish_update: 'Taomni tahrirladi', dish_delete: "Taomni o'chirdi", dish_stopped: 'Stop-listga qo\'ydi',
  dish_available: 'Stop-listdan chiqardi', user_create: "Xodim qo'shdi", user_update: 'Xodimni tahrirladi', expense_add: "Xarajat qo'shdi",
  income_add: "Kirim qo'shdi", transaction_delete: "Yozuvni o'chirdi", shift_open: 'Smena ochdi', shift_close: 'Smena yopdi',
  settings_update: "Sozlamalarni o'zgartirdi", room_create: "Xona qo'shdi", room_update: 'Xonani tahrirladi',
  reservation_create: 'Bron qildi', reservation_update: 'Bronni tahrirladi', reservation_status: 'Bron holati', password_change: "Parolini o'zgartirdi",
  category_save: "Bo'lim saqladi", category_delete: "Bo'limni o'chirdi",
};
Views.audit = {
  title: 'Amallar tarixi', icon: '🕵️', roles: ['owner', 'admin'], nav: true,
  async load() { return { rows: await GET('/api/audit?limit=500') }; },
  render({ rows }) {
    return `<div class="page-head"><h1>Amallar tarixi</h1><span class="muted">oxirgi 500 ta</span></div>
      <p class="muted">Kim, qachon, nima qilgani — chegirmalar, bekor qilishlar va narx o'zgarishlarini nazorat qilish uchun.</p>
      <div class="card"><div class="table-wrap"><table><tr><th>Vaqt</th><th>Xodim</th><th>Amal</th><th>Tafsilot</th></tr>
      ${rows.map((a) => `<tr><td class="small">${fmtDateTime(a.created_at)}</td><td>${esc(a.user_name || '—')} <span class="muted small">${ROLE_NAMES[a.role] || ''}</span></td>
        <td>${/cancel|delete|price/.test(a.action) ? `<b style="color:var(--danger)">${esc(AUDIT_NAMES[a.action] || a.action)}</b>` : esc(AUDIT_NAMES[a.action] || a.action)}</td>
        <td class="small">${esc(a.details)}</td></tr>`).join('')}
      </table></div></div>`;
  },
};
