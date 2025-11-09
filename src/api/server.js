const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');
const logger = require('../utils/logger');

const createLibraryRoutes = require('./routes/library');
const createCrateRoutes = require('./routes/crates');
const { createStreamingRoutes, createArtworkRoutes } = require('./routes/streaming');
const createSearchRoutes = require('./routes/search');

/**
 * API Server - Express server with WebSocket support
 */
class APIServer {
  constructor(config, parser, writer, streamer) {
    this.config = config;
    this.parser = parser;
    this.writer = writer;
    this.streamer = streamer;

    this.app = express();
    this.httpServer = null;
    this.io = null;
  }

  /**
   * Initialize Express app and middleware
   */
  initialize() {
    logger.info('Initializing API server...');

    // Middleware
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(morgan('dev'));

    // Health check endpoint
    this.app.get('/health', this.healthCheck.bind(this));

    // API routes
    this.app.use('/api/library', createLibraryRoutes(this.parser));
    this.app.use('/api/crates', createCrateRoutes(this.parser, this.writer));
    this.app.use('/api/stream', createStreamingRoutes(this.streamer));
    this.app.use('/api/artwork', createArtworkRoutes(this.streamer));
    this.app.use('/api/search', createSearchRoutes(this.parser));

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path,
      });
    });

    // Error handler
    this.app.use(this.errorHandler.bind(this));

    logger.success('API server initialized');
  }

  /**
   * Start HTTP server and WebSocket
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server
        this.httpServer = createServer(this.app);

        // Set up WebSocket
        this.setupWebSocket();

        // Start listening
        this.httpServer.listen(this.config.server.port, this.config.server.host, () => {
          logger.success(
            `Server running at http://${this.config.server.host}:${this.config.server.port}`
          );
          resolve();
        });

        this.httpServer.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop server gracefully
   */
  async stop() {
    logger.info('Stopping API server...');

    return new Promise((resolve) => {
      if (this.io) {
        this.io.close();
      }

      if (this.httpServer) {
        this.httpServer.close(() => {
          logger.success('API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Health check endpoint
   */
  healthCheck(req, res) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'Recrate',
      version: '1.0.0',
    });
  }

  /**
   * Global error handler middleware
   */
  errorHandler(err, req, res, next) {
    logger.error('Unhandled error:', err);

    res.status(err.status || 500).json({
      error: err.message || 'Internal server error',
      ...(this.config.isDevelopment && { stack: err.stack }),
    });
  }

  /**
   * Set up WebSocket for real-time updates
   */
  setupWebSocket() {
    this.io = new Server(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      logger.info(`WebSocket client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        logger.info(`WebSocket client disconnected: ${socket.id}`);
      });
    });

    logger.success('WebSocket server initialized');
  }

  /**
   * Broadcast update to all connected clients
   */
  broadcastUpdate(event, data) {
    if (this.io) {
      this.io.emit(event, data);
      logger.debug(`Broadcast event: ${event}`);
    }
  }
}

module.exports = APIServer;
