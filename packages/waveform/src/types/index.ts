/**
 * Spectral waveform data from server
 */
export interface SpectralWaveformData {
  trackId: string;
  duration: number;
  sampleCount: number;
  bands: {
    bass: number[];   // 20-250 Hz normalized 0-1
    mids: number[];   // 250-4000 Hz normalized 0-1
    highs: number[];  // 4000-20000 Hz normalized 0-1
  };
  peaks: number[];    // Combined amplitude for fallback
  generatedAt?: string;
}

/**
 * Cue point marker (future feature)
 */
export interface CuePoint {
  id: string;
  position: number;     // Time in seconds
  color: string;        // Hex color
  label?: string;
  type: 'hot_cue' | 'memory' | 'loop_in' | 'loop_out';
}

/**
 * Color scheme for waveform
 */
export interface WaveformColors {
  bass: string;       // Default: #EF4444 (red)
  mids: string;       // Default: #22C55E (green)
  highs: string;      // Default: #3B82F6 (blue)
  playhead: string;   // Default: #FFFFFF
  background?: string;
}

/**
 * Props for SpectralWaveform component
 */
export interface SpectralWaveformProps {
  // Data
  data: SpectralWaveformData | null;
  progress: number;           // 0-1 normalized playback position
  duration: number;           // Total duration in seconds

  // Dimensions
  width: number;
  height: number;

  // Colors (Serato-style defaults)
  colors?: Partial<WaveformColors>;

  // Interaction
  onSeek?: (positionSeconds: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  interactive?: boolean;

  // Cue points (future)
  cuePoints?: CuePoint[];
  onCuePointTap?: (cuePoint: CuePoint) => void;

  // Display options
  showPlayhead?: boolean;
  mirror?: boolean;           // Mirror waveform (top/bottom symmetric)
  barSpacing?: number;        // Gap between bars (0-1)
  playedOpacity?: number;     // Opacity for played section (default: 1)
  unplayedOpacity?: number;   // Opacity for unplayed section (default: 0.4)
}

/**
 * Default colors matching Serato DJ visual style
 * Based on research of actual Serato waveform appearance:
 * - Bass (< 200 Hz): Warm red/magenta
 * - Mids (200 Hz - 1.5 kHz): Purple (blend appearance)
 * - Highs (> 1.5 kHz): Cyan/light blue
 */
export const DEFAULT_COLORS: WaveformColors = {
  bass: '#E84855',    // Warm Red (kicks, bass lines)
  mids: '#9B5DE5',    // Purple (snares, vocals, synths)
  highs: '#00BBF9',   // Cyan (hi-hats, cymbals, crashes)
  playhead: '#FFFFFF',
};
