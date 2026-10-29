'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server/index');

let base;
let server;

async function call(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function login(username, password, code = 'demo') {
  const r = await call('POST', '/api/login', null, { code, username, password });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.token;
}

// A date n days from today as the server sees it (local time, not UTC: they differ around midnight).
function localDay(n = 0) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'choyxona-test-'));
  server = createServer({ dataDir });
  server.dataDir = dataDir;
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test('full order flow: waiter -> kitchen -> waiter -> cashier -> report', async () => {
  const owner = await login('ega', 'ega123');
  const waiter = await login('jasur', '1234');
  const chef = await login('oshpaz', '1234');
  const cashier = await login('kassir', 'kassir123');

  const rooms = (await call('GET', '/api/rooms', waiter)).data;
  assert.equal(rooms.length, 4, 'waiter sees only assigned rooms');

  const menu = (await call('GET', '/api/menu', waiter)).data;
  const shorva = menu.dishes.find((d) => d.name === "Sho'rva");
  const choy = menu.dishes.find((d) => d.name.startsWith("Ko'k choy"));
  assert.ok(shorva.eta_minutes >= shorva.prep_minutes);

  const order = (await call('POST', '/api/orders', waiter, { room_id: rooms[0].id, guests: 4 })).data;
  const added = await call('POST', `/api/orders/${order.id}/items`, waiter, {
    items: [{ dish_id: shorva.id, qty: 2 }, { dish_id: choy.id, qty: 1 }],
  });
  assert.equal(added.status, 200, JSON.stringify(added.data));
  const soup = added.data.items.find((i) => i.dish_id === shorva.id);
  assert.equal(soup.status, 'new');
  assert.ok(soup.eta_at > Date.now());
  assert.equal(added.data.items.find((i) => i.dish_id === choy.id).status, 'served', 'tea skips kitchen');

  // Waiter cannot touch kitchen; cashier cannot close before dish is ready.
  assert.equal((await call('POST', `/api/items/${soup.id}/accept`, waiter)).status, 403);
  assert.equal((await call('GET', '/api/kitchen', chef)).data.items.length, 1);
  assert.equal((await call('POST', `/api/items/${soup.id}/accept`, chef)).data.status, 'cooking');
  assert.equal((await call('POST', `/api/orders/${order.id}/close`, cashier, { paid_cash: 1e6 })).status, 409);
  assert.equal((await call('POST', `/api/items/${soup.id}/cancel`, waiter, {})).status, 403);

  assert.equal((await call('POST', `/api/items/${soup.id}/ready`, chef)).data.status, 'ready');
  assert.equal((await call('GET', '/api/my/ready', waiter)).data.length, 1);
  assert.equal((await call('POST', `/api/items/${soup.id}/serve`, waiter)).data.status, 'served');

  await call('POST', `/api/orders/${order.id}/request-bill`, waiter);
  const bill = (await call('GET', `/api/orders/${order.id}`, cashier)).data;
  assert.equal(bill.subtotal, 2 * 35000 + 5000);
  assert.equal(bill.service_amount, Math.round(bill.subtotal * 0.1));

  const short = await call('POST', `/api/orders/${order.id}/close`, cashier, { paid_card: 1000 });
  assert.equal(short.status, 400);
  const closed = await call('POST', `/api/orders/${order.id}/close`, cashier, { paid_card: 50000, paid_cash: 100000 });
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  assert.equal(closed.data.status, 'closed');
  assert.equal(closed.data.change, 150000 - bill.total);

  await call('POST', '/api/transactions', cashier, { type: 'expense', category: "Go'sht", amount: 20000, method: 'cash' });

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const rep = (await call('GET', `/api/reports?from=${start.getTime()}&to=${start.getTime() + 86400000}`, owner)).data;
  assert.equal(rep.sales.orders, 1);
  assert.equal(rep.sales.total, bill.total);
  assert.equal(rep.sales.cash + rep.sales.card, bill.total);
  assert.equal(rep.expense, 20000);
  assert.equal(rep.net_profit, bill.total - 20000);
  assert.equal(rep.dishes.find((d) => d.name === "Sho'rva").qty, 2);
});

test('stop-list and roles', async () => {
  const owner = await login('ega', 'ega123');
  const chef = await login('oshpaz', '1234');
  const waiter = await login('bobur', '1234');
  const admin = await login('admin', 'admin123');
  const menu = (await call('GET', '/api/menu', chef)).data;
  const manti = menu.dishes.find((d) => d.name === 'Manti');

  assert.equal((await call('POST', `/api/dishes/${manti.id}/availability`, chef, { available: false })).status, 200);
  assert.equal((await call('POST', `/api/dishes/${manti.id}/availability`, waiter, { available: true })).status, 403);

  const rooms = (await call('GET', '/api/rooms', waiter)).data;
  const order = (await call('POST', '/api/orders', waiter, { room_id: rooms[0].id })).data;
  const r = await call('POST', `/api/orders/${order.id}/items`, waiter, { items: [{ dish_id: manti.id, qty: 1 }] });
  assert.equal(r.status, 409);

  // Only owner may create admins; admin may create waiters.
  assert.equal((await call('POST', '/api/users', admin, { name: 'X', username: 'x1', password: '1234', role: 'admin' })).status, 403);
  assert.equal((await call('POST', '/api/users', admin, { name: 'Y', username: 'y1', password: '1234', role: 'waiter' })).status, 200);
  assert.equal((await call('POST', '/api/users', owner, { name: 'Z', username: 'z1', password: '1234', role: 'admin' })).status, 200);

  // Owner adds a dish with limited stock: it auto-stops at zero.
  const dish = (await call('POST', '/api/dishes', owner, { name: 'Halim', price: 30000, prep_minutes: 5, stock: 1 })).data;
  assert.equal((await call('POST', `/api/orders/${order.id}/items`, waiter, { items: [{ dish_id: dish.id, qty: 1 }] })).status, 200);
  const after = (await call('GET', '/api/menu', waiter)).data.dishes.find((d) => d.id === dish.id);
  assert.equal(after.available, 0);
});

test('login page info and brute-force lock', async () => {
  const info = (await call('GET', '/api/info?code=demo')).data;
  assert.equal(info.demo, true);
  assert.equal((await call('GET', '/api/info?code=yoq')).status, 404);
  const bad = { code: 'demo', username: 'kassir', password: 'xato' };
  for (let i = 0; i < 8; i++) assert.equal((await call('POST', '/api/login', null, bad)).status, 401);
  assert.equal((await call('POST', '/api/login', null, { ...bad, password: 'kassir123' })).status, 429);
});

test('platform: site owner creates a choyxona, its boss adds staff, data stays separate', async () => {
  const p = await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' });
  assert.equal(p.status, 200);
  const admin = p.data.token;
  assert.equal(p.data.admin.default_password, true);

  // Choyxona logins cannot reach the platform panel.
  const demoOwner = await login('ega', 'ega123');
  assert.equal((await call('GET', '/api/platform/tenants', demoOwner)).status, 401);

  const created = await call('POST', '/api/platform/tenants', admin, {
    name: 'Navruz choyxonasi', code: 'navruz', owner_name: 'Akmal aka', owner_username: 'akmal', owner_password: 'akmal2026',
    phone: '+998901234567', paid_until: Date.now() + 30 * 86400000, monthly_fee: 300000,
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.equal((await call('POST', '/api/platform/tenants', admin, { name: 'X', code: 'navruz', owner_name: 'a', owner_username: 'a', owner_password: '123456' })).status, 409);

  // Same staff login names in two choyxonas do not clash; the code decides.
  assert.equal((await call('POST', '/api/login', null, { code: 'navruz', username: 'ega', password: 'ega123' })).status, 401);
  const boss = await login('akmal', 'akmal2026', 'navruz');
  const me = (await call('GET', '/api/me', boss)).data;
  assert.equal(me.user.role, 'owner');
  assert.equal(me.settings.name, 'Navruz choyxonasi');
  assert.equal(me.tenant.code, 'navruz');
  assert.equal((await call('POST', '/api/users', boss, { name: 'Jasur', username: 'jasur', password: '1234', role: 'waiter' })).status, 200);
  assert.equal((await call('POST', '/api/rooms', boss, { number: '1', name: 'Banket 1' })).status, 200);
  await login('jasur', '1234', 'navruz');

  const navruzRooms = (await call('GET', '/api/rooms', boss)).data;
  const demoRooms = (await call('GET', '/api/rooms', demoOwner)).data;
  assert.equal(navruzRooms.length, 1);
  assert.equal(demoRooms.length, 8);
  assert.ok(!(await call('GET', '/api/users', demoOwner)).data.some((u) => u.username === 'akmal'));

  const list = (await call('GET', '/api/platform/tenants', admin)).data;
  const nav = list.find((t) => t.code === 'navruz');
  assert.equal(nav.staff, 2);
  assert.deepEqual(nav.owners, ['akmal']);

  // Forgotten boss password is reset from the platform.
  assert.equal((await call('POST', `/api/platform/tenants/${nav.id}/reset-owner`, admin, { password: 'yangi2026' })).status, 200);
  assert.equal((await call('GET', '/api/me', boss)).status, 401, 'old session ended');
  const boss2 = await login('akmal', 'yangi2026', 'navruz');

  // Blocking stops logins and ends current sessions.
  assert.equal((await call('PUT', `/api/platform/tenants/${nav.id}`, admin, { status: 'blocked' })).status, 200);
  assert.equal((await call('GET', '/api/me', boss2)).status, 401);
  const blocked = await call('POST', '/api/login', null, { code: 'navruz', username: 'akmal', password: 'yangi2026' });
  assert.equal(blocked.status, 403);
  assert.match(blocked.data.error, /bloklangan/);
  await call('PUT', `/api/platform/tenants/${nav.id}`, admin, { status: 'active' });
  await login('akmal', 'yangi2026', 'navruz');
});

test('the staff login never reveals the platform', async () => {
  const r = await call('POST', '/api/login', null, { code: 'demo', username: 'superadmin', password: 'super123' });
  assert.equal(r.status, 401);
  assert.equal(r.data.redirect, undefined);
});

test('payroll: daily pay with attendance, % of sales, bonus, fine, payment', async () => {
  const boss = await login('ega', 'ega123');
  const admin = await login('admin', 'admin123');
  const w = (await call('POST', '/api/users', boss, { name: 'Pay Test', username: 'paytest', password: '1234', role: 'waiter' })).data;
  assert.equal((await call('PUT', `/api/payroll/rates/${w.id}`, boss, { pay_type: 'daily', amount: 100000, sales_pct: 5 })).status, 200);
  assert.equal((await call('GET', '/api/payroll', admin)).status, 403, 'only the boss manages pay');

  // Not at work yet: nothing earned.
  let row = (await call('GET', '/api/payroll', boss)).data.staff.find((s) => s.id === w.id);
  assert.equal(row.accrued, 0);

  // Logging in marks today as a working day; a closed check adds 5% of its total.
  const wt = await login('paytest', '1234');
  const room = (await call('POST', '/api/rooms', boss, { number: '99', name: 'Pay xona', waiter_ids: [w.id] })).data;
  const menu = (await call('GET', '/api/menu', wt)).data;
  const non = menu.dishes.find((d) => d.name === 'Tandir non');
  const order = (await call('POST', '/api/orders', wt, { room_id: room.id })).data;
  await call('POST', `/api/orders/${order.id}/items`, wt, { items: [{ dish_id: non.id, qty: 4 }] });
  const closed = (await call('POST', `/api/orders/${order.id}/close`, boss, { paid_cash: 1e6 })).data;

  assert.equal((await call('POST', '/api/payroll/entries', boss, { user_id: w.id, type: 'fine', amount: 10000 })).status, 400, 'fine needs a reason');
  await call('POST', '/api/payroll/entries', boss, { user_id: w.id, type: 'fine', amount: 10000, note: 'Kechikdi' });
  await call('POST', '/api/payroll/entries', boss, { user_id: w.id, type: 'bonus', amount: 20000, note: 'Yaxshi ish' });
  await call('POST', '/api/payroll/entries', boss, { user_id: w.id, type: 'payment', amount: 50000, method: 'cash' });

  row = (await call('GET', '/api/payroll', boss)).data.staff.find((s) => s.id === w.id);
  const pct = Math.round(closed.total * 0.05);
  assert.equal(row.days_worked, 1);
  assert.equal(row.accrued, 100000 + pct);
  assert.equal(row.balance, 100000 + pct + 20000 - 10000 - 50000);

  // The payment is an expense in the cash book; the worker sees their own pay.
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const txs = (await call('GET', `/api/transactions?from=${s.getTime()}&type=expense`, boss)).data;
  assert.ok(txs.some((t) => t.category === 'Ish haqi' && t.amount === 50000));
  const mine = (await call('GET', '/api/my/payroll', wt)).data;
  assert.equal(mine.balance, row.balance);
  assert.equal(mine.entries.length, 3);

  // Deleting a wrong payment also removes its expense.
  const pay = mine.entries.find((e) => e.type === 'payment');
  await call('DELETE', `/api/payroll/entries/${pay.id}`, boss);
  assert.equal((await call('GET', '/api/my/payroll', wt)).data.balance, row.balance + 50000);
  const after = (await call('GET', `/api/transactions?from=${s.getTime()}&type=expense`, boss)).data;
  assert.ok(!after.some((t) => t.category === 'Ish haqi' && t.amount === 50000));

  // Attendance can be corrected by the boss.
  const today = (await call('GET', '/api/payroll', boss)).data.today;
  await call('POST', '/api/payroll/attendance', boss, { user_id: w.id, day: today, present: false });
  row = (await call('GET', '/api/payroll', boss)).data.staff.find((s) => s.id === w.id);
  assert.equal(row.accrued_base, 0);
});

test('service charge per guest, checks history with export', async () => {
  const boss = await login('ega', 'ega123');
  const rooms = (await call('GET', '/api/rooms', boss)).data;
  const menu = (await call('GET', '/api/menu', boss)).data;
  const non = menu.dishes.find((d) => d.name === 'Tandir non');
  const room = rooms.find((r) => !r.order);

  await call('PUT', '/api/settings', boss, { service_type: 'per_guest', service_per_guest: 5000 });
  const o = (await call('POST', '/api/orders', boss, { room_id: room.id, guests: 10 })).data;
  const withItems = (await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: non.id, qty: 2 }] })).data;
  assert.equal(withItems.service_type, 'per_guest');
  assert.equal(withItems.service_amount, 50000, '10 guests x 5 000');
  assert.equal(withItems.total, 10000 + 50000);

  // The service charge comes only from settings: an attempt to change it on one check is ignored.
  const closed = (await call('POST', `/api/orders/${o.id}/close`, boss, { service_type: 'percent', service_rate: 10, paid_cash: 60000 })).data;
  assert.equal(closed.service_amount, 50000);
  assert.equal(closed.total, 60000);
  await call('PUT', '/api/settings', boss, { service_type: 'percent' });

  const s = new Date(); s.setHours(0, 0, 0, 0);
  const today = (await call('GET', `/api/checks?from=${s.getTime()}&to=${s.getTime() + 86400000}`, boss)).data;
  assert.ok(today.rows.some((r) => r.id === o.id));
  assert.equal(today.sums.count, today.rows.length);
  const yesterday = (await call('GET', `/api/checks?from=${s.getTime() - 86400000}&to=${s.getTime()}`, boss)).data;
  assert.equal(yesterday.rows.length, 0, 'a new day starts empty');
  const all = (await call('GET', '/api/checks', boss)).data;
  assert.ok(all.sums.count >= today.sums.count);
  assert.equal((await call('GET', `/api/checks?q=${o.id}`, boss)).data.rows[0].id, o.id);

  const res = await fetch(`${base}/api/checks/export`, { headers: { Authorization: `Bearer ${boss}` } });
  assert.match(res.headers.get('content-type'), /text\/csv/);
  const csv = await res.text();
  assert.ok(csv.includes('Tandir non x2'));
  assert.equal((await call('GET', '/api/checks', await login('jasur', '1234'))).status, 403);
});

