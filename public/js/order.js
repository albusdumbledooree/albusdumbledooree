'use strict';
/* Rooms (the cashier's "Kassa" too), takeaway, the order screen with the check on the left, payment, ready dishes. */

const Carts = {}; // context key -> { lines: [{dish_id, name, price, qty, note}], guests, label }
const UI = { category: 'all', search: '', drawer: false, section: store('cp_section') || '' };

function emptyState(ic, text) { return `<div class="empty">${icon(ic, 56)}<div>${text}</div></div>`; }

// ---------- Rooms ----------
function roomState(r) {
  if (r.order && r.order.bill_requested) return 'bill';
  if (r.order && r.order.items.ready) return 'ready';
  if (r.order) return 'busy';
  if (r.reservations.length) return 'reserved';
  return 'free';
}

function roomTile(r) {
  const o = r.order;
  const st = roomState(r);
  return `<button class="tile ${st}" data-room="${r.id}">
    <span class="type-ic">${icon(ROOM_TYPE_ICONS[r.type] || 'door-open', 22)}</span>
    <span class="no">${esc(r.number)}</span><span class="nm">${esc(r.name)}</span>
    <span class="meta">${o
      ? `<span>${icon('users', 15)} ${o.guests}</span><span>${icon('clock', 15)} <b data-since="${o.opened_at}"></b></span>${App.user.role !== 'waiter' ? `<span>${icon('user-round', 15)} ${esc(o.waiter_name.split(' ').pop())}</span>` : ''}`
      : `<span>${icon('users', 15)} ${r.capacity}</span>`}</span>
    <span class="flags">
      ${o && o.items.ready ? `<span class="chip ready">${icon('bell', 14)} ${o.items.ready}</span>` : ''}
      ${o && (o.items.new + o.items.cooking) ? `<span class="chip cooking">${icon('flame', 14)} ${o.items.new + o.items.cooking}</span>` : ''}
      ${o && o.bill_requested ? `<span class="chip violet">${icon('receipt', 14)} ${t('Hisob')}</span>` : ''}
      ${r.reservations.map((x) => `<span class="chip new">${icon('calendar', 14)} ${fmtTime(x.starts_at)}</span>`).join('')}
    </span>
    <span class="sum">${o ? money(o.subtotal) : t("Bo'sh")}</span>
  </button>`;
}

function takeawayTile(o) {
  const st = o.bill_requested ? 'bill' : o.items.ready ? 'ready' : 'busy';
  return `<button class="tile ${st}" data-order="${o.id}">
    <span class="type-ic">${icon('shopping-bag', 22)}</span>
    <span class="no">#${o.id}</span><span class="nm">${esc(o.label || t('Olib ketish'))}</span>
    <span class="meta"><span>${icon('clock', 15)} <b data-since="${o.opened_at}"></b></span>${App.user.role !== 'waiter' ? `<span>${icon('user-round', 15)} ${esc(o.waiter_name.split(' ').pop())}</span>` : ''}</span>
    <span class="flags">${o.items.ready ? `<span class="chip ready">${icon('bell', 14)} ${o.items.ready}</span>` : ''}
      ${o.items.new + o.items.cooking ? `<span class="chip cooking">${icon('flame', 14)} ${o.items.new + o.items.cooking}</span>` : ''}</span>
    <span class="sum">${money(o.total)}</span></button>`;
}

// Sections ("1-qavat", "Hovli") in the order the boss numbered their rooms.
function roomSections(rooms) {
  const out = [];
  for (const r of rooms) if (r.section && !out.includes(r.section)) out.push(r.section);
  return out;
}

