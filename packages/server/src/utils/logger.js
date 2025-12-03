const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Simple colored logger for console output
 * Also writes to a log file for debugging in packaged Electron apps
 */
class Logger {
  constructor() {
    // ANSI color codes
    this.colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',

      // Foreground colors
      black: '\x1b[30m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',

      // Background colors
      bgBlack: '\x1b[40m',
      bgRed: '\x1b[41m',
      bgGreen: '\x1b[42m',
      bgYellow: '\x1b[43m',
      bgBlue: '\x1b[44m',
      bgMagenta: '\x1b[45m',
      bgCyan: '\x1b[46m',
      bgWhite: '\x1b[47m',
    };

    // Set up file logging for debugging
    this.logFile = null;
    this._initFileLogging();
  }

  /**
   * Initialize file logging
   */
  _initFileLogging() {
    try {
      // Determine log directory based on platform
      let logDir;
      if (process.platform === 'win32') {
        logDir = path.join(process.env.APPDATA || os.homedir(), 'Recrate', 'logs');
      } else if (process.platform === 'darwin') {
        logDir = path.join(os.homedir(), 'Library', 'Logs', 'Recrate');
      } else {
        logDir = path.join(os.homedir(), '.recrate', 'logs');
      }

      // Create log directory if it doesn't exist
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      this.logFile = path.join(logDir, 'server.log');

      // Write startup marker
      const startMsg = `\n${'='.repeat(60)}\nServer logger started at ${new Date().toISOString()}\n${'='.repeat(60)}\n`;
      fs.appendFileSync(this.logFile, startMsg);
    } catch (error) {
      // Silently fail if we can't set up file logging
      console.error('Failed to initialize file logging:', error.message);
    }
  }

  /**
   * Write to log file
   */
  _writeToFile(level, ...args) {
    if (!this.logFile) return;

    try {
      const timestamp = this.getTimestamp();
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      const line = `${timestamp} [${level}] ${message}\n`;
      fs.appendFileSync(this.logFile, line);
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * Get formatted timestamp
   */
  getTimestamp() {
    const now = new Date();
    return now.toISOString();
  }

  /**
   * Format log message with color and timestamp
   */
  format(level, color, ...args) {
    const timestamp = this.colors.dim + this.getTimestamp() + this.colors.reset;
    const prefix = color + `[${level}]` + this.colors.reset;
    console.log(timestamp, prefix, ...args);
  }

  /**
   * Info level logging (cyan)
   */
  info(...args) {
    this.format('INFO', this.colors.cyan, ...args);
    this._writeToFile('INFO', ...args);
  }

  /**
   * Error level logging (red)
   */
  error(...args) {
    this.format('ERROR', this.colors.red, ...args);
    this._writeToFile('ERROR', ...args);
  }

  /**
   * Warning level logging (yellow)
   */
  warn(...args) {
    this.format('WARN', this.colors.yellow, ...args);
    this._writeToFile('WARN', ...args);
  }

  /**
   * Debug level logging (magenta)
   */
  debug(...args) {
    this.format('DEBUG', this.colors.magenta, ...args);
    this._writeToFile('DEBUG', ...args);
  }

  /**
   * Success level logging (green)
   */
  success(...args) {
    this.format('SUCCESS', this.colors.green, ...args);
    this._writeToFile('SUCCESS', ...args);
  }
}

// Export singleton instance
module.exports = new Logger();
