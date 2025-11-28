import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

const GenreChips = ({ selectedGenres = [], availableGenres = [], onChange }) => {
  const sortedGenres = useMemo(() => {
    return [...availableGenres].sort((a, b) => a.localeCompare(b));
  }, [availableGenres]);

  const handleToggle = (genre) => {
    if (selectedGenres.includes(genre)) {
      onChange(selectedGenres.filter((g) => g !== genre));
    } else {
      onChange([...selectedGenres, genre]);
    }
  };

  if (availableGenres.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionLabel}>GENRE</Text>
        <Text style={styles.emptyText}>No genres available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>GENRE</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {sortedGenres.map((genre) => {
          const isSelected = selectedGenres.includes(genre);

          return (
            <TouchableOpacity
              key={genre}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => handleToggle(genre)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {genre}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  scrollView: {
    marginHorizontal: -28,
  },
  scrollContent: {
    paddingHorizontal: 28,
    gap: 10,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipSelected: {
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
    borderColor: '#EC4899',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94A3B8',
  },
  chipTextSelected: {
    color: COLORS.text,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
  },
});

export default GenreChips;
