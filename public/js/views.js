'use strict';
/* Operational screens: login, rooms, order taking, kitchen, stop-list, cashier. */

const Views = {};
const Carts = {}; // roomId -> [{ dish_id, name, price, qty, note }]
const UI = { category: 'all', search: '', kitchenTab: 'board' };

function emptyState(icon, text) { return `<div class="empty"><span class="big">${icon}</span>${text}</div>`; }
function can(...roles) { return App.user && roles.includes(App.user.role); }

// ---------- Login ----------
Views.login = {
  title: 'Kirish',
  public: true,
  render() {
    return `<div class="login-wrap"><form class="card login" id="login-form">
      <div class="brand"><img src="/icon.svg" alt=""><div><b>${esc((App.info && App.info.name) || 'Choyxona Pro')}</b><span>Boshqaruv tizimi</span></div></div>
      <div class="stack">
        <label class="field">Choyxona kodi<input name="code" id="login-code" autocapitalize="none" autocomplete="organization" value="${esc(store('cp_code') || '')}" placeholder="masalan: navruz" required></label>
        ${App.info && App.info.blocked ? `<p class="toast error" style="margin:0">Bu choyxona vaqtincha bloklangan</p>` : ''}
        <label class="field">Login<input name="username" autocomplete="username" autocapitalize="none" required></label>
        <label class="field">Parol<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn primary lg block" type="submit">Kirish</button>
      </div>
      ${App.info && App.info.demo ? `<div class="demo">Sinov uchun hisoblar:<br>
        ${[['ega', 'ega123', 'Boshliq'], ['admin', 'admin123', 'Admin'], ['kassir', 'kassir123', 'Kassir'], ['jasur', '1234', 'Ofitsant'], ['oshpaz', '1234', 'Oshpaz']]
          .map(([u, p, n]) => `<button type="button" class="btn sm" data-u="${u}" data-p="${p}">${n}</button>`).join('')}
      </div>` : ''}
    </form></div>`;
  },
  bind(root) {
    const form = root.querySelector('#login-form');
    root.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => {
      form.username.value = b.dataset.u; form.password.value = b.dataset.p; form.requestSubmit();
    });
    // Show the choyxona's name (and demo shortcuts) as soon as a valid code is typed.
    form.code.onchange = async () => {
      const code = form.code.value.trim().toLowerCase();
      if (!code) return;
      try {
        App.info = await GET(`/api/info?code=${encodeURIComponent(code)}`);
        store('cp_code', code);
        // Re-render for the new name/demo buttons, keeping whatever was typed meanwhile.
        const { username, password } = form;
        const keep = { u: username.value, p: password.value, focus: document.activeElement && document.activeElement.name };
        render();
        const f = document.getElementById('login-form');
        if (f) {
          f.username.value = keep.u; f.password.value = keep.p;
          if (keep.focus && f[keep.focus]) f[keep.focus].focus();
        }
      } catch (err) { App.info = null; toastError(err); }
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const d = formData(form);
        d.code = d.code.trim().toLowerCase();
        const r = await POST('/api/login', d);
        store('cp_code', d.code);
        App.token = r.token;
        store('cp_token', r.token);
        await afterLogin();
        location.hash = homeRoute();
      } catch (err) { toastError(err); }
    };
  },
};

// ---------- Rooms (floor plan) ----------
function roomState(r) {
  if (r.order && r.order.bill_requested) return 'bill';
  if (r.order && r.order.items.ready) return 'ready';
  if (r.order) return 'busy';
  if (r.reservations.length) return 'reserved';
  return 'free';
}

