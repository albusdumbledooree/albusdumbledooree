'use strict';
/*
 * Work hours and the place (all optional — the boss switches them on in Settings → Joylashuv):
 * - "Ishga keldim" screen: GPS, the cash desk's changing QR code and a selfie prove the worker is in the hall;
 *   when the phone cannot (no GPS indoors), "Kassir tasdiqlasin" asks the cashier instead.
 * - On a worker's own phone the program works only inside: the position is re-checked in the background.
 * - The cash desk shows the QR code ("Davomat QR"); the cashier confirms requests from the banner.
 */
const Geo = {
  // The phone's position: { lat, lng, acc } or an Error with a message a worker understands.
  get() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error(t('Bu brauzerda joylashuv aniqlanmaydi')));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) }),
        (e) => reject(new Error(e.code === 1 ? t("Joylashuvga ruxsat berilmagan. Brauzer sozlamalarida ruxsat bering")
          : e.code === 3 ? t('Joylashuv aniqlanmadi (vaqt tugadi). Deraza yoniga boring va qayta urining') : t("Joylashuv aniqlanmadi. GPS'ni yoqing"))),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 20000 });
    });
  },
};

const Work = {
  state: null,   // from /api/me: rules, open entry, today's entries
  gate: null,    // null | 'clock' | 'geo' — what keeps the program closed on this phone
  proof: {},     // what the worker has collected on the "I came" screen: pos, dist, qr, photo

  load(state) {
    this.state = state;
    this.proof = {};
    const r = state && state.rules;
    if (!r) { this.gate = null; return; }
    if (r.clock && (!state.open || state.open.status === 'pending')) this.gate = 'clock';
    else if (r.geo && !(state.geo_until > Date.now())) this.gate = 'geo';
    else this.gate = null;
  },
  async refresh() {
    try { this.load(await GET('/api/work/me')); } catch { /* keep */ }
  },
  // A request came back "not at work" / "not inside": show the screen instead of the page.
  blocked(code) {
    if (this.gate === code) return;
    this.gate = code;
    if (code === 'clock' && this.state) this.state.open = null;
    render();
  },

  // ---------- The screen that stands in front of the program ----------
  render(app) {
    const st = this.state || { rules: {} };
    const r = st.rules;
    const pending = st.open && st.open.status === 'pending';
    const p = this.proof;
    const done = (k) => (k === 'gps' ? p.pos && p.inside : k === 'qr' ? !!p.qr : k === 'selfie' ? !!p.photo : false);
    const step = (k, ic, title, sub, btn) => `<div class="wk-step ${done(k) ? 'done' : ''}">
        <span class="wk-ic">${icon(done(k) ? 'circle-check' : ic, 22)}</span><div class="grow"><b>${title}</b><div class="small muted">${sub}</div></div>${btn}</div>`;
    const gpsSub = p.pos ? (p.inside ? t('Ish joyidasiz ({0} m)', p.dist) : t('Ish joyidan {0} m uzoqdasiz', p.dist)) : p.gpsErr ? esc(p.gpsErr) : t('Aniqlanmoqda…');
    const geoOnly = this.gate === 'geo';
    const ready = (!r.gps || done('gps')) && (!r.qr || done('qr')) && (!r.selfie || done('selfie'));
    const past = (st.entries || []).filter((e) => e.status === 'ok' && e.out_at);
    app.innerHTML = `<div class="wk-wrap"><div class="card wk-card">
      <div class="wk-head">${venueLogo('wk-logo')}<div><div class="small muted">${esc(App.settings.name || '')}</div><h1>${esc(App.user.name)}</h1></div>
        <span class="grow"></span><b class="wk-clock" data-clock>${fmtTime(Date.now())}</b></div>
      ${pending ? `<div class="wk-wait">${icon('timer', 40)}<h2>${t('Kassir tasdiqlashini kuting')}</h2>
          <p class="muted">${t("So'rov yuborildi: {0}. Kassir tasdiqlashi bilan dastur o'zi ochiladi.", fmtTime(st.open.in_at))}</p>
          <button class="btn" id="wk-reload">${icon('refresh-cw', 18)} ${t('Yangilash')}</button></div>`
        : geoOnly ? `<div class="wk-wait">${icon('map-pin', 40)}<h2>${t('Dastur faqat ish joyida ishlaydi')}</h2>
          <p class="muted" id="wk-geo-msg">${p.pos && !p.inside ? t('Ish joyidan {0} m uzoqdasiz', p.dist) : p.gpsErr ? esc(p.gpsErr) : t('Joylashuv tekshirilmoqda…')}</p>
          <button class="btn primary lg" id="wk-geo">${icon('map-pin', 20)} ${t('Qayta tekshirish')}</button>
          <button class="btn" id="wk-ask">${icon('hand', 18)} ${t('GPS ishlamayapti — kassir tasdiqlasin')}</button></div>`
          : `<h2 class="wk-title">${icon('log-in', 24)} ${t('Ishga keldim')}</h2>
          ${past.length ? `<p class="small muted">${t('Bugun')}: ${past.map((e) => `${fmtTime(e.in_at)}–${fmtTime(e.out_at)}`).join(', ')}</p>` : ''}
          <div class="wk-steps">
            ${r.gps ? step('gps', 'map-pin', t('Joylashuv'), gpsSub, `<button class="btn sm" id="wk-gps">${icon('refresh-cw', 16)}</button>`) : ''}
            ${r.qr ? step('qr', 'qr-code', t('Kassa ekranidagi QR kod'), done('qr') ? t('Skanerlandi') : t("Kassadagi \"Davomat QR\" ni skanerlang"),
              `<button class="btn sm ${done('qr') ? '' : 'primary'}" id="wk-qr">${icon('camera', 16)} ${t('Skanerlash')}</button>`) : ''}
            ${r.selfie ? step('selfie', 'camera', t('Selfi'), done('selfie') ? `<img class="wk-thumb" src="${p.photo}" alt="">` : t("O'zingizni rasmga oling"),
              `<button class="btn sm ${done('selfie') ? '' : 'primary'}" id="wk-selfie">${icon('camera', 16)} ${done('selfie') ? t('Qayta') : t('Rasmga olish')}</button>`) : ''}
          </div>
          <button class="btn ok lg block" id="wk-in" ${ready ? '' : 'disabled'}>${icon('check', 22)} ${t('Ishga keldim')}</button>
          <button class="btn block" id="wk-ask" style="margin-top:8px">${icon('hand', 18)} ${t('Telefon tasdiqlay olmayapti — kassir tasdiqlasin')}</button>`}
      <div class="wk-foot"><button class="btn sm" id="wk-exit">${icon('log-out', 16)} ${t('Chiqish')}</button></div>
    </div></div>`;
    this.bind(app);
    tickTimers();
    if ((r.gps || geoOnly) && !p.pos && !p.gpsErr && !p.locating) this.locate();
  },

  bind(app) {
    const on = (id, fn) => { const b = app.querySelector(id); if (b) b.onclick = fn; };
    on('#wk-exit', logout);
    on('#wk-reload', async () => { await this.refresh(); this.done(); });
    on('#wk-gps', () => this.locate());
    on('#wk-geo', () => this.locate());
    on('#wk-qr', () => Scanner.open({ title: t('Davomat QR'), once: true, onCode: (code) => {
      if (!/^FLOWI-ISH:/.test(code)) return { ok: false, text: t('Bu davomat QR kodi emas. Kassa ekranidagi kodni skanerlang') };
      this.proof.qr = code; setTimeout(() => render(), 300);
      return { ok: true, text: t('Skanerlandi') };
    } }));
    on('#wk-selfie', () => this.selfie());
    on('#wk-in', async (e) => {
      e.target.disabled = true;
      try { await this.send(false); } catch (err) { toastError(err); this.retryProof(err); render(); }
    });
    on('#wk-ask', async (e) => {
      e.target.disabled = true;
      try { await this.send(true); toast(t("So'rov kassirga yuborildi"), 'ok'); } catch (err) { toastError(err); render(); }
    });
  },
  // A code from the screen is valid about a minute: after a refusal it has to be scanned again.
  retryProof(err) { if (/QR/.test(err.message)) this.proof.qr = null; },

  async locate() {
    const p = this.proof;
    p.locating = true; p.gpsErr = null;
    try {
      p.pos = await Geo.get();
      const r = await POST('/api/geo/check', p.pos);
      p.inside = !!r.ok; p.dist = r.dist ?? 0;
      if (this.gate === 'geo' && r.ok) { p.locating = false; await this.refresh(); this.gate = null; return this.done(); }
    } catch (e) { p.gpsErr = e.message; p.pos = null; }
    p.locating = false;
    if (this.gate) render();
  },

  async send(ask) {
    const p = this.proof;
    const body = { ...(p.pos || {}), qr: p.qr || '', photo: p.photo || '', ask };
    const st = await POST('/api/work/in', body);
    this.load(st);
    if (!this.gate) this.done(); else render();
  },
  // Back to the program, where the worker was going.
  done() {
    if (this.gate) return render();
    // The answer and the live event both land here: only the first one opens the program.
    if (!document.querySelector('.wk-wrap')) return;
    toast(t('Xush kelibsiz! Ish boshlandi: {0}', fmtTime(Date.now())), 'ok');
    document.getElementById('app').innerHTML = '';
    refreshBadges();
    render();
  },

  // ---------- Selfie with the front camera ----------
  async selfie() {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false }); } catch (e) {
      return toast(e && e.name === 'NotAllowedError' ? t('Kameraga ruxsat berilmadi. Brauzer sozlamalarida ruxsat bering') : t('Kamera topilmadi'), 'warn', 7000);
    }
    const stop = () => stream.getTracks().forEach((tr) => tr.stop());
    openModal({
      title: `${icon('camera')} ${t('Selfi')}`,
      body: `<div class="wk-cam"><video playsinline muted autoplay></video><div class="wk-oval"></div></div>
        <p class="small muted center" style="margin:10px 0 0">${t("Yuzingiz oval ichida bo'lsin")}</p>`,
      onMount: (f) => { const v = f.querySelector('video'); v.srcObject = stream; v.play().catch(() => {}); },
      onClose: stop,
      actions: [{ label: t('Bekor'), onClick: () => { stop(); } }, { label: t('Rasmga olish'), cls: 'primary', icon: 'camera', onClick: (f) => {
        const v = f.querySelector('video');
        if (!v.videoWidth) { toast(t('Kamera hali tayyor emas'), 'warn'); return false; }
        const side = Math.min(v.videoWidth, v.videoHeight); const out = 480;
        const c = document.createElement('canvas'); c.width = out; c.height = out;
        const ctx = c.getContext('2d');
        // Mirrored like the preview, cut to a square around the face.
        ctx.translate(out, 0); ctx.scale(-1, 1);
        ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, out, out);
        this.proof.photo = c.toDataURL('image/jpeg', 0.72);
        stop();
        setTimeout(() => render(), 50);
      } }],
    });
  },

  // ---------- "I left" ----------
  async clockOut() {
    if (!(await confirmModal(t('Ishni tugatdim'), t("Ish vaqtingiz {0} da tugaganini belgilaymizmi? Keyin dastur yopiladi.", fmtTime(Date.now())), t('Tugatdim')))) return;
    let pos = {};
    if (this.state.rules.gps) { try { pos = await Geo.get(); } catch { /* "I left" never fails because of GPS */ } }
    try {
      this.load(await POST('/api/work/out', pos));
      toast(t("Ish tugadi. Rahmat!"), 'ok');
      render();
    } catch (e) { toastError(e); }
  },

  // ---------- In the background: is this phone still inside? ----------
  async ping() {
    const r = this.state && this.state.rules;
    if (!App.user || !r || !r.geo || this.gate || document.hidden) return;
    try {
      const pos = await Geo.get();
      const res = await POST('/api/geo/check', pos);
      if (res.ok) this.state.geo_until = Date.now() + 20 * MIN;
    } catch { /* the next request tells if the pass ran out */ }
  },

  // ---------- The cash desk: the code workers scan; a new one every 30 seconds ----------
  showQr(deviceToken = null) {
    let timer = null;
    const form = openModal({
      title: `${icon('qr-code')} ${t('Davomat QR')}`,
      body: `<div class="wk-qr" id="wk-qr-box"></div><p class="center muted" style="margin:10px 0 0">${t("Xodim telefonida \"Ishga keldim\" → \"Skanerlash\" ni bosib, shu kodni skanerlaydi. Kod har 30 soniyada o'zgaradi.")}</p>`,
      size: 'wide',
      onClose: () => clearTimeout(timer),
    });
    const box = form.querySelector('#wk-qr-box');
    const tick = async () => {
      if (!document.body.contains(box)) return;
      try {
        const c = deviceToken ? await api('GET', '/api/device/work-qr', null, deviceToken) : await GET('/api/work/qr');
        box.innerHTML = qrSvg(c.text);
        timer = setTimeout(tick, Math.max(1000, c.next_in + 300));
      } catch (e) { box.innerHTML = emptyState('triangle-alert', esc(e.message)); }
    };
    tick();
  },
};

