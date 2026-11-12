'use strict';
/*
 * FLOWI Akademiya: short lessons for waiters (modules → lessons → cards and three questions each) and one final test.
 * The lessons live on the platform (the owner can edit them); every business sees the same ones.
 * A business on a plan without the "academy" section gets the free modules only; the test needs every lesson read.
 * The same question bank is behind the open test on the site (flowi.uz/test), for anyone.
 */
const crypto = require('node:crypto');
const { HttpError } = require('./util');
const DEFAULT = require('./academy-content');

const TEST_SIZE = 20;
const PASS_PCT = 70;
const RETRY_MS = 12 * 3600 * 1000; // a failed test can be taken again after 12 hours
const TEST_TTL = 2 * 3600 * 1000; // an unfinished test is forgotten after 2 hours
const ROLE_UZ = { owner: 'Boshliq', admin: 'Admin', cashier: 'Kassir', waiter: 'Ofitsant', chef: 'Oshpaz' };
const pctOf = (r) => (r.total ? Math.round((r.score / r.total) * 100) : 0);
// Certificate numbers: FA- (in a business) or FS- (on the site) and 8 letters/digits easy to read aloud.
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = (prefix) => prefix + Array.from(crypto.randomBytes(8), (b) => ALPHA[b % ALPHA.length]).join('');
// +998 90 123 45 67 → +998901234567 (also 901234567, 998901234567); '' when it is not an Uzbek number.
function phoneUz(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 9) return `+998${d}`;
  if (d.length === 12 && d.startsWith('998')) return `+${d}`;
  return '';
}

// ---------- The lessons (checked and trimmed when the platform owner saves them) ----------
const s = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

function cleanContent(c) {
  if (!c || !Array.isArray(c.modules)) throw new HttpError(400, "Darslar noto'g'ri");
  const ids = new Set();
  const uid = (v, fallback) => {
    let id = ID_RE.test(String(v || '')) ? String(v) : fallback;
    while (ids.has(id)) id = `${id}-x`;
    ids.add(id);
    return id;
  };
  const modules = c.modules.slice(0, 30).map((m, mi) => {
    const id = uid(m.id, `m${mi + 1}`);
    return {
      id, icon: s(m.icon, 8) || '📘', color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#eef2f7',
      title: s(m.title, 80) || `Modul ${mi + 1}`, free: !!m.free, site: m.site !== false,
      lessons: (Array.isArray(m.lessons) ? m.lessons : []).slice(0, 20).map((l, li) => ({
        id: uid(l.id, `${id}-${li + 1}`),
        title: s(l.title, 80) || `Dars ${li + 1}`,
        cards: (Array.isArray(l.cards) ? l.cards : []).slice(0, 12).map((k) => ({ e: s(k.e, 8), h: s(k.h, 120), t: s(k.t, 600), ok: s(k.ok, 160), no: s(k.no, 160) })).filter((k) => k.h || k.t),
        quiz: (Array.isArray(l.quiz) ? l.quiz : []).slice(0, 10).map((x) => {
          const a = (Array.isArray(x.a) ? x.a : []).map((v) => s(v, 200)).filter(Boolean).slice(0, 6);
          return { q: s(x.q, 300), a, c: Math.min(Math.max(0, Number(x.c) | 0), Math.max(0, a.length - 1)), why: s(x.why, 300) };
        }).filter((x) => x.q && x.a.length >= 2),
      })),
    };
  });
  return { version: Number(c.version) || 1, modules };
}

// Every question of every lesson, with an id that stays the same while the lesson keeps its place.
function bank(content) {
  const out = [];
  for (const m of content.modules) for (const l of m.lessons) l.quiz.forEach((x, k) => out.push({ id: `${l.id}:${k}`, module: m.id, ...x }));
  return out;
}
function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
// The test as the person sees it: questions in a random order, answers shuffled, the right one not told.
// onSite: the open test on the site leaves out modules about the program itself (they mean nothing to outsiders).
function draw(content, n = TEST_SIZE, onSite = false) {
  const skip = new Set(onSite ? content.modules.filter((m) => m.site === false).map((m) => m.id) : []);
  const all = bank(content).filter((q) => !skip.has(q.module));
  // Spread over the modules: take one from each in turn, so no module is left out.
  const byMod = new Map();
  for (const q of shuffle(all)) { if (!byMod.has(q.module)) byMod.set(q.module, []); byMod.get(q.module).push(q); }
  const picked = [];
  while (picked.length < Math.min(n, all.length)) for (const list of byMod.values()) if (list.length && picked.length < n) picked.push(list.pop());
  return shuffle(picked);
}
function asked(q) { return { id: q.id, q: q.q, a: shuffle(q.a.map((text, i) => ({ i, text }))) }; }

function grade(content, qids, answers) {
  const byId = new Map(bank(content).map((q) => [q.id, q]));
  const titles = Object.fromEntries(content.modules.map((m) => [m.id, m.title]));
  const results = [];
  const miss = {};
  let score = 0;
  for (const id of qids) {
    const q = byId.get(id);
    if (!q) continue; // the lesson was changed meanwhile
    const chosen = answers && Object.prototype.hasOwnProperty.call(answers, id) ? Number(answers[id]) : -1;
    const ok = chosen === q.c;
    if (ok) score++; else miss[q.module] = (miss[q.module] || 0) + 1;
    results.push({ id, q: q.q, chosen: chosen >= 0 && q.a[chosen] !== undefined ? q.a[chosen] : '', right: q.a[q.c], ok, why: q.why, module: titles[q.module] || '' });
  }
  const total = results.length;
  const pct = total ? Math.round((score / total) * 100) : 0;
  const weak = Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => titles[m]).filter(Boolean);
  return { score, total, pct, passed: pct >= PASS_PCT, weak, results };
}

