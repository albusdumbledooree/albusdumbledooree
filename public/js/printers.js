'use strict';
/*
 * Settings → Printerlar (the boss and the admin): what every printer prints.
 * - Each printer has two jobs to tick: the guest's bill (Kassa) and order tickets, the latter for chosen sections
 *   (a new dish, a cancelled one and a deleted check go only to the printer of that dish's section).
 * - Computers that print through the browser or the FLOWI program (one printer each).
 * - Optional: several printers on one computer with the FLOWI Printer program — the printers it sees in Windows
 *   (USB) and network printers by IP; each gets a name (Oshxona, Shashlikchi) and its sections.
 */
// chosen: null = every section, a list = only those.
function printerCats(cats, chosen, key) {
  const all = chosen === null;
  return `<div class="cat-pick pr-cats ${all ? 'all' : ''}"><label class="pill pr-all"><input type="checkbox" data-allcats ${all ? 'checked' : ''}><span>${t("Hamma bo'limlar")}</span></label>
    ${cats.map((c) => `<label class="pill"><input type="checkbox" data-${key} value="${c.id}" ${all || chosen.includes(c.id) ? 'checked' : ''} ${all ? 'disabled' : ''}><span>${esc(c.name)}</span></label>`).join('')}</div>`;
}
// The two jobs of a printer: the guest's bill and order tickets (with their sections).
function printerRoles(p, cats, key) {
  return `<div class="pr-roles">
      <label class="pr-role"><input type="checkbox" name="bill" ${p.bill ? 'checked' : ''}><span class="ic">${icon('receipt', 20)}</span>
        <span><b>${t('Mijoz cheki (hisob)')}</b><span class="small muted">${t('"Chek" qaysi qurilmada bosilmasin, shu printerdan chiqadi')}</span></span></label>
      <label class="pr-role"><input type="checkbox" name="orders" ${p.orders ? 'checked' : ''}><span class="ic">${icon('chef-hat', 20)}</span>
        <span><b>${t("Buyurtma qog'ozlari")}</b><span class="small muted">${t("Urilgan taomlar va otkazlar — faqat tanlangan bo'limlarniki")}</span></span></label></div>
    <div class="pr-orders" ${p.orders ? '' : 'hidden'}>
      <p class="small muted" style="margin:10px 0 4px">${t("Qaysi bo'limlar chiqadi")}:</p>${printerCats(cats, p.cats, key)}
      <label class="field" style="margin-top:8px;max-width:420px">${t('Qaysi taomlar')}${modeSelect(p.all, 'all')}</label></div>`;
}
const modeSelect = (all, name) => `<select name="${name}"><option value="0" ${all ? '' : 'selected'}>${t('Faqat oshxonada tayyorlanadiganlar')}</option>
  <option value="1" ${all ? 'selected' : ''}>${t("Bo'limdagi hamma taomlar (choy, non, ichimlik ham)")}</option></select>`;
const dotHtml = (on, text) => `<span class="pr-dot ${on ? 'on' : ''}"></span><span class="small ${on ? '' : 'muted'}">${text}</span>`;

