'use strict';
/* Core: state, API client, live events, voice, dialogs, printing, local backup. Shared by every screen. */

const App = {
  token: null, // a person's session
  device: null, // shared device (staff-list screen) token
  user: null,
  settings: {},
  tenant: null,
  disabled: [],
  kitchenMode: 'full',
  info: null,
  connected: false,
  readyItems: [],
  badges: {},
  biz: 'choyxona', // business type: choyxona | restoran | fastfood | market | clothing
  money: {}, // which money pages this person may open
  financeKey: null, // short-lived key after typing the finance password
  version: null,
  platformSession: false,
};

const MIN = 60000;
const ROLE_ICONS = { owner: 'key-round', admin: 'shield-check', cashier: 'wallet', waiter: 'user-round', chef: 'chef-hat' };
const roleName = (r) => ({ owner: t('Boshliq'), admin: t('Admin'), cashier: t('Kassir'), waiter: isShop() ? t('Sotuvchi') : t('Ofitsant'), chef: t('Oshpaz') }[r] || r);
const statusName = (s) => ({ new: t('Yangi'), cooking: t('Tayyorlanmoqda'), ready: t('Tayyor'), served: t('Berildi'), cancelled: t('Bekor') }[s] || s);
const methodName = (m) => ({ cash: t('Naqd'), card: t('Karta'), transfer: t("O'tkazma") }[m] || m);
const METHOD_ICONS = { cash: 'banknote', card: 'credit-card', transfer: 'smartphone' };
// Room types come from the boss's settings (renamable); the standard ones keep their translations.
const STD_ROOM_TYPES = { banket: 'Banket', vip: 'VIP', supa: 'Supa', stol: 'Stol', zal: 'Zal', boshqa: 'Boshqa' };
function roomTypes() { return (App.settings.room_types && App.settings.room_types.length ? App.settings.room_types : Object.entries(STD_ROOM_TYPES).map(([key, name]) => ({ key, name }))); }
function roomTypeName(k) {
  if (k === 'soboy') return t('Olib ketish');
  const x = roomTypes().find((r) => r.key === k);
  if (!x) return k;
  return STD_ROOM_TYPES[k] === x.name ? t(x.name) : x.name;
}
const ROOM_TYPE_ICONS = { banket: 'party-popper', vip: 'star', supa: 'sofa', stol: 'utensils', zal: 'store', boshqa: 'door-open', soboy: 'shopping-bag' };

