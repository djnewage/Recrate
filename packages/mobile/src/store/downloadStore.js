import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useOfflineStore from './offlineStore';

// Download failure reasons
export const DOWNLOAD_FAILURE_REASONS = {
  NOT_FOUND: 'not_found', // Track file missing on the desktop
  STORAGE_FULL: 'storage_full',
  NETWORK: 'network',
  INTEGRITY: 'integrity', // Downloaded size didn't match expected size
};

/**
 * Transient per-download progress lives in its own non-persisted store:
 * zustand's persist middleware serializes and writes the partialized state to
 * AsyncStorage on EVERY set() (it does not diff), so high-frequency chunk
 * progress updates must not go through the persisted store below.
 */
export const useDownloadProgressStore = create((set) => ({
  // trackId -> { receivedBytes, totalBytes }
  activeDownloads: {},
  isDownloading: false,

  setTrackProgress: (trackId, receivedBytes, totalBytes) => {
    set((state) => ({
      activeDownloads: {
        ...state.activeDownloads,
        [trackId]: { receivedBytes, totalBytes },
      },
    }));
  },

  clearTrackProgress: (trackId) => {
    set((state) => {
      const { [trackId]: removed, ...rest } = state.activeDownloads;
      return { activeDownloads: rest };
    });
  },

  setIsDownloading: (isDownloading) => set({ isDownloading }),

  reset: () => set({ activeDownloads: {}, isDownloading: false }),
}));

/**
 * Tracks which crates are marked "available offline" and which track audio files
 * have been downloaded to device storage. The actual downloading lives in
 * DownloadService; this store is the persisted source of truth it reconciles
 * against.
 */
const useDownloadStore = create(
  persist(
    (set, get) => ({
      // Crates the user marked "available offline"
      offlineCrateIds: [],

      // Downloaded audio files: trackId -> { uri, size, downloadedAt }
      trackFiles: {},

      // Tracks that failed to download: trackId -> { reason, message, failedAt }
      failedTracks: {},

      // Only download over wifi (LAN connections count as wifi)
      wifiOnly: true,

      // Last entitlement observed while the tier was actually resolved.
      // currentTier is re-derived each session and can be null/stale while
      // offline, so downloaded playback falls back to this when disconnected.
      lastKnownEntitled: false,

      // --- Offline crate flags ---
      setCrateOffline: (crateId, offline) => {
        set((state) => ({
          offlineCrateIds: offline
            ? [...new Set([...state.offlineCrateIds, crateId])]
            : state.offlineCrateIds.filter((id) => id !== crateId),
        }));
      },

      // --- Downloaded files map ---
      markTrackDownloaded: (trackId, uri, size) => {
        useDownloadProgressStore.getState().clearTrackProgress(trackId);
        set((state) => {
          const { [trackId]: clearedFailure, ...remainingFailures } = state.failedTracks;
          return {
            trackFiles: {
              ...state.trackFiles,
              [trackId]: { uri, size, downloadedAt: Date.now() },
            },
            failedTracks: remainingFailures,
          };
        });
      },

      removeTrackFile: (trackId) => {
        set((state) => {
          const { [trackId]: removed, ...rest } = state.trackFiles;
          return { trackFiles: rest };
        });
      },

      // Local URI for a downloaded track, or null. Sync map lookup so playback
      // code can call it inline (disk existence is enforced by DownloadService's
      // reconcile integrity pass).
      getLocalUri: (trackId) => get().trackFiles[trackId]?.uri || null,

      // --- Failures ---
      markTrackFailed: (trackId, reason, message = null) => {
        useDownloadProgressStore.getState().clearTrackProgress(trackId);
        set((state) => ({
          failedTracks: {
            ...state.failedTracks,
            [trackId]: { reason, message, failedAt: Date.now() },
          },
        }));
      },

      clearFailedTracks: () => set({ failedTracks: {} }),

      // --- Per-crate helpers (computed against offlineStore's cached track IDs) ---
      getCrateDownloadProgress: (crateId) => {
        const trackIds = useOfflineStore.getState().getCachedCrateTracks(crateId);
        const { trackFiles } = get();
        const downloaded = trackIds.filter((id) => trackFiles[id]).length;
        return { downloaded, total: trackIds.length };
      },

      isCrateFullyDownloaded: (crateId) => {
        const { downloaded, total } = get().getCrateDownloadProgress(crateId);
        return total > 0 && downloaded === total;
      },

      getCrateBytes: (crateId) => {
        const trackIds = useOfflineStore.getState().getCachedCrateTracks(crateId);
        const { trackFiles } = get();
        return trackIds.reduce((sum, id) => sum + (trackFiles[id]?.size || 0), 0);
      },

      getTotalBytes: () => {
        return Object.values(get().trackFiles).reduce((sum, f) => sum + (f.size || 0), 0);
      },

      // --- Settings ---
      setWifiOnly: (wifiOnly) => set({ wifiOnly }),

      setLastKnownEntitled: (lastKnownEntitled) => set({ lastKnownEntitled }),

      // Clear everything except the wifiOnly preference and entitlement memory
      // (used by "Remove all downloads")
      clearAll: () => {
        useDownloadProgressStore.getState().reset();
        set({
          offlineCrateIds: [],
          trackFiles: {},
          failedTracks: {},
        });
      },
    }),
    {
      name: 'recrate-downloads',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        offlineCrateIds: state.offlineCrateIds,
        trackFiles: state.trackFiles,
        failedTracks: state.failedTracks,
        wifiOnly: state.wifiOnly,
        lastKnownEntitled: state.lastKnownEntitled,
      }),
      version: 1,
    }
  )
);

export default useDownloadStore;
