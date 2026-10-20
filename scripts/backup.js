'use strict';
// Consistent backup of every database (platform + all choyxonas) while the app is running:
//   node scripts/backup.js [dataDir] [backupDir]
// Each run creates one dated folder; the last 30 are kept.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.resolve(process.argv[2] || process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const backupDir = path.resolve(process.argv[3] || path.join(dataDir, 'backups'));
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const target = path.join(backupDir, stamp);

const files = [];
for (const dir of [dataDir, path.join(dataDir, 'tenants')]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.db')) files.push(path.join(dir, f));
}
if (!files.length) {
  console.error(`Baza topilmadi: ${dataDir}`);
  process.exit(1);
}
for (const file of files) {
  const out = path.join(target, path.relative(dataDir, file));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  db.close();
}
const old = fs.readdirSync(backupDir).filter((d) => /^\d{4}-/.test(d)).sort().slice(0, -30);
for (const d of old) fs.rmSync(path.join(backupDir, d), { recursive: true, force: true });
console.log(`Zaxira nusxa (${files.length} ta baza): ${target}`);
