import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MUSICAL_KEYS = [
  // Major keys
  { value: 'C', label: 'C', type: 'major' },
  { value: 'Db', label: 'Db', type: 'major' },
  { value: 'D', label: 'D', type: 'major' },
  { value: 'Eb', label: 'Eb', type: 'major' },
  { value: 'E', label: 'E', type: 'major' },
  { value: 'F', label: 'F', type: 'major' },
  { value: 'Gb', label: 'Gb', type: 'major' },
  { value: 'G', label: 'G', type: 'major' },
  { value: 'Ab', label: 'Ab', type: 'major' },
  { value: 'A', label: 'A', type: 'major' },
  { value: 'Bb', label: 'Bb', type: 'major' },
  { value: 'B', label: 'B', type: 'major' },
  // Minor keys
  { value: 'Cm', label: 'Cm', type: 'minor' },
  { value: 'Dbm', label: 'Dbm', type: 'minor' },
  { value: 'Dm', label: 'Dm', type: 'minor' },
  { value: 'Ebm', label: 'Ebm', type: 'minor' },
  { value: 'Em', label: 'Em', type: 'minor' },
  { value: 'Fm', label: 'Fm', type: 'minor' },
  { value: 'Gbm', label: 'Gbm', type: 'minor' },
  { value: 'Gm', label: 'Gm', type: 'minor' },
  { value: 'Abm', label: 'Abm', type: 'minor' },
  { value: 'Am', label: 'Am', type: 'minor' },
  { value: 'Bbm', label: 'Bbm', type: 'minor' },
  { value: 'Bm', label: 'Bm', type: 'minor' },
  // Camelot keys (A = minor, B = major)
  { value: '1A', label: '1A', type: 'camelot' },
  { value: '1B', label: '1B', type: 'camelot' },
  { value: '2A', label: '2A', type: 'camelot' },
  { value: '2B', label: '2B', type: 'camelot' },
  { value: '3A', label: '3A', type: 'camelot' },
  { value: '3B', label: '3B', type: 'camelot' },
  { value: '4A', label: '4A', type: 'camelot' },
  { value: '4B', label: '4B', type: 'camelot' },
  { value: '5A', label: '5A', type: 'camelot' },
  { value: '5B', label: '5B', type: 'camelot' },
  { value: '6A', label: '6A', type: 'camelot' },
  { value: '6B', label: '6B', type: 'camelot' },
  { value: '7A', label: '7A', type: 'camelot' },
  { value: '7B', label: '7B', type: 'camelot' },
  { value: '8A', label: '8A', type: 'camelot' },
  { value: '8B', label: '8B', type: 'camelot' },
  { value: '9A', label: '9A', type: 'camelot' },
  { value: '9B', label: '9B', type: 'camelot' },
  { value: '10A', label: '10A', type: 'camelot' },
  { value: '10B', label: '10B', type: 'camelot' },
  { value: '11A', label: '11A', type: 'camelot' },
  { value: '11B', label: '11B', type: 'camelot' },
  { value: '12A', label: '12A', type: 'camelot' },
  { value: '12B', label: '12B', type: 'camelot' },
];

const KeySelectionChips = ({ selectedKeys = [], onChange }) => {
  const handleToggle = (key) => {
    if (selectedKeys.includes(key)) {
      onChange(selectedKeys.filter((k) => k !== key));
    } else {
      onChange([...selectedKeys, key]);
    }
  };

  const renderKeyChip = (keyItem) => {
    const isSelected = selectedKeys.includes(keyItem.value);

    return (
      <TouchableOpacity
        key={keyItem.value}
        style={styles.chipWrapper}
        onPress={() => handleToggle(keyItem.value)}
        activeOpacity={0.7}
      >
        <View style={[styles.chip, isSelected && styles.chipSelected]}>
          <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
            {keyItem.label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const majorKeys = MUSICAL_KEYS.filter((k) => k.type === 'major');
  const minorKeys = MUSICAL_KEYS.filter((k) => k.type === 'minor');
  const camelotKeys = MUSICAL_KEYS.filter((k) => k.type === 'camelot');

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>KEY</Text>

      {/* Major Keys */}
      <Text style={styles.typeLabel}>Major</Text>
      <View style={styles.grid}>
        {majorKeys.map(renderKeyChip)}
      </View>

      {/* Minor Keys */}
      <Text style={styles.typeLabel}>Minor</Text>
      <View style={styles.grid}>
        {minorKeys.map(renderKeyChip)}
      </View>

      {/* Camelot Keys */}
      <Text style={styles.typeLabel}>Camelot</Text>
      <View style={styles.grid}>
        {camelotKeys.map(renderKeyChip)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 8,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 8,
  },
  chipWrapper: {
    width: '16.666%', // 6 columns
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  chip: {
    height: 36,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
  },
  chipTextSelected: {
    color: COLORS.text,
    fontWeight: '600',
  },
});

export default KeySelectionChips;
