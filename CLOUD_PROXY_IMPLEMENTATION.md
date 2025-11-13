# Cloud Proxy Implementation - Seamless Remote Access

## 🎯 Objective

Replace Tailscale with a cloud-based proxy service that provides seamless remote access without requiring users to install VPN software. Think PlayStation Remote Play - just open the app and it works.

**Current Flow (Tailscale):**
```
User installs Tailscale → Signs in → Connects devices → Uses app
(5-10 minute setup, technical knowledge required)
```

**New Flow (Cloud Proxy):**
```
User opens app → Automatically connected → Works everywhere
(0 setup, zero technical knowledge)
```

---

## 🏗️ Architecture Overview

### **High-Level Design:**

```
┌─────────────┐         WebSocket          ┌──────────────┐
│   Desktop   │◄──────────────────────────►│ Cloud Proxy  │
│   (Server)  │   Persistent Connection    │  (Railway)   │
└─────────────┘                            └──────────────┘
                                                   ▲
                                                   │ HTTPS/WS
                                                   │
                                            ┌──────┴──────┐
                                            │   Mobile    │
                                            │    App      │
                                            └─────────────┘
```

### **How It Works:**

1. **Desktop Server Connects to Proxy:**
   - Opens WebSocket to cloud proxy on startup
   - Maintains persistent connection
   - Sends heartbeats every 30s
   - Automatically reconnects if dropped

2. **Mobile App Connects to Proxy:**
   - Makes HTTPS requests to proxy (same API as before)
   - No WebSocket needed on mobile
   - Proxy routes to correct desktop via device ID

3. **Request Flow:**
   ```
   Mobile → Proxy → Desktop → Proxy → Mobile
   
   1. Mobile: GET /api/library
   2. Proxy: Forwards to desktop via WebSocket
   3. Desktop: Processes request, sends response
   4. Proxy: Forwards response to mobile
   5. Mobile: Receives data
   ```

4. **Device Pairing:**
   - Desktop generates unique device ID on first run
   - QR code contains: proxy URL + device ID
   - Mobile scans QR → knows which desktop to connect to
   - No manual pairing needed

---

## 📦 Technology Stack

### **Cloud Proxy (Node.js):**
```
Runtime: Node.js 20
Framework: Express + ws (WebSocket)
Hosting: Railway (free tier → $5/mo)
Database: Redis (for connection registry)
Reverse Proxy: Nginx (Railway provides)
SSL: Automatic (Railway provides)
```

### **Why Railway:**
- ✅ Free $5/month credit (enough for beta)
- ✅ Automatic SSL/HTTPS
- ✅ Easy WebSocket support
- ✅ One-click Redis
- ✅ Deploy from GitHub
- ✅ Great DX

**Alternatives:** Heroku, Fly.io, Render (all work similarly)

---

## 🗂️ Project Structure

```
recrate/
├── packages/
│   ├── desktop/          # Electron app (existing)
│   ├── mobile/           # React Native app (existing)
│   ├── server/           # Local Node server (existing)
│   └── proxy/            # NEW - Cloud proxy service
│       ├── src/
│       │   ├── index.js              # Main server
│       │   ├── websocket.js          # Desktop connections
│       │   ├── api.js                # Mobile API routes
│       │   ├── deviceRegistry.js     # Track connected devices
│       │   ├── requestRouter.js      # Route requests to devices
│       │   └── utils/
│       │       ├── deviceId.js       # Device ID generation
│       │       └── logger.js         # Logging
│       ├── package.json
│       ├── Dockerfile                # Railway deployment
│       └── railway.json              # Railway config
└── .github/
    └── workflows/
        └── deploy-proxy.yml          # Auto-deploy to Railway
```

---

## 📋 Implementation Tasks

---

## 🔧 Task 1: Create Cloud Proxy Service

**File: Create `packages/proxy/package.json`**

```json
{
  "name": "@recrate/proxy",
  "version": "1.0.0",
  "description": "Cloud proxy for Recrate remote access",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.14.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "redis": "^4.6.11",
    "uuid": "^9.0.1",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

---

**File: Create `packages/proxy/src/index.js`**

Main proxy server entry point:

```javascript
const express = require('express');
const { createServer } = require('http');
const cors = require('cors');
const helmet = require('helmet');
const WebSocketManager = require('./websocket');
const apiRouter = require('./api');
const logger = require('./utils/logger');

const app = express();
const server = createServer(app);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    connectedDevices: wsManager.getConnectedDeviceCount()
  });
});

