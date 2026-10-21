'use strict';
/* Kitchen display and stop-list. */

function ticketHtml(i) {
  const notify = App.kitchenMode === 'notify';
  return `<div class="ticket ${i.status}">
    <div class="t-head">${icon(i.takeaway ? 'shopping-bag' : 'door-open', 16)}<b>${esc(i.room_name)}</b>
      <span>· ${esc(i.waiter_name)}</span><span class="grow"></span><span class="timer">${icon('clock', 14)} <b data-since="${i.created_at}"></b></span></div>
    <div class="dish-name"><span class="q">${i.qty}×</span>${esc(i.name)}</div>
    ${i.note ? `<div class="note">${icon('sticky-note', 16)} ${esc(i.note)}</div>` : ''}
    <div class="row small muted">
      ${i.status === 'new' || i.status === 'cooking' ? `<span class="timer">${icon('timer', 14)} <b data-eta="${i.eta_at}"></b></span><span>~${i.prep_minutes} ${t('daq')}</span>` : ''}
      ${i.status === 'ready' ? `<span>${icon('circle-check', 14)} ${fmtTime(i.ready_at)} · ${t('ofitsant kutilmoqda')} <b data-since="${i.ready_at}"></b></span>` : ''}
      ${i.status === 'served' ? `<span>${icon('hand', 14)} ${fmtTime(i.served_at)}</span>` : ''}
      ${i.chef_name ? `<span>${icon('chef-hat', 14)} ${esc(i.chef_name)}</span>` : ''}</div>
    ${i.status === 'new' || i.status === 'cooking' ? `<div class="acts">
      ${i.status === 'new' && !notify ? `<button class="btn primary lg" data-accept="${i.id}">${icon('check', 20)} ${t('Qabul qilish')}</button>` : ''}
      <button class="btn ${i.status === 'cooking' || notify ? 'ok lg' : 'lg'}" data-ready="${i.id}" ${i.status === 'new' && !notify ? `title="${esc(t('Darhol tayyor'))}" style="flex:0 0 64px"` : ''}>${icon('circle-check', 20)}${i.status === 'new' && !notify ? '' : ` ${t('Tayyor')}`}</button>
      <button class="btn lg" data-kprint="${i.id}" title="${esc(t('Chop etish'))}" style="flex:0 0 64px">${icon('printer', 20)}</button></div>` : ''}
  </div>`;
}

Views.kitchen = {
  title: () => t('Oshxona'), icon: () => 'chef-hat', roles: ['owner', 'admin', 'chef'], refreshOn: ['kitchen', 'rooms', 'kitchen_new'], badge: 'kitchen',
  module: 'kitchen',
  async load() { return GET('/api/kitchen'); },
  render({ items, load }) {
    const col = (st) => items.filter((i) => (Array.isArray(st) ? st.includes(i.status) : i.status === st));
    const done = col(['ready', 'served']).sort((a, b) => (b.ready_at || 0) - (a.ready_at || 0));
    const notify = App.kitchenMode === 'notify';
    return `<div class="page-head"><h1>${t('Oshxona')}</h1>
      <span class="chip new">${icon('bell', 14)} ${load.pending}</span><span class="chip cooking">${icon('flame', 14)} ${load.cooking}</span>
      <label class="check small"><input type="checkbox" id="kprint" ${store('cp_kprint') ? 'checked' : ''}> ${icon('printer', 18)} ${t('Avtomatik chop etish')}</label>
      ${moduleOn('stoplist') ? `<a class="btn sm" href="#/stoplist">${icon('ban', 16)} ${t('Stop-list')}</a>` : ''}</div>
      <div class="kds">
        ${notify ? '' : `<div class="kds-col"><h2>${icon('bell')} ${t('Yangi')} <span class="badge">${col('new').length}</span></h2>${col('new').map(ticketHtml).join('') || emptyState('check', t("Yangi buyurtma yo'q"))}</div>`}
        <div class="kds-col"><h2>${icon('flame')} ${t('Tayyorlanmoqda')} <span class="badge" style="background:var(--orange)">${col('cooking').length}</span></h2>${col('cooking').map(ticketHtml).join('') || emptyState('chef-hat', t('Hozir hech narsa tayyorlanmayapti'))}</div>
        <div class="kds-col"><h2>${icon('circle-check')} ${t('Tayyor')}</h2>${done.map(ticketHtml).join('') || emptyState('utensils', t("Bo'sh"))}</div>
      </div>`;
  },
  bind(root, { items }) {
    root.querySelector('#kprint').onchange = (e) => {
      store('cp_kprint', e.target.checked || null);
      toast(e.target.checked ? t('Yangi buyurtmalar shu qurilmada avtomatik chop etiladi') : t("Avtomatik chop etish o'chirildi"), 'ok');
    };
    root.querySelectorAll('[data-kprint]').forEach((b) => b.onclick = () => {
      const i = items.find((x) => x.id === Number(b.dataset.kprint));
      printKitchenTicket({ order_id: i.order_id, room: i.room_name, waiter: i.waiter_name, at: i.created_at, items: [i] });
    });
    root.querySelectorAll('[data-accept]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try { await POST(`/api/items/${b.dataset.accept}/accept`); refreshView(); } catch (e) { toastError(e); b.disabled = false; }
    });
    root.querySelectorAll('[data-ready]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try { await POST(`/api/items/${b.dataset.ready}/ready`); toast(t('Ofitsantga xabar yuborildi'), 'ok'); refreshView(); } catch (e) { toastError(e); b.disabled = false; }
    });
  },
};

Views.stoplist = {
  title: () => t('Stop-list'), icon: () => 'ban', roles: ['owner', 'admin', 'cashier', 'chef'], refreshOn: ['menu'], module: 'stoplist',
  async load() { return GET('/api/menu'); },
  render({ categories, dishes }) {
    const q = UI.search.toLowerCase();
    const list = dishes.filter((d) => !q || d.name.toLowerCase().includes(q));
    const stopped = dishes.filter((d) => !d.available);
    const groups = [...categories, { id: null, name: t("Bo'limsiz"), icon: '' }]
      .map((c) => ({ c, ds: list.filter((d) => (d.category_id ?? null) === c.id) })).filter((g) => g.ds.length);
    return `<div class="page-head"><h1>${t('Stop-list')}</h1><span class="chip red">${icon('ban', 14)} ${stopped.length}</span>
      <input type="search" id="stop-search" placeholder="${esc(t('Qidirish'))}" value="${esc(UI.search)}" style="max-width:260px"></div>
      <div class="notice blue">${icon('info', 18)} ${t('Taom tugasa "Tugadi" ni bosing. Qoldiq sonini yozsangiz, tugaganda o\'zi yopiladi.')}</div>
      ${groups.map(({ c, ds }) => `<div class="card"><div class="card-head"><h2>${esc(c.icon)} ${esc(c.name)}</h2></div><div class="table-wrap"><table>
        ${ds.map((d) => `<tr><td>${esc(d.icon)} <b>${esc(d.name)}</b></td><td class="num">${money(d.price)}</td>
          <td style="width:120px"><input type="number" min="0" placeholder="∞" value="${d.stock ?? ''}" data-stock="${d.id}" title="${esc(t('Qoldiq'))}" style="min-height:38px;padding:6px 10px"></td>
          <td class="actions">${d.available ? `<button class="btn sm danger" data-stop="${d.id}">${icon('ban', 16)} ${t('Tugadi')}</button>` : `<button class="btn sm ok" data-start="${d.id}">${icon('check', 16)} ${t('Bor')}</button>`}</td></tr>`).join('')}
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
