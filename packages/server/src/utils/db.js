const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('./logger');

let db = null;
let SQL = null;

/**
 * Get database file path - uses platform-aware cache directory
 */
function getDbPath() {
  let cacheDir;

  if (process.env.CACHE_DIR) {
    cacheDir = process.env.CACHE_DIR;
  } else {
    const platform = os.platform();
    if (platform === 'darwin') {
      cacheDir = path.join(os.homedir(), 'Library', 'Application Support', 'Recrate');
    } else if (platform === 'win32') {
      cacheDir = path.join(
        process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
        'Recrate'
      );
    } else {
      cacheDir = path.join(os.homedir(), '.config', 'recrate');
    }
  }

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  return path.join(cacheDir, 'recrate.db');
}

/**
 * Save database to disk (call after writes)
 */
function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(getDbPath(), buffer);
  logger.debug('[DB] Database saved to disk');
}

// Auto-save interval (every 30 seconds if dirty)
let isDirty = false;
let autoSaveInterval = null;

function startAutoSave() {
  if (autoSaveInterval) return;
  autoSaveInterval = setInterval(() => {
    if (isDirty && db) {
      saveDatabase();
      isDirty = false;
    }
  }, 30000);
}

function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

/**
 * Initialize the database
 * Now only manages cue_points table (users/quotas/usage moved to Firestore)
 */
async function initialize() {
  logger.info('[DB] Initializing database (cue points only)...');

  // Initialize sql.js
  SQL = await initSqlJs();

  // Load existing database or create new one
  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    logger.info('[DB] Loaded existing database');
  } else {
    db = new SQL.Database();
    logger.info('[DB] Created new database');
  }

  // Cue points table for storing track cue points (Q points)
  db.run(`
    CREATE TABLE IF NOT EXISTS cue_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT NOT NULL,
      bank_number INTEGER NOT NULL CHECK (bank_number BETWEEN 1 AND 8),
      position REAL NOT NULL CHECK (position >= 0),
      color TEXT,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(track_id, bank_number)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_cue_points_track ON cue_points(track_id)`);

  // Save initial schema
  saveDatabase();

  // Start auto-save interval
  startAutoSave();

  logger.success('[DB] Database initialized (cue points only)');
}

/**
 * Run a query and mark dirty for auto-save
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 */
function run(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  isDirty = true;
}

/**
 * Get single row from query
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Object|null} Row object or null
 */
function get(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

/**
 * Get all rows from query
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Array} Array of row objects
 */
function all(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * Check if database is initialized
 * @returns {boolean}
 */
function isInitialized() {
  return db !== null;
}

/**
 * Graceful shutdown - save database and close
 */
function close() {
  stopAutoSave();
  if (db) {
    if (isDirty) {
      saveDatabase();
    }
    db.close();
    db = null;
    logger.info('[DB] Database closed');
  }
}

module.exports = {
  initialize,
  run,
  get,
  all,
  close,
  saveDatabase,
  isInitialized,
  getDbPath,
};
