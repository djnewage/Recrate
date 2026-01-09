import useOfflineStore, { OPERATION_TYPES, OPERATION_STATUS } from '../store/offlineStore';
import { useConnectionStore } from '../store/connectionStore';
import useStore from '../store/useStore';
import apiService from './api';

/**
 * SyncService handles processing the offline operation queue,
 * detecting conflicts, and resolving them with user input.
 */

const MAX_RETRIES = 3;

/**
 * Main sync function - processes entire pending queue
 */
export async function syncQueue() {
  const offlineStore = useOfflineStore.getState();
  const connectionStore = useConnectionStore.getState();

  const { operationQueue, startSync, completeSync, setSyncProgress } = offlineStore;
  const { isConnected, serverURL } = connectionStore;

  // Don't sync if not connected
  if (!isConnected) {
    console.log('[SyncService] Not connected, skipping sync');
    return { success: false, reason: 'not_connected' };
  }

  // Don't sync if no server URL configured
  if (!serverURL) {
    console.log('[SyncService] No server URL configured, skipping sync');
    return { success: false, reason: 'no_server_url' };
  }

  const pendingOps = operationQueue.filter((op) => op.status === OPERATION_STATUS.PENDING);

  if (pendingOps.length === 0) {
    console.log('[SyncService] No pending operations to sync');
    return { success: true, synced: 0 };
  }

  console.log('[SyncService] Starting sync with', pendingOps.length, 'pending operations');
  startSync();

  let syncedCount = 0;
  let conflictCount = 0;
  let failedCount = 0;

  // Process operations in order (FIFO)
  // Note: CREATE_CRATE operations should naturally come before ADD_TRACKS for the same crate
  for (let i = 0; i < pendingOps.length; i++) {
    setSyncProgress(i + 1, pendingOps.length);

    const result = await processOperation(pendingOps[i]);

    if (result.success) {
      syncedCount++;
    } else if (result.conflict) {
      conflictCount++;
    } else {
      failedCount++;
    }

    // If we hit a conflict, stop processing to let user resolve it
    if (result.conflict) {
      console.log('[SyncService] Conflict detected, pausing sync for resolution');
      break;
    }
  }

  completeSync();

  console.log('[SyncService] Sync complete:', { syncedCount, conflictCount, failedCount });

  return {
    success: conflictCount === 0 && failedCount === 0,
    synced: syncedCount,
    conflicts: conflictCount,
    failed: failedCount,
  };
}

/**
 * Process a single operation
 */
async function processOperation(operation) {
  const offlineStore = useOfflineStore.getState();
  const { updateOperationStatus, addConflict, mapLocalToServerId, dequeueOperation } = offlineStore;

  console.log('[SyncService] Processing operation:', operation.type, operation.id);

  updateOperationStatus(operation.id, OPERATION_STATUS.SYNCING);

  try {
    // Check for conflicts before applying (for operations on existing crates)
    const conflict = await detectConflict(operation);
    if (conflict) {
      addConflict(conflict);
      updateOperationStatus(operation.id, OPERATION_STATUS.CONFLICT);
      return { success: false, conflict: true };
    }

    // Execute the operation
    const result = await executeOperation(operation);

    // Map local ID to server ID for create operations
    if (operation.type === OPERATION_TYPES.CREATE_CRATE && result?.crate?.id) {
      mapLocalToServerId(operation.payload.localCrateId, result.crate.id);
      // Clean up local crate tracks storage for the temp ID
      offlineStore.clearLocalCrate(operation.payload.localCrateId);
      console.log('[SyncService] Mapped temp ID:', operation.payload.localCrateId, '→', result.crate.id);
    }

    // Remove from queue on success
    dequeueOperation(operation.id);

    return { success: true };
  } catch (error) {
    return handleOperationError(operation, error);
  }
}

/**
 * Detect if there's a conflict for this operation
 */
