# Recrate Desktop App - Electron Implementation Guide

## 🎯 Overview

Build a professional Electron desktop application that:
1. Bundles and runs the Node.js backend server
2. Provides a beautiful GUI for configuration and status
3. Lives in the system tray/menu bar
4. Shows QR code for easy mobile connection
5. Requires zero terminal or Node.js knowledge from users

---

## 📁 Project Structure

```
recrate/
├── packages/
│   ├── desktop/                 # NEW - Electron app
│   │   ├── package.json
│   │   ├── main.js             # Electron main process
│   │   ├── preload.js          # Bridge between main/renderer
│   │   ├── src/
│   │   │   ├── renderer/       # React UI
│   │   │   │   ├── App.jsx
│   │   │   │   ├── components/
│   │   │   │   │   ├── StatusScreen.jsx
│   │   │   │   │   ├── SettingsScreen.jsx
│   │   │   │   │   ├── QRCodeDisplay.jsx
│   │   │   │   │   └── TrayMenu.jsx
│   │   │   │   └── styles/
│   │   │   │       └── global.css
│   │   │   └── server/         # Server bundling logic
│   │   │       └── bundle.js
│   │   ├── assets/
│   │   │   └── icons/
│   │   │       ├── icon.png    # App icon
│   │   │       ├── icon@2x.png
│   │   │       └── tray-icon.png
│   │   ├── resources/          # Built server binary goes here
│   │   └── index.html          # Renderer HTML
│   │
│   ├── mobile/                  # EXISTS - React Native app
│   ├── server/                  # EXISTS - Node.js backend
│   └── shared/                  # NEW - Shared types/constants
│
├── package.json                 # Root - npm workspaces config
└── docs/
    └── ELECTRON_APP.md         # This file
```

---

## 🚀 Phase 1: Setup Monorepo Structure

### Step 1: Update Root package.json

```json
{
  "name": "recrate",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev:server": "npm run dev -w @recrate/server",
    "dev:desktop": "npm run dev -w @recrate/desktop",
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:desktop\"",
    "build:server": "npm run build -w @recrate/server",
    "build:desktop": "npm run build -w @recrate/desktop",
    "build": "npm run build --workspaces"
  },
  "devDependencies": {
    "concurrently": "^8.2.0"
  }
}
```

### Step 2: Create packages/shared

```bash
mkdir -p packages/shared
cd packages/shared
npm init -y
```

**packages/shared/package.json:**
```json
{
  "name": "@recrate/shared",
  "version": "1.0.0",
  "main": "index.js",
  "exports": {
    "./constants": "./constants.js",
    "./types": "./types.js"
  }
}
```

**packages/shared/constants.js:**
```javascript
module.exports = {
  API_ROUTES: {
    HEALTH: '/health',
    LIBRARY: '/api/library',
    CRATES: '/api/crates',
    STREAM: '/api/stream',
    SEARCH: '/api/search'
  },
  
  DEFAULT_PORT: 3000,
  
  COLORS: {
    PRIMARY: '#667eea',
    SECONDARY: '#764ba2',
    ACCENT: '#ec4899',
    DARK: '#1a1a2e'
  }
};
```

**packages/shared/types.js:**
```javascript
/**
 * @typedef {Object} Track
 * @property {string} id
 * @property {string} title
 * @property {string} artist
 * @property {string} album
 * @property {number} bpm
 * @property {string} key
 * @property {number} duration
 * @property {string} filePath
 */

/**
 * @typedef {Object} Crate
 * @property {string} id
 * @property {string} name
 * @property {number} trackCount
 * @property {string} color
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

module.exports = {};
```

### Step 3: Reorganize Existing Packages

```bash
# Move server code
mkdir -p packages/server
mv src packages/server/
mv docs packages/server/
mv package.json packages/server/

# Update server package.json name
# Edit packages/server/package.json:
{
  "name": "@recrate/server",
  "dependencies": {
    "@recrate/shared": "*"
  }
}

# Move mobile code (if not already in packages/)
mkdir -p packages/mobile
# Move your React Native code there

# Update mobile package.json name
{
  "name": "@recrate/mobile",
  "dependencies": {
    "@recrate/shared": "*"
  }
}
```

### Step 4: Reinstall Dependencies

```bash
# From root
npm install
```

---

## 🖥️ Phase 2: Create Electron App Package

### Step 1: Initialize Desktop Package

