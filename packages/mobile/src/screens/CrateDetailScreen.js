import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';
import TrackRow from '../components/TrackRow';
import AlphabetScrollBar from '../components/AlphabetScrollBar';
import AddToCratesModal from '../components/AddToCratesModal';
import useAlphabetIndex from '../hooks/useAlphabetIndex';
import { apiService } from '../services/api';

const CrateDetailScreen = ({ route, navigation }) => {
  const { showActionSheetWithOptions } = useActionSheet();
  const { crateId } = route.params;
  const {
    selectedCrate,
    loadCrate,
    removeTrackFromCrate,
    getDescendantCrateIds,
  } = useStore();
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState([]);
  const [sortBy, setSortBy] = useState('order');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
  const [searchQuery, setSearchQuery] = useState('');
  const [addToCrateTrack, setAddToCrateTrack] = useState(null);
  const [aggregated, setAggregated] = useState(null); // { tracks, crateCount } | null

  const flatListRef = useRef(null);

  useEffect(() => {
    loadCrate(crateId);
    setAggregated(null);
  }, [crateId]);

  // Aggregate sub-crate tracks when this crate has no direct tracks but has children.
  useEffect(() => {
    if (!selectedCrate) return;
    const directTracks = selectedCrate.tracks || [];
    if (directTracks.length > 0) {
      setAggregated(null);
      return;
    }

    const descendantIds = getDescendantCrateIds(selectedCrate.id);
    if (descendantIds.length === 0) {
      setAggregated(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          descendantIds.map((id) => apiService.getCrate(id).catch(() => null))
        );
        if (cancelled) return;

        const seen = new Set();
        const merged = [];
        let crateCount = 0;
        for (const c of results) {
          if (!c?.tracks?.length) continue;
          crateCount++;
          for (const t of c.tracks) {
            if (seen.has(t.id)) continue;
            seen.add(t.id);
            merged.push(t);
          }
        }
        setAggregated({ tracks: merged, crateCount });
      } catch {
        if (!cancelled) setAggregated(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCrate?.id, selectedCrate?.tracks?.length]);

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
    const isSmart = selectedCrate?.isSmart;
    // Aggregated views (parent crate showing sub-crate tracks) and smart crates
    // can't have tracks "removed from this crate" — the user is viewing tracks
    // that don't actually live here. Hide that option in those cases.
    const canRemove = !isSmart && !aggregated;

    const options = canRemove
      ? ['Play Now', 'Add to other Crate', 'Remove from Crate', 'Cancel']
      : ['Play Now', 'Add to other Crate', 'Cancel'];
    const destructiveButtonIndex = canRemove ? 2 : undefined;
    const cancelButtonIndex = canRemove ? 3 : 2;

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
          setAddToCrateTrack(track);
        } else if (canRemove && buttonIndex === 2) {
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

    if (sortBy === 'order') {
      // Preserve the array order Serato gave us. Filter is order-preserving so
      // a search-narrowed list still reflects crate order.
      return sortDirection === 'desc' ? [...tracksToSort].reverse() : tracksToSort;
    }

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

  const baseTracks = aggregated?.tracks ?? selectedCrate?.tracks ?? [];
  // Filter first, then sort
  const filteredTracks = filterTracks(baseTracks);
  const sortedTracks = sortTracks(filteredTracks);

  // Alphabet fast-scroll support
  const getTrackSortKey = useCallback((track) => {
    if (sortBy === 'order' || sortBy === 'bpm') {
      return track.title || '';
    }
    return track[sortBy] || track.title || '';
  }, [sortBy]);
  const alphabetIndex = useAlphabetIndex(sortedTracks, getTrackSortKey);

  const getItemLayout = useCallback((data, index) => ({
    length: 72,
    offset: 72 * index,
    index,
  }), []);

  const onScrollToIndexFailed = useCallback((info) => {
    flatListRef.current?.scrollToOffset({
      offset: info.averageItemLength * info.index,
      animated: false,
    });
  }, []);

  const handleScrollToLetter = useCallback((letter, itemIndex) => {
    if (itemIndex !== undefined && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: itemIndex,
        animated: false,
        viewPosition: 0,
      });
    }
  }, []);

  // Check if this is a local/offline crate
  const isLocalCrate = crateId.startsWith('temp-') || selectedCrate?.isLocal;
  const isSmartCrate = selectedCrate?.isSmart;
  const isAggregated = !!aggregated;

  // Only block render when we have no data yet. A background refresh of the
  // global crates list (e.g. from AddToCratesModal opening) flips
  // isLoadingCrates true, but we shouldn't unmount the whole screen for that —
  // doing so unmounts the modal too and creates an infinite re-load loop.
  if (!selectedCrate) {
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
                • {searchQuery ? `${sortedTracks.length} of ${baseTracks.length}` : `${baseTracks.length}`} tracks
              </Text>
            </View>
            {selectedTrackIds.length > 0 && (
              <Text style={styles.selectedText}>
                {selectedTrackIds.length} selected
              </Text>
            )}
          </View>
          <View style={styles.headerButtons}>
            {!isSmartCrate && !isAggregated && isEditMode && selectedTrackIds.length > 0 && (
              <TouchableOpacity
                style={[styles.headerButton, styles.removeButton]}
                onPress={handleRemoveTracks}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            )}
            {!isSmartCrate && !isAggregated && (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleEditPress}
              >
                <Text style={styles.headerButtonText}>
                  {isEditMode ? 'Cancel' : 'Edit'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Offline/Local crate banner */}
      {isLocalCrate && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-upload-outline" size={16} color={COLORS.warning} />
          <Text style={styles.offlineBannerText}>Local crate (pending sync)</Text>
        </View>
      )}

      {/* Smart crate banner */}
      {isSmartCrate && (
        <View style={styles.offlineBanner}>
          <Ionicons name="sparkles" size={16} color="#EC4899" />
          <Text style={styles.offlineBannerText}>Smart crate · managed by Serato rules</Text>
        </View>
      )}

      {/* Sub-crate aggregation banner */}
      {isAggregated && (
        <View style={[styles.offlineBanner, styles.aggregatedBanner]}>
          <Ionicons name="albums-outline" size={16} color={COLORS.primary} />
          <Text style={[styles.offlineBannerText, { color: COLORS.primary }]}>
            Showing {aggregated.tracks.length} tracks from {aggregated.crateCount} sub-crate{aggregated.crateCount === 1 ? '' : 's'}
          </Text>
        </View>
      )}

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
        {['order', 'title', 'artist', 'bpm'].map((option) => (
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
      {baseTracks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No tracks in this crate</Text>
          <Text style={styles.emptySubtext}>
            Add tracks from the library
          </Text>
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
                isSelected={selectedTrackIds.includes(item.id)}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            getItemLayout={getItemLayout}
            onScrollToIndexFailed={onScrollToIndexFailed}
          />
          <AlphabetScrollBar
            alphabetIndex={alphabetIndex}
            onScrollToLetter={handleScrollToLetter}
            visible={sortedTracks.length > 0}
          />
        </View>
      )}

      <AddToCratesModal
        visible={!!addToCrateTrack}
        onClose={() => setAddToCrateTrack(null)}
        tracks={addToCrateTrack ? [addToCrateTrack] : []}
        excludeCrateId={crateId}
      />
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
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.xs,
  },
  offlineBannerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.warning,
    fontWeight: '500',
  },
  aggregatedBanner: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
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
  listContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  list: {
    paddingBottom: SPACING.xl * 3,
    paddingRight: 20,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 70, // 16px padding + 42px badge + 12px gap
  },
});

export default CrateDetailScreen;