Views.rooms = {
  title: 'Xonalar', icon: '🏠', roles: ['owner', 'admin', 'cashier', 'waiter'], nav: true, refreshOn: ['rooms'],
  async load() { return { rooms: await GET('/api/rooms') }; },
  render({ rooms }) {
    const busy = rooms.filter((r) => r.order).length;
    return `<div class="page-head"><h1>${App.user.role === 'waiter' ? 'Mening xonalarim' : 'Xonalar'}</h1>
      <span class="chip">${busy} band / ${rooms.length}</span><span class="spacer"></span></div>
      <div class="legend"><span><i style="background:var(--ok)"></i>Bo'sh</span><span><i style="background:var(--accent)"></i>Band</span>
        <span><i style="background:var(--ok);box-shadow:0 0 0 3px var(--ok-soft)"></i>Taom tayyor</span>
        <span><i style="background:var(--violet)"></i>Hisob so'raldi</span><span><i style="background:var(--info)"></i>Bron</span></div>
      ${rooms.length ? `<div class="floor">${rooms.map((r) => {
        const st = roomState(r);
        const o = r.order;
        const [typeName, typeIco] = ROOM_TYPES[r.type] || ROOM_TYPES.boshqa;
        return `<button class="room ${st}" data-room="${r.id}">
          <span class="type-ico" title="${typeName}">${typeIco}</span>
          <span class="no">${esc(r.number)}</span><span class="nm">${esc(r.name)}</span>
          <span class="meta">${o ? `👥 ${o.guests} · 🧑‍🍳 ${esc(o.waiter_name)} · <span data-since="${o.opened_at}"></span>` : `${typeName} · ${r.capacity} kishilik`}</span>
          ${App.user.role !== 'waiter' && !o ? `<span class="meta">${r.waiters.map((w) => esc(w.name)).join(', ') || 'Ofitsant biriktirilmagan'}</span>` : ''}
          <span class="flags">
            ${o && o.items.ready ? `<span class="chip ready">🔔 ${o.items.ready} tayyor</span>` : ''}
            ${o && (o.items.new + o.items.cooking) ? `<span class="chip cooking">🍳 ${o.items.new + o.items.cooking}</span>` : ''}
            ${o && o.bill_requested ? '<span class="chip violet">🧾 Hisob</span>' : ''}
            ${r.reservations.map((x) => `<span class="chip new">📅 ${fmtTime(x.starts_at)} ${esc(x.customer)}</span>`).join('')}
          </span>
          <span class="sum">${o ? money(o.subtotal) : "Bo'sh"}</span>
        </button>`;
      }).join('')}</div>` : emptyState('🏠', App.user.role === 'waiter' ? "Sizga hali xona biriktirilmagan. Administratorga murojaat qiling." : "Xonalar yo'q. Sozlamalar → Xonalar bo'limida qo'shing.")}`;
  },
  bind(root) {
    root.querySelectorAll('[data-room]').forEach((b) => b.onclick = () => { location.hash = `#/room/${b.dataset.room}`; });
  },
};

// ---------- Order screen ----------
function itemActions(i) {
  const out = [];
  if (i.status === 'ready' && can('owner', 'admin', 'cashier', 'waiter')) out.push(`<button class="btn ok sm" data-serve="${i.id}">✋ Oldim</button>`);
  const waiterCan = App.user.role === 'waiter' && (i.needs_kitchen ? i.status === 'new' : Date.now() - i.created_at < 5 * MIN);
  if (i.status !== 'cancelled' && (waiterCan || can('owner', 'admin', 'cashier'))) {
    out.push(`<button class="btn ghost sm danger-text" data-cancel-item="${i.id}" data-st="${i.status}" title="Bekor qilish">✕</button>`);
  }
  return out.join('');
}

function orderItemHtml(i) {
  const timer = i.status === 'new' || i.status === 'cooking' ? `<span data-eta="${i.eta_at}"></span>` : '';
  return `<div class="oi ${i.status}">
    <div><span class="name">${esc(i.name)}</span> <span class="muted">× ${i.qty}</span></div>
    <div class="num right"><b>${money(i.price * i.qty)}</b></div>
    <div class="meta"><span class="chip ${i.status}">${STATUS_NAMES[i.status]}</span>${timer}
      <span>${fmtTime(i.created_at)}</span>${i.chef_name ? `<span>👨‍🍳 ${esc(i.chef_name)}</span>` : ''}
      ${i.note ? `<span>📝 ${esc(i.note)}</span>` : ''}${i.cancel_reason ? `<span>(${esc(i.cancel_reason)})</span>` : ''}
      <span style="margin-left:auto" class="row">${itemActions(i)}</span></div>
  </div>`;
}

