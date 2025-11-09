/**
 * Simple colored logger for console output
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
  }

  /**
   * Error level logging (red)
   */
  error(...args) {
    this.format('ERROR', this.colors.red, ...args);
  }

  /**
   * Warning level logging (yellow)
   */
  warn(...args) {
    this.format('WARN', this.colors.yellow, ...args);
  }

  /**
   * Debug level logging (magenta)
   */
  debug(...args) {
    this.format('DEBUG', this.colors.magenta, ...args);
  }

  /**
   * Success level logging (green)
   */
  success(...args) {
    this.format('SUCCESS', this.colors.green, ...args);
  }
}

// Export singleton instance
module.exports = new Logger();
