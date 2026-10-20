'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./util');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','cashier','waiter','chef')),
  phone TEXT DEFAULT '',
  salary INTEGER DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'banket',
  capacity INTEGER NOT NULL DEFAULT 10,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS room_waiters (
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, user_id)
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS dishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  prep_minutes INTEGER NOT NULL DEFAULT 10,
  unit TEXT NOT NULL DEFAULT 'porsiya',
  needs_kitchen INTEGER NOT NULL DEFAULT 1,
  available INTEGER NOT NULL DEFAULT 1,
  stock INTEGER,
  icon TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  waiter_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  guests INTEGER NOT NULL DEFAULT 1,
  bill_requested INTEGER NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  cashier_id INTEGER REFERENCES users(id),
  subtotal INTEGER NOT NULL DEFAULT 0,
  service_pct REAL NOT NULL DEFAULT 0,
  service_amount INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  paid_cash INTEGER NOT NULL DEFAULT 0,
  paid_card INTEGER NOT NULL DEFAULT 0,
  paid_transfer INTEGER NOT NULL DEFAULT 0,
  cancel_reason TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_closed ON orders(closed_at);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  dish_id INTEGER REFERENCES dishes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','cooking','ready','served','cancelled')),
  needs_kitchen INTEGER NOT NULL DEFAULT 1,
  prep_minutes INTEGER NOT NULL DEFAULT 10,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  ready_at INTEGER,
  served_at INTEGER,
  eta_at INTEGER,
  chef_id INTEGER REFERENCES users(id),
  cancel_reason TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_items_status ON order_items(status);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  note TEXT DEFAULT '',
  order_id INTEGER REFERENCES orders(id),
  user_id INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  customer TEXT NOT NULL,
  phone TEXT DEFAULT '',
  guests INTEGER NOT NULL DEFAULT 1,
  starts_at INTEGER NOT NULL,
  deposit INTEGER NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','arrived','cancelled')),
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cashier_id INTEGER NOT NULL REFERENCES users(id),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  opening_cash INTEGER NOT NULL DEFAULT 0,
  closing_cash INTEGER,
  expected_cash INTEGER,
  note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pay_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pay_type TEXT NOT NULL CHECK (pay_type IN ('monthly','daily','none')),
  amount INTEGER NOT NULL DEFAULT 0,
  sales_pct REAL NOT NULL DEFAULT 0,
  from_day TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pay_rates_user ON pay_rates(user_id, from_day);
CREATE TABLE IF NOT EXISTS attendance (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'auto',
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('payment','bonus','fine')),
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  note TEXT DEFAULT '',
  day TEXT NOT NULL,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payroll_user ON payroll(user_id, day);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit(created_at);
