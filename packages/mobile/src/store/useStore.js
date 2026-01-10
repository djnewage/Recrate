import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer, { RepeatMode } from 'react-native-track-player';
import apiService from '../services/api';
import * as TrackPlayerService from '../services/TrackPlayerService';
import { normalizeTitle, normalizeArtist } from '../services/TrackMatchingService';
import useOfflineStore, { OPERATION_TYPES, generateTempCrateId } from './offlineStore';
import { useConnectionStore } from './connectionStore';

// Skip cooldown to prevent rapid track changes that corrupt TrackPlayer state
let lastSkipTime = 0;
const SKIP_COOLDOWN = 800; // 800ms minimum between skips

/**
 * Pre-normalize tracks for faster search matching
 * Adds _normalizedTitle and _normalizedArtist fields
 */
const preNormalizeTracks = (tracks) => {
  return tracks.map(track => ({
    ...track,
    _normalizedTitle: normalizeTitle(track.title),
    _normalizedArtist: normalizeArtist(track.artist),
  }));
};

const useStore = create(
  persist(
    (set, get) => ({
  // Disclaimer state (shown on first launch)
  hasAcceptedDisclaimer: false,

  // AI Usage tracking (BYOK - Bring Your Own Key)
  // Users get 5 free AI curations, then need their own API key
  aiUsageCount: 0,
  aiUsageResetDate: null, // Optional: for monthly reset

  // Library state
  tracks: [],
  selectedTracks: [],
  isLoadingLibrary: false,
  libraryError: null,

  // Indexing state
  isIndexing: false,
  indexingStatus: null,
  indexingMessage: null,
  indexingPollInterval: null,

  // Pagination state
  // Note: limit=0 means "load all tracks at once"
  libraryPagination: {
    total: 0,
    limit: 0, // 0 = load all tracks at once (no pagination)
    offset: 0,
    hasMore: false,
  },

  // Crates state
  crates: [],
  crateTree: [], // Nested tree structure for display
  expandedCrates: {}, // Track which crates are expanded { [id]: boolean }
  selectedCrate: null,
  isLoadingCrates: false,
  cratesError: null,

  // Player state
  currentTrack: null,
  isPlaying: false,
  isBuffering: false,
  playerError: null,
  queue: [],
  currentQueueIndex: -1,
  repeatMode: 'off', // 'off', 'track', 'queue'
  shuffleEnabled: false,
  originalQueue: null, // For restoring queue order when shuffle is disabled
  originalQueueIndex: null,

  // Search state
  searchQuery: '',
  searchResults: [],
  isSearching: false,

  // Filter state
  filters: {
    bpmRange: { min: 60, max: 180 },
    selectedKeys: [],
    selectedGenres: [],
  },
  isFilterDrawerOpen: false,
  isFilterActive: false,

  // Track identification state
  isIdentifyModalVisible: false,

  // Disclaimer actions
  acceptDisclaimer: () => set({ hasAcceptedDisclaimer: true }),

  // AI usage actions
  incrementAIUsage: () => {
    const { aiUsageCount } = get();
    set({ aiUsageCount: aiUsageCount + 1 });
  },

  resetAIUsage: () => {
    set({ aiUsageCount: 0, aiUsageResetDate: new Date().toISOString() });
  },

  // Check if user has free uses remaining (5 free uses)
  hasFreeTierRemaining: () => {
    const { aiUsageCount } = get();
    return aiUsageCount < 5;
  },

  getRemainingFreeUses: () => {
    const { aiUsageCount } = get();
    return Math.max(0, 5 - aiUsageCount);
  },

  // Library actions
  loadLibrary: async (params = {}, append = false) => {
    set({ isLoadingLibrary: true, libraryError: null });
    try {
      const { libraryPagination } = get();
      const requestParams = {
        limit: libraryPagination.limit,
        offset: append ? libraryPagination.offset : 0,
        ...params,
      };

      console.log('[loadLibrary] Request params:', requestParams, 'append:', append);

      const data = await apiService.getLibrary(requestParams);

      console.log('[loadLibrary] Response:', {
        tracksReceived: data.tracks?.length,
        pagination: data.pagination,
        indexing: data.indexing,
      });

      // Check if backend is indexing
      if (data.indexing) {
        set({
          isIndexing: true,
          indexingStatus: data.status,
          indexingMessage: data.message,
          tracks: [],
          isLoadingLibrary: false,
          libraryPagination: {
            total: 0,
            limit: 0, // 0 = load all tracks
            offset: 0,
            hasMore: false,
          },
        });

        // Start polling for indexing status
        get().startIndexingPoll();
        return;
      }

      // Normal response - indexing complete
      // Deduplicate tracks when appending to prevent duplicate key errors
      let finalTracks = data.tracks;
      if (append) {
        const existingTracks = get().tracks;
        const existingIds = new Set(existingTracks.map(t => t.id));
        const newTracks = data.tracks.filter(t => !existingIds.has(t.id));
        finalTracks = [...existingTracks, ...newTracks];
      }

      // Additional safety deduplication to ensure no duplicate keys
      // This catches any edge cases where backend returns duplicates
      const deduplicatedTracks = Array.from(
        new Map(finalTracks.map(t => [t.id, t])).values()
      );

      // Pre-normalize tracks for faster search matching
      // Only normalize new tracks (ones without _normalizedTitle)
      const uniqueTracks = deduplicatedTracks.map(track =>
        track._normalizedTitle ? track : {
          ...track,
          _normalizedTitle: normalizeTitle(track.title),
          _normalizedArtist: normalizeArtist(track.artist),
        }
      );

      // Calculate total from API or track count
      const total = data.pagination?.total || 0;
      // Use our configured limit, not what API returns (it might default to 1000)
      const limit = libraryPagination.limit;

      // Use the actual loaded track count as the offset for next pagination
      // This is more reliable than relying on API-returned offset
      const loadedCount = uniqueTracks.length;

      // Determine if there are more tracks to load
      // Use API's hasMore as primary indicator, fall back to count comparison
      // If API says hasMore: false, trust it (server knows best)
      const apiHasMore = data.pagination?.hasMore;
      const hasMore = apiHasMore !== undefined ? apiHasMore : (total > 0 && loadedCount < total);

      const newPagination = {
        total,
        limit,
        // Track how many tracks we've loaded - this is used to calculate next offset
        offset: loadedCount,
        hasMore,
      };

      console.log('[loadLibrary] Setting state:', {
        trackCount: uniqueTracks.length,
        pagination: newPagination,
      });

      set({
        tracks: uniqueTracks,
        isLoadingLibrary: false,
        isIndexing: false,
        indexingStatus: null,
        indexingMessage: null,
        libraryPagination: newPagination,
      });

      // Stop polling if it was running
      get().stopIndexingPoll();
    } catch (error) {
      console.error('[loadLibrary] Error:', error.message);
      set({ libraryError: error.message, isLoadingLibrary: false });
    }
  },

  checkIndexingStatus: async () => {
    try {
      const status = await apiService.getLibraryStatus();

      if (status.isIndexing && !status.isComplete) {
        // Still indexing - update status
        set({
          isIndexing: true,
          indexingStatus: status,
          indexingMessage: status.progress?.message || 'Indexing library...',
        });
      } else if (status.isComplete) {
        // Indexing complete - reload library
        set({
          isIndexing: false,
          indexingStatus: null,
          indexingMessage: null,
        });

        // Stop polling
        get().stopIndexingPoll();

        // Reload library to get tracks
        await get().loadLibrary();
      }
    } catch (error) {
      console.error('Error checking indexing status:', error);
    }
  },

  startIndexingPoll: () => {
    // Clear any existing interval
    get().stopIndexingPoll();

    // Check status every 2 seconds
    const intervalId = setInterval(() => {
      get().checkIndexingStatus();
    }, 2000);

    set({ indexingPollInterval: intervalId });
  },

  stopIndexingPoll: () => {
    const { indexingPollInterval } = get();
    if (indexingPollInterval) {
      clearInterval(indexingPollInterval);
      set({ indexingPollInterval: null });
    }
  },

  loadMoreTracks: async () => {
    const { libraryPagination, isLoadingLibrary, tracks } = get();

    console.log('[loadMoreTracks] Called. State:', {
      isLoadingLibrary,
      hasMore: libraryPagination.hasMore,
      offset: libraryPagination.offset,
      total: libraryPagination.total,
      currentTrackCount: tracks.length,
    });

    // Don't load if already loading or no more tracks
    if (isLoadingLibrary) {
      console.log('[loadMoreTracks] Skipping - already loading');
      return;
    }

    if (!libraryPagination.hasMore) {
      console.log('[loadMoreTracks] Skipping - no more tracks');
      return;
    }

    // offset now represents total tracks loaded, which IS the next offset to request
    // e.g., if we've loaded 2000 tracks, request offset=2000 to get tracks 2001+
    const nextOffset = libraryPagination.offset;

    console.log('[loadMoreTracks] Loading more with offset:', nextOffset);

    // Pass the nextOffset as a parameter to loadLibrary
    // This will override the offset from state and ensure proper pagination
    await get().loadLibrary({ offset: nextOffset }, true);

    console.log('[loadMoreTracks] Done. New track count:', get().tracks.length);
  },

  resetLibrary: () => {
    set({
      tracks: [],
      libraryPagination: {
        total: 0,
        limit: 0, // 0 = load all tracks
        offset: 0,
        hasMore: false,
      },
    });
  },

  // Helper to build tree from flat crate list
  buildCrateTree: (flatCrates) => {
    // Create a map for quick lookup
    const crateMap = new Map();
    flatCrates.forEach(crate => {
      crateMap.set(crate.id, { ...crate, children: [] });
    });

    const tree = [];

    // First pass: Create virtual parent nodes for orphaned subcrates
    // This handles the case where a subcrate exists but the parent folder has no .crate file
    flatCrates.forEach(crate => {
      if (crate.parentId && !crateMap.has(crate.parentId)) {
        // Extract parent name from parentPath (e.g., "ParentCrate%%SubParent" -> "SubParent")
        const parentParts = crate.parentPath?.split('%%') || [];
        const parentName = parentParts[parentParts.length - 1] || 'Unknown';

        // Create virtual parent node
        const virtualParent = {
          id: crate.parentId,
          name: parentName,
          fullPath: crate.parentPath,
          parentId: null, // Virtual parents are at root for simplicity
          parentPath: null,
          depth: 0,
          trackCount: 0,
          children: [],
          isVirtual: true, // Mark as virtual so we can style differently if needed
        };
        crateMap.set(crate.parentId, virtualParent);
        tree.push(virtualParent);
      }
    });

    // Second pass: Build tree structure
    flatCrates.forEach(crate => {
      const crateWithChildren = crateMap.get(crate.id);
      if (crate.parentId && crateMap.has(crate.parentId)) {
        // Add to parent's children
        crateMap.get(crate.parentId).children.push(crateWithChildren);
      } else if (!crate.parentId) {
        // Root level crate (no parent)
        tree.push(crateWithChildren);
      }
      // Note: crates with parentId that now have virtual parents are handled above
    });

    // Sort children at each level
    const sortChildren = (nodes) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      nodes.forEach(node => {
        if (node.children.length > 0) {
          sortChildren(node.children);
        }
      });
    };
    sortChildren(tree);

    return tree;
  },

  // Crates actions
  loadCrates: async () => {
    console.log('[loadCrates] Starting...');
    const { isConnected } = useConnectionStore.getState();
    const { crates: cachedCrates } = get();

    // If offline and we have cached crates, don't try API call
    if (!isConnected && cachedCrates.length > 0) {
      console.log('[loadCrates] Offline with', cachedCrates.length, 'cached crates, skipping API call');
      set({ isLoadingCrates: false, cratesError: null });
      return;
    }

    set({ isLoadingCrates: true, cratesError: null });
    try {
      const data = await apiService.getCrates();
      console.log('[loadCrates] Received', data.crates?.length, 'crates from server');

      // Cache all track ID mappings for offline use
      useOfflineStore.getState().cacheAllServerCrateTracks(data.crates);

      // Strip trackIds from crates before storing (already cached in offlineStore)
      const cratesMetadata = data.crates.map(({ trackIds, ...rest }) => rest);

      const crateTree = get().buildCrateTree(cratesMetadata);
      set({
        crates: cratesMetadata,
        crateTree: crateTree,
        isLoadingCrates: false,
      });
    } catch (error) {
      console.error('[loadCrates] Error:', error.message);
      // If we have cached crates, don't show error - just use cached data
      if (cachedCrates.length > 0) {
        console.log('[loadCrates] Using', cachedCrates.length, 'cached crates due to error');
        set({ isLoadingCrates: false, cratesError: null });
      } else {
        set({ cratesError: error.message, isLoadingCrates: false });
      }
    }
  },

  loadCrate: async (crateId) => {
    const { crates, tracks } = get();

    // Check if this is a local/offline crate
    const isLocalCrate = crateId.startsWith('temp-');
    const localCrate = crates.find((c) => c.id === crateId);

    if (isLocalCrate && localCrate) {
      // Load from local state instead of API
      const trackIds = useOfflineStore.getState().getLocalCrateTracks(crateId);
      const crateTracks = trackIds
        .map((id) => tracks.find((t) => t.id === id))
        .filter(Boolean);

      set({
        selectedCrate: { ...localCrate, tracks: crateTracks },
        isLoadingCrates: false,
        cratesError: null,
      });
      console.log('[loadCrate] Loaded local crate:', crateId, 'with', crateTracks.length, 'tracks');
      return;
    }

    // Otherwise, try API call with offline fallback
    set({ isLoadingCrates: true, cratesError: null });
    try {
      const crate = await apiService.getCrate(crateId);

      // Update cache with latest track IDs (in case crate was modified on server)
      if (crate.tracks && crate.tracks.length > 0) {
        useOfflineStore.getState().updateServerCrateCache(
          crateId,
          crate.tracks.map((t) => t.id)
        );
      }

      set({ selectedCrate: crate, isLoadingCrates: false });
    } catch (error) {
      console.error('[loadCrate] API error:', error.message);

      // If API fails and we have cached crate data, use it
      if (localCrate) {
        // Get cached track IDs (merges server cache + any tracks added while offline)
        const cachedTrackIds = useOfflineStore.getState().getCachedCrateTracks(crateId);
        const cachedTracks = cachedTrackIds
          .map((id) => tracks.find((t) => t.id === id))
          .filter(Boolean);

        set({
          selectedCrate: {
            ...localCrate,
            tracks: cachedTracks,
          },
          isLoadingCrates: false,
          cratesError: null,
        });
        console.log('[loadCrate] Using cached crate:', crateId, 'with', cachedTracks.length, 'tracks');
      } else {
        set({ cratesError: error.message, isLoadingCrates: false });
      }
    }
  },

  createCrate: async (name, color, parentId = null) => {
    const { isConnected } = useConnectionStore.getState();
    const { enqueueOperation, getServerId } = useOfflineStore.getState();

    // Resolve parent ID if it's a temp ID
    const resolvedParentId = parentId ? (getServerId(parentId) || parentId) : null;

    if (!isConnected) {
      // Generate temporary local ID
      const tempId = generateTempCrateId();

      // Enqueue operation for later sync
      enqueueOperation(OPERATION_TYPES.CREATE_CRATE, {
        name,
        color,
        parentId: resolvedParentId,
        localCrateId: tempId,
      });

      // Optimistic UI update - add crate locally
      const { crates, buildCrateTree } = get();
      const newCrate = {
        id: tempId,
        name,
        color,
        parentId: resolvedParentId,
        trackCount: 0,
        isLocal: true, // Mark as pending sync
        lastModified: Date.now(),
      };

      const updatedCrates = [...crates, newCrate];
      set({
        crates: updatedCrates,
        crateTree: buildCrateTree(updatedCrates),
      });

      console.log('[useStore] Crate queued for offline sync:', tempId);
      return true;
    }

    // Online mode - original behavior
    try {
      await apiService.createCrate(name, color, resolvedParentId);
      await get().loadCrates();
      return true;
    } catch (error) {
      set({ cratesError: error.message });
      return false;
    }
  },

  toggleCrateExpanded: (crateId) => {
    const { expandedCrates } = get();
    set({
      expandedCrates: {
        ...expandedCrates,
        [crateId]: !expandedCrates[crateId],
      },
    });
  },

  setCrateExpanded: (crateId, expanded) => {
    const { expandedCrates } = get();
    set({
      expandedCrates: {
        ...expandedCrates,
        [crateId]: expanded,
      },
    });
  },

  addTracksToCrate: async (crateId, trackIds) => {
    const { isConnected } = useConnectionStore.getState();
    const { enqueueOperation, getServerId } = useOfflineStore.getState();

    // Resolve crate ID if it's a temp ID
    const resolvedCrateId = getServerId(crateId) || crateId;

    if (!isConnected) {
      // Capture current crate state for conflict detection
      const { crates, selectedCrate, tracks } = get();
      const crate = crates.find((c) => c.id === crateId);

      // Enqueue operation
      enqueueOperation(OPERATION_TYPES.ADD_TRACKS, {
        crateId: resolvedCrateId,
        trackIds,
        serverVersion: crate?.lastModified || null,
      });

      // Store track IDs locally for offline crate viewing
      useOfflineStore.getState().addLocalCrateTracks(crateId, trackIds);

      // Optimistic UI update - update selected crate if viewing it
      if (selectedCrate && selectedCrate.id === crateId) {
        const newTracks = trackIds
          .map((id) => tracks.find((t) => t.id === id))
          .filter(Boolean);

        set({
          selectedCrate: {
            ...selectedCrate,
            tracks: [...(selectedCrate.tracks || []), ...newTracks],
          },
        });
      }

      // Update crate track count in list
      const { crates: currentCrates, buildCrateTree } = get();
      const updatedCrates = currentCrates.map((c) =>
        c.id === crateId
          ? { ...c, trackCount: (c.trackCount || 0) + trackIds.length }
          : c
      );
      set({
        crates: updatedCrates,
        crateTree: buildCrateTree(updatedCrates),
      });

      console.log('[useStore] Add tracks queued for offline sync:', crateId, trackIds.length);
      return true;
    }

    // Online mode - original behavior
    try {
      await apiService.addTracksToCrate(resolvedCrateId, trackIds);
      await get().loadCrate(crateId);
      await get().loadCrates(); // Refresh the crates list to update track counts
      return true;
    } catch (error) {
      set({ cratesError: error.message });
      return false;
    }
  },

  removeTrackFromCrate: async (crateId, trackId) => {
    const { isConnected } = useConnectionStore.getState();
    const { enqueueOperation, getServerId } = useOfflineStore.getState();

    // Resolve crate ID if it's a temp ID
    const resolvedCrateId = getServerId(crateId) || crateId;

    if (!isConnected) {
      // Capture current crate state for conflict detection
      const { crates, selectedCrate } = get();
      const crate = crates.find((c) => c.id === crateId);

      // Enqueue operation
      enqueueOperation(OPERATION_TYPES.REMOVE_TRACK, {
        crateId: resolvedCrateId,
        trackId,
        serverVersion: crate?.lastModified || null,
      });

      // Remove track from local storage for offline crate viewing
      useOfflineStore.getState().removeLocalCrateTrack(crateId, trackId);

      // Optimistic UI update - remove from selected crate if viewing it
      if (selectedCrate && selectedCrate.id === crateId) {
        set({
          selectedCrate: {
            ...selectedCrate,
            tracks: (selectedCrate.tracks || []).filter((t) => t.id !== trackId),
          },
        });
      }

      // Update crate track count in list
      const { crates: currentCrates, buildCrateTree } = get();
      const updatedCrates = currentCrates.map((c) =>
        c.id === crateId
          ? { ...c, trackCount: Math.max(0, (c.trackCount || 0) - 1) }
          : c
      );
      set({
        crates: updatedCrates,
        crateTree: buildCrateTree(updatedCrates),
      });

      console.log('[useStore] Remove track queued for offline sync:', crateId, trackId);
      return true;
    }

    // Online mode - original behavior
    try {
      await apiService.removeTrackFromCrate(resolvedCrateId, trackId);
      await get().loadCrate(crateId);
      await get().loadCrates(); // Refresh the crates list to update track counts
      return true;
    } catch (error) {
      set({ cratesError: error.message });
      return false;
    }
  },

  deleteCrate: async (crateId) => {
    const { isConnected } = useConnectionStore.getState();
    const { enqueueOperation, getServerId, dequeueOperation, operationQueue } = useOfflineStore.getState();

    // Check if this is a local-only crate (temp ID)
    const isLocalOnly = crateId.startsWith('temp-');

    if (!isConnected) {
      if (isLocalOnly) {
        // If it's a local-only crate, just remove it and cancel any pending operations for it
        const pendingOps = operationQueue.filter(
          (op) => op.payload.localCrateId === crateId || op.payload.crateId === crateId
        );
        pendingOps.forEach((op) => dequeueOperation(op.id));
      } else {
        // Resolve crate ID and enqueue delete operation
        const resolvedCrateId = getServerId(crateId) || crateId;
        enqueueOperation(OPERATION_TYPES.DELETE_CRATE, {
          crateId: resolvedCrateId,
        });
      }

      // Optimistic UI update - remove crate from list
      const { crates, buildCrateTree } = get();
      const updatedCrates = crates.filter((c) => c.id !== crateId);
      set({
        crates: updatedCrates,
        crateTree: buildCrateTree(updatedCrates),
        selectedCrate: null,
      });

      console.log('[useStore] Delete crate queued for offline sync:', crateId);
      return true;
    }

    // Online mode - original behavior
    const resolvedCrateId = getServerId(crateId) || crateId;
    try {
      await apiService.deleteCrate(resolvedCrateId);
      await get().loadCrates(); // Refresh the crates list
      return true;
    } catch (error) {
      set({ cratesError: error.message });
      return false;
    }
  },

  // Helper to check if a crate is locally created (pending sync)
  isLocalCrate: (crateId) => {
    return crateId?.startsWith('temp-');
  },

  // Selection actions
  toggleTrackSelection: (trackId) => {
    const { selectedTracks } = get();
    if (selectedTracks.includes(trackId)) {
      set({ selectedTracks: selectedTracks.filter((id) => id !== trackId) });
    } else {
      set({ selectedTracks: [...selectedTracks, trackId] });
    }
  },

  clearSelection: () => {
    set({ selectedTracks: [] });
  },

  selectAll: () => {
    const { tracks } = get();
    set({ selectedTracks: tracks.map((t) => t.id) });
  },

  // Search actions - filter locally from loaded tracks
  search: (query) => {
    set({ searchQuery: query });

    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }

    const { tracks } = get();
    const lowerQuery = query.toLowerCase();

    const results = tracks.filter(track =>
      track.title?.toLowerCase().includes(lowerQuery) ||
      track.artist?.toLowerCase().includes(lowerQuery) ||
      track.album?.toLowerCase().includes(lowerQuery)
    );

    set({ searchResults: results });
  },

  clearSearch: () => {
    set({ searchQuery: '', searchResults: [] });
  },

  // Player actions
  playTrack: async (track) => {
    try {
      set({ playerError: null, isBuffering: true });

      const { queue } = get();

      // If there's already a queue, just play from it
      if (queue.length > 1) {
        const trackIndex = queue.findIndex(t => t.id === track.id);
        if (trackIndex >= 0) {
          await TrackPlayer.skip(trackIndex);
          await TrackPlayer.play();
          set({
            currentTrack: track,
            isPlaying: true,
            isBuffering: false,
            currentQueueIndex: trackIndex,
          });
          return;
        }
      }

      // Otherwise, play single track
      const success = await TrackPlayerService.playTrack(track);

      if (success) {
        set({
          currentTrack: track,
          isPlaying: true,
          isBuffering: false,
          queue: [track],
          currentQueueIndex: 0,
        });
      } else {
        set({
          playerError: 'Failed to play track',
          isBuffering: false,
        });
      }
    } catch (error) {
      console.error('Error playing track:', error);
      set({
        playerError: error.message,
        isPlaying: false,
        isBuffering: false,
      });
    }
  },

  pauseTrack: async () => {
    try {
      await TrackPlayer.pause();
      set({ isPlaying: false });
    } catch (error) {
      console.error('Error pausing track:', error);
    }
  },

  resumeTrack: async () => {
    try {
      await TrackPlayer.play();
      set({ isPlaying: true });
    } catch (error) {
      console.error('Error resuming track:', error);
    }
  },

  stopTrack: async () => {
    try {
      await TrackPlayer.reset();
      set({
        currentTrack: null,
        isPlaying: false,
        queue: [],
        currentQueueIndex: -1,
      });
    } catch (error) {
      console.error('Error stopping track:', error);
    }
  },

  seekTo: async (positionSeconds) => {
    try {
      await TrackPlayer.seekTo(positionSeconds);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  },

  playNext: async () => {
    try {
      // Throttle rapid skips to prevent TrackPlayer state corruption
      const now = Date.now();
      if (now - lastSkipTime < SKIP_COOLDOWN) {
        console.log('[playNext] Skip cooldown active, ignoring rapid skip');
        return;
      }
      lastSkipTime = now;

      const { queue, currentQueueIndex, repeatMode } = get();

      if (queue.length === 0) return;

      let nextIndex = currentQueueIndex + 1;

      // Handle end of queue
      if (nextIndex >= queue.length) {
        if (repeatMode === 'queue') {
          nextIndex = 0;
        } else {
          // End of queue
          set({ isPlaying: false });
          return;
        }
      }

      // Check if we need to replenish the TrackPlayer queue
      // (for large libraries with windowed loading)
      const tpQueue = await TrackPlayer.getQueue();
      const tpCurrentIndex = await TrackPlayer.getActiveTrackIndex();
      const REPLENISH_THRESHOLD = 20; // Add more tracks when this many left
      const TRACKS_TO_ADD = 100;

      if (tpCurrentIndex !== null && tpQueue.length > 0) {
        const remainingInTP = tpQueue.length - tpCurrentIndex - 1;

        if (remainingInTP < REPLENISH_THRESHOLD && nextIndex + remainingInTP < queue.length) {
          // Add more tracks from the full queue
          const startAddIndex = nextIndex + remainingInTP;
          const endAddIndex = Math.min(startAddIndex + TRACKS_TO_ADD, queue.length);
          const tracksToAdd = queue.slice(startAddIndex, endAddIndex);

          if (tracksToAdd.length > 0) {
            console.log(`[playNext] Replenishing queue: adding ${tracksToAdd.length} tracks (indices ${startAddIndex}-${endAddIndex})`);
            const formattedTracks = tracksToAdd.map(track =>
              TrackPlayerService.formatTrackForPlayer(track)
            );
            await TrackPlayer.add(formattedTracks);
          }
        }
      }

      await TrackPlayer.skipToNext();
      set({ currentQueueIndex: nextIndex });
    } catch (error) {
      console.error('Error playing next:', error);
    }
  },

  playPrevious: async () => {
    try {
      // Throttle rapid skips to prevent TrackPlayer state corruption
      const now = Date.now();
      if (now - lastSkipTime < SKIP_COOLDOWN) {
        console.log('[playPrevious] Skip cooldown active, ignoring rapid skip');
        return;
      }
      lastSkipTime = now;

      const { queue, currentQueueIndex } = get();

      if (queue.length === 0) return;

      let prevIndex = currentQueueIndex - 1;

      // Handle beginning of queue
      if (prevIndex < 0) {
        prevIndex = 0;
      }

      await TrackPlayer.skipToPrevious();
      set({ currentQueueIndex: prevIndex });
    } catch (error) {
      console.error('Error playing previous:', error);
    }
  },

  toggleRepeat: async () => {
    const { repeatMode } = get();
    const modes = ['off', 'queue', 'track'];
    const currentIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];

    // Set TrackPlayer repeat mode
    if (nextMode === 'track') {
      await TrackPlayer.setRepeatMode(RepeatMode.Track);
    } else if (nextMode === 'queue') {
      await TrackPlayer.setRepeatMode(RepeatMode.Queue);
    } else {
      await TrackPlayer.setRepeatMode(RepeatMode.Off);
    }

    set({ repeatMode: nextMode });
  },

  toggleShuffle: async () => {
    const { shuffleEnabled, queue, currentQueueIndex, currentTrack } = get();

    if (queue.length <= 1) {
      // No point shuffling with 0 or 1 track
      set({ shuffleEnabled: !shuffleEnabled });
      return;
    }

    if (!shuffleEnabled) {
      // Enabling shuffle: Fisher-Yates algorithm, keep current track at position 0
      const currentTrackInQueue = queue[currentQueueIndex];
      const otherTracks = queue.filter((_, i) => i !== currentQueueIndex);

      // Fisher-Yates shuffle
      for (let i = otherTracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
      }

      const shuffledQueue = [currentTrackInQueue, ...otherTracks];

      // Update TrackPlayer queue with windowing for large libraries
      try {
        await TrackPlayer.removeUpcomingTracks();

        // Apply same windowing logic as setQueue for large libraries
        const MAX_UPCOMING = 199; // Leave room for current track
        const upcomingShuffled = shuffledQueue.slice(1);
        const tracksToQueue = upcomingShuffled.length > MAX_UPCOMING
          ? upcomingShuffled.slice(0, MAX_UPCOMING)
          : upcomingShuffled;

        if (upcomingShuffled.length > MAX_UPCOMING) {
          console.log(`[toggleShuffle] Large library: queuing ${tracksToQueue.length} of ${upcomingShuffled.length} shuffled tracks`);
        }

        const upcomingTracks = tracksToQueue.map(track =>
          TrackPlayerService.formatTrackForPlayer(track)
        );
        await TrackPlayer.add(upcomingTracks);
      } catch (error) {
        console.error('Error updating TrackPlayer queue for shuffle:', error);
      }

      set({
        shuffleEnabled: true,
        queue: shuffledQueue,
        currentQueueIndex: 0,
        originalQueue: queue, // Store original order for unshuffle
        originalQueueIndex: currentQueueIndex,
      });
    } else {
      // Disabling shuffle: restore original order
      const { originalQueue, originalQueueIndex } = get();

      if (originalQueue && originalQueue.length > 0) {
        // Find current track in original queue
        const currentTrackIndex = originalQueue.findIndex(t => t.id === currentTrack?.id);
        const newIndex = currentTrackIndex >= 0 ? currentTrackIndex : originalQueueIndex || 0;

        // Update TrackPlayer queue back to original order with windowing
        try {
          await TrackPlayer.removeUpcomingTracks();

          // Apply same windowing logic as setQueue for large libraries
          const MAX_UPCOMING = 199; // Leave room for current track
          const upcomingOriginal = originalQueue.slice(newIndex + 1);
          const tracksToQueue = upcomingOriginal.length > MAX_UPCOMING
            ? upcomingOriginal.slice(0, MAX_UPCOMING)
            : upcomingOriginal;

          if (upcomingOriginal.length > MAX_UPCOMING) {
            console.log(`[toggleShuffle] Restoring: queuing ${tracksToQueue.length} of ${upcomingOriginal.length} tracks`);
          }

          const upcomingTracks = tracksToQueue.map(track =>
            TrackPlayerService.formatTrackForPlayer(track)
          );
          await TrackPlayer.add(upcomingTracks);
        } catch (error) {
          console.error('Error restoring TrackPlayer queue:', error);
        }

        set({
          shuffleEnabled: false,
          queue: originalQueue,
          currentQueueIndex: newIndex,
          originalQueue: null,
          originalQueueIndex: null,
        });
      } else {
        set({ shuffleEnabled: false });
      }
    }
  },

  setQueue: async (tracks, startIndex = 0) => {
    try {
      await TrackPlayer.reset();

      // For large libraries, only queue a window of tracks around the current position
      // This dramatically improves performance when starting playback
      const MAX_QUEUE_SIZE = 200; // Max tracks to queue at once
      const BUFFER_BEFORE = 50;   // Tracks before current position

      let queuedTracks = tracks;
      let adjustedIndex = startIndex;

      if (tracks.length > MAX_QUEUE_SIZE) {
        // Calculate window around current position
        const windowStart = Math.max(0, startIndex - BUFFER_BEFORE);
        const windowEnd = Math.min(tracks.length, windowStart + MAX_QUEUE_SIZE);
        queuedTracks = tracks.slice(windowStart, windowEnd);
        adjustedIndex = startIndex - windowStart;

        console.log(`[setQueue] Large library optimization: queuing ${queuedTracks.length} of ${tracks.length} tracks (window ${windowStart}-${windowEnd})`);
      }

      await TrackPlayerService.addTracksToQueue(queuedTracks);

      if (adjustedIndex > 0) {
        await TrackPlayer.skip(adjustedIndex);
      }

      // Start playback automatically
      await TrackPlayer.play();

      set({
        queue: tracks,  // Keep full playlist reference for later navigation
        currentQueueIndex: startIndex,
        currentTrack: tracks[startIndex],
        isPlaying: true,
      });
    } catch (error) {
      console.error('Error setting queue:', error);
    }
  },

  // Filter actions
  setFilters: (filters) => {
    set({ filters });
  },

  resetFilters: () => {
    set({
      filters: {
        bpmRange: { min: 60, max: 180 },
        selectedKeys: [],
        selectedGenres: [],
      },
      isFilterActive: false,
    });
  },

  toggleFilterDrawer: () => {
    const { isFilterDrawerOpen } = get();
    set({ isFilterDrawerOpen: !isFilterDrawerOpen });
  },

  setFilterDrawerOpen: (open) => {
    set({ isFilterDrawerOpen: open });
  },

  applyFilters: () => {
    const { filters } = get();
    const hasActiveFilters =
      filters.bpmRange.min !== 60 ||
      filters.bpmRange.max !== 180 ||
      filters.selectedKeys.length > 0 ||
      filters.selectedGenres.length > 0;

    set({
      isFilterActive: hasActiveFilters,
      isFilterDrawerOpen: false,
    });
  },

  getFilteredTracks: () => {
    const { tracks, filters, isFilterActive } = get();

    if (!isFilterActive) {
      return tracks;
    }

    return tracks.filter((track) => {
      // BPM filter
      if (track.bpm) {
        const bpm = parseInt(track.bpm, 10);
        if (bpm < filters.bpmRange.min || bpm > filters.bpmRange.max) {
          return false;
        }
      }

      // Key filter
      if (filters.selectedKeys.length > 0 && track.key) {
        if (!filters.selectedKeys.includes(track.key)) {
          return false;
        }
      }

      // Genre filter
      if (filters.selectedGenres.length > 0 && track.genre) {
        if (!filters.selectedGenres.includes(track.genre)) {
          return false;
        }
      }

      return true;
    });
  },

  // Track identification actions
  showIdentifyModal: () => set({ isIdentifyModalVisible: true }),
  hideIdentifyModal: () => set({ isIdentifyModalVisible: false }),

  // Find track in all crates (loads each crate to check)
  findTrackInAllCrates: async (trackId) => {
    const { crates } = get();
    const cratesWithTrack = [];

    for (const crate of crates) {
      try {
        const crateDetail = await apiService.getCrate(crate.id);
        if (crateDetail.tracks?.some(t => t.id === trackId)) {
          cratesWithTrack.push({
            id: crate.id,
            name: crate.name,
            fullPath: crate.fullPath || crate.name,
          });
        }
      } catch (e) {
        // Skip crates that fail to load
      }
    }

    return cratesWithTrack;
  },
    }),
    {
      name: 'recrate-library-cache',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist specific keys to avoid persisting loading states, player state, etc.
      partialize: (state) => ({
        // Disclaimer acceptance - persist so user only sees once
        hasAcceptedDisclaimer: state.hasAcceptedDisclaimer,
        // AI usage tracking - persist to track free tier usage
        aiUsageCount: state.aiUsageCount,
        aiUsageResetDate: state.aiUsageResetDate,
        // Library data - persist for offline/quick reload
        tracks: state.tracks,
        libraryPagination: state.libraryPagination,
        // Crate data - persist for offline/quick reload
        crates: state.crates,
        crateTree: state.crateTree,
        expandedCrates: state.expandedCrates,
        // Filter preferences - persist user preferences
        filters: state.filters,
      }),
      // Version for cache invalidation - bump this to clear old caches
      // v2: Fixed pagination offset calculation
      // v3: Added disclaimer state
      // v4: Changed to load all tracks at once (limit=0)
      version: 4,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.log('Store rehydration error:', error);
        } else if (state) {
          console.log('Store rehydrated with', state.tracks?.length || 0, 'cached tracks');
        } else {
          console.log('Store rehydrated with no cached data (fresh start)');
        }
      },
    }
  )
);

export default useStore;
