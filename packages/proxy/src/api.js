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
