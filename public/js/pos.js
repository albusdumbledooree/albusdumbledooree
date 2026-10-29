'use strict';
/*
 * Counter sales ("Sotuv") for shops and fast food: pick goods (or scan a barcode), take the money, print.
 * Fast food dishes still go to the kitchen; the customer gets a number on the receipt.
 */
const PosCart = { lines: [], label: '' };

function posTotal() { return PosCart.lines.reduce((s, c) => s + c.price * c.qty, 0); }

function posAdd(x, qty = 1) {
  if (!x.available) return toast(t('"{0}" tugagan', x.name), 'warn');
  const line = PosCart.lines.find((c) => c.dish_id === x.id);
  const want = (line ? line.qty : 0) + qty;
  if (x.stock != null && want > x.stock) return toast(t('"{0}" dan faqat {1} ta qoldi', x.name, x.stock), 'warn');
  if (line) line.qty = want; else PosCart.lines.push({ dish_id: x.id, name: x.name, price: x.price, qty, variant: variantOf(x) });
}

function productSub(x) {
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
    const count = PosCart.lines.reduce((s, c) => s + c.qty, 0);
    return `<div class="order">
      <aside class="checkpane ${UI.drawer ? 'open' : ''}" id="checkpane">
        <div class="cp-head"><span class="avatar" style="background:var(--brand)">${icon('shopping-cart', 18)}</span>
          <div class="grow"><b>${t('Yangi sotuv')}</b><input id="pos-label" placeholder="${esc(t('Mijoz ismi (ixtiyoriy)'))}" value="${esc(PosCart.label)}" style="min-height:36px;margin-top:4px;padding:6px 10px"></div>
          <button class="icon-btn ghost" id="cp-close" style="display:none">${icon('x')}</button></div>
        <div class="cp-body">${PosCart.lines.length ? PosCart.lines.map((c, i) => `<div class="line pending">
            <span class="q">${c.qty}×</span><span class="n">${esc(c.name)}${c.variant ? ` <span class="small muted">${esc(c.variant)}</span>` : ''}</span><span class="p">${money(c.price * c.qty)}</span>
            <span class="sub"><span class="grow"></span><button class="icon-btn ghost danger" data-del="${i}">${icon('trash-2', 18)}</button>
              <span class="stepper"><button data-dec="${i}">${icon('minus', 16)}</button><span>${c.qty}</span><button data-inc="${i}">${icon('plus', 16)}</button></span></span></div>`).join('')
          : emptyState(isShop() ? 'scan-barcode' : 'utensils', isShop() ? t('Mahsulotni tanlang yoki shtrix-kodni skanerlang') : W('Menyudan taom tanlang'))}</div>
        <div class="cp-foot">
          <div class="sum-rows num"><span class="total">${t('Jami')}</span><span class="total right">${money(posTotal())}</span></div>
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
            ${showShift ? `<button class="btn ${shift ? '' : 'primary'}" id="shift">${icon(shift ? 'lock' : 'circle-plus', 16)} ${shift ? t('Smenani yopish') : t('Smenani ochish')}</button>` : ''}</div>
          ${filters}
          <div class="dishes">${list.map((x) => dishTile(menu, x, { qty: (PosCart.lines.find((c) => c.dish_id === x.id) || {}).qty, sub: productSub(x) })).join('') || emptyState('search', W('Taom topilmadi'))}</div>
        </div>
      </section>
      <button class="fab-check" id="fab">${icon('shopping-cart', 22)}<span class="grow">${t('Savat')}${count ? ` · ${count}` : ''}</span><b>${money(posTotal())}</b></button>
    </div>`;
  },
  bind(root, d) {
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
      posAdd(found);
      UI.search = '';
      rerender();
    };
    if (window.matchMedia('(max-width: 1000px)').matches) root.querySelector('#cp-close').style.display = '';
    root.querySelector('#fab').onclick = () => { UI.drawer = true; rerender(); };
    root.querySelector('#cp-close').onclick = () => { UI.drawer = false; rerender(); };
    const back = root.querySelector('#drawer-back');
    if (back) back.onclick = () => { UI.drawer = false; rerender(); };
    root.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { UI.category = b.dataset.cat; rerender(); });
    root.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { const f = UI.posFilter; f[b.dataset.f] = f[b.dataset.f] === b.dataset.v ? '' : b.dataset.v; rerender(); });
    root.querySelectorAll('[data-dish]').forEach((b) => b.onclick = () => { posAdd(menu.dishes.find((x) => x.id === Number(b.dataset.dish))); rerender(); });
    const dish = (c) => menu.dishes.find((x) => x.id === c.dish_id) || {};
    root.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => { posAdd(dish(PosCart.lines[b.dataset.inc])); rerender(); });
    root.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => {
      const c = PosCart.lines[b.dataset.dec];
      c.qty -= 1;
      if (c.qty <= 0) PosCart.lines.splice(b.dataset.dec, 1);
      rerender();
    });
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { PosCart.lines.splice(b.dataset.del, 1); rerender(); });
    root.querySelector('#pos-label').onchange = (e) => { PosCart.label = e.target.value; };
    root.querySelector('#pos-clear').onclick = () => { PosCart.lines = []; PosCart.label = ''; rerender(); };
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
        <div class="receipt">${PosCart.lines.map((c) => `<div class="line"><span class="q">${c.qty}×</span><span class="n">${esc(c.name)}${c.variant ? ` <span class="small muted">${esc(c.variant)}</span>` : ''}</span><span class="p">${money(c.price * c.qty)}</span></div>`).join('')}</div>
        <div class="stack">
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
      const services = getServices();
      if (services.some((s) => !s.date)) { toast(t('Xizmat sanasini tanlang'), 'warn'); return false; }
      const r = await POST('/api/sales', {
        items: PosCart.lines.map(({ dish_id, qty }) => ({ dish_id, qty })), label: PosCart.label,
        services, phone: x.svc_phone || '', debt_due: x.debt_due || '',
        ...(staffPay.on ? { staff_id: Number(x.staff_id) } : {
          discount: Number(x.discount) || 0, paid_cash: Number(x.paid_cash) || 0, paid_card: Number(x.paid_card) || 0, paid_transfer: Number(x.paid_transfer) || 0,
          ...(cust.customer ? { customer_id: cust.customer.id, bonus: sums().bonus, paid_debt: sums().debt } : {}) }),
      });
      if ('print' in x) store('cp_pos_print', !!x.print);
      PosCart.lines = []; PosCart.label = ''; UI.drawer = false;
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
    const debt = cust.customer && cust.debt ? Math.max(0, total - paid) : 0;
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
      ${debt ? `<span class="red">${t('Qarzga')}</span><span class="right red">${money(debt)}</span>` : ''}`;
    if (debt) { form.querySelector('#pay-change').innerHTML = `<span class="red">${icon('notebook-pen', 20)} ${t('{0} qarzga yoziladi', esc(cust.customer.name))}</span>`; return total; }
    form.querySelector('#pay-change').innerHTML = !paid ? '' : paid >= total
      ? `<span style="color:var(--green)">${icon('circle-check', 20)} ${t('Qaytim')}: ${money(paid - total)}</span>`
      : `<span style="color:var(--red)">${icon('triangle-alert', 20)} ${t('Yetishmaydi')}: ${money(total - paid)}</span>`;
    return total;
  };
  form.addEventListener('input', calc);
  form.addEventListener('change', calc);
  let getServices = () => [];
  const staffPay = bindStaffPay(form, calc);
  const cust = bindCustomerPay(form, calc);
  getServices = bindSaleServices(form, () => { calc(); const b = form.querySelector('.method.active'); if (b) b.click(); });
  form.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
    staffPay.on = false;
    const total = calc();
    form.querySelectorAll('[data-m]').forEach((y) => y.classList.toggle('active', y === b));
    for (const m of ['cash', 'card', 'transfer']) form[`paid_${m}`].value = m === b.dataset.m ? total : '';
    calc();
  });
  // Most sales are cash and exact: pre-fill it so one click finishes.
  form.querySelector('[data-m="cash"]').click();
}