Views.rooms = {
  title: () => (App.biz === 'fastfood' ? t('Buyurtmalar') : App.user.role === 'cashier' ? t('Kassa') : t('Xonalar')),
  icon: () => (App.biz === 'fastfood' ? 'receipt' : App.user.role === 'cashier' ? 'wallet' : 'house'),
  roles: ['owner', 'admin', 'cashier', 'waiter'], refreshOn: ['rooms', 'finance'], badge: 'bills', on: () => !isShop(),
  async load() {
    const money = can('owner', 'admin', 'cashier') && moduleOn('finance');
    const [rooms, takeaway, shift] = await Promise.all([GET('/api/rooms'), GET('/api/takeaway'), money ? GET('/api/shifts/current') : null]);
    return { rooms, takeaway, shift, money };
  },
  render({ rooms, takeaway, shift, money: showShift }) {
    const busy = rooms.filter((r) => r.order).length;
    const sections = roomSections(rooms);
    const sec = sections.includes(UI.section) ? UI.section : '';
    const shown = sec ? rooms.filter((r) => r.section === sec) : rooms;
    const fast = App.biz === 'fastfood';
    const takeawayHtml = `<div class="section-title">${icon('shopping-bag', 20)} ${fast ? t('Ochiq buyurtmalar') : t('Olib ketish')}</div>
      <div class="floor">${takeaway.orders.map(takeawayTile).join('')}
        <button class="tile add" data-new-takeaway>${icon('circle-plus', 36)}<span>${t('Yangi chek')}</span></button></div>`;
    const roomsHtml = `${sections.length ? `<div class="sections">
        <button class="section-chip ${sec ? '' : 'active'}" data-section="">${icon('grid-2x2', 18)} ${t('Hammasi')} <span>${busy}/${rooms.length}</span></button>
        ${sections.map((x) => { const rs = rooms.filter((r) => r.section === x); return `<button class="section-chip ${sec === x ? 'active' : ''}" data-section="${esc(x)}">${icon('layers', 18)} ${esc(x)} <span>${rs.filter((r) => r.order).length}/${rs.length}</span></button>`; }).join('')}</div>` : ''}
      ${shown.length ? `<div class="floor">${shown.map(roomTile).join('')}</div>`
        : fast ? '' : emptyState('door-open', App.user.role === 'waiter' ? t('Sizga hali xona biriktirilmagan') : t("Xonalar yo'q. Sozlamalar → Xonalar bo'limida qo'shing"))}`;
    return `<div class="page-head"><h1>${esc(this.title())}</h1>
      ${rooms.length ? `<span class="chip">${icon('door-open', 14)} ${busy} / ${rooms.length}</span>` : ''}
      ${showShift ? `<button class="btn sm ${shift ? '' : 'primary'}" id="shift">${icon(shift ? 'lock' : 'circle-plus', 16)} ${shift ? t('Smenani yopish') : t('Smenani ochish')}</button>` : ''}</div>
      ${rooms.length ? `<div class="legend"><span><i class="lg-free"></i>${t("Bo'sh")}</span><span><i class="lg-busy"></i>${t('Band')}</span>
        <span><i class="lg-ready"></i>${t('Taom tayyor')}</span>
        <span><i class="lg-bill"></i>${t("Hisob so'raldi")}</span><span><i class="lg-resv"></i>${t('Bron')}</span></div>` : ''}
      ${fast ? takeawayHtml + (rooms.length ? `<div class="section-title">${icon('utensils', 20)} ${t('Stollar')}</div>${roomsHtml}` : '') : roomsHtml + takeawayHtml}`;
  },
  bind(root, data) {
    root.querySelectorAll('[data-room]').forEach((b) => b.onclick = () => { location.hash = `#/room/${b.dataset.room}`; });
    root.querySelectorAll('[data-section]').forEach((b) => b.onclick = () => { UI.section = b.dataset.section; store('cp_section', UI.section || null); renderView(data); });
    root.querySelectorAll('[data-order]').forEach((b) => b.onclick = () => { location.hash = `#/order/${b.dataset.order}`; });
    root.querySelector('[data-new-takeaway]').onclick = () => { delete Carts.soboy; location.hash = '#/soboy'; };
    const sh = root.querySelector('#shift');
    if (sh) sh.onclick = () => (data.shift ? closeShiftDialog(data.shift) : openShiftDialog());
  },
};

function openShiftDialog() {
  openModal({ title: `${icon('wallet')} ${t('Smenani ochish')}`,
    body: `<label class="field">${t("Kassadagi boshlang'ich naqd pul")}<input type="number" name="opening_cash" min="0" value="0"></label>`,
    actions: [{ label: t('Bekor') }, { label: t('Ochish'), cls: 'primary', onClick: async (f) => { await POST('/api/shifts/open', formData(f)); toast(t('Smena ochildi'), 'ok'); refreshView(); } }] });
}

function closeShiftDialog(shift) {
  openModal({ title: `${icon('lock')} ${t('Smenani yopish')}`,
    body: `<div class="sum-rows num"><span>${t("Boshlang'ich naqd")}</span><span class="right">${money(shift.opening_cash)}</span>
      <span>${t('Naqd kirim')}</span><span class="right">+${money(shift.cash_in)}</span><span>${t('Naqd chiqim')}</span><span class="right">−${money(shift.cash_out)}</span>
      <b>${t("Kassada bo'lishi kerak")}</b><b class="right">${money(shift.expected)}</b></div>
      <label class="field" style="margin-top:14px">${t('Kassada sanalgan naqd pul')}<input type="number" name="closing_cash" min="0" required></label>
      <p class="small muted" style="margin-top:10px">${icon('download', 14)} ${t("Bugungi cheklar Excel fayl bo'lib shu kompyuterga saqlanadi.")}</p>`,
    actions: [{ label: t('Bekor') }, { label: t('Yopish'), cls: 'primary', onClick: async (f) => {
      const r = await POST('/api/shifts/close', formData(f));
      const diff = r.closing_cash - r.expected_cash;
      toast(diff === 0 ? t("Smena yopildi. Kassa to'g'ri") : t('Smena yopildi. Farq: {0}', `${diff > 0 ? '+' : ''}${num(diff)}`), diff === 0 ? 'ok' : 'warn', 10000);
      await downloadDayChecks();
      refreshView();
    } }] });
}

