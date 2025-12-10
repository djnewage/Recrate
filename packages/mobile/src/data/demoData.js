/**
 * Demo data for App Store review
 * Provides realistic DJ library data without requiring server connection
 */

// Royalty-free audio samples from Pixabay for demo playback
const DEMO_AUDIO_URLS = [
  'https://cdn.pixabay.com/audio/2022/10/25/audio_946bc6eb19.mp3', // Electronic
  'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3', // Lo-Fi
  'https://cdn.pixabay.com/audio/2022/08/02/audio_884fe92c21.mp3', // Deep House
  'https://cdn.pixabay.com/audio/2024/11/14/audio_a4cd4e4087.mp3', // Hip Hop
  'https://cdn.pixabay.com/audio/2022/08/04/audio_2dde668d05.mp3', // Tropical
  'https://cdn.pixabay.com/audio/2024/09/10/audio_6e5d7d1912.mp3', // Chill
  'https://cdn.pixabay.com/audio/2024/04/02/audio_3bac3e9e03.mp3', // Tech
  'https://cdn.pixabay.com/audio/2023/10/24/audio_a08906a4b5.mp3', // Funky
  'https://cdn.pixabay.com/audio/2024/09/03/audio_6fbd76b0a4.mp3', // Upbeat
  'https://cdn.pixabay.com/audio/2024/06/06/audio_44cc098882.mp3', // Energetic
];

// Helper to assign audio URLs cyclically
const getAudioUrl = (index) => DEMO_AUDIO_URLS[index % DEMO_AUDIO_URLS.length];

