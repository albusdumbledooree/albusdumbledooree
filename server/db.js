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
  type TEXT NOT NULL CHECK (type IN ('payment','advance','bonus','fine','deduction')),
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  note TEXT DEFAULT '',
  day TEXT NOT NULL,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payroll_user ON payroll(user_id, day);
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit(created_at);
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
`;

const DEFAULT_SETTINGS = {
  name: 'Choyxona',
  address: '',
  phone: '',
  service_pct: '10',
  service_type: 'percent',
  service_per_guest: '5000',
  currency: "so'm",
  receipt_footer: 'Xaridingiz uchun rahmat! Yana kutib qolamiz.',
  receipt_width: '80',
  expense_categories: JSON.stringify([
    'Mahsulotlar', 'Ish haqi', 'Ijara', 'Kommunal', "Go'sht", 'Sabzavot', 'Ichimliklar',
    'Gaz', 'Transport', "Ta'mirlash", 'Soliq', 'Boshqa',
  ]),
  income_categories: JSON.stringify(['Banket avansi', 'Boshqa kirim']),
  // Waiters may cancel a sent dish only if the boss allows it, and only with the boss's cancel code.
  waiter_cancel: '0',
  cancel_code_hash: '',
  // Lock the screen back to the staff list after this many idle minutes (0 = never).
  auto_lock_minutes: '0',
  // Desktop (staff list) background: {"mode":"default"|"auto"|"color"|"image", "color", "image": asset id}.
  lock_bg: '{"mode":"default"}',
  logo: '',
  // Who besides the boss sees the money pages; an optional extra password for them.
  perm_admin_reports: '1',
  perm_admin_finance: '1',
  perm_cashier_reports: '0',
  perm_cashier_finance: '1',
  finance_lock: '0',
  finance_code_hash: '',
  // Logo at the top of printed checks: on/off, and an optional separate (black-and-white) picture.
  receipt_logo: '1',
  receipt_logo_id: '',
  // Wrong PINs on a shared device: after this many tries the worker waits this many minutes (0 tries = never locks).
  pin_lock_attempts: '5',
  pin_lock_minutes: '5',
  // Room types named by the boss: [{"key","name"}]; empty = the standard list.
  room_types: '[]',
  // A worker's own meal closed "on the worker": charged at the menu price or at cost, taken from their pay.
  staff_meal_price: 'menu',
  // Pro: share of each paid check returned to the customer as bonus (0 = no cashback).
  cashback_pct: '3',
  // QR menu: guests may send orders from the table ('0' = menu only); hours when ordering is open ('' = always).
  qr_order: '1',
  qr_from: '',
  qr_to: '',
};

function seedSettings(db, name) {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);
  }
  if (name) db.prepare("UPDATE settings SET value = ? WHERE key = 'name'").run(name);
}

function addUser(db, name, username, password, role, pin = null) {
  return db.prepare('INSERT INTO users (name, username, pass_hash, role, phone, pin_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, username, hashPassword(password), role, '', pin ? hashPassword(pin) : null, Date.now()).lastInsertRowid;
}

function addMenu(db, menu) {
  const addCat = db.prepare('INSERT INTO categories (name, icon, sort) VALUES (?, ?, ?)');
  const addDish = db.prepare(`INSERT INTO dishes (category_id, name, price, cost, prep_minutes, unit, needs_kitchen, icon, stock, barcode, size, color, material, side, min_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  menu.forEach(([cat, icon, dishes], i) => {
    const cid = addCat.run(cat, icon, i).lastInsertRowid;
    for (const d of dishes) {
      addDish.run(cid, d.name, d.price, d.cost || 0, d.prep ?? 10, d.unit || 'porsiya', d.kitchen ?? 1, d.icon || '', d.stock ?? null,
        d.barcode || '', d.size || '', d.color || '', d.material || '', d.side || '', d.min ?? null);
    }
  });
}

