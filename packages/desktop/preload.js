const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  selectDirectory: (title) => ipcRenderer.invoke('select-directory', title),

  // Server control
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),

  // Listeners
  onServerStatus: (callback) => {
    ipcRenderer.on('server-status', (event, status) => callback(status));
  },
  onServerLog: (callback) => {
    ipcRenderer.on('server-log', (event, log) => callback(log));
  },
  onServerError: (callback) => {
    ipcRenderer.on('server-error', (event, error) => callback(error));
  },

  // Utils
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Tailscale
  getTailscaleInfo: () => ipcRenderer.invoke('get-tailscale-info'),
  openTailscaleUrl: () => ipcRenderer.invoke('open-tailscale-url')
});
