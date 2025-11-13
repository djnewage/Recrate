import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const BPMBadge = ({ bpm }) => {
  const displayBPM = bpm ? Math.round(bpm).toString() : '--';

  // Determine gradient based on BPM range (tempo-based)
  const getGradient = (bpm) => {
    if (!bpm) return ['#64748B', '#475569']; // Gray for missing BPM

    const rounded = Math.round(bpm);

    // 60-90: Cool Blue (slow/chill)
    if (rounded >= 60 && rounded <= 90) return ['#3B82F6', '#06B6D4'];
    // 91-110: Fresh Green (mid-tempo)
    if (rounded >= 91 && rounded <= 110) return ['#10B981', '#059669'];
    // 111-130: Warm Orange (upbeat)
    if (rounded >= 111 && rounded <= 130) return ['#FB923C', '#F59E0B'];
    // 131-150: Hot Pink (high energy)
    if (rounded >= 131 && rounded <= 150) return ['#EC4899', '#F472B6'];
    // 151+: Intense Red (very fast)
    if (rounded >= 151) return ['#EF4444', '#F43F5E'];

    // Default for very low BPM (under 60)
    return ['#6366F1', '#8B5CF6'];
  };

  const colors = getGradient(bpm);

  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.badge}
    >
      <Text style={styles.bpmNumber}>{displayBPM}</Text>
      <Text style={styles.bpmLabel}>BPM</Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  badge: {
    width: 42,
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 3,
  },
  bpmNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 16,
  },
  bpmLabel: {
    fontSize: 8,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 0,
  },
});

export default BPMBadge;
