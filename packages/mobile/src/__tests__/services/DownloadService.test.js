/**
 * Unit tests for DownloadService
 * Exercises reconcile() against an in-memory expo-file-system mock and a
 * fetch mock that serves range requests like the desktop server does.
 */

// jest-expo's preset setup registers its own bare mock of expo-file-system;
// this explicit mock (hoisted above imports) wins and installs our in-memory FS.
jest.mock('expo-file-system', () => jest.requireActual('../__mocks__/expo-file-system'));

import DownloadService from '../../services/DownloadService';
import useDownloadStore, {
  useDownloadProgressStore,
  DOWNLOAD_FAILURE_REASONS,
} from '../../store/downloadStore';
import useOfflineStore from '../../store/offlineStore';
import { useConnectionStore } from '../../store/connectionStore';
import { File, Directory, Paths, __mock as fsMock } from 'expo-file-system';

// Entitlement flag the subscriptionStore mock reads (toggled per test)
let mockEntitled = true;

jest.mock('../../store/subscriptionStore', () => {
  const getState = () => ({
    canUseOfflineDownloads: () => mockEntitled,
  });
  return {
    __esModule: true,
    default: { getState },
    useSubscriptionStore: { getState },
  };
});

// Library tracks the service resolves ids against (mutated per test)
let mockLibraryTracks = [];

jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    getState: () => ({ tracks: mockLibraryTracks }),
  },
}));

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    getStreamUrl: (trackId) => `http://server/api/stream/${trackId}`,
    getArtworkUrl: (trackId) => `http://server/api/artwork/${trackId}`,
    getCuePoints: jest.fn(),
    getWaveform: jest.fn(),
    getSpectralWaveform: jest.fn(),
    getBeatGrid: jest.fn(),
  },
}));

const apiMock = require('../../services/api').default;

/**
 * fetch mock serving `serverFiles` (trackId -> Uint8Array) with 206 range
 * responses, mirroring the desktop server's streamer.
 */
let serverFiles = {};
let artworkFiles = {}; // trackId -> Uint8Array served by /api/artwork/
let fetchSpy;

const makeResponse = (status, headers = {}, body = new Uint8Array(0)) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: {
    get: (name) => headers[name.toLowerCase()] ?? null,
  },
  arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
});

const installFetchMock = () => {
  fetchSpy = jest.fn(async (url, opts = {}) => {
    const trackId = decodeURIComponent(url.split('/').pop());

    if (url.includes('/api/artwork/')) {
      const art = artworkFiles[trackId];
      return art ? makeResponse(200, {}, art) : makeResponse(404);
    }

    const data = serverFiles[trackId];
    if (!data) return makeResponse(404);

    const match = /bytes=(\d+)-(\d+)/.exec(opts.headers?.Range || '');
    if (!match) {
      return makeResponse(200, { 'content-length': String(data.length) }, data);
    }
    // Mirror the real server (streamer.js/websocket-server.js): out-of-range
    // starts are CLAMPED to fileSize-1 and answered with 206, never 416.
    const start = Math.min(parseInt(match[1], 10), data.length - 1);
    const end = Math.min(parseInt(match[2], 10), data.length - 1);
    const chunk = data.slice(start, end + 1);
    return makeResponse(
      206,
      { 'content-range': `bytes ${start}-${end}/${data.length}` },
      chunk
    );
  });
  global.fetch = fetchSpy;
};

const makeBytes = (length, seed = 7) => {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i++) data[i] = (i * seed) % 256;
  return data;
};

const track = (id, extra = {}) => ({ id, filePath: `/Music/${id}.mp3`, ...extra });

const sidecarUris = (trackId) => ({
  meta: `${fsMock.documentUri}/offline-audio/${encodeURIComponent(trackId)}.meta`,
  art: `${fsMock.documentUri}/offline-audio/${encodeURIComponent(trackId)}.art`,
});

const seedOfflineCrate = (crateId, trackIds) => {
  useOfflineStore.getState().cacheAllServerCrateTracks([{ id: crateId, trackIds }]);
  useDownloadStore.getState().setCrateOffline(crateId, true);
};

const downloadedData = (trackId) => {
  const uri = useDownloadStore.getState().getLocalUri(trackId);
  return uri ? fsMock.getFileData(uri) : null;
};

