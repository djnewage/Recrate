// Load environment variables first
require('dotenv').config();

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const Store = require('electron-store');
const log = require('electron-log');
const os = require('os');
const fs = require('fs');
const BinaryProxyClient = require('./src/binaryProxyClient');
const { initSentry, captureError, flush: flushSentry } = require('./src/sentry-main');
const { initAutoUpdater, checkForUpdates } = require('./src/autoUpdater');

// Initialize Sentry early for error tracking
initSentry();

// Configure logging - write to file for debugging packaged apps
log.transports.file.level = 'debug';
log.transports.file.resolvePathFn = () => path.join(app.getPath('logs'), 'main.log');
log.info('Recrate Desktop starting...');
log.info('Log file:', log.transports.file.getFile().path);

const store = new Store();
let mainWindow = null;
let tray = null;
let recrateService = null;  // Changed from serverProcess - now holds the service instance
let proxyClient = null;
let serverPort = 3000;
let serverStatus = 'stopped';
let isRestarting = false;

// Proxy configuration - can be overridden in settings
const PROXY_URL = process.env.PROXY_URL || 'wss://steadfast-forgiveness-production.up.railway.app';

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
    width: 360,
    height: 580,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Recrate',
    icon: path.join(__dirname, 'assets/icons/icon.png'),
    backgroundColor: '#FFFFFF',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 }
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
  const { nativeImage } = require('electron');

  try {
    // Use @2x version for retina support - Electron will scale appropriately
    const iconPath = path.join(__dirname, 'assets/icons/tray-icon.png');
    const icon2xPath = path.join(__dirname, 'assets/icons/tray-icon@2x.png');

    let trayIcon;
    if (fs.existsSync(icon2xPath)) {
      // Create from @2x for best quality on retina displays
      trayIcon = nativeImage.createFromPath(icon2xPath);
      // Resize to proper tray size (22x22 logical pixels)
      trayIcon = trayIcon.resize({ width: 22, height: 22 });
    } else if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    } else {
      trayIcon = nativeImage.createEmpty();
      log.warn('Tray icon not found, using empty icon');
    }

    tray = new Tray(trayIcon);
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
      label: 'Check for Updates…',
      click: () => checkForUpdates()
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

/**
 * Connect to cloud proxy
 */
async function connectToProxy() {
  try {
    log.info('Connecting to cloud proxy...');

    // Generate device ID
    const deviceId = store.get('deviceId') || `desktop-${os.hostname()}-${Date.now()}`;
    store.set('deviceId', deviceId);

    // Binary WebSocket proxy client
    const proxyWsURL = PROXY_URL + '/ws/desktop';
    const localServerURL = `ws://127.0.0.1:${serverPort}/ws/audio`;

    proxyClient = new BinaryProxyClient(
      proxyWsURL,
      localServerURL,
      deviceId,
      log
    );

    await proxyClient.start();

    log.info('Connected to proxy successfully');
    log.info('Device ID:', deviceId);

    // Update UI
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('proxy-status', {
        connected: true,
        deviceId: deviceId,
        url: getProxyURL()
      });
    }

  } catch (error) {
    log.error('Failed to connect to proxy:', error.message);

    // Continue without proxy - local network still works
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('proxy-status', {
        connected: false,
        error: error.message
      });
    }
  }
}

/**
 * Get proxy URL for mobile app
 */
function getProxyURL() {
  if (!proxyClient) return null;

  const deviceId = store.get('deviceId');
  if (!deviceId) return null;

  // Convert ws:// to http:// or wss:// to https://
  let httpURL = PROXY_URL.replace('ws://', 'http://').replace('wss://', 'https://');

  // Replace localhost with actual local IP for mobile access
  if (httpURL.includes('localhost') || httpURL.includes('127.0.0.1')) {
    const localIP = getLocalIP();
    httpURL = httpURL.replace('localhost', localIP).replace('127.0.0.1', localIP);
  }

  return `${httpURL}/api/${deviceId}`;
}

/**
 * Disconnect from cloud proxy
 */
function disconnectFromProxy() {
  if (proxyClient) {
    log.info('Disconnecting from proxy...');
    proxyClient.shutdown();
    proxyClient = null;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('proxy-status', {
        connected: false
      });
    }
  }
}

/**
 * Kill any process using the specified port (async to avoid blocking UI)
 * Prevents "EADDRINUSE" errors from stale processes
 */
