'use strict';
/*
 * Disposable tableware shop ("Bir martalik idishlar"): one product sold by the piece, the pack or the box,
 * at three prices (retail, wholesale, big wholesale). Stock is always kept in pieces.
 * The same code runs in the browser (window.Units) and on the server (require), so both compute the same price.
 *
 * A product: price = retail price of one piece; pack_size = pieces in a pack (0 = no packs);
 * box_size = pieces in a box (0 = no boxes); tiers = JSON { piece: {o, b}, pack: {r, o, b}, box: {r, o, b} }.
 */
(function (root) {
  const UNITS = ['piece', 'pack', 'box'];
  const TIERS = ['r', 'o', 'b'];

  function parseTiers(d) {
    if (d && d.tiers && typeof d.tiers === 'object') return d.tiers;
    try { const v = JSON.parse((d && d.tiers) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  }
  // How many pieces one unit holds; 0 when the product is not sold that way.
  function mult(d, unit) {
    if (unit === 'box') return Number(d.box_size) > 1 ? Number(d.box_size) : 0;
    if (unit === 'pack') return Number(d.pack_size) > 1 ? Number(d.pack_size) : 0;
    return 1;
  }
  function hasUnits(d) { return !!(mult(d, 'box') || mult(d, 'pack')); }
  function unitsOf(d) { return UNITS.filter((u) => mult(d, u)); }

  // The price written in the card for this unit and tier (0 = not written).
  function written(d, unit, tier) {
    if (unit === 'piece' && tier === 'r') return Number(d.price) || 0;
    const t = parseTiers(d)[unit] || {};
    return Number(t[tier]) || 0;
  }
  // The price of one unit: the written one; else the lower tier of the same unit; else the box price shared out;
  // else the piece price times the count. Big wholesale falls back to wholesale, wholesale to retail.
  function price(d, unit, tier) {
    const m = mult(d, unit);
    if (!m) return 0;
    const chain = tier === 'b' ? ['b', 'o', 'r'] : tier === 'o' ? ['o', 'r'] : ['r'];
    for (const tr of chain) {
      const w = written(d, unit, tr);
      if (w) return w;
      if (unit !== 'box') {
        const bm = mult(d, 'box');
        const bw = bm ? written(d, 'box', tr) : 0;
        if (bw) return Math.round((bw * m) / bm);
      }
    }
    return Math.round((Number(d.price) || 0) * m);
  }
  // Which tier a line gets: the customer's (or the one chosen), and big wholesale on its own from N boxes.
  function tierFor(base, unit, qty, bigFrom) {
    const t = TIERS.includes(base) ? base : 'r';
    if (unit === 'box' && bigFrom > 0 && qty >= bigFrom) return 'b';
    return t;
  }
  // "42 karobka + 350 dona": stock (in pieces) in the biggest units.
  function stockText(d, pieces, words) {
    const w = words || { box: 'karobka', pack: 'pachka', piece: 'dona' };
    const n = Math.max(0, Math.round(Number(pieces) || 0));
    const bm = mult(d, 'box');
    const pm = mult(d, 'pack');
    const parts = [];
    let left = n;
    if (bm) { const b = Math.floor(left / bm); if (b) parts.push(`${b} ${w.box}`); left -= b * bm; }
    if (pm && (!bm || pm < bm)) { const p = Math.floor(left / pm); if (p) parts.push(`${p} ${w.pack}`); left -= p * pm; }
    if (left || !parts.length) parts.push(`${left} ${w.piece}`);
    return parts.join(' + ');
  }

  const api = { UNITS, TIERS, parseTiers, mult, hasUnits, unitsOf, written, price, tierFor, stockText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Units = api;
})(typeof window !== 'undefined' ? window : this);
