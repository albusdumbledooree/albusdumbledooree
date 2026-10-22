'use strict';
/*
 * Backups of the SQLite files, made while the app keeps running (VACUUM INTO gives a consistent copy).
 * - backupAll(): platform + every choyxona into data/backups/<stamp>/, the last 30 kept.
 *   BACKUP_COPY_DIR (e.g. a mounted second disk or cloud folder) gets the same copy;
 *   BACKUP_HOOK is a shell command run afterwards (e.g. "rclone copy data/backups remote:flowi").
 * - snapshot(): one database into a single file, for downloads and before a restore.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const KEEP = 30;
const stampNow = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);

function snapshot(srcFile, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (fs.existsSync(outFile)) fs.rmSync(outFile);
  const db = new DatabaseSync(srcFile);
  try {
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec(`VACUUM INTO '${outFile.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  return outFile;
}

function dbFiles(dataDir) {
  const files = [];
  for (const dir of [dataDir, path.join(dataDir, 'tenants')]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.db')) files.push(path.join(dir, f));
  }
  return files;
}

function prune(dir) {
  if (!fs.existsSync(dir)) return;
  const old = fs.readdirSync(dir).filter((d) => /^\d{4}-/.test(d)).sort().slice(0, -KEEP);
  for (const d of old) fs.rmSync(path.join(dir, d), { recursive: true, force: true });
}

function backupAll(dataDir, backupDir = path.join(dataDir, 'backups')) {
  const files = dbFiles(dataDir);
  if (!files.length) throw new Error(`Baza topilmadi: ${dataDir}`);
  const target = path.join(backupDir, stampNow());
  for (const file of files) snapshot(file, path.join(target, path.relative(dataDir, file)));
  prune(backupDir);
  const copyDir = process.env.BACKUP_COPY_DIR;
  if (copyDir) {
    try {
      fs.cpSync(target, path.join(copyDir, path.basename(target)), { recursive: true });
      prune(copyDir);
    } catch (e) { console.error('BACKUP_COPY_DIR:', e.message); }
  }
  if (process.env.BACKUP_HOOK) {
    execFile('/bin/sh', ['-c', process.env.BACKUP_HOOK], { cwd: path.join(dataDir, '..') }, (err) => {
      if (err) console.error('BACKUP_HOOK:', err.message);
    });
  }
  return { dir: target, count: files.length };
}

// Dated copies of one choyxona's file, newest first: [{ stamp, file }].
function listTenantBackups(dataDir, relFile, backupDir = path.join(dataDir, 'backups')) {
  const out = [];
  for (const sub of ['', 'pre-restore']) {
    const dir = path.join(backupDir, sub);
    if (!fs.existsSync(dir)) continue;
    for (const d of fs.readdirSync(dir)) {
      if (!/^\d{4}-/.test(d)) continue;
      const f = path.join(dir, d, relFile);
      if (fs.existsSync(f)) out.push({ stamp: d, kind: sub || 'daily', file: f, size: fs.statSync(f).size });
    }
  }
  return out.sort((a, b) => b.stamp.localeCompare(a.stamp));
}

// Runs backupAll once a day (first run a minute after start if the newest backup is older than a day).
function scheduleDaily(dataDir) {
  const backupDir = path.join(dataDir, 'backups');
  const run = () => {
    try {
      const newest = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter((d) => /^\d{4}-/.test(d)).sort().pop() : null;
      const age = newest ? Date.now() - fs.statSync(path.join(backupDir, newest)).mtimeMs : Infinity;
      if (age > 20 * 3600 * 1000) backupAll(dataDir, backupDir);
    } catch (e) { console.error('Zaxira xatosi:', e.message); }
  };
  const first = setTimeout(run, 60 * 1000);
  const every = setInterval(run, 3600 * 1000);
  first.unref(); every.unref();
}

module.exports = { snapshot, backupAll, listTenantBackups, scheduleDaily, stampNow };