// ---------- One business: its workers' lessons and tests ----------
// register(info) → the certificate's number in the platform's register (null when there is none, e.g. in tests of this file alone).
function createAcademy(db, { content = () => DEFAULT, full = () => true, hidden = () => false, register = null } = {}) {
  const q = (sql) => db.prepare(sql);
  // Hidden for this business by the platform: every Akademiya address answers "not here" (the progress is kept).
  const open = (fn) => (args) => { if (hidden()) throw new HttpError(404, "Akademiya bu biznesda yoqilmagan"); return fn(args); };
  const now = () => Date.now();
  const openModule = (m) => full() || m.free;

  function lessonIds(c, onlyOpen) { return c.modules.filter((m) => !onlyOpen || openModule(m)).flatMap((m) => m.lessons.map((l) => l.id)); }
  function progressOf(userId) {
    return Object.fromEntries(q('SELECT lesson_id, quiz_ok, quiz_total, done_at FROM academy_lessons WHERE user_id = ?').all(userId)
      .map((r) => [r.lesson_id, { ok: r.quiz_ok, total: r.quiz_total, at: r.done_at }]));
  }
  function testsOf(userId) {
    return q('SELECT id, started_at, finished_at, score, total, passed, weak, attempt, cert_code FROM academy_tests WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 50').all(userId)
      .map((r) => ({ ...r, passed: !!r.passed, pct: pctOf(r), weak: JSON.parse(r.weak || '[]') }));
  }
  // Puts a passed test in the platform's register once and keeps its number here.
  function ensureCode(t) {
    if (t.cert_code || !register || !t.passed) return t.cert_code || '';
    const u = q('SELECT name, role, position FROM users WHERE id = ?').get(t.user_id) || {};
    const history = q('SELECT score, total, finished_at, attempt FROM academy_tests WHERE user_id = ? AND finished_at IS NOT NULL AND finished_at <= ? ORDER BY finished_at')
      .all(t.user_id, t.finished_at).map((x) => ({ pct: pctOf(x), at: x.finished_at, attempt: x.attempt }));
    const code = register({ ref_id: t.id, user_id: t.user_id, name: u.name || '', role: u.position || ROLE_UZ[u.role] || '', score: t.score, total: t.total, attempt: t.attempt, history, at: t.finished_at });
    if (code) q('UPDATE academy_tests SET cert_code = ? WHERE id = ?').run(code, t.id);
    return code || '';
  }
  // Older certificates (before the register) get their numbers when the platform looks.
  function syncCerts() { for (const t of q("SELECT * FROM academy_tests WHERE passed = 1 AND cert_code = ''").all()) ensureCode(t); }
  // Can this person start the final test now? (every lesson read, the section in the plan, not right after a failed one)
  function testState(userId, c, progress) {
    const all = lessonIds(c, false);
    const left = all.filter((id) => !progress[id]).length;
    const last = testsOf(userId)[0];
    const retryAt = last && !last.passed ? last.finished_at + RETRY_MS : 0;
    return { lessons_left: left, plan: full(), retry_at: retryAt > now() ? retryAt : 0, can: full() && left === 0 && !(retryAt > now()) && bank(c).length > 0 };
  }

  // What a worker sees: the modules (locked ones without their text), their own progress and tests.
  function home({ user }) {
    const c = content();
    const progress = progressOf(user.id);
    return {
      full: full(), pass_pct: PASS_PCT, test_size: TEST_SIZE,
      modules: c.modules.map((m) => {
        const open = openModule(m);
        return { id: m.id, icon: m.icon, color: m.color, title: m.title, free: m.free, open,
          lessons: m.lessons.map((l) => (open ? l : { id: l.id, title: l.title, cards: [], quiz: [], locked: true })) };
      }),
      progress, tests: testsOf(user.id), test: testState(user.id, c, progress),
    };
  }

  function lessonDone({ user, body }) {
    const c = content();
    const id = String(body.lesson || '');
    const m = c.modules.find((x) => x.lessons.some((l) => l.id === id));
    if (!m) throw new HttpError(404, 'Dars topilmadi');
    if (!openModule(m)) throw new HttpError(403, 'Bu modul tarifingizda yopiq');
    const l = m.lessons.find((x) => x.id === id);
    const total = l.quiz.length;
    const ok = Math.min(total, Math.max(0, Number(body.ok) | 0));
    // Read again: the better result stays.
    q(`INSERT INTO academy_lessons (user_id, lesson_id, quiz_ok, quiz_total, done_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, lesson_id) DO UPDATE SET quiz_ok = MAX(quiz_ok, excluded.quiz_ok), quiz_total = excluded.quiz_total, done_at = excluded.done_at`).run(user.id, id, ok, total, now());
    return { ok: true, progress: progressOf(user.id) };
  }

  function startTest({ user }) {
    const c = content();
    const st = testState(user.id, c, progressOf(user.id));
    if (!st.plan) throw new HttpError(403, 'Yakuniy test tarifingizda yopiq');
    if (st.lessons_left) throw new HttpError(400, `Avval hamma darslarni o'qing (yana ${st.lessons_left} ta qoldi)`);
    if (st.retry_at) throw new HttpError(400, 'Testni qayta topshirish vaqti hali kelmadi');
    q('DELETE FROM academy_tests WHERE user_id = ? AND finished_at IS NULL').run(user.id);
    const picked = draw(c);
    const r = q('INSERT INTO academy_tests (user_id, qids, started_at) VALUES (?, ?, ?)').run(user.id, JSON.stringify(picked.map((x) => x.id)), now());
    return { id: Number(r.lastInsertRowid), questions: picked.map(asked), pass_pct: PASS_PCT };
  }

  function finishTest({ user, params, body }) {
    const t = q('SELECT * FROM academy_tests WHERE id = ? AND user_id = ?').get(params.id, user.id);
    if (!t || t.finished_at) throw new HttpError(404, 'Test topilmadi');
    if (now() - t.started_at > TEST_TTL) throw new HttpError(400, "Test vaqti o'tib ketdi — qaytadan boshlang");
    const g = grade(content(), JSON.parse(t.qids), body.answers || {});
    const attempt = q('SELECT COUNT(*) c FROM academy_tests WHERE user_id = ? AND finished_at IS NOT NULL').get(user.id).c + 1;
    q('UPDATE academy_tests SET finished_at = ?, score = ?, total = ?, passed = ?, weak = ?, attempt = ? WHERE id = ?').run(now(), g.score, g.total, g.passed ? 1 : 0, JSON.stringify(g.weak), attempt, t.id);
    const code = g.passed ? ensureCode(q('SELECT * FROM academy_tests WHERE id = ?').get(t.id)) : '';
    return { id: t.id, ...g, attempt, code, retry_at: g.passed ? 0 : now() + RETRY_MS };
  }

  // The boss's view: every worker who uses the program, how far they got, their best test, the hardest topics.
  function team() {
    const c = content();
    const all = lessonIds(c, false);
    const users = q("SELECT id, name, role, position FROM users WHERE active = 1 AND app != 0 AND role != 'owner' ORDER BY name").all();
    const titleOf = {};
    for (const m of c.modules) for (const l of m.lessons) titleOf[l.id] = m.title;
    const quizMiss = {};
    const rows = users.map((u) => {
      const p = progressOf(u.id);
      const tests = testsOf(u.id);
      const best = tests.filter((x) => x.passed).sort((a, b) => b.pct - a.pct)[0] || null;
      for (const [id, v] of Object.entries(p)) if (titleOf[id] && v.total) {
        const k = titleOf[id];
        quizMiss[k] = quizMiss[k] || { ok: 0, total: 0 };
        quizMiss[k].ok += v.ok; quizMiss[k].total += v.total;
      }
      const lastAt = Math.max(0, ...Object.values(p).map((v) => v.at), ...tests.map((x) => x.finished_at));
      return { id: u.id, name: u.name, role: u.role, position: u.position, done: all.filter((id) => p[id]).length, lessons: all.length,
        best, last: tests[0] || null, last_at: lastAt || null, attempts: tests.length, history: tests.slice(0, 5).reverse().map((x) => x.pct) };
    });
    const weak = Object.entries(quizMiss).filter(([, v]) => v.total >= 3).map(([title, v]) => ({ title, pct: Math.round((v.ok / v.total) * 100) }))
      .sort((a, b) => a.pct - b.pct)[0] || null;
    return { full: full(), pass_pct: PASS_PCT, rows, weak: weak && weak.pct < 80 ? weak : null };
  }

  // A passed test's certificate: the person themselves, or the boss and admin.
  function certificate({ user, params }) {
    const t = q('SELECT t.*, u.name FROM academy_tests t JOIN users u ON u.id = t.user_id WHERE t.id = ? AND t.passed = 1').get(params.id);
    if (!t || (t.user_id !== user.id && !['owner', 'admin'].includes(user.role))) throw new HttpError(404, 'Sertifikat topilmadi');
    return { id: t.id, name: t.name, score: t.score, total: t.total, pct: pctOf(t), at: t.finished_at, attempt: t.attempt, code: ensureCode(t) };
  }

  // For the platform: how many people learn here and how the tests went.
  function brief() {
    const r = q(`SELECT (SELECT COUNT(DISTINCT user_id) FROM academy_lessons) learners, (SELECT COUNT(*) FROM academy_lessons) lessons,
      (SELECT COUNT(*) FROM academy_tests WHERE finished_at IS NOT NULL) tests, (SELECT COUNT(DISTINCT user_id) FROM academy_tests WHERE passed = 1) certified`).get();
    return { learners: r.learners, lessons: r.lessons, tests: r.tests, certified: r.certified };
  }

  return { home: open(home), lessonDone: open(lessonDone), startTest: open(startTest), finishTest: open(finishTest), team: open(team), certificate: open(certificate), brief, hidden, syncCerts };
}