async function killProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      // Windows: find and kill process on port
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid)) {
          try {
            await execAsync(`taskkill /PID ${pid} /F`);
            log.info(`Killed process ${pid} on port ${port}`);
          } catch (e) {
            // Process may have already exited
          }
        }
      }
    } else {
      // macOS/Linux: use lsof to find and kill process
      const { stdout } = await execAsync(`lsof -ti :${port}`);
      const pids = stdout.trim().split('\n').filter(p => p);
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          log.info(`Killed process ${pid} on port ${port}`);
        } catch (e) {
          // Process may have already exited
        }
      }
    }
  } catch (e) {
    // No process found on port, which is fine
    log.debug(`No process found on port ${port}`);
  }
}

// Start server in-process (no external Node.js required)
async function startServer() {
  if (recrateService) {
    log.info('Server already running');
    return;
  }

  const userConfig = {
    seratoPath: store.get('seratoPath', detectSeratoPath()),
    musicPaths: [store.get('musicPath', path.join(os.homedir(), 'Music'))],
    port: store.get('port', 3000)
  };

  serverPort = userConfig.port;

  // Kill any stale process on the port before starting
  log.info('Checking for stale processes on port', serverPort);
  await killProcessOnPort(serverPort);

  log.info('Starting server with config:', userConfig);
  log.info('App is packaged:', app.isPackaged);

  try {
    // Determine server paths
    const serverBasePath = app.isPackaged
      ? path.join(process.resourcesPath, 'server', 'src')
      : path.join(__dirname, '../server/src');

    const configPath = path.join(serverBasePath, 'utils', 'config.js');
    const serverPath = path.join(serverBasePath, 'index.js');

    log.info('Server base path:', serverBasePath);
    log.info('Config path:', configPath);
    log.info('Server path:', serverPath);

    // Check if server files exist
    if (!fs.existsSync(serverPath)) {
      throw new Error(`Server file not found: ${serverPath}`);
    }

    // Check if node_modules exists (critical for packaged app)
    if (app.isPackaged) {
      const nodeModulesPath = path.join(process.resourcesPath, 'server', 'node_modules');
      if (!fs.existsSync(nodeModulesPath)) {
        throw new Error('Server dependencies not found. Please reinstall the application.');
      }
      log.info('Server node_modules found at:', nodeModulesPath);
    }

    // Give the embedded server the proxy's HTTPS base URL so its AI feature can
    // route Anthropic calls through the cloud proxy (which holds the org's key)
    // instead of needing a key bundled in this packaged app.
    let proxyHttpBase = PROXY_URL.replace('ws://', 'http://').replace('wss://', 'https://');
    if (proxyHttpBase.includes('localhost') || proxyHttpBase.includes('127.0.0.1')) {
      const localIP = getLocalIP();
      proxyHttpBase = proxyHttpBase.replace('localhost', localIP).replace('127.0.0.1', localIP);
    }
    process.env.LLM_PROXY_URL = proxyHttpBase;
    log.info('LLM proxy base URL set:', proxyHttpBase);

    // Set runtime config before requiring the server
    const serverConfig = require(configPath);
    serverConfig.setRuntimeConfig(userConfig);
    log.info('Runtime config set');

    // Require and instantiate the service
    const RecrateService = require(serverPath);
    recrateService = new RecrateService();
    log.info('RecrateService instantiated');

    // Initialize and start
    await recrateService.initialize();
    log.info('Server initialized');

    await recrateService.start();
    log.info('Server started');

    // Set up indexing progress forwarding to desktop UI
    if (recrateService.apiServer && recrateService.apiServer.io) {
      recrateService.apiServer.io.on('connection', (socket) => {
        // This handles new socket connections, but we also need to catch existing events
      });

      // Poll indexing status and forward to renderer
      const indexingPollInterval = setInterval(() => {
        // Safety check - stop polling if window or service is gone
        if (!mainWindow || mainWindow.isDestroyed()) {
          clearInterval(indexingPollInterval);
          return;
        }
        if (!recrateService || !recrateService.parser) {
          clearInterval(indexingPollInterval);
          return;
        }

        try {
          const status = recrateService.parser.indexingStatus;
          mainWindow.webContents.send('indexing-progress', status);
        } catch (err) {
          log.error('Error polling indexing status:', err);
          clearInterval(indexingPollInterval);
        }
      }, 1000); // Poll every second

      // Store interval for cleanup
      recrateService._indexingPollInterval = indexingPollInterval;
    }

    serverStatus = 'running';
    updateTrayMenu();

    // Connect to cloud proxy
    await connectToProxy();

    // Get connection info
    const localIP = getLocalIP();

    // Send status to renderer
    const sendStatus = () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const proxyURL = proxyClient && proxyClient.isConnected()
          ? getProxyURL()
          : null;

        mainWindow.webContents.send('server-status', {
          status: 'running',
          localURL: `http://${localIP}:${serverPort}`,
          proxyURL,
          proxyConnected: proxyClient && proxyClient.isConnected(),
          config: userConfig
        });
        log.info('Sent running status to renderer');
      }
    };

    // Send immediately, and retry once after a short delay in case the
    // renderer wasn't ready for the first message
    sendStatus();
    setTimeout(sendStatus, 500);

  } catch (error) {
    log.error('Failed to start server:', error);
    recrateService = null;
    serverStatus = 'stopped';
    updateTrayMenu();

    if (mainWindow) {
      mainWindow.webContents.send('server-error', error.message);
      mainWindow.webContents.send('server-status', {
        status: 'stopped',
        error: error.message
      });
    }
  }
}