// Requests from workers whose phone could not prove they are here: the cashier sees the person and confirms.
function workAskHtml(asks) {
  return `<div class="guest-banner work-banner"><div class="rb-head">${icon('user-round', 20)} ${t('Ishga keldi — tasdiqlang')} <span class="badge">${asks.length}</span></div>
    ${asks.slice(0, 4).map((a) => `<div class="rb-item"><div class="grow"><b>${esc(a.name)}</b> · ${fmtTime(a.in_at)}${a.reason ? ` <span class="small" style="opacity:.8">· ${esc(a.reason)}</span>` : ''}</div>
      <button class="btn sm" data-wk-no="${a.id}">${icon('x', 16)}</button><button class="btn sm" data-wk-ok="${a.id}">${icon('check', 16)} ${t('Tasdiqlash')}</button></div>`).join('')}</div>`;
}
function bindWorkAsks(el) {
  el.querySelectorAll('[data-wk-ok]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await POST(`/api/work/${b.dataset.wkOk}/approve`); toast(t('Tasdiqlandi'), 'ok'); } catch (e) { toastError(e); }
    refreshBadges();
  });
  el.querySelectorAll('[data-wk-no]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await POST(`/api/work/${b.dataset.wkNo}/reject`, {}); } catch (e) { toastError(e); }
    refreshBadges();
  });
}

setInterval(() => Work.ping(), 5 * MIN);
document.addEventListener('visibilitychange', () => { if (!document.hidden) Work.ping(); });
Live.on('work', async () => {
  if (!App.user) return;
  const before = Work.gate;
  await Work.refresh();
  if (before && !Work.gate) Work.done();
  else if (Work.gate !== before) render();
  refreshBadges();
});
Live.on('work_ask', (d) => {
  if (!['owner', 'admin', 'cashier'].includes(App.user.role)) return;
  Voice.say(t('{0} ishga keldi. Tasdiqlang.', d.name), 'new');
  toast(t('{0} ishga keldi — tasdiqlang', d.name), 'warn', 8000);
});
