'use strict';
/*
 * The shared catalog, kept by the platform owner in platform.db:
 * - ready dishes (choyxona, restaurant, fast food): a business ticks the ones it serves, types its prices, and they land
 *   in its menu with the section, the emoji, the photo (if the owner added one) and the cooking time;
 * - a barcode base for shops: when a shop saves a product with a real barcode, its name (never its price, stock or
 *   sales) is offered to the base; the owner checks it, and from then on any shop that scans the code gets the name.
 * MXIK (IKPU) codes can be kept on both, for the fiscal check later; they are typed by the owner from tasnif.soliq.uz.
 */
const { HttpError, str, int } = require('./util');

// [name, section, emoji, minutes, cooked in the kitchen]
const DEFAULT_DISHES = [
  ['Osh (palov)', 'Quyuq taomlar', '🍚', 10, 1], ["To'y oshi", 'Quyuq taomlar', '🍚', 10, 1], ['Manti', 'Quyuq taomlar', '🥟', 25, 1],
  ['Dimlama', 'Quyuq taomlar', '🫕', 20, 1], ['Qozon kabob', 'Quyuq taomlar', '🍖', 30, 1], ['Norin', 'Quyuq taomlar', '🍝', 10, 1],
  ['Xonim', 'Quyuq taomlar', '🥟', 25, 1], ["Qovurma lag'mon", 'Quyuq taomlar', '🍜', 20, 1], ['Chuchvara (qovurma)', 'Quyuq taomlar', '🥟', 15, 1],
  ['Jiz', 'Quyuq taomlar', '🍖', 25, 1], ['Kotlet', 'Quyuq taomlar', '🍔', 15, 1], ['Tovuq (qovurilgan)', 'Quyuq taomlar', '🍗', 25, 1],
  ["Sho'rva", 'Suyuq taomlar', '🥣', 10, 1], ["Lag'mon", 'Suyuq taomlar', '🍜', 15, 1], ['Mastava', 'Suyuq taomlar', '🍲', 15, 1],
  ['Chuchvara', 'Suyuq taomlar', '🥟', 12, 1], ["Moshxo'rda", 'Suyuq taomlar', '🥣', 15, 1], ["Mosh sho'rva", 'Suyuq taomlar', '🥣', 15, 1],
  ["Kuza sho'rva", 'Suyuq taomlar', '🍲', 15, 1], ['Ugra osh', 'Suyuq taomlar', '🍜', 15, 1],
  ["Qo'y go'shti kabob", 'Kaboblar', '🍢', 18, 1], ["Mol go'shti kabob", 'Kaboblar', '🍢', 18, 1], ['Jigar kabob', 'Kaboblar', '🍢', 15, 1],
  ['Qiyma kabob (lula)', 'Kaboblar', '🍢', 15, 1], ['Tovuq kabob', 'Kaboblar', '🍢', 15, 1], ['Qanot kabob', 'Kaboblar', '🍗', 18, 1],
  ['Dumba kabob', 'Kaboblar', '🍢', 15, 1], ['Baliq kabob', 'Kaboblar', '🐟', 20, 1], ['Sabzavot kabob', 'Kaboblar', '🫑', 12, 1],
  ['Achchiq-chuchuk', 'Salatlar', '🥗', 5, 1], ['Olivye', 'Salatlar', '🥗', 5, 1], ['Sezar', 'Salatlar', '🥗', 8, 1],
  ['Grek salati', 'Salatlar', '🥗', 8, 1], ['Toshkent salati', 'Salatlar', '🥗', 8, 1], ['Sabzavotli salat', 'Salatlar', '🥗', 5, 1],
  ['Karam salati', 'Salatlar', '🥬', 5, 1], ['Koreyscha sabzi', 'Salatlar', '🥕', 3, 1], ['Suzma', 'Salatlar', '🥛', 2, 1],
  ['Patir non', 'Non va pishiriqlar', '🫓', 0, 0], ['Tandir non', 'Non va pishiriqlar', '🫓', 0, 0], ['Obi non', 'Non va pishiriqlar', '🫓', 0, 0],
  ["Somsa (go'shtli)", 'Non va pishiriqlar', '🥟', 0, 0], ['Qovoq somsa', 'Non va pishiriqlar', '🥟', 0, 0], ["Ko'k somsa", 'Non va pishiriqlar', '🥟', 0, 0],
  ['Gumma', 'Non va pishiriqlar', '🥟', 0, 0],
  ['Kartoshka fri', "Qo'shimchalar", '🍟', 8, 1], ['Guruch (garnir)', "Qo'shimchalar", '🍚', 5, 1], ['Kartoshka pyure', "Qo'shimchalar", '🥔', 5, 1],
  ['Makaron (garnir)', "Qo'shimchalar", '🍝', 5, 1], ['Qatiq', "Qo'shimchalar", '🥛', 0, 0], ['Smetana', "Qo'shimchalar", '🥛', 0, 0],
  ["Ko'k choy (choynak)", 'Ichimliklar', '🫖', 3, 0], ['Qora choy (choynak)', 'Ichimliklar', '🫖', 3, 0], ['Limon choy', 'Ichimliklar', '🍋', 3, 0],
  ['Kofe', 'Ichimliklar', '☕', 3, 0], ['Kompot', 'Ichimliklar', '🍹', 0, 0], ['Ayron', 'Ichimliklar', '🥛', 0, 0],
  ['Meva sharbati', 'Ichimliklar', '🧃', 0, 0], ['Coca-Cola 1 L', 'Ichimliklar', '🥤', 0, 0], ['Fanta 1 L', 'Ichimliklar', '🥤', 0, 0],
  ['Sprite 1 L', 'Ichimliklar', '🥤', 0, 0], ['Suv 0.5 L', 'Ichimliklar', '💧', 0, 0], ['Mineral suv 1 L', 'Ichimliklar', '💧', 0, 0],
  ['Navvot', 'Shirinliklar', '🍬', 0, 0], ['Halva', 'Shirinliklar', '🍬', 0, 0], ['Chak-chak', 'Shirinliklar', '🍯', 0, 0],
  ['Muzqaymoq', 'Shirinliklar', '🍨', 0, 0], ['Meva assorti', 'Shirinliklar', '🍇', 5, 1], ["Tort (bo'lak)", 'Shirinliklar', '🍰', 0, 0],
  ['Lavash', 'Fast food', '🌯', 8, 1], ['Shaurma', 'Fast food', '🌯', 8, 1], ['Burger', 'Fast food', '🍔', 10, 1],
  ['Hot-dog', 'Fast food', '🌭', 5, 1], ['Pitsa', 'Fast food', '🍕', 15, 1], ['Klab sendvich', 'Fast food', '🥪', 8, 1],
];
const SECTION_ICONS = { 'Quyuq taomlar': '🍛', 'Suyuq taomlar': '🍲', Kaboblar: '🍢', Salatlar: '🥗', 'Non va pishiriqlar': '🫓', "Qo'shimchalar": '🍟', Ichimliklar: '🥤', Shirinliklar: '🍰', 'Fast food': '🍔' };
const PHOTO_TYPES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };

