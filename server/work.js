'use strict';
/*
 * Work hours and the business's place on the map. Everything here is switched on by the boss in the settings:
 * - geo_staff:  a cashier, waiter or cook may use the program on their own phone only inside the business
 *               (the phone shows its GPS position; a pass lasts GEO_TTL and is renewed in the background);
 * - att_clock:  "I came" / "I left" with the time; proven by GPS (att_gps), the cash desk's QR code that changes
 *               every 30 seconds (att_qr) and a selfie the boss sees (att_selfie). A shared device in the hall
 *               (the cash desk, the kitchen tablet) is inside already: a PIN sign-in there counts as "I came".
 * When a phone cannot prove it (no GPS indoors, a broken camera), the worker asks and a cashier confirms.
 */
const crypto = require('node:crypto');
const { HttpError, str } = require('./util');
const { dayOf } = require('./payroll');

const MIN = 60 * 1000;
const GEO_TTL = 20 * MIN;
const QR_STEP = 30 * 1000;
const STAFF_ROLES = ['cashier', 'waiter', 'chef'];
const PHOTO_TYPES = ['image/jpeg', 'image/webp', 'image/png'];
// What a worker may still do while not "at work": see who they are, prove it, sign out.
const FREE = /^\/api\/(me|me\/pin|me\/password|logout|geo\/check|work\/(me|in|out))$/;

// Distance in metres between two points on the Earth.
function metres(a, b) {
  const R = 6371000; const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}
