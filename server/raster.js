'use strict';
/*
 * The guest's bill as a picture for a thermal printer (ESC/POS "GS v 0" raster), so it looks the same on every printer:
 * the printer's own font and line spacing differ from model to model and cannot be chosen; a picture can.
 * Drawn from server/receipt-font.js (DejaVu Sans Mono Bold as dots); the logo from a PNG of the business.
 * 80 mm paper: 576 dots across; 58 mm: 384.
 */
const zlib = require('node:zlib');
const FONT = require('./receipt-font');

const ESC = 0x1b; const GS = 0x1d;
// Letters the font does not have, written as the nearest it has.
const NEAR = { 'ʻ': "'", 'ʼ': "'", '‘': "'", '’': "'", '`': "'", '“': '"', '”': '"', ' ': ' ', '\t': ' ' };
const glyphCache = new Map();
function glyph(size, ch) {
  const f = FONT.sizes[size];
  const key = `${size}${ch}`;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const b64 = f.glyphs[ch] ?? f.glyphs[NEAR[ch]] ?? f.glyphs['?'];
  const g = Buffer.from(b64, 'base64');
  glyphCache.set(key, g);
  return g;
}

class Canvas {
  constructor(width) { this.w = width; this.rowBytes = width >> 3; this.rows = []; this.y = 0; }
  ensure(h) { while (this.rows.length < h) this.rows.push(new Uint8Array(this.rowBytes)); }
  dot(x, y) { if (x < 0 || x >= this.w || y < 0) return; this.ensure(y + 1); this.rows[y][x >> 3] |= 0x80 >> (x & 7); }
  // Text with its top at y; returns the width drawn.
  text(x, y, str, size = 24) {
    const f = FONT.sizes[size];
    const rb = Math.ceil(f.w / 8);
    let cx = Math.round(x);
    for (const ch of String(str)) {
      if (cx + f.w > this.w) break;
      const g = glyph(size, ch);
      for (let gy = 0; gy < f.h; gy++) for (let gx = 0; gx < f.w; gx++) if (g[gy * rb + (gx >> 3)] & (0x80 >> (gx & 7))) this.dot(cx + gx, y + gy);
      cx += f.w;
    }
    return cx - x;
  }
  bar(x1, x2, y, thick = 2, dash = 0, gap = 0) {
    for (let x = x1; x < x2; x++) {
      if (dash && (x - x1) % (dash + gap) >= dash) continue;
      for (let t = 0; t < thick; t++) this.dot(x, y + t);
    }
  }
  // A 1-bit picture (rows of 0/1) centred at y.
  image(bits, iw, ih, y) {
    const x0 = Math.max(0, Math.round((this.w - iw) / 2));
    for (let yy = 0; yy < ih; yy++) for (let xx = 0; xx < iw; xx++) if (bits[yy * iw + xx]) this.dot(x0 + xx, y + yy);
  }
  // ESC/POS: the picture in bands (old printers take a limited height at once), then feed and cut.
  escpos() {
    this.ensure(this.y + 1);
    const h = Math.max(this.y, 1);
    const out = [ESC, 0x40];
    const BAND = 128;
    for (let top = 0; top < h; top += BAND) {
      const bh = Math.min(BAND, h - top);
      out.push(GS, 0x76, 0x30, 0, this.rowBytes & 0xff, this.rowBytes >> 8, bh & 0xff, bh >> 8);
      for (let r = top; r < top + bh; r++) for (const b of this.rows[r]) out.push(b);
    }
    out.push(GS, 0x56, 0x42, 0x00);
    return Buffer.from(out);
  }
}

