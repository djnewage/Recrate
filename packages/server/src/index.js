const config = require("./utils/config");
const logger = require("./utils/logger");
const db = require("./utils/db");
const { initializeFirebase } = require("./utils/firebase");
const { SeratoParser } = require("./serato/parser");
const { SeratoWriter } = require("./serato/writer");
const AudioStreamer = require("./audio/streamer");
const WaveformGenerator = require("./audio/waveform");
const SpectralAnalyzer = require("./audio/spectral-analyzer");
const { FileCache } = require("./utils/cache");
const APIServer = require("./api/server");
const chokidar = require("chokidar");
const path = require("path");
const fs = require("fs");
const { initSentry, captureError, flush: flushSentry } = require("./utils/sentry");

/**
 * Recrate Service - Main orchestrator
 */
class RecrateService {
  constructor() {
    this.parser = null;
    this.writer = null;
    this.streamer = null;
    this.waveformGenerator = null;
    this.spectralAnalyzer = null;
    this.waveformCache = null;
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
      // Initialize Firebase Admin SDK for token verification
      logger.info("Initializing Firebase Admin SDK...");
      initializeFirebase();

      // Initialize database for usage tracking and auth
      logger.info("Initializing database...");
      await db.initialize();
      logger.success("Database initialized");

      // Initialize parser
      logger.info("Initializing Serato parser...");
      if (config.serato.musicPaths && config.serato.musicPaths.length > 0) {
        logger.info(`Music paths (${config.serato.musicPaths.length}):`);
        config.serato.musicPaths.forEach((p, i) => {
          logger.info(`  [${i + 1}] ${p}`);
        });
      }
      this.parser = new SeratoParser(config.serato.path, config.serato.musicPaths, config.cache);
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

      // Initialize waveform generator and spectral analyzer
      logger.info("Initializing waveform generator...");
      this._ensureFFmpegInPath();
      this.waveformCache = new FileCache(config.cache.directory);
      this.waveformGenerator = new WaveformGenerator(this.parser, this.waveformCache);
      const ffmpegAvailable = await this.waveformGenerator.checkFFmpeg();
      if (ffmpegAvailable) {
        logger.success("Waveform generator initialized (FFmpeg available)");

        // Initialize spectral analyzer (uses same cache)
        logger.info("Initializing spectral analyzer...");
        this.spectralAnalyzer = new SpectralAnalyzer(this.parser, this.waveformCache);
        logger.success("Spectral analyzer initialized");
      } else {
        logger.warn("FFmpeg not found - waveform generation will be unavailable");
        logger.warn(
          process.platform === "win32"
            ? "Install FFmpeg with: winget install FFmpeg"
            : "Install FFmpeg with: brew install ffmpeg"
        );
        this.waveformGenerator = null;
      }

      // Initialize API server
      logger.info("Initializing API server...");
      this.apiServer = new APIServer(
        config,
        this.parser,
        this.writer,
        this.streamer,
        this.waveformGenerator,
        this.spectralAnalyzer
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

      // Set WebSocket instance on parser for progress updates
      if (this.apiServer.io) {
        this.parser.setWebSocket(this.apiServer.io);
        logger.debug("WebSocket connected to parser for progress updates");
      }

      logger.success("Recrate Service started successfully!");
      logger.info("Ready to accept connections");

      // Log useful information
      this._logStartupInfo();

      // Start background indexing (non-blocking)
      logger.info("Starting background library indexing...");
      logger.info("Note: Library will be available once indexing completes (may take a few minutes for large libraries)");
      this.parser.startBackgroundIndexing();

      // Start file watcher for Subcrates folder
      this._startCrateWatcher();
    } catch (error) {
      logger.error("Failed to start service:", error);
      throw error;
    }
  }

