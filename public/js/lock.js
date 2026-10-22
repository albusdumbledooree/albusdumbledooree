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

// ---------- First screen: the boss connects this computer, tablet or phone once ----------
Views.setup = {
  public: true,
  render() {
    const code = store('cp_code') || '';
    return `<div class="setup-wrap"><form class="card setup" id="setup-form" autocomplete="on">
      <div class="brand"><div class="grow">${flowiLogo(26)}
        <span class="muted small">${App.info && App.info.name ? esc(App.info.name) : t('Boshqaruv tizimi')}</span></div>${venueLogo('setup-logo')}${langSelect()}</div>
      <p class="small muted">${icon('monitor-smartphone', 16)} ${t("Kassa kompyuteri, planshet yoki telefonni boshliq bir marta ulaydi. Keyin xodimlar ismini bosib PIN kod bilan kiradi.")}</p>
      <div class="stack">
        <label class="field">${t('Kod')}<input name="code" autocapitalize="none" value="${esc(code)}" placeholder="navruz" required></label>
        ${App.info && App.info.blocked ? `<div class="notice red">${icon('ban', 18)} ${t('Bu choyxona vaqtincha bloklangan')}</div>` : ''}
        <label class="field">${t('Boshliq logini')}<input name="username" autocomplete="username" autocapitalize="none" required></label>
        <label class="field">${t('Parol')}<input name="password" type="password" autocomplete="current-password" required></label>
        <label class="field">${t('Qurilma nomi')}<input name="name" placeholder="${esc(t('Masalan: Kassa'))}"></label>
        <button class="btn primary lg block" type="submit">${icon('monitor-smartphone', 20)} ${t('Qurilmani ulash')}</button>
      </div>
      ${App.info && App.info.demo ? `<p class="small muted" style="margin-top:14px">${t('Sinov uchun')}: <b>ega / ega123</b></p>` : ''}
      ${supportHtml()}
    </form></div>`;
  },
  bind(root) {
    const form = root.querySelector('#setup-form');
    bindLang(root);
    form.code.onchange = async () => {
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
  render({ staff, backup }) {
    const bg = lockBackground(App.info && App.info.lock_bg);
    const name = App.info && App.info.name;
    return `<div class="lock ${bg.cls}" style="${bg.style}">
      <div class="lock-top"><div class="name">${flowiLogo(22)}${name ? `<span class="venue">${venueLogo()}${esc(name)}</span>` : ''}</div>
        ${langSelect()}
        ${Screen.button('lock-full')}
        <button class="icon-btn" id="lock-menu" title="${esc(t('Qurilma'))}">${icon('settings')}</button></div>
      <div class="lock-time"><div class="big" data-clock>${fmtTime(Date.now())}</div><div class="date">${esc(longDate())}</div></div>
      ${backup.state === 'prompt' ? `<div class="lock-note"><button class="btn sm" id="allow-backup">${icon('folder-open', 16)} ${t('Zaxira papkasiga ruxsat bering')}</button></div>` : ''}
      <div class="staff-grid">${staff.map((u) => `<button class="staff-tile ${u.has_pin ? '' : 'nopin'}" data-staff="${u.id}">
          <span class="avatar ${u.role}">${esc(initials(u.name))}</span><b>${esc(u.name)}</b>
          <span class="role">${icon(ROLE_ICONS[u.role], 14)} ${roleName(u.role)}</span></button>`).join('')}</div>
      <div class="lock-foot">${supportHtml()}</div>
    </div>`;
  },
  bind(root, { staff }) {
    bindLang(root);
    Screen.keepAwake();
    App.biz = (App.info && App.info.business_type) || App.biz;
    root.querySelector('#lock-full').onclick = () => Screen.toggleFull();
    const allow = root.querySelector('#allow-backup');
    if (allow) allow.onclick = async () => {
      try { if (await FolderBackup.allow()) { toast(t('Zaxira saqlandi'), 'ok'); render(); } } catch (e) { toastError(e); }
    };
    FolderBackup.run();
    root.querySelector('#lock-menu').onclick = () => openModal({
      title: `${icon('monitor-smartphone')} ${esc(App.device.name || t('Qurilma'))}`,
      body: `<p>${t('Kod')}: <b>${esc(App.device.code)}</b></p><p class="small muted">${t("Qurilmani uzsangiz, uni qayta ulash uchun boshliq logini kerak bo'ladi.")}</p>`,
      actions: [{ label: t('Yopish') }, { label: t('Qurilmani uzish'), cls: 'danger', icon: 'log-out', onClick: () => {
        App.device = null; store('cp_device', null); location.hash = '#/setup';
      } }],
    });
    root.querySelectorAll('[data-staff]').forEach((b) => b.onclick = () => pinDialog(staff.find((u) => u.id === Number(b.dataset.staff))));
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
      ${boss ? `<label class="field" style="width:100%">${t('Parol')}<input type="password" name="pin" autocomplete="off" required></label>`
        : keypadHtml(4)}</div>`,
    actions: [{ label: t('Bekor') }, { label: t('Kirish'), cls: 'primary', icon: 'lock-open', onClick: (f) => { submit(boss ? f.pin.value : pad.get()); return false; } }],
  });
  if (!boss) pad = bindKeypad(form, { maxLen: 4, onFull: (v) => submit(v) });
}
