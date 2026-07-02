const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Sentry = require('@sentry/node');
const logger = require('../utils/logger');
const { initSentry, captureError } = require('../utils/sentry');

const createLibraryRoutes = require('./routes/library');
const createCrateRoutes = require('./routes/crates');
const { createStreamingRoutes, createArtworkRoutes } = require('./routes/streaming');
const { createWaveformRoutes } = require('./routes/waveform');
const createSearchRoutes = require('./routes/search');
const createConfigRoutes = require('./routes/config');
const createIdentifyRoutes = require('./routes/identify');
const createAIRoutes = require('./routes/ai');
const createCuePointsRoutes = require('./routes/cuepoints');
const createBeatgridRoutes = require('./routes/beatgrid');
const createWebhookRoutes = require('./routes/webhooks');
const createSubscriptionRoutes = require('./routes/subscription');
const AudioWebSocketServer = require('./websocket-server');

/**
 * API Server - Express server with WebSocket support
 */
class APIServer {
  constructor(config, parser, writer, streamer, waveformGenerator = null, spectralAnalyzer = null) {
    this.config = config;
    this.parser = parser;
    this.writer = writer;
    this.streamer = streamer;
    this.waveformGenerator = waveformGenerator;
    this.spectralAnalyzer = spectralAnalyzer;

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

    // Initialize Sentry first
    initSentry();

    // Webhook routes MUST be registered before body parsers
    // Webhooks need raw body for signature verification
    this.app.use('/api/webhooks', createWebhookRoutes());
    logger.info('Webhook routes registered (before body parsing)');

    // Middleware
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' })); // Increased for base64 audio uploads
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
    this.app.use('/api/identify', createIdentifyRoutes());
    this.app.use('/api/ai', createAIRoutes(this.parser, this.writer));
    this.app.use('/api/cuepoints', createCuePointsRoutes(this.parser));
    this.app.use('/api/beatgrid', createBeatgridRoutes(this.parser));
    this.app.use('/api/subscription', createSubscriptionRoutes());

    // Waveform routes (optional - requires FFmpeg)
    if (this.waveformGenerator) {
      this.app.use('/api/waveform', createWaveformRoutes(this.waveformGenerator, this.spectralAnalyzer));
      logger.info('Waveform API enabled');
      if (this.spectralAnalyzer) {
        logger.info('Spectral analysis API enabled');
      }
    }

    // Sentry error handler (must be after all routes but before custom error handlers)
    Sentry.setupExpressErrorHandler(this.app);

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
      // Set a timeout to force resolution if close takes too long
      const timeout = setTimeout(() => {
        logger.warn('Server stop timed out after 5 seconds, forcing close');
        resolve();
      }, 5000);

      // Close Socket.IO first
      if (this.io) {
        this.io.close();
        logger.info('Socket.IO server closed');
      }

      // Close audio WebSocket server
      if (this.audioWsServer) {
        try {
          this.audioWsServer.close?.();
        } catch (e) {
          // Ignore errors
        }
        this.audioWsServer = null;
        logger.info('Audio WebSocket server closed');
      }

      if (this.httpServer) {
        // Force close all active connections (Node 18.2+)
        // This prevents keep-alive connections from blocking server close
        if (typeof this.httpServer.closeAllConnections === 'function') {
          this.httpServer.closeAllConnections();
          logger.info('Forced close of all active connections');
        }

        this.httpServer.close((err) => {
          clearTimeout(timeout);
          if (err) {
            logger.warn('Error closing HTTP server:', err.message);
          }
          logger.success('API server stopped');
          this.httpServer = null;
          resolve();
        });
      } else {
        clearTimeout(timeout);
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

    // Capture to Sentry with request context
    captureError(err, {
      extra: {
        path: req.path,
        method: req.method,
        query: req.query,
        ip: req.ip,
      },
      tags: {
        endpoint: req.path,
        method: req.method,
      },
    });

    res.status(err.status || 500).json({
      error: err.message || 'Internal server error',
      ...(this.config.isDevelopment && { stack: err.stack }),
    });
  }

  /**
   * Set up rate limiting for different endpoint types
   */
  setupRateLimiting() {
    // General API rate limiter - 1000 requests per 15 minutes per IP
    // Increased from 100 to support large libraries with pagination
    const generalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000,
      message: 'Too many requests from this IP, please try again later',
      standardHeaders: true, // Return rate limit info in headers
      legacyHeaders: false,
    });

    // Streaming rate limiter - 500 streams per minute per IP
    // Increased from 20 because:
    // 1. Each track makes multiple range requests as iOS buffers
    // 2. Rapid track skipping in DJ app is a valid use case
    // 3. Low limit was causing HTTP 429 → SwiftAudioEx.PlaybackError error 1
    const streamLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 500,
      message: 'Too many stream requests, please try again later',
      skipSuccessfulRequests: true, // Only count failed requests
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
