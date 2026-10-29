'use strict';
/* Entry screens: connect a device, and the staff list with PIN (the "desktop"). */

const Views = {};

function langSelect(id = 'lang-select') {
  return `<select id="${id}" aria-label="Language">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${LANG === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
}
function bindLang(root, id = 'lang-select') {
  const s = root.querySelector(`#${id}`);
  if (s) s.onchange = () => { setLang(s.value); render(); };
}

// Browsers often lack Uzbek date names, so they come from the translations.
function longDate(ts = Date.now()) {
  const d = new Date(ts);
  const days = [t('Yakshanba'), t('Dushanba'), t('Seshanba'), t('Chorshanba'), t('Payshanba'), t('Juma'), t('Shanba')];
  const months = [t('yanvar'), t('fevral'), t('mart'), t('aprel'), t('may'), t('iyun'), t('iyul'), t('avgust'), t('sentabr'), t('oktabr'), t('noyabr'), t('dekabr')];
  return `${days[d.getDay()]}, ${d.getDate()}-${months[d.getMonth()]} ${d.getFullYear()}`;
}

async function loadInfo(code) {
  App.info = null;
  if (!code) return null;
  try { App.info = await GET(`/api/info?code=${encodeURIComponent(code)}`); } catch (e) { toastError(e); }
  if (App.info) checkVersion(App.info.version);
  return App.info;
}

// The business's own logo, if the boss uploaded one.
function venueLogo(cls = 'venue-logo') {
  const url = App.info && App.info.logo;
  return url ? `<img class="${cls}" src="${esc(url)}" alt="">` : '';
}
function supportHtml() {
  const s = App.info && App.info.support;
  if (!s || !s.text) return '';
  const inner = `${icon('life-buoy', 18)}<span>${esc(s.text)}</span>`;
  return s.link ? `<a class="support" href="${esc(s.link)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="support">${inner}</div>`;
}

// The desktop reminds everyone when the subscription is about to run out, with the support contact for paying.
function lockPayNotice() {
  const n = App.info && subscriptionNotice(App.info.paid_until);
  if (!n) return '';
  const s = App.info.support;
  const contact = s && s.text ? (s.link ? ` <a href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.text)}</a>` : ` ${esc(s.text)}`) : '';
  return `<div class="pay-notice ${n.cls}">${icon('triangle-alert', 22)}<div><b>${n.text}</b>${contact ? `<div class="small">${contact}</div>` : ''}</div></div>`;
}

// iPhone/iPad Safari has no install prompt: say once how to put the program on the home screen,
// so the icon is added from this business's own page (not from flowi.uz).
function isIosBrowser() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios && !Screen.standalone();
}
function iosHintHtml() {
  if (!isIosBrowser() || store('cp_ios_hint')) return '';
  return `<div class="ios-hint">${icon('smartphone', 22)}<div class="grow"><b>${t("Dasturni telefon ekraniga qo'shing")}</b>
      <div class="small">${t('Pastdagi "Ulashish" tugmasi')} (□↑) → <b>«На экран "Домой"»</b> / <b>«Add to Home Screen»</b>. ${t('Keyin dastur belgidan ochiladi.')}</div></div>
    <button type="button" class="icon-btn" id="ios-hint-x" aria-label="${esc(t('Yopish'))}">${icon('x', 18)}</button></div>`;
}

