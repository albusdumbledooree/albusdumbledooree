'use strict';
/*
 * "Bugun" (today's tasks and numbers), tasks, and the shop's bookkeeping screens:
 * goods arriving ("Mol keldi") with suppliers, damaged goods and counts, installers and their jobs,
 * services on a sale, debts on both sides, the profit report, loading goods from Excel, the invoice (nakladnoy).
 * Words are kept plain: "Mollardan foyda", not "yalpi foyda"; each number can explain itself (ⓘ).
 */
const isoDay = (ts = Date.now()) => localDay(ts);
const REPEAT_NAMES = () => ({ none: t('Bir marta'), daily: t('Har kuni'), weekly: t('Har hafta'), monthly: t('Har oy') });
const JOB_NAMES = () => ({ measure: t("O'lchov"), delivery: t('Yetkazib berish'), install: t("O'rnatish") });
const JOB_ICONS = { measure: 'ruler', delivery: 'truck', install: 'hammer' };
const MATERIALS = () => [t('MDF'), t('Metall'), t("Yog'och"), t('Shisha'), t('Plastik')];
const SIDES = () => [t("O'ng"), t('Chap'), t('Universal')];
const variantOf = (d) => [d.size, d.color, d.material, d.side].filter(Boolean).join(' · ');
// A small ⓘ that explains a number in one sentence.
const tip = (text) => `<span class="tip" tabindex="0" title="${esc(text)}" data-tip="${esc(text)}">ⓘ</span>`;
function bindTips(root) {
  root.querySelectorAll('[data-tip]').forEach((el) => el.onclick = (e) => { e.stopPropagation(); toast(el.dataset.tip, 'info', 7000); });
}
const longToday = () => longDate();
// A date and time picked on this phone, as this phone's own moment (the server may sit in another time zone).
function tsOf(date, time) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m) return null;
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), tm ? Number(tm[1]) : 0, tm ? Number(tm[2]) : 0).getTime();
}

