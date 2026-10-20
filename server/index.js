'use strict';
process.env.TZ = process.env.TZ || 'Asia/Tashkent';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('./db');
const { createApi } = require('./api');
const events = require('./events');
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
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': file.endsWith('index.html') || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300',
  });
  fs.createReadStream(file).pipe(res);
}

function createServer({ dbFile = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'choyxona.db') } = {}) {
  const db = open(dbFile);
  const api = createApi(db);

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

      if (pathname === '/api/events' && req.method === 'GET') {
        const user = api.authenticate(token);
        if (!user) throw new HttpError(401, 'Tizimga kiring');
        return events.subscribe(req, res, user);
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
      const body = req.method === 'GET' ? {} : await readJson(req);
      const query = Object.fromEntries(url.searchParams);
      const ip = (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
      const result = route.handler({ user, params, body, query, token, ip });
      send(res, 200, result === undefined ? null : result);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error(err);
      send(res, 500, { error: 'Serverda xatolik' });
    }
  });
  server.db = db;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    console.log(`Choyxona Pro ishga tushdi: http://localhost:${port}`);
  });
}

module.exports = { createServer };
