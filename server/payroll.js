'use strict';
/*
 * Staff pay: rates (monthly / daily + optional % of own sales), attendance, bonuses, fines, the worker's own
 * expenses (meals, drinks…), advances and payments.
 * Balance = accrued pay + bonuses − fines − expenses − advances − payments. Positive: the choyxona owes the worker;
 * negative: the worker got more than earned.
 * Daily workers are usually paid the same evening; monthly ones get an advance mid-month and the rest at the end.
 * Rates are kept as a history, so changing a salary never rewrites the past.
 */
const { HttpError, str, int } = require('./util');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS = ['cash', 'card', 'transfer'];
const ENTRY_NAMES = { payment: "To'lov", advance: 'Avans', bonus: 'Bonus', fine: 'Jarima', deduction: 'Xodim xarajati' };
const EXPENSE_KINDS = ['Ovqat', 'Ichimlik', 'Boshqa'];
// Attendance marks: present (auto = signed in, manual = set by the boss) or not (absent, day off, sick).
const ATT_STATUS = { present: 'manual', absent: 'absent', dayoff: 'dayoff', sick: 'sick' };
const NOT_PRESENT = "('absent', 'dayoff', 'sick')";
const PAID_OUT = ['payment', 'advance'];

function dayOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDay(day) { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(day, n) { const d = parseDay(day); d.setDate(d.getDate() + n); return dayOf(d.getTime()); }
function daysInMonth(day) { const d = parseDay(day); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new HttpError(400, "Oy noto'g'ri (YYYY-MM)");
  const from = `${month}-01`;
  return { from, to: `${month}-${String(daysInMonth(from)).padStart(2, '0')}` };
}

function createPayroll(db, { audit, events, now = () => Date.now() }) {
  const q = (sql) => db.prepare(sql);
  const today = () => dayOf(now());
  const marked = new Set();

  // Called on every authenticated request: the first one each day marks the worker present.
  function markPresent(userId) {
    const key = `${userId}|${today()}`;
    if (marked.has(key)) return;
    q("INSERT OR IGNORE INTO attendance (user_id, day, source) VALUES (?, ?, 'auto')").run(userId, today());
    if (marked.size > 5000) marked.clear();
    marked.add(key);
  }

  const ratesOf = (userId) => q('SELECT * FROM pay_rates WHERE user_id = ? ORDER BY from_day, id').all(userId);
  function rateOn(rates, day) {
    let r = null;
    for (const x of rates) if (x.from_day <= day) r = x;
    return r;
  }

  // Pay earned between two days (inclusive), never before hiring, after leaving or after today.
  function accrue(user, from, to) {
    const start = [from, dayOf(user.created_at)].sort()[1];
    const end = [to, today(), user.left_at ? dayOf(user.left_at) : '9999-12-31'].sort()[0];
    const out = { base: 0, pct: 0, sales: 0, days_worked: 0 };
    if (start > end) return out;
    const rates = ratesOf(user.id);
    const present = new Set(q(`SELECT day FROM attendance WHERE user_id = ? AND day >= ? AND day <= ? AND source NOT IN ${NOT_PRESENT}`).all(user.id, start, end).map((r) => r.day));
    // Workers' own meals are not sales: no commission on them.
    const sales = new Map();
    const fromTs = parseDay(start).getTime();
    const toTs = parseDay(addDays(end, 1)).getTime();
    for (const o of q("SELECT closed_at, total FROM orders WHERE status = 'closed' AND waiter_id = ? AND closed_at >= ? AND closed_at < ? AND paid_staff = 0").all(user.id, fromTs, toTs)) {
      const k = dayOf(o.closed_at);
      sales.set(k, (sales.get(k) || 0) + o.total);
    }
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (present.has(d)) out.days_worked += 1;
      const r = rateOn(rates, d);
      if (!r) continue;
      if (r.pay_type === 'monthly') out.base += r.amount / daysInMonth(d);
      else if (r.pay_type === 'daily' && present.has(d)) out.base += r.amount;
      if (r.sales_pct && sales.has(d)) {
        out.sales += sales.get(d);
        out.pct += (sales.get(d) * r.sales_pct) / 100;
      }
    }
    out.base = Math.round(out.base);
    out.pct = Math.round(out.pct);
    return out;
  }

  function entrySums(userId, from = '0000-00-00', to = '9999-12-31') {
    const sums = { payment: 0, advance: 0, bonus: 0, fine: 0, deduction: 0 };
    for (const r of q('SELECT type, SUM(amount) s FROM payroll WHERE user_id = ? AND day >= ? AND day <= ? GROUP BY type').all(userId, from, to)) {
      sums[r.type] = r.s;
    }
    return sums;
  }

  function balance(user) {
    const a = accrue(user, '0000-00-00', '9999-12-31');
    const e = entrySums(user.id);
    return a.base + a.pct + e.bonus - e.fine - e.deduction - e.payment - e.advance;
  }

  function staffRow(user, from, to) {
    const a = accrue(user, from, to);
    const e = entrySums(user.id, from, to);
    const rate = rateOn(ratesOf(user.id), [to, today()].sort()[0]);
    return {
      id: user.id, name: user.name, role: user.role, active: user.active,
      rate: rate && { pay_type: rate.pay_type, amount: rate.amount, sales_pct: rate.sales_pct, from_day: rate.from_day },
      days_worked: a.days_worked, sales: a.sales, accrued_base: a.base, accrued_pct: a.pct, accrued: a.base + a.pct,
      bonus: e.bonus, fine: e.fine, deduction: e.deduction, advance: e.advance, paid: e.payment + e.advance,
      period_due: a.base + a.pct + e.bonus - e.fine - e.deduction - e.payment - e.advance,
      balance: balance(user),
    };
  }

  function getUser(id) {
    const u = q('SELECT * FROM users WHERE id = ?').get(id);
    if (!u) throw new HttpError(404, 'Xodim topilmadi');
    if (u.role === 'owner') throw new HttpError(400, 'Boshliq uchun ish haqi yuritilmaydi');
    return u;
  }

  // ---------- Handlers ----------
  function month({ query }) {
    const m = query.month || today().slice(0, 7);
    const { from, to } = monthRange(m);
    const users = q("SELECT * FROM users WHERE role != 'owner' ORDER BY active DESC, role, name").all();
    const staff = users.map((u) => staffRow(u, from, to))
      .filter((r) => r.active || r.balance !== 0 || r.accrued || r.paid || r.bonus || r.fine || r.deduction);
    // From the 15th of the current month: monthly workers who have not had their advance yet.
    const advanceDay = m === today().slice(0, 7) && Number(today().slice(8)) >= 15;
    for (const r of staff) r.advance_missing = advanceDay && r.active && r.rate && r.rate.pay_type === 'monthly' && !r.advance;
    const attendance = q('SELECT user_id, day, source FROM attendance WHERE day >= ? AND day <= ?').all(from, to);
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    const sum = (k) => staff.reduce((s, r) => s + r[k], 0);
    return {
      month: m, days, today: today(), staff, attendance,
      totals: { accrued: sum('accrued'), bonus: sum('bonus'), fine: sum('fine'), deduction: sum('deduction'), paid: sum('paid'),
        owed: staff.reduce((s, r) => s + Math.max(0, r.balance), 0), advances: staff.reduce((s, r) => s + Math.max(0, -r.balance), 0) },
    };
  }

  function setRate({ user, params, body }) {
    const target = getUser(params.id);
    const pay_type = str(body.pay_type, 'Turi', { required: true });
    if (!['monthly', 'daily', 'none'].includes(pay_type)) throw new HttpError(400, "Maosh turi noto'g'ri");
    const amount = pay_type === 'none' ? 0 : int(body.amount, 'Summa', { required: true });
    const sales_pct = Number(body.sales_pct) || 0;
    if (!(sales_pct >= 0 && sales_pct <= 50)) throw new HttpError(400, "Foiz 0–50 oralig'ida bo'lsin");
    const existing = ratesOf(target.id);
    let from_day = str(body.from_day, 'Sana');
    if (!from_day) from_day = existing.length ? today() : dayOf(target.created_at);
    if (!DAY_RE.test(from_day)) throw new HttpError(400, "Sana noto'g'ri");
    const same = existing.find((r) => r.from_day === from_day);
    if (same) q('UPDATE pay_rates SET pay_type = ?, amount = ?, sales_pct = ? WHERE id = ?').run(pay_type, amount, sales_pct, same.id);
    else q('INSERT INTO pay_rates (user_id, pay_type, amount, sales_pct, from_day, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(target.id, pay_type, amount, sales_pct, from_day, now());
    audit(user, 'pay_rate', `${target.name}: ${pay_type} ${amount}${sales_pct ? ` + ${sales_pct}%` : ''} (${from_day} dan)`);
    return staffRow(target, today().slice(0, 7) + '-01', today());
  }

  function addEntry({ user, body }) {
    const target = getUser(int(body.user_id, 'Xodim', { min: 1, required: true }));
    const type = str(body.type, 'Turi', { required: true });
    if (!ENTRY_NAMES[type]) throw new HttpError(400, "Turi noto'g'ri");
    const amount = int(body.amount, 'Summa', { min: 1, required: true });
    const day = str(body.day, 'Sana') || today();
    if (!DAY_RE.test(day)) throw new HttpError(400, "Sana noto'g'ri");
    let note = str(body.note, 'Izoh', { max: 200 });
    if (type === 'fine' && !note) throw new HttpError(400, 'Jarima sababini yozing');
    if (type === 'deduction') {
      const kind = EXPENSE_KINDS.includes(body.kind) ? body.kind : 'Boshqa';
      note = note ? `${kind}: ${note}` : kind;
    }
    const paidOut = PAID_OUT.includes(type);
    const method = paidOut ? str(body.method, "To'lov turi") || 'cash' : 'cash';
    if (!METHODS.includes(method)) throw new HttpError(400, "To'lov turi noto'g'ri");
    db.exec('BEGIN');
    try {
      let txId = null;
      if (paidOut) {
        // Salary and advances paid out are also an expense in the cash book and reports.
        const label = type === 'advance' ? `${target.name}: avans${note ? ', ' + note : ''}` : `${target.name}${note ? ': ' + note : ''}`;
        txId = q("INSERT INTO transactions (type, category, amount, method, note, user_id, created_at) VALUES ('expense', 'Ish haqi', ?, ?, ?, ?, ?)")
          .run(amount, method, label, user.id, now()).lastInsertRowid;
      }
      q('INSERT INTO payroll (user_id, type, amount, method, note, day, transaction_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(target.id, type, amount, method, note, day, txId, user.id, now());
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    audit(user, `pay_${type}`, `${target.name}: ${amount}${note ? ` (${note})` : ''}`);
    if (paidOut) events.publish('finance');
    events.publish('payroll', { type, amount, name: target.name }, { userIds: [target.id] });
    return { ok: true, balance: balance(target) };
  }

  function deleteEntry({ user, params }) {
    const e = q('SELECT p.*, u.name FROM payroll p JOIN users u ON u.id = p.user_id WHERE p.id = ?').get(params.id);
    if (!e) throw new HttpError(404, 'Yozuv topilmadi');
    db.exec('BEGIN');
    try {
      q('DELETE FROM payroll WHERE id = ?').run(e.id);
      if (e.transaction_id) q('DELETE FROM transactions WHERE id = ?').run(e.transaction_id);
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
    audit(user, 'pay_delete', `${e.name}: ${ENTRY_NAMES[e.type]} ${e.amount} (${e.day})`);
    events.publish('finance');
    return { ok: true };
  }

  function setAttendance({ user, body }) {
    const target = getUser(int(body.user_id, 'Xodim', { min: 1, required: true }));
    const day = str(body.day, 'Sana', { required: true });
    if (!DAY_RE.test(day) || day > today()) throw new HttpError(400, "Sana noto'g'ri");
    // "absent", "dayoff", "sick" are stored (not deleted) so a later automatic mark cannot overwrite the boss's decision.
    const status = body.status !== undefined ? str(body.status, 'Holat') : body.present ? 'present' : 'absent';
    if (status === 'clear') q('DELETE FROM attendance WHERE user_id = ? AND day = ?').run(target.id, day);
    else if (ATT_STATUS[status]) q('INSERT OR REPLACE INTO attendance (user_id, day, source) VALUES (?, ?, ?)').run(target.id, day, ATT_STATUS[status]);
    else throw new HttpError(400, "Holat noto'g'ri");
    audit(user, 'attendance', `${target.name}: ${day} ${{ present: 'keldi', absent: 'kelmadi', dayoff: 'dam olish', sick: 'kasal', clear: 'belgisiz' }[status]}`);
    events.publish('payroll');
    return { ok: true };
  }

  /*
   * One day at a glance: who came, and for daily workers what they earned that day, what they spent
   * (meals, drinks) and what is left to hand over in the evening. Monthly workers show their whole balance.
   */
  function dayView({ query }) {
    const day = query.day && DAY_RE.test(query.day) ? query.day : today();
    if (day > today()) throw new HttpError(400, "Sana noto'g'ri");
    const users = q("SELECT * FROM users WHERE role != 'owner' AND active = 1 ORDER BY role, name").all();
    const marks = new Map(q('SELECT user_id, source FROM attendance WHERE day = ?').all(day).map((r) => [r.user_id, r.source]));
    const staff = users.map((u) => {
      const a = accrue(u, day, day);
      const e = entrySums(u.id, day, day);
      const rate = rateOn(ratesOf(u.id), day);
      const src = marks.get(u.id);
      const status = !src ? null : src === 'auto' || src === 'manual' ? 'present' : src;
      return {
        id: u.id, name: u.name, role: u.role, status, auto: src === 'auto',
        rate: rate && { pay_type: rate.pay_type, amount: rate.amount, sales_pct: rate.sales_pct },
        earned: a.base + a.pct, spent: e.deduction, fine: e.fine, bonus: e.bonus, paid: e.payment + e.advance,
        day_due: a.base + a.pct + e.bonus - e.fine - e.deduction - e.payment - e.advance,
        balance: balance(u),
      };
    });
    const count = (s) => staff.filter((r) => r.status === s).length;
    return { day, today: today(), staff, counts: { present: count('present'), absent: count('absent'), dayoff: count('dayoff'), sick: count('sick'), unmarked: count(null) } };
  }

  function ledger(userId) {
    const u = q('SELECT * FROM users WHERE id = ?').get(userId);
    const m = today().slice(0, 7);
    const { from, to } = monthRange(m);
    return {
      ...staffRow(u, from, to),
      rates: ratesOf(userId),
      entries: q(`SELECT p.*, c.name created_by_name FROM payroll p LEFT JOIN users c ON c.id = p.created_by
        WHERE p.user_id = ? ORDER BY p.day DESC, p.id DESC LIMIT 200`).all(userId),
    };
  }

  function userLedger({ params }) { getUser(params.id); return ledger(params.id); }

  // Every worker can see their own pay: what was earned, paid, bonuses and fines.
  function myPayroll({ user }) {
    if (user.role === 'owner') return null;
    return ledger(user.id);
  }

  return { markPresent, month, setRate, addEntry, deleteEntry, setAttendance, dayView, userLedger, myPayroll, today };
}

module.exports = { createPayroll, dayOf };
