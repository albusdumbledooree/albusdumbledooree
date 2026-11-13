'use strict';
/*
 * Two things printed at the foot of a guest's check as QR codes, each switched on by the boss in the settings:
 *  - "rate us": the guest gives 1–5 stars and a few words; a low mark goes to the boss's Telegram at once;
 *  - "pay by phone": a Payme / Click link with the sum already in it (the cashier sees the money arrive in the
 *    bank's own app and closes the check — the program is not told by the bank).
 */
const crypto = require('node:crypto');
const { HttpError } = require('./util');
const DAY = 24 * 3600 * 1000;
const RATE_DAYS = 7;

function createRating(db, { raw, flag, enabled, code, now, telegram, name, placeOf, money }) {
  const q = (sql) => db.prepare(sql);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rateOn = () => enabled() && flag('rating_on');

  // The sum goes into the link in tiyin for Payme (×100) and in so'm for Click.
  function payLinks(order, total) {
    const out = {};
    if (!(total > 0) || order.status === 'cancelled') return out;
    const pm = String(raw('pay_payme_id') || '').trim();
    if (flag('pay_payme_on') && pm) {
      const field = String(raw('pay_payme_field') || 'order_id').replace(/[^\w]/g, '') || 'order_id';
      out.payme = `https://checkout.paycom.uz/${Buffer.from(`m=${pm};ac.${field}=${order.id};a=${Math.round(total * 100)}`).toString('base64')}`;
    }
    const cs = String(raw('pay_click_service') || '').trim(); const cm = String(raw('pay_click_merchant') || '').trim();
    if (flag('pay_click_on') && cs && cm) {
      out.click = `https://my.click.uz/services/pay?service_id=${encodeURIComponent(cs)}&merchant_id=${encodeURIComponent(cm)}&amount=${Math.round(total)}&transaction_param=${order.id}`;
    }
    return out;
  }
  // What the check carries: the address of the rating page (its key made once) and the payment links.
  function extras(order, total) {
    const out = { pay: payLinks(order, total) };
    if (rateOn() && order.status !== 'cancelled') {
      let key = order.rate_key;
      if (!key) { key = crypto.randomBytes(6).toString('hex'); q('UPDATE orders SET rate_key = ? WHERE id = ?').run(key, order.id); }
      out.rate_path = `/r/${code()}/${order.id}-${key}`;
    }
    return out;
  }
  function find(k) {
    const m = /^(\d+)-([0-9a-f]{12})$/.exec(String(k || ''));
    const o = m && q('SELECT * FROM orders WHERE id = ? AND rate_key = ?').get(Number(m[1]), m[2]);
    if (!o || !rateOn()) throw new HttpError(404, "Bu havola endi ishlamaydi");
    return o;
  }
  // The guest's page: whose place it is and whether this check was already rated.
  function info(k) {
    const o = find(k);
    const r = q('SELECT stars FROM order_ratings WHERE order_id = ?').get(o.id);
    const late = now() - (o.closed_at || o.opened_at) > RATE_DAYS * DAY;
    return { name: name(), done: !!r, stars: r ? r.stars : 0, closed: late };
  }
  function submit(k, body) {
    const o = find(k);
    if (now() - (o.closed_at || o.opened_at) > RATE_DAYS * DAY) throw new HttpError(400, 'Baholash muddati tugagan');
    if (q('SELECT 1 FROM order_ratings WHERE order_id = ?').get(o.id)) throw new HttpError(409, 'Bu chek allaqachon baholangan. Rahmat!');
    const stars = Number(body.stars) | 0;
    if (stars < 1 || stars > 5) throw new HttpError(400, 'Bahoni tanlang (1–5 yulduz)');
    const comment = String(body.comment || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    q('INSERT INTO order_ratings (order_id, waiter_id, stars, comment, created_at) VALUES (?, ?, ?, ?, ?)').run(o.id, o.waiter_id, stars, comment, now());
    if (stars <= 3 && telegram && telegram.alert) {
      const w = q('SELECT name FROM users WHERE id = ?').get(o.waiter_id);
      telegram.alert([`${'⭐'.repeat(stars)} <b>Past baho: ${stars}/5</b> · <b>${esc(name())}</b>`, `${esc(placeOf(o))} · chek #${o.id}${w ? ` · ${esc(w.name)}` : ''}${o.total ? ` · ${money(o.total)} so'm` : ''}`,
        comment ? `"${esc(comment)}"` : 'Izoh yozilmagan'].join('\n'));
    }
    return { ok: true, stars };
  }
  // For the boss: the average, each waiter's, and the latest marks with their words.
  function list({ query }) {
    const from = Number(query.from) || now() - 30 * DAY; const to = Number(query.to) || now() + DAY;
    const all = q('SELECT COUNT(*) n, AVG(stars) avg, SUM(stars <= 3) low FROM order_ratings WHERE created_at >= ? AND created_at < ?').get(from, to);
    const dist = [5, 4, 3, 2, 1].map((s) => ({ stars: s, n: q('SELECT COUNT(*) n FROM order_ratings WHERE stars = ? AND created_at >= ? AND created_at < ?').get(s, from, to).n }));
    const waiters = q(`SELECT u.id, u.name, COUNT(*) n, AVG(r.stars) avg, SUM(r.stars <= 3) low FROM order_ratings r JOIN users u ON u.id = r.waiter_id
      WHERE r.created_at >= ? AND r.created_at < ? GROUP BY u.id ORDER BY avg DESC, n DESC`).all(from, to).map((w) => ({ ...w, avg: Math.round(w.avg * 10) / 10 }));
    const rows = q(`SELECT r.order_id, r.stars, r.comment, r.created_at, u.name waiter, o.total, o.room_id, o.takeaway, o.delivery, o.label, o.id FROM order_ratings r
      JOIN orders o ON o.id = r.order_id LEFT JOIN users u ON u.id = r.waiter_id WHERE r.created_at >= ? AND r.created_at < ? ORDER BY r.created_at DESC LIMIT 100`).all(from, to)
      .map((r) => ({ order_id: r.order_id, stars: r.stars, comment: r.comment, created_at: r.created_at, waiter: r.waiter, total: r.total, place: placeOf(r) }));
    return { on: rateOn(), count: all.n, avg: all.n ? Math.round(all.avg * 10) / 10 : 0, low: all.low || 0, dist, waiters, rows };
  }
  return { extras, info, submit, list, rateOn };
}

module.exports = { createRating };
