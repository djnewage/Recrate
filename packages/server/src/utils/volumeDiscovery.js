const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');

const execPromise = promisify(exec);

/**
 * Volume Discovery Service
 * Automatically detects mounted volumes and scans for Serato installations
 */
class VolumeDiscovery {
  constructor() {
    this.platform = os.platform();
  }

  /**
   * Get all mounted volumes on the system
   * @returns {Promise<Array>} Array of volume objects
   */
  async getMountedVolumes() {
    try {
      if (this.platform === 'darwin') {
        return await this.getMacOSVolumes();
      } else if (this.platform === 'win32') {
        return await this.getWindowsVolumes();
      } else {
        return await this.getLinuxVolumes();
      }
    } catch (error) {
      logger.error('Error getting mounted volumes:', error);
      return [];
    }
  }

  /**
   * Get mounted volumes on macOS
   * @private
   */
  async getMacOSVolumes() {
    const volumes = [];
    const volumesDir = '/Volumes';

    try {
      const entries = await fs.readdir(volumesDir);

      for (const entry of entries) {
        const volumePath = path.join(volumesDir, entry);

        try {
          const stats = await fs.lstat(volumePath);

          // Skip symlinks (Macintosh HD is typically a symlink to /)
          if (stats.isSymbolicLink()) {
            continue;
          }

          if (stats.isDirectory()) {
            // Try to get disk info using diskutil
            let isExternal = false;
            try {
              const { stdout } = await execPromise(`diskutil info "${volumePath}" 2>/dev/null`);
              isExternal = stdout.includes('External: Yes') || stdout.includes('Removable Media: Yes');
            } catch {
              // Fallback: assume external if not in common internal locations
              isExternal = true;
            }

            volumes.push({
              name: entry,
              path: volumePath,
              type: isExternal ? 'external' : 'internal',
              available: true,
            });
          }
        } catch (error) {
          // Skip volumes we can't access
          logger.debug(`Cannot access volume ${volumePath}:`, error.message);
        }
      }
    } catch (error) {
      logger.warn('Cannot read /Volumes directory:', error.message);
    }

    // Always include root as internal
    volumes.unshift({
      name: 'Macintosh HD',
      path: '/',
      type: 'internal',
      available: true,
    });

    return volumes;
  }

  /**
   * Get mounted volumes on Windows
   * @private
   */
  async getWindowsVolumes() {
    const volumes = [];

    try {
      const { stdout } = await execPromise('wmic logicaldisk get name,description,drivetype');
      const lines = stdout.split('\n').filter(line => line.trim());

      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const match = line.match(/(.+?)\s+(\w:)\s+(\d+)/);
        if (match) {
          const [, description, driveLetter, driveType] = match;
          // DriveType: 2 = Removable, 3 = Local, 4 = Network, 5 = CD-ROM
          const isExternal = driveType === '2';

          volumes.push({
            name: `${driveLetter}\\`,
            path: `${driveLetter}\\`,
            type: isExternal ? 'external' : 'internal',
            available: true,
          });
        }
      }
    } catch (error) {
      logger.warn('Cannot get Windows volumes:', error.message);
    }