Views.room = {
  title: 'Buyurtma', roles: ['owner', 'admin', 'cashier', 'waiter'], refreshOn: ['rooms', 'menu'],
  async load([id]) {
    const roomId = Number(id);
    const [rooms, menu] = await Promise.all([GET(App.user.role === 'waiter' ? '/api/rooms' : '/api/rooms?all=1'), GET('/api/menu')]);
    App.menu = menu;
    const room = rooms.find((r) => r.id === roomId);
    if (!room) throw new Error('Xona topilmadi yoki sizga biriktirilmagan');
    const order = room.order ? await GET(`/api/orders/${room.order.id}`) : null;
    return { room, order, menu, rooms };
  },
  render({ room, order, menu }) {
    const cart = Carts[room.id] || [];
    const cats = menu.categories.filter((c) => menu.dishes.some((d) => d.category_id === c.id));
    const q = UI.search.toLowerCase();
    const dishes = menu.dishes.filter((d) => (UI.category === 'all' || d.category_id === Number(UI.category)) && (!q || d.name.toLowerCase().includes(q)));
    const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const items = order ? order.items : [];
    const liveItems = items.filter((i) => i.status !== 'cancelled');
    const shownItems = [...liveItems, ...items.filter((i) => i.status === 'cancelled')];
    return `<div class="page-head"><a class="btn sm" href="#/rooms">← Xonalar</a>
      <h1>${esc(room.number)} · ${esc(room.name)}</h1>
      ${order ? `<span class="chip">Chek #${order.id}</span><span class="chip">🧑‍🍳 ${esc(order.waiter.name)}</span>` : '<span class="chip ready">Bo\'sh</span>'}
      <span class="spacer"></span></div>
      <div class="order-layout">
        <div class="card">
          <div class="card-head"><h2>Buyurtma</h2><span class="spacer"></span>
            ${order ? `<span class="muted small">Ochildi ${fmtTime(order.opened_at)} · <span data-since="${order.opened_at}"></span></span>` : ''}</div>
          <label class="field" style="margin-bottom:10px">Mehmonlar soni
            <input type="number" min="1" name="guests" id="guests" value="${order ? order.guests : (Carts[`g${room.id}`] || 1)}"></label>
          ${order && order.note ? `<p class="small muted">📝 ${esc(order.note)}</p>` : ''}
          <div class="order-items">${shownItems.length ? shownItems.map(orderItemHtml).join('') : emptyState('🍽️', "Hali taom buyurtma qilinmagan. O'ngdagi menyudan tanlang.")}</div>
          ${order ? `<div class="totals num">
            <span>Taomlar</span><span class="right">${money(order.subtotal)}</span>
            <span>Xizmat haqi ${order.service_pct}%</span><span class="right">${money(order.service_amount)}</span>
            <span class="grand">Jami</span><span class="grand right">${money(order.total)}</span></div>
            <div class="row" style="margin-top:12px">
              ${can('waiter', 'owner', 'admin') ? `<button class="btn ${order.bill_requested ? '' : 'accent'}" id="req-bill" ${order.bill_requested ? 'disabled' : ''}>🧾 ${order.bill_requested ? "Hisob so'raldi" : "Hisob so'rash"}</button>` : ''}
              <button class="btn" id="print-bill">🖨 Chek</button>
              ${can('owner', 'admin', 'cashier') ? `<button class="btn primary" id="pay">💳 To'lov qabul qilish</button><button class="btn" id="transfer">↔ Ko'chirish</button>` : ''}
              ${can('owner', 'admin') || (App.user.role === 'waiter' && !liveItems.length) ? `<button class="btn danger-text" id="cancel-order">Chekni bekor qilish</button>` : ''}
            </div>` : ''}
        </div>
        <div>
          <div class="card">
            <div class="card-head"><h2>Menyu</h2><span class="spacer"></span>
              <span class="muted small" title="Oshxonadagi navbat">🍳 Navbat: ${menu.load.pending} yangi, ${menu.load.cooking} tayyorlanmoqda${menu.load.extra_minutes ? ` (+${menu.load.extra_minutes} daq)` : ''}</span></div>
            <div class="tabs"><button class="tab ${UI.category === 'all' ? 'active' : ''}" data-cat="all">Hammasi</button>
              ${cats.map((c) => `<button class="tab ${String(UI.category) === String(c.id) ? 'active' : ''}" data-cat="${c.id}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}</div>
            <input class="menu-search" type="search" id="dish-search" placeholder="🔎 Taom qidirish..." value="${esc(UI.search)}">
            <div class="dishes">${dishes.map((d) => {
              const inCart = cart.find((c) => c.dish_id === d.id);
              return `<button class="dish ${d.available ? '' : 'out'}" data-dish="${d.id}" ${d.available ? '' : 'disabled'}>
                ${inCart ? `<span class="qty"><span class="badge">${inCart.qty}</span></span>` : ''}
                <span class="ic">${esc(d.icon || '🍽️')}</span><span class="nm">${esc(d.name)}</span>
                <span class="eta">${d.needs_kitchen ? `⏱ ~${d.eta_minutes} daq` : '⚡ Darhol'}${d.stock != null ? ` · ${d.stock} ta qoldi` : ''}</span>
                <span class="pr">${money(d.price)}</span></button>`;
            }).join('') || emptyState('🔎', 'Taom topilmadi')}</div>
          </div>
          ${cart.length ? `<div class="cart">
            <div class="card-head"><h3>Yangi buyurtma</h3><span class="spacer"></span><button class="btn ghost sm" id="cart-clear">Tozalash</button></div>
            ${cart.map((c, idx) => `<div class="cart-line">
              <span class="nm">${esc(c.name)}${c.note ? `<br><small class="muted">📝 ${esc(c.note)}</small>` : ''}</span>
              <button class="btn ghost sm" data-note="${idx}" title="Izoh">📝</button>
              <span class="stepper"><button data-dec="${idx}">−</button><span>${c.qty}</span><button data-inc="${idx}">+</button></span>
              <span class="num" style="min-width:90px;text-align:right">${money(c.price * c.qty)}</span></div>`).join('')}
            <button class="btn primary lg block" id="send" style="margin-top:10px">🍳 Oshxonaga yuborish · ${money(cartTotal)}</button>
          </div>` : ''}
        </div>
      </div>`;
  },
  bind(root, data) {
    const { room, order, menu } = data;
    const rerender = () => renderView(data);
    const cart = () => (Carts[room.id] = Carts[room.id] || []);
    root.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { UI.category = b.dataset.cat; rerender(); });
    const search = root.querySelector('#dish-search');
    search.oninput = () => { UI.search = search.value; rerender(); };
    root.querySelectorAll('[data-dish]').forEach((b) => b.onclick = () => {
      const d = menu.dishes.find((x) => x.id === Number(b.dataset.dish));
      const line = cart().find((c) => c.dish_id === d.id && !c.note);
      if (line) line.qty += 1; else cart().push({ dish_id: d.id, name: d.name, price: d.price, qty: 1, note: '' });
      rerender();
    });
    root.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => { cart()[b.dataset.inc].qty += 1; rerender(); });
    root.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => {
      const c = cart()[b.dataset.dec];
      c.qty -= 1;
      if (c.qty <= 0) cart().splice(b.dataset.dec, 1);
      rerender();
    });
    root.querySelectorAll('[data-note]').forEach((b) => b.onclick = async () => {
      const c = cart()[b.dataset.note];
      const v = await promptModal('Izoh', `${c.name} uchun izoh (masalan: achchiq bo'lmasin)`, { value: c.note });
      if (v !== null) { c.note = v; rerender(); }
    });
    const clear = root.querySelector('#cart-clear');
    if (clear) clear.onclick = () => { Carts[room.id] = []; rerender(); };
    const guests = root.querySelector('#guests');
    guests.onchange = async () => {
      const g = Math.max(1, Number(guests.value) || 1);
      if (!order) { Carts[`g${room.id}`] = g; return; }
      try { await PUT(`/api/orders/${order.id}`, { guests: g }); toast('Mehmonlar soni saqlandi', 'ok'); } catch (e) { toastError(e); }
    };

    const send = root.querySelector('#send');
    if (send) send.onclick = async () => {
      send.disabled = true;
      try {
        let o = order;
        if (!o) o = await POST('/api/orders', { room_id: room.id, guests: Number(guests.value) || 1 });
        await POST(`/api/orders/${o.id}/items`, { items: cart().map(({ dish_id, qty, note }) => ({ dish_id, qty, note })) });
        Carts[room.id] = [];
        toast('Buyurtma oshxonaga yuborildi ✅', 'ok');
        refreshView();
      } catch (e) { toastError(e); send.disabled = false; }
    };

    root.querySelectorAll('[data-serve]').forEach((b) => b.onclick = async () => {
      try { await POST(`/api/items/${b.dataset.serve}/serve`); refreshView(); } catch (e) { toastError(e); }
    });
    root.querySelectorAll('[data-cancel-item]').forEach((b) => b.onclick = async () => {
      const needReason = b.dataset.st !== 'new';
      const reason = await promptModal('Taomni bekor qilish', needReason ? 'Sabab (majburiy)' : 'Sabab (ixtiyoriy)', { required: needReason });
      if (reason === null) return;
      try { await POST(`/api/items/${b.dataset.cancelItem}/cancel`, { reason }); toast('Bekor qilindi', 'warn'); refreshView(); } catch (e) { toastError(e); }
    });
    if (!order) return;
    const rb = root.querySelector('#req-bill');
    if (rb) rb.onclick = async () => {
      try { await POST(`/api/orders/${order.id}/request-bill`); toast("Kassirga hisob so'rovi yuborildi", 'ok'); refreshView(); } catch (e) { toastError(e); }
    };
    root.querySelector('#print-bill').onclick = () => printReceipt(order);
    const pay = root.querySelector('#pay');
    if (pay) pay.onclick = () => openPayment(order);
    const tr = root.querySelector('#transfer');
    if (tr) tr.onclick = () => {
      const free = data.rooms.filter((r) => !r.order && r.active);
      openModal({ title: "Chekni boshqa xonaga ko'chirish", body: free.length
        ? `<label class="field">Bo'sh xona<select name="room_id">${free.map((r) => `<option value="${r.id}">${esc(r.number)} · ${esc(r.name)}</option>`).join('')}</select></label>`
        : "<p>Bo'sh xona yo'q</p>",
      actions: [{ label: 'Bekor' }, ...(free.length ? [{ label: "Ko'chirish", cls: 'primary', onClick: async (f) => {
        const r = await POST(`/api/orders/${order.id}/transfer`, { room_id: Number(f.room_id.value) });
        toast('Chek ko\'chirildi', 'ok');
        location.hash = `#/room/${r.room_id}`;
      } }] : [])].map((a) => ({ onClick: () => {}, ...a })) });
    };
    const co = root.querySelector('#cancel-order');
    if (co) co.onclick = async () => {
      const hasItems = order.items.some((i) => i.status !== 'cancelled');
      const reason = await promptModal('Chekni bekor qilish', hasItems ? 'Sabab (majburiy)' : 'Sabab', { required: hasItems });
      if (reason === null) return;
      try { await POST(`/api/orders/${order.id}/cancel`, { reason }); toast('Chek bekor qilindi', 'warn'); location.hash = '#/rooms'; } catch (e) { toastError(e); }
    };
  },
};