// ---------- PNG (the logo) → black-and-white dots ----------
function decodePng(buf) {
  if (!buf || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let p = 8; let w = 0; let h = 0; let depth = 0; let type = 0; let inter = 0; let pal = null; let trns = null; const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p); const kind = buf.toString('latin1', p + 4, p + 8); const d = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; inter = d[12]; }
    else if (kind === 'PLTE') pal = d;
    else if (kind === 'tRNS') trns = d;
    else if (kind === 'IDAT') idat.push(d);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (!w || !h || depth !== 8 || inter || w * h > 4_000_000) return null;
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!ch) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; const src = y * (stride + 1) + 1; const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? px[dst + i - ch] : 0; const b = y ? px[dst - stride + i] : 0; const c = y && i >= ch ? px[dst - stride + i - ch] : 0;
      let v = raw[src + i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c; const pa = Math.abs(q - a); const pb = Math.abs(q - b); const pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + i] = v & 0xff;
    }
  }
  // Grey 0..255 on white (transparent = white).
  const grey = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let r; let g; let bl; let al = 255;
    if (type === 0) { r = g = bl = px[i]; }
    else if (type === 4) { r = g = bl = px[i * 2]; al = px[i * 2 + 1]; }
    else if (type === 2) { r = px[i * 3]; g = px[i * 3 + 1]; bl = px[i * 3 + 2]; }
    else if (type === 6) { r = px[i * 4]; g = px[i * 4 + 1]; bl = px[i * 4 + 2]; al = px[i * 4 + 3]; }
    else { const k = px[i]; r = pal ? pal[k * 3] : 0; g = pal ? pal[k * 3 + 1] : 0; bl = pal ? pal[k * 3 + 2] : 0; al = trns && k < trns.length ? trns[k] : 255; }
    const lum = 0.299 * r + 0.587 * g + 0.114 * bl;
    grey[i] = 255 - ((255 - lum) * al) / 255;
  }
  return { w, h, grey };
}
// Scaled to `tw` dots across and dithered (Floyd–Steinberg), as thermal paper has no grey.
function logoBits(png, tw) {
  const img = decodePng(png);
  if (!img) return null;
  const th = Math.max(1, Math.round((img.h * tw) / img.w));
  const g = new Float32Array(tw * th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    // Box average of the source pixels under this dot.
    const x0 = Math.floor((x * img.w) / tw); const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.w) / tw));
    const y0 = Math.floor((y * img.h) / th); const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.h) / th));
    let s = 0; let n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += img.grey[yy * img.w + xx]; n++; }
    g[y * tw + x] = s / n;
  }
  const bits = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const i = y * tw + x; const old = g[i]; const v = old < 128 ? 0 : 255; const e = old - v;
    bits[i] = v === 0 ? 1 : 0;
    if (x + 1 < tw) g[i + 1] += (e * 7) / 16;
    if (y + 1 < th) { if (x) g[i + tw - 1] += (e * 3) / 16; g[i + tw] += (e * 5) / 16; if (x + 1 < tw) g[i + tw + 1] += e / 16; }
  }
  // The empty rows above and below the drawing (a logo file's own margin) are not printed.
  const used = (y) => { for (let x = 0; x < tw; x++) if (bits[y * tw + x]) return true; return false; };
  let top = 0; while (top < th - 1 && !used(top)) top++;
  let bot = th - 1; while (bot > top && !used(bot)) bot--;
  return { bits: bits.subarray(top * tw, (bot + 1) * tw), w: tw, h: bot - top + 1 };
}

// Breaks a text into rows of at most `n` characters, at spaces where possible.
function wrap(text, n) {
  const rows = []; let row = '';
  for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > n) { if (row) { rows.push(row); row = ''; } rows.push(w.slice(0, n)); w = w.slice(n); }
    if (!row) row = w; else if (row.length + 1 + w.length <= n) row += ` ${w}`; else { rows.push(row); row = w; }
  }
  if (row) rows.push(row);
  return rows.length ? rows : [''];
}
const sum = (v) => `${String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
const hm = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const dt = (ts) => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${hm(ts)}`; };
const modsOf = (i) => { try { return i.mods ? JSON.parse(i.mods).map((m) => m.name).join(', ') : ''; } catch { return ''; } };

/* The bill (job.order, job.shop: name, address, check settings) as ESC/POS raster bytes.
   paper: 80 or 58 (mm); logo: the PNG to put on top, or null. */