function posInput(body) {
  const lat = Number(body && body.lat); const lng = Number(body && body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const acc = Number(body.acc);
  return { lat, lng, acc: Number.isFinite(acc) && acc > 0 ? acc : 0 };
}

function createWork(db, { settings, audit, events, now }) {
  const q = (sql) => db.prepare(sql);
  const today = () => dayOf(now());

  // ---------- The place ----------
  function place(s = settings()) {
    return s.geo_lat != null && s.geo_lng != null ? { lat: s.geo_lat, lng: s.geo_lng, radius: s.geo_radius } : null;
  }
  // Inside when the distance fits the radius; a phone that says its fix is rough gets that much (at most 100 m) more.
  function where(pos, s = settings()) {
    const p = place(s);
    if (!p || !pos) return null;
    const dist = metres(p, pos);
    return { dist, radius: p.radius, ok: dist <= p.radius + Math.min(pos.acc, 100) };
  }

  // ---------- Who is bound by what ----------
  const personal = (user) => !(user.session && user.session.device_id);
  function rules(user, s = settings()) {
    const staff = STAFF_ROLES.includes(user.role) && personal(user);
    return {
      geo: !!(staff && s.geo_staff && place(s)),
      clock: !!(staff && s.att_clock),
      gps: !!(s.att_gps && place(s)), qr: !!s.att_qr, selfie: !!s.att_selfie,
    };
  }
  const openEntry = (userId) => q("SELECT * FROM work_log WHERE user_id = ? AND out_at IS NULL AND status != 'rejected' ORDER BY id DESC LIMIT 1").get(userId);
  const setPass = (token, until) => q('UPDATE sessions SET geo_until = ? WHERE token = ?').run(until, token);
  const endOfDay = () => { const d = new Date(now()); d.setHours(23, 59, 59, 999); return d.getTime(); };

  // Called for every signed-in request: the program stays closed until the worker is "at work" and inside.
  function gate(route, user) {
    if (FREE.test(route.pattern)) return;
    const r = rules(user);
    if (r.clock) {
      const e = openEntry(user.id);
      if (!e) throw new HttpError(403, 'Avval "Ishga keldim" ni bosing', 'clock');
      if (e.status === 'pending') throw new HttpError(403, 'Kassir tasdiqlashini kuting', 'clock');
    }
    if (r.geo && !(user.session.geo_until > now())) throw new HttpError(403, 'Dastur faqat ish joyida ishlaydi. Joylashuv tekshirilmoqda', 'geo');
  }

  function state(user) {
    const s = settings();
    const r = rules(user, s);
    const entries = q('SELECT id, day, in_at, out_at, status, reason FROM work_log WHERE user_id = ? AND day = ? ORDER BY id').all(user.id, today());
    const open = openEntry(user.id);
    return { rules: r, open: open ? { id: open.id, in_at: open.in_at, status: open.status } : null, entries,
      geo_until: user.session ? user.session.geo_until || null : null, radius: s.geo_radius };
  }

  // ---------- GPS pass ----------
  function geoCheck({ user, body, token }) {
    const pos = posInput(body);
    if (!pos) throw new HttpError(400, 'Joylashuv aniqlanmadi');
    const w = where(pos);
    if (!w) return { ok: true, none: true };
    if (w.ok) setPass(token, now() + GEO_TTL);
    else audit(user, 'geo_outside', `${w.dist} m`);
    return { ok: w.ok, dist: w.dist, radius: w.radius };
  }

  // ---------- The cash desk's QR code: a new one every 30 seconds, so a photo of it is useless at home ----------
  function secret() {
    let row = q("SELECT value FROM settings WHERE key = 'att_secret'").get();
    if (!row) {
      q("INSERT OR IGNORE INTO settings (key, value) VALUES ('att_secret', ?)").run(crypto.randomBytes(24).toString('hex'));
      row = q("SELECT value FROM settings WHERE key = 'att_secret'").get();
    }
    return row.value;
  }
  const codeAt = (step) => crypto.createHmac('sha256', secret()).update(String(step)).digest('base64url').slice(0, 12);
  function qrCode() {
    const step = Math.floor(now() / QR_STEP);
    return { text: `FLOWI-ISH:${codeAt(step)}`, next_in: (step + 1) * QR_STEP - now() };
  }
  function qrValid(text) {
    const m = /^FLOWI-ISH:([A-Za-z0-9_-]{12})$/.exec(String(text || '').trim());
    if (!m) return false;
    const step = Math.floor(now() / QR_STEP);
    // The code on the screen now, or one of the two before it (time to walk up and point the camera).
    return [step, step - 1, step - 2].some((x) => crypto.timingSafeEqual(Buffer.from(codeAt(x)), Buffer.from(m[1])));
  }

  function savePhoto(user, data) {
    const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
    if (!m || !PHOTO_TYPES.includes(m[1])) throw new HttpError(400, "Selfi rasmi noto'g'ri");
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 800_000) throw new HttpError(413, 'Rasm juda katta');
    return Number(q('INSERT INTO work_photos (user_id, mime, data, created_at) VALUES (?, ?, ?, ?)').run(user.id, m[1], buf, now()).lastInsertRowid);
  }

  // A day left open (the worker forgot "I left"): closed at their last activity that day.
  function closeStale(userId) {
    for (const e of q("SELECT * FROM work_log WHERE user_id = ? AND out_at IS NULL AND day < ?").all(userId, today())) {
      const seen = q('SELECT MAX(last_seen) t FROM sessions WHERE user_id = ?').get(userId).t;
      const end = new Date(`${e.day}T23:59:59`).getTime();
      const at = seen && seen > e.in_at && seen <= end ? seen : e.in_at;
      q("UPDATE work_log SET out_at = ?, out_how = 'auto', status = CASE WHEN status = 'pending' THEN 'rejected' ELSE status END WHERE id = ?").run(at, e.id);
    }
  }
  function markPresent(userId) {
    q(`INSERT INTO attendance (user_id, day, source) VALUES (?, ?, 'auto')
      ON CONFLICT(user_id, day) DO UPDATE SET source = 'auto' WHERE source IN ('absent', 'dayoff', 'sick')`).run(userId, today());
  }
  const publish = (userId) => {
    events.publish('work', {}, { roles: ['owner', 'admin', 'cashier'], userIds: [userId] });
    events.publish('payroll');
  };

  // ---------- "I came" ----------
  function clockIn({ user, body, token }) {
    const s = settings();
    if (!s.att_clock) throw new HttpError(409, "Ish vaqtini belgilash yoqilmagan");
    closeStale(user.id);
    const open = openEntry(user.id);
    if (open && open.status === 'ok') throw new HttpError(409, 'Siz allaqachon ishdasiz');
    if (open && open.status === 'pending') {
      if (body.ask) return { ...state(user), asked: true };
      q("UPDATE work_log SET status = 'rejected', reason = 'qayta urindi' WHERE id = ?").run(open.id);
    }
    const r = rules(user, s);
    const onDevice = !personal(user);
    const how = []; let dist = null; const fail = [];
    if (onDevice) how.push('device');
    if (!onDevice && r.gps) {
      const w = where(posInput(body), s);
      if (!w) fail.push('gps_none');
      else { dist = w.dist; if (w.ok) how.push('gps'); else fail.push('gps_far'); }
    }
    if (!onDevice && r.qr) { if (qrValid(body.qr)) how.push('qr'); else fail.push('qr'); }
    let photo = null;
    if (body.photo) { photo = savePhoto(user, body.photo); how.push('selfie'); } else if (!onDevice && r.selfie && !body.ask) fail.push('selfie');
    const ask = !!body.ask && !onDevice;
    if (fail.length && !ask) {
      if (photo) q('DELETE FROM work_photos WHERE id = ?').run(photo);
      const f = fail[0];
      throw new HttpError(403, f === 'gps_far' ? `Siz ish joyidan ${dist} m uzoqdasiz. Ichkariga kiring yoki kassir tasdiqlasin`
        : f === 'gps_none' ? "Joylashuv aniqlanmadi. GPS'ni yoqing yoki kassir tasdiqlasin"
          : f === 'qr' ? "QR kod eskirgan yoki noto'g'ri. Kassa ekranidagi kodni qayta skanerlang" : 'Selfi oling', f);
    }
    const reason = ask ? str(body.reason, 'Sabab', { max: 120 }) || fail.map((f) => ({ gps_far: `GPS: ${dist} m`, gps_none: "GPS yo'q", qr: "QR yo'q", selfie: "selfi yo'q" }[f])).join(', ') : (onDevice ? (user.session.device_name || '') : '');
    const id = Number(q(`INSERT INTO work_log (user_id, day, in_at, in_how, in_dist, photo_id, status, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(user.id, today(), now(), how.join('+'), dist, photo, ask ? 'pending' : 'ok', reason).lastInsertRowid);
    if (!ask) {
      markPresent(user.id);
      if (how.includes('gps')) setPass(token, now() + GEO_TTL);
      audit(user, 'work_in', how.join('+') + (dist != null ? ` ${dist} m` : ''));
    } else {
      audit(user, 'work_ask', reason);
      events.publish('work_ask', { id, name: user.name, reason }, { roles: ['owner', 'admin', 'cashier'] });
    }
    publish(user.id);
    return state(user);
  }

  // A shared device in the hall: signing in there with a PIN is "I came" (once a day, until "I left").
  function deviceIn(user, device) {
    const s = settings();
    if (!s.att_clock || !STAFF_ROLES.includes(user.role)) return;
    closeStale(user.id);
    if (openEntry(user.id)) return;
    q("INSERT INTO work_log (user_id, day, in_at, in_how, status, reason) VALUES (?, ?, ?, 'device', 'ok', ?)").run(user.id, today(), now(), device ? device.name : '');
    markPresent(user.id);
    publish(user.id);
  }

  // ---------- "I left" ----------
  function clockOut({ user, body }) {
    const e = openEntry(user.id);
    if (!e || e.status !== 'ok') throw new HttpError(409, 'Siz hali "Ishga keldim" ni bosmagansiz');
    const w = personal(user) ? where(posInput(body)) : null;
    q("UPDATE work_log SET out_at = ?, out_how = ?, out_dist = ? WHERE id = ?").run(now(), personal(user) ? 'self' : 'device', w ? w.dist : null, e.id);
    audit(user, 'work_out', w ? `${w.dist} m` : '');
    publish(user.id);
    return state(user);
  }

  // The cash desk closes for the day: whoever is still "at work" is signed out with that time.
  function shiftClosed() {
    const n = q("UPDATE work_log SET out_at = ?, out_how = 'smena' WHERE out_at IS NULL AND status = 'ok'").run(now()).changes;
    q("UPDATE work_log SET status = 'rejected', reason = 'smena yopildi', out_at = ? WHERE out_at IS NULL AND status = 'pending'").run(now());
    if (n) events.publish('work', {}, { roles: ['owner', 'admin', 'cashier'] });
  }

  // ---------- The boss and the cashier ----------
  function pending() {
    return q(`SELECT w.id, w.user_id, w.in_at, w.reason, w.in_dist, w.photo_id, u.name, u.role FROM work_log w JOIN users u ON u.id = w.user_id
      WHERE w.status = 'pending' AND w.day = ? ORDER BY w.id`).all(today());
  }
  function decide(user, id, ok, reason = '') {
    const e = q('SELECT * FROM work_log WHERE id = ?').get(id);
    if (!e) throw new HttpError(404, 'Topilmadi');
    if (e.status !== 'pending') throw new HttpError(409, 'Bu so\'rovga allaqachon javob berilgan');
    const who = q('SELECT name FROM users WHERE id = ?').get(e.user_id);
    if (ok) {
      q("UPDATE work_log SET status = 'ok', in_how = CASE WHEN in_how = '' THEN 'kassir' ELSE in_how || '+kassir' END, decided_by = ?, decided_at = ? WHERE id = ?").run(user.id, now(), id);
      markPresent(e.user_id);
      // Seen in the hall by the cashier: the phone counts as inside for the rest of the day.
      q('UPDATE sessions SET geo_until = ? WHERE user_id = ?').run(endOfDay(), e.user_id);
    } else {
      q("UPDATE work_log SET status = 'rejected', reason = ?, out_at = ?, decided_by = ?, decided_at = ? WHERE id = ?").run(reason || e.reason, now(), user.id, now(), id);
    }
    audit(user, ok ? 'work_confirm' : 'work_reject', who ? who.name : '');
    publish(e.user_id);
    return { ok: true };
  }
  function approve({ user, params }) { return decide(user, params.id, true); }
  function reject({ user, params, body }) { return decide(user, params.id, false, str(body.reason, 'Sabab', { max: 120 })); }
  function closeByManager({ user, params }) {
    const e = q('SELECT * FROM work_log WHERE id = ?').get(params.id);
    if (!e || e.out_at) throw new HttpError(404, 'Ochiq ish vaqti topilmadi');
    q("UPDATE work_log SET out_at = ?, out_how = 'manager', decided_by = ? WHERE id = ?").run(now(), user.id, e.id);
    audit(user, 'work_close', String(e.id));
    publish(e.user_id);
    return { ok: true };
  }

  const hm = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  // One day: who came when, who left when, how it was proven, late arrivals.
  function log({ query }) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(query.day || '') && query.day <= today() ? query.day : today();
    const s = settings();
    const start = hm(s.work_from);
    const rows = q(`SELECT w.*, u.name, u.role FROM work_log w JOIN users u ON u.id = w.user_id WHERE w.day = ? ORDER BY w.in_at`).all(day);
    const seen = new Set();
    const entries = rows.map((e) => {
      let late = 0;
      if (start !== null && e.status === 'ok' && !seen.has(e.user_id)) {
        const d = new Date(e.in_at);
        late = Math.max(0, d.getHours() * 60 + d.getMinutes() - start);
      }
      if (e.status === 'ok') seen.add(e.user_id);
      const end = e.out_at || (day === today() && e.status === 'ok' ? now() : null);
      return { id: e.id, user_id: e.user_id, name: e.name, role: e.role, in_at: e.in_at, out_at: e.out_at, in_how: e.in_how, out_how: e.out_how,
        in_dist: e.in_dist, out_dist: e.out_dist, status: e.status, reason: e.reason, photo: !!e.photo_id, late,
        minutes: e.status === 'ok' && end ? Math.round((end - e.in_at) / MIN) : 0 };
    });
    return { day, today: today(), entries, work_from: s.work_from || '', clock: !!s.att_clock };
  }
  function photo({ params }) {
    const p = q('SELECT p.mime, p.data FROM work_log w JOIN work_photos p ON p.id = w.photo_id WHERE w.id = ?').get(params.id);
    if (!p) throw new HttpError(404, 'Rasm topilmadi');
    return { data: `data:${p.mime};base64,${Buffer.from(p.data).toString('base64')}` };
  }

  return { gate, state, geoCheck, qrCode, clockIn, clockOut, deviceIn, shiftClosed, pending, approve, reject, closeByManager, log, photo, where, posInput, place };
}

module.exports = { createWork, metres, STAFF_ROLES };
