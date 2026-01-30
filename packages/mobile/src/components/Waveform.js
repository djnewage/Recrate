import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Svg, { Path, Defs, ClipPath, Rect, G } from 'react-native-svg';
import { COLORS } from '../constants/theme';

/**
 * Waveform Component
 *
 * Renders a mirror waveform visualization with playback progress.
 * Supports tap-to-seek functionality.
 *
 * Props:
 * - peaks: number[] - Array of normalized amplitude values (0-1)
 * - progress: number (0-1) - Current playback position
 * - duration: number - Track duration in seconds
 * - onSeek: (position: number) => void - Callback when user taps to seek
 * - width: number - Component width
 * - height: number - Component height
 * - playedColor: string - Color for played portion
 * - unplayedColor: string - Color for unplayed portion
 * - interactive: boolean - Enable/disable tap-to-seek
 */
const Waveform = ({
  peaks = [],
  progress = 0,
  duration = 0,
  onSeek,
  width = 300,
  height = 60,
  playedColor = COLORS.primary,
  unplayedColor = `${COLORS.primary}4D`, // 30% opacity
  interactive = true,
}) => {
  // Generate SVG path for mirror waveform
  const waveformPath = useMemo(() => {
    if (!peaks || peaks.length === 0) {
      return '';
    }

    const peakCount = peaks.length;
    const barWidth = width / peakCount;
    const centerY = height / 2;
    const maxBarHeight = (height / 2) * 0.9; // 90% of half height

    // Build path for mirror waveform
    // Start from left, draw top half, then bottom half
    let pathData = '';

    // Draw top half (left to right)
    pathData += `M 0 ${centerY} `;

    for (let i = 0; i < peakCount; i++) {
      const x = i * barWidth + barWidth / 2;
      const amplitude = Math.max(0.02, peaks[i]); // Minimum height for visibility
      const y = centerY - amplitude * maxBarHeight;
      pathData += `L ${x} ${y} `;
    }

    // Draw to right edge at center
    pathData += `L ${width} ${centerY} `;

    // Draw bottom half (right to left, mirrored)
    for (let i = peakCount - 1; i >= 0; i--) {
      const x = i * barWidth + barWidth / 2;
      const amplitude = Math.max(0.02, peaks[i]);
      const y = centerY + amplitude * maxBarHeight;
      pathData += `L ${x} ${y} `;
    }

    // Close path
    pathData += 'Z';

    return pathData;
  }, [peaks, width, height]);

  // Handle tap to seek
  const handlePress = useCallback(
    (event) => {
      if (!interactive || !onSeek || duration <= 0) return;

      const { locationX } = event.nativeEvent;
      const normalizedPosition = Math.max(0, Math.min(1, locationX / width));
      const seekTime = normalizedPosition * duration;
      onSeek(seekTime);
    },
    [interactive, onSeek, width, duration]
  );

  // Calculate progress clip width
  const progressWidth = Math.max(0, Math.min(1, progress)) * width;

  // If no peaks, show placeholder
  if (!peaks || peaks.length === 0) {
    return (
      <View style={[styles.container, { width, height }]}>
        <View style={[styles.placeholder, { backgroundColor: unplayedColor }]} />
      </View>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={!interactive}
      style={[styles.container, { width, height }]}
    >
      <Svg width={width} height={height}>
        <Defs>
          <ClipPath id="playedClip">
            <Rect x={0} y={0} width={progressWidth} height={height} />
          </ClipPath>
        </Defs>

        {/* Unplayed waveform (full width, dimmed) */}
        <Path d={waveformPath} fill={unplayedColor} />

        {/* Played waveform (clipped to progress) */}
        <G clipPath="url(#playedClip)">
          <Path d={waveformPath} fill={playedColor} />
        </G>

        {/* Progress line indicator */}
        <Rect
          x={progressWidth - 1}
          y={0}
          width={2}
          height={height}
          fill={playedColor}
        />
      </Svg>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    borderRadius: 4,
    opacity: 0.3,
  },
});

export default React.memo(Waveform);
