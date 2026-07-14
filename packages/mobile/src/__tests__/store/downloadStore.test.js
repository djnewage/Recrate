/**
 * Unit tests for downloadStore
 * Tests offline crate flags, the downloaded-files map, the separate transient
 * progress store, and the per-crate helpers computed against offlineStore's
 * cached track IDs.
 */

import useDownloadStore, {
  useDownloadProgressStore,
  DOWNLOAD_FAILURE_REASONS,
} from '../../store/downloadStore';
import useOfflineStore from '../../store/offlineStore';

const resetStores = () => {
  useDownloadStore.setState({
    offlineCrateIds: [],
    trackFiles: {},
    failedTracks: {},
    wifiOnly: true,
    lastKnownEntitled: false,
  });
  useDownloadProgressStore.getState().reset();
  useOfflineStore.setState({ serverCrateTracks: {}, localCrateTracks: {} });
};

describe('downloadStore', () => {
  beforeEach(resetStores);

  describe('offline crate flags', () => {
    it('adds and removes crate ids without duplicates', () => {
      const { setCrateOffline } = useDownloadStore.getState();

      setCrateOffline('crate-1', true);
      setCrateOffline('crate-1', true);
      setCrateOffline('crate-2', true);
      expect(useDownloadStore.getState().offlineCrateIds).toEqual(['crate-1', 'crate-2']);

      setCrateOffline('crate-1', false);
      expect(useDownloadStore.getState().offlineCrateIds).toEqual(['crate-2']);
    });
  });

  describe('downloaded files map', () => {
    it('markTrackDownloaded stores the file and clears failure and progress state', () => {
      const store = useDownloadStore.getState();
      store.markTrackFailed('t1', DOWNLOAD_FAILURE_REASONS.NETWORK, 'timeout');
      useDownloadProgressStore.getState().setTrackProgress('t1', 100, 200);

      store.markTrackDownloaded('t1', 'file:///docs/offline-audio/t1.mp3', 1234);

      const state = useDownloadStore.getState();
      expect(state.trackFiles.t1).toMatchObject({
        uri: 'file:///docs/offline-audio/t1.mp3',
        size: 1234,
      });
      expect(state.failedTracks.t1).toBeUndefined();
      expect(useDownloadProgressStore.getState().activeDownloads.t1).toBeUndefined();
      expect(state.getLocalUri('t1')).toBe('file:///docs/offline-audio/t1.mp3');
    });

    it('getLocalUri returns null for unknown tracks', () => {
      expect(useDownloadStore.getState().getLocalUri('nope')).toBeNull();
    });

    it('removeTrackFile drops the entry', () => {
      const store = useDownloadStore.getState();
      store.markTrackDownloaded('t1', 'file:///a.mp3', 10);
      store.removeTrackFile('t1');
      expect(useDownloadStore.getState().trackFiles.t1).toBeUndefined();
    });
  });

  describe('failures and progress', () => {
    it('markTrackFailed records the reason and clears progress', () => {
      const store = useDownloadStore.getState();
      useDownloadProgressStore.getState().setTrackProgress('t1', 50, 100);
      store.markTrackFailed('t1', DOWNLOAD_FAILURE_REASONS.NOT_FOUND, 'gone');

      expect(useDownloadStore.getState().failedTracks.t1.reason).toBe(
        DOWNLOAD_FAILURE_REASONS.NOT_FOUND
      );
      expect(useDownloadProgressStore.getState().activeDownloads.t1).toBeUndefined();
    });

    it('clearFailedTracks empties the failure map', () => {
      const store = useDownloadStore.getState();
      store.markTrackFailed('t1', DOWNLOAD_FAILURE_REASONS.NOT_FOUND);
      store.markTrackFailed('t2', DOWNLOAD_FAILURE_REASONS.NETWORK);
      store.clearFailedTracks();
      expect(useDownloadStore.getState().failedTracks).toEqual({});
    });

    it('progress store manages transient progress independently of the persisted store', () => {
      const progress = useDownloadProgressStore.getState();
      progress.setTrackProgress('t1', 50, 100);
      expect(useDownloadProgressStore.getState().activeDownloads.t1).toEqual({
        receivedBytes: 50,
        totalBytes: 100,
      });
      progress.clearTrackProgress('t1');
      expect(useDownloadProgressStore.getState().activeDownloads.t1).toBeUndefined();

      progress.setIsDownloading(true);
      expect(useDownloadProgressStore.getState().isDownloading).toBe(true);
      useDownloadProgressStore.getState().reset();
      expect(useDownloadProgressStore.getState().isDownloading).toBe(false);
    });
  });

  describe('per-crate helpers', () => {
    beforeEach(() => {
      useOfflineStore.getState().cacheAllServerCrateTracks([
        { id: 'crate-1', trackIds: ['t1', 't2', 't3'] },
        { id: 'crate-2', trackIds: ['t3', 't4'] },
      ]);
    });

    it('getCrateDownloadProgress counts downloaded tracks', () => {
      const store = useDownloadStore.getState();
      store.markTrackDownloaded('t1', 'file:///t1.mp3', 100);
      store.markTrackDownloaded('t3', 'file:///t3.mp3', 300);

      expect(useDownloadStore.getState().getCrateDownloadProgress('crate-1')).toEqual({
        downloaded: 2,
        total: 3,
      });
    });

    it('isCrateFullyDownloaded is true only when every track is present', () => {
      const store = useDownloadStore.getState();
      store.markTrackDownloaded('t3', 'file:///t3.mp3', 300);
      expect(useDownloadStore.getState().isCrateFullyDownloaded('crate-2')).toBe(false);

      store.markTrackDownloaded('t4', 'file:///t4.mp3', 400);
      expect(useDownloadStore.getState().isCrateFullyDownloaded('crate-2')).toBe(true);
    });

    it('isCrateFullyDownloaded is false for an empty/unknown crate', () => {
      expect(useDownloadStore.getState().isCrateFullyDownloaded('crate-empty')).toBe(false);
    });

    it('getCrateBytes and getTotalBytes sum file sizes', () => {
      const store = useDownloadStore.getState();
      store.markTrackDownloaded('t1', 'file:///t1.mp3', 100);
      store.markTrackDownloaded('t3', 'file:///t3.mp3', 300);
      store.markTrackDownloaded('t4', 'file:///t4.mp3', 400);

      expect(useDownloadStore.getState().getCrateBytes('crate-1')).toBe(400); // t1 + t3
      expect(useDownloadStore.getState().getCrateBytes('crate-2')).toBe(700); // t3 + t4
      expect(useDownloadStore.getState().getTotalBytes()).toBe(800);
    });
  });

  describe('settings and reset', () => {
    it('clearAll wipes downloads but keeps wifiOnly and lastKnownEntitled', () => {
      const store = useDownloadStore.getState();
      store.setWifiOnly(false);
      store.setLastKnownEntitled(true);
      store.setCrateOffline('crate-1', true);
      store.markTrackDownloaded('t1', 'file:///t1.mp3', 100);
      store.markTrackFailed('t2', DOWNLOAD_FAILURE_REASONS.NETWORK);
      useDownloadProgressStore.getState().setIsDownloading(true);

      store.clearAll();

      const state = useDownloadStore.getState();
      expect(state.offlineCrateIds).toEqual([]);
      expect(state.trackFiles).toEqual({});
      expect(state.failedTracks).toEqual({});
      expect(state.wifiOnly).toBe(false);
      expect(state.lastKnownEntitled).toBe(true);
      expect(useDownloadProgressStore.getState().isDownloading).toBe(false);
    });
  });
});
