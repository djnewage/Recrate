import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, PanResponder, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

/**
 * Alphabet fast-scroll sidebar with drag support and letter popup.
 *
 * @param {Object} props
 * @param {{ letters: string[], index: Record<string, number> }} props.alphabetIndex
 * @param {(letter: string, itemIndex: number) => void} props.onScrollToLetter
 * @param {boolean} props.visible - Whether to render the bar
 */
const AlphabetScrollBar = ({ alphabetIndex, onScrollToLetter, visible }) => {
  const [scrollBarHeight, setScrollBarHeight] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [currentLetter, setCurrentLetter] = useState(null);

  const handleScrollBarTouch = useCallback((y) => {
    if (scrollBarHeight === 0) return;

    const letters = alphabetIndex.letters;
    const letterHeight = scrollBarHeight / letters.length;
    const index = Math.min(Math.max(0, Math.floor(y / letterHeight)), letters.length - 1);
    const letter = letters[index];

    const targetIndex = alphabetIndex.index[letter];
    if (targetIndex !== undefined) {
      onScrollToLetter(letter, targetIndex);
    }
    setCurrentLetter(letter);
  }, [scrollBarHeight, alphabetIndex, onScrollToLetter]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      setIsDragging(true);
      handleScrollBarTouch(evt.nativeEvent.locationY);
    },
    onPanResponderMove: (evt) => {
      handleScrollBarTouch(evt.nativeEvent.locationY);
    },
    onPanResponderRelease: () => {
      setIsDragging(false);
      setTimeout(() => setCurrentLetter(null), 500);
    },
    onPanResponderTerminate: () => {
      setIsDragging(false);
      setTimeout(() => setCurrentLetter(null), 500);
    },
  }), [scrollBarHeight, alphabetIndex, handleScrollBarTouch]);

  const onScrollBarLayout = useCallback((event) => {
    setScrollBarHeight(event.nativeEvent.layout.height);
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Alphabet Bar */}
      <View
        style={styles.alphabetBar}
        onLayout={onScrollBarLayout}
        {...panResponder.panHandlers}
      >
        {alphabetIndex.letters.map((letter) => {
          const hasItems = alphabetIndex.index[letter] !== undefined;
          return (
            <View
              key={letter}
              style={[
                styles.alphabetLetterContainer,
                currentLetter === letter && styles.alphabetLetterActive,
              ]}
            >
              <Text
                style={[
                  styles.alphabetLetter,
                  !hasItems && styles.alphabetLetterDisabled,
                  currentLetter === letter && styles.alphabetLetterTextActive,
                ]}
              >
                {letter}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Current Letter Popup */}
      {isDragging && currentLetter && (
        <View style={styles.letterPopup}>
          <Text style={styles.letterPopupText}>{currentLetter}</Text>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  alphabetBar: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 100,
    width: 20,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: SPACING.xs,
    zIndex: 10,
  },
  alphabetLetterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 20,
  },
  alphabetLetterActive: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
  },
  alphabetLetter: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  alphabetLetterDisabled: {
    color: 'rgba(255, 255, 255, 0.2)',
  },
  alphabetLetterTextActive: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  letterPopup: {
    position: 'absolute',
    left: '40%',
    top: '40%',
    width: 80,
    height: 80,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  letterPopupText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: COLORS.text,
  },
});

export default React.memo(AlphabetScrollBar);
