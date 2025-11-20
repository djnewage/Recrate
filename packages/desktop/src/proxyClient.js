const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ProxyClient {
  constructor(proxyURL, deviceId, deviceName, logger) {
    this.proxyURL = proxyURL;
    this.deviceId = deviceId || this.generateDeviceId();
    this.deviceName = deviceName || require('os').hostname();
    this.logger = logger || console;
    this.ws = null;
    this.reconnectTimeout = null;
    this.heartbeatInterval = null;
    this.requestHandlers = new Map();
    this.localServerURL = 'http://localhost:3000';
  }

  generateDeviceId() {
    // Generate or load from config
    const configPath = path.join(app.getPath('userData'), 'device-id.txt');

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
        this.logger.info(`Connecting to proxy: ${this.proxyURL}`);

        this.ws = new WebSocket(`${this.proxyURL}/desktop`);

        this.ws.on('open', () => {
          this.logger.info('Connected to proxy');

          // Register device
          this.ws.send(JSON.stringify({
            type: 'register',
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            version: require('../package.json').version || '1.0.0'
          }));

          // Start heartbeat
          this.startHeartbeat();

          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', () => {
          this.logger.warn('Disconnected from proxy');
          this.stopHeartbeat();
          this.scheduleReconnect();
        });

        this.ws.on('error', (error) => {
          this.logger.error('WebSocket error:', error.message);
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
          this.logger.info(`Registered with proxy: ${message.deviceId}`);
          break;

        case 'request':
          this.handleRequest(message);
          break;

        default:
          this.logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.logger.error('Error handling message:', error);
    }
  }

  async handleRequest(message) {
    const { requestId, method, path, body, headers } = message;

    try {
      this.logger.info(`Handling request: ${method} ${path}`);

      // Forward to local server
      const response = await fetch(`${this.localServerURL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });

      const contentType = response.headers.get('content-type');
      let data;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      // Send response back to proxy
      this.ws.send(JSON.stringify({
        type: 'response',
        requestId,
        status: response.status,
        data
      }));

    } catch (error) {
      this.logger.error('Error handling request:', error);

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

    this.logger.info('Reconnecting in 5 seconds...');

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch(error => {
        this.logger.error('Reconnection failed:', error.message);
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