// API routes (mobile app connects here)
app.use('/api', apiRouter);

// Initialize WebSocket manager (desktop connects here)
const wsManager = new WebSocketManager(server);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info(`🚀 Proxy server running on port ${PORT}`);
  logger.info(`📱 Mobile API: http://localhost:${PORT}/api`);
  logger.info(`🖥️  Desktop WebSocket: ws://localhost:${PORT}/desktop`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server };
```

---

**File: Create `packages/proxy/src/websocket.js`**

Manages WebSocket connections from desktop apps:

```javascript
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const DeviceRegistry = require('./deviceRegistry');
const logger = require('./utils/logger');

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server, 
      path: '/desktop',
      clientTracking: true
    });
    
    this.deviceRegistry = new DeviceRegistry();
    
    this.wss.on('connection', this.handleConnection.bind(this));
    
    // Cleanup disconnected devices every minute
    setInterval(() => this.cleanup(), 60000);
    
    logger.info('WebSocket server initialized');
  }
  
  handleConnection(ws, req) {
    let deviceId = null;
    
    logger.info('Desktop attempting to connect');
    
    // Handle incoming messages from desktop
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'register':
            deviceId = await this.handleRegister(ws, message);
            break;
            
          case 'heartbeat':
            this.handleHeartbeat(deviceId);
            break;
            
          case 'response':
            this.handleResponse(deviceId, message);
            break;
            
          default:
            logger.warn(`Unknown message type: ${message.type}`);
        }
      } catch (error) {
        logger.error('Error handling message:', error);
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      if (deviceId) {
        this.deviceRegistry.disconnect(deviceId);
        logger.info(`Desktop disconnected: ${deviceId}`);
      }
    });
    
    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });
  }
  
  async handleRegister(ws, message) {
    const { deviceId, deviceName, version } = message;
    
    // Register device
    await this.deviceRegistry.register({
      deviceId,
      deviceName,
      version,
      connection: ws,
      connectedAt: Date.now()
    });
    
    logger.info(`Desktop registered: ${deviceId} (${deviceName})`);
    
    // Send confirmation
    ws.send(JSON.stringify({
      type: 'registered',
      deviceId,
      timestamp: Date.now()
    }));
    
    return deviceId;
  }
  
  handleHeartbeat(deviceId) {
    if (deviceId) {
      this.deviceRegistry.updateHeartbeat(deviceId);
    }
  }
  
  handleResponse(deviceId, message) {
    const { requestId, status, data, error } = message;
    
    // Store response for mobile app to retrieve
    this.deviceRegistry.storeResponse(deviceId, requestId, {
      status,
      data,
      error,
      timestamp: Date.now()
    });
  }
  
  // Send request to desktop
  async sendRequest(deviceId, request) {
    const device = await this.deviceRegistry.getDevice(deviceId);
    
    if (!device || !device.connection) {
      throw new Error('Device not connected');
    }
    
    const requestId = uuidv4();
    
    // Send to desktop
    device.connection.send(JSON.stringify({
      type: 'request',
      requestId,
      method: request.method,
      path: request.path,
      body: request.body,
      headers: request.headers
    }));
    
    return requestId;
  }
  
  // Wait for response from desktop
  async waitForResponse(deviceId, requestId, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const response = await this.deviceRegistry.getResponse(deviceId, requestId);
      
      if (response) {
        return response;
      }
      
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error('Request timeout');
  }
  
  cleanup() {
    this.deviceRegistry.cleanupStaleConnections();
  }
  
  getConnectedDeviceCount() {
    return this.deviceRegistry.getConnectedCount();
  }
}

module.exports = WebSocketManager;
```

---

**File: Create `packages/proxy/src/deviceRegistry.js`**

Tracks connected desktop devices and pending requests:

```javascript
const logger = require('./utils/logger');

class DeviceRegistry {
  constructor() {
    // In-memory storage (use Redis for production with multiple proxy instances)
    this.devices = new Map();
    this.responses = new Map(); // Map<deviceId, Map<requestId, response>>
  }
  
  async register(device) {
    const { deviceId, deviceName, version, connection, connectedAt } = device;
    
    this.devices.set(deviceId, {
      deviceId,
      deviceName,
      version,
      connection,
      connectedAt,
      lastHeartbeat: Date.now()
    });
    
    // Initialize response map for this device
    if (!this.responses.has(deviceId)) {
      this.responses.set(deviceId, new Map());
    }
    
    logger.info(`Device registered: ${deviceId}`);
  }
  
