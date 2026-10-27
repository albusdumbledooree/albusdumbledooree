'use strict';
/*
 * On-screen keyboard for touch terminals without a physical keyboard.
 * It opens by itself under any text or number field. Numbers get a large number pad;
 * text gets Latin (with oʻ, gʻ) or Cyrillic letters. While it is open the phone/tablet's
 * own keyboard is held back (inputmode="none"), so two keyboards never appear.
 * Mode per device: auto (touch screens bigger than a phone) / on / off.
 */
const Keyboard = {
  el: null,
  target: null,
  layer: 'abc', // abc | cyr | sym
  shift: false,
  mode() { return store('cp_kb') || 'auto'; },
  setMode(m) { store('cp_kb', m === 'auto' ? null : m); if (!this.enabled()) this.hide(); },
  enabled() {
    const m = this.mode();
    if (m === 'on') return true;
    if (m === 'off') return false;
    const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    return touch && Math.min(screen.width, screen.height) >= 700;
  },

  numeric(el) {
    return el.type === 'number' || el.type === 'tel' || ['numeric', 'decimal', 'tel'].includes(el.dataset.kbMode || el.getAttribute('inputmode'));
  },
  wants(el) {
    if (!el || el.readOnly || el.disabled || el.closest('.osk')) return false;
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && ['text', 'password', 'search', 'number', 'tel', 'email', 'url', ''].includes(el.type);
  },

  rows() {
    if (this.layer === 'sym') return [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['@', '#', '%', '&', '*', '(', ')', '-', '+', '='], ['/', ':', ';', '"', '!', '?', ',', '.', '_']];
    if (this.layer === 'cyr') return [['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'], ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'], ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ў', 'қ', 'ғ', 'ҳ']];
    return [['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ʻ'], ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.']];
  },

  html() {
    const k = (v, label = v, cls = '') => `<button type="button" class="k ${cls}" data-k="${esc(v)}">${label}</button>`;
    if (this.numeric(this.target)) {
      return `<div class="osk-num">${['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((n) => k(n)).join('')}
        ${k('00')}${k('0')}${this.target.type === 'tel' ? k('+') : k('.', ',')}
        </div><div class="osk-side">${k('back', icon('delete', 24), 'fn')}${k('clear', 'C', 'fn')}${k('enter', icon('check', 24), 'go')}${k('hide', icon('chevron-down', 24), 'fn')}</div>`;
    }
    const up = (c) => (this.shift ? c.toUpperCase() : c);
    const rows = this.rows();
    return `<div class="osk-full">
      <div class="osk-row">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((n) => k(n, n, 'dig')).join('')}${k('back', icon('delete', 22), 'fn wide')}</div>
      ${rows.map((r, i) => `<div class="osk-row">${i === 2 && this.layer !== 'sym' ? k('shift', '⇧', `fn wide ${this.shift ? 'on' : ''}`) : ''}${r.map((c) => k(up(c))).join('')}${i === 1 ? k('enter', icon('check', 22), 'go wide') : ''}</div>`).join('')}
      <div class="osk-row">${k('sym', this.layer === 'sym' ? 'ABC' : '?123', 'fn wide')}${k('lang', this.layer === 'cyr' ? 'ABC' : 'АБВ', 'fn wide')}
        ${k('@', '@', 'fn')}${k(' ', t('Probel'), 'space')}${k('-', '-', 'fn')}${k('hide', icon('chevron-down', 22), 'fn wide')}</div></div>`;
  },

  draw() {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'osk';
      // Keep the focus in the field while keys are pressed.
      this.el.addEventListener('pointerdown', (e) => e.preventDefault());
      this.el.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) this.press(b.dataset.k); });
      document.body.appendChild(this.el);
    }
    this.el.classList.toggle('numeric', this.numeric(this.target));
    this.el.innerHTML = this.html();
    document.body.classList.add('kb-open');
    document.documentElement.style.setProperty('--kb-h', `${this.el.offsetHeight}px`);
  },

  show(el) {
    if (!this.enabled() || !this.wants(el)) return;
    if (this.target && this.target !== el) this.release();
    this.target = el;
    if (!el.dataset.kbMode) el.dataset.kbMode = el.getAttribute('inputmode') || '';
    el.setAttribute('inputmode', 'none');
    this.shift = false;
    this.draw();
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
  },
  release() {
    const el = this.target;
    if (!el) return;
    if (el.dataset.kbMode) el.setAttribute('inputmode', el.dataset.kbMode); else el.removeAttribute('inputmode');
  },
  hide() {
    this.release();
    this.target = null;
    if (this.el) this.el.innerHTML = '';
    document.body.classList.remove('kb-open');
    document.documentElement.style.setProperty('--kb-h', '0px');
  },

  insert(text) {
    const el = this.target;
    if (el.maxLength > 0 && el.value.length >= el.maxLength) return;
    try {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
    } catch {
      el.value += text; // number and email fields have no caret position
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },

  press(k) {
    const el = this.target;
    if (!el || !document.body.contains(el)) return this.hide();
    if (k === 'hide') { el.blur(); return this.hide(); }
    if (k === 'shift') { this.shift = !this.shift; return this.draw(); }
    if (k === 'lang') { this.layer = this.layer === 'cyr' ? 'abc' : 'cyr'; return this.draw(); }
    if (k === 'sym') { this.layer = this.layer === 'sym' ? 'abc' : 'sym'; return this.draw(); }
    if (k === 'clear') { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); return; }
    if (k === 'back') {
      try {
        const s = el.selectionStart; const e = el.selectionEnd;
        if (s === e && s > 0) el.setRangeText('', s - 1, s, 'end'); else el.setRangeText('', s, e, 'end');
      } catch { el.value = el.value.slice(0, -1); }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (k === 'enter') {
      if (el.tagName === 'TEXTAREA') return this.insert('\n');
      // On a number field "✓" only closes the keyboard, so it can never finish a payment by itself.
      if (this.numeric(el)) { el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); return this.hide(); }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      if (!ev.defaultPrevented && el.form) { this.hide(); el.form.requestSubmit(); } else if (!ev.defaultPrevented) { el.blur(); this.hide(); }
      return;
    }
    this.insert(k);
    if (this.shift) { this.shift = false; this.draw(); }
  },
};

function keyboardSelect(id = 'kb-mode') {
  const m = Keyboard.mode();
  return `<label class="field">${icon('grid-2x2', 16)} ${t('Ekran klaviaturasi')}<select id="${id}">
    ${[['auto', t('Avtomatik (sensorli ekranda)')], ['on', t('Doim yoqiq')], ['off', t("O'chiq")]].map(([k, n]) => `<option value="${k}" ${m === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
}

document.addEventListener('focusin', (e) => Keyboard.show(e.target));
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const a = document.activeElement;
    if (Keyboard.target && !Keyboard.wants(a)) Keyboard.hide();
    else if (a && a !== Keyboard.target && Keyboard.wants(a)) Keyboard.show(a);
  }, 80);
});
// Tapping a field that already has the focus brings the keyboard back after "hide".
document.addEventListener('pointerup', (e) => {
  const el = e.target.closest && e.target.closest('input, textarea');
  if (el && el === document.activeElement && !Keyboard.target) Keyboard.show(el);
});
