'use strict';
process.env.TZ = process.env.TZ || 'Asia/Tashkent';
if (require.main === module) require('./check-node')();

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createPlatform } = require('./platform');
const { scheduleDaily } = require('./backup');
const { HttpError, readJson, readRaw } = require('./util');

const PUBLIC = path.join(__dirname, '..', 'public');
// The platform panel lives at an address only the site owner knows (set PLATFORM_PATH, e.g. /x7k-boshqaruv).
const PLATFORM_PATH = '/' + String(process.env.PLATFORM_PATH || 'platform').replace(/^\/+|\/+$/g, '');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.webp': 'image/webp',
};

// Version of the screens: a hash of everything in public/. Open devices compare it and reload after an update.
function appVersion() {
  const h = crypto.createHash('sha1');
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p); else h.update(f.name).update(fs.readFileSync(p));
    }
  };
  walk(PUBLIC);
  return h.digest('hex').slice(0, 12);
}
const VERSION = appVersion();

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-App-Version': VERSION });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Taqiqlangan' });
  if (pathname === PLATFORM_PATH || pathname.startsWith(PLATFORM_PATH + '/')) file = path.join(PUBLIC, 'platform.html');
  else if (pathname === '/platform.html') file = path.join(PUBLIC, 'index.html');
  else if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  // Code and styles are re-checked on every load (cheap 304), so an update reaches every device at once.
  const st = fs.statSync(file);
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}-${VERSION}"`;
  const media = /\.(png|jpg|webp|svg|ico)$/.test(file) && !file.includes(`${path.sep}icon`);
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': media ? 'public, max-age=86400' : 'no-cache',
    ETag: etag,
  });
  fs.createReadStream(file).pipe(res);
}

function createServer({ dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data') } = {}) {
  const platform = createPlatform(dataDir);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    try {
      // A choyxona's own pictures (logo, desktop background): /media/<code>/<id>
      const media = /^\/media\/([a-z0-9-]+)\/(\d+)$/.exec(pathname);
      if (media) {
        const ctx = platform.byCode(media[1]);
        const a = ctx && ctx.api.getAsset(Number(media[2]));
        if (!a) throw new HttpError(404, 'Topilmadi');
        res.writeHead(200, { 'Content-Type': a.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
        return res.end(a.data);
      }
      if (!pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Ruxsat yo\'q');
        return serveStatic(req, res, pathname);
      }
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token');
      const query = Object.fromEntries(url.searchParams);
      const ip = (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
      // Restoring a backup: the .db file itself is the request body.
      if (pathname === '/api/backup/restore' && req.method === 'POST') {
        const ctx = platform.byToken(token);
        const user = ctx && ctx.api.authenticate(token);
        if (!user) throw new HttpError(401, 'Tizimga kiring');
        if (user.role !== 'owner') throw new HttpError(403, 'Zaxiradan faqat boshliq tiklay oladi');
        const buf = await readRaw(req, 500_000_000);
        if (buf.length < 100 || buf.subarray(0, 15).toString() !== 'SQLite format 3') throw new HttpError(400, "Bu FLOWI zaxira fayli (.db) emas");
        const tmp = path.join(os.tmpdir(), `flowi-restore-${process.pid}-${Date.now()}.db`);
        fs.writeFileSync(tmp, buf);
        try { return send(res, 200, platform.restoreTenant(ctx.id, tmp)); } finally { fs.rmSync(tmp, { force: true }); }
      }
      const body = req.method === 'GET' ? {} : await readJson(req, pathname === '/api/assets' ? 5_000_000 : 1_000_000);
      const reply = (result) => {
        // Handlers may return a file download instead of JSON.
        if (result && result.__file) {
          const f = result.__file;
          res.writeHead(200, { 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${f.name}"`, 'Cache-Control': 'no-store' });
          return res.end(f.body);
        }
        send(res, 200, result === undefined ? null : result);
      };

      // Site owner's panel: choyxonas, subscriptions, boss accounts.
      if (pathname.startsWith('/api/platform/')) return reply(platform.handle(req.method, pathname, { body, query, token, ip }));

      // Login screen: which choyxona does this code belong to?
      if (pathname === '/api/info' && req.method === 'GET') {
        const ctx = platform.byCode(query.code);
        if (!ctx) throw new HttpError(404, 'Bunday kodli choyxona topilmadi');
        const s = ctx.api.settings();
        const pic = (id) => (id ? `/media/${ctx.row.code}/${id}` : null);
        return reply({ code: ctx.row.code, name: s.name, demo: s.demo === '1', blocked: ctx.row.status !== 'active',
          business_type: ctx.api.businessType(), logo: pic(s.logo), lock_bg: { ...s.lock_bg, url: pic(s.lock_bg.image) },
          support: platform.supportFor(ctx.row), version: VERSION });
      }

      // Every other request belongs to one choyxona: found by the code at login, by the token afterwards.
      const byCode = pathname === '/api/login' || pathname === '/api/device/register';
      const ctx = byCode ? platform.byCode(body.code) : platform.byToken(token);
      if (!ctx) throw new HttpError(byCode ? 404 : 401, byCode ? 'Bunday kodli choyxona topilmadi' : 'Tizimga kiring');
      if (byCode) platform.assertActive(ctx);
      else if (ctx.row.status !== 'active') throw new HttpError(401, 'Choyxona bloklangan');
      const { api } = ctx;

      if (pathname === '/api/events' && req.method === 'GET') {
        const user = api.authenticate(token);
        if (!user) throw new HttpError(401, 'Tizimga kiring');
        return ctx.hub.subscribe(req, res, user);
      }

      const found = api.match(req.method, pathname);
      if (!found) throw new HttpError(404, 'Topilmadi');
      const { route, params } = found;
      let user = null;
      let device = null;
      if (route.roles === 'device') {
        // The shared staff-list screen authenticates as a device, not as a person.
        device = api.authenticateDevice(token);
        if (!device) throw new HttpError(401, 'Qurilma ulanmagan');
      } else if (route.roles) {
        user = api.authenticate(token);
        if (!user) throw new HttpError(401, 'Tizimga kiring');
        if (!route.roles.includes(user.role)) throw new HttpError(403, "Sizda bu amal uchun huquq yo'q");
        api.guard(route, user, req.headers['x-finance']);
      }
      reply(route.handler({ user, device, params, body, query, token, ip }));
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error(err);
      send(res, 500, { error: 'Serverda xatolik' });
    }
  });
  server.on('close', () => platform.close());
  server.version = VERSION;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  scheduleDaily(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  XATO: ${port}-port band. Dastur allaqachon ochiq bo'lishi mumkin — brauzerda http://localhost:${port} ni oching.\n  Yoki boshqa port bilan ishga tushiring: PORT=3001\n`);
    } else console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    const lan = Object.values(require('node:os').networkInterfaces()).flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => `http://${a.address}:${port}`);
    console.log(`\n  FLOWI ishga tushdi!\n\n  Shu kompyuterda:   http://localhost:${port}`);
    if (lan.length) console.log(`  Telefonlardan (shu Wi-Fi):  ${lan.join('   ')}`);
    console.log(`  Platforma (siz uchun): http://localhost:${port}${PLATFORM_PATH}`);
    console.log(`\n  To'xtatish uchun shu oynani yoping yoki Ctrl+C bosing.\n`);
  });
}

module.exports = { createServer };