function openPayment(order) {
  const pending = order.items.filter((i) => ['new', 'cooking'].includes(i.status));
  const form = openModal({
    title: `To'lov · Chek #${order.id} · ${order.room.name}`,
    body: `${pending.length ? `<p class="toast warn">⚠ Tayyor bo'lmagan taomlar: ${pending.map((i) => esc(i.name)).join(', ')}. Avval ularni tayyorlang yoki bekor qiling.</p>` : ''}
      <div class="form-grid">
        <label class="field">Xizmat haqi, %<input type="number" name="service_pct" min="0" max="50" step="0.5" value="${order.service_pct}"></label>
        <label class="field">Chegirma (${esc(App.settings.currency)})<input type="number" name="discount" min="0" value="0"></label>
      </div>
      <div class="totals num" id="pay-totals"></div>
      <h3 style="margin-top:16px">To'lov turi</h3>
      <div class="row" style="margin-bottom:8px">
        <button type="button" class="btn sm" data-all="cash">💵 Hammasi naqd</button>
        <button type="button" class="btn sm" data-all="card">💳 Hammasi karta</button>
        <button type="button" class="btn sm" data-all="transfer">📱 Hammasi o'tkazma</button></div>
      <div class="form-grid">
        <label class="field">💵 Naqd<input type="number" name="paid_cash" min="0" value=""></label>
        <label class="field">💳 Karta (Uzcard/Humo)<input type="number" name="paid_card" min="0" value=""></label>
        <label class="field">📱 O'tkazma (Click/Payme)<input type="number" name="paid_transfer" min="0" value=""></label>
      </div>
      <p id="pay-change" class="small" style="margin-top:10px"></p>
      <label class="check"><input type="checkbox" name="print" checked> Chekni chop etish</label>`,
    actions: [
      { label: 'Bekor', onClick: () => {} },
      { label: "✅ To'lovni yakunlash", cls: 'ok', onClick: async (f) => {
        const d = formData(f);
        const r = await POST(`/api/orders/${order.id}/close`, {
          service_pct: Number(d.service_pct) || 0, discount: Number(d.discount) || 0,
          paid_cash: Number(d.paid_cash) || 0, paid_card: Number(d.paid_card) || 0, paid_transfer: Number(d.paid_transfer) || 0,
        });
        toast(`Chek #${r.id} yopildi${r.change ? ` · Qaytim: ${money(r.change).replace(/<[^>]+>/g, '')}` : ''}`, 'ok', 8000);
        if (d.print) printReceipt(r);
        if (location.hash.startsWith('#/room/')) location.hash = App.user.role === 'cashier' ? '#/cashier' : '#/rooms';
        else refreshView();
      } },
    ],
  });
  const calc = () => {
    const d = formData(form);
    const service = Math.round((order.subtotal * (Number(d.service_pct) || 0)) / 100);
    const total = Math.max(0, order.subtotal + service - (Number(d.discount) || 0));
    const paid = (Number(d.paid_cash) || 0) + (Number(d.paid_card) || 0) + (Number(d.paid_transfer) || 0);
    form.querySelector('#pay-totals').innerHTML = `<span>Taomlar</span><span class="right">${money(order.subtotal)}</span>
      <span>Xizmat haqi</span><span class="right">${money(service)}</span>
      ${d.discount ? `<span>Chegirma</span><span class="right">-${money(d.discount)}</span>` : ''}
      <span class="grand">To'lanadi</span><span class="grand right">${money(total)}</span>`;
    const ch = form.querySelector('#pay-change');
    ch.innerHTML = !paid ? '' : paid >= total
      ? `✅ Qaytim: <b>${money(paid - total)}</b>` : `<span style="color:var(--danger)">Yetishmaydi: <b>${money(total - paid)}</b></span>`;
    return total;
  };
  form.addEventListener('input', calc);
  form.querySelectorAll('[data-all]').forEach((b) => b.onclick = () => {
    const total = calc();
    for (const m of ['cash', 'card', 'transfer']) form[`paid_${m}`].value = m === b.dataset.all ? total : '';
    calc();
  });
  calc();
}