// Sample tracks with realistic metadata
export const DEMO_TRACKS = [
  // House
  { id: 'demo-1', title: 'Midnight Groove', artist: 'Deep House Collective', bpm: 124, key: 'Am', genre: 'House', duration: 345, streamUrl: getAudioUrl(0) },
  { id: 'demo-2', title: 'Summer Nights', artist: 'Ibiza Dreams', bpm: 126, key: 'Cm', genre: 'House', duration: 298, streamUrl: getAudioUrl(1) },
  { id: 'demo-3', title: 'Feel The Rhythm', artist: 'Club Masters', bpm: 128, key: 'Fm', genre: 'House', duration: 312, streamUrl: getAudioUrl(2) },
  { id: 'demo-4', title: 'Warehouse Memories', artist: 'Detroit Sounds', bpm: 122, key: 'Gm', genre: 'House', duration: 378, streamUrl: getAudioUrl(3) },
  { id: 'demo-5', title: 'Sunset Boulevard', artist: 'LA Nights', bpm: 125, key: 'Dm', genre: 'House', duration: 289, streamUrl: getAudioUrl(4) },

  // Tech House
  { id: 'demo-6', title: 'Bass Control', artist: 'Tech Syndicate', bpm: 128, key: 'Am', genre: 'Tech House', duration: 356, streamUrl: getAudioUrl(5) },
  { id: 'demo-7', title: 'Underground Session', artist: 'Berlin Collective', bpm: 130, key: 'Em', genre: 'Tech House', duration: 402, streamUrl: getAudioUrl(6) },
  { id: 'demo-8', title: 'Acid Rain', artist: 'Warehouse DJs', bpm: 127, key: 'Bm', genre: 'Tech House', duration: 334, streamUrl: getAudioUrl(7) },
  { id: 'demo-9', title: 'System Override', artist: 'Digital Minds', bpm: 129, key: 'Fm', genre: 'Tech House', duration: 367, streamUrl: getAudioUrl(8) },
  { id: 'demo-10', title: 'Dark Matters', artist: 'Nocturnal', bpm: 126, key: 'Gm', genre: 'Tech House', duration: 298, streamUrl: getAudioUrl(9) },

  // Deep House
  { id: 'demo-11', title: 'Ocean Waves', artist: 'Chill Vibes', bpm: 118, key: 'Cm', genre: 'Deep House', duration: 421, streamUrl: getAudioUrl(0) },
  { id: 'demo-12', title: 'Dreaming', artist: 'Sunset Collective', bpm: 120, key: 'Am', genre: 'Deep House', duration: 389, streamUrl: getAudioUrl(1) },
  { id: 'demo-13', title: 'Velvet Touch', artist: 'Smooth Operators', bpm: 119, key: 'Dm', genre: 'Deep House', duration: 356, streamUrl: getAudioUrl(2) },
  { id: 'demo-14', title: 'Late Night Jazz', artist: 'Urban Soul', bpm: 117, key: 'Fm', genre: 'Deep House', duration: 445, streamUrl: getAudioUrl(3) },
  { id: 'demo-15', title: 'Distant Shores', artist: 'Paradise Found', bpm: 121, key: 'Em', genre: 'Deep House', duration: 378, streamUrl: getAudioUrl(4) },

  // Techno
  { id: 'demo-16', title: 'Industrial Revolution', artist: 'Factory Floor', bpm: 135, key: 'Am', genre: 'Techno', duration: 412, streamUrl: getAudioUrl(5) },
  { id: 'demo-17', title: 'Steel City', artist: 'Machine Code', bpm: 138, key: 'Bm', genre: 'Techno', duration: 367, streamUrl: getAudioUrl(6) },
  { id: 'demo-18', title: 'Dystopia', artist: 'Dark Future', bpm: 140, key: 'Cm', genre: 'Techno', duration: 398, streamUrl: getAudioUrl(7) },
  { id: 'demo-19', title: 'Rave Alert', artist: 'Bunker Berlin', bpm: 142, key: 'Dm', genre: 'Techno', duration: 356, streamUrl: getAudioUrl(8) },
  { id: 'demo-20', title: 'Sonic Boom', artist: 'Bass Warriors', bpm: 136, key: 'Em', genre: 'Techno', duration: 423, streamUrl: getAudioUrl(9) },

  // Melodic House
  { id: 'demo-21', title: 'Sunrise', artist: 'Horizon', bpm: 122, key: 'Am', genre: 'Melodic House', duration: 389, streamUrl: getAudioUrl(0) },
  { id: 'demo-22', title: 'Desert Rose', artist: 'Oasis Sound', bpm: 124, key: 'Cm', genre: 'Melodic House', duration: 412, streamUrl: getAudioUrl(1) },
  { id: 'demo-23', title: 'Northern Lights', artist: 'Aurora', bpm: 121, key: 'Em', genre: 'Melodic House', duration: 445, streamUrl: getAudioUrl(2) },
  { id: 'demo-24', title: 'Sacred Ground', artist: 'Mystic Vibes', bpm: 123, key: 'Gm', genre: 'Melodic House', duration: 378, streamUrl: getAudioUrl(3) },
  { id: 'demo-25', title: 'Eternal', artist: 'Cosmos', bpm: 120, key: 'Dm', genre: 'Melodic House', duration: 467, streamUrl: getAudioUrl(4) },

  // Progressive House
  { id: 'demo-26', title: 'Elevation', artist: 'Peak Hour', bpm: 128, key: 'Am', genre: 'Progressive House', duration: 398, streamUrl: getAudioUrl(5) },
  { id: 'demo-27', title: 'Breakthrough', artist: 'Stadium Sound', bpm: 130, key: 'Fm', genre: 'Progressive House', duration: 423, streamUrl: getAudioUrl(6) },
  { id: 'demo-28', title: 'Epic Journey', artist: 'Anthem Kings', bpm: 129, key: 'Cm', genre: 'Progressive House', duration: 456, streamUrl: getAudioUrl(7) },
  { id: 'demo-29', title: 'Unity', artist: 'Festival Crew', bpm: 127, key: 'Dm', genre: 'Progressive House', duration: 389, streamUrl: getAudioUrl(8) },
  { id: 'demo-30', title: 'Transcendence', artist: 'Mainstage', bpm: 128, key: 'Em', genre: 'Progressive House', duration: 412, streamUrl: getAudioUrl(9) },

  // Afro House
  { id: 'demo-31', title: 'African Spirit', artist: 'Tribal Roots', bpm: 122, key: 'Am', genre: 'Afro House', duration: 378, streamUrl: getAudioUrl(0) },
  { id: 'demo-32', title: 'Drums of the Savanna', artist: 'Safari Sound', bpm: 124, key: 'Gm', genre: 'Afro House', duration: 401, streamUrl: getAudioUrl(1) },
  { id: 'demo-33', title: 'Ubuntu', artist: 'African Soul', bpm: 120, key: 'Dm', genre: 'Afro House', duration: 356, streamUrl: getAudioUrl(2) },
  { id: 'demo-34', title: 'Ancestors', artist: 'Heritage', bpm: 123, key: 'Cm', genre: 'Afro House', duration: 423, streamUrl: getAudioUrl(3) },
  { id: 'demo-35', title: 'Motherland', artist: 'Origin', bpm: 121, key: 'Fm', genre: 'Afro House', duration: 389, streamUrl: getAudioUrl(4) },

  // Disco / Nu-Disco
  { id: 'demo-36', title: 'Boogie Nights', artist: 'Disco Inferno', bpm: 118, key: 'Am', genre: 'Disco', duration: 312, streamUrl: getAudioUrl(5) },
  { id: 'demo-37', title: 'Funky Town', artist: 'Groove Machine', bpm: 120, key: 'Dm', genre: 'Nu-Disco', duration: 334, streamUrl: getAudioUrl(6) },
  { id: 'demo-38', title: 'Saturday Night', artist: 'Studio 54', bpm: 116, key: 'Cm', genre: 'Disco', duration: 289, streamUrl: getAudioUrl(7) },
  { id: 'demo-39', title: 'Glitter Ball', artist: 'Roller Skate', bpm: 122, key: 'Gm', genre: 'Nu-Disco', duration: 356, streamUrl: getAudioUrl(8) },
  { id: 'demo-40', title: 'Electric Dreams', artist: 'Neon Lights', bpm: 119, key: 'Em', genre: 'Disco', duration: 298, streamUrl: getAudioUrl(9) },

  // Minimal
  { id: 'demo-41', title: 'Less Is More', artist: 'Minimal Minds', bpm: 126, key: 'Am', genre: 'Minimal', duration: 445, streamUrl: getAudioUrl(0) },
  { id: 'demo-42', title: 'White Space', artist: 'Clean Cut', bpm: 124, key: 'Bm', genre: 'Minimal', duration: 412, streamUrl: getAudioUrl(1) },
  { id: 'demo-43', title: 'Hypnotic', artist: 'Trance State', bpm: 128, key: 'Cm', genre: 'Minimal', duration: 389, streamUrl: getAudioUrl(2) },
  { id: 'demo-44', title: 'Micro', artist: 'Nano', bpm: 125, key: 'Dm', genre: 'Minimal', duration: 367, streamUrl: getAudioUrl(3) },
  { id: 'demo-45', title: 'Subtle', artist: 'Whisper', bpm: 123, key: 'Em', genre: 'Minimal', duration: 423, streamUrl: getAudioUrl(4) },

  // Breaks
  { id: 'demo-46', title: 'Break It Down', artist: 'Rhythm Section', bpm: 130, key: 'Am', genre: 'Breaks', duration: 334, streamUrl: getAudioUrl(5) },
  { id: 'demo-47', title: 'Old School', artist: 'Block Party', bpm: 128, key: 'Fm', genre: 'Breaks', duration: 312, streamUrl: getAudioUrl(6) },
  { id: 'demo-48', title: 'Scratch Attack', artist: 'Turntablist', bpm: 132, key: 'Gm', genre: 'Breaks', duration: 289, streamUrl: getAudioUrl(7) },
  { id: 'demo-49', title: 'B-Boy Stance', artist: 'Street Beat', bpm: 126, key: 'Dm', genre: 'Breaks', duration: 356, streamUrl: getAudioUrl(8) },
  { id: 'demo-50', title: 'Fresh Cuts', artist: 'Vinyl Digger', bpm: 129, key: 'Cm', genre: 'Breaks', duration: 378, streamUrl: getAudioUrl(9) },
];

