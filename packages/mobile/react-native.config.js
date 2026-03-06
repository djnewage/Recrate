module.exports = {
  dependencies: {
    // Disable autolinking for Firebase packages incompatible with useFrameworks: "static"
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