// ---------- Formatting ----------
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function num(n) { return Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/[\s,]/g, ' '); }
function moneyText(n) { return `${num(n)} ${App.settings.currency || "so'm"}`; }
function money(n) { return esc(moneyText(n)); }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtTime(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDate(ts) { const d = new Date(ts); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
function fmtDateTime(ts) { return ts ? `${fmtDate(ts)} ${fmtTime(ts)}` : '—'; }
function fmtDuration(ms) {
  const s = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(s / 60);
  const out = m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  return ms < 0 ? `-${out}` : out;
}
function localDay(ts = Date.now()) { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function dayStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function toLocalInput(ts) { const d = new Date(ts); return `${localDay(ts)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
// ---------- Subscription reminder: shown from 5 days before the paid term ends ----------
function subscriptionNotice(until) {
  if (!until) return null;
  const days = Math.floor((until - Date.now()) / (24 * 60 * MIN));
  if (days > 5) return null;
  if (days < 0) return { cls: 'red', text: t("Obuna muddati {0} da tugagan. Iltimos, to'lovni amalga oshiring.", fmtDate(until)) };
  if (days === 0) return { cls: 'red', text: t("Obuna muddati bugun tugaydi. Iltimos, to'lovni amalga oshiring.") };
  return { cls: '', text: t('Obuna muddati {0} kundan keyin ({1}) tugaydi.', days, fmtDate(until)) };
}

// ---------- Business type ----------
const BIZ_TYPES = () => ({ choyxona: t('Choyxona'), restoran: t('Restoran / kafe'), fastfood: t('Fast food'), market: t("Do'kon (oziq-ovqat)"), clothing: t('Kiyim-kechak'), doors: t("Eshik do'koni") });
const BIZ_ICONS = { choyxona: 'house', restoran: 'utensils', fastfood: 'sandwich', market: 'shopping-cart', clothing: 'shirt', doors: 'door-open' };
function isShop() { return App.biz === 'market' || App.biz === 'clothing' || App.biz === 'doors'; }
// A door shop: goods with size, colour, material and side; installation and delivery on a sale.
function isDoors() { return App.biz === 'doors'; }
// The camera can be used as a scanner (a secure page in a modern browser).
function camOk() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext; }
// Fast food and shops sell at the counter (the "Sotuv" screen).
function sellsAtCounter() { return App.biz === 'fastfood' || isShop(); }
// Words that differ in a shop: "Menyu" is "Mahsulotlar", "Taom" is "Mahsulot".
const SHOP_WORDS = { 'Menyu': 'Mahsulotlar', 'Taom': 'Mahsulot', 'Yangi taom': 'Yangi mahsulot', 'Taom qidirish': 'Mahsulot qidirish',
  'Taom topilmadi': 'Mahsulot topilmadi', 'Taomlar': 'Mahsulotlar', "Menyudan taom tanlang": 'Mahsulot tanlang', 'Eng ko\'p sotilgan': 'Eng ko\'p sotilgan',
  "Bu bo'limda taom yo'q": "Bu bo'limda mahsulot yo'q", "Taomni o'chirish": "Mahsulotni o'chirish", 'Taom menyudan olib tashlansinmi?': 'Mahsulot olib tashlansinmi?' };
function W(s, ...args) { return t(isShop() && SHOP_WORDS[s] ? SHOP_WORDS[s] : s, ...args); }

function moduleOn(m) { return !m || !(App.disabled || []).includes(m); }
// Closed because the plan does not include it (not switched off by hand): offer the upgrade instead of hiding.
function planLocked(m) { return !!(App.plan && m && !App.plan.modules.includes(m)); }
function upgradeDialog(feature) {
  const s = App.info && App.info.support;
  openModal({
    title: `${icon('star')} ${esc(feature)}`,
    body: `<p class="lead">${t('Bu imkoniyat sizning "{0}" tarifingizga kirmaydi.', esc(App.plan ? App.plan.name : ''))}</p>
      <p class="muted">${t("Tarifni yangilash uchun biz bilan bog'laning. Ma'lumotlaringiz joyida qoladi.")}</p>
      ${s && s.text ? `<p style="margin-top:12px">${s.link ? `<a class="btn primary" href="${esc(s.link)}" target="_blank" rel="noopener">${icon('life-buoy', 18)} ${esc(s.text)}</a>` : `<b>${icon('life-buoy', 18)} ${esc(s.text)}</b>`}</p>` : ''}`,
    actions: [{ label: t('Yopish') }],
  });
}
function can(...roles) { return !!App.user && roles.includes(App.user.role); }
function initials(name) { return String(name).split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase(); }
// FLOWI wordmark, inline so it takes the text colour (white on the lock screen, navy on cards).
const FLOWI_PATH = 'M0 4 199 4 199 54 62 54 62 120 183 120 183 169 62 169 62 262 0 262ZM241 4 303 4 303 212 436 212 436 262 241 262ZM452.5 133.5a143 133.5 0 1 1 286 0a143 133.5 0 1 1 -286 0ZM515.5 132.5a80.5 81 0 1 0 161 0a80.5 81 0 1 0 -161 0ZM755 4 820 4 879.5 182.5 939 4 997 4 911 262 841 262ZM1008.5 35.5 1059.5 188.5 1121 4 1182 4 1096 262 1028 262 980.5 119.5ZM1218 4 1279 4 1279 262 1218 262Z';
function flowiLogo(height = 22) {
  return `<svg class="flowi" viewBox="0 0 1280 267" height="${height}" role="img" aria-label="FLOWI"><path fill="currentColor" fill-rule="evenodd" d="${FLOWI_PATH}"/></svg>`;
}
// What a worker is called on screen: their job type ("Dostavchik", "Katta ofitsant") or the built-in role.
function jobName(u) { return (u && u.position && u.app !== 0 ? u.position : roleName(u && u.role)); }

function placeName(o) {
  if (o.delivery) return `${t('Dostavka')} #${o.id}${o.label ? ` · ${o.label}` : ''}`;
  if (o.takeaway) return `${isShop() ? t('Sotuv') : t('Olib ketish')} #${o.id}${o.label ? ` · ${o.label}` : ''}`;
  return o.room ? o.room.name : o.room_name || '';
}

// ---------- Menu: a colour per section, dish tiles, the section column ----------
const CAT_COLORS = ['#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f97316', '#64748b'];
function catColor(menu, id) {
  const i = menu.categories.findIndex((c) => c.id === id);
  if (i < 0) return '#94a3b8';
  return menu.categories[i].color || CAT_COLORS[i % CAT_COLORS.length];
}
// ---------- Modifiers (a dish's choices: "achchiq / achchiqmas", "+pishloq") ----------
// The chosen ones of a check line as a short text: stored as JSON on the line, sent as text on paper tickets.
function modsText(i) {
  const m = i && i.mods;
  if (!m) return '';
  if (Array.isArray(m)) return m.map((x) => x.name || x).join(', ');
  if (m[0] !== '[') return String(m);
  try { return JSON.parse(m).map((x) => x.name).join(', '); } catch { return ''; }
}
/* Asks for a dish's choices before it goes on the check. Resolves { ids, text, price } or null (closed).
   One-of groups are radio buttons, many-of are ticks; a required group must be answered; the price follows the choice. */
function pickMods(menu, dish) {
  const groups = (dish.mods || []).map((id) => (menu.modifiers || []).find((g) => g.id === id)).filter(Boolean);
  if (!groups.length) return Promise.resolve({ ids: [], text: '', price: dish.price });
  return new Promise((resolve) => {
    let done = false;
    const chosen = (f) => [...f.querySelectorAll('[data-opt]:checked')].map((x) => Number(x.value));
    const sum = (f) => dish.price + chosen(f).reduce((a, id) => a + ((groups.flatMap((g) => g.options).find((o) => o.id === id) || {}).price || 0), 0);
    const form = openModal({
      title: `${icon('list')} ${esc(dish.name)}`,
      body: groups.map((g) => `<div class="mod-group" data-g="${g.id}"><div class="mod-head"><b>${esc(g.name)}</b>
          <span class="small muted">${g.required ? t('majburiy') : t('ixtiyoriy')}${g.multi ? ` · ${t('bir nechtasi')}` : ''}</span></div>
        <div class="mod-opts">${g.options.map((o, i) => `<label class="mod-opt"><input type="${g.multi ? 'checkbox' : 'radio'}" name="g${g.id}" value="${o.id}" data-opt ${!g.multi && g.required && i === 0 ? 'checked' : ''}>
          <span>${esc(o.name)}${o.price ? ` <small>${o.price > 0 ? '+' : '−'}${num(Math.abs(o.price))}</small>` : ''}</span></label>`).join('')}</div></div>`).join('')
        + `<div class="mod-total"><span>${t('Narxi')}</span><b id="mod-sum">${money(dish.price)}</b></div>`,
      actions: [{ label: t('Bekor'), onClick: () => { done = true; resolve(null); } }, { label: t("Qo'shish"), cls: 'primary', icon: 'plus', onClick: (f) => {
        const ids = chosen(f);
        const miss = groups.find((g) => g.required && !g.options.some((o) => ids.includes(o.id)));
        if (miss) { toast(t('{0} — tanlang', miss.name), 'warn'); return false; }
        const all = groups.flatMap((g) => g.options);
        done = true;
        resolve({ ids, text: ids.map((id) => all.find((o) => o.id === id).name).join(', '), price: sum(f) });
        return undefined;
      } }],
      onClose: () => { if (!done) resolve(null); },
      onMount: (f) => {
        const upd = () => { f.querySelector('#mod-sum').innerHTML = money(sum(f)); };
        f.querySelectorAll('[data-opt]').forEach((x) => x.onchange = upd);
        upd();
      },
    });
    void form;
  });
}

// A colour (#abc / #aabbcc) with transparency, as rgba() that every browser understands.
function rgba(hex, a) {
  let h = String(hex || '').trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) h = '94a3b8';
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
// opts.qty: how many are already on the check; opts.sub: small line (time, stock, size).
function dishTile(menu, x, opts = {}) {
  const cc = catColor(menu, x.category_id);
  return `<button class="dish ${x.available ? '' : 'out'}" style="--cc:${esc(cc)};--cc-bg:${rgba(cc, 0.12)};--cc-line:${rgba(cc, 0.35)}" data-dish="${x.id}" ${x.available ? '' : 'disabled'}>
    ${opts.qty ? `<span class="qty">${opts.qty}</span>` : ''}<span class="nm">${esc(x.name)}</span>
    ${opts.sub ? `<span class="sub">${opts.sub}</span>` : ''}
    <span class="pr" data-out="${esc(t('TUGADI'))}">${num(x.price)}</span></button>`;
}
function catSide(menu) {
  const cats = menu.categories.filter((c) => menu.dishes.some((x) => x.category_id === c.id));
  return `<nav class="cat-side"><button class="cat ${UI.category === 'all' ? 'active' : ''}" data-cat="all">${icon('grid-2x2', 16)} ${t('Hammasi')}</button>
    ${cats.map((c) => `<button class="cat ${String(UI.category) === String(c.id) ? 'active' : ''}" style="--cc:${catColor(menu, c.id)}" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</nav>`;
}

// ---------- Storage ----------
function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key));
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
  return val;
}

// ---------- API ----------
async function api(method, path, body, token = App.token) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(App.financeKey ? { 'X-Finance': App.financeKey } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  checkVersion(res.headers.get('X-App-Version'));
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && token && token === App.token) {
    endSession();
    // Signed in on another device (one device per waiter on this plan): say so plainly, once.
    const other = data && /boshqa qurilmada/.test(data.error || '');
    if (other) toast(tServer(data.error), 'error', 8000);
    const err = new Error(other ? tServer(data.error) : t('Sessiya tugadi, qayta kiring'));
    err.silent = other; // already shown
    throw err;
  }
  if (!res.ok) {
    const err = new Error(tServer((data && data.error) || `${t('Xatolik')} (${res.status})`));
    err.status = res.status;
    err.code = data && data.code;
    // Not at work yet / not inside: the "Ishga keldim" screen takes over, no error popups.
    if (res.status === 403 && ['clock', 'geo'].includes(err.code) && token && token === App.token && typeof Work === 'object' && !/^\/api\/work\//.test(path)) {
      err.silent = true;
      Work.blocked(err.code);
    }
    throw err;
  }
  return data;
}
const GET = (p) => api('GET', p);
const POST = (p, b) => api('POST', p, b || {});
const PUT = (p, b) => api('PUT', p, b || {});
const DEL = (p) => api('DELETE', p);

// Ends the person's session. On a shared device this returns to the staff list, otherwise to the login form.
function endSession() {
  App.token = null;
  App.user = null;
  App.financeKey = null;
  store('cp_token', null);
  Live.stop();
  closeModal(); // a dialog of the closed session must not stay over the staff list
  if (typeof Views === 'object' && Views.lock) Views.lock.step = 'clock';
  location.hash = App.device ? '#/lock' : '#/setup';
  if (typeof render === 'function') render();
}

// ---------- New version: devices reload by themselves, never losing an unsent order ----------
function checkVersion(v) {
  if (!v) return;
  if (!App.version) { App.version = v; return; }
  if (v !== App.version && !App.updatePending) { App.updatePending = true; tryReload(); }
}
function tryReload() {
  const busy = Object.values(typeof Carts === 'object' ? Carts : {}).some((c) => c.lines && c.lines.length)
    || (typeof PosCart === 'object' && PosCart.lines.length) || document.querySelector('.modal-back');
  if (!busy) { location.reload(); return; }
  setTimeout(tryReload, 20000);
}

// ---------- Live updates (SSE) ----------
const Live = {
  es: null,
  handlers: {},
  retry: null,
  start() {
    this.stop();
    this.es = new EventSource(`/api/events?token=${encodeURIComponent(App.token)}`);
    this.es.addEventListener('hello', () => { App.connected = true; updateConn(); });
    this.es.onerror = () => {
      App.connected = false; updateConn();
      if (this.es && this.es.readyState === EventSource.CLOSED) {
        clearTimeout(this.retry);
        this.retry = setTimeout(() => App.token && this.start(), 3000);
      }
    };
    for (const type of ['rooms', 'kitchen', 'menu', 'finance', 'settings', 'kitchen_new', 'kitchen_cancel', 'item_ready',
      'item_accepted', 'bill_requested', 'stoplist', 'payroll', 'guest', 'guest_request', 'tasks', 'jobs', 'work', 'work_ask', 'inventory', 'stock_low', 'printers']) {
      this.es.addEventListener(type, (e) => {
        let data = {};
        try { data = JSON.parse(e.data); } catch { /* ignore */ }
        (this.handlers[type] || []).forEach((fn) => fn(data));
        (this.handlers['*'] || []).forEach((fn) => fn(type, data));
      });
    }
  },
  stop() { if (this.es) this.es.close(); this.es = null; App.connected = false; },
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
};
function updateConn() {
  document.querySelectorAll('.conn').forEach((el) => {
    el.classList.toggle('on', App.connected);
    el.title = App.connected ? t('Jonli aloqa bor') : t("Aloqa yo'q — qayta ulanmoqda");
  });
}

// ---------- Voice & sound ----------
const Voice = {
  prefs() { return { enabled: true, rate: 0.95, pitch: 1.1, voiceURI: '', ...(store('cp_voice') || {}) }; },
  save(p) { store('cp_voice', { ...this.prefs(), ...p }); },
  voices() { return 'speechSynthesis' in window ? speechSynthesis.getVoices() : []; },
  // Female voice in the interface language. For Uzbek, Turkish reads Uzbek Latin well, then Russian.
  pick() {
    const all = this.voices();
    const p = this.prefs();
    if (p.voiceURI) {
      const v = all.find((x) => x.voiceURI === p.voiceURI);
      if (v) return v;
    }
    const female = /female|woman|ayol|zira|seda|yelda|filiz|emel|milena|irina|alena|svetlana|dariya|madina|samantha|victoria|karen|tessa|moira|google (türkçe|русский|us english|uk english female)/i;
    const male = /\bmale\b|erkak|pavel|dmitri|yuri|cem|tolga|maxim|david|mark|daniel|alex\b/i;
    const order = { uz: ['uz', 'tr', 'kk', 'ru', 'en'], ru: ['ru', 'uk', 'en'], en: ['en'] }[LANG];
    for (const lang of order) {
      const list = all.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
      if (!list.length) continue;
      return list.find((v) => female.test(v.name)) || list.find((v) => !male.test(v.name)) || list[0];
    }
    return null;
  },
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
    } catch { /* ignore */ }
  },
  chime(kind = 'ready') {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = kind === 'ready' ? [784, 988, 1319] : kind === 'alert' ? [523, 523] : [659, 880];
      notes.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const tt = this.ctx.currentTime + i * 0.16;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.35, tt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.35);
        o.connect(g).connect(this.ctx.destination);
        o.start(tt); o.stop(tt + 0.4);
      });
    } catch { /* ignore */ }
  },
  say(text, kind) {
    const p = this.prefs();
    this.chime(kind);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (!p.enabled || !('speechSynthesis' in window)) return;
    setTimeout(() => {
      const u = new SpeechSynthesisUtterance(text);
      const v = this.pick();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' }[LANG];
      u.rate = p.rate; u.pitch = p.pitch; u.volume = 1;
      speechSynthesis.speak(u);
    }, 550);
  },
};
document.addEventListener('pointerdown', () => Voice.unlock(), { once: true });

const UZ_UNITS = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
const UZ_TENS = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"];
function uzNumber(n) {
  if (!n) return 'nol';
  const h = Math.floor(n / 100) % 10; const tn = Math.floor(n / 10) % 10; const u = n % 10;
  return [h ? `${h > 1 ? UZ_UNITS[h] + ' ' : ''}yuz` : '', UZ_TENS[tn], UZ_UNITS[u]].filter(Boolean).join(' ');
}
// "Uchinchi xona" in Uzbek; other languages read the number themselves.
function spokenRoom(number, name) {
  const n = Number(number);
  if (!(Number.isInteger(n) && n > 0 && n < 1000)) return name;
  if (LANG !== 'uz') return t('{0}-xona', n);
  const w = uzNumber(n);
  return `${/[aeiou]$/.test(w) ? `${w}nchi` : `${w}inchi`} xona`;
}
const spokenQty = (q) => (LANG === 'uz' ? uzNumber(q) : String(q));

function notifySystem(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try { new Notification(title, { body, icon: '/icon-192.png', tag: title + body }); } catch { /* ignore */ }
}

// ---------- Toasts & dialogs ----------
function toast(msg, kind = 'info', ms = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon({ ok: 'circle-check', error: 'circle-x', warn: 'triangle-alert' }[kind] || 'info', 18)}<span></span>`;
  el.querySelector('span').textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
/*
 * "On a worker" payment in the pay dialogs: a worker's own meal is taken from their pay.
 * staffPayButton() goes among the payment methods, staffPayBox() under them; bindStaffPay() wires both.
 */
function canStaffMeal() { return can('owner', 'admin', 'cashier') && moduleOn('payroll'); }
function staffPayButton() {
  return canStaffMeal() ? `<button type="button" class="method" data-staff-pay>${icon('users', 26)}${t('Xodim hisobiga')}</button>` : '';
}
function staffPayBox() {
  return canStaffMeal() ? `<div id="staff-box" class="stack" hidden><label class="field">${t('Qaysi xodim?')}<select name="staff_id"><option value="">…</option></select></label>
    <p class="small muted">${icon('info', 14)} ${App.settings.staff_meal_price === 'cost' ? t('Tannarxda, xizmat haqisiz. Summa xodimning ish haqidan ushlanadi.') : t('Menyu narxida, xizmat haqisiz. Summa xodimning ish haqidan ushlanadi.')}</p></div>` : '';
}
function bindStaffPay(form, onChange) {
  const btn = form.querySelector('[data-staff-pay]');
  const state = { on: false };
  if (!btn) return state;
  const box = form.querySelector('#staff-box');
  const hide = (on) => {
    form.querySelectorAll('.pay .form-grid, #pay-change, input[name=discount]').forEach((el) => { (el.closest('label') || el).style.display = on ? 'none' : ''; });
    box.hidden = !on;
  };
  btn.onclick = async () => {
    state.on = true;
    form.querySelectorAll('[data-m], [data-staff-pay]').forEach((x) => x.classList.toggle('active', x === btn));
    form.querySelectorAll('input[name^=paid_]').forEach((i) => { i.value = ''; });
    hide(true);
    const sel = form.staff_id;
    if (sel.options.length <= 1) {
      try {
        const list = await GET('/api/staff-list');
        sel.innerHTML = `<option value="">${t('Xodimni tanlang')}</option>${list.map((u) => `<option value="${u.id}">${esc(u.name)} — ${esc(jobName(u))}</option>`).join('')}`;
      } catch (e) { toastError(e); }
    }
    if (onChange) onChange();
  };
  form.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    state.on = false; btn.classList.remove('active'); hide(false); if (onChange) onChange();
  }));
  return state;
}

/*
 * Pro: a customer on the check — search by name or phone (or add a new one), spend their bonus as a discount,
 * leave part of the check on credit ("Qarzga"). customerPayHtml() goes into the pay dialog; bindCustomerPay() wires it
 * and returns the live state { customer, bonus, debt } the dialog reads when it computes and sends the payment.
 */
function canCustomers() { return moduleOn('customers') || moduleOn('debts'); }
function customerPayHtml() {
  if (!canCustomers()) return '';
  return `<div class="cust-pay"><div class="cust-pick"><input type="search" name="cust_q" autocomplete="off" placeholder="${esc(t('Mijoz: ism yoki telefon'))}">
      <div class="cust-results" hidden></div></div>
    <div class="cust-chosen" hidden></div></div>`;
}
function bindCustomerPay(form, onChange) {
  const state = { customer: null, bonus: 0, debt: false };
  const box = form.querySelector('.cust-pay');
  if (!box) return state;
  const input = form.cust_q;
  const results = box.querySelector('.cust-results');
  const chosen = box.querySelector('.cust-chosen');
  let timer = null;
  const draw = () => {
    const c = state.customer;
    box.querySelector('.cust-pick').hidden = !!c;
    chosen.hidden = !c;
    if (!c) { chosen.innerHTML = ''; return; }
    chosen.innerHTML = `<div class="row" style="gap:8px;align-items:center">${icon('user-round', 18)}<b>${esc(c.name)}</b><span class="small muted">${esc(c.phone || '')}</span>
        <span class="grow"></span><button type="button" class="icon-btn" data-cust-clear title="${esc(t('Olib tashlash'))}">${icon('x', 16)}</button></div>
      <div class="row small" style="gap:12px;margin-top:4px">${moduleOn('customers') ? `<span>${t('Bonus')}: <b>${money(c.bonus)}</b></span>` : ''}
        ${c.debt ? `<span class="red">${t('Qarzi')}: <b>${money(c.debt)}</b></span>` : ''}</div>
      ${moduleOn('customers') && c.bonus > 0 ? `<label class="check" style="margin-top:6px"><input type="checkbox" name="use_bonus" ${state.bonus ? 'checked' : ''}> ${t('Bonusdan foydalanish')}</label>` : ''}
      ${moduleOn('debts') ? `<label class="check" style="margin-top:6px"><input type="checkbox" name="on_debt" ${state.debt ? 'checked' : ''}> ${icon('notebook-pen', 16)} ${t('Qolganini qarzga yozish')}</label>` : ''}`;
    const ub = chosen.querySelector('[name=use_bonus]');
    if (ub) ub.onchange = () => { state.bonus = ub.checked ? c.bonus : 0; onChange(); };
    const od = chosen.querySelector('[name=on_debt]');
    if (od) od.onchange = () => { state.debt = od.checked; onChange(); };
    chosen.querySelector('[data-cust-clear]').onclick = () => { state.customer = null; state.bonus = 0; state.debt = false; draw(); onChange(); };
  };
  const pick = (c) => { state.customer = c; state.bonus = 0; state.debt = false; results.hidden = true; input.value = ''; draw(); onChange(); };
  const search = async () => {
    const v = input.value.trim();
    if (!v) { results.hidden = true; return; }
    let rows = [];
    try { rows = (await GET(`/api/customers?q=${encodeURIComponent(v)}&limit=8`)).rows; } catch (e) { return toastError(e); }
    const looksPhone = /^[+\d\s()-]{7,}$/.test(v);
    results.innerHTML = rows.map((c) => `<button type="button" class="cust-row" data-cid="${c.id}"><b>${esc(c.name)}</b> <span class="small muted">${esc(c.phone || '')}</span>
        ${c.debt ? `<span class="small red">${t('qarz')} ${num(c.debt)}</span>` : ''}</button>`).join('')
      + `<button type="button" class="cust-row add" data-cadd>${icon('plus', 16)} ${t('Yangi mijoz')}: <b>${esc(v)}</b></button>`;
    results.hidden = false;
    results.querySelectorAll('[data-cid]').forEach((b) => b.onclick = () => pick(rows.find((c) => c.id === Number(b.dataset.cid))));
    results.querySelector('[data-cadd]').onclick = async () => {
      // A phone typed in the search is the phone; a name is the name (the phone can be added later).
      const name = looksPhone ? (prompt(t('Mijozning ismi'), '') || '').trim() : v;
      if (!name) return;
      try { pick(await POST('/api/customers', { name, phone: looksPhone ? v : '' })); } catch (e) { toastError(e); }
    };
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); search(); } });
  return state;
}