// Stop server
async function stopServer({ skipPortKill = false } = {}) {
  if (recrateService) {
    log.info('Stopping server...');

    // Clear indexing poll interval
    if (recrateService._indexingPollInterval) {
      clearInterval(recrateService._indexingPollInterval);
      recrateService._indexingPollInterval = null;
    }

    try {
      await recrateService.stop();
      log.info('Server stopped successfully');
    } catch (error) {
      log.error('Error stopping server:', error);
    }
    recrateService = null;

    // Force kill any lingering process on the port to ensure clean restart
    // Skip during restart — the port is freed by recrateService.stop() and
    // startServer() already calls killProcessOnPort as its first step.
    // Killing here during restart would kill the Electron process itself
    // since the server runs in-process.
    if (serverPort && !skipPortKill) {
      log.info(`Cleaning up port ${serverPort}...`);
      await killProcessOnPort(serverPort);
    }

    serverStatus = 'stopped';
    updateTrayMenu();

    // Notify UI that server stopped
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-status', { status: 'stopped' });
    }
  }

  // Disconnect from proxy
  disconnectFromProxy();
}

// Restart server (used when path-sensitive settings change)
async function restartServer() {
  if (isRestarting) {
    log.info('Restart already in progress, skipping');
    return;
  }

  isRestarting = true;
  serverStatus = 'restarting';
  updateTrayMenu();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server-status', { status: 'restarting' });
  }

  try {
    log.info('Restarting server...');
    await stopServer({ skipPortKill: true });

    // Brief delay to allow port release
    await new Promise(resolve => setTimeout(resolve, 1000));

    await startServer();
    log.info('Server restarted successfully');
  } catch (error) {
    log.error('Failed to restart server:', error);
    serverStatus = 'stopped';
    updateTrayMenu();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-error', error.message);
      mainWindow.webContents.send('server-status', {
        status: 'stopped',
        error: error.message
      });
    }
  } finally {
    isRestarting = false;
  }
}

// IPC Handlers
// Setup wizard handlers
ipcMain.handle('get-setup-complete', () => {
  const setupComplete = store.get('setupComplete', false);
  if (!setupComplete) return false;

  // Also verify Serato path still exists - force wizard if path is invalid
  const seratoPath = store.get('seratoPath', detectSeratoPath());
  if (!seratoPath || !fs.existsSync(seratoPath)) {
    log.info('Serato path not found, showing setup wizard:', seratoPath);
    return false;
  }

  return true;
});

// Path validation handler (async to avoid blocking UI)
ipcMain.handle('validate-path', async (event, pathToCheck) => {
  try {
    await fs.promises.access(pathToCheck);
    log.info(`Validating path: ${pathToCheck} - exists: true`);
    return true;
  } catch {
    log.info(`Validating path: ${pathToCheck} - exists: false`);
    return false;
  }
});

ipcMain.handle('set-setup-complete', () => {
  store.set('setupComplete', true);
  log.info('Setup wizard completed');
  return true;
});

ipcMain.handle('get-config', () => {
  return {
    seratoPath: store.get('seratoPath', detectSeratoPath()),
    musicPath: store.get('musicPath', path.join(os.homedir(), 'Music')),
    port: store.get('port', 3000),
    autoStart: store.get('autoStart', true)
  };
});