// ---------- Tasks ----------
function taskLine(x, { canEdit }) {
  const late = x.due_at < dayStart().getTime();
  return `<div class="task ${late ? 'late' : ''} ${x.done_at ? 'done' : ''}" data-task="${x.id}">
    <button class="task-check" data-tdone="${x.id}" title="${esc(x.done_at ? t('Qaytarish') : t('Bajarildi'))}">${x.done_at ? icon('check', 18) : ''}</button>
    <div class="grow">
      <div class="task-title">${x.has_time ? `<b class="task-time">${fmtTime(x.due_at)}</b> ` : ''}${esc(x.title)}${x.amount ? ` <span class="chip">${money(x.amount)}</span>` : ''}</div>
      <div class="small muted">${[
        late ? `<span class="red">${icon('triangle-alert', 13)} ${fmtDate(x.due_at)}</span>` : x.due_at >= dayStart().getTime() + 864e5 ? fmtDate(x.due_at) : '',
        x.repeat !== 'none' ? `${icon('repeat', 12)} ${REPEAT_NAMES()[x.repeat]}` : '',
        x.assignee ? `${icon('user-round', 12)} ${esc(x.assignee)}` : '',
        x.auto ? `${icon('sparkles', 12)} ${t('dastur yozdi')}` : '',
        x.note ? esc(x.note) : '',
        x.done_at ? `${t('bajardi')}: ${esc(x.done_by_name || '')} ${fmtTime(x.done_at)}` : '',
      ].filter(Boolean).join(' · ')}</div></div>
    ${canEdit && !x.done_at && !x.auto ? `<button class="icon-btn" data-tedit="${x.id}">${icon('pencil', 16)}</button>` : ''}</div>`;
}
function bindTasks(root, all, reload) {
  const find = (id) => all.find((x) => x.id === Number(id));
  root.querySelectorAll('[data-tdone]').forEach((b) => b.onclick = async () => {
    const x = find(b.dataset.tdone);
    if (x.done_at) { try { await POST(`/api/tasks/${x.id}/undo`); reload(); } catch (e) { toastError(e); } return; }
    if (x.category && x.amount) return expenseTaskDone(x, reload);
    b.disabled = true;
    try { await POST(`/api/tasks/${x.id}/done`, {}); toast(t('Bajarildi'), 'ok'); reload(); refreshBadges(); } catch (e) { b.disabled = false; toastError(e); }
  });
  root.querySelectorAll('[data-tedit]').forEach((b) => b.onclick = () => taskDialog(find(b.dataset.tedit), reload));
}
// A fixed expense (rent, tax): ticking it writes the money down — the amount may differ this month.
function expenseTaskDone(x, reload) {
  openModal({
    title: `${icon('wallet')} ${esc(x.title)}`,
    body: `<p class="muted" style="margin-top:0">${t('Xarajat sifatida yoziladi')}: <b>${esc(x.category)}</b></p>
      <div class="form-grid"><label class="field">${t('Summa')}<input type="number" name="amount" min="0" value="${x.amount}"></label>
        <label class="field">${t("To'lov turi")}<select name="method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label></div>`,
    actions: [{ label: t('Bekor') }, { label: t("To'landi"), cls: 'ok', icon: 'check', onClick: async (f) => {
      await POST(`/api/tasks/${x.id}/done`, { amount: f.amount.value, method: f.method.value });
      toast(t('Xarajat yozildi'), 'ok'); reload(); refreshBadges();
    } }],
  });
}
async function taskDialog(x = null, reload = refreshView, preset = {}) {
  let staff = [];
  if (can('owner', 'admin')) staff = await GET('/api/staff-list').catch(() => []);
  const cats = App.settings.expense_categories || [];
  const v = x || { title: '', due_at: Date.now(), has_time: 0, repeat: 'none', amount: 0, category: '', ...preset };
  const expense = !!(v.amount || v.category || preset.expense);
  const form = openModal({
    title: `${icon(expense ? 'wallet' : 'list-checks')} ${x ? t('Ishni tahrirlash') : expense ? t('Doimiy xarajat') : t('Yangi ish')}`,
    body: `<label class="field">${expense ? t('Nomi (masalan: Ijara)') : t('Nima qilish kerak')}<input name="title" required maxlength="160" value="${esc(v.title)}" placeholder="${esc(expense ? t("Ijara to'lash") : t("Masalan: Zavodga qo'ng'iroq qilish"))}"></label>
      <div class="form-grid" style="margin-top:12px">
        <label class="field">${t('Sana')}<input type="date" name="date" value="${isoDay(v.due_at)}" required></label>
        <label class="field">${t('Soat (ixtiyoriy)')}<input type="time" name="time" value="${v.has_time ? fmtTime(v.due_at) : ''}"></label>
        <label class="field">${t('Takrorlansinmi')}<select name="repeat">${Object.entries(REPEAT_NAMES()).map(([k, n]) => `<option value="${k}" ${v.repeat === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        ${staff.length ? `<label class="field">${t('Kim bajaradi')}<select name="assignee_id"><option value="">${t('Men (boshliq)')}</option>${staff.map((u) => `<option value="${u.id}" ${v.assignee_id === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>` : ''}
      </div>
      <label class="check" style="margin-top:12px"><input type="checkbox" name="is_expense" ${expense ? 'checked' : ''}> ${icon('wallet', 18)} ${t("Bu to'lov (ijara, soliq, kommunal…) — bajarilganda xarajat bo'lib yozilsin")}</label>
      <div class="form-grid" id="exp-box" style="margin-top:8px">
        <label class="field">${t('Summa')}<input type="number" name="amount" min="0" value="${v.amount || ''}"></label>
        <label class="field">${t('Xarajat turi')}<select name="category">${cats.map((c) => `<option ${v.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
      <label class="field" style="margin-top:12px">${t('Izoh')}<input name="note" maxlength="500" value="${esc(v.note || '')}"></label>`,
    actions: [
      ...(x ? [{ label: t("O'chirish"), cls: 'danger', onClick: async () => { if (!(await confirmModal(t("O'chirish"), t('Bu ish o\'chirilsinmi?'), t("O'chirish")))) return false; await DEL(`/api/tasks/${x.id}`); reload(); refreshBadges(); } }] : []),
      { label: t('Bekor') },
      { label: t('Saqlash'), cls: 'primary', icon: 'check', onClick: async (f) => {
        const d = formData(f);
        const body = { title: d.title, date: d.date, time: d.time, at: tsOf(d.date, d.time), repeat: d.repeat, note: d.note, assignee_id: d.assignee_id || null,
          amount: d.is_expense ? Number(d.amount) || 0 : 0, category: d.is_expense ? d.category : '' };
        if (d.is_expense && !body.amount) { toast(t('Summani kiriting'), 'warn'); return false; }
        await (x ? PUT(`/api/tasks/${x.id}`, body) : POST('/api/tasks', body));
        toast(t('Saqlandi'), 'ok'); reload(); refreshBadges();
      } }],
  });
  const sync = () => { form.querySelector('#exp-box').style.display = form.is_expense.checked ? '' : 'none'; };
  form.is_expense.onchange = sync;
  sync();
}

// ---------- "Bugun" ----------
Views.today = {
  title: () => t('Bugun'), icon: () => 'sun', roles: ['owner', 'admin', 'cashier', 'waiter', 'chef'], badge: 'tasks', refreshOn: ['tasks', 'jobs', 'finance', 'menu'],
  on: () => isDoors(),
  async load() { return GET('/api/today'); },
  render(d) {
    const tk = d.tasks;
    const mgr = can('owner', 'admin');
    const open = [...tk.overdue, ...tk.today];
    const m = d.money;
    const up = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
    const diff = m ? up(m.revenue, m.yesterday) : null;
    return `<div class="page-head"><h1>☀️ ${t('Bugun')}</h1><span class="muted">${esc(longToday())}</span><span class="grow"></span>
        ${can('owner', 'admin', 'cashier') ? `<button class="btn primary" id="t-add">${icon('plus', 18)} ${t("Ish qo'shish")}</button>` : ''}</div>
      ${isDoors() && can('owner', 'admin', 'cashier', 'waiter') ? `<div class="quick">
        <a class="quick-btn" href="#/pos">${icon('shopping-cart', 28)}<b>${t('Sotish')}</b></a>
        ${can('owner', 'admin', 'cashier') ? `<button class="quick-btn" id="q-in">${icon('package-plus', 28)}<b>${t('Mol keldi')}</b></button>
        <button class="quick-btn" id="q-exp">${icon('wallet', 28)}<b>${t('Xarajat')}</b></button>` : ''}
        ${viewOn('profit') ? `<a class="quick-btn" href="#/profit">${icon('chart-column', 28)}<b>${t('Hisobot')}</b></a>` : ''}</div>` : ''}
      <div class="today-grid">
        <div class="card today-tasks"><div class="card-head"><h2>${icon('list-checks', 20)} ${t('Bugungi ishlar')} <span class="chip ${open.length ? 'orange' : 'green'}">${open.length}</span></h2></div>
          ${open.length ? open.map((x) => taskLine(x, { canEdit: mgr })).join('') : `<p class="muted" style="margin:6px 0 4px">${icon('circle-check', 16)} ${t("Bugunga ish qolmadi. Barakalla!")}</p>`}
          ${tk.upcoming.length ? `<details class="upcoming"><summary>${t('Keyingi kunlar')} (${tk.upcoming.length})</summary>${tk.upcoming.map((x) => taskLine(x, { canEdit: mgr })).join('')}</details>` : ''}
          ${tk.done.length ? `<details class="upcoming"><summary>${t('Bugun bajarilgan')} (${tk.done.length})</summary>${tk.done.map((x) => taskLine(x, { canEdit: false })).join('')}</details>` : ''}
          ${mgr ? `<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap"><button class="btn sm" id="t-add2">${icon('plus', 16)} ${t('Ish')}</button>
            <button class="btn sm" id="t-exp">${icon('repeat', 16)} ${t('Doimiy xarajat (ijara, soliq…)')}</button></div>` : ''}</div>
        <div class="stack">
          ${m ? `<div class="kpis two">
            ${kpi(t('Bugungi savdo'), money(m.revenue), `${m.sales} ${t('ta sotuv')}${diff !== null ? ` · ${t('kecha')} ${money(m.yesterday)}` : ''}`, 'good', 'trending-up')}
            ${m.profit !== null ? kpi(`${t('Bugungi sof foyda')} ${tip(t("Bugungi savdodan mollar tannarxi, ustalar haqi, brak va bugun yozilgan xarajatlar ayrilgan."))}`, money(m.profit), '', m.profit >= 0 ? 'good' : 'bad', 'coins') : ''}
          </div>` : ''}
          ${d.jobs && d.jobs.length ? `<div class="card"><div class="card-head"><h2>${icon('truck', 20)} ${t('Bugungi chiqishlar')}</h2></div>
            ${d.jobs.map((j) => `<div class="job-line">${icon(JOB_ICONS[j.kind], 18)}<div class="grow"><b>${j.scheduled_at ? fmtTime(j.scheduled_at) : ''} ${JOB_NAMES()[j.kind]}</b> — ${esc(j.customer_name || '')}
              <div class="small muted">${j.address ? `${icon('map-pin', 12)} ${esc(j.address)} ` : ''}${j.phone ? `${icon('phone', 12)} <a href="tel:${esc(j.phone)}">${esc(j.phone)}</a> ` : ''}${j.master_name ? `· ${esc(j.master_name)}` : ''}</div></div>
              <button class="btn sm ok" data-jdone="${j.id}">${icon('check', 16)} ${t('Bajarildi')}</button></div>`).join('')}</div>` : ''}
          ${d.low_stock && d.low_stock.length ? `<div class="card"><div class="card-head"><h2>${icon('triangle-alert', 20)} ${t('Kam qoldi')}</h2>${can('owner', 'admin', 'cashier') ? `<button class="btn sm" id="q-in2">${icon('package-plus', 16)} ${t('Mol keldi')}</button>` : ''}</div>
            ${d.low_stock.map((x) => `<div class="low-line"><span class="grow">${esc(x.name)}</span><b class="${x.stock <= 0 ? 'red' : ''}">${x.stock} ${t('ta')}</b></div>`).join('')}</div>` : ''}
          ${d.debts ? `<div class="kpis two">
            ${kpi(t('Bizga qarz'), money(d.debts.owed_to_us), `${d.debts.customers.length} ${t('ta mijoz')}`, d.debts.owed_to_us ? 'warn' : '', 'hand-coins')}
            ${kpi(t('Biz qarzmiz'), money(d.debts.we_owe), `${d.debts.suppliers.length + d.debts.masters.length} ${t('ta')}`, d.debts.we_owe ? 'bad' : '', 'notebook-pen')}</div>
            ${viewOn('debts') && (d.debts.owed_to_us || d.debts.we_owe) ? `<a class="btn sm" href="#/debts" style="justify-self:start">${icon('arrow-right', 16)} ${t("Qarzlarni ko'rish")}</a>` : ''}` : ''}
        </div></div>`;
  },
  bind(root, d) {
    const all = [...d.tasks.overdue, ...d.tasks.today, ...d.tasks.upcoming, ...d.tasks.done];
    bindTasks(root, all, refreshView);
    bindTips(root);
    for (const id of ['t-add', 't-add2']) { const b = root.querySelector(`#${id}`); if (b) b.onclick = () => taskDialog(); }
    const ex = root.querySelector('#t-exp'); if (ex) ex.onclick = () => taskDialog(null, refreshView, { expense: true, repeat: 'monthly', title: t("Ijara to'lash"), category: 'Ijara' });
    for (const id of ['q-in', 'q-in2']) { const b = root.querySelector(`#${id}`); if (b) b.onclick = () => purchaseDialog(); }
    const qe = root.querySelector('#q-exp'); if (qe) qe.onclick = () => quickExpense();
    root.querySelectorAll('[data-jdone]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try { await POST(`/api/jobs/${b.dataset.jdone}/done`); toast(t('Bajarildi'), 'ok'); refreshView(); refreshBadges(); } catch (e) { b.disabled = false; toastError(e); }
    });
  },
};

// A running cost written in two taps (rent, electricity, a lunch for the helper).
function quickExpense() { openTransaction('expense'); }

// ---------- "Mol keldi": goods from a supplier, freight spread over them ----------
async function purchaseDialog(preset = null) {
  let menu; let sups;
  try { [menu, sups] = await Promise.all([GET('/api/menu'), GET('/api/suppliers')]); } catch (e) { return toastError(e); }
  const goods = menu.dishes;
  const opt = (sel) => goods.map((d) => `<option value="${d.id}" ${sel === d.id ? 'selected' : ''}>${esc(d.name)}${variantOf(d) ? ` — ${esc(variantOf(d))}` : ''}</option>`).join('');
  const line = (dishId = null) => `<div class="pin-line">
      <label class="field">${t('Mol')}<select name="dish">${opt(dishId)}</select></label>
      <label class="field">${t('Soni')}<input type="number" name="qty" min="1" value="1"></label>
      <label class="field">${t('Kelish narxi (1 ta)')}<input type="number" name="price" min="0"></label>
      <button type="button" class="icon-btn danger" data-rm>${icon('x', 18)}</button></div>`;
  const form = openModal({
    title: `${icon('package-plus')} ${t('Mol keldi')}`, size: 'wide',
    body: `<div class="form-grid"><label class="field">${t('Kimdan (yetkazib beruvchi)')}<select name="supplier_id"><option value="">— ${t("ko'rsatilmagan")} —</option>
        ${sups.map((s) => `<option value="${s.id}">${esc(s.name)}${s.debt ? ` (${t('qarz')} ${num(s.debt)})` : ''}</option>`).join('')}</select></label>
        <div class="field">&nbsp;<button type="button" class="btn sm" id="sup-new">${icon('plus', 16)} ${t('Yangi yetkazib beruvchi')}</button></div></div>
      <h3 style="margin:14px 0 8px">${t('Nima keldi')}</h3>
      <div id="pin-lines" class="stack" style="gap:8px">${line(preset)}</div>
      <div class="row" style="gap:8px;margin-top:8px"><button type="button" class="btn sm" id="pin-more">${icon('plus', 16)} ${t('Yana mol')}</button>
        ${camOk() ? `<button type="button" class="btn sm" id="pin-cam">${icon('camera', 16)} ${t('Kamera bilan qo\'shish')}</button>` : ''}</div>
      <div class="form-grid" style="margin-top:14px">
        <label class="field">${t("Yo'lkira (mashina, yuk tushirish)")} ${tip(t("Yo'lkira mollarga narxiga qarab bo'lib qo'shiladi — har bir eshikning haqiqiy tannarxi chiqadi."))}<input type="number" name="freight" min="0" placeholder="0"></label>
        <label class="field">${t('Yetkazib beruvchiga hozir berildi')}<input type="number" name="paid" min="0"></label>
        <label class="field">${t("To'lov turi")}<select name="method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label>
        <label class="field" id="due-box">${t("Qolganini qachon to'laymiz")}<input type="date" name="due_date" value="${isoDay(Date.now() + 7 * 864e5)}"></label></div>
      <label class="check" style="margin-top:8px"><input type="checkbox" name="freight_paid" checked> ${t("Yo'lkira hozir kassadan to'landi")}</label>
      <div class="sum-rows num" id="pin-sum" style="margin-top:12px"></div>`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'ok', icon: 'check', onClick: async (f) => {
      const items = [...f.querySelectorAll('.pin-line')].map((l) => ({ dish_id: Number(l.querySelector('[name=dish]').value), qty: Number(l.querySelector('[name=qty]').value), price: Number(l.querySelector('[name=price]').value) }))
        .filter((x) => x.qty > 0);
      if (!items.length) { toast(t('Mollarni kiriting'), 'warn'); return false; }
      if (items.some((x) => !(x.price >= 0) || f.querySelector('[name=price]').value === '')) { /* price 0 allowed only if typed */ }
      const r = await POST('/api/purchases', { supplier_id: f.supplier_id.value || null, items, freight: Number(f.freight.value) || 0,
        paid: f.paid.value === '' ? undefined : Number(f.paid.value), method: f.method.value, freight_paid: f.freight_paid.checked, due_date: f.due_date.value });
      toast(t('Mol omborga qo\'shildi: {0} ta', r.items.reduce((s, i) => s + i.qty, 0)), 'ok', 6000);
      refreshView();
      // New goods usually need their labels right away.
      openModal({ title: `${icon('circle-check')} ${t('Mol omborga qo\'shildi')}`,
        body: `<p style="margin-top:0">${r.items.map((i) => `${esc(i.label)} — <b>${i.qty} ${t('ta')}</b>`).join('<br>')}</p>`,
        actions: [{ label: t('Yopish') }, { label: t('Yorliq chop etish'), cls: 'primary', icon: 'scan-barcode',
          onClick: () => { labelsDialog(r.items.map((i) => ({ id: i.dish_id, qty: i.qty }))); return false; } }] });
      return false;
    } }],
  });
  const fill = (l) => {
    const sel = l.querySelector('[name=dish]');
    const set = () => { const d = goods.find((x) => x.id === Number(sel.value)); if (d && !l.querySelector('[name=price]').value) l.querySelector('[name=price]').value = d.cost || ''; };
    sel.onchange = () => { l.querySelector('[name=price]').value = ''; set(); sum(); };
    set();
    l.querySelector('[data-rm]').onclick = () => { if (form.querySelectorAll('.pin-line').length > 1) { l.remove(); sum(); } };
  };
  const sum = () => {
    const goodsTotal = [...form.querySelectorAll('.pin-line')].reduce((s, l) => s + (Number(l.querySelector('[name=qty]').value) || 0) * (Number(l.querySelector('[name=price]').value) || 0), 0);
    const freight = Number(form.freight.value) || 0;
    const paid = form.paid.value === '' ? goodsTotal : Math.min(goodsTotal, Number(form.paid.value) || 0);
    const debt = goodsTotal - paid;
    form.querySelector('#due-box').style.display = debt > 0 ? '' : 'none';
    form.querySelector('#pin-sum').innerHTML = `<span>${t('Mollar')}</span><span class="right">${money(goodsTotal)}</span>
      ${freight ? `<span>${t("Yo'lkira")}</span><span class="right">${money(freight)}</span>` : ''}
      <span><b>${t('Jami tannarx')}</b></span><span class="right"><b>${money(goodsTotal + freight)}</b></span>
      ${debt > 0 ? `<span class="red">${t('Yetkazib beruvchiga qarz')}</span><span class="right red"><b>${money(debt)}</b></span>` : ''}`;
  };
  form.querySelectorAll('.pin-line').forEach(fill);
  form.querySelector('#pin-more').onclick = () => { form.querySelector('#pin-lines').insertAdjacentHTML('beforeend', line()); fill(form.querySelector('.pin-line:last-child')); sum(); };
  form.querySelector('#sup-new').onclick = () => supplierForm(null, () => purchaseDialog(preset));
  // Scanning goods as they are unloaded: a known code adds a line or one more of it.
  let untouched = !preset;
  form.querySelector('#pin-lines').addEventListener('input', () => { untouched = false; });
  const pc = form.querySelector('#pin-cam');
  if (pc) pc.onclick = () => Scanner.open({ title: t('Mol keldi — kamera'), onCode: (code) => {
    const d = goods.find((x) => x.barcode && x.barcode === code);
    if (!d) return { ok: false, text: t('Topilmadi: {0}', code) };
    let l = [...form.querySelectorAll('.pin-line')].find((x) => Number(x.querySelector('[name=dish]').value) === d.id);
    if (l && !untouched) l.querySelector('[name=qty]').value = (Number(l.querySelector('[name=qty]').value) || 0) + 1;
    else {
      if (untouched) { l = form.querySelector('.pin-line'); untouched = false; } else { form.querySelector('#pin-lines').insertAdjacentHTML('beforeend', line(d.id)); l = form.querySelector('.pin-line:last-child'); fill(l); }
      l.querySelector('[name=dish]').value = d.id; l.querySelector('[name=qty]').value = 1; l.querySelector('[name=price]').value = d.cost || '';
    }
    sum();
    return { ok: true, html: `${icon('check', 16)} <b>${esc(d.name)}</b> ${esc(variantOf(d))} — ${l.querySelector('[name=qty]').value} ${t('ta')}` };
  } });
  form.addEventListener('input', sum);
  form.addEventListener('change', sum);
  bindTips(form);
  sum();
}
function supplierForm(s = null, after = refreshView) {
  openModal({
    title: `${icon('truck')} ${s ? esc(s.name) : t('Yangi yetkazib beruvchi')}`,
    body: `<div class="form-grid"><label class="field">${t('Nomi')}<input name="name" required value="${esc(s ? s.name : '')}" placeholder="${esc(t('Masalan: "Dveri" zavodi'))}"></label>
      <label class="field">${t('Telefon')}<input name="phone" type="tel" value="${esc(s ? s.phone : '+998 ')}"></label>
      ${s ? '' : `<label class="field">${t('Hozir unga qarzimiz (bo\'lsa)')}<input type="number" name="opening_debt" min="0" placeholder="0"></label>`}</div>
      <label class="field" style="margin-top:12px">${t('Izoh')}<input name="note" value="${esc(s ? s.note : '')}"></label>`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
      const d = formData(f);
      if (d.phone.trim() === '+998') d.phone = '';
      await (s ? PUT(`/api/suppliers/${s.id}`, d) : POST('/api/suppliers', d));
      toast(t('Saqlandi'), 'ok'); after();
    } }],
  });
}
async function supplierCard(id) {
  let s;
  try { s = await GET(`/api/suppliers/${id}`); } catch (e) { return toastError(e); }
  const kinds = { purchase: t('Mol olindi'), payment: t("To'landi"), opening: t("Boshlang'ich qarz") };
  openModal({
    title: `${icon('truck')} ${esc(s.name)}`, size: 'wide',
    body: `<div class="kpis two">${kpi(t('Biz qarzmiz'), money(s.debt), '', s.debt ? 'bad' : 'good', 'notebook-pen')}
        ${kpi(t('Mol olingan'), s.purchases.length, s.phone ? `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : '', '', 'package')}</div>
      ${s.moves.length ? `<div class="table-wrap"><table><tr><th>${t('Sana')}</th><th>${t('Nima')}</th><th class="right">${t('Summa')}</th><th>${t('Kim')}</th></tr>
        ${s.moves.map((m) => `<tr><td class="small">${fmtDateTime(m.created_at)}</td><td>${kinds[m.kind]}${m.note ? ` <span class="small muted">${esc(m.note)}</span>` : ''}</td>
          <td class="right num ${m.kind === 'payment' ? 'green-text' : ''}">${m.kind === 'payment' ? '−' : '+'}${money(m.amount)}</td><td class="small muted">${esc(m.user_name || '')}</td></tr>`).join('')}</table></div>` : `<p class="muted">${t("Hali harakat yo'q")}</p>`}`,
    actions: [{ label: t('Yopish') }, ...(can('owner', 'admin') ? [{ label: t('Tahrirlash'), icon: 'pencil', onClick: () => { supplierForm(s); return false; } }] : []),
      ...(s.debt > 0 ? [{ label: t("Qarzni to'lash"), cls: 'ok', icon: 'banknote', onClick: () => { payDialog({ title: `${esc(s.name)} — ${t("qarzni to'lash")}`, max: s.debt, url: `/api/suppliers/${s.id}/pay` }); return false; } }] : [])],
  });
}
function payDialog({ title, max, url, extra = {} }) {
  openModal({
    title: `${icon('banknote')} ${title}`,
    body: `<p class="lead" style="margin-top:0">${t('Qarz')}: <b class="red">${money(max)}</b></p>
      <div class="form-grid"><label class="field">${t('Summa')}<input type="number" name="amount" min="1" max="${max}" value="${max}"></label>
        <label class="field">${t("To'lov turi")}<select name="method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label></div>`,
    actions: [{ label: t('Bekor') }, { label: t("To'lash"), cls: 'ok', icon: 'check', onClick: async (f) => {
      await POST(url, { amount: Number(f.amount.value), method: f.method.value, ...extra });
      toast(t('Saqlandi'), 'ok'); refreshView();
    } }],
  });
}

