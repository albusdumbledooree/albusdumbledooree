'use strict';
/*
 * Counter sales ("Sotuv") for shops and fast food: pick goods (or scan a barcode), take the money, print.
 * Fast food dishes still go to the kitchen; the customer gets a number on the receipt.
 */
const PosCart = { lines: [], label: '', tier: 'r', customer: null };

// A tableware line's price follows its unit, the price tier and the quantity (big wholesale from N boxes).
// A line can take its own price (one item at retail in a wholesale sale); otherwise the sale's tier, big wholesale from N boxes.
function lineTier(c) { return c.tier || Units.tierFor(PosCart.tier, c.unit, c.qty, App.settings.big_box_from || 0); }
function linePrice(c) { return c.unit && c.d ? Units.price(c.d, c.unit, lineTier(c)) : c.price; }
function posTotal() { return PosCart.lines.reduce((s, c) => s + linePrice(c) * c.qty, 0); }
// What the cart earns: price minus the goods' cost (shown to the boss only).
function posProfit() { return PosCart.lines.reduce((s, c) => s + (linePrice(c) - (c.d ? (c.d.cost || 0) * (Units.mult(c.d, c.unit || 'piece') || 1) : 0)) * c.qty, 0); }
function piecesInCart(id) { return PosCart.lines.filter((c) => c.dish_id === id).reduce((a, c) => a + c.qty * (c.unit && c.d ? Units.mult(c.d, c.unit) : 1), 0); }

// m: the dish's chosen modifiers ({ ids, text, price }); the same choice adds to the same line.
function posAdd(x, qty = 1, m = null, unit = null) {
  if (!x.available) return toast(t('"{0}" tugagan', x.name), 'warn');
  if (unit) {
    const um = Units.mult(x, unit);
    if (x.stock != null && piecesInCart(x.id) + qty * um > x.stock) return toast(t('"{0}" dan faqat {1} qoldi', x.name, stockLabel(x)), 'warn');
    const ln = PosCart.lines.find((c) => c.dish_id === x.id && c.unit === unit && !c.tier);
    if (ln) ln.qty += qty;
    else PosCart.lines.push({ dish_id: x.id, name: x.name, unit, d: x, qty, variant: PACK_NAMES()[unit] });
    return;
  }
  const key = m ? m.ids.join(',') : '';
  const line = PosCart.lines.find((c) => c.dish_id === x.id && (c.mods || []).join(',') === key);
  const same = PosCart.lines.filter((c) => c.dish_id === x.id).reduce((a, c) => a + c.qty, 0);
  if (x.stock != null && same + qty > x.stock) return toast(t('"{0}" dan faqat {1} ta qoldi', x.name, x.stock), 'warn');
  if (line) line.qty += qty;
  else PosCart.lines.push({ dish_id: x.id, name: x.name, price: m ? m.price : x.price, qty, variant: m && m.text ? `+ ${m.text}` : variantOf(x), mods: m ? m.ids : undefined });
}

function productSub(x) {
  if (isIdish() && Units.hasUnits(x)) {
    const lowI = x.stock != null && (x.stock <= 0 || (x.min_stock != null && x.stock <= x.min_stock));
    return x.stock != null ? `<span class="${lowI ? 'low' : ''}">${icon('package', 12)} ${esc(stockLabel(x))}</span>` : '';
  }
  const low = x.stock != null && (x.min_stock != null ? x.stock <= x.min_stock : x.stock <= 3);
  const variant = variantOf(x);
  return `${variant ? `<b>${esc(variant)}</b> ` : ''}${x.stock != null ? `<span class="${low ? 'low' : ''}">${icon('package', 12)} ${x.stock}</span>`
    : x.needs_kitchen && App.kitchenMode !== 'off' ? `${icon('timer', 12)} ${x.eta_minutes} ${t('daq')}` : ''}`;
}