ipcMain.handle('save-config', async (event, config) => {
  // Read old values before saving
  const oldSeratoPath = store.get('seratoPath');
  const oldMusicPath = store.get('musicPath');
  const oldPort = store.get('port');

  store.set('seratoPath', config.seratoPath);
  store.set('musicPath', config.musicPath);
  store.set('port', config.port);
  store.set('autoStart', config.autoStart);

  log.info('Config saved:', config);

  // Check if path-sensitive settings changed while server is running
  const pathsChanged = config.seratoPath !== oldSeratoPath ||
    config.musicPath !== oldMusicPath ||
    config.port !== oldPort;

  if (pathsChanged && serverStatus === 'running') {
    log.info('Path-sensitive settings changed, restarting server...');
    restartServer(); // Don't await - let it run in the background
    return { saved: true, restarting: true };
  }

  return { saved: true, restarting: false };
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

// Diagnostics handler for debugging server startup issues
ipcMain.handle('get-diagnostics', () => {
  const serverBasePath = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'src')
    : path.join(__dirname, '../server/src');

  const configPath = path.join(serverBasePath, 'utils', 'config.js');
  const serverPath = path.join(serverBasePath, 'index.js');
  const nodeModulesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'node_modules')
    : path.join(__dirname, '../server/node_modules');

  return {
    platform: process.platform,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    serverBasePath,
    configExists: fs.existsSync(configPath),
    serverExists: fs.existsSync(serverPath),
    nodeModulesExists: fs.existsSync(nodeModulesPath),
    logPath: log.transports.file.getFile().path,
    seratoPath: store.get('seratoPath', detectSeratoPath()),
    musicPath: store.get('musicPath', path.join(os.homedir(), 'Music')),
    seratoPathExists: fs.existsSync(store.get('seratoPath', detectSeratoPath())),
    musicPathExists: fs.existsSync(store.get('musicPath', path.join(os.homedir(), 'Music')))
  };
});

ipcMain.handle('stop-server', async () => {
  await stopServer();
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

// Re-index library handler - allows manual re-indexing without restarting server
ipcMain.handle('reindex-library', async () => {
  if (!recrateService || !recrateService.parser) {
    return { success: false, message: 'Server not running' };
  }

  try {
    log.info('Manual library re-index requested');

    // Invalidate all caches
    recrateService.parser.invalidateCache();

    // Reset indexing status
    recrateService.parser.indexingStatus.isComplete = false;
    recrateService.parser.indexingStatus.isIndexing = false;

    // Start fresh indexing
    recrateService.parser.startBackgroundIndexing();

    return { success: true, message: 'Re-indexing started' };
  } catch (error) {
    log.error('Error starting re-index:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('open-external', (event, url) => {
  require('electron').shell.openExternal(url);
});

ipcMain.handle('get-proxy-status', () => {
  return {
    connected: proxyClient && proxyClient.isConnected(),
    deviceId: proxyClient ? proxyClient.getDeviceId() : null,
    url: proxyClient && proxyClient.isConnected() ? getProxyURL() : null
  };
});

// Get indexing status from server
ipcMain.handle('get-indexing-status', () => {
  if (!recrateService || !recrateService.parser) {
    return { isIndexing: false, isComplete: false };
  }
  return recrateService.parser.indexingStatus;
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();

  // Background auto-update (packaged builds only). Refresh the tray when state changes.
  initAutoUpdater({ onStatus: () => updateTrayMenu() });

  // Auto-start server if configured
  const autoStart = store.get('autoStart', true);
  if (autoStart) {
    startServer();
  }
});

app.on('before-quit', async () => {
  // Disable logging during shutdown to prevent EIO errors
  log.transports.console.level = false;
  log.transports.file.level = false;

  // Flush Sentry before quit
  await flushSentry();

  // Mark window as destroyed to prevent further IPC
  if (mainWindow) {
    mainWindow.removeAllListeners();
  }

  stopServer();
  disconnectFromProxy();
});

// Handle uncaught exceptions during shutdown gracefully
process.on('uncaughtException', (error) => {
  if (error.code === 'EIO' || error.message.includes('EIO')) {
    // Ignore EIO errors during shutdown - these are expected
    return;
  }
  log.error('Uncaught exception:', error);
  captureError(error, { tags: { type: 'uncaughtException' } });
});

// Handle unhandled promise rejections (prevent silent crashes)
process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise, 'reason:', reason);
  const error = reason instanceof Error ? reason : new Error(String(reason));
  captureError(error, { tags: { type: 'unhandledRejection' } });
  // Don't crash - just log for debugging
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
