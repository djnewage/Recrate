import { Audio } from 'expo-av';
import TrackPlayer, { State } from 'react-native-track-player';

let currentRecording = null;
let isCleaningUp = false;
let wasPlayingBeforeRecord = false;

// Small delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const AudioRecordingService = {
  async requestPermissions() {
    const { granted } = await Audio.requestPermissionsAsync();
    return granted;
  },

  /**
   * Pause TrackPlayer to release audio session
   * iOS can only have one audio session active at a time
   */
  async pausePlaybackForRecording() {
    try {
      const state = await TrackPlayer.getState();
      wasPlayingBeforeRecord = state === State.Playing;

      if (state === State.Playing || state === State.Buffering) {
        await TrackPlayer.pause();
        // Give iOS time to fully release the playback audio session
        await delay(500);
      }
    } catch (e) {
      // TrackPlayer might not be initialized, that's fine
      console.log('TrackPlayer not active, proceeding with recording');
    }
  },

  /**
   * Resume playback if it was playing before recording
   */
  async resumePlaybackAfterRecording() {
    if (wasPlayingBeforeRecord) {
      try {
        await TrackPlayer.play();
      } catch (e) {
        // Ignore - user may have manually stopped
      }
      wasPlayingBeforeRecord = false;
    }
  },

  async cleanupPreviousRecording() {
    // Simple mutex to prevent concurrent cleanup
    if (isCleaningUp) {
      while (isCleaningUp) {
        await delay(100);
      }
      return;
    }

    isCleaningUp = true;

    try {
      if (currentRecording) {
        try {
          const status = await currentRecording.getStatusAsync();
          if (status.isRecording) {
            await currentRecording.stopAndUnloadAsync();
          } else if (status.isDoneRecording) {
            await currentRecording.unloadAsync();
          }
        } catch (e) {
          // Recording might already be unloaded, try force unload
          try {
            await currentRecording.unloadAsync();
          } catch (unloadError) {
            // Already unloaded
          }
        }
        currentRecording = null;
      }

      // Reset audio mode
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      } catch (e) {
        // Ignore
      }

      // Wait for iOS audio system to settle
      await delay(500);
    } finally {
      isCleaningUp = false;
    }
  },

  async startRecording() {
    // Step 1: Pause any playback to release audio session
    await this.pausePlaybackForRecording();

    // Step 2: Clean up previous recording
    await this.cleanupPreviousRecording();

    // Step 3: Request permissions
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Microphone permission not granted');
    }

    // Step 4: Try to start recording with robust retry
    let recording = null;
    let lastError = null;
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Configure audio mode for recording
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        // Wait for audio mode to take effect (longer on first attempt)
        await delay(attempt === 1 ? 600 : 400);

        // Create recording
        const result = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recording = result.recording;
        console.log(`Recording started on attempt ${attempt}`);
        break;
      } catch (error) {
        lastError = error;
        console.log(`Recording attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          // Full reset between retries
          try {
            await Audio.setAudioModeAsync({
              allowsRecordingIOS: false,
              playsInSilentModeIOS: true,
            });
          } catch (e) {
            // Ignore
          }

          // Progressive backoff: 800ms, 1000ms, 1200ms, 1400ms
          await delay(600 + (attempt * 200));
        }
      }
    }

    if (!recording) {
      // Restore playback if recording failed
      await this.resumePlaybackAfterRecording();
      throw lastError || new Error('Failed to start recording after retries');
    }

    currentRecording = recording;
    return recording;
  },

  async stopRecording() {
    if (!currentRecording) {
      return null;
    }

    let uri = null;

    try {
      // Get URI before stopping
      uri = currentRecording.getURI();

      // Stop and unload
      await currentRecording.stopAndUnloadAsync();
      // Allow audio session to settle before mode change
      await delay(300);
    } catch (e) {
      // Try to get URI even if stop failed
      if (!uri && currentRecording) {
        try {
          uri = currentRecording.getURI();
        } catch (uriError) {
          // Ignore
        }
      }
    }

    currentRecording = null;

    // Reset audio mode
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      // Give iOS time to release the audio session
      await delay(300);
    } catch (e) {
      // Ignore audio mode errors
    }

    return uri;
  },

  async cancelRecording() {
    await this.cleanupPreviousRecording();
    await this.resumePlaybackAfterRecording();
  },

  isRecording() {
    return currentRecording !== null && !isCleaningUp;
  },
};

export default AudioRecordingService;
