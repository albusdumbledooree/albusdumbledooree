'use strict';
/*
 * Barcode scanning with the phone (or laptop) camera.
 * The browser's own reader (BarcodeDetector: Chrome on Android, desktop Chrome) is used when there is one;
 * elsewhere (iPhone Safari) a reader library is loaded the first time the camera opens.
 * Scanner.open({ title, onCode, once }) — onCode(code) returns { ok, text } shown under the picture;
 * with once the camera closes after the first code read.
 */
const Scanner = {
  FORMATS: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'qr_code'],
  lib: null,

  async loadLib() {
    if (window.ZXing) return window.ZXing;
    if (!this.lib) {
      this.lib = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/js/vendor/zxing.min.js';
        s.onload = () => resolve(window.ZXing);
        s.onerror = () => { this.lib = null; reject(new Error(t("Skaner kutubxonasi yuklanmadi. Internetni tekshiring"))); };
        document.head.appendChild(s);
      });
    }
    return this.lib;
  },

  // One reader for the whole session: native when the browser has it, the library otherwise.
  async reader() {
    if ('BarcodeDetector' in window) {
      try {
        const have = await window.BarcodeDetector.getSupportedFormats();
        const formats = this.FORMATS.filter((f) => have.includes(f));
        if (formats.includes('ean_13')) {
          const det = new window.BarcodeDetector({ formats });
          return async (video) => { const r = await det.detect(video); return r[0] ? r[0].rawValue : null; };
        }
      } catch { /* fall back to the library */ }
    }
    const Z = await this.loadLib();
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39,
      Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.ITF, Z.BarcodeFormat.QR_CODE]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const mf = new Z.MultiFormatReader();
    mf.setHints(hints);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return async (video) => {
      const vw = video.videoWidth; const vh = video.videoHeight;
      if (!vw) return null;
      // The middle band of the picture, where the aiming frame is: smaller, so faster.
      const w = Math.min(vw, 960); const scale = w / vw;
      canvas.width = w; canvas.height = Math.round(vh * scale * 0.6);
      ctx.drawImage(video, 0, vh * 0.2, vw, vh * 0.6, 0, 0, canvas.width, canvas.height);
      try {
        return mf.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText();
      } catch { return null; } finally { mf.reset(); }
    };
  },

  beep(ok = true) {
    try {
      const ac = this.ac || (this.ac = new (window.AudioContext || window.webkitAudioContext)());
      const o = ac.createOscillator(); const g = ac.createGain();
      o.frequency.value = ok ? 1450 : 380; g.gain.value = 0.12;
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + (ok ? 0.09 : 0.25));
    } catch { /* no sound */ }
    if (navigator.vibrate) navigator.vibrate(ok ? 40 : [60, 40, 60]);
  },

  async open({ title = t('Kamera bilan skanerlash'), onCode, once = false } = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return toast(t('Bu brauzerda kamera ishlamaydi (https manzil va zamonaviy brauzer kerak)'), 'warn', 7000);
    }
    this.close();
    const el = document.createElement('div');
    el.className = 'scanner';
    el.innerHTML = `<div class="sc-top"><b>${esc(title)}</b><span class="grow"></span>
        <button class="icon-btn" id="sc-torch" hidden title="${esc(t('Chiroq'))}">${icon('zap')}</button>
        <button class="icon-btn" id="sc-close" title="${esc(t('Yopish'))}">${icon('x')}</button></div>
      <div class="sc-view"><video playsinline muted></video><div class="sc-frame"><i></i></div></div>
      <div class="sc-msg" id="sc-msg">${t('Shtrix-kodni ramka ichiga tuting')}</div>`;
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('#sc-close').onclick = () => this.close();
    const video = el.querySelector('video');
    const msg = el.querySelector('#sc-msg');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      this.close();
      return toast(e && e.name === 'NotAllowedError' ? t("Kameraga ruxsat berilmadi. Brauzer sozlamalarida ruxsat bering") : t('Kamera topilmadi'), 'warn', 7000);
    }
    if (this.el !== el) { this.stream.getTracks().forEach((tr) => tr.stop()); return; }
    video.srcObject = this.stream;
    await video.play().catch(() => {});
    // A phone's flashlight, where the browser can switch it.
    const track = this.stream.getVideoTracks()[0];
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    if (caps.torch) {
      const tb = el.querySelector('#sc-torch');
      tb.hidden = false;
      let on = false;
      tb.onclick = () => { on = !on; track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {}); tb.classList.toggle('on', on); };
    }
    let read;
    try { read = await this.reader(); } catch (e) { msg.textContent = e.message; return; }
    let last = ''; let lastAt = 0; let busy = false;
    const tick = async () => {
      if (this.el !== el) return;
      if (!busy && video.readyState >= 2) {
        busy = true;
        try {
          const code = await read(video);
          // The same code held in front of the camera counts once (until it is taken away for a moment).
          if (code && (code !== last || Date.now() - lastAt > 2000)) {
            last = code; lastAt = Date.now();
            const r = (await onCode(code)) || { ok: true, text: code };
            this.beep(r.ok !== false);
            msg.className = `sc-msg ${r.ok === false ? 'bad' : 'good'}`;
            msg.innerHTML = r.html || esc(r.text || code);
            if (r.bind) r.bind(msg);
            if (r.ok !== false && once) { setTimeout(() => this.close(), 250); return; }
          } else if (code) lastAt = Date.now();
        } catch { /* keep looking */ }
        busy = false;
      }
      this.timer = setTimeout(tick, 120);
    };
    tick();
  },

  close() {
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach((tr) => tr.stop());
    this.stream = null;
    if (this.el) this.el.remove();
    this.el = null;
  },
};
window.addEventListener('hashchange', () => Scanner.close());
