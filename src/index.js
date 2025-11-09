const config = require("./utils/config");
const logger = require("./utils/logger");
const { SeratoParser } = require("./serato/parser");
const { SeratoWriter } = require("./serato/writer");
const AudioStreamer = require("./audio/streamer");
const APIServer = require("./api/server");

/**
 * Recrate Service - Main orchestrator
 */
class RecrateService {
  constructor() {
    this.parser = null;
    this.writer = null;
    this.streamer = null;
    this.apiServer = null;
    this.watcher = null;
    this.discovery = null;
  }

  /**
   * Initialize all components
   */
  async initialize() {
    logger.info("Starting Recrate Service...");
    logger.info(`Environment: ${config.env}`);
    logger.info(`Serato path: ${config.serato.path}`);

    try {
      // Initialize parser
      logger.info("Initializing Serato parser...");
      this.parser = new SeratoParser(config.serato.path, config.cache);
      await this.parser.verifySeratoPath();
      logger.success("Serato parser initialized");

      // Initialize writer
      logger.info("Initializing Serato writer...");
      this.writer = new SeratoWriter(config.serato.path, this.parser);
      logger.success("Serato writer initialized");

      // Initialize audio streamer
      logger.info("Initializing audio streamer...");
      this.streamer = new AudioStreamer(this.parser);
      logger.success("Audio streamer initialized");

      // Initialize API server
      logger.info("Initializing API server...");
      this.apiServer = new APIServer(
        config,
        this.parser,
        this.writer,
        this.streamer
      );
      this.apiServer.initialize();

      logger.success("All components initialized");
    } catch (error) {
      logger.error("Initialization failed:", error);
      throw error;
    }
  }

  /**
   * Start all services
   */
  async start() {
    try {
      // Start API server
      await this.apiServer.start();

      logger.success("Recrate Service started successfully!");
      logger.info("Ready to accept connections");

      // Log useful information
      this._logStartupInfo();
    } catch (error) {
      logger.error("Failed to start service:", error);
      throw error;
    }
  }

  /**
   * Stop all services gracefully
   */
  async stop() {
    logger.info("Shutting down Recrate Service...");

    try {
      // Stop API server
      if (this.apiServer) {
        await this.apiServer.stop();
      }

      // Stop file watcher
      if (this.watcher) {
        await this.watcher.stop();
      }

      // Stop service discovery
      if (this.discovery) {
        await this.discovery.stop();
      }

      logger.success("Recrate Service stopped gracefully");
      process.exit(0);
    } catch (error) {
      logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  }

  /**
   * Handle file system changes
   */
  handleFileChange(event) {
    logger.info("File change detected:", event);

    // Invalidate cache
    this.parser.invalidateCache();

    // Broadcast update to connected clients
    if (this.apiServer) {
      this.apiServer.broadcastUpdate("library-updated", {
        timestamp: new Date().toISOString(),
        event,
      });
    }
  }

  /**
   * Log startup information
   */
  _logStartupInfo() {
    logger.info("");
    logger.info("=".repeat(60));
    logger.success("Recrate Service is running!");
    logger.info("=".repeat(60));
    logger.info(
      `API Server: http://${config.server.host}:${config.server.port}`
    );
    logger.info(
      `Health Check: http://${config.server.host}:${config.server.port}/health`
    );
    logger.info("");
    logger.info("Available endpoints:");
    logger.info(`  GET    /api/library              - List all tracks`);
    logger.info(`  GET    /api/library/:id          - Get track details`);
    logger.info(`  GET    /api/crates               - List all crates`);
    logger.info(`  GET    /api/crates/:id           - Get crate details`);
    logger.info(`  POST   /api/crates               - Create new crate`);
    logger.info(`  POST   /api/crates/:id/tracks    - Add tracks to crate`);
    logger.info(`  DELETE /api/crates/:id/tracks/:trackId - Remove track`);
    logger.info(`  DELETE /api/crates/:id           - Delete crate`);
    logger.info(`  GET    /api/stream/:id           - Stream audio`);
    logger.info(`  GET    /api/artwork/:id          - Get artwork`);
    logger.info(`  GET    /api/search?q=query       - Search tracks`);
    logger.info("");
    logger.info("Mode: Read-write (⚠️  Crate modifications will affect Serato library)");
    logger.info("=".repeat(60));
    logger.info("");
  }
}

/**
 * Bootstrap function - Entry point
 */
async function bootstrap() {
  const service = new RecrateService();

  // Set up signal handlers for graceful shutdown
  process.on("SIGINT", () => {
    logger.info("");
    logger.warn("Received SIGINT signal");
    service.stop();
  });

  process.on("SIGTERM", () => {
    logger.info("");
    logger.warn("Received SIGTERM signal");
    service.stop();
  });

  // Set up error handlers
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception:", error);
    service.stop();
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled rejection at:", promise, "reason:", reason);
    service.stop();
  });

  try {
    // Initialize and start
    await service.initialize();
    await service.start();
  } catch (error) {
    logger.error("Failed to start service:", error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  bootstrap();
}

module.exports = RecrateService;
