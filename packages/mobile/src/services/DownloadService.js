import { File, Directory, Paths } from 'expo-file-system';
import useDownloadStore, {
  useDownloadProgressStore,
  DOWNLOAD_FAILURE_REASONS,
} from '../store/downloadStore';
import useOfflineStore from '../store/offlineStore';
import { useConnectionStore, CONNECTION_TYPES } from '../store/connectionStore';
import useSubscriptionStore from '../store/subscriptionStore';
import apiService from './api';

/**
 * DownloadService keeps device storage reconciled with the crates the user marked
 * "available offline": it downloads missing track audio and deletes files no longer
 * referenced by any offline crate.
 *
 * Downloads are chunked with HTTP Range requests (4MB per request) rather than one
 * full-file GET. This is required on the proxy path — the proxy enforces a 30s
 * timeout per stream request and buffers each request's chunks in memory
 * (packages/proxy/src/binaryWebSocketManager.js) — and it gives resume-after-
 * interruption for free: the next chunk starts at the .part file's current size.
 */

const DOWNLOAD_DIR_NAME = 'offline-audio';
const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB per range request
const CONCURRENCY = 2;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
// Never fill the disk completely — leave headroom for the OS and other apps.
const MIN_FREE_DISK_BYTES = 500 * 1024 * 1024;
const DEFAULT_EXTENSION = '.mp3';

// Module-level guards (same pattern as SyncService's single-flight sync)
let isReconciling = false;
let rerunRequested = false;
let cancelRequested = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for the persisted stores reconcile depends on to finish rehydrating from
 * AsyncStorage. Without this, an early trigger (fast LAN connect or AppState
 * 'active' on cold start) would see empty offlineCrateIds/serverCrateTracks and
 * cleanup would delete the entire downloaded library.
 */
async function ensureStoresHydrated() {
  const stores = [
    useDownloadStore,
    useOfflineStore,
    require('../store/useStore').default, // lazy: avoids a module-init require cycle
  ];
  await Promise.all(
    stores.map((store) => {
      const persistApi = store?.persist;
      if (!persistApi || typeof persistApi.hasHydrated !== 'function') return null;
      return persistApi.hasHydrated() ? null : persistApi.rehydrate();
    })
  );
}