Views.pos = {
  title: () => t('Sotuv'), icon: () => 'shopping-cart',
  roles: ['owner', 'admin', 'cashier', 'waiter'], refreshOn: ['menu'], on: () => sellsAtCounter(),
  async load() {
    const money = can('owner', 'admin', 'cashier') && moduleOn('finance');
    const [menu, shift] = await Promise.all([GET('/api/menu'), money ? GET('/api/shifts/current') : null]);
    return { menu, shift, money };
  },
  render({ menu, shift, money: showShift }) {
    const q = UI.search.toLowerCase();
    const f = UI.posFilter || (UI.posFilter = {});
    const list = menu.dishes.filter((x) => (UI.category === 'all' || x.category_id === Number(UI.category))
      && (!q || `${x.name} ${x.barcode || ''} ${variantOf(x)}`.toLowerCase().includes(q))
      && (!f.size || x.size === f.size) && (!f.material || x.material === f.material) && (!f.color || x.color === f.color));
    // A door shop narrows by size, material and colour in two taps.
    const chips = (key, label) => {
      const vals = [...new Set(menu.dishes.map((x) => x[key]).filter(Boolean))].sort();
      return vals.length > 1 ? `<div class="chips"><span class="small muted">${label}:</span>${vals.map((v) => `<button class="chip-btn ${f[key] === v ? 'on' : ''}" data-f="${key}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>` : '';
    };
    const filters = isDoors() ? `<div class="pos-filters">${chips('size', t("O'lcham"))}${chips('material', t('Turi'))}${chips('color', t('Rang'))}</div>` : '';
    // Lines keep the product as it was when added: take the fresh one (price, stock) after the menu reloads.
    for (const c of PosCart.lines) if (c.unit) c.d = menu.dishes.find((x) => x.id === c.dish_id) || c.d;
    const count = PosCart.lines.reduce((s, c) => s + c.qty, 0);
    const idish = isIdish();
    const boss = can('owner', 'admin');
    const custOk = idish && can('owner', 'admin', 'cashier') && canCustomers();
    const pc = PosCart.customer;
    // Tableware: the price tier and the customer (their tier, their debt, their last purchase).
    const idishHead = idish ? `<div class="pos-tiers">
        ${custOk ? `<div class="pos-cust">${pc ? `${icon('book-user', 16)} <span class="pc-name"><b>${esc(pc.name)}</b>${pc.debt ? `<span class="small red">${t('qarz')} ${num(pc.debt)}</span>` : ''}</span><button class="btn sm" id="pos-repeat" title="${esc(t('Oxirgi xaridini savatga solish'))}">${icon('history', 15)} ${t('Oxirgi xarid')}</button>
            <button class="icon-btn ghost" id="pos-cust-x" title="${esc(t('Olib tashlash'))}">${icon('x', 16)}</button>`
          : `<button class="btn sm block" id="pos-cust">${icon('book-user', 16)} ${t('Mijozni tanlash')}</button>`}</div>` : ''}
        <div class="seg tier-seg">${Object.entries(TIER_NAMES()).map(([k, n]) => `<button class="${PosCart.tier === k ? 'active' : ''}" data-tier="${k}">${esc(n)}</button>`).join('')}</div></div>` : '';
    const idLine = (c, i) => {
      const units = Units.unitsOf(c.d);
      const p = linePrice(c);
      return `<div class="line pending idl">
        <span class="q">${c.qty}</span><span class="n">${esc(c.name)} <span class="small muted">${esc(PACK_NAMES()[c.unit])} × ${num(p)}</span> <button type="button" class="tchip ${c.tier ? 'ov' : ''}" data-ltier="${i}" title="${esc(t('Shu mol narxi'))}">${esc(TIER_NAMES()[lineTier(c)])} ▾</button></span><span class="p">${money(p * c.qty)}</span>
        <span class="sub">${units.length > 1 ? `<span class="useg">${units.map((u) => `<button class="${u === c.unit ? 'on' : ''}" data-unit="${i}:${u}">${esc(PACK_NAMES()[u])}</button>`).join('')}</span>` : ''}
          <span class="grow"></span>
          <span class="stepper"><button data-dec="${i}" title="${esc(t('Kamaytirish (0 — olib tashlash)'))}">${icon('minus', 16)}</button><input class="qty-in" type="number" min="0" inputmode="numeric" data-qty="${i}" value="${c.qty}"><button data-inc="${i}">${icon('plus', 16)}</button></span></span></div>`;
    };
    return `<div class="order">
      <aside class="checkpane ${UI.drawer ? 'open' : ''}" id="checkpane">
        <div class="cp-head"><span class="avatar" style="background:var(--brand)">${icon('shopping-cart', 18)}</span>
          <div class="grow"><b>${t('Yangi sotuv')}</b><input id="pos-label" placeholder="${esc(t('Mijoz ismi (ixtiyoriy)'))}" value="${esc(PosCart.label)}" style="min-height:36px;margin-top:4px;padding:6px 10px"></div>
          <button class="icon-btn ghost" id="cp-close" style="display:none">${icon('x')}</button></div>
        ${idishHead}
        <div class="cp-body">${PosCart.lines.length ? PosCart.lines.map((c, i) => (c.unit ? idLine(c, i) : `<div class="line pending">
            <span class="q">${c.qty}×</span><span class="n">${esc(c.name)}${c.variant ? ` <span class="small muted">${esc(c.variant)}</span>` : ''}</span><span class="p">${money(c.price * c.qty)}</span>
            <span class="sub"><span class="grow"></span><button class="icon-btn ghost danger" data-del="${i}">${icon('trash-2', 18)}</button>
              <span class="stepper"><button data-dec="${i}">${icon('minus', 16)}</button><span>${c.qty}</span><button data-inc="${i}">${icon('plus', 16)}</button></span></span></div>`)).join('')
          : emptyState(isShop() ? 'scan-barcode' : 'utensils', isShop() ? t('Mahsulotni tanlang yoki shtrix-kodni skanerlang') : W('Menyudan taom tanlang'))}</div>
        <div class="cp-foot">
          <div class="sum-rows num"><span class="total">${t('Jami')}</span><span class="total right">${money(posTotal())}</span></div>
          ${idish && boss && PosCart.lines.length ? `<div class="pos-profit"><span>${t('Shu savdodan foyda')}</span><b class="num">${posProfit() >= 0 ? '+' : ''}${money(Math.round(posProfit()))}</b></div>` : ''}
          <div class="order-actions">
            <button class="btn" id="pos-clear" ${PosCart.lines.length ? '' : 'disabled'}>${icon('x', 18)} ${t('Tozalash')}</button>
            <button class="btn ok lg" id="pos-pay" ${PosCart.lines.length ? '' : 'disabled'} style="grid-column:span 2">${icon('wallet', 20)} ${t("To'lov")}</button></div>
        </div></aside>
      ${UI.drawer ? '<div class="drawer-back" id="drawer-back"></div>' : ''}
      <section class="menu-area">
        ${catSide(menu)}
        <div class="dish-area">
          <div class="menu-bar">
            <div class="scan">${icon(isShop() ? 'scan-barcode' : 'search', 20)}<input type="search" id="pos-scan" autocomplete="off" placeholder="${esc(isShop() ? t('Shtrix-kod yoki nomi') : W('Taom qidirish'))}" value="${esc(UI.search)}"></div>
            ${isShop() && camOk() ? `<button class="btn cam-btn" id="pos-cam" title="${esc(t('Kamera bilan skanerlash'))}">${icon('camera', 20)}<span class="hide-xs"> ${t('Kamera')}</span></button>` : ''}
            ${isDoors() ? '' : quickMoneyHtml()}
            ${showShift ? `<button class="btn ${shift ? '' : 'primary'}" id="shift">${icon(shift ? 'lock' : 'circle-plus', 16)} ${shift ? t('Smenani yopish') : t('Smenani ochish')}</button>` : ''}</div>
          ${filters}
          <div class="dishes">${list.map((x) => dishTile(menu, x, { qty: (PosCart.lines.find((c) => c.dish_id === x.id) || {}).qty, sub: productSub(x),
            ...(idish && !Units.hasUnits(x) ? { price: num(Units.price(x, 'piece', PosCart.tier)) } : {}),
            ...(idish && Units.hasUnits(x) ? { price: `${num(Units.price(x, bigUnit(x), PosCart.tier))}<small>/${esc(PACK_NAMES()[bigUnit(x)])}</small>` } : {}) })).join('') || emptyState('search', W('Taom topilmadi'))}</div>
        </div>
      </section>
      <button class="fab-check" id="fab">${icon('shopping-cart', 22)}<span class="grow">${t('Savat')}${count ? ` · ${count}` : ''}</span><b>${money(posTotal())}</b></button>
    </div>`;
  },
  bind(root, d) {
    bindQuickMoney(root);
    const { menu } = d;
    const rerender = () => renderView(d);
    const scan = root.querySelector('#pos-scan');
    const desktop = !('ontouchstart' in window);
    if (desktop && !document.querySelector('.modal-back')) setTimeout(() => scan.focus(), 0);
    let timer;
    scan.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { UI.search = scan.value; rerender(); }, 150); };
    // A barcode scanner types the code and presses Enter.
    scan.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      clearTimeout(timer);
      const v = scan.value.trim();
      if (!v) return;
      const exact = menu.dishes.find((x) => x.barcode && x.barcode === v);
      const q = v.toLowerCase();
      const found = exact || (() => { const l = menu.dishes.filter((x) => `${x.name} ${x.barcode}`.toLowerCase().includes(q)); return l.length === 1 ? l[0] : null; })();
      if (!found) { toast(t('Topilmadi: {0}', v), 'warn'); scan.select(); return; }
      UI.search = '';
      if (isIdish() && Units.hasUnits(found)) { pickUnit(found, PosCart.tier).then((u) => { if (u) posAdd(found, 1, null, u); rerender(); }); return; }
      // Tableware sold only by the piece still takes the price of the chosen tier (wholesale, big wholesale).
      if (isIdish()) { posAdd(found, 1, null, 'piece'); rerender(); return; }
      posAdd(found);
      rerender();
    };
    if (window.matchMedia('(max-width: 1000px)').matches) root.querySelector('#cp-close').style.display = '';
    // The phone's camera as a scanner: each code read goes into the cart; an unknown code can become a new product.
    const cam = root.querySelector('#pos-cam');
    if (cam) cam.onclick = () => Scanner.open({ title: t('Sotuv — kamera'), onCode: (code) => {
      const found = menu.dishes.find((x) => x.barcode && x.barcode === code);
      if (!found) {
        return { ok: false, html: `${icon('triangle-alert', 16)} ${t('Topilmadi: {0}', esc(code))}${can('owner', 'admin') ? ` <button class="btn sm" data-newp>${icon('plus', 14)} ${t("Yangi mahsulot")}</button>` : ''}`,
          bind: (m) => { const b = m.querySelector('[data-newp]'); if (b) b.onclick = () => { Scanner.close(); UI.pendingBarcode = code; location.hash = '#/menuadmin'; }; } };
      }
      const before = (PosCart.lines.find((c) => c.dish_id === found.id) || {}).qty || 0;
      // Tableware: the camera adds one piece at the chosen tier (packs and boxes are picked on the screen).
      if (isIdish()) posAdd(found, 1, null, 'piece'); else posAdd(found);
      const now = (PosCart.lines.find((c) => c.dish_id === found.id) || {}).qty || 0;
      rerender();
      if (now === before) return { ok: false, text: t('"{0}" tugagan', found.name) };
      return { ok: true, html: `${icon('check', 16)} <b>${esc(found.name)}</b>${variantOf(found) ? ` <span class="small">${esc(variantOf(found))}</span>` : ''} — ${t('savatda {0} ta', now)} · ${t('Jami')}: ${moneyText(posTotal())}` };
    } });
    root.querySelector('#fab').onclick = () => { UI.drawer = true; rerender(); };
    root.querySelector('#cp-close').onclick = () => { UI.drawer = false; rerender(); };
    const back = root.querySelector('#drawer-back');
    if (back) back.onclick = () => { UI.drawer = false; rerender(); };
    root.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { UI.category = b.dataset.cat; rerender(); });
    root.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { const f = UI.posFilter; f[b.dataset.f] = f[b.dataset.f] === b.dataset.v ? '' : b.dataset.v; rerender(); });
    root.querySelectorAll('[data-dish]').forEach((b) => b.onclick = async () => {
      const x = menu.dishes.find((y) => y.id === Number(b.dataset.dish));
      if (isIdish() && Units.hasUnits(x)) { const u = await pickUnit(x, PosCart.tier); if (u) { posAdd(x, 1, null, u); rerender(); } return; }
      if (isIdish()) { posAdd(x, 1, null, 'piece'); rerender(); return; }
      if (!(x.mods || []).length) { posAdd(x); rerender(); return; }
      const m = await pickMods(menu, x);
      if (m) { posAdd(x, 1, m); rerender(); }
    });
    const dish = (c) => menu.dishes.find((x) => x.id === c.dish_id) || {};
    // "+" on a line adds one more of that very line (with its own choices).
    root.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => {
      const c = PosCart.lines[b.dataset.inc];
      if (c.unit) { posAdd(dish(c), 1, null, c.unit); rerender(); return; }
      const m = c.mods ? { ids: c.mods, text: (c.variant || '').replace(/^\+ /, ''), price: c.price } : null;
      posAdd(dish(c), 1, m); rerender();
    });
    root.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => {
      const c = PosCart.lines[b.dataset.dec];
      c.qty -= 1;
      if (c.qty <= 0) PosCart.lines.splice(b.dataset.dec, 1);
      rerender();
    });
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { PosCart.lines.splice(b.dataset.del, 1); rerender(); });
    root.querySelector('#pos-label').onchange = (e) => { PosCart.label = e.target.value; };
    root.querySelector('#pos-clear').onclick = () => { PosCart.lines = []; PosCart.label = ''; PosCart.customer = null; PosCart.tier = 'r'; rerender(); };
    // Tableware: a typed quantity, another unit for a line, the price tier, the customer and their last purchase.
    root.querySelectorAll('[data-qty]').forEach((inp) => {
      inp.onclick = (e) => { e.stopPropagation(); inp.select(); };
      inp.onchange = () => {
        const c = PosCart.lines[inp.dataset.qty];
        const n = Math.max(0, Math.floor(Number(inp.value) || 0));
        if (!n) { PosCart.lines.splice(inp.dataset.qty, 1); rerender(); return; }
        const um = Units.mult(c.d, c.unit);
        const fresh = dish(c);
        if (fresh.stock != null && piecesInCart(c.dish_id) - c.qty * um + n * um > fresh.stock) toast(t('"{0}" dan faqat {1} qoldi', c.name, stockLabel(fresh)), 'warn');
        else c.qty = n;
        rerender();
      };
    });
    root.querySelectorAll('[data-unit]').forEach((b) => b.onclick = () => {
      const [i, u] = b.dataset.unit.split(':');
      const c = PosCart.lines[i];
      const fresh = dish(c);
      if (fresh.stock != null && piecesInCart(c.dish_id) - c.qty * Units.mult(c.d, c.unit) + c.qty * Units.mult(c.d, u) > fresh.stock) {
        toast(t('"{0}" dan faqat {1} qoldi', c.name, stockLabel(fresh)), 'warn'); return;
      }
      const same = PosCart.lines.find((x, j) => j !== Number(i) && x.dish_id === c.dish_id && x.unit === u && (x.tier || '') === (c.tier || ''));
      if (same) { same.qty += c.qty; PosCart.lines.splice(i, 1); } else { c.unit = u; c.variant = PACK_NAMES()[u]; }
      rerender();
    });
    root.querySelectorAll('[data-tier]').forEach((b) => b.onclick = () => { PosCart.tier = b.dataset.tier; rerender(); });
    // One line at another price: its own tier, or back to the sale's.
    root.querySelectorAll('[data-ltier]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const c = PosCart.lines[b.dataset.ltier];
      const f = openModal({
        title: `${icon('coins')} ${esc(c.name)} — ${t('narxi')}`,
        body: `<div class="unit-pick">${Units.TIERS.map((tr) => `<button type="button" class="unit-opt ${c.tier === tr ? 'on' : ''}" data-lt="${tr}"><b>${esc(TIER_NAMES()[tr])}</b><span class="num">${money(Units.price(c.d, c.unit, tr))}</span></button>`).join('')}
          <button type="button" class="unit-opt ${c.tier ? '' : 'on'}" data-lt=""><b>${t('Umumiy narx')} (${esc(TIER_NAMES()[PosCart.tier])})</b><span class="small muted">${t('savatdagi kabi')}</span></button></div>`,
        actions: [{ label: t('Bekor') }],
      });
      f.querySelectorAll('[data-lt]').forEach((x) => x.onclick = () => { c.tier = x.dataset.lt || undefined; closeModal(); rerender(); });
    });
    const pcb = root.querySelector('#pos-cust');
    if (pcb) pcb.onclick = async () => {
      const c = await pickCustomer();
      if (!c) return;
      PosCart.customer = c; PosCart.tier = c.price_tier || 'r';
      if (!PosCart.label) PosCart.label = c.name;
      rerender();
    };
    const pcx = root.querySelector('#pos-cust-x');
    if (pcx) pcx.onclick = () => { if (PosCart.label === PosCart.customer.name) PosCart.label = ''; PosCart.customer = null; PosCart.tier = 'r'; rerender(); };
    const rep = root.querySelector('#pos-repeat');
    if (rep) rep.onclick = async () => {
      let r;
      try { r = await GET(`/api/customers/${PosCart.customer.id}/last-sale`); } catch (e) { return toastError(e); }
      if (!r.items.length) { toast(t("Bu mijozning oldingi xaridi yo'q"), 'warn'); return; }
      let missed = 0;
      for (const it of r.items) {
        const x = menu.dishes.find((y) => y.id === it.dish_id);
        const before = PosCart.lines.length + piecesInCart(it.dish_id);
        if (x && it.unit !== 'piece' && Units.mult(x, it.unit)) posAdd(x, it.qty, null, it.unit);
        else if (x && isIdish()) posAdd(x, it.qty, null, 'piece');
        else if (x) posAdd(x, it.qty);
        if (!x || PosCart.lines.length + piecesInCart(it.dish_id) === before) missed++;
      }
      toast(missed ? t("Oxirgi xarid savatga solindi ({0} ta mol yetmadi)", missed) : t('Oxirgi xarid savatga solindi ({0})', fmtDate(r.order.closed_at)), missed ? 'warn' : 'ok');
      rerender();
    };
    root.querySelector('#pos-pay').onclick = () => posPayment();
    const sh = root.querySelector('#shift');
    if (sh) sh.onclick = () => (d.shift ? closeShiftDialog(d.shift) : openShiftDialog());
  },
};