  /**
   * Start watching the Subcrates folder for changes
   * This detects when Serato modifies crate files externally
   */
  _startCrateWatcher() {
    const subcratesPath = path.join(config.serato.path, "Subcrates");
    logger.info(`Starting crate file watcher on: ${subcratesPath}`);

    this.watcher = chokidar.watch(subcratesPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher.on("change", (filePath) => {
      if (filePath.endsWith(".crate")) {
        const crateName = path.basename(filePath, ".crate");
        logger.info(`[WATCHER] Crate file changed: ${crateName}`);
        this.parser.invalidateCache("crates-list");
        this.parser.invalidateCache(`crate-${this._slugify(crateName)}`);

        // Broadcast update to connected clients
        if (this.apiServer && this.apiServer.io) {
          this.apiServer.io.emit("crate:updated", { crateName, filePath });
        }
      }
    });

    this.watcher.on("add", (filePath) => {
      if (filePath.endsWith(".crate")) {
        const crateName = path.basename(filePath, ".crate");
        logger.info(`[WATCHER] New crate file detected: ${crateName}`);
        this.parser.invalidateCache("crates-list");

        // Broadcast update to connected clients
        if (this.apiServer && this.apiServer.io) {
          this.apiServer.io.emit("crate:added", { crateName, filePath });
        }
      }
    });

    this.watcher.on("unlink", (filePath) => {
      if (filePath.endsWith(".crate")) {
        const crateName = path.basename(filePath, ".crate");
        logger.info(`[WATCHER] Crate file deleted: ${crateName}`);
        this.parser.invalidateCache("crates-list");
        this.parser.invalidateCache(`crate-${this._slugify(crateName)}`);

        // Broadcast update to connected clients
        if (this.apiServer && this.apiServer.io) {
          this.apiServer.io.emit("crate:deleted", { crateName, filePath });
        }
      }
    });

    this.watcher.on("error", (error) => {
      logger.error("[WATCHER] Error:", error);
    });

    logger.success("Crate file watcher started");
  }

  /**
   * Convert name to URL-friendly slug (matches parser.slugify)
   */
  _slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Search common Windows install locations for ffmpeg.exe and add to PATH if found.
   * No-op on non-Windows platforms.
   */
  _ensureFFmpegInPath() {
    if (process.platform !== "win32") return;

    // Quick check: if ffmpeg is already reachable, nothing to do
    const pathDirs = (process.env.PATH || "").split(path.delimiter);
    for (const dir of pathDirs) {
      if (dir && fs.existsSync(path.join(dir, "ffmpeg.exe"))) return;
    }

    logger.info("FFmpeg not on PATH – searching common Windows install locations...");

    const candidates = [];

    // 1. WinGet packages (most common modern install)
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const wingetPkgs = path.join(localAppData, "Microsoft", "WinGet", "Packages");
      if (fs.existsSync(wingetPkgs)) {
        try {
          const pkgDirs = fs.readdirSync(wingetPkgs);
          for (const pkg of pkgDirs) {
            if (!pkg.toLowerCase().includes("ffmpeg")) continue;
            // Walk one level of subdirs to find the bin folder
            const pkgPath = path.join(wingetPkgs, pkg);
            this._findFFmpegBin(pkgPath, candidates, 3);
          }
        } catch (e) {
          logger.debug(`Could not scan WinGet packages: ${e.message}`);
        }
      }
    }

    // 2. Common manual-install paths
    const staticPaths = [
      "C:\\ffmpeg\\bin",
      "C:\\Program Files\\ffmpeg\\bin",
      "C:\\Program Files (x86)\\ffmpeg\\bin",
    ];
    for (const p of staticPaths) {
      if (fs.existsSync(path.join(p, "ffmpeg.exe"))) {
        candidates.push(p);
      }
    }

    // 3. Chocolatey
    const chocoPath = "C:\\ProgramData\\chocolatey\\bin";
    if (fs.existsSync(path.join(chocoPath, "ffmpeg.exe"))) {
      candidates.push(chocoPath);
    }

    if (candidates.length > 0) {
      const ffmpegDir = candidates[0];
      process.env.PATH = ffmpegDir + path.delimiter + process.env.PATH;
      logger.success(`Found FFmpeg at: ${ffmpegDir} (added to PATH)`);
    } else {
      logger.debug("FFmpeg not found in any common Windows location");
    }
  }

  /**
   * Recursively search a directory for a bin folder containing ffmpeg.exe.
   */
  _findFFmpegBin(dir, results, maxDepth) {
    if (maxDepth <= 0) return;
    try {
      const ffmpegPath = path.join(dir, "ffmpeg.exe");
      if (fs.existsSync(ffmpegPath)) {
        results.push(dir);
        return;
      }
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          this._findFFmpegBin(path.join(dir, entry.name), results, maxDepth - 1);
          if (results.length > 0) return; // stop after first match
        }
      }
    } catch (e) {
      // Permission errors, etc. – skip silently
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
        await this.watcher.close();
        logger.info("Crate file watcher stopped");
      }

      // Stop service discovery
      if (this.discovery) {
        await this.discovery.stop();
      }

      // Close database (saves any pending changes)
      db.close();

      logger.success("Recrate Service stopped gracefully");
      // Note: Don't call process.exit() here - let the caller decide
      // This allows the service to be used in-process (e.g., Electron main process)
    } catch (error) {
      logger.error("Error during shutdown:", error);
      throw error; // Re-throw instead of process.exit() so caller can handle
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
    logger.info(`  GET    /api/library/status       - Get indexing status`);
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
    logger.info(`  GET    /api/waveform/:id         - Get waveform peaks`);
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
  // Initialize Sentry early for error tracking
  initSentry();

  const service = new RecrateService();

  // Set up signal handlers for graceful shutdown
  process.on("SIGINT", async () => {
    logger.info("");
    logger.warn("Received SIGINT signal");
    await flushSentry();
    await service.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("");
    logger.warn("Received SIGTERM signal");
    await flushSentry();
    await service.stop();
    process.exit(0);
  });

  // Set up error handlers
  process.on("uncaughtException", async (error) => {
    logger.error("Uncaught exception:", error);
    captureError(error, { tags: { type: "uncaughtException" } });
    await flushSentry();
    await service.stop();
    process.exit(1);
  });

  process.on("unhandledRejection", async (reason, promise) => {
    logger.error("Unhandled rejection at:", promise, "reason:", reason);
    const error = reason instanceof Error ? reason : new Error(String(reason));
    captureError(error, { tags: { type: "unhandledRejection" } });
    await flushSentry();
    await service.stop();
    process.exit(1);
  });

  try {
    // Initialize and start
    await service.initialize();
    await service.start();
  } catch (error) {
    logger.error("Failed to start service:", error);
    captureError(error, { tags: { type: "startupError" } });
    await flushSentry();
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  bootstrap();
}

module.exports = RecrateService;