function getDownloadDirectory() {
  const dir = new Directory(Paths.document, DOWNLOAD_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

// File name is the URI-encoded track ID plus the source file's extension, so the
// mapping back to a track ID is lossless (track IDs are 16-char hex hashes; used
// by cleanup to identify orphans).
function fileNameForTrack(track) {
  const ext = extensionForTrack(track);
  return `${encodeURIComponent(String(track.id))}${ext}`;
}

function extensionForTrack(track) {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(track.filePath || '');
  return match ? `.${match[1].toLowerCase()}` : DEFAULT_EXTENSION;
}

function trackIdFromFileName(name) {
  const base = name.replace(/\.part$/, '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

// Sidecar files for per-track player metadata. Their extensions are ≤5
// alphanumerics so trackIdFromFileName maps them back to the track ID and the
// cleanup pass deletes them together with the audio.
function metaFileForTrack(trackId, dir) {
  return new File(dir, `${encodeURIComponent(String(trackId))}.meta`);
}

function artFileForTrack(trackId, dir) {
  return new File(dir, `${encodeURIComponent(String(trackId))}.art`);
}

/**
 * Fetch and store the per-track player metadata (cue points, waveforms, beat
 * grid, artwork) alongside the downloaded audio so the offline player looks
 * identical to online. Best-effort: a metadata failure never fails the audio
 * download — a missing .meta file is backfilled by the next reconcile.
 */
export async function prefetchTrackMetadata(track, dir) {
  try {
    // getWaveform/getSpectralWaveform/getBeatGrid already return null on error
    const waveform = await apiService.getWaveform(track.id, 150);
    const spectralWaveform = await apiService.getSpectralWaveform(track.id, 800);
    const beatGrid = await apiService.getBeatGrid(track.id);
    let cuePoints = null;
    try {
      const data = await apiService.getCuePoints(track.id);
      cuePoints = data?.cuePoints ?? null;
    } catch {
      // cue points unavailable — leave null
    }

    const metaFile = metaFileForTrack(track.id, dir);
    if (!metaFile.exists) {
      metaFile.create({ overwrite: true });
    }
    metaFile.write(
      JSON.stringify({ cuePoints, waveform, spectralWaveform, beatGrid, savedAt: Date.now() })
    );

    if (track.hasArtwork) {
      const artFile = artFileForTrack(track.id, dir);
      if (!artFile.exists) {
        try {
          const response = await fetch(apiService.getArtworkUrl(track.id));
          if (response.ok) {
            const bytes = new Uint8Array(await response.arrayBuffer());
            artFile.create({ overwrite: true });
            artFile.write(bytes);
          }
        } catch {
          // artwork is cosmetic — skip silently
        }
      }
    }
  } catch {
    // Never let metadata problems affect the audio download.
  }
}

/**
 * Parsed .meta sidecar for a downloaded track, or null when missing/corrupt.
 * Synchronous so store loaders can call it inline as an offline fallback.
 */
export function readTrackMetadata(trackId) {
  try {
    const dir = new Directory(Paths.document, DOWNLOAD_DIR_NAME);
    if (!dir.exists) return null;
    const metaFile = metaFileForTrack(trackId, dir);
    if (!metaFile.exists) return null;
    return JSON.parse(metaFile.textSync());
  } catch {
    return null;
  }
}

/**
 * Shallow-merge a patch into a downloaded track's .meta sidecar (write-through
 * for cue point edits). No-op for tracks without downloaded audio so cleanup
 * never has orphan sidecars to chase.
 */
export function updateTrackMetadata(trackId, patch) {
  try {
    if (!useDownloadStore.getState().getLocalUri(trackId)) return false;
    const dir = getDownloadDirectory();
    const metaFile = metaFileForTrack(trackId, dir);
    const existing = readTrackMetadata(trackId) || {};
    if (!metaFile.exists) {
      metaFile.create({ overwrite: true });
    }
    metaFile.write(JSON.stringify({ ...existing, ...patch, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Local artwork file URI for a downloaded track, or null. No entitlement gate —
 * artwork is cosmetic.
 */
export function getArtworkUri(trackId) {
  try {
    const dir = new Directory(Paths.document, DOWNLOAD_DIR_NAME);
    if (!dir.exists) return null;
    const artFile = artFileForTrack(trackId, dir);
    return artFile.exists ? artFile.uri : null;
  } catch {
    return null;
  }
}

/**
 * Union of track IDs needed by all offline crates (from offlineStore's cached
 * crate → trackIds mapping, which is the same data the offline crate view uses).
 */
function computeNeededTrackIds() {
  const { offlineCrateIds } = useDownloadStore.getState();
  const { getCachedCrateTracks } = useOfflineStore.getState();
  const needed = new Set();
  offlineCrateIds.forEach((crateId) => {
    getCachedCrateTracks(crateId).forEach((trackId) => needed.add(trackId));
  });
  return needed;
}

function isWifiAllowed() {
  const { wifiOnly } = useDownloadStore.getState();
  if (!wifiOnly) return true;
  const { networkState, connectionType } = useConnectionStore.getState();
  // A LAN connection to the desktop implies we're on the local wifi network.
  return networkState?.type === 'wifi' || connectionType === CONNECTION_TYPES.LOCAL;
}

/**
 * Download a single track's audio via chunked range requests into a .part file,
 * then atomically rename to the final name. Resumes from the .part file's size.
 */
async function downloadTrack(track, dir) {
  const downloadStore = useDownloadStore.getState();
  const progressStore = useDownloadProgressStore.getState();
  const url = apiService.getStreamUrl(track.id);
  const fileName = fileNameForTrack(track);
  const dest = new File(dir, fileName);
  const tmp = new File(dir, `${fileName}.part`);

  // Already fully downloaded but missing from the map (e.g. store cleared) — reclaim it.
  if (dest.exists && !tmp.exists) {
    downloadStore.markTrackDownloaded(track.id, dest.uri, dest.size);
    return;
  }

  if (Paths.availableDiskSpace < MIN_FREE_DISK_BYTES) {
    const err = new Error('Not enough free storage to download');
    err.reason = DOWNLOAD_FAILURE_REASONS.STORAGE_FULL;
    throw err;
  }

  if (!tmp.exists) {
    tmp.create({ overwrite: true });
  }

  let totalSize = null;
  let received = tmp.size;

  while (totalSize === null || received < totalSize) {
    if (cancelRequested || !useConnectionStore.getState().isConnected) {
      const err = new Error('Download interrupted');
      err.reason = DOWNLOAD_FAILURE_REASONS.NETWORK;
      err.interrupted = true;
      throw err;
    }

    const rangeEnd = received + CHUNK_SIZE - 1;
    const response = await fetch(url, {
      headers: { Range: `bytes=${received}-${rangeEnd}` },
    });

    if (response.status === 404) {
      const err = new Error('Track file not found on desktop');
      err.reason = DOWNLOAD_FAILURE_REASONS.NOT_FOUND;
      throw err;
    }
    if (response.status === 416) {
      // Range not satisfiable — the resumed .part file is already complete
      // (killed between the last chunk and the rename). Verify via the total
      // in "Content-Range: bytes */TOTAL" when the server provides it.
      const match = /bytes\s+\*\/(\d+)/.exec(response.headers.get('content-range') || '');
      const total = match ? parseInt(match[1], 10) : received;
      if (received === total) {
        totalSize = total;
        break;
      }
      // Otherwise the .part file is corrupt — start over.
      tmp.delete();
      const err = new Error('Invalid partial download, restarting');
      err.reason = DOWNLOAD_FAILURE_REASONS.INTEGRITY;
      throw err;
    }
    if (response.status !== 206 && response.status !== 200) {
      const err = new Error(`Download failed with status ${response.status}`);
      err.reason = DOWNLOAD_FAILURE_REASONS.NETWORK;
      throw err;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (response.status === 200) {
      // Server ignored the range header and sent the whole file — write it outright.
      tmp.write(bytes);
      received = bytes.length;
      totalSize = bytes.length;
    } else {
      const contentRange = response.headers.get('content-range') || '';
      const match = /bytes\s+(\d+)-(\d+)\/(\d+)/.exec(contentRange);
      if (match) {
        totalSize = parseInt(match[3], 10);
        const responseStart = parseInt(match[1], 10);
        if (responseStart !== received) {
          // The server clamped our range (both the LAN streamer and the WS path
          // clamp start to fileSize-1 instead of returning 416). This happens
          // when the resumed .part file is already complete — verify and finish
          // WITHOUT writing the overlapping bytes, which would corrupt the file.
          if (received >= totalSize) {
            break;
          }
          // Clamped but the .part is short of the total — inconsistent; restart.
          tmp.delete();
          const err = new Error('Server range mismatch, restarting download');
          err.reason = DOWNLOAD_FAILURE_REASONS.INTEGRITY;
          throw err;
        }
      } else if (bytes.length < CHUNK_SIZE) {
        // No total advertised; a short chunk means we've reached the end.
        totalSize = received + bytes.length;
      }

      const handle = tmp.open();
      try {
        handle.offset = received;
        handle.writeBytes(bytes);
      } finally {
        handle.close();
      }
      received += bytes.length;

      if (bytes.length === 0) {
        if (totalSize === null) {
          // Zero-byte 206 with no advertised total — treat as end of file.
          totalSize = received;
        } else {
          // Server advertised more data but sent none — bail instead of spinning.
          const err = new Error('Server stopped sending data mid-download');
          err.reason = DOWNLOAD_FAILURE_REASONS.NETWORK;
          throw err;
        }
      }
    }

    progressStore.setTrackProgress(track.id, received, totalSize);
  }

  if (totalSize !== null && tmp.size !== totalSize) {
    tmp.delete();
    const err = new Error(`Downloaded size ${tmp.size} doesn't match expected ${totalSize}`);
    err.reason = DOWNLOAD_FAILURE_REASONS.INTEGRITY;
    throw err;
  }

  if (dest.exists) {
    dest.delete();
  }
  tmp.move(dest);
  downloadStore.markTrackDownloaded(track.id, tmp.uri, tmp.size);
}

/**
 * Download one track with retries and failure bookkeeping.
 */
async function downloadTrackWithRetries(track, dir) {
  const downloadStore = useDownloadStore.getState();
  const progressStore = useDownloadProgressStore.getState();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await downloadTrack(track, dir);
      // Covers both the normal download and the dest-exists reclaim path
      await prefetchTrackMetadata(track, dir);
      return true;
    } catch (error) {
      progressStore.clearTrackProgress(track.id);

      // Interruptions (cancel/disconnect) aren't failures — reconcile will resume
      // later. Also treat any error after a cancel as an interruption so a
      // "Remove All Downloads" mid-flight doesn't write phantom failures into
      // the freshly-cleared store.
      if (error.interrupted || cancelRequested) {
        return false;
      }
      // Retrying won't fix a missing source file or a full disk.
      const retryable =
        error.reason !== DOWNLOAD_FAILURE_REASONS.NOT_FOUND &&
        error.reason !== DOWNLOAD_FAILURE_REASONS.STORAGE_FULL;

      if (!retryable || attempt === MAX_ATTEMPTS) {
        downloadStore.markTrackFailed(
          track.id,
          error.reason || DOWNLOAD_FAILURE_REASONS.NETWORK,
          error.message
        );
        return false;
      }

      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  return false;
}

/**
 * Delete downloaded files no longer referenced by any offline crate, stale .part
 * files, and map entries whose file has disappeared from disk. Safe to run
 * offline — it never touches the network. Callers must ensure the persisted
 * stores are hydrated first (reconcile does; the exported wrapper does too).
 */
function cleanupDownloadsUnsafe() {
  const downloadStore = useDownloadStore.getState();
  const needed = computeNeededTrackIds();

  try {
    const dir = new Directory(Paths.document, DOWNLOAD_DIR_NAME);

    // Drop map entries whose file no longer exists on disk (integrity pass).
    Object.entries(downloadStore.trackFiles).forEach(([trackId, info]) => {
      try {
        if (!new File(info.uri).exists) {
          useDownloadStore.getState().removeTrackFile(trackId);
        }
      } catch {
        useDownloadStore.getState().removeTrackFile(trackId);
      }
    });

    if (!dir.exists) return;

    // Delete files (and .part remnants) for tracks no offline crate references.
    dir.list().forEach((entry) => {
      if (!(entry instanceof File)) return;
      const trackId = trackIdFromFileName(entry.name);
      if (!needed.has(trackId)) {
        try {
          entry.delete();
        } catch {
          // Best effort — a locked file will be retried on the next cleanup.
        }
        useDownloadStore.getState().removeTrackFile(trackId);
      }
    });
  } catch {
    // Cleanup is best-effort; reconcile will run it again.
  }
}

export async function cleanupDownloads() {
  try {
    await ensureStoresHydrated();
    cleanupDownloadsUnsafe();
  } catch {
    // Best-effort; the next reconcile retries.
  }
}

/**
 * Record the last entitlement observed while the tier was actually resolved,
 * so downloaded playback can honor it when offline (tier is re-derived each
 * session and unavailable without a network). Only a resolved, non-null tier
 * may flip it off — a transient null tier at startup must not revoke it.
 */
function rememberEntitlement(entitled) {
  const { currentTier } = useSubscriptionStore.getState();
  const store = useDownloadStore.getState();
  if (entitled) {
    if (!store.lastKnownEntitled) store.setLastKnownEntitled(true);
  } else if (currentTier != null && store.lastKnownEntitled) {
    store.setLastKnownEntitled(false);
  }
}

/**
 * Single entry point that brings device storage in line with the offline crate
 * selection (analog of SyncService.triggerSyncIfPending). Cheap no-op when
 * there's nothing to do; guarded against concurrent runs. Never rejects.
 */
export async function reconcile() {
  if (isReconciling) {
    // A run is in flight and the inputs just changed — have it go around again.
    rerunRequested = true;
    return { skipped: 'already_running' };
  }

  isReconciling = true;

  try {
    do {
      // Each pass starts fresh: a rerun request supersedes an earlier pause()
      // (a fresh reconcile() call would have reset the cancel flag anyway).
      rerunRequested = false;
      cancelRequested = false;

      await ensureStoresHydrated();

      // Deleting no-longer-referenced files needs no network or subscription.
      cleanupDownloadsUnsafe();

      const { isConnected, serverURL } = useConnectionStore.getState();
      if (!isConnected || !serverURL) return { skipped: 'offline' };

      const entitled = useSubscriptionStore.getState().canUseOfflineDownloads();
      rememberEntitlement(entitled);
      if (!entitled) return { skipped: 'not_entitled' };

      if (!isWifiAllowed()) return { skipped: 'wifi_only' };

      const { trackFiles, failedTracks } = useDownloadStore.getState();
      const needed = computeNeededTrackIds();
      const trackById = new Map(
        require('../store/useStore').default.getState().tracks.map((t) => [t.id, t])
      );

      const missing = [...needed].filter(
        (trackId) =>
          !trackFiles[trackId] &&
          trackById.has(trackId) &&
          // Don't hammer the server for files known to be missing on the desktop;
          // these retry only after the user toggles the crate again (which clears
          // failures) or the file reappears under a different membership refresh.
          failedTracks[trackId]?.reason !== DOWNLOAD_FAILURE_REASONS.NOT_FOUND
      );

      const dir = getDownloadDirectory();

      // Downloaded tracks missing their metadata sidecar (downloaded before the
      // sidecar existed, or the prefetch was interrupted) — backfill below.
      const metaMissing = [...needed].filter(
        (trackId) =>
          trackFiles[trackId] &&
          trackById.has(trackId) &&
          !metaFileForTrack(trackId, dir).exists
      );

      if (missing.length === 0 && metaMissing.length === 0) continue;

      if (missing.length > 0) {
        useDownloadProgressStore.getState().setIsDownloading(true);
        try {
          let nextIndex = 0;
          const workers = Array.from(
            { length: Math.min(CONCURRENCY, missing.length) },
            async () => {
              while (nextIndex < missing.length && !cancelRequested) {
                const track = trackById.get(missing[nextIndex++]);
                await downloadTrackWithRetries(track, dir);
              }
            }
          );
          await Promise.all(workers);
        } finally {
          useDownloadProgressStore.getState().setIsDownloading(false);
        }
      }

      for (const trackId of metaMissing) {
        if (cancelRequested || !useConnectionStore.getState().isConnected) break;
        await prefetchTrackMetadata(trackById.get(trackId), dir);
      }
    } while (rerunRequested);

    return { success: true };
  } catch (error) {
    // Never reject — callers are fire-and-forget. The next trigger retries.
    return { skipped: 'error', error: error?.message };
  } finally {
    isReconciling = false;
  }
}

/**
 * Stop in-flight downloads quickly (e.g. on disconnect). Partial .part files are
 * kept and resumed by the next reconcile.
 */
export function pause() {
  cancelRequested = true;
}

/**
 * Un-mark a crate as offline and delete files that are now unreferenced
 * (files shared with another offline crate are kept).
 */
export function removeCrateDownloads(crateId) {
  useDownloadStore.getState().setCrateOffline(crateId, false);
  return cleanupDownloads();
}

/**
 * Remove every downloaded file and reset download state (keeps the wifiOnly
 * preference). Used by Settings' "Remove all downloads".
 */
export function removeAllDownloads() {
  pause();
  useDownloadStore.getState().clearAll();
  try {
    const dir = new Directory(Paths.document, DOWNLOAD_DIR_NAME);
    if (dir.exists) {
      dir.delete();
    }
  } catch {
    // Best effort — cleanup will retry file-by-file next reconcile.
  }
}

export default {
  reconcile,
  pause,
  cleanupDownloads,
  removeCrateDownloads,
  removeAllDownloads,
  prefetchTrackMetadata,
  readTrackMetadata,
  updateTrackMetadata,
  getArtworkUri,
};
