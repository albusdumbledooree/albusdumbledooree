'use strict';
/*
 * The boss may look up a worker's PIN and password (Xodimlar → 👁). The login check still uses the one-way hash;
 * next to it a copy is kept encrypted (AES-256-GCM). The key is a file on the server (data/secret.key, made once),
 * never in the code and never in a business's database, so a database file or backup alone does not reveal them.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createSecretBox(dataDir) {
  const file = path.join(dataDir, 'secret.key');
  let key = null;
  function load() {
    if (key) return key;
    try {
      key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
    } catch {
      key = null;
    }
    if (!key || key.length !== 32) {
      key = crypto.randomBytes(32);
      fs.writeFileSync(file, key.toString('hex'), { mode: 0o600 });
    }
    return key;
  }
  function seal(text) {
    if (text == null || text === '') return null;
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', load(), iv);
    const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
  }
  // null when there is nothing kept (set before this version) or the key does not match (moved to another server).
  function open(value) {
    const m = /^v1:([^:]+):([^:]+):(.*)$/.exec(String(value || ''));
    if (!m) return null;
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', load(), Buffer.from(m[1], 'base64'));
      d.setAuthTag(Buffer.from(m[2], 'base64'));
      return Buffer.concat([d.update(Buffer.from(m[3], 'base64')), d.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
  return { seal, open };
}

// For a database opened without a server (tools, tests): nothing is kept, nothing is shown.
const NO_BOX = { seal: () => null, open: () => null };

module.exports = { createSecretBox, NO_BOX };