  async getDevice(deviceId) {
    return this.devices.get(deviceId);
  }
  
  async disconnect(deviceId) {
    this.devices.delete(deviceId);
    this.responses.delete(deviceId);
    logger.info(`Device disconnected: ${deviceId}`);
  }
  
  updateHeartbeat(deviceId) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastHeartbeat = Date.now();
    }
  }
  
  storeResponse(deviceId, requestId, response) {
    const deviceResponses = this.responses.get(deviceId);
    if (deviceResponses) {
      deviceResponses.set(requestId, response);
      
      // Auto-cleanup after 5 minutes
      setTimeout(() => {
        deviceResponses.delete(requestId);
      }, 5 * 60 * 1000);
    }
  }
  
  async getResponse(deviceId, requestId) {
    const deviceResponses = this.responses.get(deviceId);
    if (!deviceResponses) return null;
    
    const response = deviceResponses.get(requestId);
    if (response) {
      // Remove once retrieved
      deviceResponses.delete(requestId);
      return response;
    }
    
    return null;
  }
  
  cleanupStaleConnections() {
    const now = Date.now();
    const timeout = 90000; // 90 seconds (3 missed heartbeats)
    
    for (const [deviceId, device] of this.devices.entries()) {
      if (now - device.lastHeartbeat > timeout) {
        logger.warn(`Device ${deviceId} timed out, removing`);
        this.disconnect(deviceId);
      }
    }
  }
  
  getConnectedCount() {
    return this.devices.size;
  }
  
  getAllDevices() {
    return Array.from(this.devices.values()).map(device => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      connectedAt: device.connectedAt,
      lastHeartbeat: device.lastHeartbeat
    }));
  }
}

module.exports = DeviceRegistry;
```

---

**File: Create `packages/proxy/src/api.js`**

API routes for mobile app to connect:

```javascript
const express = require('express');
const router = express.Router();
const logger = require('./utils/logger');

// This will be injected by the main server
let wsManager = null;

function setWebSocketManager(manager) {
  wsManager = manager;
}

// Proxy all requests to desktop
router.all('/:deviceId/*', async (req, res) => {
  const { deviceId } = req.params;
  const path = '/' + req.params[0]; // Get the path after deviceId
  
  try {
    logger.info(`Mobile request: ${req.method} ${path} for device ${deviceId}`);
    
    // Send request to desktop via WebSocket
    const requestId = await wsManager.sendRequest(deviceId, {
      method: req.method,
      path,
      body: req.body,
      headers: req.headers
    });
    
    // Wait for response from desktop
    const response = await wsManager.waitForResponse(deviceId, requestId);
    
    // Send response to mobile
    res.status(response.status || 200).json(response.data);
    
  } catch (error) {
    logger.error('Error proxying request:', error);
    
    if (error.message === 'Device not connected') {
      res.status(503).json({ 
        error: 'Desktop not connected',
        message: 'Make sure Recrate is running on your computer'
      });
    } else if (error.message === 'Request timeout') {
      res.status(504).json({
        error: 'Request timeout',
        message: 'Desktop took too long to respond'
      });
    } else {
      res.status(500).json({ 
        error: 'Proxy error',
        message: error.message 
      });
    }
  }
});

// Check if device is connected
router.get('/device/:deviceId/status', async (req, res) => {
  const { deviceId } = req.params;
  
  const device = await wsManager.deviceRegistry.getDevice(deviceId);
  
  if (device) {
    res.json({
      connected: true,
      deviceName: device.deviceName,
      connectedAt: device.connectedAt,
      lastHeartbeat: device.lastHeartbeat
    });
  } else {
    res.json({
      connected: false
    });
  }
});

module.exports = router;
module.exports.setWebSocketManager = setWebSocketManager;
```

**Update `packages/proxy/src/index.js` to inject wsManager:**

```javascript
// After creating wsManager
const apiRouter = require('./api');
apiRouter.setWebSocketManager(wsManager);
app.use('/api', apiRouter);
```

---

**File: Create `packages/proxy/src/utils/logger.js`**

```javascript
const logger = {
  info: (...args) => {
    console.log(`[INFO] ${new Date().toISOString()}`, ...args);
  },
  
  warn: (...args) => {
    console.warn(`[WARN] ${new Date().toISOString()}`, ...args);
  },
  
  error: (...args) => {
    console.error(`[ERROR] ${new Date().toISOString()}`, ...args);
  }
};

