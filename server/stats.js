'use strict';
/*
 * The detailed report the boss reads every evening:
 * - sales by category and dish (how many, how much, profit where a cost is set);
 * - each worker: checks, guests, sales, discounts, what they cancelled, when they came and left;
 * - one worker's day as a timeline (everything they did, from the action log);
 * - one check's story (who opened, added, cancelled, printed, closed — and when);
 * - cash shifts, and the things worth a second look (a dish taken off after the bill was printed…).
 * Everything can be narrowed to one worker. Old checks work too: the action log has always been written.
 */
const { HttpError } = require('./util');

const HOUR = 3600 * 1000;
const ORDER_ID = /^#(\d+)\b/;
// The actions that make up a worker's day (logins, settings and the like are left out).
const DAY_ACTIONS = ['order_open', 'items_add', 'item_ready', 'item_cancel', 'order_close', 'check_print', 'order_cancel', 'order_transfer',
  'guest_approve', 'guest_reject', 'expense_add', 'income_add', 'shift_open', 'shift_close', 'refund', 'staff_meal', 'work_in', 'work_out',
  'debt_pay', 'stock_receive', 'stock_writeoff', 'pay_payment'];

function createStats(db, { now }) {
  const q = (sql) => db.prepare(sql);
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);

  function range(query) {
    const from = Number(query.from); const to = Number(query.to);
    if (!from || !to || to <= from || to - from > 400 * 24 * HOUR) throw new HttpError(400, "Davr noto'g'ri");
    return { from, to };
  }
  const userInput = (v) => (v ? Number(v) || null : null);

  // Closed checks of a period (optionally one worker's) with their dishes.
  function sales(from, to, userId) {
    const orders = q(`SELECT o.*, r.name room_name, w.name waiter_name, c.name cashier_name FROM orders o JOIN rooms r ON r.id = o.room_id
      JOIN users w ON w.id = o.waiter_id LEFT JOIN users c ON c.id = o.cashier_id
      WHERE o.status = 'closed' AND o.closed_at >= ? AND o.closed_at < ? ${userId ? 'AND o.waiter_id = ?' : ''} ORDER BY o.closed_at`)
      .all(...[from, to, ...(userId ? [userId] : [])]);
    const ids = orders.map((o) => o.id);
    const items = ids.length ? q(`SELECT i.*, d.category_id, c.name category FROM order_items i LEFT JOIN dishes d ON d.id = i.dish_id
      LEFT JOIN categories c ON c.id = d.category_id WHERE i.order_id IN (${ids.join(',')})`).all() : [];
    return { orders, items };
  }

  function summary(orders, items) {
    const live = items.filter((i) => i.status !== 'cancelled');
    const cancelled = items.filter((i) => i.status === 'cancelled');
    const revenue = sum(orders, (o) => o.total);
    // Hall, take-away and delivery are counted apart so a courier's money never mixes with the counter's.
    const kind = (k) => { const os = orders.filter((o) => (o.takeaway ? (o.delivery ? 'delivery' : 'takeaway') : 'hall') === k); return { checks: os.length, revenue: sum(os, (o) => o.total) }; };
    return {
      types: { hall: kind('hall'), takeaway: kind('takeaway'), delivery: kind('delivery') },
      revenue, checks: orders.length, guests: sum(orders, (o) => o.guests), avg: orders.length ? Math.round(revenue / orders.length) : 0,
      service: sum(orders, (o) => o.service_amount), discount: sum(orders, (o) => o.discount),
      cash: sum(orders, (o) => o.paid_cash), card: sum(orders, (o) => o.paid_card), transfer: sum(orders, (o) => o.paid_transfer),
      debt: sum(orders, (o) => o.paid_debt), staff: sum(orders, (o) => o.paid_staff), bonus: sum(orders, (o) => o.bonus_used),
      dishes_qty: sum(live, (i) => i.qty), cancelled_qty: sum(cancelled, (i) => i.qty), cancelled_amount: sum(cancelled, (i) => i.qty * i.price),
    };
  }

  // Category → dishes: how many, how much, and profit where a cost is known.
  function byCategory(items) {
    const cats = new Map();
    for (const i of items.filter((x) => x.status !== 'cancelled')) {
      const key = i.service ? 'srv' : i.category_id || 'none';
      const name = i.service ? 'Xizmatlar' : i.category || 'Boshqa';
      if (!cats.has(key)) cats.set(key, { key, name, qty: 0, revenue: 0, profit: 0, has_cost: false, dishes: new Map() });
      const c = cats.get(key);
      const qty = i.qty - (i.refunded_qty || 0);
      c.qty += qty; c.revenue += i.price * qty;
      if (i.cost) { c.profit += (i.price - i.cost) * qty; c.has_cost = true; }
      const d = c.dishes.get(i.name) || { name: i.name, qty: 0, revenue: 0, profit: 0, has_cost: false };
      d.qty += qty; d.revenue += i.price * qty;
      if (i.cost) { d.profit += (i.price - i.cost) * qty; d.has_cost = true; }
      c.dishes.set(i.name, d);
    }
    return [...cats.values()].map((c) => ({ ...c, dishes: [...c.dishes.values()].sort((a, b) => b.qty - a.qty) })).sort((a, b) => b.revenue - a.revenue);
  }

  const auditIn = (from, to, userId) => q(`SELECT a.*, u.name user_name, u.role user_role FROM audit a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.created_at >= ? AND a.created_at < ? ${userId ? 'AND a.user_id = ?' : ''} ORDER BY a.created_at`).all(...[from, to, ...(userId ? [userId] : [])]);
  const orderOf = (a) => { const m = ORDER_ID.exec(a.details || ''); return m ? Number(m[1]) : null; };

  // Each worker who did something in the period.
  function staff(from, to, orders) {
    const users = q("SELECT id, name, role, app, position FROM users WHERE role != 'owner' OR id IN (SELECT DISTINCT user_id FROM audit WHERE created_at >= ? AND created_at < ?)")
      .all(from, to);
    const audit = auditIn(from, to);
    const work = q("SELECT user_id, MIN(in_at) first_in, MAX(COALESCE(out_at, 0)) last_out, SUM(CASE WHEN out_at IS NULL THEN 1 ELSE 0 END) open_n FROM work_log WHERE status = 'ok' AND in_at >= ? AND in_at < ? GROUP BY user_id")
      .all(from, to);
    const workBy = new Map(work.map((w) => [w.user_id, w]));
    const rows = users.map((u) => {
      const mine = orders.filter((o) => o.waiter_id === u.id);
      const closedByMe = orders.filter((o) => o.cashier_id === u.id);
      const acts = audit.filter((a) => a.user_id === u.id);
      const cancels = acts.filter((a) => a.action === 'item_cancel');
      const w = workBy.get(u.id);
      return {
        id: u.id, name: u.name, role: u.role, app: u.app ?? 1, position: u.position || '',
        checks: mine.length, guests: sum(mine, (o) => o.guests), revenue: sum(mine, (o) => o.total), avg: mine.length ? Math.round(sum(mine, (o) => o.total) / mine.length) : 0,
        discount: sum(mine, (o) => o.discount), closed: closedByMe.length, closed_sum: sum(closedByMe, (o) => o.total),
        cancels: cancels.length, actions: acts.length,
        first_at: acts.length ? acts[0].created_at : null, last_at: acts.length ? acts[acts.length - 1].created_at : null,
        work_in: w ? w.first_in : null, work_out: w && !w.open_n ? w.last_out || null : null,
      };
    }).filter((r) => r.checks || r.closed || r.actions || r.work_in);
    return rows.sort((a, b) => b.revenue - a.revenue || b.closed_sum - a.closed_sum || b.actions - a.actions);
  }

  function shifts(from, to, userId) {
    return q(`SELECT s.*, u.name cashier_name FROM shifts s JOIN users u ON u.id = s.cashier_id
      WHERE s.opened_at < ? AND COALESCE(s.closed_at, ?) >= ? ${userId ? 'AND s.cashier_id = ?' : ''} ORDER BY s.opened_at DESC`)
      .all(...[to, now(), from, ...(userId ? [userId] : [])])
      .map((s) => ({ ...s, diff: s.closed_at != null && s.expected_cash != null ? s.closing_cash - s.expected_cash : null }));
  }

  // Things worth a second look. Each with who, when, which check and how much.
  function suspicious(from, to, userId) {
    const out = [];
    const audit = auditIn(from, to);
    const prints = new Map();
    for (const a of q("SELECT details, created_at FROM audit WHERE action = 'check_print' AND created_at < ? ORDER BY created_at").all(to)) {
      const id = orderOf(a);
      if (id && !prints.has(id)) prints.set(id, a.created_at);
    }
    const priceOf = (orderId, name) => (q("SELECT price FROM order_items WHERE order_id = ? AND name = ? ORDER BY id DESC LIMIT 1").get(orderId, name) || {}).price || 0;
    for (const a of audit.filter((x) => x.action === 'item_cancel')) {
      if (userId && a.user_id !== userId) continue;
      const id = orderOf(a);
      const m = /^#\d+ (.+)×(\d+) \((\w+)\)\s*(.*)$/.exec(a.details || '');
      if (!id || !m) continue;
      const amount = priceOf(id, m[1]) * Number(m[2]);
      const base = { order_id: id, user_id: a.user_id, user: a.user_name, at: a.created_at, amount, text: `${m[1]} ×${m[2]}${m[4] ? ` — ${m[4]}` : ''}` };
      if (prints.has(id) && prints.get(id) < a.created_at) out.push({ ...base, kind: 'after_print', level: 'high' });
      else if (['ready', 'served'].includes(m[3])) out.push({ ...base, kind: 'cooked_cancel', level: 'mid' });
    }
    const where = userId ? 'AND o.waiter_id = ?' : '';
    const ps = [from, to, ...(userId ? [userId] : [])];
    for (const o of q(`SELECT o.*, w.name waiter_name, c.name cashier_name FROM orders o JOIN users w ON w.id = o.waiter_id LEFT JOIN users c ON c.id = o.cashier_id
      WHERE o.status = 'closed' AND o.closed_at >= ? AND o.closed_at < ? ${where}`).all(...ps)) {
      const base = o.subtotal + o.service_amount;
      if (o.discount > 0 && o.discount >= base * 0.1) {
        out.push({ kind: 'discount', level: o.discount >= base * 0.25 ? 'high' : 'mid', order_id: o.id, user_id: o.cashier_id || o.waiter_id, user: o.cashier_name || o.waiter_name,
          at: o.closed_at, amount: o.discount, text: `${Math.round((o.discount / Math.max(1, base)) * 100)}%` });
      }
      if (o.closed_at - o.opened_at > 8 * HOUR) {
        out.push({ kind: 'long_open', level: 'low', order_id: o.id, user_id: o.waiter_id, user: o.waiter_name, at: o.closed_at, amount: o.total,
          text: `${Math.round((o.closed_at - o.opened_at) / HOUR)} soat` });
      }
    }
    for (const o of q(`SELECT o.*, w.name waiter_name FROM orders o JOIN users w ON w.id = o.waiter_id WHERE o.status = 'cancelled' AND o.closed_at >= ? AND o.closed_at < ? ${where}`).all(...ps)) {
      const sent = q("SELECT COALESCE(SUM(qty * price), 0) s FROM order_items WHERE order_id = ?").get(o.id).s;
      if (sent > 0) out.push({ kind: 'order_cancel', level: 'high', order_id: o.id, user_id: o.waiter_id, user: o.waiter_name, at: o.closed_at, amount: sent, text: o.cancel_reason || '' });
    }
    for (const s of shifts(from, to, userId)) {
      if (s.diff != null && s.diff < 0) out.push({ kind: 'shortage', level: 'high', order_id: null, user_id: s.cashier_id, user: s.cashier_name, at: s.closed_at, amount: -s.diff, text: `#${s.id}` });
    }
    const rank = { high: 0, mid: 1, low: 2 };
    return out.sort((a, b) => rank[a.level] - rank[b.level] || b.at - a.at);
  }

  // ---------- Handlers ----------
  // Checks deleted with dishes on them (the guest left): what was on each, who wrote it, who deleted it and why.
  function deleted(from, to, userId) {
    const rows = q(`SELECT o.id, o.closed_at, o.opened_at, o.cancel_reason reason, o.cancel_total total, o.waiter_id, o.cancelled_by,
        r.name room_name, w.name waiter_name, d.name deleted_by
      FROM orders o JOIN rooms r ON r.id = o.room_id JOIN users w ON w.id = o.waiter_id LEFT JOIN users d ON d.id = o.cancelled_by
      WHERE o.status = 'cancelled' AND o.cancel_total > 0 AND o.closed_at >= ? AND o.closed_at < ?
      ${userId ? 'AND (o.waiter_id = ? OR o.cancelled_by = ?)' : ''} ORDER BY o.closed_at DESC`).all(from, to, ...(userId ? [userId, userId] : []));
    const items = rows.length ? q(`SELECT order_id, name, qty, price FROM order_items WHERE order_id IN (${rows.map(() => '?').join(',')}) ORDER BY id`).all(...rows.map((r) => r.id)) : [];
    for (const r of rows) r.items = items.filter((i) => i.order_id === r.id).map(({ name, qty, price }) => ({ name, qty, price }));
    return { count: rows.length, total: rows.reduce((s, r) => s + r.total, 0), rows };
  }

  function overview({ query }) {
    const { from, to } = range(query);
    const userId = userInput(query.user);
    const cur = sales(from, to, userId);
    const prev = sales(from - (to - from), from, userId);
    const all = userId ? sales(from, to, null) : cur;
    const sus = suspicious(from, to, userId);
    return {
      from, to, user: userId ? q('SELECT id, name, role, position, app FROM users WHERE id = ?').get(userId) || null : null,
      summary: summary(cur.orders, cur.items), prev: summary(prev.orders, prev.items),
      categories: byCategory(cur.items),
      staff: staff(from, to, all.orders).filter((r) => !userId || r.id === userId),
      shifts: shifts(from, to, userId),
      suspicious: sus, suspicious_count: sus.filter((x) => x.level !== 'low').length,
      deleted: deleted(from, to, userId),
    };
  }

  // One worker's day: everything they did, their checks and what they sold.
  function person({ params, query }) {
    const { from, to } = range(query);
    const u = q('SELECT id, name, role, position, app FROM users WHERE id = ?').get(params.id);
    if (!u) throw new HttpError(404, 'Xodim topilmadi');
    const s = sales(from, to, u.id);
    const closed = q(`SELECT o.id, o.total, o.closed_at, r.name room_name, w.name waiter_name FROM orders o JOIN rooms r ON r.id = o.room_id JOIN users w ON w.id = o.waiter_id
      WHERE o.status = 'closed' AND o.cashier_id = ? AND o.closed_at >= ? AND o.closed_at < ? ORDER BY o.closed_at`).all(u.id, from, to);
    const timeline = auditIn(from, to, u.id).filter((a) => DAY_ACTIONS.includes(a.action))
      .map((a) => ({ at: a.created_at, action: a.action, details: a.details, order_id: orderOf(a) }));
    for (const w of q("SELECT * FROM work_log WHERE user_id = ? AND status = 'ok' AND in_at >= ? AND in_at < ?").all(u.id, from, to)) {
      if (!timeline.some((x) => x.action === 'work_in' && Math.abs(x.at - w.in_at) < 5000)) timeline.push({ at: w.in_at, action: 'work_in', details: w.in_how || '', order_id: null });
      if (w.out_at && !timeline.some((x) => x.action === 'work_out' && Math.abs(x.at - w.out_at) < 5000)) timeline.push({ at: w.out_at, action: 'work_out', details: w.out_how || '', order_id: null });
    }
    timeline.sort((a, b) => a.at - b.at);
    return {
      from, to, user: u, summary: summary(s.orders, s.items), categories: byCategory(s.items), timeline,
      checks: s.orders.map((o) => ({ id: o.id, room_name: o.room_name, opened_at: o.opened_at, closed_at: o.closed_at, guests: o.guests, total: o.total, discount: o.discount, cashier_name: o.cashier_name })),
      closed, suspicious: suspicious(from, to, u.id),
    };
  }

  // One check's story, from opening to payment.
  function orderStory({ params }) {
    const o = q(`SELECT o.*, r.name room_name, w.name waiter_name, c.name cashier_name FROM orders o JOIN rooms r ON r.id = o.room_id
      JOIN users w ON w.id = o.waiter_id LEFT JOIN users c ON c.id = o.cashier_id WHERE o.id = ?`).get(params.id);
    if (!o) throw new HttpError(404, 'Chek topilmadi');
    const ev = q(`SELECT a.action, a.details, a.created_at at, u.name user_name FROM audit a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.created_at >= ? AND (a.details LIKE ? OR a.details LIKE ? OR a.details LIKE ? OR a.details = ?) ORDER BY a.created_at`)
      .all(o.opened_at - 60000, `#${o.id} %`, `#${o.id}:%`, `#${o.id} (%`, `#${o.id}`)
      .filter((a) => orderOf(a) === o.id)
      .map((a) => ({ at: a.at, action: a.action, details: a.details, user: a.user_name }));
    for (const i of q('SELECT i.*, u.name chef_name FROM order_items i LEFT JOIN users u ON u.id = i.chef_id WHERE i.order_id = ?').all(o.id)) {
      if (i.accepted_at) ev.push({ at: i.accepted_at, action: 'kitchen_accept', details: `${i.name}×${i.qty}`, user: i.chef_name || '' });
      if (i.served_at) ev.push({ at: i.served_at, action: 'item_served', details: `${i.name}×${i.qty}`, user: '' });
    }
    if (!ev.some((e) => e.action === 'order_open')) ev.push({ at: o.opened_at, action: 'order_open', details: o.room_name, user: o.waiter_name });
    // Steps written in the same second keep their natural order (opened → added → kitchen → served → printed → closed).
    const step = { order_open: 0, items_add: 1, kitchen_accept: 2, item_ready: 3, item_served: 4, item_cancel: 5, check_print: 5, order_transfer: 5, order_close: 8, order_cancel: 8 };
    const key = (e) => Math.floor(e.at / 1000) * 10 + (step[e.action] ?? 5);
    ev.sort((a, b) => key(a) - key(b) || a.at - b.at);
    return { order: { id: o.id, room_name: o.room_name, waiter_name: o.waiter_name, cashier_name: o.cashier_name, opened_at: o.opened_at, closed_at: o.closed_at,
      status: o.status, total: o.total, guests: o.guests, discount: o.discount }, events: ev };
  }

  return { overview, person, orderStory, deleted };
}

module.exports = { createStats };