```bash
mkdir -p packages/desktop
cd packages/desktop
npm init -y
```

### Step 2: Install Dependencies

```bash
npm install electron
npm install --save-dev electron-builder
npm install qrcode
npm install electron-store
npm install electron-log
```

### Step 3: Create package.json

**packages/desktop/package.json:**
```json
{
  "name": "@recrate/desktop",
  "version": "1.0.0",
  "description": "Recrate Desktop - Electron app for managing Serato library",
  "main": "main.js",
  "scripts": {
    "dev": "electron .",
    "start": "electron .",
    "build": "electron-builder",
    "build:mac": "electron-builder --mac",
    "build:win": "electron-builder --win",
    "build:linux": "electron-builder --linux"
  },
  "dependencies": {
    "@recrate/server": "*",
    "@recrate/shared": "*",
    "qrcode": "^1.5.3",
    "electron-store": "^8.1.0",
    "electron-log": "^5.0.0"
  },
  "devDependencies": {
    "electron": "^27.0.0",
    "electron-builder": "^24.6.4"
  },
  "build": {
    "appId": "com.recrate.desktop",
    "productName": "Recrate",
    "files": [
      "main.js",
      "preload.js",
      "index.html",
      "src/**/*",
      "assets/**/*",
      "resources/**/*",
      "node_modules/**/*"
    ],
    "mac": {
      "category": "public.app-category.music",
      "icon": "assets/icons/icon.icns",
      "target": ["dmg", "zip"]
    },
    "win": {
      "icon": "assets/icons/icon.ico",
      "target": ["nsis", "portable"]
    },
    "linux": {
      "icon": "assets/icons/icon.png",
      "target": ["AppImage", "deb"]
    },
    "extraResources": [
      {
        "from": "../server/dist",
        "to": "server",
        "filter": ["**/*"]
      }
    ]
  }
}
```

---

## 🎨 Phase 3: Implement Main Process

### main.js - Core Electron Logic

```javascript
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const Store = require('electron-store');
const log = require('electron-log');
const os = require('os');
const fs = require('fs');

// Configure logging
log.transports.file.level = 'info';
log.info('Recrate Desktop starting...');

const store = new Store();
let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverPort = 3000;
let serverStatus = 'stopped';

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Auto-detect Serato path
function detectSeratoPath() {
  const homeDir = os.homedir();
  const possiblePaths = [
    path.join(homeDir, 'Music', '_Serato_'),
    path.join(homeDir, 'Documents', 'Music', '_Serato_'),
    '/Volumes/Music/_Serato_',
    'D:\\Music\\_Serato_'
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const hasDatabase = fs.existsSync(path.join(p, 'database V2'));
      if (hasDatabase) return p;
    }
  }
  
  return path.join(homeDir, 'Music', '_Serato_');
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 700,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Recrate',
    icon: path.join(__dirname, 'assets/icons/icon.png')
  });

  mainWindow.loadFile('index.html');

  // Hide instead of close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Dev tools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// Create system tray
function createTray() {
  const iconPath = path.join(__dirname, 'assets/icons/tray-icon.png');
  tray = new Tray(iconPath);

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
}

// Update tray menu based on server status
function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: serverStatus === 'running' ? '✅ Server Running' : '⭕ Server Stopped',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => mainWindow.show()
    },
    {
      label: serverStatus === 'running' ? 'Stop Server' : 'Start Server',
      click: () => {
        if (serverStatus === 'running') {
          stopServer();
        } else {
          startServer();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('navigate-to', 'settings');
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Recrate',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  
  // Update tooltip
  const localIP = getLocalIP();
  tray.setToolTip(
    serverStatus === 'running' 
      ? `Recrate - Running on ${localIP}:${serverPort}`
      : 'Recrate - Stopped'
  );
}

// Start Node.js server
function startServer() {
  if (serverProcess) {
    log.info('Server already running');
    return;
  }

  const config = {
    seratoPath: store.get('seratoPath', detectSeratoPath()),
    musicPath: store.get('musicPath', path.join(os.homedir(), 'Music')),
    port: store.get('port', 3000)
  };

  serverPort = config.port;

  log.info('Starting server with config:', config);

  // In development, run from source
  // In production, run bundled binary
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'recrate-server')
    : path.join(__dirname, '../server/src/index.js');

  const serverArgs = app.isPackaged ? [] : [serverPath];
  const serverCommand = app.isPackaged ? serverPath : 'node';

  serverProcess = spawn(serverCommand, serverArgs, {
    env: {
      ...process.env,
      SERATO_PATH: config.seratoPath,
      MUSIC_PATH: config.musicPath,
      PORT: config.port.toString(),
      NODE_ENV: 'production'
    }
  });

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    log.info('Server:', output);
    
    // Send logs to renderer
    if (mainWindow) {
      mainWindow.webContents.send('server-log', output);
    }

    // Detect when server is ready
    if (output.includes('running on port') || output.includes('Server running')) {
      serverStatus = 'running';
      updateTrayMenu();
      
      // Send status to renderer
      if (mainWindow) {
        mainWindow.webContents.send('server-status', {
          status: 'running',
          url: `http://${getLocalIP()}:${serverPort}`,
          config
        });
      }
    }
  });

  serverProcess.stderr.on('data', (data) => {
    log.error('Server Error:', data.toString());
    if (mainWindow) {
      mainWindow.webContents.send('server-error', data.toString());
    }
  });

  serverProcess.on('close', (code) => {
    log.info(`Server process exited with code ${code}`);
    serverProcess = null;
    serverStatus = 'stopped';
    updateTrayMenu();
    
    if (mainWindow) {
      mainWindow.webContents.send('server-status', { status: 'stopped' });
    }
  });
}