// Native buffer comparison — jest's toEqual walks every byte as an object key,
// which blows the heap on multi-megabyte arrays.
const expectBytesEqual = (actual, expected) => {
  expect(actual).not.toBeNull();
  expect(actual.length).toBe(expected.length);
  expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
};

describe('DownloadService', () => {
  beforeEach(() => {
    fsMock.reset();
    mockEntitled = true;
    mockLibraryTracks = [];
    serverFiles = {};
    artworkFiles = {};
    installFetchMock();

    apiMock.getCuePoints.mockResolvedValue({
      cuePoints: { 1: { position: 12.5, color: '#CC0000', label: null } },
    });
    apiMock.getWaveform.mockResolvedValue({ peaks: [0.1, 0.5], duration: 180 });
    apiMock.getSpectralWaveform.mockResolvedValue({
      bands: { bass: [0.1], mids: [0.2], highs: [0.3] },
      peaks: [0.4],
      duration: 180,
      sampleCount: 800,
    });
    apiMock.getBeatGrid.mockResolvedValue({ bpm: 128, firstBeatSec: 0.2, beats: [0.2, 0.67] });

    useDownloadStore.setState({
      offlineCrateIds: [],
      trackFiles: {},
      failedTracks: {},
      wifiOnly: true,
      lastKnownEntitled: false,
    });
    useDownloadProgressStore.getState().reset();
    useOfflineStore.setState({ serverCrateTracks: {}, localCrateTracks: {} });
    useConnectionStore.setState({
      isConnected: true,
      serverURL: 'http://server',
      connectionType: 'local',
      networkState: { type: 'wifi', isConnected: true },
    });
  });

  describe('preconditions', () => {
    it('skips when not connected', async () => {
      useConnectionStore.setState({ isConnected: false });
      const result = await DownloadService.reconcile();
      expect(result).toEqual({ skipped: 'offline' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips when not entitled (free/trial/expired tier)', async () => {
      mockEntitled = false;
      seedOfflineCrate('crate-1', ['t1']);
      const result = await DownloadService.reconcile();
      expect(result).toEqual({ skipped: 'not_entitled' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips on cellular when wifiOnly is enabled', async () => {
      useConnectionStore.setState({
        connectionType: 'proxy',
        networkState: { type: 'cellular', isConnected: true },
      });
      seedOfflineCrate('crate-1', ['t1']);
      const result = await DownloadService.reconcile();
      expect(result).toEqual({ skipped: 'wifi_only' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('downloads on cellular when wifiOnly is disabled', async () => {
      useConnectionStore.setState({
        connectionType: 'proxy',
        networkState: { type: 'cellular', isConnected: true },
      });
      useDownloadStore.getState().setWifiOnly(false);
      mockLibraryTracks = [track('t1')];
      serverFiles.t1 = makeBytes(1000);
      seedOfflineCrate('crate-1', ['t1']);

      await DownloadService.reconcile();
      expectBytesEqual(downloadedData('t1'), serverFiles.t1);
    });

    it('treats a LAN connection as wifi even without NetInfo state', async () => {
      useConnectionStore.setState({ connectionType: 'local', networkState: null });
      mockLibraryTracks = [track('t1')];
      serverFiles.t1 = makeBytes(100);
      seedOfflineCrate('crate-1', ['t1']);

      await DownloadService.reconcile();
      expectBytesEqual(downloadedData('t1'), serverFiles.t1);
    });
  });

  describe('downloading', () => {
    it('downloads all missing tracks of an offline crate and records them', async () => {
      mockLibraryTracks = [track('t1'), track('t2')];
      serverFiles.t1 = makeBytes(1500, 3);
      serverFiles.t2 = makeBytes(2500, 5);
      seedOfflineCrate('crate-1', ['t1', 't2']);

      const result = await DownloadService.reconcile();

      expect(result).toEqual({ success: true });
      expectBytesEqual(downloadedData('t1'), serverFiles.t1);
      expectBytesEqual(downloadedData('t2'), serverFiles.t2);
      const { trackFiles } = useDownloadStore.getState();
      expect(trackFiles.t1.size).toBe(1500);
      expect(trackFiles.t2.size).toBe(2500);
      expect(trackFiles.t1.uri.endsWith('.mp3')).toBe(true);
      expect(useDownloadProgressStore.getState().isDownloading).toBe(false);
      // Entitlement observed with downloads allowed is remembered for offline playback
      expect(useDownloadStore.getState().lastKnownEntitled).toBe(true);
    });

    it('finalizes a fully-downloaded .part without corrupting it (server clamps ranges)', async () => {
      mockLibraryTracks = [track('t1')];
      serverFiles.t1 = makeBytes(1000, 9);
      seedOfflineCrate('crate-1', ['t1']);

      // App was killed after the last chunk but before the rename
      const dir = new Directory(Paths.document, 'offline-audio');
      dir.create({ intermediates: true, idempotent: true });
      fsMock.seedFile(`${dir.uri}/t1.mp3.part`, serverFiles.t1);

      await DownloadService.reconcile();

      // The clamped 1-byte 206 response must not be appended past EOF
      expectBytesEqual(downloadedData('t1'), serverFiles.t1);
      expect(useDownloadStore.getState().failedTracks.t1).toBeUndefined();
    });

    it('does not re-attempt tracks that failed with not_found on later reconciles', async () => {
      mockLibraryTracks = [track('missing')];
      seedOfflineCrate('crate-1', ['missing']);

      await DownloadService.reconcile();
      const callsAfterFirst = fetchSpy.mock.calls.length;
      expect(callsAfterFirst).toBe(1);

      await DownloadService.reconcile();
      expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst); // no new attempts
    });

    it('splits large files into multiple range requests and reassembles them', async () => {
      const size = 9 * 1024 * 1024; // 3 chunks at 4MB
      mockLibraryTracks = [track('big')];
      serverFiles.big = makeBytes(size, 11);
      seedOfflineCrate('crate-1', ['big']);

      await DownloadService.reconcile();

      expect(fetchSpy.mock.calls.length).toBe(3);
      expect(fetchSpy.mock.calls[0][1].headers.Range).toBe('bytes=0-4194303');
      expect(fetchSpy.mock.calls[1][1].headers.Range).toBe('bytes=4194304-8388607');
      expectBytesEqual(downloadedData('big'), serverFiles.big);
    });

    it('resumes a partial .part file from its current size', async () => {
      mockLibraryTracks = [track('t1')];
      serverFiles.t1 = makeBytes(1000, 9);
      seedOfflineCrate('crate-1', ['t1']);

      // Seed a half-finished .part file from a previous interrupted run
      const dir = new Directory(Paths.document, 'offline-audio');
      dir.create({ intermediates: true, idempotent: true });
      fsMock.seedFile(`${dir.uri}/t1.mp3.part`, serverFiles.t1.slice(0, 400));

      await DownloadService.reconcile();

      expect(fetchSpy.mock.calls[0][1].headers.Range).toBe('bytes=400-4194703');
      expectBytesEqual(downloadedData('t1'), serverFiles.t1);
    });

    it('reclaims a completed file that is on disk but missing from the map', async () => {
      mockLibraryTracks = [track('t1')];
      serverFiles.t1 = makeBytes(500);
      seedOfflineCrate('crate-1', ['t1']);

      const dir = new Directory(Paths.document, 'offline-audio');
      dir.create({ intermediates: true, idempotent: true });
      fsMock.seedFile(`${dir.uri}/t1.mp3`, serverFiles.t1);

      await DownloadService.reconcile();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(useDownloadStore.getState().trackFiles.t1.size).toBe(500);
    });

    it('marks a track failed with not_found on 404 and continues with the rest', async () => {
      mockLibraryTracks = [track('missing'), track('t2')];
      serverFiles.t2 = makeBytes(300);
      seedOfflineCrate('crate-1', ['missing', 't2']);

      await DownloadService.reconcile();

      const { failedTracks, trackFiles } = useDownloadStore.getState();
      expect(failedTracks.missing.reason).toBe(DOWNLOAD_FAILURE_REASONS.NOT_FOUND);
      expect(trackFiles.missing).toBeUndefined();
      expectBytesEqual(downloadedData('t2'), serverFiles.t2);
      // 404 is not retryable — exactly one attempt
      const missingCalls = fetchSpy.mock.calls.filter(([url]) => url.includes('missing'));
      expect(missingCalls.length).toBe(1);
    });

    it('fails with storage_full without hitting the network when disk space is low', async () => {
      fsMock.setAvailableDiskSpace(1024); // below the 500MB headroom requirement
      mockLibraryTracks = [track('t1')];
      serverFiles.t1 = makeBytes(100);
      seedOfflineCrate('crate-1', ['t1']);

      await DownloadService.reconcile();

      expect(useDownloadStore.getState().failedTracks.t1.reason).toBe(
        DOWNLOAD_FAILURE_REASONS.STORAGE_FULL
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips track ids with no metadata in the library cache', async () => {
      mockLibraryTracks = []; // nothing known about t1
      seedOfflineCrate('crate-1', ['t1']);

      const result = await DownloadService.reconcile();
      expect(result).toEqual({ success: true });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('metadata sidecars', () => {
    it('writes .meta and .art files alongside the downloaded audio', async () => {
      mockLibraryTracks = [track('t1', { hasArtwork: true })];
      serverFiles.t1 = makeBytes(500);
      artworkFiles.t1 = makeBytes(64, 13);
      seedOfflineCrate('crate-1', ['t1']);

      await DownloadService.reconcile();

      const { meta, art } = sidecarUris('t1');
      expect(fsMock.getFileData(meta)).not.toBeNull();
      expect(fsMock.getFileData(art)).not.toBeNull();
      expectBytesEqual(fsMock.getFileData(art), artworkFiles.t1);

      const parsed = DownloadService.readTrackMetadata('t1');
      expect(parsed.cuePoints).toEqual({ 1: { position: 12.5, color: '#CC0000', label: null } });
      expect(parsed.waveform.peaks).toEqual([0.1, 0.5]);
      expect(parsed.spectralWaveform.sampleCount).toBe(800);
      expect(parsed.beatGrid.bpm).toBe(128);
      expect(parsed.savedAt).toBeGreaterThan(0);
      expect(DownloadService.getArtworkUri('t1')).toBe(art);
    });

    it('audio download still succeeds when cue points reject and artwork 404s', async () => {
      apiMock.getCuePoints.mockRejectedValue(new Error('boom'));
      mockLibraryTracks = [track('t1', { hasArtwork: true })]; // no artworkFiles entry -> 404
      serverFiles.t1 = makeBytes(300);
      seedOfflineCrate('crate-1', ['t1']);

      await DownloadService.reconcile();

      expect(useDownloadStore.getState().trackFiles.t1).toBeDefined();
      const parsed = DownloadService.readTrackMetadata('t1');
      expect(parsed.cuePoints).toBeNull();
      expect(parsed.waveform).not.toBeNull();
      expect(DownloadService.getArtworkUri('t1')).toBeNull();
    });

    it('deletes sidecars together with the audio when the crate is un-toggled', async () => {
      mockLibraryTracks = [track('t1', { hasArtwork: true })];
      serverFiles.t1 = makeBytes(200);
      artworkFiles.t1 = makeBytes(32);
      seedOfflineCrate('crate-1', ['t1']);
      await DownloadService.reconcile();

      await DownloadService.removeCrateDownloads('crate-1');

      const remaining = fsMock.listAll().filter((uri) => uri.includes('t1'));
      expect(remaining).toEqual([]);
    });

    it('backfills a missing .meta for an already-downloaded track', async () => {
      // Simulate a track downloaded before sidecars existed: audio on disk, no .meta
      mockLibraryTracks = [track('t1')];
      serverFiles.t1 = makeBytes(400);
      seedOfflineCrate('crate-1', ['t1']);
      const dir = new Directory(Paths.document, 'offline-audio');
      dir.create({ intermediates: true, idempotent: true });
      fsMock.seedFile(`${dir.uri}/t1.mp3`, serverFiles.t1);

      await DownloadService.reconcile();

      expect(DownloadService.readTrackMetadata('t1')).not.toBeNull();
    });

    it('readTrackMetadata returns null for a corrupt .meta file', async () => {
      const dir = new Directory(Paths.document, 'offline-audio');
      dir.create({ intermediates: true, idempotent: true });
      fsMock.seedFile(sidecarUris('t1').meta, new TextEncoder().encode('{not json'));

      expect(DownloadService.readTrackMetadata('t1')).toBeNull();
    });

    it('updateTrackMetadata merges a patch for downloaded tracks and no-ops otherwise', async () => {
      mockLibraryTracks = [track('t1')];
      serverFiles.t1 = makeBytes(100);
      seedOfflineCrate('crate-1', ['t1']);
      await DownloadService.reconcile();

      const newCues = { 2: { position: 30, color: '#00CC00', label: 'drop' } };
      expect(DownloadService.updateTrackMetadata('t1', { cuePoints: newCues })).toBe(true);
      const parsed = DownloadService.readTrackMetadata('t1');
      expect(parsed.cuePoints).toEqual(newCues);
      expect(parsed.beatGrid.bpm).toBe(128); // other fields preserved

      // Not downloaded -> refuses to write an orphan sidecar
      expect(DownloadService.updateTrackMetadata('t9', { cuePoints: newCues })).toBe(false);
      expect(DownloadService.readTrackMetadata('t9')).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('deletes files for tracks no longer referenced by any offline crate', async () => {
      mockLibraryTracks = [track('t1'), track('t2')];
      serverFiles.t1 = makeBytes(100);
      serverFiles.t2 = makeBytes(200);
      seedOfflineCrate('crate-1', ['t1', 't2']);
      await DownloadService.reconcile();
      const t1Uri = useDownloadStore.getState().getLocalUri('t1');

      // t2 got removed from the crate on the server
      useOfflineStore.getState().cacheAllServerCrateTracks([
        { id: 'crate-1', trackIds: ['t1'] },
      ]);
      await DownloadService.reconcile();

      const { trackFiles } = useDownloadStore.getState();
      expect(trackFiles.t2).toBeUndefined();
      expect(trackFiles.t1).toBeDefined();
      expectBytesEqual(fsMock.getFileData(t1Uri), serverFiles.t1);
    });

    it('keeps a file still referenced by another offline crate', async () => {
      mockLibraryTracks = [track('shared'), track('only-a')];
      serverFiles.shared = makeBytes(100);
      serverFiles['only-a'] = makeBytes(200);
      useOfflineStore.getState().cacheAllServerCrateTracks([
        { id: 'crate-a', trackIds: ['shared', 'only-a'] },
        { id: 'crate-b', trackIds: ['shared'] },
      ]);
      useDownloadStore.getState().setCrateOffline('crate-a', true);
      useDownloadStore.getState().setCrateOffline('crate-b', true);
      await DownloadService.reconcile();

      await DownloadService.removeCrateDownloads('crate-a');

      const { trackFiles, offlineCrateIds } = useDownloadStore.getState();
      expect(offlineCrateIds).toEqual(['crate-b']);
      expect(trackFiles.shared).toBeDefined(); // still needed by crate-b
      expect(trackFiles['only-a']).toBeUndefined();
    });

    it('drops map entries whose file disappeared from disk', async () => {
      mockLibraryTracks = [track('t1')];
      serverFiles.t1 = makeBytes(100);
      seedOfflineCrate('crate-1', ['t1']);
      await DownloadService.reconcile();

      // Simulate the OS (or a bug) removing the file
      new File(useDownloadStore.getState().getLocalUri('t1')).delete();
      await DownloadService.cleanupDownloads();

      expect(useDownloadStore.getState().trackFiles.t1).toBeUndefined();
    });
  });

  describe('removeAllDownloads', () => {
    it('clears state and deletes the download directory, keeping wifiOnly', async () => {
      useDownloadStore.getState().setWifiOnly(false);
      mockLibraryTracks = [track('t1')];
      serverFiles.t1 = makeBytes(100);
      seedOfflineCrate('crate-1', ['t1']);
      await DownloadService.reconcile();

      DownloadService.removeAllDownloads();

      const state = useDownloadStore.getState();
      expect(state.trackFiles).toEqual({});
      expect(state.offlineCrateIds).toEqual([]);
      expect(state.wifiOnly).toBe(false);
      expect(new Directory(Paths.document, 'offline-audio').exists).toBe(false);
    });
  });
});
