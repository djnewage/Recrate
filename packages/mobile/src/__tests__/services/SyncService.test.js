/**
 * Unit tests for SyncService
 * Tests sync queue processing, conflict detection, and resolution
 */

import { syncQueue, isSyncNeeded, triggerSyncIfPending } from '../../services/SyncService';
import useOfflineStore, {
  OPERATION_TYPES,
  OPERATION_STATUS,
  recoverStrandedOperations,
} from '../../store/offlineStore';
import { useConnectionStore } from '../../store/connectionStore';

// Mock the API service
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    getCrate: jest.fn(),
    createCrate: jest.fn(),
    addTracksToCrate: jest.fn(),
    removeTrackFromCrate: jest.fn(),
    deleteCrate: jest.fn(),
    setCuePoint: jest.fn(),
    deleteCuePoint: jest.fn(),
  },
}));

// Mock useStore to avoid TrackPlayer issues
jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({
      loadCrates: jest.fn(),
      loadCrate: jest.fn(),
      selectedCrate: null,
    })),
  },
}));

const apiService = require('../../services/api').default;

describe('SyncService', () => {
  beforeEach(() => {
    // Reset stores
    useOfflineStore.getState().clearQueue();
    useOfflineStore.setState({ localCrateTracks: {} });

    // Reset connection store
    useConnectionStore.setState({
      isConnected: true,
      serverURL: 'http://localhost:3000',
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('syncQueue', () => {
    describe('preconditions', () => {
      it('should skip sync when not connected', async () => {
        useConnectionStore.setState({ isConnected: false });

        const result = await syncQueue();

        expect(result).toEqual({ success: false, reason: 'not_connected' });
      });

      it('should skip sync when no server URL configured', async () => {
        useConnectionStore.setState({ isConnected: true, serverURL: null });

        const result = await syncQueue();

        expect(result).toEqual({ success: false, reason: 'no_server_url' });
      });

      it('should return success with 0 synced when queue is empty', async () => {
        const result = await syncQueue();

        expect(result).toEqual({ success: true, synced: 0 });
      });
    });

    describe('processing operations', () => {
      it('should process CREATE_CRATE operation successfully', async () => {
        const { enqueueOperation } = useOfflineStore.getState();
        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, {
          localCrateId: 'temp-123',
          name: 'Test Crate',
          color: '#8B5CF6',
        });

        apiService.createCrate.mockResolvedValue({
          crate: { id: 'server-123', name: 'Test Crate' },
        });

        const result = await syncQueue();

        expect(apiService.createCrate).toHaveBeenCalledWith('Test Crate', '#8B5CF6', undefined);
        expect(result.synced).toBe(1);
        expect(result.success).toBe(true);
      });

      it('should process ADD_TRACKS operation successfully', async () => {
        const { enqueueOperation } = useOfflineStore.getState();
        enqueueOperation(OPERATION_TYPES.ADD_TRACKS, {
          crateId: 'crate-1',
          trackIds: ['track-1', 'track-2'],
        });

        apiService.addTracksToCrate.mockResolvedValue({ success: true });

        const result = await syncQueue();

        expect(apiService.addTracksToCrate).toHaveBeenCalledWith('crate-1', ['track-1', 'track-2']);
        expect(result.synced).toBe(1);
      });

      it('should process REMOVE_TRACK operation successfully', async () => {
        const { enqueueOperation } = useOfflineStore.getState();
        enqueueOperation(OPERATION_TYPES.REMOVE_TRACK, {
          crateId: 'crate-1',
          trackId: 'track-1',
        });

        apiService.removeTrackFromCrate.mockResolvedValue({ success: true });

        const result = await syncQueue();

        expect(apiService.removeTrackFromCrate).toHaveBeenCalledWith('crate-1', 'track-1');
        expect(result.synced).toBe(1);
      });

      it('should process DELETE_CRATE operation successfully', async () => {
        const { enqueueOperation } = useOfflineStore.getState();
        enqueueOperation(OPERATION_TYPES.DELETE_CRATE, {
          crateId: 'crate-1',
        });

        apiService.deleteCrate.mockResolvedValue({ success: true });

        const result = await syncQueue();

        expect(apiService.deleteCrate).toHaveBeenCalledWith('crate-1');
        expect(result.synced).toBe(1);
      });

      it('should process operations in FIFO order', async () => {
        const { enqueueOperation } = useOfflineStore.getState();
        const callOrder = [];

        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, {
          localCrateId: 'temp-1',
          name: 'First',
        });
        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, {
          localCrateId: 'temp-2',
          name: 'Second',
        });

        apiService.createCrate.mockImplementation((name) => {
          callOrder.push(name);
          return Promise.resolve({ crate: { id: `server-${name}`, name } });
        });

        await syncQueue();

        expect(callOrder).toEqual(['First', 'Second']);
      });

      it('should remove operation from queue on success', async () => {
        const { enqueueOperation } = useOfflineStore.getState();
        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, {
          localCrateId: 'temp-1',
          name: 'Test',
        });

        apiService.createCrate.mockResolvedValue({ crate: { id: 'server-1' } });

        await syncQueue();

        const { operationQueue } = useOfflineStore.getState();
        expect(operationQueue).toHaveLength(0);
      });
    });

    describe('error handling', () => {
      it('should mark operation as FAILED after max retries', async () => {
        const { enqueueOperation, updateOperationStatus } = useOfflineStore.getState();
        const opId = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Test' });

        // Simulate max retries reached
        updateOperationStatus(opId, OPERATION_STATUS.PENDING);
        updateOperationStatus(opId, OPERATION_STATUS.PENDING);
        updateOperationStatus(opId, OPERATION_STATUS.PENDING);

        apiService.createCrate.mockRejectedValue(new Error('Network error'));

        await syncQueue();

        const { operationQueue } = useOfflineStore.getState();
        expect(operationQueue[0].status).toBe(OPERATION_STATUS.FAILED);
      });

      it('should handle 404 errors by removing operation from queue', async () => {
        const { enqueueOperation } = useOfflineStore.getState();
        enqueueOperation(OPERATION_TYPES.ADD_TRACKS, {
          crateId: 'non-existent',
          trackIds: ['track-1'],
        });

        const error = new Error('Not found');
        error.response = { status: 404 };
        apiService.addTracksToCrate.mockRejectedValue(error);

        await syncQueue();

        const { operationQueue } = useOfflineStore.getState();
        expect(operationQueue).toHaveLength(0);
      });
    });

    describe('ID mapping', () => {
      it('should map temp ID to server ID after CREATE_CRATE', async () => {
        const { enqueueOperation } = useOfflineStore.getState();
        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, {
          localCrateId: 'temp-123',
          name: 'Test Crate',
        });

        apiService.createCrate.mockResolvedValue({
          crate: { id: 'server-456', name: 'Test Crate' },
        });

        await syncQueue();

        const { getServerId } = useOfflineStore.getState();
        expect(getServerId('temp-123')).toBe('server-456');
      });

      it('should resolve temp IDs in subsequent operations', async () => {
        const { enqueueOperation, mapLocalToServerId } = useOfflineStore.getState();

        // Pre-map the ID (simulating a previously synced crate)
        mapLocalToServerId('temp-crate', 'server-crate');

        enqueueOperation(OPERATION_TYPES.ADD_TRACKS, {
          crateId: 'temp-crate',
          trackIds: ['track-1'],
        });

        apiService.addTracksToCrate.mockResolvedValue({ success: true });

        await syncQueue();

        // The API should be called with the resolved server ID
        expect(apiService.addTracksToCrate).toHaveBeenCalledWith('server-crate', ['track-1']);
      });
    });

    describe('sync state', () => {
      it('should set isSyncing during sync', async () => {
        const { enqueueOperation } = useOfflineStore.getState();
        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Test' });

        let wasSyncing = false;
        apiService.createCrate.mockImplementation(() => {
          wasSyncing = useOfflineStore.getState().isSyncing;
          return Promise.resolve({ crate: { id: 'server-1' } });
        });

        await syncQueue();

        expect(wasSyncing).toBe(true);
        expect(useOfflineStore.getState().isSyncing).toBe(false);
      });

      it('should update sync progress during processing', async () => {
        const { enqueueOperation } = useOfflineStore.getState();
        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'First' });
        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Second' });

        const progressUpdates = [];
        apiService.createCrate.mockImplementation(() => {
          progressUpdates.push({ ...useOfflineStore.getState().syncProgress });
          return Promise.resolve({ crate: { id: 'server-1' } });
        });

        await syncQueue();

        expect(progressUpdates[0]).toEqual({ current: 1, total: 2 });
        expect(progressUpdates[1]).toEqual({ current: 2, total: 2 });
      });

      it('should reset isSyncing even if an unexpected error is thrown mid-sync', async () => {
        const { enqueueOperation } = useOfflineStore.getState();
        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Test' });

        // Force an unexpected throw inside the sync loop (not a normal API error, which is
        // already caught per-operation). Without the try/finally this would leave isSyncing
        // stuck true and permanently disable the manual sync button.
        const original = useOfflineStore.getState().setSyncProgress;
        useOfflineStore.setState({
          setSyncProgress: () => {
            throw new Error('boom');
          },
        });

        try {
          await expect(syncQueue()).rejects.toThrow('boom');
          expect(useOfflineStore.getState().isSyncing).toBe(false);
        } finally {
          useOfflineStore.setState({ setSyncProgress: original });
        }
      });
    });
  });

  describe('cue point operations', () => {
    it('replays a queued SET_CUE_POINT against the API and dequeues it', async () => {
      apiService.setCuePoint.mockResolvedValue({ success: true, position: 42.5 });
      useOfflineStore
        .getState()
        .enqueueCueOperation(OPERATION_TYPES.SET_CUE_POINT, 'track-1', 3, { position: 42.5 });

      const result = await syncQueue();

      expect(result).toEqual({ success: true, synced: 1, conflicts: 0, failed: 0 });
      expect(apiService.setCuePoint).toHaveBeenCalledWith('track-1', 3, 42.5, null);
      expect(useOfflineStore.getState().operationQueue).toHaveLength(0);
    });

    it('replays a queued DELETE_CUE_POINT against the API', async () => {
      apiService.deleteCuePoint.mockResolvedValue({ success: true });
      useOfflineStore
        .getState()
        .enqueueCueOperation(OPERATION_TYPES.DELETE_CUE_POINT, 'track-1', 2);

      const result = await syncQueue();

      expect(result.synced).toBe(1);
      expect(apiService.deleteCuePoint).toHaveBeenCalledWith('track-1', 2);
    });

    it('drops a cue op when the track no longer exists on the server (404)', async () => {
      apiService.deleteCuePoint.mockRejectedValue({ response: { status: 404 } });
      useOfflineStore
        .getState()
        .enqueueCueOperation(OPERATION_TYPES.DELETE_CUE_POINT, 'gone-track', 1);

      await syncQueue();

      expect(useOfflineStore.getState().operationQueue).toHaveLength(0);
    });

  });

  describe('triggerSyncIfPending', () => {
    it('runs sync when connected and there are pending operations', async () => {
      useOfflineStore.getState().enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'T' });
      apiService.createCrate.mockResolvedValue({ crate: { id: 'server-1' } });

      const result = await triggerSyncIfPending();

      expect(apiService.createCrate).toHaveBeenCalled();
      expect(result.synced).toBe(1);
    });

    it('skips (no sync) when the server is not connected', async () => {
      useConnectionStore.setState({ isConnected: false });
      useOfflineStore.getState().enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'T' });

      const result = await triggerSyncIfPending();

      expect(apiService.createCrate).not.toHaveBeenCalled();
      expect(result.skipped).toBe(true);
    });

    it('skips (no sync) when there are no pending operations', async () => {
      const result = await triggerSyncIfPending();

      expect(apiService.createCrate).not.toHaveBeenCalled();
      expect(result.skipped).toBe(true);
    });
  });

  describe('recoverStrandedOperations', () => {
    it('resets SYNCING ops back to PENDING (app killed mid-sync) without touching others', () => {
      const queue = [
        { id: '1', status: OPERATION_STATUS.SYNCING, type: OPERATION_TYPES.CREATE_CRATE },
        { id: '2', status: OPERATION_STATUS.PENDING, type: OPERATION_TYPES.ADD_TRACKS },
        { id: '3', status: OPERATION_STATUS.FAILED, type: OPERATION_TYPES.DELETE_CRATE },
      ];

      const recovered = recoverStrandedOperations(queue);

      expect(recovered[0].status).toBe(OPERATION_STATUS.PENDING);
      expect(recovered[1].status).toBe(OPERATION_STATUS.PENDING);
      expect(recovered[2].status).toBe(OPERATION_STATUS.FAILED);
    });

    it('handles a non-array queue safely', () => {
      expect(recoverStrandedOperations(undefined)).toBeUndefined();
    });
  });

  describe('isSyncNeeded', () => {
    it('should return true when there are pending operations', () => {
      const { enqueueOperation } = useOfflineStore.getState();
      enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Test' });

      expect(isSyncNeeded()).toBe(true);
    });

    it('should return false when queue is empty', () => {
      expect(isSyncNeeded()).toBe(false);
    });

    it('should return false when all operations are failed', () => {
      const { enqueueOperation, updateOperationStatus } = useOfflineStore.getState();
      const opId = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Test' });
      updateOperationStatus(opId, OPERATION_STATUS.FAILED);

      expect(isSyncNeeded()).toBe(false);
    });
  });
});
