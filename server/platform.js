'use strict';
/*
 * Platform layer: one site, many choyxonas.
 * - platform.db keeps the platform admins (the site owner) and the list of choyxonas (tenants).
 * - Every choyxona has its own SQLite file in data/tenants/, its own live-event hub and its own staff,
 *   so data can never mix between choyxonas.
 * - Session tokens of a choyxona start with "t<id>_", platform tokens with "p_".
 */
const fs = require('node:fs');
const os = require('node:os');
const zlib = require('node:zlib');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { open } = require('./db');
const { createApi, MODULES, BUSINESS_TYPES, SHOP_TYPES } = require('./api');
const { createHub } = require('./events');
const { snapshot, listTenantBackups, stampNow } = require('./backup');
const { createLeads } = require('./leads');
const { verifyInput } = require('./seo');
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
  kitchen_mode TEXT NOT NULL DEFAULT 'full',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
const DAY = 24 * 3600 * 1000;
const CODE_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

/*
 * Plans: what each business pays and gets. The platform owner edits names, prices, staff limits and sections;
 * the three keys stay. max_staff 0 = no limit. A lower plan never deletes anything: it only stops adding more.
 */
const PLAN_KEYS = ['start', 'biznes', 'pro'];
const BIZ_MODULES = ['stoplist', 'reports', 'finance', 'payroll', 'reservations', 'history', 'audit', 'export', 'qrmenu', 'qrorder', 'debts', 'pnl'];
const PRO_MODULES = [...BIZ_MODULES, 'customers', 'inventory', 'branches'];
// A section moved into a plan after the plans were saved; each is applied once (the owner may take it out again).
const PLAN_ADDITIONS = [['biznes', 'debts'], ['start', 'finance']];
const DEFAULT_PLANS = {
  start: { name: 'Start', price: 199000, max_staff: 5, devices_per_staff: 1, modules: ['stoplist', 'reports', 'finance', 'history', 'qrmenu'] },
  biznes: { name: 'Biznes', price: 349000, max_staff: 15, devices_per_staff: 1, modules: BIZ_MODULES },
  pro: { name: 'Pro', price: 599000, max_staff: 0, devices_per_staff: 0, modules: PRO_MODULES },
};
// Sections that existed when plans were first saved; a section added later goes to the plans that have it by default.
const FIRST_MODULES = ['stoplist', 'reports', 'finance', 'payroll', 'reservations', 'history', 'audit', 'export'];
// branch_price: a second (third…) place of the same owner; yearly_months: a year is paid as this many months;
// grace_days: days after the paid term ends before the business becomes read-only; trial_days: free start.
const DEFAULT_TERMS = { branch_price: 149000, yearly_months: 10, grace_days: 3, trial_days: 14 };