// ---------- Waiter: ready dishes ----------
Views.ready = {
  title: 'Tayyor taomlar', icon: '🔔', roles: ['waiter'], nav: true, refreshOn: ['rooms', 'kitchen'], badge: 'ready',
  async load() { return { items: await GET('/api/my/ready') }; },
  render({ items }) {
    return `<div class="page-head"><h1>Tayyor taomlar</h1></div>
      ${items.length ? `<div class="stack">${items.map((i) => `<div class="card row">
        <div style="flex:1"><b style="font-size:18px">${esc(i.room_number)}-xona</b> · ${esc(i.room_name)}<br>
          <span style="font-size:17px">${esc(i.name)} × ${i.qty}</span><br><span class="muted small">Tayyor bo'ldi: ${fmtTime(i.ready_at)} · kutmoqda <span data-since="${i.ready_at}"></span></span></div>
        <button class="btn ok lg" data-serve="${i.id}">✋ Oldim</button></div>`).join('')}</div>`
      : emptyState('✅', "Hozircha tayyor taom yo'q")}`;
  },
  bind(root) {
    root.querySelectorAll('[data-serve]').forEach((b) => b.onclick = async () => {
      try { await POST(`/api/items/${b.dataset.serve}/serve`); refreshView(); } catch (e) { toastError(e); }
    });
  },
};

