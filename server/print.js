'use strict';
/*
 * Kitchen tickets on paper. A shared device (a computer with a printer) is switched on as an order printer and
 * chooses what it prints: only dishes cooked in the kitchen (not tea, bread, drinks), and optionally only some
 * sections — the kebab stand gets kebabs, the bar gets drinks.
 * - Every ticket is written to print_jobs first; each printer asks for the jobs after the last one it printed.
 *   A printer that was off prints what it missed (up to 3 hours back) as soon as it comes back.
 * - A printer that has not asked for a while counts as off: the staff see a warning.
 * - A ticket can be printed again (paper ran out, the ticket got lost).
 * Several printers on one computer (optional, "print_agent" in the settings): the small FLOWI Printer program
 * runs on the business's computer, tells the server which printers it sees (USB / installed in Windows), and
 * prints ESC/POS tickets the server draws — to those, or straight to network printers by IP (port 9100).
 * The boss names each printer (Oshxona, Shashlikchi) and chooses its sections in Settings → Printerlar.
 */
const { HttpError, str, int } = require('./util');
const { ticket, bill } = require('./escpos');
const { billRaster } = require('./raster');
const MIN = 60 * 1000;
const CATCH_UP = 3 * 60 * MIN; // missed tickets older than this are not printed any more
const ONLINE = 90 * 1000; // a printer that asked within this time is "on"
const KEEP = 2 * 24 * 60 * MIN;

