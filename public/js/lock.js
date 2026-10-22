'use strict';
/* Entry screens: connect a device, personal login, and the staff list with PIN (the "desktop"). */

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
  return App.info;
}

// ---------- First screen: connect this device, or log in personally ----------
Views.setup = {
  public: true,
  tab: 'device',
  render() {
    const code = store('cp_code') || '';
    const dev = this.tab === 'device';
    return `<div class="setup-wrap"><form class="card setup" id="setup-form" autocomplete="on">
      <div class="brand"><div class="grow">${flowiLogo(26)}
        <span class="muted small">${App.info && App.info.name ? esc(App.info.name) : t('Boshqaruv tizimi')}</span></div>${langSelect()}</div>
      <div class="seg" style="width:100%;margin-bottom:16px">
        <button type="button" class="${dev ? 'active' : ''}" data-tab="device" style="flex:1">${icon('monitor-smartphone', 18)} ${t('Umumiy qurilma')}</button>
        <button type="button" class="${dev ? '' : 'active'}" data-tab="personal" style="flex:1">${icon('user', 18)} ${t('Shaxsiy kirish')}</button></div>
      <p class="small muted">${dev
        ? t("Kassa kompyuteri yoki planshetni boshliq bir marta ulaydi. Keyin xodimlar ismini bosib PIN kod bilan kiradi.")
        : t('Xodim o\'z telefonidan login va parol bilan kiradi.')}</p>
      <div class="stack">
        <label class="field">${t('Choyxona kodi')}<input name="code" autocapitalize="none" value="${esc(code)}" placeholder="navruz" required></label>
        ${App.info && App.info.blocked ? `<div class="notice red">${icon('ban', 18)} ${t('Bu choyxona vaqtincha bloklangan')}</div>` : ''}
        <label class="field">${dev ? t('Boshliq logini') : t('Login')}<input name="username" autocomplete="username" autocapitalize="none" required></label>
        <label class="field">${t('Parol')}<input name="password" type="password" autocomplete="current-password" required></label>
        ${dev ? `<label class="field">${t('Qurilma nomi')}<input name="name" placeholder="${esc(t('Masalan: Kassa'))}"></label>` : ''}
        <button class="btn primary lg block" type="submit">${icon(dev ? 'monitor-smartphone' : 'log-out', 20)} ${dev ? t('Qurilmani ulash') : t('Kirish')}</button>
      </div>
      ${App.info && App.info.demo ? `<p class="small muted" style="margin-top:14px">${t('Sinov uchun')}: <b>ega / ega123</b>${dev ? '' : ` · <b>jasur / 1234</b>`}</p>` : ''}
    </form></div>`;
  },
  bind(root) {
    const form = root.querySelector('#setup-form');
    bindLang(root);
    root.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { this.tab = b.dataset.tab; render(); });
    form.code.onchange = async () => {
      const code = form.code.value.trim().toLowerCase();
      if (!code) return;
      if (await loadInfo(code)) store('cp_code', code);
      // Keep whatever was typed while the choyxona name was loading.
      const cur = document.getElementById('setup-form');
      const keep = cur ? { u: cur.username.value, p: cur.password.value, n: cur.name ? cur.name.value : '', focus: document.activeElement && document.activeElement.name } : {};
      await render();
      const f = document.getElementById('setup-form');
      if (f) {
        f.username.value = keep.u || ''; f.password.value = keep.p || '';
        if (f.name && keep.n) f.name.value = keep.n;
        if (keep.focus && f[keep.focus]) f[keep.focus].focus();
      }
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(form);
      d.code = d.code.trim().toLowerCase();
      try {
        if (this.tab === 'device') {
          const r = await api('POST', '/api/device/register', d, null);
          App.device = { token: r.device_token, code: d.code, name: r.name };
          store('cp_device', App.device);
          store('cp_code', d.code);
          toast(t('Qurilma ulandi'), 'ok');
          location.hash = '#/lock';
        } else {
          const r = await api('POST', '/api/login', d, null);
          store('cp_code', d.code);
          await startSession(r.token);
        }
      } catch (err) { toastError(err); }
    };
  },
};
Views.login = Views.setup;

// ---------- Staff list ("desktop") with clock; tap a name, enter the PIN ----------
Views.lock = {
  public: true,
  async load() {
    if (!App.info) await loadInfo(App.device.code);
    return { staff: await api('GET', '/api/device/staff', null, App.device.token) };
  },
  render({ staff }) {
    return `<div class="lock">
      <div class="lock-top"><div class="name">${flowiLogo(22)}${App.info && App.info.name ? `<span class="venue">${esc(App.info.name)}</span>` : ''}</div>
        ${langSelect()}
        ${Screen.canFullscreen() ? `<button class="icon-btn" id="lock-full" title="${esc(t("To'liq ekran"))}">${icon(Screen.isFull() ? 'minimize' : 'maximize')}</button>` : ''}
        <button class="icon-btn" id="lock-menu" title="${esc(t('Qurilma'))}">${icon('settings')}</button></div>
      <div class="lock-time"><div class="big" data-clock>${fmtTime(Date.now())}</div><div class="date">${esc(longDate())}</div></div>
      <div class="staff-grid">${staff.map((u) => `<button class="staff-tile ${u.has_pin ? '' : 'nopin'}" data-staff="${u.id}">
          <span class="avatar ${u.role}">${esc(initials(u.name))}</span><b>${esc(u.name)}</b>
          <span class="role">${icon(ROLE_ICONS[u.role], 14)} ${roleName(u.role)}</span></button>`).join('')}</div>
    </div>`;
  },
  bind(root, { staff }) {
    bindLang(root);
    Screen.keepAwake();
    const full = root.querySelector('#lock-full');
    if (full) full.onclick = () => { Screen.toggleFull(); setTimeout(render, 300); };
    root.querySelector('#lock-menu').onclick = () => openModal({
      title: `${icon('monitor-smartphone')} ${esc(App.device.name || t('Qurilma'))}`,
      body: `<p>${t('Choyxona kodi')}: <b>${esc(App.device.code)}</b></p><p class="small muted">${t("Qurilmani uzsangiz, uni qayta ulash uchun boshliq logini kerak bo'ladi.")}</p>`,
      actions: [{ label: t('Yopish') }, { label: t('Qurilmani uzish'), cls: 'danger', icon: 'log-out', onClick: () => {
        App.device = null; store('cp_device', null); location.hash = '#/setup';
      } }],
    });
    root.querySelectorAll('[data-staff]').forEach((b) => b.onclick = () => pinDialog(staff.find((u) => u.id === Number(b.dataset.staff))));
  },
};

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