// End of shift: the day's checks go to this computer as an Excel (CSV) file.
async function downloadDayChecks() {
  try {
    const from = dayStart().getTime();
    const res = await fetch(`/api/checks/export?from=${from}&to=${from + 24 * 60 * MIN}`, { headers: { Authorization: `Bearer ${App.token}` } });
    if (res.ok) downloadBlob(`cheklar_${localDay()}.csv`, await res.blob());
  } catch { /* the server copy stays the source of truth */ }
}

// ---------- Order screen ----------
function ctxKey(params, kind) { return kind === 'soboy' ? 'soboy' : kind === 'order' ? `o${params[0]}` : `r${params[0]}`; }
function cartOf(key) { return (Carts[key] = Carts[key] || { lines: [], guests: 0, label: '' }); }

// Sent dishes grouped by sending: "1-yuborish · 21:45".
function batches(items) {
  const out = [];
  for (const i of items) {
    const last = out[out.length - 1];
    if (last && Math.abs(i.created_at - last.at) < 2000) last.items.push(i);
    else out.push({ at: i.created_at, items: [i] });
  }
  return out;
}

function canCancelItem(i) {
  if (i.status === 'cancelled') return false;
  if (can('owner', 'admin', 'cashier')) return true;
  return App.user.role === 'waiter' && App.settings.waiter_cancel;
}

function lineHtml(i) {
  const timer = i.status === 'new' || i.status === 'cooking' ? `<span class="timer">${icon('timer', 13)} <b data-eta="${i.eta_at}"></b></span>` : '';
  return `<div class="line ${i.status}">
    <span class="q">${i.qty}×</span><span class="n">${esc(i.name)}</span><span class="p">${money(i.price * i.qty)}</span>
    <span class="sub"><span class="chip ${i.status}">${statusName(i.status)}</span>${timer}
      ${i.note ? `<span>${icon('sticky-note', 13)} ${esc(i.note)}</span>` : ''}${i.cancel_reason ? `<span>(${esc(i.cancel_reason)})</span>` : ''}
      <span class="grow"></span>
      ${i.status === 'ready' ? `<button class="btn ok sm" data-serve="${i.id}">${icon('hand', 16)} ${t('Oldim')}</button>` : ''}
      ${canCancelItem(i) ? `<button class="icon-btn ghost danger" data-cancel-item="${i.id}" data-st="${i.status}" title="${esc(t('Bekor qilish'))}">${icon('x', 18)}</button>` : ''}</span>
  </div>`;
}