test('platform owner switches sections off per choyxona', async () => {
  const admin = (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
  const demo = (await call('GET', '/api/platform/tenants', admin)).data.find((t) => t.code === 'demo');
  const boss = await login('ega', 'ega123');
  assert.equal((await call('PUT', `/api/platform/tenants/${demo.id}`, admin, { disabled_modules: ['nimadir'] })).status, 400);
  await call('PUT', `/api/platform/tenants/${demo.id}`, admin, { disabled_modules: ['payroll', 'history'], kitchen_mode: 'off' });

  const me = (await call('GET', '/api/me', boss)).data;
  // (Pro-only sections are closed on this plan anyway.)
  assert.deepEqual(me.disabled.filter((m) => !['customers', 'debts', 'inventory', 'branches'].includes(m)).sort(), ['history', 'payroll']);
  assert.equal(me.kitchen_mode, 'off');
  assert.equal((await call('GET', '/api/kitchen', boss)).status, 403);
  const r = await call('GET', '/api/payroll', boss);
  assert.equal(r.status, 403);
  assert.match(r.data.error, /Ish haqi/);
  assert.equal((await call('GET', '/api/checks', boss)).status, 403);
  assert.equal((await call('GET', '/api/reports?from=1&to=2', boss)).status, 200, 'other sections still work');

  // Without the kitchen screen, dishes go straight to "served" so checks can be closed.
  const rooms = (await call('GET', '/api/rooms', boss)).data;
  const shorva = (await call('GET', '/api/menu', boss)).data.dishes.find((d) => d.name === "Sho'rva");
  const o = (await call('POST', '/api/orders', boss, { room_id: rooms.find((x) => !x.order).id })).data;
  const after = (await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: shorva.id, qty: 1 }] })).data;
  assert.equal(after.items[0].status, 'served');

  await call('PUT', `/api/platform/tenants/${demo.id}`, admin, { disabled_modules: [], kitchen_mode: 'full' });
  assert.equal((await call('GET', '/api/payroll', boss)).status, 200);
});

async function freeRoom(token) {
  return (await call('GET', '/api/rooms', token)).data.find((r) => !r.order);
}
async function dish(token, name) {
  return (await call('GET', '/api/menu', token)).data.dishes.find((d) => d.name.startsWith(name));
}

test('shared device: boss connects it once, staff log in with a PIN', async () => {
  assert.equal((await call('POST', '/api/device/register', null, { code: 'demo', username: 'jasur', password: '1234' })).status, 403, 'waiters cannot connect devices');
  const reg = await call('POST', '/api/device/register', null, { code: 'demo', username: 'ega', password: 'ega123', name: 'Kassa' });
  assert.equal(reg.status, 200);
  const dev = reg.data.device_token;
  assert.match(dev, /^d\d+_/);

  const staff = (await call('GET', '/api/device/staff', dev)).data;
  const jasur = staff.find((u) => u.name === 'Ofitsant Jasur');
  assert.ok(jasur.has_pin);
  assert.equal(staff[0].role, 'owner', 'boss first');
  assert.equal((await call('GET', '/api/device/staff', null)).status, 401);
  assert.equal((await call('GET', '/api/rooms', dev)).status, 401, 'a device token is not a person');

  assert.equal((await call('POST', '/api/device/pin', dev, { user_id: jasur.id, pin: '9999' })).status, 401);
  const ok = await call('POST', '/api/device/pin', dev, { user_id: jasur.id, pin: '1111' });
  assert.equal(ok.status, 200);
  assert.equal((await call('GET', '/api/me', ok.data.token)).data.user.name, 'Ofitsant Jasur');

  // Lock after 5 wrong PINs on this device.
  const bobur = staff.find((u) => u.name === 'Ofitsant Bobur');
  for (let i = 0; i < 5; i++) await call('POST', '/api/device/pin', dev, { user_id: bobur.id, pin: '0000' });
  assert.equal((await call('POST', '/api/device/pin', dev, { user_id: bobur.id, pin: '2222' })).status, 429);

  // Staff PIN: 1–4 digits; the boss may use a longer code.
  const boss = await login('ega', 'ega123');
  const w = (await call('POST', '/api/users', boss, { name: 'Yangi Ofitsant', role: 'waiter', pin: '12345' }));
  assert.equal(w.status, 400);
  const w2 = (await call('POST', '/api/users', boss, { name: 'Yangi Ofitsant', role: 'waiter', pin: '7' })).data;
  assert.ok(w2.username, 'login is generated when not given');
  assert.equal((await call('POST', '/api/device/pin', dev, { user_id: w2.id, pin: '7' })).status, 200);
  assert.equal((await call('PUT', '/api/me/pin', boss, { pin: 'boshliq-kod-2026' })).status, 200);
  const owner = staff.find((u) => u.role === 'owner');
  assert.equal((await call('POST', '/api/device/pin', dev, { user_id: owner.id, pin: 'boshliq-kod-2026' })).status, 200);

  // The boss can disconnect the device.
  const devices = (await call('GET', '/api/devices', boss)).data;
  await call('DELETE', `/api/devices/${devices.find((d) => d.name === 'Kassa').id}`, boss);
  assert.equal((await call('GET', '/api/device/staff', dev)).status, 401);
});

test('permissions: print and close per worker; waiter cancels only with the boss code', async () => {
  const boss = await login('ega', 'ega123');
  const waiter = await login('bobur', '1234');
  const users = (await call('GET', '/api/users', boss)).data;
  const bob = users.find((u) => u.username === 'bobur');
  assert.deepEqual(bob.perms, { print: true, close: false });

  const room = (await call('GET', '/api/rooms', waiter)).data.find((r) => !r.order);
  const o = (await call('POST', '/api/orders', waiter, { room_id: room.id, guests: 2 })).data;
  const added = (await call('POST', `/api/orders/${o.id}/items`, waiter, { items: [{ dish_id: (await dish(waiter, "Sho'rva")).id, qty: 1 }] })).data;
  const item = added.items[0];

  // Cancel: not allowed until the boss switches it on and sets a code.
  assert.equal((await call('POST', `/api/items/${item.id}/cancel`, waiter, { reason: 'xato' })).status, 403);
  await call('PUT', '/api/settings', boss, { waiter_cancel: true, cancel_code: '4321' });
  assert.equal((await call('GET', '/api/me', boss)).data.settings.has_cancel_code, true);
  assert.equal((await call('POST', `/api/items/${item.id}/cancel`, waiter, { reason: 'xato', code: '0000' })).status, 403);
  assert.equal((await call('POST', `/api/items/${item.id}/cancel`, waiter, { reason: 'xato', code: '4321' })).status, 200);
  await call('PUT', '/api/settings', boss, { waiter_cancel: false });

  // Print is recorded; close needs the permission.
  await call('POST', `/api/orders/${o.id}/items`, waiter, { items: [{ dish_id: (await dish(waiter, 'Tandir non')).id, qty: 1 }] });
  assert.equal((await call('POST', `/api/orders/${o.id}/print`, waiter)).data.print_count, 1);
  assert.equal((await call('POST', `/api/orders/${o.id}/close`, waiter, { paid_cash: 1e6 })).status, 403);
  await call('PUT', `/api/users/${bob.id}`, boss, { perm_close: true, perm_print: false });
  assert.equal((await call('POST', `/api/orders/${o.id}/print`, waiter)).status, 403);
  assert.equal((await call('POST', `/api/orders/${o.id}/close`, waiter, { paid_cash: 1e6 })).status, 200);
  await call('PUT', `/api/users/${bob.id}`, boss, { perm_close: null, perm_print: null });
});

test('takeaway: many open checks, no service charge, kept off the room list', async () => {
  const cashier = await login('admin', 'admin123');
  const waiter = await login('jasur', '1234');
  const tw = (await call('GET', '/api/takeaway', cashier)).data;
  assert.ok(tw.room_id);
  assert.ok(!(await call('GET', '/api/rooms?all=1', cashier)).data.some((r) => r.id === tw.room_id));

  const a = (await call('POST', '/api/orders', waiter, { room_id: tw.room_id, label: 'Aziz' })).data;
  const b = (await call('POST', '/api/orders', cashier, { room_id: tw.room_id })).data;
  assert.notEqual(a.id, b.id);
  const withItems = (await call('POST', `/api/orders/${a.id}/items`, waiter, { items: [{ dish_id: (await dish(waiter, 'Patir')).id, qty: 2 }] })).data;
  assert.equal(withItems.service_amount, 0);
  assert.equal(withItems.total, 16000);
  const mine = (await call('GET', '/api/takeaway', waiter)).data.orders;
  assert.deepEqual(mine.map((x) => x.id), [a.id], 'a waiter sees only own takeaway checks');
  assert.equal((await call('GET', '/api/takeaway', cashier)).data.orders.length, 2);
  const closed = (await call('POST', `/api/orders/${a.id}/close`, cashier, { paid_cash: 16000 })).data;
  assert.equal(closed.total, 16000);
  await call('POST', `/api/orders/${b.id}/cancel`, cashier, {});
});

test('kitchen modes: notify skips accepting and does not block closing', async () => {
  const admin = (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
  const demo = (await call('GET', '/api/platform/tenants', admin)).data.find((t) => t.code === 'demo');
  await call('PUT', `/api/platform/tenants/${demo.id}`, admin, { kitchen_mode: 'notify' });
  const boss = await login('ega', 'ega123');
  const o = (await call('POST', '/api/orders', boss, { room_id: (await freeRoom(boss)).id })).data;
  const after = (await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: (await dish(boss, 'Dimlama')).id, qty: 1 }] })).data;
  assert.equal(after.items[0].status, 'cooking');
  assert.ok((await call('GET', '/api/kitchen', boss)).data.items.some((i) => i.order_id === o.id));
  assert.equal((await call('POST', `/api/orders/${o.id}/close`, boss, { paid_cash: 1e6 })).status, 200);
  assert.equal((await call('PUT', `/api/platform/tenants/${demo.id}`, admin, { kitchen_mode: 'xyz' })).status, 400);
  await call('PUT', `/api/platform/tenants/${demo.id}`, admin, { kitchen_mode: 'full' });
});

