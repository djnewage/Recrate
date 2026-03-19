import { useMemo } from 'react';

const LETTERS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Builds an alphabet index mapping letters to the first item index
 * that starts with that letter.
 *
 * @param {Array} items - Sorted array of items
 * @param {Function} getSortKey - (item) => string to index by
 * @returns {{ letters: string[], index: Record<string, number> }}
 */
export default function useAlphabetIndex(items, getSortKey) {
  return useMemo(() => {
    const index = {};

    items.forEach((item, idx) => {
      let firstChar = '#';
      const value = getSortKey(item) || '';

      if (value.length > 0) {
        const char = value.charAt(0).toUpperCase();
        if (/[A-Z]/.test(char)) {
          firstChar = char;
        }
      }

      if (index[firstChar] === undefined) {
        index[firstChar] = idx;
      }
    });

    return { letters: LETTERS, index };
  }, [items, getSortKey]);
}
