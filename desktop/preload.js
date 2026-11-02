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
});
