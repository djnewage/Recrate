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
import TrackItem from '../components/TrackItem';

const LibraryScreen = ({ navigation }) => {
  const {
    tracks,
    selectedTracks,
    isLoadingLibrary,
    loadLibrary,
    toggleTrackSelection,
    clearSelection,
    playTrack,
    searchQuery,
    searchResults,
    search,
    clearSearch,
  } = useStore();

  const [sortBy, setSortBy] = useState('title');

  useEffect(() => {
    loadLibrary();
  }, []);

  const displayTracks = searchQuery ? searchResults : tracks;

  const handleTrackPress = (track) => {
    if (selectedTracks.length > 0) {
      toggleTrackSelection(track.id);
    } else {
      navigation.navigate('Player', { track });
    }
  };

  const handleTrackLongPress = (track) => {
    toggleTrackSelection(track.id);
  };

  const handleAddToCrate = () => {
    if (selectedTracks.length === 0) {
      Alert.alert('No tracks selected', 'Please select tracks to add to a crate');
      return;
    }
    navigation.navigate('Crates', { selectedTracks });
  };

  const sortTracks = (tracksToSort) => {
    return [...tracksToSort].sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'artist':
          return (a.artist || '').localeCompare(b.artist || '');
        case 'bpm':
          return (b.bpm || 0) - (a.bpm || 0);
        default:
          return 0;
      }
    });
  };

  const sortedTracks = sortTracks(displayTracks);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        <Text style={styles.subtitle}>
          {tracks.length} tracks
          {selectedTracks.length > 0 &&
            ` • ${selectedTracks.length} selected`}
        </Text>
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
            onPress={() => setSortBy(option)}
          >
            <Text
              style={[
                styles.sortButtonText,
                sortBy === option && styles.sortButtonTextActive,
              ]}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
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
      {isLoadingLibrary ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading library...</Text>
        </View>
      ) : (
        <FlatList
          data={sortedTracks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TrackItem
              track={item}
              onPress={handleTrackPress}
              onLongPress={handleTrackLongPress}
              isSelected={selectedTracks.includes(item.id)}
            />
          )}
          contentContainerStyle={styles.list}
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
    padding: SPACING.lg,
    paddingTop: SPACING.xl * 3,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  clearButton: {
    position: 'absolute',
    right: SPACING.lg + SPACING.md,
    padding: SPACING.sm,
  },
  clearButtonText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  sortContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  sortButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
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
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl * 3,
  },
});

export default LibraryScreen;