// ---------- Kitchen display ----------
function ticketHtml(i) {
  const late = i.status === 'cooking' && i.eta_at < Date.now();
  return `<div class="ticket ${i.status} ${late ? 'late' : ''}">
    <div class="t-head"><span class="room-no">${esc(i.room_number)}</span><span><b>${esc(i.room_name)}</b><br><span class="muted small">🧑‍🍳 ${esc(i.waiter_name)} · #${i.order_id}</span></span>
      <span class="spacer" style="flex:1"></span><span class="muted small timer" title="Buyurtma tushganidan beri">⌛ <span data-since="${i.created_at}"></span></span></div>
    <div class="dish-name"><span class="qty">${i.qty} ×</span> ${esc(i.name)}</div>
    ${i.note ? `<div class="note">📝 ${esc(i.note)}</div>` : ''}
    <div class="row small muted">
      ${i.status === 'new' || i.status === 'cooking' ? `<span class="timer" data-eta="${i.eta_at}"></span><span>· ~${i.prep_minutes} daq</span>` : ''}
      ${i.status === 'ready' ? `✅ ${fmtTime(i.ready_at)} da tayyor · ofitsant kutilmoqda <span data-since="${i.ready_at}"></span>` : ''}
      ${i.status === 'served' ? `✋ ${fmtTime(i.served_at)} da olib ketildi` : ''}
      ${i.chef_name ? `· 👨‍🍳 ${esc(i.chef_name)}` : ''}</div>
    <div class="acts">
      ${i.status === 'new' ? `<button class="btn primary lg" data-accept="${i.id}">👍 Qabul qilish</button>` : ''}
      ${i.status === 'cooking' ? `<button class="btn ok lg" data-ready="${i.id}">✅ Tayyor</button>` : ''}
      ${i.status === 'new' ? `<button class="btn lg" data-ready="${i.id}" title="Darhol tayyor">✅</button>` : ''}
    </div></div>`;
}

Views.kitchen = {
  title: 'Oshxona', icon: '🍳', roles: ['owner', 'admin', 'chef'], nav: true, refreshOn: ['kitchen', 'rooms', 'kitchen_new'], badge: 'kitchen',
  async load() { return GET('/api/kitchen'); },
  render({ items, load }) {
    const col = (st) => items.filter((i) => (Array.isArray(st) ? st.includes(i.status) : i.status === st));
    const doneItems = col(['ready', 'served']).sort((a, b) => (b.ready_at || 0) - (a.ready_at || 0));
    return `<div class="page-head"><h1>Oshxona</h1>
      <span class="chip new">Yangi: ${load.pending}</span><span class="chip cooking">Tayyorlanmoqda: ${load.cooking}</span>
      <span class="spacer"></span><a class="btn" href="#/stoplist">⛔ Stop-list</a></div>
      <div class="kds">
        <div class="kds-col"><h2>🆕 Yangi buyurtmalar <span class="badge">${col('new').length}</span></h2>${col('new').map(ticketHtml).join('') || emptyState('😌', "Yangi buyurtma yo'q")}</div>
        <div class="kds-col"><h2>🔥 Tayyorlanmoqda <span class="badge" style="background:var(--accent)">${col('cooking').length}</span></h2>${col('cooking').map(ticketHtml).join('') || emptyState('🍳', "Hozir hech narsa tayyorlanmayapti")}</div>
        <div class="kds-col"><h2>✅ Tayyor / berildi</h2>${doneItems.map(ticketHtml).join('') || emptyState('🍽️', "Bo'sh")}</div>
      </div>`;
  },
  bind(root) {
    root.querySelectorAll('[data-accept]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try { await POST(`/api/items/${b.dataset.accept}/accept`); refreshView(); } catch (e) { toastError(e); b.disabled = false; }
    });
    root.querySelectorAll('[data-ready]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try { await POST(`/api/items/${b.dataset.ready}/ready`); toast('Ofitsantga xabar yuborildi 🔔', 'ok'); refreshView(); } catch (e) { toastError(e); b.disabled = false; }
    });
  },
};