// Sample goods for fast food and shops (no rooms there: sales go straight to the counter).
const SAMPLES = {
  fastfood: [
    ['Burgerlar', '🍔', [{ name: 'Gamburger', price: 28000, cost: 12000, prep: 6, icon: '🍔' }, { name: 'Chizburger', price: 32000, cost: 14000, prep: 6, icon: '🍔' },
      { name: 'Dabl burger', price: 45000, cost: 21000, prep: 8, icon: '🍔' }]],
    ['Lavash va hot-dog', '🌯', [{ name: 'Lavash', price: 30000, cost: 13000, prep: 5, icon: '🌯' }, { name: 'Pishloqli lavash', price: 34000, cost: 15000, prep: 5, icon: '🌯' },
      { name: 'Hot-dog', price: 18000, cost: 7000, prep: 4, icon: '🌭' }]],
    ['Garnir', '🍟', [{ name: 'Kartoshka fri', price: 15000, cost: 5000, prep: 4, icon: '🍟' }, { name: 'Naggets (6 ta)', price: 22000, cost: 9000, prep: 5, icon: '🍗' }]],
    ['Ichimliklar', '🥤', [{ name: 'Coca-Cola 0.5L', price: 9000, cost: 6000, prep: 0, kitchen: 0, icon: '🥤', unit: 'dona' },
      { name: 'Choy', price: 4000, cost: 500, prep: 0, kitchen: 0, icon: '🫖' }]],
  ],
  market: [
    ['Non va un', '🍞', [{ name: 'Non', price: 4000, cost: 3000, icon: '🫓', stock: 50, barcode: '4780000000011' }, { name: 'Un 1 kg', price: 9000, cost: 7500, icon: '🌾', stock: 40, barcode: '4780000000028' }]],
    ['Sut mahsulotlari', '🥛', [{ name: 'Sut 1 L', price: 12000, cost: 9500, icon: '🥛', stock: 30, barcode: '4780000000035' },
      { name: 'Qatiq 0.5 L', price: 8000, cost: 6000, icon: '🥛', stock: 20, barcode: '4780000000042' }, { name: 'Tuxum (10 ta)', price: 16000, cost: 13000, icon: '🥚', stock: 25, barcode: '4780000000059' }]],
    ['Bakaleya', '🛒', [{ name: 'Guruch 1 kg', price: 18000, cost: 15000, icon: '🍚', stock: 60, barcode: '4780000000066', unit: 'kg' },
      { name: 'Shakar 1 kg', price: 14000, cost: 12000, icon: '🧂', stock: 40, barcode: '4780000000073', unit: 'kg' }, { name: "Yog' 1 L", price: 22000, cost: 18500, icon: '🫒', stock: 30, barcode: '4780000000080' }]],
    ['Ichimliklar', '🥤', [{ name: 'Suv 1.5 L', price: 5000, cost: 3500, icon: '💧', stock: 48, barcode: '4780000000097' }, { name: 'Coca-Cola 1 L', price: 12000, cost: 9000, icon: '🥤', stock: 24, barcode: '4780000000103' }]],
  ].map(([c, i, ds]) => [c, i, ds.map((d) => ({ prep: 0, kitchen: 0, unit: 'dona', ...d }))]),
  doors: [
    ['MDF eshiklar', '🚪', [{ name: 'MDF eshik "Klassik"', size: '2000×800', color: 'Oq', material: 'MDF', side: "O'ng", price: 1450000, cost: 980000, stock: 6, min: 2 },
      { name: 'MDF eshik "Klassik"', size: '2000×800', color: 'Oq', material: 'MDF', side: 'Chap', price: 1450000, cost: 980000, stock: 4, min: 2 },
      { name: 'MDF eshik "Klassik"', size: '2000×900', color: 'Yong\'oq', material: 'MDF', side: "O'ng", price: 1600000, cost: 1080000, stock: 3, min: 1 },
      { name: 'MDF eshik "Modern" oynali', size: '2000×800', color: 'Kulrang', material: 'MDF', side: 'Chap', price: 1750000, cost: 1200000, stock: 2, min: 1 }]],
    ['Metall eshiklar', '🛡️', [{ name: 'Metall eshik "Qo\'rg\'on"', size: '2050×960', color: 'Jigarrang', material: 'Metall', side: "O'ng", price: 3200000, cost: 2350000, stock: 3, min: 1 },
      { name: 'Metall eshik "Qo\'rg\'on"', size: '2050×860', color: 'Qora', material: 'Metall', side: 'Chap', price: 3000000, cost: 2200000, stock: 2, min: 1 }]],
    ['Furnitura', '🔑', [{ name: 'Qulf "Apecs"', price: 180000, cost: 120000, stock: 15, min: 5, icon: '🔒' }, { name: 'Ruchka (juft)', price: 90000, cost: 55000, stock: 20, min: 5, icon: '🔑' },
      { name: 'Petlya (3 dona)', price: 60000, cost: 36000, stock: 30, min: 10, icon: '🔩' }, { name: 'Nalichnik (komplekt)', price: 150000, cost: 95000, stock: 12, min: 4, icon: '📏' },
      { name: 'Karobka (komplekt)', price: 250000, cost: 170000, stock: 10, min: 3, icon: '🪵' }]],
  ].map(([c, i, ds]) => [c, i, ds.map((d) => ({ prep: 0, kitchen: 0, unit: 'dona', icon: i, ...d }))]),
  clothing: [
    ["Ko'ylaklar", '👔', [{ name: "Ko'ylak klassik", size: 'M', color: 'Oq', price: 180000, cost: 110000, stock: 6, barcode: '4781000000017' },
      { name: "Ko'ylak klassik", size: 'L', color: 'Oq', price: 180000, cost: 110000, stock: 4, barcode: '4781000000024' }, { name: "Ko'ylak klassik", size: 'L', color: "Ko'k", price: 185000, cost: 112000, stock: 3, barcode: '4781000000031' }]],
    ['Futbolkalar', '👕', [{ name: 'Futbolka', size: 'S', color: 'Qora', price: 90000, cost: 50000, stock: 10, barcode: '4781000000048' },
      { name: 'Futbolka', size: 'M', color: 'Qora', price: 90000, cost: 50000, stock: 12, barcode: '4781000000055' }, { name: 'Futbolka', size: 'XL', color: 'Oq', price: 95000, cost: 52000, stock: 5, barcode: '4781000000062' }]],
    ['Shimlar', '👖', [{ name: 'Jinsi shim', size: '32', color: "Ko'k", price: 260000, cost: 160000, stock: 7, barcode: '4781000000079' },
      { name: 'Jinsi shim', size: '34', color: "Ko'k", price: 260000, cost: 160000, stock: 5, barcode: '4781000000086' }]],
  ].map(([c, i, ds]) => [c, i, ds.map((d) => ({ prep: 0, kitchen: 0, unit: 'dona', icon: i, ...d }))]),
};