module.exports = logger;
```

---

## 🖥️ Task 2: Update Desktop to Connect to Proxy

**File: Create `packages/desktop/src/proxyClient.js`**

Desktop WebSocket client that connects to proxy:

```javascript
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');

class ProxyClient {
  constructor(proxyURL, deviceId, deviceName) {
    this.proxyURL = proxyURL;
    this.deviceId = deviceId || this.generateDeviceId();
    this.deviceName = deviceName || require('os').hostname();
    this.ws = null;
    this.reconnectTimeout = null;
    this.heartbeatInterval = null;
    this.requestHandlers = new Map();
  }
  
  generateDeviceId() {
    // Generate or load from config
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(require('electron').app.getPath('userData'), 'device-id.txt');
    
    if (fs.existsSync(configPath)) {
      return fs.readFileSync(configPath, 'utf8').trim();
    }
    
    const deviceId = uuidv4();
    fs.writeFileSync(configPath, deviceId);
    return deviceId;
  }
  
  connect() {
    return new Promise((resolve, reject) => {
      try {
        logger.info(`Connecting to proxy: ${this.proxyURL}`);
        
        this.ws = new WebSocket(`${this.proxyURL}/desktop`);
        
        this.ws.on('open', () => {
          logger.info('Connected to proxy');
          
          // Register device
          this.ws.send(JSON.stringify({
            type: 'register',
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            version: require('../../package.json').version
          }));
          
          // Start heartbeat
          this.startHeartbeat();
          
          resolve();
        });
        
        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });
        
        this.ws.on('close', () => {
          logger.warn('Disconnected from proxy');
          this.stopHeartbeat();
          this.scheduleReconnect();
        });
        
        this.ws.on('error', (error) => {
          logger.error('WebSocket error:', error);
          reject(error);
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'registered':
          logger.info(`Registered with proxy: ${message.deviceId}`);
          break;
          
        case 'request':
          this.handleRequest(message);
          break;
          
        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Error handling message:', error);
    }
  }
  
  async handleRequest(message) {
    const { requestId, method, path, body, headers } = message;
    
    try {
      // Forward to local server
      const localServerURL = process.env.LOCAL_SERVER_URL || 'http://localhost:3000';
      
      const response = await fetch(`${localServerURL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });
      
      const data = await response.json();
      
      // Send response back to proxy
      this.ws.send(JSON.stringify({
        type: 'response',
        requestId,
        status: response.status,
        data
      }));
      
    } catch (error) {
      logger.error('Error handling request:', error);
      
      // Send error response
      this.ws.send(JSON.stringify({
        type: 'response',
        requestId,
        status: 500,
        error: error.message
      }));
    }
  }
  
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'heartbeat'
        }));
      }
    }, 30000); // Every 30 seconds
  }
  
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  scheduleReconnect() {
    if (this.reconnectTimeout) return;
    
    logger.info('Reconnecting in 5 seconds...');
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch(error => {
        logger.error('Reconnection failed:', error);
      });
    }, 5000);
  }
  
  disconnect() {
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  getDeviceId() {
    return this.deviceId;
  }
  
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

module.exports = ProxyClient;
```

---

**File: Update `packages/desktop/main.js`**

Integrate proxy client:

```javascript
const ProxyClient = require('./src/proxyClient');

const PROXY_URL = process.env.PROXY_URL || 'wss://recrate-proxy.up.railway.app';

let proxyClient = null;

// Start server and connect to proxy
ipcMain.handle('start-server', async () => {
  try {
    // Start local server (existing)
    await serverManager.start();
    
    // Connect to proxy
    proxyClient = new ProxyClient(
      PROXY_URL,
      null, // Will auto-generate deviceId
      require('os').hostname()
    );
    
    await proxyClient.connect();
    
    const deviceId = proxyClient.getDeviceId();
    const proxyURL = `${PROXY_URL.replace('wss:', 'https:')}/api/${deviceId}`;
    
    return {
      status: 'running',
      localURL: `http://localhost:3000`,
      proxyURL, // Mobile app will use this
      deviceId,
      qrCodeURL: proxyURL // QR code contains proxy URL
    };
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    return { status: 'error', error: error.message };
  }
});

// Stop server and disconnect from proxy
ipcMain.handle('stop-server', async () => {
  try {
    if (proxyClient) {
      proxyClient.disconnect();
      proxyClient = null;
    }
    
    await serverManager.stop();
    
    return { status: 'stopped' };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
});
```

---

## 📱 Task 3: Update Mobile App

**File: Update `packages/mobile/src/services/api.js`**

Mobile app now connects to proxy instead of direct IP:

```javascript
// No changes needed! The proxy URL acts just like a direct IP
// Mobile app doesn't know the difference

class APIService {
  constructor() {
    this.baseURL = null;
  }
  
  setServer(url) {
    // Can be either:
    // - Direct: http://192.168.1.100:3000
    // - Proxy: https://recrate-proxy.up.railway.app/api/device-123
    this.baseURL = url;
  }
  
  async getLibrary() {
    const response = await fetch(`${this.baseURL}/api/library`);
    return response.json();
  }
  
  // ... rest of API methods work exactly the same
}
```

**The beauty: Mobile app doesn't need to change!** It just uses a different URL.

---

## 🚀 Task 4: Deploy to Railway

**File: Create `packages/proxy/.env.example`**

```bash
# Proxy Configuration
PORT=3001
NODE_ENV=production

# Redis (optional, for multi-instance scaling)
REDIS_URL=redis://localhost:6379
```

---

**File: Create `packages/proxy/railway.json`**

```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

**File: Create `packages/proxy/Dockerfile`** (optional)

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

EXPOSE 3001

CMD ["npm", "start"]
```

---

**Deployment Steps:**

1. **Create Railway account:** https://railway.app
2. **Create new project:** "New Project" → "Empty Project"
3. **Connect GitHub:** Link your Recrate repository
4. **Configure service:**
   - Root directory: `packages/proxy`
   - Start command: `npm start`
   - Port: 3001 (Railway auto-detects)
5. **Deploy:** Railway automatically deploys on push
6. **Get URL:** Railway provides URL like `recrate-proxy.up.railway.app`
7. **Update desktop app:** Set `PROXY_URL=wss://recrate-proxy.up.railway.app`

**Cost:** Free $5/month credit, then ~$5/month for moderate usage

---

## 🎨 Task 5: Update Desktop UI

**File: Update `packages/desktop/renderer/js/main.js`**

Show proxy status instead of Tailscale:

```javascript
function updateConnectionInfo() {
  if (!serverURL) return;
  
  const urlElement = document.getElementById('connection-url');
  const iconElement = document.getElementById('connection-icon');
  const labelElement = document.getElementById('connection-label');
  
  // Always show proxy URL (works everywhere)
  urlElement.textContent = serverURL;
  iconElement.textContent = '🌐';
  labelElement.textContent = 'Works anywhere • Tap to copy';
  
  // Generate QR code with proxy URL
  generateQR(serverURL);
}
```

**Remove all Tailscale references** from UI:
- No more "Local Network" vs "Remote Access" sections
- Just one QR code that always works
- Simpler, cleaner

---

## 🧪 Testing Guide

### **Local Testing (Before Deploying):**

1. **Start proxy locally:**
```bash
cd packages/proxy
npm install
npm start
# Proxy runs on http://localhost:3001
```

2. **Update desktop to use local proxy:**
```bash
# In packages/desktop/.env
PROXY_URL=ws://localhost:3001
```

3. **Start desktop app:**
```bash
cd packages/desktop
npm start
# Desktop should connect to local proxy
```

4. **Check proxy logs:**
```
✅ Desktop registered: abc-123 (Johns-MacBook)
```

5. **Test mobile connection:**
```bash
# QR code should show: http://localhost:3001/api/abc-123
# Scan with phone (on same WiFi for local testing)
```

---

### **Production Testing (After Railway Deploy):**

1. **Deploy to Railway** (see deployment steps above)

2. **Get proxy URL:**
```
Railway provides: recrate-proxy.up.railway.app
```

3. **Update desktop app:**
```javascript
// In packages/desktop/main.js
const PROXY_URL = 'wss://recrate-proxy.up.railway.app';
```

4. **Rebuild desktop app:**
```bash
cd packages/desktop
npm run build
```

5. **Test from anywhere:**
   - ✅ Desktop at home
   - ✅ Phone on cellular
   - ✅ Should connect instantly

---

## 📊 Monitoring & Debugging

### **Proxy Health Check:**
```bash
curl https://recrate-proxy.up.railway.app/health

Response:
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "connectedDevices": 1
}
```

### **Check Device Status:**
```bash
curl https://recrate-proxy.up.railway.app/api/device/abc-123/status

Response:
{
  "connected": true,
  "deviceName": "Johns-MacBook",
  "connectedAt": 1705317000000,
  "lastHeartbeat": 1705317030000
}
```

### **Railway Logs:**
```bash
# View in Railway dashboard
# Or install Railway CLI:
npm i -g @railway/cli
railway login
railway logs
```

---

## ⚠️ Error Handling

### **Common Issues:**

**1. Desktop Can't Connect to Proxy:**
```
Error: WebSocket connection failed
```
**Fix:** Check proxy URL, ensure Railway is running, check firewall

**2. Mobile Gets "Device Not Connected":**
```
{"error": "Desktop not connected"}
```
**Fix:** Ensure desktop app is running and connected to proxy

**3. Request Timeout:**
```
{"error": "Request timeout"}
```
**Fix:** Desktop might be slow, sleeping, or local server crashed

**4. WebSocket Keeps Reconnecting:**
```
Disconnected from proxy
Reconnecting in 5 seconds...
```
**Fix:** Network issues, check internet connection

---

## 🔐 Security Considerations

### **Current Implementation (Beta):**
- ❌ No authentication (anyone with device ID can connect)
- ❌ No encryption beyond HTTPS/WSS
- ✅ Device IDs are UUIDs (hard to guess)
- ✅ Railway provides SSL automatically

### **For Production (Add Later):**

**1. Device Authentication:**
```javascript
// Desktop sends secret key
{
  type: 'register',
  deviceId: 'abc-123',
  secret: 'hashed-secret-key'
}

// Proxy validates before accepting
```

**2. Mobile Authentication:**
```javascript
// QR code includes one-time pairing token
const qrData = {
  proxyURL: 'https://...',
  deviceId: 'abc-123',
  pairingToken: 'xyz-789-one-time'
};
```

**3. Request Encryption:**
- Add end-to-end encryption between mobile and desktop
- Proxy can't see request contents
- Only routing, not reading

**4. Rate Limiting:**
```javascript
// In proxy
const rateLimit = require('express-rate-limit');

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each device to 100 requests per windowMs
}));
```

---

## 💰 Cost Analysis

### **Railway Pricing:**

**Free Tier:**
- $5/month credit
- Enough for: ~750 hours/month of runtime
- Perfect for beta with <10 users

**Paid:**
- $5/month for hobby plan
- ~$0.000463/GB-hour
- Estimate: $10-20/month for 100 active users

**Scaling:**
- 100 users: ~$20/month
- 1000 users: ~$100-150/month
- 10k users: Time to move to dedicated infrastructure

---

## 📈 Scaling Strategy

### **Phase 1: Beta (Current)**
- Single Railway instance
- In-memory device registry
- Good for <100 concurrent users

### **Phase 2: Growth (100-1000 users)**
- Add Redis for device registry
- Multiple Railway instances (load balanced)
- Horizontal scaling

### **Phase 3: Scale (1000+ users)**
- Move to AWS/GCP with Kubernetes
- Add CDN for API responses
- Implement caching layer
- Consider edge computing (Cloudflare Workers)

---

## 🎯 Success Criteria

Implementation is complete when:

1. ✅ Proxy service deployed to Railway
2. ✅ Desktop connects to proxy on startup
3. ✅ Mobile app works through proxy
4. ✅ QR code contains proxy URL (not local IP)
5. ✅ Works from anywhere (cellular, different WiFi)
6. ✅ No Tailscale installation required
7. ✅ Automatic reconnection works
8. ✅ Error handling is graceful
9. ✅ Monitoring/logging in place
10. ✅ Same UX as before (just works™)

---

## ⏱️ Time Estimate

- Task 1 (Proxy service): 4 hours
- Task 2 (Desktop integration): 2 hours
- Task 3 (Mobile - minimal changes): 30 min
- Task 4 (Railway deployment): 1 hour
- Task 5 (Desktop UI updates): 1 hour
- Testing & Debugging: 3 hours

**Total: ~11-12 hours of work**

---

## 🚀 Migration Plan

### **How to Switch from Tailscale to Proxy:**

**Week 1: Development**
- Build proxy service
- Test locally
- Deploy to Railway

**Week 2: Beta Testing**
- Update desktop app (auto-update)
- Gradual rollout to beta users
- Monitor for issues

**Week 3: Full Rollout**
- All users on proxy
- Deprecate Tailscale instructions
- Update documentation

**Tailscale can stay as backup** for users who prefer it (advanced setting).

---

This implementation gives you PlayStation Remote Play-level seamlessness. Users just open the app and it works - no VPN, no network configuration, no technical knowledge required! 🎮🎵