// Crates with hierarchy (subcrates)
export const DEMO_CRATES = [
  {
    id: 'demo-crate-1',
    name: 'Main Room',
    color: '#8B5CF6',
    trackIds: ['demo-6', 'demo-7', 'demo-8', 'demo-16', 'demo-17', 'demo-18', 'demo-26', 'demo-27'],
    children: [
      {
        id: 'demo-crate-1-1',
        name: 'Peak Time',
        color: '#EF4444',
        trackIds: ['demo-16', 'demo-17', 'demo-18', 'demo-19', 'demo-20'],
        children: [],
      },
      {
        id: 'demo-crate-1-2',
        name: 'Warm Up',
        color: '#F59E0B',
        trackIds: ['demo-6', 'demo-7', 'demo-11', 'demo-12', 'demo-21'],
        children: [],
      },
    ],
  },
  {
    id: 'demo-crate-2',
    name: 'Deep & Melodic',
    color: '#06B6D4',
    trackIds: ['demo-11', 'demo-12', 'demo-13', 'demo-14', 'demo-15', 'demo-21', 'demo-22', 'demo-23', 'demo-24', 'demo-25'],
    children: [
      {
        id: 'demo-crate-2-1',
        name: 'Sunrise Sets',
        color: '#FBBF24',
        trackIds: ['demo-21', 'demo-22', 'demo-23', 'demo-24', 'demo-25'],
        children: [],
      },
    ],
  },
  {
    id: 'demo-crate-3',
    name: 'Afro & Organic',
    color: '#10B981',
    trackIds: ['demo-31', 'demo-32', 'demo-33', 'demo-34', 'demo-35'],
    children: [],
  },
  {
    id: 'demo-crate-4',
    name: 'Disco Edits',
    color: '#EC4899',
    trackIds: ['demo-36', 'demo-37', 'demo-38', 'demo-39', 'demo-40'],
    children: [],
  },
  {
    id: 'demo-crate-5',
    name: 'Classics',
    color: '#6366F1',
    trackIds: ['demo-1', 'demo-2', 'demo-3', 'demo-4', 'demo-5', 'demo-46', 'demo-47', 'demo-48'],
    children: [
      {
        id: 'demo-crate-5-1',
        name: 'House Anthems',
        color: '#8B5CF6',
        trackIds: ['demo-1', 'demo-2', 'demo-3', 'demo-4', 'demo-5'],
        children: [],
      },
      {
        id: 'demo-crate-5-2',
        name: 'Breaks & Beats',
        color: '#F97316',
        trackIds: ['demo-46', 'demo-47', 'demo-48', 'demo-49', 'demo-50'],
        children: [],
      },
    ],
  },
];

// Helper to get track by ID
export const getDemoTrackById = (trackId) => {
  return DEMO_TRACKS.find(t => t.id === trackId) || null;
};

// Helper to get crate by ID (including nested)
export const getDemoCrateById = (crateId) => {
  const findCrate = (crates) => {
    for (const crate of crates) {
      if (crate.id === crateId) return crate;
      if (crate.children?.length) {
        const found = findCrate(crate.children);
        if (found) return found;
      }
    }
    return null;
  };
  return findCrate(DEMO_CRATES);
};

// Helper to get tracks for a crate
export const getDemoTracksForCrate = (crateId) => {
  const crate = getDemoCrateById(crateId);
  if (!crate) return [];
  return crate.trackIds.map(id => getDemoTrackById(id)).filter(Boolean);
};

// Search demo tracks
export const searchDemoTracks = (query) => {
  if (!query) return DEMO_TRACKS;
  const lowerQuery = query.toLowerCase();
  return DEMO_TRACKS.filter(track =>
    track.title.toLowerCase().includes(lowerQuery) ||
    track.artist.toLowerCase().includes(lowerQuery) ||
    track.genre.toLowerCase().includes(lowerQuery)
  );
};
