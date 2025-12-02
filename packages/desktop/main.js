const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
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
let serverProcess = null;
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

// Start Node.js server
async function startServer() {
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

  // Kill any stale process on the port before starting
  log.info('Checking for stale processes on port', serverPort);
  killProcessOnPort(serverPort);

  log.info('Starting server with config:', config);
  log.info('App is packaged:', app.isPackaged);
  log.info('Resources path:', process.resourcesPath);

  // In development, run from source
  // In production, run bundled server
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'src', 'index.js')
    : path.join(__dirname, '../server/src/index.js');

  log.info('Server path:', serverPath);

  // Check if server file exists
  if (!fs.existsSync(serverPath)) {
    log.error('Server file not found:', serverPath);
    if (mainWindow) {
      mainWindow.webContents.send('server-error', `Server file not found: ${serverPath}`);
      mainWindow.webContents.send('server-status', {
        status: 'stopped',
        error: 'Server files not found. Please reinstall the application.'
      });
    }
    return;
  }

  // Check if node_modules exists (critical for packaged app)
  if (app.isPackaged) {
    const nodeModulesPath = path.join(process.resourcesPath, 'server', 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      log.error('Server node_modules not found:', nodeModulesPath);
      if (mainWindow) {
        mainWindow.webContents.send('server-error', `Server dependencies not found. The application may be corrupted.`);
        mainWindow.webContents.send('server-status', {
          status: 'stopped',
          error: 'Server dependencies missing. Please reinstall the application.'
        });
      }
      return;
    }
    log.info('Server node_modules found at:', nodeModulesPath);
  }

  // Pass paths as command-line arguments to handle special characters properly
  const serverArgs = [
    serverPath,
    `--serato-path=${config.seratoPath}`,
    `--music-path=${config.musicPath}`,
    `--port=${config.port}`
  ];

  log.info('Server args:', serverArgs);

  // Find Node.js executable
  // GUI apps on macOS don't inherit shell PATH, so 'which node' often fails
  // We need to explicitly check common Node.js installation locations
  let nodeCommand = 'node'; // Default for development

  if (app.isPackaged) {
    const nodeLocations = [
      '/opt/homebrew/bin/node',      // Homebrew on Apple Silicon
      '/usr/local/bin/node',         // Homebrew on Intel Mac
      '/usr/bin/node',               // System Node.js
      path.join(os.homedir(), '.nvm/current/bin/node'),  // NVM
      path.join(os.homedir(), '.nvm/versions/node/v20/bin/node'),  // NVM specific
      path.join(os.homedir(), '.nvm/versions/node/v22/bin/node'),  // NVM specific
    ];

    nodeCommand = null;
    for (const loc of nodeLocations) {
      log.debug('Checking for Node.js at:', loc);
      if (fs.existsSync(loc)) {
        nodeCommand = loc;
        log.info('Found Node.js at:', nodeCommand);
        break;
      }
    }

    // Fallback: try 'which node' (may work if PATH is set)
    if (!nodeCommand) {
      try {
        nodeCommand = execSync('which node', { encoding: 'utf8' }).trim();
        log.info('Found Node.js via which:', nodeCommand);
      } catch (e) {
        log.error('Could not find Node.js installation');
        // Show error dialog to user
        dialog.showErrorBox(
          'Node.js Required',
          'Could not find Node.js on your system.\n\nPlease install Node.js from https://nodejs.org and restart the app.'
        );
        if (mainWindow) {
          mainWindow.webContents.send('server-status', {
            status: 'stopped',
            error: 'Node.js not found. Please install from nodejs.org'
          });
        }
        return;
      }
    }
  }

  log.info('Starting server with Node.js:', nodeCommand);

  serverProcess = spawn(nodeCommand, serverArgs, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1'  // Makes Electron behave like Node.js (used as fallback)
    },
    cwd: app.isPackaged ? path.dirname(serverPath) : undefined
  });

  // Handle spawn errors (e.g., Node.js not found, permission denied)
  serverProcess.on('error', (err) => {
    log.error('Failed to start server process:', err);
    dialog.showErrorBox('Server Error', `Failed to start server: ${err.message}`);
    serverProcess = null;
    serverStatus = 'stopped';
    if (mainWindow) {
      mainWindow.webContents.send('server-status', {
        status: 'stopped',
        error: `Failed to start: ${err.message}`
      });
    }
  });

  serverProcess.stdout.on('data', async (data) => {
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

      // Connect to cloud proxy
      await connectToProxy();

      // Start Tailscale HTTPS serve (fallback option)
      startTailscaleServe();

      // Get connection info
      const localIP = getLocalIP();
      const tailscaleIP = getTailscaleIP();
      const tailscaleInstalled = isTailscaleInstalled();

      // Send status to renderer (with delay to ensure window is ready)
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
            config
          });
          log.info('Sent running status to renderer with proxy and Tailscale info');
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

  // Disconnect from proxy
  disconnectFromProxy();

  // Also stop Tailscale serve
  stopTailscaleServe();
}

// IPC Handlers
// Setup wizard handlers
ipcMain.handle('get-setup-complete', () => {
  return store.get('setupComplete', false);
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
