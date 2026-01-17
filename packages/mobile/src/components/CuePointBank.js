import React, { useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';

const { width } = Dimensions.get('window');

// Cue point colors (Serato-inspired, fixed per bank)
const CUE_COLORS = {
  1: '#EF4444', // Red
  2: '#F97316', // Orange
  3: '#EAB308', // Yellow
  4: '#22C55E', // Green
  5: '#06B6D4', // Cyan
  6: '#3B82F6', // Blue
  7: '#A855F7', // Purple
  8: '#EC4899', // Pink
};

// Button dimensions
const CONTAINER_PADDING = SPACING.xl;
const BUTTON_GAP = 8;
const BUTTONS_PER_ROW = 4;
const TOTAL_GAPS = BUTTONS_PER_ROW - 1;
const AVAILABLE_WIDTH = width - (CONTAINER_PADDING * 2);
const BUTTON_WIDTH = (AVAILABLE_WIDTH - (TOTAL_GAPS * BUTTON_GAP)) / BUTTONS_PER_ROW;
const BUTTON_HEIGHT = 44;

// Long press duration for delete
const LONG_PRESS_DURATION = 500;

/**
 * Format time in seconds to MM:SS format
 */
const formatTime = (seconds) => {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Individual cue button component
 */
const CueButton = ({ bankNumber, cuePoint, onTap, onLongPress, isLoading }) => {
  // Use Serato color from cue point if available, fallback to default
  const color = cuePoint?.color || CUE_COLORS[bankNumber];
  const isSet = cuePoint !== undefined && cuePoint !== null;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pressTimer = useRef(null);
  const isLongPress = useRef(false);

  const handlePressIn = useCallback(() => {
    isLongPress.current = false;

    // Scale down animation
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();

    // Start long press timer if cue is set
    if (isSet) {
      pressTimer.current = setTimeout(() => {
        isLongPress.current = true;
        onLongPress(bankNumber);
      }, LONG_PRESS_DURATION);
    }
  }, [isSet, bankNumber, onLongPress, scaleAnim]);

  const handlePressOut = useCallback(() => {
    // Clear long press timer
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }

    // Scale back animation
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();

    // If not a long press, trigger tap action
    if (!isLongPress.current) {
      onTap(bankNumber, isSet);
    }
  }, [bankNumber, isSet, onTap, scaleAnim]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
      }
    };
  }, []);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.cueButton,
          isSet ? styles.cueButtonSet : styles.cueButtonEmpty,
          isSet && { borderColor: color, backgroundColor: `${color}20` },
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        disabled={isLoading}
      >
        <View style={styles.cueButtonContent}>
          <Text
            style={[
              styles.cueButtonNumber,
              isSet && { color },
            ]}
          >
            {bankNumber}
          </Text>
          {isSet && (
            <Text
              style={[styles.cueButtonTime, { color }]}
              numberOfLines={1}
            >
              {formatTime(cuePoint.position)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

/**
 * CuePointBank component - displays 8 cue point buttons in 2 rows
 */
const CuePointBank = ({
  trackId,
  currentPosition = 0,
  duration = 0,
  onSeek,
}) => {
  const {
    cuePointsCache,
    isLoadingCuePoints,
    loadCuePoints,
    setCuePoint,
    deleteCuePoint,
  } = useStore();

  const cuePoints = cuePointsCache[trackId] || {};

  // Load cue points when track changes
  useEffect(() => {
    if (trackId) {
      loadCuePoints(trackId);
    }
  }, [trackId, loadCuePoints]);

  // Refresh cue points when screen gains focus (catches external changes in Serato)
  useFocusEffect(
    React.useCallback(() => {
      if (trackId) {
        // Try to refresh, but silently fall back to cache if offline
        loadCuePoints(trackId, true).catch(() => {
          // Offline - cache already returned by loadCuePoints
        });
      }
    }, [trackId, loadCuePoints])
  );

  const handleTap = useCallback(async (bankNumber, isSet) => {
    if (isSet) {
      // Seek to cue point position
      const cuePoint = cuePoints[bankNumber];
      if (cuePoint && onSeek) {
        onSeek(cuePoint.position);
      }
    } else {
      // Validate position before setting cue
      const validPosition = typeof currentPosition === 'number' && !isNaN(currentPosition)
        ? currentPosition
        : 0;
      const success = await setCuePoint(trackId, bankNumber, validPosition);
      if (!success) {
        Alert.alert(
          'Cue Point Error',
          'Failed to set cue point. Please check your connection.'
        );
      }
    }
  }, [trackId, cuePoints, currentPosition, onSeek, setCuePoint]);

  const handleLongPress = useCallback(async (bankNumber) => {
    // Delete the cue point
    const success = await deleteCuePoint(trackId, bankNumber);
    if (!success) {
      Alert.alert(
        'Cue Point Error',
        'Failed to delete cue point. Please check your connection.'
      );
    }
  }, [trackId, deleteCuePoint]);

  // Render 8 buttons in 2 rows of 4
  const renderRow = (startBank) => (
    <View style={styles.row}>
      {[0, 1, 2, 3].map((offset) => {
        const bankNumber = startBank + offset;
        return (
          <CueButton
            key={bankNumber}
            bankNumber={bankNumber}
            cuePoint={cuePoints[bankNumber]}
            onTap={handleTap}
            onLongPress={handleLongPress}
            isLoading={isLoadingCuePoints}
          />
        );
      })}
    </View>
  );

  return (
    <View style={styles.container}>
      {renderRow(1)}
      {renderRow(5)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: CONTAINER_PADDING,
    paddingVertical: SPACING.sm,
    gap: BUTTON_GAP,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: BUTTON_GAP,
  },
  cueButton: {
    width: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  cueButtonEmpty: {
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  cueButtonSet: {
    borderStyle: 'solid',
  },
  cueButtonContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cueButtonNumber: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.3)',
  },
  cueButtonTime: {
    fontSize: FONT_SIZES.xs - 1,
    fontWeight: '500',
    marginTop: 1,
  },
});

export default CuePointBank;