// ---------- Stop-list ----------
Views.stoplist = {
  title: 'Stop-list', icon: '⛔', roles: ['owner', 'admin', 'cashier', 'chef'], nav: true, refreshOn: ['menu'],
  async load() { return GET('/api/menu'); },
  render({ categories, dishes }) {
    const q = UI.search.toLowerCase();
    const list = dishes.filter((d) => !q || d.name.toLowerCase().includes(q));
    const stopped = dishes.filter((d) => !d.available);
    const groups = [...categories, { id: null, name: "Bo'limsiz", icon: '' }]
      .map((c) => ({ c, ds: list.filter((d) => (d.category_id ?? null) === c.id) })).filter((g) => g.ds.length);
    return `<div class="page-head"><h1>Stop-list</h1><span class="chip cancelled" style="text-decoration:none">Tugagan: ${stopped.length}</span></div>
      <p class="muted">Taom tugasa — "Tugadi" tugmasini bosing. Ofitsantlar uni buyurtma qila olmaydi. Qoldiq sonini kiritsangiz, tugaganda avtomatik yopiladi.</p>
      <input type="search" id="stop-search" placeholder="🔎 Qidirish..." value="${esc(UI.search)}" style="margin-bottom:12px">
      ${groups.map(({ c, ds }) => `<div class="card"><h3>${esc(c.icon)} ${esc(c.name)}</h3><div class="table-wrap"><table>
        <tr><th>Taom</th><th>Narx</th><th>Qoldiq</th><th class="right">Holat</th></tr>
        ${ds.map((d) => `<tr><td>${esc(d.icon)} <b>${esc(d.name)}</b></td><td class="num">${money(d.price)}</td>
          <td style="width:130px"><input type="number" min="0" placeholder="∞" value="${d.stock ?? ''}" data-stock="${d.id}" style="min-height:32px;padding:4px 8px"></td>
          <td class="actions">${d.available ? `<button class="btn sm danger" data-stop="${d.id}">⛔ Tugadi</button>` : `<button class="btn sm ok" data-start="${d.id}">✅ Bor</button>`}</td></tr>`).join('')}
      </table></div></div>`).join('')}`;
  },
  bind(root) {
    const s = root.querySelector('#stop-search');
    s.oninput = () => { UI.search = s.value; renderView(currentData); };
    const set = async (id, body) => { try { await POST(`/api/dishes/${id}/availability`, body); refreshView(); } catch (e) { toastError(e); } };
    root.querySelectorAll('[data-stop]').forEach((b) => b.onclick = () => set(b.dataset.stop, { available: false }));
    root.querySelectorAll('[data-start]').forEach((b) => b.onclick = () => set(b.dataset.start, { available: true }));
    root.querySelectorAll('[data-stock]').forEach((inp) => inp.onchange = () => {
      const v = inp.value === '' ? null : Number(inp.value);
      set(inp.dataset.stock, { available: v === null || v > 0, stock: v });
    });
  },
};

