import { Audio } from 'expo-av';

let currentRecording = null;
let cleanupPromise = null;

// Small delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const AudioRecordingService = {
  async requestPermissions() {
    const { granted } = await Audio.requestPermissionsAsync();
    return granted;
  },

  async cleanupPreviousRecording() {
    // Wait for any existing cleanup to complete (Promise-based lock)
    if (cleanupPromise) {
      await cleanupPromise;
    }

    // Create new cleanup promise
    cleanupPromise = (async () => {
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
              // Ignore - recording already unloaded
            }
          }
          currentRecording = null;
        }

        // Reset audio mode
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });

        // Longer delay to let iOS audio system fully settle
        await delay(800);
      } finally {
        cleanupPromise = null;
      }
    })();

    await cleanupPromise;
  },

  async startRecording() {
    // Clean up any existing recording first
    await this.cleanupPreviousRecording();

    // Request permissions
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Microphone permission not granted');
    }

    // Configure audio mode for recording
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    // Longer delay after mode change for iOS stability
    await delay(400);

    // Create new recording with retry logic for iOS audio session issues
    let recording = null;
    let lastError = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recording = result.recording;
        break;
      } catch (error) {
        lastError = error;
        console.log(`Recording attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          // Full audio session reset between retries
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
          });
          // Progressive backoff: 500ms, 1000ms
          await delay(500 * attempt);
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
          });
          await delay(400);
        }
      }
    }

    if (!recording) {
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
  },

  isRecording() {
    return currentRecording !== null && !cleanupPromise;
  },
};

export default AudioRecordingService;
