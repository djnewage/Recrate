const logger = {
  info: (...args) => {
    console.log(`[INFO] ${new Date().toISOString()}`, ...args);
  },

  warn: (...args) => {
    console.warn(`[WARN] ${new Date().toISOString()}`, ...args);
  },

  error: (...args) => {
    console.error(`[ERROR] ${new Date().toISOString()}`, ...args);

    // Send to Sentry (lazy require to avoid circular deps)
    try {
      const { captureError } = require('./sentry');
      const error = args.find((arg) => arg instanceof Error);
      if (error) {
        captureError(error, {
          extra: { args: args.filter((a) => !(a instanceof Error)).map(String) },
        });
      } else {
        const message = args
          .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
          .join(' ');
        captureError(new Error(message));
      }
    } catch {
      // Sentry not initialized yet, ignore
    }
  },
};

module.exports = logger;