Object.assign(Views.settings, {
  tab_printers({ pr }) {
    const cats = pr.categories;
    const browserRow = (d) => `<form class="pr-row" data-bdev="${d.id}">
        <div class="pr-head"><b>${icon('monitor-smartphone', 16)} ${esc(d.name)}</b>
          ${d.on ? dotHtml(d.online, d.online ? t('ulangan') : t('ulanmagan')) : ''}
          <span class="grow"></span><label class="check"><input type="checkbox" name="on" ${d.on ? 'checked' : ''}> ${t('Chop etsin')}</label></div>
        <div class="pr-body">${printerRoles(d, cats, 'bcat')}
          <button class="btn sm primary" style="margin-top:10px">${icon('check', 16)} ${t('Saqlash')}</button></div></form>`;
    const printerRow = (p) => `<form class="pr-row ${p.on ? '' : 'off'}" data-pr="${p.id}">
        <div class="pr-head"><b>${icon(p.kind === 'net' ? 'network' : 'printer', 16)} ${esc(p.kind === 'net' ? `${p.ip}:${p.port}` : p.sys_name)}</b>
          ${p.kind === 'win' && p.port_name ? `<span class="small muted">${esc(p.port_name)}</span>` : ''}
          ${p.kind === 'win' && !p.present ? `<span class="chip">${t("Windows'da topilmadi")}</span>` : ''}
          ${p.error ? `<span class="chip red" title="${esc(p.error)}">${icon('triangle-alert', 13)} ${esc(p.error)}</span>` : ''}
          <span class="grow"></span><label class="check"><input type="checkbox" name="on" ${p.on ? 'checked' : ''}> ${t('Chop etsin')}</label></div>
        <div class="pr-body">
          <div class="form-grid"><label class="field">${t('Nomi (qog\'oz ostida chiqadi)')}<input name="label" maxlength="40" value="${esc(p.label)}" placeholder="${esc(t('Masalan: Shashlikchi'))}"></label>
            <label class="field">${t("Qog'oz kengligi")}<select name="paper"><option value="80" ${p.paper !== 58 ? 'selected' : ''}>80 mm</option><option value="58" ${p.paper === 58 ? 'selected' : ''}>58 mm</option></select></label></div>
          ${printerRoles(p, cats, 'pcat')}
          <div class="row" style="gap:8px;margin-top:10px"><button class="btn sm primary">${icon('check', 16)} ${t('Saqlash')}</button>
            <button type="button" class="btn sm" data-ptest="${p.id}">${icon('printer', 16)} ${t("Sinov qog'ozi")}</button>
            <button type="button" class="icon-btn danger" data-pdel="${p.id}" title="${esc(t("O'chirish"))}">${icon('trash-2', 18)}</button></div></div></form>`;
    const agentCard = (a) => `<div class="card pr-agent"><div class="card-head"><h2>${icon('monitor-smartphone')} ${esc(a.name)}</h2>
        ${dotHtml(a.online, a.online ? t('FLOWI Printer ishlayapti') : a.seen ? t('Ulanmagan — oxirgi marta {0}', fmtDateTime(a.seen)) : t("Hali ulanmagan — dasturni shu kompyuterda ishga tushiring"))}
        <button class="icon-btn danger" data-adel="${a.id}" title="${esc(t("Kompyuterni o'chirish"))}">${icon('trash-2', 18)}</button></div>
      ${a.printers.length ? a.printers.map(printerRow).join('') : `<p class="muted">${t("Printerlar ro'yxati dastur ishga tushgach shu yerda chiqadi.")}</p>`}
      <form class="pr-net" data-net="${a.id}"><b>${icon('network', 16)} ${t('Tarmoq (LAN) printerini qo\'shish')}</b>
        <div class="form-grid"><label class="field">${t('IP manzil')}<input name="ip" placeholder="192.168.1.100" inputmode="decimal" required></label>
          <label class="field">${t('Port')}<input name="port" type="number" value="9100"></label>
          <label class="field">${t('Nomi')}<input name="label" placeholder="${esc(t('Masalan: Oshxona'))}"></label></div>
        <p class="small muted" style="margin:6px 0">${t("IP manzilni bilish uchun: printerni o'chiring, FEED tugmasini bosib turib yoqing — chiqqan sinov qog'ozida IP yozilgan bo'ladi.")}</p>
        <button class="btn sm">${icon('plus', 16)} ${t("Qo'shish")}</button></form></div>`;
    const w = pr.warnings || { none: [], twice: [], bill: [] };
    const warn = [
      w.none.length ? `<div class="pr-warn red">${icon('triangle-alert', 18)}<span><b>${t("Hech qaysi printerga chiqmaydi")}:</b> ${w.none.map(esc).join(', ')}<br><span class="small">${t("Bu bo'limlarning taomlari qog'ozsiz qoladi. Biror printerda belgilang.")}</span></span></div>` : '',
      w.any && !w.bill.length ? `<div class="pr-warn">${icon('info', 18)}<span>${t("Mijoz cheki uchun printer tanlanmagan: chek \"Chek\" bosilgan qurilmaning o'zidan chiqadi.")}</span></div>` : '',
      w.bill.length > 1 ? `<div class="pr-warn">${icon('info', 18)}<span>${t('Mijoz cheki {0} ta printerda belgilangan ({1}). Chek faqat bittasidan — ulangan birinchisidan chiqadi.', w.bill.length, w.bill.map(esc).join(', '))}</span></div>` : '',
      ...w.twice.map((x) => `<div class="pr-warn">${icon('copy', 18)}<span>${t('{0} — {1} ta printerga chiqadi: {2}', `<b>${esc(x.name)}</b>`, x.printers.length, x.printers.map(esc).join(', '))}</span></div>`),
    ].join('');
    return `<div class="card"><h2 style="margin-top:0">${icon('printer')} ${t('Har bir printer nimani chiqaradi')}</h2>
        <p class="muted" style="margin-top:0">${t("Har printerda belgilang: \"Mijoz cheki\" — mijozga beriladigan hisob (odatda Kassa), \"Buyurtma qog'ozlari\" — urilgan taomlar, otkazlar va o'chirilgan chek, faqat tanlangan bo'limlarniki. Boshqa kompyuter, planshet va telefonlarda printer sozlash shart emas: hammasi server orqali shu printerlarga boradi. Printer ulanmagan bo'lsa, xodimlar ekranida ogohlantirish chiqadi; kompyuter o'chib qolgan bo'lsa, oxirgi 3 soatdagi qog'ozlar u yoqilganda o'zi chiqadi.")}</p>
        ${warn}</div>
      <h3 class="rep-h">${icon('monitor-smartphone', 18)} ${t('Brauzer orqali chop etadigan kompyuterlar')} <span class="small muted">(${t('bitta kompyuter — bitta printer')})</span></h3>
      <div class="card">${pr.browsers.length ? pr.browsers.map(browserRow).join('') : `<p class="muted" style="margin:0">${t("Hali qurilma ulanmagan. Kompyuterda FLOWI'ni oching va boshliq logini bilan \"Qurilma\" sifatida ulang.")}</p>`}</div>
      <h3 class="rep-h">${icon('printer', 18)} ${t('Bir kompyuterdan bir nechta printer')}</h3>
      <div class="card"><label class="check wk-opt"><input type="checkbox" id="pr-agent" ${pr.enabled ? 'checked' : ''}>
        <span>${t('FLOWI Printer dasturini ishlatish')}<span class="small muted">${t("Kassa kompyuteriga bir marta o'rnatiladi. U kompyuterdagi printerlarni (USB) va tarmoq printerlarini (LAN, IP orqali) o'qiydi va qog'ozni chop etish oynasisiz kerakli printerga chiqaradi. Windows 7/10/11.")}</span></span></label>
        ${pr.enabled ? `<div class="pr-steps"><b>${t("O'rnatish")}:</b> <ol>
          <li>${t('"Dasturni yuklab olish" ni bosing va kompyuterga nom bering (masalan: Kassa).')}</li>
          <li>${t("Yuklangan FLOWI-Printer.cmd faylini o'sha kompyuterda ikki marta bosing. \"FLOWI Printer o'rnatildi\" xabari chiqadi.")}</li>
          <li>${t("Bir daqiqada shu yerda printerlar ro'yxati chiqadi: har biriga nom va bo'lim tanlang, \"Chop etsin\" ni belgilang va \"Sinov qog'ozi\" ni bosing.")}</li></ol>
          <button class="btn primary" id="pr-download">${icon('download', 18)} ${t('Dasturni yuklab olish')}</button>
          <p class="small muted">${icon('shield-check', 14)} ${t("Faylda shu kompyuterning maxfiy kaliti bor — boshqalarga bermang. Kompyuter o'chirilsa, kalit ham bekor bo'ladi.")}</p></div>` : ''}</div>
      ${pr.enabled ? pr.agents.map(agentCard).join('') : ''}`;
  },
  bind_printers(root, { pr }) {
    const checked = (f, key) => (f.querySelector('[data-allcats]').checked ? 'all' : [...f.querySelectorAll(`[data-${key}]:checked`)].map((x) => Number(x.value)));
    // "Every section" ticks and locks the rest; "order tickets" off hides the sections.
    root.querySelectorAll('.pr-row').forEach((f) => {
      const all = f.querySelector('[data-allcats]');
      if (all) all.onchange = () => {
        f.querySelector('.pr-cats').classList.toggle('all', all.checked);
        f.querySelectorAll('.pr-cats input:not([data-allcats])').forEach((x) => { x.disabled = all.checked; if (all.checked) x.checked = true; });
      };
      if (f.orders) f.orders.onchange = () => { f.querySelector('.pr-orders').hidden = !f.orders.checked; };
    });
    root.querySelectorAll('[data-bdev]').forEach((f) => f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await PUT(`/api/devices/${f.dataset.bdev}/printer`, { on: f.on.checked, all: f.all.value === '1', cats: checked(f, 'bcat'), bill: f.bill.checked, orders: f.orders.checked });
        toast(t('Saqlandi'), 'ok'); refreshView(); refreshPrinters();
      } catch (err) { toastError(err); }
    });
    root.querySelectorAll('[data-pr]').forEach((f) => f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await PUT(`/api/printers/${f.dataset.pr}`, { on: f.on.checked, label: f.label.value, all: f.all.value === '1', paper: Number(f.paper.value), cats: checked(f, 'pcat'), bill: f.bill.checked, orders: f.orders.checked });
        toast(t('Saqlandi'), 'ok'); refreshView(); refreshPrinters();
      } catch (err) { toastError(err); }
    });
    root.querySelectorAll('[data-ptest]').forEach((b) => b.onclick = async () => {
      try { await POST(`/api/printers/${b.dataset.ptest}/test`); toast(t("Sinov qog'ozi yuborildi — printerni tekshiring"), 'ok'); } catch (e) { toastError(e); }
    });
    root.querySelectorAll('[data-pdel]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal(t("O'chirish"), t("Bu printer ro'yxatdan olib tashlansinmi?"), t("O'chirish")))) return;
      try { await DEL(`/api/printers/${b.dataset.pdel}`); refreshView(); refreshPrinters(); } catch (e) { toastError(e); }
    });
    root.querySelectorAll('[data-adel]').forEach((b) => b.onclick = async () => {
      if (!(await confirmModal(t("Kompyuterni o'chirish"), t("FLOWI Printer dasturining kaliti bekor qilinadi va shu kompyuterdan qog'oz chiqmaydi. Davom etamizmi?"), t("O'chirish")))) return;
      try { await DEL(`/api/printers/agent/${b.dataset.adel}`); refreshView(); refreshPrinters(); } catch (e) { toastError(e); }
    });
    root.querySelectorAll('[data-net]').forEach((f) => f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await POST('/api/printers/net', { device_id: Number(f.dataset.net), ip: f.ip.value.trim(), port: Number(f.port.value) || 9100, label: f.label.value });
        toast(t("Qo'shildi — bo'limlarini tanlab, sinov qog'ozini chiqaring"), 'ok'); refreshView();
      } catch (err) { toastError(err); }
    });
    const ag = root.querySelector('#pr-agent');
    if (ag) ag.onchange = async () => {
      try { App.settings = await PUT('/api/settings', { print_agent: ag.checked }); refreshView(); refreshPrinters(); } catch (e) { toastError(e); ag.checked = !ag.checked; }
    };
    const dl = root.querySelector('#pr-download');
    if (dl) dl.onclick = () => openModal({
      title: `${icon('download')} ${t('FLOWI Printer dasturi')}`,
      body: `<label class="field">${t('Kompyuter nomi')}<input name="name" maxlength="40" value="${esc(t('Kassa kompyuteri'))}"></label>
        <p class="small muted">${t("Har bir kompyuter uchun alohida yuklab oling.")}</p>`,
      actions: [{ label: t('Bekor') }, { label: t('Yuklab olish'), cls: 'primary', icon: 'download', onClick: async (f) => {
        const r = await POST('/api/printers/agent', { name: f.name.value, base: location.origin });
        downloadBlob(r.filename, new Blob([r.script], { type: 'application/octet-stream' }));
        toast(t("Yuklandi. Faylni o'sha kompyuterda ishga tushiring"), 'ok', 8000);
        refreshView();
      } }],
    });
  },
});

// While the printers page is open, it follows printers coming on and off (unless something is being typed).
Live.on('printers', () => {
  if (currentView === Views.settings && UI.settingsTab === 'printers' && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#view form'))) refreshView();
});
