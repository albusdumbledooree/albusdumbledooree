'use strict';
/*
 * "To'lov va yordam" — the second Telegram bot of the platform, for the businesses themselves (not the applications bot).
 * - The platform owner pastes its token in the platform panel and links their own chat with a one-time code: that chat
 *   is the "admin chat" and gets every question and payment.
 * - A business links from its program (Settings → Tarif → "Telegram botga ulanish"): the button opens the bot with a
 *   one-time code, so the bot knows which business is writing. Several people of one business may link.
 * - Yordam: whatever a business writes goes to the admin chat under a header (business, person); the owner answers by
 *   replying to it, and the answer goes back to that person.
 * - To'lash: by card (the card number from the platform; the business sends a photo of the receipt) or in cash (the
 *   owner is told). The owner presses "+1 oy" / "+3 oy" (or "Rad etish") and the business's term moves on by itself.
 * - Reminders 3 days and 1 day before the term ends, and on the day it ends.
 * Everything is kept in platform.db (questions, answers, payments), so nothing depends on the Telegram history.
 * Updates are read by long polling, like the applications bot: no public webhook address is needed.
 */
const crypto = require('node:crypto');
const { HttpError, str } = require('./util');

const DAY = 24 * 3600 * 1000;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS help_chats (
  chat_id TEXT PRIMARY KEY, tenant_id INTEGER, name TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '', state_at INTEGER, linked_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS help_codes (code TEXT PRIMARY KEY, tenant_id INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS help_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, tenant_id INTEGER, dir TEXT NOT NULL CHECK (dir IN ('in', 'out')),
  kind TEXT NOT NULL DEFAULT 'text', text TEXT NOT NULL DEFAULT '', admin_msg_id INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS help_messages_admin ON help_messages(admin_msg_id);
CREATE INDEX IF NOT EXISTS help_messages_tenant ON help_messages(tenant_id, created_at);
CREATE TABLE IF NOT EXISTS help_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, chat_id TEXT NOT NULL DEFAULT '', method TEXT NOT NULL CHECK (method IN ('card', 'cash', 'manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')), months INTEGER NOT NULL DEFAULT 0, amount INTEGER NOT NULL DEFAULT 0,
  admin_msg_id INTEGER, by_name TEXT NOT NULL DEFAULT '', until_before INTEGER, until_after INTEGER, created_at INTEGER NOT NULL, decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS help_payments_tenant ON help_payments(tenant_id, created_at);
CREATE TABLE IF NOT EXISTS help_reminders (tenant_id INTEGER NOT NULL, paid_until INTEGER NOT NULL, stage TEXT NOT NULL, sent_at INTEGER, PRIMARY KEY (tenant_id, paid_until, stage));
`;

const BTN_PAY = "💳 To'lash";
const BTN_PLAN = '📅 Tarifim';
const BTN_HELP = '🆘 Yordam';
const KEYBOARD = { keyboard: [[{ text: BTN_PAY }, { text: BTN_PLAN }], [{ text: BTN_HELP }]], resize_keyboard: true, is_persistent: true };
const RECEIPT_WAIT = 2 * 3600 * 1000; // after "Karta orqali", a photo within 2 hours is taken as the receipt
const html = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const num = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const day = (ms) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
// A month on from a date, the same day of the month (31 January + 1 month = the last day of February).
function addMonths(ms, n) {
  const d = new Date(ms);
  const dayOf = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dayOf, last));
  return d.getTime();
}

/*
 * tenant(id) → the business's row; planFor(row) → { name, fee, grace_until, read_only };
 * setPaidUntil(id, ms) → saves the new term (and tells the business's program).
 */
function createHelpBot({ pdb, pget, pset, now = Date.now, log = console, tenant, planFor, setPaidUntil, changed = () => {} }) {
  const apiBase = () => process.env.TELEGRAM_API || 'https://api.telegram.org';
  pdb.exec(SCHEMA);
  const q = (sql) => pdb.prepare(sql);

  function st() { try { return JSON.parse(pget('helpbot', '{}')) || {}; } catch { return {}; } }
  function save(o) { pset('helpbot', JSON.stringify(o)); }

  async function call(method, params, { token = st().token, signal } = {}) {
    if (!token) throw new HttpError(400, "To'lov va yordam boti ulanmagan");
    let res;
    try {
      res = await fetch(`${apiBase()}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}), signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new HttpError(502, "Telegram bilan aloqa yo'q. Server internetini tekshiring");
    }
    const j = await res.json().catch(() => ({}));
    if (!j.ok) {
      const bad = res.status === 401 || res.status === 404;
      const err = new HttpError(bad ? 400 : 502, bad ? "Bot tokeni noto'g'ri" : `Telegram: ${j.description || res.status}`);
      err.tgStatus = res.status;
      throw err;
    }
    return j.result;
  }
  const send = (chatId, text, extra = {}) => call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
  const quiet = (p) => p.catch((e) => { log.error(`Yordam boti: ${e.message}`); return null; });

  // ---------- Who is writing ----------
  const chatRow = (id) => q('SELECT * FROM help_chats WHERE chat_id = ?').get(String(id));
  function touchChat(from, chatId) {
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ').slice(0, 80);
    q(`INSERT INTO help_chats (chat_id, name, username, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET name = excluded.name, username = excluded.username`).run(String(chatId), name, from.username || '', now());
    return chatRow(chatId);
  }
  const setState = (chatId, state) => q('UPDATE help_chats SET state = ?, state_at = ? WHERE chat_id = ?').run(state, now(), String(chatId));
  function whoText(c) {
    const t = c && c.tenant_id ? tenant(c.tenant_id) : null;
    const person = `${html(c && c.name ? c.name : 'Mijoz')}${c && c.username ? ` @${html(c.username)}` : ''}`;
    return t ? `🏪 <b>${html(t.name)}</b> (${html(t.code)})${t.phone ? ` · ${html(t.phone)}` : ''}\n👤 ${person}` : `👤 ${person} · <i>dasturga ulanmagan</i>`;
  }
  function planText(t) {
    const p = planFor(t);
    const left = t.paid_until ? Math.ceil((t.paid_until - now()) / DAY) : null;
    const term = !t.paid_until ? 'belgilanmagan'
      : left > 0 ? `<b>${day(t.paid_until)}</b> gacha (${left} kun qoldi)`
        : `<b>${day(t.paid_until)}</b> — tugagan${p.read_only ? ' · dastur faqat ko\'rish rejimida' : p.grace_until ? ` · ${day(p.grace_until)} gacha ishlaydi` : ''}`;
    return [`📅 <b>${html(t.name)}</b>`, `⭐ Tarif: <b>${html(p.name)}</b>`, `💰 Oylik: <b>${num(p.fee)} so'm</b>`, `🗓 To'langan: ${term}`].join('\n');
  }

  // ---------- Platform panel: the bot itself ----------
  function status() {
    const s = st();
    return { configured: !!s.token, bot: s.bot || '', chat_id: s.chat_id || null, chat_title: s.chat_title || '', link_code: s.chat_id ? '' : (s.link_code || ''),
      card_number: s.card_number || '', card_owner: s.card_owner || '', polling: !!s.token && running, error: s.error || '',
      linked_chats: q('SELECT COUNT(*) c FROM help_chats WHERE tenant_id IS NOT NULL').get().c,
      pending: q("SELECT COUNT(*) c FROM help_payments WHERE status = 'pending'").get().c };
  }
  async function setToken({ body }) {
    const s = st();
    // The card is saved on its own (the token stays).
    if (body.card_number !== undefined || body.card_owner !== undefined) {
      const digits = String(body.card_number ?? s.card_number ?? '').replace(/\D/g, '');
      if (digits && (digits.length < 16 || digits.length > 19)) throw new HttpError(400, "Karta raqami noto'g'ri (16 raqam)");
      save({ ...st(), card_number: digits.replace(/(\d{4})(?=\d)/g, '$1 '), card_owner: str(body.card_owner ?? s.card_owner, 'Karta egasi', { max: 60 }) });
      if (body.token === undefined) return status();
    }
    const token = str(body.token, 'Bot tokeni', { required: true, max: 100 });
    if (!/^\d+:[\w-]{20,}$/.test(token)) throw new HttpError(400, "Bot tokeni noto'g'ri. @BotFather bergan to'liq qatorni joylang");
    const leadsToken = (() => { try { return JSON.parse(pget('telegram', '{}')).token; } catch { return ''; } })();
    if (leadsToken && leadsToken === token) throw new HttpError(400, "Bu token arizalar botiniki. To'lov va yordam uchun alohida bot oching");
    const me = await call('getMe', {}, { token });
    await call('deleteWebhook', { drop_pending_updates: false }, { token }).catch(() => {});
    await call('setMyCommands', { commands: [{ command: 'start', description: 'Menyu' }] }, { token }).catch(() => {});
    const old = st();
    const same = old.token === token;
    save({ ...old, token, bot: me.username, chat_id: same ? old.chat_id : null, chat_title: same ? old.chat_title : '', offset: same ? old.offset || 0 : 0,
      link_code: same && old.chat_id ? '' : String(crypto.randomInt(100000, 1000000)), error: '' });
    kick();
    return status();
  }
  function relink() {
    const s = st();
    if (!s.token) throw new HttpError(400, 'Avval bot tokenini kiriting');
    save({ ...s, chat_id: null, chat_title: '', link_code: String(crypto.randomInt(100000, 1000000)) });
    return status();
  }
  // Questions, answers and payments stay; only the bot and the admin chat are forgotten.
  function unlink() { const s = st(); save({ card_number: s.card_number || '', card_owner: s.card_owner || '' }); kick(); return status(); }
  async function test() {
    const s = st();
    if (!s.chat_id) throw new HttpError(400, 'Avval botni chatingizga ulang');
    await send(s.chat_id, "✅ FLOWI to'lov va yordam boti: sinov xabari. Mijozlarning savollari va to'lovlari shu yerga keladi.");
    return { ok: true };
  }

  // ---------- A business: its link, its chats, its payments ----------
  function forTenant(id) {
    return {
      status() {
        const s = st();
        return { ready: !!(s.token && s.chat_id), bot: s.bot || '',
          chats: q('SELECT name, username, linked_at FROM help_chats WHERE tenant_id = ? ORDER BY linked_at').all(id) };
      },
      link() {
        const s = st();
        if (!s.token || !s.chat_id) throw new HttpError(409, "To'lov va yordam boti hali ishga tushmagan");
        q('DELETE FROM help_codes WHERE tenant_id = ? OR created_at < ?').run(id, now() - 30 * DAY);
        const code = `h${crypto.randomBytes(9).toString('base64url').replace(/[^\w]/g, '').slice(0, 12)}`;
        q('INSERT INTO help_codes (code, tenant_id, created_at) VALUES (?, ?, ?)').run(code, id, now());
        return { ...this.status(), url: `https://t.me/${s.bot}?start=${code}` };
      },
      payments() {
        return q('SELECT id, method, status, months, amount, by_name, until_before, until_after, created_at, decided_at FROM help_payments WHERE tenant_id = ? ORDER BY id DESC LIMIT 50').all(id);
      },
    };
  }

  // ---------- Payments ----------
  const payButtons = (id) => ({ inline_keyboard: [[{ text: '✅ +1 oy', callback_data: `pd:${id}:1` }, { text: '✅ +3 oy', callback_data: `pd:${id}:3` }], [{ text: '✖️ Rad etish', callback_data: `pd:${id}:no` }]] });
  function payHead(p, c, t) {
    const pl = planFor(t);
    return [`${p.method === 'card' ? "💳 <b>To'lov — karta</b>" : "💵 <b>To'lov — naqd</b>"} #${p.id}`, whoText(c),
      `💰 Oylik: ${num(pl.fee)} so'm`, `🗓 Hozirgi muddat: ${t.paid_until ? `${day(t.paid_until)} gacha` : 'belgilanmagan'}`,
      p.method === 'cash' ? "\nPulni olganingizdan keyin muddatni tugma bilan uzaytiring." : ''].filter(Boolean).join('\n');
  }
  async function newPayment(c, method, msg) {
    const t = tenant(c.tenant_id);
    const s = st();
    const id = Number(q('INSERT INTO help_payments (tenant_id, chat_id, method, created_at) VALUES (?, ?, ?, ?)').run(t.id, c.chat_id, method, now()).lastInsertRowid);
    const p = q('SELECT * FROM help_payments WHERE id = ?').get(id);
    const head = payHead(p, c, t);
    let m;
    if (msg) m = await call('copyMessage', { chat_id: s.chat_id, from_chat_id: msg.chat.id, message_id: msg.message_id, caption: head, parse_mode: 'HTML', reply_markup: payButtons(id) });
    else m = await send(s.chat_id, head, { reply_markup: payButtons(id) });
    q('UPDATE help_payments SET admin_msg_id = ? WHERE id = ?').run(m.message_id, id);
    q("INSERT INTO help_messages (chat_id, tenant_id, dir, kind, text, admin_msg_id, created_at) VALUES (?, ?, 'in', ?, ?, ?, ?)")
      .run(c.chat_id, t.id, method === 'card' ? 'receipt' : 'cash', '', m.message_id, now());
    return p;
  }
  // The owner's decision: the term moves on from today or from the day it ends, whichever is later.
  async function decide(id, months, who) {
    const p = q('SELECT * FROM help_payments WHERE id = ?').get(id);
    if (!p) return "To'lov topilmadi";
    if (p.status !== 'pending') return p.status === 'approved' ? 'Allaqachon tasdiqlangan' : 'Allaqachon rad etilgan';
    const t = tenant(p.tenant_id);
    if (!t) return 'Biznes topilmadi';
    const s = st();
    const done = (text) => quiet(send(s.chat_id, text, { reply_to_message_id: p.admin_msg_id || undefined, allow_sending_without_reply: true }));
    if (!months) {
      q("UPDATE help_payments SET status = 'rejected', by_name = ?, decided_at = ? WHERE id = ?").run(who, now(), id);
      if (p.admin_msg_id) await quiet(call('editMessageReplyMarkup', { chat_id: s.chat_id, message_id: p.admin_msg_id, reply_markup: { inline_keyboard: [] } }));
      await done(`✖️ #${id} rad etildi${who ? ` — ${html(who)}` : ''}`);
      if (p.chat_id) await quiet(send(p.chat_id, "✖️ To'lov tasdiqlanmadi. Savolingiz bo'lsa, shu yerga yozing — javob beramiz.", { reply_markup: KEYBOARD }));
      return 'Rad etildi';
    }
    const before = t.paid_until || null;
    const after = addMonths(Math.max(now(), before || 0), months);
    const amount = planFor(t).fee * months;
    setPaidUntil(t.id, after);
    q("UPDATE help_payments SET status = 'approved', months = ?, amount = ?, by_name = ?, until_before = ?, until_after = ?, decided_at = ? WHERE id = ?")
      .run(months, amount, who, before, after, now(), id);
    if (p.admin_msg_id) await quiet(call('editMessageReplyMarkup', { chat_id: s.chat_id, message_id: p.admin_msg_id, reply_markup: { inline_keyboard: [] } }));
    await done(`✅ #${id} tasdiqlandi: +${months} oy (${num(amount)} so'm) · <b>${html(t.name)}</b> — endi <b>${day(after)}</b> gacha${who ? ` · ${html(who)}` : ''}`);
    const text = `✅ To'lov qabul qilindi: +${months} oy.\n🗓 FLOWI <b>${day(after)}</b> gacha to'langan. Rahmat!`;
    const chats = q('SELECT chat_id FROM help_chats WHERE tenant_id = ?').all(t.id).map((x) => x.chat_id);
    for (const ch of new Set([p.chat_id, ...chats].filter(Boolean))) await quiet(send(ch, text, { reply_markup: KEYBOARD }));
    return `+${months} oy — ${day(after)} gacha`;
  }

  // ---------- Reading the updates ----------
  async function linkAdmin(msg, s) {
    const title = msg.chat.title || [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(' ') || msg.chat.username || '';
    save({ ...s, chat_id: msg.chat.id, chat_title: title, link_code: '' });
    await quiet(send(msg.chat.id, "✅ To'lov va yordam boti ulandi.\n\nMijozlarning savollari va to'lovlari shu yerga keladi. Javob berish uchun mijoz xabariga <b>reply</b> qilib yozing."));
  }

  async function fromAdmin(msg, s) {
    const r = msg.reply_to_message;
    if (!r) {
      if (/^\/start/.test(msg.text || '')) await quiet(send(s.chat_id, 'Bu admin chati. Mijozga javob berish uchun uning xabariga reply qilib yozing.'));
      return;
    }
    const m = q('SELECT chat_id, tenant_id FROM help_messages WHERE admin_msg_id = ? ORDER BY id DESC LIMIT 1').get(r.message_id);
    if (!m) { await quiet(send(s.chat_id, "Bu xabar kimdan kelgani topilmadi. Mijozning o'z xabariga reply qiling.", { reply_to_message_id: msg.message_id })); return; }
    try {
      if (typeof msg.text === 'string') await send(m.chat_id, `💬 <b>FLOWI yordam:</b>\n${html(msg.text)}`, { reply_markup: KEYBOARD });
      else await call('copyMessage', { chat_id: m.chat_id, from_chat_id: msg.chat.id, message_id: msg.message_id });
      q("INSERT INTO help_messages (chat_id, tenant_id, dir, kind, text, created_at) VALUES (?, ?, 'out', ?, ?, ?)")
        .run(m.chat_id, m.tenant_id, typeof msg.text === 'string' ? 'text' : 'media', String(msg.text || msg.caption || '').slice(0, 4000), now());
    } catch (e) {
      await quiet(send(s.chat_id, `⚠️ Yuborilmadi: ${html(e.message)}${e.tgStatus === 403 ? ' (mijoz botni to\'xtatgan)' : ''}`, { reply_to_message_id: msg.message_id }));
    }
  }

  // A question goes to the admin chat under a header saying who wrote it.
  async function relay(msg, c, s) {
    const head = `🆘 ${whoText(c)}`;
    const captionable = msg.photo || msg.document || msg.voice || msg.video || msg.audio || msg.animation;
    let ids = [];
    if (typeof msg.text === 'string') ids = [(await send(s.chat_id, `${head}\n\n${html(msg.text)}`)).message_id];
    else if (captionable) {
      const cap = `${head}${msg.caption ? `\n\n${html(msg.caption)}` : ''}`.slice(0, 1024);
      ids = [(await call('copyMessage', { chat_id: s.chat_id, from_chat_id: msg.chat.id, message_id: msg.message_id, caption: cap, parse_mode: 'HTML' })).message_id];
    } else {
      const h = await send(s.chat_id, head);
      const cp = await call('copyMessage', { chat_id: s.chat_id, from_chat_id: msg.chat.id, message_id: msg.message_id, reply_to_message_id: h.message_id });
      ids = [h.message_id, cp.message_id];
    }
    for (const id of ids) {
      q("INSERT INTO help_messages (chat_id, tenant_id, dir, kind, text, admin_msg_id, created_at) VALUES (?, ?, 'in', ?, ?, ?, ?)")
        .run(c.chat_id, c.tenant_id || null, typeof msg.text === 'string' ? 'text' : 'media', String(msg.text || msg.caption || '').slice(0, 4000), id, now());
    }
  }

  const NOT_LINKED = "Avval biznesingizni ulang: FLOWI dasturida <b>Sozlamalar → Tarif → «Telegram botga ulanish»</b> tugmasini bosing.\n\nSavolingiz bo'lsa, shu yerga yozavering — javob beramiz.";

  async function fromClient(msg, s) {
    const c0 = touchChat(msg.from || msg.chat, msg.chat.id);
    const text = typeof msg.text === 'string' ? msg.text.trim() : null;
    const start = text && /^\/start(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
    if (start) {
      const code = start[1] && q('SELECT * FROM help_codes WHERE code = ? AND created_at > ?').get(start[1], now() - 30 * DAY);
      if (start[1] && code) {
        q('UPDATE help_chats SET tenant_id = ?, linked_at = ?, state = \'\' WHERE chat_id = ?').run(code.tenant_id, now(), c0.chat_id);
        const t = tenant(code.tenant_id);
        changed(code.tenant_id);
        await send(msg.chat.id, `✅ Ulandi: <b>${html(t.name)}</b>\n\nBu bot orqali FLOWI uchun to'lov qilasiz va yordam so'raysiz.\n\n${planText(t)}`, { reply_markup: KEYBOARD });
        await quiet(send(s.chat_id, `🔗 Botga ulandi:\n${whoText(chatRow(msg.chat.id))}`));
        return;
      }
      if (start[1]) { await send(msg.chat.id, `Bu havola eskirgan. ${NOT_LINKED}`, { reply_markup: KEYBOARD }); return; }
      await send(msg.chat.id, c0.tenant_id ? `Assalomu alaykum! FLOWI to'lov va yordam boti.\n\n${planText(tenant(c0.tenant_id))}` : `Assalomu alaykum! FLOWI to'lov va yordam boti.\n\n${NOT_LINKED}`, { reply_markup: KEYBOARD });
      return;
    }
    const c = c0;
    const t = c.tenant_id ? tenant(c.tenant_id) : null;
    if (text === BTN_PLAN) { await send(msg.chat.id, t ? planText(t) : NOT_LINKED, { reply_markup: KEYBOARD }); return; }
    if (text === BTN_HELP) { await send(msg.chat.id, '🆘 Savolingizni yozing — matn, rasm yoki ovozli xabar. Javob shu yerga keladi.', { reply_markup: KEYBOARD }); return; }
    if (text === BTN_PAY) {
      if (!t) { await send(msg.chat.id, NOT_LINKED, { reply_markup: KEYBOARD }); return; }
      await send(msg.chat.id, `${planText(t)}\n\nQanday to'laysiz?`, { reply_markup: { inline_keyboard: [[{ text: '💳 Karta orqali', callback_data: 'pay:card' }, { text: '💵 Naqd', callback_data: 'pay:cash' }]] } });
      return;
    }
    // The receipt after "Karta orqali".
    if (t && c.state === 'receipt' && now() - (c.state_at || 0) < RECEIPT_WAIT && (msg.photo || msg.document)) {
      setState(c.chat_id, '');
      const p = await newPayment(c, 'card', msg);
      await send(msg.chat.id, `✅ Chek qabul qilindi (#${p.id}). Tekshirib, muddatni uzaytiramiz va shu yerga xabar beramiz.`, { reply_markup: KEYBOARD });
      return;
    }
    // "Delivered" once per conversation, not after every line.
    const talking = q("SELECT 1 FROM help_messages WHERE chat_id = ? AND dir = 'in' AND created_at > ?").get(c.chat_id, now() - 10 * 60 * 1000);
    await relay(msg, c, s);
    if (!talking) await quiet(send(msg.chat.id, '✅ Xabaringiz yetkazildi. Tez orada javob beramiz.', { reply_markup: KEYBOARD }));
  }

  async function onCallback(cb, s) {
    const chat = cb.message && cb.message.chat && cb.message.chat.id;
    const answer = (text) => quiet(call('answerCallbackQuery', { callback_query_id: cb.id, text }));
    const d = /^pd:(\d+):(1|3|no)$/.exec(cb.data || '');
    if (d) {
      if (String(chat) !== String(s.chat_id)) return answer("Bu tugmani faqat admin bosa oladi");
      const who = [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' ');
      return answer(await decide(Number(d[1]), d[2] === 'no' ? 0 : Number(d[2]), who));
    }
    const pm = /^pay:(card|cash)$/.exec(cb.data || '');
    if (!pm) return answer('');
    const c = touchChat(cb.from, chat);
    const t = c.tenant_id ? tenant(c.tenant_id) : null;
    if (!t) { await answer(''); await send(chat, NOT_LINKED, { reply_markup: KEYBOARD }); return null; }
    const fee = planFor(t).fee;
    if (pm[1] === 'card') {
      if (!s.card_number) { await answer(''); await send(chat, "Karta raqami hali kiritilmagan. «🆘 Yordam» orqali yozing — rekvizitlarni yuboramiz.", { reply_markup: KEYBOARD }); return null; }
      setState(c.chat_id, 'receipt');
      await answer('');
      await send(chat, [`💳 <b>Karta orqali to'lov</b>`, '', `Karta: <code>${html(s.card_number)}</code>`, s.card_owner ? `Egasi: <b>${html(s.card_owner)}</b>` : null,
        `Summa: <b>${num(fee)} so'm</b> (1 oy) yoki <b>${num(fee * 3)} so'm</b> (3 oy)`, '', "To'lagach, <b>chek rasmini</b> (skrinshot) shu yerga yuboring."].filter((x) => x !== null).join('\n'), { reply_markup: KEYBOARD });
      return null;
    }
    // Cash: the owner is told; the term moves when they press the button after taking the money.
    const open = q("SELECT id FROM help_payments WHERE tenant_id = ? AND method = 'cash' AND status = 'pending' AND created_at > ?").get(t.id, now() - DAY);
    await answer('');
    if (open) { await send(chat, `Naqd to'lov haqidagi xabaringiz allaqachon yuborilgan (#${open.id}). Tez orada bog'lanamiz.`, { reply_markup: KEYBOARD }); return null; }
    const p = await newPayment(c, 'cash', null);
    await send(chat, `💵 Naqd to'lov haqida xabar berildi (#${p.id}). Siz bilan bog'lanamiz; pulni topshirganingizdan keyin muddat uzaytiriladi.\nSumma: <b>${num(fee)} so'm</b> (1 oy).`, { reply_markup: KEYBOARD });
    return null;
  }

  async function onUpdate(u) {
    const s = st();
    if (u.callback_query) { await onCallback(u.callback_query, s); return; }
    const msg = u.message;
    if (!msg || !msg.chat) return;
    const text = typeof msg.text === 'string' ? msg.text.trim() : '';
    if (!s.chat_id) {
      const m = /^\/start(?:@\w+)?\s+(\d{6})$/.exec(text) || /^(\d{6})$/.exec(text);
      if (m && s.link_code && m[1] === s.link_code) { await linkAdmin(msg, s); return; }
      if (msg.chat.type === 'private') await quiet(send(msg.chat.id, "Bot hali sozlanmoqda. Birozdan keyin qayta yozing."));
      return;
    }
    if (String(msg.chat.id) === String(s.chat_id)) { await fromAdmin(msg, s); return; }
    if (msg.chat.type !== 'private') return; // groups: only the admin chat
    await fromClient(msg, s);
  }

  // ---------- Reminders: 3 days and 1 day before the term ends, and the day it ends (9:00–21:00) ----------
  let remindBusy = false;
  async function remindTick({ anyHour = false } = {}) {
    const s = st();
    if (remindBusy || !s.token || !s.chat_id) return;
    const h = new Date(now()).getHours();
    if (!anyHour && (h < 9 || h >= 21)) return;
    remindBusy = true;
    try {
      const ids = q('SELECT DISTINCT tenant_id FROM help_chats WHERE tenant_id IS NOT NULL').all().map((x) => x.tenant_id);
      for (const id of ids) {
        const t = tenant(id);
        if (!t || t.status !== 'active' || !t.paid_until) continue;
        const left = t.paid_until - now();
        const stage = left <= 0 ? (left > -2 * DAY ? 'd0' : null) : left <= DAY ? 'd1' : left <= 3 * DAY ? 'd3' : null;
        if (!stage) continue;
        const ins = q('INSERT OR IGNORE INTO help_reminders (tenant_id, paid_until, stage, sent_at) VALUES (?, ?, ?, ?)');
        if (!ins.run(id, t.paid_until, stage, now()).changes) continue;
        // A later stage covers the earlier ones (no "3 days left" after "1 day left").
        for (const x of { d0: ['d1', 'd3'], d1: ['d3'], d3: [] }[stage]) ins.run(id, t.paid_until, x, now());
        const p = planFor(t);
        const text = stage === 'd0'
          ? `⚠️ FLOWI to'lov muddati <b>tugadi</b> (${day(t.paid_until)}).${p.grace_until && p.grace_until > now() ? `\nDastur ${day(p.grace_until)} gacha ishlaydi, keyin faqat ko'rish rejimiga o'tadi.` : ''}\n💰 Oylik: <b>${num(p.fee)} so'm</b>. To'lash uchun «${BTN_PAY}» tugmasini bosing.`
          : `⏰ FLOWI to'lov muddati <b>${stage === 'd1' ? 'ertaga' : '3 kundan keyin'}</b> (${day(t.paid_until)}) tugaydi.\n💰 Oylik: <b>${num(p.fee)} so'm</b>. To'lash uchun «${BTN_PAY}» tugmasini bosing.`;
        for (const c of q('SELECT chat_id FROM help_chats WHERE tenant_id = ?').all(id)) await quiet(send(c.chat_id, text, { reply_markup: KEYBOARD }));
      }
    } finally { remindBusy = false; }
  }

  // ---------- Long polling ----------
  let running = false;
  let abort = null;
  let wake = null;
  const sleep = (ms) => new Promise((r) => { const tm = setTimeout(r, ms); tm.unref(); wake = () => { clearTimeout(tm); r(); }; });
  function kick() { if (abort) abort.abort(); if (wake) wake(); }
  async function loop() {
    while (running) {
      const s = st();
      if (!s.token) { await sleep(30 * 1000); continue; }
      try {
        abort = new AbortController();
        const updates = await call('getUpdates', { offset: s.offset || 0, timeout: 25, allowed_updates: ['message', 'callback_query'] }, { token: s.token, signal: abort.signal });
        for (const u of updates) {
          save({ ...st(), offset: u.update_id + 1 });
          try { await onUpdate(u); } catch (e) { log.error(`Yordam boti: ${e.message}`); }
        }
        if (st().error) save({ ...st(), error: '' });
      } catch (e) {
        if (!running) break;
        if (e.name === 'AbortError') continue;
        save({ ...st(), error: e.message });
        await sleep(e.tgStatus === 409 ? 60 * 1000 : 15 * 1000);
      } finally { abort = null; }
    }
  }
  function start() { if (running) return; running = true; loop(); }
  function stop() { running = false; kick(); }

  // A payment the owner records by hand in the panel (cash taken in person): the same history, no Telegram needed.
  function manualPayment(tenantId, months, who) {
    const t = tenant(tenantId);
    if (!t) throw new HttpError(404, 'Biznes topilmadi');
    if (![1, 2, 3, 6, 12].includes(months)) throw new HttpError(400, "Oy soni noto'g'ri");
    const before = t.paid_until || null;
    const after = addMonths(Math.max(now(), before || 0), months);
    const amount = planFor(t).fee * months;
    setPaidUntil(t.id, after);
    q("INSERT INTO help_payments (tenant_id, method, status, months, amount, by_name, until_before, until_after, created_at, decided_at) VALUES (?, 'manual', 'approved', ?, ?, ?, ?, ?, ?, ?)")
      .run(t.id, months, amount, who || '', before, after, now(), now());
    return { paid_until: after };
  }

  return { status, setToken, relink, unlink, test, forTenant, remindTick, start, stop, decide, manualPayment, addMonths };
}

module.exports = { createHelpBot, addMonths };
