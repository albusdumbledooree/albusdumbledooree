'use strict';
/*
 * The month's full picture for the boss:
 * - "Doimiy xarajatlar": rent, electricity, tax, advertising… with the day they are due; "To'landi" writes them to the cash book;
 * - "Sof foyda": sales − products − pay (as earned) − fixed and other costs, by groups, with what is still unpaid;
 * - quick "+ Kirim / − Chiqim" on the main screen.
 */
UI.fixMonth = UI.fixMonth || localDay().slice(0, 7);
UI.pnlMonth = UI.pnlMonth || localDay().slice(0, 7);
const FIXED_TEMPLATES = () => [
  [t('Ijara'), 'Ijara', 1, false], [t('Svet'), 'Svet', 10, true], [t('Gaz'), 'Gaz', 10, true], [t('Suv'), 'Suv', 10, true],
  [t('Soliq'), 'Soliq', 15, false], [t('Internet'), 'Svet', 5, false], [t('Reklama'), 'Reklama', 1, false], [t("Qo'riqlash"), 'Boshqa', 1, false],
  [t('Chiqindi'), 'Boshqa', 1, false],
];
const monthNav = (m, key) => `<button class="icon-btn" data-mon="-1" data-key="${key}">${icon('chevron-left')}</button><b>${monthTitle(m)}</b>
  <button class="icon-btn" data-mon="1" data-key="${key}" ${m >= localDay().slice(0, 7) ? 'disabled' : ''}>${icon('chevron-right')}</button>`;
function bindMonthNav(root) {
  root.querySelectorAll('[data-mon]').forEach((b) => b.onclick = () => { UI[b.dataset.key] = shiftMonth(UI[b.dataset.key], Number(b.dataset.mon)); refreshView(); });
}