// Sample rooms and menu; waiters (if given) are spread over the rooms.
function seedRoomsAndMenu(db, waiterIds = []) {
  const addRoom = db.prepare('INSERT INTO rooms (number, name, type, capacity, section) VALUES (?, ?, ?, ?, ?)');
  const assign = db.prepare('INSERT INTO room_waiters (room_id, user_id) VALUES (?, ?)');
  const rooms = [
    ['1', 'Banket 1', 'banket', 20, '1-qavat'], ['2', 'Banket 2', 'banket', 20, '1-qavat'], ['3', 'Banket 3', 'banket', 30, '2-qavat'],
    ['4', 'VIP xona', 'vip', 12, '2-qavat'], ['5', 'Supa 1', 'supa', 8, 'Hovli'], ['6', 'Supa 2', 'supa', 8, 'Hovli'],
    ['7', 'Stol 7', 'stol', 4, '1-qavat'], ['8', 'Stol 8', 'stol', 4, '1-qavat'],
  ];
  rooms.forEach((r, i) => {
    const id = addRoom.run(...r).lastInsertRowid;
    if (waiterIds.length) assign.run(id, waiterIds[Math.floor((i * waiterIds.length) / rooms.length)]);
  });

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
  addMenu(db, menu.map(([cat, icon, dishes]) => [cat, icon, dishes.map(([name, price, cost, prep, dicon, kitchen = 1]) => ({ name, price, cost, prep, icon: dicon, kitchen }))]));
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
    addUser(db, 'Boshliq', 'ega', 'ega123', 'owner', '1234');
    addUser(db, 'Administrator', 'admin', 'admin123', 'admin', '5555');
    addUser(db, 'Kassir Dilnoza', 'kassir', 'kassir123', 'cashier', '4444');
    const w1 = addUser(db, 'Ofitsant Jasur', 'jasur', '1234', 'waiter', '1111');
    const w2 = addUser(db, 'Ofitsant Bobur', 'bobur', '1234', 'waiter', '2222');
    const chef = addUser(db, 'Oshpaz Rustam', 'oshpaz', '1234', 'chef', '3333');
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
  const type = opts.type || 'choyxona';
  // Fast food and shops take no service charge by default.
  if (!['choyxona', 'restoran'].includes(type)) db.prepare("UPDATE settings SET value = '0' WHERE key = 'service_pct'").run();
  // A door shop's running costs; goods bought, supplier and installer payments are kept by their own screens.
  if (type === 'doors') {
    db.prepare("UPDATE settings SET value = ? WHERE key = 'expense_categories'").run(JSON.stringify(['Ijara', 'Soliq', 'Kommunal', 'Ish haqi', "Yo'lkira", 'Ustalar', 'Reklama', 'Boshqa']));
    db.prepare("UPDATE settings SET value = ? WHERE key = 'income_categories'").run(JSON.stringify(['Boshqa kirim']));
  }
  if (opts.sample) {
    if (SAMPLES[type]) addMenu(db, SAMPLES[type]);
    else seedRoomsAndMenu(db);
  }
}

