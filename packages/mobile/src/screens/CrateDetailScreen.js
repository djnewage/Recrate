import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';
import TrackItem from '../components/TrackItem';

const CrateDetailScreen = ({ route, navigation }) => {
  const { crateId } = route.params;
  const { selectedCrate, isLoadingCrates, loadCrate, removeTrackFromCrate } = useStore();
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState([]);

  useEffect(() => {
    loadCrate(crateId);
  }, [crateId]);

  // Exit edit mode when selection is cleared
  useEffect(() => {
    if (selectedTrackIds.length === 0 && isEditMode) {
      setIsEditMode(false);
    }
  }, [selectedTrackIds.length]);

  const handleTrackPress = (track) => {
    if (isEditMode || selectedTrackIds.length > 0) {
      toggleTrackSelection(track.id);
    } else {
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
            <Text style={styles.title}>{selectedCrate.name}</Text>
            <Text style={styles.subtitle}>
              {selectedCrate.tracks?.length || 0} tracks
              {selectedTrackIds.length > 0 &&
                ` • ${selectedTrackIds.length} selected`}
            </Text>
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
          data={selectedCrate.tracks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TrackItem
              track={item}
              onPress={handleTrackPress}
              onLongPress={() => !isEditMode && handleRemoveTrack(item)}
              isSelected={selectedTrackIds.includes(item.id)}
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
    paddingTop: SPACING.xl,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  headerButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface,
  },
  headerButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: '600',
  },
  removeButton: {
    backgroundColor: '#EF4444',
  },
  removeButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '600',
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
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl * 3,
  },
});

export default CrateDetailScreen;
