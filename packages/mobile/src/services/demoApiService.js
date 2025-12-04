/**
 * Demo API Service
 * Mocks all API endpoints for demo mode (App Store review)
 * Returns demo data instead of making real API calls
 */

import {
  DEMO_TRACKS,
  DEMO_CRATES,
  getDemoTrackById,
  getDemoCrateById,
  getDemoTracksForCrate,
  searchDemoTracks,
} from '../data/demoData';

// Simulate network delay for realistic feel
const simulateDelay = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));

// Demo crate state (for create/add/remove operations that work locally)
let demoCrateState = JSON.parse(JSON.stringify(DEMO_CRATES));

// Reset demo state
export const resetDemoState = () => {
  demoCrateState = JSON.parse(JSON.stringify(DEMO_CRATES));
};

// Demo API Service
export const demoApiService = {
  // Health check (always returns ok in demo)
  checkHealth: async () => {
    await simulateDelay(100);
    return { status: 'ok', demo: true };
  },

  // Library endpoints
  getLibrary: async (params = {}) => {
    await simulateDelay(300);
    const { page = 1, limit = 50, sortBy = 'title', sortOrder = 'asc' } = params;

    let tracks = [...DEMO_TRACKS];

    // Sort
    tracks.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (typeof aVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortOrder === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

    // Paginate
    const start = (page - 1) * limit;
    const paginatedTracks = tracks.slice(start, start + limit);

    return {
      tracks: paginatedTracks,
      total: DEMO_TRACKS.length,
      page,
      limit,
      hasMore: start + limit < DEMO_TRACKS.length,
    };
  },

  getLibraryStatus: async () => {
    await simulateDelay(100);
    return {
      status: 'ready',
      total: DEMO_TRACKS.length,
      indexed: DEMO_TRACKS.length,
      demo: true,
    };
  },

  getTrack: async (trackId) => {
    await simulateDelay(150);
    const track = getDemoTrackById(trackId);
    if (!track) {
      throw new Error('Track not found');
    }
    return track;
  },

  // Crates endpoints
  getCrates: async () => {
    await simulateDelay(200);
    return { crates: demoCrateState };
  },

  getCrate: async (crateId) => {
    await simulateDelay(200);
    const crate = getDemoCrateById(crateId);
    if (!crate) {
      throw new Error('Crate not found');
    }

    // Return crate with full track objects
    const tracks = getDemoTracksForCrate(crateId);
    return {
      ...crate,
      tracks,
    };
  },

  createCrate: async (name, color, parentId = null) => {
    await simulateDelay(300);
    const newCrate = {
      id: `demo-crate-new-${Date.now()}`,
      name,
      color: color || '#8B5CF6',
      trackIds: [],
      children: [],
    };

    if (parentId) {
      // Find parent and add as child
      const addToParent = (crates) => {
        for (const crate of crates) {
          if (crate.id === parentId) {
            crate.children = crate.children || [];
            crate.children.push(newCrate);
            return true;
          }
          if (crate.children?.length && addToParent(crate.children)) {
            return true;
          }
        }
        return false;
      };
      addToParent(demoCrateState);
    } else {
      demoCrateState.push(newCrate);
    }

    return { success: true, crate: newCrate };
  },

  addTracksToCrate: async (crateId, trackIds) => {
    await simulateDelay(200);

    const updateCrate = (crates) => {
      for (const crate of crates) {
        if (crate.id === crateId) {
          crate.trackIds = [...new Set([...crate.trackIds, ...trackIds])];
          return true;
        }
        if (crate.children?.length && updateCrate(crate.children)) {
          return true;
        }
      }
      return false;
    };

    updateCrate(demoCrateState);
    return { success: true };
  },

  removeTrackFromCrate: async (crateId, trackId) => {
    await simulateDelay(200);

    const updateCrate = (crates) => {
      for (const crate of crates) {
        if (crate.id === crateId) {
          crate.trackIds = crate.trackIds.filter(id => id !== trackId);
          return true;
        }
        if (crate.children?.length && updateCrate(crate.children)) {
          return true;
        }
      }
      return false;
    };

    updateCrate(demoCrateState);
    return { success: true };
  },

  deleteCrate: async (crateId) => {
    await simulateDelay(200);

    const removeCrate = (crates) => {
      const index = crates.findIndex(c => c.id === crateId);
      if (index !== -1) {
        crates.splice(index, 1);
        return true;
      }
      for (const crate of crates) {
        if (crate.children?.length && removeCrate(crate.children)) {
          return true;
        }
      }
      return false;
    };

    removeCrate(demoCrateState);
    return { success: true };
  },

  // Search endpoint
  searchTracks: async (query, field = 'all', limit = 100) => {
    await simulateDelay(250);
    const results = searchDemoTracks(query);
    return {
      tracks: results.slice(0, limit),
      total: results.length,
      query,
    };
  },

  // Config endpoints (return demo defaults)
  getConfig: async () => {
    await simulateDelay(100);
    return {
      seratoPath: '/Demo/Serato',
      musicPaths: ['/Demo/Music'],
      demo: true,
    };
  },

  updateConfig: async () => {
    await simulateDelay(100);
    return { success: true, demo: true, message: 'Config changes not saved in demo mode' };
  },

  getVolumes: async () => {
    await simulateDelay(100);
    return { volumes: ['Demo Volume'], demo: true };
  },

  getSeratoInstallations: async () => {
    await simulateDelay(100);
    return { installations: [], demo: true };
  },

  validateSeratoPath: async () => {
    await simulateDelay(100);
    return { valid: true, demo: true };
  },

  // Streaming URLs - return demo placeholder
  getStreamUrl: (trackId) => {
    // Return a special demo:// URL that the player will handle
    return `demo://audio/${trackId}`;
  },

  getArtworkUrl: (trackId) => {
    // Return a placeholder - could be a local asset or generated
    return `demo://artwork/${trackId}`;
  },
};

export default demoApiService;
