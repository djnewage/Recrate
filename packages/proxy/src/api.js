const express = require('express');
const router = express.Router();
const logger = require('./utils/logger');

// This will be injected by the main server
let wsManager = null;

function setWebSocketManager(manager) {
  wsManager = manager;
}

// Check if device is connected (must be before catch-all route)
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

// Proxy all requests to desktop (catch-all route must be last)
router.all('/:deviceId/*', async (req, res) => {
  const { deviceId} = req.params;
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
    if (response.isBinary) {
      // Decode base64 binary data
      const buffer = Buffer.from(response.data, 'base64');

      // Set headers from desktop response
      if (response.headers) {
        Object.keys(response.headers).forEach(key => {
          // Skip headers that Express sets automatically or that would cause conflicts
          const lowerKey = key.toLowerCase();
          if (lowerKey !== 'connection' && lowerKey !== 'transfer-encoding' && lowerKey !== 'date') {
            res.setHeader(key, response.headers[key]);
          }
        });
      }

      res.status(response.status || 200).send(buffer);
    } else {
      // For non-binary responses (JSON, text), send as-is
      res.status(response.status || 200).json(response.data);
    }

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

module.exports = router;
module.exports.setWebSocketManager = setWebSocketManager;
