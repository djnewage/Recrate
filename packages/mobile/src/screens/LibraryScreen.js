import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';
import TrackRow from '../components/TrackRow';

const LibraryScreen = ({ navigation }) => {
  const {
    tracks,
    selectedTracks,
    isLoadingLibrary,
    libraryPagination,
    loadLibrary,
    loadMoreTracks,
    toggleTrackSelection,
    clearSelection,
    playTrack,
    searchQuery,
    searchResults,
    search,
    clearSearch,
  } = useStore();

  const [sortBy, setSortBy] = useState('title');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    loadLibrary();
  }, []);

  // Exit edit mode when selection is cleared
  useEffect(() => {
    if (selectedTracks.length === 0 && isEditMode) {
      setIsEditMode(false);
    }
  }, [selectedTracks.length]);

  const displayTracks = searchQuery ? searchResults : tracks;

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
    navigation.navigate('Crates', { selectedTracks });
  };

  const handleTrackMenu = (track) => {
    // TODO: Implement action sheet menu
    Alert.alert(
      track.title,
      'Menu options coming soon',
      [
        { text: 'Play Now', onPress: () => handleTrackPress(track) },
        { text: 'Add to Crate', onPress: () => navigation.navigate('Crates', { selectedTracks: [track.id] }) },
        { text: 'Cancel', style: 'cancel' },
      ]
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
        default:
          return 0;
      }

      // Reverse if descending
      return sortDirection === 'desc' ? -comparison : comparison;
    });
  };

  const sortedTracks = sortTracks(displayTracks);

  const handleEndReached = () => {
    // Only trigger pagination for library view, not search results
    if (!searchQuery && libraryPagination.hasMore && !isLoadingLibrary) {
      loadMoreTracks();
    }
  };

  const renderFooter = () => {
    if (!libraryPagination.hasMore || searchQuery) {
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
            {tracks.length}
            {libraryPagination.total > 0 && libraryPagination.total !== tracks.length
              ? ` of ${libraryPagination.total}`
              : ''} tracks
          </Text>
          <TouchableOpacity
            style={styles.editButton}
            onPress={handleEditPress}
          >
            <Text style={styles.editButtonText}>
              {isEditMode ? 'Cancel' : 'Edit'}
            </Text>
          </TouchableOpacity>
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
        {['title', 'artist', 'bpm'].map((option) => (
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
      {isLoadingLibrary && tracks.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading library...</Text>
        </View>
      ) : (
        <FlatList
          data={sortedTracks}
          keyExtractor={(item) => item.id}
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
          showsVerticalScrollIndicator={true}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
        />
      )}
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
  list: {
    paddingBottom: SPACING.xl * 3,
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
});

export default LibraryScreen;