async function platformAdmin() {
  return (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
}
async function newBusiness(admin, code, type, extra = {}) {
  const r = await call('POST', '/api/platform/tenants', admin, {
    name: `Test ${code}`, code, owner_name: 'Boss', owner_username: 'boss', owner_password: 'boss1234', business_type: type, sample: true, ...extra,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { tenant: r.data, boss: await login('boss', 'boss1234', code) };
}

test('shop: counter sale with barcode goods, stock, refund, stock receipt', async () => {
  const admin = await platformAdmin();
  const { tenant, boss } = await newBusiness(admin, 'baraka', 'market');
  assert.equal(tenant.kitchen_mode, 'off');
  assert.deepEqual(JSON.parse(tenant.disabled_modules), ['reservations']);
  const me = (await call('GET', '/api/me', boss)).data;
  assert.equal(me.business_type, 'market');
  assert.equal(me.settings.service_pct, 0);
  assert.equal((await call('GET', '/api/rooms', boss)).data.length, 0, 'a shop has no rooms');

  const menu = (await call('GET', '/api/menu', boss)).data;
  const milk = menu.dishes.find((d) => d.barcode === '4780000000035');
  assert.equal(milk.stock, 30);
  const sale = await call('POST', '/api/sales', boss, { items: [{ dish_id: milk.id, qty: 3 }], paid_cash: 40000 });
  assert.equal(sale.status, 200, JSON.stringify(sale.data));
  assert.equal(sale.data.status, 'closed');
  assert.equal(sale.data.total, 36000);
  assert.equal(sale.data.change, 4000);
  assert.equal(sale.data.paid_cash, 36000);
  assert.ok(sale.data.items.every((i) => i.status === 'served'));
  assert.equal((await call('GET', '/api/menu', boss)).data.dishes.find((d) => d.id === milk.id).stock, 27);
  assert.equal((await call('POST', '/api/sales', boss, { items: [{ dish_id: milk.id, qty: 100 }], paid_cash: 9e6 })).status, 409, 'not more than in stock');

  // Barcodes are unique.
  assert.equal((await call('POST', '/api/dishes', boss, { name: 'Copy', price: 1, barcode: '4780000000035' })).status, 409);

  // Refund one: money back as an expense, stock back; never more than was sold.
  const item = sale.data.items[0];
  const ref = await call('POST', `/api/orders/${sale.data.id}/refund`, boss, { items: [{ item_id: item.id, qty: 1 }], reason: 'buzilgan' });
  assert.equal(ref.status, 200, JSON.stringify(ref.data));
  assert.equal(ref.data.refunded, 12000);
  assert.equal((await call('GET', '/api/menu', boss)).data.dishes.find((d) => d.id === milk.id).stock, 28);
  assert.equal((await call('POST', `/api/orders/${sale.data.id}/refund`, boss, { items: [{ item_id: item.id, qty: 3 }] })).status, 400);
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const rep = (await call('GET', `/api/reports?from=${day.getTime()}&to=${day.getTime() + 86400000}`, boss)).data;
  assert.equal(rep.expense_by_category.find((x) => x.key === 'Qaytarish').value, 12000);

  // Goods arrive: stock grows and the purchase becomes an expense.
  const rec = await call('POST', `/api/dishes/${milk.id}/receive`, boss, { qty: 12, cost: 9000, expense: true });
  assert.equal(rec.status, 200);
  assert.equal(rec.data.stock, 40);
  const txs = (await call('GET', `/api/transactions?from=${day.getTime()}`, boss)).data;
  assert.ok(txs.some((x) => x.category === 'Mol xaridi' && x.amount === 108000));
});

test('fast food: a paid counter order still goes to the kitchen', async () => {
  const admin = await platformAdmin();
  const { tenant, boss } = await newBusiness(admin, 'burger', 'fastfood');
  assert.equal(tenant.kitchen_mode, 'notify');
  const menu = (await call('GET', '/api/menu', boss)).data;
  const burger = menu.dishes.find((d) => d.name === 'Gamburger');
  const sale = await call('POST', '/api/sales', boss, { items: [{ dish_id: burger.id, qty: 2 }], paid_card: 56000 });
  assert.equal(sale.status, 200, JSON.stringify(sale.data));
  assert.equal(sale.data.status, 'closed');
  assert.equal(sale.data.items[0].status, 'cooking');
  const k = (await call('GET', '/api/kitchen', boss)).data;
  assert.ok(k.items.some((i) => i.order_id === sale.data.id && i.status === 'cooking'));
});

test('room sections, pictures and the desktop background', async () => {
  const owner = await login('ega', 'ega123');
  const rooms = (await call('GET', '/api/rooms', owner)).data;
  assert.deepEqual([...new Set(rooms.map((r) => r.section).filter(Boolean))], ['1-qavat', '2-qavat', 'Hovli']);
  const r = await call('PUT', `/api/rooms/${rooms[0].id}`, owner, { section: '3-qavat' });
  assert.equal(r.data.section, '3-qavat');
  await call('PUT', `/api/rooms/${rooms[0].id}`, owner, { section: '1-qavat' });

  const png = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'public', 'icon-192.png')).toString('base64');
  assert.equal((await call('POST', '/api/assets', owner, { kind: 'bg', data: 'data:image/svg+xml;base64,PHN2Zy8+' })).status, 400, 'no svg');
  const waiter = await login('jasur', '1234');
  assert.equal((await call('POST', '/api/assets', waiter, { kind: 'logo', data: png })).status, 403);
  const logo = (await call('POST', '/api/assets', owner, { kind: 'logo', data: png })).data;
  const bg = (await call('POST', '/api/assets', owner, { kind: 'bg', data: png })).data;
  const s = await call('PUT', '/api/settings', owner, { logo: logo.id, lock_bg: { mode: 'image', image: bg.id } });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal((await call('PUT', '/api/settings', owner, { lock_bg: { mode: 'color', color: 'red' } })).status, 400);
  const info = (await call('GET', '/api/info?code=demo')).data;
  assert.equal(info.logo, `/media/demo/${logo.id}`);
  assert.equal(info.lock_bg.url, `/media/demo/${bg.id}`);
  const pic = await fetch(base + info.logo);
  assert.equal(pic.status, 200);
  assert.equal(pic.headers.get('content-type'), 'image/png');
  await call('PUT', '/api/settings', owner, { logo: '', lock_bg: { mode: 'auto' } });
  assert.equal((await call('GET', '/api/info?code=demo')).data.lock_bg.mode, 'auto');
});

test('money pages: the boss decides who sees them and can lock them with a password', async () => {
  const admin = await platformAdmin();
  const { boss } = await newBusiness(admin, 'pul', 'choyxona');
  await call('POST', '/api/users', boss, { name: 'Kassir', username: 'k1', password: 'k1234', role: 'cashier' });
  await call('POST', '/api/users', boss, { name: 'Admin', username: 'a1', password: 'a1234', role: 'admin' });
  const cashier = await login('k1', 'k1234', 'pul');
  const adm = await login('a1', 'a1234', 'pul');
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const rep = `/api/reports?from=${day.getTime()}&to=${day.getTime() + 86400000}`;
  assert.equal((await call('GET', rep, cashier)).status, 403, 'cashier: no reports by default');
  assert.equal((await call('GET', '/api/transactions', cashier)).status, 200, 'cashier: cash book by default');
  assert.equal((await call('GET', '/api/shifts/current', cashier)).status, 200);
  assert.equal((await call('GET', rep, adm)).status, 200);
  assert.equal((await call('PUT', '/api/settings', adm, { perm_cashier_reports: true })).status, 403, 'only the boss');
  await call('PUT', '/api/settings', boss, { perm_cashier_reports: true, perm_admin_finance: false });
  assert.equal((await call('GET', rep, cashier)).status, 200);
  assert.equal((await call('GET', '/api/transactions', adm)).status, 403);
  assert.deepEqual((await call('GET', '/api/me', adm)).data.money, { reports: true, finance: false, payroll: false });

  assert.equal((await call('PUT', '/api/settings', boss, { finance_lock: true })).status, 400, 'a password first');
  assert.equal((await call('PUT', '/api/settings', boss, { finance_lock: true, finance_code: 'sir123' })).status, 200);
  assert.equal((await call('GET', rep, boss)).status, 423);
  assert.equal((await call('GET', '/api/shifts/current', cashier)).status, 200, 'the cash desk keeps working');
  assert.equal((await call('POST', '/api/finance/unlock', boss, { code: 'xato' })).status, 403);
  const key = (await call('POST', '/api/finance/unlock', boss, { code: 'sir123' })).data.finance_key;
  const ok = await fetch(base + rep, { headers: { Authorization: `Bearer ${boss}`, 'X-Finance': key } });
  assert.equal(ok.status, 200);
  const other = await fetch(base + rep, { headers: { Authorization: `Bearer ${cashier}`, 'X-Finance': key } });
  assert.equal(other.status, 423, 'the key is personal');
});

test('backups: download, restore keeps devices, platform copies, enter as boss, support line', async () => {
  const admin = await platformAdmin();
  const { tenant, boss } = await newBusiness(admin, 'zaxira', 'choyxona', { sample: false });
  const dev = (await call('POST', '/api/device/register', null, { code: 'zaxira', username: 'boss', password: 'boss1234', name: 'Kassa' })).data.device_token;
  await call('POST', '/api/rooms', boss, { number: '1', name: 'Eski xona' });

  assert.equal((await fetch(base + '/api/device/backup', { headers: { Authorization: `Bearer ${dev}` } })).status, 403, 'device backup off');
  assert.equal((await call('PUT', '/api/devices/backup', boss, { device_token: dev, on: true })).status, 200);
  const devCopy = await fetch(base + '/api/device/backup', { headers: { Authorization: `Bearer ${dev}` } });
  assert.equal(devCopy.status, 200);
  const res = await fetch(base + '/api/backup/download', { headers: { Authorization: `Bearer ${boss}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /flowi_zaxira_/);
  const file = Buffer.from(await res.arrayBuffer());
  assert.equal(file.subarray(0, 15).toString(), 'SQLite format 3');

  // Changes after the backup are undone by the restore.
  await call('POST', '/api/rooms', boss, { number: '2', name: 'Yangi xona' });
  assert.equal((await call('GET', '/api/rooms', boss)).data.length, 2);
  const bad = await fetch(base + '/api/backup/restore', { method: 'POST', headers: { Authorization: `Bearer ${boss}` }, body: Buffer.from('not a database at all, sorry') });
  assert.equal(bad.status, 400);
  const restored = await fetch(base + '/api/backup/restore', { method: 'POST', headers: { Authorization: `Bearer ${boss}` }, body: file });
  assert.equal(restored.status, 200, await restored.clone().text());
  assert.deepEqual((await call('GET', '/api/rooms', boss)).data.map((r) => r.name), ['Eski xona'], 'boss session survives the restore');
  assert.equal((await call('GET', '/api/device/staff', dev)).status, 200, 'device stays connected');

  // The platform owner opens the business as its boss; the visit is logged.
  const imp = await call('POST', `/api/platform/tenants/${tenant.id}/impersonate`, admin);
  assert.equal(imp.status, 200);
  const me = (await call('GET', '/api/me', imp.data.token)).data;
  assert.equal(me.user.role, 'owner');
  assert.equal(me.platform_session, true);
  assert.ok((await call('GET', '/api/audit', boss)).data.some((a) => a.action === 'platform_login'));
  assert.equal((await call('POST', `/api/platform/tenants/${tenant.id}/impersonate`, boss)).status, 401);

  // Support line: platform default, business override.
  await call('PUT', '/api/platform/settings', admin, { support_text: "To'lov: @flowi_support" });
  let info = (await call('GET', '/api/info?code=zaxira')).data;
  assert.deepEqual(info.support, { text: "To'lov: @flowi_support", link: 'https://t.me/flowi_support' });
  await call('PUT', `/api/platform/tenants/${tenant.id}`, admin, { support: { text: 'Yordam: +998 90 123 45 67' } });
  info = (await call('GET', '/api/info?code=zaxira')).data;
  assert.equal(info.support.link, 'tel:+998901234567');

  // Server-side dated copies can be put back from the platform.
  const { backupAll } = require('../server/backup');
  backupAll(server.dataDir);
  const list = (await call('GET', `/api/platform/tenants/${tenant.id}/backups`, admin)).data;
  assert.ok(list.some((b) => b.kind === 'daily'));
  assert.ok(list.some((b) => b.kind === 'pre-restore'), 'the restore above kept the old state');
  await call('POST', '/api/rooms', boss, { number: '3', name: 'Keyin' });
  const back = await call('POST', `/api/platform/tenants/${tenant.id}/restore`, admin, { stamp: list.find((b) => b.kind === 'daily').stamp, kind: 'daily' });
  assert.equal(back.status, 200, JSON.stringify(back.data));
  assert.equal((await call('GET', '/api/rooms', boss)).data.length, 1);
});

test('a new business boss enters the desktop without a password until setting one; orders reach printer devices', async () => {
  const admin = await platformAdmin();
  await newBusiness(admin, 'yangi', 'choyxona');
  const dev = (await call('POST', '/api/device/register', null, { code: 'yangi', username: 'boss', password: 'boss1234' })).data.device_token;
  const staff = (await call('GET', '/api/device/staff', dev)).data;
  assert.equal(staff[0].has_pin, true, 'the boss tile is usable at once');
  assert.equal(staff[0].open, true);
  const r = await call('POST', '/api/device/pin', dev, { user_id: staff[0].id, pin: '' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const boss = r.data.token;
  assert.equal((await call('GET', '/api/me', boss)).data.user.has_pin, false, 'the screen keeps reminding');
  // Once the boss sets a desktop password, it is asked.
  assert.equal((await call('PUT', '/api/me/pin', boss, { pin: 'kalit77' })).status, 200);
  assert.equal((await call('GET', '/api/device/staff', dev)).data[0].open, false);
  assert.equal((await call('POST', '/api/device/pin', dev, { user_id: staff[0].id, pin: '' })).status, 401);
  assert.equal((await call('POST', '/api/device/pin', dev, { user_id: staff[0].id, pin: 'kalit77' })).status, 200);

  // The device's own event stream receives every new order.
  const ctrl = new AbortController();
  const stream = await fetch(`${base}/api/events?token=${dev}`, { signal: ctrl.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const room = (await call('GET', '/api/rooms', boss)).data[0];
  const dish = (await call('GET', '/api/menu', boss)).data.dishes[0];
  const o = (await call('POST', '/api/orders', boss, { room_id: room.id })).data;
  await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: dish.id, qty: 2, note: 'achchiq' }] });
  let text = '';
  while (!text.includes('order_print')) text += new TextDecoder().decode((await reader.read()).value);
  ctrl.abort();
  assert.match(text, /achchiq/);
});

test('v1.5: cancel part of a line, PIN lock settings, room type names, built-in wallpaper, check logo', async () => {
  const admin = await platformAdmin();
  const { boss } = await newBusiness(admin, 'versiya', 'choyxona');
  const room = (await call('GET', '/api/rooms', boss)).data[0];
  const dish = (await call('GET', '/api/menu', boss)).data.dishes.find((d) => d.needs_kitchen);
  const o = (await call('POST', '/api/orders', boss, { room_id: room.id })).data;
  const it = (await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: dish.id, qty: 5 }] })).data.items[0];
  const c = await call('POST', `/api/items/${it.id}/cancel`, boss, { qty: 2, reason: 'mijoz voz kechdi' });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const live = c.data.items.filter((i) => i.status !== 'cancelled');
  const gone = c.data.items.filter((i) => i.status === 'cancelled');
  assert.deepEqual([live[0].qty, gone[0].qty], [3, 2]);
  assert.equal(c.data.subtotal, dish.price * 3);
  assert.equal((await call('POST', `/api/items/${it.id}/cancel`, boss, { qty: 9, reason: 'x' })).status, 400);

  // Wrong PINs: lock after 2 tries, or never.
  await call('POST', '/api/users', boss, { name: 'Ali', role: 'waiter', pin: '1111' });
  const dev = (await call('POST', '/api/device/register', null, { code: 'versiya', username: 'boss', password: 'boss1234' })).data.device_token;
  const ali = (await call('GET', '/api/device/staff', dev)).data.find((u) => u.name === 'Ali');
  await call('PUT', '/api/settings', boss, { pin_lock_attempts: 2, pin_lock_minutes: 3 });
  for (let i = 0; i < 2; i++) await call('POST', '/api/device/pin', dev, { user_id: ali.id, pin: '9999' });
  const locked = await call('POST', '/api/device/pin', dev, { user_id: ali.id, pin: '1111' });
  assert.equal(locked.status, 429);
  assert.match(locked.data.error, /3 daqiqadan/);
  await call('PUT', '/api/settings', boss, { pin_lock_attempts: 0 });
  assert.equal((await call('POST', '/api/device/pin', dev, { user_id: ali.id, pin: '1111' })).status, 200, '0 = never locks');

  // Room types: rename, add; a used type cannot be removed.
  const types = (await call('GET', '/api/me', boss)).data.settings.room_types;
  const renamed = types.map((x) => (x.key === 'supa' ? { ...x, name: 'Tapchan' } : x)).concat({ name: 'Kabina' });
  const s = await call('PUT', '/api/settings', boss, { room_types: renamed });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(s.data.room_types.find((x) => x.key === 'supa').name, 'Tapchan');
  const kabina = s.data.room_types.find((x) => x.name === 'Kabina');
  assert.equal((await call('POST', '/api/rooms', boss, { number: '20', name: 'Kabina 1', type: kabina.key })).status, 200);
  assert.equal((await call('PUT', '/api/settings', boss, { room_types: renamed.filter((x) => x.key !== 'banket') })).status, 400, 'banket rooms exist');

  // Built-in wallpaper and the check logo switch.
  assert.equal((await call('PUT', '/api/settings', boss, { lock_bg: { mode: 'builtin', n: 7 } })).status, 200);
  assert.deepEqual((await call('GET', '/api/info?code=versiya')).data.lock_bg.n, 7);
  assert.equal((await call('PUT', '/api/settings', boss, { lock_bg: { mode: 'builtin', n: 99 } })).status, 400);
  const off = await call('PUT', '/api/settings', boss, { receipt_logo: false });
  assert.equal(off.data.receipt_logo, false);
  assert.match((await call('GET', '/api/info?code=versiya')).data.release, /^\d+\.\d+\.\d+$/);
});

test('a too large request gets a clear 413 answer instead of a dropped connection', async () => {
  const res = await fetch(`${base}/api/platform/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'x'.repeat(2_000_000) }) });
  assert.equal(res.status, 413);
  assert.ok((await res.json()).error);
});

