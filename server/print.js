'use strict';
/*
 * Kitchen tickets on paper. A shared device (a computer with a printer) is switched on as an order printer and
 * chooses what it prints: only dishes cooked in the kitchen (not tea, bread, drinks), and optionally only some
 * sections — the kebab stand gets kebabs, the bar gets drinks.
 * - Every ticket is written to print_jobs first; each printer asks for the jobs after the last one it printed.
 *   A printer that was off prints what it missed (up to 3 hours back) as soon as it comes back.
 * - A printer that has not asked for a while counts as off: the staff see a warning.
 * - A ticket can be printed again (paper ran out, the ticket got lost).
 */
const MIN = 60 * 1000;
const CATCH_UP = 3 * 60 * MIN; // missed tickets older than this are not printed any more
const ONLINE = 90 * 1000; // a printer that asked within this time is "on"
const KEEP = 2 * 24 * 60 * MIN;

function createPrint(db, { now, events, audit }) {
  const q = (sql) => db.prepare(sql);
  const maxId = () => q('SELECT COALESCE(MAX(id), 0) m FROM print_jobs').get().m;
  let lastPrune = 0;

  // A ticket for every printer: new dishes, a cancellation or a reprint.
  function job(kind, data) {
    const t = now();
    q('INSERT INTO print_jobs (kind, order_id, data, created_at) VALUES (?, ?, ?, ?)').run(kind, data.order_id, JSON.stringify({ ...data, kind }), t);
    if (t - lastPrune > 60 * MIN) { q('DELETE FROM print_jobs WHERE created_at < ?').run(t - KEEP); lastPrune = t; }
    events.publish('order_print', {}, { roles: ['device'] });
  }

  const catsOf = (d) => { try { return JSON.parse(d.print_cats || '[]').map(Number).filter(Boolean); } catch { return []; } };
  // What this printer prints of a ticket: kitchen dishes only unless "everything", and only its sections if chosen.
  function forDevice(d, data) {
    const cats = catsOf(d);
    const items = (data.items || []).filter((i) => (d.print_all || i.cook !== false) && (!cats.length || cats.includes(Number(i.category_id))));
    return items.length ? { ...data, items } : null;
  }

  // ---------- The printer device ----------
  function config({ device }) {
    return { on: !!device.printer, all: !!device.print_all, cats: catsOf(device),
      categories: q('SELECT id, name FROM categories ORDER BY sort, name').all() };
  }
  function setConfig({ device, body }) {
    const on = body.on ? 1 : 0;
    const cats = Array.isArray(body.cats) ? [...new Set(body.cats.map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 100) : catsOf(device);
    // Switched on now: start from the next ticket (not yesterday's pile).
    const upto = on && !device.printer ? maxId() : device.print_upto || 0;
    q('UPDATE devices SET printer = ?, print_all = ?, print_cats = ?, print_upto = ?, print_seen = ? WHERE id = ?')
      .run(on, body.all ? 1 : 0, JSON.stringify(cats), upto, on ? now() : null, device.id);
    audit(null, 'printer_set', `${device.name}: ${on ? 'yoqildi' : "o'chirildi"}`);
    events.publish('printers');
    return config({ device: q('SELECT * FROM devices WHERE id = ?').get(device.id) });
  }
  // The printer asks for what it has not printed yet (this is also its "I am on" signal).
  function pending({ device }) {
    if (!device.printer) return { jobs: [] };
    const wasOff = !(device.print_seen > now() - ONLINE);
    q('UPDATE devices SET print_seen = ? WHERE id = ?').run(now(), device.id);
    if (wasOff) events.publish('printers');
    const rows = q('SELECT * FROM print_jobs WHERE id > ? AND created_at > ? ORDER BY id LIMIT 50').all(device.print_upto || 0, now() - CATCH_UP);
    const jobs = [];
    for (const r of rows) {
      const x = forDevice(device, JSON.parse(r.data));
      if (x) jobs.push({ id: r.id, late: now() - r.created_at > 2 * MIN, ...x });
    }
    // Nothing for this printer in the rest: move past them.
    if (!jobs.length && rows.length) q('UPDATE devices SET print_upto = ? WHERE id = ?').run(rows[rows.length - 1].id, device.id);
    return { jobs, last: rows.length ? rows[rows.length - 1].id : device.print_upto || 0 };
  }
  function ack({ device, body }) {
    const upto = Number(body.upto) || 0;
    if (upto > (device.print_upto || 0)) q('UPDATE devices SET print_upto = ? WHERE id = ?').run(Math.min(upto, maxId()), device.id);
    return { ok: true };
  }
  // The last tickets of this printer, to print one again by hand.
  function recent({ device }) {
    return q('SELECT * FROM print_jobs ORDER BY id DESC LIMIT 40').all()
      .map((r) => { const x = forDevice(device, JSON.parse(r.data)); return x && { id: r.id, at: r.created_at, ...x }; }).filter(Boolean).slice(0, 15);
  }

  // ---------- For the staff ----------
  function status() {
    return q('SELECT id, name, print_seen FROM devices WHERE printer = 1 ORDER BY name').all()
      .map((d) => ({ id: d.id, name: d.name, online: d.print_seen > now() - ONLINE, seen: d.print_seen || null }));
  }

  return { job, config, setConfig, pending, ack, recent, status };
}

module.exports = { createPrint };