// ---------- Goods leaving outside sales ----------
function writeoffDialog(d) {
  openModal({
    title: `${icon('trash-2')} ${esc(d.name)} — ${t('brak / hisobdan chiqarish')}`,
    body: `<p class="muted" style="margin-top:0">${esc(variantOf(d))} · ${t('Omborda')}: <b>${d.stock ?? '∞'}</b> · ${t('Tannarx')}: ${money(d.cost)}</p>
      <div class="form-grid"><label class="field">${t('Soni')}<input type="number" name="qty" min="1" max="${d.stock ?? ''}" value="1"></label>
        <label class="field">${t('Sabab')}<input name="reason" required placeholder="${esc(t("Masalan: singan, tirnalgan, nuqsonli"))}"></label></div>
      <p class="small muted">${t("Zarar foyda hisobotida \"Brak va yo'qotish\" bo'lib ko'rinadi.")}</p>`,
    actions: [{ label: t('Bekor') }, { label: t('Hisobdan chiqarish'), cls: 'danger', onClick: async (f) => {
      await POST(`/api/dishes/${d.id}/writeoff`, { qty: Number(f.qty.value), reason: f.reason.value });
      toast(t('Saqlandi'), 'ok'); refreshView();
    } }],
  });
}
function countDialog(d) {
  openModal({
    title: `${icon('list')} ${esc(d.name)} — ${t('sanash')}`,
    body: `<p class="muted" style="margin-top:0">${esc(variantOf(d))} · ${t('Dasturda')}: <b>${d.stock ?? 0}</b></p>
      <label class="field">${t('Haqiqatda nechta bor')}<input type="number" name="qty" min="0" value="${d.stock ?? 0}" required></label>`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
      const r = await POST(`/api/dishes/${d.id}/count`, { qty: Number(f.qty.value) });
      toast(r.diff ? t('Farq: {0} ta', r.diff > 0 ? `+${r.diff}` : r.diff) : t("Hammasi to'g'ri"), r.diff < 0 ? 'warn' : 'ok'); refreshView();
    } }],
  });
}
async function stockHistoryDialog(d) {
  let h;
  try { h = await GET(`/api/dishes/${d.id}/history`); } catch (e) { return toastError(e); }
  const K = { in: [t('Keldi'), 'green'], import: [t('Yuklandi'), 'green'], writeoff: [t('Brak'), 'red'], count: [t('Sanoq'), 'orange'], refund: [t('Qaytarildi'), 'green'] };
  const rows = [...h.moves.map((m) => ({ at: m.created_at, kind: K[m.kind], qty: m.qty, sum: m.unit_cost, note: m.note, who: m.user_name })),
    ...h.sales.map((s) => ({ at: s.created_at, kind: [t('Sotildi'), ''], qty: -s.qty, sum: s.price, note: `#${s.order_id}`, who: '' }))].sort((a, b) => b.at - a.at).slice(0, 120);
  openModal({
    title: `${icon('history')} ${esc(d.name)}`, size: 'wide',
    body: `<p class="muted" style="margin-top:0">${esc(variantOf(d))} · ${t('Omborda')}: <b>${d.stock ?? '∞'}</b> · ${t('Tannarx')}: ${money(d.cost)} · ${t('Narx')}: ${money(d.price)}</p>
      ${rows.length ? `<div class="table-wrap"><table><tr><th>${t('Sana')}</th><th>${t('Nima')}</th><th class="right">${t('Soni')}</th><th class="right">${t('Narx')}</th><th>${t('Izoh')}</th></tr>
        ${rows.map((r) => `<tr><td class="small">${fmtDateTime(r.at)}</td><td><span class="chip ${r.kind[1]}">${r.kind[0]}</span></td><td class="right num">${r.qty > 0 ? '+' : ''}${r.qty}</td>
          <td class="right num">${money(r.sum)}</td><td class="small">${esc(r.note || '')} ${r.who ? `<span class="muted">${esc(r.who)}</span>` : ''}</td></tr>`).join('')}</table></div>` : `<p class="muted">${t("Hali harakat yo'q")}</p>`}`,
    actions: [{ label: t('Yopish') }],
  });
}

