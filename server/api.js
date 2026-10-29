'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hashPassword, verifyPassword, newToken, HttpError, str, int } = require('./util');
const { createPro } = require('./pro');
const { createGuest } = require('./guest');
const { createTasks } = require('./tasks');
const { createShop } = require('./shop');
const { createPayroll } = require('./payroll');
const { createWork, STAFF_ROLES } = require('./work');
const { snapshot } = require('./backup');

const ROLES = ['owner', 'admin', 'cashier', 'waiter', 'chef'];
const MANAGERS = ['owner', 'admin'];
const MONEY = ['owner', 'admin', 'cashier'];
const STOPLIST = ['owner', 'admin', 'cashier', 'chef'];
const KITCHEN = ['owner', 'admin', 'chef'];
const ROLE_NAMES = { owner: 'Boshliq', admin: 'Admin', cashier: 'Kassir', waiter: 'Ofitsant', chef: 'Oshpaz' };
const METHODS = ['cash', 'card', 'transfer'];
// What the platform owner picks when creating a business; the screens adapt to it.
const BUSINESS_TYPES = { choyxona: 'Choyxona', restoran: 'Restoran / kafe', fastfood: 'Fast food', market: "Do'kon (oziq-ovqat)", clothing: 'Kiyim-kechak', doors: "Eshik do'koni" };
const SHOP_TYPES = ['market', 'clothing', 'doors'];
const IMAGE_TYPES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };
const DEFAULT_ROOM_TYPES = [['banket', 'Banket'], ['vip', 'VIP'], ['supa', 'Supa'], ['stol', 'Stol'], ['zal', 'Zal'], ['boshqa', 'Boshqa']].map(([key, name]) => ({ key, name }));
const WALLPAPERS = 28;
const MIN = 60_000;
// Sections the platform owner can switch off per choyxona (e.g. for cheaper plans).
const MODULES = {
  stoplist: 'Stop-list',
  reports: 'Hisobotlar va boshqaruv paneli',
  finance: 'Kirim-chiqim va kassa smenasi',
  payroll: 'Ish haqi',
  reservations: 'Bronlar',
  history: 'Cheklar tarixi',
  audit: 'Amallar tarixi',
  export: 'Excelga yuklab olish',
  customers: 'Mijozlar va keshbek',
  debts: 'Qarz daftari (nasiya)',
  inventory: 'Masalliq ombori va tex-karta',
  branches: 'Filiallar hisoboti',
  qrmenu: 'QR-menyu (mijoz telefonida)',
  qrorder: "QR orqali buyurtma va chaqiruv",
};
// On/off switches of the place features: staff only inside, "I came" with GPS / the desk's QR / a selfie, guest orders only inside.
const GEO_FLAGS = ['geo_staff', 'att_clock', 'att_gps', 'att_qr', 'att_selfie', 'qr_geo', 'qr_busy'];
function routeModule(pattern) {
  if (/^\/api\/(kitchen|items\/:id\/(accept|ready))$/.test(pattern)) return 'kitchen';
  if (pattern === '/api/dishes/:id/availability') return 'stoplist';
  if (pattern === '/api/reports' || pattern === '/api/dashboard' || pattern === '/api/profit') return 'reports';
  if (/^\/api\/(transactions|shifts)/.test(pattern)) return 'finance';
  if (/^\/api\/(payroll|my\/payroll|attendance)/.test(pattern)) return 'payroll';
  if (/^\/api\/reservations/.test(pattern)) return 'reservations';
  if (pattern === '/api/audit') return 'audit';
  if (pattern === '/api/checks/export') return 'export';
  if (/^\/api\/(ingredients|inventory)/.test(pattern) || pattern === '/api/dishes/:id/recipe') return 'inventory';
  if (pattern === '/api/branches') return 'branches';
  if (/^\/api\/guest-requests/.test(pattern)) return 'qrorder';
  if (pattern === '/api/qr' || pattern === '/api/qr/renew' || pattern === '/api/rooms/:id/qr') return 'qrmenu';
  if (/^\/api\/checks/.test(pattern)) return 'history';
  return null;
}