// Columns added after the first release; older databases get them here.
function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('left_at')) db.exec('ALTER TABLE users ADD COLUMN left_at INTEGER');
  // Quick login on a shared device: 1–4 digit PIN for staff, any length for the boss.
  if (!cols.includes('pin_hash')) db.exec('ALTER TABLE users ADD COLUMN pin_hash TEXT');
  // NULL = the default for the role; 1/0 = set by the boss per person.
  if (!cols.includes('perm_print')) db.exec('ALTER TABLE users ADD COLUMN perm_print INTEGER');
  if (!cols.includes('perm_close')) db.exec('ALTER TABLE users ADD COLUMN perm_close INTEGER');
  const colsOf = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  const addCol = (t, c, def) => { if (!colsOf(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
  // Rooms grouped into sections named by the boss ("1-qavat", "Hovli").
  addCol('rooms', 'section', "TEXT NOT NULL DEFAULT ''");
  // Shops: barcode, size and colour of a product.
  addCol('dishes', 'barcode', "TEXT NOT NULL DEFAULT ''");
  addCol('dishes', 'size', "TEXT NOT NULL DEFAULT ''");
  addCol('dishes', 'color', "TEXT NOT NULL DEFAULT ''");
  addCol('order_items', 'refunded_qty', 'INTEGER NOT NULL DEFAULT 0');
  // Colour of a menu section; its dishes get the same colour on the order screen ('' = automatic).
  addCol('categories', 'color', "TEXT NOT NULL DEFAULT ''");
  // A device the boss chose to keep automatic backups on.
  addCol('devices', 'backup', 'INTEGER NOT NULL DEFAULT 0');
  // 'platform' marks a session opened by the site owner from the platform panel.
  addCol('sessions', 'via', "TEXT NOT NULL DEFAULT ''");
  // Which shared device a PIN session was opened on, and when it was last used (one device per waiter on cheaper plans).
  addCol('sessions', 'device_id', 'INTEGER');
  // A check closed "on a worker": the worker it is taken from (the amount is in paid_staff).
  addCol('orders', 'paid_staff', 'INTEGER NOT NULL DEFAULT 0');
  // Pay entries gained "advance" and "deduction" (a worker's own expenses): the table is rebuilt once, rows kept.
  const payrollSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'payroll'").get() || {}).sql || '';
  if (payrollSql.includes("('payment','bonus','fine')")) {
    db.exec('BEGIN');
    try {
      db.exec(`CREATE TABLE payroll_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('payment','advance','bonus','fine','deduction')),
        amount INTEGER NOT NULL,
        method TEXT NOT NULL DEFAULT 'cash',
        note TEXT DEFAULT '',
        day TEXT NOT NULL,
        transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id),
        created_at INTEGER NOT NULL
      );
      INSERT INTO payroll_new (id, user_id, type, amount, method, note, day, transaction_id, created_by, created_at)
        SELECT id, user_id, type, amount, method, note, day, transaction_id, created_by, created_at FROM payroll;
      DROP TABLE payroll;
      ALTER TABLE payroll_new RENAME TO payroll;
      CREATE INDEX IF NOT EXISTS idx_payroll_user ON payroll(user_id, day);`);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  addCol('orders', 'staff_id', 'INTEGER');
  // Pro: the customer of a check, the part left on credit, the bonus spent on it.
  addCol('orders', 'customer_id', 'INTEGER');
  addCol('orders', 'paid_debt', 'INTEGER NOT NULL DEFAULT 0');
  addCol('orders', 'bonus_used', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  bonus INTEGER NOT NULL DEFAULT 0,
  debt INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  spent INTEGER NOT NULL DEFAULT 0,
  last_visit INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE TABLE IF NOT EXISTS customer_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT,
  order_id INTEGER,
  transaction_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  user_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cmoves_customer ON customer_moves(customer_id);
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dish_ingredients (
  dish_id INTEGER NOT NULL REFERENCES dishes(id),
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  qty REAL NOT NULL,
  PRIMARY KEY (dish_id, ingredient_id)
);
CREATE TABLE IF NOT EXISTS ingredient_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  kind TEXT NOT NULL,
  qty REAL NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  order_id INTEGER,
  user_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_imoves_ing ON ingredient_moves(ingredient_id);
`);
  addCol('sessions', 'last_seen', 'INTEGER');
  // QR menu: a secret key per room (printed as a QR code), a photo and a short description per dish.
  addCol('rooms', 'qr_token', 'TEXT');
  addCol('dishes', 'photo', 'INTEGER');
  addCol('dishes', 'description', "TEXT NOT NULL DEFAULT ''");
  db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_qr ON rooms(qr_token);
-- What guests send from the QR menu. Nothing reaches a check until a worker approves it.
CREATE TABLE IF NOT EXISTS guest_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  kind TEXT NOT NULL CHECK (kind IN ('order','waiter','bill')),
  items TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','done')),
  reason TEXT NOT NULL DEFAULT '',
  order_id INTEGER,
  decided_by INTEGER,
  decided_at INTEGER,
  ip TEXT NOT NULL DEFAULT '',
  guest_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guest_req ON guest_requests(status, room_id);
`);
  // Shops (door shop first): a product's material and opening side, its supplier, a low-stock warning level;
  // a check line may be a service (installation, delivery) with what the customer pays and what the worker gets.
  addCol('dishes', 'material', "TEXT NOT NULL DEFAULT ''");
  addCol('dishes', 'side', "TEXT NOT NULL DEFAULT ''");
  addCol('dishes', 'supplier_id', 'INTEGER');
  addCol('dishes', 'min_stock', 'INTEGER');
  addCol('order_items', 'service', "TEXT NOT NULL DEFAULT ''");
  // When a product was added: goods with no sale since then for 60 days are "dead" stock (older rows: unknown).
  addCol('dishes', 'created_at', 'INTEGER');
  db.exec(`CREATE TRIGGER IF NOT EXISTS dishes_created AFTER INSERT ON dishes WHEN NEW.created_at IS NULL
    BEGIN UPDATE dishes SET created_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = NEW.id; END;`);
  db.exec(`
-- Tasks ("Ishlar"): one-off or repeating, written by hand or by the program (a delivery date, a debt to collect).
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  due_at INTEGER NOT NULL,
  has_time INTEGER NOT NULL DEFAULT 0,
  repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none','daily','weekly','monthly')),
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ref TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  auto INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  done_by INTEGER,
  reminded_at INTEGER,
  created_by INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(done_at, due_at);
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
-- What we owe a supplier: purchases on credit up, payments down.
CREATE TABLE IF NOT EXISTS supplier_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  kind TEXT NOT NULL CHECK (kind IN ('purchase','payment','opening')),
  amount INTEGER NOT NULL,
  purchase_id INTEGER,
  transaction_id INTEGER,
  method TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  user_id INTEGER,
  created_at INTEGER NOT NULL
);
-- "Mol keldi": goods from a supplier, the freight spread over them as part of their cost.
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER REFERENCES suppliers(id),
  goods_total INTEGER NOT NULL,
  freight INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'cash',
  due_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  user_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  dish_id INTEGER NOT NULL REFERENCES dishes(id),
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL
);
-- Goods moving outside sales: received, written off (damaged), counted, brought back, loaded from a list.
CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dish_id INTEGER NOT NULL REFERENCES dishes(id),
  kind TEXT NOT NULL CHECK (kind IN ('in','writeoff','count','refund','import')),
  qty INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  ref TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  user_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_moves ON stock_moves(dish_id, created_at);
-- Installers and drivers paid per job.
CREATE TABLE IF NOT EXISTS masters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
-- A job at the customer's place: measuring, delivery, installation.
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('measure','delivery','install')),
  order_id INTEGER,
  item_id INTEGER,
  master_id INTEGER REFERENCES masters(id),
  customer_id INTEGER,
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  scheduled_at INTEGER,
  price INTEGER NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  done_at INTEGER,
  paid_at INTEGER,
  transaction_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at INTEGER NOT NULL
);
-- Work hours: "I came" / "I left" of each worker, with how it was proven (GPS, the cash desk's QR code, a selfie,
-- a shared device in the hall, or a cashier who confirmed it when the phone could not).
CREATE TABLE IF NOT EXISTS work_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS work_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  in_at INTEGER NOT NULL,
  out_at INTEGER,
  in_how TEXT NOT NULL DEFAULT '',
  out_how TEXT NOT NULL DEFAULT '',
  in_dist INTEGER,
  out_dist INTEGER,
  photo_id INTEGER REFERENCES work_photos(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','pending','rejected')),
  reason TEXT NOT NULL DEFAULT '',
  decided_by INTEGER,
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_work_day ON work_log(day, user_id);
`);
  // Until when a worker's phone counts as being inside the business (a GPS check or a cashier's confirmation).
  addCol('sessions', 'geo_until', 'INTEGER');
  const orderCols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  if (!orderCols.includes('service_type')) db.exec("ALTER TABLE orders ADD COLUMN service_type TEXT NOT NULL DEFAULT 'percent'");
  if (!orderCols.includes('takeaway')) db.exec('ALTER TABLE orders ADD COLUMN takeaway INTEGER NOT NULL DEFAULT 0');
  if (!orderCols.includes('label')) db.exec("ALTER TABLE orders ADD COLUMN label TEXT NOT NULL DEFAULT ''");
  if (!orderCols.includes('print_count')) db.exec('ALTER TABLE orders ADD COLUMN print_count INTEGER NOT NULL DEFAULT 0');
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

// Takeaway ("Olib ketish / soboy") lives in one hidden system room that may hold many open checks.
function ensureTakeawayRoom(db) {
  if (!db.prepare("SELECT 1 FROM rooms WHERE type = 'soboy'").get()) {
    db.prepare("INSERT INTO rooms (number, name, type, capacity) VALUES ('S', 'Olib ketish', 'soboy', 1)").run();
  }
}

function open(file, opts) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  seed(db, opts);
  ensureTakeawayRoom(db);
  return db;
}

module.exports = { open, SAMPLES };
