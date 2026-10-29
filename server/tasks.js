'use strict';
/*
 * Tasks ("Ishlar") of one business: what has to be done today, so nothing is forgotten.
 * - Written by hand: once, or repeating every day / week / month ("1st of the month — rent").
 *   A repeating task with an amount and an expense category is a fixed monthly expense:
 *   ticking it writes the expense down.
 * - Written by the program: a delivery or installation date, a customer's debt due, a supplier to pay.
 *   These close by themselves when the job is done or the debt is paid.
 * - A task given to a worker is seen by that worker and the managers; one without a worker, by the managers.
 */
const { HttpError, str, int } = require('./util');

const DAY = 24 * 3600 * 1000;
const REPEATS = ['none', 'daily', 'weekly', 'monthly'];
const MANAGERS = ['owner', 'admin'];
const METHODS = ['cash', 'card', 'transfer'];

const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function nextDue(due, repeat) {
  const d = new Date(due);
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return d.getTime();
}

// "2026-10-29" + "14:30" → a timestamp; no time = start of that day.
function dueInput(date, time, at) {
  // The phone sends the moment it means (its own time zone); the date and time are the fallback.
  if (Number.isFinite(Number(at)) && Number(at) > 0 && date) {
    return { due_at: Number(at), has_time: /^([01]?\d|2[0-3]):([0-5]\d)$/.test(String(time || '')) ? 1 : 0 };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!m) throw new HttpError(400, 'Sanani tanlang');
  const tm = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(time || ''));
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), tm ? Number(tm[1]) : 0, tm ? Number(tm[2]) : 0);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "Sana noto'g'ri");
  return { due_at: d.getTime(), has_time: tm ? 1 : 0 };
}