test('plans: limits, sections, editable prices, view-only after the term — and nothing is ever deleted', async () => {
  const admin = (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
  const plans = (await call('GET', '/api/platform/plans', admin)).data;
  assert.equal(plans.plans.start.price, 199000);
  assert.equal(plans.plans.biznes.max_staff, 15);
  assert.equal(plans.terms.trial_days, 14);

  // A business on Start: 5 workers at most, no cash book, no payroll, no Excel.
  const c = await call('POST', '/api/platform/tenants', admin, { name: 'Tarif test', code: 'tarif', owner_name: 'E', owner_username: 'ega', owner_password: 'ega12345',
    plan: 'start', paid_until: Date.now() + 864e5 });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const boss = await login('ega', 'ega12345', 'tarif');
  const me = (await call('GET', '/api/me', boss)).data;
  assert.equal(me.plan.key, 'start');
  assert.equal(me.plan.fee, 199000);
  assert.ok(me.disabled.includes('finance') && me.disabled.includes('payroll') && me.disabled.includes('export'));
  assert.equal((await call('GET', '/api/transactions', boss)).status, 403);
  assert.equal((await call('GET', `/api/reports?from=${Date.now() - 864e5}&to=${Date.now()}`, boss)).status, 200);
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const r = await call('POST', '/api/users', boss, { name: `X${i}`, role: 'waiter', pin: String(1000 + i) });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    ids.push(r.data.id);
  }
  const sixth = await call('POST', '/api/users', boss, { name: 'X6', role: 'waiter' });
  assert.equal(sixth.status, 403);
  assert.match(sixth.data.error, /5 tagacha/);
  // Switching one off frees a place; switching it back on is checked the same way.
  assert.equal((await call('PUT', `/api/users/${ids[0]}`, boss, { active: false })).status, 200);
  assert.equal((await call('POST', '/api/users', boss, { name: 'X6', role: 'waiter' })).status, 200);
  assert.equal((await call('PUT', `/api/users/${ids[0]}`, boss, { active: true })).status, 403);

  // The platform owner changes prices and limits; every business follows at once.
  const edited = JSON.parse(JSON.stringify(plans));
  edited.plans.start.price = 249000;
  edited.plans.start.max_staff = 10;
  edited.plans.start.modules.push('finance');
  assert.equal((await call('PUT', '/api/platform/plans', admin, edited)).status, 200);
  const me2 = (await call('GET', '/api/me', boss)).data;
  assert.equal(me2.plan.fee, 249000);
  assert.ok(!me2.disabled.includes('finance'));
  assert.equal((await call('PUT', `/api/users/${ids[0]}`, boss, { active: true })).status, 200);
  assert.equal((await call('PUT', '/api/platform/plans', admin, { ...edited, terms: { ...edited.terms, yearly_months: 0 } })).status, 400);
  const bad = JSON.parse(JSON.stringify(edited)); bad.plans.pro.modules = ['nope'];
  assert.equal((await call('PUT', '/api/platform/plans', admin, bad)).status, 400);
  assert.equal((await call('PUT', `/api/platform/tenants/${c.data.id}`, admin, { plan: 'gold' })).status, 400);

  // A sale before the term ends.
  const room = (await call('POST', '/api/rooms', boss, { number: '1', name: 'Xona' })).data;
  const dish = (await call('POST', '/api/dishes', boss, { name: 'Choy', price: 5000, needs_kitchen: false })).data;
  const o = (await call('POST', '/api/orders', boss, { room_id: room.id })).data;
  assert.equal((await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: dish.id, qty: 2 }] })).status, 200);

  // Term over but inside the grace days: still works.
  const t = (await call('GET', '/api/platform/tenants', admin)).data.find((x) => x.code === 'tarif');
  assert.equal((await call('PUT', `/api/platform/tenants/${t.id}`, admin, { paid_until: Date.now() - 864e5 })).status, 200);
  assert.equal((await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: dish.id, qty: 1 }] })).status, 200);

  // After the grace days: view-only. Everything can be read and signed into; nothing new is written; nothing is lost.
  await call('PUT', `/api/platform/tenants/${t.id}`, admin, { paid_until: Date.now() - 10 * 864e5 });
  const me3 = (await call('GET', '/api/me', boss)).data;
  assert.equal(me3.plan.read_only, true);
  const blocked = await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: dish.id, qty: 1 }] });
  assert.equal(blocked.status, 402);
  assert.equal((await call('POST', '/api/orders', boss, { room_id: room.id })).status, 402);
  const kept = (await call('GET', `/api/orders/${o.id}`, boss)).data;
  assert.equal(kept.items.reduce((s, i) => s + i.qty, 0), 3);
  assert.equal((await call('GET', '/api/users', boss)).data.length, 7);
  await login('ega', 'ega12345', 'tarif');

  // Paid again: everything goes on where it stopped.
  await call('PUT', `/api/platform/tenants/${t.id}`, admin, { paid_until: Date.now() + 30 * 864e5 });
  assert.equal((await call('POST', `/api/orders/${o.id}/close`, boss, { paid_cash: kept.total })).status, 200);

  // A lower plan never deletes: down to 3 workers allowed, all 6 stay active, only adding is stopped.
  edited.plans.start.max_staff = 3;
  await call('PUT', '/api/platform/plans', admin, edited);
  assert.equal((await call('GET', '/api/users', boss)).data.filter((u) => u.active).length, 7);
  assert.equal((await call('POST', '/api/users', boss, { name: 'X7', role: 'waiter' })).status, 403);

  // Branch and own price.
  await call('PUT', `/api/platform/tenants/${t.id}`, admin, { is_branch: true });
  assert.equal((await call('GET', '/api/me', boss)).data.plan.fee, plans.terms.branch_price);
  await call('PUT', `/api/platform/tenants/${t.id}`, admin, { monthly_fee: 99000 });
  assert.equal((await call('GET', '/api/me', boss)).data.plan.fee, 99000);
  // Put the default plans back for the other tests.
  await call('PUT', '/api/platform/plans', admin, plans);
});

