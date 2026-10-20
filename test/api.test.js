'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
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

async function login(username, password) {
  const r = await call('POST', '/api/login', null, { username, password });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.token;
}

test.before(async () => {
  server = createServer({ dbFile: ':memory:' });
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
  const info = (await call('GET', '/api/info')).data;
  assert.equal(info.demo, true);
  for (let i = 0; i < 8; i++) assert.equal((await call('POST', '/api/login', null, { username: 'kassir', password: 'xato' })).status, 401);
  assert.equal((await call('POST', '/api/login', null, { username: 'kassir', password: 'kassir123' })).status, 429);
});