function createTasks(db, { audit, events, now, settings }) {
  const q = (sql) => db.prepare(sql);
  const publish = () => events.publish('tasks', {}, {});

  // Tasks the program writes; one open task per subject (a new date replaces the old one).
  function upsertAuto({ ref, title, due_at, has_time = 0, note = '', assignee_id = null, amount = 0 }) {
    const open = q('SELECT id FROM tasks WHERE ref = ? AND done_at IS NULL').get(ref);
    if (open) {
      q('UPDATE tasks SET title = ?, due_at = ?, has_time = ?, note = ?, amount = ?, reminded_at = NULL WHERE id = ?').run(title, due_at, has_time, note, amount, open.id);
      return open.id;
    }
    const id = q(`INSERT INTO tasks (title, note, due_at, has_time, assignee_id, ref, amount, auto, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .run(title, note, due_at, has_time, assignee_id, ref, amount, now()).lastInsertRowid;
    publish();
    return Number(id);
  }
  function closeAuto(ref, userId = null) {
    const n = q('UPDATE tasks SET done_at = ?, done_by = ? WHERE ref = ? AND done_at IS NULL').run(now(), userId, ref).changes;
    if (n) publish();
  }

  // Program-made tasks whose subject is settled close by themselves.
  function settle() {
    const open = q("SELECT id, ref FROM tasks WHERE done_at IS NULL AND auto = 1 AND ref != ''").all();
    const close = q('UPDATE tasks SET done_at = ? WHERE id = ?');
    for (const t of open) {
      const [kind, id] = t.ref.split(':');
      let settled = false;
      if (kind === 'debt') settled = !(q('SELECT debt FROM customers WHERE id = ?').get(Number(id)) || { debt: 0 }).debt;
      else if (kind === 'job') settled = (q('SELECT status FROM jobs WHERE id = ?').get(Number(id)) || { status: 'done' }).status !== 'planned';
      else if (kind === 'supplier') settled = supplierDebt(Number(id)) <= 0;
      if (settled) close.run(now(), t.id);
    }
  }
  function supplierDebt(id) {
    return q("SELECT COALESCE(SUM(CASE WHEN kind = 'payment' THEN -amount ELSE amount END), 0) d FROM supplier_moves WHERE supplier_id = ?").get(id).d;
  }

  const visible = (user) => (MANAGERS.includes(user.role) ? '' : ` AND assignee_id = ${Number(user.id)}`);
  function withNames(rows) {
    const names = new Map(q('SELECT id, name FROM users').all().map((u) => [u.id, u.name]));
    return rows.map((t) => ({ ...t, assignee: t.assignee_id ? names.get(t.assignee_id) || '' : '', done_by_name: t.done_by ? names.get(t.done_by) || '' : '' }));
  }

  // Overdue, today, the next week; and what was done today.
  function list({ user, query }) {
    settle();
    const today = startOfDay(now());
    const days = int(query.days, 'Kunlar', { min: 1, max: 62, def: 7 });
    const v = visible(user);
    const open = q(`SELECT * FROM tasks WHERE done_at IS NULL AND due_at < ?${v} ORDER BY due_at, id`).all(today + days * DAY);
    const done = q(`SELECT * FROM tasks WHERE done_at >= ?${v} ORDER BY done_at DESC LIMIT 50`).all(today);
    const all = withNames(open);
    return {
      overdue: all.filter((t) => t.due_at < today),
      today: all.filter((t) => t.due_at >= today && t.due_at < today + DAY),
      upcoming: all.filter((t) => t.due_at >= today + DAY),
      done: withNames(done),
      categories: settings().expense_categories,
    };
  }

  function input(body, prev = {}) {
    const title = str(body.title ?? prev.title, 'Ish', { required: true, max: 160 });
    const due = body.date !== undefined ? dueInput(body.date, body.time, body.at) : { due_at: prev.due_at, has_time: prev.has_time };
    const repeat = REPEATS.includes(body.repeat) ? body.repeat : prev.repeat || 'none';
    const amount = body.amount !== undefined ? int(body.amount, 'Summa', { max: 10_000_000_000 }) : prev.amount || 0;
    const category = body.category !== undefined ? str(body.category, 'Kategoriya', { max: 60 }) : prev.category || '';
    if (amount && !category) throw new HttpError(400, 'Xarajat turini tanlang');
    let assignee = body.assignee_id !== undefined ? body.assignee_id : prev.assignee_id;
    assignee = assignee ? int(assignee, 'Xodim', { min: 1 }) : null;
    if (assignee && !q('SELECT 1 FROM users WHERE id = ? AND active = 1').get(assignee)) throw new HttpError(404, 'Xodim topilmadi');
    return { title, note: str(body.note ?? prev.note, 'Izoh', { max: 500 }), ...due, repeat, amount, category, assignee_id: assignee };
  }
  function create({ user, body }) {
    const t = input(body);
    const id = q(`INSERT INTO tasks (title, note, due_at, has_time, repeat, assignee_id, amount, category, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(t.title, t.note, t.due_at, t.has_time, t.repeat, t.assignee_id, t.amount, t.category, user.id, now()).lastInsertRowid;
    audit(user, 'task_create', t.title);
    publish();
    return q('SELECT * FROM tasks WHERE id = ?').get(id);
  }
  function row(user, id) {
    const t = q('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!t) throw new HttpError(404, 'Ish topilmadi');
    if (!MANAGERS.includes(user.role) && t.assignee_id !== user.id) throw new HttpError(403, 'Bu ish sizga tegishli emas');
    return t;
  }
  function update({ user, params, body }) {
    const prev = row(user, params.id);
    if (!MANAGERS.includes(user.role)) throw new HttpError(403, "Ishni faqat boshliq o'zgartiradi");
    const t = input(body, prev);
    q('UPDATE tasks SET title = ?, note = ?, due_at = ?, has_time = ?, repeat = ?, assignee_id = ?, amount = ?, category = ?, reminded_at = NULL WHERE id = ?')
      .run(t.title, t.note, t.due_at, t.has_time, t.repeat, t.assignee_id, t.amount, t.category, prev.id);
    publish();
    return q('SELECT * FROM tasks WHERE id = ?').get(prev.id);
  }
  function remove({ user, params }) {
    const t = row(user, params.id);
    if (!MANAGERS.includes(user.role)) throw new HttpError(403, "Ishni faqat boshliq o'chiradi");
    q('DELETE FROM tasks WHERE id = ?').run(t.id);
    audit(user, 'task_delete', t.title);
    publish();
    return { ok: true };
  }

  // Ticking a task: a fixed expense is written down; a repeating task comes back on its next date.
  function done({ user, params, body }, hooks = {}) {
    const t = row(user, params.id);
    if (t.done_at) throw new HttpError(409, 'Bu ish allaqachon bajarilgan');
    db.exec('BEGIN');
    try {
      let txId = null;
      const amount = body.amount !== undefined && body.amount !== '' ? int(body.amount, 'Summa', { max: 10_000_000_000 }) : t.amount;
      if (t.category && amount > 0) {
        if (!['owner', 'admin', 'cashier'].includes(user.role)) throw new HttpError(403, "Xarajatni faqat boshliq yoki kassir yozadi");
        const method = METHODS.includes(body.method) ? body.method : 'cash';
        txId = Number(q("INSERT INTO transactions (type, category, amount, method, note, user_id, created_at) VALUES ('expense', ?, ?, ?, ?, ?, ?)")
          .run(t.category, amount, method, t.title, user.id, now()).lastInsertRowid);
      }
      q('UPDATE tasks SET done_at = ?, done_by = ? WHERE id = ?').run(now(), user.id, t.id);
      if (t.repeat !== 'none') {
        // Next time from the planned date (not from today), so "1st of the month" stays the 1st.
        let due = nextDue(t.due_at, t.repeat);
        while (due < startOfDay(now())) due = nextDue(due, t.repeat);
        q(`INSERT INTO tasks (title, note, due_at, has_time, repeat, assignee_id, amount, category, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(t.title, t.note, due, t.has_time, t.repeat, t.assignee_id, t.amount, t.category, t.created_by, now());
      }
      if (hooks.onDone) hooks.onDone(t, user);
      db.exec('COMMIT');
      if (txId) events.publish('finance');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    audit(user, 'task_done', t.title);
    publish();
    return { ok: true };
  }
  function undo({ user, params }) {
    const t = row(user, params.id);
    if (!t.done_at) return { ok: true };
    if (t.category && t.amount) throw new HttpError(400, "Xarajat yozilgan ishni qaytarib bo'lmaydi — Kirim-chiqim bo'limidan o'chiring");
    q('UPDATE tasks SET done_at = NULL, done_by = NULL WHERE id = ?').run(t.id);
    publish();
    return { ok: true };
  }

  // ---------- For the Telegram reminders ----------
  function digest() {
    settle();
    const today = startOfDay(now());
    const rows = q('SELECT * FROM tasks WHERE done_at IS NULL AND due_at < ? ORDER BY due_at').all(today + DAY);
    return { overdue: rows.filter((t) => t.due_at < today), today: rows.filter((t) => t.due_at >= today) };
  }
  // Tasks with a time that start within the hour, each told once.
  function dueSoon() {
    const t = now();
    const rows = q('SELECT * FROM tasks WHERE done_at IS NULL AND has_time = 1 AND reminded_at IS NULL AND due_at > ? AND due_at <= ?').all(t - 10 * 60 * 1000, t + 60 * 60 * 1000);
    const mark = q('UPDATE tasks SET reminded_at = ? WHERE id = ?');
    for (const r of rows) mark.run(t, r.id);
    return rows;
  }

  return { list, create, update, remove, done, undo, upsertAuto, closeAuto, settle, digest, dueSoon, startOfDay, dayKey };
}

module.exports = { createTasks, startOfDay, dayKey, nextDue };