test('one waiter account cannot be used on two devices at once (cashier and boss can)', async () => {
  const admin = (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
  const c = await call('POST', '/api/platform/tenants', admin, { name: 'Qurilma test', code: 'qurilma', owner_name: 'E', owner_username: 'ega', owner_password: 'ega12345', plan: 'start' });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const boss = await login('ega', 'ega12345', 'qurilma');
  const aliUser = (await call('POST', '/api/users', boss, { name: 'Ali', username: 'ali', password: 'ali1', role: 'waiter', pin: '1111' })).data;
  await call('POST', '/api/users', boss, { name: 'Kassir', username: 'kassa', password: 'kas1', role: 'cashier', pin: '2222' });
  const room = (await call('POST', '/api/rooms', boss, { number: '1', name: 'Xona', waiter_ids: [aliUser.id] })).data;

  // Phone A takes an order; the same account on phone B closes phone A, the order stays.
  const phoneA = await login('ali', 'ali1', 'qurilma');
  const o = (await call('POST', '/api/orders', phoneA, { room_id: room.id })).data;
  const phoneB = await login('ali', 'ali1', 'qurilma');
  const r = await call('GET', '/api/me', phoneA);
  assert.equal(r.status, 401);
  assert.match(r.data.error, /boshqa qurilmada/);
  assert.equal((await call('GET', `/api/orders/${o.id}`, phoneB)).status, 200);

  // On a shared tablet the same waiter signing in again just replaces the old session (not counted as sharing).
  const dev = (await call('POST', '/api/device/register', null, { code: 'qurilma', username: 'ega', password: 'ega12345' })).data.device_token;
  const ali = (await call('GET', '/api/device/staff', dev)).data.find((u) => u.name === 'Ali');
  const t1 = (await call('POST', '/api/device/pin', dev, { user_id: ali.id, pin: '1111' })).data.token;
  const t2 = (await call('POST', '/api/device/pin', dev, { user_id: ali.id, pin: '1111' })).data.token;
  assert.equal((await call('GET', '/api/me', t1)).status, 401);
  assert.equal((await call('GET', '/api/me', t2)).status, 200);
  assert.equal((await call('GET', '/api/me', phoneB)).status, 401);

  // Cashier and boss stay signed in everywhere.
  const k1 = await login('kassa', 'kas1', 'qurilma');
  const k2 = await login('kassa', 'kas1', 'qurilma');
  assert.equal((await call('GET', '/api/me', k1)).status, 200);
  assert.equal((await call('GET', '/api/me', k2)).status, 200);
  assert.equal((await call('GET', '/api/me', boss)).status, 200);

  // Repeated hand-overs while in use show up on the platform card.
  for (let i = 0; i < 3; i++) await login('ali', 'ali1', 'qurilma');
  const card = (await call('GET', '/api/platform/tenants', admin)).data.find((x) => x.code === 'qurilma');
  assert.equal(card.shared[0].name, 'Ali');
  assert.ok(card.shared[0].c >= 3);

  // Pro (0 = no limit): both phones stay signed in.
  await call('PUT', `/api/platform/tenants/${c.data.id}`, admin, { plan: 'pro' });
  const p1 = await login('ali', 'ali1', 'qurilma');
  const p2 = await login('ali', 'ali1', 'qurilma');
  assert.equal((await call('GET', '/api/me', p1)).status, 200);
  assert.equal((await call('GET', '/api/me', p2)).status, 200);
});

test('front page tells about FLOWI; the program opens only from a business link', async () => {
  const home = await fetch(`${base}/`);
  const html = await home.text();
  assert.match(html, /section class="hero"/);
  assert.doesNotMatch(html, /setup-form/);
  assert.match(await (await fetch(`${base}/c/demo`)).text(), /js\/app\.js/);
  assert.match(await (await fetch(`${base}/app`)).text(), /js\/app\.js/);
  assert.match(await (await fetch(`${base}/index.html`)).text(), /section class="hero"/);
  const info = await (await fetch(`${base}/api/public/info`)).json();
  assert.equal(info.plans.length, 3);
  assert.ok(info.plans[0].price > 0 && Array.isArray(info.plans[0].modules));
  assert.equal(info.tenants, undefined);
});

test('attendance, worker meals taken from pay, daily pay in the evening, advance', async () => {
  const admin = (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
  assert.equal((await call('POST', '/api/platform/tenants', admin, { name: 'Maosh', code: 'maosh', owner_name: 'E', owner_username: 'ega', owner_password: 'ega12345', plan: 'pro', kitchen_mode: 'off' })).status, 200);
  const boss = await login('ega', 'ega12345', 'maosh');
  const ali = (await call('POST', '/api/users', boss, { name: 'Ali', role: 'waiter', pin: '1111' })).data;
  const vali = (await call('POST', '/api/users', boss, { name: 'Vali', role: 'chef', pin: '2222' })).data;
  const adm = (await call('POST', '/api/users', boss, { name: 'Admin', username: 'adm', password: 'adm1', role: 'admin' })).data;
  const kas = (await call('POST', '/api/users', boss, { name: 'Kassir', username: 'kas', password: 'kas1', role: 'cashier' })).data;
  const day = new Date(); const today = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  await call('PUT', `/api/payroll/rates/${ali.id}`, boss, { pay_type: 'daily', amount: 150000, from_day: '2020-01-01' });
  await call('PUT', `/api/payroll/rates/${vali.id}`, boss, { pay_type: 'monthly', amount: 4000000, from_day: '2020-01-01' });

  // Attendance: came / day off; the admin can mark too, the cashier cannot.
  const admT = await login('adm', 'adm1', 'maosh');
  assert.equal((await call('POST', '/api/attendance', admT, { user_id: ali.id, day: today, status: 'present' })).status, 200);
  assert.equal((await call('POST', '/api/attendance', boss, { user_id: vali.id, day: today, status: 'dayoff' })).status, 200);
  assert.equal((await call('POST', '/api/attendance', boss, { user_id: vali.id, day: today, status: 'nope' })).status, 400);
  const kasT = await login('kas', 'kas1', 'maosh');
  assert.equal((await call('POST', '/api/attendance', kasT, { user_id: ali.id, day: today, status: 'absent' })).status, 403);

  // Ali eats: the cashier closes the check "on Ali" — no service charge, no money in the till, taken from his pay.
  const room = (await call('POST', '/api/rooms', boss, { number: '1', name: 'Xona' })).data;
  const osh = (await call('POST', '/api/dishes', boss, { name: 'Osh', price: 40000, cost: 15000, needs_kitchen: false })).data;
  const choy = (await call('POST', '/api/dishes', boss, { name: 'Choy', price: 5000, needs_kitchen: false })).data;
  let o = (await call('POST', '/api/orders', boss, { room_id: room.id })).data;
  await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: osh.id, qty: 1 }, { dish_id: choy.id, qty: 2 }] });
  let c = await call('POST', `/api/orders/${o.id}/close`, kasT, { staff_id: ali.id });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal(c.data.total, 50000);
  assert.equal(c.data.service_amount, 0);
  assert.equal(c.data.paid_staff, 50000);
  assert.equal(c.data.paid_cash, 0);

  // At cost when the boss chooses so (a dish with no cost counts at its menu price).
  await call('PUT', '/api/settings', boss, { staff_meal_price: 'cost' });
  o = (await call('POST', '/api/orders', boss, { room_id: room.id })).data;
  await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: osh.id, qty: 2 }, { dish_id: choy.id, qty: 1 }] });
  c = await call('POST', `/api/orders/${o.id}/close`, kasT, { staff_id: ali.id });
  assert.equal(c.data.total, 2 * 15000 + 5000);
  // A waiter cannot close on a worker; the boss himself is not a worker.
  o = (await call('POST', '/api/orders', boss, { room_id: room.id })).data;
  await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: choy.id, qty: 1 }] });
  const owner = (await call('GET', '/api/me', boss)).data.user;
  assert.equal((await call('POST', `/api/orders/${o.id}/close`, kasT, { staff_id: owner.id })).status, 404);

  // A drink written by hand.
  assert.equal((await call('POST', '/api/payroll/entries', boss, { user_id: ali.id, type: 'deduction', kind: 'Ichimlik', amount: 3000 })).status, 200);

  // Evening: Ali earned 150 000, spent 50 000 + 35 000 + 3 000 → 62 000 to hand over.
  let dv = (await call('GET', `/api/attendance?day=${today}`, admT)).data;
  let a = dv.staff.find((r) => r.id === ali.id);
  assert.equal(a.status, 'present');
  assert.equal(a.earned, 150000);
  assert.equal(a.spent, 88000);
  assert.equal(a.day_due, 62000);
  assert.equal(dv.staff.find((r) => r.id === vali.id).status, 'dayoff');
  // The cashier sees who came, but no money.
  const kv = (await call('GET', `/api/attendance?day=${today}`, kasT));
  assert.equal(kv.status, 403);
  // The admin cannot hand over more than what is left today; the boss can.
  assert.equal((await call('POST', '/api/attendance/pay', admT, { user_id: ali.id, amount: 70000 })).status, 403);
  assert.equal((await call('POST', '/api/attendance/pay', admT, { user_id: ali.id, amount: 62000 })).status, 200);
  a = (await call('GET', `/api/attendance?day=${today}`, boss)).data.staff.find((r) => r.id === ali.id);
  assert.equal(a.day_due, 0);
  assert.equal(a.balance, 0);

  // The day off does not earn a daily wage; a monthly worker gets an advance (also an expense in the cash book).
  assert.equal((await call('POST', '/api/payroll/entries', boss, { user_id: vali.id, type: 'advance', amount: 1000000 })).status, 200);
  const m = (await call('GET', '/api/payroll', boss)).data;
  const v = m.staff.find((r) => r.id === vali.id);
  assert.equal(v.advance, 1000000);
  assert.equal(v.advance_missing, false);
  const txs = (await call('GET', '/api/transactions?type=expense', boss)).data;
  assert.ok(txs.some((x) => x.category === 'Ish haqi' && x.amount === 1000000 && /avans/.test(x.note)));
  assert.ok(txs.some((x) => x.category === 'Ish haqi' && x.amount === 62000));
  // The meals are not cash: the report shows them apart, the shift's cash is not raised by them.
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const rep = (await call('GET', `/api/reports?from=${d0.getTime()}&to=${d0.getTime() + 864e5}`, boss)).data;
  assert.equal(rep.sales.staff, 85000);
  assert.equal(rep.sales.cash, 0);
});

test('the platform panel lives at /planeta; the old /platform address shows the front page', async () => {
  assert.match(await (await fetch(`${base}/planeta`)).text(), /js\/platform\.js/);
  assert.doesNotMatch(await (await fetch(`${base}/platform`)).text(), /js\/platform\.js/);
});

test('a business page installs as its own app (iPhone home screen opens the business, not the front page)', async () => {
  const html = await (await fetch(`${base}/c/demo`)).text();
  assert.match(html, /href="\/manifest\.webmanifest\?code=demo"/);
  const m = await (await fetch(`${base}/manifest.webmanifest?code=demo`)).json();
  assert.equal(m.start_url, '/c/demo');
  assert.equal(m.id, '/c/demo');
  assert.match(m.name, /FLOWI/);
  // Unknown code or none: the general manifest.
  assert.equal((await (await fetch(`${base}/manifest.webmanifest?code=yoq-biznes`)).json()).start_url, '/app');
  assert.equal((await (await fetch(`${base}/manifest.webmanifest`)).json()).start_url, '/app');
});

test('Pro: customers with cashback, debts paid back later, ingredients taken by recipes, branch report', async () => {
  const admin = (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
  const main = (await call('POST', '/api/platform/tenants', admin, { name: 'Pro bosh', code: 'probosh', owner_name: 'E', owner_username: 'ega', owner_password: 'ega12345', plan: 'pro', kitchen_mode: 'off' })).data;
  const boss = await login('ega', 'ega12345', 'probosh');
  const room = (await call('POST', '/api/rooms', boss, { number: '1', name: 'Xona' })).data;

  // Biznes plan: the credit book (customers who owe) yes, cashback and the stock of ingredients no.
  const bizC = (await call('POST', '/api/platform/tenants', admin, { name: 'Biz', code: 'bizfirma', owner_name: 'E', owner_username: 'ega', owner_password: 'ega12345', plan: 'biznes' })).data;
  const bizBoss = await login('ega', 'ega12345', 'bizfirma');
  assert.equal((await call('GET', '/api/customers', bizBoss)).status, 200);
  assert.equal((await call('GET', '/api/me', bizBoss)).data.disabled.includes('customers'), true);
  assert.equal((await call('GET', '/api/ingredients', bizBoss)).status, 403);

  // Ingredients and a recipe: 1 osh = 0.15 kg guruch + 0.1 kg go'sht. The dish's cost follows the recipe.
  const guruch = (await call('POST', '/api/ingredients', boss, { name: 'Guruch', unit: 'kg', stock: 10, min_stock: 2, cost: 16000 })).data;
  const gosht = (await call('POST', '/api/ingredients', boss, { name: "Go'sht", unit: 'kg', stock: 3, min_stock: 1, cost: 120000 })).data;
  const osh = (await call('POST', '/api/dishes', boss, { name: 'Osh', price: 45000, needs_kitchen: false })).data;
  const rc = await call('PUT', `/api/dishes/${osh.id}/recipe`, boss, { items: [{ ingredient_id: guruch.id, qty: 0.15 }, { ingredient_id: gosht.id, qty: 0.1 }] });
  assert.equal(rc.status, 200, JSON.stringify(rc.data));
  assert.equal(rc.data.cost, Math.round(0.15 * 16000 + 0.1 * 120000));
  assert.equal((await call('GET', '/api/menu', boss)).data.dishes.find((d) => d.id === osh.id).cost, 14400);

  // A customer; check of 4 osh (180 000 + 10% service = 198 000): 100 000 cash now, 98 000 on credit.
  const ali = (await call('POST', '/api/customers', boss, { name: 'Ali aka', phone: '+998 90 123-45-67' })).data;
  assert.equal(ali.phone, '+998901234567');
  assert.equal((await call('POST', '/api/customers', boss, { name: 'Boshqa', phone: '+998901234567' })).status, 409);
  let o = (await call('POST', '/api/orders', boss, { room_id: room.id })).data;
  await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: osh.id, qty: 4 }] });
  assert.equal((await call('POST', `/api/orders/${o.id}/close`, boss, { paid_debt: 1000, paid_cash: 197000 })).status, 400, 'credit needs a customer');
  let c = await call('POST', `/api/orders/${o.id}/close`, boss, { customer_id: ali.id, paid_cash: 100000, paid_debt: 98000 });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal(c.data.total, 198000);
  assert.equal(c.data.paid_debt, 98000);
  let a = (await call('GET', `/api/customers/${ali.id}`, boss)).data;
  assert.equal(a.debt, 98000);
  assert.equal(a.bonus, 3000, '3% cashback of the money paid now');
  assert.equal(a.visits, 1);

  // Stock went down by the recipe.
  let ing = (await call('GET', '/api/ingredients', boss)).data.rows;
  assert.equal(ing.find((r) => r.id === guruch.id).stock, 10 - 0.6);
  assert.equal(ing.find((r) => r.id === gosht.id).stock, 2.6);

  // Next visit: bonus spent as a discount, the rest paid by card.
  o = (await call('POST', '/api/orders', boss, { room_id: room.id })).data;
  await call('POST', `/api/orders/${o.id}/items`, boss, { items: [{ dish_id: osh.id, qty: 1 }] });
  assert.equal((await call('POST', `/api/orders/${o.id}/close`, boss, { customer_id: ali.id, bonus: 5000, paid_card: 49500 })).status, 400, 'more bonus than he has');
  c = await call('POST', `/api/orders/${o.id}/close`, boss, { customer_id: ali.id, bonus: 3000, paid_card: 46500 });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal(c.data.total, 49500 - 3000);
  a = (await call('GET', `/api/customers/${ali.id}`, boss)).data;
  assert.equal(a.bonus, Math.floor(46500 * 0.03));

  // He pays back part of the debt in cash: it enters the till and the cash book, not the income again.
  const kas = (await call('POST', '/api/users', boss, { name: 'K', username: 'kas', password: 'kas1', role: 'cashier' })).data;
  const kasT = await login('kas', 'kas1', 'probosh');
  assert.equal((await call('POST', `/api/customers/${ali.id}/pay`, kasT, { amount: 99000 })).status, 400);
  assert.equal((await call('POST', `/api/customers/${ali.id}/pay`, kasT, { amount: 50000, method: 'cash' })).status, 200);
  assert.equal((await call('GET', `/api/customers/${ali.id}`, boss)).data.debt, 48000);
  assert.equal((await call('GET', '/api/customers?debt=1', boss)).data.totals.debt, 48000);
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const rep = (await call('GET', `/api/reports?from=${d0.getTime()}&to=${d0.getTime() + 864e5}`, boss)).data;
  assert.equal(rep.sales.total, 198000 + 46500);
  assert.equal(rep.sales.debt, 98000);
  assert.equal(rep.other_income, 0, 'debt paid back is not new income');
  assert.equal(rep.cash_flow.cash_in, 100000 + 50000);

  // Receiving goods (paid from the till), a write-off, a count; low-stock flag.
  assert.equal((await call('POST', '/api/inventory/receive', boss, { items: [{ ingredient_id: gosht.id, qty: 5, price: 125000 }], paid: true, method: 'cash' })).status, 200);
  assert.equal((await call('POST', '/api/inventory/adjust', boss, { ingredient_id: guruch.id, kind: 'writeoff', qty: 1 })).status, 400, 'a reason is required');
  assert.equal((await call('POST', '/api/inventory/adjust', boss, { ingredient_id: guruch.id, kind: 'writeoff', qty: 1, note: "Namlanib qoldi" })).status, 200);
  assert.equal((await call('POST', '/api/inventory/adjust', boss, { ingredient_id: guruch.id, kind: 'count', qty: 1.5 })).status, 200);
  ing = (await call('GET', '/api/ingredients', boss)).data;
  const g = ing.rows.find((r) => r.id === gosht.id);
  assert.equal(g.stock, 7.5);
  assert.equal(g.cost, 125000);
  assert.equal(ing.rows.find((r) => r.id === guruch.id).low, true);
  assert.equal((await call('GET', '/api/menu', boss)).data.dishes.find((d) => d.id === osh.id).cost, Math.round(0.15 * 16000 + 0.1 * 125000), 'cost follows the new price');
  const tx = (await call('GET', '/api/transactions?type=expense', boss)).data;
  assert.ok(tx.some((x) => x.category === 'Mahsulotlar' && x.amount === 625000));
  const moves = (await call('GET', `/api/inventory/moves?ingredient_id=${guruch.id}`, boss)).data;
  assert.deepEqual([...new Set(moves.map((m) => m.kind))].sort(), ['count', 'sale', 'writeoff']);

  // Branches: the platform ties a second business to this one; the main owner sees both.
  assert.equal((await call('GET', `/api/branches?from=${d0.getTime()}&to=${d0.getTime() + 864e5}`, boss)).status, 404);
  const fil = (await call('POST', '/api/platform/tenants', admin, { name: 'Pro filial', code: 'profilial', owner_name: 'F', owner_username: 'fil', owner_password: 'fil12345', plan: 'pro', kitchen_mode: 'off' })).data;
  assert.equal((await call('PUT', `/api/platform/tenants/${fil.id}`, admin, { parent_id: main.id })).status, 200);
  assert.equal((await call('PUT', `/api/platform/tenants/${main.id}`, admin, { parent_id: fil.id })).status, 400, 'no loops');
  assert.equal((await call('PUT', `/api/platform/tenants/${bizC.id}`, admin, { parent_id: fil.id })).status, 400, 'no branch of a branch');
  const filBoss = await login('fil', 'fil12345', 'profilial');
  const fr = (await call('POST', '/api/rooms', filBoss, { number: '1', name: 'X' })).data;
  const choy = (await call('POST', '/api/dishes', filBoss, { name: 'Choy', price: 5000, needs_kitchen: false })).data;
  const fo = (await call('POST', '/api/orders', filBoss, { room_id: fr.id })).data;
  await call('POST', `/api/orders/${fo.id}/items`, filBoss, { items: [{ dish_id: choy.id, qty: 2 }] });
  assert.equal((await call('POST', `/api/orders/${fo.id}/close`, filBoss, { paid_cash: 11000 })).status, 200);
  assert.equal((await call('GET', '/api/me', boss)).data.branches, 2);
  const br = (await call('GET', `/api/branches?from=${d0.getTime()}&to=${d0.getTime() + 864e5}`, boss)).data;
  assert.equal(br.rows.length, 2);
  assert.equal(br.rows.find((r) => r.code === 'profilial').total, 11000);
  assert.equal(br.total.total, 198000 + 46500 + 11000);
  // The branch's own boss does not see the others.
  assert.equal((await call('GET', `/api/branches?from=${d0.getTime()}&to=${d0.getTime() + 864e5}`, filBoss)).status, 404);
});

