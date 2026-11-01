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
    if (it.note) for (const r of wrap(`* ${it.note}`, width - 3)) text(`   ${r}`);
  }
  text('-'.repeat(width));
  if (label) { align(1); text(label); align(0); }
  raw(ESC, 0x64, 4); // feed 4 lines
  raw(GS, 0x56, 0x42, 0x00); // cut
  return Buffer.from(b);
}

module.exports = { ticket, encode, wrap };
