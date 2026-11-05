'use strict';
/*
 * A kitchen ticket as ESC/POS bytes, the language of thermal receipt printers (Xprinter, Epson, Rongta…).
 * The server draws the ticket; the FLOWI Printer program on the business's computer only passes the bytes on —
 * to a printer installed in Windows (USB) or straight to a network printer's IP address (port 9100).
 * Letters: Latin as is, Cyrillic in code page 866 (selected with ESC t 17), anything else as close as possible.
 */
const ESC = 0x1b; const GS = 0x1d;

// Cyrillic → CP866. Uzbek letters without a CP866 glyph fall back to the nearest Russian one.
const CYR_FALLBACK = { 'Ў': 'У', 'ў': 'у', 'Қ': 'К', 'қ': 'к', 'Ғ': 'Г', 'ғ': 'г', 'Ҳ': 'Х', 'ҳ': 'х' };
function cp866(ch) {
  const c = ch.codePointAt(0);
  if (c >= 0x410 && c <= 0x42f) return 0x80 + (c - 0x410); // А-Я
  if (c >= 0x430 && c <= 0x43f) return 0xa0 + (c - 0x430); // а-п
  if (c >= 0x440 && c <= 0x44f) return 0xe0 + (c - 0x440); // р-я
  if (c === 0x401) return 0xf0; // Ё
  if (c === 0x451) return 0xf1; // ё
  return null;
}
const PLAIN = { '‘': "'", '’': "'", 'ʻ': "'", 'ʼ': "'", '`': "'", '«': '"', '»': '"', '“': '"', '”': '"', '—': '-', '–': '-', '×': 'x', '·': '-', '№': 'N' };
function encode(text) {
  const out = [];
  for (let ch of String(text ?? '')) {
    ch = CYR_FALLBACK[ch] || PLAIN[ch] || ch;
    const c = ch.codePointAt(0);
    if (c >= 0x20 && c < 0x7f) out.push(c);
    else if (c === 0x0a) out.push(0x0a);
    else { const b = cp866(ch); out.push(b === null ? 0x3f : b); }
  }
  return out;
}
// Breaks a line into rows of at most `width` characters, at spaces where possible.
function wrap(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const rows = []; let row = '';
  for (const w of words) {
    if (!row) row = w.slice(0, width);
    else if (row.length + 1 + w.length <= width) row += ` ${w}`;
    else { rows.push(row); row = w.slice(0, width); }
    let rest = w.slice(width);
    while (rest) { rows.push(row); row = rest.slice(0, width); rest = rest.slice(width); }
  }
  if (row) rows.push(row);
  return rows.length ? rows : [''];
}
const hm = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// job: { room, order_id, waiter, by, at, items: [{ qty, name, note }], cancel, reprint, late, test }; label: the printer's name.
function ticket(job, { width = 48, label = '' } = {}) {
  const b = [];
  const raw = (...x) => b.push(...x);
  const text = (s) => b.push(...encode(s), 0x0a);
  const big = (on) => raw(GS, 0x21, on ? 0x11 : 0x00); // double width + height
  const tall = (on) => raw(GS, 0x21, on ? 0x01 : 0x00); // double height only
  const bold = (on) => raw(ESC, 0x45, on ? 1 : 0);
  const align = (n) => raw(ESC, 0x61, n); // 0 left, 1 centre
  const inverse = (on) => raw(GS, 0x42, on ? 1 : 0);
  const half = Math.floor(width / 2);
  raw(ESC, 0x40); // reset
  raw(ESC, 0x74, 17); // code page 866
  align(1);
  if (job.test) { big(true); text('SINOV'); big(false); }
  if (job.cancel) { big(true); inverse(true); text(' BEKOR QILINDI '); inverse(false); big(false); }
  if (job.deleted) { bold(true); text("BUTUN CHEK O'CHIRILDI"); bold(false); if (job.reason) for (const r of wrap(`Sabab: ${job.reason}`, width)) text(r); }
  if (job.reprint) { bold(true); inverse(true); text(' QAYTA CHOP ETILDI '); inverse(false); bold(false); }
  if (job.late) { bold(true); text(`KECHIKIB CHIQDI (${hm(job.at)})`); bold(false); }
  big(true); bold(true);
  for (const row of wrap(job.room || '', half)) text(row);
  big(false); bold(false);
  text([job.order_id ? `Chek #${job.order_id}` : '', job.waiter || '', job.by && job.by !== job.waiter ? `(${job.by})` : '', hm(job.at || Date.now())].filter(Boolean).join(' - '));
  align(0);
  text('-'.repeat(width));
  for (const it of job.items || []) {
    tall(true); bold(true);
    const lead = `${it.qty} x `;
    const rows = wrap(it.name, Math.max(8, width - lead.length));
    rows.forEach((r, i) => text(`${i ? ' '.repeat(lead.length) : lead}${r}`));
    tall(false); bold(false);
    if (it.mods) { bold(true); for (const r of wrap(`+ ${it.mods}`, width - 3)) text(`   ${r}`); bold(false); }
    if (it.note) for (const r of wrap(`* ${it.note}`, width - 3)) text(`   ${r}`);
  }
  text('-'.repeat(width));
  if (label) { align(1); text(label); align(0); }

  raw(GS, 0x56, 0x42, 0x00); // cut
  return Buffer.from(b);
}

const sum = (n) => `${String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
const dt = (ts) => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${hm(ts)}`; };

