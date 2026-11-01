'use strict';
/*
 * FLOWI for the cash-desk computer (Windows).
 * Electron 22: the last one that runs on Windows 7/8 (many cash-desk computers); the installer holds 32- and 64-bit.
 * The program itself is the FLOWI site of the business (https://flowi.uz/c/<code>), opened in its own window:
 * nothing of FLOWI is re-written here, and every update of the site reaches this window at once.
 * What the window adds:
 * - starts with Windows, one copy only, opens the business straight away;
 * - receipts and kitchen tickets print with no print dialog, to the printer chosen for each (USB / Windows printers);
 * - an optional full-screen "cash desk" mode the staff cannot leave by accident;
 * - when the internet drops: a clear page that reconnects by itself.
 * Settings: Ctrl+Shift+S (or the tray-less menu key F10).
 */
const { app, BrowserWindow, ipcMain, shell, Menu, globalShortcut, session } = require('electron');
const { loadRoots, verifyChain, pemsOf } = require('./certs');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULTS = { url: '', kiosk: false, autostart: true, silent: true, receiptPrinter: '', kitchenPrinter: '', paper: 80 };
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
let cfg = { ...DEFAULTS };
let win = null;

function loadConfig() {
  try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) }; } catch { cfg = { ...DEFAULTS }; }
}
function saveConfig(next) {
  cfg = { ...cfg, ...next };
  fs.mkdirSync(path.dirname(cfgFile()), { recursive: true });
  fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2));
  try { app.setLoginItemSettings({ openAtLogin: !!cfg.autostart }); } catch { /* not on this system */ }
}

// "flowi.uz/c/navruz", "https://flowi.uz/c/navruz/" → "https://flowi.uz/c/navruz"
function normalizeUrl(v) {
  let s = String(v || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}
const siteOrigin = () => { try { return new URL(cfg.url).origin; } catch { return ''; } };
const page = (name) => path.join(__dirname, 'pages', name);

function openSite() {
  if (!cfg.url) return win.loadFile(page('setup.html'));
  win.loadURL(cfg.url).catch(() => {});
}
function openSettings() { win.loadFile(page('setup.html'), { query: { settings: '1' } }); }

function applyKiosk() {
  if (!win) return;
  win.setKiosk(!!cfg.kiosk);
  if (!cfg.kiosk) win.setFullScreen(false);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 900, minHeight: 600, show: false, title: 'FLOWI', backgroundColor: '#071726',
    icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); applyKiosk(); });

  // Only the business's own site opens inside; any other link goes to the usual browser.
  const inside = (url) => url.startsWith('file://') || (siteOrigin() && url.startsWith(siteOrigin())) || url === 'about:blank';
  win.webContents.setWindowOpenHandler(({ url }) => {
    // A4 papers (invoice, QR cards, labels) open their own window with the usual print dialog.
    if (inside(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(__dirname, 'build', 'icon.png') } };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!inside(url)) { e.preventDefault(); shell.openExternal(url); } });

  // No internet / server not answering: a page that tries again by itself.
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3: a navigation replaced by another, not an error
    win.loadFile(page('offline.html'), { query: { url: cfg.url, error: desc } });
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key.toLowerCase();
    if (input.control && input.shift && k === 's') { e.preventDefault(); openSettings(); }
    else if (k === 'f11' && !cfg.kiosk) { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    else if (k === 'f5' || (input.control && k === 'r')) { e.preventDefault(); win.webContents.reload(); }
  });
  openSite();
}

// ---------- Printing with no dialog ----------
// The page sends the finished ticket (HTML); it is laid out in a hidden window and sent to the chosen printer.
async function printHtml(html, kind) {
  const deviceName = (kind === 'kitchen' ? cfg.kitchenPrinter : cfg.receiptPrinter) || cfg.receiptPrinter || '';
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await new Promise((resolve) => {
      w.webContents.print({ silent: !!cfg.silent, deviceName, printBackground: true, margins: { marginType: 'none' } },
        (ok, reason) => resolve(ok ? { ok: true } : { ok: false, error: reason || 'Chop etilmadi' }));
    });
  } finally {
    setTimeout(() => { if (!w.isDestroyed()) w.destroy(); }, 3000);
  }
}

// Calls from the FLOWI site are accepted only from the business's own address; calls from the settings page only from the file.
const fromSite = (e) => { try { return siteOrigin() && new URL(e.senderFrame.url).origin === siteOrigin(); } catch { return false; } };
const fromLocal = (e) => { try { return e.senderFrame.url.startsWith('file://'); } catch { return false; } };

ipcMain.handle('flowi:print', async (e, html, opts = {}) => {
  if (!fromSite(e) && !fromLocal(e)) return { ok: false, error: 'Ruxsat yo\'q' };
  if (typeof html !== 'string' || html.length > 2_000_000) return { ok: false, error: 'Noto\'g\'ri chek' };
  return printHtml(html, opts.kind === 'kitchen' ? 'kitchen' : 'receipt');
});
ipcMain.handle('flowi:info', (e) => (fromSite(e) || fromLocal(e) ? { version: app.getVersion(), silent: !!cfg.silent } : null));
ipcMain.handle('flowi:settings', (e) => (fromLocal(e) ? { ...cfg, version: app.getVersion() } : null));
ipcMain.handle('flowi:printers', async (e) => {
  if (!fromLocal(e)) return [];
  const list = await win.webContents.getPrintersAsync();
  return list.map((p) => ({ name: p.name, label: p.displayName || p.name, isDefault: !!p.isDefault }));
});
ipcMain.handle('flowi:save', (e, next) => {
  if (!fromLocal(e)) return { ok: false };
  let url;
  try { url = normalizeUrl(next.url); } catch { return { ok: false, error: "Havola noto'g'ri. Masalan: flowi.uz/c/navruz" }; }
  if (!url) return { ok: false, error: 'Biznes havolasini yozing. Masalan: flowi.uz/c/navruz' };
  saveConfig({
    url, kiosk: !!next.kiosk, autostart: !!next.autostart, silent: !!next.silent,
    receiptPrinter: String(next.receiptPrinter || ''), kitchenPrinter: String(next.kitchenPrinter || ''),
  });
  applyKiosk();
  openSite();
  return { ok: true };
});
ipcMain.handle('flowi:open', (e) => { if (fromLocal(e)) openSite(); });

// ---------- Windows 7/8 without the Let's Encrypt root ----------
// Only for the business's own address, and only when Windows did not know the root: the program checks the chain itself.
function trustLetsEncrypt() {
  let roots = [];
  try { roots = loadRoots(); } catch { return; }
  session.defaultSession.setCertificateVerifyProc((req, callback) => {
    if (req.errorCode === 0) return callback(-3);
    let host = '';
    try { host = new URL(cfg.url).hostname; } catch { /* not set yet */ }
    const unknownRoot = /AUTHORITY_INVALID/.test(String(req.verificationResult || ''));
    if (host && req.hostname === host && unknownRoot && verifyChain(pemsOf(req.certificate), host, roots)) return callback(0);
    return callback(-3);
  });
}

// ---------- Start ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(() => {
    loadConfig();
    if (!fs.existsSync(cfgFile())) saveConfig({}); // first start: starts with Windows from now on
    trustLetsEncrypt();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