// ---------- Cashier ----------
Views.cashier = {
  title: 'Kassa', icon: '💳', roles: ['owner', 'admin', 'cashier'], nav: true, refreshOn: ['rooms', 'finance'], badge: 'bills',
  async load() {
    const from = dayStart().getTime();
    const [open, closed, shift, txs] = await Promise.all([
      GET('/api/orders?status=open'), GET(`/api/orders?status=closed&from=${from}`), GET('/api/shifts/current'),
      GET(`/api/transactions?from=${from}`),
    ]);
    return { open, closed, shift, txs };
  },
  render({ open, closed, shift, txs }) {
    const todaySales = closed.reduce((s, o) => s + o.total, 0);
    const exp = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return `<div class="page-head"><h1>Kassa</h1><span class="spacer"></span>
      <button class="btn" id="add-income">➕ Kirim</button><button class="btn accent" id="add-expense">➖ Xarajat</button></div>
      <div class="kpis">
        <div class="kpi prime"><div class="label">Bugungi savdo</div><div class="value">${money(todaySales)}</div><div class="sub">${closed.length} ta chek</div></div>
        <div class="kpi"><div class="label">Ochiq cheklar</div><div class="value">${open.length}</div><div class="sub">${money(open.reduce((s, o) => s + o.total, 0))}</div></div>
        <div class="kpi bad"><div class="label">Bugungi xarajat</div><div class="value">${money(exp)}</div></div>
        <div class="kpi ${shift ? 'good' : ''}"><div class="label">Kassa smenasi</div><div class="value" style="font-size:16px">${shift ? `Ochiq · ${esc(shift.cashier_name)}` : 'Yopiq'}</div>
          <div class="sub">${shift ? `Kassada bo'lishi kerak: <b>${money(shift.expected)}</b>` : ''}</div>
          <div style="margin-top:8px">${shift ? '<button class="btn sm" id="close-shift">Smenani yopish</button>' : '<button class="btn sm primary" id="open-shift">Smenani ochish</button>'}</div></div>
      </div>
      <div class="card"><div class="card-head"><h2>Ochiq cheklar</h2></div>
        ${open.length ? `<div class="table-wrap"><table><tr><th>Xona</th><th>Ofitsant</th><th>Mehmon</th><th>Ochilgan</th><th>Summa</th><th></th></tr>
        ${open.map((o) => `<tr style="${o.bill_requested ? 'background:var(--violet-soft)' : ''}">
          <td><b>${esc(o.room_number)}</b> · ${esc(o.room_name)} ${o.bill_requested ? '<span class="chip violet">🧾 Hisob so\'raldi</span>' : ''}</td>
          <td>${esc(o.waiter_name)}</td><td>${o.guests}</td><td>${fmtTime(o.opened_at)}</td>
          <td class="num"><b>${money(o.total)}</b>${o.pending ? `<br><span class="small muted">${o.pending} taom jarayonda</span>` : ''}</td>
          <td class="actions"><a class="btn sm" href="#/room/${o.room_id}">Ko'rish</a> <button class="btn sm primary" data-pay="${o.id}">To'lov</button></td></tr>`).join('')}
        </table></div>` : emptyState('🧾', "Ochiq chek yo'q")}</div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>Bugun yopilgan cheklar</h2></div>
          ${closed.length ? `<div class="table-wrap"><table><tr><th>#</th><th>Xona</th><th>Vaqt</th><th>Summa</th><th></th></tr>
          ${closed.map((o) => `<tr><td>${o.id}</td><td>${esc(o.room_name)}</td><td>${fmtTime(o.closed_at)}</td><td class="num">${money(o.total)}</td>
            <td class="actions"><button class="btn sm" data-reprint="${o.id}">🖨</button></td></tr>`).join('')}</table></div>` : emptyState('📭', "Hali yo'q")}</div>
        <div class="card"><div class="card-head"><h2>Bugungi kirim-chiqim</h2></div>
          ${txs.length ? `<div class="table-wrap"><table><tr><th>Vaqt</th><th>Turi</th><th>Kategoriya</th><th>Summa</th></tr>
          ${txs.slice(0, 40).map((t) => `<tr><td>${fmtTime(t.created_at)}</td><td>${t.type === 'income' ? '<span class="chip ready">Kirim</span>' : '<span class="chip cancelled" style="text-decoration:none">Chiqim</span>'}</td>
            <td>${esc(t.category)}<br><span class="small muted">${METHOD_NAMES[t.method]}${t.note ? ' · ' + esc(t.note) : ''}</span></td>
            <td class="num">${t.type === 'expense' ? '−' : ''}${money(t.amount)}</td></tr>`).join('')}</table></div>` : emptyState('📭', "Hali yo'q")}</div>
      </div>`;
  },
  bind(root, { open, shift }) {
    root.querySelectorAll('[data-pay]').forEach((b) => b.onclick = async () => {
      try { openPayment(await GET(`/api/orders/${b.dataset.pay}`)); } catch (e) { toastError(e); }
    });
    root.querySelectorAll('[data-reprint]').forEach((b) => b.onclick = async () => {
      try { printReceipt(await GET(`/api/orders/${b.dataset.reprint}`)); } catch (e) { toastError(e); }
    });
    root.querySelector('#add-expense').onclick = () => openTransaction('expense');
    root.querySelector('#add-income').onclick = () => openTransaction('income');
    const os = root.querySelector('#open-shift');
    if (os) os.onclick = () => openModal({ title: 'Smenani ochish', body: `<label class="field">Kassadagi boshlang'ich naqd pul<input type="number" name="opening_cash" min="0" value="0"></label>`,
      actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Ochish', cls: 'primary', onClick: async (f) => { await POST('/api/shifts/open', formData(f)); toast('Smena ochildi', 'ok'); refreshView(); } }] });
    const cs = root.querySelector('#close-shift');
    if (cs) cs.onclick = () => openModal({ title: 'Smenani yopish (Z-hisobot)',
      body: `<div class="totals num"><span>Boshlang'ich naqd</span><span class="right">${money(shift.opening_cash)}</span>
        <span>Naqd kirim</span><span class="right">+${money(shift.cash_in)}</span><span>Naqd chiqim</span><span class="right">−${money(shift.cash_out)}</span>
        <span class="grand">Kutilgan</span><span class="grand right">${money(shift.expected)}</span></div>
        ${open.length ? `<p class="toast warn">Diqqat: ${open.length} ta ochiq chek bor.</p>` : ''}
        <label class="field" style="margin-top:12px">Kassada sanalgan naqd pul<input type="number" name="closing_cash" min="0" required></label>
        <label class="field" style="margin-top:8px">Izoh<input name="note"></label>`,
      actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Yopish', cls: 'primary', onClick: async (f) => {
        const r = await POST('/api/shifts/close', formData(f));
        const diff = r.closing_cash - r.expected_cash;
        toast(diff === 0 ? 'Smena yopildi. Kassa to\'g\'ri ✅' : `Smena yopildi. Farq: ${diff > 0 ? '+' : ''}${diff.toLocaleString('ru-RU')}`, diff === 0 ? 'ok' : 'warn', 10000);
        refreshView();
      } }] });
  },
};

function openTransaction(type, onDone) {
  const cats = type === 'expense' ? App.settings.expense_categories : App.settings.income_categories;
  openModal({
    title: type === 'expense' ? '➖ Xarajat qo\'shish' : '➕ Kirim qo\'shish',
    body: `<div class="form-grid">
      <label class="field">Summa<input type="number" name="amount" min="1" required></label>
      <label class="field">Kategoriya<select name="category">${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="field">To'lov turi<select name="method">${Object.entries(METHOD_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      </div><label class="field" style="margin-top:12px">Izoh<input name="note" placeholder="Masalan: 20 kg go'sht, Bozor"></label>`,
    actions: [{ label: 'Bekor', onClick: () => {} }, { label: 'Saqlash', cls: type === 'expense' ? 'accent' : 'primary', onClick: async (f) => {
      const d = formData(f);
      if (!d.amount) { toast('Summani kiriting', 'warn'); return false; }
      await POST('/api/transactions', { ...d, type });
      toast('Saqlandi', 'ok');
      if (onDone) onDone(); else refreshView();
    } }],
  });
}