function toastError(e) { if (e && e.silent) return; toast(e && e.message ? e.message : String(e), 'error', 6000); }

function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* openModal({ title, body, size: 'wide'|'full', actions: [{label, cls, icon, onClick(form) -> false keeps open}] }) */
function openModal({ title, body, size = '', actions = [], onMount, onClose }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-back"><form class="modal ${size}" novalidate>
    <div class="modal-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="${esc(t('Yopish'))}">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>
    ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button type="${i === actions.length - 1 ? 'submit' : 'button'}" class="btn ${a.cls || ''}" data-i="${i}">${a.icon ? icon(a.icon, 18) : ''}${a.label}</button>`).join('')}</div>` : ''}
  </form></div>`;
  const form = root.querySelector('form');
  const close = () => { closeModal(); if (onClose) onClose(); };
  root.querySelector('.modal-back').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-back')) close(); });
  root.querySelector('[data-close]').onclick = close;
  const run = async (a, btn) => {
    btn.disabled = true;
    try {
      const keep = a.onClick ? await a.onClick(form) : undefined;
      if (keep !== false) closeModal();
    } catch (e) { toastError(e); } finally { btn.disabled = false; }
  };
  root.querySelectorAll('.modal-foot .btn').forEach((btn) => {
    if (btn.type === 'button') btn.onclick = () => run(actions[btn.dataset.i], btn);
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const btn = form.querySelector('.modal-foot button[type=submit]');
    if (btn) run(actions[btn.dataset.i], btn);
  };
  const first = form.querySelector('.modal-body input:not([type=checkbox]):not([readonly]), .modal-body select, .modal-body textarea');
  if (first && !('ontouchstart' in window)) setTimeout(() => first.focus(), 30);
  if (onMount) onMount(form);
  return form;
}

function confirmModal(title, text, okLabel = t('Ha'), cls = 'danger') {
  return new Promise((resolve) => {
    openModal({ title, body: `<p class="lead">${text}</p>`, onClose: () => resolve(false), actions: [
      { label: t("Yo'q"), onClick: () => resolve(false) },
      { label: okLabel, cls, onClick: () => resolve(true) },
    ] });
  });
}

function promptModal(title, label, { required = false, value = '' } = {}) {
  return new Promise((resolve) => {
    openModal({ title, body: `<label class="field">${esc(label)}<input name="v" value="${esc(value)}"></label>`, onClose: () => resolve(null), actions: [
      { label: t('Bekor'), onClick: () => resolve(null) },
      { label: t('Tasdiqlash'), cls: 'primary', onClick: (f) => {
        const v = f.v.value.trim();
        if (required && !v) { toast(t('Iltimos, kiriting'), 'warn'); return false; }
        resolve(v);
      } },
    ] });
  });
}

function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi) { (out[el.name] = out[el.name] || []); if (el.checked) out[el.name].push(Number(el.value)); }
      else out[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (el.type === 'number') out[el.name] = el.value === '' ? '' : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

// Number pad used for PINs and guest counts. Resolves with the typed string, or null.
function keypadHtml(maxLen, masked = true) {
  return `<div class="pin-dots" data-max="${maxLen}">${masked ? '' : '<span class="pin-value">0</span>'}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" class="key" data-k="${n}">${n}</button>`).join('')}
      <button type="button" class="key muted" data-k="clear">${icon('x', 22)}</button><button type="button" class="key" data-k="0">0</button>
      <button type="button" class="key muted" data-k="back">${icon('delete', 22)}</button></div>`;
}
function bindKeypad(root, { maxLen, masked = true, onChange, onFull }) {
  let value = '';
  const dots = root.querySelector('.pin-dots');
  const draw = () => {
    if (masked) dots.innerHTML = Array.from({ length: Math.max(maxLen, value.length) }, (_, i) => `<i class="${i < value.length ? 'on' : ''}"></i>`).join('');
    else dots.querySelector('.pin-value').textContent = value || '0';
    if (onChange) onChange(value);
  };
  const press = (k) => {
    if (k === 'back') value = value.slice(0, -1);
    else if (k === 'clear') value = '';
    else if (value.length < maxLen) value += k;
    draw();
    if (onFull && value.length === maxLen) onFull(value);
  };
  root.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => press(b.dataset.k));
  const onKey = (e) => {
    if (!document.body.contains(dots)) return document.removeEventListener('keydown', onKey);
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
  };
  document.addEventListener('keydown', onKey);
  draw();
  return { get: () => value, reset: () => { value = ''; draw(); }, shake: () => { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); } };
}

// ---------- Printing ----------
// Thermal printers (58/80 mm) work through the normal system printer driver.
// With Chrome started as "chrome --kiosk-printing" receipts print without the dialog.
// kind: 'receipt' or 'kitchen' — inside the FLOWI program for Windows each goes to its own printer, with no dialog.
/* The guest's check is printed in DejaVu Sans Mono Bold (the same letters as the FLOWI Printer bill picture).
   The font goes inside the printed page itself, so it is there at the moment of printing (no network wait). */
const ReceiptFont = {
  data: null,
  load() {
    if (this.data || this.loading) return;
    this.loading = fetch('/fonts/DejaVuSansMono-Bold.ttf').then((r) => (r.ok ? r.arrayBuffer() : null)).then((buf) => {
      if (!buf) return;
      let bin = '';
      const a = new Uint8Array(buf);
      for (let i = 0; i < a.length; i += 0x8000) bin += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
      this.data = btoa(bin);
    }).catch(() => {}).finally(() => { this.loading = null; });
  },
  css() {
    const src = this.data ? `url(data:font/ttf;base64,${this.data}) format("truetype")` : `url(${location.origin}/fonts/DejaVuSansMono-Bold.ttf) format("truetype")`;
    return `@font-face{font-family:"FLOWI Chek";src:${src};font-weight:700}`;
  },
};
setTimeout(() => ReceiptFont.load(), 1500);

// The paper page around a check or ticket. Thermal printers fade thin letters: a bold sans font in pure black prints clearly.
// mono: the guest's check in the receipt font (wider line spacing, columns that line up).
function docHtml(title, body, s = App.settings || {}, mono = false) {
  const narrow = String(s.receipt_width) === '58';
  const logo = Math.min(100, Math.max(20, Number(s.receipt_logo_size) || 50));
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${esc(location.origin)}/"><title>${esc(title)}</title><style>
    *{color:#000 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
    body{font:700 ${narrow ? 12 : 13.5}px/1.35 Arial,"Segoe UI",Tahoma,sans-serif;width:${narrow ? 48 : 72}mm;margin:0 auto;padding:0;color:#000;-webkit-font-smoothing:none;background:#fff}
    h1{font-size:${narrow ? 16 : 19}px;font-weight:900;text-align:center;margin:0}.c{text-align:center}.r{text-align:right;white-space:nowrap}
    table{width:100%;border-collapse:collapse}td,th{padding:2px 0;vertical-align:top;font-weight:700;text-align:left}small{font-size:.92em;font-weight:700}
    hr{border:0;border-top:2px dashed #000;margin:6px 0}hr.thick{border-top:3px solid #000;margin:5px 0}
    .big{font-size:${narrow ? 14 : 17}px;font-weight:900}.huge{font-size:${narrow ? 19 : 24}px;font-weight:900}
    .logo{display:block;margin:0 auto 2px;width:${logo}%;height:auto;filter:grayscale(1) contrast(1.8)}
    .inv{background:#000;color:#fff !important;padding:3px 0}
    .name{font-size:${narrow ? 17 : 21}px;font-weight:900;text-align:center;letter-spacing:.06em;text-transform:uppercase;margin:2px 0 1px}
    .addr{text-align:center;font-size:.9em;margin-bottom:6px}
    .kv td:last-child{text-align:right}.kv .wrap{white-space:normal;display:inline-block}
    .items td{padding:4px 0}.kv td{padding:3px 0}
    .items th{border-bottom:2px solid #000;padding-bottom:3px}.items .q{text-align:center;width:16%}.items .s{text-align:right;width:28%;white-space:nowrap}
    .items .sec td{padding-top:6px;text-decoration:underline;text-transform:uppercase;font-weight:900}
    .jami td{font-size:${narrow ? 16.5 : 21}px;font-weight:900;padding:2px 0}
    .foot{text-align:center;margin-top:4px;font-family:"Courier New",Consolas,monospace;font-weight:900;white-space:pre-wrap;font-size:1.25em;line-height:1.25;-webkit-text-stroke:.6px #000;text-shadow:.4px 0 0 #000}
    tr.pp td{font-size:${narrow ? 14.5 : 17}px;font-weight:900}
    @page{size:${narrow ? 58 : 80}mm auto;margin:0}
    ${mono ? `${ReceiptFont.css()}
    body,td,th,.foot{font-family:"FLOWI Chek","DejaVu Sans Mono",Consolas,"Courier New",monospace !important;font-weight:700}
    body{font-size:${narrow ? 11.5 : 12.5}px;line-height:1.25}.items td{padding:2px 0}.kv td{padding:1px 0}
    .name{letter-spacing:.02em}.kv td:last-child{white-space:nowrap}tr.pp td{font-size:${narrow ? 14.5 : 15.5}px !important;white-space:nowrap}` : ''}
  </style></head><body>${body}</body></html>`;
}
function printDoc(title, body, kind = 'receipt', s = App.settings, mono = false) {
  const html = docHtml(title, body, s, mono);
  if (window.flowiDesktop) {
    window.flowiDesktop.print(html, { kind }).then((r) => { if (!r || !r.ok) { toast(`${t('Chop etilmadi')}: ${(r && r.error) || ''}`, 'warn'); printInFrame(html); } })
      .catch(() => printInFrame(html));
    return;
  }
  printInFrame(html);
}
function printInFrame(html) {
  // A fresh frame per print, so two receipts in a row never overwrite each other.
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

function serviceLabel(o) {
  return o.service_type === 'per_guest'
    ? t('Xizmat haqi ({0} kishi × {1})', o.guests, moneyText(o.service_pct))
    : t('Xizmat haqi {0}%', o.service_pct);
}
function perPerson(o) { return o.guests > 1 ? Math.round(o.total / o.guests) : 0; }

// Prints the bill; the server checks the permission and counts the print.
// With a Kassa printer set (Settings → Printerlar → "Mijoz cheki"), the bill goes there through the server,
// whichever device asked; without one it is printed here, as before.
async function printCheck(orderId) {
  try {
    const r = await POST(`/api/orders/${orderId}/print`);
    if (!r.sent_to) return printReceipt({ ...r, printed_by: App.user && App.user.name });
    if (r.sent_to.online) toast(t('Chek {0} printeriga yuborildi', r.sent_to.name), 'ok');
    else toast(t("{0} printeri hozir ulanmagan — chek u yoqilganda chiqadi", r.sent_to.name), 'warn', 8000);
  } catch (e) { toastError(e); }
}

// Logo at the top of the check: a separate check logo if the boss uploaded one, otherwise the main logo.
function receiptLogo(s = App.settings) {
  const code = s.code || (App.tenant && App.tenant.code) || (App.info && App.info.code);
  const id = s.receipt_logo_id || s.logo;
  if (s.receipt_logo === false || !id || !code) return '';
  const src = `/media/${code}/${id}`;
  return `<img class="logo" src="${esc(LogoCrop.get(src))}" alt="">`;
}
/* A logo file often has an empty margin above and below the drawing; on paper that is a blank strip. The logo is read
   once, its empty rows (white or transparent) are cut off, and checks use the cut copy (the original until it is ready). */
const LogoCrop = {
  done: new Map(),
  get(src) {
    if (!this.done.has(src)) { this.done.set(src, src); this.make(src); }
    return this.done.get(src);
  },
  make(src) {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        const ink = (y) => { for (let i = y * c.width * 4, e = i + c.width * 4; i < e; i += 4) if (d[i + 3] > 24 && (d[i] + d[i + 1] + d[i + 2]) / 3 < 235) return true; return false; };
        let top = 0; while (top < c.height - 1 && !ink(top)) top++;
        let bot = c.height - 1; while (bot > top && !ink(bot)) bot--;
        if (top === 0 && bot === c.height - 1) return;
        const o = document.createElement('canvas'); o.width = c.width; o.height = bot - top + 1;
        o.getContext('2d').drawImage(c, 0, top, c.width, o.height, 0, 0, c.width, o.height);
        this.done.set(src, o.toDataURL('image/png'));
      } catch { /* keep the original */ }
    };
    img.src = src;
  },
};
setTimeout(() => { try { if (App.settings) receiptLogo(App.settings); } catch { /* nothing to prepare */ } }, 2000);

