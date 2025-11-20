const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const http = require('http');

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
    this.localServerURL = 'http://127.0.0.1:3000'; // Use IPv4 explicitly
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

      // Use http module instead of fetch (works better in Electron)
      const url = new URL(path, this.localServerURL);

      const options = {
        hostname: url.hostname,
        port: url.port || 3000,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const responseData = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            const contentType = res.headers['content-type'] || '';
            let parsedData;

            try {
              if (contentType.includes('application/json')) {
                parsedData = JSON.parse(data);
              } else {
                parsedData = data;
              }
            } catch (e) {
              parsedData = data;
            }

            resolve({ status: res.statusCode, data: parsedData });
          });
        });

        req.on('error', reject);

        // Only send body for non-GET/HEAD requests
        if (body && method !== 'GET' && method !== 'HEAD') {
          req.write(JSON.stringify(body));
        }

        req.end();
      });

      // Send response back to proxy
      this.ws.send(JSON.stringify({
        type: 'response',
        requestId,
        status: responseData.status,
        data: responseData.data
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
