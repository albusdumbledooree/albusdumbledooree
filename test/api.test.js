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

test.before(async () => {
  server = createServer({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'choyxona-test-')) });
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
  assert.deepEqual(me.disabled.sort(), ['history', 'payroll']);
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
