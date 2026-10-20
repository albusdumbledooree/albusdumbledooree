'use strict';
const { hashPassword, verifyPassword, newToken, HttpError, str, int } = require('./util');
const events = require('./events');

const ROLES = ['owner', 'admin', 'cashier', 'waiter', 'chef'];
const MANAGERS = ['owner', 'admin'];
const MONEY = ['owner', 'admin', 'cashier'];
const STOPLIST = ['owner', 'admin', 'cashier', 'chef'];
const KITCHEN = ['owner', 'admin', 'chef'];
const ROLE_NAMES = { owner: 'Ega', admin: 'Admin', cashier: 'Kassir', waiter: 'Ofitsant', chef: 'Oshpaz' };
const METHODS = ['cash', 'card', 'transfer'];
const MIN = 60_000;

function createApi(db) {
  const q = (sql) => db.prepare(sql);
  const now = () => Date.now();

  function tx(fn) {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  function audit(user, action, details = '') {
    q('INSERT INTO audit (user_id, action, details, created_at) VALUES (?, ?, ?, ?)').run(
      user ? user.id : null, action, typeof details === 'string' ? details : JSON.stringify(details), now()
    );
  }

  function settings() {
    const out = {};
    for (const r of q('SELECT key, value FROM settings').all()) out[r.key] = r.value;
    out.service_pct = Number(out.service_pct) || 0;
    out.demo = out.demo || '0';
    out.expense_categories = JSON.parse(out.expense_categories || '[]');
    out.income_categories = JSON.parse(out.income_categories || '[]');
    return out;
  }

  function publicUser(u) {
    return { id: u.id, name: u.name, username: u.username, role: u.role, phone: u.phone, salary: u.salary, active: u.active };
  }

  // ---------- Auth ----------
  function authenticate(token) {
    if (!token) return null;
    const row = q(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.active = 1`).get(token);
    return row || null;
  }

  // Brute-force protection: 8 wrong passwords per login+IP lock it for 10 minutes.
  const failures = new Map();
  function login({ body, ip }) {
    const username = str(body.username, 'Login', { required: true });
    const password = str(body.password, 'Parol', { required: true });
    const key = `${username.toLowerCase()}|${ip}`;
    const f = failures.get(key);
    if (f && f.count >= 8 && now() - f.first < 10 * MIN) {
      throw new HttpError(429, "Juda ko'p urinish. 10 daqiqadan keyin qayta urinib ko'ring");
    }
    const user = q('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
    if (!user || !verifyPassword(password, user.pass_hash)) {
      const fresh = !f || now() - f.first >= 10 * MIN;
      failures.set(key, fresh ? { count: 1, first: now() } : { ...f, count: f.count + 1 });
      if (failures.size > 10000) failures.clear();
      throw new HttpError(401, "Login yoki parol noto'g'ri");
    }
    failures.delete(key);
    const token = newToken();
    q('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, user.id, now());
    audit(user, 'login');
    return { token, user: publicUser(user) };
  }

  function logout({ token }) {
    q('DELETE FROM sessions WHERE token = ?').run(token);
    return { ok: true };
  }

  // Public info for the login screen. Demo shortcuts are shown only on a demo database.
  function info() {
    const s = settings();
    return { name: s.name, demo: s.demo === '1' };
  }

  function me({ user }) {
    return { user: publicUser(user), settings: settings() };
  }

  function changeOwnPassword({ user, body }) {
    const old = str(body.old_password, 'Eski parol', { required: true });
    const pw = str(body.new_password, 'Yangi parol', { required: true });
    if (pw.length < 4) throw new HttpError(400, "Parol kamida 4 ta belgi bo'lsin");
    if (!verifyPassword(old, user.pass_hash)) throw new HttpError(400, "Eski parol noto'g'ri");
    q('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(pw), user.id);
    audit(user, 'password_change');
    return { ok: true };
  }

  // ---------- Settings ----------
  function updateSettings({ user, body }) {
    const allowed = ['name', 'address', 'phone', 'service_pct', 'currency', 'receipt_footer', 'expense_categories', 'income_categories'];
    const set = q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const k of allowed) {
      if (body[k] === undefined) continue;
      let v = body[k];
      if (k === 'service_pct') {
        v = Number(v);
        if (!(v >= 0 && v <= 50)) throw new HttpError(400, "Xizmat haqi 0–50% oralig'ida bo'lsin");
      }
      if (k.endsWith('_categories')) {
        if (!Array.isArray(v)) throw new HttpError(400, "Kategoriyalar ro'yxat bo'lishi kerak");
        v = JSON.stringify(v.map((x) => str(x, 'Kategoriya', { max: 60 })).filter(Boolean));
      }
      set.run(k, String(v));
    }
    audit(user, 'settings_update', body);
    events.publish('settings');
    return settings();
  }

  // ---------- Users ----------
  function canManageRole(actor, role) {
    if (actor.role === 'owner') return true;
    return actor.role === 'admin' && ['cashier', 'waiter', 'chef'].includes(role);
  }

  function listUsers() {
    const users = q('SELECT * FROM users ORDER BY active DESC, role, name').all().map(publicUser);
    const rooms = q('SELECT rw.user_id, r.id, r.number, r.name FROM room_waiters rw JOIN rooms r ON r.id = rw.room_id').all();
    for (const u of users) u.rooms = rooms.filter((r) => r.user_id === u.id).map(({ id, number, name }) => ({ id, number, name }));
    return users;
  }

  function createUser({ user, body }) {
    const role = str(body.role, 'Lavozim', { required: true });
    if (!ROLES.includes(role)) throw new HttpError(400, "Lavozim noto'g'ri");
    if (!canManageRole(user, role)) throw new HttpError(403, `Sizda ${ROLE_NAMES[role]} tayinlash huquqi yo'q`);
    const name = str(body.name, 'Ism', { required: true, max: 80 });
    const username = str(body.username, 'Login', { required: true, max: 40 });
    const password = str(body.password, 'Parol', { required: true });
    if (password.length < 4) throw new HttpError(400, "Parol kamida 4 ta belgi bo'lsin");
    if (q('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'Bu login band');
    const id = q('INSERT INTO users (name, username, pass_hash, role, phone, salary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      name, username, hashPassword(password), role, str(body.phone, 'Telefon', { max: 30 }), int(body.salary, 'Maosh'), now()
    ).lastInsertRowid;
    audit(user, 'user_create', `${name} (${ROLE_NAMES[role]})`);
    return publicUser(q('SELECT * FROM users WHERE id = ?').get(id));
  }

  function updateUser({ user, params, body }) {
    const target = q('SELECT * FROM users WHERE id = ?').get(params.id);
    if (!target) throw new HttpError(404, 'Xodim topilmadi');
    if (!canManageRole(user, target.role)) throw new HttpError(403, "Bu xodimni o'zgartirish huquqi yo'q");
    const role = body.role !== undefined ? str(body.role, 'Lavozim') : target.role;
    if (!ROLES.includes(role) || !canManageRole(user, role)) throw new HttpError(403, "Bu lavozimni berish huquqi yo'q");
    if (target.id === user.id && (role !== target.role || body.active === false || body.active === 0)) {
      throw new HttpError(400, "O'zingizning lavozimingizni yoki holatingizni o'zgartira olmaysiz");
    }
    if (target.role === 'owner' && role !== 'owner') {
      const owners = q("SELECT COUNT(*) c FROM users WHERE role = 'owner' AND active = 1").get().c;
      if (owners <= 1) throw new HttpError(400, "Kamida bitta ega qolishi kerak");
    }
    const username = body.username !== undefined ? str(body.username, 'Login', { required: true, max: 40 }) : target.username;
    if (username.toLowerCase() !== target.username.toLowerCase() && q('SELECT 1 FROM users WHERE username = ?').get(username)) {
      throw new HttpError(409, 'Bu login band');
    }
    const active = body.active === undefined ? target.active : body.active ? 1 : 0;
    q('UPDATE users SET name = ?, username = ?, role = ?, phone = ?, salary = ?, active = ? WHERE id = ?').run(
      body.name !== undefined ? str(body.name, 'Ism', { required: true, max: 80 }) : target.name,
      username, role,
      body.phone !== undefined ? str(body.phone, 'Telefon', { max: 30 }) : target.phone,
      body.salary !== undefined ? int(body.salary, 'Maosh') : target.salary,
      active, target.id
    );
    if (body.password) {
      const pw = str(body.password, 'Parol');
      if (pw.length < 4) throw new HttpError(400, "Parol kamida 4 ta belgi bo'lsin");
      q('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(pw), target.id);
    }
    if (!active || body.password || role !== target.role) {
      q('DELETE FROM sessions WHERE user_id = ?').run(target.id);
      events.disconnectUser(target.id);
    }
    audit(user, 'user_update', `${target.name}: ${JSON.stringify({ ...body, password: body.password ? '***' : undefined })}`);
    return publicUser(q('SELECT * FROM users WHERE id = ?').get(target.id));
  }

  // ---------- Rooms ----------
  function waiterRoomIds(userId) {
    return q('SELECT room_id FROM room_waiters WHERE user_id = ?').all(userId).map((r) => r.room_id);
  }

  function listRooms({ user, query }) {
    let rooms = q('SELECT * FROM rooms WHERE active = 1 OR ? = 1 ORDER BY CAST(number AS INTEGER), number').all(query.all ? 1 : 0);
    if (user.role === 'waiter' && !query.all) {
      const mine = new Set(waiterRoomIds(user.id));
      rooms = rooms.filter((r) => mine.has(r.id));
    }
    const waiters = q("SELECT rw.room_id, u.id, u.name FROM room_waiters rw JOIN users u ON u.id = rw.user_id WHERE u.active = 1").all();
    const openOrders = q("SELECT o.*, u.name waiter_name FROM orders o JOIN users u ON u.id = o.waiter_id WHERE o.status = 'open'").all();
    const counts = q(`SELECT i.order_id, i.status, COUNT(*) c, SUM(i.price * i.qty) s FROM order_items i
      JOIN orders o ON o.id = i.order_id WHERE o.status = 'open' GROUP BY i.order_id, i.status`).all();
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const resv = q(`SELECT * FROM reservations WHERE status = 'active' AND starts_at >= ? AND starts_at < ? ORDER BY starts_at`)
      .all(dayStart.getTime(), dayStart.getTime() + 24 * 60 * MIN);
    return rooms.map((r) => {
      const order = openOrders.find((o) => o.room_id === r.id) || null;
      let summary = null;
      if (order) {
        const st = { new: 0, cooking: 0, ready: 0, served: 0 };
        let subtotal = 0;
        for (const c of counts.filter((c) => c.order_id === order.id)) {
          if (c.status !== 'cancelled') { st[c.status] = c.c; subtotal += c.s; }
        }
        summary = { id: order.id, guests: order.guests, opened_at: order.opened_at, waiter_id: order.waiter_id,
          waiter_name: order.waiter_name, bill_requested: order.bill_requested, subtotal, items: st };
      }
      return { ...r, waiters: waiters.filter((w) => w.room_id === r.id).map(({ id, name }) => ({ id, name })),
        order: summary, reservations: resv.filter((x) => x.room_id === r.id) };
    });
  }

  function saveRoomWaiters(roomId, ids) {
    if (!Array.isArray(ids)) return;
    q('DELETE FROM room_waiters WHERE room_id = ?').run(roomId);
    const ins = q('INSERT OR IGNORE INTO room_waiters (room_id, user_id) VALUES (?, ?)');
    for (const id of ids) {
      const u = q('SELECT role FROM users WHERE id = ?').get(id);
      if (!u || u.role !== 'waiter') throw new HttpError(400, 'Faqat ofitsantni biriktirish mumkin');
      ins.run(roomId, id);
    }
  }

  function roomFields(body, prev = {}) {
    const type = body.type !== undefined ? str(body.type, 'Turi') : prev.type || 'banket';
    if (!['banket', 'vip', 'supa', 'stol', 'zal', 'boshqa'].includes(type)) throw new HttpError(400, "Xona turi noto'g'ri");
    return {
      number: body.number !== undefined ? str(body.number, 'Raqam', { required: true, max: 10 }) : prev.number,
      name: body.name !== undefined ? str(body.name, 'Nomi', { required: true, max: 60 }) : prev.name,
      type,
      capacity: body.capacity !== undefined ? int(body.capacity, "Sig'imi", { min: 1, max: 1000 }) : prev.capacity || 10,
    };
  }

  function createRoom({ user, body }) {
    const f = roomFields(body);
    if (!f.number || !f.name) throw new HttpError(400, 'Raqam va nom kiritilishi kerak');
    const id = tx(() => {
      const id = q('INSERT INTO rooms (number, name, type, capacity) VALUES (?, ?, ?, ?)').run(f.number, f.name, f.type, f.capacity).lastInsertRowid;
      saveRoomWaiters(id, body.waiter_ids);
      return id;
    });
    audit(user, 'room_create', f.name);
    events.publish('rooms');
    return q('SELECT * FROM rooms WHERE id = ?').get(id);
  }

  function updateRoom({ user, params, body }) {
    const prev = q('SELECT * FROM rooms WHERE id = ?').get(params.id);
    if (!prev) throw new HttpError(404, 'Xona topilmadi');
    const f = roomFields(body, prev);
    const active = body.active === undefined ? prev.active : body.active ? 1 : 0;
    tx(() => {
      q('UPDATE rooms SET number = ?, name = ?, type = ?, capacity = ?, active = ? WHERE id = ?').run(f.number, f.name, f.type, f.capacity, active, prev.id);
      saveRoomWaiters(prev.id, body.waiter_ids);
    });
    audit(user, 'room_update', f.name);
    events.publish('rooms');
    return q('SELECT * FROM rooms WHERE id = ?').get(prev.id);
  }

  // ---------- Menu ----------
  function kitchenLoad() {
    const pending = q("SELECT COUNT(*) c FROM order_items WHERE status = 'new' AND needs_kitchen = 1").get().c;
    const cooking = q("SELECT COUNT(*) c FROM order_items WHERE status = 'cooking'").get().c;
    const chefs = Math.max(1, q("SELECT COUNT(*) c FROM users WHERE role = 'chef' AND active = 1").get().c);
    // Each chef handles a few dishes in parallel; waiting dishes add queue delay.
    const extra = Math.min(40, Math.round((pending * 3 + cooking) / (chefs * 2)));
    return { pending, cooking, chefs, extra_minutes: extra };
  }

  function menu() {
    const load = kitchenLoad();
    const categories = q('SELECT * FROM categories ORDER BY sort, name').all();
    const dishes = q(`SELECT d.* FROM dishes d LEFT JOIN categories c ON c.id = d.category_id
      WHERE d.active = 1 ORDER BY COALESCE(c.sort, 9999), d.name`).all().map((d) => ({
      ...d, eta_minutes: d.needs_kitchen ? d.prep_minutes + load.extra_minutes : 0,
    }));
    return { categories, dishes, load };
  }

  function saveCategory({ user, params, body }) {
    const name = str(body.name, 'Nomi', { required: true, max: 60 });
    const icon = str(body.icon, 'Belgi', { max: 8 });
    const sort = int(body.sort, 'Tartib', { max: 1000 });
    let id = params.id;
    if (id) {
      if (!q('UPDATE categories SET name = ?, icon = ?, sort = ? WHERE id = ?').run(name, icon, sort, id).changes) throw new HttpError(404, 'Topilmadi');
    } else {
      id = q('INSERT INTO categories (name, icon, sort) VALUES (?, ?, ?)').run(name, icon, sort).lastInsertRowid;
    }
    audit(user, 'category_save', name);
    events.publish('menu');
    return q('SELECT * FROM categories WHERE id = ?').get(id);
  }

  function deleteCategory({ user, params }) {
    if (q('SELECT 1 FROM dishes WHERE category_id = ? AND active = 1').get(params.id)) {
      throw new HttpError(400, "Avval bu bo'limdagi taomlarni o'chiring yoki ko'chiring");
    }
    q('DELETE FROM categories WHERE id = ?').run(params.id);
    audit(user, 'category_delete', params.id);
    events.publish('menu');
    return { ok: true };
  }

  function saveDish({ user, params, body }) {
    const prev = params.id ? q('SELECT * FROM dishes WHERE id = ? AND active = 1').get(params.id) : {};
    if (!prev) throw new HttpError(404, 'Taom topilmadi');
    const pick = (k, fn) => (body[k] !== undefined ? fn(body[k]) : prev[k]);
    const d = {
      category_id: pick('category_id', (v) => (v ? int(v, "Bo'lim", { min: 1 }) : null)) ?? null,
      name: pick('name', (v) => str(v, 'Nomi', { required: true, max: 80 })),
      price: pick('price', (v) => int(v, 'Narxi', { required: true })),
      cost: pick('cost', (v) => int(v, 'Tannarxi')) ?? 0,
      prep_minutes: pick('prep_minutes', (v) => int(v, 'Tayyorlash vaqti', { max: 600 })) ?? 10,
      unit: pick('unit', (v) => str(v, "O'lchov", { max: 20 }) || 'porsiya') ?? 'porsiya',
      needs_kitchen: pick('needs_kitchen', (v) => (v ? 1 : 0)) ?? 1,
      icon: pick('icon', (v) => str(v, 'Belgi', { max: 8 })) ?? '',
      stock: pick('stock', (v) => (v === null || v === '' ? null : int(v, 'Qoldiq'))) ?? null,
    };
    if (!d.name || d.price == null) throw new HttpError(400, 'Nomi va narxi kiritilishi kerak');
    let id = prev.id;
    if (id) {
      q(`UPDATE dishes SET category_id = ?, name = ?, price = ?, cost = ?, prep_minutes = ?, unit = ?, needs_kitchen = ?, icon = ?, stock = ?,
        available = CASE WHEN ? = 0 THEN 0 ELSE available END WHERE id = ?`).run(
        d.category_id, d.name, d.price, d.cost, d.prep_minutes, d.unit, d.needs_kitchen, d.icon, d.stock, d.stock ?? 1, id
      );
      if (prev.price !== d.price) audit(user, 'price_change', `${d.name}: ${prev.price} → ${d.price}`);
    } else {
      id = q(`INSERT INTO dishes (category_id, name, price, cost, prep_minutes, unit, needs_kitchen, icon, stock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(d.category_id, d.name, d.price, d.cost, d.prep_minutes, d.unit, d.needs_kitchen, d.icon, d.stock).lastInsertRowid;
    }
    audit(user, prev.id ? 'dish_update' : 'dish_create', d.name);
    events.publish('menu');
    return q('SELECT * FROM dishes WHERE id = ?').get(id);
  }

  function deleteDish({ user, params }) {
    const d = q('SELECT * FROM dishes WHERE id = ?').get(params.id);
    if (!d) throw new HttpError(404, 'Taom topilmadi');
    q('UPDATE dishes SET active = 0 WHERE id = ?').run(d.id);
    audit(user, 'dish_delete', d.name);
    events.publish('menu');
    return { ok: true };
  }

  // "Tugadi" / "Bor" — stop-list. Chef, cashier, admin, owner.
  function setAvailability({ user, params, body }) {
    const d = q('SELECT * FROM dishes WHERE id = ? AND active = 1').get(params.id);
    if (!d) throw new HttpError(404, 'Taom topilmadi');
    const available = body.available ? 1 : 0;
    let stock = d.stock;
    if (body.stock !== undefined) stock = body.stock === null || body.stock === '' ? null : int(body.stock, 'Qoldiq');
    if (available && stock === 0) stock = null;
    q('UPDATE dishes SET available = ?, stock = ? WHERE id = ?').run(available, stock, d.id);
    audit(user, available ? 'dish_available' : 'dish_stopped', d.name);
    events.publish('menu', { dish_id: d.id, name: d.name, available, by: user.name });
    if (!available) events.publish('stoplist', { name: d.name, by: user.name });
    return q('SELECT * FROM dishes WHERE id = ?').get(d.id);
  }

  // ---------- Orders ----------
  function getOrderRow(id) {
    const o = q('SELECT * FROM orders WHERE id = ?').get(id);
    if (!o) throw new HttpError(404, 'Buyurtma topilmadi');
    return o;
  }

  function assertOrderAccess(user, order) {
    if (user.role !== 'waiter') return;
    if (order.waiter_id === user.id) return;
    if (waiterRoomIds(user.id).includes(order.room_id)) return;
    throw new HttpError(403, 'Bu buyurtma sizga tegishli emas');
  }

  function totals(order, items, overrides = {}) {
    const subtotal = items.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + i.price * i.qty, 0);
    const service_pct = overrides.service_pct ?? (order.status === 'open' ? settings().service_pct : order.service_pct);
    const service_amount = Math.round((subtotal * service_pct) / 100);
    const discount = Math.min(overrides.discount ?? order.discount ?? 0, subtotal + service_amount);
    return { subtotal, service_pct, service_amount, discount, total: subtotal + service_amount - discount };
  }

  function orderDetails(id) {
    const order = getOrderRow(id);
    const items = q(`SELECT i.*, u.name chef_name FROM order_items i LEFT JOIN users u ON u.id = i.chef_id
      WHERE i.order_id = ? ORDER BY i.created_at, i.id`).all(id);
    const room = q('SELECT * FROM rooms WHERE id = ?').get(order.room_id);
    const waiter = q('SELECT id, name FROM users WHERE id = ?').get(order.waiter_id);
    const cashier = order.cashier_id ? q('SELECT id, name FROM users WHERE id = ?').get(order.cashier_id) : null;
    const t = order.status === 'open' ? totals(order, items) : order;
    return { ...order, ...{ subtotal: t.subtotal, service_pct: t.service_pct, service_amount: t.service_amount, discount: t.discount, total: t.total },
      items, room, waiter, cashier };
  }

  function listOrders({ user, query }) {
    const status = query.status || 'open';
    const params = [status];
    let where = 'o.status = ?';
    if (query.from) { where += ' AND COALESCE(o.closed_at, o.opened_at) >= ?'; params.push(Number(query.from)); }
    if (query.to) { where += ' AND COALESCE(o.closed_at, o.opened_at) < ?'; params.push(Number(query.to)); }
    if (user.role === 'waiter') {
      where += ' AND (o.waiter_id = ? OR o.room_id IN (SELECT room_id FROM room_waiters WHERE user_id = ?))';
      params.push(user.id, user.id);
    }
    const rows = q(`SELECT o.*, r.name room_name, r.number room_number, w.name waiter_name, c.name cashier_name
      FROM orders o JOIN rooms r ON r.id = o.room_id JOIN users w ON w.id = o.waiter_id LEFT JOIN users c ON c.id = o.cashier_id
      WHERE ${where} ORDER BY o.bill_requested DESC, COALESCE(o.closed_at, o.opened_at) DESC LIMIT 500`).all(...params);
    if (status !== 'open') return rows;
    const items = q("SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status = 'open'").all();
    return rows.map((o) => {
      const its = items.filter((i) => i.order_id === o.id);
      return { ...o, ...totals(o, its), pending: its.filter((i) => ['new', 'cooking', 'ready'].includes(i.status)).length };
    });
  }

  function getOrder({ user, params }) {
    const o = orderDetails(params.id);
    assertOrderAccess(user, o);
    return o;
  }

  function openOrder({ user, body }) {
    const roomId = int(body.room_id, 'Xona', { min: 1, required: true });
    const room = q('SELECT * FROM rooms WHERE id = ? AND active = 1').get(roomId);
    if (!room) throw new HttpError(404, 'Xona topilmadi');
    if (user.role === 'waiter' && !waiterRoomIds(user.id).includes(roomId)) throw new HttpError(403, 'Bu xona sizga biriktirilmagan');
    const existing = q("SELECT id FROM orders WHERE room_id = ? AND status = 'open'").get(roomId);
    if (existing) return orderDetails(existing.id);
    let waiterId = user.id;
    if (user.role !== 'waiter') {
      const assigned = q("SELECT u.id FROM room_waiters rw JOIN users u ON u.id = rw.user_id WHERE rw.room_id = ? AND u.active = 1").get(roomId);
      waiterId = body.waiter_id ? int(body.waiter_id, 'Ofitsant', { min: 1 }) : assigned ? assigned.id : user.id;
    }
    const id = q('INSERT INTO orders (room_id, waiter_id, guests, note, opened_at) VALUES (?, ?, ?, ?, ?)').run(
      roomId, waiterId, int(body.guests, 'Mehmonlar', { min: 1, max: 1000, def: 1 }), str(body.note, 'Izoh', { max: 300 }), now()
    ).lastInsertRowid;
    audit(user, 'order_open', `#${id} ${room.name}`);
    events.publish('rooms');
    return orderDetails(id);
  }

  function updateOrder({ user, params, body }) {
    const o = getOrderRow(params.id);
    assertOrderAccess(user, o);
    if (o.status !== 'open') throw new HttpError(400, 'Buyurtma yopilgan');
    q('UPDATE orders SET guests = ?, note = ? WHERE id = ?').run(
      body.guests !== undefined ? int(body.guests, 'Mehmonlar', { min: 1, max: 1000 }) : o.guests,
      body.note !== undefined ? str(body.note, 'Izoh', { max: 300 }) : o.note, o.id
    );
    events.publish('rooms');
    return orderDetails(o.id);
  }

  function addItems({ user, params, body }) {
    const o = getOrderRow(params.id);
    assertOrderAccess(user, o);
    if (o.status !== 'open') throw new HttpError(400, 'Buyurtma yopilgan');
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, "Taom tanlanmagan");
    const load = kitchenLoad();
    const t = now();
    const added = tx(() => {
      const out = [];
      for (const it of body.items) {
        const d = q('SELECT * FROM dishes WHERE id = ? AND active = 1').get(int(it.dish_id, 'Taom', { min: 1, required: true }));
        if (!d) throw new HttpError(404, 'Taom topilmadi');
        const qty = int(it.qty, 'Soni', { min: 1, max: 999, def: 1 });
        if (!d.available) throw new HttpError(409, `"${d.name}" tugagan`);
        if (d.stock !== null && d.stock < qty) throw new HttpError(409, `"${d.name}" dan faqat ${d.stock} ta qoldi`);
        if (d.stock !== null) {
          const left = d.stock - qty;
          q('UPDATE dishes SET stock = ?, available = ? WHERE id = ?').run(left, left > 0 ? 1 : 0, d.id);
          if (left === 0) events.publish('stoplist', { name: d.name, by: 'Tizim' });
        }
        const kitchen = d.needs_kitchen === 1;
        const id = q(`INSERT INTO order_items (order_id, dish_id, name, price, cost, qty, note, status, needs_kitchen, prep_minutes, created_at, eta_at, served_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          o.id, d.id, d.name, d.price, d.cost, qty, str(it.note, 'Izoh', { max: 200 }), kitchen ? 'new' : 'served', kitchen ? 1 : 0,
          d.prep_minutes, t, kitchen ? t + (d.prep_minutes + load.extra_minutes) * MIN : null, kitchen ? null : t
        ).lastInsertRowid;
        out.push({ id, name: d.name, qty, kitchen });
      }
      q('UPDATE orders SET bill_requested = 0 WHERE id = ?').run(o.id);
      return out;
    });
    const room = q('SELECT name FROM rooms WHERE id = ?').get(o.room_id);
    const kitchenItems = added.filter((a) => a.kitchen);
    audit(user, 'items_add', `#${o.id}: ${added.map((a) => `${a.name}×${a.qty}`).join(', ')}`);
    if (kitchenItems.length) {
      events.publish('kitchen_new', { order_id: o.id, room: room.name, items: kitchenItems }, { roles: KITCHEN });
    }
    events.publish('rooms');
    if (added.some((a) => !a.kitchen)) events.publish('menu');
    return orderDetails(o.id);
  }

  function getItem(id) {
    const it = q(`SELECT i.*, o.room_id, o.waiter_id, o.status order_status, r.name room_name, r.number room_number
      FROM order_items i JOIN orders o ON o.id = i.order_id JOIN rooms r ON r.id = o.room_id WHERE i.id = ?`).get(id);
    if (!it) throw new HttpError(404, 'Taom topilmadi');
    return it;
  }

  function acceptItem({ user, params }) {
    const it = getItem(params.id);
    if (it.status !== 'new') throw new HttpError(409, 'Bu taom allaqachon qabul qilingan');
    const t = now();
    q("UPDATE order_items SET status = 'cooking', accepted_at = ?, chef_id = ?, eta_at = ? WHERE id = ?").run(t, user.id, t + it.prep_minutes * MIN, it.id);
    events.publish('item_accepted', { item_id: it.id, name: it.name, room: it.room_name, eta_at: t + it.prep_minutes * MIN, chef: user.name },
      { userIds: [it.waiter_id] });
    events.publish('kitchen');
    events.publish('rooms');
    return getItem(it.id);
  }

  function readyItem({ user, params }) {
    const it = getItem(params.id);
    if (!['new', 'cooking'].includes(it.status)) throw new HttpError(409, 'Bu taom tayyorlanish holatida emas');
    const t = now();
    q("UPDATE order_items SET status = 'ready', ready_at = ?, accepted_at = COALESCE(accepted_at, ?), chef_id = COALESCE(chef_id, ?) WHERE id = ?")
      .run(t, t, user.id, it.id);
    audit(user, 'item_ready', `#${it.order_id} ${it.name}×${it.qty}`);
    events.publish('item_ready', {
      item_id: it.id, order_id: it.order_id, name: it.name, qty: it.qty,
      room: it.room_name, room_number: it.room_number, waiter_id: it.waiter_id,
    }, { userIds: [it.waiter_id], roles: ['owner', 'admin'] });
    events.publish('kitchen');
    events.publish('rooms');
    return getItem(it.id);
  }

  function serveItem({ user, params }) {
    const it = getItem(params.id);
    if (user.role === 'waiter') assertOrderAccess(user, { waiter_id: it.waiter_id, room_id: it.room_id });
    if (it.status !== 'ready') throw new HttpError(409, 'Taom hali tayyor emas');
    q("UPDATE order_items SET status = 'served', served_at = ? WHERE id = ?").run(now(), it.id);
    events.publish('kitchen');
    events.publish('rooms');
    return getItem(it.id);
  }

  function cancelItem({ user, params, body }) {
    const it = getItem(params.id);
    if (it.order_status !== 'open') throw new HttpError(400, 'Buyurtma yopilgan');
    if (it.status === 'cancelled') throw new HttpError(409, 'Allaqachon bekor qilingan');
    if (user.role === 'waiter') {
      assertOrderAccess(user, { waiter_id: it.waiter_id, room_id: it.room_id });
      if (it.status !== 'new' && it.needs_kitchen) throw new HttpError(403, "Oshpaz qabul qilgan taomni faqat kassir yoki admin bekor qiladi");
      if (!it.needs_kitchen && now() - it.created_at > 5 * MIN) throw new HttpError(403, "5 daqiqadan keyin faqat kassir yoki admin bekor qiladi");
    } else if (user.role === 'chef') {
      if (!['new', 'cooking'].includes(it.status)) throw new HttpError(403, "Bu taomni bekor qila olmaysiz");
    }
    const reason = str(body.reason, 'Sabab', { max: 200 });
    if (user.role !== 'waiter' && it.status !== 'new' && !reason) throw new HttpError(400, "Bekor qilish sababini yozing");
    tx(() => {
      q("UPDATE order_items SET status = 'cancelled', cancel_reason = ? WHERE id = ?").run(reason, it.id);
      if (it.dish_id) q('UPDATE dishes SET stock = stock + ?, available = 1 WHERE id = ? AND stock IS NOT NULL').run(it.qty, it.dish_id);
    });
    audit(user, 'item_cancel', `#${it.order_id} ${it.name}×${it.qty} (${it.status}) ${reason}`);
    events.publish('kitchen');
    events.publish('rooms');
    if (it.needs_kitchen && ['new', 'cooking'].includes(it.status)) {
      events.publish('kitchen_cancel', { name: it.name, qty: it.qty, room: it.room_name }, { roles: KITCHEN });
    }
    return orderDetails(it.order_id);
  }

  function requestBill({ user, params }) {
    const o = getOrderRow(params.id);
    assertOrderAccess(user, o);
    if (o.status !== 'open') throw new HttpError(400, 'Buyurtma yopilgan');
    q('UPDATE orders SET bill_requested = 1 WHERE id = ?').run(o.id);
    const room = q('SELECT name FROM rooms WHERE id = ?').get(o.room_id);
    events.publish('bill_requested', { order_id: o.id, room: room.name }, { roles: MONEY });
    events.publish('rooms');
    return orderDetails(o.id);
  }

  function closeOrder({ user, params, body }) {
    const o = getOrderRow(params.id);
    if (o.status !== 'open') throw new HttpError(400, 'Buyurtma allaqachon yopilgan');
    const items = q('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    const unfinished = items.filter((i) => ['new', 'cooking'].includes(i.status));
    if (unfinished.length) throw new HttpError(409, `Hali tayyor bo'lmagan taomlar bor: ${unfinished.map((i) => i.name).join(', ')}`);
    const live = items.filter((i) => i.status !== 'cancelled');
    if (!live.length) throw new HttpError(400, "Chekda taom yo'q. Bo'sh buyurtmani bekor qiling");
    const service_pct = body.service_pct !== undefined ? Number(body.service_pct) : settings().service_pct;
    if (!(service_pct >= 0 && service_pct <= 50)) throw new HttpError(400, "Xizmat haqi noto'g'ri");
    const discount = int(body.discount, 'Chegirma');
    if (discount && !['owner', 'admin', 'cashier'].includes(user.role)) throw new HttpError(403, "Chegirma berish huquqi yo'q");
    const t = totals(o, items, { service_pct, discount });
    const paid = { cash: int(body.paid_cash, 'Naqd'), card: int(body.paid_card, 'Karta'), transfer: int(body.paid_transfer, "O'tkazma") };
    const sumPaid = paid.cash + paid.card + paid.transfer;
    if (sumPaid < t.total) throw new HttpError(400, `To'lov yetarli emas: ${t.total - sumPaid} kam`);
    // Change (qaytim) is given from cash, so the recorded cash is reduced by any overpayment.
    const change = sumPaid - t.total;
    if (change > paid.cash) throw new HttpError(400, "Karta yoki o'tkazma bo'yicha ortiqcha to'lov qabul qilinmaydi");
    paid.cash -= change;
    const ts = now();
    tx(() => {
      q("UPDATE order_items SET status = 'served', served_at = ? WHERE order_id = ? AND status = 'ready'").run(ts, o.id);
      q(`UPDATE orders SET status = 'closed', closed_at = ?, cashier_id = ?, subtotal = ?, service_pct = ?, service_amount = ?,
        discount = ?, total = ?, paid_cash = ?, paid_card = ?, paid_transfer = ?, bill_requested = 0 WHERE id = ?`).run(
        ts, user.id, t.subtotal, t.service_pct, t.service_amount, t.discount, t.total, paid.cash, paid.card, paid.transfer, o.id
      );
      const ins = q("INSERT INTO transactions (type, category, amount, method, note, order_id, user_id, created_at) VALUES ('income', 'Savdo', ?, ?, ?, ?, ?, ?)");
      for (const m of METHODS) if (paid[m] > 0) ins.run(paid[m], m, `Chek #${o.id}`, o.id, user.id, ts);
    });
    audit(user, 'order_close', `#${o.id} jami ${t.total}${t.discount ? `, chegirma ${t.discount}` : ''}`);
    events.publish('rooms');
    events.publish('finance');
    return { ...orderDetails(o.id), change };
  }

  function cancelOrder({ user, params, body }) {
    const o = getOrderRow(params.id);
    if (o.status !== 'open') throw new HttpError(400, 'Buyurtma yopilgan');
    const live = q("SELECT COUNT(*) c FROM order_items WHERE order_id = ? AND status != 'cancelled'").get(o.id).c;
    if (live && !MANAGERS.includes(user.role)) throw new HttpError(403, "Taomli buyurtmani faqat ega yoki admin bekor qiladi");
    if (user.role === 'waiter') assertOrderAccess(user, o);
    const reason = str(body.reason, 'Sabab', { max: 200, required: live > 0 });
    tx(() => {
      const items = q("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'").all(o.id);
      for (const it of items) {
        if (it.dish_id) q('UPDATE dishes SET stock = stock + ?, available = 1 WHERE id = ? AND stock IS NOT NULL').run(it.qty, it.dish_id);
      }
      q("UPDATE order_items SET status = 'cancelled', cancel_reason = ? WHERE order_id = ? AND status != 'cancelled'").run(reason, o.id);
      q("UPDATE orders SET status = 'cancelled', closed_at = ?, cancel_reason = ? WHERE id = ?").run(now(), reason, o.id);
    });
    audit(user, 'order_cancel', `#${o.id} ${reason}`);
    events.publish('rooms');
    events.publish('kitchen');
    return { ok: true };
  }

  function transferOrder({ user, params, body }) {
    const o = getOrderRow(params.id);
    if (o.status !== 'open') throw new HttpError(400, 'Buyurtma yopilgan');
    const roomId = int(body.room_id, 'Xona', { min: 1, required: true });
    const room = q('SELECT * FROM rooms WHERE id = ? AND active = 1').get(roomId);
    if (!room) throw new HttpError(404, 'Xona topilmadi');
    if (q("SELECT 1 FROM orders WHERE room_id = ? AND status = 'open'").get(roomId)) throw new HttpError(409, `${room.name} band`);
    q('UPDATE orders SET room_id = ? WHERE id = ?').run(roomId, o.id);
    audit(user, 'order_transfer', `#${o.id} → ${room.name}`);
    events.publish('rooms');
    events.publish('kitchen');
    return orderDetails(o.id);
  }

  // ---------- Kitchen ----------
  function kitchen() {
    const since = now() - 30 * MIN;
    const items = q(`SELECT i.*, o.guests, r.name room_name, r.number room_number, w.name waiter_name, c.name chef_name
      FROM order_items i JOIN orders o ON o.id = i.order_id JOIN rooms r ON r.id = o.room_id
      JOIN users w ON w.id = o.waiter_id LEFT JOIN users c ON c.id = i.chef_id
      WHERE i.needs_kitchen = 1 AND (i.status IN ('new','cooking') OR (i.status = 'ready') OR (i.status = 'served' AND i.served_at > ?))
      ORDER BY i.created_at, i.id`).all(since);
    return { items, load: kitchenLoad(), server_time: now() };
  }

  function myReady({ user }) {
    return q(`SELECT i.*, r.name room_name, r.number room_number FROM order_items i JOIN orders o ON o.id = i.order_id
      JOIN rooms r ON r.id = o.room_id WHERE i.status = 'ready' AND o.status = 'open' AND (o.waiter_id = ? OR ? IN ('owner','admin'))
      ORDER BY i.ready_at`).all(user.id, user.role);
  }

  // ---------- Finance ----------
  function listTransactions({ query }) {
    const from = Number(query.from) || 0;
    const to = Number(query.to) || 8.64e15;
    let sql = `SELECT t.*, u.name user_name FROM transactions t LEFT JOIN users u ON u.id = t.user_id WHERE t.created_at >= ? AND t.created_at < ?`;
    const params = [from, to];
    if (query.type) { sql += ' AND t.type = ?'; params.push(query.type); }
    return q(sql + ' ORDER BY t.created_at DESC LIMIT 2000').all(...params);
  }

  function createTransaction({ user, body }) {
    const type = str(body.type, 'Turi', { required: true });
    if (!['income', 'expense'].includes(type)) throw new HttpError(400, "Turi noto'g'ri");
    const method = str(body.method, "To'lov turi") || 'cash';
    if (!METHODS.includes(method)) throw new HttpError(400, "To'lov turi noto'g'ri");
    const amount = int(body.amount, 'Summa', { min: 1, required: true });
    const category = str(body.category, 'Kategoriya', { required: true, max: 60 });
    const id = q('INSERT INTO transactions (type, category, amount, method, note, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      type, category, amount, method, str(body.note, 'Izoh', { max: 300 }), user.id, now()
    ).lastInsertRowid;
    audit(user, type === 'income' ? 'income_add' : 'expense_add', `${category}: ${amount}`);
    events.publish('finance');
    return q('SELECT * FROM transactions WHERE id = ?').get(id);
  }

  function deleteTransaction({ user, params }) {
    const t = q('SELECT * FROM transactions WHERE id = ?').get(params.id);
    if (!t) throw new HttpError(404, 'Topilmadi');
    if (t.order_id) throw new HttpError(400, "Savdo yozuvini o'chirib bo'lmaydi");
    q('DELETE FROM transactions WHERE id = ?').run(t.id);
    audit(user, 'transaction_delete', `${t.type} ${t.category}: ${t.amount}`);
    events.publish('finance');
    return { ok: true };
  }

  // ---------- Reports ----------
  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function report({ query }) {
    const from = Number(query.from);
    const to = Number(query.to);
    if (!from || !to || to <= from) throw new HttpError(400, "Davr noto'g'ri");
    const orders = q(`SELECT o.*, w.name waiter_name FROM orders o JOIN users w ON w.id = o.waiter_id
      WHERE o.status = 'closed' AND o.closed_at >= ? AND o.closed_at < ?`).all(from, to);
    const items = q(`SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.status = 'closed' AND o.closed_at >= ? AND o.closed_at < ? AND i.status != 'cancelled'`).all(from, to);
    const cancelled = q(`SELECT i.name, i.qty, i.price, i.cancel_reason, i.created_at FROM order_items i
      WHERE i.status = 'cancelled' AND i.created_at >= ? AND i.created_at < ?`).all(from, to);
    const txs = q('SELECT * FROM transactions WHERE created_at >= ? AND created_at < ?').all(from, to);

    const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
    const sales = {
      orders: orders.length,
      guests: sum(orders, (o) => o.guests),
      subtotal: sum(orders, (o) => o.subtotal),
      service: sum(orders, (o) => o.service_amount),
      discount: sum(orders, (o) => o.discount),
      total: sum(orders, (o) => o.total),
      cash: sum(orders, (o) => o.paid_cash),
      card: sum(orders, (o) => o.paid_card),
      transfer: sum(orders, (o) => o.paid_transfer),
      food_cost: sum(items, (i) => i.cost * i.qty),
    };
    sales.avg_check = sales.orders ? Math.round(sales.total / sales.orders) : 0;

    const otherIncome = txs.filter((t) => t.type === 'income' && !t.order_id);
    const expenses = txs.filter((t) => t.type === 'expense');
    const group = (arr, keyFn, valFn) => {
      const m = new Map();
      for (const x of arr) m.set(keyFn(x), (m.get(keyFn(x)) || 0) + valFn(x));
      return [...m.entries()].map(([k, v]) => ({ key: k, value: v })).sort((a, b) => b.value - a.value);
    };
    const totalExpense = sum(expenses, (t) => t.amount);
    const totalOther = sum(otherIncome, (t) => t.amount);

    const dishMap = new Map();
    for (const i of items) {
      const d = dishMap.get(i.name) || { name: i.name, qty: 0, revenue: 0, cost: 0 };
      d.qty += i.qty; d.revenue += i.qty * i.price; d.cost += i.qty * i.cost;
      dishMap.set(i.name, d);
    }
    const waiterMap = new Map();
    for (const o of orders) {
      const w = waiterMap.get(o.waiter_id) || { name: o.waiter_name, orders: 0, total: 0, service: 0, guests: 0 };
      w.orders += 1; w.total += o.total; w.service += o.service_amount; w.guests += o.guests;
      waiterMap.set(o.waiter_id, w);
    }
    // Kitchen speed: average minutes from order to ready.
    const cooked = items.filter((i) => i.needs_kitchen && i.ready_at);
    const avgCook = cooked.length ? Math.round(sum(cooked, (i) => i.ready_at - i.created_at) / cooked.length / MIN) : 0;
    const late = cooked.filter((i) => i.eta_at && i.ready_at > i.eta_at + 2 * MIN).length;

    // Daily series (or hourly if the range is a single day).
    const hourly = to - from <= 24 * 60 * MIN + 1;
    const series = new Map();
    if (hourly) {
      for (let h = 0; h < 24; h++) series.set(String(h).padStart(2, '0'), { income: 0, expense: 0 });
    } else {
      for (let t = from; t < to; t += 24 * 60 * MIN) series.set(dayKey(t), { income: 0, expense: 0 });
    }
    const keyOf = (ts) => (hourly ? String(new Date(ts).getHours()).padStart(2, '0') : dayKey(ts));
    for (const o of orders) { const s = series.get(keyOf(o.closed_at)); if (s) s.income += o.total; }
    for (const t of otherIncome) { const s = series.get(keyOf(t.created_at)); if (s) s.income += t.amount; }
    for (const t of expenses) { const s = series.get(keyOf(t.created_at)); if (s) s.expense += t.amount; }

    return {
      from, to, hourly,
      sales,
      other_income: totalOther,
      other_income_by_category: group(otherIncome, (t) => t.category, (t) => t.amount),
      expense: totalExpense,
      expense_by_category: group(expenses, (t) => t.category, (t) => t.amount),
      gross_income: sales.total + totalOther,
      net_profit: sales.total + totalOther - totalExpense,
      cash_flow: {
        cash_in: sum(txs.filter((t) => t.type === 'income' && t.method === 'cash'), (t) => t.amount),
        cash_out: sum(expenses.filter((t) => t.method === 'cash'), (t) => t.amount),
      },
      dishes: [...dishMap.values()].sort((a, b) => b.revenue - a.revenue),
      waiters: [...waiterMap.values()].sort((a, b) => b.total - a.total),
      rooms: group(orders, (o) => o.room_id, (o) => o.total).map((r) => ({ ...r, name: (q('SELECT name FROM rooms WHERE id = ?').get(r.key) || {}).name })),
      kitchen: { cooked: cooked.length, avg_minutes: avgCook, late },
      cancelled: { count: cancelled.length, amount: sum(cancelled, (c) => c.qty * c.price), items: cancelled.slice(0, 50) },
      series: [...series.entries()].map(([k, v]) => ({ key: k, ...v })),
      orders: orders.map((o) => ({ id: o.id, room_id: o.room_id, waiter: o.waiter_name, guests: o.guests, closed_at: o.closed_at,
        subtotal: o.subtotal, service: o.service_amount, discount: o.discount, total: o.total, cash: o.paid_cash, card: o.paid_card, transfer: o.paid_transfer })),
    };
  }

  function dashboard() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const today = report({ query: { from: d.getTime(), to: d.getTime() + 24 * 60 * MIN } });
    const open = q("SELECT COUNT(*) c FROM orders WHERE status = 'open'").get().c;
    const rooms = q('SELECT COUNT(*) c FROM rooms WHERE active = 1').get().c;
    const ready = q("SELECT COUNT(*) c FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.status = 'ready' AND o.status = 'open'").get().c;
    const stopped = q('SELECT name FROM dishes WHERE active = 1 AND available = 0 ORDER BY name').all().map((x) => x.name);
    const resv = q("SELECT COUNT(*) c FROM reservations WHERE status = 'active' AND starts_at >= ? AND starts_at < ?").get(d.getTime(), d.getTime() + 24 * 60 * MIN).c;
    return { today, live: { open_orders: open, rooms, ready_waiting: ready, stopped, reservations_today: resv, ...kitchenLoad() } };
  }

  // ---------- Reservations ----------
  function listReservations({ query }) {
    const from = Number(query.from) || now() - 24 * 60 * MIN;
    const to = Number(query.to) || 8.64e15;
    return q(`SELECT x.*, r.name room_name, r.number room_number FROM reservations x JOIN rooms r ON r.id = x.room_id
      WHERE x.starts_at >= ? AND x.starts_at < ? ORDER BY x.starts_at`).all(from, to);
  }

  function saveReservation({ user, params, body }) {
    const prev = params.id ? q('SELECT * FROM reservations WHERE id = ?').get(params.id) : null;
    if (params.id && !prev) throw new HttpError(404, 'Bron topilmadi');
    const r = {
      room_id: int(body.room_id ?? prev?.room_id, 'Xona', { min: 1, required: true }),
      customer: str(body.customer ?? prev?.customer, 'Mijoz', { required: true, max: 80 }),
      phone: str(body.phone ?? prev?.phone, 'Telefon', { max: 30 }),
      guests: int(body.guests ?? prev?.guests, 'Mehmonlar', { min: 1, max: 5000, def: 1 }),
      starts_at: int(body.starts_at ?? prev?.starts_at, 'Vaqt', { min: 1, required: true, max: 8.64e15 }),
      deposit: int(body.deposit ?? prev?.deposit, 'Avans'),
      note: str(body.note ?? prev?.note, 'Izoh', { max: 300 }),
    };
    if (!q('SELECT 1 FROM rooms WHERE id = ?').get(r.room_id)) throw new HttpError(404, 'Xona topilmadi');
    const clash = q(`SELECT customer FROM reservations WHERE room_id = ? AND status = 'active' AND id != ? AND ABS(starts_at - ?) < ?`)
      .get(r.room_id, prev?.id || 0, r.starts_at, 3 * 60 * MIN);
    if (clash) throw new HttpError(409, `Bu xona shu vaqtga band: ${clash.customer}`);
    const id = tx(() => {
      let id;
      if (prev) {
        q('UPDATE reservations SET room_id = ?, customer = ?, phone = ?, guests = ?, starts_at = ?, deposit = ?, note = ? WHERE id = ?')
          .run(r.room_id, r.customer, r.phone, r.guests, r.starts_at, r.deposit, r.note, prev.id);
        id = prev.id;
      } else {
        id = q(`INSERT INTO reservations (room_id, customer, phone, guests, starts_at, deposit, note, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(r.room_id, r.customer, r.phone, r.guests, r.starts_at, r.deposit, r.note, user.id, now()).lastInsertRowid;
      }
      const depositDelta = r.deposit - (prev?.deposit || 0);
      if (depositDelta > 0) {
        q("INSERT INTO transactions (type, category, amount, method, note, user_id, created_at) VALUES ('income', 'Banket avansi', ?, ?, ?, ?, ?)")
          .run(depositDelta, METHODS.includes(body.deposit_method) ? body.deposit_method : 'cash', `Bron #${id}: ${r.customer}`, user.id, now());
      }
      return id;
    });
    audit(user, prev ? 'reservation_update' : 'reservation_create', `${r.customer} ${new Date(r.starts_at).toLocaleString()}`);
    events.publish('rooms');
    events.publish('finance');
    return q('SELECT * FROM reservations WHERE id = ?').get(id);
  }

  function reservationStatus({ user, params, body }) {
    const status = str(body.status, 'Holat', { required: true });
    if (!['active', 'arrived', 'cancelled'].includes(status)) throw new HttpError(400, "Holat noto'g'ri");
    if (!q('UPDATE reservations SET status = ? WHERE id = ?').run(status, params.id).changes) throw new HttpError(404, 'Bron topilmadi');
    audit(user, 'reservation_status', `#${params.id} ${status}`);
    events.publish('rooms');
    return { ok: true };
  }

  // ---------- Cash shifts ----------
  function shiftExpected(shift, until = now()) {
    const rows = q("SELECT type, SUM(amount) s FROM transactions WHERE method = 'cash' AND created_at >= ? AND created_at < ? GROUP BY type")
      .all(shift.opened_at, until + 1);
    const inc = rows.find((r) => r.type === 'income')?.s || 0;
    const exp = rows.find((r) => r.type === 'expense')?.s || 0;
    return { cash_in: inc, cash_out: exp, expected: shift.opening_cash + inc - exp };
  }

  function currentShift() {
    const s = q(`SELECT s.*, u.name cashier_name FROM shifts s JOIN users u ON u.id = s.cashier_id WHERE s.closed_at IS NULL ORDER BY s.id DESC`).get();
    return s ? { ...s, ...shiftExpected(s) } : null;
  }

  function listShifts() {
    return q(`SELECT s.*, u.name cashier_name FROM shifts s JOIN users u ON u.id = s.cashier_id ORDER BY s.id DESC LIMIT 60`).all();
  }

  function openShift({ user, body }) {
    if (currentShift()) throw new HttpError(409, 'Smena allaqachon ochiq');
    const id = q('INSERT INTO shifts (cashier_id, opened_at, opening_cash) VALUES (?, ?, ?)').run(user.id, now(), int(body.opening_cash, 'Boshlang\'ich naqd')).lastInsertRowid;
    audit(user, 'shift_open', `#${id}`);
    return currentShift();
  }

  function closeShift({ user, body }) {
    const s = currentShift();
    if (!s) throw new HttpError(404, 'Ochiq smena yo\'q');
    const closing = int(body.closing_cash, 'Kassadagi naqd', { required: true });
    q('UPDATE shifts SET closed_at = ?, closing_cash = ?, expected_cash = ?, note = ? WHERE id = ?').run(
      now(), closing, s.expected, str(body.note, 'Izoh', { max: 300 }), s.id
    );
    audit(user, 'shift_close', `#${s.id} kutilgan ${s.expected}, haqiqiy ${closing}, farq ${closing - s.expected}`);
    return q('SELECT * FROM shifts WHERE id = ?').get(s.id);
  }

  function listAudit({ query }) {
    const limit = Math.min(Number(query.limit) || 300, 2000);
    return q(`SELECT a.*, u.name user_name, u.role FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?`).all(limit);
  }

  // ---------- Route table ----------
  const ALL = ROLES;
  const routes = [
    ['GET', '/api/info', null, info],
    ['POST', '/api/login', null, login],
    ['POST', '/api/logout', ALL, logout],
    ['GET', '/api/me', ALL, me],
    ['PUT', '/api/me/password', ALL, changeOwnPassword],
    ['PUT', '/api/settings', MANAGERS, updateSettings],
    ['GET', '/api/users', MANAGERS, listUsers],
    ['POST', '/api/users', MANAGERS, createUser],
    ['PUT', '/api/users/:id', MANAGERS, updateUser],
    ['GET', '/api/rooms', ALL, listRooms],
    ['POST', '/api/rooms', MANAGERS, createRoom],
    ['PUT', '/api/rooms/:id', MANAGERS, updateRoom],
    ['GET', '/api/menu', ALL, menu],
    ['POST', '/api/categories', MANAGERS, saveCategory],
    ['PUT', '/api/categories/:id', MANAGERS, saveCategory],
    ['DELETE', '/api/categories/:id', MANAGERS, deleteCategory],
    ['POST', '/api/dishes', MANAGERS, saveDish],
    ['PUT', '/api/dishes/:id', MANAGERS, saveDish],
    ['DELETE', '/api/dishes/:id', MANAGERS, deleteDish],
    ['POST', '/api/dishes/:id/availability', STOPLIST, setAvailability],
    ['GET', '/api/orders', ['owner', 'admin', 'cashier', 'waiter'], listOrders],
    ['POST', '/api/orders', ['owner', 'admin', 'cashier', 'waiter'], openOrder],
    ['GET', '/api/orders/:id', ['owner', 'admin', 'cashier', 'waiter'], getOrder],
    ['PUT', '/api/orders/:id', ['owner', 'admin', 'cashier', 'waiter'], updateOrder],
    ['POST', '/api/orders/:id/items', ['owner', 'admin', 'cashier', 'waiter'], addItems],
    ['POST', '/api/orders/:id/request-bill', ['owner', 'admin', 'waiter'], requestBill],
    ['POST', '/api/orders/:id/close', MONEY, closeOrder],
    ['POST', '/api/orders/:id/cancel', ['owner', 'admin', 'waiter'], cancelOrder],
    ['POST', '/api/orders/:id/transfer', MONEY, transferOrder],
    ['POST', '/api/items/:id/accept', KITCHEN, acceptItem],
    ['POST', '/api/items/:id/ready', KITCHEN, readyItem],
    ['POST', '/api/items/:id/serve', ['owner', 'admin', 'cashier', 'waiter'], serveItem],
    ['POST', '/api/items/:id/cancel', ALL, cancelItem],
    ['GET', '/api/kitchen', KITCHEN, kitchen],
    ['GET', '/api/my/ready', ['owner', 'admin', 'waiter'], myReady],
    ['GET', '/api/transactions', MONEY, listTransactions],
    ['POST', '/api/transactions', MONEY, createTransaction],
    ['DELETE', '/api/transactions/:id', ['owner'], deleteTransaction],
    ['GET', '/api/reports', MONEY, report],
    ['GET', '/api/dashboard', MONEY, dashboard],
    ['GET', '/api/reservations', ALL, listReservations],
    ['POST', '/api/reservations', MONEY, saveReservation],
    ['PUT', '/api/reservations/:id', MONEY, saveReservation],
    ['POST', '/api/reservations/:id/status', MONEY, reservationStatus],
    ['GET', '/api/shifts', MONEY, listShifts],
    ['GET', '/api/shifts/current', MONEY, currentShift],
    ['POST', '/api/shifts/open', MONEY, openShift],
    ['POST', '/api/shifts/close', MONEY, closeShift],
    ['GET', '/api/audit', MANAGERS, listAudit],
  ].map(([method, pattern, roles, handler]) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '$');
    return { method, re, keys, roles, handler };
  });

  function match(method, pathname) {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = Number(m[i + 1]); });
      return { route: r, params };
    }
    return null;
  }

  return { match, authenticate, ROLES };
}

module.exports = { createApi };
