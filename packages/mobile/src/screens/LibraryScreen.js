import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';
import TrackRow from '../components/TrackRow';
import FilterModal from '../components/FilterModal';

const LibraryScreen = ({ navigation }) => {
  const { showActionSheetWithOptions } = useActionSheet();

  const {
    tracks,
    selectedTracks,
    isLoadingLibrary,
    libraryPagination,
    isIndexing,
    indexingStatus,
    indexingMessage,
    loadLibrary,
    loadMoreTracks,
    toggleTrackSelection,
    clearSelection,
    playTrack,
    searchQuery,
    searchResults,
    search,
    clearSearch,
    stopIndexingPoll,
    isFilterActive,
    getFilteredTracks,
    toggleFilterDrawer,
  } = useStore();

  const [sortBy, setSortBy] = useState('title');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
  const [isEditMode, setIsEditMode] = useState(false);
  const [scrollBarHeight, setScrollBarHeight] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [currentLetter, setCurrentLetter] = useState(null);

  const flatListRef = useRef(null);
  const scrollBarRef = useRef(null);

  useEffect(() => {
    loadLibrary();

    // Cleanup: stop polling when component unmounts
    return () => {
      stopIndexingPoll();
    };
  }, []);

  // Exit edit mode when selection is cleared
  useEffect(() => {
    if (selectedTracks.length === 0 && isEditMode) {
      setIsEditMode(false);
    }
  }, [selectedTracks.length]);

  // Apply search or filters
  let displayTracks = searchQuery ? searchResults : tracks;

  // Apply filters if active and not searching
  if (!searchQuery && isFilterActive) {
    displayTracks = getFilteredTracks();
  }

  const handleTrackPress = async (track) => {
    if (isEditMode || selectedTracks.length > 0) {
      toggleTrackSelection(track.id);
    } else {
      // Find the index of the tapped track in the current list
      const trackIndex = sortedTracks.findIndex(t => t.id === track.id);

      // Set queue with all tracks, starting at the tapped track
      const { setQueue, playTrack } = useStore.getState();
      await setQueue(sortedTracks, trackIndex);

      // Navigate to player
      navigation.navigate('Player', { track });
    }
  };

  const handleTrackLongPress = (track) => {
    if (!isEditMode) {
      setIsEditMode(true);
    }
    toggleTrackSelection(track.id);
  };

  const handleEditPress = () => {
    setIsEditMode(!isEditMode);
    if (isEditMode) {
      clearSelection();
    }
  };

  const handleAddToCrate = () => {
    if (selectedTracks.length === 0) {
      Alert.alert('No tracks selected', 'Please select tracks to add to a crate');
      return;
    }
    navigation.navigate('Crates', {
      screen: 'CratesList',
      params: { selectedTracks },
    });
  };

  const handleTrackMenu = (track) => {
    const options = ['Play Now', 'Add to Crate', 'Cancel'];
    const cancelButtonIndex = 2;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: track.title,
        message: track.artist,
        containerStyle: {
          backgroundColor: COLORS.surface,
        },
        textStyle: {
          color: COLORS.text,
        },
        titleTextStyle: {
          color: COLORS.text,
          fontWeight: 'bold',
        },
        messageTextStyle: {
          color: COLORS.textSecondary,
        },
      },
      (buttonIndex) => {
        if (buttonIndex === 0) {
          handleTrackPress(track);
        } else if (buttonIndex === 1) {
          navigation.navigate('Crates', {
            screen: 'CratesList',
            params: { selectedTracks: [track.id] },
          });
        }
      }
    );
  };

  const handleSortPress = (field) => {
    if (sortBy === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Reset to ascending if different field
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  const sortTracks = (tracksToSort) => {
    return [...tracksToSort].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'title':
          comparison = (a.title || '').localeCompare(b.title || '');
          break;
        case 'artist':
          comparison = (a.artist || '').localeCompare(b.artist || '');
          break;
        case 'bpm':
          comparison = (a.bpm || 0) - (b.bpm || 0);
          break;
        case 'key':
          comparison = (a.key || '').localeCompare(b.key || '');
          break;
        default:
          return 0;
      }

      // Reverse if descending
      return sortDirection === 'desc' ? -comparison : comparison;
    });
  };

  const sortedTracks = sortTracks(displayTracks);

  // Build alphabet index for fast scrolling
  const alphabetIndex = useMemo(() => {
    const letters = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const index = {};

    sortedTracks.forEach((track, idx) => {
      let firstChar = '#';
      const sortField = sortBy === 'bpm' ? 'title' : sortBy; // Fall back to title for BPM
      const value = track[sortField] || track.title || '';

      if (value.length > 0) {
        const char = value.charAt(0).toUpperCase();
        if (/[A-Z]/.test(char)) {
          firstChar = char;
        }
      }

      if (index[firstChar] === undefined) {
        index[firstChar] = idx;
      }
    });

    return { letters, index };
  }, [sortedTracks, sortBy]);

  // Handle fast scroll via alphabet bar
  const handleAlphabetScroll = useCallback((letter) => {
    const targetIndex = alphabetIndex.index[letter];
    if (targetIndex !== undefined && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: targetIndex,
        animated: false,
        viewPosition: 0,
      });
      setCurrentLetter(letter);
    }
  }, [alphabetIndex]);

  // Pan responder for dragging on alphabet bar
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      setIsDragging(true);
      handleScrollBarTouch(evt.nativeEvent.locationY);
    },
    onPanResponderMove: (evt) => {
      handleScrollBarTouch(evt.nativeEvent.locationY);
    },
    onPanResponderRelease: () => {
      setIsDragging(false);
      setTimeout(() => setCurrentLetter(null), 500);
    },
    onPanResponderTerminate: () => {
      setIsDragging(false);
      setTimeout(() => setCurrentLetter(null), 500);
    },
  }), [scrollBarHeight, alphabetIndex]);

  const handleScrollBarTouch = useCallback((y) => {
    if (scrollBarHeight === 0) return;

    const letters = alphabetIndex.letters;
    const letterHeight = scrollBarHeight / letters.length;
    const index = Math.min(Math.max(0, Math.floor(y / letterHeight)), letters.length - 1);
    const letter = letters[index];

    handleAlphabetScroll(letter);
  }, [scrollBarHeight, alphabetIndex, handleAlphabetScroll]);

  const onScrollBarLayout = useCallback((event) => {
    setScrollBarHeight(event.nativeEvent.layout.height);
  }, []);

  const getItemLayout = useCallback((data, index) => ({
    length: 72, // Approximate height of TrackRow
    offset: 72 * index,
    index,
  }), []);

  const onScrollToIndexFailed = useCallback((info) => {
    // Fallback: scroll to a safe position and retry
    flatListRef.current?.scrollToOffset({
      offset: info.averageItemLength * info.index,
      animated: false,
    });
  }, []);

  const handleEndReached = () => {
    console.log('[handleEndReached] Called. State:', {
      searchQuery: !!searchQuery,
      hasMore: libraryPagination.hasMore,
      isLoadingLibrary,
    });

    // Only trigger pagination for library view, not search results
    if (!searchQuery && libraryPagination.hasMore && !isLoadingLibrary) {
      console.log('[handleEndReached] Calling loadMoreTracks');
      loadMoreTracks();
    }
  };

  const renderFooter = () => {
    // Only show loading spinner when actually loading more tracks
    if (!isLoadingLibrary || !libraryPagination.hasMore || searchQuery) {
      return null;
    }

    return (
      <View style={styles.footerContainer}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.footerText}>Loading more tracks...</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Library</Text>
          <Text style={styles.trackCount}>
            {isFilterActive
              ? `${displayTracks.length} of ${tracks.length} tracks`
              : `${tracks.length}${
                  libraryPagination.total > 0 && libraryPagination.total !== tracks.length
                    ? ` of ${libraryPagination.total}`
                    : ''
                } tracks`}
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.identifyButton}
              onPress={() => navigation.navigate('IdentifyTrack')}
            >
              <Ionicons name="mic" size={20} color={COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editButton}
              onPress={handleEditPress}
            >
              <Text style={styles.editButtonText}>
                {isEditMode ? 'Cancel' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {selectedTracks.length > 0 && (
          <Text style={styles.subtitle}>
            {selectedTracks.length} selected
          </Text>
        )}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search tracks..."
          placeholderTextColor={COLORS.textSecondary}
          value={searchQuery}
          onChangeText={search}
        />
        {searchQuery !== '' && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearSearch}
          >
            <Text style={styles.clearButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        {['title', 'artist', 'bpm', 'key'].map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.sortButton,
              sortBy === option && styles.sortButtonActive,
            ]}
            onPress={() => handleSortPress(option)}
          >
            <Text
              style={[
                styles.sortButtonText,
                sortBy === option && styles.sortButtonTextActive,
              ]}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
              {sortBy === option && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Filter Button */}
        <TouchableOpacity
          style={[
            styles.filterButton,
            isFilterActive && styles.filterButtonActive,
          ]}
          onPress={toggleFilterDrawer}
        >
          <Ionicons
            name="filter"
            size={16}
            color={isFilterActive ? COLORS.text : COLORS.textSecondary}
          />
          {isFilterActive && <View style={styles.filterIndicator} />}
        </TouchableOpacity>
      </View>

      {/* Selection Actions */}
      {selectedTracks.length > 0 && (
        <View style={styles.selectionActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={clearSelection}
          >
            <Text style={styles.actionButtonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonPrimary]}
            onPress={handleAddToCrate}
          >
            <Text style={styles.actionButtonTextPrimary}>
              Add to Crate
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Track List */}
      {isLoadingLibrary && tracks.length === 0 && !isIndexing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading library...</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          <FlatList
            ref={flatListRef}
            data={sortedTracks}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={({ item }) => (
              <TrackRow
                track={item}
                onPress={handleTrackPress}
                onLongPress={handleTrackLongPress}
                onMenuPress={handleTrackMenu}
                isSelected={selectedTracks.includes(item.id)}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            getItemLayout={getItemLayout}
            onScrollToIndexFailed={onScrollToIndexFailed}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={10}
          />

          {/* Alphabet Fast Scroll Bar */}
          {sortedTracks.length > 50 && (
            <View
              ref={scrollBarRef}
              style={styles.alphabetBar}
              onLayout={onScrollBarLayout}
              {...panResponder.panHandlers}
            >
              {alphabetIndex.letters.map((letter) => {
                const hasItems = alphabetIndex.index[letter] !== undefined;
                return (
                  <View
                    key={letter}
                    style={[
                      styles.alphabetLetterContainer,
                      currentLetter === letter && styles.alphabetLetterActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.alphabetLetter,
                        !hasItems && styles.alphabetLetterDisabled,
                        currentLetter === letter && styles.alphabetLetterTextActive,
                      ]}
                    >
                      {letter}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Current Letter Popup */}
          {isDragging && currentLetter && (
            <View style={styles.letterPopup}>
              <Text style={styles.letterPopupText}>{currentLetter}</Text>
            </View>
          )}
        </View>
      )}

      {/* Indexing Overlay */}
      {isIndexing && (
        <View style={styles.indexingOverlay}>
          <View style={styles.indexingCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.indexingTitle}>Indexing Library</Text>
            <Text style={styles.indexingMessage}>
              {indexingMessage || 'Building your music library...'}
            </Text>

            {indexingStatus && (
              <View style={styles.indexingDetails}>
                <Text style={styles.indexingDetailText}>
                  Phase: {indexingStatus.progress?.phase || 'preparing'}
                </Text>
                {indexingStatus.progress?.filesIndexed > 0 && (
                  <Text style={styles.indexingDetailText}>
                    Files indexed: {indexingStatus.progress.filesIndexed.toLocaleString()}
                  </Text>
                )}
                {indexingStatus.progress?.tracksFound > 0 && (
                  <Text style={styles.indexingDetailText}>
                    Tracks found: {indexingStatus.progress.tracksFound.toLocaleString()}
                  </Text>
                )}
                {indexingStatus.duration && (
                  <Text style={styles.indexingDetailText}>
                    Duration: {Math.round(indexingStatus.duration / 1000)}s
                  </Text>
                )}
              </View>
            )}

            <Text style={styles.indexingNote}>
              This may take a few minutes for large libraries
            </Text>
          </View>
        </View>
      )}

      {/* Filter Modal */}
      <FilterModal />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  trackCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    flex: 1,
    textAlign: 'right',
    marginRight: SPACING.md,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  identifyButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface,
  },
  editButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface,
  },
  editButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  clearButton: {
    position: 'absolute',
    right: SPACING.md + SPACING.sm,
    padding: SPACING.sm,
  },
  clearButtonText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  sortContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  sortButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface,
  },
  sortButtonActive: {
    backgroundColor: COLORS.primary,
  },
  sortButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  sortButtonTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  filterButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minWidth: 40,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
  },
  filterIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.secondary,
  },
  selectionActions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  actionButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: COLORS.primary,
  },
  actionButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  actionButtonTextPrimary: {
    color: COLORS.text,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  listContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  list: {
    paddingBottom: SPACING.xl * 3,
    paddingRight: 20, // Space for alphabet bar
  },
  alphabetBar: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 100, // Leave space for footer
    width: 20,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: SPACING.xs,
    zIndex: 10,
  },
  alphabetLetterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 20,
  },
  alphabetLetterActive: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
  },
  alphabetLetter: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  alphabetLetterDisabled: {
    color: 'rgba(255, 255, 255, 0.2)',
  },
  alphabetLetterTextActive: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  letterPopup: {
    position: 'absolute',
    left: '40%',
    top: '40%',
    width: 80,
    height: 80,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  letterPopupText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 70, // 16px padding + 42px badge + 12px gap
  },
  footerContainer: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  indexingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  indexingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  indexingTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  indexingMessage: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  indexingDetails: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    width: '100%',
    marginTop: SPACING.sm,
  },
  indexingDetailText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  indexingNote: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.md,
    fontStyle: 'italic',
  },
});

export default LibraryScreen;
