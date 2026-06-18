/**
 * Auto-update (electron-updater + GitHub Releases)
 *
 * The packaged app checks GitHub Releases for a newer version, downloads it in the
 * background, and offers to restart-and-install. Without this, installed copies can
 * never receive a fix — users must manually re-download.
 *
 * Only runs in the packaged app (`app.isPackaged`); a no-op under `electron .` dev so
 * local runs don't try to self-update. macOS requires the build to be signed +
 * notarized or electron-updater will refuse the update.
 */

const { app, dialog } = require('electron');
const log = require('electron-log');

let initialized = false;
let autoUpdater = null;
let lastStatus = 'idle'; // idle | checking | available | downloading | downloaded | none | error

function getStatus() {
  return lastStatus;
}

/**
 * Wire up electron-updater. `onStatus(status, info)` is called on state changes so the
 * caller can refresh UI (e.g. the tray menu).
 */
function initAutoUpdater({ onStatus } = {}) {
  if (!app.isPackaged) {
    log.info('[Updater] Not packaged — auto-update disabled');
    return;
  }
  if (initialized) return;
  initialized = true;

  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (error) {
    log.warn('[Updater] electron-updater unavailable:', error.message);
    return;
  }

  const emit = (status, info) => {
    lastStatus = status;
    if (typeof onStatus === 'function') {
      try {
        onStatus(status, info);
      } catch (e) {
        log.warn('[Updater] onStatus handler failed:', e.message);
      }
    }
  };

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => emit('checking'));
  autoUpdater.on('update-available', (info) => {
    log.info(`[Updater] Update available: ${info.version}`);
    emit('available', info);
  });
  autoUpdater.on('update-not-available', () => emit('none'));
  autoUpdater.on('download-progress', (p) => {
    lastStatus = 'downloading';
    log.info(`[Updater] Downloading ${Math.round(p.percent)}%`);
  });
  autoUpdater.on('error', (err) => {
    // Offline / no release / transient — log and move on, never crash.
    log.error('[Updater] Error:', err == null ? 'unknown' : (err.stack || err).toString());
    emit('error');
  });
  autoUpdater.on('update-downloaded', async (info) => {
    log.info(`[Updater] Update downloaded: ${info.version}`);
    emit('downloaded', info);
    try {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update Ready',
        message: `Recrate ${info.version} has been downloaded.`,
        detail: 'Restart Recrate to install the update. It will otherwise install on next quit.',
      });
      if (response === 0) {
        app.isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    } catch (e) {
      log.warn('[Updater] Restart prompt failed:', e.message);
    }
  });

  // Initial check shortly after launch, then every 6 hours.
  checkForUpdates();
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
}

/**
 * Trigger a check now. Safe to call from a tray "Check for Updates" item; a no-op if
 * the updater isn't initialized (dev / unavailable).
 */
function checkForUpdates() {
  if (!autoUpdater) return;
  autoUpdater.checkForUpdates().catch((e) => log.warn('[Updater] Check failed:', e.message));
}

module.exports = { initAutoUpdater, checkForUpdates, getStatus };