function checkPane({ order, room, cart, takeaway }) {
  const items = order ? order.items : [];
  const subtotalPending = cart.lines.reduce((s, c) => s + c.price * c.qty, 0);
  const guests = order ? order.guests : cart.guests || 1;
  const head = takeaway
    ? `<span class="avatar" style="background:var(--orange)">${icon('shopping-bag', 18)}</span>
       <div class="grow"><b>${t('Olib ketish')}${order ? ` #${order.id}` : ''}</b>
       <input id="cp-label" placeholder="${esc(t('Mijoz ismi (ixtiyoriy)'))}" value="${esc(order ? order.label : cart.label)}" style="min-height:36px;margin-top:4px;padding:6px 10px"></div>`
    : `<span class="avatar">${esc(room.number)}</span><div class="grow"><b>${esc(room.name)}</b>
       <span class="small muted">${order ? `${icon('user-round', 13)} ${esc(order.waiter.name)} · ${icon('clock', 13)} ${fmtTime(order.opened_at)}` : t("Bo'sh")}</span></div>
       <span class="guests" title="${esc(t('Mehmonlar soni'))}"><button data-g="-1">−</button><span>${icon('users', 16)} ${guests}</span><button data-g="1">+</button></span>`;
  const sent = batches(items.filter((i) => i.status !== 'cancelled'));
  const cancelled = items.filter((i) => i.status === 'cancelled');
  const total = order ? order.total : 0;
  const share = order && !takeaway ? perPerson(order) : 0;
  const permsOf = App.user.perms || {};
  return `<aside class="checkpane ${UI.drawer ? 'open' : ''}" id="checkpane">
    <div class="cp-head">${head}<button class="icon-btn ghost fab-close" id="cp-close" style="display:none">${icon('x')}</button></div>
    <div class="cp-body">
      ${sent.map((b, n) => `<div class="batch-title">${icon('send', 13)} ${t('{0}-yuborish', n + 1)} · ${fmtTime(b.at)}</div>${b.items.map(lineHtml).join('')}`).join('')}
      ${cancelled.length ? `<div class="batch-title">${icon('ban', 13)} ${t('Bekor qilingan')}</div>${cancelled.map(lineHtml).join('')}` : ''}
      ${cart.lines.length ? `<div class="batch-title" style="color:var(--primary)">${icon('circle-plus', 13)} ${t('Yangi (yuborilmagan)')}</div>
        ${cart.lines.map((c, idx) => `<div class="line pending"><span class="q">${c.qty}×</span><span class="n">${esc(c.name)}</span><span class="p">${money(c.price * c.qty)}</span>
          <span class="sub">${c.note ? `<span>${icon('sticky-note', 13)} ${esc(c.note)}</span>` : ''}<span class="grow"></span>
            <button class="icon-btn ghost" data-note="${idx}" title="${esc(t('Izoh'))}">${icon('sticky-note', 18)}</button>
            <span class="stepper"><button data-dec="${idx}">${icon('minus', 16)}</button><span>${c.qty}</span><button data-inc="${idx}">${icon('plus', 16)}</button></span></span></div>`).join('')}` : ''}
      ${!items.length && !cart.lines.length ? emptyState('utensils', W("Menyudan taom tanlang")) : ''}
    </div>
    <div class="cp-foot">
      ${order ? `<div class="sum-rows num">
        <span>${t('Taomlar')}</span><span class="right">${money(order.subtotal)}</span>
        ${order.service_amount ? `<span>${esc(serviceLabel(order))}</span><span class="right">${money(order.service_amount)}</span>` : ''}
        <span class="total">${t('Jami')}</span><span class="total right">${money(total)}</span>
        ${share ? `<span class="share">${t('{0} kishi — har biriga', order.guests)}</span><span class="share right">${money(share)}</span>` : ''}</div>` : ''}
      ${cart.lines.length
        ? `<button class="btn primary lg block" id="send" style="margin-top:12px">${icon('send', 20)} ${t('Yuborish')} · ${money(subtotalPending)}</button>`
        : order ? `<div class="order-actions">
          ${App.user.role === 'waiter' || can('owner', 'admin') ? `<button class="btn ${order.bill_requested ? '' : 'warn'}" id="req-bill" ${order.bill_requested ? 'disabled' : ''}>${icon('receipt', 18)} ${order.bill_requested ? t("So'raldi") : t('Hisob')}</button>` : ''}
          ${permsOf.print ? `<button class="btn" id="print-bill">${icon('printer', 18)} ${t('Chek')}</button>` : ''}
          ${permsOf.close ? `<button class="btn primary" id="pay">${icon('wallet', 18)} ${t("To'lov")}</button>` : ''}
          <button class="btn" id="more" title="${esc(t('Boshqa'))}">${icon('list', 18)}</button></div>` : ''}
    </div></aside>`;
}

const OrderView = {
  roles: ['owner', 'admin', 'cashier', 'waiter'], refreshOn: ['rooms', 'menu'], parent: 'rooms',
  title: () => '',
  async load(params, kind) {
    const [menu, rooms] = await Promise.all([GET('/api/menu'), kind === 'room' ? GET(App.user.role === 'waiter' ? '/api/rooms' : '/api/rooms?all=1') : null]);
    App.menu = menu;
    let room = null; let order = null;
    if (kind === 'room') {
      room = rooms.find((r) => r.id === Number(params[0]));
      if (!room) throw new Error(t('Xona topilmadi yoki sizga biriktirilmagan'));
      if (room.order) order = await GET(`/api/orders/${room.order.id}`);
    } else if (kind === 'order') {
      order = await GET(`/api/orders/${params[0]}`);
      if (order.status !== 'open') throw new Error(t('Bu chek yopilgan'));
      room = order.room;
      if (!order.takeaway) { location.replace(`#/room/${order.room_id}`); return null; }
    }
    return { menu, room, order, rooms, kind, key: ctxKey(params, kind), takeaway: kind === 'soboy' || (order && order.takeaway) };
  },
  render(d) {
    const { menu, key } = d;
    const cart = cartOf(key);
    const cats = menu.categories.filter((c) => menu.dishes.some((x) => x.category_id === c.id));
    const q = UI.search.toLowerCase();
    const dishes = menu.dishes.filter((x) => (UI.category === 'all' || x.category_id === Number(UI.category)) && (!q || x.name.toLowerCase().includes(q)));
    const pendingCount = cart.lines.reduce((s, c) => s + c.qty, 0);
    const kitchenOn = App.kitchenMode !== 'off';
    return `<div class="order">
      ${checkPane({ ...d, cart })}
      ${UI.drawer ? '<div class="drawer-back" id="drawer-back"></div>' : ''}
      <section>
        <div class="menu-bar"><button class="btn sm" id="back">${icon('arrow-left', 18)} ${t('Orqaga')}</button>
          <input type="search" id="dish-search" placeholder="${esc(W('Taom qidirish'))}" value="${esc(UI.search)}">
          ${kitchenOn && menu.load.extra_minutes ? `<span class="chip cooking">${icon('flame', 14)} +${menu.load.extra_minutes} ${t('daq')}</span>` : ''}</div>
        <div class="cats"><button class="cat ${UI.category === 'all' ? 'active' : ''}" data-cat="all">${t('Hammasi')}</button>
          ${cats.map((c) => `<button class="cat ${String(UI.category) === String(c.id) ? 'active' : ''}" data-cat="${c.id}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}</div>
        <div class="dishes">${dishes.map((x) => {
          const inCart = cart.lines.filter((c) => c.dish_id === x.id).reduce((s, c) => s + c.qty, 0);
          return `<button class="dish ${x.available ? '' : 'out'}" data-dish="${x.id}" ${x.available ? '' : 'disabled'}>
            ${inCart ? `<span class="qty">${inCart}</span>` : ''}<span class="em">${esc(x.icon || '🍽️')}</span><span class="nm">${esc(x.name)}</span>
            <span class="eta">${x.needs_kitchen && kitchenOn ? `${icon('timer', 13)} ~${x.eta_minutes} ${t('daq')}` : `${icon('check', 13)} ${t('Darhol')}`}${x.stock != null ? ` · ${x.stock}` : ''}</span>
            <span class="pr" data-out="${esc(t('TUGADI'))}">${money(x.price)}</span></button>`;
        }).join('') || emptyState('search', t('Taom topilmadi'))}</div>
      </section>
      <button class="fab-check" id="fab">${icon('receipt', 22)}<span class="grow">${t('Chek')}${pendingCount ? ` · ${t('{0} ta yangi', pendingCount)}` : ''}</span><b>${money(d.order ? d.order.total : cart.lines.reduce((s, c) => s + c.price * c.qty, 0))}</b></button>
    </div>`;
  },
  bind(root, d) {
    const { menu, key, order, room } = d;
    const cart = cartOf(key);
    const rerender = () => renderView(d);
    const fab = root.querySelector('#fab');
    const pane = root.querySelector('#checkpane');
    const closeBtn = root.querySelector('#cp-close');
    if (window.matchMedia('(max-width: 1000px)').matches) closeBtn.style.display = '';
    fab.onclick = () => { UI.drawer = true; rerender(); };
    closeBtn.onclick = () => { UI.drawer = false; rerender(); };
    const back = root.querySelector('#drawer-back');
    if (back) back.onclick = () => { UI.drawer = false; rerender(); };
    root.querySelector('#back').onclick = () => { UI.drawer = false; location.hash = '#/rooms'; };
    root.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { UI.category = b.dataset.cat; rerender(); });
    const search = root.querySelector('#dish-search');
    search.oninput = () => { UI.search = search.value; rerender(); };
    root.querySelectorAll('[data-dish]').forEach((b) => b.onclick = () => {
      const x = menu.dishes.find((y) => y.id === Number(b.dataset.dish));
      const line = cart.lines.find((c) => c.dish_id === x.id && !c.note);
      if (line) line.qty += 1; else cart.lines.push({ dish_id: x.id, name: x.name, price: x.price, qty: 1, note: '' });
      rerender();
    });
    pane.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => { cart.lines[b.dataset.inc].qty += 1; rerender(); });
    pane.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => {
      const c = cart.lines[b.dataset.dec];
      c.qty -= 1;
      if (c.qty <= 0) cart.lines.splice(b.dataset.dec, 1);
      rerender();
    });
    pane.querySelectorAll('[data-note]').forEach((b) => b.onclick = async () => {
      const c = cart.lines[b.dataset.note];
      const v = await promptModal(t('Izoh'), t("{0} uchun izoh (masalan: achchiq bo'lmasin)", c.name), { value: c.note });
      if (v !== null) { c.note = v; rerender(); }
    });
    // Guests
    pane.querySelectorAll('[data-g]').forEach((b) => b.onclick = async () => {
      const g = Math.max(1, (order ? order.guests : cart.guests || 1) + Number(b.dataset.g));
      if (!order) { cart.guests = g; return rerender(); }
      try { await PUT(`/api/orders/${order.id}`, { guests: g }); refreshView(); } catch (e) { toastError(e); }
    });
    const label = pane.querySelector('#cp-label');
    if (label) label.onchange = async () => {
      if (!order) { cart.label = label.value; return; }
      try { await PUT(`/api/orders/${order.id}`, { label: label.value }); } catch (e) { toastError(e); }
    };
    // Ask how many guests when a free room is opened.
    if (!order && !d.takeaway && !cart.guests && !cart.asking) askGuests(cart, rerender);

    const send = pane.querySelector('#send');
    if (send) send.onclick = () => confirmSend(d, cart);
    pane.querySelectorAll('[data-serve]').forEach((b) => b.onclick = async () => {
      try { await POST(`/api/items/${b.dataset.serve}/serve`); refreshView(); } catch (e) { toastError(e); }
    });
    pane.querySelectorAll('[data-cancel-item]').forEach((b) => b.onclick = () => cancelItemDialog(order.items.find((i) => i.id === Number(b.dataset.cancelItem))));
    if (!order) return;
    const rb = pane.querySelector('#req-bill');
    if (rb) rb.onclick = async () => {
      try { await POST(`/api/orders/${order.id}/request-bill`); toast(t("Kassirga hisob so'rovi yuborildi"), 'ok'); refreshView(); } catch (e) { toastError(e); }
    };
    const pb = pane.querySelector('#print-bill');
    if (pb) pb.onclick = () => printCheck(order.id);
    const pay = pane.querySelector('#pay');
    if (pay) pay.onclick = () => openPayment(order);
    const more = pane.querySelector('#more');
    if (more) more.onclick = () => moreActions(d);
    void room;
  },
};
Views.room = { ...OrderView, load: (p) => OrderView.load(p, 'room') };
Views.order = { ...OrderView, load: (p) => OrderView.load(p, 'order') };
Views.soboy = { ...OrderView, load: (p) => OrderView.load(p, 'soboy') };

function askGuests(cart, done) {
  cart.asking = true;
  let pad;
  const form = openModal({
    title: `${icon('users')} ${t('Necha kishi?')}`,
    body: `<div class="pin-box">${keypadHtml(3, false)}</div>`,
    actions: [{ label: t('Keyin'), onClick: () => { cart.guests = 1; done(); } },
      { label: t('Tasdiqlash'), cls: 'primary', icon: 'check', onClick: () => { cart.guests = Math.max(1, Number(pad.get()) || 1); done(); } }],
    onClose: () => { if (!cart.guests) { cart.guests = 1; done(); } },
  });
  pad = bindKeypad(form, { maxLen: 3, masked: false });
}

function confirmSend(d, cart) {
  const total = cart.lines.reduce((s, c) => s + c.price * c.qty, 0);
  openModal({
    title: `${icon('send')} ${t('Buyurtmani tasdiqlang')}`,
    body: `<p class="muted">${esc(d.takeaway ? t('Olib ketish') : d.room.name)}${!d.order && !d.takeaway ? ` · ${icon('users', 14)} ${cart.guests || 1}` : ''}</p>
      <div>${cart.lines.map((c) => `<div class="line"><span class="q">${c.qty}×</span><span class="n">${esc(c.name)}</span><span class="p">${money(c.price * c.qty)}</span>
        ${c.note ? `<span class="sub">${icon('sticky-note', 13)} ${esc(c.note)}</span>` : ''}</div>`).join('')}</div>
      <div class="sum-rows" style="margin-top:12px"><span class="total">${t('Jami')}</span><span class="total right">${money(total)}</span></div>
      <p class="small muted" style="margin-top:10px">${icon('info', 14)} ${t("Yuborilgandan keyin taomni faqat ruxsat bilan bekor qilish mumkin.")}</p>`,
    actions: [{ label: t('Orqaga') }, { label: t('Tasdiqlash va yuborish'), cls: 'primary', icon: 'send', onClick: async () => {
      let o = d.order;
      if (!o) {
        const room_id = d.takeaway ? (await GET('/api/takeaway')).room_id : d.room.id;
        o = await POST('/api/orders', { room_id, guests: cart.guests || 1, label: cart.label || '' });
      }
      await POST(`/api/orders/${o.id}/items`, { items: cart.lines.map(({ dish_id, qty, note }) => ({ dish_id, qty, note })) });
      cart.lines = [];
      toast(App.kitchenMode === 'off' ? t('Buyurtma qabul qilindi') : t('Buyurtma oshxonaga yuborildi'), 'ok');
      UI.drawer = false;
      if (d.kind === 'soboy') { delete Carts.soboy; location.hash = `#/order/${o.id}`; } else refreshView();
    } }],
  });
}

