import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
  State,
} from 'react-native-track-player';
import apiService from './api';

// Debounce lock for error recovery to prevent race conditions
let isRecoveringFromError = false;
let lastErrorRecoveryTime = 0;
const ERROR_RECOVERY_COOLDOWN = 2000; // 2 second cooldown between recovery attempts

/**
 * Wait for TrackPlayer to reach a stable state (not loading/buffering)
 * This prevents issues from interacting with the player while it's still loading
 */
async function waitForStableState(maxWait = 3000) {
  const startTime = Date.now();
  const stableStates = [State.Ready, State.Playing, State.Paused, State.Stopped, State.Error];

  while (Date.now() - startTime < maxWait) {
    try {
      const playbackState = await TrackPlayer.getPlaybackState();
      if (stableStates.includes(playbackState.state)) {
        return playbackState;
      }
    } catch (err) {
      // Error getting state, continue waiting
    }
    // Wait 100ms before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Return whatever state we have after timeout
  try {
    return await TrackPlayer.getPlaybackState();
  } catch (err) {
    return { state: State.Error };
  }
}

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
    return true;
  }

  try {
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

    return true;
  } catch (error) {
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
 * Preload a track by fetching initial bytes to warm up the connection
 * This significantly reduces playback start delay
 */
export async function preloadTrack(track) {
  try {
    const streamUrl = apiService.getStreamUrl(track.id);

    // Fetch first 256KB to warm up connection and start caching
    fetch(streamUrl, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-262143', // First 256KB
      },
    }).catch(() => {
      // Silently fail - this is just optimization
    });
  } catch (error) {
    // Non-critical - continue
  }
}

/**
 * Play a specific track (clears queue and plays immediately)
 */
export async function playTrack(track) {
  try {
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
    return false;
  }
}

/**
 * Setup event handlers that connect to Zustand store
 */
export function setupEventHandlers(store) {
  // Track playback state changes (from both app and remote controls)
  TrackPlayer.addEventListener(Event.PlaybackState, async ({ state }) => {
    const isPlaying = state === State.Playing;
    const isBuffering = state === State.Buffering || state === State.Loading;

    // Update store to sync UI with actual playback state
    store.setState({
      isPlaying: isPlaying,
      isBuffering: isBuffering,
    });
  });

  // Track changed (next/previous)
  // NOTE: In v5, PlaybackTrackChanged was replaced with PlaybackActiveTrackChanged
  // The event structure changed: { track, index } instead of { nextTrack, track }
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
    const track = event.track;
    const trackIndex = event.index;

    // Skip listener-driven updates while setQueue is mid-flight; the queue
    // and currentTrack have already been set synchronously by setQueue.
    if (store.getState().isLoadingTrack) {
      return;
    }

    if (track) {
      // Get the queue from store to find the full track object
      const { queue } = store.getState();
      const fullTrack = queue.find(t => t.id === track.id);

      if (fullTrack) {
        // Find the actual index in the full queue (not TrackPlayer's index)
        const actualQueueIndex = queue.findIndex(t => t.id === track.id);

        // Use the full track object from queue
        store.setState({
          currentTrack: fullTrack,
          currentQueueIndex: actualQueueIndex >= 0 ? actualQueueIndex : trackIndex,
        });

        // Check if we need to replenish TrackPlayer queue (for large libraries)
        const tpQueue = await TrackPlayer.getQueue();
        const REPLENISH_THRESHOLD = 20;
        const TRACKS_TO_ADD = 100;
        const currentIndex = trackIndex ?? 0;
        const remainingInTP = tpQueue.length - currentIndex - 1;

        if (remainingInTP < REPLENISH_THRESHOLD) {
          // Find which tracks from the full queue are already in TrackPlayer
          const tpTrackIds = new Set(tpQueue.map(t => t.id));

          // Find next tracks in queue that aren't in TrackPlayer yet
          const tracksToAdd = [];
          for (let i = actualQueueIndex + 1; i < queue.length && tracksToAdd.length < TRACKS_TO_ADD; i++) {
            if (!tpTrackIds.has(queue[i].id)) {
              tracksToAdd.push(queue[i]);
            }
          }

          if (tracksToAdd.length > 0) {
            const formattedTracks = tracksToAdd.map(t => formatTrackForPlayer(t));
            await TrackPlayer.add(formattedTracks);
          }
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
          currentQueueIndex: trackIndex,
        });
      }
    }
  });

  // Playback error - try to recover by skipping to next working track
  TrackPlayer.addEventListener(Event.PlaybackError, async ({ error }) => {
    // Debounce: prevent multiple concurrent recovery attempts
    const now = Date.now();
    if (isRecoveringFromError) {
      return;
    }
    if (now - lastErrorRecoveryTime < ERROR_RECOVERY_COOLDOWN) {
      return;
    }

    isRecoveringFromError = true;
    lastErrorRecoveryTime = now;

    const MAX_SKIP_ATTEMPTS = 5; // Try up to 5 consecutive tracks

    try {
      const queue = await TrackPlayer.getQueue();
      const startIndex = await TrackPlayer.getActiveTrackIndex();

      if (startIndex === null || startIndex >= queue.length - 1) {
        isRecoveringFromError = false;
        store.setState({ playerError: error.message || 'Playback error occurred', isPlaying: false });
        return;
      }

      // Reset player state before skipping
      try {
        await TrackPlayer.pause();
        await TrackPlayer.seekTo(0);
      } catch (resetError) {
        // Reset failed, continuing
      }

      // Try consecutive tracks until one works
      for (let attempt = 0; attempt < MAX_SKIP_ATTEMPTS; attempt++) {
        const nextIndex = startIndex + 1 + attempt;

        if (nextIndex >= queue.length) {
          break;
        }

        try {
          await TrackPlayer.skip(nextIndex);
        } catch (skipErr) {
          continue;
        }

        // Wait for stable state (not loading/buffering) with 3 second timeout
        const playbackState = await waitForStableState(3000);

        // Check if this track also failed
        if (playbackState.state === State.Error) {
          continue; // Try next track
        }

        // Success! Track is ready or playing
        if (playbackState.state === State.Ready || playbackState.state === State.Paused || playbackState.state === State.Stopped) {
          await TrackPlayer.play();
        } else if (playbackState.state !== State.Playing) {
          try {
            await TrackPlayer.play();
          } catch (playErr) {
            // Play failed, track may auto-start
          }
        }

        isRecoveringFromError = false;
        return; // Successfully recovered
      }

      // All attempts failed

    } catch (recoveryError) {
      // Recovery failed
    }

    isRecoveringFromError = false;

    // Only set error state if we couldn't recover
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
    await TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    await TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    try {
      await TrackPlayer.skipToNext();
    } catch (error) {
      // No next track available
    }
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    try {
      await TrackPlayer.skipToPrevious();
    } catch (error) {
      // No previous track available
    }
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    await TrackPlayer.reset();
    store.setState({
      currentTrack: null,
      isPlaying: false,
    });
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async ({ position }) => {
    await TrackPlayer.seekTo(position);
  });

  TrackPlayer.addEventListener(Event.RemoteJumpForward, async ({ interval }) => {
    const currentPosition = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(currentPosition + (interval || 15));
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async ({ interval }) => {
    const currentPosition = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(Math.max(0, currentPosition - (interval || 15)));
  });
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
    // Cleanup error - ignore
  }
}
