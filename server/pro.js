'use strict';
/*
 * Pro sections of one business:
 * - customers: a customer base with cashback (a bonus share of each paid check, spent later as a discount);
 * - debts: checks closed on credit ("nasiya") and the customer paying it back, in parts if needed;
 * - inventory: ingredients with stock, recipes (tex-karta) per dish, stock taken at every closed check,
 *   receiving, write-offs, counts; a dish's cost follows its recipe.
 * Money stays honest: a debt sale brings no cash, its later payment does (cash book "Qarz to'lovi", not new income);
 * spent bonus works as a discount.
 */
const { HttpError, str, int } = require('./util');

const UNITS = ['kg', 'g', 'l', 'ml', 'dona'];
const METHODS = ['cash', 'card', 'transfer'];
const DEBT_PAYMENT = "Qarz to'lovi";

function num(v, field, { min = 0, max = 1e9, required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${field} kiritilmagan`);
    return 0;
  }
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${field} noto'g'ri`);
  return Math.round(n * 1000) / 1000;
}

function createPro(db, { audit, events, now, moduleOn, settings }) {
  const q = (sql) => db.prepare(sql);
  const need = (m, name) => { if (!moduleOn(m)) throw new HttpError(403, `"${name}" bo'limi sizning tarifingizda yo'q`); };
  const usesCustomers = () => moduleOn('customers') || moduleOn('debts');

  // ---------- Customers ----------
  function customerRow(id) {
    const c = q('SELECT * FROM customers WHERE id = ?').get(id);
    if (!c) throw new HttpError(404, 'Mijoz topilmadi');
    return c;
  }
  function listCustomers({ query }) {
    if (!usesCustomers()) throw new HttpError(403, "\"Mijozlar\" bo'limi sizning tarifingizda yo'q");
    const s = String(query.q || '').trim();
    const where = ['active = 1'];
    const params = [];
    if (s) { where.push('(name LIKE ? OR phone LIKE ?)'); params.push(`%${s}%`, `%${s.replace(/\D/g, '') || s}%`); }
    if (query.debt === '1') where.push('debt > 0');
    const rows = q(`SELECT * FROM customers WHERE ${where.join(' AND ')} ORDER BY ${query.debt === '1' ? 'debt DESC' : 'last_visit DESC NULLS LAST, id DESC'}
      LIMIT ?`).all(...params, Math.min(Number(query.limit) || 200, 500));
    const totals = q('SELECT COUNT(*) count, COALESCE(SUM(debt), 0) debt, COALESCE(SUM(bonus), 0) bonus FROM customers WHERE active = 1').get();
    return { rows, totals };
  }
  function phoneInput(v) {
    const p = str(v, 'Telefon', { max: 30 });
    return p.replace(/[^\d+]/g, '');
  }
  function saveCustomer({ user, params, body }) {
    if (!usesCustomers()) throw new HttpError(403, "\"Mijozlar\" bo'limi sizning tarifingizda yo'q");
    const name = str(body.name, 'Ism', { required: true, max: 80 });
    const phone = phoneInput(body.phone);
    const note = str(body.note, 'Izoh', { max: 300 });
    if (phone && q('SELECT 1 FROM customers WHERE phone = ? AND active = 1 AND id != ?').get(phone, params.id || 0)) {
      throw new HttpError(409, 'Bu telefon raqamli mijoz bor');
    }
    let id = params.id;
    if (id) {
      customerRow(id);
      q('UPDATE customers SET name = ?, phone = ?, note = ? WHERE id = ?').run(name, phone, note, id);
      audit(user, 'customer_update', name);
    } else {
      id = q('INSERT INTO customers (name, phone, note, created_at) VALUES (?, ?, ?, ?)').run(name, phone, note, now()).lastInsertRowid;
      audit(user, 'customer_create', name);
    }
    return customerRow(id);
  }
  function customerDetail({ params }) {
    if (!usesCustomers()) throw new HttpError(403, "\"Mijozlar\" bo'limi sizning tarifingizda yo'q");
    const c = customerRow(params.id);
    const moves = q(`SELECT m.*, u.name user_name FROM customer_moves m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.customer_id = ? ORDER BY m.id DESC LIMIT 200`).all(c.id);
    const checks = q(`SELECT id, closed_at, total, paid_debt, bonus_used FROM orders WHERE customer_id = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT 50`).all(c.id);
    return { ...c, moves, checks };
  }
  function move(customerId, kind, amount, extra = {}) {
    q(`INSERT INTO customer_moves (customer_id, kind, amount, method, order_id, transaction_id, note, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(customerId, kind, amount, extra.method || null, extra.order_id || null,
      extra.transaction_id || null, extra.note || '', extra.user_id || null, now());
  }

  // A customer pays back (part of) the debt: real money comes into the till now.
  function payDebt({ user, params, body }) {
    need('debts', 'Qarz daftari');
    const c = customerRow(params.id);
    const amount = int(body.amount, 'Summa', { min: 1, required: true });
    if (amount > c.debt) throw new HttpError(400, `Qarz ${c.debt} so'm, undan ko'p qabul qilib bo'lmaydi`);
    const method = METHODS.includes(body.method) ? body.method : 'cash';
    db.exec('BEGIN');
    try {
      const txId = q("INSERT INTO transactions (type, category, amount, method, note, user_id, created_at) VALUES ('income', ?, ?, ?, ?, ?, ?)")
        .run(DEBT_PAYMENT, amount, method, c.name, user.id, now()).lastInsertRowid;
      q('UPDATE customers SET debt = debt - ? WHERE id = ?').run(amount, c.id);
      move(c.id, 'debt_pay', amount, { method, transaction_id: txId, user_id: user.id, note: str(body.note, 'Izoh', { max: 200 }) });
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    audit(user, 'debt_pay', `${c.name}: ${amount}`);
    events.publish('finance');
    return customerRow(c.id);
  }

  /*
   * Called inside the check-closing transaction, before the order row is written:
   * checks the customer, the bonus spent and the part left on credit. Returns the extra discount (bonus).
   */
  function preparePayment(body, subtotalWithService) {
    const out = { customer: null, bonus: 0, debt: 0 };
    if (!body.customer_id) {
      if (body.bonus || body.paid_debt) throw new HttpError(400, 'Mijozni tanlang');
      return out;
    }
    if (!usesCustomers()) throw new HttpError(403, "\"Mijozlar\" bo'limi sizning tarifingizda yo'q");
    out.customer = customerRow(int(body.customer_id, 'Mijoz', { min: 1 }));
    out.bonus = int(body.bonus, 'Bonus');
    if (out.bonus) {
      need('customers', 'Mijozlar va keshbek');
      if (out.bonus > out.customer.bonus) throw new HttpError(400, `Mijozda ${out.customer.bonus} so'm bonus bor`);
      out.bonus = Math.min(out.bonus, subtotalWithService);
    }
    out.debt = int(body.paid_debt, 'Qarzga');
    if (out.debt) need('debts', 'Qarz daftari');
    return out;
  }
  // After the order row is closed: bonus spent, debt written, cashback earned, visit counted.
  function afterPayment(user, order, cp, paidNow) {
    if (!cp.customer) return null;
    const c = cp.customer;
    if (cp.bonus) { q('UPDATE customers SET bonus = bonus - ? WHERE id = ?').run(cp.bonus, c.id); move(c.id, 'redeem', cp.bonus, { order_id: order.id, user_id: user.id }); }
    if (cp.debt) { q('UPDATE customers SET debt = debt + ? WHERE id = ?').run(cp.debt, c.id); move(c.id, 'debt', cp.debt, { order_id: order.id, user_id: user.id }); }
    const pct = moduleOn('customers') ? Number(settings().cashback_pct) || 0 : 0;
    const cashback = Math.floor((paidNow * pct) / 100);
    if (cashback > 0) { q('UPDATE customers SET bonus = bonus + ? WHERE id = ?').run(cashback, c.id); move(c.id, 'cashback', cashback, { order_id: order.id, user_id: user.id }); }
    q('UPDATE customers SET visits = visits + 1, spent = spent + ?, last_visit = ? WHERE id = ?').run(order.total, now(), c.id);
    return { cashback, customer: c.name };
  }

  // ---------- Inventory ----------
  function ingredientRow(id) {
    const r = q('SELECT * FROM ingredients WHERE id = ? AND active = 1').get(id);
    if (!r) throw new HttpError(404, 'Masalliq topilmadi');
    return r;
  }
  function listIngredients() {
    need('inventory', 'Masalliq ombori');
    const rows = q('SELECT * FROM ingredients WHERE active = 1 ORDER BY name').all();
    const uses = q('SELECT di.ingredient_id, COUNT(*) c FROM dish_ingredients di JOIN dishes d ON d.id = di.dish_id AND d.active = 1 GROUP BY di.ingredient_id').all();
    const useMap = new Map(uses.map((u) => [u.ingredient_id, u.c]));
    for (const r of rows) { r.dishes = useMap.get(r.id) || 0; r.value = Math.round(r.stock * r.cost); r.low = r.min_stock > 0 && r.stock <= r.min_stock; }
    return { rows, value: rows.reduce((s, r) => s + Math.max(0, r.value), 0), low: rows.filter((r) => r.low).length, units: UNITS };
  }
  function saveIngredient({ user, params, body }) {
    need('inventory', 'Masalliq ombori');
    const name = str(body.name, 'Nomi', { required: true, max: 60 });
    const unit = UNITS.includes(body.unit) ? body.unit : 'kg';
    const minStock = num(body.min_stock, 'Minimal qoldiq');
    const cost = int(body.cost, 'Narxi (1 birlik)');
    if (q('SELECT 1 FROM ingredients WHERE name = ? AND active = 1 AND id != ?').get(name, params.id || 0)) throw new HttpError(409, 'Bunday masalliq bor');
    let id = params.id;
    if (id) {
      const prev = ingredientRow(id);
      q('UPDATE ingredients SET name = ?, unit = ?, min_stock = ?, cost = ? WHERE id = ?').run(name, unit, minStock, cost, id);
      if (prev.cost !== cost) recostDishes(id);
    } else {
      const stock = num(body.stock, 'Qoldiq');
      id = q('INSERT INTO ingredients (name, unit, stock, min_stock, cost, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(name, unit, stock, minStock, cost, now()).lastInsertRowid;
      if (stock) q("INSERT INTO ingredient_moves (ingredient_id, kind, qty, cost, amount, note, user_id, created_at) VALUES (?, 'count', ?, ?, 0, ?, ?, ?)").run(id, stock, cost, "Boshlang'ich qoldiq", user.id, now());
    }
    audit(user, 'ingredient_save', name);
    return ingredientRow(id);
  }
  function deleteIngredient({ user, params }) {
    need('inventory', 'Masalliq ombori');
    const r = ingredientRow(params.id);
    q('UPDATE ingredients SET active = 0 WHERE id = ?').run(r.id);
    q('DELETE FROM dish_ingredients WHERE ingredient_id = ?').run(r.id);
    audit(user, 'ingredient_delete', r.name);
    return { ok: true };
  }

  // Receiving goods: stock up, the unit price becomes the new price; optionally paid from the till.
  function receive({ user, body }) {
    need('inventory', 'Masalliq ombori');
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'Masalliq tanlanmagan');
    const method = body.paid ? (METHODS.includes(body.method) ? body.method : 'cash') : null;
    const note = str(body.note, 'Izoh', { max: 200 });
    let total = 0;
    const lines = [];
    db.exec('BEGIN');
    try {
      for (const it of body.items) {
        const r = ingredientRow(int(it.ingredient_id, 'Masalliq', { min: 1, required: true }));
        const qty = num(it.qty, `${r.name}: miqdor`, { min: 0.001, required: true });
        const price = it.price === undefined || it.price === '' ? r.cost : int(it.price, `${r.name}: narx`);
        const amount = Math.round(qty * price);
        total += amount;
        q('UPDATE ingredients SET stock = stock + ?, cost = ? WHERE id = ?').run(qty, price, r.id);
        q("INSERT INTO ingredient_moves (ingredient_id, kind, qty, cost, amount, note, user_id, created_at) VALUES (?, 'in', ?, ?, ?, ?, ?, ?)")
          .run(r.id, qty, price, amount, note, user.id, now());
        if (price !== r.cost) recostDishes(r.id);
        lines.push(`${r.name} ${qty} ${r.unit}`);
      }
      if (method && total > 0) {
        q("INSERT INTO transactions (type, category, amount, method, note, user_id, created_at) VALUES ('expense', 'Mahsulotlar', ?, ?, ?, ?, ?)")
          .run(total, method, `Omborga kirim: ${lines.join(', ')}`.slice(0, 300), user.id, now());
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    audit(user, 'stock_in', `${lines.join(', ')} = ${total}`);
    if (method) events.publish('finance');
    events.publish('inventory');
    return { ok: true, total };
  }

  // Spoiled or lost goods (with a reason), or a count that sets the real amount.
  function adjust({ user, body }) {
    need('inventory', 'Masalliq ombori');
    const r = ingredientRow(int(body.ingredient_id, 'Masalliq', { min: 1, required: true }));
    const kind = body.kind === 'count' ? 'count' : 'writeoff';
    const note = str(body.note, 'Sabab', { max: 200 });
    let delta;
    if (kind === 'count') {
      const actual = num(body.qty, 'Haqiqiy qoldiq', { required: true });
      delta = Math.round((actual - r.stock) * 1000) / 1000;
    } else {
      if (!note) throw new HttpError(400, 'Hisobdan chiqarish sababini yozing');
      delta = -num(body.qty, 'Miqdor', { min: 0.001, required: true });
    }
    q('UPDATE ingredients SET stock = stock + ? WHERE id = ?').run(delta, r.id);
    q('INSERT INTO ingredient_moves (ingredient_id, kind, qty, cost, amount, note, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(r.id, kind, delta, r.cost, Math.round(delta * r.cost), note, user.id, now());
    audit(user, kind === 'count' ? 'stock_count' : 'stock_writeoff', `${r.name}: ${delta} ${r.unit}${note ? ` (${note})` : ''}`);
    events.publish('inventory');
    return ingredientRow(r.id);
  }

  function listMoves({ query }) {
    need('inventory', 'Masalliq ombori');
    const where = ['1 = 1'];
    const params = [];
    if (query.ingredient_id) { where.push('m.ingredient_id = ?'); params.push(Number(query.ingredient_id)); }
    if (query.kind) { where.push('m.kind = ?'); params.push(String(query.kind)); }
    return q(`SELECT m.*, i.name ingredient, i.unit, u.name user_name FROM ingredient_moves m JOIN ingredients i ON i.id = m.ingredient_id
      LEFT JOIN users u ON u.id = m.user_id WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT 300`).all(...params);
  }

  // Recipe (tex-karta): ingredients per one portion. The dish's cost follows it.
  function recipeOf(dishId) {
    return q(`SELECT di.ingredient_id, di.qty, i.name, i.unit, i.cost FROM dish_ingredients di JOIN ingredients i ON i.id = di.ingredient_id AND i.active = 1
      WHERE di.dish_id = ? ORDER BY i.name`).all(dishId);
  }
  const recipeCost = (rows) => Math.round(rows.reduce((s, r) => s + r.qty * r.cost, 0));
  function getRecipe({ params }) {
    need('inventory', 'Masalliq ombori');
    const rows = recipeOf(params.id);
    return { items: rows, cost: recipeCost(rows) };
  }
  function setRecipe({ user, params, body }) {
    need('inventory', 'Masalliq ombori');
    const dish = q('SELECT * FROM dishes WHERE id = ? AND active = 1').get(params.id);
    if (!dish) throw new HttpError(404, 'Taom topilmadi');
    if (!Array.isArray(body.items)) throw new HttpError(400, "Tex-karta noto'g'ri");
    db.exec('BEGIN');
    try {
      q('DELETE FROM dish_ingredients WHERE dish_id = ?').run(dish.id);
      const ins = q('INSERT OR REPLACE INTO dish_ingredients (dish_id, ingredient_id, qty) VALUES (?, ?, ?)');
      for (const it of body.items) {
        const r = ingredientRow(int(it.ingredient_id, 'Masalliq', { min: 1, required: true }));
        ins.run(dish.id, r.id, num(it.qty, `${r.name}: miqdor`, { min: 0.0001, required: true }));
      }
      const rows = recipeOf(dish.id);
      if (rows.length) q('UPDATE dishes SET cost = ? WHERE id = ?').run(recipeCost(rows), dish.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    audit(user, 'recipe_set', dish.name);
    events.publish('menu');
    return getRecipe({ params });
  }
  function recostDishes(ingredientId) {
    for (const d of q('SELECT DISTINCT dish_id FROM dish_ingredients WHERE ingredient_id = ?').all(ingredientId)) {
      q('UPDATE dishes SET cost = ? WHERE id = ?').run(recipeCost(recipeOf(d.dish_id)), d.dish_id);
    }
  }

  // Every closed check takes its dishes' ingredients from stock (sign -1); a refund puts them back (+1).
  function consume(orderId, lines, sign = -1, userId = null) {
    if (!moduleOn('inventory')) return;
    const totals = new Map();
    for (const l of lines) {
      if (!l.dish_id || !l.qty) continue;
      for (const r of q('SELECT ingredient_id, qty FROM dish_ingredients WHERE dish_id = ?').all(l.dish_id)) {
        totals.set(r.ingredient_id, (totals.get(r.ingredient_id) || 0) + r.qty * l.qty);
      }
    }
    const low = [];
    for (const [id, qty] of totals) {
      const r = q('SELECT * FROM ingredients WHERE id = ? AND active = 1').get(id);
      if (!r) continue;
      const delta = Math.round(sign * qty * 1000) / 1000;
      q('UPDATE ingredients SET stock = stock + ? WHERE id = ?').run(delta, id);
      q('INSERT INTO ingredient_moves (ingredient_id, kind, qty, cost, amount, order_id, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, sign < 0 ? 'sale' : 'refund', delta, r.cost, Math.round(delta * r.cost), orderId, userId, now());
      const left = r.stock + delta;
      if (sign < 0 && r.min_stock > 0 && left <= r.min_stock && r.stock > r.min_stock) low.push(`${r.name}: ${Math.max(0, Math.round(left * 100) / 100)} ${r.unit}`);
    }
    if (low.length) events.publish('stock_low', { items: low }, { roles: ['owner', 'admin', 'cashier', 'chef'] });
  }

  return {
    listCustomers, saveCustomer, customerDetail, payDebt, preparePayment, afterPayment,
    listIngredients, saveIngredient, deleteIngredient, receive, adjust, listMoves, getRecipe, setRecipe, consume, DEBT_PAYMENT,
  };
}

module.exports = { createPro };