async function detectConflict(operation) {
  // Skip conflict detection for new crate creation
  if (operation.type === OPERATION_TYPES.CREATE_CRATE) {
    return null;
  }

  // Skip if no server version was captured (can't detect conflicts)
  if (!operation.payload.serverVersion) {
    return null;
  }

  const offlineStore = useOfflineStore.getState();
  const { getServerId } = offlineStore;

  // Resolve the crate ID
  const crateId = getServerId(operation.payload.crateId) || operation.payload.crateId;

  try {
    const serverCrate = await apiService.getCrate(crateId);

    // Crate was deleted on server
    if (!serverCrate) {
      return {
        operationId: operation.id,
        crateId,
        crateName: 'Unknown',
        localVersion: { lastModified: operation.payload.serverVersion },
        serverVersion: null,
        conflictType: 'CRATE_DELETED',
      };
    }

    // Check if crate was modified after our operation was queued
    if (serverCrate.lastModified && serverCrate.lastModified > operation.payload.serverVersion) {
      return {
        operationId: operation.id,
        crateId,
        crateName: serverCrate.name,
        localVersion: {
          trackCount: operation.payload.expectedTrackCount,
          lastModified: operation.payload.serverVersion,
        },
        serverVersion: {
          trackCount: serverCrate.tracks?.length || serverCrate.trackCount || 0,
          lastModified: serverCrate.lastModified,
        },
        conflictType: 'CRATE_MODIFIED',
      };
    }

    return null;
  } catch (error) {
    if (error.response?.status === 404) {
      return {
        operationId: operation.id,
        crateId,
        crateName: 'Unknown',
        localVersion: { lastModified: operation.payload.serverVersion },
        serverVersion: null,
        conflictType: 'CRATE_DELETED',
      };
    }
    // For other errors, skip conflict detection and let the operation fail normally
    console.error('[SyncService] Error during conflict detection:', error);
    return null;
  }
}

/**
 * Execute operation against API
 */
async function executeOperation(operation) {
  const offlineStore = useOfflineStore.getState();
  const { getServerId } = offlineStore;

  // Resolve any temp IDs to server IDs
  let crateId = operation.payload.crateId;
  if (crateId && crateId.startsWith('temp-')) {
    crateId = getServerId(crateId) || crateId;
  }

  switch (operation.type) {
    case OPERATION_TYPES.CREATE_CRATE: {
      const { name, color, parentId } = operation.payload;
      // Resolve parent ID if it's a temp ID
      const resolvedParentId = parentId && parentId.startsWith('temp-')
        ? getServerId(parentId)
        : parentId;
      const result = await apiService.createCrate(name, color, resolvedParentId);
      return result;
    }

    case OPERATION_TYPES.ADD_TRACKS: {
      const { trackIds } = operation.payload;
      const result = await apiService.addTracksToCrate(crateId, trackIds);
      return result;
    }

    case OPERATION_TYPES.REMOVE_TRACK: {
      const { trackId } = operation.payload;
      const result = await apiService.removeTrackFromCrate(crateId, trackId);
      return result;
    }

    case OPERATION_TYPES.DELETE_CRATE: {
      const result = await apiService.deleteCrate(crateId);
      return result;
    }

    default:
      throw new Error(`Unknown operation type: ${operation.type}`);
  }
}

/**
 * Handle operation errors with retry logic
 */
function handleOperationError(operation, error) {
  const offlineStore = useOfflineStore.getState();
  const { updateOperationStatus, dequeueOperation } = offlineStore;

  console.error('[SyncService] Operation failed:', operation.type, error.message);

  // Check for specific error types
  if (error.response?.status === 404) {
    // Resource no longer exists - remove from queue
    console.log('[SyncService] Resource not found, removing operation from queue');
    dequeueOperation(operation.id);
    return { success: false, removed: true };
  }

  if (error.response?.status === 409) {
    // Conflict from server
    updateOperationStatus(operation.id, OPERATION_STATUS.CONFLICT, error.message);
    return { success: false, conflict: true };
  }

  // Check retry count
  if (operation.retryCount < MAX_RETRIES) {
    // Mark as pending to retry later
    updateOperationStatus(operation.id, OPERATION_STATUS.PENDING);
    console.log('[SyncService] Will retry operation later, attempt:', operation.retryCount + 1);
    return { success: false, willRetry: true };
  }

  // Max retries exceeded - mark as failed
  updateOperationStatus(operation.id, OPERATION_STATUS.FAILED, error.message);
  console.log('[SyncService] Operation failed after max retries');
  return { success: false, failed: true };
}

/**
 * Apply conflict resolution based on user choice
 */
