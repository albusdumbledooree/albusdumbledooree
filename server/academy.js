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
function createAcademy(db, { content = () => DEFAULT, full = () => true, hidden = () => false } = {}) {
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
    return q('SELECT id, started_at, finished_at, score, total, passed, weak FROM academy_tests WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 20').all(userId)
      .map((r) => ({ ...r, passed: !!r.passed, pct: r.total ? Math.round((r.score / r.total) * 100) : 0, weak: JSON.parse(r.weak || '[]') }));
  }
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
    q('UPDATE academy_tests SET finished_at = ?, score = ?, total = ?, passed = ?, weak = ? WHERE id = ?').run(now(), g.score, g.total, g.passed ? 1 : 0, JSON.stringify(g.weak), t.id);
    return { id: t.id, ...g, retry_at: g.passed ? 0 : now() + RETRY_MS };
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
        best, last: tests[0] || null, last_at: lastAt || null };
    });
    const weak = Object.entries(quizMiss).filter(([, v]) => v.total >= 3).map(([title, v]) => ({ title, pct: Math.round((v.ok / v.total) * 100) }))
      .sort((a, b) => a.pct - b.pct)[0] || null;
    return { full: full(), pass_pct: PASS_PCT, rows, weak: weak && weak.pct < 80 ? weak : null };
  }

  // A passed test's certificate: the person themselves, or the boss and admin.
  function certificate({ user, params }) {
    const t = q('SELECT t.*, u.name FROM academy_tests t JOIN users u ON u.id = t.user_id WHERE t.id = ? AND t.passed = 1').get(params.id);
    if (!t || (t.user_id !== user.id && !['owner', 'admin'].includes(user.role))) throw new HttpError(404, 'Sertifikat topilmadi');
    return { id: t.id, name: t.name, score: t.score, total: t.total, pct: t.total ? Math.round((t.score / t.total) * 100) : 0, at: t.finished_at };
  }

  // For the platform: how many people learn here and how the tests went.
  function brief() {
    const r = q(`SELECT (SELECT COUNT(DISTINCT user_id) FROM academy_lessons) learners, (SELECT COUNT(*) FROM academy_lessons) lessons,
      (SELECT COUNT(*) FROM academy_tests WHERE finished_at IS NOT NULL) tests, (SELECT COUNT(DISTINCT user_id) FROM academy_tests WHERE passed = 1) certified`).get();
    return { learners: r.learners, lessons: r.lessons, tests: r.tests, certified: r.certified };
  }

  return { home: open(home), lessonDone: open(lessonDone), startTest: open(startTest), finishTest: open(finishTest), team: open(team), certificate: open(certificate), brief, hidden };
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
`;
const PUBLIC_PER_HOUR = 10;

function createPublicAcademy(pdb, { pget, pset, now = Date.now }) {
  pdb.exec(PUBLIC_SCHEMA);
  const q = (sql) => pdb.prepare(sql);
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

  function start({ body, ip }) {
    if (!siteOn()) throw new HttpError(403, 'Test vaqtincha yopiq');
    if (body.website) throw new HttpError(400, "So'rov noto'g'ri"); // a hidden field only robots fill in
    const name = s(body.name, 60);
    if (name.length < 2) throw new HttpError(400, 'Ismingizni yozing');
    const t = now();
    const recent = q('SELECT COUNT(*) c FROM academy_public WHERE ip = ? AND started_at > ?').get(String(ip || ''), t - 3600 * 1000).c;
    if (recent >= PUBLIC_PER_HOUR) throw new HttpError(429, "Juda ko'p urinish. Bir soatdan keyin qayta urinib ko'ring");
    const picked = draw(content(), TEST_SIZE, true);
    const code = crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
    q('INSERT INTO academy_public (code, name, place, qids, ip, started_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(code, name, s(body.place, 80), JSON.stringify(picked.map((x) => x.id)), String(ip || ''), t);
    return { key: code, questions: picked.map(asked), pass_pct: PASS_PCT };
  }
  function finish({ body }) {
    const r = q('SELECT * FROM academy_public WHERE code = ?').get(s(body.key, 12).toUpperCase());
    if (!r || r.finished_at) throw new HttpError(404, 'Test topilmadi');
    if (now() - r.started_at > TEST_TTL) throw new HttpError(400, "Test vaqti o'tib ketdi — qaytadan boshlang");
    const g = grade(content(), JSON.parse(r.qids), body.answers || {});
    q('UPDATE academy_public SET finished_at = ?, score = ?, total = ?, passed = ? WHERE id = ?').run(now(), g.score, g.total, g.passed ? 1 : 0, r.id);
    return { ...g, code: g.passed ? r.code : null, name: r.name, place: r.place, at: now() };
  }
  // Anyone can check a certificate by its code.
  function cert(code) {
    const r = q('SELECT code, name, place, score, total, finished_at FROM academy_public WHERE code = ? AND passed = 1').get(s(code, 12).toUpperCase());
    if (!r) throw new HttpError(404, 'Sertifikat topilmadi');
    return { code: r.code, name: r.name, place: r.place, score: r.score, total: r.total, pct: r.total ? Math.round((r.score / r.total) * 100) : 0, at: r.finished_at };
  }
  function stats() {
    const since = now() - 30 * 86400 * 1000;
    const all = q('SELECT COUNT(*) started, SUM(finished_at IS NOT NULL) finished, SUM(passed) passed FROM academy_public').get();
    const month = q('SELECT COUNT(*) started, SUM(finished_at IS NOT NULL) finished, SUM(passed) passed FROM academy_public WHERE started_at > ?').get(since);
    const last = q('SELECT name, place, score, total, passed, finished_at FROM academy_public WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 30').all()
      .map((r) => ({ ...r, passed: !!r.passed }));
    const n = (v) => Number(v) || 0;
    return { all: { started: n(all.started), finished: n(all.finished), passed: n(all.passed) }, month: { started: n(month.started), finished: n(month.finished), passed: n(month.passed) }, last };
  }
  return { content, save, reset, custom, siteOn, setSite, start, finish, cert, stats };
}

module.exports = { createAcademy, createPublicAcademy, cleanContent, bank, draw, grade, PASS_PCT, TEST_SIZE, DEFAULT };
