'use strict';
/*
 * QR menu of one business. Every room has a secret key printed as a QR code: "/q/<tenant>-<key>".
 * - A guest opens it on their phone with no login: the menu with photos, the room, who serves it.
 * - A guest may send an order, call the waiter or ask for the bill. These are only requests:
 *   nothing reaches a check until a waiter or cashier approves it (and may change it first).
 * - Requests nobody answered expire; one QR cannot flood the staff with requests.
 */
const crypto = require('node:crypto');
const { HttpError, str, int } = require('./util');

const KEY_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const ORDER_TTL = 15 * 60 * 1000;
const CALL_TTL = 30 * 60 * 1000;
const MAX_PENDING_ORDERS = 2;
const MAX_LINES = 30;
const STAFF = ['owner', 'admin', 'cashier', 'waiter'];

function newKey() {
  let s = '';
  for (const b of crypto.randomBytes(12)) s += KEY_ABC[b % KEY_ABC.length];
  return s;
}
// "08:30" → minutes since midnight
const hm = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

function createGuest(db, { tenantId, audit, events, now, moduleOn, settings, readOnly, kitchenLoad, openOrder, addItems, orderDetails, placeName }) {
  const q = (sql) => db.prepare(sql);
  const recent = new Map(); // ip -> request times (10 minutes)

  // ---------- Keys ----------
  function ensureKeys() {
    const rows = q("SELECT id FROM rooms WHERE active = 1 AND type != 'soboy' AND qr_token IS NULL").all();
    const set = q('UPDATE rooms SET qr_token = ? WHERE id = ?');
    for (const r of rows) set.run(`${tenantId}-${newKey()}`, r.id);
  }
  function roomByKey(token) {
    const r = q("SELECT * FROM rooms WHERE qr_token = ? AND active = 1 AND type != 'soboy'").get(String(token || ''));
    if (!r) throw new HttpError(404, "Bu QR kod endi ishlamaydi. Ofitsantdan yangisini so'rang");
    return r;
  }

  // ---------- Staff: QR codes to print ----------
  function listQr() {
    ensureKeys();
    return q("SELECT id, number, name, type, section, qr_token FROM rooms WHERE active = 1 AND type != 'soboy' ORDER BY section, CAST(number AS INTEGER), number").all();
  }
  function renewQr({ user, params }) {
    const r = q("SELECT * FROM rooms WHERE id = ? AND active = 1 AND type != 'soboy'").get(params.id);
    if (!r) throw new HttpError(404, 'Xona topilmadi');
    q('UPDATE rooms SET qr_token = ? WHERE id = ?').run(`${tenantId}-${newKey()}`, r.id);
    audit(user, 'qr_renew', r.name);
    return q('SELECT id, number, name, type, section, qr_token FROM rooms WHERE id = ?').get(r.id);
  }

  // ---------- Is ordering open right now? ----------
  function orderState() {
    const s = settings();
    if (!moduleOn('qrorder')) return { can: false, why: 'plan' };
    if (readOnly()) return { can: false, why: 'closed' };
    if (s.qr_order !== '1') return { can: false, why: 'off' };
    const from = hm(s.qr_from); const to = hm(s.qr_to);
    if (from !== null && to !== null && from !== to) {
      const d = new Date(now());
      const m = d.getHours() * 60 + d.getMinutes();
      const open = from < to ? m >= from && m < to : m >= from || m < to;
      if (!open) return { can: false, why: 'hours', from: s.qr_from, to: s.qr_to };
    }
    return { can: true };
  }

  function expire() {
    const t = now();
    const n = q("UPDATE guest_requests SET status = 'expired' WHERE status = 'pending' AND ((kind = 'order' AND created_at < ?) OR (kind != 'order' AND created_at < ?))")
      .run(t - ORDER_TTL, t - CALL_TTL).changes;
    if (n) events.publish('guest', {}, { roles: STAFF });
  }

  function lines(items) {
    const out = [];
    for (const it of items) {
      const d = q('SELECT id, name, price, available FROM dishes WHERE id = ? AND active = 1').get(it.dish_id);
      out.push({ dish_id: it.dish_id, qty: it.qty, note: it.note || '', name: d ? d.name : '?', price: d ? d.price : 0, available: !!(d && d.available) });
    }
    return out;
  }

  // ---------- Guest page ----------
  function info(token, guestId) {
    if (!moduleOn('qrmenu')) throw new HttpError(404, "QR-menyu bu joyda yoqilmagan");
    expire();
    const room = roomByKey(token);
    const s = settings();
    const open = q("SELECT * FROM orders WHERE room_id = ? AND status = 'open'").get(room.id);
    const waiterNames = open
      ? [q('SELECT name FROM users WHERE id = ?').get(open.waiter_id)].filter(Boolean).map((u) => u.name)
      : q('SELECT u.name FROM room_waiters rw JOIN users u ON u.id = rw.user_id WHERE rw.room_id = ? AND u.active = 1 ORDER BY u.name').all(room.id).map((u) => u.name);
    const shift = q('SELECT u.name FROM shifts s JOIN users u ON u.id = s.cashier_id WHERE s.closed_at IS NULL ORDER BY s.opened_at DESC LIMIT 1').get();
    const load = kitchenLoad();
    const categories = q('SELECT id, name, icon, color FROM categories ORDER BY sort, name').all();
    const dishes = q(`SELECT d.id, d.category_id, d.name, d.price, d.unit, d.icon, d.photo, d.description, d.needs_kitchen, d.prep_minutes
      FROM dishes d LEFT JOIN categories c ON c.id = d.category_id
      WHERE d.active = 1 AND d.available = 1 ORDER BY COALESCE(c.sort, 9999), d.name`).all().map((d) => ({
      ...d, photo: d.photo ? `/api/guest/${token}/img/${d.photo}` : null,
      eta_minutes: d.needs_kitchen ? d.prep_minutes + load.extra_minutes : 0,
    }));
    const used = new Set(dishes.map((d) => d.category_id));
    const mine = guestId
      ? q('SELECT id, kind, items, note, status, reason, created_at, decided_at FROM guest_requests WHERE room_id = ? AND guest_id = ? AND created_at > ? ORDER BY id DESC LIMIT 10')
        .all(room.id, guestId, now() - 6 * 3600 * 1000).map((r) => ({ ...r, items: r.kind === 'order' ? lines(JSON.parse(r.items)) : [] }))
      : [];
    let bill = null;
    if (open) {
      const o = orderDetails(open.id);
      bill = { items: o.items.filter((i) => i.status !== 'cancelled').map((i) => ({ name: i.name, qty: i.qty, price: i.price, status: i.status })),
        subtotal: o.subtotal, service_amount: o.service_amount, total: o.total, guests: o.guests };
    }
    return {
      name: s.name, currency: s.currency, logo: s.logo ? `/api/guest/${token}/img/${s.logo}` : null,
      room: { name: placeName({}, room), number: room.number, section: room.section, type: room.type },
      waiters: waiterNames, cashier: shift ? shift.name : null,
      service: { type: s.service_type, pct: Number(s.service_pct) || 0, per_guest: Number(s.service_per_guest) || 0 },
      order: orderState(), categories: categories.filter((c) => used.has(c.id)), dishes, requests: mine, bill,
    };
  }

  function image(token, id) {
    roomByKey(token);
    const s = settings();
    const ok = Number(s.logo) === id || q('SELECT 1 FROM dishes WHERE photo = ? AND active = 1').get(id);
    if (!ok) throw new HttpError(404, 'Topilmadi');
    return q('SELECT mime, data FROM assets WHERE id = ?').get(id) || null;
  }

  function limitIp(ip) {
    const t = now();
    const times = (recent.get(ip) || []).filter((x) => t - x < 10 * 60 * 1000);
    if (times.length >= 12) throw new HttpError(429, "Juda ko'p so'rov. Birozdan keyin urinib ko'ring yoki ofitsantni chaqiring");
    times.push(t); recent.set(ip, times);
    if (recent.size > 5000) for (const [k, v] of recent) if (!v.some((x) => t - x < 10 * 60 * 1000)) recent.delete(k);
  }

  function request(token, body, ip) {
    if (!moduleOn('qrmenu')) throw new HttpError(404, "QR-menyu bu joyda yoqilmagan");
    expire();
    const room = roomByKey(token);
    const st = orderState();
    if (!st.can) {
      throw new HttpError(409, st.why === 'hours' ? `QR orqali buyurtma ${st.from}–${st.to} oralig'ida qabul qilinadi. Ofitsantni chaqiring`
        : "Hozir QR orqali buyurtma qabul qilinmaydi. Ofitsantga ayting");
    }
    const kind = ['order', 'waiter', 'bill'].includes(body.kind) ? body.kind : 'order';
    const guestId = /^[A-Za-z0-9-]{8,40}$/.test(body.guest_id || '') ? body.guest_id : '';
    const t = now();
    if (kind !== 'order') {
      const same = q("SELECT id FROM guest_requests WHERE room_id = ? AND kind = ? AND status = 'pending'").get(room.id, kind);
      if (same) return { ok: true, id: same.id, again: true };
      limitIp(ip);
      const id = Number(q('INSERT INTO guest_requests (room_id, kind, ip, guest_id, created_at) VALUES (?, ?, ?, ?, ?)').run(room.id, kind, String(ip || ''), guestId, t).lastInsertRowid);
      if (kind === 'bill') q("UPDATE orders SET bill_requested = 1 WHERE room_id = ? AND status = 'open'").run(room.id);
      notify(room, kind, id);
      return { ok: true, id };
    }
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'Taom tanlanmagan');
    if (body.items.length > MAX_LINES) throw new HttpError(400, "Bir so'rovda juda ko'p taom");
    const items = [];
    for (const it of body.items) {
      const dishId = int(it.dish_id, 'Taom', { min: 1, required: true });
      const d = q('SELECT id, name, available FROM dishes WHERE id = ? AND active = 1').get(dishId);
      if (!d) throw new HttpError(404, 'Taom topilmadi');
      if (!d.available) throw new HttpError(409, `"${d.name}" tugagan`);
      items.push({ dish_id: dishId, qty: int(it.qty, 'Soni', { min: 1, max: 50, def: 1 }), note: str(it.note, 'Izoh', { max: 120 }) });
    }
    const pending = q("SELECT COUNT(*) c FROM guest_requests WHERE room_id = ? AND kind = 'order' AND status = 'pending'").get(room.id).c;
    if (pending >= MAX_PENDING_ORDERS) throw new HttpError(429, "Oldingi buyurtmangiz hali tasdiqlanmadi. Biroz kuting yoki ofitsantni chaqiring");
    limitIp(ip);
    const id = Number(q('INSERT INTO guest_requests (room_id, kind, items, note, ip, guest_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(room.id, 'order', JSON.stringify(items), str(body.note, 'Izoh', { max: 300 }), String(ip || ''), guestId, t).lastInsertRowid);
    notify(room, 'order', id);
    return { ok: true, id };
  }

  // The room's own waiters (as everywhere, a waiter serves only the rooms given to them), the cashiers and the managers.
  function notify(room, kind, id) {
    const assigned = q('SELECT user_id FROM room_waiters rw JOIN users u ON u.id = rw.user_id WHERE rw.room_id = ? AND u.active = 1').all(room.id).map((r) => r.user_id);
    const data = { id, kind, room: placeName({}, room), room_id: room.id };
    const target = { roles: ['owner', 'admin', 'cashier'], userIds: assigned };
    events.publish('guest_request', data, target);
    events.publish('guest', {}, target);
  }

  // ---------- Staff: answering requests ----------
  function visibleTo(user, roomId) {
    if (user.role !== 'waiter') return true;
    return !!q('SELECT 1 FROM room_waiters WHERE room_id = ? AND user_id = ?').get(roomId, user.id);
  }
  function list({ user }) {
    expire();
    const rows = q(`SELECT g.*, r.name room_name, r.number room_number, r.type room_type, r.section room_section FROM guest_requests g JOIN rooms r ON r.id = g.room_id
      WHERE g.status = 'pending' ORDER BY g.id`).all().filter((g) => visibleTo(user, g.room_id));
    return rows.map(({ ip, items, ...g }) => {
      const its = g.kind === 'order' ? lines(JSON.parse(items)) : [];
      return { ...g, room: placeName({}, { name: g.room_name, number: g.room_number, type: g.room_type }), items: its, total: its.reduce((s, i) => s + i.price * i.qty, 0) };
    });
  }
  function pendingRow(user, id) {
    expire();
    const g = q('SELECT * FROM guest_requests WHERE id = ?').get(id);
    if (!g) throw new HttpError(404, "So'rov topilmadi");
    if (g.status !== 'pending') {
      throw new HttpError(409, g.status === 'expired' ? "So'rov muddati o'tgan (15 daqiqa)" : "Bu so'rovga allaqachon javob berilgan");
    }
    if (!visibleTo(user, g.room_id)) throw new HttpError(403, 'Bu xona sizga biriktirilmagan');
    return g;
  }
  function approve({ user, params, body }) {
    const g = pendingRow(user, params.id);
    const room = q('SELECT * FROM rooms WHERE id = ?').get(g.room_id);
    if (g.kind !== 'order') return done({ user, params });
    // The worker may change the order before it goes to the check (fewer, without a dish that ran out).
    let items = JSON.parse(g.items);
    if (Array.isArray(body.items)) {
      const asked = new Map(items.map((i) => [i.dish_id, i]));
      items = body.items.map((it) => {
        const was = asked.get(Number(it.dish_id));
        if (!was) throw new HttpError(400, "Mehmon so'ramagan taomni bu yerda qo'shib bo'lmaydi");
        return { dish_id: was.dish_id, qty: int(it.qty, 'Soni', { min: 0, max: 50 }), note: was.note };
      }).filter((i) => i.qty > 0);
    }
    if (!items.length) throw new HttpError(400, "Taom qolmadi — so'rovni rad eting");
    const o = openOrder({ user, body: { room_id: room.id } });
    const res = addItems({ user, params: { id: o.id }, body: { items } });
    q("UPDATE guest_requests SET status = 'approved', order_id = ?, decided_by = ?, decided_at = ?, items = ? WHERE id = ?").run(o.id, user.id, now(), JSON.stringify(items), g.id);
    audit(user, 'guest_approve', `${placeName({}, room)}: ${items.length} ta taom (#${o.id})`);
    events.publish('guest', {}, { roles: STAFF });
    return { ok: true, order: res };
  }
  function reject({ user, params, body }) {
    const g = pendingRow(user, params.id);
    const reason = str(body.reason, 'Sabab', { max: 200 });
    q("UPDATE guest_requests SET status = 'rejected', reason = ?, decided_by = ?, decided_at = ? WHERE id = ?").run(reason, user.id, now(), g.id);
    const room = q('SELECT * FROM rooms WHERE id = ?').get(g.room_id);
    audit(user, 'guest_reject', `${placeName({}, room)}${reason ? `: ${reason}` : ''}`);
    events.publish('guest', {}, { roles: STAFF });
    return { ok: true };
  }
  // "I went to the table" for a waiter call or a bill request.
  function done({ user, params }) {
    const g = pendingRow(user, params.id);
    q("UPDATE guest_requests SET status = 'done', decided_by = ?, decided_at = ? WHERE id = ?").run(user.id, now(), g.id);
    events.publish('guest', {}, { roles: STAFF });
    return { ok: true };
  }

  return { info, image, request, listQr, renewQr, list, approve, reject, done };
}

module.exports = { createGuest };