export async function applyConflictResolution(conflictId, resolution) {
  const offlineStore = useOfflineStore.getState();
  const mainStore = useStore.getState();

  const { conflicts, resolveConflict, operationQueue, dequeueOperation } = offlineStore;

  const conflict = conflicts.find((c) => c.id === conflictId);
  if (!conflict) {
    console.error('[SyncService] Conflict not found:', conflictId);
    return false;
  }

  const operation = operationQueue.find((op) => op.id === conflict.operationId);
  if (!operation) {
    console.error('[SyncService] Operation not found for conflict:', conflict.operationId);
    resolveConflict(conflictId, resolution);
    return false;
  }

  console.log('[SyncService] Applying resolution:', resolution, 'for conflict:', conflictId);

  try {
    switch (resolution) {
      case 'LOCAL':
        // Force-push local changes (re-attempt the operation)
        offlineStore.getState().updateOperationStatus(operation.id, OPERATION_STATUS.PENDING);
        // Re-process the operation
        await processOperation({
          ...operation,
          status: OPERATION_STATUS.PENDING,
          // Clear server version to skip conflict detection on retry
          payload: { ...operation.payload, serverVersion: null },
        });
        break;

      case 'SERVER':
        // Discard local changes - remove operation from queue
        dequeueOperation(conflict.operationId);
        // Refresh the crate from server
        await refreshCrateFromServer(conflict.crateId);
        break;

      case 'MERGE':
        // Attempt to merge (for ADD_TRACKS conflicts)
        if (operation.type === OPERATION_TYPES.ADD_TRACKS) {
          await mergeTrackAdditions(conflict, operation);
        } else {
          // For other operations, fall back to LOCAL behavior
          offlineStore.getState().updateOperationStatus(operation.id, OPERATION_STATUS.PENDING);
          await processOperation({
            ...operation,
            status: OPERATION_STATUS.PENDING,
            payload: { ...operation.payload, serverVersion: null },
          });
        }
        break;

      default:
        console.error('[SyncService] Unknown resolution type:', resolution);
        return false;
    }

    resolveConflict(conflictId, resolution);

    // Continue syncing remaining operations
    const { operationQueue: remainingOps } = useOfflineStore.getState();
    const hasPending = remainingOps.some((op) => op.status === OPERATION_STATUS.PENDING);
    if (hasPending) {
      // Continue sync after a brief delay
      setTimeout(() => syncQueue(), 500);
    }

    return true;
  } catch (error) {
    console.error('[SyncService] Error applying resolution:', error);
    return false;
  }
}

/**
 * Refresh crate data from server
 */
async function refreshCrateFromServer(crateId) {
  const mainStore = useStore.getState();

  try {
    // Reload crates list
    await mainStore.loadCrates();

    // If this crate is currently selected, reload its details
    if (mainStore.selectedCrate?.id === crateId) {
      await mainStore.loadCrate(crateId);
    }
  } catch (error) {
    console.error('[SyncService] Error refreshing crate from server:', error);
  }
}

/**
 * Merge track additions - add only tracks that don't exist on server
 */
async function mergeTrackAdditions(conflict, operation) {
  const offlineStore = useOfflineStore.getState();
  const { dequeueOperation } = offlineStore;

  try {
    // Get current server state
    const serverCrate = await apiService.getCrate(conflict.crateId);
    const serverTrackIds = new Set((serverCrate.tracks || []).map((t) => t.id));

    // Filter to only tracks not already on server
    const newTrackIds = operation.payload.trackIds.filter((id) => !serverTrackIds.has(id));

    if (newTrackIds.length > 0) {
      // Add only the new tracks
      await apiService.addTracksToCrate(conflict.crateId, newTrackIds);
      console.log('[SyncService] Merged', newTrackIds.length, 'new tracks');
    } else {
      console.log('[SyncService] No new tracks to merge, all already exist on server');
    }

    // Remove the operation from queue
    dequeueOperation(operation.id);

    // Refresh local state
    await refreshCrateFromServer(conflict.crateId);
  } catch (error) {
    console.error('[SyncService] Error merging track additions:', error);
    throw error;
  }
}

/**
 * Sync a single operation immediately (for manual sync button)
 */
export async function syncSingleOperation(operationId) {
  const offlineStore = useOfflineStore.getState();
  const operation = offlineStore.operationQueue.find((op) => op.id === operationId);

  if (!operation) {
    console.error('[SyncService] Operation not found:', operationId);
    return false;
  }

  return processOperation(operation);
}

/**
 * Check if sync is needed
 */
export function isSyncNeeded() {
  const { operationQueue } = useOfflineStore.getState();
  return operationQueue.some((op) => op.status === OPERATION_STATUS.PENDING);
}

export default {
  syncQueue,
  applyConflictResolution,
  syncSingleOperation,
  isSyncNeeded,
};