`;

const DEFAULT_SETTINGS = {
  name: 'Choyxona',
  address: '',
  phone: '',
  service_pct: '10',
  currency: "so'm",
  receipt_footer: 'Xaridingiz uchun rahmat! Yana kutib qolamiz.',
  receipt_width: '80',
  expense_categories: JSON.stringify([
    'Mahsulotlar', 'Ish haqi', 'Ijara', 'Kommunal', "Go'sht", 'Sabzavot', 'Ichimliklar',
    'Gaz', 'Transport', "Ta'mirlash", 'Soliq', 'Boshqa',
  ]),
  income_categories: JSON.stringify(['Banket avansi', 'Boshqa kirim']),
};

function seedSettings(db, name) {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);
  }
  if (name) db.prepare("UPDATE settings SET value = ? WHERE key = 'name'").run(name);
}

function addUser(db, name, username, password, role) {
  return db.prepare('INSERT INTO users (name, username, pass_hash, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, username, hashPassword(password), role, '', Date.now()).lastInsertRowid;
}

// Sample rooms and menu; waiters (if given) are spread over the rooms.
function seedRoomsAndMenu(db, waiterIds = []) {
  const addRoom = db.prepare('INSERT INTO rooms (number, name, type, capacity) VALUES (?, ?, ?, ?)');
  const assign = db.prepare('INSERT INTO room_waiters (room_id, user_id) VALUES (?, ?)');
  const rooms = [
    ['1', 'Banket 1', 'banket', 20], ['2', 'Banket 2', 'banket', 20], ['3', 'Banket 3', 'banket', 30],
    ['4', 'VIP xona', 'vip', 12], ['5', 'Supa 1', 'supa', 8], ['6', 'Supa 2', 'supa', 8],
    ['7', 'Stol 7', 'stol', 4], ['8', 'Stol 8', 'stol', 4],
  ];
  rooms.forEach((r, i) => {
    const id = addRoom.run(...r).lastInsertRowid;
    if (waiterIds.length) assign.run(id, waiterIds[Math.floor((i * waiterIds.length) / rooms.length)]);
  });

  const addCat = db.prepare('INSERT INTO categories (name, icon, sort) VALUES (?, ?, ?)');
  const addDish = db.prepare(
    'INSERT INTO dishes (category_id, name, price, cost, prep_minutes, unit, needs_kitchen, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const menu = [
    ['Suyuq taomlar', '🍲', [
      ["Sho'rva", 35000, 14000, 15, '🍲'], ["Mastava", 30000, 11000, 15, '🍲'],
      ["Chuchvara", 32000, 12000, 12, '🥟'], ["Lag'mon", 38000, 14000, 18, '🍜'],
    ]],
    ['Quyuq taomlar', '🍛', [
      ['Osh (palov)', 45000, 18000, 10, '🍛'], ['Manti', 40000, 15000, 25, '🥟'],
      ['Qozon kabob', 70000, 32000, 30, '🍖'], ['Dimlama', 48000, 19000, 20, '🥘'],
    ]],
    ["Kaboblar", '🍢', [
      ["Jigar kabob", 18000, 8000, 15, '🍢'], ["Lula kabob", 20000, 9000, 15, '🍢'],
      ["Qo'y go'shti kabob", 25000, 12000, 18, '🍢'],
    ]],
    ['Salatlar', '🥗', [
      ['Achchiq-chuchuk', 15000, 5000, 5, '🥗'], ['Olivye', 22000, 8000, 5, '🥗'],
    ]],
    ['Ichimliklar', '🫖', [
      ["Ko'k choy (choynak)", 5000, 800, 2, '🫖', 0], ['Qora choy (choynak)', 5000, 800, 2, '🫖', 0],
      ['Limon choy', 12000, 3000, 3, '🍋', 0], ['Coca-Cola 1L', 14000, 9000, 0, '🥤', 0],
    ]],
    ['Non va boshqalar', '🫓', [
      ['Tandir non', 5000, 2500, 0, '🫓', 0], ['Patir non', 8000, 4000, 0, '🫓', 0],
    ]],
  ];
  menu.forEach(([cat, icon, dishes], i) => {
    const cid = addCat.run(cat, icon, i).lastInsertRowid;
    for (const [name, price, cost, prep, dicon, kitchen = 1] of dishes) {
      addDish.run(cid, name, price, cost, prep, 'porsiya', kitchen, dicon);
    }
  });
}

/*
 * opts.owner: { name, username, password } — first boss account of a new choyxona.
 * opts.demo: demo staff (ega/admin/kassir/jasur/bobur/oshpaz), rooms and menu.
 * opts.sample: sample rooms and menu only.
 */
function seed(db, opts = {}) {
  seedSettings(db, opts.name);
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return;
  if (opts.demo) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('demo', '1')").run();
    addUser(db, 'Boshliq', 'ega', 'ega123', 'owner');
    addUser(db, 'Administrator', 'admin', 'admin123', 'admin');
    addUser(db, 'Kassir Dilnoza', 'kassir', 'kassir123', 'cashier');
    const w1 = addUser(db, 'Ofitsant Jasur', 'jasur', '1234', 'waiter');
    const w2 = addUser(db, 'Ofitsant Bobur', 'bobur', '1234', 'waiter');
    const chef = addUser(db, 'Oshpaz Rustam', 'oshpaz', '1234', 'chef');
    seedRoomsAndMenu(db, [w1, w2]);
    // Sample pay: monthly for admin and cashier, daily + % of own sales for waiters, daily for the chef.
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const rate = db.prepare('INSERT INTO pay_rates (user_id, pay_type, amount, sales_pct, from_day, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    rate.run(2, 'monthly', 4000000, 0, day, Date.now());
    rate.run(3, 'monthly', 3000000, 0, day, Date.now());
    rate.run(w1, 'daily', 120000, 3, day, Date.now());
    rate.run(w2, 'daily', 120000, 3, day, Date.now());
    rate.run(chef, 'daily', 200000, 0, day, Date.now());
    return;
  }
  if (opts.owner) addUser(db, opts.owner.name, opts.owner.username, opts.owner.password, 'owner');
  if (opts.sample) seedRoomsAndMenu(db);
}

// Columns added after the first release; older databases get them here.
function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('left_at')) db.exec('ALTER TABLE users ADD COLUMN left_at INTEGER');
  // The single "salary" field of the first release becomes a monthly pay rate.
  const legacy = db.prepare(`SELECT id, salary, created_at FROM users WHERE salary > 0
    AND id NOT IN (SELECT user_id FROM pay_rates)`).all();
  for (const u of legacy) {
    const d = new Date(u.created_at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    db.prepare("INSERT INTO pay_rates (user_id, pay_type, amount, from_day, created_at) VALUES (?, 'monthly', ?, ?, ?)")
      .run(u.id, u.salary, day, Date.now());
  }
}

function open(file, opts) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  seed(db, opts);
  return db;
}

module.exports = { open };
