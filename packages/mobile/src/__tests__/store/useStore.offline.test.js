/**
 * Unit tests for useStore offline functionality
 * Tests crate operations when offline and loadCrate fallback behavior
 */

import useStore from '../../store/useStore';
import useOfflineStore, { OPERATION_TYPES, OPERATION_STATUS } from '../../store/offlineStore';
import { useConnectionStore } from '../../store/connectionStore';

// Mock the API service
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    getCrate: jest.fn(),
    createCrate: jest.fn(),
    addTracksToCrate: jest.fn(),
    removeTrackFromCrate: jest.fn(),
  },
  apiService: {
    getCrate: jest.fn(),
    createCrate: jest.fn(),
    addTracksToCrate: jest.fn(),
    removeTrackFromCrate: jest.fn(),
  },
}));

// Mock TrackPlayer to avoid initialization issues
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

const apiService = require('../../services/api').default;

describe('useStore - Offline Functionality', () => {
  // Sample test data
  const mockTracks = [
    { id: 'track-1', title: 'Track 1', artist: 'Artist 1' },
    { id: 'track-2', title: 'Track 2', artist: 'Artist 2' },
    { id: 'track-3', title: 'Track 3', artist: 'Artist 3' },
  ];

  const mockCrate = {
    id: 'crate-1',
    name: 'Test Crate',
    trackCount: 2,
    tracks: [mockTracks[0], mockTracks[1]],
  };

  beforeEach(() => {
    // Reset stores
    useOfflineStore.getState().clearQueue();
    useOfflineStore.setState({ localCrateTracks: {} });

    // Reset useStore to clean state
    useStore.setState({
      tracks: mockTracks,
      crates: [],
      crateTree: [],
      selectedCrate: null,
      isLoadingCrates: false,
      cratesError: null,
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('createCrate when offline', () => {
    beforeEach(() => {
      // Set connection to offline
      useConnectionStore.setState({ isConnected: false });
    });

    afterEach(() => {
      // Reset connection state
      useConnectionStore.setState({ isConnected: true });
    });

    it('should create a crate with temp ID when offline', async () => {
      const { createCrate } = useStore.getState();

      const result = await createCrate('My Offline Crate', '#8B5CF6');

      // Returns the temp crate id (truthy) so callers can immediately add tracks
      expect(typeof result).toBe('string');
      expect(result.startsWith('temp-')).toBe(true);

      // Check crate was added to local state
      const { crates } = useStore.getState();
      expect(crates).toHaveLength(1);
      expect(crates[0].name).toBe('My Offline Crate');
      expect(crates[0].id).toMatch(/^temp-/);
      expect(crates[0].isLocal).toBe(true);
    });

    it('should queue CREATE_CRATE operation when offline', async () => {
      const { createCrate } = useStore.getState();

      await createCrate('Queued Crate', '#8B5CF6');

      const { operationQueue } = useOfflineStore.getState();
      expect(operationQueue).toHaveLength(1);
      expect(operationQueue[0].type).toBe(OPERATION_TYPES.CREATE_CRATE);
      expect(operationQueue[0].payload.name).toBe('Queued Crate');
      expect(operationQueue[0].status).toBe(OPERATION_STATUS.PENDING);
    });

    it('should not call API when offline', async () => {
      const { createCrate } = useStore.getState();

      await createCrate('Offline Crate', '#8B5CF6');

      expect(apiService.createCrate).not.toHaveBeenCalled();
    });
  });

  describe('addTracksToCrate when offline', () => {
    beforeEach(() => {
      // Set connection to offline
      useConnectionStore.setState({ isConnected: false });

      // Add a local crate to work with
      useStore.setState({
        tracks: mockTracks,
        crates: [{ id: 'temp-crate-1', name: 'Local Crate', trackCount: 0, isLocal: true }],
        selectedCrate: { id: 'temp-crate-1', name: 'Local Crate', tracks: [] },
      });
    });

    afterEach(() => {
      useConnectionStore.setState({ isConnected: true });
    });

    it('should queue ADD_TRACKS operation when offline', async () => {
      const { addTracksToCrate } = useStore.getState();

      await addTracksToCrate('temp-crate-1', ['track-1', 'track-2']);

      const { operationQueue } = useOfflineStore.getState();
      expect(operationQueue).toHaveLength(1);
      expect(operationQueue[0].type).toBe(OPERATION_TYPES.ADD_TRACKS);
      expect(operationQueue[0].payload.trackIds).toEqual(['track-1', 'track-2']);
    });

    it('should store tracks locally for offline viewing', async () => {
      const { addTracksToCrate } = useStore.getState();

      await addTracksToCrate('temp-crate-1', ['track-1', 'track-2']);

      const localTracks = useOfflineStore.getState().getLocalCrateTracks('temp-crate-1');
      expect(localTracks).toEqual(['track-1', 'track-2']);
    });

    it('should update track count optimistically', async () => {
      const { addTracksToCrate } = useStore.getState();

      await addTracksToCrate('temp-crate-1', ['track-1', 'track-2']);

      const { crates } = useStore.getState();
      const crate = crates.find((c) => c.id === 'temp-crate-1');
      expect(crate.trackCount).toBe(2);
    });

    it('should update selectedCrate tracks optimistically', async () => {
      const { addTracksToCrate } = useStore.getState();

      await addTracksToCrate('temp-crate-1', ['track-1', 'track-2']);

      const { selectedCrate } = useStore.getState();
      expect(selectedCrate.tracks).toHaveLength(2);
      expect(selectedCrate.tracks[0].id).toBe('track-1');
    });
  });

  describe('addTracksToCrate to SERVER crate when offline', () => {
    const serverCrate = {
      id: 'server-crate-1',
      name: 'Server Crate',
      trackCount: 1,
      isLocal: false,
      tracks: [mockTracks[0]],
      lastModified: Date.now(),
    };

    beforeEach(() => {
      useConnectionStore.setState({ isConnected: false });
      useStore.setState({
        tracks: mockTracks,
        crates: [serverCrate],
        selectedCrate: { ...serverCrate },
      });
    });

    afterEach(() => {
      useConnectionStore.setState({ isConnected: true });
    });

    it('should queue ADD_TRACKS operation with server crate ID', async () => {
      const { addTracksToCrate } = useStore.getState();

      await addTracksToCrate('server-crate-1', ['track-2', 'track-3']);

      const { operationQueue } = useOfflineStore.getState();
      expect(operationQueue).toHaveLength(1);
      expect(operationQueue[0].type).toBe(OPERATION_TYPES.ADD_TRACKS);
      expect(operationQueue[0].payload.crateId).toBe('server-crate-1');
      expect(operationQueue[0].payload.trackIds).toEqual(['track-2', 'track-3']);
    });

    it('should store tracks locally for server crate', async () => {
      const { addTracksToCrate } = useStore.getState();

      await addTracksToCrate('server-crate-1', ['track-2', 'track-3']);

      const localTracks = useOfflineStore.getState().getLocalCrateTracks('server-crate-1');
      expect(localTracks).toEqual(['track-2', 'track-3']);
    });

    it('should update server crate track count optimistically', async () => {
      const { addTracksToCrate } = useStore.getState();

      await addTracksToCrate('server-crate-1', ['track-2', 'track-3']);

      const { crates } = useStore.getState();
      const crate = crates.find((c) => c.id === 'server-crate-1');
      // Original had 1 track, added 2 more = 3 total
      expect(crate.trackCount).toBe(3);
    });

    it('should update selectedCrate tracks for server crate', async () => {
      const { addTracksToCrate } = useStore.getState();

      await addTracksToCrate('server-crate-1', ['track-2', 'track-3']);

      const { selectedCrate } = useStore.getState();
      // Original had track-1, now should have track-1, track-2, track-3
      expect(selectedCrate.tracks).toHaveLength(3);
    });

    it('should capture serverVersion for conflict detection', async () => {
      const { addTracksToCrate } = useStore.getState();

      await addTracksToCrate('server-crate-1', ['track-2']);

      const { operationQueue } = useOfflineStore.getState();
      expect(operationQueue[0].payload.serverVersion).toBeDefined();
    });
  });

  describe('removeTrackFromCrate when offline', () => {
    beforeEach(() => {
      useConnectionStore.setState({ isConnected: false });

      // Setup with tracks
      useOfflineStore.getState().addLocalCrateTracks('temp-crate-1', ['track-1', 'track-2']);
      useStore.setState({
        tracks: mockTracks,
        crates: [{ id: 'temp-crate-1', name: 'Local Crate', trackCount: 2, isLocal: true }],
        selectedCrate: {
          id: 'temp-crate-1',
          name: 'Local Crate',
          tracks: [mockTracks[0], mockTracks[1]],
        },
      });
    });

    afterEach(() => {
      useConnectionStore.setState({ isConnected: true });
    });

    it('should queue REMOVE_TRACK operation when offline', async () => {
      const { removeTrackFromCrate } = useStore.getState();

      await removeTrackFromCrate('temp-crate-1', 'track-1');

      const { operationQueue } = useOfflineStore.getState();
      expect(operationQueue).toHaveLength(1);
      expect(operationQueue[0].type).toBe(OPERATION_TYPES.REMOVE_TRACK);
      expect(operationQueue[0].payload.trackId).toBe('track-1');
    });

    it('should remove track from local storage', async () => {
      const { removeTrackFromCrate } = useStore.getState();

      await removeTrackFromCrate('temp-crate-1', 'track-1');

      const localTracks = useOfflineStore.getState().getLocalCrateTracks('temp-crate-1');
      expect(localTracks).toEqual(['track-2']);
    });

    it('should update track count optimistically', async () => {
      const { removeTrackFromCrate } = useStore.getState();

      await removeTrackFromCrate('temp-crate-1', 'track-1');

      const { crates } = useStore.getState();
      const crate = crates.find((c) => c.id === 'temp-crate-1');
      expect(crate.trackCount).toBe(1);
    });
  });

  describe('loadCrate', () => {
    describe('for local crates', () => {
      beforeEach(() => {
        // Setup local crate with tracks
        useOfflineStore.getState().addLocalCrateTracks('temp-crate-1', ['track-1', 'track-2']);
        useStore.setState({
          tracks: mockTracks,
          crates: [{ id: 'temp-crate-1', name: 'Local Crate', trackCount: 2, isLocal: true }],
        });
      });

      it('should load from local state without API call', async () => {
        const { loadCrate } = useStore.getState();

        await loadCrate('temp-crate-1');

        expect(apiService.getCrate).not.toHaveBeenCalled();

        const { selectedCrate } = useStore.getState();
        expect(selectedCrate).toBeDefined();
        expect(selectedCrate.name).toBe('Local Crate');
      });

      it('should resolve track IDs to track objects', async () => {
        const { loadCrate } = useStore.getState();

        await loadCrate('temp-crate-1');

        const { selectedCrate } = useStore.getState();
        expect(selectedCrate.tracks).toHaveLength(2);
        expect(selectedCrate.tracks[0].id).toBe('track-1');
        expect(selectedCrate.tracks[0].title).toBe('Track 1');
      });

      it('should set isLoadingCrates to false', async () => {
        const { loadCrate } = useStore.getState();

        await loadCrate('temp-crate-1');

        const { isLoadingCrates } = useStore.getState();
        expect(isLoadingCrates).toBe(false);
      });
    });

    describe('for server crates when online', () => {
      beforeEach(() => {
        useConnectionStore.setState({ isConnected: true });
        apiService.getCrate.mockResolvedValue(mockCrate);
      });

      it('should call API for non-local crates', async () => {
        const { loadCrate } = useStore.getState();

        await loadCrate('server-crate-1');

        expect(apiService.getCrate).toHaveBeenCalledWith('server-crate-1');
      });

      it('should update selectedCrate with API response', async () => {
        const { loadCrate } = useStore.getState();

        await loadCrate('crate-1');

        const { selectedCrate } = useStore.getState();
        expect(selectedCrate).toEqual(mockCrate);
      });
    });

    describe('API failure fallback', () => {
      beforeEach(() => {
        // Setup cached crate
        useStore.setState({
          tracks: mockTracks,
          crates: [mockCrate],
        });
        // Make API fail
        apiService.getCrate.mockRejectedValue(new Error('Network error'));
      });

      it('should fallback to cached crate on API failure', async () => {
        const { loadCrate } = useStore.getState();

        await loadCrate('crate-1');

        const { selectedCrate, cratesError } = useStore.getState();
        expect(selectedCrate).toBeDefined();
        expect(selectedCrate.id).toBe('crate-1');
        expect(cratesError).toBeNull();
      });

      it('should set error if no cached crate available', async () => {
        useStore.setState({ crates: [] }); // No cached crates
        const { loadCrate } = useStore.getState();

        await loadCrate('non-existent-crate');

        const { cratesError } = useStore.getState();
        expect(cratesError).toBe('Network error');
      });
    });
  });

  describe('server unreachable fallback (stale isConnected)', () => {
    beforeEach(() => {
      // Simulate the bug condition: app thinks it's online, but the desktop server is gone.
      useConnectionStore.setState({ isConnected: true, serverURL: 'http://localhost:3000' });
      useStore.setState({ crates: [{ id: 'crate-1', name: 'Test', trackCount: 0 }] });
    });
    afterEach(() => {
      useConnectionStore.setState({ isConnected: false });
    });

    it('queues the add and goes offline when the API fails with a network error', async () => {
      apiService.addTracksToCrate.mockRejectedValue(new Error('Network Error')); // no .response

      const result = await useStore.getState().addTracksToCrate('crate-1', ['track-1']);

      expect(result).toBe(true); // no error alert — captured offline
      expect(useConnectionStore.getState().isConnected).toBe(false);
      const ops = useOfflineStore
        .getState()
        .operationQueue.filter((o) => o.type === OPERATION_TYPES.ADD_TRACKS);
      expect(ops).toHaveLength(1);
      expect(ops[0].status).toBe(OPERATION_STATUS.PENDING);
    });

    it('queues the add and goes offline when the proxy returns 503 (Desktop not connected)', async () => {
      const err = new Error('Request failed with status code 503');
      err.response = { status: 503 };
      apiService.addTracksToCrate.mockRejectedValue(err);

      const result = await useStore.getState().addTracksToCrate('crate-1', ['track-1']);

      expect(result).toBe(true);
      expect(useConnectionStore.getState().isConnected).toBe(false);
      expect(
        useOfflineStore.getState().operationQueue.some((o) => o.type === OPERATION_TYPES.ADD_TRACKS)
      ).toBe(true);
    });

    it('surfaces a real error (no queue, stays online) on a genuine 500', async () => {
      const err = new Error('Server error');
      err.response = { status: 500 };
      apiService.addTracksToCrate.mockRejectedValue(err);

      const result = await useStore.getState().addTracksToCrate('crate-1', ['track-1']);

      expect(result).toBe(false);
      expect(useConnectionStore.getState().isConnected).toBe(true);
      expect(
        useOfflineStore.getState().operationQueue.filter((o) => o.type === OPERATION_TYPES.ADD_TRACKS)
      ).toHaveLength(0);
      expect(useStore.getState().cratesError).toBe('Server error');
    });
  });

  describe('attemptReconnect', () => {
    afterEach(() => {
      useConnectionStore.setState({ isConnected: false, serverURL: null, lastSuccessfulIP: null });
    });

    it('flips online when the probe succeeds', async () => {
      useConnectionStore.setState({
        isConnected: false,
        serverURL: 'http://localhost:3000',
        quickTestConnection: jest.fn().mockResolvedValue(true),
      });

      const ok = await useConnectionStore.getState().attemptReconnect();

      expect(ok).toBe(true);
      expect(useConnectionStore.getState().isConnected).toBe(true);
    });

    it('stays offline when the probe fails', async () => {
      useConnectionStore.setState({
        isConnected: false,
        serverURL: 'http://localhost:3000',
        quickTestConnection: jest.fn().mockResolvedValue(false),
      });

      const ok = await useConnectionStore.getState().attemptReconnect();

      expect(ok).toBe(false);
      expect(useConnectionStore.getState().isConnected).toBe(false);
    });

    it('returns false when there is no known server URL', async () => {
      useConnectionStore.setState({ isConnected: false, serverURL: null, lastSuccessfulIP: null });

      const ok = await useConnectionStore.getState().attemptReconnect();

      expect(ok).toBe(false);
    });
  });

  describe('playTrack offline guard', () => {
    it('does not attempt playback when offline', async () => {
      useConnectionStore.setState({ isConnected: false });

      await useStore.getState().playTrack({ id: 'track-1', title: 'T' });

      expect(useStore.getState().isPlaying).toBe(false);
      expect(useStore.getState().playerError).toMatch(/offline/i);
      const TrackPlayer = require('react-native-track-player').default;
      expect(TrackPlayer.add).not.toHaveBeenCalled();
      expect(TrackPlayer.play).not.toHaveBeenCalled();
    });
  });
});
