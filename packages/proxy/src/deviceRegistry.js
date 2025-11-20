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

    logger.info(`Device registered: ${deviceId} (${deviceName})`);
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
