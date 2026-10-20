'use strict';
/*
 * Platform layer: one site, many choyxonas.
 * - platform.db keeps the platform admins (the site owner) and the list of choyxonas (tenants).
 * - Every choyxona has its own SQLite file in data/tenants/, its own live-event hub and its own staff,
 *   so data can never mix between choyxonas.
 * - Session tokens of a choyxona start with "t<id>_", platform tokens with "p_".
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { open } = require('./db');
const { createApi, MODULES } = require('./api');
const { createHub } = require('./events');
const { hashPassword, verifyPassword, newToken, HttpError, str, int } = require('./util');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  default_password INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  file TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  paid_until INTEGER,
  monthly_fee INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  disabled_modules TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
`;
const DAY = 24 * 3600 * 1000;
const CODE_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

function createPlatform(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'tenants'), { recursive: true });
  const pdb = new DatabaseSync(path.join(dataDir, 'platform.db'));
  pdb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  pdb.exec(SCHEMA);
  if (!pdb.prepare('PRAGMA table_info(tenants)').all().some((c) => c.name === 'disabled_modules')) {
    pdb.exec("ALTER TABLE tenants ADD COLUMN disabled_modules TEXT NOT NULL DEFAULT '[]'");
  }
  const q = (sql) => pdb.prepare(sql);
  const now = () => Date.now();

  // ---------- Bootstrap ----------
  if (!q('SELECT 1 FROM admins').get()) {
    const pw = process.env.PLATFORM_PASSWORD || 'super123';
    q('INSERT INTO admins (name, username, pass_hash, default_password, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'Bosh administrator', process.env.PLATFORM_USER || 'superadmin', hashPassword(pw), process.env.PLATFORM_PASSWORD ? 0 : 1, now()
    );
  }
  if (!q('SELECT 1 FROM tenants').get()) {
    // A database from the single-choyxona version becomes the first choyxona.
    const legacy = path.join(dataDir, 'choyxona.db');
    if (fs.existsSync(legacy)) {
      q("INSERT INTO tenants (code, name, file, created_at) VALUES ('asosiy', 'Asosiy choyxona', ?, ?)").run('choyxona.db', now());
    } else if (process.env.SEED_DEMO !== '0') {
      q("INSERT INTO tenants (code, name, file, created_at) VALUES ('demo', 'Demo choyxona', ?, ?)").run('tenants/demo.db', now());
      open(path.join(dataDir, 'tenants', 'demo.db'), { demo: true, name: 'Demo choyxona' }).close();
    }
  }

  // ---------- Choyxona contexts (opened lazily, cached) ----------
  const contexts = new Map();
  const tenantRow = (id) => q('SELECT * FROM tenants WHERE id = ?').get(id);

  function context(id) {
    let ctx = contexts.get(id);
    if (ctx) return ctx;
    const row = tenantRow(id);
    if (!row) return null;
    const db = open(path.join(dataDir, row.file));
    const hub = createHub();
    ctx = { id, db, hub, row };
    ctx.api = createApi(db, { hub, tokenPrefix: `t${id}_`, tenant: () => ctx.row });
    contexts.set(id, ctx);
    return ctx;
  }

  function refresh(id) {
    const ctx = contexts.get(id);
    if (ctx) ctx.row = tenantRow(id);
  }

  function byCode(code) {
    const row = q('SELECT * FROM tenants WHERE code = ?').get(String(code || '').trim().toLowerCase());
    return row ? context(row.id) : null;
  }

  function byToken(token) {
    const m = /^t(\d+)_/.exec(token || '');
    return m ? context(Number(m[1])) : null;
  }

  function assertActive(ctx) {
    if (ctx.row.status !== 'active') {
      throw new HttpError(403, "Bu choyxona vaqtincha bloklangan. Platforma administratoriga murojaat qiling");
    }
  }

  // ---------- Platform admin API ----------
  const failures = new Map();
  function login({ body, ip }) {
    const username = str(body.username, 'Login', { required: true });
    const password = str(body.password, 'Parol', { required: true });
    const key = `${username.toLowerCase()}|${ip}`;
    const f = failures.get(key);
    if (f && f.count >= 5 && now() - f.first < 15 * 60000) throw new HttpError(429, "Juda ko'p urinish. 15 daqiqadan keyin urinib ko'ring");
    const a = q('SELECT * FROM admins WHERE username = ?').get(username);
    if (!a || !verifyPassword(password, a.pass_hash)) {
      failures.set(key, !f || now() - f.first >= 15 * 60000 ? { count: 1, first: now() } : { ...f, count: f.count + 1 });
      throw new HttpError(401, "Login yoki parol noto'g'ri");
    }
    failures.delete(key);
    const token = `p_${newToken()}`;
    q('INSERT INTO admin_sessions (token, admin_id, created_at) VALUES (?, ?, ?)').run(token, a.id, now());
    return { token, admin: publicAdmin(a) };
  }

  function publicAdmin(a) {
    return { id: a.id, name: a.name, username: a.username, default_password: !!a.default_password };
  }

  // True when these are the site owner's own credentials (typed into a choyxona login by mistake).
  function isAdminLogin(username, password) {
    const a = q('SELECT * FROM admins WHERE username = ?').get(String(username || '').trim());
    return !!a && verifyPassword(String(password || ''), a.pass_hash);
  }

  function authenticate(token) {
    if (!token || !token.startsWith('p_')) return null;
    return q('SELECT a.* FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token = ?').get(token) || null;
  }

  function changePassword({ admin, body }) {
    const old = str(body.old_password, 'Eski parol', { required: true });
    const pw = str(body.new_password, 'Yangi parol', { required: true });
    if (pw.length < 8) throw new HttpError(400, "Bosh administrator paroli kamida 8 ta belgi bo'lsin");
    if (!verifyPassword(old, admin.pass_hash)) throw new HttpError(400, "Eski parol noto'g'ri");
    q('UPDATE admins SET pass_hash = ?, default_password = 0 WHERE id = ?').run(hashPassword(pw), admin.id);
    return { ok: true };
  }

  function stats(row) {
    try {
      const { db } = context(row.id);
      const since = now() - 30 * DAY;
      const one = (sql, ...a) => db.prepare(sql).get(...a);
      return {
        staff: one('SELECT COUNT(*) c FROM users WHERE active = 1').c,
        rooms: one('SELECT COUNT(*) c FROM rooms WHERE active = 1').c,
        orders_30d: one("SELECT COUNT(*) c FROM orders WHERE status = 'closed' AND closed_at >= ?", since).c,
        sales_30d: one("SELECT COALESCE(SUM(total), 0) s FROM orders WHERE status = 'closed' AND closed_at >= ?", since).s,
        last_activity: one('SELECT MAX(created_at) t FROM audit').t,
        owners: db.prepare("SELECT username FROM users WHERE role = 'owner' AND active = 1 ORDER BY id").all().map((u) => u.username),
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  function parseModules(t) {
    try { return JSON.parse(t.disabled_modules || '[]'); } catch { return []; }
  }

  function modulesInput(v) {
    if (!Array.isArray(v)) throw new HttpError(400, "Bo'limlar ro'yxati noto'g'ri");
    const bad = v.find((m) => !MODULES[m]);
    if (bad) throw new HttpError(400, `Noma'lum bo'lim: ${bad}`);
    return JSON.stringify([...new Set(v)]);
  }

  function listTenants() {
    return q('SELECT * FROM tenants ORDER BY id DESC').all().map((t) => ({ ...t, disabled_modules: parseModules(t), ...stats(t) }));
  }

  function createTenant({ body }) {
    const name = str(body.name, 'Choyxona nomi', { required: true, max: 80 });
    const code = str(body.code, 'Kod', { required: true, max: 31 }).toLowerCase();
    if (!CODE_RE.test(code)) throw new HttpError(400, "Kod faqat lotin harflari, raqam va '-' dan iborat bo'lsin (masalan: navruz)");
    if (q('SELECT 1 FROM tenants WHERE code = ?').get(code)) throw new HttpError(409, 'Bu kod band');
    const owner = {
      name: str(body.owner_name, 'Boshliq ismi', { required: true, max: 80 }),
      username: str(body.owner_username, 'Boshliq logini', { required: true, max: 40 }),
      password: str(body.owner_password, 'Boshliq paroli', { required: true }),
    };
    if (owner.password.length < 6) throw new HttpError(400, "Parol kamida 6 ta belgi bo'lsin");
    const file = `tenants/${code}.db`;
    if (fs.existsSync(path.join(dataDir, file))) throw new HttpError(409, 'Bu kod uchun fayl allaqachon bor');
    open(path.join(dataDir, file), { name, owner, sample: !!body.sample }).close();
    const disabled = body.disabled_modules !== undefined ? modulesInput(body.disabled_modules) : '[]';
    const id = q(`INSERT INTO tenants (code, name, contact_name, phone, file, paid_until, monthly_fee, notes, created_at, disabled_modules)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      code, name, owner.name, str(body.phone, 'Telefon', { max: 30 }), file,
      body.paid_until ? int(body.paid_until, "To'lov muddati", { min: 1, max: 8.64e15 }) : null,
      int(body.monthly_fee, 'Oylik narx'), str(body.notes, 'Izoh', { max: 500 }), now(), disabled
    ).lastInsertRowid;
    return tenantRow(id);
  }

  function updateTenant({ params, body }) {
    const t = tenantRow(params.id);
    if (!t) throw new HttpError(404, 'Choyxona topilmadi');
    const status = body.status !== undefined ? str(body.status, 'Holat') : t.status;
    if (!['active', 'blocked'].includes(status)) throw new HttpError(400, "Holat noto'g'ri");
    q('UPDATE tenants SET name = ?, contact_name = ?, phone = ?, status = ?, paid_until = ?, monthly_fee = ?, notes = ?, disabled_modules = ? WHERE id = ?').run(
      body.name !== undefined ? str(body.name, 'Nomi', { required: true, max: 80 }) : t.name,
      body.contact_name !== undefined ? str(body.contact_name, 'Boshliq', { max: 80 }) : t.contact_name,
      body.phone !== undefined ? str(body.phone, 'Telefon', { max: 30 }) : t.phone,
      status,
      body.paid_until !== undefined ? (body.paid_until ? int(body.paid_until, "To'lov muddati", { min: 1, max: 8.64e15 }) : null) : t.paid_until,
      body.monthly_fee !== undefined ? int(body.monthly_fee, 'Oylik narx') : t.monthly_fee,
      body.notes !== undefined ? str(body.notes, 'Izoh', { max: 500 }) : t.notes,
      body.disabled_modules !== undefined ? modulesInput(body.disabled_modules) : t.disabled_modules,
      t.id
    );
    refresh(t.id);
    // Open screens re-read their menu of sections right away.
    if (contexts.has(t.id)) contexts.get(t.id).hub.publish('settings');
    // Blocking logs everyone of that choyxona out immediately.
    if (status === 'blocked' && contexts.has(t.id)) contexts.get(t.id).hub.disconnectUser();
    return tenantRow(t.id);
  }

  // "Forgot password" support: resets (or recreates) the boss account of a choyxona.
  function resetOwner({ params, body }) {
    const ctx = context(params.id);
    if (!ctx) throw new HttpError(404, 'Choyxona topilmadi');
    const password = str(body.password, 'Yangi parol', { required: true });
    if (password.length < 6) throw new HttpError(400, "Parol kamida 6 ta belgi bo'lsin");
    const username = str(body.username, 'Login', { max: 40 });
    const db = ctx.db;
    let owner = username
      ? db.prepare("SELECT * FROM users WHERE username = ? AND role = 'owner'").get(username)
      : db.prepare("SELECT * FROM users WHERE role = 'owner' ORDER BY active DESC, id LIMIT 1").get();
    if (!owner) {
      if (!username) throw new HttpError(404, "Boshliq topilmadi — login kiriting, yangi boshliq yaratiladi");
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'Bu login boshqa xodimda band');
      db.prepare("INSERT INTO users (name, username, pass_hash, role, created_at) VALUES ('Boshliq', ?, ?, 'owner', ?)").run(username, hashPassword(password), now());
      return { username };
    }
    db.prepare('UPDATE users SET pass_hash = ?, active = 1 WHERE id = ?').run(hashPassword(password), owner.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(owner.id);
    ctx.hub.disconnectUser(owner.id);
    return { username: owner.username };
  }

  const routes = [
    ['POST', '/api/platform/login', false, login],
    ['POST', '/api/platform/logout', true, ({ token }) => { q('DELETE FROM admin_sessions WHERE token = ?').run(token); return { ok: true }; }],
    ['GET', '/api/platform/me', true, ({ admin }) => publicAdmin(admin)],
    ['PUT', '/api/platform/me/password', true, changePassword],
    ['GET', '/api/platform/modules', true, () => MODULES],
    ['GET', '/api/platform/tenants', true, listTenants],
    ['POST', '/api/platform/tenants', true, createTenant],
    ['PUT', '/api/platform/tenants/:id', true, updateTenant],
    ['POST', '/api/platform/tenants/:id/reset-owner', true, resetOwner],
  ].map(([method, pattern, auth, handler]) => ({
    method, auth, handler, re: new RegExp('^' + pattern.replace(':id', '(\\d+)') + '$'),
  }));

  function handle(method, pathname, args) {
    const r = routes.find((x) => x.method === method && x.re.test(pathname));
    if (!r) throw new HttpError(404, 'Topilmadi');
    const m = r.re.exec(pathname);
    const params = m[1] ? { id: Number(m[1]) } : {};
    let admin = null;
    if (r.auth) {
      admin = authenticate(args.token);
      if (!admin) throw new HttpError(401, 'Tizimga kiring');
    }
    return r.handler({ ...args, params, admin });
  }

  function close() {
    for (const c of contexts.values()) c.db.close();
    pdb.close();
  }

  return { handle, byCode, byToken, assertActive, isAdminLogin, close };
}

module.exports = { createPlatform };
