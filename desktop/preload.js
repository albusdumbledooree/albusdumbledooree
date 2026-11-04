'use strict';
/*
 * The bridge between the FLOWI site and this program. The site sees one object, window.flowiDesktop:
 * print(html, { kind: 'receipt' | 'kitchen' }) prints with no dialog; the other calls serve the settings page.
 * The main process checks who is calling (the business's own address or the local settings page).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flowiDesktop', {
  print: (html, opts) => ipcRenderer.invoke('flowi:print', String(html), opts || {}),
  info: () => ipcRenderer.invoke('flowi:info'),
  settings: () => ipcRenderer.invoke('flowi:settings'),
  printers: () => ipcRenderer.invoke('flowi:printers'),
  save: (cfg) => ipcRenderer.invoke('flowi:save', cfg),
  open: () => ipcRenderer.invoke('flowi:open'),
  updateState: () => ipcRenderer.invoke('flowi:update-state'),
  updateCheck: () => ipcRenderer.invoke('flowi:update-check'),
  updateDownload: () => ipcRenderer.invoke('flowi:update-download'),
  updateInstall: () => ipcRenderer.invoke('flowi:update-install'),
  // The backup folder on this computer (the program writes the files; the browser inside it cannot).
  backup: {
    status: () => ipcRenderer.invoke('flowi:backup-status'),
    pick: () => ipcRenderer.invoke('flowi:backup-pick'),
    write: (name, bytes) => ipcRenderer.invoke('flowi:backup-write', String(name), bytes),
    list: () => ipcRenderer.invoke('flowi:backup-list'),
    read: (name) => ipcRenderer.invoke('flowi:backup-read', String(name)),
    forget: () => ipcRenderer.invoke('flowi:backup-forget'),
    open: () => ipcRenderer.invoke('flowi:backup-open'),
  },
});
