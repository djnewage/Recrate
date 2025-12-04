import { Audio } from 'expo-av';

let currentRecording = null;
let isCleaningUp = false;

// Small delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const AudioRecordingService = {
  async requestPermissions() {
    const { granted } = await Audio.requestPermissionsAsync();
    return granted;
  },

  async cleanupPreviousRecording() {
    if (isCleaningUp) {
      // Wait for previous cleanup to finish
      await delay(100);
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
          // Recording might already be unloaded
        }
        currentRecording = null;
      }

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      // Delay to let iOS audio system settle (increased for stability with sequential recordings)
      await delay(300);
    } finally {
      isCleaningUp = false;
    }
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

    // Delay after mode change (increased for stability with sequential recordings)
    await delay(150);

    // Create new recording
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

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
      await delay(200);
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
    } catch (e) {
      // Ignore audio mode errors
    }

    return uri;
  },

  async cancelRecording() {
    await this.cleanupPreviousRecording();
  },

  isRecording() {
    return currentRecording !== null && !isCleaningUp;
  },
};

export default AudioRecordingService;