test('front page applications: saved first, sent to the Telegram bot, buttons change the status', async () => {
  const http = require('node:http');
  // A small stand-in for api.telegram.org.
  const calls = [];
  const updates = [];
  let nextId = 1;
  let msgId = 100;
  const tg = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const [, token, method] = /^\/bot([^/]+)\/(\w+)$/.exec(req.url) || [];
      const body = raw ? JSON.parse(raw) : {};
      const ok = (result) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result })); };
      if (token !== '123456:ABCdefGHIjklMNOpqrSTUvwxYZ_12345') { res.writeHead(401); return res.end(JSON.stringify({ ok: false, description: 'Unauthorized' })); }
      calls.push({ method, body });
      if (method === 'getMe') return ok({ id: 1, username: 'flowi_test_bot' });
      if (method === 'getUpdates') return setTimeout(() => ok(updates.splice(0).filter((u) => u.update_id >= (body.offset || 0))), 100);
      if (method === 'sendMessage') return ok({ message_id: ++msgId });
      return ok(true);
    });
  });
  await new Promise((r) => tg.listen(0, r));
  process.env.TELEGRAM_API = `http://127.0.0.1:${tg.address().port}`;
  const waitFor = async (fn, what) => {
    for (let i = 0; i < 100; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)); }
    throw new Error(`timeout: ${what} ${JSON.stringify(calls.map((c) => c.method + ':' + (c.body.text || '').slice(0, 30)))}`);
  };
  try {
    // Without a bot the application is still kept.
    assert.equal((await call('POST', '/api/public/lead', null, { name: 'Akmal', phone: '12' })).status, 400);
    assert.equal((await call('POST', '/api/public/lead', null, { name: '', phone: '901234567' })).status, 400);
    const robot = await call('POST', '/api/public/lead', null, { name: 'Bot', phone: '901112233', website: 'x' });
    assert.equal(robot.status, 200);
    const a = await call('POST', '/api/public/lead', null, { name: 'Akmal <b>', phone: '90 123-45-67', business: 'Navro\'z', type: 'choyxona', staff: 8, city: 'Toshkent', call_time: '14:00-18:00', note: 'Qarz daftari kerak', plan: 'pro', source: 'instagram' });
    assert.equal(a.status, 200, JSON.stringify(a.data));
    const again = await call('POST', '/api/public/lead', null, { name: 'Akmal', phone: '+998 90 123 45 67' });
    assert.equal(again.data.id, a.data.id, 'same phone within minutes = one application');

    const admin = (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
    assert.equal((await call('GET', '/api/platform/leads', null)).status, 401);
    let list = (await call('GET', '/api/platform/leads', admin)).data;
    assert.equal(list.rows.length, 1);
    assert.equal(list.rows[0].phone, '+998901234567');
    assert.equal(list.rows[0].tg_sent, 0);
    assert.equal(list.unsent, 1);
    assert.equal(list.rows[0].ip, undefined);

    // Link the bot: token, then the one-time code from the owner's chat.
    assert.equal((await call('PUT', '/api/platform/telegram', admin, { token: 'bad' })).status, 400);
    assert.equal((await call('PUT', '/api/platform/telegram', admin, { token: '999999:ABCdefGHIjklMNOpqrSTUvwxYZ_00000' })).status, 400);
    const st = (await call('PUT', '/api/platform/telegram', admin, { token: '123456:ABCdefGHIjklMNOpqrSTUvwxYZ_12345' })).data;
    assert.equal(st.bot, 'flowi_test_bot');
    assert.match(st.link_code, /^\d{6}$/);
    updates.push({ update_id: nextId++, message: { message_id: 1, chat: { id: 555, type: 'private', first_name: 'Begona' }, text: '/start 000000' } });
    updates.push({ update_id: nextId++, message: { message_id: 2, chat: { id: 777, type: 'private', first_name: 'Ega' }, text: `/start ${st.link_code}` } });
    const linked = await waitFor(async () => { const s = (await call('GET', '/api/platform/telegram', admin)).data; return s.chat_id && s; }, 'link');
    assert.equal(linked.chat_id, 777, 'a wrong code from another chat does not link');
    assert.equal(linked.chat_title, 'Ega');

    // The waiting application goes out by itself once the bot is linked.
    const sent = await waitFor(() => calls.find((c) => c.method === 'sendMessage' && /ariza #/i.test(c.body.text)), 'lead sent');
    assert.equal(sent.body.chat_id, 777);
    assert.match(sent.body.text, /Akmal &lt;b&gt;/);
    assert.match(sent.body.text, /Manba: instagram/);
    assert.equal(sent.body.reply_markup.inline_keyboard.flat().length, 3);
    list = (await call('GET', '/api/platform/leads', admin)).data;
    assert.equal(list.rows[0].tg_sent, 1);

    // A button in Telegram changes the status; one from a stranger's chat does not.
    const id = a.data.id;
    updates.push({ update_id: nextId++, callback_query: { id: 'x1', from: { first_name: 'Begona' }, data: `lead:${id}:rejected`, message: { message_id: 1, chat: { id: 555 } } } });
    updates.push({ update_id: nextId++, callback_query: { id: 'x2', from: { first_name: 'Ega' }, data: `lead:${id}:called`, message: { message_id: sent.id, chat: { id: 777 } } } });
    await waitFor(async () => (await call('GET', '/api/platform/leads', admin)).data.rows[0].status === 'called', 'button');
    assert.ok(calls.some((c) => c.method === 'editMessageText' && /Qo'ng'iroq qilindi/.test(c.body.text)));

    // The panel changes it too, and the Telegram message follows.
    const up = await call('PUT', `/api/platform/leads/${id}`, admin, { status: 'connected', admin_note: 'Pro, 2 filial' });
    assert.equal(up.status, 200);
    assert.equal(up.data.status, 'connected');
    await waitFor(() => calls.some((c) => c.method === 'editMessageText' && /Ulandi/.test(c.body.text) && /2 filial/.test(c.body.text)), 'edit');
    assert.equal((await call('PUT', `/api/platform/leads/${id}`, admin, { status: 'nope' })).status, 400);
    const f = (await call('GET', '/api/platform/leads?status=connected&q=1234567', admin)).data;
    assert.equal(f.rows.length, 1);
    assert.equal(f.counts.connected, 1);

    // A new application is sent right away.
    await call('POST', '/api/public/lead', null, { name: 'Dilshod', phone: '+998 93 000 00 01', lang: 'ru' });
    await waitFor(() => calls.some((c) => c.method === 'sendMessage' && /Dilshod/.test(c.body.text)), 'second lead');
    assert.equal((await call('POST', '/api/platform/telegram/test', admin)).status, 200);

    // Too many from one address.
    let last;
    for (let i = 0; i < 5; i++) last = await call('POST', '/api/public/lead', null, { name: `Spam ${i}`, phone: `+99890000100${i}` });
    assert.equal(last.status, 429);
    assert.equal((await call('DELETE', '/api/platform/telegram', admin)).data.configured, false);
  } finally {
    delete process.env.TELEGRAM_API;
    tg.close();
  }
});

test('QR menu: a guest orders from the table, a worker approves, the check opens', async () => {
  const admin = (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
  const t = (await call('POST', '/api/platform/tenants', admin, { name: 'QR choyxona', code: 'qrchoy', owner_name: 'E', owner_username: 'ega', owner_password: 'ega12345', plan: 'biznes', kitchen_mode: 'full', sample: true })).data;
  const boss = await login('ega', 'ega12345', 'qrchoy');
  const rooms = (await call('GET', '/api/rooms', boss)).data;
  const room = rooms[0];
  const other = rooms[1];
  // Two waiters: Jasur serves the room, Bobur another one.
  const mk = async (name, username) => (await call('POST', '/api/users', boss, { name, username, password: 'pass1234', role: 'waiter' })).data;
  const jasurU = await mk('Jasur', 'jasur');
  const boburU = await mk('Bobur', 'bobur');
  await call('PUT', `/api/rooms/${room.id}`, boss, { waiter_ids: [jasurU.id] });
  await call('PUT', `/api/rooms/${other.id}`, boss, { waiter_ids: [boburU.id] });
  const kassa = (await call('POST', '/api/users', boss, { name: 'Kassir', username: 'kassa', password: 'pass1234', role: 'cashier' })).data;
  const jasur = await login('jasur', 'pass1234', 'qrchoy');
  const bobur = await login('bobur', 'pass1234', 'qrchoy');
  const cashier = await login('kassa', 'pass1234', 'qrchoy');
  assert.ok(kassa.id);

  // QR keys: one per room, secret, renewable.
  const qr = (await call('GET', '/api/qr', boss)).data;
  assert.equal(qr.length, rooms.length);
  const key = qr.find((r) => r.id === room.id).qr_token;
  assert.match(key, new RegExp(`^${t.id}-[A-Za-z0-9]{12}$`));
  assert.equal((await call('GET', '/api/qr', jasur)).status, 403);
  const page = await fetch(`${base}/q/${key}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /guest\.js/);

  // A dish photo.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const asset = (await call('POST', '/api/assets', boss, { kind: 'dish', data: png })).data;
  const menu = (await call('GET', '/api/menu', boss)).data;
  const dish = menu.dishes.find((d) => d.needs_kitchen);
  const tea = menu.dishes.find((d) => d.id !== dish.id);
  assert.equal((await call('PUT', `/api/dishes/${dish.id}`, boss, { photo: asset.id, description: 'Mol go\'shti, sabzi' })).status, 200);

  // The guest's page: no login.
  const gid = 'guest-abc-12345';
  let g = await call('GET', `/api/guest/${key}?g=${gid}`, null);
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.equal(g.data.room.name, room.name);
  assert.deepEqual(g.data.waiters, ['Jasur']);
  assert.equal(g.data.order.can, true);
  const gd = g.data.dishes.find((d) => d.id === dish.id);
  assert.equal(gd.description, "Mol go'shti, sabzi");
  assert.equal((await fetch(base + gd.photo)).status, 200);
  assert.equal((await fetch(`${base}/api/guest/${key}/img/999`)).status, 404);
  assert.equal(g.data.dishes.some((d) => 'cost' in d), false, 'guests never see the cost');
  assert.equal((await call('GET', `/api/guest/${t.id}-AAAAAAAAAAAA`, null)).status, 404);

  // An order request; nothing reaches a check yet.
  const r1 = await call('POST', `/api/guest/${key}/request`, null, { guest_id: gid, items: [{ dish_id: dish.id, qty: 3, note: 'achchiq emas' }, { dish_id: tea.id, qty: 1 }], note: 'Tezroq' });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.equal((await call('GET', '/api/orders?status=open', boss)).data.filter?.((o) => o.room_id === room.id).length || 0, 0);
  assert.equal((await call('POST', `/api/guest/${key}/request`, null, { items: [{ dish_id: 99999, qty: 1 }] })).status, 404);
  assert.equal((await call('POST', `/api/guest/${key}/request`, null, { items: [] })).status, 400);

  // Who hears it: the room's waiter and the cashier, not another waiter.
  assert.equal((await call('GET', '/api/guest-requests', bobur)).data.length, 0);
  let list = (await call('GET', '/api/guest-requests', jasur)).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].items.length, 2);
  assert.equal(list[0].total, dish.price * 3 + tea.price);
  assert.equal((await call('GET', '/api/guest-requests', cashier)).data.length, 1);
  assert.equal((await call('POST', `/api/guest-requests/${r1.data.id}/approve`, bobur, {})).status, 403);

  // Two waiting orders at most per room.
  const r2 = await call('POST', `/api/guest/${key}/request`, null, { guest_id: gid, items: [{ dish_id: tea.id, qty: 2 }] });
  assert.equal(r2.status, 200);
  assert.equal((await call('POST', `/api/guest/${key}/request`, null, { items: [{ dish_id: tea.id, qty: 1 }] })).status, 429);

  // The waiter approves the first one with 2 instead of 3; a dish the guest did not ask for cannot be slipped in.
  const other2 = menu.dishes.find((d) => d.id !== dish.id && d.id !== tea.id);
  assert.equal((await call('POST', `/api/guest-requests/${r1.data.id}/approve`, jasur, { items: [{ dish_id: other2.id, qty: 1 }] })).status, 400);
  const ap = await call('POST', `/api/guest-requests/${r1.data.id}/approve`, jasur, { items: [{ dish_id: dish.id, qty: 2 }, { dish_id: tea.id, qty: 1 }] });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  const order = ap.data.order;
  assert.equal(order.room_id, room.id);
  assert.equal(order.waiter_id, jasurU.id);
  assert.equal(order.items.find((i) => i.dish_id === dish.id).qty, 2);
  assert.equal(order.items.find((i) => i.dish_id === dish.id).note, 'achchiq emas');
  assert.equal((await call('POST', `/api/guest-requests/${r1.data.id}/approve`, jasur, {})).status, 409, 'answered once');
  // The cashier rejects the second; it goes to the same check otherwise.
  assert.equal((await call('POST', `/api/guest-requests/${r2.data.id}/reject`, cashier, { reason: 'Choy tugadi' })).status, 200);

  // The guest sees what happened and the bill.
  g = (await call('GET', `/api/guest/${key}?g=${gid}`, null)).data;
  assert.deepEqual(g.requests.map((r) => r.status), ['rejected', 'approved']);
  assert.equal(g.requests[0].reason, 'Choy tugadi');
  assert.equal(g.bill.items.length, 2);
  assert.ok(g.bill.total > 0);
  assert.equal((await call('GET', `/api/guest/${key}?g=someone-else-1`, null)).data.requests.length, 0, 'other phones do not see these');

  // Call the waiter (once is enough) and ask for the bill.
  const c1 = await call('POST', `/api/guest/${key}/request`, null, { kind: 'waiter', guest_id: gid });
  const c2 = await call('POST', `/api/guest/${key}/request`, null, { kind: 'waiter', guest_id: gid });
  assert.equal(c2.data.id, c1.data.id);
  assert.equal(c2.data.again, true);
  await call('POST', `/api/guest/${key}/request`, null, { kind: 'bill' });
  assert.equal((await call('GET', `/api/orders/${order.id}`, boss)).data.bill_requested, 1);
  list = (await call('GET', '/api/guest-requests', jasur)).data;
  assert.deepEqual(list.map((x) => x.kind).sort(), ['bill', 'waiter']);
  assert.equal((await call('POST', `/api/guest-requests/${c1.data.id}/done`, jasur)).status, 200);

  // The boss can stop orders (menu stays), set hours, renew a QR code.
  await call('PUT', '/api/settings', boss, { qr_order: false });
  g = (await call('GET', `/api/guest/${key}`, null)).data;
  assert.equal(g.order.can, false);
  assert.equal((await call('POST', `/api/guest/${key}/request`, null, { items: [{ dish_id: tea.id, qty: 1 }] })).status, 409);
  assert.equal((await call('PUT', '/api/settings', boss, { qr_order: true, qr_from: '25:00' })).status, 400);
  await call('PUT', '/api/settings', boss, { qr_order: true, qr_from: '', qr_to: '' });
  const renewed = (await call('POST', `/api/rooms/${room.id}/qr`, boss)).data;
  assert.notEqual(renewed.qr_token, key);
  assert.equal((await call('GET', `/api/guest/${key}`, null)).status, 404);
  assert.equal((await call('GET', `/api/guest/${renewed.qr_token}`, null)).status, 200);

  // Start plan: menu only; without the QR menu section the page is closed.
  await call('PUT', `/api/platform/tenants/${t.id}`, admin, { plan: 'start' });
  g = (await call('GET', `/api/guest/${renewed.qr_token}`, null)).data;
  assert.equal(g.order.can, false);
  assert.equal(g.order.why, 'plan');
  assert.equal((await call('GET', '/api/guest-requests', boss)).status, 403);
  await call('PUT', `/api/platform/tenants/${t.id}`, admin, { disabled_modules: ['qrmenu'] });
  assert.equal((await call('GET', `/api/guest/${renewed.qr_token}`, null)).status, 404);
});

test('door shop: goods in with freight, sale with installation and credit, damage, rent, tasks, profit', async () => {
  const admin = (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
  await call('POST', '/api/platform/tenants', admin, { name: "Eshik olami", code: 'eshik', owner_name: 'Aziz', owner_username: 'aziz', owner_password: 'aziz12345', plan: 'biznes', business_type: 'doors', sample: true });
  const boss = await login('aziz', 'aziz12345', 'eshik');
  const me = (await call('GET', '/api/me', boss)).data;
  assert.equal(me.business_type, 'doors');
  assert.ok(me.settings.expense_categories.includes('Ijara'));
  const menu = (await call('GET', '/api/menu', boss)).data;
  const door = menu.dishes.find((d) => d.size === '2000×800' && d.side === "O'ng");
  const lock = menu.dishes.find((d) => /Qulf/.test(d.name));
  assert.equal(door.material, 'MDF');
  assert.equal(door.cost, 980000);

  // Goods arrive on part credit; the freight goes into each item's cost.
  const sup = (await call('POST', '/api/suppliers', boss, { name: 'Zavod "Dveri"', phone: '+998901112233' })).data;
  const due = localDay(3);
  const p = await call('POST', '/api/purchases', boss, { supplier_id: sup.id, freight: 500000, paid: 3000000, due_date: due,
    items: [{ dish_id: door.id, qty: 4, price: 1000000 }, { dish_id: lock.id, qty: 10, price: 100000 }] });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  assert.deepEqual(p.data.items.map((i) => i.unit_cost), [1100000, 110000]);
  let m2 = (await call('GET', '/api/menu', boss)).data;
  assert.equal(m2.dishes.find((d) => d.id === door.id).cost, 1028000, 'running average of 6 × 980 000 and 4 × 1 100 000');
  assert.equal(m2.dishes.find((d) => d.id === door.id).stock, 10);
  assert.equal(m2.dishes.find((d) => d.id === lock.id).cost, 116000);
  let s = (await call('GET', `/api/suppliers/${sup.id}`, boss)).data;
  assert.equal(s.debt, 2000000);
  let tk = (await call('GET', '/api/tasks', boss)).data;
  assert.ok(tk.upcoming.some((x) => x.ref === `supplier:${sup.id}` && /2 000 000/.test(x.title)));
  assert.equal((await call('POST', '/api/purchases', boss, { paid: 0, items: [{ dish_id: lock.id, qty: 1, price: 1 }] })).status, 400, 'credit needs a supplier');

  // An installer; a sale: door + lock + installation + delivery; 1 000 000 now, the rest on credit.
  const usta = (await call('POST', '/api/masters', boss, { name: 'Usta Botir', phone: '+998935554433' })).data;
  const cust = (await call('POST', '/api/customers', boss, { name: 'Akmal aka', phone: '+998901234567' })).data;
  const tomorrow = localDay(1);
  const sale = await call('POST', '/api/sales', boss, {
    items: [{ dish_id: door.id, qty: 1 }, { dish_id: lock.id, qty: 1 }],
    services: [{ kind: 'install', price: 300000, cost: 200000, master_id: usta.id, date: tomorrow, time: '15:00', address: 'Chilonzor 5-uy' },
      { kind: 'delivery', price: 100000, cost: 70000, date: tomorrow, time: '11:00', address: 'Chilonzor 5-uy' }],
    customer_id: cust.id, paid_cash: 1000000, paid_debt: 1030000, debt_due: tomorrow });
  assert.equal(sale.status, 200, JSON.stringify(sale.data));
  assert.equal(sale.data.total, 2030000);
  assert.equal(sale.data.profit, 2030000 - 1028000 - 116000 - 200000 - 70000);
  assert.equal(sale.data.jobs.length, 2);
  tk = (await call('GET', '/api/tasks', boss)).data;
  const jobTask = tk.upcoming.find((x) => x.ref === `job:${sale.data.jobs.find((j) => j.kind === 'install').id}`);
  assert.ok(jobTask && /Usta Botir/.test(jobTask.title) && jobTask.has_time === 1);
  assert.ok(tk.upcoming.some((x) => x.ref === `debt:${cust.id}` && /1 030 000/.test(x.title)));
  const inv = (await call('GET', `/api/orders/${sale.data.id}/invoice`, boss)).data;
  assert.equal(inv.customer.name, 'Akmal aka');
  assert.equal(inv.address, 'Chilonzor 5-uy');
  assert.equal(inv.debt, 1030000);
  assert.equal(inv.items.length, 4);

  // The installation is done (ticked from the task), the installer is paid.
  assert.equal((await call('POST', `/api/tasks/${jobTask.id}/done`, boss, {})).status, 200);
  assert.equal((await call('GET', '/api/jobs?status=done', boss)).data.length, 1);
  assert.equal((await call('GET', '/api/masters', boss)).data[0].owed, 200000);
  assert.equal((await call('POST', `/api/masters/${usta.id}/pay`, boss, { method: 'cash' })).data.amount, 200000);
  assert.equal((await call('GET', '/api/masters', boss)).data[0].owed, 0);

  // A damaged door, a lock short at the count, a lock brought back.
  assert.equal((await call('POST', `/api/dishes/${door.id}/writeoff`, boss, { qty: 1 })).status, 400, 'reason needed');
  assert.equal((await call('POST', `/api/dishes/${door.id}/writeoff`, boss, { qty: 1, reason: 'Singan' })).data.stock, 8);
  assert.equal((await call('POST', `/api/dishes/${door.id}/writeoff`, boss, { qty: 9, reason: 'Singan' })).status, 400, 'no more than in stock');
  const ref = await call('POST', `/api/orders/${sale.data.id}/refund`, boss, { items: [{ item_id: sale.data.items.find((i) => i.dish_id === lock.id).id, qty: 1 }], reason: 'Mos kelmadi' });
  assert.equal(ref.status, 200, JSON.stringify(ref.data));
  const cnt = (await call('POST', `/api/dishes/${lock.id}/count`, boss, { qty: 24 })).data;
  assert.equal(cnt.diff, -1);

  // Rent: a monthly task with an amount; ticking it writes the expense and the next one appears.
  const today = localDay();
  const rent = (await call('POST', '/api/tasks', boss, { title: "Ijara to'lash", date: today, repeat: 'monthly', amount: 4000000, category: 'Ijara' })).data;
  assert.equal((await call('POST', `/api/tasks/${rent.id}/done`, boss, { method: 'cash' })).status, 200);
  tk = (await call('GET', '/api/tasks?days=40', boss)).data;
  assert.ok(tk.upcoming.some((x) => x.title === "Ijara to'lash" && x.repeat === 'monthly'));
  assert.ok(tk.done.some((x) => x.title === "Ijara to'lash"));

  // System entries cannot be deleted from the cash book.
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const txs = (await call('GET', `/api/transactions?from=${d0.getTime()}`, boss)).data;
  const pt = txs.find((x) => x.category === 'Mol xaridi');
  assert.equal(pt.amount, 3500000);
  assert.equal((await call('DELETE', `/api/transactions/${pt.id}`, boss)).status, 400);

  // The profit report: sales − goods − workers − damage − running costs.
  const r = (await call('GET', `/api/profit?from=${d0.getTime()}&to=${d0.getTime() + 864e5}`, boss)).data;
  assert.equal(r.revenue, 2030000 - 180000);
  assert.equal(r.goods_cost, 1028000);
  assert.equal(r.service_cost, 270000);
  assert.equal(r.damage, 1028000 + 116000);
  assert.deepEqual(r.running.map((x) => [x.category, x.amount]), [['Ijara', 4000000]]);
  assert.equal(r.net, 1850000 - 1028000 - 270000 - 1144000 - 4000000);
  assert.equal(r.top_qty[0].id, door.id);
  assert.ok(r.stock_value > 0);
  assert.equal(r.debts.owed_to_us, 1030000);
  assert.equal(r.debts.we_owe, 2000000);

  // Paying debts closes their tasks.
  await call('POST', `/api/suppliers/${sup.id}/pay`, boss, { amount: 2000000 });
  await call('POST', `/api/customers/${cust.id}/pay`, boss, { amount: 1030000, method: 'cash' });
  tk = (await call('GET', '/api/tasks', boss)).data;
  assert.ok(![...tk.overdue, ...tk.today, ...tk.upcoming].some((x) => /^(debt|supplier):/.test(x.ref)));

  // "Bugun": today's numbers, low stock, tasks.
  const td = (await call('GET', '/api/today', boss)).data;
  assert.equal(td.shop, true);
  assert.equal(td.money.revenue, 1850000);
  assert.ok(Array.isArray(td.low_stock));

  // Loading goods from an Excel list.
  const im = await call('POST', '/api/import/products', boss, { rows: [
    { name: 'Metall eshik "Sfinks"', size: '2050×960', color: 'Qora', material: 'Metall', side: "O'ng", category: 'Metall eshiklar', cost: 2500000, price: 3400000, stock: 2, min_stock: 1 },
    { name: 'MDF eshik "Klassik"', size: '2000×800', color: 'Oq', material: 'MDF', side: "O'ng", price: 1500000, cost: 1100000, stock: 2 }] });
  assert.equal(im.status, 200, JSON.stringify(im.data));
  assert.deepEqual(im.data, { added: 1, updated: 1 });
  m2 = (await call('GET', '/api/menu', boss)).data;
  assert.equal(m2.dishes.find((d) => d.id === door.id).price, 1500000);
  assert.equal(m2.dishes.find((d) => d.id === door.id).stock, 10);
  assert.equal((await call('POST', '/api/import/products', boss, { rows: [{ name: '', price: 1 }] })).status, 400);

  // Own barcodes for goods without one: EAN-13 "20…", valid check digit, found by the till.
  const bc = (await call('POST', '/api/barcodes', boss, { ids: [door.id, lock.id] })).data;
  const code = bc.find((x) => x.id === door.id).barcode;
  assert.match(code, /^20\d{11}$/);
  const digits = [...code].map(Number);
  assert.equal((10 - (digits.slice(0, 12).reduce((s, d, i) => s + d * (i % 2 ? 3 : 1), 0) % 10)) % 10, digits[12]);
  const again = (await call('POST', '/api/barcodes', boss, { ids: [door.id] })).data;
  assert.equal(again[0].barcode, code, 'a code once given stays');
  assert.equal((await call('GET', '/api/menu', boss)).data.dishes.find((d) => d.id === door.id).barcode, code);

  // A worker sees only their own tasks; the chef can tick a task given to them.
  const seller = (await call('POST', '/api/users', boss, { name: 'Sotuvchi Ali', username: 'ali', password: 'ali12345', role: 'waiter' })).data;
  const ali = await login('ali', 'ali12345', 'eshik');
  const mine = (await call('POST', '/api/tasks', boss, { title: 'Vitrinani artish', date: today, assignee_id: seller.id })).data;
  const aliTasks = (await call('GET', '/api/tasks', ali)).data;
  assert.deepEqual([...aliTasks.today, ...aliTasks.overdue].map((x) => x.id), [mine.id]);
  assert.equal((await call('POST', `/api/tasks/${rent.id}/done`, ali, {})).status, 403);
  assert.equal((await call('POST', `/api/tasks/${mine.id}/done`, ali, {})).status, 200);
  assert.equal((await call('GET', '/api/profit?from=1&to=2', ali)).status, 403);
});

test("a business owner's Telegram: linked with a code, the morning list of tasks", async () => {
  const http = require('node:http');
  const sent = [];
  const updates = [];
  const tg = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const method = /\/(\w+)$/.exec(req.url)[1];
      const body = raw ? JSON.parse(raw) : {};
      const ok = (result) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result })); };
      if (method === 'getMe') return ok({ username: 'flowi_bot' });
      if (method === 'getUpdates') return setTimeout(() => ok(updates.splice(0)), 80);
      if (method === 'sendMessage') { sent.push(body); return ok({ message_id: sent.length }); }
      return ok(true);
    });
  });
  await new Promise((r) => tg.listen(0, r));
  process.env.TELEGRAM_API = `http://127.0.0.1:${tg.address().port}`;
  const waitFor = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)); } throw new Error(what); };
  try {
    const admin = (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
    const boss = await login('aziz', 'aziz12345', 'eshik');
    let st = (await call('GET', '/api/telegram', boss)).data;
    assert.equal(st.bot_ready, false);
    assert.equal((await call('POST', '/api/telegram/link', boss)).status, 409);
    await call('PUT', '/api/platform/telegram', admin, { token: '123456:ABCdefGHIjklMNOpqrSTUvwxYZ_12345' });
    st = (await call('POST', '/api/telegram/link', boss)).data;
    assert.match(st.link_code, /^b\d{8}$/);
    updates.push({ update_id: 1, message: { message_id: 1, chat: { id: 4242, type: 'private', first_name: 'Aziz' }, text: `/start ${st.link_code}` } });
    await waitFor(async () => (await call('GET', '/api/telegram', boss)).data.linked, 'linked');
    assert.ok(sent.some((m) => m.chat_id === 4242 && /Ulandi/.test(m.text)));
    // A task for today with a time in the next hour.
    const soon = new Date(Date.now() + 30 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    if (soon.getDate() === new Date().getDate()) {
      await call('POST', '/api/tasks', boss, { title: 'Usta bilan uchrashuv', date: `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`, time: `${pad(soon.getHours())}:${pad(soon.getMinutes())}` });
    }
    await server.platform.remindTick({ forceMorning: true });
    const morning = sent.find((m) => /Xayrli tong/.test(m.text));
    assert.ok(morning, JSON.stringify(sent));
    assert.equal(String(morning.chat_id), '4242');
    assert.match(morning.text, /Eshik olami/);
    if (soon.getDate() === new Date().getDate()) assert.ok(sent.some((m) => /⏰/.test(m.text) && /Usta bilan uchrashuv/.test(m.text)));
    const n = sent.length;
    await server.platform.remindTick({ forceMorning: true });
    assert.equal(sent.length, n, 'once a day, each reminder once');
    assert.equal((await call('POST', '/api/telegram/test', boss)).status, 200);
    const ali = await login('ali', 'ali12345', 'eshik');
    assert.equal((await call('GET', '/api/telegram', ali)).status, 403);
    assert.equal((await call('DELETE', '/api/telegram', boss)).data.linked, false);
  } finally {
    delete process.env.TELEGRAM_API;
    tg.close();
  }
});

test('work hours and the place: GPS, the desk QR, a selfie, a cashier confirms, guests order only inside', async () => {
  const admin = (await call('POST', '/api/platform/login', null, { username: 'superadmin', password: 'super123' })).data.token;
  const t = (await call('POST', '/api/platform/tenants', admin, { name: 'Joy choyxona', code: 'joy', owner_name: 'Ega', owner_username: 'ega', owner_password: 'ega12345', plan: 'pro', sample: true })).data;
  const boss = await login('ega', 'ega12345', 'joy');
  const mk = async (name, username, role, pin) => (await call('POST', '/api/users', boss, { name, username, password: 'pass1234', role, pin })).data;
  const w1 = await mk('Jasur', 'jasur', 'waiter', '1111');
  const w2 = await mk('Bobur', 'bobur', 'waiter', '2222');
  await mk('Kassir', 'kassa', 'cashier', '3333');
  const HERE = { lat: 41.311081, lng: 69.240562 };
  const NEAR = { lat: 41.3115, lng: 69.2407, acc: 15 }; // ~50 m
  const FAR = { lat: 41.33, lng: 69.28, acc: 10 }; // ~4 km

  // Switched off by default: nothing changes for anyone.
  const jasur0 = await login('jasur', 'pass1234', 'joy');
  assert.equal((await call('GET', '/api/rooms', jasur0)).status, 200);
  // Place features need the place first.
  const noPlace = await call('PUT', '/api/settings', boss, { geo_staff: true });
  assert.equal(noPlace.status, 400);
  assert.equal((await call('GET', '/api/me', boss)).data.settings.geo_staff, false);
  const set = await call('PUT', '/api/settings', boss, { geo_lat: HERE.lat, geo_lng: HERE.lng, geo_radius: 150, geo_staff: true, att_clock: true, att_gps: true, att_qr: true, att_selfie: true, work_from: '09:00' });
  assert.equal(set.status, 200, JSON.stringify(set.data));
  assert.equal(set.data.att_secret, undefined, 'the QR secret never leaves the server');

  // A waiter on his own phone: closed until "I came".
  const jasur = await login('jasur', 'pass1234', 'joy');
  let r = await call('GET', '/api/rooms', jasur);
  assert.equal(r.status, 403); assert.equal(r.data.code, 'clock');
  const me = (await call('GET', '/api/me', jasur)).data;
  assert.deepEqual(me.work.rules, { geo: true, clock: true, gps: true, qr: true, selfie: true });
  r = await call('POST', '/api/work/in', jasur, { ...FAR });
  assert.equal(r.status, 403); assert.equal(r.data.code, 'gps_far'); assert.match(r.data.error, /m uzoqdasiz/);
  r = await call('POST', '/api/work/in', jasur, { ...NEAR, qr: 'FLOWI-ISH:AAAAAAAAAAAA' });
  assert.equal(r.data.code, 'qr');
  assert.equal((await call('GET', '/api/work/qr', jasur)).status, 403, 'a waiter cannot show himself the code');
  const code = (await call('GET', '/api/work/qr', boss)).data;
  assert.match(code.text, /^FLOWI-ISH:[A-Za-z0-9_-]{12}$/);
  r = await call('POST', '/api/work/in', jasur, { ...NEAR, qr: code.text });
  assert.equal(r.data.code, 'selfie');
  const jpg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  r = await call('POST', '/api/work/in', jasur, { ...NEAR, qr: code.text, photo: jpg });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.open.status, 'ok');
  assert.equal((await call('GET', '/api/rooms', jasur)).status, 200, 'at work and inside');
  assert.equal((await call('POST', '/api/work/in', jasur, { ...NEAR, qr: code.text, photo: jpg })).status, 409);
  // Away from the place: a GPS check fails and does not renew the pass.
  const out = (await call('POST', '/api/geo/check', jasur, FAR)).data;
  assert.equal(out.ok, false); assert.ok(out.dist > 3000);
  assert.equal((await call('POST', '/api/geo/check', jasur, NEAR)).data.ok, true);

  // The boss's day: when, how, the selfie.
  let log = (await call('GET', '/api/work/log', boss)).data;
  const e1 = log.entries.find((e) => e.user_id === w1.id);
  assert.equal(e1.in_how, 'gps+qr+selfie'); assert.ok(e1.in_dist < 150); assert.equal(e1.photo, true);
  assert.match((await call('GET', `/api/work/${e1.id}/photo`, boss)).data.data, /^data:image\/png;base64,/);
  assert.equal((await call('GET', `/api/work/${e1.id}/photo`, jasur)).status, 403);
  const att = (await call('GET', '/api/attendance', boss)).data.staff.find((x) => x.id === w1.id);
  assert.equal(att.status, 'present');

  // No GPS indoors: Bobur asks, the cashier confirms; until then the program stays closed.
  const bobur = await login('bobur', 'pass1234', 'joy');
  r = await call('POST', '/api/work/in', bobur, { ask: true, photo: jpg });
  assert.equal(r.status, 200); assert.equal(r.data.open.status, 'pending');
  assert.equal((await call('GET', '/api/rooms', bobur)).data.code, 'clock');
  const cashier = await login('kassa', 'pass1234', 'joy');
  assert.equal((await call('GET', '/api/rooms', cashier)).data.code, 'clock', 'the cashier on her own phone too');
  const pend = (await call('GET', '/api/work/pending', boss)).data;
  assert.equal(pend.length, 1); assert.equal(pend[0].name, 'Bobur');
  assert.equal((await call('POST', `/api/work/${pend[0].id}/approve`, jasur)).status, 403);
  assert.equal((await call('POST', `/api/work/${pend[0].id}/approve`, boss)).status, 200);
  assert.equal((await call('GET', '/api/rooms', bobur)).status, 200, 'confirmed in the hall: inside for the day');

  // "I left": closed again; the time is kept.
  r = await call('POST', '/api/work/out', jasur, NEAR);
  assert.equal(r.status, 200);
  assert.equal((await call('GET', '/api/rooms', jasur)).data.code, 'clock');
  log = (await call('GET', '/api/work/log', boss)).data;
  assert.ok(log.entries.find((e) => e.id === e1.id).out_at);

  // A shared device in the hall: the PIN sign-in is "I came", no GPS, QR or selfie asked.
  const dev = (await call('POST', '/api/device/register', null, { code: 'joy', username: 'ega', password: 'ega12345', name: 'Kassa PC' })).data.device_token;
  const k = (await call('GET', '/api/device/staff', dev)).data.find((u) => u.name === 'Kassir');
  const ks = (await call('POST', '/api/device/pin', dev, { user_id: k.id, pin: '3333' })).data.token;
  assert.equal((await call('GET', '/api/rooms', ks)).status, 200);
  assert.match((await call('GET', '/api/device/work-qr', dev)).data.text, /^FLOWI-ISH:/);
  log = (await call('GET', '/api/work/log', boss)).data;
  assert.equal(log.entries.find((e) => e.name === 'Kassir').in_how, 'device');
  // Closing the cash desk ends everyone's day.
  await call('POST', '/api/shifts/open', ks, { opening_cash: 0 });
  await call('POST', '/api/shifts/close', ks, { closing_cash: 0 });
  log = (await call('GET', '/api/work/log', boss)).data;
  assert.ok(log.entries.every((e) => e.out_at), JSON.stringify(log.entries));

  // Guests: a QR link that went round works only inside, and only at a table the waiter opened.
  await call('PUT', '/api/settings', boss, { qr_order: true, qr_geo: true, qr_busy: true, geo_staff: false, att_clock: false });
  const qr = (await call('GET', '/api/qr', boss)).data;
  const key = qr[0].qr_token;
  const menu = (await call('GET', '/api/menu', boss)).data;
  const items = [{ dish_id: menu.dishes[0].id, qty: 1 }];
  const g = (await call('GET', `/api/guest/${key}`, null)).data;
  assert.equal(g.order.geo, true); assert.equal(g.order.busy_only, true); assert.equal(g.order.busy, false);
  r = await call('POST', `/api/guest/${key}/request`, null, { kind: 'order', items });
  assert.equal(r.status, 403); assert.equal(r.data.code, 'geo_need');
  r = await call('POST', `/api/guest/${key}/request`, null, { kind: 'order', items, ...FAR });
  assert.equal(r.data.code, 'geo_far');
  r = await call('POST', `/api/guest/${key}/request`, null, { kind: 'order', items, ...NEAR });
  assert.equal(r.status, 409); assert.equal(r.data.code, 'not_busy');
  assert.equal((await call('POST', `/api/guest/${key}/request`, null, { kind: 'waiter', ...NEAR })).status, 200, 'calling the waiter always works inside');
  await call('POST', '/api/orders', boss, { room_id: qr[0].id });
  r = await call('POST', `/api/guest/${key}/request`, null, { kind: 'order', items, ...NEAR });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // Every QR gets a new key: the old link stops working.
  const fresh = (await call('POST', '/api/qr/renew', boss)).data;
  assert.notEqual(fresh[0].qr_token, key);
  assert.equal((await call('GET', `/api/guest/${key}`, null)).status, 404);
  assert.ok(t.id);
});