/* The guest's check: logo (its width set in Settings), name, address; date, waiter, check number, table, guests;
   the dishes (under their sections when chosen); sums, the total in big letters, per person, payments, advance;
   the lines the boss wrote under it. s: the business's name and check settings (a bill printed elsewhere brings its own). */
function receiptBody(o, s = App.settings) {
  // The same dish (name, price, choices) ordered several times is one row with the total count.
  const live = [];
  for (const i of o.items.filter((x) => x.status !== 'cancelled')) {
    const key = `${i.name}|${i.price}|${modsText(i)}`;
    const m = live.find((x) => x.key === key);
    if (m) m.qty += i.qty; else live.push({ ...i, key });
  }
  const row = (i) => `<tr><td>${esc(i.name)}${modsText(i) ? `<br><small>+ ${esc(modsText(i))}</small>` : ''}</td><td class="q">${i.qty}</td><td class="s">${num(i.qty * i.price)}</td></tr>`;
  let lines;
  const named = live.filter((i) => i.category_name);
  if (s.receipt_group === true && named.length) {
    const groups = new Map();
    for (const i of live) {
      const k = i.category_name || '';
      if (!groups.has(k)) groups.set(k, { sort: i.category_name ? i.category_sort ?? 0 : 1e9, items: [] });
      groups.get(k).items.push(i);
    }
    lines = [...groups.entries()].sort((x, y) => x[1].sort - y[1].sort).map(([k, g]) => `${k ? `<tr class="sec"><td colspan="3">${esc(k)}</td></tr>` : `<tr class="sec"><td colspan="3">${t('Boshqa')}</td></tr>`}${g.items.map(row).join('')}`).join('');
  } else lines = live.map(row).join('');
  const share = s.receipt_per_person !== false ? perPerson(o) : 0;
  const counter = o.takeaway && sellsAtCounter();
  const kv = [
    [t('Sana'), fmtDateTime(o.closed_at || Date.now())],
    ...(counter || o.delivery ? [] : [[roleName('waiter'), esc(o.waiter.name)]]),
    [t('Chek №'), `${o.id}${o.status !== 'closed' ? ` (${t('hisob')})` : ''}`],
    [o.takeaway ? t('Joy') : t('Stol'), esc(o.delivery ? `${t('Dostavka')} #${o.id}` : o.takeaway ? placeName(o) : `${o.room.number}, ${o.room.name}`)],
    ...(counter || o.delivery ? [] : [[t('Mehmonlar'), o.guests]]),
    // A delivery: the customer, phone, address and the courier (only what was filled in).
    ...(o.delivery ? [[t('Mijoz'), o.label], [t('Telefon'), o.phone], [t('Manzil'), o.address], [t('Dostavchik'), o.waiter && o.waiter.name]]
      .filter(([, v]) => v).map(([k, v]) => [k, `<span class="wrap">${esc(v)}</span>`]) : []),
  ];
  const foot = String(s.receipt_footer || '').split('\n').map((x) => x.trim()).filter(Boolean);
  return `${receiptLogo(s)}
    ${s.name ? `<div class="name">${esc(s.name)}</div>` : ''}${s.address || s.phone ? `<div class="addr">${[s.address, s.phone].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
    ${counter ? `<div class="c huge">№ ${o.id}</div>` : ''}
    <table class="kv">${kv.map(([k, v]) => `<tr><td>${k}:</td><td>${v}</td></tr>`).join('')}</table>
    <hr><table class="items"><tr><th>${t('Nomi')}</th><th class="q">${t('Soni')}</th><th class="s">${t('Summa')}</th></tr>${lines}
      <tr class="sum1"><td>${W('Taomlar')}</td><td class="q"></td><td class="s">${num(o.subtotal)}</td></tr>
      ${o.service_amount ? `<tr><td>${t('Xizmat haqi')}${o.service_type === 'per_guest' ? ` (${t('{0} kishi', o.guests)})` : ` ${o.service_pct}%`}</td><td class="q">${o.service_type === 'per_guest' ? o.guests : ''}</td><td class="s">${num(o.service_amount)}</td></tr>` : ''}
      ${o.discount ? `<tr><td>${t('Chegirma')}</td><td class="q"></td><td class="s">−${num(o.discount)}</td></tr>` : ''}</table>
    <hr class="thick"><table class="kv jami"><tr><td>${t('JAMI')}:</td><td>${num(o.total)}</td></tr></table><hr class="thick">
    ${share ? `<table class="kv"><tr class="big pp"><td>${t('{0} kishi — har biriga', o.guests)}:</td><td>${num(share)}</td></tr></table>` : ''}
    ${o.advance || o.balance > 0 || (o.payments || []).length ? `<hr><table class="kv">
      ${o.customer ? `<tr><td colspan="2">${t('Mijoz')}: ${esc(o.customer.name)} ${esc(o.customer.phone || '')}</td></tr>` : ''}
      ${o.advance ? `<tr><td>${t("Avans (bosh to'lov)")}:</td><td>${num(o.advance)}</td></tr>` : ''}
      ${(o.payments || []).map((p) => `<tr><td>${fmtDate(p.created_at)} ${methodName(p.method)}:</td><td>${num(p.amount)}</td></tr>`).join('')}
      ${o.balance > 0 ? `<tr class="big"><td>${t('QOLDI')}:</td><td>${num(o.balance)}</td></tr>${o.due_at ? `<tr><td>${t("To'lash sanasi")}:</td><td>${fmtDate(o.due_at)}</td></tr>` : ''}`
        : `<tr class="big"><td colspan="2" class="c">${t("TO'LIQ TO'LANDI")}</td></tr>`}</table>` : ''}
    ${o.cashier || o.printed_by ? `<div style="margin-top:4px">${t('Kassir')}: ${esc(o.cashier ? o.cashier.name : o.printed_by)}</div>` : ''}
    ${foot.length ? `<div class="foot">${foot.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}`;
}
function printReceipt(o, s = App.settings) {
  printDoc(`${t('Chek')} #${o.id}`, receiptBody(o, s), 'receipt', s, true);
}

// Kitchen ticket: big place name, dishes and notes — no prices.
// Kitchen ticket (the same look as the FLOWI Printer picture): the place big, then each dish — name first, the count
// at the right, in large letters — with its choices (+) and note (*). No prices.
function printKitchenTicket(tk) {
  const mark = (txt) => `<div class="kt-band">${txt}</div>`;
  printDoc(`${t('Buyurtma')} #${tk.order_id}`, `<style>
      .kt-band{background:#000;color:#fff !important;text-align:center;font-size:20px;font-weight:900;padding:4px 0;margin-bottom:4px}
      .kt-room{text-align:center;font-size:26px;font-weight:900;line-height:1.2}.kt-sub{text-align:center}
      .kt-head{display:flex;justify-content:space-between}.kt-it{display:flex;justify-content:space-between;gap:8px;font-size:19px;font-weight:900;line-height:1.25;margin-top:4px}
      .kt-it span:last-child{white-space:nowrap}.kt-note{padding-left:14px}</style>
    ${tk.test ? mark(t('SINOV')) : ''}${tk.cancel ? mark(t('BEKOR QILINDI')) : ''}
    ${tk.deleted ? `<div class="c">${t("BUTUN CHEK O'CHIRILDI")}</div>${tk.reason ? `<div class="c">${t('Sabab')}: ${esc(tk.reason)}</div>` : ''}` : ''}
    ${tk.reprint ? mark(t('QAYTA CHOP ETILDI')) : ''}${tk.late ? `<div class="c">${t('KECHIKIB CHIQDI')} (${fmtTime(tk.at)})</div>` : ''}
    <div class="kt-room">${esc(tk.room)}</div>
    <div class="kt-sub">${t('Chek')} #${tk.order_id} - ${esc(tk.waiter || '')}${tk.by && tk.by !== tk.waiter ? ` (${esc(tk.by)})` : ''} - ${fmtTime(tk.at || Date.now())}</div><hr>
    <div class="kt-head"><span>${t('Nomi')}</span><span>${t('Soni')}</span></div><hr>
    ${tk.items.map((i) => `<div class="kt-it"><span>${esc(i.name)}</span><span>${i.qty}</span></div>${modsText(i) ? `<div class="kt-note">+ ${esc(modsText(i))}</div>` : ''}${i.note ? `<div class="kt-note">* ${esc(i.note)}</div>` : ''}`).join('')}<hr>`,
  'kitchen', App.settings, true);
}

// Shrinks a picture before upload (a phone photo can be 8 MB; the desktop needs ~300 KB).
function imageToDataUrl(file, max, type = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d');
      if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL(type, 0.85));
    };
    img.onerror = () => reject(new Error(t("Rasm o'qilmadi")));
    img.src = URL.createObjectURL(file);
  });
}

