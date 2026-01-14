require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const cors = require('cors');
const helmet = require('helmet');
const Sentry = require('@sentry/node');
const BinaryWebSocketManager = require('./binaryWebSocketManager');
const apiRouter = require('./api');
const logger = require('./utils/logger');
const { initSentry, captureError, flush: flushSentry } = require('./utils/sentry');

// Initialize Sentry early
initSentry();

const app = express();
const server = createServer(app);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased for base64 audio uploads

// Sentry error handler (must be after other middleware but before routes)
Sentry.setupExpressErrorHandler(app);

// Initialize Binary WebSocket manager (desktop connects here)
const wsManager = new BinaryWebSocketManager(server);

// Inject wsManager into API router
apiRouter.setWebSocketManager(wsManager);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    connectedDevices: wsManager.devices.size
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
  logger.info(`🖥️  Desktop Binary WebSocket: ws://localhost:${PORT}/ws/desktop`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  await flushSentry();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing server...');
  await flushSentry();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception:', error);
  captureError(error, { tags: { type: 'uncaughtException' } });
  await flushSentry();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  const error = reason instanceof Error ? reason : new Error(String(reason));
  captureError(error, { tags: { type: 'unhandledRejection' } });
});

module.exports = { app, server };
