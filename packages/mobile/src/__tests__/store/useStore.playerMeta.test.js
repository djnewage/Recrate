/**
 * Unit tests for useStore's offline player-metadata fallbacks:
 * cue points / waveform / beat grid loaders reading the .meta sidecar written
 * next to downloaded audio, plus cue-point write-through.
 */

import useStore from '../../store/useStore';
import { useConnectionStore } from '../../store/connectionStore';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    getCuePoints: jest.fn(),
    setCuePoint: jest.fn(),
    deleteCuePoint: jest.fn(),
    getWaveform: jest.fn(),
    getSpectralWaveform: jest.fn(),
    getBeatGrid: jest.fn(),
  },
  apiService: {},
}));

// Mock TrackPlayer to avoid initialization issues (mirrors useStore.offline.test.js)
jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    setupPlayer: jest.fn(),
    add: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
    getQueue: jest.fn().mockResolvedValue([]),
    getCurrentTrack: jest.fn(),
    getProgress: jest.fn().mockResolvedValue({ position: 0, duration: 0 }),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  RepeatMode: { Off: 0, Track: 1, Queue: 2 },
  State: { None: 0, Playing: 1, Paused: 2 },
  Event: { PlaybackState: 'playback-state' },
}));

// Mock DownloadService for both named and default access (useStore lazy-requires
// named exports; other callers use the default object)
jest.mock('../../services/DownloadService', () => {
  const fns = {
    readTrackMetadata: jest.fn(),
    updateTrackMetadata: jest.fn(),
    getArtworkUri: jest.fn(),
    reconcile: jest.fn(),
    cleanupDownloads: jest.fn(),
    removeCrateDownloads: jest.fn(),
  };
  return { __esModule: true, ...fns, default: fns };
});

const apiService = require('../../services/api').default;
const DownloadService = require('../../services/DownloadService').default;

describe('useStore - offline player metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useStore.setState({
      cuePointsCache: {},
      waveformCache: {},
      spectralWaveformCache: {},
      beatGridCache: {},
      isLoadingCuePoints: false,
    });
    useConnectionStore.setState({ isConnected: false, serverURL: null });
  });

  describe('loadCuePoints offline', () => {
    it('returns sidecar cue points and hydrates the cache without a network call', async () => {
      const cues = { 1: { position: 10.5, color: '#CC0000', label: null } };
      DownloadService.readTrackMetadata.mockReturnValue({ cuePoints: cues, savedAt: 123 });

      const result = await useStore.getState().loadCuePoints('track-1');

      expect(result).toEqual(cues);
      expect(useStore.getState().cuePointsCache['track-1']).toEqual(cues);
      expect(apiService.getCuePoints).not.toHaveBeenCalled();

      // Second call is served from the in-memory cache, no re-read
      DownloadService.readTrackMetadata.mockClear();
      const again = await useStore.getState().loadCuePoints('track-1');
      expect(again).toEqual(cues);
      expect(DownloadService.readTrackMetadata).not.toHaveBeenCalled();
    });

    it('returns {} offline when there is no sidecar and no cache', async () => {
      DownloadService.readTrackMetadata.mockReturnValue(null);
      const result = await useStore.getState().loadCuePoints('track-1');
      expect(result).toEqual({});
    });

    it('falls back to the sidecar when the online fetch throws', async () => {
      useConnectionStore.setState({ isConnected: true, serverURL: 'http://server' });
      apiService.getCuePoints.mockRejectedValue(new Error('down'));
      const cues = { 2: { position: 42, color: '#00CC00', label: 'drop' } };
      DownloadService.readTrackMetadata.mockReturnValue({ cuePoints: cues });

      const result = await useStore.getState().loadCuePoints('track-1');
      expect(result).toEqual(cues);
    });

    it('writes through to the sidecar after a successful online fetch', async () => {
      useConnectionStore.setState({ isConnected: true, serverURL: 'http://server' });
      const cues = { 1: { position: 5, color: '#CC0000', label: null } };
      apiService.getCuePoints.mockResolvedValue({ cuePoints: cues });

      await useStore.getState().loadCuePoints('track-1');

      expect(DownloadService.updateTrackMetadata).toHaveBeenCalledWith('track-1', {
        cuePoints: cues,
      });
    });
  });

  describe('loadWaveform offline', () => {
    it('falls back to the sidecar when the API returns null', async () => {
      apiService.getWaveform.mockResolvedValue(null);
      const waveform = { peaks: [0.2, 0.8], duration: 200 };
      DownloadService.readTrackMetadata.mockReturnValue({ waveform, savedAt: 5 });

      const result = await useStore.getState().loadWaveform('track-1');

      expect(result).toEqual(waveform);
      expect(useStore.getState().waveformCache['track-1'].peaks).toEqual([0.2, 0.8]);
    });
  });

  describe('loadBeatGrid offline', () => {
    it('falls back to the sidecar beat grid', async () => {
      apiService.getBeatGrid.mockResolvedValue(null);
      DownloadService.readTrackMetadata.mockReturnValue({
        beatGrid: { bpm: 174, firstBeatSec: 0.1, beats: [0.1, 0.44] },
      });

      const result = await useStore.getState().loadBeatGrid('track-1');

      expect(result.bpm).toBe(174);
      expect(useStore.getState().beatGridCache['track-1'].beats).toEqual([0.1, 0.44]);
    });

    it('does not cache an empty entry on an offline miss', async () => {
      apiService.getBeatGrid.mockResolvedValue(null);
      DownloadService.readTrackMetadata.mockReturnValue(null);

      const result = await useStore.getState().loadBeatGrid('track-1');

      expect(result).toBeNull();
      expect(useStore.getState().beatGridCache['track-1']).toBeUndefined();

      // Once connected, the real fetch still happens and caches normally
      useConnectionStore.setState({ isConnected: true, serverURL: 'http://server' });
      apiService.getBeatGrid.mockResolvedValue({ bpm: 128, firstBeatSec: 0, beats: [0] });
      const online = await useStore.getState().loadBeatGrid('track-1');
      expect(online.bpm).toBe(128);
    });
  });
});
