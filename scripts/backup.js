'use strict';
// Consistent SQLite backup while the app is running: node scripts/backup.js [db] [dir]
// Keeps the last 30 copies.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const db = process.argv[2] || process.env.DB_FILE || path.join(__dirname, '..', 'data', 'choyxona.db');
const dir = process.argv[3] || path.join(path.dirname(db), 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const out = path.join(dir, `choyxona-${stamp}.db`);
new DatabaseSync(db).exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
const old = fs.readdirSync(dir).filter((f) => f.startsWith('choyxona-')).sort().slice(0, -30);
for (const f of old) fs.unlinkSync(path.join(dir, f));
console.log(`Zaxira nusxa: ${out}`);