async function posPayment() {
  if (!(App.user.perms || {}).close) return toast(t("Chekni yopish huquqingiz yo'q"), 'warn');
  const goodsTotal = posTotal();
  let subtotal = goodsTotal;
  const masters = isDoors() ? await GET('/api/masters').catch(() => []) : [];
  const canDiscount = can('owner', 'admin', 'cashier');
  const form = openModal({
    title: `${icon('wallet')} ${t("To'lov")}`, size: 'wide',
    body: `<div class="pay">
        <div class="receipt">${PosCart.lines.map((c) => `<div class="line"><span class="q">${c.qty}×</span><span class="n">${esc(c.name)}${c.variant ? ` <span class="small muted">${esc(c.variant)}</span>` : ''}</span><span class="p">${money(linePrice(c) * c.qty)}</span></div>`).join('')}</div>
        <div class="stack">
          ${isDoors() ? `<div class="seg pay-mode"><button type="button" class="active" data-pmode="full">${icon('circle-check', 16)} ${t("To'liq to'lov")}</button>
            <button type="button" data-pmode="adv">${icon('hand-coins', 16)} ${t("Avans (bosh to'lov)")}</button></div>
            <div class="adv-box form-grid" hidden><label class="field">${t('Mijoz ismi')}<input name="adv_name" maxlength="80" value="${esc(PosCart.label || '')}"></label>
              <label class="field">${t('Telefon')}<input name="adv_phone" type="tel" placeholder="+998"></label></div>` : ''}
          <div class="sum-rows num" id="pay-sums"></div>
          ${canDiscount ? `<label class="field">${t('Chegirma')} (${esc(App.settings.currency)})<input type="number" name="discount" min="0" placeholder="0"></label>` : ''}
          ${isDoors() ? saleServicesHtml(masters) : ''}
          ${customerPayHtml()}
          <div class="methods">${['cash', 'card', 'transfer'].map((m) => `<button type="button" class="method" data-m="${m}">${icon(METHOD_ICONS[m], 26)}${methodName(m)}</button>`).join('')}${isDoors() ? '' : staffPayButton()}</div>
          ${staffPayBox()}
          <div class="form-grid" style="grid-template-columns:repeat(3,1fr)">${['cash', 'card', 'transfer'].map((m) => `<label class="field">${methodName(m)}<input type="number" name="paid_${m}" min="0" placeholder="0"></label>`).join('')}</div>
          <div id="pay-change" class="change"></div>
          ${isDoors() ? `<label class="field" id="debt-due" hidden>${t("Qolganini qachon to'laydi")}<input type="date" name="debt_due" value="${isoDay(Date.now() + 7 * 864e5)}"></label>` : ''}
          ${(App.user.perms || {}).print ? `<label class="check"><input type="checkbox" name="print" ${App.biz === 'fastfood' || (!isDoors() && store('cp_pos_print') !== false) ? 'checked' : ''}> ${icon('printer', 18)} ${t('Chekni chop etish')}</label>` : ''}
        </div></div>`,
    actions: [{ label: t('Bekor') }, { label: t("To'lovni yakunlash"), cls: 'ok', icon: 'circle-check', onClick: async (f) => {
      const x = formData(f);
      if (staffPay.on && !x.staff_id) { toast(t('Xodimni tanlang'), 'warn'); return false; }
      const adv = advMode && sums().paid < sums().total;
      if (adv) {
        if (!String(x.adv_name || '').trim()) { toast(t('Mijoz ismini yozing'), 'warn'); f.adv_name.focus(); return false; }
        if (String(x.adv_phone || '').replace(/\D/g, '').length < 7) { toast(t('Mijoz telefonini yozing'), 'warn'); f.adv_phone.focus(); return false; }
        if (!sums().paid) { toast(t('Avans summasini yozing'), 'warn'); f.paid_cash.focus(); return false; }
      }
      const services = getServices();
      if (services.some((s) => !s.date)) { toast(t('Xizmat sanasini tanlang'), 'warn'); return false; }
      const r = await POST('/api/sales', {
        items: PosCart.lines.map(({ dish_id, qty, mods, unit, tier }) => ({ dish_id, qty, ...(mods ? { mods } : {}), ...(unit ? { unit } : {}), ...(tier ? { tier } : {}) })), label: PosCart.label,
        ...(isIdish() ? { tier: PosCart.tier } : {}),
        services, phone: (adv ? x.adv_phone : x.svc_phone) || '', debt_due: x.debt_due || '',
        ...(adv ? { advance: true, customer_name: x.adv_name.trim(), discount: Number(x.discount) || 0,
          paid_cash: Number(x.paid_cash) || 0, paid_card: Number(x.paid_card) || 0, paid_transfer: Number(x.paid_transfer) || 0 } : staffPay.on ? { staff_id: Number(x.staff_id) } : {
          discount: Number(x.discount) || 0, paid_cash: Number(x.paid_cash) || 0, paid_card: Number(x.paid_card) || 0, paid_transfer: Number(x.paid_transfer) || 0,
          ...(cust.customer ? { customer_id: cust.customer.id, bonus: sums().bonus, paid_debt: sums().debt } : {}) }),
      });
      if ('print' in x) store('cp_pos_print', !!x.print);
      PosCart.lines = []; PosCart.label = ''; PosCart.customer = null; PosCart.tier = 'r'; UI.drawer = false;
      LocalBackup.save(r);
      if (x.print) printReceipt(r);
      refreshView();
      if (App.biz === 'fastfood') {
        openModal({ title: `${icon('circle-check')} ${t('Buyurtma qabul qilindi')}`,
          body: `<div class="order-number">№ ${r.id}</div>${r.change ? `<p class="lead" style="text-align:center">${t('Qaytim')}: <b>${money(r.change)}</b></p>` : ''}`,
          actions: [{ label: t('Yangi buyurtma'), cls: 'primary', icon: 'plus' }] });
        return false;
      }
      if (isDoors()) { saleDoneDialog(r); return false; }
      toast(`${t('Sotildi')}: ${moneyText(r.total)}${r.change ? ` · ${t('Qaytim')}: ${moneyText(r.change)}` : ''}`, 'ok', 8000);
    } }],
  });
  // Discount, the customer's bonus, what is paid now and what stays on credit.
  const sums = () => {
    const x = formData(form);
    const discount = Math.min(Number(x.discount) || 0, subtotal);
    const bonus = cust.customer ? Math.min(cust.bonus, subtotal - discount) : 0;
    const total = subtotal - discount - bonus;
    const paid = (Number(x.paid_cash) || 0) + (Number(x.paid_card) || 0) + (Number(x.paid_transfer) || 0);
    const debt = advMode || (cust.customer && cust.debt) ? Math.max(0, total - paid) : 0;
    return { discount, bonus, total, paid, debt };
  };
  const calc = () => {
    const x = formData(form);
    // Services are part of the check: what the customer pays for delivery and installation.
    subtotal = goodsTotal + getServices().reduce((s, v) => s + v.price, 0);
    if (staffPay.on) {
      form.querySelector('#pay-sums').innerHTML = `<span>${t('Xodim hisobiga')}</span><span class="right">${x.staff_id ? esc(form.staff_id.selectedOptions[0].textContent.split(' — ')[0]) : '—'}</span>
        <span style="grid-column:1/-1" class="big-total">${money(subtotal)}</span>`;
      return subtotal;
    }
    const { discount, bonus, total, paid, debt } = sums();
    const svcSum = subtotal - goodsTotal;
    const due = form.querySelector('#debt-due'); if (due) due.hidden = !debt;
    form.querySelector('#pay-sums').innerHTML = `${svcSum ? `<span>${W('Taomlar')}</span><span class="right">${money(goodsTotal)}</span><span>${t('Xizmatlar')}</span><span class="right">${money(svcSum)}</span>` : ''}
      ${discount || bonus ? `<span>${t('Jami')}</span><span class="right">${money(subtotal)}</span>` : ''}
      ${discount ? `<span>${t('Chegirma')}</span><span class="right">−${money(discount)}</span>` : ''}
      ${bonus ? `<span>${t('Bonusdan')}</span><span class="right">−${money(bonus)}</span>` : ''}
      <span style="grid-column:1/-1" class="big-total">${money(total)}</span>
      ${debt ? `<span class="red">${advMode ? t('Qoldi') : t('Qarzga')}</span><span class="right red">${money(debt)}</span>` : ''}`;
    if (advMode) {
      form.querySelector('#pay-change').innerHTML = !debt ? `<span style="color:var(--green)">${icon('circle-check', 20)} ${t("To'liq to'landi")}${paid > total ? ` · ${t('Qaytim')}: ${money(paid - total)}` : ''}</span>`
        : `<span class="orange-text">${icon('hand-coins', 20)} ${t('Avans')}: <b>${money(paid)}</b> · ${t('Qoldi')}: <b>${money(debt)}</b></span>`;
      return total;
    }
    if (debt) { form.querySelector('#pay-change').innerHTML = `<span class="red">${icon('notebook-pen', 20)} ${t('{0} qarzga yoziladi', esc(cust.customer.name))}</span>`; return total; }
    form.querySelector('#pay-change').innerHTML = !paid ? '' : paid >= total
      ? `<span style="color:var(--green)">${icon('circle-check', 20)} ${t('Qaytim')}: ${money(paid - total)}</span>`
      : `<span style="color:var(--red)">${icon('triangle-alert', 20)} ${t('Yetishmaydi')}: ${money(total - paid)}</span>`;
    return total;
  };
  form.addEventListener('input', calc);
  form.addEventListener('change', calc);
  let getServices = () => [];
  // Door shop: a whole payment, or an advance (bosh to'lov) now and the rest by a date — the customer's name and phone.
  let advMode = false;
  form.querySelectorAll('[data-pmode]').forEach((b) => b.onclick = () => {
    advMode = b.dataset.pmode === 'adv';
    form.querySelectorAll('[data-pmode]').forEach((y) => y.classList.toggle('active', y === b));
    form.querySelector('.adv-box').hidden = !advMode;
    const cb = form.querySelector('.cust-pay'); if (cb) cb.hidden = advMode;
    if (advMode) {
      if (!form.adv_phone.value && form.svc_phone && form.svc_phone.value) form.adv_phone.value = form.svc_phone.value;
      for (const m of ['cash', 'card', 'transfer']) form[`paid_${m}`].value = '';
      form.querySelectorAll('[data-m]').forEach((y) => y.classList.remove('active'));
      calc(); (form.adv_name.value ? form.paid_cash : form.adv_name).focus();
    } else form.querySelector('[data-m="cash"]').click();
  });
  const staffPay = bindStaffPay(form, calc);
  const cust = bindCustomerPay(form, calc, PosCart.customer);
  getServices = bindSaleServices(form, () => { calc(); const b = form.querySelector('.method.active'); if (b) b.click(); });
  form.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
    staffPay.on = false;
    if (advMode) {
      // The advance is typed in by hand; the button only says which way it is paid.
      const sum = (Number(form.paid_cash.value) || 0) + (Number(form.paid_card.value) || 0) + (Number(form.paid_transfer.value) || 0);
      form.querySelectorAll('[data-m]').forEach((y) => y.classList.toggle('active', y === b));
      for (const m of ['cash', 'card', 'transfer']) form[`paid_${m}`].value = m === b.dataset.m && sum ? sum : '';
      calc(); form[`paid_${b.dataset.m}`].focus();
      return;
    }
    const total = calc();
    form.querySelectorAll('[data-m]').forEach((y) => y.classList.toggle('active', y === b));
    for (const m of ['cash', 'card', 'transfer']) form[`paid_${m}`].value = m === b.dataset.m ? total : '';
    calc();
  });
  // Most sales are cash and exact: pre-fill it so one click finishes.
  form.querySelector('[data-m="cash"]').click();
}
