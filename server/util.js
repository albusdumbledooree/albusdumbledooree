'use strict';
const crypto = require('node:crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

class HttpError extends Error {
  // code: a short word the app reacts to (e.g. 'geo' — show the "you are not at work" screen).
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

// Reads a request body. Too large: the rest is read and dropped so the client still gets a clear 413
// (cutting the connection would show only "connection reset"); a flood far over the limit is cut off.
function readBody(req, limit, message) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let over = false;
    let chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (over) { if (size > limit + 20_000_000) req.destroy(); return; }
      if (size > limit) { over = true; chunks = []; return; }
      chunks.push(c);
    });
    req.on('end', () => (over ? reject(new HttpError(413, message)) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

async function readJson(req, limit = 1_000_000) {
  const buf = await readBody(req, limit, "So'rov juda katta");
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, "Noto'g'ri JSON");
  }
}

function readRaw(req, limit) {
  return readBody(req, limit, 'Fayl juda katta');
}

// Input helpers: throw 400 with an Uzbek message on bad input.
function str(v, field, { required = false, max = 200 } = {}) {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw new HttpError(400, `${field} kiritilmagan`);
  if (s.length > max) throw new HttpError(400, `${field} juda uzun`);
  return s;
}

function int(v, field, { min = 0, max = 1e12, required = false, def = 0 } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${field} kiritilmagan`);
    return def;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || Math.round(n) !== n || n < min || n > max) {
    throw new HttpError(400, `${field} noto'g'ri`);
  }
  return n;
}

module.exports = { hashPassword, verifyPassword, newToken, HttpError, readJson, readRaw, str, int };