function cancelItemDialog(item) {
  const waiter = App.user.role === 'waiter';
  const needReason = waiter || item.status !== 'new';
  let pad;
  const form = openModal({
    title: `${icon('ban')} ${t('Taomni bekor qilish')}`,
    body: `<p class="lead"><b>${item.qty}× ${esc(item.name)}</b></p>
      <label class="field">${needReason ? t('Sabab (majburiy)') : t('Sabab (ixtiyoriy)')}<input name="reason"></label>
      ${waiter ? `<p class="small muted" style="margin:14px 0 6px">${t('Boshliq bergan bekor qilish kodi')}</p><div class="pin-box">${keypadHtml(8)}</div>` : ''}`,
    actions: [{ label: t('Orqaga') }, { label: t('Bekor qilish'), cls: 'danger', icon: 'ban', onClick: async (f) => {
      const reason = f.reason.value.trim();
      if (needReason && !reason) { toast(t('Sababni yozing'), 'warn'); return false; }
      await POST(`/api/items/${item.id}/cancel`, { reason, code: pad ? pad.get() : undefined });
      toast(t('Bekor qilindi'), 'warn');
      refreshView();
    } }],
  });
  if (waiter) pad = bindKeypad(form, { maxLen: 8 });
}

function moreActions(d) {
  const { order, rooms } = d;
  const acts = [];
  if (can('owner', 'admin', 'cashier')) acts.push(['transfer', 'arrow-right-left', t("Boshqa xonaga ko'chirish")]);
  const live = order.items.filter((i) => i.status !== 'cancelled').length;
  if (can('owner', 'admin') || (!live && App.user.role !== 'chef')) acts.push(['cancel', 'trash-2', t('Chekni bekor qilish')]);
  const form = openModal({
    title: `${icon('list')} ${t('Chek')} #${order.id}`,
    body: acts.length ? `<div class="stack">${acts.map(([k, ic, n]) => `<button type="button" class="btn lg block ${k === 'cancel' ? 'red-text' : ''}" data-act="${k}" style="justify-content:flex-start">${icon(ic)} ${n}</button>`).join('')}</div>`
      : `<p class="muted">${t('Boshqa amal yo\'q')}</p>`,
  });
  form.querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => {
    closeModal();
    if (b.dataset.act === 'transfer') {
      const all = rooms || await GET('/api/rooms?all=1');
      const free = all.filter((r) => !r.order && r.active);
      openModal({ title: `${icon('arrow-right-left')} ${t("Boshqa xonaga ko'chirish")}`,
        body: free.length ? `<div class="floor">${free.map((r) => `<button type="button" class="tile free" data-to="${r.id}" style="min-height:100px"><span class="no">${esc(r.number)}</span><span class="nm">${esc(r.name)}</span>${r.section ? `<span class="small muted">${esc(r.section)}</span>` : ''}</button>`).join('')}</div>`
          : `<p>${t("Bo'sh xona yo'q")}</p>`,
        onMount: (f) => f.querySelectorAll('[data-to]').forEach((x) => x.onclick = async () => {
          try {
            const r = await POST(`/api/orders/${order.id}/transfer`, { room_id: Number(x.dataset.to) });
            closeModal(); toast(t("Chek ko'chirildi"), 'ok'); location.hash = `#/room/${r.room_id}`;
          } catch (e) { toastError(e); }
        }) });
    } else {
      const reason = await promptModal(t('Chekni bekor qilish'), live ? t('Sabab (majburiy)') : t('Sabab'), { required: live > 0 });
      if (reason === null) return;
      try { await POST(`/api/orders/${order.id}/cancel`, { reason }); toast(t('Chek bekor qilindi'), 'warn'); location.hash = '#/rooms'; } catch (e) { toastError(e); }
    }
  });
}

