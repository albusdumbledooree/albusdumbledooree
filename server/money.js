'use strict';
/*
 * The full picture of a month for the boss:
 * - expense groups: every expense category belongs to a group (products, pay, rent, utilities, tax, advertising…),
 *   guessed from its name and changeable in the settings;
 * - fixed costs: rent, electricity, tax… with the day of the month they are due; "Paid" writes them to the cash book;
 * - the profit and loss of a month: sales − products − pay (as earned, not only as handed out) − fixed and other costs.
 *   A cost that is due but not paid yet still belongs to its month and is shown as "not paid yet".
 */
const { HttpError, str, int } = require('./util');

const GROUPS = [
  ['mahsulot', 'Mahsulot va oziq-ovqat'], ['ish_haqi', 'Ish haqi'], ['ijara', 'Ijara'], ['kommunal', 'Kommunal (svet, gaz, suv)'],
  ['soliq', 'Soliq'], ['reklama', 'Reklama'], ['tamir', "Ta'mirlash va jihoz"], ['transport', 'Transport'], ['boshqa', 'Boshqa'],
];
const GROUP_KEYS = GROUPS.map(([k]) => k);
// A category's group from its name, when the boss has not chosen one.
const GUESS = [
  ['mahsulot', /mahsulot|go'?sht|sabzavot|meva|ichimlik|un\b|yog'?|guruch|non|ziravor|sut|tuxum|masalliq|oziq|choy|shakar|mol xaridi/i],
  ['ish_haqi', /ish haqi|oylik|maosh|avans/i],
  ['ijara', /ijara/i],
  ['kommunal', /kommunal|svet|elektr|gaz|suv|internet|telefon|chiqindi|issiqlik/i],
  ['soliq', /soliq|patent|jarima|davlat/i],
  ['reklama', /reklama|marketing|instagram|telegram|banner/i],
  ['tamir', /ta'?mir|jihoz|idish|mebel|uskuna|qurilish/i],
  ['transport', /transport|yo'?lkira|benzin|taksi|yetkaz|dostavka/i],
];
const guessGroup = (cat) => (GUESS.find(([, re]) => re.test(cat)) || ['boshqa'])[0];
const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY = 24 * 3600 * 1000;

function createMoney(db, { settings, audit, events, now, payroll, payrollOn, isShop, shop, SYSTEM_CATS }) {
  const q = (sql) => db.prepare(sql);

  function groupMap(s = settings()) {
    const own = s.expense_groups || {};
    return (cat) => (GROUP_KEYS.includes(own[cat]) ? own[cat] : guessGroup(cat));
  }
  function groups() {
    const g = groupMap();
    return { groups: GROUPS.map(([key, name]) => ({ key, name })), categories: settings().expense_categories.map((c) => ({ name: c, group: g(c) })) };
  }

  // ---------- Months ----------
  const pad = (n) => String(n).padStart(2, '0');
  const monthOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  function monthInput(v) {
    const m = v || monthOf(now());
    if (!MONTH_RE.test(m)) throw new HttpError(400, "Oy noto'g'ri");
    return m;
  }
  function bounds(month) {
    const [y, m] = month.split('-').map(Number);
    return { from: new Date(y, m - 1, 1).getTime(), to: new Date(y, m, 1).getTime(), days: new Date(y, m, 0).getDate() };
  }
  const prevMonth = (month) => { const [y, m] = month.split('-').map(Number); return monthOf(new Date(y, m - 2, 15).getTime()); };
  // The day a fixed cost falls due in a month (the 31st in a 30-day month is the 30th).
  function dueAt(fc, month) {
    const b = bounds(month);
    return new Date(b.from + (Math.min(fc.due_day, b.days) - 1) * DAY).setHours(9, 0, 0, 0);
  }

  // ---------- Fixed costs ----------
  function fixedRow(fc, month) {
    const paid = q("SELECT id, amount, method, created_at FROM transactions WHERE fixed_id = ? AND fixed_month = ? AND type = 'expense'").get(fc.id, month);
    const due = dueAt(fc, month);
    return { ...fc, month, due_at: due, paid: paid || null, overdue: !paid && due < now() - DAY / 2, due_today: !paid && Math.abs(due - now()) < DAY / 2 };
  }
  function fixedList({ query }) {
    const month = monthInput(query.month);
    // A cost added in October is not September's: months before it was added are left out.
    const items = q('SELECT * FROM fixed_costs WHERE active = 1 ORDER BY due_day, name').all().filter((fc) => monthOf(fc.created_at) <= month).map((fc) => fixedRow(fc, month));
    const planned = items.reduce((s, x) => s + x.amount, 0);
    const paid = items.reduce((s, x) => s + (x.paid ? x.paid.amount : 0), 0);
    return { month, items, totals: { planned, paid, unpaid: items.filter((x) => !x.paid).reduce((s, x) => s + x.amount, 0) }, categories: settings().expense_categories };
  }
  function fixedInput(body, old = {}) {
    const name = body.name !== undefined ? str(body.name, 'Nomi', { required: true, max: 60 }) : old.name;
    const category = body.category !== undefined ? str(body.category, 'Kategoriya', { required: true, max: 60 }) : old.category;
    const amount = body.amount !== undefined ? int(body.amount, 'Summa', { min: 0, max: 1e11 }) : old.amount;
    const dueDay = body.due_day !== undefined ? int(body.due_day, "To'lov kuni", { min: 1, max: 31, required: true }) : old.due_day;
    const variable = body.variable !== undefined ? (body.variable ? 1 : 0) : old.variable || 0;
    if (!name || !category) throw new HttpError(400, 'Nomi va kategoriyasini kiriting');
    return { name, category, amount, due_day: dueDay || 1, variable };
  }
  function fixedCreate({ user, body }) {
    const f = fixedInput(body);
    const id = Number(q('INSERT INTO fixed_costs (name, category, amount, due_day, variable, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(f.name, f.category, f.amount, f.due_day, f.variable, now()).lastInsertRowid);
    audit(user, 'fixed_add', `${f.name}: ${f.amount} (har oy ${f.due_day}-kuni)`);
    events.publish('finance');
    return fixedRow(q('SELECT * FROM fixed_costs WHERE id = ?').get(id), monthOf(now()));
  }
  function fixedGet(id) {
    const fc = q('SELECT * FROM fixed_costs WHERE id = ? AND active = 1').get(id);
    if (!fc) throw new HttpError(404, 'Doimiy xarajat topilmadi');
    return fc;
  }
  function fixedUpdate({ user, params, body }) {
    const fc = fixedGet(params.id);
    const f = fixedInput(body, fc);
    q('UPDATE fixed_costs SET name = ?, category = ?, amount = ?, due_day = ?, variable = ? WHERE id = ?').run(f.name, f.category, f.amount, f.due_day, f.variable, fc.id);
    audit(user, 'fixed_edit', `${f.name}: ${f.amount}`);
    events.publish('finance');
    return fixedRow(q('SELECT * FROM fixed_costs WHERE id = ?').get(fc.id), monthOf(now()));
  }
  // Switched off, never deleted: past payments keep pointing at it.
  function fixedRemove({ user, params }) {
    const fc = fixedGet(params.id);
    q('UPDATE fixed_costs SET active = 0 WHERE id = ?').run(fc.id);
    audit(user, 'fixed_remove', fc.name);
    events.publish('finance');
    return { ok: true };
  }
  function fixedPay({ user, params, body }) {
    const fc = fixedGet(params.id);
    const month = monthInput(body.month);
    if (q("SELECT 1 FROM transactions WHERE fixed_id = ? AND fixed_month = ? AND type = 'expense'").get(fc.id, month)) {
      throw new HttpError(409, `"${fc.name}" bu oy uchun allaqachon to'langan`);
    }
    const amount = int(body.amount ?? fc.amount, 'Summa', { min: 1, required: true, max: 1e11 });
    const method = ['cash', 'card', 'transfer'].includes(body.method) ? body.method : 'cash';
    const id = Number(q(`INSERT INTO transactions (type, category, amount, method, note, user_id, created_at, fixed_id, fixed_month)
      VALUES ('expense', ?, ?, ?, ?, ?, ?, ?, ?)`).run(fc.category, amount, method, `${fc.name} (${month})`, user.id, now(), fc.id, month).lastInsertRowid);
    // A bill that changes every month (electricity): what was paid becomes next month's expected amount.
    if (fc.variable && amount !== fc.amount) q('UPDATE fixed_costs SET amount = ? WHERE id = ?').run(amount, fc.id);
    audit(user, 'fixed_pay', `${fc.name} ${month}: ${amount}`);
    events.publish('finance');
    return { ok: true, transaction_id: id };
  }
  // Due today or overdue this month (for the morning message and the reminder on the screen).
  function fixedDue() {
    const month = monthOf(now());
    return q('SELECT * FROM fixed_costs WHERE active = 1').all().map((fc) => fixedRow(fc, month)).filter((x) => x.due_today || x.overdue);
  }

  // ---------- Profit and loss of a month ----------
  function numbers(month) {
    const b = bounds(month);
    const end = Math.min(b.to, now());
    const s = settings();
    const g = groupMap(s);
    const shopLike = isShop();
    const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
    const txs = q('SELECT * FROM transactions WHERE created_at >= ? AND created_at < ?').all(b.from, end);
    const payrollTx = new Set(q('SELECT transaction_id FROM payroll WHERE transaction_id IS NOT NULL').all().map((r) => r.transaction_id));
    const orders = q("SELECT total FROM orders WHERE status = 'closed' AND closed_at >= ? AND closed_at < ?").all(b.from, end);
    const refunds = sum(txs.filter((t) => t.type === 'expense' && t.category === 'Qaytarish'), (t) => t.amount);
    const revenue = sum(orders, (o) => o.total) - refunds;
    const otherIncome = sum(txs.filter((t) => t.type === 'income' && !t.order_id && t.category !== "Qarz to'lovi"), (t) => t.amount);
    const by = Object.fromEntries(GROUP_KEYS.map((k) => [k, { paid: 0, unpaid: 0, items: new Map() }]));
    const add = (key, label, amount, unpaid = false) => {
      const x = by[key];
      if (unpaid) x.unpaid += amount; else x.paid += amount;
      x.items.set(label, (x.items.get(label) || 0) + amount);
    };
    // Shops: what the goods sold cost (stock bought is not a cost until it is sold).
    if (shopLike) {
      const p = shop.periodNumbers(b.from, end);
      if (p.goods_cost) add('mahsulot', "Sotilgan mol tannarxi", p.goods_cost);
      if (p.service_cost) add('boshqa', "Ustalar va yetkazish", p.service_cost);
      if (p.damage) add('mahsulot', 'Brak va kamomad', p.damage);
    }
    for (const t of txs) {
      if (t.type !== 'expense' || t.category === 'Qaytarish' || payrollTx.has(t.id)) continue;
      if (shopLike && SYSTEM_CATS.includes(t.category)) continue;
      add(g(t.category), t.category, t.amount);
    }
    // Pay as earned this month (the payroll), not only what was handed out.
    let payOwed = 0;
    if (payrollOn()) {
      const m = payroll.month({ query: { month } });
      const earned = m.totals.accrued + m.totals.bonus - m.totals.fine;
      if (earned) add('ish_haqi', 'Xodimlar (hisoblangan)', earned);
      payOwed = m.staff.reduce((t, r) => t + Math.max(0, r.period_due), 0);
    }
    // Fixed costs due by now but not paid: still this month's cost.
    const unpaidFixed = [];
    for (const fc of q('SELECT * FROM fixed_costs WHERE active = 1').all()) {
      if (monthOf(fc.created_at) > month) continue;
      const r = fixedRow(fc, month);
      if (r.paid || r.due_at >= end || !fc.amount) continue;
      add(g(fc.category), fc.name, fc.amount, true);
      unpaidFixed.push({ id: fc.id, name: fc.name, amount: fc.amount, due_at: r.due_at });
    }
    const groupsOut = GROUPS.map(([key, name]) => ({ key, name, amount: by[key].paid + by[key].unpaid, unpaid: by[key].unpaid,
      items: [...by[key].items].map(([label, amount]) => ({ label, amount })).sort((a, c) => c.amount - a.amount) })).filter((x) => x.amount);
    const expenses = sum(groupsOut, (x) => x.amount);
    return { revenue, refunds, other_income: otherIncome, sales: orders.length, groups: groupsOut, expenses, net: revenue + otherIncome - expenses,
      unpaid: { pay: payOwed, fixed: unpaidFixed } };
  }
  function pnl({ query }) {
    const month = monthInput(query.month);
    const cur = numbers(month);
    const prev = numbers(prevMonth(month));
    const b = bounds(month);
    return { month, partial: now() < b.to && now() >= b.from, ...cur,
      prev: { month: prevMonth(month), revenue: prev.revenue, expenses: prev.expenses, net: prev.net }, pay_module: payrollOn() };
  }
  // Yesterday / today in short, for the evening Telegram message.
  function dayNumbers(from, to) {
    const txs = q('SELECT * FROM transactions WHERE created_at >= ? AND created_at < ?').all(from, to);
    const orders = q("SELECT id, total, guests FROM orders WHERE status = 'closed' AND closed_at >= ? AND closed_at < ?").all(from, to);
    const shopLike = isShop();
    const refunds = txs.filter((t) => t.type === 'expense' && t.category === 'Qaytarish').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === 'expense' && t.category !== 'Qaytarish' && !(shopLike && SYSTEM_CATS.includes(t.category))).reduce((s, t) => s + t.amount, 0);
    const methods = {};
    for (const t of txs.filter((x) => x.type === 'income' && x.order_id)) methods[t.method] = (methods[t.method] || 0) + t.amount;
    const top = q(`SELECT i.name, SUM(i.qty) qty FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.status = 'closed' AND o.closed_at >= ? AND o.closed_at < ? AND i.status != 'cancelled' AND i.dish_id IS NOT NULL
      GROUP BY i.name ORDER BY qty DESC LIMIT 3`).all(from, to);
    const open = q("SELECT COUNT(*) c, COALESCE(SUM(total), 0) s FROM orders WHERE status = 'open'").get();
    return { revenue: orders.reduce((s, o) => s + o.total, 0) - refunds, checks: orders.length, guests: orders.reduce((s, o) => s + (o.guests || 0), 0),
      expense, methods, top, open_checks: open.c, open_sum: open.s };
  }

  return { groups, groupMap, fixedList, fixedCreate, fixedUpdate, fixedRemove, fixedPay, fixedDue, pnl, dayNumbers, monthOf };
}

module.exports = { createMoney, GROUPS, GROUP_KEYS, guessGroup };
