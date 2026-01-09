/**
 * Unit tests for offlineStore
 * Tests the offline operation queue, local crate tracks, and related functionality
 */

import useOfflineStore, {
  OPERATION_TYPES,
  OPERATION_STATUS,
  generateTempCrateId,
} from '../../store/offlineStore';

describe('offlineStore', () => {
  // Reset store state before each test
  beforeEach(() => {
    const store = useOfflineStore.getState();
    store.clearQueue();
    // Also clear localCrateTracks
    useOfflineStore.setState({ localCrateTracks: {} });
  });

  describe('Operation Queue', () => {
    describe('enqueueOperation', () => {
      it('should add an operation to the queue with PENDING status', () => {
        const { enqueueOperation, operationQueue } = useOfflineStore.getState();

        const operationId = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, {
          name: 'Test Crate',
          color: '#8B5CF6',
        });

        const updatedQueue = useOfflineStore.getState().operationQueue;
        expect(updatedQueue).toHaveLength(1);
        expect(updatedQueue[0].id).toBe(operationId);
        expect(updatedQueue[0].type).toBe(OPERATION_TYPES.CREATE_CRATE);
        expect(updatedQueue[0].status).toBe(OPERATION_STATUS.PENDING);
        expect(updatedQueue[0].payload.name).toBe('Test Crate');
      });

      it('should add multiple operations in order', () => {
        const { enqueueOperation } = useOfflineStore.getState();

        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Crate 1' });
        enqueueOperation(OPERATION_TYPES.ADD_TRACKS, { crateId: '123', trackIds: ['t1'] });
        enqueueOperation(OPERATION_TYPES.REMOVE_TRACK, { crateId: '123', trackId: 't1' });

        const { operationQueue } = useOfflineStore.getState();
        expect(operationQueue).toHaveLength(3);
        expect(operationQueue[0].type).toBe(OPERATION_TYPES.CREATE_CRATE);
        expect(operationQueue[1].type).toBe(OPERATION_TYPES.ADD_TRACKS);
        expect(operationQueue[2].type).toBe(OPERATION_TYPES.REMOVE_TRACK);
      });
    });

    describe('dequeueOperation', () => {
      it('should remove an operation from the queue', () => {
        const { enqueueOperation, dequeueOperation } = useOfflineStore.getState();

        const operationId = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Test' });
        expect(useOfflineStore.getState().operationQueue).toHaveLength(1);

        dequeueOperation(operationId);
        expect(useOfflineStore.getState().operationQueue).toHaveLength(0);
      });

      it('should only remove the specified operation', () => {
        const { enqueueOperation, dequeueOperation } = useOfflineStore.getState();

        const id1 = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Crate 1' });
        const id2 = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Crate 2' });

        dequeueOperation(id1);

        const { operationQueue } = useOfflineStore.getState();
        expect(operationQueue).toHaveLength(1);
        expect(operationQueue[0].id).toBe(id2);
      });
    });

    describe('updateOperationStatus', () => {
      it('should update operation status', () => {
        const { enqueueOperation, updateOperationStatus } = useOfflineStore.getState();

        const operationId = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Test' });
        updateOperationStatus(operationId, OPERATION_STATUS.SYNCING);

        const { operationQueue } = useOfflineStore.getState();
        expect(operationQueue[0].status).toBe(OPERATION_STATUS.SYNCING);
      });

      it('should update status with error message', () => {
        const { enqueueOperation, updateOperationStatus } = useOfflineStore.getState();

        const operationId = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Test' });
        updateOperationStatus(operationId, OPERATION_STATUS.FAILED, 'Network error');

        const { operationQueue } = useOfflineStore.getState();
        expect(operationQueue[0].status).toBe(OPERATION_STATUS.FAILED);
        expect(operationQueue[0].errorMessage).toBe('Network error');
      });

      it('should increment retry count when status changes to PENDING', () => {
        const { enqueueOperation, updateOperationStatus } = useOfflineStore.getState();

        const operationId = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Test' });

        // First retry
        updateOperationStatus(operationId, OPERATION_STATUS.PENDING);
        expect(useOfflineStore.getState().operationQueue[0].retryCount).toBe(1);

        // Second retry
        updateOperationStatus(operationId, OPERATION_STATUS.PENDING);
        expect(useOfflineStore.getState().operationQueue[0].retryCount).toBe(2);
      });
    });

    describe('retryFailedOperations', () => {
      it('should mark all failed operations as pending', () => {
        const { enqueueOperation, updateOperationStatus, retryFailedOperations } =
          useOfflineStore.getState();

        const id1 = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Crate 1' });
        const id2 = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Crate 2' });

        updateOperationStatus(id1, OPERATION_STATUS.FAILED, 'Error 1');
        updateOperationStatus(id2, OPERATION_STATUS.FAILED, 'Error 2');

        retryFailedOperations();

        const { operationQueue } = useOfflineStore.getState();
        expect(operationQueue[0].status).toBe(OPERATION_STATUS.PENDING);
        expect(operationQueue[0].errorMessage).toBeNull();
        expect(operationQueue[1].status).toBe(OPERATION_STATUS.PENDING);
        expect(operationQueue[1].errorMessage).toBeNull();
      });
    });
  });

  describe('Local Crate Tracks', () => {
    describe('addLocalCrateTracks', () => {
      it('should store track IDs for a crate', () => {
        const { addLocalCrateTracks, getLocalCrateTracks } = useOfflineStore.getState();

        addLocalCrateTracks('crate-1', ['track-1', 'track-2']);

        const tracks = getLocalCrateTracks('crate-1');
        expect(tracks).toEqual(['track-1', 'track-2']);
      });

      it('should append tracks to existing crate tracks', () => {
        const { addLocalCrateTracks, getLocalCrateTracks } = useOfflineStore.getState();

        addLocalCrateTracks('crate-1', ['track-1', 'track-2']);
        addLocalCrateTracks('crate-1', ['track-3']);

        const tracks = getLocalCrateTracks('crate-1');
        expect(tracks).toEqual(['track-1', 'track-2', 'track-3']);
      });

      it('should keep tracks separate for different crates', () => {
        const { addLocalCrateTracks, getLocalCrateTracks } = useOfflineStore.getState();

        addLocalCrateTracks('crate-1', ['track-1']);
        addLocalCrateTracks('crate-2', ['track-2']);

        expect(getLocalCrateTracks('crate-1')).toEqual(['track-1']);
        expect(getLocalCrateTracks('crate-2')).toEqual(['track-2']);
      });
    });

    describe('removeLocalCrateTrack', () => {
      it('should remove a single track from a crate', () => {
        const { addLocalCrateTracks, removeLocalCrateTrack, getLocalCrateTracks } =
          useOfflineStore.getState();

        addLocalCrateTracks('crate-1', ['track-1', 'track-2', 'track-3']);
        removeLocalCrateTrack('crate-1', 'track-2');

        const tracks = getLocalCrateTracks('crate-1');
        expect(tracks).toEqual(['track-1', 'track-3']);
      });

      it('should not affect other crates', () => {
        const { addLocalCrateTracks, removeLocalCrateTrack, getLocalCrateTracks } =
          useOfflineStore.getState();

        addLocalCrateTracks('crate-1', ['track-1', 'track-2']);
        addLocalCrateTracks('crate-2', ['track-2', 'track-3']);

        removeLocalCrateTrack('crate-1', 'track-2');

        expect(getLocalCrateTracks('crate-1')).toEqual(['track-1']);
        expect(getLocalCrateTracks('crate-2')).toEqual(['track-2', 'track-3']);
      });
    });

    describe('getLocalCrateTracks', () => {
      it('should return empty array for non-existent crate', () => {
        const { getLocalCrateTracks } = useOfflineStore.getState();

        const tracks = getLocalCrateTracks('non-existent-crate');
        expect(tracks).toEqual([]);
      });
    });

    describe('clearLocalCrate', () => {
      it('should remove all tracks for a crate', () => {
        const { addLocalCrateTracks, clearLocalCrate, getLocalCrateTracks } =
          useOfflineStore.getState();

        addLocalCrateTracks('crate-1', ['track-1', 'track-2']);
        clearLocalCrate('crate-1');

        const tracks = getLocalCrateTracks('crate-1');
        expect(tracks).toEqual([]);
      });

      it('should not affect other crates', () => {
        const { addLocalCrateTracks, clearLocalCrate, getLocalCrateTracks } =
          useOfflineStore.getState();

        addLocalCrateTracks('crate-1', ['track-1']);
        addLocalCrateTracks('crate-2', ['track-2']);

        clearLocalCrate('crate-1');

        expect(getLocalCrateTracks('crate-1')).toEqual([]);
        expect(getLocalCrateTracks('crate-2')).toEqual(['track-2']);
      });
    });
  });

  describe('ID Mapping', () => {
    describe('mapLocalToServerId', () => {
      it('should store mapping from local to server ID', () => {
        const { mapLocalToServerId, getServerId } = useOfflineStore.getState();

        mapLocalToServerId('temp-123', 'server-456');

        const serverId = getServerId('temp-123');
        expect(serverId).toBe('server-456');
      });
    });

    describe('getServerId', () => {
      it('should return null for unmapped ID', () => {
        const { getServerId } = useOfflineStore.getState();

        const serverId = getServerId('unmapped-id');
        expect(serverId).toBeNull();
      });
    });

    describe('clearIdMapping', () => {
      it('should remove a specific ID mapping', () => {
        const { mapLocalToServerId, clearIdMapping, getServerId } =
          useOfflineStore.getState();

        mapLocalToServerId('temp-123', 'server-456');
        mapLocalToServerId('temp-789', 'server-012');

        clearIdMapping('temp-123');

        expect(getServerId('temp-123')).toBeNull();
        expect(getServerId('temp-789')).toBe('server-012');
      });
    });
  });

  describe('Utility Functions', () => {
    describe('generateTempCrateId', () => {
      it('should generate a unique temp ID starting with "temp-"', () => {
        const id1 = generateTempCrateId();
        const id2 = generateTempCrateId();

        expect(id1).toMatch(/^temp-/);
        expect(id2).toMatch(/^temp-/);
        expect(id1).not.toBe(id2);
      });
    });

    describe('getPendingCount', () => {
      it('should return count of pending operations', () => {
        const { enqueueOperation, updateOperationStatus, getPendingCount } =
          useOfflineStore.getState();

        const id1 = enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Crate 1' });
        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Crate 2' });
        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Crate 3' });

        updateOperationStatus(id1, OPERATION_STATUS.FAILED);

        expect(getPendingCount()).toBe(2);
      });
    });

    describe('hasPendingOperations', () => {
      it('should return true when there are pending operations', () => {
        const { enqueueOperation, hasPendingOperations } = useOfflineStore.getState();

        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Test' });

        expect(hasPendingOperations()).toBe(true);
      });

      it('should return false when queue is empty', () => {
        const { hasPendingOperations } = useOfflineStore.getState();

        expect(hasPendingOperations()).toBe(false);
      });
    });

    describe('clearQueue', () => {
      it('should clear all operations and state', () => {
        const { enqueueOperation, mapLocalToServerId, clearQueue } =
          useOfflineStore.getState();

        enqueueOperation(OPERATION_TYPES.CREATE_CRATE, { name: 'Test' });
        mapLocalToServerId('temp-1', 'server-1');

        clearQueue();

        const state = useOfflineStore.getState();
        expect(state.operationQueue).toHaveLength(0);
        expect(state.idMapping).toEqual({});
        expect(state.conflicts).toHaveLength(0);
      });
    });
  });

  describe('Sync State', () => {
    describe('startSync / completeSync', () => {
      it('should set isSyncing to true on start', () => {
        const { startSync } = useOfflineStore.getState();

        startSync();

        expect(useOfflineStore.getState().isSyncing).toBe(true);
      });

      it('should set isSyncing to false on complete and update lastSyncAt', () => {
        const { startSync, completeSync } = useOfflineStore.getState();

        startSync();
        completeSync();

        const state = useOfflineStore.getState();
        expect(state.isSyncing).toBe(false);
        expect(state.lastSyncAt).toBeDefined();
        expect(typeof state.lastSyncAt).toBe('number');
      });
    });

    describe('setSyncProgress', () => {
      it('should update sync progress', () => {
        const { startSync, setSyncProgress } = useOfflineStore.getState();

        startSync();
        setSyncProgress(3, 10);

        const { syncProgress } = useOfflineStore.getState();
        expect(syncProgress.current).toBe(3);
        expect(syncProgress.total).toBe(10);
      });
    });
  });
});
