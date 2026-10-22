'use strict';
/*
 * Automatic backup into a folder on this computer (Chrome / Edge on a PC).
 * The boss picks a folder once; a "FLOWI zaxira" folder is made inside it and every few hours
 * the whole database of the business is written there as one file (the last 60 are kept).
 * The browser remembers the folder; after a restart it may ask once more for permission.
 */
const FolderBackup = {
  EVERY: 3 * 60 * MIN,
  KEEP: 60,
  supported() { return 'showDirectoryPicker' in window; },

  idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('flowi-folder', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async get(key) {
    try {
      const db = await this.idb();
      return await new Promise((resolve) => {
        const r = db.transaction('kv').objectStore('kv').get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      });
    } catch { return null; }
  },
  async set(key, val) {
    const db = await this.idb();
    await new Promise((resolve, reject) => {
      const txn = db.transaction('kv', 'readwrite');
      if (val === null) txn.objectStore('kv').delete(key); else txn.objectStore('kv').put(val, key);
      txn.oncomplete = resolve;
      txn.onerror = () => reject(txn.error);
    });
  },
  key() { return `dir:${App.device ? App.device.code : ''}`; },

  // Returns { dir, state: 'none' | 'granted' | 'prompt' }.
  async status() {
    if (!this.supported() || !App.device) return { state: 'none' };
    const dir = await this.get(this.key());
    if (!dir) return { state: 'none' };
    let state = 'prompt';
    try { state = await dir.queryPermission({ mode: 'readwrite' }); } catch { /* ignore */ }
    return { dir, state: state === 'granted' ? 'granted' : 'prompt', last: await this.get(`${this.key()}:last`) };
  },

  async pick() {
    const parent = await window.showDirectoryPicker({ id: 'flowi-backup', mode: 'readwrite', startIn: 'documents' });
    const dir = await parent.getDirectoryHandle('FLOWI zaxira', { create: true });
    await this.set(this.key(), dir);
    await PUT('/api/devices/backup', { device_token: App.device.token, on: true });
    await this.run(true);
    return dir;
  },

  async forget() {
    await this.set(this.key(), null);
    if (App.device && App.token) await PUT('/api/devices/backup', { device_token: App.device.token, on: false }).catch(() => {});
  },

  // Needs a click when the browser forgot the permission.
  async allow() {
    const dir = await this.get(this.key());
    if (!dir) return false;
    const r = await dir.requestPermission({ mode: 'readwrite' });
    if (r === 'granted') { await this.run(true); return true; }
    return false;
  },

  async run(force = false) {
    if (this.running) return null;
    const st = await this.status();
    if (st.state !== 'granted') return null;
    if (!force && st.last && Date.now() - st.last < this.EVERY) return null;
    this.running = true;
    try {
      const res = await fetch('/api/device/backup', { headers: { Authorization: `Bearer ${App.device.token}` } });
      if (!res.ok) throw new Error(tServer(((await res.json().catch(() => ({}))) || {}).error || `HTTP ${res.status}`));
      const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || `flowi_${localDay()}.db`;
      const fh = await st.dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(await res.blob());
      await w.close();
      await this.set(`${this.key()}:last`, Date.now());
      // Keep the newest files only.
      const files = [];
      for await (const [n, h] of st.dir.entries()) if (h.kind === 'file' && /^flowi_.*\.db$/.test(n)) files.push(n);
      for (const n of files.sort().slice(0, -this.KEEP)) await st.dir.removeEntry(n).catch(() => {});
      return name;
    } catch (e) {
      console.warn('Zaxira:', e);
      if (force) throw e;
      return null;
    } finally {
      this.running = false;
    }
  },

  async files() {
    const st = await this.status();
    if (st.state !== 'granted') return [];
    const out = [];
    for await (const [n, h] of st.dir.entries()) if (h.kind === 'file' && /\.db$/.test(n)) out.push({ name: n, handle: h });
    return out.sort((a, b) => b.name.localeCompare(a.name));
  },
};
setInterval(() => { if (App.device) FolderBackup.run(); }, 10 * MIN);

// Restores the whole business from a backup file (.db). Only the boss; the current data is saved on the server first.
async function restoreBackup(file) {
  const res = await fetch('/api/backup/restore', { method: 'POST', headers: { Authorization: `Bearer ${App.token}`, 'Content-Type': 'application/octet-stream' }, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(tServer(data.error || `HTTP ${res.status}`));
  return data;
}
