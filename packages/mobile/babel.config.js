module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Strip console.log/warn/error from production builds
      ...(process.env.NODE_ENV === 'production'
        ? ['transform-remove-console']
        : []),
      // React Native Reanimated plugin must be listed last
      'react-native-reanimated/plugin',
    ],
  };
};