// A computer with a printer can be chosen to print every new order (waiter's or cashier's).
// It listens with its own device key, so printing goes on even while the staff list is shown.
/* The order printer of this device (a computer with a printer, connected as a shared device).
   The server keeps every ticket; this device asks for the ones it has not printed — on every new order,
   every 30 seconds (that is also how the staff know the printer is on) and after the computer was off. */
const OrderPrinter = {
  es: null, timer: null, busy: false, cfg: null,
  on() { return !!(App.device && store('cp_kprint')); },
  dev(method, path, body) { return api(method, path, body, App.device.token); },
  async load() {
    if (!App.device) return null;
    try {
      this.cfg = await this.dev('GET', '/api/device/printer');
      // Devices switched on before 1.17 kept the switch only in the browser: it moves to the server once.
      if (!this.cfg.on && store('cp_kprint') && !store('cp_kprint_srv')) this.cfg = await this.dev('PUT', '/api/device/printer', { on: true, all: false, cats: 'all' });
      store('cp_kprint_srv', 1);
      store('cp_kprint', this.cfg.on ? true : null);
    } catch { /* offline: keep the last known state */ }
    return this.cfg;
  },
  sync() {
    if (!this.on()) { if (this.es) this.es.close(); this.es = null; clearInterval(this.timer); this.timer = null; return; }
    if (!this.es) {
      this.es = new EventSource(`/api/events?token=${encodeURIComponent(App.device.token)}`);
      this.es.addEventListener('order_print', () => this.pull());
      this.es.addEventListener('hello', () => this.pull());
      this.es.onerror = () => {
        if (this.es && this.es.readyState === EventSource.CLOSED) { this.es = null; setTimeout(() => this.sync(), 5000); }
      };
    }
    if (!this.timer) this.timer = setInterval(() => this.pull(), 30000);
    this.pull();
  },
  async pull() {
    if (this.busy || !this.on()) return;
    this.busy = true;
    try {
      const r = await this.dev('GET', '/api/device/print-jobs');
      for (const j of r.jobs) {
        if (j.kind === 'bill') printReceipt({ ...j.order, printed_by: j.by }, { ...(App.settings || {}), ...j.shop }); else printKitchenTicket(j);
        await new Promise((ok) => setTimeout(ok, 800));
      }
      if (r.jobs.length) await this.dev('POST', '/api/device/print-ack', { upto: r.last });
    } catch { /* the next pull tries again */ }
    this.busy = false;
  },
};

