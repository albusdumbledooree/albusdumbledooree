'use strict';
/*
 * Shop bookkeeping (made for a door shop, used by every shop type):
 * - suppliers and "Mol keldi": goods arrive with a freight bill; the freight is spread over the goods by value,
 *   so each item's cost is what it really cost us (a running average over the batches);
 *   what was not paid is a debt to the supplier;
 * - goods leaving outside sales: damaged (written off), counted (shortage or surplus), brought back;
 * - services on a sale: installation, delivery — what the customer pays and what the worker gets;
 *   each becomes a job with a date (and a task), the worker is paid later;
 * - the profit report: sales − cost of the goods sold − workers − damage − running costs = net profit.
 * Money paid for goods, to suppliers and to workers is bookkeeping of stock and debts, not a running cost,
 * so the profit report leaves it out (the goods' cost is counted when they are sold).
 */
const { HttpError, str, int } = require('./util');

const DAY = 24 * 3600 * 1000;
const METHODS = ['cash', 'card', 'transfer'];
// Cash-book categories written by these screens; they move money between stock, debts and the till.
const CAT = { purchase: 'Mol xaridi', supplier: "Yetkazib beruvchiga to'lov", worker: "Ustaga to'lov" };
const SYSTEM_CATS = [CAT.purchase, CAT.supplier, CAT.worker, 'Mahsulotlar', 'Qaytarish'];
const JOB_KINDS = { measure: "O'lchov", delivery: 'Yetkazib berish', install: "O'rnatish" };
const SERVICE_KINDS = ['install', 'delivery'];

