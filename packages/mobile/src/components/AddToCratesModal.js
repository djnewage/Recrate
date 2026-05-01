import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';

const CrateSelectTreeItem = ({
  crate,
  depth,
  selectedCrates,
  expandedCrates,
  onToggleSelect,
  onToggleExpand,
  excludeCrateId,
}) => {
  const isSelected = selectedCrates.includes(crate.id);
  const hasChildren = crate.children && crate.children.length > 0;
  const isExpanded = expandedCrates[crate.id];
  const isExcluded = crate.id === excludeCrateId;

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.crateSelectItem,
          isSelected && styles.crateSelectItemActive,
          isExcluded && styles.crateSelectItemDisabled,
          { paddingLeft: SPACING.md + depth * 20 },
        ]}
        onPress={() => !isExcluded && onToggleSelect(crate.id)}
        disabled={isExcluded}
      >
        {hasChildren ? (
          <TouchableOpacity
            style={styles.expandButton}
            onPress={(e) => {
              e.stopPropagation();
              onToggleExpand(crate.id);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isExpanded ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.expandPlaceholder} />
        )}

        <View style={styles.crateSelectInfo}>
          <Text style={styles.crateSelectName}>{crate.name}</Text>
          <Text style={styles.crateSelectCount}>
            {isExcluded
              ? 'Already in this crate'
              : `${crate.trackCount || 0} tracks${
                  hasChildren
                    ? ` · ${crate.children.length} subcrate${
                        crate.children.length > 1 ? 's' : ''
                      }`
                    : ''
                }`}
          </Text>
        </View>

        {!isExcluded && (
          <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
            {isSelected && (
              <Ionicons name="checkmark" size={16} color={COLORS.text} />
            )}
          </View>
        )}
      </TouchableOpacity>

      {hasChildren && isExpanded && (
        <View>
          {crate.children.map((child) => (
            <CrateSelectTreeItem
              key={child.id}
              crate={child}
              depth={depth + 1}
              selectedCrates={selectedCrates}
              expandedCrates={expandedCrates}
              onToggleSelect={onToggleSelect}
              onToggleExpand={onToggleExpand}
              excludeCrateId={excludeCrateId}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const AddToCratesModal = ({ visible, onClose, tracks = [], excludeCrateId }) => {
  const insets = useSafeAreaInsets();
  const [selectedCrates, setSelectedCrates] = useState([]);
  const [isAdding, setIsAdding] = useState(false);

  const {
    crateTree,
    expandedCrates,
    toggleCrateExpanded,
    loadCrates,
    addTracksToCrate,
  } = useStore();

  useEffect(() => {
    if (visible) {
      loadCrates();
      setSelectedCrates([]);
    }
  }, [visible]);

  const toggleCrateSelection = (crateId) => {
    setSelectedCrates((prev) =>
      prev.includes(crateId)
        ? prev.filter((id) => id !== crateId)
        : [...prev, crateId]
    );
  };

  const handleAdd = async () => {
    if (selectedCrates.length === 0 || tracks.length === 0) return;

    setIsAdding(true);
    const trackIds = tracks.map((t) => t.id);
    for (const crateId of selectedCrates) {
      await addTracksToCrate(crateId, trackIds);
    }
    setIsAdding(false);
    setSelectedCrates([]);
    onClose();
  };

  const trackCount = tracks.length;
  const crateCount = selectedCrates.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContent,
            { paddingTop: insets.top > 20 ? insets.top - 20 : insets.top },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Add{trackCount > 1 ? ` ${trackCount} Tracks` : ''} to Crates
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSubtitle}>Select one or more crates</Text>

          <View style={styles.cratesListContainer}>
            {crateTree.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="folder-open-outline"
                  size={48}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.emptyStateText}>No crates available</Text>
                <Text style={styles.emptyStateSubtext}>
                  Create a crate in the Crates tab first
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.cratesList}
                contentContainerStyle={styles.cratesListContent}
                showsVerticalScrollIndicator={false}
              >
                {crateTree.map((crate) => (
                  <CrateSelectTreeItem
                    key={crate.id}
                    crate={crate}
                    depth={0}
                    selectedCrates={selectedCrates}
                    expandedCrates={expandedCrates}
                    onToggleSelect={toggleCrateSelection}
                    onToggleExpand={toggleCrateExpanded}
                    excludeCrateId={excludeCrateId}
                  />
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalActionButton}
              onPress={onClose}
            >
              <Text style={styles.modalActionButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalActionButton,
                styles.modalActionButtonPrimary,
                crateCount === 0 && styles.modalActionButtonDisabled,
              ]}
              onPress={handleAdd}
              disabled={crateCount === 0 || isAdding}
            >
              {isAdding ? (
                <ActivityIndicator size="small" color={COLORS.text} />
              ) : (
                <Text style={styles.modalActionButtonTextPrimary}>
                  Add to {crateCount} Crate{crateCount !== 1 ? 's' : ''}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalContent: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  cratesListContainer: {
    flex: 1,
  },
  cratesList: {
    flex: 1,
  },
  cratesListContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.sm,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl * 2,
    paddingHorizontal: SPACING.xl,
  },
  emptyStateText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  emptyStateSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  crateSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.background,
    marginVertical: 2,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  crateSelectItemActive: {
    borderColor: COLORS.primary,
  },
  crateSelectItemDisabled: {
    opacity: 0.4,
  },
  expandButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
  },
  expandPlaceholder: {
    width: 24,
    marginRight: SPACING.xs,
  },
  crateSelectInfo: {
    flex: 1,
  },
  crateSelectName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs / 2,
  },
  crateSelectCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalActionButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  modalActionButtonPrimary: {
    backgroundColor: COLORS.primary,
  },
  modalActionButtonDisabled: {
    opacity: 0.5,
  },
  modalActionButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalActionButtonTextPrimary: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
});

export default AddToCratesModal;