// ---------- First screen: the boss connects this computer, tablet or phone once ----------
Views.setup = {
  public: true,
  render() {
    const code = store('cp_code') || '';
    return `<div class="setup-wrap"><form class="card setup" id="setup-form" autocomplete="on">
      <div class="brand"><div class="grow">${flowiLogo(26)}
        <span class="muted small">${App.info && App.info.name ? esc(App.info.name) : t('Boshqaruv tizimi')}</span></div>${venueLogo('setup-logo')}${keyboardToggle()}${langSelect()}</div>
      <p class="small muted">${icon('monitor-smartphone', 16)} ${t("Kassa kompyuteri, planshet yoki telefonni boshliq bir marta ulaydi. Keyin xodimlar ismini bosib PIN kod bilan kiradi.")}</p>
      <div class="stack">
        ${/^\/c\//.test(location.pathname) && code ? `<input type="hidden" name="code" value="${esc(code)}">`
          : `<label class="field">${t('Kod')}<input name="code" autocapitalize="none" value="${esc(code)}" placeholder="navruz" required></label>`}
        ${App.info && App.info.blocked ? `<div class="notice red">${icon('ban', 18)} ${t('Bu choyxona vaqtincha bloklangan')}</div>` : ''}
        <label class="field">${t('Boshliq logini')}<input name="username" autocomplete="username" autocapitalize="none" required></label>
        <label class="field">${t('Parol')}<input name="password" type="password" autocomplete="current-password" required></label>
        <label class="field">${t('Qurilma nomi')}<input name="name" placeholder="${esc(t('Masalan: Kassa'))}"></label>
        <button class="btn primary lg block" type="submit">${icon('monitor-smartphone', 20)} ${t('Qurilmani ulash')}</button>
      </div>
      ${App.info && App.info.demo ? `<p class="small muted" style="margin-top:14px">${t('Sinov uchun')}: <b>ega / ega123</b></p>` : ''}
      ${supportHtml()}
      ${App.info && App.info.release ? `<p class="small muted" style="margin:12px 0 0;text-align:right">FLOWI v${esc(App.info.release)}</p>` : ''}
    </form></div>`;
  },
  bind(root) {
    const form = root.querySelector('#setup-form');
    bindLang(root);
    bindKeyboardToggle(root);
    if (form.code.type !== 'hidden') form.code.onchange = async () => {
      const code = form.code.value.trim().toLowerCase();
      if (!code) return;
      if (await loadInfo(code)) store('cp_code', code);
      // Keep whatever was typed while the name was loading.
      const cur = document.getElementById('setup-form');
      const keep = cur ? { u: cur.username.value, p: cur.password.value, n: cur.name.value, focus: document.activeElement && document.activeElement.name } : {};
      await render();
      const f = document.getElementById('setup-form');
      if (f) {
        f.username.value = keep.u || ''; f.password.value = keep.p || ''; f.name.value = keep.n || '';
        if (keep.focus && f[keep.focus]) f[keep.focus].focus();
      }
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(form);
      d.code = d.code.trim().toLowerCase();
      try {
        const r = await api('POST', '/api/device/register', d, null);
        App.device = { token: r.device_token, code: d.code, name: r.name };
        store('cp_device', App.device);
        store('cp_code', d.code);
        toast(t('Qurilma ulandi'), 'ok');
        location.hash = '#/lock';
      } catch (err) { toastError(err); }
    };
  },
};
Views.login = Views.setup;

