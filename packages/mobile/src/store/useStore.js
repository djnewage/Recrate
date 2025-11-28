import { create } from 'zustand';
import TrackPlayer, { RepeatMode } from 'react-native-track-player';
import apiService from '../services/api';
import * as TrackPlayerService from '../services/TrackPlayerService';

const useStore = create((set, get) => ({
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
  libraryPagination: {
    total: 0,
    limit: 1000,
    offset: 0,
    hasMore: false,
  },

  // Crates state
  crates: [],
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

      const data = await apiService.getLibrary(requestParams);

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
            limit: 1000,
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
      const uniqueTracks = Array.from(
        new Map(finalTracks.map(t => [t.id, t])).values()
      );

      set({
        tracks: uniqueTracks,
        isLoadingLibrary: false,
        isIndexing: false,
        indexingStatus: null,
        indexingMessage: null,
        libraryPagination: {
          total: data.pagination?.total || data.tracks.length,
          limit: data.pagination?.limit || 1000,
          // Use offset from API response, or fall back to the offset we requested
          // This ensures pagination continues correctly even if API doesn't return offset
          offset: data.pagination?.offset ?? requestParams.offset,
          hasMore: data.pagination?.hasMore || false,
        },
      });

      // Stop polling if it was running
      get().stopIndexingPoll();
    } catch (error) {
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
    const { libraryPagination, isLoadingLibrary } = get();

    // Don't load if already loading or no more tracks
    if (isLoadingLibrary || !libraryPagination.hasMore) {
      return;
    }

    // Calculate next offset
    const nextOffset = libraryPagination.offset + libraryPagination.limit;

    // Pass the nextOffset as a parameter to loadLibrary
    // This will override the offset from state and ensure proper pagination
    await get().loadLibrary({ offset: nextOffset }, true);
  },

  resetLibrary: () => {
    set({
      tracks: [],
      libraryPagination: {
        total: 0,
        limit: 1000,
        offset: 0,
        hasMore: false,
      },
    });
  },

  // Crates actions
  loadCrates: async () => {
    set({ isLoadingCrates: true, cratesError: null });
    try {
      const data = await apiService.getCrates();
      set({ crates: data.crates, isLoadingCrates: false });
    } catch (error) {
      set({ cratesError: error.message, isLoadingCrates: false });
    }
  },

  loadCrate: async (crateId) => {
    set({ isLoadingCrates: true, cratesError: null });
    try {
      const crate = await apiService.getCrate(crateId);
      set({ selectedCrate: crate, isLoadingCrates: false });
    } catch (error) {
      set({ cratesError: error.message, isLoadingCrates: false });
    }
  },

  createCrate: async (name, color) => {
    try {
      await apiService.createCrate(name, color);
      await get().loadCrates();
      return true;
    } catch (error) {
      set({ cratesError: error.message });
      return false;
    }
  },

  addTracksToCrate: async (crateId, trackIds) => {
    try {
      await apiService.addTracksToCrate(crateId, trackIds);
      await get().loadCrate(crateId);
      await get().loadCrates(); // Refresh the crates list to update track counts
      return true;
    } catch (error) {
      set({ cratesError: error.message });
      return false;
    }
  },

  removeTrackFromCrate: async (crateId, trackId) => {
    try {
      await apiService.removeTrackFromCrate(crateId, trackId);
      await get().loadCrate(crateId);
      await get().loadCrates(); // Refresh the crates list to update track counts
      return true;
    } catch (error) {
      set({ cratesError: error.message });
      return false;
    }
  },

  deleteCrate: async (crateId) => {
    try {
      await apiService.deleteCrate(crateId);
      await get().loadCrates(); // Refresh the crates list
      return true;
    } catch (error) {
      set({ cratesError: error.message });
      return false;
    }
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

  // Search actions
  search: async (query) => {
    set({ searchQuery: query, isSearching: true });
    if (!query.trim()) {
      set({ searchResults: [], isSearching: false });
      return;
    }

    try {
      const data = await apiService.searchTracks(query);

      // Deduplicate search results to prevent duplicate key errors
      const uniqueResults = Array.from(
        new Map(data.results.map(t => [t.id, t])).values()
      );

      set({ searchResults: uniqueResults, isSearching: false });
    } catch (error) {
      set({ isSearching: false });
    }
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

      await TrackPlayer.skipToNext();
      set({ currentQueueIndex: nextIndex });
    } catch (error) {
      console.error('Error playing next:', error);
    }
  },

  playPrevious: async () => {
    try {
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

  toggleShuffle: () => {
    const { shuffleEnabled } = get();
    // Note: Shuffle logic would need to be implemented in queue management
    set({ shuffleEnabled: !shuffleEnabled });
  },

  setQueue: async (tracks, startIndex = 0) => {
    try {
      await TrackPlayer.reset();
      await TrackPlayerService.addTracksToQueue(tracks);

      if (startIndex > 0) {
        await TrackPlayer.skip(startIndex);
      }

      // Start playback automatically
      await TrackPlayer.play();

      set({
        queue: tracks,
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
}));

export default useStore;
