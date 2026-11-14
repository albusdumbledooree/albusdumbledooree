'use strict';
/*
 * "Konkurs" — a Telegram bot anyone can use to hold a giveaway in their own channel. It belongs to the platform only:
 * the businesses' programs know nothing about it.
 *
 * - The platform owner pastes the bot's token in the platform panel ("Konkurs" tab) and sees every contest there,
 *   can stop new ones, finish or cancel any contest and block a person.
 * - Anyone writes to the bot: "➕ Yangi konkurs" → the channel (the bot must be its admin and the person too) → the text
 *   (a photo may come with it) → how many winners → when it ends → a preview → "Kanalga joylash".
 * - The post in the channel has one button, "✅ Ishtirok etaman (N)". Pressing it: the bot checks the person is
 *   subscribed and gives them a number (the answer pops up right there; nothing is written to them in private).
 * - At the end the bot picks the winners at random (crypto), skipping anyone who has left the channel, and announces
 *   them in the channel under the post. The organiser gets the list in private; the winners get a note if they ever
 *   wrote to the bot (Telegram does not let a bot write first).
 * - Telegram does not give bots the list of a channel's subscribers, and channel polls are anonymous: that is why the
 *   participants are the people who press the button.
 * Limits against abuse: a few running contests per person, a few new ones a day, at most 30 days long.
 * Updates are read by long polling, like the platform's other bots: no public webhook address is needed.
 */
const crypto = require('node:crypto');
const { HttpError, str } = require('./util');

const MIN = 60 * 1000; const HOUR = 60 * MIN; const DAY = 24 * HOUR;
const MAX_ACTIVE = 3; // running contests of one person at a time
const MAX_PER_DAY = 5; // new contests of one person in a day
const MAX_DAYS = 30;
const MAX_TEXT = 800; // a photo's caption holds 1024 characters; the rest is our own lines
const TZ_OFFSET = 5 * HOUR; // the dates people type and read are Tashkent time
const SCHEMA = `
CREATE TABLE IF NOT EXISTS gw_users (
  tg_id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '', banned INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, seen_at INTEGER
);
CREATE TABLE IF NOT EXISTS gw_contests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, owner_tg TEXT NOT NULL, channel_id TEXT NOT NULL, channel_title TEXT NOT NULL DEFAULT '',
  channel_username TEXT NOT NULL DEFAULT '', message_id INTEGER, text TEXT NOT NULL DEFAULT '', photo TEXT NOT NULL DEFAULT '',
  winners_n INTEGER NOT NULL DEFAULT 1, ends_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  winners TEXT NOT NULL DEFAULT '[]', shown_count INTEGER NOT NULL DEFAULT 0, shown_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS gw_contests_status ON gw_contests(status, ends_at);
CREATE INDEX IF NOT EXISTS gw_contests_owner ON gw_contests(owner_tg, created_at);
CREATE TABLE IF NOT EXISTS gw_participants (
  contest_id INTEGER NOT NULL, tg_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '',
  no INTEGER NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY (contest_id, tg_id)
);
`;