    return volumes;
  }

  /**
   * Get mounted volumes on Linux
   * @private
   */
  async getLinuxVolumes() {
    const volumes = [];

    // Check common mount points
    const mountPoints = ['/media', '/mnt'];

    for (const mountPoint of mountPoints) {
      try {
        const entries = await fs.readdir(mountPoint);

        for (const entry of entries) {
          const volumePath = path.join(mountPoint, entry);

          try {
            const stats = await fs.stat(volumePath);

            if (stats.isDirectory()) {
              volumes.push({
                name: entry,
                path: volumePath,
                type: 'external',
                available: true,
              });
            }
          } catch {
            // Skip inaccessible volumes
          }
        }
      } catch {
        // Mount point doesn't exist
      }
    }

    // Add root as internal
    volumes.unshift({
      name: 'System',
      path: '/',
      type: 'internal',
      available: true,
    });

    return volumes;
  }

  /**
   * Find all Serato installations across all volumes
   * @returns {Promise<Array>} Array of Serato installation objects
   */
  async findSeratoInstallations() {
    const installations = [];
    const volumes = await this.getMountedVolumes();

    logger.info(`Scanning ${volumes.length} volumes for Serato installations...`);

    // Common Serato directory patterns
    const searchPaths = [
      '_Serato_',
      'Music/_Serato_',
      'DJ/_Serato_',
      'Serato/_Serato_',
      'Documents/_Serato_',
    ];

    // Check each volume
    for (const volume of volumes) {
      for (const searchPath of searchPaths) {
        const seratoPath = path.join(volume.path, searchPath);

        const validation = await this.validateSeratoPath(seratoPath);
        if (validation.valid) {
          // Auto-detect music paths (parent directory or common locations)
          const musicPaths = await this.detectMusicPaths(volume.path, seratoPath);

          installations.push({
            id: this.generateId(seratoPath),
            name: this.generateName(volume.name, seratoPath),
            seratoPath,
            musicPaths,
            volume: volume.name,
            volumePath: volume.path,
            volumeType: volume.type,
            trackCount: validation.trackCount,
            crateCount: validation.crateCount,
            available: true,
            lastModified: validation.lastModified,
          });

          logger.info(`Found Serato installation at ${seratoPath}`);
        }
      }
    }

    // Also check home directory (standard macOS/Linux location)
    const homeSerato = path.join(os.homedir(), 'Music', '_Serato_');
    const homeValidation = await this.validateSeratoPath(homeSerato);
    if (homeValidation.valid) {
      const musicPaths = await this.detectMusicPaths(os.homedir(), homeSerato);

      installations.push({
        id: this.generateId(homeSerato),
        name: 'Main Library',
        seratoPath: homeSerato,
        musicPaths,
        volume: 'Home',
        volumePath: os.homedir(),
        volumeType: 'internal',
        trackCount: homeValidation.trackCount,
        crateCount: homeValidation.crateCount,
        available: true,
        lastModified: homeValidation.lastModified,
      });

      logger.info(`Found Serato installation at ${homeSerato}`);
    }

    logger.info(`Found ${installations.length} Serato installation(s)`);

    return installations;
  }

  /**
   * Validate a Serato path
   * @param {string} seratoPath - Path to potential _Serato_ directory
   * @returns {Promise<Object>} Validation result with metadata
   */
  async validateSeratoPath(seratoPath) {
    try {
      // Check if directory exists
      const stats = await fs.stat(seratoPath);
      if (!stats.isDirectory()) {
        return { valid: false };
      }

      // Check for database V2 file
      const dbPath = path.join(seratoPath, 'database V2');
      let hasDatabase = false;
      let trackCount = 0;
      let lastModified = null;

      try {
        const dbStats = await fs.stat(dbPath);
        hasDatabase = dbStats.isFile();
        lastModified = dbStats.mtime;

        // Quick estimate of track count (very rough, based on file size)
        // Average entry is ~200 bytes, but this is just for display
        trackCount = Math.floor(dbStats.size / 200);
      } catch {
        // Database file doesn't exist
      }

      // Check for Subcrates directory
      const cratesDir = path.join(seratoPath, 'Subcrates');
      let crateCount = 0;

      try {
        const crateFiles = await fs.readdir(cratesDir);
        crateCount = crateFiles.filter(f => f.endsWith('.crate')).length;
      } catch {
        // Subcrates directory doesn't exist
      }

      // Valid if has database OR crates
      const valid = hasDatabase || crateCount > 0;

      return {
        valid,
        hasDatabase,
        trackCount,
        crateCount,
        lastModified,
      };
    } catch (error) {
      return { valid: false };
    }
  }

  /**
   * Auto-detect music paths for a Serato installation
   * @param {string} volumePath - Root volume path
   * @param {string} seratoPath - Serato directory path
   * @returns {Promise<Array>} Array of music directory paths
   * @private
   */
  async detectMusicPaths(volumePath, seratoPath) {
    const musicPaths = [];

    // Strategy 1: Parent directory of _Serato_
    const parentDir = path.dirname(seratoPath);
    musicPaths.push(parentDir);

    // Strategy 2: Common music folder names on the volume
    const commonMusicFolders = ['Music', 'DJ', 'Serato', 'Audio', 'Tracks'];

    for (const folder of commonMusicFolders) {
      const musicPath = path.join(volumePath, folder);

      try {
        const stats = await fs.stat(musicPath);
        if (stats.isDirectory() && !musicPaths.includes(musicPath)) {
          musicPaths.push(musicPath);
        }
      } catch {
        // Folder doesn't exist
      }
    }

    return musicPaths;
  }

  /**
   * Generate a unique ID for a Serato installation
   * @param {string} seratoPath - Serato directory path
   * @returns {string} Unique ID
   * @private
   */
  generateId(seratoPath) {
    // Create a slug-like ID from the path
    return seratoPath
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .substring(0, 50);
  }

  /**
   * Generate a friendly name for a Serato installation
   * @param {string} volumeName - Volume name
   * @param {string} seratoPath - Serato directory path
   * @returns {string} Friendly name
   * @private
   */
  generateName(volumeName, seratoPath) {
    // Extract meaningful part of path
    const parts = seratoPath.split(path.sep).filter(p => p && p !== '_Serato_');
    const lastPart = parts[parts.length - 1];

    if (lastPart === 'Music' || lastPart === 'DJ') {
      return `${volumeName} Library`;
    }

    return volumeName;
  }
}

module.exports = new VolumeDiscovery();
