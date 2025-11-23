const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const logger = require('../utils/logger');

const createLibraryRoutes = require('./routes/library');
const createCrateRoutes = require('./routes/crates');
const { createStreamingRoutes, createArtworkRoutes } = require('./routes/streaming');
const createSearchRoutes = require('./routes/search');
const createConfigRoutes = require('./routes/config');
const AudioWebSocketServer = require('./websocket-server');

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
    this.audioWsServer = null;
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

    // Rate limiting middleware
    this.setupRateLimiting();

    // Health check endpoint (no rate limiting)
    this.app.get('/health', this.healthCheck.bind(this));

    // API routes
    this.app.use('/api/library', createLibraryRoutes(this.parser));
    this.app.use('/api/crates', createCrateRoutes(this.parser, this.writer));
    this.app.use('/api/stream', createStreamingRoutes(this.streamer));
    this.app.use('/api/artwork', createArtworkRoutes(this.streamer));
    this.app.use('/api/search', createSearchRoutes(this.parser));
    this.app.use('/api/config', createConfigRoutes(this.parser));

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
   * Set up rate limiting for different endpoint types
   */
  setupRateLimiting() {
    // General API rate limiter - 100 requests per 15 minutes per IP
    const generalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      message: 'Too many requests from this IP, please try again later',
      standardHeaders: true, // Return rate limit info in headers
      legacyHeaders: false,
    });

    // Streaming rate limiter - 20 streams per minute per IP
    const streamLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 20,
      message: 'Too many stream requests, please try again later',
      skipSuccessfulRequests: false,
    });

    // Write operations rate limiter - 30 write operations per 15 minutes
    const writeLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 30,
      message: 'Too many write operations, please try again later',
    });

    // Apply general limiter to all API routes
    this.app.use('/api/', generalLimiter);

    // Apply specific limiters to streaming and write endpoints
    this.app.use('/api/stream/', streamLimiter);
    this.app.use('/api/artwork/', streamLimiter);

    // Write operations (POST, DELETE)
    this.app.use('/api/crates', (req, res, next) => {
      if (req.method === 'POST' || req.method === 'DELETE') {
        return writeLimiter(req, res, next);
      }
      next();
    });

    logger.info('Rate limiting configured');
  }

  /**
   * Set up WebSocket for real-time updates
   */
  setupWebSocket() {
    // Socket.IO for mobile app progress updates
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

    logger.success('Socket.IO server initialized');

    // Binary WebSocket server for Desktop Relay audio streaming
    this.audioWsServer = new AudioWebSocketServer(this.httpServer, this.parser);
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
