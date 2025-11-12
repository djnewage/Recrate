import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
} from 'react-native-track-player';
import apiService from './api';

/**
 * Setup TrackPlayer with capabilities and configuration
 */
export async function setupPlayer() {
  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
    });

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
    });

    console.log('TrackPlayer setup complete');
    return true;
  } catch (error) {
    console.error('Error setting up TrackPlayer:', error);
    return false;
  }
}

/**
 * Convert Recrate track object to TrackPlayer track format
 */
export function formatTrackForPlayer(track) {
  return {
    url: apiService.getStreamUrl(track.id),
    title: track.title || 'Unknown Title',
    artist: track.artist || 'Unknown Artist',
    artwork: track.hasArtwork ? apiService.getArtworkUrl(track.id) : undefined,
    duration: track.duration || 0,
    // Store custom metadata
    id: track.id,
    bpm: track.bpm,
    key: track.key,
    album: track.album,
  };
}

/**
 * Add track to queue
 */
export async function addTrackToQueue(track) {
  const formattedTrack = formatTrackForPlayer(track);
  await TrackPlayer.add(formattedTrack);
}

/**
 * Add multiple tracks to queue
 */
export async function addTracksToQueue(tracks) {
  const formattedTracks = tracks.map(formatTrackForPlayer);
  await TrackPlayer.add(formattedTracks);
}

/**
 * Play a specific track (clears queue and plays immediately)
 */
export async function playTrack(track) {
  try {
    // Reset queue
    await TrackPlayer.reset();

    // Add track
    const formattedTrack = formatTrackForPlayer(track);
    await TrackPlayer.add(formattedTrack);

    // Start playback
    await TrackPlayer.play();

    return true;
  } catch (error) {
    console.error('Error playing track:', error);
    return false;
  }
}

/**
 * Setup event handlers that connect to Zustand store
 */
export function setupEventHandlers(store) {
  // Track playback state changes
  TrackPlayer.addEventListener(Event.PlaybackState, async ({ state }) => {
    const isPlaying = state === 'playing';
    const isBuffering = state === 'buffering' || state === 'loading';

    store.setState({
      isPlaying,
      isBuffering,
    });
  });

  // Track changed (next/previous)
  TrackPlayer.addEventListener(Event.PlaybackTrackChanged, async (event) => {
    if (event.nextTrack !== undefined) {
      const track = await TrackPlayer.getTrack(event.nextTrack);
      if (track) {
        // Convert back to Recrate track format
        store.setState({
          currentTrack: {
            id: track.id,
            title: track.title,
            artist: track.artist,
            bpm: track.bpm,
            key: track.key,
            album: track.album,
            duration: track.duration,
            hasArtwork: !!track.artwork,
          },
        });
      }
    }
  });

  // Playback error
  TrackPlayer.addEventListener(Event.PlaybackError, ({ error }) => {
    console.error('Playback error:', error);
    store.setState({
      playerError: error.message || 'Playback error occurred',
      isPlaying: false,
    });
  });

  // Queue ended
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async ({ track, position }) => {
    const repeatMode = store.getState().repeatMode;

    if (repeatMode === 'queue') {
      // Restart queue from beginning
      await TrackPlayer.skip(0);
      await TrackPlayer.play();
    } else if (repeatMode === 'off') {
      // Stop playback
      store.setState({
        isPlaying: false,
      });
    }
  });

  console.log('TrackPlayer event handlers setup complete');
}

/**
 * Get current playback state
 */
export async function getPlaybackState() {
  const state = await TrackPlayer.getState();
  return state;
}

/**
 * Cleanup (optional - called on app unmount)
 */
export async function cleanup() {
  await TrackPlayer.reset();
  await TrackPlayer.destroy();
}
