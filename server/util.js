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
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readJson(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "So'rov juda katta"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, "Noto'g'ri JSON"));
      }
    });
    req.on('error', reject);
  });
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

module.exports = { hashPassword, verifyPassword, newToken, HttpError, readJson, str, int };
