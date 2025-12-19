import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';
import TrackRow from '../components/TrackRow';

const CrateDetailScreen = ({ route, navigation }) => {
  const { showActionSheetWithOptions } = useActionSheet();
  const { crateId } = route.params;
  const { selectedCrate, isLoadingCrates, loadCrate, removeTrackFromCrate } = useStore();
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState([]);
  const [sortBy, setSortBy] = useState('title');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCrate(crateId);
  }, [crateId]);

  // Exit edit mode when selection is cleared
  useEffect(() => {
    if (selectedTrackIds.length === 0 && isEditMode) {
      setIsEditMode(false);
    }
  }, [selectedTrackIds.length]);

  const handleTrackPress = async (track) => {
    if (isEditMode || selectedTrackIds.length > 0) {
      toggleTrackSelection(track.id);
    } else {
      // Set queue with all crate tracks (sorted)
      if (sortedTracks && sortedTracks.length > 0) {
        const trackIndex = sortedTracks.findIndex(t => t.id === track.id);
        const { setQueue } = useStore.getState();
        await setQueue(sortedTracks, trackIndex);
      }
      navigation.navigate('Player', { track });
    }
  };

  const handleTrackLongPress = (track) => {
    if (!isEditMode) {
      setIsEditMode(true);
    }
    toggleTrackSelection(track.id);
  };

  const toggleTrackSelection = (trackId) => {
    if (selectedTrackIds.includes(trackId)) {
      setSelectedTrackIds(selectedTrackIds.filter((id) => id !== trackId));
    } else {
      setSelectedTrackIds([...selectedTrackIds, trackId]);
    }
  };

  const handleEditPress = () => {
    setIsEditMode(!isEditMode);
    if (isEditMode) {
      setSelectedTrackIds([]);
    }
  };

  const handleRemoveTracks = () => {
    const count = selectedTrackIds.length;
    Alert.alert(
      'Remove Tracks',
      `Remove ${count} track${count > 1 ? 's' : ''} from this crate?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            let successCount = 0;
            for (const trackId of selectedTrackIds) {
              const success = await removeTrackFromCrate(crateId, trackId);
              if (success) successCount++;
            }

            setSelectedTrackIds([]);
            setIsEditMode(false);

            if (successCount === count) {
              Alert.alert('Success', `Removed ${count} track${count > 1 ? 's' : ''}`);
            } else {
              Alert.alert('Partial Success', `Removed ${successCount} of ${count} tracks`);
            }
          },
        },
      ]
    );
  };

  const handleRemoveTrack = (track) => {
    Alert.alert(
      'Remove Track',
      `Remove "${track.title}" from this crate?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const success = await removeTrackFromCrate(crateId, track.id);
            if (!success) {
              Alert.alert('Error', 'Failed to remove track from crate');
            }
          },
        },
      ]
    );
  };

  const handleTrackMenu = (track) => {
    const options = ['Play Now', 'Remove from Crate', 'Cancel'];
    const destructiveButtonIndex = 1;
    const cancelButtonIndex = 2;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
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
          handleRemoveTrack(track);
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

  const filterTracks = (tracks) => {
    if (!tracks) return [];
    if (!searchQuery.trim()) return tracks;

    const query = searchQuery.toLowerCase();
    return tracks.filter((track) => {
      const title = (track.title || '').toLowerCase();
      const artist = (track.artist || '').toLowerCase();
      const album = (track.album || '').toLowerCase();
      const key = (track.key || '').toLowerCase();

      return title.includes(query) ||
             artist.includes(query) ||
             album.includes(query) ||
             key.includes(query);
    });
  };

  const sortTracks = (tracksToSort) => {
    if (!tracksToSort) return [];

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

  // Filter first, then sort
  const filteredTracks = filterTracks(selectedCrate?.tracks);
  const sortedTracks = sortTracks(filteredTracks);

  if (isLoadingCrates || !selectedCrate) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading crate...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerInfo}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.title}>{selectedCrate.name}</Text>
              <Text style={styles.subtitle}>
                • {searchQuery ? `${sortedTracks.length} of ${selectedCrate.tracks?.length || 0}` : `${selectedCrate.tracks?.length || 0}`} tracks
              </Text>
            </View>
            {selectedTrackIds.length > 0 && (
              <Text style={styles.selectedText}>
                {selectedTrackIds.length} selected
              </Text>
            )}
          </View>
          <View style={styles.headerButtons}>
            {isEditMode && selectedTrackIds.length > 0 && (
              <TouchableOpacity
                style={[styles.headerButton, styles.removeButton]}
                onPress={handleRemoveTracks}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleEditPress}
            >
              <Text style={styles.headerButtonText}>
                {isEditMode ? 'Cancel' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={`Search in ${selectedCrate.name}...`}
          placeholderTextColor={COLORS.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery !== '' && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setSearchQuery('')}
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

      {/* Tracks List */}
      {selectedCrate.tracks?.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No tracks in this crate</Text>
          <Text style={styles.emptySubtext}>
            Add tracks from the library
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedTracks}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              onPress={handleTrackPress}
              onLongPress={handleTrackLongPress}
              onMenuPress={handleTrackMenu}
              isSelected={selectedTrackIds.includes(item.id)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
    padding: SPACING.md,
    paddingTop: 0,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  headerButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface,
  },
  headerButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  removeButton: {
    backgroundColor: '#EF4444',
  },
  removeButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '600',
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  selectedText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
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
  list: {
    paddingBottom: SPACING.xl * 3,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 70, // 16px padding + 42px badge + 12px gap
  },
});

export default CrateDetailScreen;
