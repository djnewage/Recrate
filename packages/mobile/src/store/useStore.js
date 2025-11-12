import { create } from 'zustand';
import apiService from '../services/api';

const useStore = create((set, get) => ({
  // Library state
  tracks: [],
  selectedTracks: [],
  isLoadingLibrary: false,
  libraryError: null,

  // Pagination state
  libraryPagination: {
    total: 0,
    limit: 100,
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
  playerError: null,

  // Search state
  searchQuery: '',
  searchResults: [],
  isSearching: false,

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

      set({
        tracks: append ? [...get().tracks, ...data.tracks] : data.tracks,
        isLoadingLibrary: false,
        libraryPagination: {
          total: data.pagination.total,
          limit: data.pagination.limit,
          offset: data.pagination.offset,
          hasMore: data.pagination.hasMore,
        },
      });
    } catch (error) {
      set({ libraryError: error.message, isLoadingLibrary: false });
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

    // Update offset and load with append
    set({
      libraryPagination: {
        ...libraryPagination,
        offset: nextOffset,
      },
    });

    await get().loadLibrary({}, true);
  },

  resetLibrary: () => {
    set({
      tracks: [],
      libraryPagination: {
        total: 0,
        limit: 100,
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
      set({ searchResults: data.results, isSearching: false });
    } catch (error) {
      set({ isSearching: false });
    }
  },

  clearSearch: () => {
    set({ searchQuery: '', searchResults: [] });
  },

  // Player actions
  playTrack: (track) => {
    set({ currentTrack: track, isPlaying: true });
  },

  pauseTrack: () => {
    set({ isPlaying: false });
  },

  resumeTrack: () => {
    set({ isPlaying: true });
  },

  stopTrack: () => {
    set({ currentTrack: null, isPlaying: false });
  },
}));

export default useStore;