// ---------- Staff list ("desktop") with clock; tap a name, enter the PIN ----------
Views.lock = {
  public: true,
  async load() {
    await loadInfo(App.device.code);
    const [staff, backup] = await Promise.all([api('GET', '/api/device/staff', null, App.device.token), FolderBackup.status()]);
    return { staff, backup };
  },
  // Two steps, like a cash-desk terminal: the clock with one "Kirish" button, then the list of names.
  step: 'clock',
  render({ staff, backup }) {
    const bg = lockBackground(App.info && App.info.lock_bg);
    const name = App.info && App.info.name;
    const names = this.step === 'staff';
    return `<div class="lock ${bg.cls} ${names ? 'names' : ''}" style="${bg.style}">
      <div class="lock-top">${names ? `<button class="btn lock-back" id="lock-back">${icon('arrow-left', 18)} ${t('Orqaga')}</button>` : ''}
        <span class="grow"></span>
        ${langSelect()}
        ${App.info && App.info.att_qr ? `<button class="btn lock-back" id="lock-wqr">${icon('qr-code', 18)} ${t('Davomat QR')}</button>` : ''}
        ${Screen.button('lock-full')}
        <button class="icon-btn" id="lock-menu" title="${esc(t('Qurilma'))}">${icon('settings')}</button></div>
      <div class="lock-head">${venueLogo('lock-logo')}${name ? `<div class="lock-venue">${esc(name)}</div>` : ''}
        ${names ? '' : `<div class="date">${esc(longDate())}</div><div class="big" data-clock>${fmtTime(Date.now())}</div>`}</div>
      ${lockPayNotice()}
      ${iosHintHtml()}
      ${backup.state === 'prompt' ? `<div class="lock-note"><button class="btn sm" id="allow-backup">${icon('folder-open', 16)} ${t('Zaxira papkasiga ruxsat bering')}</button></div>` : ''}
      ${names ? `<div class="staff-grid">${staff.map((u) => `<button class="staff-tile ${u.role} ${u.has_pin ? '' : 'nopin'}" data-staff="${u.id}">
          <span class="role">${roleName(u.role)}</span><b>${esc(u.name)}</b></button>`).join('')}</div>`
        : `<div class="lock-actions"><button class="lock-btn" id="lock-enter">${icon('log-in', 22)} ${t('Kirish')}</button></div>`}
      <div class="lock-foot">${supportHtml()}<span class="grow"></span><span class="lock-brand">${flowiLogo(14)}${App.info && App.info.release ? `<small>v${esc(App.info.release)}</small>` : ''}</span></div>
    </div>`;
  },
  bind(root, { staff }) {
    bindLang(root);
    Screen.keepAwake();
    App.biz = (App.info && App.info.business_type) || App.biz;
    root.querySelector('#lock-full').onclick = () => Screen.toggleFull();
    const wqr = root.querySelector('#lock-wqr');
    if (wqr) wqr.onclick = () => Work.showQr(App.device.token);
    const iosX = root.querySelector('#ios-hint-x');
    if (iosX) iosX.onclick = () => { store('cp_ios_hint', 1); iosX.closest('.ios-hint').remove(); };
    const allow = root.querySelector('#allow-backup');
    if (allow) allow.onclick = async () => {
      try { if (await FolderBackup.allow()) { toast(t('Zaxira saqlandi'), 'ok'); render(); } } catch (e) { toastError(e); }
    };
    FolderBackup.run();
    OrderPrinter.sync();
    root.querySelector('#lock-menu').onclick = () => openModal({
      title: `${icon('monitor-smartphone')} ${esc(App.device.name || t('Qurilma'))}`,
      body: `<p>${t('Kod')}: <b>${esc(App.device.code)}</b></p>
        <label class="check" style="margin:12px 0"><input type="checkbox" id="order-print" ${OrderPrinter.on() ? 'checked' : ''}> ${icon('printer', 18)} ${t('Shu qurilmadan har bir yangi buyurtmani chop etish')}</label>
        ${keyboardSelect()}
        <button type="button" class="btn block" id="kiosk-bat" style="margin-top:12px">${icon('download', 18)} ${t('Kassa yorlig\'ini yuklab olish (Windows)')}</button>
        <p class="small muted" style="margin-top:6px">${t("Shu yorliq bilan ochilsa, chek chiqqanda chop etish oynasi ochilmaydi — darhol printerdan chiqadi.")}</p>
        <p class="small muted">${t("Qurilmani uzsangiz, uni qayta ulash uchun boshliq logini kerak bo'ladi.")}</p>`,
      onMount: (f) => {
        f.querySelector('#order-print').onchange = (e) => OrderPrinter.set(e.target.checked);
        f.querySelector('#kb-mode').onchange = (e) => Keyboard.setMode(e.target.value);
        f.querySelector('#kiosk-bat').onclick = downloadKioskLauncher;
      },
      actions: [{ label: t('Yopish') }, { label: t('Qurilmani uzish'), cls: 'danger', icon: 'log-out', onClick: () => {
        OrderPrinter.set(false); App.device = null; store('cp_device', null); location.hash = '#/setup';
      } }],
    });
    root.querySelectorAll('[data-staff]').forEach((b) => b.onclick = () => pinDialog(staff.find((u) => u.id === Number(b.dataset.staff))));
    const go = (step) => { this.step = step; render(); };
    const enter = root.querySelector('#lock-enter');
    if (enter) enter.onclick = () => go('staff');
    const back = root.querySelector('#lock-back');
    if (back) back.onclick = () => go('clock');
    // The list of names goes back to the clock if nobody chose a name.
    clearTimeout(this.timer);
    if (this.step === 'staff') this.timer = setTimeout(() => { if (parseHash().name === 'lock' && !App.user && !document.querySelector('.modal-back')) go('clock'); }, 45000);
  },
};
// The desktop re-reads the business (background, logo, support line, new version) every few minutes.
setInterval(() => {
  if (!App.user && App.device && parseHash().name === 'lock' && !document.querySelector('.modal-back')) {
    const before = JSON.stringify(App.info);
    loadInfo(App.device.code).then((info) => {
      if (info && info.version) checkVersion(info.version);
      if (info && JSON.stringify(info) !== before && !document.querySelector('.modal-back')) render();
    });
  }
}, 5 * MIN);

function pinDialog(u) {
  if (!u.has_pin) return toast(t("PIN o'rnatilmagan. Boshliqqa murojaat qiling"), 'warn');
  // No desktop password yet: the boss goes straight in.
  if (u.open) {
    api('POST', '/api/device/pin', { user_id: u.id, pin: '' }, App.device.token).then((r) => startSession(r.token)).catch(toastError);
    return;
  }
  const boss = u.role === 'owner' || u.role === 'admin';
  const submit = async (pin) => {
    try {
      const r = await api('POST', '/api/device/pin', { user_id: u.id, pin }, App.device.token);
      closeModal();
      await startSession(r.token);
    } catch (e) {
      if (pad) { pad.shake(); pad.reset(); }
      toastError(e);
    }
  };
  let pad = null;
  const form = openModal({
    title: '',
    body: `<div class="pin-box"><div class="pin-who"><span class="avatar ${u.role}">${esc(initials(u.name))}</span><b>${esc(u.name)}</b>
      <span class="muted small">${roleName(u.role)}</span></div>
      ${boss ? `<label class="field" style="width:100%">${t('Parol')}<input type="password" name="pin" autocomplete="off" required>
        <span class="small muted" style="font-weight:500">${t('Sozlamalarda qo\'yilgan kirish paroli')}</span></label>`
        : keypadHtml(4)}</div>`,
    actions: [{ label: t('Bekor') }, { label: t('Kirish'), cls: 'primary', icon: 'lock-open', onClick: (f) => { submit(boss ? f.pin.value : pad.get()); return false; } }],
  });
  if (!boss) pad = bindKeypad(form, { maxLen: 4, onFull: (v) => submit(v) });
}