function dateTime(date, time, at) {
  if (Number.isFinite(Number(at)) && Number(at) > 0 && date) return { at: Number(at), has_time: time ? 1 : 0 };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!m) return null;
  const tm = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(time || ''));
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), tm ? Number(tm[1]) : 0, tm ? Number(tm[2]) : 0);
  return Number.isNaN(d.getTime()) ? null : { at: d.getTime(), has_time: tm ? 1 : 0 };
}
const fmtDate = (ts) => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmtTime = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const money = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function createShop(db, { audit, events, now, tasks, moduleOn, settings }) {
  const q = (sql) => db.prepare(sql);
  function tx(fn) {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  const variant = (d) => [d.size, d.color, d.material, d.side].filter(Boolean).join(' · ');
  const label = (d) => `${d.name}${variant(d) ? ` (${variant(d)})` : ''}`;

  // ---------- Suppliers ----------
  const supplierDebt = (id) => q("SELECT COALESCE(SUM(CASE WHEN kind = 'payment' THEN -amount ELSE amount END), 0) d FROM supplier_moves WHERE supplier_id = ?").get(id).d;
  function listSuppliers() {
    return q('SELECT * FROM suppliers WHERE active = 1 ORDER BY name').all().map((s) => ({ ...s, debt: supplierDebt(s.id),
      last: (q('SELECT MAX(created_at) t FROM purchases WHERE supplier_id = ?').get(s.id) || {}).t || null }));
  }
  function saveSupplier({ user, params, body }) {
    const name = str(body.name, 'Nomi', { required: true, max: 100 });
    const phone = str(body.phone, 'Telefon', { max: 30 });
    const note = str(body.note, 'Izoh', { max: 300 });
    let id = params.id;
    if (id) {
      if (!q('UPDATE suppliers SET name = ?, phone = ?, note = ? WHERE id = ? AND active = 1').run(name, phone, note, id).changes) throw new HttpError(404, 'Yetkazib beruvchi topilmadi');
    } else {
      id = Number(q('INSERT INTO suppliers (name, phone, note, created_at) VALUES (?, ?, ?, ?)').run(name, phone, note, now()).lastInsertRowid);
      // Money already owed when the shop starts using the program.
      const opening = int(body.opening_debt, 'Qarz', { max: 10_000_000_000 });
      if (opening) q("INSERT INTO supplier_moves (supplier_id, kind, amount, note, user_id, created_at) VALUES (?, 'opening', ?, 'Boshlang''ich qarz', ?, ?)").run(id, opening, user.id, now());
    }
    audit(user, 'supplier_save', name);
    return { ...q('SELECT * FROM suppliers WHERE id = ?').get(id), debt: supplierDebt(id) };
  }
  function supplierDetail({ params }) {
    const s = q('SELECT * FROM suppliers WHERE id = ?').get(params.id);
    if (!s) throw new HttpError(404, 'Yetkazib beruvchi topilmadi');
    const moves = q('SELECT m.*, u.name user_name FROM supplier_moves m LEFT JOIN users u ON u.id = m.user_id WHERE m.supplier_id = ? ORDER BY m.id DESC LIMIT 200').all(s.id);
    const purchases = q('SELECT * FROM purchases WHERE supplier_id = ? ORDER BY id DESC LIMIT 50').all(s.id).map((p) => ({ ...p, items: purchaseItems(p.id) }));
    return { ...s, debt: supplierDebt(s.id), moves, purchases };
  }
  function paySupplier({ user, params, body }) {
    const s = q('SELECT * FROM suppliers WHERE id = ? AND active = 1').get(params.id);
    if (!s) throw new HttpError(404, 'Yetkazib beruvchi topilmadi');
    const debt = supplierDebt(s.id);
    const amount = int(body.amount, 'Summa', { min: 1, required: true });
    if (amount > debt) throw new HttpError(400, `Qarz ${money(debt)} so'm, undan ko'p to'lab bo'lmaydi`);
    const method = METHODS.includes(body.method) ? body.method : 'cash';
    tx(() => {
      const txId = q("INSERT INTO transactions (type, category, amount, method, note, user_id, created_at) VALUES ('expense', ?, ?, ?, ?, ?, ?)")
        .run(CAT.supplier, amount, method, s.name, user.id, now()).lastInsertRowid;
      q("INSERT INTO supplier_moves (supplier_id, kind, amount, transaction_id, method, note, user_id, created_at) VALUES (?, 'payment', ?, ?, ?, ?, ?, ?)")
        .run(s.id, amount, txId, method, str(body.note, 'Izoh', { max: 200 }), user.id, now());
    });
    if (supplierDebt(s.id) <= 0) tasks.closeAuto(`supplier:${s.id}`, user.id);
    audit(user, 'supplier_pay', `${s.name}: ${amount}`);
    events.publish('finance');
    return { ok: true, debt: supplierDebt(s.id) };
  }
  function deleteSupplier({ user, params }) {
    const s = q('SELECT * FROM suppliers WHERE id = ?').get(params.id);
    if (!s) throw new HttpError(404, 'Yetkazib beruvchi topilmadi');
    if (supplierDebt(s.id) > 0) throw new HttpError(400, "Avval qarzni yoping — qarzi bor yetkazib beruvchini o'chirib bo'lmaydi");
    q('UPDATE suppliers SET active = 0 WHERE id = ?').run(s.id);
    audit(user, 'supplier_delete', s.name);
    return { ok: true };
  }

  // ---------- Goods arriving ("Mol keldi") ----------
  // Running average: old stock at its cost plus the new batch at its full cost.
  function addStock(dish, qty, unitCost) {
    const have = Math.max(0, dish.stock ?? 0);
    const cost = dish.stock === null || have + qty <= 0 ? unitCost : Math.round((have * (dish.cost || 0) + qty * unitCost) / (have + qty));
    q('UPDATE dishes SET stock = COALESCE(stock, 0) + ?, cost = ?, available = 1 WHERE id = ?').run(qty, cost, dish.id);
    return cost;
  }
  function purchaseItems(id) {
    return q('SELECT pi.*, d.name, d.size, d.color, d.material, d.side FROM purchase_items pi JOIN dishes d ON d.id = pi.dish_id WHERE pi.purchase_id = ? ORDER BY pi.id').all(id)
      .map((r) => ({ ...r, label: label(r) }));
  }
  function createPurchase({ user, body }) {
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'Mollarni kiriting');
    const supplierId = body.supplier_id ? int(body.supplier_id, 'Yetkazib beruvchi', { min: 1 }) : null;
    const supplier = supplierId ? q('SELECT * FROM suppliers WHERE id = ? AND active = 1').get(supplierId) : null;
    if (supplierId && !supplier) throw new HttpError(404, 'Yetkazib beruvchi topilmadi');
    const lines = body.items.map((it) => {
      const d = q('SELECT * FROM dishes WHERE id = ? AND active = 1').get(int(it.dish_id, 'Mol', { min: 1, required: true }));
      if (!d) throw new HttpError(404, 'Mol topilmadi');
      return { d, qty: int(it.qty, 'Soni', { min: 1, max: 1_000_000, required: true }), price: int(it.price, 'Narxi', { max: 10_000_000_000, required: true }) };
    });
    const goods = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const freight = int(body.freight, "Yo'lkira", { max: 10_000_000_000 });
    // Paid now to the supplier; the freight is paid now unless said otherwise.
    const paid = body.paid === undefined || body.paid === '' ? goods : int(body.paid, "To'langan", { max: goods });
    if (paid < goods && !supplier && !body.no_supplier_ok) throw new HttpError(400, "Qarzga olish uchun yetkazib beruvchini tanlang");
    const freightPaid = body.freight_paid !== false;
    const method = METHODS.includes(body.method) ? body.method : 'cash';
    const due = dateTime(body.due_date);
    const t = now();
    const id = tx(() => {
      const pid = Number(q('INSERT INTO purchases (supplier_id, goods_total, freight, paid, method, due_at, note, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(supplierId, goods, freight, paid, method, due ? due.at : null, str(body.note, 'Izoh', { max: 300 }), user.id, t).lastInsertRowid);
      let freightLeft = freight;
      lines.forEach((l, i) => {
        // The freight goes to each line by its share of the goods' value (the last line takes the rounding).
        const share = i === lines.length - 1 ? freightLeft : goods ? Math.round((freight * l.qty * l.price) / goods) : Math.round(freight / lines.length);
        freightLeft -= share;
        const unit = l.price + Math.round(share / l.qty);
        q('INSERT INTO purchase_items (purchase_id, dish_id, qty, price, unit_cost) VALUES (?, ?, ?, ?, ?)').run(pid, l.d.id, l.qty, l.price, unit);
        addStock(q('SELECT * FROM dishes WHERE id = ?').get(l.d.id), l.qty, unit);
        q("INSERT INTO stock_moves (dish_id, kind, qty, unit_cost, amount, ref, user_id, created_at) VALUES (?, 'in', ?, ?, ?, ?, ?, ?)")
          .run(l.d.id, l.qty, unit, unit * l.qty, `purchase:${pid}`, user.id, t);
      });
      const out = paid + (freightPaid ? freight : 0);
      if (out > 0) {
        q("INSERT INTO transactions (type, category, amount, method, note, user_id, created_at) VALUES ('expense', ?, ?, ?, ?, ?, ?)")
          .run(CAT.purchase, out, method, `Mol keldi #${pid}${supplier ? ` — ${supplier.name}` : ''}${freightPaid && freight ? ` (yo'lkira ${money(freight)})` : ''}`, user.id, t);
      }
      if (supplier) {
        q("INSERT INTO supplier_moves (supplier_id, kind, amount, purchase_id, note, user_id, created_at) VALUES (?, 'purchase', ?, ?, ?, ?, ?)")
          .run(supplier.id, goods, pid, `Mol keldi #${pid}`, user.id, t);
        if (paid) q("INSERT INTO supplier_moves (supplier_id, kind, amount, purchase_id, method, note, user_id, created_at) VALUES (?, 'payment', ?, ?, ?, ?, ?, ?)")
          .run(supplier.id, paid, pid, method, `Mol keldi #${pid}`, user.id, t);
      }
      return pid;
    });
    if (supplier && supplierDebt(supplier.id) > 0) {
      tasks.upsertAuto({ ref: `supplier:${supplier.id}`, title: `Yetkazib beruvchiga to'lash: ${supplier.name} — ${money(supplierDebt(supplier.id))} so'm`,
        due_at: due ? due.at : t + 7 * DAY });
    }
    audit(user, 'purchase', `#${id}: ${lines.map((l) => `${l.d.name}×${l.qty}`).join(', ')}`);
    events.publish('menu');
    events.publish('finance');
    return purchaseDetail({ params: { id } });
  }
  function purchaseDetail({ params }) {
    const p = q('SELECT p.*, s.name supplier_name, u.name user_name FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?').get(params.id);
    if (!p) throw new HttpError(404, 'Topilmadi');
    return { ...p, items: purchaseItems(p.id) };
  }
  function listPurchases({ query }) {
    const from = Number(query.from) || 0;
    const to = Number(query.to) || 8.64e15;
    return q(`SELECT p.*, s.name supplier_name, (SELECT COUNT(*) FROM purchase_items WHERE purchase_id = p.id) lines,
      (SELECT SUM(qty) FROM purchase_items WHERE purchase_id = p.id) units FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.created_at >= ? AND p.created_at < ? ORDER BY p.id DESC LIMIT 300`).all(from, to);
  }
  // A single product's quick "Kirim" from the goods list goes through the same bookkeeping.
  function receiveOne(user, dish, qty, cost, { expense = false, method = 'cash' } = {}) {
    return createPurchase({ user, body: { items: [{ dish_id: dish.id, qty, price: cost }], paid: expense ? qty * cost : 0, method, freight: 0, freight_paid: true, no_supplier_ok: true } });
  }

  // ---------- Goods leaving outside sales ----------
  function writeOff({ user, params, body }) {
    const d = q('SELECT * FROM dishes WHERE id = ? AND active = 1').get(params.id);
    if (!d) throw new HttpError(404, 'Mol topilmadi');
    const qty = int(body.qty, 'Soni', { min: 1, max: 1_000_000, required: true });
    // Only what is on the shelf can be written off.
    if (d.stock !== null && qty > d.stock) throw new HttpError(400, `Omborda faqat ${Math.max(0, d.stock)} ta bor`);
    const reason = str(body.reason, 'Sabab', { required: true, max: 200 });
    tx(() => {
      if (d.stock !== null) q('UPDATE dishes SET stock = stock - ?, available = CASE WHEN stock - ? > 0 THEN available ELSE 0 END WHERE id = ?').run(qty, qty, d.id);
      q("INSERT INTO stock_moves (dish_id, kind, qty, unit_cost, amount, note, user_id, created_at) VALUES (?, 'writeoff', ?, ?, ?, ?, ?, ?)")
        .run(d.id, -qty, d.cost || 0, (d.cost || 0) * qty, reason, user.id, now());
    });
    audit(user, 'stock_writeoff', `${label(d)} −${qty}: ${reason}`);
    events.publish('menu');
    return q('SELECT * FROM dishes WHERE id = ?').get(d.id);
  }
  function count({ user, params, body }) {
    const d = q('SELECT * FROM dishes WHERE id = ? AND active = 1').get(params.id);
    if (!d) throw new HttpError(404, 'Mol topilmadi');
    const real = int(body.qty, 'Haqiqiy soni', { min: 0, max: 10_000_000, required: true });
    const diff = real - (d.stock ?? 0);
    if (diff) {
      tx(() => {
        q('UPDATE dishes SET stock = ?, available = ? WHERE id = ?').run(real, real > 0 ? 1 : 0, d.id);
        // A shortage is a loss (positive amount), a surplus a gain (negative).
        q("INSERT INTO stock_moves (dish_id, kind, qty, unit_cost, amount, note, user_id, created_at) VALUES (?, 'count', ?, ?, ?, ?, ?, ?)")
          .run(d.id, diff, d.cost || 0, -diff * (d.cost || 0), str(body.note, 'Izoh', { max: 200 }), user.id, now());
      });
      audit(user, 'stock_count', `${label(d)}: ${d.stock ?? 0} → ${real}`);
      events.publish('menu');
    }
    return { ...q('SELECT * FROM dishes WHERE id = ?').get(d.id), diff };
  }
  function stockHistory({ params }) {
    const d = q('SELECT * FROM dishes WHERE id = ?').get(params.id);
    if (!d) throw new HttpError(404, 'Mol topilmadi');
    const moves = q('SELECT m.*, u.name user_name FROM stock_moves m LEFT JOIN users u ON u.id = m.user_id WHERE m.dish_id = ? ORDER BY m.id DESC LIMIT 100').all(d.id);
    const sales = q(`SELECT o.id order_id, o.closed_at created_at, i.qty, i.price, i.cost FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE i.dish_id = ? AND o.status = 'closed' AND i.status != 'cancelled' ORDER BY o.closed_at DESC LIMIT 100`).all(d.id);
    return { dish: d, moves, sales };
  }
  // Goods brought back: back in stock at the cost they were sold at.
  function refunded(item, qty, userId, orderId) {
    if (!item.dish_id) return;
    q("INSERT INTO stock_moves (dish_id, kind, qty, unit_cost, amount, ref, user_id, created_at) VALUES (?, 'refund', ?, ?, ?, ?, ?, ?)")
      .run(item.dish_id, qty, item.cost, item.cost * qty, `order:${orderId}`, userId, now());
  }

  // ---------- Own barcodes for goods that came without one ----------
  // EAN-13 starting with "20": the range kept for a shop's own goods, so it never clashes with a factory code.
  function ean13(first12) {
    const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
    return first12 + ((10 - (sum % 10)) % 10);
  }
  function assignBarcodes({ user, body }) {
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean).slice(0, 2000) : [];
    if (!ids.length) throw new HttpError(400, 'Mol tanlanmagan');
    const taken = q('SELECT 1 FROM dishes WHERE barcode = ? AND active = 1');
    const out = [];
    tx(() => {
      for (const id of ids) {
        const d = q('SELECT * FROM dishes WHERE id = ? AND active = 1').get(id);
        if (!d) continue;
        if (d.barcode) { out.push({ id, barcode: d.barcode }); continue; }
        let n = id;
        let code = ean13(`20${String(n).padStart(10, '0')}`);
        while (taken.get(code)) code = ean13(`20${String(n += 100000).padStart(10, '0')}`);
        q('UPDATE dishes SET barcode = ? WHERE id = ?').run(code, id);
        out.push({ id, barcode: code, created: true });
      }
    });
    const made = out.filter((x) => x.created).length;
    if (made) { audit(user, 'barcode_create', `${made} ta`); events.publish('menu'); }
    return out;
  }

  // ---------- Loading the goods list from Excel ----------
  function importProducts({ user, body }) {
    if (!Array.isArray(body.rows) || !body.rows.length) throw new HttpError(400, "Ro'yxat bo'sh");
    if (body.rows.length > 5000) throw new HttpError(400, "Bir martada 5000 tadan ko'p mol yuklab bo'lmaydi");
    const cats = new Map(q('SELECT id, name FROM categories').all().map((c) => [c.name.toLowerCase(), c.id]));
    const t = now();
    let added = 0;
    let updated = 0;
    tx(() => {
      body.rows.forEach((r, i) => {
        const at = `${i + 1}-qator: `;
        const name = str(r.name, `${at}Nomi`, { required: true, max: 80 });
        const price = int(r.price, `${at}Sotish narxi`, { max: 10_000_000_000, required: true });
        const cost = int(r.cost, `${at}Kelish narxi`, { max: 10_000_000_000 });
        const stock = r.stock === undefined || r.stock === '' ? 0 : int(r.stock, `${at}Soni`, { max: 10_000_000 });
        const f = { size: str(r.size, `${at}O'lcham`, { max: 30 }), color: str(r.color, `${at}Rang`, { max: 30 }), material: str(r.material, `${at}Turi`, { max: 30 }),
          side: str(r.side, `${at}Tomoni`, { max: 20 }), barcode: str(r.barcode, `${at}Shtrix-kod`, { max: 40 }), unit: str(r.unit, `${at}O'lchov`, { max: 20 }) || 'dona' };
        const minStock = r.min_stock === undefined || r.min_stock === '' ? null : int(r.min_stock, `${at}Minimal qoldiq`, { max: 100000 });
        let catId = null;
        const cname = str(r.category, `${at}Bo'lim`, { max: 60 });
        if (cname) {
          catId = cats.get(cname.toLowerCase());
          if (!catId) { catId = Number(q("INSERT INTO categories (name, icon, sort) VALUES (?, '📦', ?)").run(cname, cats.size).lastInsertRowid); cats.set(cname.toLowerCase(), catId); }
        }
        // The same product (name and all its details) loaded again updates prices and adds the quantity.
        const same = q('SELECT * FROM dishes WHERE active = 1 AND name = ? AND size = ? AND color = ? AND material = ? AND side = ?').get(name, f.size, f.color, f.material, f.side);
        let id;
        if (same) {
          q('UPDATE dishes SET price = ?, category_id = COALESCE(?, category_id), min_stock = COALESCE(?, min_stock), barcode = CASE WHEN ? != \'\' THEN ? ELSE barcode END WHERE id = ?')
            .run(price, catId, minStock, f.barcode, f.barcode, same.id);
          if (stock) addStock(same, stock, cost || same.cost); else if (cost) q('UPDATE dishes SET cost = ? WHERE id = ?').run(cost, same.id);
          id = same.id; updated++;
        } else {
          id = Number(q(`INSERT INTO dishes (category_id, name, price, cost, prep_minutes, unit, needs_kitchen, icon, stock, barcode, size, color, material, side, min_stock, available)
            VALUES (?, ?, ?, ?, 0, ?, 0, '🚪', ?, ?, ?, ?, ?, ?, ?, ?)`).run(catId, name, price, cost, f.unit, stock, f.barcode, f.size, f.color, f.material, f.side, minStock, stock > 0 ? 1 : 0).lastInsertRowid);
          added++;
        }
        if (stock) q("INSERT INTO stock_moves (dish_id, kind, qty, unit_cost, amount, ref, user_id, created_at) VALUES (?, 'import', ?, ?, ?, 'import', ?, ?)").run(id, stock, cost, cost * stock, user.id, t);
      });
    });
    audit(user, 'products_import', `${added} yangi, ${updated} yangilandi`);
    events.publish('menu');
    return { added, updated };
  }

  // ---------- Installers, drivers and their jobs ----------
  const masterOwed = (id) => q("SELECT COALESCE(SUM(cost), 0) s FROM jobs WHERE master_id = ? AND status = 'done' AND paid_at IS NULL").get(id).s;
  function listMasters() {
    return q('SELECT * FROM masters WHERE active = 1 ORDER BY name').all().map((m) => ({ ...m, owed: masterOwed(m.id),
      planned: q("SELECT COUNT(*) c FROM jobs WHERE master_id = ? AND status = 'planned'").get(m.id).c,
      done_month: q("SELECT COUNT(*) c FROM jobs WHERE master_id = ? AND status = 'done' AND done_at >= ?").get(m.id, monthStart()).c }));
  }
  function monthStart() { const d = new Date(now()); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function saveMaster({ user, params, body }) {
    const name = str(body.name, 'Ism', { required: true, max: 80 });
    const phone = str(body.phone, 'Telefon', { max: 30 });
    let id = params.id;
    if (id) {
      if (!q('UPDATE masters SET name = ?, phone = ? WHERE id = ? AND active = 1').run(name, phone, id).changes) throw new HttpError(404, 'Usta topilmadi');
    } else id = Number(q('INSERT INTO masters (name, phone, created_at) VALUES (?, ?, ?)').run(name, phone, now()).lastInsertRowid);
    audit(user, 'master_save', name);
    return q('SELECT * FROM masters WHERE id = ?').get(id);
  }
  function deleteMaster({ user, params }) {
    const m = q('SELECT * FROM masters WHERE id = ?').get(params.id);
    if (!m) throw new HttpError(404, 'Usta topilmadi');
    if (masterOwed(m.id) > 0) throw new HttpError(400, "Avval ustaga qarzni to'lang");
    q('UPDATE masters SET active = 0 WHERE id = ?').run(m.id);
    audit(user, 'master_delete', m.name);
    return { ok: true };
  }
  function jobRow(id) {
    const j = q('SELECT j.*, m.name master_name, m.phone master_phone FROM jobs j LEFT JOIN masters m ON m.id = j.master_id WHERE j.id = ?').get(id);
    if (!j) throw new HttpError(404, 'Ish topilmadi');
    return j;
  }
  function jobTask(j) {
    if (j.status !== 'planned' || !j.scheduled_at) { tasks.closeAuto(`job:${j.id}`); return; }
    const who = [j.customer_name, j.address].filter(Boolean).join(', ');
    tasks.upsertAuto({ ref: `job:${j.id}`, due_at: j.scheduled_at, has_time: new Date(j.scheduled_at).getHours() || new Date(j.scheduled_at).getMinutes() ? 1 : 0,
      title: `${JOB_KINDS[j.kind]}: ${who || "mijoz"}${j.master_name ? ` — ${j.master_name}` : ''}`,
      note: [j.phone && `Tel: ${j.phone}`, j.note].filter(Boolean).join(' · ') });
  }
  function listJobs({ query }) {
    const where = [];
    const args = [];
    if (['planned', 'done', 'cancelled'].includes(query.status)) { where.push('j.status = ?'); args.push(query.status); }
    if (query.master_id) { where.push('j.master_id = ?'); args.push(Number(query.master_id)); }
    if (query.unpaid === '1') where.push("j.status = 'done' AND j.paid_at IS NULL AND j.cost > 0");
    return q(`SELECT j.*, m.name master_name FROM jobs j LEFT JOIN masters m ON m.id = j.master_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE j.status WHEN 'planned' THEN 0 ELSE 1 END, COALESCE(j.scheduled_at, j.created_at) ${query.status === 'planned' ? 'ASC' : 'DESC'} LIMIT 300`).all(...args);
  }
  function jobInput(body, prev = {}) {
    const when = body.date !== undefined ? dateTime(body.date, body.time, body.at) : null;
    if (body.date && !when) throw new HttpError(400, "Sana noto'g'ri");
    const masterId = body.master_id !== undefined ? (body.master_id ? int(body.master_id, 'Usta', { min: 1 }) : null) : prev.master_id ?? null;
    if (masterId && !q('SELECT 1 FROM masters WHERE id = ? AND active = 1').get(masterId)) throw new HttpError(404, 'Usta topilmadi');
    return {
      master_id: masterId,
      scheduled_at: body.date !== undefined ? (when ? when.at : null) : prev.scheduled_at ?? null,
      customer_name: str(body.customer_name ?? prev.customer_name, 'Mijoz', { max: 80 }),
      phone: str(body.phone ?? prev.phone, 'Telefon', { max: 30 }),
      address: str(body.address ?? prev.address, 'Manzil', { max: 200 }),
      cost: body.cost !== undefined ? int(body.cost, 'Ustaga', { max: 1_000_000_000 }) : prev.cost ?? 0,
      note: str(body.note ?? prev.note, 'Izoh', { max: 300 }),
    };
  }
  // A measuring visit (or any job) written on its own, without a sale.
  function createJob({ user, body }) {
    const kind = JOB_KINDS[body.kind] ? body.kind : 'measure';
    const j = jobInput(body);
    const id = Number(q(`INSERT INTO jobs (kind, master_id, customer_name, phone, address, scheduled_at, cost, note, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(kind, j.master_id, j.customer_name, j.phone, j.address, j.scheduled_at, j.cost, j.note, user.id, now()).lastInsertRowid);
    const row = jobRow(id);
    jobTask(row);
    audit(user, 'job_create', `${JOB_KINDS[kind]}: ${j.customer_name}`);
    events.publish('jobs');
    return row;
  }
  function updateJob({ user, params, body }) {
    const prev = jobRow(params.id);
    if (prev.paid_at) throw new HttpError(400, "Ustaga to'langan ishni o'zgartirib bo'lmaydi");
    const j = jobInput(body, prev);
    tx(() => {
      q('UPDATE jobs SET master_id = ?, scheduled_at = ?, customer_name = ?, phone = ?, address = ?, cost = ?, note = ? WHERE id = ?')
        .run(j.master_id, j.scheduled_at, j.customer_name, j.phone, j.address, j.cost, j.note, prev.id);
      // The worker's pay is the cost of the service line on the check.
      if (prev.item_id && j.cost !== prev.cost) q('UPDATE order_items SET cost = ? WHERE id = ?').run(j.cost, prev.item_id);
    });
    const row = jobRow(prev.id);
    jobTask(row);
    audit(user, 'job_update', `#${row.id}`);
    events.publish('jobs');
    return row;
  }
  function setJobStatus(user, id, status) {
    const j = jobRow(id);
    if (j.paid_at) throw new HttpError(400, "Ustaga to'langan ish");
    q('UPDATE jobs SET status = ?, done_at = ? WHERE id = ?').run(status, status === 'done' ? now() : null, j.id);
    // A cancelled service costs nothing (the customer's money is returned through the check, if at all).
    if (j.item_id) q('UPDATE order_items SET cost = ? WHERE id = ?').run(status === 'cancelled' ? 0 : j.cost, j.item_id);
    const row = jobRow(j.id);
    jobTask(row);
    audit(user, status === 'done' ? 'job_done' : status === 'cancelled' ? 'job_cancel' : 'job_reopen', `${JOB_KINDS[j.kind]} #${j.id}`);
    events.publish('jobs');
    return row;
  }
  const jobDone = ({ user, params }) => setJobStatus(user, params.id, 'done');
  const jobCancel = ({ user, params }) => setJobStatus(user, params.id, 'cancelled');
  const jobReopen = ({ user, params }) => setJobStatus(user, params.id, 'planned');
  // Paying a worker for the jobs done: one cash-book entry.
  function payMaster({ user, params, body }) {
    const m = q('SELECT * FROM masters WHERE id = ?').get(params.id);
    if (!m) throw new HttpError(404, 'Usta topilmadi');
    const ids = Array.isArray(body.job_ids) ? body.job_ids.map(Number) : null;
    const jobs = q("SELECT * FROM jobs WHERE master_id = ? AND status = 'done' AND paid_at IS NULL AND cost > 0").all(m.id).filter((j) => !ids || ids.includes(j.id));
    if (!jobs.length) throw new HttpError(400, "To'lanadigan ish yo'q");
    const amount = jobs.reduce((s, j) => s + j.cost, 0);
    const method = METHODS.includes(body.method) ? body.method : 'cash';
    tx(() => {
      const txId = q("INSERT INTO transactions (type, category, amount, method, note, user_id, created_at) VALUES ('expense', ?, ?, ?, ?, ?, ?)")
        .run(CAT.worker, amount, method, `${m.name}: ${jobs.length} ta ish`, user.id, now()).lastInsertRowid;
      const set = q('UPDATE jobs SET paid_at = ?, transaction_id = ? WHERE id = ?');
      for (const j of jobs) set.run(now(), txId, j.id);
    });
    audit(user, 'master_pay', `${m.name}: ${amount}`);
    events.publish('finance');
    events.publish('jobs');
    return { ok: true, amount, jobs: jobs.length };
  }

  // ---------- Services on a sale ----------
  // body.services: [{ kind: 'install'|'delivery', price, cost, master_id, date, time, address }]
  function serviceInput(body) {
    if (!Array.isArray(body.services) || !body.services.length) return [];
    return body.services.map((s) => {
      if (!SERVICE_KINDS.includes(s.kind)) throw new HttpError(400, "Xizmat turi noto'g'ri");
      const when = s.date ? dateTime(s.date, s.time, s.at) : null;
      if (s.date && !when) throw new HttpError(400, "Sana noto'g'ri");
      const masterId = s.master_id ? int(s.master_id, 'Usta', { min: 1 }) : null;
      if (masterId && !q('SELECT 1 FROM masters WHERE id = ? AND active = 1').get(masterId)) throw new HttpError(404, 'Usta topilmadi');
      return { kind: s.kind, price: int(s.price, 'Xizmat narxi', { max: 1_000_000_000 }), cost: int(s.cost, 'Ustaga', { max: 1_000_000_000 }),
        master_id: masterId, at: when ? when.at : null, address: str(s.address, 'Manzil', { max: 200 }), note: str(s.note, 'Izoh', { max: 200 }) };
    });
  }
  function insertServices(orderId, services, t) {
    const ins = q(`INSERT INTO order_items (order_id, dish_id, name, price, cost, qty, note, status, needs_kitchen, prep_minutes, created_at, served_at, service)
      VALUES (?, NULL, ?, ?, ?, 1, ?, 'served', 0, 0, ?, ?, ?)`);
    return services.map((s) => ({ ...s, item_id: Number(ins.run(orderId, JOB_KINDS[s.kind], s.price, s.cost, s.address, t, t, s.kind).lastInsertRowid) }));
  }
  // After the sale is paid: a job (and a dated task) per service; a task to collect what is left on credit.
  function afterSale(user, order, services, body) {
    const cust = order.customer_id ? q('SELECT * FROM customers WHERE id = ?').get(order.customer_id) : null;
    const name = cust ? cust.name : str(body.label, 'Mijoz', { max: 60 });
    const phone = cust ? cust.phone : str(body.phone, 'Telefon', { max: 30 });
    const jobs = [];
    for (const s of services) {
      const id = Number(q(`INSERT INTO jobs (kind, order_id, item_id, master_id, customer_id, customer_name, phone, address, scheduled_at, price, cost, note, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(s.kind, order.id, s.item_id, s.master_id, cust ? cust.id : null, name, phone, s.address, s.at, s.price, s.cost, s.note, user.id, now()).lastInsertRowid);
      const j = jobRow(id);
      jobTask(j);
      jobs.push(j);
    }
    if (order.paid_debt > 0 && cust) {
      const due = dateTime(body.debt_due) || (jobs.find((j) => j.scheduled_at) ? { at: jobs.find((j) => j.scheduled_at).scheduled_at } : { at: now() + 7 * DAY });
      const total = q('SELECT debt FROM customers WHERE id = ?').get(cust.id).debt;
      tasks.upsertAuto({ ref: `debt:${cust.id}`, due_at: due.at, title: `Qarzni olish: ${cust.name} — ${money(total)} so'm`, note: cust.phone ? `Tel: ${cust.phone}` : '' });
    }
    if (jobs.length) events.publish('jobs');
    return jobs;
  }

  // ---------- Debts on both sides ----------
  function debts() {
    const customers = moduleOn('debts') ? q('SELECT id, name, phone, debt, last_visit FROM customers WHERE active = 1 AND debt > 0 ORDER BY debt DESC').all() : [];
    const suppliers = listSuppliers().filter((s) => s.debt > 0);
    const masters = listMasters().filter((m) => m.owed > 0);
    return { customers, suppliers, masters, owed_to_us: customers.reduce((s, c) => s + c.debt, 0),
      we_owe: suppliers.reduce((s, x) => s + x.debt, 0) + masters.reduce((s, m) => s + m.owed, 0) };
  }

  // ---------- Profit ----------
  function periodNumbers(from, to) {
    const orders = q("SELECT * FROM orders WHERE status = 'closed' AND closed_at >= ? AND closed_at < ?").all(from, to);
    const items = q(`SELECT i.*, o.closed_at FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.status = 'closed' AND o.closed_at >= ? AND o.closed_at < ? AND i.status != 'cancelled'`).all(from, to);
    const txs = q('SELECT * FROM transactions WHERE created_at >= ? AND created_at < ?').all(from, to);
    const moves = q('SELECT * FROM stock_moves WHERE created_at >= ? AND created_at < ?').all(from, to);
    const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
    const refunds = sum(txs.filter((t) => t.type === 'expense' && t.category === 'Qaytarish'), (t) => t.amount);
    const goodsCost = sum(items.filter((i) => !i.service), (i) => i.cost * i.qty) - sum(moves.filter((m) => m.kind === 'refund'), (m) => m.amount);
    const serviceCost = sum(items.filter((i) => i.service), (i) => i.cost * i.qty);
    const serviceIncome = sum(items.filter((i) => i.service), (i) => i.price * i.qty);
    const damage = sum(moves.filter((m) => m.kind === 'writeoff' || m.kind === 'count'), (m) => m.amount);
    const running = txs.filter((t) => t.type === 'expense' && !SYSTEM_CATS.includes(t.category));
    const otherIncome = sum(txs.filter((t) => t.type === 'income' && !t.order_id && t.category !== "Qarz to'lovi"), (t) => t.amount);
    const revenue = sum(orders, (o) => o.total) - refunds;
    const expenses = new Map();
    for (const t of running) expenses.set(t.category, (expenses.get(t.category) || 0) + t.amount);
    const runningTotal = sum(running, (t) => t.amount);
    const net = revenue - goodsCost - serviceCost - damage - runningTotal + otherIncome;
    return { orders, items, revenue, refunds, goods_cost: goodsCost, service_income: serviceIncome, service_cost: serviceCost, damage,
      running: [...expenses].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
      running_total: runningTotal, other_income: otherIncome, gross: revenue - goodsCost, net, sales: orders.length };
  }
  function profit({ query }) {
    const from = Number(query.from);
    const to = Number(query.to);
    if (!from || !to || to <= from) throw new HttpError(400, "Davr noto'g'ri");
    const cur = periodNumbers(from, to);
    const prev = periodNumbers(from - (to - from), from);
    // Products: sold, earned, still in stock; slow and "dead" goods (nothing sold or bought for 60 days).
    const byDish = new Map();
    for (const i of cur.items.filter((x) => x.dish_id)) {
      const r = byDish.get(i.dish_id) || { qty: 0, revenue: 0, profit: 0 };
      r.qty += i.qty; r.revenue += i.price * i.qty; r.profit += (i.price - i.cost) * i.qty;
      byDish.set(i.dish_id, r);
    }
    const dishes = q('SELECT * FROM dishes WHERE active = 1').all();
    const lastSale = new Map(q(`SELECT i.dish_id, MAX(o.closed_at) t FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.status = 'closed' AND i.status != 'cancelled' AND i.dish_id IS NOT NULL GROUP BY i.dish_id`).all().map((r) => [r.dish_id, r.t]));
    const lastIn = new Map(q("SELECT dish_id, MAX(created_at) t FROM stock_moves WHERE kind IN ('in','import') GROUP BY dish_id").all().map((r) => [r.dish_id, r.t]));
    const rows = dishes.map((d) => ({ id: d.id, name: d.name, variant: variant(d), stock: d.stock, cost: d.cost, price: d.price,
      ...(byDish.get(d.id) || { qty: 0, revenue: 0, profit: 0 }), last_sale: lastSale.get(d.id) || null, last_in: lastIn.get(d.id) || null, created_at: d.created_at || null }));
    const sold = rows.filter((r) => r.qty > 0);
    const inStock = rows.filter((r) => (r.stock || 0) > 0);
    const deadLine = now() - 60 * DAY;
    const dead = inStock.filter((r) => { const last = Math.max(r.last_sale || 0, r.last_in || 0, r.created_at || 0); return last > 0 && last < deadLine; })
      .map((r) => ({ ...r, frozen: r.stock * r.cost })).sort((a, b) => b.frozen - a.frozen);
    const days = new Map();
    for (const o of cur.orders) {
      const d = new Date(o.closed_at); d.setHours(0, 0, 0, 0);
      days.set(d.getTime(), (days.get(d.getTime()) || 0) + o.total);
    }
    const { orders, items, ...summary } = cur;
    const { orders: po, items: pi, ...before } = prev;
    return {
      from, to, ...summary, prev: before,
      top_qty: [...sold].sort((a, b) => b.qty - a.qty).slice(0, 5),
      top_profit: [...sold].sort((a, b) => b.profit - a.profit).slice(0, 5),
      slow: [...inStock].sort((a, b) => a.qty - b.qty || b.stock * b.cost - a.stock * a.cost).slice(0, 5),
      dead: dead.slice(0, 20), dead_total: dead.reduce((s, r) => s + r.frozen, 0),
      stock_value: inStock.reduce((s, r) => s + r.stock * r.cost, 0), stock_units: inStock.reduce((s, r) => s + r.stock, 0),
      by_day: [...days].map(([day, total]) => ({ day, total })).sort((a, b) => a.day - b.day),
      debts: debts(),
    };
  }

  // ---------- "Bugun" ----------
  function lowStock() {
    return q('SELECT * FROM dishes WHERE active = 1 AND stock IS NOT NULL AND ((min_stock IS NOT NULL AND stock <= min_stock) OR stock <= 0) ORDER BY stock, name LIMIT 30').all()
      .map((d) => ({ id: d.id, name: label(d), stock: d.stock, min_stock: d.min_stock }));
  }
  function todayJobs(from, to) {
    return q("SELECT j.*, m.name master_name FROM jobs j LEFT JOIN masters m ON m.id = j.master_id WHERE j.status = 'planned' AND j.scheduled_at >= ? AND j.scheduled_at < ? ORDER BY j.scheduled_at").all(from, to);
  }

  // ---------- Invoice (nakladnoy) ----------
  function invoice(order) {
    const cust = order.customer_id ? q('SELECT id, name, phone FROM customers WHERE id = ?').get(order.customer_id) : null;
    const jobs = q('SELECT j.*, m.name master_name FROM jobs j LEFT JOIN masters m ON m.id = j.master_id WHERE j.order_id = ?').all(order.id);
    const items = q("SELECT i.*, d.size, d.color, d.material, d.side, d.unit FROM order_items i LEFT JOIN dishes d ON d.id = i.dish_id WHERE i.order_id = ? AND i.status != 'cancelled' ORDER BY i.id").all(order.id)
      .map((i) => ({ name: i.name, variant: variant(i), unit: i.service ? 'xizmat' : i.unit || 'dona', qty: i.qty - (i.refunded_qty || 0), price: i.price, service: i.service, note: i.note }));
    const s = settings();
    return { id: order.id, date: order.closed_at || order.opened_at, seller: { name: s.name, address: s.address, phone: s.phone },
      customer: cust || (order.label ? { name: order.label, phone: '' } : null), address: (jobs.find((j) => j.address) || {}).address || '',
      items, jobs, subtotal: order.subtotal, discount: order.discount, total: order.total,
      paid: order.paid_cash + order.paid_card + order.paid_transfer, debt: order.paid_debt || 0 };
  }

  // A worker who brings no profit by being paid twice: these entries are managed from their own screens.
  function assertDeletable(t) {
    if ([CAT.supplier, CAT.worker].includes(t.category) || (t.category === CAT.purchase)) {
      throw new HttpError(400, "Bu yozuv \"Mol keldi\", yetkazib beruvchi yoki usta to'lovidan yozilgan — o'chirib bo'lmaydi");
    }
  }

  return {
    listSuppliers, saveSupplier, supplierDetail, paySupplier, deleteSupplier,
    createPurchase, purchaseDetail, listPurchases, receiveOne, assignBarcodes, ean13, writeOff, count, stockHistory, refunded, importProducts,
    listMasters, saveMaster, deleteMaster, listJobs, createJob, updateJob, jobDone, jobCancel, jobReopen, payMaster,
    serviceInput, insertServices, afterSale, debts, profit, periodNumbers, lowStock, todayJobs, invoice, assertDeletable,
    jobRow, setJobStatus, SYSTEM_CATS, CAT, fmtDate, fmtTime, money,
  };
}

module.exports = { createShop, SYSTEM_CATS };