// ---------- The open test on the site (no login) ----------
const PUBLIC_SCHEMA = `
CREATE TABLE IF NOT EXISTS academy_public (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT '',
  qids TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_academy_public_started ON academy_public(started_at);
-- Every certificate given (in a business or on the site), found by its number or its QR code.
CREATE TABLE IF NOT EXISTS academy_certs (
  code TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  tenant_id INTEGER,
  tenant_name TEXT NOT NULL DEFAULT '',
  ref_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  place TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  history TEXT NOT NULL DEFAULT '[]',
  issued_at INTEGER NOT NULL,
  UNIQUE (source, tenant_id, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_academy_certs_issued ON academy_certs(issued_at);
`;
const PUBLIC_PER_HOUR = 10;

function createPublicAcademy(pdb, { pget, pset, now = Date.now }) {
  pdb.exec(PUBLIC_SCHEMA);
  const q = (sql) => pdb.prepare(sql);
  const pcols = q('PRAGMA table_info(academy_public)').all().map((c) => c.name);
  if (!pcols.includes('phone')) pdb.exec("ALTER TABLE academy_public ADD COLUMN phone TEXT NOT NULL DEFAULT ''; ALTER TABLE academy_public ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1");
  // Site certificates from before the register keep their old numbers.
  q(`INSERT OR IGNORE INTO academy_certs (code, source, tenant_id, ref_id, name, place, phone, score, total, attempt, issued_at)
     SELECT code, 'site', 0, id, name, place, phone, score, total, attempt, finished_at FROM academy_public WHERE passed = 1`).run();
  let cached = null;
  function content() {
    if (cached) return cached;
    const raw = pget('academy_content', '');
    try { cached = raw ? cleanContent(JSON.parse(raw)) : cleanContent(DEFAULT); } catch { cached = cleanContent(DEFAULT); }
    return cached;
  }
  function save(body) {
    const c = cleanContent(body.content);
    if (!bank(c).length) throw new HttpError(400, "Kamida bitta savol bo'lishi kerak");
    pset('academy_content', JSON.stringify(c));
    cached = null;
    return { ok: true, content: content() };
  }
  function reset() { pset('academy_content', ''); cached = null; return { ok: true, content: content() }; }
  const custom = () => !!pget('academy_content', '');
  // The open test on the site can be switched off (certificates already given can still be checked).
  const siteOn = () => pget('academy_site', '1') !== '0';
  function setSite(on) { pset('academy_site', on ? '1' : '0'); return { ok: true, site: siteOn() }; }

  // A certificate passed in a business: put in the register once, its number given back.
  function register(info) {
    const have = q("SELECT code FROM academy_certs WHERE source = 'app' AND tenant_id = ? AND ref_id = ?").get(info.tenant_id, info.ref_id);
    if (have) return have.code;
    let code;
    do code = newCode('FA-'); while (q('SELECT 1 FROM academy_certs WHERE code = ?').get(code));
    q(`INSERT INTO academy_certs (code, source, tenant_id, tenant_name, ref_id, name, role, score, total, attempt, history, issued_at)
       VALUES (?, 'app', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(code, info.tenant_id, s(info.tenant_name, 80), info.ref_id, s(info.name, 80), s(info.role, 40),
      info.score, info.total, info.attempt || 1, JSON.stringify(info.history || []), info.at || now());
    return code;
  }

  function start({ body, ip }) {
    if (!siteOn()) throw new HttpError(403, 'Test vaqtincha yopiq');
    if (body.website) throw new HttpError(400, "So'rov noto'g'ri"); // a hidden field only robots fill in
    const name = s(body.name, 60);
    if (name.length < 2) throw new HttpError(400, 'Ismingizni yozing');
    const phone = phoneUz(body.phone);
    if (!phone) throw new HttpError(400, "Telefon raqamingizni yozing (masalan 90 123 45 67)");
    const t = now();
    const recent = q('SELECT COUNT(*) c FROM academy_public WHERE ip = ? AND started_at > ?').get(String(ip || ''), t - 3600 * 1000).c;
    if (recent >= PUBLIC_PER_HOUR) throw new HttpError(429, "Juda ko'p urinish. Bir soatdan keyin qayta urinib ko'ring");
    const picked = draw(content(), TEST_SIZE, true);
    const key = crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
    const before = q('SELECT COUNT(*) c FROM academy_public WHERE phone = ? AND finished_at IS NOT NULL').get(phone).c;
    q('INSERT INTO academy_public (code, name, place, phone, qids, ip, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(key, name, s(body.place, 80), phone, JSON.stringify(picked.map((x) => x.id)), String(ip || ''), t);
    return { key, questions: picked.map(asked), pass_pct: PASS_PCT, attempt: before + 1 };
  }
  function finish({ body }) {
    const r = q('SELECT * FROM academy_public WHERE code = ?').get(s(body.key, 12).toUpperCase());
    if (!r || r.finished_at) throw new HttpError(404, 'Test topilmadi');
    if (now() - r.started_at > TEST_TTL) throw new HttpError(400, "Test vaqti o'tib ketdi — qaytadan boshlang");
    const g = grade(content(), JSON.parse(r.qids), body.answers || {});
    const at = now();
    const attempt = r.phone ? q('SELECT COUNT(*) c FROM academy_public WHERE phone = ? AND finished_at IS NOT NULL').get(r.phone).c + 1 : 1;
    q('UPDATE academy_public SET finished_at = ?, score = ?, total = ?, passed = ?, attempt = ? WHERE id = ?').run(at, g.score, g.total, g.passed ? 1 : 0, attempt, r.id);
    let code = null;
    if (g.passed) {
      do code = newCode('FS-'); while (q('SELECT 1 FROM academy_certs WHERE code = ?').get(code));
      q(`INSERT INTO academy_certs (code, source, tenant_id, ref_id, name, place, phone, score, total, attempt, issued_at) VALUES (?, 'site', 0, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(code, r.id, r.name, r.place, r.phone, g.score, g.total, attempt, at);
    }
    return { ...g, code, attempt, name: r.name, place: r.place, at };
  }
  // The tries before (and including) a certificate: from the business, or by the same phone on the site.
  function historyOf(c) {
    if (c.source === 'app') { try { return JSON.parse(c.history || '[]'); } catch { return []; } }
    if (!c.phone) return [{ pct: pctOf(c), at: c.issued_at, attempt: c.attempt }];
    return q('SELECT score, total, finished_at, attempt FROM academy_public WHERE phone = ? AND finished_at IS NOT NULL AND finished_at <= ? ORDER BY finished_at').all(c.phone, c.issued_at)
      .map((x) => ({ pct: pctOf(x), at: x.finished_at, attempt: x.attempt }));
  }
  const hidePhone = (p) => (p ? `${p.slice(0, 6)} ** *** ${p.slice(-2)}` : '');
  // Anyone can check a certificate by its number (the QR code on it opens this).
  function cert(code) {
    const c = q('SELECT * FROM academy_certs WHERE code = ?').get(s(code, 16).toUpperCase());
    if (!c) throw new HttpError(404, 'Sertifikat topilmadi');
    return { code: c.code, source: c.source, name: c.name, role: c.role, place: c.source === 'app' ? c.tenant_name : c.place, score: c.score, total: c.total,
      pct: pctOf(c), attempt: c.attempt, at: c.issued_at, history: historyOf(c) };
  }
  // The platform's list of every certificate, newest first, with a search.
  function certs({ query = {} }) {
    const where = []; const args = [];
    if (query.source === 'app' || query.source === 'site') { where.push('source = ?'); args.push(query.source); }
    const term = s(query.q, 60);
    if (term) {
      where.push('(name LIKE ? OR code LIKE ? OR phone LIKE ? OR tenant_name LIKE ? OR place LIKE ?)');
      const like = `%${term.replace(/[%_]/g, '')}%`;
      const digits = term.replace(/\D/g, '');
      args.push(like, like, digits.length >= 4 ? `%${digits}%` : like, like, like);
    }
    const sql = `FROM academy_certs ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const total = q(`SELECT COUNT(*) c ${sql}`).get(...args).c;
    const rows = q(`SELECT * ${sql} ORDER BY issued_at DESC LIMIT 200`).all(...args).map((c) => ({ code: c.code, source: c.source, name: c.name, role: c.role,
      place: c.source === 'app' ? c.tenant_name : c.place, phone: hidePhone(c.phone), pct: pctOf(c), score: c.score, total: c.total, attempt: c.attempt, at: c.issued_at }));
    const counts = q("SELECT COUNT(*) all_, SUM(source = 'app') app, SUM(source = 'site') site FROM academy_certs").get();
    return { total, rows, counts: { all: counts.all_ || 0, app: counts.app || 0, site: counts.site || 0 } };
  }
  function stats() {
    const since = now() - 30 * 86400 * 1000;
    const all = q('SELECT COUNT(*) started, SUM(finished_at IS NOT NULL) finished, SUM(passed) passed FROM academy_public').get();
    const month = q('SELECT COUNT(*) started, SUM(finished_at IS NOT NULL) finished, SUM(passed) passed FROM academy_public WHERE started_at > ?').get(since);
    const last = q('SELECT name, place, phone, score, total, passed, attempt, finished_at FROM academy_public WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 30').all()
      .map((r) => ({ ...r, phone: hidePhone(r.phone), passed: !!r.passed }));
    const n = (v) => Number(v) || 0;
    return { all: { started: n(all.started), finished: n(all.finished), passed: n(all.passed) }, month: { started: n(month.started), finished: n(month.finished), passed: n(month.passed) }, last };
  }
  return { content, save, reset, custom, siteOn, setSite, register, start, finish, cert, certs, stats };
}


// ---------- Bellashuv (a duel): two people, the same 10 questions, the better score wins (then the faster) ----------
// One store on the platform for every kind: two workers of one business ("team"), any two workers of FLOWI ("global"),
// two people on the site ("site"), and a link sent to a friend ("link"). A player is a worker (tenant + user) or
// a site visitor (phone). Nobody has to wait for the other: each plays when they can, the result comes when both did.
const DUEL_SIZE = 10;
const DUEL_SECONDS = 20;
const DUEL_TTL = 24 * 3600 * 1000; // an unanswered duel is closed after a day
const DUEL_SCHEMA = `
CREATE TABLE IF NOT EXISTS academy_duels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL,
  qids TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  winner TEXT NOT NULL DEFAULT '',
  a_kind TEXT NOT NULL, a_tenant INTEGER, a_user INTEGER, a_phone TEXT NOT NULL DEFAULT '', a_name TEXT NOT NULL, a_place TEXT NOT NULL DEFAULT '', a_key TEXT NOT NULL,
  a_start INTEGER, a_done INTEGER, a_score INTEGER, a_ms INTEGER, a_answers TEXT,
  b_kind TEXT, b_tenant INTEGER, b_user INTEGER, b_phone TEXT NOT NULL DEFAULT '', b_name TEXT NOT NULL DEFAULT '', b_place TEXT NOT NULL DEFAULT '', b_key TEXT,
  b_start INTEGER, b_done INTEGER, b_score INTEGER, b_ms INTEGER, b_answers TEXT
);
CREATE INDEX IF NOT EXISTS idx_duels_open ON academy_duels(mode, status, created_at);
CREATE INDEX IF NOT EXISTS idx_duels_a ON academy_duels(a_tenant, a_user);
CREATE INDEX IF NOT EXISTS idx_duels_b ON academy_duels(b_tenant, b_user);
CREATE INDEX IF NOT EXISTS idx_duels_closed ON academy_duels(closed_at);
`;
const POINTS = { win: 3, draw: 1, loss: 0 };
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

function createDuels(pdb, { content, notify = () => {}, now = Date.now, globalOn = () => true, siteOn = () => true }) {
  pdb.exec(DUEL_SCHEMA);
  const q = (sql) => pdb.prepare(sql);
  const key = () => crypto.randomBytes(12).toString('hex');
  const newDuelCode = () => { let c; do c = Array.from(crypto.randomBytes(7), (b) => ALPHA[b % ALPHA.length]).join(''); while (q('SELECT 1 FROM academy_duels WHERE code = ?').get(c)); return c; };
  const sideOf = (d, p) => {
    if (p.kind === 'app') return d.a_kind === 'app' && d.a_tenant === p.tenant && d.a_user === p.user ? 'a' : d.b_kind === 'app' && d.b_tenant === p.tenant && d.b_user === p.user ? 'b' : null;
    return p.key && d.a_key === p.key ? 'a' : p.key && d.b_key === p.key ? 'b' : null;
  };
  const playerKey = (d, s) => (d[`${s}_kind`] === 'app' ? `t${d[`${s}_tenant`]}:u${d[`${s}_user`]}` : `p${d[`${s}_phone`]}`);
  const other = (s) => (s === 'a' ? 'b' : 'a');

  // Closes what nobody answered for a day (a side that played alone gets nothing either way).
  function expire() {
    q("UPDATE academy_duels SET status = 'expired', closed_at = ? WHERE status IN ('open', 'invited', 'playing') AND created_at < ?").run(now(), now() - DUEL_TTL);
  }
  function questionsFor(d) { const byId = new Map(bank(content()).map((x) => [x.id, x])); return JSON.parse(d.qids).map((id) => byId.get(id)).filter(Boolean).map(asked); }
  function publicView(d, s) {
    const me = s; const op = s ? other(s) : 'b';
    const side = (x) => ({ name: d[`${x}_name`] || '', place: d[`${x}_place`] || '', kind: d[`${x}_kind`] || '', played: !!d[`${x}_done`], score: d.status === 'done' ? d[`${x}_score`] : null, ms: d.status === 'done' ? d[`${x}_ms`] : null });
    return { id: d.id, code: d.code, mode: d.mode, status: d.status, created_at: d.created_at, closed_at: d.closed_at, size: JSON.parse(d.qids).length, seconds: DUEL_SECONDS,
      me: me ? { ...side(me), side: me, done: !!d[`${me}_done`], started: !!d[`${me}_start`] } : null, opponent: d[`${op}_name`] ? side(op) : null,
      from: { name: d.a_name, place: d.a_place, played: !!d.a_done }, joinable: d.mode === 'link' && !d.b_kind && d.status !== 'expired',
      result: d.status === 'done' ? (d.winner === 'draw' ? 'draw' : me ? (d.winner === me ? 'win' : 'loss') : d.winner) : null };
  }
  function create(mode, a, b) {
    const qids = draw(content(), DUEL_SIZE, mode !== 'team' && mode !== 'global').map((x) => x.id);
    const d = { code: newDuelCode(), a_key: key(), b_key: b ? key() : null };
    const r = q(`INSERT INTO academy_duels (code, mode, qids, status, created_at, a_kind, a_tenant, a_user, a_phone, a_name, a_place, a_key,
      b_kind, b_tenant, b_user, b_phone, b_name, b_place, b_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      d.code, mode, JSON.stringify(qids), b ? 'invited' : 'open', now(), a.kind, a.tenant || null, a.user || null, a.phone || '', s(a.name, 60), s(a.place, 80), d.a_key,
      b ? b.kind : null, b ? b.tenant || null : null, b ? b.user || null : null, b ? b.phone || '' : '', b ? s(b.name, 60) : '', b ? s(b.place, 80) : '', d.b_key);
    return q('SELECT * FROM academy_duels WHERE id = ?').get(Number(r.lastInsertRowid));
  }
  // The questions for one side; the clock starts now (the server keeps the time).
  function startSide(d, s) {
    if (d[`${s}_done`]) throw new HttpError(400, 'Siz bu bellashuvda allaqachon javob bergansiz');
    if (!d[`${s}_start`]) q(`UPDATE academy_duels SET ${s}_start = ? WHERE id = ?`).run(now(), d.id);
    return { duel: publicView(q('SELECT * FROM academy_duels WHERE id = ?').get(d.id), s), questions: questionsFor(d), key: d[`${s}_key`] };
  }
  function answer(d, s, answers) {
    if (!d[`${s}_start`] || d[`${s}_done`]) throw new HttpError(400, "Bellashuv topilmadi yoki javob berilgan");
    if (d.status === 'expired' || d.status === 'declined') throw new HttpError(400, 'Bellashuv vaqti tugagan');
    const g = grade(content(), JSON.parse(d.qids), answers || {});
    // The server's clock; a question left past its time still counts as answered (a slow phone), but the time shows it.
    const ms = Math.max(0, Math.min(now() - d[`${s}_start`], DUEL_SIZE * DUEL_SECONDS * 1000 * 3));
    q(`UPDATE academy_duels SET ${s}_done = ?, ${s}_score = ?, ${s}_ms = ?, ${s}_answers = ? WHERE id = ?`)
      .run(now(), g.score, ms, JSON.stringify(answers || {}), d.id);
    let x = q('SELECT * FROM academy_duels WHERE id = ?').get(d.id);
    if (x.a_done && x.b_done) {
      const winner = x.a_score !== x.b_score ? (x.a_score > x.b_score ? 'a' : 'b') : x.a_ms !== x.b_ms ? (x.a_ms < x.b_ms ? 'a' : 'b') : 'draw';
      q("UPDATE academy_duels SET status = 'done', winner = ?, closed_at = ? WHERE id = ?").run(winner, now(), d.id);
      x = q('SELECT * FROM academy_duels WHERE id = ?').get(d.id);
      // The one who played first learns the result where they are.
      const o = other(s);
      if (x[`${o}_kind`] === 'app') notify(x[`${o}_tenant`], { to: x[`${o}_user`], kind: 'result', id: x.id, result: winner === 'draw' ? 'draw' : winner === o ? 'win' : 'loss', opponent: x[`${s}_name`] });
    }
    return { duel: publicView(x, s), score: g.score, total: g.total, results: g.results.filter((r) => !r.ok) };
  }

  // ---------- A worker in a business ----------
  function forWorker(me) {
    const p = { kind: 'app', tenant: me.tenant, user: me.user };
    const find = (id) => { expire(); const d = q('SELECT * FROM academy_duels WHERE id = ?').get(Number(id)); const s = d && sideOf(d, p); if (!s) throw new HttpError(404, 'Bellashuv topilmadi'); return { d, s }; };
    return {
      // A colleague by name ("team"), anyone on FLOWI ("global": joins one waiting, or opens one), or a link for a friend.
      create(body, colleague) {
        expire();
        const meP = { ...p, name: me.name, place: me.place };
        if (body.mode === 'team') {
          if (!colleague) throw new HttpError(400, 'Hamkasbni tanlang');
          const busy = q("SELECT 1 FROM academy_duels WHERE mode = 'team' AND status = 'invited' AND a_tenant = ? AND a_user = ? AND b_user = ?").get(me.tenant, me.user, colleague.id);
          if (busy) throw new HttpError(400, `${colleague.name} hali oldingi chaqiruvga javob bermadi`);
          const d = create('team', meP, { kind: 'app', tenant: me.tenant, user: colleague.id, name: colleague.name, place: me.place });
          notify(me.tenant, { to: colleague.id, kind: 'invite', id: d.id, from: me.name });
          return startSide(d, 'a');
        }
        if (body.mode === 'global') {
          if (!globalOn()) throw new HttpError(403, "Boshqa choyxonalar bilan bellashuv hozircha yopiq");
          const wait = q(`SELECT * FROM academy_duels WHERE mode = 'global' AND status = 'open' AND b_kind IS NULL AND a_done IS NOT NULL AND NOT (a_tenant = ? AND a_user = ?)
            ORDER BY created_at LIMIT 1`).get(me.tenant, me.user);
          if (wait) {
            q("UPDATE academy_duels SET status = 'playing', b_kind = 'app', b_tenant = ?, b_user = ?, b_name = ?, b_place = ?, b_key = ? WHERE id = ? AND b_kind IS NULL")
              .run(me.tenant, me.user, s(me.name, 60), s(me.place, 80), key(), wait.id);
            return startSide(q('SELECT * FROM academy_duels WHERE id = ?').get(wait.id), 'b');
          }
          return startSide(create('global', meP, null), 'a');
        }
        if (body.mode === 'link') return startSide(create('link', meP, null), 'a');
        throw new HttpError(400, "Bellashuv turi noto'g'ri");
      },
      accept(id) {
        const { d, s } = find(id);
        if (d.status === 'expired' || d.status === 'declined') throw new HttpError(400, 'Bellashuv vaqti tugagan');
        if (d.status === 'invited' && s === 'b') q("UPDATE academy_duels SET status = 'playing' WHERE id = ?").run(d.id);
        return startSide(q('SELECT * FROM academy_duels WHERE id = ?').get(d.id), s);
      },
      decline(id) {
        const { d, s } = find(id);
        if (s !== 'b' || d.b_done) throw new HttpError(400, "Bu chaqiruvni rad etib bo'lmaydi");
        q("UPDATE academy_duels SET status = 'declined', closed_at = ? WHERE id = ?").run(now(), d.id);
        if (d.a_kind === 'app') notify(d.a_tenant, { to: d.a_user, kind: 'declined', id: d.id, opponent: d.b_name });
        return { ok: true };
      },
      answer(id, body) { const { d, s } = find(id); return answer(d, s, body.answers); },
      get(id) {
        const { d, s } = find(id);
        const out = publicView(d, s);
        if (d.status === 'done' && d[`${s}_answers`]) out.wrong = grade(content(), JSON.parse(d.qids), JSON.parse(d[`${s}_answers`])).results.filter((r) => !r.ok);
        return out;
      },
      // What waits for me (invitations), what I wait for, and my last results.
      list() {
        expire();
        const rows = q(`SELECT * FROM academy_duels WHERE ((a_tenant = ? AND a_user = ? AND a_kind = 'app') OR (b_tenant = ? AND b_user = ? AND b_kind = 'app'))
          AND created_at > ? ORDER BY created_at DESC LIMIT 40`).all(me.tenant, me.user, me.tenant, me.user, now() - 30 * 86400 * 1000);
        return rows.map((d) => publicView(d, sideOf(d, p)));
      },
    };
  }

  // ---------- A visitor on the site (by phone) ----------
  function siteCreate(body) {
    if (!siteOn()) throw new HttpError(403, 'Saytda bellashuv hozircha yopiq');
    expire();
    const name = s(body.name, 60); const phone = phoneUz(body.phone);
    if (name.length < 2) throw new HttpError(400, 'Ismingizni yozing');
    if (!phone) throw new HttpError(400, "Telefon raqamingizni yozing (masalan 90 123 45 67)");
    const me = { kind: 'site', phone, name, place: s(body.place, 80) };
    if (body.mode === 'random') {
      const wait = q(`SELECT * FROM academy_duels WHERE mode = 'site' AND status = 'open' AND b_kind IS NULL AND a_done IS NOT NULL AND a_phone != ? ORDER BY created_at LIMIT 1`).get(phone);
      if (wait) {
        q("UPDATE academy_duels SET status = 'playing', b_kind = 'site', b_phone = ?, b_name = ?, b_place = ?, b_key = ? WHERE id = ? AND b_kind IS NULL").run(phone, name, me.place, key(), wait.id);
        return startSide(q('SELECT * FROM academy_duels WHERE id = ?').get(wait.id), 'b');
      }
      return startSide(create('site', me, null), 'a');
    }
    return startSide(create('link', me, null), 'a');
  }
  // A link: who called, and joining it (as a site visitor).
  function byCode(code) { expire(); const d = q('SELECT * FROM academy_duels WHERE code = ?').get(s(code, 12).toUpperCase()); if (!d) throw new HttpError(404, 'Bellashuv topilmadi'); return d; }
  function linkInfo(code, k) { const d = byCode(code); return publicView(d, sideOf(d, { key: k })); }
  function siteJoin(body) {
    const d = byCode(body.code);
    if (d.mode !== 'link') throw new HttpError(400, "Bu bellashuvga havola orqali qo'shilib bo'lmaydi");
    if (d.b_kind) throw new HttpError(400, "Bu bellashuvga allaqachon boshqa odam qo'shilgan");
    if (d.status === 'expired') throw new HttpError(400, 'Bellashuv vaqti tugagan');
    const name = s(body.name, 60); const phone = phoneUz(body.phone);
    if (name.length < 2) throw new HttpError(400, 'Ismingizni yozing');
    if (!phone) throw new HttpError(400, "Telefon raqamingizni yozing (masalan 90 123 45 67)");
    if (d.a_kind === 'site' && d.a_phone === phone) throw new HttpError(400, "O'zingiz bilan bellashib bo'lmaydi");
    q("UPDATE academy_duels SET status = 'playing', b_kind = 'site', b_phone = ?, b_name = ?, b_place = ?, b_key = ? WHERE id = ? AND b_kind IS NULL").run(phone, name, s(body.place, 80), key(), d.id);
    if (d.a_kind === 'app') notify(d.a_tenant, { to: d.a_user, kind: 'joined', id: d.id, opponent: name });
    return startSide(q('SELECT * FROM academy_duels WHERE id = ?').get(d.id), 'b');
  }
  function siteAnswer(body) {
    const d = byCode(body.code); const sd = sideOf(d, { key: s(body.key, 40) });
    if (!sd) throw new HttpError(404, 'Bellashuv topilmadi');
    return answer(d, sd, body.answers);
  }

  // ---------- Ratings (this month): 3 points a win, 1 a draw ----------
  function rating({ scope, tenant = null, me = null, month = null }) {
    const d0 = new Date(now()); const from = month || new Date(d0.getFullYear(), d0.getMonth(), 1).getTime();
    const rows = q("SELECT * FROM academy_duels WHERE status = 'done' AND closed_at >= ?").all(from);
    const table = new Map(); const biz = new Map();
    const add = (d, sd) => {
      const kind = d[`${sd}_kind`];
      if (scope === 'site' ? kind !== 'site' : kind !== 'app') return;
      if (scope === 'team' && d[`${sd}_tenant`] !== tenant) return;
      const k = playerKey(d, sd);
      const res = d.winner === 'draw' ? 'draw' : d.winner === sd ? 'win' : 'loss';
      const r = table.get(k) || { key: k, name: kind === 'site' ? firstName(d[`${sd}_name`]) : d[`${sd}_name`], place: d[`${sd}_place`], win: 0, draw: 0, loss: 0, points: 0, tenant: d[`${sd}_tenant`] };
      r[res]++; r.points += POINTS[res]; table.set(k, r);
      if (kind === 'app') { const b = biz.get(r.tenant) || { name: r.place, points: 0, players: new Set() }; b.points += POINTS[res]; b.players.add(k); biz.set(r.tenant, b); }
    };
    for (const d of rows) { add(d, 'a'); add(d, 'b'); }
    const list = [...table.values()].sort((a, b) => b.points - a.points || b.win - a.win || a.loss - b.loss).map((r, i) => ({ ...r, place_no: i + 1 }));
    const meKey = me ? (me.kind === 'app' ? `t${me.tenant}:u${me.user}` : `p${me.phone}`) : null;
    const mine = meKey ? list.find((r) => r.key === meKey) || null : null;
    const clean = (r) => ({ no: r.place_no, name: r.name, place: r.place, win: r.win, draw: r.draw, loss: r.loss, points: r.points, me: r.key === meKey });
    return { scope, from, top: list.slice(0, 20).map(clean), mine: mine ? clean(mine) : null, players: list.length,
      businesses: scope === 'site' ? [] : [...biz.values()].sort((a, b) => b.points - a.points).slice(0, 10).map((b, i) => ({ no: i + 1, name: b.name, points: b.points, players: b.players.size })) };
  }
  // A worker's own tally (for the boss's list and the invite list).
  function tally(tenant) {
    const out = {};
    for (const d of q("SELECT * FROM academy_duels WHERE status = 'done' AND (a_tenant = ? OR b_tenant = ?)").all(tenant, tenant)) {
      for (const sd of ['a', 'b']) {
        if (d[`${sd}_kind`] !== 'app' || d[`${sd}_tenant`] !== tenant) continue;
        const u = d[`${sd}_user`]; const r = out[u] || { win: 0, draw: 0, loss: 0 };
        r[d.winner === 'draw' ? 'draw' : d.winner === sd ? 'win' : 'loss']++; out[u] = r;
      }
    }
    return out;
  }
  function stats() {
    const since = now() - 30 * 86400 * 1000;
    const r = q(`SELECT COUNT(*) all_, SUM(status = 'done') done, SUM(mode = 'team') team, SUM(mode = 'global') global_, SUM(mode = 'site') site, SUM(mode = 'link') link FROM academy_duels WHERE created_at > ?`).get(since);
    return { all: r.all_ || 0, done: r.done || 0, team: r.team || 0, global: r.global_ || 0, site: r.site || 0, link: r.link || 0 };
  }
  return { forWorker, siteCreate, siteJoin, siteAnswer, linkInfo, rating, tally, stats, DUEL_SIZE, DUEL_SECONDS };
}

module.exports = { createAcademy, createPublicAcademy, createDuels, cleanContent, bank, draw, grade, PASS_PCT, TEST_SIZE, DEFAULT };
