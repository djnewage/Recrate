require('dotenv').config();
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

// Initialize WebSocket manager (desktop connects here)
const wsManager = new WebSocketManager(server);

// Inject wsManager into API router
apiRouter.setWebSocketManager(wsManager);

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

// Start server
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all interfaces for local testing
server.listen(PORT, HOST, () => {
  logger.info(`🚀 Proxy server running on ${HOST}:${PORT}`);
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

process.on('SIGINT', () => {
  logger.info('SIGINT received, closing server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server };