// The guest's bill (sent to the Kassa printer): job.order is the check, job.shop the business's name and check texts.
function bill(job, { width = 48 } = {}) {
  const o = job.order || {}; const s = job.shop || {};
  const b = [];
  const raw = (...x) => b.push(...x);
  const text = (t) => b.push(...encode(t), 0x0a);
  const bold = (on) => raw(ESC, 0x45, on ? 1 : 0);
  const big = (on) => raw(GS, 0x21, on ? 0x11 : 0x00);
  const tall = (on) => raw(GS, 0x21, on ? 0x01 : 0x00);
  const align = (n) => raw(ESC, 0x61, n);
  // "left ........ right" in one row (the left side wraps above when it is long).
  const pair = (l, r, w = width) => {
    const right = String(r);
    const rows = wrap(l, Math.max(8, w - right.length - 1));
    rows.slice(0, -1).forEach((x) => text(x));
    const last = rows[rows.length - 1];
    text(`${last}${' '.repeat(Math.max(1, w - last.length - right.length))}${right}`);
  };
  raw(ESC, 0x40); raw(ESC, 0x74, 17);
  raw(ESC, 0x33, 46); // wider line spacing (46 dots instead of ~30): easier to read
  align(1);
  if (job.late) { bold(true); text(`KECHIKIB CHIQDI (${hm(job.at)})`); bold(false); }
  bold(true); tall(true);
  for (const r of wrap(s.name || '', width)) text(r);
  tall(false); bold(false);
  if (s.address) for (const r of wrap(s.address, width)) text(r);
  if (s.phone) text(s.phone);
  align(0);
  text('-'.repeat(width));
  const place = o.delivery ? `Dostavka #${o.id}` : o.takeaway ? `Olib ketish #${o.id}` : (o.room && o.room.name) || '';
  pair(`Chek #${o.id}${o.status !== 'closed' ? ' (hisob)' : ''}`, place);
  if (o.waiter && !o.takeaway) pair(`Ofitsant: ${o.waiter.name}`, `Mehmon: ${o.guests}`);
  if (o.delivery) {
    for (const [k, v] of [['Mijoz', o.label], ['Tel', o.phone], ['Manzil', o.address], ['Dostavchik', o.waiter && o.waiter.name]]) {
      if (v) for (const r of wrap(`${k}: ${v}`, width)) text(r);
    }
  }
  text(`Ochildi: ${dt(o.opened_at)}`);
  if (o.closed_at) text(`Yopildi: ${dt(o.closed_at)}`);
  text('-'.repeat(width));
  /* The dishes as columns: name | count | sum, one row each (a long name wraps inside its column).
     The same dish (name, price, choices) ordered several times is one row with the total count. */
  const modsOf = (i) => { try { return i.mods ? JSON.parse(i.mods).map((m) => m.name).join(', ') : ''; } catch { return ''; } };
  const QW = 5; const SW = 11; const NW = Math.max(10, width - QW - SW);
  const cols = (name, qty, total) => {
    const rows = wrap(name, NW - 1);
    rows.forEach((r, n) => text(n === 0 ? `${r.padEnd(NW)}${String(qty).padStart(QW)}${String(total).padStart(SW)}` : r));
  };
  const merged = [];
  for (const i of (o.items || []).filter((x) => x.status !== 'cancelled')) {
    const key = `${i.name}|${i.price}|${i.mods || ''}`;
    const m = merged.find((x) => x.key === key);
    if (m) m.qty += i.qty; else merged.push({ ...i, key, qty: i.qty });
  }
  const line = (i) => {
    cols(i.name, i.qty, sum(i.qty * i.price));
    if (modsOf(i)) for (const r of wrap(`+ ${modsOf(i)}`, NW - 3)) text(`  ${r}`);
  };
  bold(true); cols('Nomi', 'Soni', 'Summa'); bold(false);
  text('-'.repeat(width));
  // Under their sections (BAR, OSHXONA…) when the boss chose so in the check settings.
  if (s.receipt_group === true && merged.some((i) => i.category_name)) {
    const groups = new Map();
    for (const i of merged) {
      const k = i.category_name || 'Boshqa';
      if (!groups.has(k)) groups.set(k, { sort: i.category_name ? i.category_sort ?? 0 : 1e9, items: [] });
      groups.get(k).items.push(i);
    }
    for (const [k, g] of [...groups.entries()].sort((x, y) => x[1].sort - y[1].sort)) {
      bold(true); raw(ESC, 0x2d, 1); text(k.toUpperCase()); raw(ESC, 0x2d, 0); bold(false);
      g.items.forEach(line);
    }
  } else merged.forEach(line);
  // The sums go on in the same columns, right under the dishes (no line between).
  cols('Taomlar', '', sum(o.subtotal));
  if (o.service_amount) {
    if (o.service_type === 'per_guest') cols(`Xizmat haqi (${o.guests} kishi)`, o.guests, sum(o.service_amount));
    else cols(`Xizmat haqi ${o.service_pct}%`, '', sum(o.service_amount));
  }
  if (o.discount) cols('Chegirma', '', `-${sum(o.discount)}`);
  text('='.repeat(width));
  bold(true); big(true);
  pair('JAMI', sum(o.total), Math.floor(width / 2));
  big(false); bold(false);
  text('='.repeat(width));
  if (o.guests > 1 && !o.takeaway && s.receipt_per_person !== false) pair(`${o.guests} kishi - har biriga`, sum(Math.round(o.total / o.guests)));
  text('-'.repeat(width));
  if (o.cashier) text(`Kassir: ${o.cashier.name}`);
  // The shop's own lines under the check: bold and double-struck, so they stand out.
  if (s.receipt_footer) { align(1); bold(true); raw(ESC, 0x47, 1); for (const line of String(s.receipt_footer).split('\n')) for (const r of wrap(line, width)) text(r); raw(ESC, 0x47, 0); bold(false); align(0); }
  raw(ESC, 0x32); // line spacing back to the printer's own
  raw(GS, 0x56, 0x42, 0x00);
  return Buffer.from(b);
}

module.exports = { ticket, bill, encode, wrap };
