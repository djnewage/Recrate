import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
  State,
} from 'react-native-track-player';
import { Asset } from 'expo-asset';
import apiService from './api';
import { useConnectionStore, CONNECTION_TYPES } from '../store/connectionStore';

// Bundled demo audio for App Store review - silent MP3 that works offline
let demoAudioUri = null;

// Load the bundled demo audio asset
const getDemoAudioUri = async () => {
  if (demoAudioUri) return demoAudioUri;

  try {
    const asset = Asset.fromModule(require('../../assets/demo-audio.mp3'));
    await asset.downloadAsync();
    demoAudioUri = asset.localUri || asset.uri;
    console.log('[TrackPlayer] Demo audio loaded:', demoAudioUri);
    return demoAudioUri;
  } catch (error) {
    console.error('[TrackPlayer] Failed to load demo audio:', error);
    // Fallback to a reliable external URL if bundled asset fails
    return 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav';
  }
};

// Check if in demo mode
const isDemoMode = () => {
  try {
    return useConnectionStore.getState().connectionType === CONNECTION_TYPES.DEMO;
  } catch {
    return false;
  }
};

/**
 * Setup TrackPlayer with capabilities and configuration
 */
export async function setupPlayer() {
  let isAlreadySetup = false;

  try {
    // Try to get the current state to check if already initialized
    await TrackPlayer.getActiveTrack();
    isAlreadySetup = true;
  } catch (error) {
    // Player not initialized yet
    isAlreadySetup = false;
  }

  if (isAlreadySetup) {
    console.log('TrackPlayer already initialized, skipping setup');
    return true;
  }

  try {
    console.log('Setting up TrackPlayer...');
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
      // iOS-specific optimizations
      iosCategory: 'playback',
      iosCategoryMode: 'default',
      // Android-specific optimizations
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
      // Buffering configuration for faster playback start
      minBuffer: 15, // Start playing after 15 seconds buffered
      maxBuffer: 50, // Buffer up to 50 seconds ahead
      playBuffer: 2.5, // Start playing after 2.5 seconds minimum
      backBuffer: 0, // Don't keep buffer behind playhead
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
      // Progressive download - don't wait for entire file
      progressUpdateEventInterval: 1,
    });

    console.log('TrackPlayer setup complete with optimized buffering');

    // Preload demo audio asset for instant playback in demo mode
    getDemoAudioUri().catch(() => {});

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
  // In demo mode, use bundled placeholder audio (or fallback URL)
  const audioUrl = isDemoMode()
    ? (demoAudioUri || 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav')
    : apiService.getStreamUrl(track.id);

  // In demo mode, don't try to load artwork from server
  const artworkUrl = isDemoMode() ? undefined : (track.hasArtwork ? apiService.getArtworkUrl(track.id) : undefined);

  return {
    url: audioUrl,
    title: track.title || 'Unknown Title',
    artist: track.artist || 'Unknown Artist',
    artwork: artworkUrl,
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
 * Preload a track by fetching initial bytes to warm up the connection
 * This significantly reduces playback start delay
 */
export async function preloadTrack(track) {
  // Skip preloading in demo mode - demo audio doesn't need it
  if (isDemoMode()) {
    return;
  }

  try {
    const streamUrl = apiService.getStreamUrl(track.id);

    // Fetch first 256KB to warm up connection and start caching
    fetch(streamUrl, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-262143', // First 256KB
      },
    }).catch(err => {
      // Silently fail - this is just optimization
      console.log('Preload failed (non-critical):', err.message);
    });

    console.log(`Preloaded first chunk of: ${track.title}`);
  } catch (error) {
    // Non-critical - just log and continue
    console.log('Preload error (non-critical):', error.message);
  }
}

/**
 * Play a specific track (clears queue and plays immediately)
 */
export async function playTrack(track) {
  try {
    console.log(`Playing track: ${track.title}`);

    // Preload the track to warm up connection (non-blocking)
    preloadTrack(track);

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
  // Track playback state changes (from both app and remote controls)
  TrackPlayer.addEventListener(Event.PlaybackState, async ({ state }) => {
    console.log('Playback state changed:', state);

    const isPlaying = state === State.Playing;
    const isBuffering = state === State.Buffering || state === State.Loading;
    const isPaused = state === State.Paused;

    // Update store to sync UI with actual playback state
    store.setState({
      isPlaying: isPlaying,
      isBuffering: isBuffering,
    });
  });

  // Track changed (next/previous)
  TrackPlayer.addEventListener(Event.PlaybackTrackChanged, async (event) => {
    console.log('Track changed event:', event);

    if (event.nextTrack !== undefined && event.nextTrack !== null) {
      const track = await TrackPlayer.getTrack(event.nextTrack);
      console.log('New track from TrackPlayer:', track);

      if (track) {
        // Get the queue from store to find the full track object
        const { queue } = store.getState();
        const fullTrack = queue.find(t => t.id === track.id);

        if (fullTrack) {
          // Use the full track object from queue
          store.setState({
            currentTrack: fullTrack,
            currentQueueIndex: event.nextTrack,
          });
          console.log('Updated currentTrack to:', fullTrack.title);

          // Preload next track in queue for instant playback
          const nextIndex = event.nextTrack + 1;
          if (nextIndex < queue.length) {
            const nextTrack = queue[nextIndex];
            console.log('Preloading next track:', nextTrack.title);
            preloadTrack(nextTrack);
          }
        } else {
          // Fallback: convert from TrackPlayer format
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
            currentQueueIndex: event.nextTrack,
          });
        }
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

  // Remote control events (lock screen, notification, control center)
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    console.log('Remote play pressed');
    await TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    console.log('Remote pause pressed');
    await TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    console.log('Remote next pressed');
    try {
      await TrackPlayer.skipToNext();
    } catch (error) {
      console.log('No next track available');
    }
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    console.log('Remote previous pressed');
    try {
      await TrackPlayer.skipToPrevious();
    } catch (error) {
      console.log('No previous track available');
    }
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    console.log('Remote stop pressed');
    await TrackPlayer.reset();
    store.setState({
      currentTrack: null,
      isPlaying: false,
    });
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async ({ position }) => {
    console.log('Remote seek to position:', position);
    await TrackPlayer.seekTo(position);
  });

  TrackPlayer.addEventListener(Event.RemoteJumpForward, async ({ interval }) => {
    console.log('Remote jump forward:', interval);
    const currentPosition = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(currentPosition + (interval || 15));
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async ({ interval }) => {
    console.log('Remote jump backward:', interval);
    const currentPosition = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(Math.max(0, currentPosition - (interval || 15)));
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
  try {
    await TrackPlayer.reset();
    // Note: destroy() was removed in react-native-track-player v3.x
    // TrackPlayer is a singleton and doesn't need explicit cleanup
  } catch (error) {
    console.log('Cleanup error:', error);
  }
}
