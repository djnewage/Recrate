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

/**
 * Detect if Tailscale is installed and running
 * Returns Tailscale IP (100.x.x.x) or null
 */
function getTailscaleIP() {
  const interfaces = os.networkInterfaces();

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      // Tailscale IPs always start with 100.x.x.x
      if (addr.family === 'IPv4' && addr.address.startsWith('100.')) {
        log.info('Tailscale detected:', addr.address);
        return addr.address;
      }
    }
  }

  log.info('Tailscale not detected');
  return null;
}

/**
 * Check if Tailscale is installed (not just running)
 */
function isTailscaleInstalled() {
  const { execSync } = require('child_process');

  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      execSync('which tailscale', { stdio: 'ignore' });
      return true;
    } else if (process.platform === 'win32') {
      execSync('where tailscale', { stdio: 'ignore' });
      return true;
    }
  } catch {
    return false;
  }

  return false;
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
  // Use a native icon for now (Electron default)
  // TODO: Replace with custom icon when available
  try {
    const iconPath = path.join(__dirname, 'assets/icons/tray-icon.png');
    if (fs.existsSync(iconPath) && fs.statSync(iconPath).size > 0) {
      tray = new Tray(iconPath);
    } else {
      // Use native icon as fallback - create a simple NativeImage
      const { nativeImage } = require('electron');
      const icon = nativeImage.createEmpty();
      tray = new Tray(icon);
      log.warn('Using default tray icon - custom icon not found');
    }
  } catch (error) {
    log.error('Failed to create tray:', error);
    return; // Skip tray creation if it fails
  }

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
  if (!tray) {
    log.warn('Tray not available, skipping menu update');
    return;
  }

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
    ? path.join(process.resourcesPath, 'server', 'src', 'index.js')
    : path.join(__dirname, '../server/src/index.js');

  const serverArgs = [serverPath];
  const serverCommand = 'node';

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

    // Send logs to renderer (wait for window to be ready)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-log', output);
    }

    // Detect when server is ready
    if (output.includes('running on port') || output.includes('Server running')) {
      serverStatus = 'running';
      updateTrayMenu();

      // Get Tailscale info
      const localIP = getLocalIP();
      const tailscaleIP = getTailscaleIP();
      const tailscaleInstalled = isTailscaleInstalled();

      // Send status to renderer (with delay to ensure window is ready)
      const sendStatus = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('server-status', {
            status: 'running',
            localURL: `http://${localIP}:${serverPort}`,
            tailscaleURL: tailscaleIP ? `http://${tailscaleIP}:${serverPort}` : null,
            tailscaleInstalled,
            config
          });
          log.info('Sent running status to renderer with Tailscale info');
        }
      };

      // Send immediately and again after a delay to ensure it's received
      sendStatus();
      setTimeout(sendStatus, 500);
      setTimeout(sendStatus, 1000);
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
      mainWindow.webContents.send('server-status', {
        status: 'stopped',
        error: code !== 0 ? 'Server stopped with error. Check if port is already in use.' : null
      });
    }
  });

  serverProcess.on('error', (error) => {
    log.error('Server process error:', error);
    serverProcess = null;
    serverStatus = 'stopped';
    updateTrayMenu();

    if (mainWindow) {
      mainWindow.webContents.send('server-error', error.message);
      mainWindow.webContents.send('server-status', {
        status: 'stopped',
        error: error.message
      });
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

ipcMain.handle('get-tailscale-info', () => {
  const tailscaleIP = getTailscaleIP();
  const installed = isTailscaleInstalled();

  return {
    installed,
    running: tailscaleIP !== null,
    ip: tailscaleIP
  };
});

ipcMain.handle('open-tailscale-url', () => {
  require('electron').shell.openExternal('https://tailscale.com/download');
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