function billRaster(job, { paper = 80, logo = null } = {}) {
  const o = job.order || {}; const s = job.shop || {};
  const W = paper === 58 ? 384 : 576;
  const M = paper === 58 ? 8 : 14; // margin each side
  const c = new Canvas(W);
  const F = FONT.sizes[24]; const cw = F.w;
  const cols = Math.floor((W - 2 * M) / cw);
  const ROW = 34; // one line of text (29 dots) with the space under it
  const line = (str, { center = false, right = '', underline = false } = {}) => {
    let txt = String(str);
    // Too long for both on one line: the left part on its own line, the right one under it (nothing is cut off).
    if (right && txt.length + 1 + right.length > cols) {
      line(txt);
      c.y -= 6;
      txt = '';
    }
    const top = c.y + Math.round((ROW - F.h) / 2);
    const x = center ? Math.round((W - txt.length * cw) / 2) : M;
    c.text(x, top, txt, 24);
    if (underline) c.bar(x, x + txt.length * cw, top + F.base + 4, 2);
    if (right) c.text(W - M - right.length * cw, top, right, 24);
    c.y += ROW;
  };
  const dashes = () => { c.bar(M, W - M, c.y + 9, 3, 10, 6); c.y += 22; };
  const double = () => { c.bar(M, W - M, c.y + 6, 3); c.bar(M, W - M, c.y + 13, 3); c.y += 24; };
  // The columns: name | count | sum (a long name wraps inside its column).
  const QC = paper === 58 ? 3 : 4; const SC = paper === 58 ? 9 : 11; const NC = cols - QC - SC;
  const cols3 = (name, qty, total) => {
    const rows = wrap(name, NC - 1);
    rows.forEach((r, n) => {
      // The rest of a long name sits closer under its first line, so it reads as one dish.
      if (n > 0) c.y -= 6;
      const top = c.y + Math.round((ROW - F.h) / 2);
      c.text(M, top, r, 24);
      if (n === 0) {
        const q = String(qty); const t = String(total);
        c.text(M + (NC + QC - q.length) * cw, top, q, 24);
        c.text(W - M - t.length * cw, top, t, 24);
      }
      c.y += ROW;
    });
  };

  c.y = 0;
  if (job.late) line(`KECHIKIB CHIQDI (${hm(job.at)})`, { center: true });
  if (logo && s.receipt_logo !== false) {
    const pct = Math.min(100, Math.max(20, Number(s.receipt_logo_size) || 50));
    const img = logoBits(logo, Math.round(((W - 2 * M) * pct) / 100));
    if (img) { c.image(img.bits, img.w, img.h, c.y); c.y += img.h + 4; }
  }
  // The business's name, big, centred (wrapped when long).
  const T = FONT.sizes[34];
  // No name (a logo that already says it): no empty line for it.
  for (const r of s.name ? wrap(s.name, Math.floor((W - 2 * M) / T.w)) : []) {
    c.text(Math.round((W - r.length * T.w) / 2), c.y + 4, r, 34); c.y += T.h + 8;
  }
  for (const r of [s.address, s.phone].filter(Boolean).flatMap((x) => wrap(x, cols))) line(r, { center: true });
  dashes();
  const place = o.delivery ? `Dostavka #${o.id}` : o.takeaway ? `Olib ketish #${o.id}` : (o.room && o.room.name) || '';
  line(`Chek #${o.id}${o.status !== 'closed' ? ' (hisob)' : ''}`, { right: place });
  if (o.waiter && !o.takeaway) line(`Ofitsant: ${o.waiter.name}`, { right: `Mehmon: ${o.guests}` });
  // A delivery: whom it goes to and who takes it (each only when filled in; a long address wraps).
  if (o.delivery) {
    for (const [k, v] of [['Mijoz', o.label], ['Tel', o.phone], ['Manzil', o.address], ['Dostavchik', o.waiter && o.waiter.name]]) {
      if (v) for (const r of wrap(`${k}: ${v}`, cols)) line(r);
    }
  }
  line(`Ochildi: ${dt(o.opened_at)}`);
  if (o.closed_at) line(`Yopildi: ${dt(o.closed_at)}`);
  dashes();
  cols3('Nomi', 'Soni', 'Summa');
  dashes();
  // The same dish (name, price, choices) ordered several times is one row with the total count.
  const merged = [];
  for (const i of (o.items || []).filter((x) => x.status !== 'cancelled')) {
    const key = `${i.name}|${i.price}|${i.mods || ''}`;
    const m = merged.find((x) => x.key === key);
    if (m) m.qty += i.qty; else merged.push({ ...i, key, qty: i.qty });
  }
  const item = (i) => {
    cols3(i.name, i.qty, sum(i.qty * i.price));
    if (modsOf(i)) for (const r of wrap(`+ ${modsOf(i)}`, cols - 2)) { c.y -= 6; line(`  ${r}`); }
  };
  if (s.receipt_group === true && merged.some((i) => i.category_name)) {
    const groups = new Map();
    for (const i of merged) {
      const k = i.category_name || 'Boshqa';
      if (!groups.has(k)) groups.set(k, { sort: i.category_name ? i.category_sort ?? 0 : 1e9, items: [] });
      groups.get(k).items.push(i);
    }
    for (const [k, g] of [...groups.entries()].sort((x, y) => x[1].sort - y[1].sort)) {
      line(k.toUpperCase(), { underline: true });
      g.items.forEach(item);
    }
  } else merged.forEach(item);
  // The sums go on in the same columns, right under the dishes (no line between).
  cols3('Taomlar', '', sum(o.subtotal));
  if (o.service_amount) {
    if (o.service_type === 'per_guest') cols3(`Xizmat haqi (${o.guests} kishi)`, o.guests, sum(o.service_amount));
    else cols3(`Xizmat haqi ${o.service_pct}%`, '', sum(o.service_amount));
  }
  if (o.discount) cols3('Chegirma', '', `-${sum(o.discount)}`);
  double();
  const J = FONT.sizes[40];
  const total = sum(o.total);
  c.text(M, c.y + 6, 'JAMI', 40);
  c.text(W - M - total.length * J.w, c.y + 6, total, 40);
  c.y += J.h + 8;
  double();
  if (o.guests > 1 && !o.takeaway && s.receipt_per_person !== false) {
    const Q = FONT.sizes[30]; const each = sum(Math.round(o.total / o.guests));
    const left = `${o.guests} kishi - har biriga`;
    c.text(M, c.y + 4, left, 30); c.text(W - M - each.length * Q.w, c.y + 4, each, 30); c.y += Q.h + 8;
  }
  // An advance sale: what was paid ahead, later payments, what is left.
  if (o.advance || o.balance > 0 || (o.payments || []).length) {
    dashes();
    if (o.customer) line(`Mijoz: ${o.customer.name} ${o.customer.phone || ''}`.trim());
    if (o.advance) line("Avans (bosh to'lov)", { right: sum(o.advance) });
    for (const p of o.payments || []) line(dt(p.created_at).slice(0, 10), { right: sum(p.amount) });
    if (o.balance > 0) line('QOLDI', { right: sum(o.balance) }); else line("TO'LIQ TO'LANDI", { center: true });
  }
  dashes();
  // Who took the money; on a bill before payment — who printed it.
  const kassir = o.cashier ? o.cashier.name : job.by;
  if (kassir) line(`Kassir: ${kassir}`);
  const FT = FONT.sizes[30];
  for (const r of String(s.receipt_footer || '').split('\n').map((x) => x.trim()).filter(Boolean).flatMap((x) => wrap(x, Math.floor((W - 2 * M) / FT.w)))) {
    // Extra bold: drawn three times, a dot apart (the shop's own lines: phones, delivery, Wi-Fi).
    const fx = Math.round((W - r.length * FT.w) / 2) - 1;
    for (const dx of [0, 1, 2]) c.text(fx + dx, c.y + 2, r, 30);
    c.text(fx + 1, c.y + 3, r, 30); c.y += FT.h + 5;
  }
  c.y += 4;
  return c.escpos();
}

