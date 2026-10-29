'use strict';
/*
 * Applications from the front page (flowi.uz) and the platform owner's Telegram bot.
 * - Every application is written to platform.db first; Telegram is only a notice. If Telegram is down,
 *   the application waits (tg_sent = 0) and is sent again later — nothing is lost.
 * - The bot is linked from the platform panel: the owner pastes the token, then sends the bot a one-time
 *   code (/start 123456) from their own chat or group. Only that chat gets notices and may press the buttons.
 * - Updates are read by long polling, so no public webhook address is needed.
 */
const crypto = require('node:crypto');
const { HttpError, str, int } = require('./util');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  business TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  staff INTEGER NOT NULL DEFAULT 0,
  city TEXT NOT NULL DEFAULT '',
  call_time TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'uz',
  ip TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'called', 'connected', 'rejected')),
  admin_note TEXT NOT NULL DEFAULT '',
  tenant_id INTEGER,
  tg_sent INTEGER NOT NULL DEFAULT 0,
  tg_attempts INTEGER NOT NULL DEFAULT 0,
  tg_chat_id TEXT,
  tg_message_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at);
`;

const STATUSES = { new: 'Yangi', called: "Qo'ng'iroq qilindi", connected: 'Ulandi', rejected: 'Rad etildi' };
const STATUS_ICONS = { new: '🆕', called: '📞', connected: '✅', rejected: '✖️' };
const TYPES = { choyxona: 'Choyxona', restoran: 'Restoran / kafe', fastfood: 'Fast food', market: "Do'kon", clothing: "Kiyim do'koni", other: 'Boshqa' };
const PLANS = { start: 'Start', biznes: 'Biznes', pro: 'Pro' };
const HOUR = 3600 * 1000;
const PER_IP_HOUR = 5;
const RETRY_MS = 60 * 1000;
const MAX_ATTEMPTS = 50;

const html = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function phoneInput(v) {
  const raw = str(v, 'Telefon', { required: true, max: 30 });
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length < 9 || digits.length > 15) throw new HttpError(400, "Telefon raqam noto'g'ri");
  return `+${digits}`;
}

function createLeads({ pdb, pget, pset, now = Date.now, log = console }) {
  const apiBase = () => process.env.TELEGRAM_API || 'https://api.telegram.org';
  pdb.exec(SCHEMA);
  const q = (sql) => pdb.prepare(sql);
  const recent = new Map(); // ip -> submit times (last hour)

  // ---------- Telegram settings ----------
  function tg() { try { return JSON.parse(pget('telegram', '{}')) || {}; } catch { return {}; } }
  function saveTg(o) { pset('telegram', JSON.stringify(o)); }

  async function call(method, params, { token = tg().token, signal } = {}) {
    if (!token) throw new HttpError(400, 'Telegram bot ulanmagan');
    let res;
    try {
      res = await fetch(`${apiBase()}/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}), signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new HttpError(502, "Telegram bilan aloqa yo'q. Server internetini tekshiring");
    }
    const j = await res.json().catch(() => ({}));
    if (!j.ok) {
      const err = new HttpError(res.status === 401 || res.status === 404 ? 400 : 502, res.status === 401 || res.status === 404 ? "Bot tokeni noto'g'ri" : `Telegram: ${j.description || res.status}`);
      err.tgStatus = res.status;
      throw err;
    }
    return j.result;
  }

  // ---------- Message text and buttons ----------
  function leadText(l) {
    const lines = [
      `${STATUS_ICONS[l.status]} <b>${l.status === 'new' ? 'Yangi ariza' : 'Ariza'} #${l.id}</b>`,
      `👤 ${html(l.name)} · 📞 ${html(l.phone)}`,
    ];
    const biz = [l.business && `"${html(l.business)}"`, TYPES[l.type] && html(TYPES[l.type]), l.city && html(l.city)].filter(Boolean).join(' · ');
    if (biz) lines.push(`🏪 ${biz}`);
    const extra = [l.staff ? `👥 ${l.staff} ta xodim` : '', l.call_time ? `⏰ Qulay vaqt: ${html(l.call_time)}` : ''].filter(Boolean).join(' · ');
    if (extra) lines.push(extra);
    if (l.plan && PLANS[l.plan]) lines.push(`⭐ Tarif: ${PLANS[l.plan]}`);
    if (l.note) lines.push(`💬 ${html(l.note)}`);
    if (l.source) lines.push(`🔗 Manba: ${html(l.source)}`);
    if (l.status !== 'new') lines.push('', `<b>Holat: ${STATUS_ICONS[l.status]} ${STATUSES[l.status]}</b>`);
    if (l.admin_note) lines.push(`📝 ${html(l.admin_note)}`);
    return lines.join('\n');
  }
  function leadButtons(l) {
    const b = (s, text) => ({ text: (l.status === s ? '• ' : '') + text, callback_data: `lead:${l.id}:${s}` });
    return { inline_keyboard: [[b('called', "📞 Qo'ng'iroq qilindi")], [b('connected', '✅ Ulandi'), b('rejected', '✖️ Rad etildi')]] };
  }

  async function sendLead(l) {
    const s = tg();
    if (!s.token || !s.chat_id) return false;
    try {
      const m = await call('sendMessage', { chat_id: s.chat_id, text: leadText(l), parse_mode: 'HTML', reply_markup: leadButtons(l), disable_web_page_preview: true });
      q('UPDATE leads SET tg_sent = 1, tg_chat_id = ?, tg_message_id = ?, tg_attempts = tg_attempts + 1 WHERE id = ?').run(String(s.chat_id), m.message_id, l.id);
      return true;
    } catch (e) {
      q('UPDATE leads SET tg_attempts = tg_attempts + 1 WHERE id = ?').run(l.id);
      log.error(`Ariza #${l.id} Telegramga yuborilmadi: ${e.message}`);
      return false;
    }
  }
  // Keep the Telegram message in step with the status changed in the panel.
  async function refreshMessage(l) {
    const s = tg();
    if (!s.token || !l.tg_message_id || String(l.tg_chat_id) !== String(s.chat_id)) return;
    try {
      await call('editMessageText', { chat_id: l.tg_chat_id, message_id: l.tg_message_id, text: leadText(l), parse_mode: 'HTML', reply_markup: leadButtons(l), disable_web_page_preview: true });
    } catch (e) { if (!/not modified/i.test(e.message)) log.error(`Telegram xabari yangilanmadi: ${e.message}`); }
  }

  let lastRetry = 0;
  async function retryUnsent() {
    if (now() - lastRetry < RETRY_MS) return;
    lastRetry = now();
    const s = tg();
    if (!s.token || !s.chat_id) return;
    const rows = q('SELECT * FROM leads WHERE tg_sent = 0 AND tg_attempts < ? ORDER BY id LIMIT 20').all(MAX_ATTEMPTS);
    for (const l of rows) if (!(await sendLead(l))) break;
  }

  // ---------- Front page form ----------
  function submit({ body, ip }) {
    if (body.website) return { ok: true }; // a hidden field only robots fill in
    const t = now();
    const times = (recent.get(ip) || []).filter((x) => t - x < HOUR);
    if (times.length >= PER_IP_HOUR) throw new HttpError(429, "Juda ko'p ariza yuborildi. Birozdan keyin urinib ko'ring yoki bizga qo'ng'iroq qiling");
    const l = {
      name: str(body.name, 'Ism', { required: true, max: 80 }),
      phone: phoneInput(body.phone),
      business: str(body.business, 'Biznes nomi', { max: 100 }),
      type: TYPES[body.type] ? body.type : '',
      staff: int(body.staff, 'Xodimlar soni', { min: 0, max: 10000 }),
      city: str(body.city, 'Shahar', { max: 80 }),
      call_time: str(body.call_time, 'Qulay vaqt', { max: 60 }),
      note: str(body.note, 'Izoh', { max: 1000 }),
      plan: PLANS[body.plan] ? body.plan : '',
      source: str(body.source, 'Manba', { max: 120 }).replace(/[^\w.@:/ +-]/g, '').slice(0, 120),
      lang: body.lang === 'ru' ? 'ru' : 'uz',
    };
    // The same phone pressing "send" twice: one application, one notice.
    const dup = q('SELECT id FROM leads WHERE phone = ? AND created_at > ?').get(l.phone, t - 10 * 60 * 1000);
    if (dup) return { ok: true, id: dup.id };
    times.push(t); recent.set(ip, times);
    if (recent.size > 5000) for (const [k, v] of recent) if (!v.some((x) => t - x < HOUR)) recent.delete(k);
    const r = q(`INSERT INTO leads (name, phone, business, type, staff, city, call_time, note, plan, source, lang, ip, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(l.name, l.phone, l.business, l.type, l.staff, l.city, l.call_time, l.note, l.plan, l.source, l.lang, String(ip || ''), t, t);
    const id = Number(r.lastInsertRowid);
    sendLead(q('SELECT * FROM leads WHERE id = ?').get(id)).catch(() => {});
    return { ok: true, id };
  }

  // ---------- Platform panel ----------
  function list({ query }) {
    const where = ['1'];
    const args = [];
    if (STATUSES[query.status]) { where.push('status = ?'); args.push(query.status); }
    if (query.q) {
      where.push('(name LIKE ? OR phone LIKE ? OR business LIKE ? OR city LIKE ?)');
      const text = String(query.q).trim();
      const like = `%${text}%`;
      const digits = text.replace(/\D/g, '');
      args.push(like, digits ? `%${digits}%` : like, like, like);
    }
    const rows = q(`SELECT * FROM leads WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 500`).all(...args);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const counts = Object.fromEntries(Object.keys(STATUSES).map((k) => [k, 0]));
    for (const r of q('SELECT status, COUNT(*) c FROM leads GROUP BY status').all()) counts[r.status] = r.c;
    const sources = q("SELECT CASE WHEN source = '' THEN 'to''g''ridan' ELSE source END source, COUNT(*) c, SUM(status = 'connected') won FROM leads GROUP BY 1 ORDER BY c DESC LIMIT 12").all();
    return {
      rows: rows.map(({ ip, tg_chat_id, ...r }) => r),
      counts, month: q('SELECT COUNT(*) c FROM leads WHERE created_at >= ?').get(monthStart.getTime()).c,
      unsent: q('SELECT COUNT(*) c FROM leads WHERE tg_sent = 0').get().c, sources, statuses: STATUSES, types: TYPES,
    };
  }

  function setStatus(id, status, note) {
    const l = q('SELECT * FROM leads WHERE id = ?').get(id);
    if (!l) throw new HttpError(404, 'Ariza topilmadi');
    q('UPDATE leads SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?').run(status || l.status, note ?? l.admin_note, now(), id);
    const fresh = q('SELECT * FROM leads WHERE id = ?').get(id);
    refreshMessage(fresh).catch(() => {});
    return fresh;
  }
  function update({ params, body }) {
    if (body.status !== undefined && !STATUSES[body.status]) throw new HttpError(400, "Holat noto'g'ri");
    const note = body.admin_note === undefined ? undefined : str(body.admin_note, 'Izoh', { max: 1000 });
    if (body.tenant_id !== undefined) q('UPDATE leads SET tenant_id = ? WHERE id = ?').run(body.tenant_id ? Number(body.tenant_id) : null, params.id);
    const { ip, tg_chat_id, ...r } = setStatus(params.id, body.status, note);
    return r;
  }

  function botStatus() {
    const s = tg();
    return { configured: !!s.token, bot: s.bot || '', chat_id: s.chat_id || null, chat_title: s.chat_title || '', link_code: s.chat_id ? '' : (s.link_code || ''),
      polling: !!s.token && running, error: s.error || '' };
  }
  async function setToken({ body }) {
    const token = str(body.token, 'Bot tokeni', { required: true, max: 100 });
    if (!/^\d+:[\w-]{20,}$/.test(token)) throw new HttpError(400, "Bot tokeni noto'g'ri. @BotFather bergan to'liq qatorni joylang");
    const me = await call('getMe', {}, { token });
    await call('deleteWebhook', { drop_pending_updates: false }, { token }).catch(() => {});
    const old = tg();
    saveTg({ token, bot: me.username, chat_id: old.token === token ? old.chat_id : null, chat_title: old.token === token ? old.chat_title : '',
      link_code: String(crypto.randomInt(100000, 1000000)), offset: 0 });
    kick();
    return botStatus();
  }
  // A new code; the current chat keeps getting notices until another chat sends the code.
  function relink() {
    const s = tg();
    if (!s.token) throw new HttpError(400, 'Avval bot tokenini kiriting');
    saveTg({ ...s, chat_id: null, prev_chat_id: s.chat_id || s.prev_chat_id || null, link_code: String(crypto.randomInt(100000, 1000000)) });
    return botStatus();
  }
  function unlink() { saveTg({}); kick(); return botStatus(); }
  async function test() {
    const s = tg();
    if (!s.chat_id) throw new HttpError(400, 'Avval botni chatga ulang');
    await call('sendMessage', { chat_id: s.chat_id, text: '✅ FLOWI: sinov xabari. Yangi arizalar shu yerga keladi.' });
    return { ok: true };
  }

  // ---------- Reading the bot's updates ----------
  // Other parts of the platform may answer messages first (a business linking its reminders).
  const handlers = [];
  function onMessage(fn) { handlers.push(fn); }
  async function sendTo(chatId, text) {
    return call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
  }
  const ready = () => !!tg().token;

  async function onUpdate(u) {
    const s = tg();
    const msg = u.message || u.channel_post;
    if (msg && typeof msg.text === 'string') {
      for (const h of handlers) {
        const reply = h(msg);
        if (reply) { await call('sendMessage', { chat_id: msg.chat.id, text: reply }).catch(() => {}); return; }
      }
      const m = /^\/start(?:@\w+)?\s+(\d{6})\s*$/.exec(msg.text.trim()) || /^(\d{6})$/.exec(msg.text.trim());
      if (m && s.link_code && m[1] === s.link_code && !s.chat_id) {
        const title = msg.chat.title || [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(' ') || msg.chat.username || '';
        saveTg({ ...s, chat_id: msg.chat.id, chat_title: title, link_code: '', prev_chat_id: null });
        await call('sendMessage', { chat_id: msg.chat.id, text: '✅ FLOWI boti ulandi. flowi.uz dagi yangi arizalar shu yerga keladi.' }).catch(() => {});
        lastRetry = 0;
      } else if (/^\/start/.test(msg.text) && String(msg.chat.id) !== String(s.chat_id)) {
        await call('sendMessage', { chat_id: msg.chat.id, text: 'Assalomu alaykum! Bu FLOWI boti. Ariza qoldirish uchun: https://flowi.uz' }).catch(() => {});
      }
      return;
    }
    const cb = u.callback_query;
    if (!cb) return;
    const m = /^lead:(\d+):(called|connected|rejected)$/.exec(cb.data || '');
    const chat = cb.message && cb.message.chat && cb.message.chat.id;
    if (!m || String(chat) !== String(s.chat_id)) {
      await call('answerCallbackQuery', { callback_query_id: cb.id, text: "Bu chatdan o'zgartirib bo'lmaydi" }).catch(() => {});
      return;
    }
    const who = [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' ');
    const l = q('SELECT * FROM leads WHERE id = ?').get(Number(m[1]));
    if (!l) { await call('answerCallbackQuery', { callback_query_id: cb.id, text: 'Ariza topilmadi' }).catch(() => {}); return; }
    const status = l.status === m[2] ? 'new' : m[2]; // pressing the active button again undoes it
    if (cb.message.message_id && !l.tg_message_id) q('UPDATE leads SET tg_message_id = ?, tg_chat_id = ? WHERE id = ?').run(cb.message.message_id, String(chat), l.id);
    setStatus(l.id, status, l.admin_note);
    await call('answerCallbackQuery', { callback_query_id: cb.id, text: `${STATUSES[status]}${who ? ` — ${who}` : ''}` }).catch(() => {});
  }

  let running = false;
  let abort = null;
  let wake = null;
  const sleep = (ms) => new Promise((r) => { const tm = setTimeout(r, ms); tm.unref(); wake = () => { clearTimeout(tm); r(); }; });
  function kick() { if (abort) abort.abort(); if (wake) wake(); }

  async function loop() {
    while (running) {
      const s = tg();
      if (!s.token) { await sleep(30 * 1000); continue; }
      try {
        abort = new AbortController();
        const updates = await call('getUpdates', { offset: s.offset || 0, timeout: 25, allowed_updates: ['message', 'callback_query', 'channel_post'] }, { token: s.token, signal: abort.signal });
        for (const u of updates) {
          saveTg({ ...tg(), offset: u.update_id + 1 });
          try { await onUpdate(u); } catch (e) { log.error(`Telegram: ${e.message}`); }
        }
        if (tg().error) saveTg({ ...tg(), error: '' });
        await retryUnsent();
      } catch (e) {
        if (!running) break;
        if (e.name === 'AbortError') continue;
        saveTg({ ...tg(), error: e.message });
        await sleep(e.tgStatus === 409 ? 60 * 1000 : 15 * 1000);
      } finally { abort = null; }
    }
  }
  function start() { if (running) return; running = true; loop(); }
  function stop() { running = false; kick(); }

  return { submit, list, update, botStatus, setToken, relink, unlink, test, start, stop, STATUSES, onMessage, sendTo, ready, botName: () => tg().bot || '' };
}

module.exports = { createLeads };
