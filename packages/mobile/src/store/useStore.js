import { create } from 'zustand';
import apiService from '../services/api';

const useStore = create((set, get) => ({
  // Library state
  tracks: [],
  selectedTracks: [],
  isLoadingLibrary: false,
  libraryError: null,

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
  loadLibrary: async (params = {}) => {
    set({ isLoadingLibrary: true, libraryError: null });
    try {
      const data = await apiService.getLibrary(params);
      set({ tracks: data.tracks, isLoadingLibrary: false });
    } catch (error) {
      set({ libraryError: error.message, isLoadingLibrary: false });
    }
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