// Stop server
function stopServer() {
  if (serverProcess) {
    log.info('Stopping server...');
    serverProcess.kill();
    serverProcess = null;
    serverStatus = 'stopped';
    updateTrayMenu();
  }
}

// IPC Handlers
ipcMain.handle('get-config', () => {
  return {
    seratoPath: store.get('seratoPath', detectSeratoPath()),
    musicPath: store.get('musicPath', path.join(os.homedir(), 'Music')),
    port: store.get('port', 3000),
    autoStart: store.get('autoStart', true)
  };
});

ipcMain.handle('save-config', (event, config) => {
  store.set('seratoPath', config.seratoPath);
  store.set('musicPath', config.musicPath);
  store.set('port', config.port);
  store.set('autoStart', config.autoStart);
  
  log.info('Config saved:', config);
  return true;
});

ipcMain.handle('select-directory', async (event, title) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('start-server', () => {
  startServer();
  return true;
});

ipcMain.handle('stop-server', () => {
  stopServer();
  return true;
});

ipcMain.handle('get-server-status', () => {
  return {
    status: serverStatus,
    url: serverStatus === 'running' ? `http://${getLocalIP()}:${serverPort}` : null,
    ip: getLocalIP(),
    port: serverPort
  };
});

ipcMain.handle('open-external', (event, url) => {
  require('electron').shell.openExternal(url);
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();
  
  // Auto-start server if configured
  const autoStart = store.get('autoStart', true);
  if (autoStart) {
    startServer();
  }
});

app.on('before-quit', () => {
  stopServer();
});

app.on('window-all-closed', () => {
  // Don't quit on macOS when windows close
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

---

## 🌉 Phase 4: Implement Preload Script

### preload.js - Bridge between Main and Renderer

```javascript
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
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
```

---

## 🎨 Phase 5: Create Renderer UI

### index.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recrate</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      overflow: hidden;
    }
    
    #app {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .container {
      flex: 1;
      padding: 40px;
      overflow-y: auto;
    }
    
    h1 {
      font-size: 32px;
      margin-bottom: 10px;
      text-align: center;
    }
    
    .status-badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 30px;
    }
    
    .status-running {
      background: #48bb78;
    }
    
    .status-stopped {
      background: #f56565;
    }
    
    .qr-container {
      background: white;
      padding: 30px;
      border-radius: 20px;
      text-align: center;
      margin: 30px 0;
    }
    
    .qr-code {
      margin: 20px auto;
    }
    
    .url-display {
      background: rgba(255, 255, 255, 0.1);
      padding: 15px;
      border-radius: 10px;
      font-family: 'Courier New', monospace;
      font-size: 16px;
      margin: 20px 0;
      word-break: break-all;
    }
    
    button {
      background: white;
      color: #667eea;
      border: none;
      padding: 15px 30px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      margin: 10px 0;
      transition: transform 0.2s;
    }
    
    button:hover {
      transform: translateY(-2px);
    }
    
    button:active {
      transform: translateY(0);
    }
    
    button.secondary {
      background: rgba(255, 255, 255, 0.2);
      color: white;
    }
    
    .settings-screen {
      display: none;
    }
    
    .settings-screen.active {
      display: block;
    }
    
    .form-group {
      margin: 20px 0;
    }
    
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
    }
    
    input {
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
    }
    
    .path-input {
      display: flex;
      gap: 10px;
    }
    
    .path-input input {
      flex: 1;
    }
    
    .path-input button {
      width: auto;
      padding: 12px 20px;
    }
    
    .logs {
      background: rgba(0, 0, 0, 0.3);
      padding: 15px;
      border-radius: 10px;
      max-height: 150px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      margin-top: 20px;
    }
    
    .log-entry {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="container">
      <!-- Status Screen -->
      <div id="status-screen" class="status-screen active">
        <h1>🎧 Recrate</h1>
        
        <div style="text-align: center;">
          <span id="status-badge" class="status-badge status-stopped">
            ⭕ Server Stopped
          </span>
        </div>
        
        <div id="server-info" style="display: none;">
          <div class="qr-container">
            <h3 style="color: #667eea; margin-bottom: 10px;">
              Scan with your phone
            </h3>
            <canvas id="qr-code" class="qr-code"></canvas>
          </div>
          
          <div class="url-display" id="server-url">
            http://192.168.1.100:3000
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <p style="font-size: 14px; opacity: 0.8;">
              1. Open Recrate on your phone<br>
              2. Scan QR code or enter URL above<br>
              3. Start organizing your crates!
            </p>
          </div>
        </div>
        
        <button id="toggle-server-btn" onclick="toggleServer()">
          Start Server
        </button>
        
        <button class="secondary" onclick="showSettings()">
          Settings
        </button>
        
        <div id="logs" class="logs" style="display: none;"></div>
      </div>
      
      <!-- Settings Screen -->
      <div id="settings-screen" class="settings-screen">
        <h1>⚙️ Settings</h1>
        
        <div class="form-group">
          <label>Serato Library Path</label>
          <div class="path-input">
            <input type="text" id="serato-path" readonly>
            <button onclick="selectSeratoPath()">Browse</button>
          </div>
        </div>
        
        <div class="form-group">
          <label>Music Files Path</label>
          <div class="path-input">
            <input type="text" id="music-path" readonly>
            <button onclick="selectMusicPath()">Browse</button>
          </div>
        </div>
        
        <div class="form-group">
          <label>Port</label>
          <input type="number" id="port" value="3000">
        </div>
        
        <button onclick="saveSettings()">
          Save Settings
        </button>
        
        <button class="secondary" onclick="showStatus()">
          Back
        </button>
      </div>
    </div>
  </div>
  
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
  <script>
    const { electronAPI } = window;
    let serverStatus = 'stopped';
    let serverUrl = '';
    
    // Initialize
    async function init() {
      await loadConfig();
      await updateServerStatus();
      
      // Listen for server status changes
      electronAPI.onServerStatus((status) => {
        serverStatus = status.status;
        serverUrl = status.url;
        updateUI();
      });
      
      // Listen for logs
      electronAPI.onServerLog((log) => {
        addLog(log);
      });
    }
    
    // Load config
    async function loadConfig() {
      const config = await electronAPI.getConfig();
      document.getElementById('serato-path').value = config.seratoPath;
      document.getElementById('music-path').value = config.musicPath;
      document.getElementById('port').value = config.port;
    }
    
    // Update server status
    async function updateServerStatus() {
      const status = await electronAPI.getServerStatus();
      serverStatus = status.status;
      serverUrl = status.url;
      updateUI();
    }
    
    // Update UI based on status
    function updateUI() {
      const badge = document.getElementById('status-badge');
      const info = document.getElementById('server-info');
      const btn = document.getElementById('toggle-server-btn');
      
      if (serverStatus === 'running') {
        badge.textContent = '✅ Server Running';
        badge.className = 'status-badge status-running';
        info.style.display = 'block';
        btn.textContent = 'Stop Server';
        
        // Update URL
        document.getElementById('server-url').textContent = serverUrl;
        
        // Generate QR code
        generateQR(serverUrl);
      } else {
        badge.textContent = '⭕ Server Stopped';
        badge.className = 'status-badge status-stopped';
        info.style.display = 'none';
        btn.textContent = 'Start Server';
      }
    }
    
    // Generate QR code
    function generateQR(url) {
      const canvas = document.getElementById('qr-code');
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      
      const size = 200;
      const moduleCount = qr.getModuleCount();
      const cellSize = size / moduleCount;
      
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          ctx.fillStyle = qr.isDark(row, col) ? '#000000' : '#ffffff';
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }
    
    // Toggle server
    async function toggleServer() {
      if (serverStatus === 'running') {
        await electronAPI.stopServer();
      } else {
        await electronAPI.startServer();
      }
      setTimeout(updateServerStatus, 1000);
    }
    
    // Show settings
    function showSettings() {
      document.getElementById('status-screen').classList.remove('active');
      document.getElementById('settings-screen').classList.add('active');
    }
    
    // Show status
    function showStatus() {
      document.getElementById('settings-screen').classList.remove('active');
      document.getElementById('status-screen').classList.add('active');
    }
    
    // Select Serato path
    async function selectSeratoPath() {
      const path = await electronAPI.selectDirectory('Select Serato Library Folder');
      if (path) {
        document.getElementById('serato-path').value = path;
      }
    }
    
    // Select music path
    async function selectMusicPath() {
      const path = await electronAPI.selectDirectory('Select Music Folder');
      if (path) {
        document.getElementById('music-path').value = path;
      }
    }
    
    // Save settings
    async function saveSettings() {
      const config = {
        seratoPath: document.getElementById('serato-path').value,
        musicPath: document.getElementById('music-path').value,
        port: parseInt(document.getElementById('port').value),
        autoStart: true
      };
      
      await electronAPI.saveConfig(config);
      alert('Settings saved! Restart the server for changes to take effect.');
      showStatus();
    }
    
    // Add log entry
    function addLog(log) {
      const logsDiv = document.getElementById('logs');
      logsDiv.style.display = 'block';
      
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.textContent = log;
      logsDiv.appendChild(entry);
      
      // Auto-scroll
      logsDiv.scrollTop = logsDiv.scrollHeight;
      
      // Keep only last 50 logs
      while (logsDiv.children.length > 50) {
        logsDiv.removeChild(logsDiv.firstChild);
      }
    }
    
    // Initialize on load
    init();
  </script>
</body>
</html>
```

---

## 🎯 Phase 6: Bundle Server Binary

### Build Script for Server

**packages/desktop/scripts/bundle-server.js:**

```javascript
const pkg = require('pkg');
const path = require('path');
const fs = require('fs-extra');

async function bundleServer() {
  console.log('📦 Bundling server...');
  
  const serverPath = path.join(__dirname, '../../server/src/index.js');
  const outputDir = path.join(__dirname, '../resources/server');
  
  // Create output directory
  await fs.ensureDir(outputDir);
  
  // Bundle for each platform
  const targets = ['node18-macos-x64', 'node18-win-x64', 'node18-linux-x64'];
  
  for (const target of targets) {
    console.log(`Building for ${target}...`);
    
    const outputPath = path.join(
      outputDir,
      `recrate-server${target.includes('win') ? '.exe' : ''}`
    );
    
    await pkg.exec([
      serverPath,
      '--target', target,
      '--output', outputPath,
      '--compress', 'GZip'
    ]);
    
    console.log(`✅ Built ${target}`);
  }
  
  console.log('✅ Server bundled successfully!');
}

bundleServer().catch(console.error);
```

**Add to packages/desktop/package.json:**

```json
{
  "scripts": {
    "bundle-server": "node scripts/bundle-server.js",
    "prebuild": "npm run bundle-server"
  },
  "devDependencies": {
    "pkg": "^5.8.1",
    "fs-extra": "^11.1.0"
  }
}
```

---

## 🎨 Phase 7: Create App Icons

### Required Icon Sizes

**Mac (.icns):**
- 16x16, 32x32, 64x64, 128x128, 256x256, 512x512, 1024x1024

**Windows (.ico):**
- 16x16, 32x32, 48x48, 64x64, 128x128, 256x256

**Linux (.png):**
- 512x512

### Generate Icons Script

**packages/desktop/scripts/generate-icons.js:**

```javascript
// Use electron-icon-builder or similar tool
// Or create manually with your logo image

const icongen = require('icon-gen');
const path = require('path');

const options = {
  type: 'png',
  modes: ['icns', 'ico'],
  names: {
    icns: 'icon',
    ico: 'icon'
  },
  report: true
};

const input = path.join(__dirname, '../assets/icon-source.png');
const output = path.join(__dirname, '../assets/icons');

icongen(input, output, options)
  .then(() => console.log('✅ Icons generated'))
  .catch(console.error);
```

**Place your logo (1024x1024 PNG) at:**
`packages/desktop/assets/icon-source.png`

---

## 🚀 Phase 8: Build & Distribution

### Build Commands

```bash
# Development
cd packages/desktop
npm run dev

# Build for current platform
npm run build

# Build for specific platforms
npm run build:mac    # Creates .dmg
npm run build:win    # Creates .exe installer
npm run build:linux  # Creates .AppImage

# Build all platforms
npm run build -- --mac --win --linux
```

### Output Location

```
packages/desktop/dist/
├── Recrate-1.0.0.dmg           # Mac installer
├── Recrate-1.0.0-mac.zip       # Mac archive
├── Recrate Setup 1.0.0.exe     # Windows installer
├── Recrate-1.0.0.AppImage      # Linux
└── ...
```

---

## ✅ Testing Checklist

### Before Release:

- [ ] Test on macOS (Intel and Apple Silicon)
- [ ] Test on Windows 10/11
- [ ] Test on Ubuntu Linux
- [ ] Verify server starts automatically
- [ ] Verify QR code generation
- [ ] Verify settings persistence
- [ ] Verify paths are detected correctly
- [ ] Test with actual Serato library
- [ ] Test connection from mobile app
- [ ] Test menu bar/tray functionality
- [ ] Test auto-start on login
- [ ] Verify logs are written
- [ ] Test error scenarios (no Serato, wrong path, etc.)

---

## 📋 User Documentation

### Create packages/desktop/README.md

```markdown
# Recrate Desktop

## Installation

### Mac
1. Download `Recrate-1.0.0.dmg`
2. Open the DMG file
3. Drag Recrate to Applications folder
4. Launch Recrate from Applications

**First Launch:** Right-click → Open (to bypass Gatekeeper)

### Windows
1. Download `Recrate Setup 1.0.0.exe`
2. Run the installer
3. Launch Recrate from Start Menu

### Linux
1. Download `Recrate-1.0.0.AppImage`
2. Make executable: `chmod +x Recrate-1.0.0.AppImage`
3. Run: `./Recrate-1.0.0.AppImage`

## Usage

1. Launch Recrate
2. App will auto-detect your Serato library
3. Click "Start Server"
4. Open Recrate mobile app
5. Scan QR code or enter URL manually
6. Start organizing!

## Settings

Click Settings to configure:
- Serato library path
- Music files location
- Server port (default: 3000)

## Troubleshooting

**Server won't start:**
- Check Serato path in Settings
- Verify port 3000 is not in use
- Check logs (View → Logs)

**Can't connect from phone:**
- Ensure both devices on same WiFi
- Check firewall isn't blocking port 3000
- Try manual IP entry in mobile app

**Need help?**
Join our Discord: [link]
```

---

## 🎯 Success Criteria

You'll know it's working when:

✅ User downloads .dmg/.exe  
✅ Double-clicks to install  
✅ Launches app with nice GUI  
✅ Sees QR code  
✅ Scans with phone  
✅ Phone connects immediately  
✅ Can organize crates from phone  
✅ **Zero terminal, zero npm commands** ✨

---

## 📊 Implementation Timeline

| Task | Time | Priority |
|------|------|----------|
| Setup monorepo | 2 hours | HIGH |
| Create shared package | 1 hour | HIGH |
| Implement main.js | 4 hours | HIGH |
| Implement preload.js | 1 hour | HIGH |
| Create UI (index.html) | 4 hours | HIGH |
| Bundle server binary | 2 hours | HIGH |
| Generate icons | 2 hours | MEDIUM |
| Build & test | 4 hours | HIGH |
| Documentation | 2 hours | MEDIUM |
| **Total** | **22 hours** | **~3 days** |

---

## 🎉 Final Notes

This implementation gives you:
- ✅ Professional desktop app
- ✅ Zero technical requirements for users
- ✅ Beautiful GUI with QR code
- ✅ Menu bar/system tray integration
- ✅ Cross-platform support
- ✅ Proper bundling and distribution

**This is production-ready architecture.**

Build this, and you have a REAL product users can install and use immediately.

---

## 🚀 Next Steps After Desktop App

Once desktop app is complete:
1. Polish mobile app (queue management, settings)
2. Beta test with 10-15 DJs
3. Create landing page & marketing materials
4. Submit to app stores
5. Launch! 🎉

Good luck! 🎧