/* Browsers always show a print window, except Chrome/Edge started with --kiosk-printing:
   then checks go straight to the default printer. This makes a Windows launcher that opens FLOWI that way
   (its own browser profile, so it works even while another Chrome window is open). */
function downloadKioskLauncher() {
  const code = (App.device && App.device.code) || (App.tenant && App.tenant.code) || '';
  const url = `${location.origin}/c/${code}`;
  const bat = ['@echo off', 'chcp 65001 >nul', 'title FLOWI',
    `set "URL=${url}"`, 'set "PROFILE=%LOCALAPPDATA%\\FLOWI-kassa"',
    'set "FLAGS=--kiosk-printing --start-fullscreen --disable-session-crashed-bubble --no-first-run --user-data-dir="%PROFILE%" --app=%URL%"',
    'for %%B in ("%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe") do (',
    '  if exist %%B ( start "" %%B %FLAGS% & exit /b )', ')',
    'echo Chrome yoki Edge topilmadi. Google Chrome ni o\'rnating.', 'pause'].join('\r\n');
  downloadBlob('FLOWI-kassa.bat', new Blob([bat + '\r\n'], { type: 'application/octet-stream' }));
}

function downloadCsv(filename, rows) {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Local backup of checks (IndexedDB on this computer) ----------
// Every check closed or seen on a money device is copied here, so it survives a server or internet failure.
const LocalBackup = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB'));
      const req = indexedDB.open('choyxona-backup', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('checks', { keyPath: 'key' });
      req.onsuccess = () => { this.db = req.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  },
  async save(orders) {
    try {
      const db = await this.open();
      const code = (App.tenant && App.tenant.code) || '';
      await new Promise((resolve, reject) => {
        const txn = db.transaction('checks', 'readwrite');
        for (const o of [].concat(orders)) if (o && o.status === 'closed') txn.objectStore('checks').put({ key: `${code}#${o.id}`, code, saved_at: Date.now(), order: o });
        txn.oncomplete = resolve;
        txn.onerror = () => reject(txn.error);
      });
    } catch { /* backup must never break the cash desk */ }
  },
  async all() {
    try {
      const db = await this.open();
      const code = (App.tenant && App.tenant.code) || '';
      return await new Promise((resolve, reject) => {
        const req = db.transaction('checks').objectStore('checks').getAll();
        req.onsuccess = () => resolve(req.result.filter((r) => r.code === code).map((r) => r.order).sort((a, b) => b.closed_at - a.closed_at));
        req.onerror = () => reject(req.error);
      });
    } catch { return []; }
  },
  rows(orders) {
    return [[t('Chek'), t('Yopildi'), t('Joy'), t('Ofitsant'), t('Mehmonlar'), t('Taomlar'), t('Taomlar summasi'), t('Xizmat haqi'), t('Chegirma'), t('Jami'), t('Naqd'), t('Karta'), t("O'tkazma")],
      ...orders.map((o) => [o.id, fmtDateTime(o.closed_at), placeName(o), o.waiter && o.waiter.name, o.guests,
        o.items.filter((i) => i.status !== 'cancelled').map((i) => `${i.name} x${i.qty}`).join(', '),
        o.subtotal, o.service_amount, o.discount, o.total, o.paid_cash, o.paid_card, o.paid_transfer])];
  },
};

// ---------- Screen: keep awake, full screen ----------
const Screen = {
  lock: null,
  async keepAwake() {
    try {
      if ('wakeLock' in navigator && !this.lock && document.visibilityState === 'visible') {
        this.lock = await navigator.wakeLock.request('screen');
        this.lock.addEventListener('release', () => { this.lock = null; });
      }
    } catch { /* not allowed now; retried on the next visit */ }
  },
  canFullscreen() { return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen); },
  isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
  standalone() { return window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true; },
  // iPhone Safari has no full-screen mode for sites: there the app is added to the home screen instead.
  toggleFull() {
    const el = document.documentElement;
    if (!this.canFullscreen()) { if (this.standalone()) toast(t("Ilova allaqachon to'liq ekranda"), 'ok'); else installApp(); return; }
    if (this.isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
      if (r && r.catch) r.catch(() => installApp());
    }
  },
  button(id, cls = 'icon-btn') {
    return `<button class="${cls}" id="${id}" title="${esc(t("To'liq ekran"))}">${icon(this.isFull() ? 'minimize' : 'maximize')}</button>`;
  },
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Screen.keepAwake(); });
document.addEventListener('pointerdown', () => Screen.keepAwake());
['fullscreenchange', 'webkitfullscreenchange'].forEach((e) => document.addEventListener(e, () => {
  document.querySelectorAll('#lock-full, #top-full').forEach((b) => { b.innerHTML = icon(Screen.isFull() ? 'minimize' : 'maximize'); });
}));