// ---------- Loading goods from Excel (copy the cells, paste here) ----------
const IMPORT_COLS = [
  ['name', ['nomi', 'nom', 'mahsulot', 'mol', 'name', 'наименование', 'название', 'товар']],
  ['size', ["o'lcham", 'olcham', 'razmer', 'размер', 'size']], ['color', ['rang', 'rangi', 'цвет', 'color']],
  ['material', ['turi', 'material', 'материал', 'тип']], ['side', ['tomon', 'tomoni', 'сторона', 'side']],
  ['category', ["bo'lim", 'bolim', 'kategoriya', 'категория', 'группа', 'category']],
  ['cost', ['kelish narxi', 'tannarx', 'kelish', 'себестоимость', 'закуп', 'закупка', 'cost']], ['price', ['sotish narxi', 'narx', 'narxi', 'цена', 'price']],
  ['stock', ['soni', 'qoldiq', 'miqdor', 'количество', 'остаток', 'кол-во', 'stock', 'qty']], ['min_stock', ['minimal', 'min', 'минимум']],
  ['barcode', ['shtrix', 'shtrix-kod', 'barcode', 'штрих', 'штрихкод']],
];
function parsePasted(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return { rows: [], cols: [] };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const split = (l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const cols = head.map((h) => (IMPORT_COLS.find(([, names]) => names.some((n) => h === n || h.startsWith(n))) || [null])[0]);
  const hasHead = cols.filter(Boolean).length >= 2;
  const use = hasHead ? cols : ['name', 'size', 'color', 'material', 'side', 'cost', 'price', 'stock'];
  const numCols = ['cost', 'price', 'stock', 'min_stock'];
  const rows = (hasHead ? lines.slice(1) : lines).map((l) => {
    const cells = split(l);
    const r = {};
    use.forEach((k, i) => { if (k && cells[i] !== undefined && cells[i] !== '') r[k] = numCols.includes(k) ? Math.round(Number(String(cells[i]).replace(/[\s']/g, '').replace(',', '.'))) : cells[i]; });
    return r;
  }).filter((r) => r.name);
  return { rows, cols: use };
}
function importDialog() {
  const form = openModal({
    title: `${icon('file-spreadsheet')} ${t("Excel'dan mollarni yuklash")}`, size: 'wide',
    body: `<ol class="small" style="margin-top:0;padding-left:18px">
        <li>${t("Excel'da jadvalni belgilang (sarlavha qatori bilan) va nusxa oling (Ctrl+C).")}</li>
        <li>${t("Shu yerga joylang (Ctrl+V). Ustunlar nomidan o'zi taniydi: Nomi, O'lcham, Rang, Turi, Tomoni, Bo'lim, Kelish narxi, Sotish narxi, Soni.")}</li></ol>
      <textarea name="text" rows="8" placeholder="${esc("Nomi\tO'lcham\tRang\tTuri\tTomoni\tKelish narxi\tSotish narxi\tSoni\nMDF eshik Klassik\t2000×800\tOq\tMDF\tO'ng\t980000\t1450000\t5")}"></textarea>
      <div id="imp-prev" style="margin-top:12px"></div>
      <p class="small muted">${t("Bir xil mol (nomi va hamma belgilari bir xil) qayta yuklansa — narxi yangilanadi, soni qo'shiladi.")}</p>`,
    actions: [{ label: t('Bekor') }, { label: t('Yuklash'), cls: 'primary', icon: 'upload', onClick: async (f) => {
      const { rows } = parsePasted(f.text.value);
      if (!rows.length) { toast(t("Ro'yxat bo'sh"), 'warn'); return false; }
      const r = await POST('/api/import/products', { rows });
      toast(t('Yuklandi: {0} ta yangi, {1} ta yangilandi', r.added, r.updated), 'ok', 7000); refreshView();
    } }],
  });
  const names = { name: t('Nomi'), size: t("O'lcham"), color: t('Rang'), material: t('Turi'), side: t('Tomoni'), category: t("Bo'lim"), cost: t('Kelish narxi'), price: t('Sotish narxi'), stock: t('Soni'), min_stock: t('Minimal'), barcode: t('Shtrix-kod') };
  form.text.oninput = () => {
    const { rows } = parsePasted(form.text.value);
    const keys = Object.keys(names).filter((k) => rows.some((r) => r[k] !== undefined));
    form.querySelector('#imp-prev').innerHTML = rows.length ? `<b>${t('{0} ta mol topildi', rows.length)}</b><div class="table-wrap" style="max-height:240px;margin-top:6px"><table>
      <tr>${keys.map((k) => `<th>${names[k]}</th>`).join('')}</tr>${rows.slice(0, 50).map((r) => `<tr>${keys.map((k) => `<td>${esc(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</table></div>` : '';
  };
}

// ---------- Services on a sale (door shop): installation and delivery ----------
function saleServicesHtml(masters) {
  const svc = (kind, label, ic) => `<div class="svc" data-svc="${kind}">
      <label class="check"><input type="checkbox" name="svc_${kind}"> ${icon(ic, 18)} <b>${label}</b></label>
      <div class="svc-body" hidden><div class="form-grid">
        <label class="field">${t('Mijozdan olinadi')}<input type="number" name="${kind}_price" min="0" placeholder="0"></label>
        <label class="field">${kind === 'install' ? t('Ustaga beriladi') : t('Haydovchiga beriladi')} ${tip(t("Shu summa savdo foydasidan ayriladi va ustaga \"to'lanadigan\" bo'lib turadi."))}<input type="number" name="${kind}_cost" min="0" placeholder="0"></label>
        <label class="field">${kind === 'install' ? t('Usta') : t('Haydovchi')}<select name="${kind}_master"><option value="">—</option>${masters.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>
        <label class="field">${t('Sana')}<input type="date" name="${kind}_date" value="${isoDay(Date.now() + 864e5)}"></label>
        <label class="field">${t('Soat')}<input type="time" name="${kind}_time"></label></div></div></div>`;
  return `<div class="svc-box">${svc('delivery', t('Yetkazib berish'), 'truck')}${svc('install', t("O'rnatish"), 'hammer')}
    <div class="form-grid svc-addr" hidden><label class="field">${t('Manzil')}<input name="svc_address" placeholder="${esc(t("Tuman, ko'cha, uy"))}"></label>
      <label class="field">${t('Mijoz telefoni')}<input name="svc_phone" type="tel" placeholder="+998"></label></div></div>`;
}
function bindSaleServices(form, onChange) {
  const box = form.querySelector('.svc-box');
  if (!box) return () => [];
  const sync = () => {
    let any = false;
    box.querySelectorAll('[data-svc]').forEach((s) => {
      const on = s.querySelector('input[type=checkbox]').checked;
      s.querySelector('.svc-body').hidden = !on;
      any = any || on;
    });
    box.querySelector('.svc-addr').hidden = !any;
    onChange();
  };
  box.querySelectorAll('[data-svc] input[type=checkbox]').forEach((c) => c.onchange = sync);
  bindTips(box);
  return () => ['delivery', 'install'].filter((k) => form[`svc_${k}`].checked).map((k) => ({
    kind: k, price: Number(form[`${k}_price`].value) || 0, cost: Number(form[`${k}_cost`].value) || 0, master_id: form[`${k}_master`].value || null,
    date: form[`${k}_date`].value, time: form[`${k}_time`].value, at: tsOf(form[`${k}_date`].value, form[`${k}_time`].value), address: form.svc_address.value,
  }));
}
// After a door-shop sale: what it earned, and the invoice.
function saleDoneDialog(r) {
  openModal({
    title: `${icon('circle-check')} ${t('Sotildi')} — #${r.id}`,
    body: `<div class="sale-done"><div class="muted">${t('Shu savdodan sof foyda')} ${tip(t("Chek summasidan mollar tannarxi (yo'lkira bilan) va ustaga/haydovchiga beriladigan haq ayrilgan."))}</div>
        <div class="big ${r.profit >= 0 ? 'green-text' : 'red'}">${money(r.profit)}</div>
        <div class="sum-rows num"><span>${t('Chek')}</span><span class="right">${money(r.total)}</span>
          ${r.change ? `<span>${t('Qaytim')}</span><span class="right">${money(r.change)}</span>` : ''}
          ${r.paid_debt ? `<span class="red">${t('Qarzga')}</span><span class="right red">${money(r.paid_debt)}</span>` : ''}</div>
        ${r.jobs && r.jobs.length ? `<div class="small muted" style="margin-top:8px">${r.jobs.map((j) => `${icon(JOB_ICONS[j.kind], 14)} ${JOB_NAMES()[j.kind]}${j.scheduled_at ? `: ${fmtDate(j.scheduled_at)} ${fmtTime(j.scheduled_at)}` : ''}`).join('<br>')}<br>${t("\"Bugun\" sahifasidagi ishlarga qo'shildi.")}</div>` : ''}</div>`,
    actions: [{ label: t('Nakladnoy'), icon: 'printer', onClick: () => { printInvoice(r.id); return false; } }, { label: t('Yangi sotuv'), cls: 'primary', icon: 'plus' }],
  });
  bindTips(document.getElementById('modal-root'));
}

// ---------- Invoice (nakladnoy), A4 ----------
async function printInvoice(orderId) {
  let v;
  try { v = await GET(`/api/orders/${orderId}/invoice`); } catch (e) { return toastError(e); }
  const w = window.open('', '_blank');
  if (!w) return toast(t("Brauzer yangi oynani to'sib qo'ydi — ruxsat bering"), 'warn');
  const m = (n) => `${num(n)}`;
  const logo = App.info && App.info.logo ? `<img src="${esc(location.origin + App.info.logo)}" style="height:48px">` : '';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Nakladnoy #${v.id}</title><style>
    @page { size: A4; margin: 14mm; } body { font: 12pt/1.4 Arial, sans-serif; color: #111; margin: 0; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; } h1 { font-size: 18pt; margin: 0 0 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; } th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; } th { background: #f1f1f1; }
    .r { text-align: right; white-space: nowrap; } .sum td { border: 0; padding: 3px 8px; } .sign { display: flex; justify-content: space-between; margin-top: 40px; }
    .sign div { width: 45%; border-top: 1px solid #333; padding-top: 4px; font-size: 10pt; } .muted { color: #555; font-size: 10pt; }
  </style></head><body>
    <div class="top"><div><h1>Nakladnoy № ${v.id}</h1><div class="muted">${new Date(v.date).toLocaleString('ru-RU')}</div></div><div style="text-align:right">${logo}<div><b>${esc(v.seller.name)}</b></div>
      <div class="muted">${esc(v.seller.address || '')} ${esc(v.seller.phone || '')}</div></div></div>
    <p><b>Xaridor:</b> ${v.customer ? `${esc(v.customer.name)} ${esc(v.customer.phone || '')}` : '—'}${v.address ? `<br><b>Manzil:</b> ${esc(v.address)}` : ''}</p>
    <table><tr><th>№</th><th>Nomi</th><th>Belgilari</th><th class="r">Soni</th><th class="r">Narxi</th><th class="r">Summa</th></tr>
      ${v.items.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.name)}</td><td>${esc(i.variant || (i.service ? i.note || '' : ''))}</td><td class="r">${i.qty} ${esc(i.unit)}</td><td class="r">${m(i.price)}</td><td class="r">${m(i.price * i.qty)}</td></tr>`).join('')}</table>
    <table class="sum" style="width:auto;margin-left:auto">${v.discount ? `<tr><td>Chegirma:</td><td class="r">−${m(v.discount)}</td></tr>` : ''}
      <tr><td><b>Jami:</b></td><td class="r"><b>${m(v.total)} so'm</b></td></tr><tr><td>To'landi:</td><td class="r">${m(v.paid)}</td></tr>
      ${v.debt ? `<tr><td><b>Qoldiq (qarz):</b></td><td class="r"><b>${m(v.debt)}</b></td></tr>` : ''}</table>
    ${v.jobs.length ? `<p class="muted">${v.jobs.map((j) => `${{ install: "O'rnatish", delivery: 'Yetkazib berish', measure: "O'lchov" }[j.kind]}${j.scheduled_at ? `: ${new Date(j.scheduled_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}`).join(' · ')}</p>` : ''}
    <div class="sign"><div>Sotuvchi</div><div>Xaridor: mol to'liq va butun holda qabul qilindi</div></div>
    <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script></body></html>`);
  w.document.close();
}

// ---------- Profit report ----------
Views.profit = {
  title: () => t('Foyda hisoboti'), icon: () => 'chart-column', roles: ['owner', 'admin', 'cashier'], module: 'reports', on: () => isShop() && !!(App.money || {}).reports,
  refreshOn: ['finance'],
  async load() { const r = periodRange(); return GET(`/api/profit?from=${r.from}&to=${r.to}`); },
  render(d) {
    const ch = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);
    const arrow = (a, b) => { const c = ch(a, b); return c === null ? '' : `<span class="${c >= 0 ? 'green-text' : 'red'}">${c >= 0 ? '▲' : '▼'} ${Math.abs(c)}%</span> ${t("o'tgan davrga nisbatan")}`; };
    const rows = [
      [t('Mollar tannarxi'), d.goods_cost, t("Sotilgan mollarning kelish narxi (yo'lkira bilan).")],
      ...(d.service_cost ? [[t('Ustalar va yetkazish'), d.service_cost, t("O'rnatish va yetkazib berish uchun ustaga/haydovchiga beriladigan haq.")]] : []),
      ...(d.damage ? [[t("Brak va yo'qotish"), d.damage, t("Hisobdan chiqarilgan (singan) mollar va sanoqda chiqqan kamomad.")]] : []),
      ...d.running.map((r) => [r.category, r.amount, '']),
    ];
    const maxRow = Math.max(1, ...rows.map((r) => r[1]));
    const items = (list, f) => (list.length ? list.map((r) => `<div class="hbar"><span>${esc(r.name)}${r.variant ? ` <span class="small muted">${esc(r.variant)}</span>` : ''}</span><span class="track"><span class="fill" style="width:${(f(r) / Math.max(1, ...list.map(f))) * 100}%"></span></span><span class="num">${f === qtyF ? `${r.qty} ${t('ta')}` : money(f(r))}</span></div>`).join('')
      : `<p class="muted">${t("Ma'lumot yo'q")}</p>`);
    const qtyF = (r) => r.qty;
    const profitF = (r) => r.profit;
    return `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Foyda hisoboti')}</h1><span class="grow"></span>
        <button class="btn" id="pr-csv">${icon('file-spreadsheet', 18)} Excel</button></div>
      ${periodPicker()}
      <div class="kpis two big-kpis">
        ${kpi(`${t('Savdo')} ${tip(t("Sotuvlardan tushgan jami summa (chegirma va qaytarilganlar ayrilgan). Qarzga sotilgani ham shu yerda."))}`, money(d.revenue), `${d.sales} ${t('ta sotuv')} · ${arrow(d.revenue, d.prev.revenue)}`, 'good', 'trending-up')}
        ${kpi(`${t('Sof foyda')} ${tip(t("Savdodan hamma narsa ayrilgandan keyin qolgan pul: mollar tannarxi, ustalar, brak, ijara, soliq, kommunal, ish haqi va boshqa xarajatlar."))}`, money(d.net), arrow(d.net, d.prev.net), d.net >= 0 ? 'good' : 'bad', 'coins')}
      </div>
      <div class="card"><div class="card-head"><h2>${icon('wallet', 20)} ${t('Pul qayerga ketdi')}</h2></div>
        <div class="flow-row total"><span>${t('Savdo')}</span><b class="num">${money(d.revenue)}</b></div>
        ${rows.map((r) => `<div class="flow-row"><span>− ${esc(r[0])} ${r[2] ? tip(r[2]) : ''}</span><span class="flow-bar"><span style="width:${(r[1] / maxRow) * 100}%"></span></span><span class="num">${money(r[1])}</span></div>`).join('')}
        ${d.other_income ? `<div class="flow-row"><span>+ ${t('Boshqa kirim')}</span><span></span><span class="num">${money(d.other_income)}</span></div>` : ''}
        <div class="flow-row total ${d.net >= 0 ? 'good' : 'bad'}"><span>= ${t('Sof foyda')}</span><b class="num">${money(d.net)}</b></div>
        <p class="small muted" style="margin:8px 0 0">${t('Mollardan foyda')} ${tip(t("Savdo − mollar tannarxi. Xarajatlar hali ayrilmagan."))}: <b>${money(d.gross)}</b>${d.revenue ? ` (${Math.round((d.gross / d.revenue) * 100)}%)` : ''}</p></div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>${icon('trophy', 20)} ${t("Eng ko'p sotilgan")}</h2></div>${items(d.top_qty, qtyF)}</div>
        <div class="card"><div class="card-head"><h2>${icon('coins', 20)} ${t("Eng ko'p foyda keltirgan")} ${tip(t("Ko'p sotilgan har doim ko'p foyda bermaydi — bu ro'yxat (narx − tannarx) × soni bo'yicha."))}</h2></div>${items(d.top_profit, profitF)}</div>
        <div class="card"><div class="card-head"><h2>${icon('trending-down', 20)} ${t('Kam sotilgan')}</h2></div>
          ${d.slow.length ? d.slow.map((r) => `<div class="low-line"><span class="grow">${esc(r.name)} <span class="small muted">${esc(r.variant)}</span></span><span class="small muted">${t('sotildi')}: <b>${r.qty}</b> · ${t('omborda')}: <b>${r.stock}</b></span></div>`).join('') : `<p class="muted">${t("Ma'lumot yo'q")}</p>`}</div>
        <div class="card"><div class="card-head"><h2>${icon('snowflake', 20)} ${t("O'lik mollar")} ${tip(t("60 kundan beri na sotilgan, na kelgan mollar. Ulardagi pul \"qotib\" turibdi — chegirma bilan sotishni o'ylab ko'ring."))}</h2>
          ${d.dead_total ? `<span class="chip red">${money(d.dead_total)}</span>` : ''}</div>
          ${d.dead.length ? d.dead.slice(0, 8).map((r) => `<div class="low-line"><span class="grow">${esc(r.name)} <span class="small muted">${esc(r.variant)}</span></span><span>${r.stock} ${t('ta')} · <b>${money(r.frozen)}</b></span></div>`).join('') : `<p class="muted">${icon('circle-check', 16)} ${t("Yo'q — hamma mol aylanib turibdi")}</p>`}</div>
      </div>
      <div class="kpis">
        ${kpi(`${t('Ombordagi mol')} ${tip(t("Hozir do'konda turgan hamma mol tannarx bo'yicha."))}`, money(d.stock_value), `${d.stock_units} ${t('ta')}`, '', 'warehouse')}
        ${kpi(t('Bizga qarz'), money(d.debts.owed_to_us), `${d.debts.customers.length} ${t('ta mijoz')}`, d.debts.owed_to_us ? 'warn' : '', 'hand-coins')}
        ${kpi(t('Biz qarzmiz'), money(d.debts.we_owe), t('yetkazib beruvchi va ustalarga'), d.debts.we_owe ? 'bad' : '', 'notebook-pen')}
      </div>
      ${d.by_day.length > 1 ? `<div class="card"><div class="card-head"><h2>${icon('calendar', 20)} ${t("Kunlar bo'yicha savdo")}</h2></div>
        ${hbars(d.by_day.map((x) => ({ label: fmtDate(x.day), value: x.total })))}</div>` : ''}`;
  },
  bind(root, d) {
    bindPeriod(root);
    bindTips(root);
    root.querySelector('#pr-csv').onclick = () => {
      const lines = [['Ko\'rsatkich', 'Summa'], ['Savdo', d.revenue], ['Mollar tannarxi', d.goods_cost], ['Ustalar va yetkazish', d.service_cost], ["Brak va yo'qotish", d.damage],
        ...d.running.map((r) => [r.category, r.amount]), ['Boshqa kirim', d.other_income], ['Sof foyda', d.net], [], ['Mol', 'Belgilari', 'Sotildi', 'Savdo', 'Foyda'],
        ...d.top_qty.map((r) => [r.name, r.variant, r.qty, r.revenue, r.profit]), [], ["O'lik mollar", 'Belgilari', 'Omborda', 'Qotgan pul'], ...d.dead.map((r) => [r.name, r.variant, r.stock, r.frozen])];
      const csv = '﻿' + lines.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `foyda-${isoDay(d.from)}_${isoDay(d.to - 1)}.csv`;
      a.click();
    };
  },
};

// ---------- Goods arrived: history and suppliers ----------
UI.pur = UI.pur || { tab: 'list' };
Views.purchases = {
  title: () => t('Mol keldi'), icon: () => 'package-plus', roles: ['owner', 'admin', 'cashier'], on: () => isShop(), refreshOn: ['menu', 'finance'],
  async load() {
    const r = periodRange();
    const [list, sups] = await Promise.all([GET(`/api/purchases?from=${r.from}&to=${r.to}`), GET('/api/suppliers')]);
    return { list, sups };
  },
  render({ list, sups }) {
    const tabs = `<div class="seg" style="margin-bottom:14px">${[['list', t('Kelgan mollar')], ['sup', t('Yetkazib beruvchilar')]].map(([k, n]) => `<button class="${UI.pur.tab === k ? 'active' : ''}" data-ptab="${k}">${n}</button>`).join('')}</div>`;
    const head = `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Mol keldi')}</h1><span class="grow"></span>
      ${UI.pur.tab === 'sup' && can('owner', 'admin') ? `<button class="btn" id="sup-add">${icon('plus', 18)} ${t('Yetkazib beruvchi')}</button>` : ''}
      <button class="btn ok" id="pur-add">${icon('package-plus', 18)} ${t('Mol keldi')}</button></div>`;
    if (UI.pur.tab === 'sup') {
      return `${head}${tabs}<div class="card">${sups.length ? `<div class="table-wrap"><table><tr><th>${t('Nomi')}</th><th>${t('Telefon')}</th><th>${t('Oxirgi mol')}</th><th class="right">${t('Biz qarzmiz')}</th></tr>
        ${sups.map((s) => `<tr class="clickable" data-sup="${s.id}"><td><b>${esc(s.name)}</b>${s.note ? `<br><span class="small muted">${esc(s.note)}</span>` : ''}</td><td>${esc(s.phone || '—')}</td>
          <td class="small muted">${s.last ? fmtDate(s.last) : '—'}</td><td class="right num">${s.debt ? `<b class="red">${money(s.debt)}</b>` : '—'}</td></tr>`).join('')}</table></div>`
        : emptyState('truck', t("Hali yetkazib beruvchi yo'q"))}</div>`;
    }
    const total = list.reduce((s, p) => s + p.goods_total + p.freight, 0);
    return `${head}${tabs}${periodPicker()}
      <div class="kpis two">${kpi(t('Kelgan mollar'), money(total), `${list.length} ${t('marta')}`, '', 'package-plus')}
        ${kpi(t('Yetkazib beruvchilarga qarz'), money(sups.reduce((s, x) => s + x.debt, 0)), '', sups.some((x) => x.debt) ? 'bad' : '', 'notebook-pen')}</div>
      <div class="card">${list.length ? `<div class="table-wrap"><table><tr><th>${t('Sana')}</th><th>${t('Kimdan')}</th><th class="right">${t('Mollar')}</th><th class="right">${t("Yo'lkira")}</th><th class="right">${t("To'langan")}</th></tr>
        ${list.map((p) => `<tr class="clickable" data-pur="${p.id}"><td class="small">${fmtDateTime(p.created_at)}</td><td>${esc(p.supplier_name || '—')}<br><span class="small muted">${p.units} ${t('ta')}, ${p.lines} ${t('xil')}</span></td>
          <td class="right num">${money(p.goods_total)}</td><td class="right num">${p.freight ? money(p.freight) : '—'}</td><td class="right num">${p.paid < p.goods_total ? `<span class="red">${money(p.paid)}</span>` : money(p.paid)}</td></tr>`).join('')}</table></div>`
        : emptyState('package-plus', t("Bu davrda mol kelmagan"))}</div>`;
  },
  bind(root) {
    bindPeriod(root);
    root.querySelectorAll('[data-ptab]').forEach((b) => b.onclick = () => { UI.pur.tab = b.dataset.ptab; refreshView(); });
    root.querySelector('#pur-add').onclick = () => purchaseDialog();
    const sa = root.querySelector('#sup-add'); if (sa) sa.onclick = () => supplierForm();
    root.querySelectorAll('[data-sup]').forEach((r) => r.onclick = () => supplierCard(Number(r.dataset.sup)));
    root.querySelectorAll('[data-pur]').forEach((r) => r.onclick = async () => {
      let p;
      try { p = await GET(`/api/purchases/${r.dataset.pur}`); } catch (e) { return toastError(e); }
      openModal({
        title: `${icon('package-plus')} ${t('Mol keldi')} #${p.id}`, size: 'wide',
        body: `<p class="muted" style="margin-top:0">${fmtDateTime(p.created_at)} · ${esc(p.supplier_name || '—')} · ${esc(p.user_name || '')}${p.note ? ` · ${esc(p.note)}` : ''}</p>
          <div class="table-wrap"><table><tr><th>${t('Mol')}</th><th class="right">${t('Soni')}</th><th class="right">${t('Narx')}</th><th class="right">${t("Yo'lkira bilan")} ${tip(t("Har bir dona uchun haqiqiy tannarx: narx + yo'lkira ulushi."))}</th></tr>
          ${p.items.map((i) => `<tr><td>${esc(i.label)}</td><td class="right">${i.qty}</td><td class="right num">${money(i.price)}</td><td class="right num"><b>${money(i.unit_cost)}</b></td></tr>`).join('')}</table></div>
          <div class="sum-rows num" style="margin-top:10px"><span>${t('Mollar')}</span><span class="right">${money(p.goods_total)}</span><span>${t("Yo'lkira")}</span><span class="right">${money(p.freight)}</span>
            <span>${t("To'langan")}</span><span class="right">${money(p.paid)}</span></div>`,
        actions: [{ label: t('Yopish') }],
      });
      bindTips(document.getElementById('modal-root'));
    });
  },
};

// ---------- Debts on both sides ----------
Views.debts = {
  title: () => t('Qarzlar'), icon: () => 'notebook-pen', roles: ['owner', 'admin', 'cashier'], on: () => isShop(), refreshOn: ['finance', 'jobs'],
  async load() { return GET('/api/debts'); },
  render(d) {
    return `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Qarzlar')}</h1></div>
      <div class="kpis two">${kpi(t('Bizga qarz'), money(d.owed_to_us), t('mijozlar'), d.owed_to_us ? 'warn' : 'good', 'hand-coins')}
        ${kpi(t('Biz qarzmiz'), money(d.we_owe), t('yetkazib beruvchi va ustalarga'), d.we_owe ? 'bad' : 'good', 'notebook-pen')}</div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>🟢 ${t('Bizga qarz')}</h2></div>
          ${moduleOn('debts') ? (d.customers.length ? d.customers.map((c) => `<div class="debt-line"><div class="grow"><b>${esc(c.name)}</b><div class="small muted">${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}</div></div>
            <b class="num">${money(c.debt)}</b><button class="btn sm ok" data-cpay="${c.id}">${icon('banknote', 16)} ${t('Olish')}</button></div>`).join('') : `<p class="muted">${t("Qarzdor mijoz yo'q")}</p>`)
            : `<p class="muted">${t('Qarz daftari tarifingizda yoqilmagan')}</p>`}</div>
        <div class="card"><div class="card-head"><h2>🔴 ${t('Biz qarzmiz')}</h2></div>
          ${d.suppliers.map((s) => `<div class="debt-line"><div class="grow"><b>${esc(s.name)}</b><div class="small muted">${t('yetkazib beruvchi')}</div></div><b class="num">${money(s.debt)}</b>
            <button class="btn sm" data-spay="${s.id}">${icon('banknote', 16)} ${t("To'lash")}</button></div>`).join('')}
          ${d.masters.map((m) => `<div class="debt-line"><div class="grow"><b>${esc(m.name)}</b><div class="small muted">${t('usta')}</div></div><b class="num">${money(m.owed)}</b>
            <button class="btn sm" data-mpay="${m.id}">${icon('banknote', 16)} ${t("To'lash")}</button></div>`).join('')}
          ${!d.suppliers.length && !d.masters.length ? `<p class="muted">${t("Hech kimga qarz emasmiz")}</p>` : ''}</div>
      </div>`;
  },
  bind(root, d) {
    root.querySelectorAll('[data-cpay]').forEach((b) => b.onclick = () => debtPayment(d.customers.find((c) => c.id === Number(b.dataset.cpay))));
    root.querySelectorAll('[data-spay]').forEach((b) => b.onclick = () => { const s = d.suppliers.find((x) => x.id === Number(b.dataset.spay)); payDialog({ title: `${esc(s.name)} — ${t("qarzni to'lash")}`, max: s.debt, url: `/api/suppliers/${s.id}/pay` }); });
    root.querySelectorAll('[data-mpay]').forEach((b) => b.onclick = () => payMasterDialog(d.masters.find((x) => x.id === Number(b.dataset.mpay))));
  },
};

// ---------- Installers and jobs ----------
UI.jobs = UI.jobs || { tab: 'planned' };
Views.masters = {
  title: () => t('Ustalar va ishlar'), icon: () => 'hammer', roles: ['owner', 'admin', 'cashier'], on: () => isDoors(), refreshOn: ['jobs', 'finance'],
  async load() {
    const [masters, jobs] = await Promise.all([GET('/api/masters'), GET(`/api/jobs?${UI.jobs.tab === 'unpaid' ? 'unpaid=1' : `status=${UI.jobs.tab}`}`)]);
    return { masters, jobs };
  },
  render({ masters, jobs }) {
    const st = { planned: t('Rejada'), done: t('Bajarildi'), cancelled: t('Bekor') };
    return `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Ustalar va ishlar')}</h1><span class="grow"></span>
        <button class="btn" id="job-add">${icon('ruler', 18)} ${t("O'lchovga yozish")}</button>
        ${can('owner', 'admin') ? `<button class="btn primary" id="m-add">${icon('plus', 18)} ${t('Usta')}</button>` : ''}</div>
      <div class="card">${masters.length ? `<div class="table-wrap"><table><tr><th>${t('Usta / haydovchi')}</th><th class="right">${t('Rejada')}</th><th class="right">${t('Shu oy bajardi')}</th><th class="right">${t("To'lanmagan")}</th><th></th></tr>
        ${masters.map((m) => `<tr><td><b>${esc(m.name)}</b>${m.phone ? `<br><a class="small" href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : ''}</td><td class="right">${m.planned}</td><td class="right">${m.done_month}</td>
          <td class="right num">${m.owed ? `<b class="red">${money(m.owed)}</b>` : '—'}</td>
          <td class="actions">${m.owed ? `<button class="btn sm ok" data-mpay="${m.id}">${icon('banknote', 16)} ${t("To'lash")}</button>` : ''}${can('owner', 'admin') ? `<button class="icon-btn" data-medit="${m.id}">${icon('pencil', 16)}</button>` : ''}</td></tr>`).join('')}</table></div>`
        : emptyState('hammer', t("Ustalarni qo'shing — sotuvda o'rnatishni ularga biriktirasiz, kimga qancha berish kerakligi shu yerda ko'rinadi."))}</div>
      <div class="seg" style="margin:16px 0 12px">${[['planned', t('Rejada')], ['done', t('Bajarilgan')], ['unpaid', t("To'lanmagan")], ['cancelled', t('Bekor')]].map(([k, n]) => `<button class="${UI.jobs.tab === k ? 'active' : ''}" data-jtab="${k}">${n}</button>`).join('')}</div>
      <div class="card">${jobs.length ? jobs.map((j) => `<div class="job-line">${icon(JOB_ICONS[j.kind], 20)}<div class="grow">
          <b>${JOB_NAMES()[j.kind]}</b> — ${esc(j.customer_name || '—')} ${j.order_id ? `<span class="small muted">#${j.order_id}</span>` : ''}
          <div class="small muted">${j.scheduled_at ? `${icon('calendar', 12)} ${fmtDate(j.scheduled_at)} ${fmtTime(j.scheduled_at)} · ` : ''}${j.address ? `${icon('map-pin', 12)} ${esc(j.address)} · ` : ''}${j.phone ? `<a href="tel:${esc(j.phone)}">${esc(j.phone)}</a> · ` : ''}${esc(j.master_name || t('usta tanlanmagan'))}${j.cost ? ` · ${t('ustaga')} ${money(j.cost)}` : ''}${j.paid_at ? ` · ${t("to'langan")}` : ''}</div></div>
          <span class="chip ${j.status === 'done' ? 'green' : j.status === 'cancelled' ? '' : 'orange'}">${st[j.status]}</span>
          ${j.status === 'planned' ? `<button class="btn sm ok" data-jdone="${j.id}">${icon('check', 16)}</button>` : ''}
          ${!j.paid_at && can('owner', 'admin', 'cashier') ? `<button class="icon-btn" data-jedit="${j.id}">${icon('pencil', 16)}</button>` : ''}</div>`).join('')
        : emptyState('truck', t("Bu yerda hozircha ish yo'q"))}</div>`;
  },
  bind(root, { masters, jobs }) {
    root.querySelectorAll('[data-jtab]').forEach((b) => b.onclick = () => { UI.jobs.tab = b.dataset.jtab; refreshView(); });
    const ma = root.querySelector('#m-add'); if (ma) ma.onclick = () => masterForm();
    root.querySelector('#job-add').onclick = () => jobForm(null, masters);
    root.querySelectorAll('[data-medit]').forEach((b) => b.onclick = () => masterForm(masters.find((m) => m.id === Number(b.dataset.medit))));
    root.querySelectorAll('[data-mpay]').forEach((b) => b.onclick = () => payMasterDialog(masters.find((m) => m.id === Number(b.dataset.mpay))));
    root.querySelectorAll('[data-jedit]').forEach((b) => b.onclick = () => jobForm(jobs.find((j) => j.id === Number(b.dataset.jedit)), masters));
    root.querySelectorAll('[data-jdone]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try { await POST(`/api/jobs/${b.dataset.jdone}/done`); toast(t('Bajarildi'), 'ok'); refreshView(); } catch (e) { b.disabled = false; toastError(e); }
    });
  },
};
function masterForm(m = null) {
  openModal({
    title: `${icon('hammer')} ${m ? esc(m.name) : t('Yangi usta / haydovchi')}`,
    body: `<div class="form-grid"><label class="field">${t('Ism')}<input name="name" required value="${esc(m ? m.name : '')}"></label>
      <label class="field">${t('Telefon')}<input name="phone" type="tel" value="${esc(m ? m.phone : '+998 ')}"></label></div>`,
    actions: [...(m ? [{ label: t("O'chirish"), cls: 'danger', onClick: async () => { await DEL(`/api/masters/${m.id}`); refreshView(); } }] : []), { label: t('Bekor') },
      { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
        const d = formData(f);
        if (d.phone.trim() === '+998') d.phone = '';
        await (m ? PUT(`/api/masters/${m.id}`, d) : POST('/api/masters', d));
        toast(t('Saqlandi'), 'ok'); refreshView();
      } }],
  });
}
function jobForm(j = null, masters = []) {
  const v = j || { kind: 'measure', scheduled_at: Date.now() + 864e5 };
  openModal({
    title: `${icon(JOB_ICONS[v.kind])} ${j ? JOB_NAMES()[v.kind] : t("O'lchovga yozish")}`,
    body: `<div class="form-grid">
        <label class="field">${t('Mijoz')}<input name="customer_name" value="${esc(v.customer_name || '')}"></label>
        <label class="field">${t('Telefon')}<input name="phone" type="tel" value="${esc(v.phone || '')}" placeholder="+998"></label>
        <label class="field">${t('Sana')}<input type="date" name="date" value="${v.scheduled_at ? isoDay(v.scheduled_at) : ''}"></label>
        <label class="field">${t('Soat')}<input type="time" name="time" value="${v.scheduled_at && (new Date(v.scheduled_at).getHours() || new Date(v.scheduled_at).getMinutes()) ? fmtTime(v.scheduled_at) : ''}"></label>
        <label class="field">${t('Usta')}<select name="master_id"><option value="">—</option>${masters.map((m) => `<option value="${m.id}" ${v.master_id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
        <label class="field">${t('Ustaga beriladi')}<input type="number" name="cost" min="0" value="${v.cost || ''}"></label></div>
      <label class="field" style="margin-top:12px">${t('Manzil')}<input name="address" value="${esc(v.address || '')}"></label>
      <label class="field" style="margin-top:12px">${t('Izoh')}<input name="note" value="${esc(v.note || '')}"></label>`,
    actions: [...(j && j.status === 'planned' ? [{ label: t('Bekor qilish'), cls: 'danger', onClick: async () => { await POST(`/api/jobs/${j.id}/cancel`); refreshView(); } }] : []),
      ...(j && j.status !== 'planned' ? [{ label: t('Qayta rejaga'), onClick: async () => { await POST(`/api/jobs/${j.id}/reopen`); refreshView(); } }] : []),
      { label: t('Yopish') },
      { label: t('Saqlash'), cls: 'primary', onClick: async (f) => {
        const d = formData(f);
        d.at = tsOf(d.date, d.time);
        await (j ? PUT(`/api/jobs/${j.id}`, d) : POST('/api/jobs', { ...d, kind: 'measure' }));
        toast(t('Saqlandi'), 'ok'); refreshView(); refreshBadges();
      } }],
  });
}
function payMasterDialog(m) {
  openModal({
    title: `${icon('banknote')} ${esc(m.name)} — ${t("to'lash")}`,
    body: `<p class="lead" style="margin-top:0">${t("Bajarilgan ishlar uchun")}: <b>${money(m.owed)}</b></p>
      <label class="field">${t("To'lov turi")}<select name="method">${['cash', 'card', 'transfer'].map((x) => `<option value="${x}">${methodName(x)}</option>`).join('')}</select></label>`,
    actions: [{ label: t('Bekor') }, { label: t("To'lash"), cls: 'ok', icon: 'check', onClick: async (f) => {
      const r = await POST(`/api/masters/${m.id}/pay`, { method: f.method.value });
      toast(t("To'landi: {0} ({1} ta ish)", moneyText(r.amount), r.jobs), 'ok'); refreshView();
    } }],
  });
}

// ---------- Settings: the owner's Telegram ----------
async function telegramSettingsHtml() {
  const s = await GET('/api/telegram');
  return { s, html: `<div class="card" style="max-width:640px">
      <h3 style="margin-top:0">${icon('send', 18)} ${t('Telegram eslatmalar')}</h3>
      <p class="muted">${t('Har kuni kechqurun kunlik hisobot keladi: savdo, xarajat, eng ko\'p sotilgan taomlar, ochiq cheklar.')}
        ${isDoors() ? t("Ertalab soat 8 da bugungi ishlaringiz keladi, vaqti belgilangan ishdan 1 soat oldin ham eslatadi.") : t("To'lov kuni kelgan doimiy xarajatlar (ijara, svet…) haqida ertalab eslatadi.")}</p>
      ${!s.bot_ready ? `<div class="notice">${icon('info', 18)} ${t('Hozircha mavjud emas — FLOWI yordamiga yozing.')}</div>`
        : s.linked ? `<p>${icon('circle-check', 18)} <b>${t('Ulangan')}</b>${s.chat_title ? `: ${esc(s.chat_title)}` : ''}</p>
          <div class="form-grid" style="margin:12px 0"><label class="field">${t('Kunlik hisobot vaqti')}<select id="tg-time">
            ${['', '20:00', '21:00', '22:00', '22:30', '23:00', '23:30'].map((x) => `<option value="${x}" ${(s.report_time ?? '23:00') === x ? 'selected' : ''}>${x || t("Yubormaslik")}</option>`).join('')}</select></label></div>
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="tg-report">${icon('chart-column', 16)} ${t('Hisobotni hozir yuborish')}</button>
            <button class="btn" id="tg-test">${icon('send', 16)} ${t('Sinov xabari')}</button><button class="btn danger" id="tg-off">${icon('x', 16)} ${t('Uzish')}</button></div>`
        : s.link_code ? `<a class="btn primary" href="https://t.me/${esc(s.bot)}?start=${esc(s.link_code)}" target="_blank" rel="noopener">${icon('send', 18)} ${t('Telegramni ochish va ulash')}</a>
          <p class="small muted">${t('Telegram ochilgach "Start" ni bosing. Ishlamasa, botga shu xabarni yozing')}: <b>/start ${esc(s.link_code)}</b></p>
          <button class="btn sm" id="tg-check">${icon('refresh-cw', 16)} ${t('Ulandimi? Tekshirish')}</button>`
        : `<button class="btn primary" id="tg-link">${icon('send', 18)} ${t('Telegramni ulash')}</button>`}</div>` };
}
function bindTelegramSettings(root) {
  const a = (id, fn) => { const b = root.querySelector(id); if (b) b.onclick = async () => { try { await fn(); } catch (e) { toastError(e); } }; };
  a('#tg-link', async () => { await POST('/api/telegram/link'); refreshView(); });
  a('#tg-check', async () => { refreshView(); });
  a('#tg-test', async () => { await POST('/api/telegram/test'); toast(t('Yuborildi — Telegramni tekshiring'), 'ok'); });
  a('#tg-off', async () => { await DEL('/api/telegram'); refreshView(); });
  a('#tg-report', async () => { await POST('/api/telegram/report'); toast(t('Yuborildi — Telegramni tekshiring'), 'ok'); });
  const tm = root.querySelector('#tg-time');
  if (tm) tm.onchange = async () => { try { await PUT('/api/telegram/report', { time: tm.value }); toast(t('Saqlandi'), 'ok'); } catch (e) { toastError(e); } };
}

// ---------- Barcode labels ----------
// EAN-13 drawn as SVG (the code every scanner reads); any other code is printed as text only.
const EAN = {
  L: ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'],
  G: ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'],
  R: ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'],
  P: ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'],
};
function ean13Valid(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const d = [...code].map(Number);
  return (10 - (d.slice(0, 12).reduce((s, x, i) => s + x * (i % 2 ? 3 : 1), 0) % 10)) % 10 === d[12];
}
function ean13Svg(code) {
  if (!ean13Valid(code)) return '';
  const d = [...code].map(Number);
  const par = EAN.P[d[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += EAN[par[i - 1]][d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += EAN.R[d[i]];
  bits += '101';
  // Guard bars run longer, the way scanners and people expect.
  const guard = (i) => i < 3 || (i >= 45 && i < 50) || i >= 92;
  let rects = '';
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') rects += `<rect x="${i + 9}" y="0" width="1" height="${guard(i) ? 56 : 50}"/>`;
  // The digits are written under the bars as text of their own (an SVG stretched to the label would stretch them).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 113 56" preserveAspectRatio="none">${rects}</svg>`;
}
const LABEL_FORMATS = () => ({
  t58: { name: t('Termo yorliq 58×40 mm'), page: '58mm 40mm', w: '58mm', h: '40mm', grid: false },
  t40: { name: t('Termo yorliq 40×30 mm'), page: '40mm 30mm', w: '40mm', h: '30mm', grid: false, small: true },
  a4: { name: t('A4 varaq — 24 ta (70×37 mm)'), page: 'A4', w: '70mm', h: '37.1mm', grid: true },
});
// Choose goods and how many labels of each; goods with no code get one first.
async function labelsDialog(preset = null) {
  let menu;
  try { menu = await GET('/api/menu'); } catch (e) { return toastError(e); }
  const goods = menu.dishes;
  const want = new Map(preset ? preset.map((p) => [p.id, p.qty]) : []);
  const fmt = store('cp_label_fmt') || 't58';
  const form = openModal({
    title: `${icon('scan-barcode')} ${t('Shtrix-kod yorliqlari')}`, size: 'wide',
    body: `<div class="form-grid"><label class="field">${t("Yorliq o'lchami")}<select name="fmt">${Object.entries(LABEL_FORMATS()).map(([k, f]) => `<option value="${k}" ${fmt === k ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label>
        <label class="field">${t('Qidirish')}<input type="search" name="q" placeholder="${esc(t("Nomi, o'lcham, rang"))}"></label></div>
      <label class="check" style="margin:8px 0"><input type="checkbox" name="price" checked> ${t("Narxni ham chiqarish")}</label>
      <div class="row" style="gap:8px;margin-bottom:8px"><button type="button" class="btn sm" id="lb-stock">${t("Har biridan omborda qancha bo'lsa")}</button>
        <button type="button" class="btn sm" id="lb-none">${t('Hammasini olib tashlash')}</button></div>
      <div class="table-wrap" style="max-height:340px"><table class="lb-table"><tr><th>${t('Mol')}</th><th>${t('Shtrix-kod')}</th><th class="right">${t('Yorliq soni')}</th></tr>
        ${goods.map((d) => `<tr data-row="${d.id}" data-text="${esc(`${d.name} ${variantOf(d)} ${d.barcode || ''}`.toLowerCase())}"><td><b>${esc(d.name)}</b><br><span class="small muted">${esc(variantOf(d))}</span></td>
          <td class="small">${d.barcode ? esc(d.barcode) : `<span class="muted">${t("yo'q — yaratiladi")}</span>`}</td>
          <td class="right"><input type="number" min="0" max="500" data-qty="${d.id}" value="${want.get(d.id) || 0}" style="width:80px"></td></tr>`).join('')}</table></div>
      <p class="small muted" id="lb-sum"></p>`,
    actions: [{ label: t('Bekor') }, { label: t('Chop etish'), cls: 'primary', icon: 'printer', onClick: async (f) => {
      const picked = [...f.querySelectorAll('[data-qty]')].map((i) => ({ id: Number(i.dataset.qty), qty: Math.min(500, Number(i.value) || 0) })).filter((x) => x.qty > 0);
      if (!picked.length) { toast(t('Yorliq sonini kiriting'), 'warn'); return false; }
      store('cp_label_fmt', f.fmt.value);
      const codes = new Map((await POST('/api/barcodes', { ids: picked.map((x) => x.id) })).map((x) => [x.id, x.barcode]));
      const list = picked.flatMap((p) => { const d = goods.find((x) => x.id === p.id); return Array(p.qty).fill({ ...d, barcode: codes.get(d.id) || d.barcode }); });
      printLabels(list, f.fmt.value, f.price.checked);
      refreshView();
    } }],
  });
  const sum = () => { const n = [...form.querySelectorAll('[data-qty]')].reduce((s, i) => s + (Number(i.value) || 0), 0); form.querySelector('#lb-sum').textContent = t('Jami: {0} ta yorliq', n); };
  form.q.oninput = () => { const v = form.q.value.toLowerCase(); form.querySelectorAll('[data-row]').forEach((r) => { r.style.display = !v || r.dataset.text.includes(v) ? '' : 'none'; }); };
  form.querySelector('#lb-stock').onclick = () => { form.querySelectorAll('[data-qty]').forEach((i) => { const d = goods.find((x) => x.id === Number(i.dataset.qty)); i.value = Math.max(0, Math.min(500, d.stock || 0)); }); sum(); };
  form.querySelector('#lb-none').onclick = () => { form.querySelectorAll('[data-qty]').forEach((i) => { i.value = 0; }); sum(); };
  form.addEventListener('input', sum);
  sum();
}
function printLabels(list, fmtKey, withPrice) {
  const f = LABEL_FORMATS()[fmtKey] || LABEL_FORMATS().t58;
  const w = window.open('', '_blank');
  if (!w) return toast(t("Brauzer yangi oynani to'sib qo'ydi — ruxsat bering"), 'warn');
  const shop = App.settings.name || '';
  const label = (d) => `<div class="l">
      <div class="s">${esc(shop)}</div><div class="n">${esc(d.name)}</div>${variantOf(d) ? `<div class="v">${esc(variantOf(d))}</div>` : ''}
      ${withPrice ? `<div class="p">${num(d.price)} <small>${esc(App.settings.currency || "so'm")}</small></div>` : ''}
      <div class="b">${ean13Svg(d.barcode)}</div><div class="code">${esc(d.barcode || '')}</div></div>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('Yorliqlar'))}</title><style>
    @page { size: ${f.page}; margin: 0; } * { box-sizing: border-box; } body { margin: 0; font-family: Arial, sans-serif; color: #000; }
    .wrap { ${f.grid ? 'display: grid; grid-template-columns: repeat(3, 70mm); grid-auto-rows: 37.1mm; width: 210mm;' : ''} }
    .l { width: ${f.w}; height: ${f.h}; padding: ${f.small ? '1.2mm 1.5mm' : '2mm 2.5mm'}; display: flex; flex-direction: column; overflow: hidden; ${f.grid ? 'break-inside: avoid;' : 'page-break-after: always;'} }
    .s { font-size: ${f.small ? 5.5 : 6.5}pt; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .n { font-size: ${f.small ? 7.5 : 9}pt; font-weight: 700; line-height: 1.15; max-height: 2.3em; overflow: hidden; }
    .v { font-size: ${f.small ? 6.5 : 7.5}pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .p { font-size: ${f.small ? 10 : 13}pt; font-weight: 800; margin-top: .3mm; } .p small { font-size: 60%; font-weight: 600; }
    .b { margin-top: auto; height: ${f.small ? 8 : 11}mm; padding: 0 2mm; } .b svg { width: 100%; height: 100%; display: block; }
    .code { font-size: ${f.small ? 6.5 : 8}pt; letter-spacing: 1.5px; text-align: center; line-height: 1.2; }
  </style></head><body><div class="wrap">${list.map(label).join('')}</div><script>window.onload = () => setTimeout(() => window.print(), 300);<\/script></body></html>`);
  w.document.close();
}