function createPlatform(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'tenants'), { recursive: true });
  const pdb = new DatabaseSync(path.join(dataDir, 'platform.db'));
  pdb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  pdb.exec(SCHEMA);
  const tcols = pdb.prepare('PRAGMA table_info(tenants)').all().map((c) => c.name);
  if (!tcols.includes('disabled_modules')) pdb.exec("ALTER TABLE tenants ADD COLUMN disabled_modules TEXT NOT NULL DEFAULT '[]'");
  if (!tcols.includes('kitchen_mode')) {
    // The old "kitchen screen" on/off switch becomes the kitchen mode.
    pdb.exec("ALTER TABLE tenants ADD COLUMN kitchen_mode TEXT NOT NULL DEFAULT 'full'");
    for (const t of pdb.prepare("SELECT id, disabled_modules FROM tenants WHERE disabled_modules LIKE '%kitchen%'").all()) {
      const rest = JSON.parse(t.disabled_modules).filter((m) => m !== 'kitchen');
      pdb.prepare("UPDATE tenants SET kitchen_mode = 'off', disabled_modules = ? WHERE id = ?").run(JSON.stringify(rest), t.id);
    }
  }
  // Business type picked at creation; support contact shown on that business's desktop (empty = the platform default).
  if (!tcols.includes('business_type')) pdb.exec("ALTER TABLE tenants ADD COLUMN business_type TEXT NOT NULL DEFAULT 'choyxona'");
  if (!tcols.includes('support')) pdb.exec("ALTER TABLE tenants ADD COLUMN support TEXT NOT NULL DEFAULT ''");
  // Businesses that existed before plans keep everything they had: they start on "Biznes".
  if (!tcols.includes('plan')) pdb.exec("ALTER TABLE tenants ADD COLUMN plan TEXT NOT NULL DEFAULT 'biznes'");
  if (!tcols.includes('is_branch')) pdb.exec('ALTER TABLE tenants ADD COLUMN is_branch INTEGER NOT NULL DEFAULT 0');
  // A branch points to its main business; the main business's owner sees all of them in one report.
  if (!tcols.includes('parent_id')) pdb.exec('ALTER TABLE tenants ADD COLUMN parent_id INTEGER');
  // A discount on what the business pays: a percent or a sum off, for a while or for good, with a reason.
  if (!tcols.includes('discount_type')) {
    pdb.exec(`ALTER TABLE tenants ADD COLUMN discount_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE tenants ADD COLUMN discount_value INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE tenants ADD COLUMN discount_until INTEGER;
      ALTER TABLE tenants ADD COLUMN discount_note TEXT NOT NULL DEFAULT '';`);
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
    const file = path.join(dataDir, row.file);
    const db = open(file);
    const hub = createHub();
    ctx = { id, db, hub, row, file };
    ctx.api = createApi(db, { hub, tokenPrefix: `t${id}_`, tenant: () => ctx.row, plan: () => planFor(ctx.row), branches: () => branchesOf(id), file, telegram: telegramFor(id) });
    contexts.set(id, ctx);
    return ctx;
  }

  // A main business and its branches (empty when this business has none or is itself a branch).
  function branchesOf(id) {
    const kids = q('SELECT id FROM tenants WHERE parent_id = ? ORDER BY id').all(id);
    if (!kids.length) return [];
    return [id, ...kids.map((k) => k.id)].map((tid) => {
      const c = context(tid);
      return c && { code: c.row.code, name: c.api.settings().name || c.row.name, main: tid === id, api: c.api };
    }).filter(Boolean);
  }

  function refresh(id) {
    const ctx = contexts.get(id);
    if (ctx) ctx.row = tenantRow(id);
  }

  function byCode(code) {
    const row = q('SELECT * FROM tenants WHERE code = ?').get(String(code || '').trim().toLowerCase());
    return row ? context(row.id) : null;
  }

  // A room's QR key starts with the business id: "12-AbCdEf…".
  function byGuestKey(key) {
    const m = /^(\d+)-[A-Za-z0-9]{12}$/.exec(key || '');
    return m ? context(Number(m[1])) : null;
  }

  function byToken(token) {
    const m = /^[td](\d+)_/.exec(token || '');
    return m ? context(Number(m[1])) : null;
  }

  function assertActive(ctx) {
    if (ctx.row.status !== 'active') {
      throw new HttpError(403, "Bu choyxona vaqtincha bloklangan. Platforma administratoriga murojaat qiling");
    }
  }

  // ---------- Platform settings: the support contact every desktop shows ----------
  function pget(key, def = '') { const r = q('SELECT value FROM platform_settings WHERE key = ?').get(key); return r ? r.value : def; }
  function pset(key, value) { q('INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value); }

  // Applications from the front page and the owner's Telegram bot.
  const leads = createLeads({ pdb, pget, pset, now });

  // ---------- Versions: the change list (CHANGELOG.md) and the day each version first ran on this server ----------
  const ROOT = path.join(__dirname, '..');
  const versionDates = (() => { try { return JSON.parse(pget('version_dates', '{}')) || {}; } catch { return {}; } })();
  try {
    const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    if (cur && !versionDates[cur]) { versionDates[cur] = now(); pset('version_dates', JSON.stringify(versionDates)); }
  } catch { /* no package.json: nothing to note */ }
  function changelog() {
    let text = '';
    try { text = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'); } catch { return { versions: [] }; }
    const versions = [];
    for (const block of text.split(/^## /m).slice(1)) {
      const nl = block.indexOf('\n');
      const head = (nl < 0 ? block : block.slice(0, nl)).trim();
      const m = /^(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.*))?$/.exec(head);
      if (!m) continue;
      versions.push({ version: m[1], title: (m[2] || '').trim(), body: (nl < 0 ? '' : block.slice(nl + 1)).trim(), installed_at: versionDates[m[1]] || null });
    }
    return { versions };
  }
  leads.start();

  // ---------- A business owner's Telegram: the morning list of tasks, a reminder an hour before a task ----------
  pdb.exec(`CREATE TABLE IF NOT EXISTS tenant_telegram (
    tenant_id INTEGER PRIMARY KEY, chat_id TEXT, chat_title TEXT NOT NULL DEFAULT '', link_code TEXT, linked_at INTEGER, digest_day TEXT NOT NULL DEFAULT ''
  )`);
  // The evening report: when (HH:MM, '' = off) and the day it was last sent.
  const ttCols = q('PRAGMA table_info(tenant_telegram)').all().map((c) => c.name);
  if (!ttCols.includes('report_time')) pdb.exec("ALTER TABLE tenant_telegram ADD COLUMN report_time TEXT NOT NULL DEFAULT '23:00'");
  if (!ttCols.includes('report_day')) pdb.exec("ALTER TABLE tenant_telegram ADD COLUMN report_day TEXT NOT NULL DEFAULT ''");
  const tgRow = (id) => q('SELECT * FROM tenant_telegram WHERE tenant_id = ?').get(id);
  // Several people may get one business's reports: the owner, a partner, a manager, a group. One row per chat.
  pdb.exec(`CREATE TABLE IF NOT EXISTS tenant_chats (
    tenant_id INTEGER NOT NULL, chat_id TEXT NOT NULL, chat_title TEXT NOT NULL DEFAULT '', linked_at INTEGER,
    PRIMARY KEY (tenant_id, chat_id)
  )`);
  // The single chat of earlier versions moves into the list once (the old column stays, unused, for a step back).
  if (pget('tg_chats_moved') !== '1') {
    q(`INSERT OR IGNORE INTO tenant_chats (tenant_id, chat_id, chat_title, linked_at)
      SELECT tenant_id, chat_id, chat_title, linked_at FROM tenant_telegram WHERE chat_id IS NOT NULL`).run();
    pset('tg_chats_moved', '1');
  }
  const chatsOf = (id) => q('SELECT chat_id, chat_title, linked_at FROM tenant_chats WHERE tenant_id = ? ORDER BY linked_at, chat_id').all(id);
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  // Sends to every chat of the business; one chat that fails (blocked the bot, left the group) does not stop the others.
  async function sendAll(id, text) {
    const chats = chatsOf(id);
    if (!chats.length) throw new HttpError(400, 'Avval Telegramni ulang');
    let sent = 0;
    for (const c of chats) {
      try { await leads.sendTo(c.chat_id, text); sent++; } catch (e) { console.error(`Telegram (${id} → ${c.chat_title || c.chat_id}): ${e.message}`); }
    }
    if (!sent) throw new HttpError(502, "Telegramga yuborib bo'lmadi");
    return { ok: true, sent };
  }
  function telegramFor(id) {
    return {
      status() {
        const r = tgRow(id) || {};
        const chats = chatsOf(id).map((c) => ({ id: c.chat_id, title: c.chat_title || '', linked_at: c.linked_at }));
        return { bot_ready: leads.ready(), bot: leads.botName(), linked: chats.length > 0, chats, chat_title: chats.length ? chats[0].title : '',
          link_code: r.link_code || '', report_time: r.report_time ?? '23:00' };
      },
      setReport(time) {
        const t = String(time ?? '').trim();
        if (t && !TIME_RE.test(t)) throw new HttpError(400, "Vaqt 23:00 ko'rinishida bo'lsin");
        q(`INSERT INTO tenant_telegram (tenant_id, report_time) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET report_time = excluded.report_time`).run(id, t);
        return this.status();
      },
      async report() { return sendAll(id, context(id).api.eveningText()); },
      // A one-time code: whoever opens the bot with it is added to the list. Chats already linked stay.
      link() {
        if (!leads.ready()) throw new HttpError(409, "Platforma boti hali ulanmagan — FLOWI yordamiga yozing");
        const code = `b${String(require('node:crypto').randomInt(10000000, 100000000))}`;
        q(`INSERT INTO tenant_telegram (tenant_id, link_code) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET link_code = excluded.link_code`).run(id, code);
        return { ...this.status(), url: leads.botName() ? `https://t.me/${leads.botName()}?start=${code}` : '' };
      },
      // One chat off the list, or (no chat given) all of them.
      unlink(chatId) {
        if (chatId) q('DELETE FROM tenant_chats WHERE tenant_id = ? AND chat_id = ?').run(id, String(chatId));
        else { q('DELETE FROM tenant_chats WHERE tenant_id = ?').run(id); q('UPDATE tenant_telegram SET link_code = NULL WHERE tenant_id = ?').run(id); }
        return this.status();
      },
      async test() { return sendAll(id, '✅ FLOWI: sinov xabari. Kunlik hisobot shu yerga keladi.'); },
    };
  }
  leads.onMessage((msg) => {
    const m = /^\/start(?:@\w+)?\s+(b\d{8})\s*$/.exec(msg.text.trim());
    if (!m) return null;
    const r = q('SELECT * FROM tenant_telegram WHERE link_code = ?').get(m[1]);
    if (!r) return "Bu kod eskirgan. Dasturda Sozlamalar → Telegram bo'limidan yangisini oling.";
    const title = msg.chat.title || [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(' ') || '';
    q(`INSERT INTO tenant_chats (tenant_id, chat_id, chat_title, linked_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(tenant_id, chat_id) DO UPDATE SET chat_title = excluded.chat_title`).run(r.tenant_id, String(msg.chat.id), title, now());
    q('UPDATE tenant_telegram SET link_code = NULL WHERE tenant_id = ?').run(r.tenant_id);
    const ctx = context(r.tenant_id);
    if (ctx) ctx.hub.publish('settings');
    return `✅ Ulandi: ${ctx ? ctx.api.settings().name : ''}. Har kuni kechqurun kunlik hisobot (savdo, xarajat, foyda) shu yerga keladi; to'lov kuni kelgan xarajatlar va ishlar haqida ertalab eslatma ham keladi.`;
  });
  let tgBusy = false;
  async function remindTick({ forceMorning = false } = {}) {
    if (tgBusy || !leads.ready()) return;
    tgBusy = true;
    try {
      const day = (() => { const d = new Date(now()); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; })();
      const morning = forceMorning || new Date(now()).getHours() >= 8;
      const ids = q("SELECT DISTINCT c.tenant_id AS id FROM tenant_chats c JOIN tenants n ON n.id = c.tenant_id WHERE n.status = 'active'").all().map((x) => x.id);
      for (const id of ids) {
        const ctx = context(id);
        if (!ctx) continue;
        q('INSERT OR IGNORE INTO tenant_telegram (tenant_id) VALUES (?)').run(id);
        const r = tgRow(id);
        const send = (text) => sendAll(id, text).catch((e) => console.error(`Telegram eslatma (${ctx.row.code}): ${e.message}`));
        try {
          if (morning && r.digest_day !== day) {
            q('UPDATE tenant_telegram SET digest_day = ? WHERE tenant_id = ?').run(day, id);
            // A choyxona gets a morning message only when something is due (a door shop: its list of tasks every day).
            const text = ctx.api.morningText();
            if (text) await send(text);
          }
          const d = new Date(now());
          const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          if (r.report_time && hm >= r.report_time && r.report_day !== day) {
            q('UPDATE tenant_telegram SET report_day = ? WHERE tenant_id = ?').run(day, id);
            await send(ctx.api.eveningText());
          }
          for (const text of ctx.api.soonTexts()) await send(text);
        } catch (e) { console.error(`Telegram eslatma (${ctx.row.code}): ${e.message}`); }
      }
    } finally { tgBusy = false; }
  }
  // ---------- A new FLOWI for Windows → the platform owner's Telegram, as the installer file itself ----------
  // GitHub builds the program (desktop/); its latest release holds the small web installer FLOWI-Setup-<v>.exe.
  // Telegram takes files from bots up to 50 MB: a bigger one goes as a link.
  const releasesApi = () => process.env.FLOWI_RELEASES_API || 'https://api.github.com/repos/albusdumbledooree/albusdumbledooree/releases/latest';
  let desktopBusy = false;
  async function desktopTick({ force = false } = {}) {
    const chat = leads.ownerChat();
    if (desktopBusy || !chat || !leads.ready()) return null;
    desktopBusy = true;
    try {
      const res = await fetch(releasesApi(), { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FLOWI' }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return null;
      const r = await res.json();
      if (!/^desktop-v/.test(r.tag_name || '')) return null;
      if (!force && pget('desktop_sent') === r.tag_name) return null;
      const a = (r.assets || []).find((x) => /^FLOWI-Setup-.*\.exe$/i.test(x.name));
      if (!a) return null;
      const version = r.tag_name.replace(/^desktop-v/, '');
      const caption = `🖥 <b>FLOWI Windows ${version}</b>\nYangi versiya. Mijozga shu faylni yuboring — ikki marta bosilsa o'rnatiladi (internet kerak).\nO'rnatilgan dasturlar o'zi yangilanadi.`;
      if (a.size > 49 * 1024 * 1024) {
        await leads.sendTo(chat, `${caption}\n\nFayl ${Math.round(a.size / 1048576)} MB — Telegram'ga sig'maydi, havola: ${a.browser_download_url}`);
      } else {
        const f = await fetch(a.browser_download_url, { headers: { 'User-Agent': 'FLOWI' }, signal: AbortSignal.timeout(120_000) });
        if (!f.ok) return null;
        await leads.sendFile(chat, a.name, Buffer.from(await f.arrayBuffer()), caption);
      }
      pset('desktop_sent', r.tag_name);
      return { sent: r.tag_name, version };
    } catch (e) {
      console.error(`FLOWI Windows → Telegram: ${e.message}`);
      return null;
    } finally { desktopBusy = false; }
  }
  const remindTimer = setInterval(() => { remindTick().catch(() => {}); tgBackupTick().catch(() => {}); }, 5 * 60 * 1000);
  const desktopTimer = setInterval(() => { desktopTick().catch(() => {}); }, 60 * 60 * 1000);
  const desktopFirst = setTimeout(() => { desktopTick().catch(() => {}); }, 2 * 60 * 1000);
  desktopTimer.unref(); desktopFirst.unref();
  remindTimer.unref();

  // ---------- Every night a copy of every business goes to the platform owner's Telegram ----------
  // The daily copies on the server are lost with the server's disk; a copy in Telegram is not.
  function backupState() { try { return JSON.parse(pget('tg_backup', '{}')) || {}; } catch { return {}; } }
  let backupBusy = false;
  async function sendBackups() {
    const chat = leads.ownerChat();
    if (!chat) throw new HttpError(400, 'Avval botni chatga ulang');
    if (backupBusy) throw new HttpError(409, 'Zaxira hozir yuborilmoqda');
    backupBusy = true;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flowi-tg-'));
    const sent = []; const failed = [];
    try {
      const stamp = stampNow();
      const files = [['platform', path.join(dataDir, 'platform.db')], ...q('SELECT code, file FROM tenants ORDER BY id').all().map((t) => [t.code, path.join(dataDir, t.file)])];
      for (const [code, file] of files) {
        if (!fs.existsSync(file)) continue;
        try {
          const out = snapshot(file, path.join(tmp, `${code}.db`));
          const gz = zlib.gzipSync(fs.readFileSync(out), { level: 9 });
          if (gz.length > 49 * 1024 * 1024) { failed.push(`${code}: juda katta (${Math.round(gz.length / 1048576)} MB)`); continue; }
          await leads.sendFile(chat, `flowi-${code}-${stamp}.db.gz`, gz, `💾 <b>${code}</b> · ${stamp.slice(0, 16).replace(/-(\d\d)-(\d\d)$/, ' $1:$2')} · ${Math.max(1, Math.round(gz.length / 1024))} KB`);
          sent.push(code);
        } catch (e) { failed.push(`${code}: ${e.message}`); }
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); backupBusy = false; }
    const st = { ...backupState(), at: now(), sent: sent.length, error: failed.join('; ') };
    pset('tg_backup', JSON.stringify(st));
    if (failed.length) console.error('Telegram zaxira:', st.error);
    return { sent: sent.length, failed };
  }
  // Once a night, after 3:00 (quiet hours), unless switched off.
  async function tgBackupTick() {
    const st = backupState();
    if (st.off || !leads.ownerChat() || backupBusy) return;
    const d = new Date(now());
    const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (d.getHours() < 3 || st.day === day) return;
    pset('tg_backup', JSON.stringify({ ...st, day }));
    await sendBackups();
  }
  function backupStatus() { const st = backupState(); return { on: !st.off, at: st.at || null, sent: st.sent || 0, error: st.error || '' }; }
  function setBackup({ body }) { pset('tg_backup', JSON.stringify({ ...backupState(), off: !body.on })); return backupStatus(); }

  function supportInput(v) {
    const o = v && typeof v === 'object' ? v : {};
    return { text: str(o.text, 'Yordam matni', { max: 120 }), link: str(o.link, 'Yordam havolasi', { max: 200 }) };
  }
  // "@flowi_support" → https://t.me/flowi_support; a phone number → tel:.
  function supportLink(text, link) {
    if (link) return /^(https?:|tel:|mailto:)/i.test(link) ? link : null;
    const m = /@([A-Za-z0-9_]{4,40})/.exec(text || '');
    if (m) return `https://t.me/${m[1]}`;
    const ph = /\+?\d[\d\s-]{7,}\d/.exec(text || '');
    return ph ? `tel:${ph[0].replace(/[\s-]/g, '')}` : null;
  }
  function supportFor(row) {
    let own = {};
    try { own = row && row.support ? JSON.parse(row.support) : {}; } catch { own = {}; }
    const text = own.text || pget('support_text');
    const link = own.text ? own.link : pget('support_link');
    return text ? { text, link: supportLink(text, link) } : null;
  }

  // ---------- Plans ----------
  function readJson(key, def) {
    try { const v = JSON.parse(pget(key, '')); return v && typeof v === 'object' ? v : def; } catch { return def; }
  }
  function getPlans() {
    const saved = readJson('plans', {});
    const known = readJson('plan_modules_known', null) || FIRST_MODULES;
    return Object.fromEntries(PLAN_KEYS.map((k) => {
      const p = { ...DEFAULT_PLANS[k], ...(saved[k] || {}) };
      if (saved[k]) {
        const applied = readJson('plan_additions', []);
        const added = DEFAULT_PLANS[k].modules.filter((m) => !known.includes(m) && !p.modules.includes(m));
        for (const [plan, m] of PLAN_ADDITIONS) if (plan === k && !applied.includes(`${plan}:${m}`) && !p.modules.includes(m) && !added.includes(m)) added.push(m);
        if (added.length) p.modules = [...p.modules, ...added];
      }
      return [k, p];
    }));
  }
  function getTerms() { return { ...DEFAULT_TERMS, ...readJson('plan_terms', {}) }; }

  // What a business has right now: its plan, what it pays, and whether its term has run out.
  function planFor(row) {
    const plans = getPlans();
    const terms = getTerms();
    const key = plans[row.plan] ? row.plan : 'biznes';
    const p = plans[key];
    const base = row.monthly_fee > 0 ? row.monthly_fee : row.is_branch ? terms.branch_price : p.price;
    const discount = discountFor(row, base);
    const fee = base - (discount ? discount.off : 0);
    const graceUntil = row.paid_until ? row.paid_until + terms.grace_days * DAY : null;
    return { key, name: p.name, price: p.price, base_fee: base, fee, discount, max_staff: p.max_staff, devices_per_staff: p.devices_per_staff, modules: p.modules, is_branch: !!row.is_branch,
      paid_until: row.paid_until, grace_until: graceUntil, read_only: !!(graceUntil && now() > graceUntil) };
  }

  // The discount in force now (null when none, or when its term is over: the price goes back by itself).
  function discountFor(row, base) {
    if (!row.discount_type || !(row.discount_value > 0)) return null;
    if (row.discount_until && now() > row.discount_until) return null;
    const off = row.discount_type === 'percent' ? Math.round(base * Math.min(100, row.discount_value) / 100) : Math.min(base, row.discount_value);
    return { type: row.discount_type, value: row.discount_value, until: row.discount_until || null, note: row.discount_note || '', off };
  }
  function discountInput(v) {
    if (!v || !v.type) return { discount_type: '', discount_value: 0, discount_until: null, discount_note: '' };
    if (!['percent', 'amount'].includes(v.type)) throw new HttpError(400, "Chegirma turi noto'g'ri");
    const value = int(v.value, 'Chegirma', { required: true, min: 1, max: v.type === 'percent' ? 100 : 1e10 });
    const until = v.until ? int(v.until, 'Chegirma muddati', { min: 1, max: 8.64e15 }) : null;
    return { discount_type: v.type, discount_value: value, discount_until: until, discount_note: str(v.note, 'Chegirma sababi', { max: 120 }) };
  }
  function saveDiscount(id, v) {
    const d = discountInput(v);
    q('UPDATE tenants SET discount_type = ?, discount_value = ?, discount_until = ?, discount_note = ? WHERE id = ?')
      .run(d.discount_type, d.discount_value, d.discount_until, d.discount_note, id);
  }

  function planInput(key, v) {
    const o = v && typeof v === 'object' ? v : {};
    const mods = Array.isArray(o.modules) ? o.modules : DEFAULT_PLANS[key].modules;
    const bad = mods.find((m) => !MODULES[m]);
    if (bad) throw new HttpError(400, `Noma'lum bo'lim: ${bad}`);
    return {
      name: str(o.name, 'Tarif nomi', { required: true, max: 30 }),
      price: int(o.price, 'Tarif narxi', { required: true, min: 0, max: 1e10 }),
      max_staff: int(o.max_staff, 'Xodimlar soni', { required: true, min: 0, max: 100000 }),
      devices_per_staff: int(o.devices_per_staff, 'Bir ofitsant nechta qurilmada', { required: true, min: 0, max: 100 }),
      modules: [...new Set(mods)],
    };
  }
  function savePlans({ body }) {
    const plans = Object.fromEntries(PLAN_KEYS.map((k) => [k, planInput(k, (body.plans || {})[k])]));
    const t = body.terms || {};
    const terms = {
      branch_price: int(t.branch_price, 'Filial narxi', { required: true, min: 0, max: 1e10 }),
      yearly_months: int(t.yearly_months, 'Yillik to\'lov (oy)', { required: true, min: 1, max: 12 }),
      grace_days: int(t.grace_days, 'Kechikish kunlari', { required: true, min: 0, max: 60 }),
      trial_days: int(t.trial_days, 'Sinov kunlari', { required: true, min: 0, max: 365 }),
    };
    pset('plans', JSON.stringify(plans));
    pset('plan_modules_known', JSON.stringify(Object.keys(MODULES)));
    pset('plan_additions', JSON.stringify(PLAN_ADDITIONS.map(([k, m]) => `${k}:${m}`)));
    pset('plan_terms', JSON.stringify(terms));
    for (const c of contexts.values()) c.hub.publish('settings');
    return { plans: getPlans(), terms: getTerms() };
  }
  // A branch hangs under one main business; a main business with branches cannot itself become a branch.
  function parentInput(t, v) {
    if (!v) return null;
    const p = tenantRow(int(v, 'Asosiy biznes', { min: 1 }));
    if (!p || p.id === t.id) throw new HttpError(400, "Asosiy biznes noto'g'ri");
    if (p.parent_id) throw new HttpError(400, "Filialga filial bog'lab bo'lmaydi — asosiy biznesni tanlang");
    if (q('SELECT 1 FROM tenants WHERE parent_id = ?').get(t.id)) throw new HttpError(400, "Bu biznesning o'z filiallari bor — u filial bo'la olmaydi");
    return p.id;
  }
  function planKeyInput(v) {
    if (!PLAN_KEYS.includes(v)) throw new HttpError(400, "Tarif noto'g'ri");
    return v;
  }

  // What the public front page may show: plans with prices and sections, terms, the contact. Nothing about businesses.
  function publicInfo() {
    const plans = getPlans();
    return {
      plans: PLAN_KEYS.map((k) => ({ key: k, name: plans[k].name, price: plans[k].price, max_staff: plans[k].max_staff,
        devices_per_staff: plans[k].devices_per_staff, modules: plans[k].modules.map((m) => MODULES[m]).filter(Boolean) })),
      terms: getTerms(),
      support: supportFor(null),
    };
  }

  function getPlatformSettings() {
    return { support_text: pget('support_text'), support_link: pget('support_link'), google_verify: pget('google_verify'), yandex_verify: pget('yandex_verify') };
  }
  // The codes Google Search Console and Yandex Webmaster give to prove the site is ours.
  function seoVerify() { return { google: pget('google_verify'), yandex: pget('yandex_verify') }; }
  function savePlatformSettings({ body }) {
    const g = body.google_verify === undefined ? undefined : verifyInput(body.google_verify);
    const y = body.yandex_verify === undefined ? undefined : verifyInput(body.yandex_verify);
    if (g === null) throw new HttpError(400, "Google kodi noto'g'ri: Search Console bergan <meta …> qatorini yoki faqat kodni qo'ying");
    if (y === null) throw new HttpError(400, "Yandex kodi noto'g'ri: Yandex Webmaster bergan <meta …> qatorini yoki faqat kodni qo'ying");
    if (g !== undefined) pset('google_verify', g);
    if (y !== undefined) pset('yandex_verify', y);
    if (body.support_text === undefined && body.support_link === undefined) return getPlatformSettings();
    const s = supportInput({ text: body.support_text, link: body.support_link });
    pset('support_text', s.text);
    pset('support_link', s.link);
    for (const c of contexts.values()) c.hub.publish('settings');
    return getPlatformSettings();
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
        // A waiter account opened on another device while still in use elsewhere: likely shared by several people.
        shared: db.prepare(`SELECT u.name, COUNT(*) c FROM audit a JOIN users u ON u.id = a.user_id
          WHERE a.action = 'session_kicked' AND a.created_at >= ? GROUP BY a.user_id HAVING c >= 3 ORDER BY c DESC LIMIT 3`).all(now() - 7 * DAY),
        owners: db.prepare("SELECT username FROM users WHERE role = 'owner' AND active = 1 ORDER BY id").all().map((u) => u.username),
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  function parseSupport(t) {
    try { return t.support ? JSON.parse(t.support) : { text: '', link: '' }; } catch { return { text: '', link: '' }; }
  }

  function typeInput(v) {
    if (!BUSINESS_TYPES[v]) throw new HttpError(400, "Biznes turi noto'g'ri");
    return v;
  }
  // Sensible defaults per business type: shops have no kitchen and no reservations.
  function typeDefaults(type) {
    if (SHOP_TYPES.includes(type)) return { kitchen_mode: 'off', disabled: ['reservations'] };
    if (type === 'fastfood') return { kitchen_mode: 'notify', disabled: ['reservations'] };
    return { kitchen_mode: 'full', disabled: [] };
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

  function kitchenModeInput(v) {
    if (!['off', 'notify', 'full'].includes(v)) throw new HttpError(400, "Oshxona rejimi noto'g'ri");
    return v;
  }

  function tenantTg(id) {
    const t = tenantRow(id);
    if (!t) throw new HttpError(404, 'Choyxona topilmadi');
    return telegramFor(t.id);
  }
  function listTenants() {
    const tg = new Map();
    for (const c of q('SELECT tenant_id, chat_title FROM tenant_chats ORDER BY linked_at').all()) {
      if (!tg.has(c.tenant_id)) tg.set(c.tenant_id, []);
      tg.get(c.tenant_id).push(c.chat_title || 'Telegram');
    }
    const times = new Map(q('SELECT tenant_id, report_time FROM tenant_telegram').all().map((r) => [r.tenant_id, r.report_time]));
    return q('SELECT * FROM tenants ORDER BY id DESC').all().map((t) => ({ ...t, disabled_modules: parseModules(t), support: parseSupport(t), plan_info: planFor(t),
      telegram: { chats: tg.get(t.id) || [], report_time: times.has(t.id) ? times.get(t.id) : '23:00' }, ...stats(t) }));
  }

  function createTenant({ body }) {
    const name = str(body.name, 'Choyxona nomi', { required: true, max: 80 });
    const code = str(body.code, 'Kod', { required: true, max: 31 }).toLowerCase();
    if (!CODE_RE.test(code)) throw new HttpError(400, "Kod faqat lotin harflari, raqam va '-' dan iborat bo'lsin (masalan: navruz)");
    if (q('SELECT 1 FROM tenants WHERE code = ?').get(code)) throw new HttpError(409, 'Bu kod band');
    if (body.discount) discountInput(body.discount); // checked before anything is created
    const owner = {
      name: str(body.owner_name, 'Boshliq ismi', { required: true, max: 80 }),
      username: str(body.owner_username, 'Boshliq logini', { required: true, max: 40 }),
      password: str(body.owner_password, 'Boshliq paroli', { required: true }),
    };
    if (owner.password.length < 6) throw new HttpError(400, "Parol kamida 6 ta belgi bo'lsin");
    const type = body.business_type !== undefined ? typeInput(body.business_type) : 'choyxona';
    const defs = typeDefaults(type);
    const file = `tenants/${code}.db`;
    if (fs.existsSync(path.join(dataDir, file))) throw new HttpError(409, 'Bu kod uchun fayl allaqachon bor');
    const disabled = body.disabled_modules !== undefined ? modulesInput(body.disabled_modules) : JSON.stringify(defs.disabled);
    const kitchenMode = body.kitchen_mode !== undefined ? kitchenModeInput(body.kitchen_mode) : defs.kitchen_mode;
    const support = JSON.stringify(supportInput(body.support));
    const plan = body.plan !== undefined ? planKeyInput(body.plan) : 'biznes';
    open(path.join(dataDir, file), { name, owner, sample: !!body.sample, type }).close();
    const id = q(`INSERT INTO tenants (code, name, contact_name, phone, file, paid_until, monthly_fee, notes, created_at, disabled_modules, kitchen_mode, business_type, support,
      plan, is_branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      code, name, owner.name, str(body.phone, 'Telefon', { max: 30 }), file,
      body.paid_until ? int(body.paid_until, "To'lov muddati", { min: 1, max: 8.64e15 }) : null,
      int(body.monthly_fee, 'Oylik narx'), str(body.notes, 'Izoh', { max: 500 }), now(), disabled, kitchenMode, type, support,
      plan, body.is_branch ? 1 : 0
    ).lastInsertRowid;
    if (body.discount) saveDiscount(id, body.discount);
    return tenantRow(id);
  }

  function updateTenant({ params, body }) {
    const t = tenantRow(params.id);
    if (!t) throw new HttpError(404, 'Choyxona topilmadi');
    const status = body.status !== undefined ? str(body.status, 'Holat') : t.status;
    const parentId = body.parent_id === undefined ? undefined : parentInput(t, body.parent_id);
    if (!['active', 'blocked'].includes(status)) throw new HttpError(400, "Holat noto'g'ri");
    q(`UPDATE tenants SET name = ?, contact_name = ?, phone = ?, status = ?, paid_until = ?, monthly_fee = ?, notes = ?, disabled_modules = ?, kitchen_mode = ?,
      business_type = ?, support = ?, plan = ?, is_branch = ?, parent_id = ? WHERE id = ?`).run(
      body.name !== undefined ? str(body.name, 'Nomi', { required: true, max: 80 }) : t.name,
      body.contact_name !== undefined ? str(body.contact_name, 'Boshliq', { max: 80 }) : t.contact_name,
      body.phone !== undefined ? str(body.phone, 'Telefon', { max: 30 }) : t.phone,
      status,
      body.paid_until !== undefined ? (body.paid_until ? int(body.paid_until, "To'lov muddati", { min: 1, max: 8.64e15 }) : null) : t.paid_until,
      body.monthly_fee !== undefined ? int(body.monthly_fee, 'Oylik narx') : t.monthly_fee,
      body.notes !== undefined ? str(body.notes, 'Izoh', { max: 500 }) : t.notes,
      body.disabled_modules !== undefined ? modulesInput(body.disabled_modules) : t.disabled_modules,
      body.kitchen_mode !== undefined ? kitchenModeInput(body.kitchen_mode) : t.kitchen_mode,
      body.business_type !== undefined ? typeInput(body.business_type) : t.business_type,
      body.support !== undefined ? JSON.stringify(supportInput(body.support)) : t.support,
      body.plan !== undefined ? planKeyInput(body.plan) : t.plan,
      parentId !== undefined ? (parentId ? 1 : body.is_branch ? 1 : 0) : body.is_branch !== undefined ? (body.is_branch ? 1 : 0) : t.is_branch,
      parentId !== undefined ? parentId : t.parent_id,
      t.id
    );
    if (body.discount !== undefined) saveDiscount(t.id, body.discount);
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

  // The site owner opens a business exactly as its boss sees it (written to that business's history).
  function impersonate({ params, admin }) {
    const ctx = context(params.id);
    if (!ctx) throw new HttpError(404, 'Choyxona topilmadi');
    const owner = ctx.db.prepare("SELECT * FROM users WHERE role = 'owner' AND active = 1 ORDER BY id LIMIT 1").get();
    if (!owner) throw new HttpError(404, "Faol boshliq yo'q. Avval boshliq parolini tiklang");
    const r = ctx.api.startSession(owner, 'platform_login');
    ctx.api.audit(owner, 'platform_note', `Platforma: ${admin.name}`);
    return { token: r.token, code: ctx.row.code };
  }

  function backupsOf({ params }) {
    const t = tenantRow(params.id);
    if (!t) throw new HttpError(404, 'Choyxona topilmadi');
    return listTenantBackups(dataDir, t.file).map(({ stamp, kind, size }) => ({ stamp, kind, size }));
  }

  /*
   * Replaces a business's database with a backup (a file uploaded by its boss, or a dated server copy).
   * The current file is saved first under backups/pre-restore, so a restore can itself be undone.
   * Devices and sessions of today stay connected.
   */
  function restoreTenant(id, srcFile) {
    const ctx = context(id);
    if (!ctx) throw new HttpError(404, 'Choyxona topilmadi');
    let check;
    try {
      check = new DatabaseSync(srcFile, { readOnly: true });
      const tables = check.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
      for (const tbl of ['users', 'orders', 'order_items', 'settings', 'dishes']) {
        if (!tables.includes(tbl)) throw new HttpError(400, "Bu fayl FLOWI zaxirasi emas");
      }
      if (!check.prepare("SELECT 1 FROM users WHERE role = 'owner' AND active = 1").get()) throw new HttpError(400, 'Zaxirada faol boshliq yo\'q');
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, "Fayl o'qilmadi. Bu FLOWI zaxira fayli (.db) emas");
    } finally {
      if (check) check.close();
    }
    const keep = path.join(dataDir, 'backups', 'pre-restore', stampNow(), ctx.row.file);
    snapshot(ctx.file, keep);
    const devices = ctx.db.prepare('SELECT * FROM devices').all();
    const sessions = ctx.db.prepare('SELECT * FROM sessions').all();
    ctx.hub.disconnectUser();
    ctx.db.close();
    contexts.delete(id);
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(ctx.file + ext, { force: true });
    fs.copyFileSync(srcFile, ctx.file);
    const fresh = context(id);
    const insDev = fresh.db.prepare('INSERT OR IGNORE INTO devices (token, name, created_by, created_at, last_seen, backup) VALUES (?, ?, NULL, ?, ?, ?)');
    for (const d of devices) insDev.run(d.token, d.name, d.created_at, d.last_seen, d.backup || 0);
    const insSes = fresh.db.prepare('INSERT OR IGNORE INTO sessions (token, user_id, created_at, via) SELECT ?, id, ?, ? FROM users WHERE id = ? AND active = 1');
    for (const x of sessions) insSes.run(x.token, x.created_at, x.via || '', x.user_id);
    fresh.api.audit(null, 'backup_restore', path.basename(keep));
    return { ok: true, saved_as: path.relative(dataDir, keep) };
  }

  /*
   * A business taken off the platform for good (it stopped working with us, a test business).
   * Asked twice: its code typed by hand and the platform owner's own password. A last copy of its file stays
   * on the server (data/backups/deleted/) and goes to the owner's Telegram — nothing is lost by a wrong click.
   */
  function deleteTenant({ admin, params, body }) {
    const t = tenantRow(params.id);
    if (!t) throw new HttpError(404, 'Biznes topilmadi');
    if (String(body.code || '').trim().toLowerCase() !== t.code) throw new HttpError(400, "Tasdiqlash uchun biznes kodini to'g'ri yozing");
    if (!verifyPassword(String(body.password || ''), admin.pass_hash)) throw new HttpError(403, "Parol noto'g'ri");
    if (q('SELECT 1 FROM tenants WHERE parent_id = ?').get(t.id)) throw new HttpError(409, "Bu biznesning filiallari bor. Avval filiallarni o'chiring");
    const file = path.join(dataDir, t.file);
    const keep = path.join(dataDir, 'backups', 'deleted', `${stampNow()}-${t.code}`, path.basename(t.file));
    if (fs.existsSync(file)) snapshot(file, keep);
    const ctx = contexts.get(t.id);
    if (ctx) { ctx.hub.disconnectUser(); ctx.db.close(); contexts.delete(t.id); }
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(file + ext, { force: true });
    q('DELETE FROM tenant_telegram WHERE tenant_id = ?').run(t.id);
    q('DELETE FROM tenant_chats WHERE tenant_id = ?').run(t.id);
    try { q('UPDATE leads SET tenant_id = NULL WHERE tenant_id = ?').run(t.id); } catch { /* no leads table yet */ }
    q('DELETE FROM tenants WHERE id = ?').run(t.id);
    console.log(`Biznes o'chirildi: ${t.code} (${t.name}) — nusxa: ${path.relative(dataDir, keep)}`);
    // The last copy also to the platform owner's Telegram, when the bot is linked.
    const chat = leads.ownerChat();
    if (chat && fs.existsSync(keep)) {
      leads.sendFile(chat, `flowi-${t.code}-ochirilgan-${stampNow()}.db.gz`, zlib.gzipSync(fs.readFileSync(keep), { level: 9 }),
        `🗑 <b>${t.code}</b> (${t.name}) platformadan o'chirildi. Bu — uning oxirgi nusxasi.`).catch((e) => console.error('Telegram:', e.message));
    }
    return { ok: true, saved_as: path.relative(dataDir, keep) };
  }

  function restoreFromServer({ params, body }) {
    const t = tenantRow(params.id);
    if (!t) throw new HttpError(404, 'Choyxona topilmadi');
    const b = listTenantBackups(dataDir, t.file).find((x) => x.stamp === body.stamp && x.kind === (body.kind || 'daily'));
    if (!b) throw new HttpError(404, 'Zaxira topilmadi');
    // Copy first: the pre-restore snapshot of this very restore must not overwrite the source.
    const tmp = path.join(dataDir, `restore-${now()}.db`);
    fs.copyFileSync(b.file, tmp);
    try { return restoreTenant(t.id, tmp); } finally { fs.rmSync(tmp, { force: true }); }
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
    ['POST', '/api/platform/tenants/:id/impersonate', true, impersonate],
    ['GET', '/api/platform/tenants/:id/backups', true, backupsOf],
    ['POST', '/api/platform/tenants/:id/restore', true, restoreFromServer],
    ['POST', '/api/platform/tenants/:id/delete', true, deleteTenant],
    ['GET', '/api/platform/settings', true, getPlatformSettings],
    ['PUT', '/api/platform/settings', true, savePlatformSettings],
    ['GET', '/api/platform/types', true, () => BUSINESS_TYPES],
    ['GET', '/api/platform/changelog', true, changelog],
    // The latest FLOWI for Windows to the owner's Telegram now (again, even if it went before).
    ['POST', '/api/platform/desktop/send', true, async () => {
      if (!leads.ownerChat()) throw new HttpError(400, 'Avval botni chatga ulang');
      const r = await desktopTick({ force: true });
      if (!r) throw new HttpError(502, "Dasturni olib bo'lmadi — keyinroq urinib ko'ring");
      return r;
    }],
    // A business's Telegram from the platform: who gets its reports, a link to send to its owner, the report time.
    ['GET', '/api/platform/tenants/:id/telegram', true, ({ params }) => tenantTg(params.id).status()],
    ['POST', '/api/platform/tenants/:id/telegram/link', true, ({ params }) => tenantTg(params.id).link()],
    ['PUT', '/api/platform/tenants/:id/telegram', true, ({ params, body }) => tenantTg(params.id).setReport(body.time)],
    ['POST', '/api/platform/tenants/:id/telegram/report', true, ({ params }) => tenantTg(params.id).report()],
    ['DELETE', '/api/platform/tenants/:id/telegram', true, ({ params, query }) => tenantTg(params.id).unlink(query.chat)],
    ['GET', '/api/platform/plans', true, () => ({ plans: getPlans(), terms: getTerms() })],
    ['PUT', '/api/platform/plans', true, savePlans],
    ['GET', '/api/platform/leads', true, leads.list],
    ['PUT', '/api/platform/leads/:id', true, leads.update],
    ['GET', '/api/platform/telegram', true, () => ({ ...leads.botStatus(), backup: backupStatus() })],
    ['PUT', '/api/platform/telegram/backup', true, setBackup],
    ['POST', '/api/platform/telegram/backup', true, () => sendBackups()],
    ['PUT', '/api/platform/telegram', true, leads.setToken],
    ['POST', '/api/platform/telegram/relink', true, leads.relink],
    ['POST', '/api/platform/telegram/test', true, leads.test],
    ['DELETE', '/api/platform/telegram', true, leads.unlink],
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
    leads.stop();
    clearInterval(remindTimer);
    clearInterval(desktopTimer);
    clearTimeout(desktopFirst);
    for (const c of contexts.values()) c.db.close();
    pdb.close();
  }

  return { handle, byCode, byToken, byGuestKey, remindTick, tgBackupTick, sendBackups, assertActive, close, supportFor, restoreTenant, planFor, publicInfo, seoVerify, desktopTick, submitLead: leads.submit };
}

module.exports = { createPlatform };
