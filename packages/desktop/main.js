const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { execSync, spawn } = require('child_process');
const Store = require('electron-store');
const log = require('electron-log');
const os = require('os');
const fs = require('fs');
const BinaryProxyClient = require('./src/binaryProxyClient');

// Configure logging - write to file for debugging packaged apps
log.transports.file.level = 'debug';
log.transports.file.resolvePathFn = () => path.join(app.getPath('logs'), 'main.log');
log.info('Recrate Desktop starting...');
log.info('Log file:', log.transports.file.getFile().path);

const store = new Store();
let mainWindow = null;
let tray = null;
let recrateService = null;  // Changed from serverProcess - now holds the service instance
let tailscaleServeProcess = null;
let proxyClient = null;
let serverPort = 3000;
let serverStatus = 'stopped';
let tailscaleServeURL = null;

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

/**
 * Start Tailscale HTTPS serve
 */
function startTailscaleServe() {
  // Only start if Tailscale is running (has an IP)
  const tailscaleIP = getTailscaleIP();
  if (!tailscaleIP) {
    log.info('Tailscale not running, skipping HTTPS serve');
    return;
  }

  if (tailscaleServeProcess) {
    log.info('Tailscale serve already running');
    return;
  }

  log.info('Starting Tailscale HTTPS serve...');

  // Get the Tailscale command path based on platform
  let tailscaleCmd;
  if (process.platform === 'darwin') {
    tailscaleCmd = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
  } else if (process.platform === 'linux') {
    tailscaleCmd = 'tailscale';
  } else if (process.platform === 'win32') {
    tailscaleCmd = 'tailscale';
  }

  // Check if command exists
  if (!fs.existsSync(tailscaleCmd) && process.platform === 'darwin') {
    log.warn('Tailscale not found at expected path');
    return;
  }

  tailscaleServeProcess = spawn(tailscaleCmd, ['serve', '--https=443', `http://localhost:${serverPort}`]);

  tailscaleServeProcess.stdout.on('data', (data) => {
    const output = data.toString();
    log.info('Tailscale Serve:', output);

    // Extract the HTTPS URL from output
    // Output format: "Available within your tailnet:\n\nhttps://..."
    const urlMatch = output.match(/https:\/\/[^\s]+/);
    if (urlMatch) {
      tailscaleServeURL = urlMatch[0].replace(/\/$/, ''); // Remove trailing slash
      log.info('Tailscale HTTPS URL:', tailscaleServeURL);

      // Update UI with Tailscale URL
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tailscale-serve-status', {
          running: true,
          url: tailscaleServeURL
        });
      }
    }
  });

  tailscaleServeProcess.stderr.on('data', (data) => {
    log.error('Tailscale Serve Error:', data.toString());
  });

  tailscaleServeProcess.on('close', (code) => {
    log.info(`Tailscale serve exited with code ${code}`);
    tailscaleServeProcess = null;
    tailscaleServeURL = null;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tailscale-serve-status', {
        running: false,
        url: null
      });
    }
  });

  tailscaleServeProcess.on('error', (error) => {
    log.error('Tailscale serve error:', error);
    tailscaleServeProcess = null;
    tailscaleServeURL = null;
  });
}

/**
 * Stop Tailscale HTTPS serve
 */
function stopTailscaleServe() {
  if (tailscaleServeProcess) {
    log.info('Stopping Tailscale serve...');
    tailscaleServeProcess.kill();
    tailscaleServeProcess = null;
    tailscaleServeURL = null;
  }
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

    // Continue without proxy - local and Tailscale still work
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
 * Kill any process using the specified port
 * Prevents "EADDRINUSE" errors from stale processes
 */
function killProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      // Windows: find and kill process on port
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const lines = result.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid)) {
          try {
            execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
            log.info(`Killed process ${pid} on port ${port}`);
          } catch (e) {
            // Process may have already exited
          }
        }
      }
    } else {
      // macOS/Linux: use lsof to find and kill process
      const result = execSync(`lsof -ti :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const pids = result.trim().split('\n').filter(p => p);
      for (const pid of pids) {
        try {
          execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
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
  killProcessOnPort(serverPort);

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

    serverStatus = 'running';
    updateTrayMenu();

    // Connect to cloud proxy
    await connectToProxy();

    // Start Tailscale HTTPS serve (fallback option)
    startTailscaleServe();

    // Get connection info
    const localIP = getLocalIP();
    const tailscaleIP = getTailscaleIP();
    const tailscaleInstalled = isTailscaleInstalled();

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
          tailscaleURL: tailscaleIP ? `http://${tailscaleIP}:${serverPort}` : null,
          tailscaleHTTPSURL: tailscaleServeURL,
          tailscaleInstalled,
          config: userConfig
        });
        log.info('Sent running status to renderer');
      }
    };

    // Send immediately and again after delays to ensure it's received
    sendStatus();
    setTimeout(sendStatus, 500);
    setTimeout(sendStatus, 1000);

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
async function stopServer() {
  if (recrateService) {
    log.info('Stopping server...');
    try {
      await recrateService.stop();
      log.info('Server stopped successfully');
    } catch (error) {
      log.error('Error stopping server:', error);
    }
    recrateService = null;
    serverStatus = 'stopped';
    updateTrayMenu();

    // Notify UI that server stopped
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-status', { status: 'stopped' });
    }
  }

  // Disconnect from proxy
  disconnectFromProxy();

  // Also stop Tailscale serve
  stopTailscaleServe();
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

// Path validation handler
ipcMain.handle('validate-path', (event, pathToCheck) => {
  const exists = fs.existsSync(pathToCheck);
  log.info(`Validating path: ${pathToCheck} - exists: ${exists}`);
  return exists;
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

ipcMain.handle('open-external', (event, url) => {
  require('electron').shell.openExternal(url);
});

ipcMain.handle('get-tailscale-info', () => {
  const tailscaleIP = getTailscaleIP();
  const installed = isTailscaleInstalled();

  return {
    installed,
    running: tailscaleIP !== null,
    ip: tailscaleIP,
    httpsURL: tailscaleServeURL,
    serveRunning: tailscaleServeProcess !== null
  };
});

ipcMain.handle('open-tailscale-url', () => {
  require('electron').shell.openExternal('https://tailscale.com/download');
});

ipcMain.handle('get-proxy-status', () => {
  return {
    connected: proxyClient && proxyClient.isConnected(),
    deviceId: proxyClient ? proxyClient.getDeviceId() : null,
    url: proxyClient && proxyClient.isConnected() ? getProxyURL() : null
  };
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
  // Disable logging during shutdown to prevent EIO errors
  log.transports.console.level = false;
  log.transports.file.level = false;

  // Mark window as destroyed to prevent further IPC
  if (mainWindow) {
    mainWindow.removeAllListeners();
  }

  stopServer();
  disconnectFromProxy();
  stopTailscaleServe();
});

// Handle uncaught exceptions during shutdown gracefully
process.on('uncaughtException', (error) => {
  if (error.code === 'EIO' || error.message.includes('EIO')) {
    // Ignore EIO errors during shutdown - these are expected
    return;
  }
  console.error('Uncaught exception:', error);
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