// opts.hub: live-event hub of this choyxona; opts.tokenPrefix marks which choyxona a session token belongs to;
// opts.tenant(): the choyxona's platform record (code, name, paid_until); opts.plan(): its plan (sections, staff limit);
// opts.file: its database file.
function createApi(db, { hub, tokenPrefix = '', tenant = () => null, plan = () => null, branches = () => [], file = null, telegram = null } = {}) {
  const events = hub;
  // Shared devices (the staff-list screen) get tokens of their own: "d<choyxona>_…".
  const devicePrefix = tokenPrefix.replace(/^t/, 'd');
  const q = (sql) => db.prepare(sql);
  const now = () => Date.now();
  const payroll = createPayroll(db, { audit, events: hub, now });
  const pro = createPro(db, { audit, events: hub, now, moduleOn: (m) => moduleOn(m), settings: () => settings() });
  // Tasks ("Ishlar") and shop bookkeeping (suppliers, goods in and out, installers, profit).
  const tasks = createTasks(db, { audit, events: hub, now, settings: () => settings() });
  const shop = createShop(db, { audit, events: hub, now, tasks, moduleOn: (m) => moduleOn(m), settings: () => settings() });
  // QR menu: guests order from the table, a worker approves.
  const guest = createGuest(db, {
    tenantId: Number((/^t(\d+)_/.exec(tokenPrefix) || [])[1]) || 0, audit, events: hub, now, moduleOn: (m) => moduleOn(m), settings: () => settings(),
    readOnly: () => { const p = plan(); return !!(p && p.read_only); }, kitchenLoad: () => kitchenLoad(),
    openOrder: (a) => openOrder(a), addItems: (a) => addItems(a), orderDetails: (id) => orderDetails(id), placeName: (o, r) => placeName(o, r),
    geo: (body) => work.where(work.posInput(body)),
  });

  // Work hours, GPS and the cash desk's attendance QR code (all optional, switched on in the settings).
  const work = createWork(db, { settings: () => settings(), audit, events: hub, now });

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

  const settingFlag = (k) => (q('SELECT value FROM settings WHERE key = ?').get(k) || {}).value === '1';
  function settings() {
    const out = {};
    for (const r of q('SELECT key, value FROM settings').all()) out[r.key] = r.value;
    out.service_pct = Number(out.service_pct) || 0;
    out.service_type = out.service_type === 'per_guest' ? 'per_guest' : 'percent';
    out.service_per_guest = Number(out.service_per_guest) || 0;
    out.demo = out.demo || '0';
    out.waiter_cancel = out.waiter_cancel === '1';
    out.has_cancel_code = !!out.cancel_code_hash;
    delete out.cancel_code_hash;
    out.auto_lock_minutes = Number(out.auto_lock_minutes) || 0;
    try { out.lock_bg = JSON.parse(out.lock_bg || '{}'); } catch { out.lock_bg = {}; }
    if (!out.lock_bg.mode) out.lock_bg.mode = 'default';
    out.logo = out.logo ? Number(out.logo) : null;
    for (const k of ['perm_admin_reports', 'perm_admin_finance', 'perm_cashier_reports', 'perm_cashier_finance', 'finance_lock']) out[k] = out[k] === '1';
    out.has_finance_code = !!out.finance_code_hash;
    delete out.finance_code_hash;
    out.receipt_logo = out.receipt_logo !== '0';
    out.receipt_logo_id = out.receipt_logo_id ? Number(out.receipt_logo_id) : null;
    out.staff_meal_price = out.staff_meal_price === 'cost' ? 'cost' : 'menu';
    out.cashback_pct = Number(out.cashback_pct ?? 3) || 0;
    out.pin_lock_attempts = Number(out.pin_lock_attempts ?? 5);
    out.pin_lock_minutes = Number(out.pin_lock_minutes) || 5;
    try { out.room_types = JSON.parse(out.room_types || '[]'); } catch { out.room_types = []; }
    if (!out.room_types.length) out.room_types = DEFAULT_ROOM_TYPES;
    out.expense_categories = JSON.parse(out.expense_categories || '[]');
    out.income_categories = JSON.parse(out.income_categories || '[]');
    // The business on the map and what it is used for.
    out.geo_lat = out.geo_lat ? Number(out.geo_lat) : null;
    out.geo_lng = out.geo_lng ? Number(out.geo_lng) : null;
    out.geo_radius = Number(out.geo_radius) || 150;
    for (const k of GEO_FLAGS) out[k] = out[k] === '1';
    out.work_from = out.work_from || '';
    delete out.att_secret;
    return out;
  }

  // What a worker may do with checks. Boss and admin always may; others follow the role default
  // unless the boss set it per person (perm_print / perm_close: NULL = role default).
  function perms(u) {
    if (u.role === 'owner' || u.role === 'admin') return { print: true, close: true };
    const def = { cashier: [1, 1], waiter: [1, 0], chef: [0, 0] }[u.role] || [0, 0];
    return { print: (u.perm_print ?? def[0]) === 1, close: (u.perm_close ?? def[1]) === 1 };
  }

  function publicUser(u) {
    return { id: u.id, name: u.name, username: u.username, role: u.role, phone: u.phone, active: u.active,
      has_pin: !!u.pin_hash, perm_print: u.perm_print, perm_close: u.perm_close, perms: perms(u) };
  }

  // Staff PIN: 1–4 digits. Boss and admin may use any password-like code of 4–32 characters.
  function pinHash(role, pin) {
    const p = String(pin ?? '').trim();
    if (role === 'owner' || role === 'admin') {
      if (p.length < 4 || p.length > 32) throw new HttpError(400, "Boshliq paroli 4–32 belgidan iborat bo'lsin");
    } else if (!/^\d{1,4}$/.test(p)) {
      throw new HttpError(400, "PIN 1–4 ta raqamdan iborat bo'lsin");
    }
    return hashPassword(p);
  }
  const permInput = (v) => (v === null || v === undefined || v === '' ? null : v ? 1 : 0);

  // ---------- Auth ----------
  function authenticate(token) {
    if (!token) return null;
    const row = q(`SELECT u.*, s.last_seen session_seen, s.device_id session_device, s.geo_until session_geo, d.name session_device_name
      FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN devices d ON d.id = s.device_id WHERE s.token = ? AND u.active = 1`).get(token);
    if (!row) return null;
    if (!row.session_seen || now() - row.session_seen > MIN) q('UPDATE sessions SET last_seen = ? WHERE token = ?').run(now(), token);
    Object.defineProperty(row, 'session', { value: { token, device_id: row.session_device, device_name: row.session_device_name || '', geo_until: row.session_geo }, enumerable: false });
    delete row.session_seen; delete row.session_device; delete row.session_geo; delete row.session_device_name;
    // With work hours switched on, a worker "came" when they press "I came", not when they open the program.
    if (!(STAFF_ROLES.includes(row.role) && settingFlag('att_clock'))) payroll.markPresent(row.id);
    return row;
  }

  // Brute-force protection: 8 wrong passwords per login+IP lock it for 10 minutes.
  const failures = new Map();
  function checkCredentials(body, ip) {
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
    return user;
  }

  function startSession(user, how, device = null) {
    const token = tokenPrefix + newToken();
    q('INSERT INTO sessions (token, user_id, created_at, via, device_id, last_seen) VALUES (?, ?, ?, ?, ?, ?)').run(
      token, user.id, now(), how === 'platform_login' ? 'platform' : '', device ? device.id : null, now());
    audit(user, how);
    limitDevices(user, token, device);
    return { token, user: publicUser(user) };
  }

  /*
   * On plans with a per-waiter device limit, a new sign-in closes the waiter's oldest sessions on other devices,
   * so one account cannot be shared by several people at once. Sent orders stay; the closed screen says why.
   */
  const kicked = new Map();
  function limitDevices(user, token, device) {
    const p = plan();
    if (user.role !== 'waiter' || !p || !(p.devices_per_staff > 0)) return;
    const others = q("SELECT token, device_id, last_seen, created_at FROM sessions WHERE user_id = ? AND token != ? AND via != 'platform' ORDER BY created_at DESC")
      .all(user.id, token);
    // An older session on this same shared device is simply replaced.
    const sameDevice = others.filter((s) => device && s.device_id === device.id);
    const elsewhere = others.filter((s) => !(device && s.device_id === device.id)).slice(p.devices_per_staff - 1);
    const gone = [...sameDevice, ...elsewhere];
    if (!gone.length) return;
    const del = q('DELETE FROM sessions WHERE token = ?');
    for (const s of gone) { del.run(s.token); kicked.set(s.token, now()); }
    if (kicked.size > 5000) for (const [k, at] of kicked) if (now() - at > 24 * 60 * MIN) kicked.delete(k);
    // Counted as sharing only when the other device was really in use in the last half hour.
    const busy = elsewhere.filter((s) => now() - (s.last_seen || s.created_at) < 30 * MIN).length;
    if (busy) audit(user, 'session_kicked', `${busy}`);
    if (events) events.disconnectSessions(new Set(gone.map((s) => s.token)));
  }
  const wasKicked = (token) => kicked.has(token);

  function login({ body, ip }) {
    return startSession(checkCredentials(body, ip), 'login');
  }

  // A tablet/PC is connected once with the boss's (or admin's) login; afterwards staff tap their name and type a PIN.
  function registerDevice({ body, ip }) {
    const user = checkCredentials(body, ip);
    if (!MANAGERS.includes(user.role)) throw new HttpError(403, 'Qurilmani faqat boshliq yoki admin ulay oladi');
    const token = devicePrefix + newToken();
    const name = str(body.name, 'Qurilma nomi', { max: 40 }) || 'Qurilma';
    q('INSERT INTO devices (token, name, created_by, created_at, last_seen) VALUES (?, ?, ?, ?, ?)').run(token, name, user.id, now(), now());
    audit(user, 'device_add', name);
    return { device_token: token, name };
  }

  function authenticateDevice(token) {
    if (!token || !token.startsWith(devicePrefix)) return null;
    const d = q('SELECT * FROM devices WHERE token = ?').get(token);
    if (d && (!d.last_seen || now() - d.last_seen > 10 * MIN)) q('UPDATE devices SET last_seen = ? WHERE id = ?').run(now(), d.id);
    return d || null;
  }

  function deviceStaff() {
    const order = { owner: 0, admin: 1, cashier: 2, waiter: 3, chef: 4 };
    return q('SELECT * FROM users WHERE active = 1').all()
      .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name))
      .map((u) => ({ id: u.id, name: u.name, role: u.role, has_pin: !!u.pin_hash || MANAGERS.includes(u.role),
        open: !u.pin_hash && MANAGERS.includes(u.role) }));
  }

  // 5 wrong PINs for one worker on one device lock that worker there for 5 minutes.
  const pinFailures = new Map();
  function pinLogin({ device, body }) {
    const id = int(body.user_id, 'Xodim', { min: 1, required: true });
    const key = `${device.id}|${id}`;
    const f = pinFailures.get(key);
    const { pin_lock_attempts: tries, pin_lock_minutes: mins } = settings();
    if (tries > 0 && f && f.count >= tries && now() - f.first < mins * MIN) throw new HttpError(429, `Juda ko'p xato. ${mins} daqiqadan keyin urinib ko'ring`);
    const user = q('SELECT * FROM users WHERE id = ? AND active = 1').get(id);
    if (!user) throw new HttpError(404, 'Xodim topilmadi');
    // Boss and admin enter without a password until they set a desktop password (the screen keeps reminding them).
    if (!user.pin_hash && MANAGERS.includes(user.role)) return startSession(user, 'pin_login');
    if (!user.pin_hash) throw new HttpError(400, "PIN o'rnatilmagan. Boshliqqa murojaat qiling");
    if (!verifyPassword(String(body.pin ?? ''), user.pin_hash)) {
      pinFailures.set(key, !f || now() - f.first >= mins * MIN ? { count: 1, first: now() } : { ...f, count: f.count + 1 });
      throw new HttpError(401, "PIN noto'g'ri");
    }
    pinFailures.delete(key);
    const res = startSession(user, 'pin_login', device);
    work.deviceIn(user, device);
    return res;
  }

  function listDevices() {
    return q('SELECT d.id, d.name, d.created_at, d.last_seen, u.name created_by_name FROM devices d LEFT JOIN users u ON u.id = d.created_by ORDER BY d.id DESC').all();
  }

  function deleteDevice({ user, params }) {
    const d = q('SELECT * FROM devices WHERE id = ?').get(params.id);
    if (!d) throw new HttpError(404, 'Qurilma topilmadi');
    q('DELETE FROM devices WHERE id = ?').run(d.id);
    audit(user, 'device_remove', d.name);
    return { ok: true };
  }

  function setOwnPin({ user, body }) {
    q('UPDATE users SET pin_hash = ? WHERE id = ?').run(pinHash(user.role, body.pin), user.id);
    audit(user, 'pin_change');
    return { ok: true };
  }

  function logout({ token }) {
    q('DELETE FROM sessions WHERE token = ?').run(token);
    return { ok: true };
  }

  // Off = switched off for this business by the platform, or not in its plan.
  function disabledModules() {
    const t = tenant();
    let off = [];
    try { off = t && t.disabled_modules ? JSON.parse(t.disabled_modules) : []; } catch { off = []; }
    const p = plan();
    if (p) off = [...new Set([...off, ...Object.keys(MODULES).filter((m) => !p.modules.includes(m))])];
    return off;
  }

  const staffCount = () => q("SELECT COUNT(*) c FROM users WHERE active = 1 AND role != 'owner'").get().c;
  // Adding (or switching back on) one more worker must fit the plan; the people already there are never touched.
  function assertStaffRoom() {
    const p = plan();
    if (p && p.max_staff > 0 && staffCount() >= p.max_staff) {
      throw new HttpError(403, `"${p.name}" tarifida ${p.max_staff} tagacha xodim. Ko'proq xodim uchun tarifni yangilang`);
    }
  }
  function planInfo() {
    const p = plan();
    if (!p) return null;
    return { key: p.key, name: p.name, fee: p.fee, max_staff: p.max_staff, devices_per_staff: p.devices_per_staff, staff_used: staffCount(), modules: p.modules,
      paid_until: p.paid_until, grace_until: p.grace_until, read_only: p.read_only, is_branch: p.is_branch };
  }
  const moduleOn = (m) => !disabledModules().includes(m);
  // off: dishes are served at once; notify: kitchen sees them but needn't accept; full: accept → ready → waiter.
  function kitchenMode() {
    const t = tenant();
    if (t && ['off', 'notify', 'full'].includes(t.kitchen_mode)) return t.kitchen_mode;
    return disabledModules().includes('kitchen') ? 'off' : 'full';
  }

  function businessType() {
    const t = tenant();
    return t && BUSINESS_TYPES[t.business_type] ? t.business_type : 'choyxona';
  }

  // Which money pages this person may open: the boss always; admin and cashier as the boss allows.
  // ---------- "Bugun": the first page — today's tasks and, for those who see money, today's numbers ----------
  function today({ user }) {
    const t0 = tasks.startOfDay(now());
    const t1 = t0 + 24 * 3600 * 1000;
    const out = { tasks: tasks.list({ user, query: {} }), shop: SHOP_TYPES.includes(businessType()) };
    if (['owner', 'admin', 'cashier', 'waiter'].includes(user.role)) out.jobs = shop.todayJobs(t0, t1);
    if (out.shop && user.role !== 'chef') out.low_stock = shop.lowStock();
    if (moneyAccess(user).reports) {
      const n = shop.periodNumbers(t0, t1);
      const y = shop.periodNumbers(t0 - 24 * 3600 * 1000, t0);
      out.money = { sales: n.sales, revenue: n.revenue, profit: out.shop ? n.net : null, gross: n.gross, yesterday: y.revenue };
      out.debts = shop.debts();
    }
    return out;
  }
  // The owner's Telegram: the morning list and a reminder an hour before a task with a time.
  function morningText() {
    const d = tasks.digest();
    const s = settings();
    const t0 = tasks.startOfDay(now());
    const y = shop.periodNumbers(t0 - 24 * 3600 * 1000, t0);
    const line = (x) => `${x.has_time ? `<b>${shop.fmtTime(x.due_at)}</b> ` : ''}${esc(x.title)}${x.amount ? ` — ${shop.money(x.amount)} so'm` : ''}`;
    const out = [`☀️ <b>Xayrli tong! ${esc(s.name)}</b>`];
    if (d.overdue.length) out.push('', `🔴 <b>Qolib ketgan (${d.overdue.length}):</b>`, ...d.overdue.slice(0, 10).map((x) => `• ${shop.fmtDate(x.due_at)} ${line(x)}`));
    out.push('', d.today.length ? `📋 <b>Bugungi ishlar (${d.today.length}):</b>` : "📋 Bugunga ish yozilmagan.", ...d.today.slice(0, 15).map((x) => `• ${line(x)}`));
    if (y.sales) out.push('', `💰 Kecha: savdo <b>${shop.money(y.revenue)}</b> so'm${SHOP_TYPES.includes(businessType()) ? `, sof foyda <b>${shop.money(y.net)}</b> so'm` : ''} (${y.sales} ta chek)`);
    const low = SHOP_TYPES.includes(businessType()) ? shop.lowStock() : [];
    if (low.length) out.push('', `⚠️ Kam qoldi: ${low.slice(0, 8).map((x) => `${esc(x.name)} (${x.stock})`).join(', ')}`);
    return out.join('\n');
  }
  function soonTexts() {
    return tasks.dueSoon().map((x) => `⏰ <b>${shop.fmtTime(x.due_at)}</b> — ${esc(x.title)}${x.note ? `\n${esc(x.note)}` : ''}`);
  }
  const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const tgApi = (fn) => ({ user }) => {
    if (!telegram) throw new HttpError(404, 'Topilmadi');
    if (user.role !== 'owner') throw new HttpError(403, 'Faqat boshliq');
    return telegram[fn]();
  };

  function invoiceOf({ user, params }) {
    const o = getOrderRow(params.id);
    assertOrderAccess(user, o);
    return shop.invoice(o);
  }

  function moneyAccess(user, s = settings()) {
    if (user.role === 'owner') return { reports: true, finance: true, payroll: true };
    if (user.role === 'admin') return { reports: s.perm_admin_reports, finance: s.perm_admin_finance, payroll: false };
    if (user.role === 'cashier') return { reports: s.perm_cashier_reports, finance: s.perm_cashier_finance, payroll: false };
    return { reports: false, finance: false, payroll: false };
  }

  function me({ user, token }) {
    const t = tenant();
    const s = settings();
    const session = q('SELECT via FROM sessions WHERE token = ?').get(token);
    return { user: publicUser(user), settings: s, modules: MODULES, disabled: disabledModules(), kitchen_mode: kitchenMode(),
      business_type: businessType(), money: moneyAccess(user, s), platform_session: !!(session && session.via === 'platform'),
      tenant: t && { code: t.code, name: t.name, paid_until: t.paid_until }, plan: planInfo(),
      branches: user.role === 'owner' ? branches().length : 0, work: user.session ? work.state(user) : null };
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
    const allowed = ['name', 'address', 'phone', 'service_pct', 'service_type', 'service_per_guest', 'currency', 'receipt_footer', 'receipt_width',
      'expense_categories', 'income_categories', 'waiter_cancel', 'cancel_code', 'auto_lock_minutes', 'lock_bg', 'logo',
      'receipt_logo', 'receipt_logo_id', 'pin_lock_attempts', 'pin_lock_minutes', 'room_types', 'staff_meal_price', 'cashback_pct', 'qr_order', 'qr_from', 'qr_to',
      'geo_lat', 'geo_lng', 'geo_radius', 'work_from', ...GEO_FLAGS, ...OWNER_SETTINGS];
    if (user.role !== 'owner' && OWNER_SETTINGS.some((k) => body[k] !== undefined)) throw new HttpError(403, "Moliya huquqlarini faqat boshliq o'zgartiradi");
    const set = q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const k of allowed) {
      if (body[k] === undefined) continue;
      let v = body[k];
      if (k === 'finance_code') {
        const code = String(v);
        if (code.length < 4 || code.length > 32) throw new HttpError(400, "Moliya paroli 4–32 belgidan iborat bo'lsin");
        set.run('finance_code_hash', hashPassword(code));
        financeTokens.clear();
        continue;
      }
      if (k.startsWith('perm_') || k === 'finance_lock') v = v ? '1' : '0';
      if (k === 'logo' || k === 'receipt_logo_id') v = v ? String(assetId(v, 'logo')) : '';
      if (k === 'receipt_logo') v = v ? '1' : '0';
      if (k === 'pin_lock_attempts') v = int(v, 'Urinishlar soni', { max: 50 });
      if (k === 'pin_lock_minutes') v = int(v, 'Daqiqalar', { min: 1, max: 1440 });
      if (k === 'room_types') v = JSON.stringify(roomTypesInput(v));
      if (k === 'staff_meal_price') v = v === 'cost' ? 'cost' : 'menu';
      if (k === 'cashback_pct') {
        v = Number(v);
        if (!(v >= 0 && v <= 30)) throw new HttpError(400, "Keshbek 0–30% oralig'ida bo'lsin");
      }
      if (k === 'qr_order' || GEO_FLAGS.includes(k)) v = v ? '1' : '0';
      if (k === 'geo_lat' || k === 'geo_lng') {
        if (v === null || v === '') { set.run(k, ''); continue; }
        v = Number(v);
        if (!Number.isFinite(v) || Math.abs(v) > (k === 'geo_lat' ? 90 : 180)) throw new HttpError(400, "Joylashuv noto'g'ri");
        v = v.toFixed(6);
      }
      if (k === 'geo_radius') v = int(v, 'Radius', { min: 30, max: 2000 });
      if (k === 'qr_from' || k === 'qr_to' || k === 'work_from') {
        v = String(v || '').trim();
        if (v && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) throw new HttpError(400, "Vaqt 09:00 ko'rinishida bo'lsin");
      }
      if (k === 'lock_bg') v = JSON.stringify(lockBgInput(v));
      if (k === 'service_pct') {
        v = Number(v);
        if (!(v >= 0 && v <= 50)) throw new HttpError(400, "Xizmat haqi 0–50% oralig'ida bo'lsin");
      }
      if (k === 'cancel_code') {
        if (!/^\d{4,8}$/.test(String(v))) throw new HttpError(400, "Bekor qilish kodi 4–8 ta raqam bo'lsin");
        set.run('cancel_code_hash', hashPassword(String(v)));
        continue;
      }
      if (k === 'waiter_cancel') v = v ? '1' : '0';
      if (k === 'auto_lock_minutes') v = int(v, 'Avtomatik qulf', { max: 240 });
      if (k === 'service_type' && !['percent', 'per_guest'].includes(v)) throw new HttpError(400, "Xizmat haqi turi noto'g'ri");
      if (k === 'service_per_guest') v = int(v, 'Odam boshiga xizmat haqi', { max: 10_000_000 });
      if (k === 'receipt_width' && !['58', '80'].includes(String(v))) throw new HttpError(400, "Chek kengligi 58 yoki 80 mm bo'lsin");
      if (k.endsWith('_categories')) {
        if (!Array.isArray(v)) throw new HttpError(400, "Kategoriyalar ro'yxat bo'lishi kerak");
        v = JSON.stringify(v.map((x) => str(x, 'Kategoriya', { max: 60 })).filter(Boolean));
      }
      set.run(k, String(v));
    }
    const after = settings();
    const needPlace = ['geo_staff', 'att_gps', 'qr_geo'].filter((k) => after[k]);
    if (needPlace.length && !work.place(after)) {
      for (const k of needPlace) set.run(k, '0');
      throw new HttpError(400, "Avval ish joyining joylashuvini saqlang (ish joyida turib \"Hozirgi joyni saqlash\" ni bosing)");
    }
    if (settings().finance_lock && !settings().has_finance_code) {
      set.run('finance_lock', '0');
      throw new HttpError(400, 'Avval moliya parolini kiriting');
    }
    cleanAssets();
    audit(user, 'settings_update', { ...body, cancel_code: body.cancel_code ? '***' : undefined, finance_code: body.finance_code ? '***' : undefined });
    events.publish('settings');
    return settings();
  }

  const OWNER_SETTINGS = ['perm_admin_reports', 'perm_admin_finance', 'perm_cashier_reports', 'perm_cashier_finance', 'finance_lock', 'finance_code'];

  // Room types: the boss renames them or adds new ones. Keys of types still used by a room cannot disappear.
  function roomTypesInput(v) {
    if (!Array.isArray(v) || !v.length || v.length > 30) throw new HttpError(400, "Xona turlari ro'yxati noto'g'ri");
    const out = [];
    for (const x of v) {
      const name = str(x && x.name, 'Turi nomi', { required: true, max: 30 });
      let key = str(x && x.key, 'Turi', { max: 20 }).toLowerCase();
      if (!/^[a-z0-9_-]{1,20}$/.test(key)) key = `t${Date.now().toString(36)}${out.length}`;
      if (out.some((y) => y.key === key)) throw new HttpError(400, "Xona turlari takrorlangan");
      out.push({ key, name });
    }
    const used = q("SELECT DISTINCT type FROM rooms WHERE type != 'soboy'").all().map((r) => r.type);
    const missing = used.filter((k) => !out.some((y) => y.key === k));
    if (missing.length) throw new HttpError(400, "Bu tur xonalarda ishlatilmoqda, avval xonalarni boshqa turga o'tkazing");
    return out;
  }

  function lockBgInput(v) {
    if (!v || typeof v !== 'object') throw new HttpError(400, "Fon noto'g'ri");
    const mode = ['default', 'auto', 'builtin', 'color', 'image'].includes(v.mode) ? v.mode : null;
    if (!mode) throw new HttpError(400, "Fon noto'g'ri");
    const out = { mode };
    if (mode === 'builtin') out.n = int(v.n, 'Rasm', { min: 1, max: WALLPAPERS, required: true });
    if (mode === 'color') {
      if (!/^#[0-9a-f]{6}$/i.test(String(v.color || ''))) throw new HttpError(400, "Rang noto'g'ri");
      out.color = String(v.color).toLowerCase();
    }
    if (mode === 'image') out.image = assetId(v.image, 'bg');
    return out;
  }

  // ---------- Pictures: the choyxona's logo and desktop background ----------
  function assetId(v, kind) {
    const id = int(v, 'Rasm', { min: 1, required: true });
    if (!q('SELECT 1 FROM assets WHERE id = ? AND kind = ?').get(id, kind)) throw new HttpError(404, 'Rasm topilmadi');
    return id;
  }

  function uploadAsset({ user, body }) {
    const kind = str(body.kind, 'Turi', { required: true });
    if (!['logo', 'bg', 'dish'].includes(kind)) throw new HttpError(400, "Rasm turi noto'g'ri");
    const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ''));
    if (!m || !IMAGE_TYPES[m[1]]) throw new HttpError(400, 'Faqat JPG, PNG yoki WEBP rasm yuklash mumkin');
    const data = Buffer.from(m[2], 'base64');
    if (data.length > 3_000_000) throw new HttpError(413, 'Rasm juda katta (3 MB dan oshmasin)');
    const id = q('INSERT INTO assets (kind, mime, data, created_at) VALUES (?, ?, ?, ?)').run(kind, m[1], data, now()).lastInsertRowid;
    audit(user, 'asset_upload', kind);
    return { id };
  }

  function getAsset(id) {
    return q('SELECT mime, data FROM assets WHERE id = ?').get(id) || null;
  }

  // Pictures no setting points to any more are removed (an upload not saved within a day, an old logo).
  function cleanAssets() {
    const s = settings();
    const keep = [s.logo, s.receipt_logo_id, s.lock_bg.image, ...q('SELECT photo FROM dishes WHERE photo IS NOT NULL').all().map((r) => r.photo)].filter(Boolean).map(Number);
    q(`DELETE FROM assets WHERE created_at < ? ${keep.length ? `AND id NOT IN (${keep.join(',')})` : ''}`).run(now() - 24 * 60 * MIN);
    q(`DELETE FROM assets WHERE kind = 'logo' AND created_at < ? ${keep.length ? `AND id NOT IN (${keep.join(',')})` : ''}`).run(now());
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
    if (role !== 'owner') assertStaffRoom();
    const name = str(body.name, 'Ism', { required: true, max: 80 });
    // Login and password are only needed for a worker's own phone; on shared devices the PIN is enough.
    let username = str(body.username, 'Login', { max: 40 });
    if (!username) {
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'xodim';
      username = base;
      for (let n = 2; q('SELECT 1 FROM users WHERE username = ?').get(username); n++) username = `${base}${n}`;
    }
    const password = str(body.password, 'Parol') || newToken();
    if (password.length < 4) throw new HttpError(400, "Parol kamida 4 ta belgi bo'lsin");
    if (q('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'Bu login band');
    const pin = body.pin ? pinHash(role, body.pin) : null;
    const id = q(`INSERT INTO users (name, username, pass_hash, role, phone, salary, pin_hash, perm_print, perm_close, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      name, username, hashPassword(password), role, str(body.phone, 'Telefon', { max: 30 }), int(body.salary, 'Maosh'), pin,
      permInput(body.perm_print), permInput(body.perm_close), now()
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
    if (active && role !== 'owner' && !(target.active && target.role !== 'owner')) assertStaffRoom();
    // left_at stops monthly pay from accruing after the worker is switched off.
    const leftAt = active ? null : target.active ? now() : target.left_at;
    q('UPDATE users SET name = ?, username = ?, role = ?, phone = ?, active = ?, left_at = ? WHERE id = ?').run(
      body.name !== undefined ? str(body.name, 'Ism', { required: true, max: 80 }) : target.name,
      username, role,
      body.phone !== undefined ? str(body.phone, 'Telefon', { max: 30 }) : target.phone,
      active, leftAt, target.id
    );
    if (body.password) {
      const pw = str(body.password, 'Parol');
      if (pw.length < 4) throw new HttpError(400, "Parol kamida 4 ta belgi bo'lsin");
      q('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(pw), target.id);
    }
    if (body.pin) q('UPDATE users SET pin_hash = ? WHERE id = ?').run(pinHash(role, body.pin), target.id);
    if (body.perm_print !== undefined) q('UPDATE users SET perm_print = ? WHERE id = ?').run(permInput(body.perm_print), target.id);
    if (body.perm_close !== undefined) q('UPDATE users SET perm_close = ? WHERE id = ?').run(permInput(body.perm_close), target.id);
    if (!active || body.password || role !== target.role) {
      q('DELETE FROM sessions WHERE user_id = ?').run(target.id);
      events.disconnectUser(target.id);
    }
    audit(user, 'user_update', `${target.name}: ${JSON.stringify({ ...body, password: body.password ? '***' : undefined, pin: body.pin ? '***' : undefined })}`);
    return publicUser(q('SELECT * FROM users WHERE id = ?').get(target.id));
  }

  // ---------- Rooms ----------
  function waiterRoomIds(userId) {
    return q('SELECT room_id FROM room_waiters WHERE user_id = ?').all(userId).map((r) => r.room_id);
  }

  function listRooms({ user, query }) {
    let rooms = q("SELECT * FROM rooms WHERE type != 'soboy' AND (active = 1 OR ? = 1) ORDER BY CAST(number AS INTEGER), number").all(query.all ? 1 : 0);
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
          waiter_name: order.waiter_name, bill_requested: order.bill_requested, printed: order.print_count, subtotal, items: st };
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
    const types = settings().room_types.map((x) => x.key);
    const type = body.type !== undefined ? str(body.type, 'Turi') : prev.type || types[0];
    if (!types.includes(type)) throw new HttpError(400, "Xona turi noto'g'ri");
    return {
      section: body.section !== undefined ? str(body.section, "Bo'lim", { max: 40 }) : prev.section || '',
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
      const id = q('INSERT INTO rooms (number, name, type, capacity, section) VALUES (?, ?, ?, ?, ?)').run(f.number, f.name, f.type, f.capacity, f.section).lastInsertRowid;
      saveRoomWaiters(id, body.waiter_ids);
      return id;
    });
    audit(user, 'room_create', f.name);
    events.publish('rooms');
    return q('SELECT * FROM rooms WHERE id = ?').get(id);
  }

  function updateRoom({ user, params, body }) {
    const prev = q("SELECT * FROM rooms WHERE id = ? AND type != 'soboy'").get(params.id);
    if (!prev) throw new HttpError(404, 'Xona topilmadi');
    const f = roomFields(body, prev);
    const active = body.active === undefined ? prev.active : body.active ? 1 : 0;
    tx(() => {
      q('UPDATE rooms SET number = ?, name = ?, type = ?, capacity = ?, section = ?, active = ? WHERE id = ?').run(f.number, f.name, f.type, f.capacity, f.section, active, prev.id);
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
    const color = str(body.color, 'Rang', { max: 7 });
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new HttpError(400, "Rang noto'g'ri");
    let id = params.id;
    if (id) {
      if (!q('UPDATE categories SET name = ?, icon = ?, sort = ?, color = ? WHERE id = ?').run(name, icon, sort, color, id).changes) throw new HttpError(404, 'Topilmadi');
    } else {
      id = q('INSERT INTO categories (name, icon, sort, color) VALUES (?, ?, ?, ?)').run(name, icon, sort, color).lastInsertRowid;
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
      barcode: pick('barcode', (v) => str(v, 'Shtrix-kod', { max: 40 })) ?? '',
      material: pick('material', (v) => str(v, 'Turi', { max: 30 })) ?? '',
      side: pick('side', (v) => str(v, 'Tomoni', { max: 20 })) ?? '',
      supplier_id: pick('supplier_id', (v) => (v ? int(v, 'Yetkazib beruvchi', { min: 1 }) : null)) ?? null,
      min_stock: pick('min_stock', (v) => (v === null || v === '' ? null : int(v, 'Minimal qoldiq', { max: 100000 }))) ?? null,
      size: pick('size', (v) => str(v, "O'lcham", { max: 20 })) ?? '',
      color: pick('color', (v) => str(v, 'Rang', { max: 30 })) ?? '',
      // QR menu: a photo (uploaded as a 'dish' picture) and a line or two shown to guests.
      photo: pick('photo', (v) => (v ? assetId(v, 'dish') : null)) ?? null,
      description: pick('description', (v) => str(v, 'Tavsif', { max: 300 })) ?? '',
    };
    if (d.barcode && q('SELECT 1 FROM dishes WHERE barcode = ? AND active = 1 AND id != ?').get(d.barcode, prev.id || 0)) {
      throw new HttpError(409, 'Bu shtrix-kod boshqa mahsulotda bor');
    }
    if (!d.name || d.price == null) throw new HttpError(400, 'Nomi va narxi kiritilishi kerak');
    let id = prev.id;
    if (id) {
      q(`UPDATE dishes SET category_id = ?, name = ?, price = ?, cost = ?, prep_minutes = ?, unit = ?, needs_kitchen = ?, icon = ?, stock = ?,
        barcode = ?, size = ?, color = ?, photo = ?, description = ?, material = ?, side = ?, supplier_id = ?, min_stock = ?,
        available = CASE WHEN ? = 0 THEN 0 WHEN ? > 0 AND available = 0 AND stock = 0 THEN 1 ELSE available END WHERE id = ?`).run(
        d.category_id, d.name, d.price, d.cost, d.prep_minutes, d.unit, d.needs_kitchen, d.icon, d.stock, d.barcode, d.size, d.color, d.photo, d.description,
        d.material, d.side, d.supplier_id, d.min_stock, d.stock ?? 1, d.stock ?? 0, id
      );
      if (prev.price !== d.price) audit(user, 'price_change', `${d.name}: ${prev.price} → ${d.price}`);
    } else {
      id = q(`INSERT INTO dishes (category_id, name, price, cost, prep_minutes, unit, needs_kitchen, icon, stock, barcode, size, color, photo, description,
        material, side, supplier_id, min_stock, available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(d.category_id, d.name, d.price, d.cost,
        d.prep_minutes, d.unit, d.needs_kitchen, d.icon, d.stock, d.barcode, d.size, d.color, d.photo, d.description, d.material, d.side, d.supplier_id, d.min_stock,
        d.stock === 0 ? 0 : 1).lastInsertRowid;
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

  // Goods arrived: the stock grows; optionally the purchase is written down as an expense.
  function receiveStock({ user, params, body }) {
    const d = q('SELECT * FROM dishes WHERE id = ? AND active = 1').get(params.id);
    if (!d) throw new HttpError(404, 'Mahsulot topilmadi');
    const qty = int(body.qty, 'Soni', { min: 1, max: 1_000_000, required: true });
    const cost = body.cost !== undefined && body.cost !== '' ? int(body.cost, 'Tannarxi') : d.cost;
    // The same bookkeeping as "Mol keldi": running average cost, a stock record, the money if paid from the till.
    shop.receiveOne(user, d, qty, cost, { expense: !!body.expense, method: METHODS.includes(body.method) ? body.method : 'cash' });
    return q('SELECT * FROM dishes WHERE id = ?').get(d.id);
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
    if (order.takeaway) throw new HttpError(403, 'Bu buyurtma sizga tegishli emas');
    if (waiterRoomIds(user.id).includes(order.room_id)) return;
    throw new HttpError(403, 'Bu buyurtma sizga tegishli emas');
  }

  // Service charge is either a percent of the dishes or a fixed amount per guest.
  // orders.service_pct keeps the rate: percent for 'percent', amount per guest for 'per_guest'.
  function totals(order, items, overrides = {}) {
    const subtotal = items.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + i.price * i.qty, 0);
    const open = order.status === 'open';
    const st = open ? settings() : null;
    // Takeaway checks carry no service charge.
    const service_type = order.takeaway ? 'percent' : open ? st.service_type : order.service_type || 'percent';
    const service_pct = order.takeaway ? 0
      : open ? (service_type === 'per_guest' ? st.service_per_guest : st.service_pct) : order.service_pct;
    const service_amount = service_type === 'per_guest'
      ? Math.round(service_pct * order.guests)
      : Math.round((subtotal * service_pct) / 100);
    const discount = Math.min(overrides.discount ?? order.discount ?? 0, subtotal + service_amount);
    // A worker's own meal: no service charge.
    if (overrides.staff) return { subtotal, service_type, service_pct: 0, service_amount: 0, discount: Math.min(discount, subtotal), total: subtotal - Math.min(discount, subtotal) };
    return { subtotal, service_type, service_pct, service_amount, discount, total: subtotal + service_amount - discount };
  }

  function orderDetails(id) {
    const order = getOrderRow(id);
    const items = q(`SELECT i.*, u.name chef_name FROM order_items i LEFT JOIN users u ON u.id = i.chef_id
      WHERE i.order_id = ? ORDER BY i.created_at, i.id`).all(id);
    const room = q('SELECT * FROM rooms WHERE id = ?').get(order.room_id);
    const waiter = q('SELECT id, name FROM users WHERE id = ?').get(order.waiter_id);
    const cashier = order.cashier_id ? q('SELECT id, name FROM users WHERE id = ?').get(order.cashier_id) : null;
    const t = order.status === 'open' ? totals(order, items) : order;
    const refunded = order.status === 'closed' ? q("SELECT COALESCE(SUM(amount), 0) s FROM transactions WHERE category = 'Qaytarish' AND order_id = ?").get(id).s : 0;
    return { ...order, refunded, ...{ subtotal: t.subtotal, service_type: t.service_type || 'percent', service_pct: t.service_pct,
      service_amount: t.service_amount, discount: t.discount, total: t.total },
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

  // Name shown to the kitchen and on lists: "3 · Banket 3" or "Olib ketish #12 · Aziz".
  function placeName(o, room) {
    return o.takeaway ? `Olib ketish #${o.id}${o.label ? ` · ${o.label}` : ''}` : room.name;
  }

  function listTakeaway({ user }) {
    const rows = q(`SELECT o.*, w.name waiter_name FROM orders o JOIN users w ON w.id = o.waiter_id
      WHERE o.status = 'open' AND o.takeaway = 1 ${user.role === 'waiter' ? 'AND o.waiter_id = ?' : ''} ORDER BY o.opened_at`)
      .all(...(user.role === 'waiter' ? [user.id] : []));
    const items = q("SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status = 'open' AND o.takeaway = 1").all();
    return {
      room_id: q("SELECT id FROM rooms WHERE type = 'soboy'").get().id,
      orders: rows.map((o) => {
        const its = items.filter((i) => i.order_id === o.id);
        const st = { new: 0, cooking: 0, ready: 0 };
        for (const i of its) if (st[i.status] !== undefined) st[i.status] += 1;
        return { ...o, ...totals(o, its), items: st };
      }),
    };
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
    if (room.type === 'soboy') {
      // Takeaway: every customer gets a new check, written by any waiter or cashier.
      const id = q("INSERT INTO orders (room_id, waiter_id, guests, note, opened_at, takeaway, label) VALUES (?, ?, ?, ?, ?, 1, ?)").run(
        roomId, user.id, int(body.guests, 'Mehmonlar', { min: 1, max: 1000, def: 1 }), str(body.note, 'Izoh', { max: 300 }), now(),
        str(body.label, 'Mijoz', { max: 60 })
      ).lastInsertRowid;
      audit(user, 'order_open', `#${id} Olib ketish`);
      events.publish('rooms');
      return orderDetails(id);
    }
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
    q('UPDATE orders SET guests = ?, note = ?, label = ? WHERE id = ?').run(
      body.guests !== undefined ? int(body.guests, 'Mehmonlar', { min: 1, max: 1000 }) : o.guests,
      body.note !== undefined ? str(body.note, 'Izoh', { max: 300 }) : o.note,
      body.label !== undefined ? str(body.label, 'Mijoz', { max: 60 }) : o.label, o.id
    );
    events.publish('rooms');
    return orderDetails(o.id);
  }

  function addItems({ user, params, body }) {
    const o = getOrderRow(params.id);
    assertOrderAccess(user, o);
    if (o.status !== 'open') throw new HttpError(400, 'Buyurtma yopilgan');
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, "Taom tanlanmagan");
    const t = now();
    const added = tx(() => insertItems(o, body.items, t));
    afterItems(user, o, added, t);
    return orderDetails(o.id);
  }

  // Writes dishes onto a check (inside a transaction): stock, stop-list and the kitchen mode decide each line's status.
  function insertItems(o, items, t) {
    const load = kitchenLoad();
    const mode = kitchenMode();
    const out = [];
    for (const it of items) {
      const d = q('SELECT * FROM dishes WHERE id = ? AND active = 1').get(int(it.dish_id, 'Taom', { min: 1, required: true }));
      if (!d) throw new HttpError(404, 'Taom topilmadi');
      const qty = int(it.qty, 'Soni', { min: 1, max: 99999, def: 1 });
      if (!d.available) throw new HttpError(409, `"${d.name}" tugagan`);
      if (d.stock !== null && d.stock < qty) throw new HttpError(409, `"${d.name}" dan faqat ${d.stock} ta qoldi`);
      if (d.stock !== null) {
        const left = d.stock - qty;
        q('UPDATE dishes SET stock = ?, available = ? WHERE id = ?').run(left, left > 0 ? 1 : 0, d.id);
        if (left === 0) events.publish('stoplist', { name: d.name, by: 'Tizim' });
      }
      const kitchen = d.needs_kitchen === 1 && mode !== 'off';
      const status = !kitchen ? 'served' : mode === 'notify' ? 'cooking' : 'new';
      const id = q(`INSERT INTO order_items (order_id, dish_id, name, price, cost, qty, note, status, needs_kitchen, prep_minutes, created_at, eta_at, served_at, accepted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        o.id, d.id, d.name, d.price, d.cost, qty, str(it.note, 'Izoh', { max: 200 }), status, kitchen ? 1 : 0,
        d.prep_minutes, t, kitchen ? t + (d.prep_minutes + (mode === 'full' ? load.extra_minutes : 0)) * MIN : null,
        kitchen ? null : t, status === 'cooking' ? t : null
      ).lastInsertRowid;
      out.push({ id, name: d.name, qty, kitchen, note: str(it.note, 'Izoh', { max: 200 }) });
    }
    q('UPDATE orders SET bill_requested = 0 WHERE id = ?').run(o.id);
    return out;
  }

  function afterItems(user, o, added, t) {
    const room = q('SELECT name FROM rooms WHERE id = ?').get(o.room_id);
    room.name = placeName(o, room);
    const kitchenItems = added.filter((a) => a.kitchen);
    audit(user, 'items_add', `#${o.id}: ${added.map((a) => `${a.name}×${a.qty}`).join(', ')}`);
    const waiter = q('SELECT name FROM users WHERE id = ?').get(o.waiter_id);
    if (kitchenItems.length) {
      events.publish('kitchen_new', { order_id: o.id, room: room.name, waiter: waiter && waiter.name, at: t, items: kitchenItems }, { roles: KITCHEN });
    }
    // Every order (waiter's or cashier's) goes to the computers chosen as order printers.
    events.publish('order_print', { order_id: o.id, room: room.name, waiter: waiter && waiter.name, by: user.name, at: t, items: added }, { roles: ['device'] });
    events.publish('rooms');
    if (added.some((a) => !a.kitchen)) events.publish('menu');
  }

  function getItem(id) {
    const it = q(`SELECT i.*, o.room_id, o.waiter_id, o.status order_status, o.takeaway, o.label, r.name room_name, r.number room_number
      FROM order_items i JOIN orders o ON o.id = i.order_id JOIN rooms r ON r.id = o.room_id WHERE i.id = ?`).get(id);
    if (!it) throw new HttpError(404, 'Taom topilmadi');
    if (it.takeaway) it.room_name = placeName({ id: it.order_id, takeaway: 1, label: it.label }, null);
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
      // A sent dish is cancelled only with the boss's permission and cancel code.
      assertOrderAccess(user, { waiter_id: it.waiter_id, room_id: it.room_id, takeaway: it.takeaway });
      const codeHash = (q("SELECT value FROM settings WHERE key = 'cancel_code_hash'").get() || {}).value;
      if (!settings().waiter_cancel || !codeHash) throw new HttpError(403, "Bekor qilish uchun kassir yoki boshliqqa murojaat qiling");
      const key = `cancel|${user.id}`;
      const f = pinFailures.get(key);
      if (f && f.count >= 5 && now() - f.first < 5 * MIN) throw new HttpError(429, "Juda ko'p xato. 5 daqiqadan keyin urinib ko'ring");
      if (!verifyPassword(String(body.code ?? ''), codeHash)) {
        pinFailures.set(key, !f || now() - f.first >= 5 * MIN ? { count: 1, first: now() } : { ...f, count: f.count + 1 });
        throw new HttpError(403, "Bekor qilish kodi noto'g'ri");
      }
      pinFailures.delete(key);
      if (!str(body.reason, 'Sabab', { max: 200 })) throw new HttpError(400, 'Bekor qilish sababini yozing');
    } else if (user.role === 'chef') {
      if (!['new', 'cooking'].includes(it.status)) throw new HttpError(403, "Bu taomni bekor qila olmaysiz");
    }
    const reason = str(body.reason, 'Sabab', { max: 200 });
    if (user.role !== 'waiter' && it.status !== 'new' && !reason) throw new HttpError(400, "Bekor qilish sababini yozing");
    // Part of a line can be cancelled (2 of 5 kabobs): the cancelled part becomes its own line.
    const qty = int(body.qty, 'Soni', { min: 1, max: it.qty, def: it.qty });
    tx(() => {
      if (qty < it.qty) {
        q('UPDATE order_items SET qty = ? WHERE id = ?').run(it.qty - qty, it.id);
        q(`INSERT INTO order_items (order_id, dish_id, name, price, cost, qty, note, status, needs_kitchen, prep_minutes, created_at, accepted_at, ready_at, eta_at, chef_id, cancel_reason)
          SELECT order_id, dish_id, name, price, cost, ?, note, 'cancelled', needs_kitchen, prep_minutes, created_at, accepted_at, ready_at, eta_at, chef_id, ? FROM order_items WHERE id = ?`).run(qty, reason, it.id);
      } else {
        q("UPDATE order_items SET status = 'cancelled', cancel_reason = ? WHERE id = ?").run(reason, it.id);
      }
      if (it.dish_id) q('UPDATE dishes SET stock = stock + ?, available = 1 WHERE id = ? AND stock IS NOT NULL').run(qty, it.dish_id);
    });
    audit(user, 'item_cancel', `#${it.order_id} ${it.name}×${qty} (${it.status}) ${reason}`);
    events.publish('kitchen');
    events.publish('rooms');
    if (it.needs_kitchen && ['new', 'cooking'].includes(it.status)) {
      events.publish('kitchen_cancel', { name: it.name, qty, room: it.room_name }, { roles: KITCHEN });
    }
    // The cancellation slip prints at once on the order printers.
    const waiter = q('SELECT name FROM users WHERE id = ?').get(it.waiter_id);
    events.publish('order_print', { cancel: true, order_id: it.order_id, room: it.room_name, waiter: waiter && waiter.name, by: user.name, at: now(),
      items: [{ name: it.name, qty, note: reason }] }, { roles: ['device'] });
    return orderDetails(it.order_id);
  }

  function requestBill({ user, params }) {
    const o = getOrderRow(params.id);
    assertOrderAccess(user, o);
    if (o.status !== 'open') throw new HttpError(400, 'Buyurtma yopilgan');
    q('UPDATE orders SET bill_requested = 1 WHERE id = ?').run(o.id);
    const room = q('SELECT name FROM rooms WHERE id = ?').get(o.room_id);
    events.publish('bill_requested', { order_id: o.id, room: placeName(o, room) }, { roles: MONEY });
    events.publish('rooms');
    return orderDetails(o.id);
  }

  function closeOrder({ user, params, body }) {
    const o = getOrderRow(params.id);
    if (!perms(user).close) throw new HttpError(403, "Chekni yopish huquqingiz yo'q");
    assertOrderAccess(user, o);
    if (o.status !== 'open') throw new HttpError(400, 'Buyurtma allaqachon yopilgan');
    const items = q('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    const unfinished = kitchenMode() === 'full' ? items.filter((i) => ['new', 'cooking'].includes(i.status)) : [];
    if (unfinished.length) throw new HttpError(409, `Hali tayyor bo'lmagan taomlar bor: ${unfinished.map((i) => i.name).join(', ')}`);
    const live = items.filter((i) => i.status !== 'cancelled');
    if (!live.length) throw new HttpError(400, "Chekda taom yo'q. Bo'sh buyurtmani bekor qiling");
    const r = tx(() => settle(user, o, items, body, true));
    audit(user, 'order_close', `#${o.id} jami ${r.total}${r.discount ? `, chegirma ${r.discount}` : ''}`);
    events.publish('rooms');
    events.publish('finance');
    return { ...orderDetails(o.id), change: r.change };
  }

  // Takes the payment and closes the check (inside a transaction). serveAll: dishes still in the kitchen count as served.
  function settle(user, o, items, body, serveAll) {
    if (body.staff_id) return settleOnStaff(user, o, items, body, serveAll);
    // The service charge always comes from the boss's settings; it cannot be changed per check.
    const discount = int(body.discount, 'Chegirma');
    if (discount && !['owner', 'admin', 'cashier'].includes(user.role)) throw new HttpError(403, "Chegirma berish huquqi yo'q");
    const base = totals(o, items, { discount });
    // Pro: a customer's bonus works as a discount; part of the check may stay on credit (no money now).
    const cp = pro.preparePayment(body, base.total);
    const t = cp.bonus ? totals(o, items, { discount: discount + cp.bonus }) : base;
    if (cp.debt > t.total) throw new HttpError(400, "Qarzga yoziladigan summa chekdan ko'p");
    const paid = { cash: int(body.paid_cash, 'Naqd'), card: int(body.paid_card, 'Karta'), transfer: int(body.paid_transfer, "O'tkazma") };
    const sumPaid = paid.cash + paid.card + paid.transfer + cp.debt;
    if (sumPaid < t.total) throw new HttpError(400, `To'lov yetarli emas: ${t.total - sumPaid} kam`);
    // Change (qaytim) is given from cash, so the recorded cash is reduced by any overpayment.
    const change = sumPaid - t.total;
    if (change > paid.cash) throw new HttpError(400, "Karta yoki o'tkazma bo'yicha ortiqcha to'lov qabul qilinmaydi");
    paid.cash -= change;
    const ts = now();
    if (serveAll) q("UPDATE order_items SET status = 'served', served_at = ? WHERE order_id = ? AND status IN ('new', 'cooking', 'ready')").run(ts, o.id);
    q(`UPDATE orders SET status = 'closed', closed_at = ?, cashier_id = ?, subtotal = ?, service_type = ?, service_pct = ?, service_amount = ?,
      discount = ?, total = ?, paid_cash = ?, paid_card = ?, paid_transfer = ?, customer_id = ?, paid_debt = ?, bonus_used = ?, bill_requested = 0 WHERE id = ?`).run(
      ts, user.id, t.subtotal, t.service_type, t.service_pct, t.service_amount, t.discount, t.total, paid.cash, paid.card, paid.transfer,
      cp.customer ? cp.customer.id : null, cp.debt, cp.bonus, o.id
    );
    const ins = q("INSERT INTO transactions (type, category, amount, method, note, order_id, user_id, created_at) VALUES ('income', 'Savdo', ?, ?, ?, ?, ?, ?)");
    for (const m of METHODS) if (paid[m] > 0) ins.run(paid[m], m, `Chek #${o.id}`, o.id, user.id, ts);
    const extra = pro.afterPayment(user, { id: o.id, total: t.total }, cp, paid.cash + paid.card + paid.transfer);
    pro.consume(o.id, items.filter((i) => i.status !== 'cancelled'), -1, user.id);
    return { ...t, change, cashback: extra ? extra.cashback : 0 };
  }

  /*
   * A worker's own meal: the check is closed "on the worker" and the amount is taken from their pay
   * (menu price or cost, as the boss chose). No money enters the till, so the cash count stays right.
   */
  function settleOnStaff(user, o, items, body, serveAll) {
    if (!['owner', 'admin', 'cashier'].includes(user.role)) throw new HttpError(403, "Xodim hisobiga yopish huquqi yo'q");
    if (!moduleOn('payroll')) throw new HttpError(403, '"Ish haqi" bo\'limi sizning paketingizda yoqilmagan');
    const staff = q("SELECT * FROM users WHERE id = ? AND active = 1 AND role != 'owner'").get(int(body.staff_id, 'Xodim', { min: 1 }));
    if (!staff) throw new HttpError(404, 'Xodim topilmadi');
    const live = items.filter((i) => i.status !== 'cancelled');
    let discount = 0;
    let priceNote = '';
    if (settings().staff_meal_price === 'cost') {
      // At cost; a dish with no cost entered counts at its menu price.
      const cost = live.reduce((s, i) => s + (i.cost > 0 ? i.cost : i.price) * i.qty, 0);
      discount = Math.max(0, live.reduce((s, i) => s + i.price * i.qty, 0) - cost);
      priceNote = ' (tannarx)';
    }
    const t = totals(o, items, { discount, staff: true });
    const ts = now();
    if (serveAll) q("UPDATE order_items SET status = 'served', served_at = ? WHERE order_id = ? AND status IN ('new', 'cooking', 'ready')").run(ts, o.id);
    q(`UPDATE orders SET status = 'closed', closed_at = ?, cashier_id = ?, subtotal = ?, service_type = ?, service_pct = 0, service_amount = 0,
      discount = ?, total = ?, paid_cash = 0, paid_card = 0, paid_transfer = 0, paid_staff = ?, staff_id = ?, bill_requested = 0 WHERE id = ?`).run(
      ts, user.id, t.subtotal, t.service_type, t.discount, t.total, t.total, staff.id, o.id);
    if (t.total > 0) {
      const what = live.map((i) => `${i.name} x${i.qty}`).join(', ').slice(0, 150);
      q("INSERT INTO payroll (user_id, type, amount, method, note, day, transaction_id, created_by, created_at) VALUES (?, 'deduction', ?, 'cash', ?, ?, NULL, ?, ?)")
        .run(staff.id, t.total, `Ovqat: chek #${o.id}${priceNote} — ${what}`, payroll.today(), user.id, ts);
    }
    pro.consume(o.id, live, -1, user.id);
    audit(user, 'staff_meal', `#${o.id} ${staff.name}: ${t.total}`);
    events.publish('payroll', { type: 'deduction', amount: t.total, name: staff.name }, { userIds: [staff.id] });
    return { ...t, change: 0, staff: staff.name };
  }

  // Counter sale (shops, fast food): goods and payment in one step. Kitchen dishes of a fast food order
  // still go to the kitchen; the check is already paid.
  function createSale({ user, body }) {
    if (!perms(user).close) throw new HttpError(403, "Chekni yopish huquqingiz yo'q");
    // Installation, delivery: lines with what the customer pays and what the worker gets.
    const services = shop.serviceInput(body);
    const goods = Array.isArray(body.items) ? body.items : [];
    if (!goods.length && !services.length) throw new HttpError(400, 'Mahsulot tanlanmagan');
    const room = q("SELECT id FROM rooms WHERE type = 'soboy'").get();
    const t = now();
    let added = [];
    let svc = [];
    const r = tx(() => {
      const id = q("INSERT INTO orders (room_id, waiter_id, guests, opened_at, takeaway, label) VALUES (?, ?, 1, ?, 1, ?)").run(
        room.id, user.id, t, str(body.label, 'Mijoz', { max: 60 })
      ).lastInsertRowid;
      const o = getOrderRow(id);
      if (goods.length) added = insertItems(o, goods, t);
      svc = shop.insertServices(id, services, t);
      const items = q('SELECT * FROM order_items WHERE order_id = ?').all(id);
      return { id, o, ...settle(user, o, items, body, false) };
    });
    if (added.length) afterItems(user, r.o, added, t);
    const jobs = shop.afterSale(user, getOrderRow(r.id), svc, body);
    audit(user, 'sale', `#${r.id} jami ${r.total}`);
    events.publish('finance');
    const items = q('SELECT price, cost, qty FROM order_items WHERE order_id = ? AND status != \'cancelled\'').all(r.id);
    // What this sale earned: the check minus the goods' cost and the workers' pay.
    const profit = r.total - items.reduce((s, i) => s + i.cost * i.qty, 0);
    return { ...orderDetails(r.id), change: r.change, jobs, profit };
  }

  // Goods brought back: money goes back as an expense "Qaytarish", the stock returns.
  function refundItems({ user, params, body }) {
    const o = getOrderRow(params.id);
    if (o.status !== 'closed') throw new HttpError(400, 'Faqat yopilgan chekni qaytarish mumkin');
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'Qaytariladigan mahsulot tanlanmagan');
    const method = METHODS.includes(body.method) ? body.method : 'cash';
    const reason = str(body.reason, 'Sabab', { max: 200 });
    let amount = 0;
    const lines = [];
    tx(() => {
      for (const r of body.items) {
        const it = q("SELECT * FROM order_items WHERE id = ? AND order_id = ? AND status != 'cancelled'").get(int(r.item_id, 'Mahsulot', { min: 1, required: true }), o.id);
        if (!it) throw new HttpError(404, 'Mahsulot topilmadi');
        const qty = int(r.qty, 'Soni', { min: 1, max: it.qty - it.refunded_qty, def: it.qty - it.refunded_qty });
        if (qty < 1) throw new HttpError(400, `"${it.name}" allaqachon qaytarilgan`);
        q('UPDATE order_items SET refunded_qty = refunded_qty + ? WHERE id = ?').run(qty, it.id);
        if (it.dish_id) q('UPDATE dishes SET stock = stock + ?, available = 1 WHERE id = ? AND stock IS NOT NULL').run(qty, it.dish_id);
        amount += it.price * qty;
        lines.push(`${it.name}×${qty}`);
        pro.consume(o.id, [{ dish_id: it.dish_id, qty }], 1, user.id);
        shop.refunded(it, qty, user.id, o.id);
      }
      const already = q("SELECT COALESCE(SUM(amount), 0) s FROM transactions WHERE category = 'Qaytarish' AND order_id = ?").get(o.id).s;
      amount = Math.min(amount, o.total - already);
      if (amount <= 0) throw new HttpError(400, "Bu chek bo'yicha pul to'liq qaytarilgan");
      q("INSERT INTO transactions (type, category, amount, method, note, order_id, user_id, created_at) VALUES ('expense', 'Qaytarish', ?, ?, ?, ?, ?, ?)")
        .run(amount, method, `Chek #${o.id}: ${lines.join(', ')}${reason ? ` (${reason})` : ''}`, o.id, user.id, now());
    });
    audit(user, 'refund', `#${o.id} ${amount}: ${lines.join(', ')}`);
    events.publish('menu');
    events.publish('finance');
    return { ...orderDetails(o.id), refunded: amount };
  }

  // Printing a bill is recorded, so the boss sees how many times each check was printed.
  function printOrder({ user, params }) {
    const o = getOrderRow(params.id);
    if (!perms(user).print) throw new HttpError(403, "Chek chiqarish huquqingiz yo'q");
    assertOrderAccess(user, o);
    q('UPDATE orders SET print_count = print_count + 1 WHERE id = ?').run(o.id);
    audit(user, 'check_print', `#${o.id} (${o.print_count + 1}-marta)`);
    return orderDetails(o.id);
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
    const room = q("SELECT * FROM rooms WHERE id = ? AND active = 1 AND type != 'soboy'").get(roomId);
    if (!room) throw new HttpError(404, 'Xona topilmadi');
    if (q("SELECT 1 FROM orders WHERE room_id = ? AND status = 'open'").get(roomId)) throw new HttpError(409, `${room.name} band`);
    q('UPDATE orders SET room_id = ?, takeaway = 0 WHERE id = ?').run(roomId, o.id);
    audit(user, 'order_transfer', `#${o.id} → ${room.name}`);
    events.publish('rooms');
    events.publish('kitchen');
    return orderDetails(o.id);
  }

  // ---------- Checks history ----------
  function checksWhere(query) {
    const status = ['closed', 'cancelled'].includes(query.status) ? query.status : 'closed';
    let where = 'o.status = ?';
    const params = [status];
    if (query.from) { where += ' AND o.closed_at >= ?'; params.push(Number(query.from)); }
    if (query.to) { where += ' AND o.closed_at < ?'; params.push(Number(query.to)); }
    const search = str(query.q, 'Qidiruv', { max: 60 });
    if (search) {
      where += ' AND (CAST(o.id AS TEXT) = ? OR r.name LIKE ? OR r.number = ? OR w.name LIKE ? OR o.label LIKE ?)';
      params.push(search.replace(/^#/, ''), `%${search}%`, search, `%${search}%`, `%${search}%`);
    }
    return { where, params };
  }
  const CHECK_FROM = `FROM orders o JOIN rooms r ON r.id = o.room_id JOIN users w ON w.id = o.waiter_id LEFT JOIN users c ON c.id = o.cashier_id`;

  function listChecks({ query }) {
    const { where, params } = checksWhere(query);
    const limit = Math.min(Number(query.limit) || 100, 500);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const rows = q(`SELECT o.*, r.name room_name, r.number room_number, w.name waiter_name, c.name cashier_name,
      (SELECT COALESCE(SUM(qty), 0) FROM order_items i WHERE i.order_id = o.id AND i.status != 'cancelled') items_count
      ${CHECK_FROM} WHERE ${where} ORDER BY o.closed_at DESC, o.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    const sums = q(`SELECT COUNT(*) count, COALESCE(SUM(o.total), 0) total, COALESCE(SUM(o.subtotal), 0) subtotal,
      COALESCE(SUM(o.service_amount), 0) service, COALESCE(SUM(o.discount), 0) discount, COALESCE(SUM(o.guests), 0) guests,
      COALESCE(SUM(o.paid_cash), 0) cash, COALESCE(SUM(o.paid_card), 0) card, COALESCE(SUM(o.paid_transfer), 0) transfer,
      COALESCE(SUM(o.paid_staff), 0) staff, MIN(o.closed_at) first_at ${CHECK_FROM} WHERE ${where}`).get(...params);
    return { rows, sums, offset, limit };
  }

  // Excel-friendly CSV (semicolon, UTF-8 BOM) of every check in the filter, with its dishes.
  function exportChecks({ query }) {
    const { where, params } = checksWhere(query);
    const rows = q(`SELECT o.*, r.name room_name, r.number room_number, w.name waiter_name, c.name cashier_name
      ${CHECK_FROM} WHERE ${where} ORDER BY o.closed_at, o.id`).all(...params);
    const items = new Map();
    for (const i of q(`SELECT i.order_id, i.name, i.qty, i.price FROM order_items i JOIN orders o ON o.id = i.order_id JOIN rooms r ON r.id = o.room_id
      JOIN users w ON w.id = o.waiter_id LEFT JOIN users c ON c.id = o.cashier_id WHERE ${where} AND i.status != 'cancelled' ORDER BY i.id`).all(...params)) {
      if (!items.has(i.order_id)) items.set(i.order_id, []);
      items.get(i.order_id).push(`${i.name} x${i.qty}`);
    }
    const dt = (ts) => {
      if (!ts) return '';
      const d = new Date(ts);
      const p2 = (n) => String(n).padStart(2, '0');
      return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
    };
    const head = ['Chek', 'Holat', 'Ochilgan', 'Yopilgan', 'Xona', 'Ofitsant', 'Kassir', 'Mehmon', 'Taomlar', 'Taomlar summasi',
      'Xizmat haqi', 'Chegirma', 'Jami', 'Naqd', 'Karta', "O'tkazma", 'Bekor sababi'];
    const lines = rows.map((o) => [o.id, o.status === 'closed' ? 'Yopilgan' : 'Bekor', dt(o.opened_at), dt(o.closed_at),
      `${o.room_number} ${o.room_name}`, o.waiter_name, o.cashier_name || '', o.guests, (items.get(o.id) || []).join(', '),
      o.subtotal, o.service_amount, o.discount, o.total, o.paid_cash, o.paid_card, o.paid_transfer, o.cancel_reason || '']);
    const csv = '\ufeff' + [head, ...lines].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    return { __file: { name: `cheklar_${dt(Date.now()).slice(0, 10)}.csv`, type: 'text/csv; charset=utf-8', body: csv } };
  }

  // ---------- Kitchen ----------
  // Kitchen and waiter lists show takeaway checks as "Olib ketish #12 · Aziz".
  const withPlace = (i) => (i.takeaway ? { ...i, room_name: placeName({ id: i.order_id, takeaway: 1, label: i.label }, null) } : i);

  function kitchen() {
    const since = now() - 30 * MIN;
    const items = q(`SELECT i.*, o.guests, o.takeaway, o.label, r.name room_name, r.number room_number, w.name waiter_name, c.name chef_name
      FROM order_items i JOIN orders o ON o.id = i.order_id JOIN rooms r ON r.id = o.room_id
      JOIN users w ON w.id = o.waiter_id LEFT JOIN users c ON c.id = i.chef_id
      WHERE i.needs_kitchen = 1 AND (i.status IN ('new','cooking') OR (i.status = 'ready') OR (i.status = 'served' AND i.served_at > ?))
      ORDER BY i.created_at, i.id`).all(since).map(withPlace);
    return { items, load: kitchenLoad(), server_time: now() };
  }

  function myReady({ user }) {
    return q(`SELECT i.*, o.takeaway, o.label, r.name room_name, r.number room_number FROM order_items i JOIN orders o ON o.id = i.order_id
      JOIN rooms r ON r.id = o.room_id WHERE i.status = 'ready' AND o.status = 'open' AND (o.waiter_id = ? OR ? IN ('owner','admin'))
      ORDER BY i.ready_at`).all(user.id, user.role).map(withPlace);
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
    shop.assertDeletable(t);
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
      staff: sum(orders, (o) => o.paid_staff || 0),
      debt: sum(orders, (o) => o.paid_debt || 0),
      bonus: sum(orders, (o) => o.bonus_used || 0),
      food_cost: sum(items, (i) => i.cost * i.qty),
    };
    sales.avg_check = sales.orders ? Math.round(sales.total / sales.orders) : 0;

    // A debt paid back is money for the till, not new income: the sale was counted when the check was closed.
    const otherIncome = txs.filter((t) => t.type === 'income' && !t.order_id && t.category !== pro.DEBT_PAYMENT);
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
    work.shiftClosed();
    return q('SELECT * FROM shifts WHERE id = ?').get(s.id);
  }

  // ---------- Money pages: who may open them, and the optional finance password ----------
  // Unlocking with the finance password gives a short-lived key the browser sends as "X-Finance".
  const financeTokens = new Map();
  const FINANCE_TTL = 15 * MIN;
  const LOCK_FREE = /^\/api\/(shifts\/(current|open|close)|my\/payroll|attendance(\/pay)?)$/;

  function guard(route, user, financeKey) {
    const m = route.module;
    if (!user || !['reports', 'finance', 'payroll'].includes(m) || LOCK_FREE.test(route.pattern)) return;
    const access = moneyAccess(user);
    if (!access[m]) throw new HttpError(403, "Bu bo'limni ko'rishga boshliq ruxsat bermagan");
    const s = settings();
    if (!s.finance_lock || !s.has_finance_code) return;
    const k = financeTokens.get(financeKey || '');
    if (!k || k.user_id !== user.id || k.exp < now()) throw new HttpError(423, "Moliya bo'limi qulflangan. Parolni kiriting");
    k.exp = now() + FINANCE_TTL;
  }

  // Who came today. Money columns (earned, spent, left to pay) only for those who may pay out: the boss,
  // and an admin the boss lets into the cash book.
  const canPayDaily = (user) => user.role === 'owner' || (user.role === 'admin' && moneyAccess(user).finance);
  function attendanceDay({ user, query }) {
    const d = payroll.dayView({ query });
    d.can_pay = canPayDaily(user);
    if (!d.can_pay) d.staff = d.staff.map(({ id, name, role, status, auto }) => ({ id, name, role, status, auto }));
    return d;
  }
  // A daily worker's pay handed over in the evening (an admin: at most what is left for that day).
  function payDaily({ user, body }) {
    if (!canPayDaily(user)) throw new HttpError(403, "Ish haqi berish huquqi yo'q");
    const uid = int(body.user_id, 'Xodim', { min: 1, required: true });
    if (user.role !== 'owner') {
      const row = payroll.dayView({ query: { day: body.day } }).staff.find((r) => r.id === uid);
      if (!row || int(body.amount, 'Summa', { min: 1, required: true }) > Math.max(0, row.day_due)) {
        throw new HttpError(403, "Bugungi qoldiqdan ko'p berib bo'lmaydi. Boshliqqa murojaat qiling");
      }
    }
    return payroll.addEntry({ user, body: { ...body, user_id: uid, type: 'payment', note: body.note || 'Kunlik ish haqi' } });
  }

  // One business's totals for a period (used by the owner's branch report across businesses).
  function summary(from, to) {
    const o = q(`SELECT COUNT(*) orders, COALESCE(SUM(total), 0) total, COALESCE(SUM(guests), 0) guests, COALESCE(SUM(paid_cash), 0) cash,
      COALESCE(SUM(paid_card), 0) card, COALESCE(SUM(paid_transfer), 0) transfer, COALESCE(SUM(paid_debt), 0) debt
      FROM orders WHERE status = 'closed' AND closed_at >= ? AND closed_at < ?`).get(from, to);
    const exp = q("SELECT COALESCE(SUM(amount), 0) s FROM transactions WHERE type = 'expense' AND created_at >= ? AND created_at < ?").get(from, to).s;
    const open = q("SELECT COUNT(*) c, COALESCE(SUM(0), 0) z FROM orders WHERE status = 'open'").get().c;
    return { ...o, expense: exp, profit: o.total - exp, open_orders: open, avg_check: o.orders ? Math.round(o.total / o.orders) : 0 };
  }
  // The owner of a business with branches sees every branch side by side.
  function branchReport({ query }) {
    const from = Number(query.from);
    const to = Number(query.to);
    if (!from || !to || to <= from) throw new HttpError(400, "Davr noto'g'ri");
    const list = branches();
    if (!list.length) throw new HttpError(404, "Filiallar yo'q. Ularni platforma egasi bog'laydi");
    const rows = list.map((b) => ({ code: b.code, name: b.name, main: b.main, ...b.api.summary(from, to) }));
    const sumKey = (k) => rows.reduce((s, r) => s + r[k], 0);
    const total = Object.fromEntries(['orders', 'total', 'guests', 'cash', 'card', 'transfer', 'debt', 'expense', 'profit', 'open_orders'].map((k) => [k, sumKey(k)]));
    total.avg_check = total.orders ? Math.round(total.total / total.orders) : 0;
    return { from, to, rows, total };
  }

  function financeUnlock({ user, body }) {
    const key = `finance|${user.id}`;
    const f = pinFailures.get(key);
    if (f && f.count >= 5 && now() - f.first < 5 * MIN) throw new HttpError(429, "Juda ko'p xato. 5 daqiqadan keyin urinib ko'ring");
    const hash = (q("SELECT value FROM settings WHERE key = 'finance_code_hash'").get() || {}).value;
    if (!hash) return { finance_key: null };
    if (!verifyPassword(String(body.code ?? ''), hash)) {
      pinFailures.set(key, !f || now() - f.first >= 5 * MIN ? { count: 1, first: now() } : { ...f, count: f.count + 1 });
      throw new HttpError(403, "Moliya paroli noto'g'ri");
    }
    pinFailures.delete(key);
    const financeKey = newToken();
    for (const [k, v] of financeTokens) if (v.exp < now()) financeTokens.delete(k);
    financeTokens.set(financeKey, { user_id: user.id, exp: now() + FINANCE_TTL });
    audit(user, 'finance_unlock');
    return { finance_key: financeKey };
  }

  // ---------- Backups ----------
  // A copy of this choyxona's whole database as one file.
  function backupFile(name) {
    if (!file) throw new HttpError(400, 'Zaxira bu rejimda ishlamaydi');
    const tmp = path.join(os.tmpdir(), `flowi-${process.pid}-${newToken().slice(0, 8)}.db`);
    try {
      snapshot(file, tmp);
      const body = fs.readFileSync(tmp);
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}`;
      return { __file: { name: `flowi_${name}_${stamp}.db`, type: 'application/octet-stream', body } };
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  const tenantCode = () => (tenant() || {}).code || 'flowi';

  function downloadBackup({ user }) {
    audit(user, 'backup_download');
    return backupFile(tenantCode());
  }

  // The boss marks this computer as the one that keeps automatic backups in a folder.
  function setDeviceBackup({ user, body }) {
    const d = authenticateDevice(str(body.device_token, 'Qurilma', { required: true, max: 200 }));
    if (!d) throw new HttpError(404, 'Qurilma topilmadi');
    q('UPDATE devices SET backup = ? WHERE id = ?').run(body.on ? 1 : 0, d.id);
    audit(user, 'backup_device', `${d.name}: ${body.on ? 'on' : 'off'}`);
    return { ok: true };
  }

  function deviceBackup({ device }) {
    if (!device.backup) throw new HttpError(403, 'Bu qurilmada avtomatik zaxira yoqilmagan');
    return backupFile(tenantCode());
  }

  function listAudit({ query }) {
    const limit = Math.min(Number(query.limit) || 300, 2000);
    return q(`SELECT a.*, u.name user_name, u.role FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?`).all(limit);
  }

  // ---------- Route table ----------
  const ALL = ROLES;
  const routes = [
    ['POST', '/api/login', null, login],
    ['POST', '/api/device/register', null, registerDevice],
    ['GET', '/api/device/staff', 'device', deviceStaff],
    ['GET', '/api/device/backup', 'device', deviceBackup],
    ['PUT', '/api/devices/backup', ['owner'], setDeviceBackup],
    ['GET', '/api/backup/download', ['owner'], downloadBackup],
    ['POST', '/api/assets', MANAGERS, uploadAsset],
    ['POST', '/api/finance/unlock', MONEY, financeUnlock],
    ['POST', '/api/sales', ['owner', 'admin', 'cashier', 'waiter'], createSale],
    ['POST', '/api/orders/:id/refund', MONEY, refundItems],
    ['POST', '/api/dishes/:id/receive', MANAGERS, receiveStock],
    ['POST', '/api/device/pin', 'device', pinLogin],
    ['GET', '/api/devices', MANAGERS, listDevices],
    ['DELETE', '/api/devices/:id', MANAGERS, deleteDevice],
    ['PUT', '/api/me/pin', ALL, setOwnPin],
    ['GET', '/api/takeaway', ['owner', 'admin', 'cashier', 'waiter'], listTakeaway],
    ['POST', '/api/orders/:id/print', ['owner', 'admin', 'cashier', 'waiter'], printOrder],
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
    ['GET', '/api/qr', MANAGERS, guest.listQr],
    ['POST', '/api/qr/renew', ['owner'], guest.renewAll],
    ['POST', '/api/rooms/:id/qr', MANAGERS, guest.renewQr],
    ['GET', '/api/guest-requests', ['owner', 'admin', 'cashier', 'waiter'], guest.list],
    ['POST', '/api/guest-requests/:id/approve', ['owner', 'admin', 'cashier', 'waiter'], guest.approve],
    ['POST', '/api/guest-requests/:id/reject', ['owner', 'admin', 'cashier', 'waiter'], guest.reject],
    ['POST', '/api/guest-requests/:id/done', ['owner', 'admin', 'cashier', 'waiter'], guest.done],
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
    ['GET', '/api/orders/:id/invoice', ['owner', 'admin', 'cashier', 'waiter'], invoiceOf],
    ['GET', '/api/today', ALL, today],
    ['GET', '/api/telegram', ['owner'], tgApi('status')],
    ['POST', '/api/telegram/link', ['owner'], tgApi('link')],
    ['POST', '/api/telegram/test', ['owner'], tgApi('test')],
    ['DELETE', '/api/telegram', ['owner'], tgApi('unlink')],
    ['GET', '/api/tasks', ALL, tasks.list],
    ['POST', '/api/tasks', ['owner', 'admin', 'cashier'], tasks.create],
    ['PUT', '/api/tasks/:id', MANAGERS, tasks.update],
    ['DELETE', '/api/tasks/:id', MANAGERS, tasks.remove],
    ['POST', '/api/tasks/:id/done', ALL, (a) => tasks.done(a, { onDone: (t, u) => {
      const m = /^job:(\d+)$/.exec(t.ref);
      if (m && (shop.jobRow(Number(m[1])).status === 'planned')) shop.setJobStatus(u, Number(m[1]), 'done');
    } })],
    ['POST', '/api/tasks/:id/undo', ALL, tasks.undo],
    ['GET', '/api/suppliers', MONEY, shop.listSuppliers],
    ['POST', '/api/suppliers', MANAGERS, shop.saveSupplier],
    ['GET', '/api/suppliers/:id', MONEY, shop.supplierDetail],
    ['PUT', '/api/suppliers/:id', MANAGERS, shop.saveSupplier],
    ['DELETE', '/api/suppliers/:id', MANAGERS, shop.deleteSupplier],
    ['POST', '/api/suppliers/:id/pay', MONEY, shop.paySupplier],
    ['GET', '/api/purchases', MONEY, shop.listPurchases],
    ['POST', '/api/purchases', MONEY, shop.createPurchase],
    ['GET', '/api/purchases/:id', MONEY, shop.purchaseDetail],
    ['POST', '/api/dishes/:id/writeoff', MANAGERS, shop.writeOff],
    ['POST', '/api/dishes/:id/count', MONEY, shop.count],
    ['GET', '/api/dishes/:id/history', MANAGERS, shop.stockHistory],
    ['POST', '/api/import/products', MANAGERS, shop.importProducts],
    ['POST', '/api/barcodes', MANAGERS, shop.assignBarcodes],
    ['GET', '/api/masters', ['owner', 'admin', 'cashier', 'waiter'], shop.listMasters],
    ['POST', '/api/masters', MANAGERS, shop.saveMaster],
    ['PUT', '/api/masters/:id', MANAGERS, shop.saveMaster],
    ['DELETE', '/api/masters/:id', MANAGERS, shop.deleteMaster],
    ['POST', '/api/masters/:id/pay', MONEY, shop.payMaster],
    ['GET', '/api/jobs', ['owner', 'admin', 'cashier', 'waiter'], shop.listJobs],
    ['POST', '/api/jobs', ['owner', 'admin', 'cashier', 'waiter'], shop.createJob],
    ['PUT', '/api/jobs/:id', ['owner', 'admin', 'cashier'], shop.updateJob],
    ['POST', '/api/jobs/:id/done', ['owner', 'admin', 'cashier', 'waiter'], shop.jobDone],
    ['POST', '/api/jobs/:id/cancel', ['owner', 'admin', 'cashier'], shop.jobCancel],
    ['POST', '/api/jobs/:id/reopen', ['owner', 'admin', 'cashier'], shop.jobReopen],
    ['GET', '/api/debts', MONEY, shop.debts],
    ['GET', '/api/profit', MONEY, shop.profit],
    ['PUT', '/api/orders/:id', ['owner', 'admin', 'cashier', 'waiter'], updateOrder],
    ['POST', '/api/orders/:id/items', ['owner', 'admin', 'cashier', 'waiter'], addItems],
    ['POST', '/api/orders/:id/request-bill', ['owner', 'admin', 'waiter'], requestBill],
    ['POST', '/api/orders/:id/close', ['owner', 'admin', 'cashier', 'waiter'], closeOrder],
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
    ['GET', '/api/payroll', ['owner'], payroll.month],
    ['PUT', '/api/payroll/rates/:id', ['owner'], payroll.setRate],
    ['POST', '/api/payroll/entries', ['owner'], payroll.addEntry],
    ['DELETE', '/api/payroll/entries/:id', ['owner'], payroll.deleteEntry],
    ['POST', '/api/payroll/attendance', ['owner'], payroll.setAttendance],
    ['GET', '/api/payroll/users/:id', ['owner'], payroll.userLedger],
    ['GET', '/api/my/payroll', ALL, payroll.myPayroll],
    ['GET', '/api/attendance', MANAGERS, attendanceDay],
    ['POST', '/api/geo/check', ALL, work.geoCheck],
    ['GET', '/api/work/me', ALL, ({ user }) => work.state(user)],
    ['POST', '/api/work/in', ALL, work.clockIn],
    ['POST', '/api/work/out', ALL, work.clockOut],
    ['GET', '/api/work/qr', ['owner', 'admin', 'cashier'], work.qrCode],
    ['GET', '/api/device/work-qr', 'device', () => { if (!settings().att_qr) throw new HttpError(404, "Davomat QR kodi yoqilmagan"); return work.qrCode(); }],
    ['GET', '/api/work/pending', ['owner', 'admin', 'cashier'], work.pending],
    ['POST', '/api/work/:id/approve', ['owner', 'admin', 'cashier'], work.approve],
    ['POST', '/api/work/:id/reject', ['owner', 'admin', 'cashier'], work.reject],
    ['POST', '/api/work/:id/close', MANAGERS, work.closeByManager],
    ['GET', '/api/work/log', MANAGERS, work.log],
    ['GET', '/api/work/:id/photo', MANAGERS, work.photo],
    ['GET', '/api/customers', MONEY, pro.listCustomers],
    ['POST', '/api/customers', MONEY, pro.saveCustomer],
    ['GET', '/api/customers/:id', MONEY, pro.customerDetail],
    ['PUT', '/api/customers/:id', MONEY, pro.saveCustomer],
    ['POST', '/api/customers/:id/pay', MONEY, pro.payDebt],
    ['GET', '/api/ingredients', [...MANAGERS, 'cashier', 'chef'], pro.listIngredients],
    ['POST', '/api/ingredients', MANAGERS, pro.saveIngredient],
    ['PUT', '/api/ingredients/:id', MANAGERS, pro.saveIngredient],
    ['DELETE', '/api/ingredients/:id', MANAGERS, pro.deleteIngredient],
    ['POST', '/api/inventory/receive', [...MANAGERS, 'cashier'], pro.receive],
    ['POST', '/api/inventory/adjust', [...MANAGERS, 'chef'], pro.adjust],
    ['GET', '/api/inventory/moves', MANAGERS, pro.listMoves],
    ['GET', '/api/dishes/:id/recipe', MANAGERS, pro.getRecipe],
    ['PUT', '/api/dishes/:id/recipe', MANAGERS, pro.setRecipe],
    ['GET', '/api/branches', ['owner'], branchReport],
    ['GET', '/api/staff-list', ['owner', 'admin', 'cashier'], () => q("SELECT id, name, role FROM users WHERE active = 1 AND role != 'owner' ORDER BY name").all()],
    ['POST', '/api/attendance', MANAGERS, payroll.setAttendance],
    ['POST', '/api/attendance/pay', MANAGERS, payDaily],
    ['GET', '/api/checks', MONEY, listChecks],
    ['GET', '/api/checks/export', MONEY, exportChecks],
  ].map(([method, pattern, roles, handler]) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '$');
    return { method, pattern, re, keys, roles, handler, module: routeModule(pattern) };
  });

  function match(method, pathname) {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = Number(m[i + 1]); });
      if (r.module === 'kitchen') {
        if (kitchenMode() === 'off') throw new HttpError(403, `"Oshxona ekrani" bo'limi sizning paketingizda yoqilmagan`);
      } else if (r.module && !moduleOn(r.module)) {
        throw new HttpError(403, `"${MODULES[r.module]}" bo'limi sizning paketingizda yoqilmagan`);
      }
      return { route: r, params };
    }
    return null;
  }

  return { match, guard, workGate: (route, user) => work.gate(route, user), authenticate, authenticateDevice, settings, getAsset, businessType, startSession, audit, planInfo, wasKicked, summary, ROLES,
    guestInfo: guest.info, guestImage: guest.image, guestRequest: guest.request, morningText, soonTexts };
}

module.exports = { createApi, MODULES, BUSINESS_TYPES, SHOP_TYPES };
