'use strict';
/*
 * Online booking: a guest opens the business's page (/b/<code>), picks a day, a time and a room, and leaves a name
 * and a phone. It is a request: the boss or the cashier confirms it in the program (it becomes a normal reservation)
 * or refuses it; the guest sees the answer on the same page. Off until the boss turns it on.
 */
const crypto = require('node:crypto');
const { HttpError } = require('./util');
const HOUR = 3600 * 1000;
const NEAR = 3 * HOUR; // a room is taken three hours either side of a reservation
const PER_IP_HOUR = 5;

function createBooking(db, { flag, enabled, now, name, phone, events, telegram, audit, reserve }) {
  db.exec(`CREATE TABLE IF NOT EXISTS booking_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    room_id INTEGER NOT NULL,
    customer TEXT NOT NULL,
    phone TEXT NOT NULL,
    guests INTEGER NOT NULL DEFAULT 1,
    starts_at INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    reply TEXT NOT NULL DEFAULT '',
    reservation_id INTEGER,
    ip TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    decided_at INTEGER
  ); CREATE INDEX IF NOT EXISTS idx_booking_status ON booking_requests(status, starts_at);`);
  const q = (sql) => db.prepare(sql);
  const on = () => enabled() && flag('booking_on');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const text = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (ts) => { const d = new Date(ts); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const phoneUz = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 9 ? `+998${d}` : d.length === 12 && d.startsWith('998') ? `+${d}` : ''; };
  // "2026-11-20" + "19:30" in the server's (the business's) time.
  function at(day, time) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '')); const h = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
    if (!m || !h) throw new HttpError(400, "Kun va vaqtni tanlang");
    const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(h[1]), Number(h[2])).getTime();
    if (!Number.isFinite(ts)) throw new HttpError(400, "Kun va vaqt noto'g'ri");
    return ts;
  }
  const taken = (roomId, ts) => !!q("SELECT 1 FROM reservations WHERE room_id = ? AND status = 'active' AND ABS(starts_at - ?) < ?").get(roomId, ts, NEAR)
    || !!q("SELECT 1 FROM booking_requests WHERE room_id = ? AND status = 'new' AND ABS(starts_at - ?) < ?").get(roomId, ts, NEAR);

  // The guest's page: the place and, for a chosen day and time, which rooms are free.
  function page(query) {
    if (!on()) throw new HttpError(404, "Onlayn bron hozircha yopiq");
    const out = { name: name(), phone: phone(), rooms: null };
    if (query.day && query.time) {
      const ts = at(query.day, query.time);
      out.rooms = q("SELECT id, number, name, capacity, type FROM rooms WHERE active = 1 AND type != 'soboy' ORDER BY CAST(number AS INTEGER), number").all()
        .map((r) => ({ id: r.id, number: r.number, name: r.name, capacity: r.capacity, free: !taken(r.id, ts) }));
      out.past = ts < now() + 30 * 60 * 1000;
    }
    return out;
  }
  function request(body, ip) {
    if (!on()) throw new HttpError(404, "Onlayn bron hozircha yopiq");
    if (body.website) throw new HttpError(400, "So'rov noto'g'ri");
    const ts = at(body.day, body.time);
    if (ts < now() + 30 * 60 * 1000) throw new HttpError(400, "Kamida 30 daqiqa oldin band qilinadi");
    if (ts > now() + 60 * 24 * HOUR) throw new HttpError(400, "60 kundan uzoq vaqtga band qilib bo'lmaydi");
    const room = q("SELECT * FROM rooms WHERE id = ? AND active = 1 AND type != 'soboy'").get(Number(body.room_id) || 0);
    if (!room) throw new HttpError(404, 'Xona topilmadi');
    const customer = text(body.name, 80); const ph = phoneUz(body.phone);
    if (customer.length < 2) throw new HttpError(400, 'Ismingizni yozing');
    if (!ph) throw new HttpError(400, "Telefon raqamingizni yozing (masalan 90 123 45 67)");
    const guests = Math.min(5000, Math.max(1, Number(body.guests) | 0 || 1));
    if (taken(room.id, ts)) throw new HttpError(409, "Bu xona shu vaqtga band. Boshqa xona yoki vaqtni tanlang");
    if (q('SELECT COUNT(*) c FROM booking_requests WHERE ip = ? AND created_at > ?').get(String(ip || ''), now() - HOUR).c >= PER_IP_HOUR) throw new HttpError(429, "Juda ko'p so'rov. Birozdan keyin urinib ko'ring yoki qo'ng'iroq qiling");
    const key = crypto.randomBytes(8).toString('hex');
    const id = Number(q('INSERT INTO booking_requests (key, room_id, customer, phone, guests, starts_at, note, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(key, room.id, customer, ph, guests, ts, text(body.note, 300), String(ip || ''), now()).lastInsertRowid);
    events.publish('booking', { id, customer, room: room.name, at: ts, guests }, { roles: ['owner', 'admin', 'cashier'] });
    events.publish('rooms');
    if (telegram && telegram.alert) telegram.alert([`📅 <b>Yangi onlayn bron so'rovi</b> · <b>${esc(name())}</b>`, `${esc(room.name)} · ${fmt(ts)} · ${guests} kishi`, `${esc(customer)} · ${ph}`, 'Dasturda "Bronlar" bo\'limida tasdiqlang yoki rad eting.'].join('\n'));
    return { key };
  }
  function status(key) {
    const r = q('SELECT b.*, r.name room_name FROM booking_requests b LEFT JOIN rooms r ON r.id = b.room_id WHERE b.key = ?').get(String(key || ''));
    if (!r) throw new HttpError(404, "So'rov topilmadi");
    return { name: name(), phone: phone(), status: r.status, reply: r.reply, room: r.room_name || '', at: r.starts_at, when: `${fmt(r.starts_at).replace(' ', `.${new Date(r.starts_at).getFullYear()}, `)}`, guests: r.guests, customer: r.customer };
  }
  // In the program: the requests waiting for an answer (and the last answered ones).
  function list() {
    const rows = q(`SELECT b.*, r.name room_name, r.number room_number FROM booking_requests b LEFT JOIN rooms r ON r.id = b.room_id
      WHERE b.status = 'new' OR b.decided_at > ? ORDER BY (b.status = 'new') DESC, b.starts_at`).all(now() - 24 * HOUR);
    return { on: on(), available: enabled(), rows: rows.map(({ ip, key, ...x }) => x), waiting: rows.filter((x) => x.status === 'new').length };
  }
  function decide({ user, params, body }) {
    const r = q('SELECT * FROM booking_requests WHERE id = ?').get(params.id);
    if (!r) throw new HttpError(404, "So'rov topilmadi");
    if (r.status !== 'new') throw new HttpError(409, "Bu so'rovga allaqachon javob berilgan");
    const reply = text(body.reply, 200);
    if (body.ok) {
      // It becomes a normal reservation (the usual check that the room is free applies).
      q("UPDATE booking_requests SET status = 'confirming' WHERE id = ?").run(r.id);
      let res;
      try { res = reserve(user, { room_id: r.room_id, customer: r.customer, phone: r.phone, guests: r.guests, starts_at: r.starts_at, note: [r.note, 'onlayn bron'].filter(Boolean).join(' · ') }); }
      catch (e) { q("UPDATE booking_requests SET status = 'new' WHERE id = ?").run(r.id); throw e; }
      q("UPDATE booking_requests SET status = 'confirmed', reply = ?, reservation_id = ?, decided_at = ? WHERE id = ?").run(reply, res.id, now(), r.id);
    } else {
      q("UPDATE booking_requests SET status = 'rejected', reply = ?, decided_at = ? WHERE id = ?").run(reply, now(), r.id);
      audit(user, 'booking_reject', `${r.customer} ${fmt(r.starts_at)}${reply ? ` (${reply})` : ''}`);
    }
    events.publish('rooms');
    return { ok: true };
  }
  return { page, request, status, list, decide, on };
}

module.exports = { createBooking };
