module.exports = {
  dependencies: {
    // Disable autolinking for Firebase packages that aren't needed
    '@react-native-firebase/crashlytics': {
      platforms: {
        ios: null,
        android: null,
      },
    },
    '@react-native-firebase/analytics': {
      platforms: {
        ios: null,
        android: null,
      },
    },
  },
};
