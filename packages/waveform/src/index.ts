// Components
export { SpectralWaveform, ScrollingWaveform } from './components';
export { default as SpectralWaveformDefault } from './components';
export type { ScrollingWaveformProps } from './components';

// Hooks
export { useSpectralWaveform, useScrollingAnimation } from './hooks';
export type { UseScrollingAnimationParams, UseScrollingAnimationResult } from './hooks';

// Types
export type {
  SpectralWaveformData,
  SpectralWaveformProps,
  WaveformColors,
  CuePoint,
} from './types';
export { DEFAULT_COLORS } from './types';

// Utilities
export {
  mergeColors,
  hexToRgba,
  getDominantColor,
  blendColors,
} from './utils/colorMapping';
export {
  generateBandPath,
  generateStackedPaths,
  generatePlayedClipRect,
  generateBarPaths,
} from './utils/pathGeneration';