/* A kitchen ticket as a picture (same font as the bill): the place big on top, the check, waiter and time under it,
   then each dish — name first, the count at the right, in large letters a cook reads from a step away — with its
   choices (+) and note (*). A cancellation / deleted check / reprint / late ticket gets its mark on top. */
function ticketRaster(job, { paper = 80, label = '' } = {}) {
  const W = paper === 58 ? 384 : 576;
  const M = paper === 58 ? 8 : 14;
  const c = new Canvas(W);
  const S = FONT.sizes[24]; const B = FONT.sizes[34]; const H = FONT.sizes[46];
  const small = Math.floor((W - 2 * M) / S.w);
  const bigCols = Math.floor((W - 2 * M) / B.w);
  const center = (str, size) => { const f = FONT.sizes[size]; for (const r of wrap(str, Math.floor((W - 2 * M) / f.w))) { c.text(Math.round((W - r.length * f.w) / 2), c.y, r, size); c.y += f.h + (size === 24 ? 6 : 4); } };
  // A black band with white letters (BEKOR QILINDI…).
  const band = (str) => {
    const f = B; const h = f.h + 12;
    for (let y = 0; y < h; y++) c.bar(M, W - M, c.y + y, 1);
    const x0 = Math.round((W - str.length * f.w) / 2);
    const tmp = new Canvas(W); tmp.text(x0, 6, str, 34);
    for (let y = 0; y < tmp.rows.length && y < h; y++) for (let x = 0; x < W; x++) if (tmp.rows[y][x >> 3] & (0x80 >> (x & 7))) c.rows[c.y + y][x >> 3] &= ~(0x80 >> (x & 7));
    c.y += h + 8;
  };
  const dashes = () => { c.bar(M, W - M, c.y + 7, 3, 10, 6); c.y += 18; };
  c.y = 0;
  if (job.test) band('SINOV');
  if (job.cancel) band('BEKOR QILINDI');
  if (job.deleted) { center("BUTUN CHEK O'CHIRILDI", 24); if (job.reason) center(`Sabab: ${job.reason}`, 24); }
  if (job.reprint) band('QAYTA CHOP ETILDI');
  if (job.late) center(`KECHIKIB CHIQDI (${hm(job.at)})`, 24);
  center(job.room || '', 46);
  center([job.order_id ? `Chek #${job.order_id}` : '', job.waiter || '', job.by && job.by !== job.waiter ? `(${job.by})` : '', hm(job.at || Date.now())].filter(Boolean).join(' - '), 24);
  dashes();
  c.text(M, c.y, 'Nomi', 24); c.text(W - M - 4 * S.w, c.y, 'Soni', 24); c.y += S.h + 4;
  dashes();
  for (const it of job.items || []) {
    const q = String(it.qty);
    // The name takes all the room the count leaves (2 big letters for "1", 3 for "12").
    const rows = wrap(it.name, bigCols - Math.max(2, q.length + 1));
    rows.forEach((r, n) => {
      c.text(M, c.y, r, 34);
      if (n === 0) c.text(W - M - q.length * B.w, c.y, q, 34);
      c.y += B.h + 2;
    });
    if (it.mods) for (const r of wrap(`+ ${it.mods}`, small - 2)) { c.text(M + 2 * S.w, c.y, r, 24); c.y += S.h + 2; }
    if (it.note) for (const r of wrap(`* ${it.note}`, small - 2)) { c.text(M + 2 * S.w, c.y, r, 24); c.y += S.h + 2; }
    c.y += 6;
  }
  dashes();
  if (label) center(label, 24);
  c.y += 4;
  return c.escpos();
}

module.exports = { billRaster, ticketRaster, decodePng, logoBits, Canvas };