const BTN_NEW = '➕ Yangi konkurs';
const BTN_MINE = '📋 Konkurslarim';
const BTN_HELP = '❓ Yordam';
const BTN_CANCEL = '❌ Bekor qilish';
const MENU = { keyboard: [[{ text: BTN_NEW }], [{ text: BTN_MINE }, { text: BTN_HELP }]], resize_keyboard: true, is_persistent: true };
const CANCEL_KB = { keyboard: [[{ text: BTN_CANCEL }]], resize_keyboard: true };
const html = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
// A moment as Tashkent sees it: "20.11.2026 20:00".
function when(ms) {
  const d = new Date(ms + TZ_OFFSET);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
// "20.11 20:00", "20.11.2026 20:00", "20.11.2026, 20:00" (Tashkent time) → ms, or null.
function parseWhen(text, nowMs) {
  const m = /^\s*(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?[\s,]+(\d{1,2})[:.](\d{2})\s*$/.exec(String(text || ''));
  if (!m) return null;
  const today = new Date(nowMs + TZ_OFFSET);
  let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getUTCFullYear();
  const [dd, mm, hh, mi] = [Number(m[1]), Number(m[2]), Number(m[4]), Number(m[5])];
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || hh > 23 || mi > 59) return null;
  let ms = Date.UTC(year, mm - 1, dd, hh, mi) - TZ_OFFSET;
  if (new Date(ms + TZ_OFFSET).getUTCDate() !== dd) return null; // 31.02
  if (!m[3] && ms < nowMs) { year += 1; ms = Date.UTC(year, mm - 1, dd, hh, mi) - TZ_OFFSET; } // "05.01" said in December
  return ms;
}
const personName = (from) => [from.first_name, from.last_name].filter(Boolean).join(' ').slice(0, 80) || 'Ishtirokchi';
const mention = (p) => `<a href="tg://user?id=${html(p.tg_id)}">${html(p.name || 'Ishtirokchi')}</a>${p.username ? ` (@${html(p.username)})` : ''}`;

function createGiveaway({ pdb, pget, pset, now = Date.now, log = console, otherTokens = () => [] }) {
  const apiBase = () => process.env.TELEGRAM_API || 'https://api.telegram.org';
  pdb.exec(SCHEMA);
  const q = (sql) => pdb.prepare(sql);

  function st() { try { return JSON.parse(pget('giveaway', '{}')) || {}; } catch { return {}; } }
  function save(o) { pset('giveaway', JSON.stringify(o)); }

  // Telegram allows about 30 messages a second for a bot: every call waits its turn, a few tens of ms apart.
  let lane = Promise.resolve();
  function paced(fn) {
    const p = lane.then(fn);
    lane = p.catch(() => {}).then(() => new Promise((ok) => setTimeout(ok, 40)));
    return p;
  }
  async function call(method, params, { token = st().token, signal, direct = false } = {}) {
    if (!token) throw new HttpError(400, 'Konkurs boti ulanmagan');
    const go = async () => {
      let res;
      try {
        res = await fetch(`${apiBase()}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}), signal });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        throw new HttpError(502, "Telegram bilan aloqa yo'q. Server internetini tekshiring");
      }
      const j = await res.json().catch(() => ({}));
      if (!j.ok) {
        const bad = method === 'getMe' && (res.status === 401 || res.status === 404);
        const err = new HttpError(bad ? 400 : 502, bad ? "Bot tokeni noto'g'ri" : `Telegram: ${j.description || res.status}`);
        err.tgStatus = res.status; err.tgText = String(j.description || '');
        throw err;
      }
      return j.result;
    };
    return direct ? go() : paced(go);
  }
  const send = (chatId, text, extra = {}) => call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
  const quiet = (p) => p.catch((e) => { log.error(`Konkurs boti: ${e.message}`); return null; });

  // ---------- People ----------
  const userRow = (id) => q('SELECT * FROM gw_users WHERE tg_id = ?').get(String(id));
  function touch(from) {
    q(`INSERT INTO gw_users (tg_id, name, username, created_at, seen_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(tg_id) DO UPDATE SET name = excluded.name, username = excluded.username, seen_at = excluded.seen_at`)
      .run(String(from.id), personName(from), from.username || '', now(), now());
    return userRow(from.id);
  }
  const getState = (u) => { try { return JSON.parse(u.state || '{}') || {}; } catch { return {}; } };
  const setState = (id, s) => q('UPDATE gw_users SET state = ? WHERE tg_id = ?').run(s ? JSON.stringify(s) : '', String(id));

  // ---------- Contests ----------
  const contestRow = (id) => q('SELECT * FROM gw_contests WHERE id = ?').get(Number(id));
  const countOf = (id) => q('SELECT COUNT(*) c FROM gw_participants WHERE contest_id = ?').get(Number(id)).c;
  const joinButton = (c, n) => ({ inline_keyboard: [[{ text: `✅ Ishtirok etaman (${n})`, callback_data: `gj:${c.id}` }]] });
  const closedButton = (label) => ({ inline_keyboard: [[{ text: label, callback_data: 'gx' }]] });
  function postText(d) {
    const bot = st().bot;
    return [`🎁 <b>KONKURS</b>`, '', html(d.text), '', `🏆 G'oliblar soni: <b>${d.winners_n}</b>`,
      `🗓 Natija: <b>${when(d.ends_at)}</b> (Toshkent vaqti)`, '', "Ishtirok etish uchun pastdagi tugmani bosing 👇",
      bot ? `\n🤖 <a href="https://t.me/${bot}">@${html(bot)}</a> — o'z kanalingizda konkurs o'tkazing` : ''].filter((x) => x !== null).join('\n').trim();
  }
  const postLink = (c) => (c.channel_username && c.message_id ? `https://t.me/${c.channel_username}/${c.message_id}` : '');

  // The organiser's limits, and the platform's switch for new contests.
  function canCreate(u) {
    const s = st();
    if (u.banned) return "Sizga konkurs ochish cheklangan.";
    if (s.closed) return "Yangi konkurs ochish vaqtincha to'xtatilgan. Keyinroq urinib ko'ring.";
    const active = q("SELECT COUNT(*) c FROM gw_contests WHERE owner_tg = ? AND status = 'active'").get(u.tg_id).c;
    if (active >= MAX_ACTIVE) return `Bir vaqtda ${MAX_ACTIVE} tadan ortiq konkurs o'tkazib bo'lmaydi. Avvalgisi tugashini kuting.`;
    const today = q('SELECT COUNT(*) c FROM gw_contests WHERE owner_tg = ? AND created_at > ?').get(u.tg_id, now() - DAY).c;
    if (today >= MAX_PER_DAY) return `Bir kunda ${MAX_PER_DAY} tadan ortiq konkurs ochib bo'lmaydi. Ertaga urinib ko'ring.`;
    return '';
  }

  // Is this person in the channel? null when the bot cannot tell (it is no longer an admin there, …).
  async function isMember(channelId, userId) {
    try {
      const m = await call('getChatMember', { chat_id: channelId, user_id: Number(userId) });
      return ['creator', 'administrator', 'member'].includes(m.status) || (m.status === 'restricted' && m.is_member !== false);
    } catch (e) { return null; }
  }

  // ---------- The wizard in private ----------
  async function menu(chatId, text) {
    return send(chatId, text || "Kerakli bo'limni tanlang 👇", { reply_markup: MENU });
  }
  const HELP = [
    "🎁 <b>Konkurs boti</b> — kanalingizda obunachilar orasida sovg'a o'ynash uchun.",
    '',
    "<b>Qanday ishlaydi:</b>",
    "1. Botni kanalingizga <b>admin</b> qiling (xabar joylash huquqi bilan).",
    `2. "${BTN_NEW}" ni bosing va savollarga javob bering.`,
    "3. Bot kanalga post joylaydi, ostida \"✅ Ishtirok etaman\" tugmasi bo'ladi.",
    "4. Tugmani bosgan obunachilar ro'yxatga yoziladi (obuna bo'lmaganlar yozilmaydi).",
    "5. Vaqt kelganda bot g'olibni tasodifiy tanlaydi va kanalga e'lon qiladi.",
    '',
    `Cheklovlar: bir vaqtda ${MAX_ACTIVE} ta konkurs, kuniga ${MAX_PER_DAY} ta, eng uzog'i ${MAX_DAYS} kun.`,
  ].join('\n');

  async function startNew(u, chatId) {
    const why = canCreate(u);
    if (why) return menu(chatId, `⚠️ ${why}`);
    setState(u.tg_id, { step: 'channel' });
    return send(chatId, [
      "1️⃣ <b>Kanal</b>",
      '',
      "Avval botni kanalingizga admin qiling (\"Xabar joylash\" huquqi bilan).",
      "Keyin kanal manzilini yuboring (masalan <code>@kanalim</code>) yoki kanaldagi istalgan postni shu yerga forward qiling.",
    ].join('\n'), { reply_markup: CANCEL_KB });
  }

  // Which channel the person means: a forwarded post, @name or a t.me link.
  function channelRef(msg) {
    const o = msg.forward_origin;
    if (o && o.type === 'channel' && o.chat) return o.chat.id;
    if (msg.forward_from_chat && msg.forward_from_chat.type === 'channel') return msg.forward_from_chat.id;
    const t = String(msg.text || '').trim();
    const m = /^(?:https?:\/\/)?(?:t\.me\/|telegram\.me\/)?@?([A-Za-z][A-Za-z0-9_]{3,31})\/?$/.exec(t);
    return m ? `@${m[1]}` : null;
  }

  async function onChannel(u, chatId, msg) {
    const ref = channelRef(msg);
    if (!ref) return send(chatId, "Kanal manzilini <code>@kanalim</code> ko'rinishida yuboring yoki kanaldan postni forward qiling.");
    let chat;
    try { chat = await call('getChat', { chat_id: ref }); } catch (e) {
      return send(chatId, "Bu kanalni topa olmadim. Manzil to'g'rimi va bot kanalga admin qilinganmi?");
    }
    if (chat.type !== 'channel') return send(chatId, 'Bu kanal emas. Konkurs faqat kanalda o\'tkaziladi.');
    const me = st().bot_id;
    let botM = null;
    try { botM = await call('getChatMember', { chat_id: chat.id, user_id: Number(me) }); } catch (e) { /* not there */ }
    if (!botM || botM.status !== 'administrator' || botM.can_post_messages === false) {
      return send(chatId, `Bot <b>${html(chat.title)}</b> kanalida admin emas. Botni admin qiling ("Xabar joylash" huquqi bilan) va qayta yuboring.`);
    }
    let userM = null;
    try { userM = await call('getChatMember', { chat_id: chat.id, user_id: Number(u.tg_id) }); } catch (e) { /* not there */ }
    if (!userM || !['creator', 'administrator'].includes(userM.status)) {
      return send(chatId, `Konkursni faqat <b>${html(chat.title)}</b> kanalining egasi yoki admini ocha oladi.`);
    }
    setState(u.tg_id, { step: 'text', channel: { id: String(chat.id), title: chat.title || '', username: chat.username || '' } });
    return send(chatId, [
      `✅ Kanal: <b>${html(chat.title)}</b>`, '',
      "2️⃣ <b>Konkurs matni</b>", '',
      "Sovrin va shartlarni yozing. Rasm bilan yuborsangiz (rasm ostiga matn), post rasmli bo'ladi.",
      `Ko'pi bilan ${MAX_TEXT} belgi.`,
    ].join('\n'), { reply_markup: CANCEL_KB });
  }

  async function onText(u, chatId, msg, s) {
    const photo = Array.isArray(msg.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1].file_id : '';
    const text = String(photo ? msg.caption || '' : msg.text || '').trim();
    if (!text) return send(chatId, photo ? "Rasm ostiga konkurs matnini ham yozing (rasmni matn bilan birga yuboring)." : 'Konkurs matnini yozing.');
    if (text.length > MAX_TEXT) return send(chatId, `Matn juda uzun: ${text.length} belgi. Ko'pi bilan ${MAX_TEXT} belgi bo'lsin.`);
    setState(u.tg_id, { ...s, step: 'winners', text, photo });
    return send(chatId, "3️⃣ <b>Nechta g'olib?</b>\n\nTugmani bosing yoki sonni yozing (1–20).", {
      reply_markup: { inline_keyboard: [[1, 2, 3, 5, 10].map((n) => ({ text: String(n), callback_data: `gwn:${n}` }))] },
    });
  }
  async function setWinners(u, chatId, s, n) {
    if (!Number.isInteger(n) || n < 1 || n > 20) return send(chatId, "G'oliblar soni 1 dan 20 gacha bo'lsin.");
    setState(u.tg_id, { ...s, step: 'end', winners_n: n });
    return send(chatId, [
      `✅ G'oliblar: <b>${n}</b>`, '',
      "4️⃣ <b>Qachon tugaydi?</b>", '',
      "Tugmani bosing yoki sana va vaqtni yozing, masalan: <code>25.11 20:00</code> (Toshkent vaqti).",
    ].join('\n'), {
      reply_markup: { inline_keyboard: [[{ text: '1 soat', callback_data: 'gwe:1' }, { text: '6 soat', callback_data: 'gwe:6' }, { text: '1 kun', callback_data: 'gwe:24' }],
        [{ text: '3 kun', callback_data: 'gwe:72' }, { text: '7 kun', callback_data: 'gwe:168' }]] },
    });
  }
  async function setEnd(u, chatId, s, ms) {
    if (!ms || ms < now() + 10 * MIN) return send(chatId, "Tugash vaqti kamida 10 daqiqadan keyin bo'lsin. Masalan: <code>25.11 20:00</code>");
    if (ms > now() + MAX_DAYS * DAY) return send(chatId, `Konkurs ${MAX_DAYS} kundan uzoq bo'lmaydi.`);
    const draft = { ...s, step: 'confirm', ends_at: ms };
    setState(u.tg_id, draft);
    await send(chatId, `5️⃣ <b>Ko'rib chiqing</b> — kanalda shunday chiqadi (${html(s.channel.title)}):`, { reply_markup: { remove_keyboard: true } });
    const preview = { reply_markup: { inline_keyboard: [[{ text: '✅ Kanalga joylash', callback_data: 'gwc:post' }], [{ text: '❌ Bekor qilish', callback_data: 'gwc:cancel' }]] } };
    if (draft.photo) return call('sendPhoto', { chat_id: chatId, photo: draft.photo, caption: postText(draft), parse_mode: 'HTML', ...preview });
    return send(chatId, postText(draft), preview);
  }

  async function publish(u, chatId, s) {
    const why = canCreate(u);
    if (why) { setState(u.tg_id, null); return menu(chatId, `⚠️ ${why}`); }
    if (!s || s.step !== 'confirm') return menu(chatId);
    if (s.ends_at < now() + 5 * MIN) return send(chatId, "Tugash vaqti juda yaqin qoldi. Qaytadan boshlang.");
    const id = Number(q('INSERT INTO gw_contests (owner_tg, channel_id, channel_title, channel_username, text, photo, winners_n, ends_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(u.tg_id, s.channel.id, s.channel.title, s.channel.username, s.text, s.photo || '', s.winners_n, s.ends_at, 'posting', now()).lastInsertRowid);
    const c = contestRow(id);
    try {
      const params = { chat_id: c.channel_id, parse_mode: 'HTML', reply_markup: joinButton(c, 0) };
      const m = c.photo ? await call('sendPhoto', { ...params, photo: c.photo, caption: postText(c) })
        : await call('sendMessage', { ...params, text: postText(c), disable_web_page_preview: true });
      q("UPDATE gw_contests SET message_id = ?, status = 'active' WHERE id = ?").run(m.message_id, id);
    } catch (e) {
      q("UPDATE gw_contests SET status = 'failed' WHERE id = ?").run(id);
      setState(u.tg_id, null);
      return menu(chatId, `❌ Kanalga joylab bo'lmadi: ${html(e.tgText || e.message)}\nBot kanalda admin ekanini tekshiring.`);
    }
    setState(u.tg_id, null);
    const link = postLink(contestRow(id));
    return menu(chatId, [`✅ Konkurs joylandi! #${id}`, link ? `🔗 ${link}` : '', `🗓 Natija: ${when(c.ends_at)} da avtomatik e'lon qilinadi.`, '',
      `Boshqarish: "${BTN_MINE}".`].filter(Boolean).join('\n'));
  }

  async function mine(u, chatId) {
    const rows = q('SELECT * FROM gw_contests WHERE owner_tg = ? AND status != ? ORDER BY id DESC LIMIT 8').all(u.tg_id, 'posting');
    if (!rows.length) return menu(chatId, `Sizda hali konkurs yo'q. "${BTN_NEW}" ni bosing.`);
    await send(chatId, '📋 <b>Konkurslaringiz</b>');
    for (const c of rows) {
      const n = countOf(c.id);
      const head = `#${c.id} · <b>${html(c.channel_title)}</b>\n${html(c.text.slice(0, 80))}${c.text.length > 80 ? '…' : ''}\n👥 ${n} ishtirokchi · `;
      const tail = c.status === 'active' ? `natija ${when(c.ends_at)}` : c.status === 'done' ? `yakunlangan` : c.status === 'cancelled' ? 'bekor qilingan' : 'joylanmagan';
      const kb = c.status === 'active' ? { reply_markup: { inline_keyboard: [[{ text: '🏁 Hozir yakunlash', callback_data: `gwf:${c.id}` }, { text: '🗑 Bekor qilish', callback_data: `gwx:${c.id}` }]] } } : {};
      await send(chatId, head + tail, kb);
    }
    return null;
  }

  // ---------- Pressing the button in the channel ----------
  async function join(cb, id) {
    const c = contestRow(id);
    const answer = (text) => call('answerCallbackQuery', { callback_query_id: cb.id, text, show_alert: true });
    if (!c || c.status !== 'active' || c.ends_at <= now()) return answer('Bu konkurs yakunlangan.');
    const was = q('SELECT no FROM gw_participants WHERE contest_id = ? AND tg_id = ?').get(c.id, String(cb.from.id));
    if (was) return answer(`Siz allaqachon ishtirokchisiz ✅\nRaqamingiz: ${was.no}\nNatija: ${when(c.ends_at)}`);
    if (cb.from.is_bot) return answer('Botlar qatnasha olmaydi.');
    const member = await isMember(c.channel_id, cb.from.id);
    if (member === null) return answer("Hozir tekshirib bo'lmadi. Birozdan keyin qayta bosing.");
    if (!member) return answer(`Ishtirok etish uchun avval kanalga obuna bo'ling, keyin tugmani yana bosing.`);
    // One statement: the next number and the row together (a second press in the same moment is ignored).
    q(`INSERT OR IGNORE INTO gw_participants (contest_id, tg_id, name, username, no, joined_at)
      SELECT ?, ?, ?, ?, COALESCE(MAX(no), 0) + 1, ? FROM gw_participants WHERE contest_id = ?`)
      .run(c.id, String(cb.from.id), personName(cb.from), cb.from.username || '', now(), c.id);
    const mineNo = q('SELECT no FROM gw_participants WHERE contest_id = ? AND tg_id = ?').get(c.id, String(cb.from.id)).no;
    return answer(`✅ Siz konkursda ishtirok etyapsiz!\nRaqamingiz: ${mineNo}\nNatija: ${when(c.ends_at)} (Toshkent vaqti)`);
  }

  // The number on the button follows the joins, at most every 15 seconds per post (Telegram counts edits too).
  async function refreshCounts() {
    for (const c of q("SELECT * FROM gw_contests WHERE status = 'active' AND message_id IS NOT NULL").all()) {
      const n = countOf(c.id);
      if (n === c.shown_count || now() - c.shown_at < 15 * 1000) continue;
      q('UPDATE gw_contests SET shown_count = ?, shown_at = ? WHERE id = ?').run(n, now(), c.id);
      await quiet(call('editMessageReplyMarkup', { chat_id: c.channel_id, message_id: c.message_id, reply_markup: joinButton(c, n) }));
    }
  }

  // ---------- The draw ----------
  async function draw(id, { by = 'time' } = {}) {
    const c = contestRow(id);
    if (!c || c.status !== 'active') throw new HttpError(409, 'Bu konkurs faol emas');
    // Taken at once, so a second tick (or a second press) never draws the same contest twice.
    if (q("UPDATE gw_contests SET status = 'drawing' WHERE id = ? AND status = 'active'").run(c.id).changes !== 1) throw new HttpError(409, 'Bu konkurs faol emas');
    const people = q('SELECT * FROM gw_participants WHERE contest_id = ? ORDER BY no').all(c.id);
    const pool = people.slice();
    const winners = [];
    let checked = 0;
    // Random order, without repeats; anyone who left the channel since is skipped (a few dozen checks at most).
    while (pool.length && winners.length < c.winners_n && checked < c.winners_n + 50) {
      const p = pool.splice(crypto.randomInt(pool.length), 1)[0];
      checked += 1;
      const m = await isMember(c.channel_id, p.tg_id);
      if (m === false) continue;
      winners.push({ tg_id: p.tg_id, name: p.name, username: p.username, no: p.no });
    }
    q("UPDATE gw_contests SET status = 'done', winners = ?, finished_at = ? WHERE id = ?").run(JSON.stringify(winners), now(), c.id);
    const total = people.length;
    const text = winners.length
      ? [`🎉 <b>Konkurs yakunlandi!</b>`, '', winners.length > 1 ? "🏆 <b>G'oliblar:</b>" : "🏆 <b>G'olib:</b>",
        ...winners.map((w, i) => `${winners.length > 1 ? `${i + 1}. ` : ''}${mention(w)} — №${w.no}`), '',
        `👥 Ishtirokchilar: ${total} ta`, `🎲 G'olib bot tomonidan tasodifiy tanlandi.`, '', "Tabriklaymiz! 🎁"].join('\n')
      : [`🏁 <b>Konkurs yakunlandi</b>`, '', total ? "Ishtirokchilarning hech biri kanalda qolmagan — g'olib aniqlanmadi." : "Konkursda hech kim qatnashmadi."].join('\n');
    const reply = c.message_id ? { reply_parameters: { message_id: c.message_id, allow_sending_without_reply: true } } : {};
    await quiet(send(c.channel_id, text, reply));
    if (c.message_id) await quiet(call('editMessageReplyMarkup', { chat_id: c.channel_id, message_id: c.message_id, reply_markup: closedButton(`🏁 Yakunlandi · ${total} ishtirokchi`) }));
    await quiet(send(c.owner_tg, [`🏁 Konkurs #${c.id} yakunlandi (${html(c.channel_title)}).`, `👥 Ishtirokchilar: ${total}`, '',
      winners.length ? `🏆 G'olib(lar):\n${winners.map((w) => `• ${mention(w)} — №${w.no}`).join('\n')}` : "G'olib yo'q.",
      by === 'admin' ? '\n(platforma tomonidan yakunlandi)' : ''].join('\n')));
    for (const w of winners) {
      // Only those who once wrote to the bot can get a private note; the rest learn it from the channel.
      if (userRow(w.tg_id)) await quiet(send(w.tg_id, `🏆 <b>Tabriklaymiz!</b> Siz <b>${html(c.channel_title)}</b> kanalidagi konkursda g'olib bo'ldingiz! Sovg'a bo'yicha kanal egasi siz bilan bog'lanadi.`));
    }
    return { winners, participants: total };
  }

  async function cancel(id, { by = 'owner' } = {}) {
    const c = contestRow(id);
    if (!c || c.status !== 'active') throw new HttpError(409, 'Bu konkurs faol emas');
    q("UPDATE gw_contests SET status = 'cancelled', finished_at = ? WHERE id = ?").run(now(), c.id);
    if (c.message_id) await quiet(call('editMessageReplyMarkup', { chat_id: c.channel_id, message_id: c.message_id, reply_markup: closedButton('❌ Konkurs bekor qilindi') }));
    if (by === 'admin') await quiet(send(c.owner_tg, `❌ Konkurs #${c.id} (${html(c.channel_title)}) platforma tomonidan bekor qilindi.`));
    return { ok: true };
  }

  // Every half a minute: the counters, and the contests whose time has come.
  let ticking = false;
  async function tick() {
    if (ticking || !st().token) return;
    ticking = true;
    try {
      await refreshCounts();
      for (const c of q("SELECT id FROM gw_contests WHERE status = 'active' AND ends_at <= ? ORDER BY ends_at").all(now())) {
        try { await draw(c.id); } catch (e) { log.error(`Konkurs #${c.id}: ${e.message}`); }
      }
    } finally { ticking = false; }
  }

  // ---------- Updates ----------
  async function onMessage(msg) {
    if (!msg.chat || msg.chat.type !== 'private' || !msg.from || msg.from.is_bot) return;
    const chatId = msg.chat.id;
    const u = touch(msg.from);
    const s = getState(u);
    const text = String(msg.text || '').trim();
    if (text === '/start' || text.startsWith('/start ') || text === '/menu') { setState(u.tg_id, null); return menu(chatId, `Assalomu alaykum! 👋\n\n${HELP}`); }
    if (text === BTN_CANCEL || text === '/cancel') { setState(u.tg_id, null); return menu(chatId, 'Bekor qilindi.'); }
    if (text === BTN_NEW || text === '/new') return startNew(u, chatId);
    if (text === BTN_MINE || text === '/my') { setState(u.tg_id, null); return mine(u, chatId); }
    if (text === BTN_HELP || text === '/help') return menu(chatId, HELP);
    if (s.step === 'channel') return onChannel(u, chatId, msg);
    if (s.step === 'text') return onText(u, chatId, msg, s);
    if (s.step === 'winners') return setWinners(u, chatId, s, Number(text));
    if (s.step === 'end') return setEnd(u, chatId, s, parseWhen(text, now()));
    if (s.step === 'confirm') return send(chatId, "Yuqoridagi \"✅ Kanalga joylash\" yoki \"❌ Bekor qilish\" tugmasini bosing.");
    return menu(chatId);
  }

  async function onCallback(cb) {
    const data = String(cb.data || '');
    const ack = (text, alert = false) => quiet(call('answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text, show_alert: alert } : {}) }));
    let m;
    if ((m = /^gj:(\d+)$/.exec(data))) return join(cb, Number(m[1]));
    if (data === 'gx') return ack('Bu konkurs yakunlangan.', true);
    const chatId = cb.message && cb.message.chat && cb.message.chat.id;
    if (!chatId || cb.message.chat.type !== 'private') return ack();
    const u = touch(cb.from);
    const s = getState(u);
    if ((m = /^gwn:(\d+)$/.exec(data))) { await ack(); return s.step === 'winners' ? setWinners(u, chatId, s, Number(m[1])) : menu(chatId); }
    if ((m = /^gwe:(\d+)$/.exec(data))) { await ack(); return s.step === 'end' ? setEnd(u, chatId, s, now() + Number(m[1]) * HOUR) : menu(chatId); }
    if (data === 'gwc:post') { await ack(); return publish(u, chatId, s); }
    if (data === 'gwc:cancel') { await ack(); setState(u.tg_id, null); return menu(chatId, 'Bekor qilindi.'); }
    if ((m = /^gw([fx]):(\d+)$/.exec(data))) {
      const c = contestRow(Number(m[2]));
      if (!c || c.owner_tg !== String(cb.from.id)) return ack('Bu sizning konkursingiz emas.', true);
      if (c.status !== 'active') return ack('Bu konkurs faol emas.', true);
      if (m[1] === 'x') {
        await ack();
        return send(chatId, `Konkurs #${c.id} ni bekor qilasizmi? Ishtirokchilar ro'yxati saqlanadi, g'olib tanlanmaydi.`,
          { reply_markup: { inline_keyboard: [[{ text: '🗑 Ha, bekor qilish', callback_data: `gwy:${c.id}` }]] } });
      }
      await ack('Yakunlanmoqda…');
      try { await draw(c.id); } catch (e) { return send(chatId, `⚠️ ${html(e.message)}`); }
      return null;
    }
    if ((m = /^gwy:(\d+)$/.exec(data))) {
      const c = contestRow(Number(m[1]));
      if (!c || c.owner_tg !== String(cb.from.id)) return ack('Bu sizning konkursingiz emas.', true);
      await ack();
      try { await cancel(c.id); } catch (e) { return send(chatId, `⚠️ ${html(e.message)}`); }
      return send(chatId, `🗑 Konkurs #${c.id} bekor qilindi.`);
    }
    return ack();
  }

  async function onUpdate(u) {
    if (u.message) return onMessage(u.message);
    if (u.callback_query) return onCallback(u.callback_query);
    return null;
  }

  // ---------- Platform panel ----------
  function status() {
    const s = st();
    const one = (sql, ...a) => q(sql).get(...a).c;
    return {
      configured: !!s.token, bot: s.bot || '', polling: !!s.token && running, error: s.error || '', closed: !!s.closed,
      limits: { active: MAX_ACTIVE, per_day: MAX_PER_DAY, days: MAX_DAYS },
      stats: {
        users: one('SELECT COUNT(*) c FROM gw_users'),
        organisers: one("SELECT COUNT(DISTINCT owner_tg) c FROM gw_contests WHERE status != 'failed'"),
        active: one("SELECT COUNT(*) c FROM gw_contests WHERE status = 'active'"),
        done: one("SELECT COUNT(*) c FROM gw_contests WHERE status = 'done'"),
        participants: one('SELECT COUNT(*) c FROM gw_participants'),
        channels: one("SELECT COUNT(DISTINCT channel_id) c FROM gw_contests WHERE status != 'failed'"),
      },
    };
  }
  function overview({ query = {} } = {}) {
    const term = String(query.q || '').trim().toLowerCase();
    const rows = q(`SELECT c.*, u.name owner_name, u.username owner_username, u.banned owner_banned,
        (SELECT COUNT(*) FROM gw_participants p WHERE p.contest_id = c.id) participants
      FROM gw_contests c LEFT JOIN gw_users u ON u.tg_id = c.owner_tg WHERE c.status NOT IN ('posting', 'failed')
      ORDER BY CASE c.status WHEN 'active' THEN 0 ELSE 1 END, c.id DESC LIMIT 200`).all()
      .filter((c) => !term || [c.channel_title, c.channel_username, c.owner_name, c.owner_username, c.text].some((v) => String(v || '').toLowerCase().includes(term)))
      .map((c) => ({ id: c.id, status: c.status, channel: { title: c.channel_title, username: c.channel_username }, link: postLink(c),
        owner: { tg_id: c.owner_tg, name: c.owner_name || '', username: c.owner_username || '', banned: !!c.owner_banned },
        text: c.text.slice(0, 160), photo: !!c.photo, winners_n: c.winners_n, ends_at: c.ends_at, created_at: c.created_at, finished_at: c.finished_at,
        participants: c.participants, winners: JSON.parse(c.winners || '[]').map((w) => ({ name: w.name, username: w.username, no: w.no })) }));
    const banned = q('SELECT tg_id, name, username FROM gw_users WHERE banned = 1 ORDER BY name').all();
    return { ...status(), contests: rows, banned };
  }
  async function setToken({ body }) {
    const token = str(body.token, 'Bot tokeni', { required: true, max: 100 });
    if (!/^\d+:[\w-]{20,}$/.test(token)) throw new HttpError(400, "Bot tokeni noto'g'ri. @BotFather bergan to'liq qatorni joylang");
    if (otherTokens().filter(Boolean).includes(token)) throw new HttpError(400, "Bu token platformaning boshqa botiniki. Konkurs uchun alohida bot oching");
    const me = await call('getMe', {}, { token, direct: true });
    await call('deleteWebhook', { drop_pending_updates: false }, { token, direct: true }).catch(() => {});
    await call('setMyCommands', { commands: [{ command: 'start', description: 'Menyu' }, { command: 'new', description: 'Yangi konkurs' }, { command: 'my', description: 'Konkurslarim' }] }, { token, direct: true }).catch(() => {});
    const old = st();
    save({ ...old, token, bot: me.username, bot_id: me.id, offset: old.token === token ? old.offset || 0 : 0, error: '' });
    kick();
    return status();
  }
  function setOpen({ body }) { save({ ...st(), closed: body.open === false }); return status(); }
  function unlink() { const s = st(); save({ closed: !!s.closed }); kick(); return status(); }
  function ban({ params, body }) {
    const u = userRow(params.id);
    if (!u) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    q('UPDATE gw_users SET banned = ? WHERE tg_id = ?').run(body.banned === false ? 0 : 1, u.tg_id);
    return { ok: true };
  }
  const adminFinish = ({ params }) => draw(Number(params.id), { by: 'admin' });
  const adminCancel = ({ params }) => cancel(Number(params.id), { by: 'admin' });
  function participants({ params }) {
    const c = contestRow(params.id);
    if (!c) throw new HttpError(404, 'Konkurs topilmadi');
    return { rows: q('SELECT no, name, username, joined_at FROM gw_participants WHERE contest_id = ? ORDER BY no').all(c.id) };
  }

  // ---------- Long polling ----------
  let running = false; let abort = null; let wake = null; let timer = null;
  const sleep = (ms) => new Promise((ok) => { const t = setTimeout(ok, ms); wake = () => { clearTimeout(t); ok(); }; });
  function kick() { if (abort) abort.abort(); if (wake) wake(); }
  async function loop() {
    while (running) {
      const s = st();
      if (!s.token) { await sleep(30 * 1000); continue; }
      try {
        abort = new AbortController();
        const updates = await call('getUpdates', { offset: s.offset || 0, timeout: 25, allowed_updates: ['message', 'callback_query'] }, { token: s.token, signal: abort.signal, direct: true });
        for (const u of updates) {
          save({ ...st(), offset: u.update_id + 1 });
          try { await onUpdate(u); } catch (e) { log.error(`Konkurs boti: ${e.message}`); }
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
  function start() {
    if (running) return;
    running = true; loop();
    timer = setInterval(() => { tick().catch((e) => log.error(`Konkurs boti: ${e.message}`)); }, 30 * 1000);
  }
  function stop() { running = false; clearInterval(timer); kick(); }

  return { status, overview, setToken, setOpen, unlink, ban, adminFinish, adminCancel, participants, tick, start, stop };
}

module.exports = { createGiveaway, parseWhen, when };