// ---------- Fixed monthly costs ----------
function fixedForm(fc = {}, cats = App.settings.expense_categories) {
  const list = [...new Set([...(fc.category ? [fc.category] : []), ...cats])];
  openModal({
    title: `${icon('repeat')} ${fc.id ? esc(fc.name) : t('Doimiy xarajat')}`,
    body: `<div class="form-grid">
        <label class="field">${t('Nomi')}<input name="name" value="${esc(fc.name || '')}" placeholder="${esc(t('Masalan: Ijara'))}" required></label>
        <label class="field">${t('Kategoriya')}<select name="category">${list.map((c) => `<option ${c === fc.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="field">${t('Har oy summasi')}<input type="number" name="amount" min="0" step="1000" value="${fc.amount ?? ''}"></label>
        <label class="field">${t("Har oyning nechanchi kuni to'lanadi")}<input type="number" name="due_day" min="1" max="31" value="${fc.due_day || 1}"></label></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" name="variable" ${fc.variable ? 'checked' : ''}> ${t("Summasi har oy o'zgaradi (svet, gaz, suv) — to'lashda to'g'rilanadi")}</label>`,
    actions: [{ label: t('Bekor') }, { label: t('Saqlash'), cls: 'primary', icon: 'check', onClick: async (f) => {
      const d = formData(f);
      if (fc.id) await PUT(`/api/fixed-costs/${fc.id}`, d); else await POST('/api/fixed-costs', d);
      toast(t('Saqlandi'), 'ok'); refreshView();
    } }],
  });
}
function fixedPayDialog(x) {
  openModal({
    title: `${icon('banknote')} ${esc(x.name)} — ${monthTitle(x.month)}`,
    body: `<div class="form-grid"><label class="field">${t('Summa')}<input type="number" name="amount" min="1" value="${x.amount || ''}" required></label>
        <label class="field">${t("To'lov turi")}<select name="method">${['cash', 'card', 'transfer'].map((m) => `<option value="${m}">${methodName(m)}</option>`).join('')}</select></label></div>
      <p class="small muted" style="margin-top:10px">${t('Kassaga "{0}" xarajati bo\'lib yoziladi.', esc(x.category))}${x.variable ? ` ${t("Shu summa keyingi oy uchun ham taxminiy bo'ladi.")}` : ''}</p>`,
    actions: [{ label: t('Bekor') }, { label: t("To'landi"), cls: 'ok', icon: 'check', onClick: async (f) => {
      const d = formData(f);
      if (!d.amount) { toast(t('Summani kiriting'), 'warn'); return false; }
      await POST(`/api/fixed-costs/${x.id}/pay`, { amount: Number(d.amount), method: d.method, month: x.month });
      toast(t('Saqlandi'), 'ok'); refreshView(); refreshBadges();
    } }],
  });
}
Views.fixed = {
  title: () => t('Doimiy xarajatlar'), icon: () => 'repeat', roles: ['owner', 'admin', 'cashier'], module: 'finance', refreshOn: ['finance'],
  on: () => !!App.money.finance,
  async load() { return GET(`/api/fixed-costs?month=${UI.fixMonth}`); },
  render(d) {
    const tt = d.totals;
    const edit = can('owner', 'admin');
    const status = (x) => (x.paid ? `<span class="chip green">${icon('check', 14)} ${t("To'langan")} ${fmtDate(x.paid.created_at)}${x.paid.amount !== x.amount ? ` · ${num(x.paid.amount)}` : ''}</span>`
      : x.overdue ? `<span class="chip red">${t("Muddati o'tdi")} · ${fmtDate(x.due_at)}</span>` : x.due_today ? `<span class="chip orange">${t('Bugun')}</span>`
        : `<span class="chip">${fmtDate(x.due_at)}</span>`);
    return `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Doimiy xarajatlar')}</h1>${monthNav(d.month, 'fixMonth')}
        ${edit ? `<button class="btn primary" id="fx-add">${icon('plus', 18)} ${t("Qo'shish")}</button>` : ''}</div>
      <div class="kpis">${kpi(t('Bu oy jami'), money(tt.planned), '', '', 'repeat')}${kpi(t("To'langan"), money(tt.paid), '', 'good', 'check')}
        ${kpi(t("To'lanmagan"), money(tt.unpaid), '', tt.unpaid ? 'warn' : 'good', 'triangle-alert')}</div>
      ${d.items.length ? `<div class="card fx-list">${d.items.map((x) => `<div class="fx-row">
          <div class="fx-name"><b>${esc(x.name)}</b><span class="small muted">${esc(x.category)} · ${t('har oy {0}-kuni', x.due_day)}${x.variable ? ` · ${t("o'zgaruvchan")}` : ''}</span></div>
          <b class="num fx-sum">${money(x.paid ? x.paid.amount : x.amount)}</b>
          <div class="fx-st">${status(x)}</div>
          <div class="actions fx-act">${x.paid ? '' : `<button class="btn sm ok" data-fx-pay="${x.id}">${icon('banknote', 16)} ${t("To'landi")}</button>`}
            ${edit ? `<button class="icon-btn" data-fx-edit="${x.id}" title="${esc(t('Tahrirlash'))}">${icon('pencil', 18)}</button>
            <button class="icon-btn danger" data-fx-del="${x.id}" title="${esc(t("O'chirish"))}">${icon('trash-2', 18)}</button>` : ''}</div></div>`).join('')}
      </div>` : `<div class="card">${emptyState('repeat', t("Ijara, svet, gaz, soliq, reklama kabi har oy takrorlanadigan xarajatlarni qo'shing — to'lov kuni eslatiladi va sof foydaga o'zi kiradi."))}</div>`}
      ${edit ? `<div class="card"><h3 style="margin:0 0 10px">${t("Tez qo'shish")}</h3><div class="row" style="gap:8px;flex-wrap:wrap">
        ${FIXED_TEMPLATES().map(([n], i) => (d.items.some((x) => x.name === n) ? '' : `<button class="btn sm" data-tpl="${i}">${icon('plus', 14)} ${esc(n)}</button>`)).join('')}</div></div>` : ''}
      <p class="small muted">${icon('info', 14)} ${t("To'lov kuni kelganda kassa ekranida va Telegramda eslatma chiqadi. \"To'landi\" bosilsa, kassaga xarajat bo'lib yoziladi.")}</p>`;
  },
  bind(root, d) {
    bindMonthNav(root);
    const byId = (id) => d.items.find((x) => x.id === Number(id));
    const add = root.querySelector('#fx-add'); if (add) add.onclick = () => fixedForm({}, d.categories);
    root.querySelectorAll('[data-tpl]').forEach((b) => b.onclick = () => {
      const [name, category, due_day, variable] = FIXED_TEMPLATES()[Number(b.dataset.tpl)];
      fixedForm({ name, category: d.categories.includes(category) ? category : d.categories[0], due_day, variable }, d.categories);
    });
    root.querySelectorAll('[data-fx-pay]').forEach((b) => b.onclick = () => fixedPayDialog(byId(b.dataset.fxPay)));
    root.querySelectorAll('[data-fx-edit]').forEach((b) => b.onclick = () => fixedForm(byId(b.dataset.fxEdit), d.categories));
    root.querySelectorAll('[data-fx-del]').forEach((b) => b.onclick = async () => {
      const x = byId(b.dataset.fxDel);
      if (!(await confirmModal(t("O'chirish"), t('"{0}" ro\'yxatdan olib tashlansinmi? Oldingi to\'lovlar kassada qoladi.', esc(x.name)), t("O'chirish")))) return;
      try { await DEL(`/api/fixed-costs/${x.id}`); refreshView(); } catch (e) { toastError(e); }
    });
  },
};

// ---------- Profit and loss of a month ----------
Views.pnl = {
  title: () => t('Sof foyda'), icon: () => 'trending-up', roles: ['owner'], module: 'pnl', refreshOn: ['finance', 'payroll'],
  async load() { return GET(`/api/pnl?month=${UI.pnlMonth}`); },
  render(d) {
    const pct = (v) => (d.revenue > 0 ? `${Math.round((v / d.revenue) * 100)}%` : '');
    const diff = d.net - d.prev.net;
    const unpaidFixed = d.unpaid.fixed.reduce((s, x) => s + x.amount, 0);
    const row = (g) => `<details class="pnl-row"><summary><span class="grow">${esc(t(g.name))}${g.unpaid ? ` <span class="chip orange">${t("to'lanmagan")} ${num(g.unpaid)}</span>` : ''}</span>
        <span class="pnl-bar"><i style="width:${d.revenue > 0 ? Math.min(100, Math.round((g.amount / d.revenue) * 100)) : 0}%"></i></span>
        <span class="small muted pnl-pct">${pct(g.amount)}</span><b class="num pnl-sum">−${num(g.amount)}</b></summary>
      <div class="pnl-items">${g.items.map((x) => `<div><span>${esc(t(x.label))}</span><span class="num">${num(x.amount)}</span></div>`).join('')}</div></details>`;
    return `<div class="page-head"><a class="btn sm" href="#/money">${icon('arrow-left', 16)}</a><h1>${t('Sof foyda')}</h1>${monthNav(d.month, 'pnlMonth')}
        <button class="btn" id="pnl-csv">${icon('download', 18)} Excel</button></div>
      ${d.partial ? `<div class="notice blue slim">${icon('info', 16)} ${t("Oy hali tugamagan: bugungacha bo'lgan raqamlar. Ish haqi bugungacha hisoblangan, doimiy xarajatlar to'lov kuni kelganlari kiritilgan.")}</div>` : ''}
      <div class="card pnl">
        <div class="pnl-line big"><span>${t('Savdo')}</span><b class="num">${money(d.revenue)}</b></div>
        <div class="small muted" style="margin:-4px 0 10px">${t('{0} ta chek', d.sales)}${d.refunds ? ` · ${t('qaytarilgan')} ${num(d.refunds)}` : ''}</div>
        ${d.other_income ? `<div class="pnl-line"><span>${t('Boshqa kirim')}</span><b class="num">+${num(d.other_income)}</b></div>` : ''}
        ${d.groups.map(row).join('')}
        <div class="pnl-line total ${d.net >= 0 ? 'good' : 'bad'}"><span>${t('SOF FOYDA')}</span><b class="num">${money(d.net)}</b><span class="small muted">${pct(d.net)}</span></div>
        <div class="small muted" style="margin-top:8px">${t("O'tgan oy ({0})", monthTitle(d.prev.month))}: <b>${money(d.prev.net)}</b>
          ${d.prev.net || d.net ? ` <span class="chip ${diff >= 0 ? 'green' : 'red'}">${diff >= 0 ? '↑' : '↓'} ${num(Math.abs(diff))}</span>` : ''}</div>
      </div>
      ${d.unpaid.pay || unpaidFixed ? `<div class="card pnl"><h3 style="margin:0 0 8px">${icon('triangle-alert', 18)} ${t("Hali to'lanmagan")}</h3>
        ${d.unpaid.pay ? `<div class="pnl-line"><a href="#/payroll">${t('Xodimlarga oylik qoldig\'i')}</a><b class="num">${money(d.unpaid.pay)}</b></div>` : ''}
        ${d.unpaid.fixed.map((x) => `<div class="pnl-line"><a href="#/fixed">${esc(x.name)} <span class="small muted">· ${fmtDate(x.due_at)}</span></a><b class="num">${money(x.amount)}</b></div>`).join('')}</div>` : ''}
      <p class="small muted">${icon('info', 14)} ${d.pay_module ? t("Ish haqi berilgani emas, hisoblangani bo'yicha olinadi (maosh, kunlik, soatbay, foiz, bonus − jarima). Shuning uchun maoshni faqat Ish haqi bo'limidan bering, Kirim-chiqimga qo'lda \"Ish haqi\" yozmang.")
        : t("Ish haqi kassadan berilgani bo'yicha olinadi. Hisoblangan ish haqi uchun Biznes tarifidagi Ish haqi bo'limi kerak.")}
        ${t("Xarajat guruhlarini Sozlamalar → Muassasa → Xarajat kategoriyalari'da o'zgartirish mumkin.")}</p>`;
  },
  bind(root, d) {
    bindMonthNav(root);
    root.querySelector('#pnl-csv').onclick = () => {
      const rows = [[t('Sof foyda'), monthTitle(d.month)], [t('Savdo'), d.revenue], [t('Boshqa kirim'), d.other_income]];
      for (const g of d.groups) { rows.push([t(g.name), -g.amount]); for (const x of g.items) rows.push([`   ${t(x.label)}`, -x.amount]); }
      rows.push([t('SOF FOYDA'), d.net], [t("O'tgan oy"), d.prev.net]);
      downloadCsv(`sof-foyda-${d.month}.csv`, rows);
    };
  },
};

// ---------- On the main screen: quick income / cost and costs due ----------
function quickMoneyHtml() {
  if (!viewOn('finance')) return '';
  return `<button class="btn q-money" id="q-in" title="${esc(t('Kirim'))}">${icon('plus', 18)}<span> ${t('Kirim')}</span></button>
    <button class="btn warn q-money" id="q-out" title="${esc(t('Chiqim'))}">${icon('minus', 18)}<span> ${t('Chiqim')}</span></button>`;
}
function bindQuickMoney(root) {
  const i = root.querySelector('#q-in'); if (i) i.onclick = () => openTransaction('income');
  const o = root.querySelector('#q-out'); if (o) o.onclick = () => openTransaction('expense');
}
// Fixed costs due today or overdue: a line on the main screen for whoever handles money.
async function fixedDueNotice(el) {
  if (!el || !viewOn('fixed')) return;
  try {
    const d = await GET(`/api/fixed-costs?month=${localDay().slice(0, 7)}`);
    const due = d.items.filter((x) => x.due_today || x.overdue);
    el.innerHTML = due.length ? `<a class="notice slim" href="#/fixed">${icon('banknote', 18)} <span>${t("To'lov kuni keldi")}: ${due.map((x) => `<b>${esc(x.name)}</b> ${num(x.amount)}`).join(', ')}</span></a>` : '';
  } catch { /* not shown */ }
}