// ---------- Desktop background: the boss's colour or picture, or a built-in picture that changes daily ----------
// 1–16 drawn as SVG, 17–28 painted pictures (JPG, made by scripts/wallpapers.html).
const WALLPAPERS = 28;
const LIGHT_WALLS = [4, 6, 8, 11, 16, 18, 19, 25];
function wallpaperUrl(n, small = false) {
  const nn = String(n).padStart(2, '0');
  return n > 16 ? `/bg/${small ? 'thumb/' : ''}${nn}.jpg` : `/bg/${nn}.svg`;
}
function wallpaperOfDay(d = new Date()) {
  const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return (day % WALLPAPERS) + 1;
}
function hexLuma(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
// Returns { style, cls }: light colours get dark text; pictures get a shade so the clock and names stay readable.
function lockBackground(bg) {
  bg = bg || { mode: 'default' };
  const shade = (k) => `linear-gradient(180deg, rgba(0,0,0,${k}) 0%, rgba(0,0,0,${k * 0.6}) 40%, rgba(0,0,0,${k + 0.15}) 100%)`;
  if (bg.mode === 'color' && /^#[0-9a-f]{6}$/i.test(bg.color || '')) {
    const light = hexLuma(bg.color) > 0.45;
    return { style: `background:${bg.color}`, cls: light ? 'on-light' : '' };
  }
  if (bg.mode === 'image' && bg.url) return { style: `background:${shade(0.45)}, url('${bg.url}') center/cover no-repeat ${bg.color || '#0b1f33'}`, cls: 'on-image' };
  if (bg.mode === 'auto' || bg.mode === 'builtin') {
    const n = bg.mode === 'builtin' && bg.n >= 1 && bg.n <= WALLPAPERS ? bg.n : wallpaperOfDay();
    const url = `url('${wallpaperUrl(n)}') center/cover no-repeat`;
    // Light pictures keep their colours and get dark text; dark ones get a soft shade and white text.
    if (LIGHT_WALLS.includes(n)) return { style: `background:linear-gradient(rgba(255,255,255,.18), rgba(255,255,255,.18)), ${url} #f5f5f4`, cls: 'on-light' };
    return { style: `background:${shade(0.3)}, ${url} #0b1f33`, cls: 'on-image' };
  }
  return { style: '', cls: '' };
}

// Live timers: [data-eta] counts down, [data-since] counts up.
function tickTimers() {
  const now = Date.now();
  document.querySelectorAll('[data-eta]').forEach((el) => {
    const left = Number(el.dataset.eta) - now;
    el.textContent = left >= 0 ? fmtDuration(left) : `+${fmtDuration(-left)}`;
    el.classList.toggle('late', left < 0);
    const card = el.closest('.ticket');
    if (card && card.classList.contains('cooking')) card.classList.toggle('late', left < 0);
  });
  document.querySelectorAll('[data-since]').forEach((el) => { el.textContent = fmtDuration(now - Number(el.dataset.since)); });
  document.querySelectorAll('[data-clock]').forEach((el) => { el.textContent = fmtTime(now); });
}
setInterval(tickTimers, 1000);
