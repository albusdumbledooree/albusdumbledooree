'use strict';
// Runs before anything else: gives a clear Uzbek message when Node.js is too old,
// and re-launches with --experimental-sqlite on Node 22.5–22.12 where SQLite was behind a flag.
const { spawnSync } = require('node:child_process');

function hasSqlite() {
  try { require('node:sqlite'); return true; } catch { return false; }
}

module.exports = function checkNode() {
  if (hasSqlite()) return;
  const [major, minor] = process.versions.node.split('.').map(Number);
  const flagged = major === 22 && minor >= 5;
  if (flagged && !process.execArgv.includes('--experimental-sqlite')) {
    const r = spawnSync(process.execPath, ['--experimental-sqlite', ...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }
  console.error(`
  XATO: Node.js versiyasi eski (sizda ${process.version}).
  FLOWI uchun Node.js 22.13 yoki undan yangisi kerak.

  1) https://nodejs.org saytiga kiring va "LTS" tugmasini bosib yangi versiyani yuklab o'rnating.
  2) Kompyuterni qayta yoqing (yoki barcha terminal oynalarini yoping).
  3) Dasturni qayta ishga tushiring.
`);
  process.exit(1);
};