// A barcode worth sharing: EAN-13, EAN-8 or UPC-A with a right check digit, and not a shop's own code (EAN prefix 2x).
function realBarcode(code) {
  const s = String(code || '').trim();
  if (!/^\d{8}$|^\d{12,13}$/.test(s) || s.startsWith('2') || /^0+$/.test(s)) return false;
  const digits = s.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
function photoInput(data) {
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m || !PHOTO_TYPES[m[1]]) throw new HttpError(400, 'Faqat JPG, PNG yoki WEBP rasm yuklash mumkin');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1_500_000) throw new HttpError(413, 'Rasm juda katta (1.5 MB dan oshmasin)');
  return { mime: m[1], data: buf };
}

function createCatalog(pdb, { now = Date.now, tenantName = () => '' } = {}) {
  pdb.exec(`
    CREATE TABLE IF NOT EXISTS cat_dishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', emoji TEXT NOT NULL DEFAULT '',
      prep_minutes INTEGER NOT NULL DEFAULT 10, kitchen INTEGER NOT NULL DEFAULT 1, mxik TEXT NOT NULL DEFAULT '',
      photo BLOB, photo_mime TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS cat_dish_uses (dish_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL, PRIMARY KEY (dish_id, tenant_id));
    CREATE TABLE IF NOT EXISTS cat_goods (
      barcode TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT 'dona',
      emoji TEXT NOT NULL DEFAULT '', mxik TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
      source_tenant INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS cat_goods_status ON cat_goods(status, created_at);
    CREATE TABLE IF NOT EXISTS cat_good_sources (barcode TEXT NOT NULL, tenant_id INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, PRIMARY KEY (barcode, tenant_id));
  `);
  const q = (sql) => pdb.prepare(sql);
  if (!q('SELECT COUNT(*) c FROM cat_dishes').get().c) {
    DEFAULT_DISHES.forEach(([name, category, emoji, prep, kitchen], i) => q('INSERT INTO cat_dishes (name, category, emoji, prep_minutes, kitchen, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, category, emoji, prep, kitchen, i, now()));
  }

  const dishRow = (d) => ({ id: d.id, name: d.name, category: d.category, emoji: d.emoji, prep_minutes: d.prep_minutes, kitchen: !!d.kitchen, mxik: d.mxik,
    photo: d.photo_mime ? `/catalog-photo/${d.id}?v=${d.updated_at || d.created_at}` : '' });
  const dishList = () => q('SELECT id, name, category, emoji, prep_minutes, kitchen, mxik, photo_mime, updated_at, created_at FROM cat_dishes WHERE active = 1 ORDER BY sort, id').all().map(dishRow);
  const goodRow = (g) => g && { barcode: g.barcode, name: g.name, category: g.category, unit: g.unit, emoji: g.emoji, mxik: g.mxik, status: g.status };

  // ---------- The platform owner ----------
  function overview({ query = {} } = {}) {
    const term = String(query.q || '').trim().toLowerCase();
    const kind = ['goods', 'pending'].includes(query.kind) ? query.kind : 'dishes';
    const uses = new Map(q('SELECT dish_id, COUNT(*) c FROM cat_dish_uses GROUP BY dish_id').all().map((r) => [r.dish_id, r.c]));
    const dishes = dishList().map((d) => ({ ...d, uses: uses.get(d.id) || 0 }));
    const stats = {
      dishes: dishes.length, sections: new Set(dishes.map((d) => d.category)).size,
      goods: q("SELECT COUNT(*) c FROM cat_goods WHERE status = 'ok'").get().c,
      pending: q("SELECT COUNT(*) c FROM cat_goods WHERE status = 'pending'").get().c,
      mxik_pct: dishes.length ? Math.round((dishes.filter((d) => d.mxik).length / dishes.length) * 100) : 0,
    };
    const match = (...v) => !term || v.some((x) => String(x || '').toLowerCase().includes(term));
    if (kind === 'dishes') return { kind, stats, sections: Object.keys(SECTION_ICONS), rows: dishes.filter((d) => match(d.name, d.category, d.mxik)) };
    const rows = q(`SELECT g.*, (SELECT COUNT(*) FROM cat_good_sources s WHERE s.barcode = g.barcode) shops FROM cat_goods g
      WHERE g.status = ? ORDER BY ${kind === 'pending' ? 'shops DESC, g.created_at' : 'g.name'} LIMIT 500`).all(kind === 'pending' ? 'pending' : 'ok')
      .filter((g) => match(g.barcode, g.name, g.category))
      .map((g) => ({ ...goodRow(g), shops: g.shops, from: g.source_tenant ? tenantName(g.source_tenant) : '',
        names: q('SELECT DISTINCT name FROM cat_good_sources WHERE barcode = ? AND name != ? LIMIT 5').all(g.barcode, g.name).map((r) => r.name) }));
    return { kind, stats, rows };
  }
  function dishInput(body, prev = {}) {
    const pick = (k, fn, def) => (body[k] !== undefined ? fn(body[k]) : prev[k] !== undefined ? prev[k] : def);
    const name = pick('name', (v) => str(v, 'Nomi', { required: true, max: 80 }));
    if (!name) throw new HttpError(400, 'Nomi kiritilishi kerak');
    const mxik = pick('mxik', (v) => String(v || '').replace(/\D/g, ''), '');
    if (mxik && mxik.length !== 17) throw new HttpError(400, "MXIK kodi 17 raqamdan iborat bo'ladi");
    return { name, category: pick('category', (v) => str(v, "Bo'lim", { max: 60 }), ''), emoji: pick('emoji', (v) => str(v, 'Belgi', { max: 8 }), ''),
      prep_minutes: pick('prep_minutes', (v) => int(v, 'Tayyorlash vaqti', { max: 600 }), 10), kitchen: pick('kitchen', (v) => (v ? 1 : 0), 1), mxik };
  }
  function saveDish({ params, body }) {
    const prev = params.id ? q('SELECT * FROM cat_dishes WHERE id = ? AND active = 1').get(params.id) : null;
    if (params.id && !prev) throw new HttpError(404, 'Taom topilmadi');
    const d = dishInput(body, prev || {});
    let id = prev && prev.id;
    if (id) q('UPDATE cat_dishes SET name = ?, category = ?, emoji = ?, prep_minutes = ?, kitchen = ?, mxik = ?, updated_at = ? WHERE id = ?').run(d.name, d.category, d.emoji, d.prep_minutes, d.kitchen, d.mxik, now(), id);
    else id = Number(q('INSERT INTO cat_dishes (name, category, emoji, prep_minutes, kitchen, mxik, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM cat_dishes), ?)')
      .run(d.name, d.category, d.emoji, d.prep_minutes, d.kitchen, d.mxik, now()).lastInsertRowid);
    if (body.photo !== undefined) {
      if (body.photo) { const p = photoInput(body.photo); q('UPDATE cat_dishes SET photo = ?, photo_mime = ?, updated_at = ? WHERE id = ?').run(p.data, p.mime, now(), id); }
      else q("UPDATE cat_dishes SET photo = NULL, photo_mime = '', updated_at = ? WHERE id = ?").run(now(), id);
    }
    return dishRow(q('SELECT * FROM cat_dishes WHERE id = ?').get(id));
  }
  function deleteDish({ params }) {
    if (!q('UPDATE cat_dishes SET active = 0 WHERE id = ?').run(params.id).changes) throw new HttpError(404, 'Taom topilmadi');
    return { ok: true };
  }
  // Checking a name a shop offered: accept (maybe corrected), or refuse.
  function saveGood({ params, body }) {
    const g = q('SELECT * FROM cat_goods WHERE barcode = ?').get(String(params.id));
    if (!g) throw new HttpError(404, 'Tovar topilmadi');
    const status = ['ok', 'rejected', 'pending'].includes(body.status) ? body.status : g.status;
    const mxik = body.mxik !== undefined ? String(body.mxik || '').replace(/\D/g, '') : g.mxik;
    if (mxik && mxik.length !== 17) throw new HttpError(400, "MXIK kodi 17 raqamdan iborat bo'ladi");
    q('UPDATE cat_goods SET name = ?, category = ?, unit = ?, emoji = ?, mxik = ?, status = ?, updated_at = ? WHERE barcode = ?').run(
      body.name !== undefined ? str(body.name, 'Nomi', { required: true, max: 80 }) : g.name,
      body.category !== undefined ? str(body.category, "Bo'lim", { max: 60 }) : g.category,
      body.unit !== undefined ? str(body.unit, "O'lchov", { max: 20 }) || 'dona' : g.unit,
      body.emoji !== undefined ? str(body.emoji, 'Belgi', { max: 8 }) : g.emoji, mxik, status, now(), g.barcode);
    return goodRow(q('SELECT * FROM cat_goods WHERE barcode = ?').get(g.barcode));
  }
  function deleteGood({ params }) {
    q('DELETE FROM cat_goods WHERE barcode = ?').run(String(params.id));
    q('DELETE FROM cat_good_sources WHERE barcode = ?').run(String(params.id));
    return { ok: true };
  }
  function photo(id) {
    const r = q('SELECT photo, photo_mime FROM cat_dishes WHERE id = ? AND active = 1').get(Number(id));
    return r && r.photo_mime ? { mime: r.photo_mime, data: r.photo } : null;
  }

  // ---------- A business ----------
  function forTenant(tenantId) {
    return {
      dishes: dishList,
      dish(id) { return q('SELECT * FROM cat_dishes WHERE id = ? AND active = 1').get(Number(id)) || null; },
      sectionIcon: (name) => SECTION_ICONS[name] || '',
      used(ids) { for (const id of ids) q('INSERT OR IGNORE INTO cat_dish_uses (dish_id, tenant_id) VALUES (?, ?)').run(id, tenantId); },
      // Only names the owner has checked are given out.
      good(barcode) { return goodRow(q("SELECT * FROM cat_goods WHERE barcode = ? AND status = 'ok'").get(String(barcode))); },
      // A shop saved a product: its name is offered to the base (once per shop and code). Nothing about money leaves.
      offer({ barcode, name, category, unit, emoji }) {
        if (!realBarcode(barcode) || !name) return false;
        const code = String(barcode).trim();
        q('INSERT OR REPLACE INTO cat_good_sources (barcode, tenant_id, name, at) VALUES (?, ?, ?, ?)').run(code, tenantId, String(name).slice(0, 80), now());
        q("INSERT OR IGNORE INTO cat_goods (barcode, name, category, unit, emoji, status, source_tenant, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)")
          .run(code, String(name).slice(0, 80), String(category || '').slice(0, 60), String(unit || 'dona').slice(0, 20), String(emoji || '').slice(0, 8), tenantId, now());
        return true;
      },
    };
  }

  return { overview, saveDish, deleteDish, saveGood, deleteGood, photo, forTenant, DEFAULT_DISHES };
}

module.exports = { createCatalog, realBarcode, DEFAULT_DISHES };
