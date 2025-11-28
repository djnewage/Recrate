import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';

import BPMRangeSlider from './BPMRangeSlider';
import KeySelectionChips from './KeySelectionChips';
import GenreChips from './GenreChips';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const MODAL_WIDTH = Math.min(SCREEN_WIDTH * 0.9, 400);

const FilterModal = () => {
  const insets = useSafeAreaInsets();
  const [localFilters, setLocalFilters] = useState(null);

  // Animation values
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.95)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalTranslateY = useRef(new Animated.Value(20)).current;

  const {
    tracks,
    filters,
    isFilterDrawerOpen,
    isFilterActive,
    setFilterDrawerOpen,
    setFilters,
    resetFilters,
    applyFilters,
    getFilteredTracks,
  } = useStore();

  // Initialize local filters from store
  useEffect(() => {
    if (isFilterDrawerOpen) {
      setLocalFilters(filters);
    }
  }, [isFilterDrawerOpen, filters]);

  // Run animations when modal opens/closes
  useEffect(() => {
    if (isFilterDrawerOpen) {
      // Open animation
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(modalScale, {
          toValue: 1,
          damping: 20,
          stiffness: 300,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(modalTranslateY, {
          toValue: 0,
          damping: 25,
          stiffness: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset animation values
      backdropOpacity.setValue(0);
      modalScale.setValue(0.95);
      modalOpacity.setValue(0);
      modalTranslateY.setValue(20);
    }
  }, [isFilterDrawerOpen]);

  // Extract available genres from tracks
  const availableGenres = useMemo(() => {
    const genreSet = new Set();
    tracks.forEach((track) => {
      if (track.genre && track.genre.trim()) {
        genreSet.add(track.genre.trim());
      }
    });
    return Array.from(genreSet);
  }, [tracks]);

  // Calculate filtered track count
  const filteredCount = useMemo(() => {
    if (!localFilters) return tracks.length;

    return tracks.filter((track) => {
      // BPM filter
      if (track.bpm) {
        const bpm = parseInt(track.bpm, 10);
        if (bpm < localFilters.bpmRange.min || bpm > localFilters.bpmRange.max) {
          return false;
        }
      }

      // Key filter
      if (localFilters.selectedKeys.length > 0 && track.key) {
        if (!localFilters.selectedKeys.includes(track.key)) {
          return false;
        }
      }

      // Genre filter
      if (localFilters.selectedGenres.length > 0 && track.genre) {
        if (!localFilters.selectedGenres.includes(track.genre)) {
          return false;
        }
      }

      return true;
    }).length;
  }, [tracks, localFilters]);

  const handleClose = useCallback(() => {
    // Close animation
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(modalScale, {
        toValue: 0.98,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslateY, {
        toValue: 20,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setFilterDrawerOpen(false);
    });
  }, [setFilterDrawerOpen]);

  const handleReset = () => {
    setLocalFilters({
      bpmRange: { min: 60, max: 180 },
      selectedKeys: [],
      selectedGenres: [],
    });
    resetFilters();
  };

  const handleApplyFilters = () => {
    setFilters(localFilters);
    applyFilters();
    handleClose();
  };

  if (!localFilters) return null;

  return (
    <Modal
      visible={isFilterDrawerOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Modal Container */}
      <View style={styles.centeredView}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              width: MODAL_WIDTH,
              opacity: modalOpacity,
              transform: [
                { scale: modalScale },
                { translateY: modalTranslateY },
              ],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Filters</Text>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.headerDivider} />

          {/* Scrollable Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* BPM Range */}
            <BPMRangeSlider
              min={60}
              max={180}
              value={localFilters.bpmRange}
              onChange={(bpmRange) => setLocalFilters({ ...localFilters, bpmRange })}
            />

            {/* Key Selection */}
            <KeySelectionChips
              selectedKeys={localFilters.selectedKeys}
              onChange={(selectedKeys) => setLocalFilters({ ...localFilters, selectedKeys })}
            />

            {/* Genre Selection */}
            <GenreChips
              selectedGenres={localFilters.selectedGenres}
              availableGenres={availableGenres}
              onChange={(selectedGenres) => setLocalFilters({ ...localFilters, selectedGenres })}
            />
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {/* Track Count */}
            <Text style={styles.trackCount}>
              Showing <Text style={styles.trackCountHighlight}>{filteredCount}</Text> of {tracks.length} tracks
            </Text>

            {/* Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.resetButton}
                onPress={handleReset}
                activeOpacity={0.7}
              >
                <Text style={styles.resetButtonText}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.applyButton}
                onPress={handleApplyFilters}
                activeOpacity={0.7}
              >
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.5)',
    // Ensure the modal has height for scrolling content
    height: SCREEN_HEIGHT * 0.7,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  closeButton: {
    padding: 4,
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(51, 65, 85, 0.5)',
    marginHorizontal: 28,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 8,
  },
  footer: {
    paddingHorizontal: 28,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(51, 65, 85, 0.5)',
  },
  trackCount: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
  },
  trackCountHighlight: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  resetButton: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  applyButton: {
    flex: 1.5,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default FilterModal;