function createPrint(db, { now, events, audit, settings, newToken, devicePrefix }) {
  const q = (sql) => db.prepare(sql);
  const maxId = () => q('SELECT COALESCE(MAX(id), 0) m FROM print_jobs').get().m;
  let lastPrune = 0;

  // A ticket for every printer: new dishes, a cancellation or a reprint.
  function job(kind, data, printerId = null) {
    const t = now();
    q('INSERT INTO print_jobs (kind, order_id, data, created_at, printer_id) VALUES (?, ?, ?, ?, ?)').run(kind, data.order_id || null, JSON.stringify({ ...data, kind }), t, printerId);
    if (t - lastPrune > 60 * MIN) { q('DELETE FROM print_jobs WHERE created_at < ?').run(t - KEEP); lastPrune = t; }
    events.publish('order_print', {}, { roles: ['device'] });
  }

  // A printer's sections: null = every section ('all'; '' on a device never set up), a list = only those (empty = none).
  const catsOf = (d) => {
    const v = d.print_cats;
    if (v === 'all' || v === '' || v == null) return null;
    try { return JSON.parse(v).map(Number).filter(Boolean); } catch { return null; }
  };
  const catsText = (cats) => (cats === null ? 'all' : JSON.stringify(cats));
  /* What one printer prints of a job (d: { key, bill, orders, print_all, print_cats }):
     - the guest's bill: only the one bill printer it was sent to;
     - order tickets (new dishes, cancellations, a deleted check, a reprint): only the dishes of its sections. */
  function forDevice(d, data) {
    if (data.kind === 'bill') return d.bill && data.to === d.key ? data : null;
    if (d.orders === 0 || d.orders === false) return null;
    const cats = catsOf(d);
    const items = (data.items || []).filter((i) => (d.print_all || i.cook !== false) && (cats === null || cats.includes(Number(i.category_id))));
    return items.length ? { ...data, items } : null;
  }
  const devView = (d) => ({ key: `d${d.id}`, bill: !!d.print_bill, orders: d.print_orders ?? 1, print_all: d.print_all, print_cats: d.print_cats });
  const prnView = (p) => ({ key: `p${p.id}`, bill: !!p.bill, orders: p.orders ?? 1, print_all: p.print_all, print_cats: p.cats });

  /* The bill printer a guest's bill goes to: one only (so it never comes out twice), an online one first.
     null: no printer is set for bills — the bill is printed by the device where it was asked for, as before. */
  function billTarget() {
    const list = [];
    for (const d of q('SELECT * FROM devices WHERE agent = 0 AND printer = 1 AND print_bill = 1 ORDER BY id').all()) {
      list.push({ to: `d${d.id}`, name: d.name, online: d.print_seen > now() - ONLINE });
    }
    if (agentOn()) {
      for (const p of q('SELECT p.*, d.print_seen FROM printers p JOIN devices d ON d.id = p.device_id WHERE p.on_ = 1 AND p.bill = 1 AND d.agent = 1 ORDER BY p.id').all()) {
        list.push({ to: `p${p.id}`, name: p.label || p.sys_name || p.ip, online: p.print_seen > now() - ONLINE && !(p.error_at > (p.printed_at || 0)) });
      }
    }
    return list.find((x) => x.online) || list[0] || null;
  }

  // ---------- The printer device ----------
  function config({ device }) {
    return { on: !!device.printer, all: !!device.print_all, cats: catsOf(device), bill: !!device.print_bill, orders: (device.print_orders ?? 1) === 1,
      categories: q('SELECT id, name FROM categories ORDER BY sort, name').all() };
  }
  function setConfig({ device, body }) {
    const on = body.on ? 1 : 0;
    const cats = body.cats === undefined ? catsOf(device) : catsInput(body.cats);
    // Switched on now: start from the next ticket (not yesterday's pile).
    const upto = on && !device.printer ? maxId() : device.print_upto || 0;
    const bill = body.bill === undefined ? device.print_bill || 0 : body.bill ? 1 : 0;
    const orders = body.orders === undefined ? device.print_orders ?? 1 : body.orders ? 1 : 0;
    q('UPDATE devices SET printer = ?, print_all = ?, print_cats = ?, print_upto = ?, print_seen = ?, print_bill = ?, print_orders = ? WHERE id = ?')
      .run(on, body.all ? 1 : 0, catsText(cats), upto, on ? now() : null, bill, orders, device.id);
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
      if (r.printer_id) continue;
      const x = forDevice(devView(device), JSON.parse(r.data));
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
    return q('SELECT * FROM print_jobs WHERE printer_id IS NULL ORDER BY id DESC LIMIT 40').all()
      .map((r) => { const x = forDevice(devView(device), JSON.parse(r.data)); return x && { id: r.id, at: r.created_at, ...x }; }).filter(Boolean).slice(0, 15);
  }

  // ---------- Several printers on one computer: the FLOWI Printer program ----------
  const agentOn = () => !!settings().print_agent;
  const printerRow = (id) => {
    const p = q('SELECT * FROM printers WHERE id = ?').get(id);
    if (!p) throw new HttpError(404, 'Printer topilmadi');
    return p;
  };
  // The program says which printers Windows has; new ones are added switched off, the rest keep their settings.
  function agentReport({ device, body }) {
    if (!device.agent) throw new HttpError(403, 'Bu qurilma printer dasturi emas');
    // (PowerShell sends a single printer as an object, not a list.)
    const list = Array.isArray(body.printers) ? body.printers.slice(0, 50) : body.printers && typeof body.printers === 'object' ? [body.printers] : [];
    const seen = now();
    const wasOff = !(device.print_seen > seen - ONLINE);
    let added = false;
    for (const x of list) {
      const name = str(x.name, 'Printer', { max: 200 });
      if (!name) continue;
      const port = str(x.port, 'Port', { max: 200 });
      const ex = q("SELECT id FROM printers WHERE device_id = ? AND kind = 'win' AND sys_name = ?").get(device.id, name);
      if (ex) q('UPDATE printers SET port_name = ?, seen_at = ? WHERE id = ?').run(port, seen, ex.id);
      else { q("INSERT INTO printers (device_id, kind, sys_name, port_name, label, seen_at, created_at) VALUES (?, 'win', ?, ?, '', ?, ?)").run(device.id, name, port, seen, seen); added = true; }
    }
    q('UPDATE devices SET print_seen = ?, agent_version = ? WHERE id = ?').run(seen, str(body.version, 'Versiya', { max: 20 }), device.id);
    // Only news is announced (a new printer, the computer back on): the settings page is not reloaded every minute.
    if (added || wasOff) events.publish('printers');
    return { ok: true, enabled: agentOn() };
  }
  const width = (p) => (p.paper === 58 ? 32 : 48);
  // The check's logo (a PNG the boss uploaded) for the bill picture; none when switched off or not a PNG.
  function logoOf(shop) {
    if (!shop || shop.receipt_logo === false) return null;
    const id = shop.receipt_logo_id || shop.logo;
    if (!id) return null;
    const a = q('SELECT mime, data FROM assets WHERE id = ?').get(Number(id));
    return a && a.mime === 'image/png' ? Buffer.from(a.data) : null;
  }
  // The tickets for every printer of this computer, drawn as ESC/POS bytes.
  function agentJobs({ device }) {
    if (!device.agent) throw new HttpError(403, 'Bu qurilma printer dasturi emas');
    const wasOff = !(device.print_seen > now() - ONLINE);
    q('UPDATE devices SET print_seen = ? WHERE id = ?').run(now(), device.id);
    if (wasOff) events.publish('printers');
    if (!agentOn()) return { enabled: false, jobs: [] };
    const out = [];
    for (const p of q('SELECT * FROM printers WHERE device_id = ? AND on_ = 1').all(device.id)) {
      const rows = q('SELECT * FROM print_jobs WHERE id > ? AND created_at > ? AND (printer_id IS NULL OR printer_id = ?) ORDER BY id LIMIT 30')
        .all(p.upto || 0, now() - CATCH_UP, p.id);
      let skipTo = null;
      for (const r of rows) {
        const data = JSON.parse(r.data);
        const x = r.printer_id ? data : forDevice(prnView(p), data);
        if (!x) { skipTo = r.id; continue; }
        const job = { ...x, late: now() - r.created_at > 2 * MIN };
        // The guest's bill: a picture in the business's font (or plain text for a printer that cannot print pictures).
        const bytes = x.kind !== 'bill' ? ticket(job, { width: width(p), label: p.label })
          : p.plain ? bill(job, { width: width(p) }) : billRaster(job, { paper: p.paper === 58 ? 58 : 80, logo: logoOf(x.shop) });
        out.push({ printer_id: p.id, upto: r.id, kind: p.kind, target: p.kind === 'net' ? p.ip : p.sys_name, port: p.port || 9100, data: bytes.toString('base64') });
        skipTo = null;
        break; // one ticket per printer per round: printed in order, each acknowledged
      }
      if (skipTo) q('UPDATE printers SET upto = ? WHERE id = ?').run(skipTo, p.id);
    }
    return { enabled: true, jobs: out };
  }
  function agentAck({ device, body }) {
    const p = printerRow(int(body.printer_id, 'Printer', { min: 1, required: true }));
    if (p.device_id !== device.id) throw new HttpError(403, 'Bu printer boshqa kompyuterniki');
    if (body.error) {
      q('UPDATE printers SET error = ?, error_at = ? WHERE id = ?').run(str(body.error, 'Xato', { max: 300 }), now(), p.id);
      events.publish('printers');
      return { ok: true };
    }
    const upto = Number(body.upto) || 0;
    if (upto > (p.upto || 0)) q("UPDATE printers SET upto = ?, error = '', printed_at = ? WHERE id = ?").run(Math.min(upto, maxId()), now(), p.id);
    if (p.error) events.publish('printers');
    return { ok: true };
  }

  // ---------- Settings → Printerlar (the boss) ----------
  function setup() {
    const cats = q('SELECT id, name FROM categories ORDER BY sort, name').all();
    const agents = q('SELECT * FROM devices WHERE agent = 1 ORDER BY id').all().map((d) => ({
      id: d.id, name: d.name, online: d.print_seen > now() - ONLINE, seen: d.print_seen || null, version: d.agent_version || '',
      printers: q('SELECT * FROM printers WHERE device_id = ? ORDER BY kind DESC, id').all(d.id).map((p) => ({
        id: p.id, kind: p.kind, sys_name: p.sys_name, port_name: p.port_name, ip: p.ip, port: p.port, label: p.label, on: !!p.on_, all: !!p.print_all,
        cats: catsOf({ print_cats: p.cats }), bill: !!p.bill, orders: (p.orders ?? 1) === 1, plain: !!p.plain, paper: p.paper || 80, error: p.error_at > (p.printed_at || 0) ? p.error : '',
        present: p.kind === 'net' || p.seen_at > now() - 5 * MIN,
      })),
    }));
    const browsers = q('SELECT * FROM devices WHERE agent = 0 ORDER BY name').all().map((d) => ({
      id: d.id, name: d.name, on: !!d.printer, all: !!d.print_all, cats: catsOf(d), bill: !!d.print_bill, orders: (d.print_orders ?? 1) === 1, online: d.print_seen > now() - ONLINE, seen: d.last_seen || null,
    }));
    return { enabled: agentOn(), agents, browsers, categories: cats, warnings: warnings(agents, browsers, cats) };
  }
  // What the boss should know: a section no printer takes, a section on two printers, bills with no printer.
  function warnings(agents, browsers, cats) {
    const live = [...browsers.filter((d) => d.on).map((d) => ({ ...d, label: d.name })),
      ...(agentOn() ? agents.flatMap((a) => a.printers.filter((p) => p.on).map((p) => ({ ...p, label: p.label || p.sys_name || p.ip }))) : [])];
    const takers = (c) => live.filter((p) => p.orders && (p.cats === null || p.cats.includes(c.id)));
    return {
      none: live.length ? cats.filter((c) => !takers(c).length).map((c) => c.name) : [],
      twice: cats.map((c) => ({ name: c.name, printers: takers(c).map((p) => p.label) })).filter((x) => x.printers.length > 1),
      bill: live.filter((p) => p.bill).map((p) => p.label),
      any: live.length > 0,
    };
  }
  // 'all' (or nothing sent) = every section; a list = only those; an empty list = none.
  function catsInput(v) {
    if (v === 'all' || v == null) return null;
    if (!Array.isArray(v)) throw new HttpError(400, "Bo'limlar noto'g'ri");
    return [...new Set(v.map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 100);
  }
  function savePrinter({ user, params, body }) {
    const p = printerRow(params.id);
    const on = body.on === undefined ? p.on_ : body.on ? 1 : 0;
    const cats = body.cats === undefined ? p.cats : catsText(catsInput(body.cats));
    const paper = body.paper === undefined ? p.paper || 80 : Number(body.paper) === 58 ? 58 : 80;
    // Switched on now: start from the next ticket.
    const upto = on && !p.on_ ? maxId() : p.upto;
    if (body.plain !== undefined) q('UPDATE printers SET plain = ? WHERE id = ?').run(body.plain ? 1 : 0, p.id);
    q('UPDATE printers SET label = ?, on_ = ?, print_all = ?, cats = ?, paper = ?, upto = ?, bill = ?, orders = ?, ip = ?, port = ? WHERE id = ?').run(
      body.label !== undefined ? str(body.label, 'Nomi', { max: 40 }) : p.label, on, body.all === undefined ? p.print_all : body.all ? 1 : 0,
      cats, paper, upto, body.bill === undefined ? p.bill || 0 : body.bill ? 1 : 0, body.orders === undefined ? p.orders ?? 1 : body.orders ? 1 : 0,
      p.kind === 'net' && body.ip !== undefined ? ipInput(body.ip) : p.ip, p.kind === 'net' && body.port !== undefined ? portInput(body.port) : p.port, p.id);
    audit(user, 'printer_set', `${body.label || p.label || p.sys_name || p.ip}: ${on ? 'yoqildi' : "o'chirildi"}`);
    events.publish('printers');
    return setup();
  }
  const ipInput = (v) => {
    const ip = str(v, 'IP manzil', { required: true, max: 64 });
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^[a-z0-9.-]+$/i.test(ip)) throw new HttpError(400, "IP manzil noto'g'ri (masalan 192.168.1.100)");
    return ip;
  };
  const portInput = (v) => int(v, 'Port', { min: 1, max: 65535, def: 9100 });
  // A network printer, reached by IP from the computer running the program.
  function addNet({ user, body }) {
    const d = q('SELECT * FROM devices WHERE id = ? AND agent = 1').get(int(body.device_id, 'Kompyuter', { min: 1, required: true }));
    if (!d) throw new HttpError(404, 'Printer dasturi o\'rnatilgan kompyuter topilmadi');
    const ip = ipInput(body.ip); const port = portInput(body.port);
    const id = Number(q("INSERT INTO printers (device_id, kind, ip, port, label, on_, cats, upto, created_at) VALUES (?, 'net', ?, ?, ?, 1, ?, ?, ?)")
      .run(d.id, ip, port, str(body.label, 'Nomi', { max: 40 }) || ip, catsText(catsInput(body.cats)), maxId(), now()).lastInsertRowid);
    audit(user, 'printer_add', `${ip}:${port}`);
    events.publish('printers');
    return { id, ...setup() };
  }
  function removePrinter({ user, params }) {
    const p = printerRow(params.id);
    q('DELETE FROM printers WHERE id = ?').run(p.id);
    audit(user, 'printer_remove', p.label || p.sys_name || p.ip);
    events.publish('printers');
    return setup();
  }
  function testPrinter({ user, params }) {
    const p = printerRow(params.id);
    job('test', { test: true, room: p.label || 'Printer', waiter: user.name, at: now(), items: [{ qty: 1, name: 'Printer ishlayapti' }] }, p.id);
    return { ok: true };
  }
  // The program for one computer: a device of its own (its token goes into the downloaded file).
  function newAgent({ user, body }) {
    const name = str(body.name, 'Kompyuter nomi', { max: 40 }) || 'Kassa kompyuteri';
    const token = devicePrefix + newToken();
    const id = Number(q('INSERT INTO devices (token, name, created_by, created_at, last_seen, agent) VALUES (?, ?, ?, ?, ?, 1)').run(token, name, user.id, now(), now()).lastInsertRowid);
    audit(user, 'printer_agent', name);
    return { id, token, name };
  }
  function removeAgent({ user, params }) {
    const d = q('SELECT * FROM devices WHERE id = ? AND agent = 1').get(params.id);
    if (!d) throw new HttpError(404, 'Topilmadi');
    q('DELETE FROM printers WHERE device_id = ?').run(d.id);
    q('DELETE FROM devices WHERE id = ?').run(d.id);
    audit(user, 'printer_agent_remove', d.name);
    events.publish('printers');
    return setup();
  }
  // A browser device's printer, set by the boss (no longer by whoever stands at the computer).
  function setBrowser({ user, params, body }) {
    const d = q('SELECT * FROM devices WHERE id = ? AND agent = 0').get(params.id);
    if (!d) throw new HttpError(404, 'Qurilma topilmadi');
    setConfig({ device: d, body: { on: body.on, all: body.all, cats: body.cats, bill: body.bill, orders: body.orders } });
    audit(user, 'printer_set', `${d.name}: ${body.on ? 'yoqildi' : "o'chirildi"}`);
    return setup();
  }

  // ---------- For the staff ----------
  function status() {
    const browsers = q('SELECT id, name, print_seen FROM devices WHERE printer = 1 AND agent = 0 ORDER BY name').all()
      .map((d) => ({ id: d.id, name: d.name, online: d.print_seen > now() - ONLINE, seen: d.print_seen || null }));
    if (!agentOn()) return browsers;
    const agents = q(`SELECT p.id, p.label, p.sys_name, p.ip, p.error, p.error_at, p.printed_at, d.print_seen, d.name dev FROM printers p JOIN devices d ON d.id = p.device_id
      WHERE p.on_ = 1 AND d.agent = 1 ORDER BY p.id`).all()
      .map((p) => ({ id: `a${p.id}`, name: p.label || p.sys_name || p.ip, online: p.print_seen > now() - ONLINE && !(p.error_at > (p.printed_at || 0)), seen: p.print_seen || null }));
    return [...browsers, ...agents];
  }

  return { job, billTarget, config, setConfig, pending, ack, recent, status, agentReport, agentJobs, agentAck, setup, savePrinter, addNet, removePrinter, testPrinter, newAgent, removeAgent, setBrowser };
}

module.exports = { createPrint };
