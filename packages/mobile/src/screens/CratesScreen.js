import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';
import useSubscription from '../hooks/useSubscription';
import useSubscriptionStore from '../store/subscriptionStore';
import { LockBadge } from '../components/UpgradePrompt';

// Recursive component for rendering crate tree items
const CrateTreeItem = ({
  crate,
  depth,
  isExpanded,
  onToggle,
  onPress,
  onLongPress,
  expandedCrates,
  selectedTracks,
}) => {
  const hasChildren = crate.children && crate.children.length > 0;
  // Auto-expand if filtering and this node has matching children
  const shouldExpand = isExpanded || crate._autoExpand;

  return (
    <View>
      <TouchableOpacity
        style={[styles.crateItem, { paddingLeft: 16 + depth * 24 }]}
        onPress={() => onPress(crate)}
        onLongPress={() => onLongPress(crate)}
        activeOpacity={0.6}
      >
        {/* Expand/Collapse button for parent crates */}
        {hasChildren ? (
          <TouchableOpacity
            style={styles.expandButton}
            onPress={() => onToggle(crate.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={shouldExpand ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.expandButtonPlaceholder} />
        )}

        <View style={styles.crateIcon}>
          <Ionicons
            name={hasChildren ? 'folder' : 'folder-outline'}
            size={24}
            color="#8B5CF6"
          />
        </View>
        <View style={styles.crateInfo}>
          <Text style={styles.crateName}>{crate.name}</Text>
          <Text style={styles.crateCount}>
            {crate.trackCount || 0} tracks
            {hasChildren ? ` · ${crate.children.length} subcrate${crate.children.length > 1 ? 's' : ''}` : ''}
          </Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      {/* Render children if expanded or auto-expanded during search */}
      {hasChildren && shouldExpand && (
        <View>
          {crate.children.map(child => (
            <CrateTreeItem
              key={child.id}
              crate={child}
              depth={depth + 1}
              isExpanded={expandedCrates[child.id]}
              onToggle={onToggle}
              onPress={onPress}
              onLongPress={onLongPress}
              expandedCrates={expandedCrates}
              selectedTracks={selectedTracks}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const CratesScreen = ({ navigation, route }) => {
  const {
    crates,
    crateTree,
    expandedCrates,
    isLoadingCrates,
    loadCrates,
    createCrate,
    addTracksToCrate,
    deleteCrate,
    toggleCrateExpanded,
    selectedTracks: storeSelectedTracks,
    clearSelection,
  } = useStore();

  const {
    isPremium,
    canCreateCrate,
    canCreateSubcrate,
    remainingFreeCrates,
    showPaywall,
    FEATURES,
  } = useSubscription();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCrateName, setNewCrateName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState(null); // For subcrate creation
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [routeSelectedTracks, setRouteSelectedTracks] = useState([]);

  // Reload crates whenever the screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      loadCrates();
    }, [])
  );

  // Update subscription store with crate count for gating
  useEffect(() => {
    // Count only top-level crates for the free tier limit
    const topLevelCrateCount = crateTree.length;
    useSubscriptionStore.getState().updateCrateCount(topLevelCrateCount);
  }, [crateTree]);

  useEffect(() => {
    // If coming from Library with selected tracks via route params
    if (route.params?.selectedTracks?.length > 0) {
      setRouteSelectedTracks(route.params.selectedTracks);
    }
  }, [route.params?.selectedTracks]);

  // Use route params if available, otherwise fall back to store selection
  const selectedTracks = routeSelectedTracks.length > 0 ? routeSelectedTracks : storeSelectedTracks;

  const handleCreateButtonPress = () => {
    // Check if user can create a crate
    if (!canCreateCrate) {
      showPaywall(FEATURES.UNLIMITED_CRATES);
      return;
    }
    setShowCreateModal(true);
  };

  const handleCreateCrate = async () => {
    if (!newCrateName.trim()) {
      Alert.alert('Error', 'Please enter a crate name');
      return;
    }

    // Check subcrate permission
    if (selectedParentId && !canCreateSubcrate) {
      setShowCreateModal(false);
      showPaywall(FEATURES.NESTED_CRATES);
      return;
    }

    const success = await createCrate(newCrateName, '#8B5CF6', selectedParentId);
    if (success) {
      setShowCreateModal(false);
      setNewCrateName('');
      setSelectedParentId(null);
      // Auto-expand parent if we created a subcrate
      if (selectedParentId) {
        const { setCrateExpanded } = useStore.getState();
        setCrateExpanded(selectedParentId, true);
      }
      Alert.alert('Success', selectedParentId ? 'Subcrate created successfully' : 'Crate created successfully');
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
                // Clear both route params and store selection
                setRouteSelectedTracks([]);
                clearSelection();
                // Clear route params to prevent re-triggering
                navigation.setParams({ selectedTracks: undefined });
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

  // Recursive filter that preserves parent chain when children match
  const filterTree = (nodes, query) => {
    if (!query.trim()) return nodes;

    const lowerQuery = query.toLowerCase();

    return nodes.reduce((acc, node) => {
      const nodeMatches = node.name.toLowerCase().includes(lowerQuery);
      const filteredChildren = node.children ? filterTree(node.children, query) : [];

      // Include node if it matches OR if any children match
      if (nodeMatches || filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: filteredChildren,
          // Mark if this node should be auto-expanded (has matching children)
          _autoExpand: filteredChildren.length > 0,
        });
      }
      return acc;
    }, []);
  };

  // Recursive sort at each level of the tree
  const sortTree = (nodes, sortField, direction) => {
    const sorted = [...nodes].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'trackCount':
          comparison = (a.trackCount || 0) - (b.trackCount || 0);
          break;
        case 'lastModified':
          comparison = (a.lastModified || 0) - (b.lastModified || 0);
          break;
        default:
          return 0;
      }
      return direction === 'desc' ? -comparison : comparison;
    });

    // Recursively sort children
    return sorted.map(node => ({
      ...node,
      children: node.children ? sortTree(node.children, sortField, direction) : [],
    }));
  };

  // Compute filtered and sorted tree
  const displayTree = useMemo(() => {
    let result = crateTree;
    if (searchQuery.trim()) {
      result = filterTree(result, searchQuery);
    }
    result = sortTree(result, sortBy, sortDirection);
    return result;
  }, [crateTree, searchQuery, sortBy, sortDirection]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Crates</Text>
          <Text style={styles.subtitle}>{crates.length} crates</Text>
        </View>
        <TouchableOpacity
          style={[styles.createButton, !canCreateCrate && styles.createButtonLocked]}
          onPress={handleCreateButtonPress}
        >
          <Text style={styles.createButtonText}>Create</Text>
          {!canCreateCrate && <LockBadge size="small" />}
        </TouchableOpacity>
      </View>

      {/* Selection Banner - shown when adding tracks to crate */}
      {selectedTracks.length > 0 && (
        <View style={styles.selectionBanner}>
          <Text style={styles.selectionBannerText}>
            Select a crate to add {selectedTracks.length} track{selectedTracks.length > 1 ? 's' : ''}
          </Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              setRouteSelectedTracks([]);
              clearSelection();
              navigation.setParams({ selectedTracks: undefined });
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search crates..."
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
        {['name', 'trackCount', 'lastModified'].map((option) => (
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
              {option === 'name' ? 'Name' : option === 'trackCount' ? 'Track Count' : 'Last Modified'}
              {sortBy === option && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Crates List */}
      {isLoadingCrates ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading crates...</Text>
        </View>
      ) : displayTree.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {searchQuery ? 'No crates found' : 'No crates yet'}
          </Text>
          <Text style={styles.emptySubtext}>
            {searchQuery
              ? 'Try a different search term'
              : 'Create a crate to organize your tracks'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {displayTree.map(crate => (
            <CrateTreeItem
              key={crate.id}
              crate={crate}
              depth={0}
              isExpanded={expandedCrates[crate.id]}
              onToggle={toggleCrateExpanded}
              onPress={handleCratePress}
              onLongPress={handleDeleteCrate}
              expandedCrates={expandedCrates}
              selectedTracks={selectedTracks}
            />
          ))}
        </ScrollView>
      )}

      {/* Create Crate Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCreateModal(false);
          setSelectedParentId(null);
        }}
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

            {/* Parent Crate Picker - Premium only */}
            {isPremium ? (
              <>
                <Text style={styles.modalLabel}>Parent Crate (optional)</Text>
                <ScrollView style={styles.parentPicker} nestedScrollEnabled>
                  <TouchableOpacity
                    style={[
                      styles.parentPickerItem,
                      selectedParentId === null && styles.parentPickerItemSelected,
                    ]}
                    onPress={() => setSelectedParentId(null)}
                  >
                    <Ionicons
                      name="home-outline"
                      size={18}
                      color={selectedParentId === null ? COLORS.primary : COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.parentPickerText,
                        selectedParentId === null && styles.parentPickerTextSelected,
                      ]}
                    >
                      Root level (no parent)
                    </Text>
                  </TouchableOpacity>
                  {crates.map(crate => (
                    <TouchableOpacity
                      key={crate.id}
                      style={[
                        styles.parentPickerItem,
                        { paddingLeft: 16 + (crate.depth || 0) * 16 },
                        selectedParentId === crate.id && styles.parentPickerItemSelected,
                      ]}
                      onPress={() => setSelectedParentId(crate.id)}
                    >
                      <Ionicons
                        name="folder-outline"
                        size={18}
                        color={selectedParentId === crate.id ? COLORS.primary : COLORS.textSecondary}
                      />
                      <Text
                        style={[
                          styles.parentPickerText,
                          selectedParentId === crate.id && styles.parentPickerTextSelected,
                        ]}
                      >
                        {crate.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              <TouchableOpacity
                style={styles.nestedCratesPromo}
                onPress={() => {
                  setShowCreateModal(false);
                  showPaywall(FEATURES.NESTED_CRATES);
                }}
              >
                <Ionicons name="git-branch" size={18} color={COLORS.primary} />
                <Text style={styles.nestedCratesPromoText}>
                  Upgrade to create nested crates
                </Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewCrateName('');
                  setSelectedParentId(null);
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    position: 'relative',
  },
  createButtonLocked: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  createButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  selectionBannerText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  cancelButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
    opacity: 0.8,
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
    paddingBottom: SPACING.xl * 3,
  },
  crateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  crateIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  crateInfo: {
    flex: 1,
  },
  crateName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  crateCount: {
    fontSize: 13,
    fontWeight: '400',
    color: '#999999',
  },
  arrow: {
    fontSize: 24,
    color: '#999999',
  },
  expandButton: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  expandButtonPlaceholder: {
    width: 24,
    marginRight: 4,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 70, // 16px padding + 42px icon + 12px gap
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
  modalLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  parentPicker: {
    maxHeight: 150,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
  },
  parentPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  parentPickerItemSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  parentPickerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  parentPickerTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  nestedCratesPromo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  nestedCratesPromoText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
});

export default CratesScreen;
