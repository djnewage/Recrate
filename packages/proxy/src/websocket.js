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
