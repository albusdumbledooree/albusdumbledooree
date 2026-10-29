'use strict';
/*
 * A room's QR menu on a guest's phone (no login): the menu with photos, a cart, "send to the waiter",
 * "call the waiter", "the bill". What is sent is a request: a worker approves it before it reaches the check.
 */
(function () {
  const KEY = (/^\/q\/(\d+-[A-Za-z0-9]{12})/.exec(location.pathname) || [])[1];
  const T = {
    ru: {
      'Xona': 'Комната', 'Ofitsant': 'Официант', 'Kassir': 'Кассир', 'Qidirish': 'Поиск', 'Hammasi': 'Все', "Qo'shish": 'Добавить', 'daq': 'мин',
      'Savat': 'Корзина', 'taom': 'блюд', "Ofitsantga yuborish": 'Отправить официанту', 'Izoh (masalan: achchiq bo\'lmasin)': 'Комментарий (например: не острое)',
      'Buyurtmaga izoh': 'Комментарий к заказу', 'Taomlar': 'Блюда', 'Xizmat haqi': 'Обслуживание', 'Jami': 'Итого', 'Taxminan': 'Примерно',
      "Buyurtma ofitsant tasdiqlagandan keyin oshxonaga boradi.": 'Заказ уйдёт на кухню после подтверждения официантом.',
      "Ofitsantni chaqirish": 'Позвать официанта', 'Hisob': 'Счёт', "Hisobni so'rash": 'Попросить счёт', 'Chaqirish': 'Позвать',
      'Buyurtmalaringiz': 'Ваши заказы', 'Kutilmoqda — ofitsant tasdiqlaydi': 'Ждёт подтверждения официанта', 'Tasdiqlandi — tayyorlanmoqda': 'Подтверждён — готовится',
      'Rad etildi': 'Отклонён', "Muddati o'tdi — ofitsantni chaqiring": 'Время вышло — позовите официанта', 'Bajarildi': 'Выполнено',
      "Ofitsant chaqirildi": 'Официант вызван', "Hisob so'raldi": 'Счёт запрошен',
      "Yuborildi! Ofitsant tasdiqlashini kuting": 'Отправлено! Дождитесь подтверждения официанта', "Ofitsant chaqirildi — hozir keladi": 'Официант вызван — сейчас подойдёт',
      "Allaqachon chaqirilgan — ofitsant keladi": 'Уже вызван — официант подойдёт', "Hisob so'raldi — ofitsant olib keladi": 'Счёт запрошен — официант принесёт',
      "Hozircha buyurtma yo'q": 'Пока заказов нет', 'Sizning hisobingiz': 'Ваш счёт',
      "Hozir QR orqali buyurtma qabul qilinmaydi — ofitsantga ayting.": 'Сейчас заказы через QR не принимаются — скажите официанту.',
      "QR orqali buyurtma {0}–{1} oralig'ida qabul qilinadi.": 'Заказы через QR принимаются с {0} до {1}.',
      "Aloqa yo'q. Internetni tekshiring": 'Нет связи. Проверьте интернет', 'Savat bo\'sh': 'Корзина пуста',
      'Bu taom tugadi': 'Это блюдо закончилось', "porsiya": 'порция', 'dona': 'шт', 'Yangilash': 'Обновить',
      'Joylashuv aniqlanmoqda…': 'Определяем местоположение…',
      "Joylashuvga ruxsat bering — buyurtma faqat shu yerning ichida qabul qilinadi": 'Разрешите доступ к местоположению — заказ принимается только внутри заведения',
      "Joylashuv aniqlanmadi. GPS'ni yoqing yoki ofitsantni chaqiring": 'Не удалось определить местоположение. Включите GPS или позовите официанта',
      'Avval ofitsant stolni ochishi kerak. "Ofitsantni chaqirish" ni bosing': 'Сначала официант должен открыть стол. Нажмите «Позвать официанта»',
      'Avval ofitsant stolni ochadi — "Chaqirish" ni bosing.': 'Сначала официант откроет стол — нажмите «Позвать».',
    },
  };
  const LANGS = ['uz', 'ru'];
  let lang = (() => { try { const l = localStorage.getItem('guest_lang'); return LANGS.includes(l) ? l : (navigator.language || '').startsWith('ru') ? 'ru' : 'uz'; } catch { return 'uz'; } })();
  const t = (s, ...a) => ((lang !== 'uz' && T[lang] && T[lang][s]) || s).replace(/\{(\d)\}/g, (_, i) => a[i] ?? '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } return v; };
  const guestId = store('guest_id') || store('guest_id', `g${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const CART_KEY = `guest_cart_${KEY}`;

  let D = null;
  let cart = store(CART_KEY) || {}; // dish_id -> { qty, note }
  let cat = 'all';
  let search = '';
  let timer = null;
  const app = document.getElementById('app');

  const money = (n) => `${String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${D ? esc(D.currency) : ''}`;
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
  async function api(method, path, body) {
    let r;
    try {
      r = await fetch(`/api/guest/${KEY}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    } catch { throw new Error(t("Aloqa yo'q. Internetni tekshiring")); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = /^Buyurtma faqat .* ichida qabul qilinadi$/.test(j.error || '') && lang === 'ru' ? 'Заказ принимается только внутри заведения' : t(j.error || String(r.status));
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return j;
  }

  async function load(quiet) {
    try {
      D = await api('GET', `?g=${encodeURIComponent(guestId)}`);
      document.title = `${D.room.name} · ${D.name}`;
      // Dishes that ran out leave the cart.
      for (const id of Object.keys(cart)) if (!D.dishes.some((d) => String(d.id) === id)) delete cart[id];
      store(CART_KEY, cart);
      render();
    } catch (e) {
      if (!quiet || !D) app.innerHTML = `<div class="empty"><div style="font-size:48px">⚠️</div><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">${t('Yangilash')}</button></div>`;
    }
    clearTimeout(timer);
    const waiting = D && D.requests.some((r) => r.status === 'pending');
    timer = setTimeout(() => load(true), waiting ? 5000 : 30000);
  }

  const canOrder = () => D && D.order.can;
  const cartLines = () => Object.entries(cart).map(([id, c]) => ({ d: D.dishes.find((x) => String(x.id) === id), ...c })).filter((l) => l.d && l.qty > 0);
  const cartSum = () => cartLines().reduce((s, l) => s + l.d.price * l.qty, 0);
  const cartCount = () => cartLines().reduce((s, l) => s + l.qty, 0);
  function setQty(id, qty) {
    if (qty <= 0) delete cart[id]; else cart[id] = { ...(cart[id] || {}), qty: Math.min(50, qty) };
    store(CART_KEY, cart);
  }

  function stepHtml(d) {
    const n = (cart[d.id] || {}).qty || 0;
    if (!canOrder()) return '';
    return n ? `<span class="step"><button data-minus="${d.id}" aria-label="-">−</button><span>${n}</span><button data-plus="${d.id}" aria-label="+">+</button></span>`
      : `<button class="add" data-plus="${d.id}">${t("Qo'shish")}</button>`;
  }
  function dishHtml(d) {
    const ph = d.photo ? `<img src="${esc(d.photo)}" alt="" loading="lazy">` : esc(d.icon || '🍽');
    return `<div class="dish" id="d${d.id}"><div class="ph">${ph}</div><div>
      <b>${esc(d.name)}</b>${d.description ? `<p>${esc(d.description)}</p>` : ''}${d.eta_minutes ? `<span class="eta">⏱ ~${d.eta_minutes} ${t('daq')}</span>` : ''}
      <div class="row"><span class="price">${money(d.price)}</span><span class="grow"></span>${stepHtml(d)}</div></div></div>`;
  }

  const ST = () => ({ pending: t('Kutilmoqda — ofitsant tasdiqlaydi'), approved: t('Tasdiqlandi — tayyorlanmoqda'), rejected: t('Rad etildi'),
    expired: t("Muddati o'tdi — ofitsantni chaqiring"), done: t('Bajarildi') });
  function requestsHtml() {
    if (!D.requests.length) return '';
    const st = ST();
    return `<h2 class="cat">${t('Buyurtmalaringiz')}</h2>${D.requests.map((r) => `<div class="req">
      <div class="row" style="display:flex;gap:8px;align-items:center"><b>${r.kind === 'order' ? `${r.items.reduce((s, i) => s + i.qty, 0)} ${t('taom')}` : r.kind === 'waiter' ? t('Ofitsant chaqirildi') : t("Hisob so'raldi")}</b>
        <span class="grow"></span><span class="small" style="font-size:13px;color:var(--muted)">${(() => { const d = new Date(r.created_at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })()}</span></div>
      <span class="st ${r.status}">${st[r.status] || r.status}</span>${r.reason ? ` <span style="font-size:14px">— ${esc(r.reason)}</span>` : ''}
      ${r.items.length ? `<ul>${r.items.map((i) => `<li>${esc(i.name)} × ${i.qty}${i.note ? ` (${esc(i.note)})` : ''}</li>`).join('')}</ul>` : ''}</div>`).join('')}`;
  }

  function render() {
    const s = D;
    const waiting = s.order.why === 'hours' ? t("QR orqali buyurtma {0}–{1} oralig'ida qabul qilinadi.", s.order.from, s.order.to)
      : ['off', 'closed'].includes(s.order.why) ? t("Hozir QR orqali buyurtma qabul qilinmaydi — ofitsantga ayting.") : '';
    const q = search.trim().toLowerCase();
    const shown = s.dishes.filter((d) => (cat === 'all' || d.category_id === Number(cat)) && (!q || `${d.name} ${d.description}`.toLowerCase().includes(q)));
    const groups = [...s.categories, { id: null, name: '' }].map((c) => ({ c, ds: shown.filter((d) => (d.category_id ?? null) === c.id || (c.id === null && !s.categories.some((x) => x.id === d.category_id))) }))
      .filter((g) => g.ds.length);
    const count = cartCount();
    app.innerHTML = `
      <header class="top"><div class="wrap">
        <div class="brand">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : ''}<div class="grow"><h1>${esc(s.name)}</h1></div>
          <div class="lang">${LANGS.map((l) => `<button data-lang="${l}" class="${l === lang ? 'on' : ''}">${l.toUpperCase()}</button>`).join('')}</div></div>
        <span class="room">🪑 ${esc(s.room.name)}</span>
        <div class="who">${s.waiters.length ? `<span>${t('Ofitsant')}: <b>${s.waiters.map(esc).join(', ')}</b></span>` : ''}${s.cashier ? `<span>${t('Kassir')}: <b>${esc(s.cashier)}</b></span>` : ''}</div>
      </div></header>
      <nav class="cats"><div class="wrap">${[{ id: 'all', name: t('Hammasi') }, ...s.categories].map((c) => `<button data-cat="${c.id}" class="${String(cat) === String(c.id) ? 'on' : ''}">${c.icon ? `${esc(c.icon)} ` : ''}${esc(c.name)}</button>`).join('')}</div></nav>
      <main class="wrap">
        ${waiting ? `<div class="notice">${waiting}</div>` : ''}
        <input class="search" type="search" placeholder="🔍 ${t('Qidirish')}" value="${esc(search)}">
        <div id="req-box">${requestsHtml()}</div>
        ${groups.map((g) => `${g.c.name ? `<h2 class="cat">${g.c.icon ? `${esc(g.c.icon)} ` : ''}${esc(g.c.name)}</h2>` : '<div style="height:12px"></div>'}${g.ds.map(dishHtml).join('')}`).join('')}
        <p class="foot">FLOWI · <a href="https://flowi.uz" target="_blank" rel="noopener">flowi.uz</a></p>
      </main>
      ${canOrder() ? `<div class="bar"><div class="wrap">
        <button class="btn small" id="call">🙋<span>${t('Chaqirish')}</span></button>
        <button class="btn small" id="bill">🧾<span>${t('Hisob')}</span></button>
        <button class="btn primary cart" id="cart" ${count ? '' : 'disabled'}><span title="${t('Savat')}">🛒 <span class="n">${count}</span></span><span>${money(cartSum())}</span></button>
      </div></div>` : ''}`;
    bind();
  }

  function bind() {
    app.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => { lang = b.dataset.lang; try { localStorage.setItem('guest_lang', lang); } catch { /* ignore */ } document.documentElement.lang = lang; render(); });
    app.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { cat = b.dataset.cat; render(); window.scrollTo({ top: document.querySelector('.cats').offsetTop, behavior: 'smooth' }); });
    const si = app.querySelector('.search');
    si.oninput = () => { search = si.value; const pos = si.selectionStart; render(); const n = app.querySelector('.search'); n.focus(); n.setSelectionRange(pos, pos); };
    app.querySelectorAll('[data-plus]').forEach((b) => b.onclick = () => { const id = b.dataset.plus; setQty(id, ((cart[id] || {}).qty || 0) + 1); render(); });
    app.querySelectorAll('[data-minus]').forEach((b) => b.onclick = () => { const id = b.dataset.minus; setQty(id, ((cart[id] || {}).qty || 0) - 1); render(); });
    const c = app.querySelector('#cart'); if (c) c.onclick = cartSheet;
    const call = app.querySelector('#call'); if (call) call.onclick = () => sendCall('waiter');
    const bill = app.querySelector('#bill'); if (bill) bill.onclick = billSheet;
  }

  function sheet(html) {
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = `<div class="sheet">${html}</div>`;
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('.x')) back.remove(); });
    document.body.appendChild(back);
    return back;
  }

  function serviceOf(sub) {
    const sv = D.service;
    if (sv.type === 'per_guest') return 0;
    return Math.round(sub * sv.pct / 100);
  }

  function cartSheet() {
    const lines = cartLines();
    if (!lines.length) return toast(t("Savat bo'sh"));
    const sub = cartSum();
    const svc = serviceOf(sub);
    const el = sheet(`<h3>🛒 ${t('Savat')}<button class="x">×</button></h3>
      ${lines.map((l) => `<div class="line" data-id="${l.d.id}"><div><b>${esc(l.d.name)}</b><div style="font-size:14px;color:var(--muted)">${money(l.d.price)} × ${l.qty} = <b>${money(l.d.price * l.qty)}</b></div></div>
        <span class="step"><button data-m="${l.d.id}">−</button><span>${l.qty}</span><button data-p="${l.d.id}">+</button></span>
        <input data-note="${l.d.id}" maxlength="120" placeholder="${esc(t("Izoh (masalan: achchiq bo'lmasin)"))}" value="${esc(l.note || '')}"></div>`).join('')}
      <div class="sum"><span>${t('Taomlar')}</span><span>${money(sub)}</span>
        ${svc ? `<span>${t('Xizmat haqi')} ${D.service.pct}%</span><span>${money(svc)}</span>` : ''}
        <span class="total">${t('Taxminan')}</span><span class="total">${money(sub + svc)}</span></div>
      <textarea id="gnote" rows="2" maxlength="300" placeholder="${esc(t('Buyurtmaga izoh'))}"></textarea>
      <p class="hint">ℹ️ ${t('Buyurtma ofitsant tasdiqlagandan keyin oshxonaga boradi.')}</p>
      ${D.order.busy_only && !D.order.busy ? `<div class="notice">${t('Avval ofitsant stolni ochadi — "Chaqirish" ni bosing.')}</div>` : ''}
      <button class="btn primary" id="send" ${D.order.busy_only && !D.order.busy ? 'disabled' : ''}>✅ ${t('Ofitsantga yuborish')}</button>`);
    const again = () => { el.remove(); render(); if (cartLines().length) cartSheet(); };
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { setQty(b.dataset.p, cart[b.dataset.p].qty + 1); again(); });
    el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { setQty(b.dataset.m, cart[b.dataset.m].qty - 1); again(); });
    el.querySelectorAll('[data-note]').forEach((i) => i.oninput = () => { cart[i.dataset.note].note = i.value; store(CART_KEY, cart); });
    el.querySelector('#send').onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        await api('POST', '/request', { guest_id: guestId, note: el.querySelector('#gnote').value,
          items: cartLines().map((l) => ({ dish_id: l.d.id, qty: l.qty, note: l.note || '' })), ...(await where()) });
        cart = {}; store(CART_KEY, cart);
        el.remove(); toast(t('Yuborildi! Ofitsant tasdiqlashini kuting'));
        await load(true);
        const box = document.getElementById('req-box'); if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) { btn.disabled = false; toast(err.message); }
    };
  }

  // The place asks for the phone's position (a shared link must not work from home).
  async function where() {
    if (!D.order.geo) return {};
    toast(t('Joylashuv aniqlanmoqda…'));
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error(t("Joylashuv aniqlanmadi. GPS'ni yoqing yoki ofitsantni chaqiring")));
      navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) }),
        (e) => reject(new Error(e.code === 1 ? t('Joylashuvga ruxsat bering — buyurtma faqat shu yerning ichida qabul qilinadi') : t("Joylashuv aniqlanmadi. GPS'ni yoqing yoki ofitsantni chaqiring"))),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    });
  }

  async function sendCall(kind) {
    try {
      const r = await api('POST', '/request', { kind, guest_id: guestId, ...(await where()) });
      toast(r.again ? t('Allaqachon chaqirilgan — ofitsant keladi') : kind === 'bill' ? t("Hisob so'raldi — ofitsant olib keladi") : t('Ofitsant chaqirildi — hozir keladi'));
      load(true);
    } catch (e) { toast(e.message); }
  }

  function billSheet() {
    const b = D.bill;
    const el = sheet(`<h3>🧾 ${t('Sizning hisobingiz')}<button class="x">×</button></h3>
      ${b && b.items.length ? `${b.items.map((i) => `<div class="line"><div>${esc(i.name)} × ${i.qty}</div><b>${money(i.price * i.qty)}</b></div>`).join('')}
        <div class="sum"><span>${t('Taomlar')}</span><span>${money(b.subtotal)}</span>${b.service_amount ? `<span>${t('Xizmat haqi')}</span><span>${money(b.service_amount)}</span>` : ''}
        <span class="total">${t('Jami')}</span><span class="total">${money(b.total)}</span></div>` : `<p class="hint">${t("Hozircha buyurtma yo'q")}</p>`}
      <button class="btn green" id="ask">🧾 ${t("Hisobni so'rash")}</button>`);
    el.querySelector('#ask').onclick = () => { el.remove(); sendCall('bill'); };
  }

  if (!KEY) { app.innerHTML = '<div class="empty">QR?</div>'; return; }
  document.documentElement.lang = lang;
  load();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
}());
