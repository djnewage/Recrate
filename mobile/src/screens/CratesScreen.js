import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';

const CratesScreen = ({ navigation, route }) => {
  const {
    crates,
    isLoadingCrates,
    loadCrates,
    createCrate,
    addTracksToCrate,
    deleteCrate,
    selectedTracks,
    clearSelection,
  } = useStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCrateName, setNewCrateName] = useState('');

  // Reload crates whenever the screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      loadCrates();
    }, [])
  );

  useEffect(() => {
    // If coming from Library with selected tracks
    if (route.params?.selectedTracks?.length > 0) {
      // Show option to select a crate
    }
  }, [route.params?.selectedTracks]);

  const handleCreateCrate = async () => {
    if (!newCrateName.trim()) {
      Alert.alert('Error', 'Please enter a crate name');
      return;
    }

    const success = await createCrate(newCrateName, '#8B5CF6');
    if (success) {
      setShowCreateModal(false);
      setNewCrateName('');
      Alert.alert('Success', 'Crate created successfully');
    } else {
      Alert.alert('Error', 'Failed to create crate');
    }
  };

  const handleCratePress = (crate) => {
    if (selectedTracks.length > 0) {
      Alert.alert(
        'Add to Crate',
        `Add ${selectedTracks.length} track(s) to "${crate.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add',
            onPress: async () => {
              const success = await addTracksToCrate(crate.id, selectedTracks);
              if (success) {
                clearSelection();
                Alert.alert('Success', 'Tracks added to crate');
                navigation.goBack();
              } else {
                Alert.alert('Error', 'Failed to add tracks to crate');
              }
            },
          },
        ]
      );
    } else {
      navigation.navigate('CrateDetail', { crateId: crate.id });
    }
  };

  const handleDeleteCrate = (crate) => {
    Alert.alert(
      'Delete Crate',
      `Are you sure you want to delete "${crate.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteCrate(crate.id);
            if (success) {
              Alert.alert('Success', 'Crate deleted successfully');
            } else {
              Alert.alert('Error', 'Failed to delete crate');
            }
          },
        },
      ]
    );
  };

  const renderCrateItem = ({ item }) => (
    <TouchableOpacity
      style={styles.crateItem}
      onPress={() => handleCratePress(item)}
      onLongPress={() => handleDeleteCrate(item)}
      activeOpacity={0.7}
    >
      <View style={styles.crateIcon} />
      <View style={styles.crateInfo}>
        <Text style={styles.crateName}>{item.name}</Text>
        <Text style={styles.crateCount}>
          {item.trackCount || 0} tracks
        </Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Crates</Text>
        <Text style={styles.subtitle}>{crates.length} crates</Text>
      </View>

      {/* Create Button */}
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setShowCreateModal(true)}
      >
        <Text style={styles.createButtonText}>+ Create New Crate</Text>
      </TouchableOpacity>

      {/* Crates List */}
      {isLoadingCrates ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading crates...</Text>
        </View>
      ) : crates.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No crates yet</Text>
          <Text style={styles.emptySubtext}>
            Create a crate to organize your tracks
          </Text>
        </View>
      ) : (
        <FlatList
          data={crates}
          keyExtractor={(item) => item.id}
          renderItem={renderCrateItem}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Create Crate Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Crate</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Crate name"
              placeholderTextColor={COLORS.textSecondary}
              value={newCrateName}
              onChangeText={setNewCrateName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewCrateName('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCreate]}
                onPress={handleCreateCrate}
              >
                <Text style={styles.modalButtonTextPrimary}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingTop: SPACING.xl * 2,
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
  createButton: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
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
  crateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  crateIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    marginRight: SPACING.md,
  },
  crateInfo: {
    flex: 1,
  },
  crateName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs / 2,
  },
  crateCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  arrow: {
    fontSize: FONT_SIZES.xxl,
    color: COLORS.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: COLORS.background,
  },
  modalButtonCreate: {
    backgroundColor: COLORS.primary,
  },
  modalButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalButtonTextPrimary: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
});

export default CratesScreen;
