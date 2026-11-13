'use strict';
/*
 * What the boss wants to hear about at once, in Telegram: one worker cancelling a lot, a big discount, a deleted check,
 * a check left open for hours, a cash difference at the end of a shift. The boss sets each limit (0 or off = no message).
 * Works when the business has Telegram linked and the "alerts" section is in its plan.
 */
const DEFAULTS = { alert_on: '1', alert_cancel_n: '5', alert_discount_pct: '15', alert_delete: '1', alert_open_hours: '4', alert_shift_diff: '50000' };
const HOUR = 3600 * 1000;

function createAlerts(db, { raw, telegram, enabled, now, startOfDay, money, name }) {
  const q = (sql) => db.prepare(sql);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const cfg = () => {
    const get = (k) => { const v = raw(k); return v === undefined || v === null || v === '' ? DEFAULTS[k] : v; };
    return { on: get('alert_on') === '1', cancel_n: Number(get('alert_cancel_n')) || 0, discount_pct: Number(get('alert_discount_pct')) || 0,
      del: get('alert_delete') === '1', open_hours: Number(get('alert_open_hours')) || 0, shift_diff: Number(get('alert_shift_diff')) || 0 };
  };
  const live = () => !!telegram && !!telegram.alert && enabled() && cfg().on;
  const send = (title, lines) => { try { telegram.alert([`${title} · <b>${esc(name())}</b>`, ...lines].join('\n')); } catch (e) { console.error('alert', e.message); } };
  const hm = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  return {
    DEFAULTS,
    config: cfg,
    // A dish taken off a check: a message the moment this worker's count for today passes the limit.
    itemCancelled(user, qty) {
      const c = cfg();
      if (!live() || !c.cancel_n) return;
      const r = q('SELECT COALESCE(SUM(qty), 0) n, COALESCE(SUM(qty * price), 0) s FROM order_items WHERE cancelled_by = ? AND cancelled_at >= ?').get(user.id, startOfDay(now()));
      if (r.n >= c.cancel_n && r.n - qty < c.cancel_n) {
        send("⚠️ Ko'p bekor qilish", [`<b>${esc(user.name)}</b> bugun ${r.n} ta taomni bekor qildi (chegara: ${c.cancel_n}).`, `Jami: <b>${money(r.s)} so'm</b>`, 'Batafsil: Sozlamalar → Amallar tarixi']);
      }
    },
    // A whole check with dishes on it thrown away.
    orderDeleted(user, place, total, reason) {
      if (!live() || !cfg().del || !(total > 0)) return;
      send("🗑 Chek o'chirildi", [`${esc(place)} · <b>${money(total)} so'm</b> · ${esc(user.name)} · ${hm(now())}`, reason ? `Sabab: "${esc(reason)}"` : 'Sabab yozilmagan']);
    },
    // A discount typed in at payment (a customer's bonus is not one).
    discount(user, place, amount, before) {
      const c = cfg();
      if (!live() || !c.discount_pct || !(amount > 0) || !(before > 0)) return;
      const pct = Math.round((amount / before) * 100);
      if (pct >= c.discount_pct) send('💸 Katta chegirma', [`${esc(place)} · <b>${pct}%</b> (${money(amount)} so'm) · ${esc(user.name)} · ${hm(now())}`, `Chek: ${money(before)} → ${money(before - amount)} so'm`]);
    },
    shiftClosed(user, expected, actual) {
      const c = cfg();
      const diff = actual - expected;
      if (!live() || !c.shift_diff || Math.abs(diff) < c.shift_diff) return;
      send('💰 Kassa farqi', [`Smena yopildi: <b>${money(Math.abs(diff))} so'm ${diff < 0 ? 'kam' : "ko'p"}</b> · ${esc(user.name)}`, `Kutilgan: ${money(expected)} · Kassada: ${money(actual)}`]);
    },
    // Checks open longer than the limit: one message per check (asked every few minutes by the platform's clock).
    openTick(placeOf) {
      const c = cfg();
      if (!live() || !c.open_hours) return;
      const rows = q("SELECT * FROM orders WHERE status = 'open' AND alerted_open = 0 AND opened_at < ?").all(now() - c.open_hours * HOUR);
      for (const o of rows) {
        q('UPDATE orders SET alerted_open = 1 WHERE id = ?').run(o.id);
        const sum = q("SELECT COALESCE(SUM(qty * price), 0) s FROM order_items WHERE order_id = ? AND status != 'cancelled'").get(o.id).s;
        const w = q('SELECT name FROM users WHERE id = ?').get(o.waiter_id);
        send('⏰ Ochiq qolgan chek', [`${esc(placeOf(o))} ${Math.floor((now() - o.opened_at) / HOUR)} soatdan beri ochiq · <b>${money(sum)} so'm</b>${w ? ` · ${esc(w.name)}` : ''}`]);
      }
    },
  };
}

module.exports = { createAlerts, ALERT_DEFAULTS: DEFAULTS };
