'use strict';
process.env.TZ = process.env.TZ || 'Asia/Tashkent';
if (require.main === module) require('./check-node')();

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createPlatform } = require('./platform');
const { HttpError, readJson } = require('./util');

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Taqiqlangan' });
  if (pathname === '/platform' || pathname.startsWith('/platform/')) file = path.join(PUBLIC, 'platform.html');
  else if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': file.endsWith('.html') || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300',
  });
  fs.createReadStream(file).pipe(res);
}

function createServer({ dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data') } = {}) {
  const platform = createPlatform(dataDir);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    try {
      if (!pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Ruxsat yo\'q');
        return serveStatic(req, res, pathname);
      }
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token');
      const query = Object.fromEntries(url.searchParams);
      const ip = (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
      const body = req.method === 'GET' ? {} : await readJson(req);
      const reply = (result) => send(res, 200, result === undefined ? null : result);

      // Site owner's panel: choyxonas, subscriptions, boss accounts.
      if (pathname.startsWith('/api/platform/')) return reply(platform.handle(req.method, pathname, { body, query, token, ip }));

      // Login screen: which choyxona does this code belong to?
      if (pathname === '/api/info' && req.method === 'GET') {
        const ctx = platform.byCode(query.code);
        if (!ctx) throw new HttpError(404, 'Bunday kodli choyxona topilmadi');
        const s = ctx.api.settings();
        return reply({ code: ctx.row.code, name: s.name, demo: s.demo === '1', blocked: ctx.row.status !== 'active' });
      }

      // Every other request belongs to one choyxona: found by the code at login, by the token afterwards.
      const ctx = pathname === '/api/login' ? platform.byCode(body.code) : platform.byToken(token);
      if (!ctx) throw new HttpError(pathname === '/api/login' ? 404 : 401, pathname === '/api/login' ? 'Bunday kodli choyxona topilmadi' : 'Tizimga kiring');
      if (pathname === '/api/login') platform.assertActive(ctx);
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
      if (route.roles) {
        user = api.authenticate(token);
        if (!user) throw new HttpError(401, 'Tizimga kiring');
        if (!route.roles.includes(user.role)) throw new HttpError(403, "Sizda bu amal uchun huquq yo'q");
      }
      reply(route.handler({ user, params, body, query, token, ip }));
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error(err);
      send(res, 500, { error: 'Serverda xatolik' });
    }
  });
  server.on('close', () => platform.close());
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  XATO: ${port}-port band. Dastur allaqachon ochiq bo'lishi mumkin — brauzerda http://localhost:${port} ni oching.\n  Yoki boshqa port bilan ishga tushiring: PORT=3001\n`);
    } else console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    const lan = Object.values(require('node:os').networkInterfaces()).flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => `http://${a.address}:${port}`);
    console.log(`\n  Choyxona Pro ishga tushdi!\n\n  Shu kompyuterda:   http://localhost:${port}`);
    if (lan.length) console.log(`  Telefonlardan (shu Wi-Fi):  ${lan.join('   ')}`);
    console.log(`  Platforma (siz uchun): http://localhost:${port}/platform`);
    console.log(`\n  To'xtatish uchun shu oynani yoping yoki Ctrl+C bosing.\n`);
  });
}

module.exports = { createServer };