// ---------- Payment: large and clean, the check in the same order as it was written ----------
function openPayment(order) {
  const pending = App.kitchenMode === 'full' ? order.items.filter((i) => ['new', 'cooking'].includes(i.status)) : [];
  const live = order.items.filter((i) => i.status !== 'cancelled');
  const canDiscount = can('owner', 'admin', 'cashier');
  const form = openModal({
    title: `${icon('wallet')} ${t("To'lov")} · ${esc(placeName(order))}`, size: 'wide',
    body: `${pending.length ? `<div class="notice">${icon('triangle-alert', 18)} ${t("Tayyor bo'lmagan taomlar: {0}", pending.map((i) => esc(i.name)).join(', '))}</div>` : ''}
      <div class="pay">
        <div class="receipt">${batches(live).map((b) => b.items.map((i) => `<div class="line"><span class="q">${i.qty}×</span><span class="n">${esc(i.name)}</span><span class="p">${money(i.price * i.qty)}</span></div>`).join('')).join('')}</div>
        <div class="stack">
          <div class="sum-rows num" id="pay-sums"></div>
          ${canDiscount ? `<label class="field">${t('Chegirma')} (${esc(App.settings.currency)})<input type="number" name="discount" min="0" value="" placeholder="0"></label>` : ''}
          <div class="methods">${['cash', 'card', 'transfer'].map((m) => `<button type="button" class="method" data-m="${m}">${icon(METHOD_ICONS[m], 26)}${methodName(m)}</button>`).join('')}</div>
          <div class="form-grid" style="grid-template-columns:repeat(3,1fr)">${['cash', 'card', 'transfer'].map((m) => `<label class="field">${methodName(m)}<input type="number" name="paid_${m}" min="0" placeholder="0"></label>`).join('')}</div>
          <div id="pay-change" class="change"></div>
          ${(App.user.perms || {}).print ? `<label class="check"><input type="checkbox" name="print" checked> ${icon('printer', 18)} ${t('Chekni chop etish')}</label>` : ''}
        </div>
      </div>`,
    actions: [{ label: t('Bekor') }, { label: t("To'lovni yakunlash"), cls: 'ok', icon: 'circle-check', onClick: async (f) => {
      const d = formData(f);
      const r = await POST(`/api/orders/${order.id}/close`, {
        discount: Number(d.discount) || 0, paid_cash: Number(d.paid_cash) || 0, paid_card: Number(d.paid_card) || 0, paid_transfer: Number(d.paid_transfer) || 0,
      });
      LocalBackup.save(r);
      toast(`${t('Chek #{0} yopildi', r.id)}${r.change ? ` · ${t('Qaytim')}: ${moneyText(r.change)}` : ''}`, 'ok', 8000);
      if (d.print) printCheck(r.id);
      if (location.hash.startsWith('#/room/') || location.hash.startsWith('#/order/')) location.hash = '#/rooms';
      else refreshView();
    } }],
  });
  const calc = () => {
    const d = formData(form);
    const discount = Number(d.discount) || 0;
    const total = Math.max(0, order.subtotal + order.service_amount - discount);
    const paid = (Number(d.paid_cash) || 0) + (Number(d.paid_card) || 0) + (Number(d.paid_transfer) || 0);
    const share = order.guests > 1 ? Math.round(total / order.guests) : 0;
    form.querySelector('#pay-sums').innerHTML = `<span>${t('Taomlar')}</span><span class="right">${money(order.subtotal)}</span>
      ${order.service_amount ? `<span>${esc(serviceLabel(order))}</span><span class="right">${money(order.service_amount)}</span>` : ''}
      ${discount ? `<span>${t('Chegirma')}</span><span class="right">−${money(discount)}</span>` : ''}
      <span style="grid-column:1/-1" class="big-total">${money(total)}</span>
      ${share ? `<span class="share">${t('{0} kishi — har biriga', order.guests)}</span><span class="share right">${money(share)}</span>` : ''}`;
    form.querySelector('#pay-change').innerHTML = !paid ? '' : paid >= total
      ? `<span style="color:var(--green)">${icon('circle-check', 20)} ${t('Qaytim')}: ${money(paid - total)}</span>`
      : `<span style="color:var(--red)">${icon('triangle-alert', 20)} ${t('Yetishmaydi')}: ${money(total - paid)}</span>`;
    return total;
  };
  form.addEventListener('input', calc);
  form.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
    const total = calc();
    form.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('active', x === b));
    for (const m of ['cash', 'card', 'transfer']) form[`paid_${m}`].value = m === b.dataset.m ? total : '';
    calc();
  });
  calc();
}

