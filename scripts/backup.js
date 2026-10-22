'use strict';
// Consistent backup of every database (platform + all choyxonas) while the app is running:
//   node scripts/backup.js [dataDir] [backupDir]
// Each run creates one dated folder; the last 30 are kept. The server also does this by itself once a day.
const path = require('node:path');
const { backupAll } = require('../server/backup');

const dataDir = path.resolve(process.argv[2] || process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const backupDir = path.resolve(process.argv[3] || path.join(dataDir, 'backups'));
try {
  const r = backupAll(dataDir, backupDir);
  console.log(`Zaxira nusxa (${r.count} ta baza): ${r.dir}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
