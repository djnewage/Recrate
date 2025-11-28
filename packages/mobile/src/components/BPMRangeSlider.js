import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { COLORS } from '../constants/theme';

const BPMRangeSlider = ({ min, max, value, onChange }) => {
  const handleMinChange = (newMin) => {
    if (newMin >= value.max) {
      onChange({ min: value.max - 1, max: value.max });
    } else {
      onChange({ ...value, min: Math.round(newMin) });
    }
  };

  const handleMaxChange = (newMax) => {
    if (newMax <= value.min) {
      onChange({ min: value.min, max: value.min + 1 });
    } else {
      onChange({ ...value, max: Math.round(newMax) });
    }
  };

  // Calculate the percentage positions for the highlight
  const minPercent = ((value.min - min) / (max - min)) * 100;
  const maxPercent = ((value.max - min) / (max - min)) * 100;

  return (
    <View style={styles.container}>
      {/* Section Label */}
      <Text style={styles.sectionLabel}>BPM RANGE</Text>

      {/* Value Display */}
      <View style={styles.valueDisplay}>
        <View style={styles.valueColumn}>
          <Text style={styles.valueNumber}>{value.min}</Text>
          <Text style={styles.valueLabel}>min</Text>
        </View>

        <View style={styles.connector} />

        <View style={styles.valueColumn}>
          <Text style={styles.valueNumber}>{value.max}</Text>
          <Text style={styles.valueLabel}>max</Text>
        </View>
      </View>

      {/* Range Track Background */}
      <View style={styles.trackContainer}>
        <View style={styles.rangeTrack}>
          <View
            style={[
              styles.rangeHighlight,
              {
                left: `${minPercent}%`,
                width: `${maxPercent - minPercent}%`,
              },
            ]}
          />
        </View>
      </View>

      {/* Min Slider */}
      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>Min</Text>
        <Slider
          style={styles.slider}
          minimumValue={min}
          maximumValue={max}
          value={value.min}
          onValueChange={handleMinChange}
          minimumTrackTintColor={COLORS.primary}
          maximumTrackTintColor={COLORS.border}
          thumbTintColor={COLORS.primary}
        />
      </View>

      {/* Max Slider */}
      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>Max</Text>
        <Slider
          style={styles.slider}
          minimumValue={min}
          maximumValue={max}
          value={value.max}
          onValueChange={handleMaxChange}
          minimumTrackTintColor={COLORS.border}
          maximumTrackTintColor={COLORS.border}
          thumbTintColor={COLORS.primary}
        />
      </View>

      {/* Range labels */}
      <View style={styles.rangeLabels}>
        <Text style={styles.rangeLabel}>{min}</Text>
        <Text style={styles.rangeLabel}>{max}</Text>
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
  valueDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  valueColumn: {
    alignItems: 'center',
  },
  valueNumber: {
    fontSize: 28,
    fontWeight: '300',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  valueLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  connector: {
    height: 1,
    width: 60,
    backgroundColor: COLORS.border,
    marginHorizontal: 24,
  },
  trackContainer: {
    height: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  rangeTrack: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
  },
  rangeHighlight: {
    position: 'absolute',
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    width: 32,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingLeft: 32,
  },
  rangeLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
});

export default BPMRangeSlider;