// ---------- Waiter: ready dishes ----------
Views.ready = {
  title: () => t('Tayyor'), icon: () => 'bell', roles: ['waiter'], refreshOn: ['rooms', 'kitchen'], badge: 'ready',
  async load() { return { items: await GET('/api/my/ready') }; },
  render({ items }) {
    return `<div class="page-head"><h1>${t('Tayyor taomlar')}</h1></div>
      ${items.length ? `<div class="stack">${items.map((i) => `<div class="card row">
        <div class="grow"><b style="font-size:18px">${esc(i.takeaway ? t('Olib ketish') : i.room_number)}</b> · ${esc(i.room_name)}<br>
          <span style="font-size:18px;font-weight:700">${i.qty}× ${esc(i.name)}</span><br>
          <span class="muted small">${icon('clock', 13)} <b data-since="${i.ready_at}"></b></span></div>
        <button class="btn ok lg" data-serve="${i.id}">${icon('hand', 20)} ${t('Oldim')}</button></div>`).join('')}</div>`
      : emptyState('circle-check', t("Hozircha tayyor taom yo'q"))}`;
  },
  bind(root) {
    root.querySelectorAll('[data-serve]').forEach((b) => b.onclick = async () => {
      try { await POST(`/api/items/${b.dataset.serve}/serve`); refreshView(); } catch (e) { toastError(e); }
    });
  },
};
