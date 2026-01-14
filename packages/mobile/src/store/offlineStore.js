import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Operation Types
export const OPERATION_TYPES = {
  CREATE_CRATE: 'CREATE_CRATE',
  ADD_TRACKS: 'ADD_TRACKS',
  REMOVE_TRACK: 'REMOVE_TRACK',
  DELETE_CRATE: 'DELETE_CRATE',
};

// Operation Status
export const OPERATION_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  CONFLICT: 'conflict',
  FAILED: 'failed',
  COMPLETED: 'completed',
};

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Generate temporary crate ID
export const generateTempCrateId = () => `temp-${generateId()}`;

const useOfflineStore = create(
  persist(
    (set, get) => ({
      // Queue of pending operations
      operationQueue: [],

      // Sync state
      isSyncing: false,
      lastSyncAt: null,
      syncProgress: { current: 0, total: 0 },

      // Conflicts
      conflicts: [],
      activeConflict: null,

      // Temporary ID mapping (local temp IDs -> server IDs)
      idMapping: {},

      // Local crate tracks storage (for tracks added while offline)
      // Maps crateId -> array of trackIds
      localCrateTracks: {},

      // Server crate tracks cache (for offline viewing of existing crates)
      // Maps crateId -> array of trackIds loaded from server
      serverCrateTracks: {},

      // Queue management actions
      enqueueOperation: (type, payload) => {
        const operation = {
          id: generateId(),
          type,
          payload,
          status: OPERATION_STATUS.PENDING,
          createdAt: Date.now(),
          retryCount: 0,
          errorMessage: null,
        };

        set((state) => ({
          operationQueue: [...state.operationQueue, operation],
        }));

        return operation.id;
      },

      dequeueOperation: (operationId) => {
        set((state) => ({
          operationQueue: state.operationQueue.filter((op) => op.id !== operationId),
        }));
      },

      updateOperationStatus: (operationId, status, errorMessage = null) => {
        set((state) => ({
          operationQueue: state.operationQueue.map((op) =>
            op.id === operationId
              ? {
                  ...op,
                  status,
                  errorMessage,
                  retryCount: status === OPERATION_STATUS.PENDING ? op.retryCount + 1 : op.retryCount,
                }
              : op
          ),
        }));
      },

      // Sync state actions
      startSync: () => {
        set({ isSyncing: true, syncProgress: { current: 0, total: 0 } });
      },

      completeSync: () => {
        set({
          isSyncing: false,
          lastSyncAt: Date.now(),
          syncProgress: { current: 0, total: 0 },
        });
      },

      setSyncProgress: (current, total) => {
        set({ syncProgress: { current, total } });
      },

      // Conflict management
      addConflict: (conflict) => {
        const conflictWithId = {
          ...conflict,
          id: conflict.id || generateId(),
          resolvedAt: null,
          resolution: null,
        };

        set((state) => ({
          conflicts: [...state.conflicts, conflictWithId],
          // Set as active if no current active conflict
          activeConflict: state.activeConflict || conflictWithId,
        }));
      },

      resolveConflict: (conflictId, resolution) => {
        set((state) => {
          const updatedConflicts = state.conflicts.map((c) =>
            c.id === conflictId
              ? { ...c, resolvedAt: Date.now(), resolution }
              : c
          );

          // Remove resolved conflict and set next active
          const remainingConflicts = updatedConflicts.filter((c) => !c.resolvedAt);
          const nextActive = remainingConflicts.find((c) => !c.resolvedAt) || null;

          return {
            conflicts: remainingConflicts,
            activeConflict: nextActive,
          };
        });
      },

      setActiveConflict: (conflict) => {
        set({ activeConflict: conflict });
      },

      clearConflicts: () => {
        set({ conflicts: [], activeConflict: null });
      },

      // ID mapping for temp IDs -> server IDs
      mapLocalToServerId: (localId, serverId) => {
        set((state) => ({
          idMapping: {
            ...state.idMapping,
            [localId]: serverId,
          },
        }));
      },

      getServerId: (localId) => {
        const { idMapping } = get();
        return idMapping[localId] || null;
      },

      clearIdMapping: (localId) => {
        set((state) => {
          const newMapping = { ...state.idMapping };
          delete newMapping[localId];
          return { idMapping: newMapping };
        });
      },

      // Local crate tracks management (for offline crate viewing)
      addLocalCrateTracks: (crateId, trackIds) => {
        const { localCrateTracks } = get();
        const existing = localCrateTracks[crateId] || [];
        set({
          localCrateTracks: {
            ...localCrateTracks,
            [crateId]: [...existing, ...trackIds],
          },
        });
      },

      removeLocalCrateTrack: (crateId, trackId) => {
        const { localCrateTracks } = get();
        const existing = localCrateTracks[crateId] || [];
        set({
          localCrateTracks: {
            ...localCrateTracks,
            [crateId]: existing.filter((id) => id !== trackId),
          },
        });
      },

      getLocalCrateTracks: (crateId) => {
        return get().localCrateTracks[crateId] || [];
      },

      clearLocalCrate: (crateId) => {
        set((state) => {
          const { [crateId]: removed, ...rest } = state.localCrateTracks;
          return { localCrateTracks: rest };
        });
      },

      // Server crate tracks cache management (for offline viewing of existing crates)
      cacheAllServerCrateTracks: (cratesWithTrackIds) => {
        const mapping = {};
        cratesWithTrackIds.forEach((crate) => {
          if (crate.trackIds && crate.trackIds.length > 0) {
            mapping[crate.id] = crate.trackIds;
          }
        });
        set({ serverCrateTracks: mapping });
      },

      updateServerCrateCache: (crateId, trackIds) => {
        set((state) => ({
          serverCrateTracks: {
            ...state.serverCrateTracks,
            [crateId]: trackIds,
          },
        }));
      },

      clearServerCrateCache: (crateId) => {
        set((state) => {
          const { [crateId]: removed, ...rest } = state.serverCrateTracks;
          return { serverCrateTracks: rest };
        });
      },

      // Get cached track IDs for a crate (merges server cache + local additions)
      getCachedCrateTracks: (crateId) => {
        const { localCrateTracks, serverCrateTracks } = get();
        const serverTracks = serverCrateTracks[crateId] || [];
        const localTracks = localCrateTracks[crateId] || [];
        // Merge and dedupe: server cache + any tracks added while offline
        return [...new Set([...serverTracks, ...localTracks])];
      },

      // Utility getters
      getPendingCount: () => {
        const { operationQueue } = get();
        return operationQueue.filter((op) => op.status === OPERATION_STATUS.PENDING).length;
      },

      getPendingOperations: () => {
        const { operationQueue } = get();
        return operationQueue.filter((op) => op.status === OPERATION_STATUS.PENDING);
      },

      getFailedOperations: () => {
        const { operationQueue } = get();
        return operationQueue.filter((op) => op.status === OPERATION_STATUS.FAILED);
      },

      hasConflicts: () => {
        const { conflicts } = get();
        return conflicts.length > 0;
      },

      hasPendingOperations: () => {
        return get().getPendingCount() > 0;
      },

      // Clear all queued operations
      clearQueue: () => {
        set({
          operationQueue: [],
          conflicts: [],
          activeConflict: null,
          idMapping: {},
        });
      },

      // Retry failed operations
      retryFailedOperations: () => {
        set((state) => ({
          operationQueue: state.operationQueue.map((op) =>
            op.status === OPERATION_STATUS.FAILED
              ? { ...op, status: OPERATION_STATUS.PENDING, errorMessage: null }
              : op
          ),
        }));
      },
    }),
    {
      name: 'recrate-offline-queue',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist everything except transient sync state
      partialize: (state) => ({
        operationQueue: state.operationQueue,
        conflicts: state.conflicts,
        idMapping: state.idMapping,
        lastSyncAt: state.lastSyncAt,
        localCrateTracks: state.localCrateTracks,
        serverCrateTracks: state.serverCrateTracks,
      }),
      // v2: Added serverCrateTracks for offline crate viewing
      version: 2,
      onRehydrateStorage: () => (state, error) => {
        if (state) {
          // Reset syncing state on rehydration (app restart)
          if (state.isSyncing) {
            state.isSyncing = false;
          }
        }
      },
    }
  )
);

export default useOfflineStore;
