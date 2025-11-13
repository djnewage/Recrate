import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const LetterBadge = ({ title }) => {
  const letter = title?.[0]?.toUpperCase() || '?';

  // Determine gradient based on letter
  const getGradient = (letter) => {
    const code = letter.charCodeAt(0);
    // A-E: Deep Purple to Pink
    if (code >= 65 && code <= 69) return ['#6366F1', '#EC4899'];
    // F-J: Pink to Orange
    if (code >= 70 && code <= 74) return ['#F472B6', '#FB923C'];
    // K-O: Cyan to Blue
    if (code >= 75 && code <= 79) return ['#06B6D4', '#3B82F6'];
    // P-T: Green to Emerald
    if (code >= 80 && code <= 84) return ['#10B981', '#059669'];
    // U-Z: Amber to Rose
    return ['#F59E0B', '#F43F5E'];
  };

  const colors = getGradient(letter);

  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.badge}
    >
      <Text style={styles.letter}>{letter}</Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  letter: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default LetterBadge;
