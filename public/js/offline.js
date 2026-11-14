'use strict';
/* Work without internet.
   - The last menu, rooms and open checks this person saw are kept on the device, so the screens still open.
   - An order confirmed without internet is kept on the device (a queue) and goes to the server by itself when
     the internet is back. Each one carries its own key: sent twice, it is still written once.
   - On the kassa computer (the order printer, or the Windows program) the kitchen ticket is printed at once.
   Limit: without internet the devices do not see each other — the kitchen screen and other phones learn of the
   order only after it is sent. */
var Offline = {
  KEEP: [/^\/api\/me$/, /^\/api\/menu$/, /^\/api\/rooms(\?all=1)?$/, /^\/api\/takeaway$/, /^\/api\/shifts\/current$/, /^\/api\/printers$/, /^\/api\/orders\/\d+$/],
  PUBLIC: /^\/api\/info\?/,
  down_: false, busy: false, timer: null,

  // ----- the saved copy of what the server last answered -----
  tok() { return App.token ? String(App.token).slice(-12) : ''; },
  wipe() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.indexOf('cp_off:') === 0) localStorage.removeItem(k); }
      localStorage.removeItem('cp_off_orders');
    } catch (e) { /* private mode */ }
  },
  keep(path, data) {
    if (this.PUBLIC.test(path)) { store('cp_offp:info', data); return; }
    if (!App.token || !this.KEEP.some((r) => r.test(path))) return;
    if (store('cp_off_tok') !== this.tok()) { this.wipe(); store('cp_off_tok', this.tok()); }
    try {
      localStorage.setItem(`cp_off:${path}`, JSON.stringify(data));
      if (/^\/api\/orders\//.test(path)) {
        // Only the latest checks are kept: the older ones leave.
        const list = (store('cp_off_orders') || []).filter((p) => p !== path); list.push(path);
        while (list.length > 40) localStorage.removeItem(`cp_off:${list.shift()}`);
        store('cp_off_orders', list);
      }
    } catch (e) { /* storage full: work goes on without the copy */ }
  },
  cached(path) {
    if (this.PUBLIC.test(path)) { const v = store('cp_offp:info'); return v === null ? undefined : v; }
    if (!App.token || store('cp_off_tok') !== this.tok()) return undefined;
    try { const v = localStorage.getItem(`cp_off:${path}`); return v === null ? undefined : JSON.parse(v); } catch (e) { return undefined; }
  },

  // ----- is the server reachable -----
  isDown() { return this.down_; },
  down() { if (!this.down_) { this.down_ = true; this.paint(); } this.watch(); },
  up() {
    if (!this.down_) return;
    this.down_ = false; this.paint();
    if (typeof refreshView === 'function' && App.user) refreshView();
    this.flush();
  },
  // While there is no internet (or something waits in the queue), the server is asked now and then.
  watch() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.down_ && !this.list().some((e) => !e.failed)) { clearInterval(this.timer); this.timer = null; return; }
      this.ping();
    }, 12000);
  },
  ping() {
    return fetch('/api/info?code=' + encodeURIComponent((App.tenant && App.tenant.code) || store('cp_code') || ''), { cache: 'no-store' })
      .then((r) => { if (r.status >= 502 && r.status <= 504) return; this.up(); this.flush(); }).catch(() => {});
  },

  // ----- the queue of orders written without internet -----
  list() { return store('cp_queue') || []; },
  save(list) { store('cp_queue', list.length ? list : null); this.paint(); },
  key() {
    const a = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(a);
    return 'q' + Date.now().toString(36) + Array.prototype.map.call(a, (b) => ('0' + b.toString(16)).slice(-2)).join('');
  },
  add(d, cart, orderId) {
    const e = {
      key: this.key(), token: App.token, user_id: App.user.id, by: App.user.name, at: Date.now(),
      room_id: d.roomId, order_id: orderId || null, room: d.place, guests: cart.guests || 1, label: cart.label || '',
      delivery: d.kind === 'dlv' ? cart.delivery || {} : null,
      lines: cart.lines.map((c) => ({ dish_id: c.dish_id, qty: c.qty, note: c.note || '', mods: c.mods || null, name: c.name, price: c.price, modsText: c.modsText || '' })),
      printed: false,
    };
    // The kassa computer prints the kitchen ticket right away: the kitchen is not left waiting for the internet.
    if (window.flowiDesktop || (typeof OrderPrinter === 'object' && OrderPrinter.on())) this.print(e);
    const list = this.list(); list.push(e); this.save(list);
    this.watch();
    return e;
  },
  print(e) {
    printKitchenTicket({ offline: true, order_id: e.order_id || '—', room: e.room, waiter: e.by, at: e.at,
      items: e.lines.map((c) => ({ name: c.name, qty: c.qty, note: [c.modsText, c.note].filter(Boolean).join(' · ') })) });
    e.printed = true;
  },
  forPlace(roomId, orderId) {
    return this.list().filter((e) => (orderId && e.order_id === orderId) || (roomId && e.room_id === roomId && (!e.order_id || !orderId)));
  },
  async flush() {
    if (this.busy || !App.token) return;
    this.busy = true;
    let sent = 0;
    try {
      for (const e of this.list()) {
        if (e.failed) continue;
        // The same person signed in again: the order goes under the new session.
        if (e.token !== App.token && App.user && e.user_id === App.user.id) e.token = App.token;
        try {
          await api('POST', '/api/offline/order', { key: e.key, room_id: e.room_id, order_id: e.order_id, guests: e.guests, label: e.label, at: e.at, printed: e.printed,
            ...(e.delivery ? { delivery: e.delivery } : {}), items: e.lines.map((c) => ({ dish_id: c.dish_id, qty: c.qty, note: c.note, ...(c.mods ? { mods: c.mods } : {}) })) }, e.token);
          this.save(this.list().filter((x) => x.key !== e.key));
          sent += 1;
        } catch (err) {
          if (err.offline || !err.status) break; // still no internet, or the session ended: it waits
          this.save(this.list().map((x) => (x.key === e.key ? { ...x, failed: err.message } : x)));
        }
      }
    } finally { this.busy = false; this.paint(); }
    if (sent) {
      toast(t('Internet keldi — {0} ta buyurtma yuborildi', sent), 'ok', 6000);
      if (typeof refreshView === 'function') refreshView();
    }
    if (this.list().some((e) => e.failed)) toast(t("Ba'zi buyurtmalar yuborilmadi — qizil yozuvni bosing"), 'error', 8000);
  },

  // ----- what the person sees -----
  paint() {
    let bar = document.getElementById('offbar');
    const list = this.list(); const failed = list.filter((e) => e.failed).length; const wait = list.length - failed;
    if (!this.down_ && !list.length) { if (bar) bar.remove(); document.body.classList.remove('has-offbar'); return; }
    if (!bar) {
      bar = document.createElement('button'); bar.id = 'offbar'; bar.type = 'button';
      bar.onclick = () => this.dialog();
      document.body.appendChild(bar);
    }
    document.body.classList.add('has-offbar');
    bar.className = failed ? 'bad' : this.down_ ? 'off' : 'sync';
    const text = failed ? t('{0} ta buyurtma yuborilmadi — bosing', failed)
      : this.down_ ? (wait ? t("Internet yo'q · navbatda {0} ta buyurtma", wait) : t("Internet yo'q — buyurtma yozaverishingiz mumkin"))
        : t('Yuborilmoqda… {0} ta buyurtma', wait);
    bar.innerHTML = `${icon(this.down_ || failed ? 'wifi-off' : 'refresh-cw', 16)}<span>${esc(text)}</span>`;
  },
  dialog() {
    const list = this.list();
    const row = (e) => `<div class="offq ${e.failed ? 'bad' : ''}">
        <div class="row" style="gap:8px;align-items:flex-start"><div class="grow"><b>${esc(e.room)}</b> <span class="small muted">· ${fmtTime(e.at)} · ${esc(e.by)}</span>
          ${e.failed ? `<div class="small red-text">${icon('triangle-alert', 13)} ${esc(e.failed)}</div>` : `<div class="small muted">${t('Internet kelganda yuboriladi')}${e.printed ? ` · ${t('oshxonaga chop etilgan')}` : ''}</div>`}</div>
          <b class="num">${money(e.lines.reduce((s, c) => s + c.price * c.qty, 0))}</b></div>
        <div class="offq-lines">${e.lines.map((c) => `<span>${c.qty}× ${esc(c.name)}${c.modsText ? ` <small>+ ${esc(c.modsText)}</small>` : ''}${c.note ? ` <small>✎ ${esc(c.note)}</small>` : ''}</span>`).join('')}</div>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">
          <button type="button" class="btn sm" data-oprint="${e.key}">${icon('printer', 15)} ${e.printed ? t('Qayta chop etish') : t('Oshxonaga chop etish')}</button>
          ${e.failed ? `<button type="button" class="btn sm primary" data-oretry="${e.key}">${icon('refresh-cw', 15)} ${t('Qayta yuborish')}</button>` : ''}
          <button type="button" class="btn sm red-text" data-odel="${e.key}">${icon('trash-2', 15)} ${t("O'chirish")}</button></div></div>`;
    const form = openModal({
      title: `${icon('wifi-off')} ${t('Internetsiz ish')}`,
      body: `<p class="small muted" style="margin-top:0">${this.down_
        ? t("Hozir internet yo'q. Buyurtmalar shu qurilmada saqlanadi va internet kelishi bilan o'zi yuboriladi. Bu oynani yopib ishlayvering.")
        : t("Internet bor. Navbatdagi buyurtmalar yuborilmoqda.")}</p>
        <p class="small offq-note">${icon('info', 14)} ${t("Internetsiz paytda oshxona ekrani va boshqa telefonlar bu buyurtmani ko'rmaydi — oshxonaga og'zaki ayting yoki kassa kompyuteridan chop eting. Chekni yopish (to'lov) internet kelgach qilinadi.")}</p>
        ${list.length ? list.map(row).join('') : emptyState('check', t("Navbatda buyurtma yo'q"))}`,
      actions: [{ label: t('Yopish') }, ...(list.length ? [{ label: t('Hozir yuborish'), cls: 'primary', icon: 'send', onClick: () => { this.ping().then(() => this.flush()); } }] : [])],
    });
    const find = (k) => this.list().find((e) => e.key === k);
    form.querySelectorAll('[data-oprint]').forEach((b) => b.onclick = () => {
      const e = find(b.dataset.oprint); if (!e) return;
      this.print(e); this.save(this.list().map((x) => (x.key === e.key ? { ...x, printed: true } : x)));
    });
    form.querySelectorAll('[data-oretry]').forEach((b) => b.onclick = () => {
      this.save(this.list().map((x) => (x.key === b.dataset.oretry ? { ...x, failed: null, token: App.token, user_id: App.user.id } : x)));
      closeModal(); this.flush();
    });
    form.querySelectorAll('[data-odel]').forEach((b) => b.onclick = () => {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.innerHTML = `${icon('trash-2', 15)} ${t("Aniq o'chirilsinmi?")}`; return; }
      this.save(this.list().filter((x) => x.key !== b.dataset.odel));
      closeModal(); if (this.list().length) this.dialog();
      if (typeof refreshView === 'function') refreshView();
    });
  },
};
window.addEventListener('online', () => Offline.ping());
window.addEventListener('offline', () => Offline.down());
