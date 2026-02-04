import React, { useEffect, useRef } from 'react';
import { StatusBar, StyleSheet, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import NetInfo from '@react-native-community/netinfo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { COLORS } from './src/constants/theme';
import { useConnectionStore } from './src/store/connectionStore';
import useStore from './src/store/useStore';
import useOfflineStore from './src/store/offlineStore';
import { useSubscriptionStore } from './src/store/subscriptionStore';
import { useAuthStore } from './src/store/authStore';
import * as TrackPlayerService from './src/services/TrackPlayerService';
import { syncQueue } from './src/services/SyncService';
import { initSentry, setUser } from './src/utils/sentry';
import ErrorBoundary from './src/components/ErrorBoundary';

// Initialize Sentry before component definition
initSentry();

// Screens
import ConnectionScreen from './src/screens/ConnectionScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import CratesScreen from './src/screens/CratesScreen';
import CrateDetailScreen from './src/screens/CrateDetailScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import IdentifyTrackScreen from './src/screens/IdentifyTrackScreen';
import AICrateBuilderScreen from './src/screens/AICrateBuilderScreen';
import TrialStartScreen from './src/screens/TrialStartScreen';
import PaywallScreen from './src/screens/PaywallScreen';
import AuthScreen from './src/screens/AuthScreen';

// Components
import MiniPlayer from './src/components/MiniPlayer';
import DisclaimerModal from './src/components/DisclaimerModal';
import ConnectionStatusBar from './src/components/ConnectionStatusBar';
import ConflictModal from './src/components/ConflictModal';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

// Stack navigator for Crates (includes crate detail)
function CratesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.background,
        },
        headerTintColor: COLORS.text,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerShown: false,
      }}
    >
      <Stack.Screen name="CratesList" component={CratesScreen} />
      <Stack.Screen
        name="CrateDetail"
        component={CrateDetailScreen}
        options={{
          headerShown: true,
          title: '',
          headerBackTitle: '',
          headerBackTitleVisible: false,
          headerStyle: {
            backgroundColor: COLORS.background,
          },
          headerShadowVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}

// Main tab navigator
function TabNavigator({ navigation }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
      tabBar={(props) => (
        <>
          <ConnectionStatusBar />
          <MiniPlayer />
          <BottomTabBar {...props} />
        </>
      )}
    >
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Crates"
        component={CratesStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Root navigator with auth and connection screens
function RootNavigator() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  // Show loading screen while checking auth state
  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      {!isAuthenticated ? (
        // Auth flow - show login screen
        <RootStack.Screen name="Auth" component={AuthScreen} />
      ) : (
        // Main app flow - user is authenticated
        <>
          <RootStack.Screen name="Connection" component={ConnectionScreen} />
          <RootStack.Screen name="Main" component={TabNavigator} />
          <RootStack.Screen
            name="Player"
            component={PlayerScreen}
            options={{
              presentation: 'modal',
            }}
          />
          <RootStack.Screen
            name="IdentifyTrack"
            component={IdentifyTrackScreen}
            options={{
              presentation: 'card',
            }}
          />
          <RootStack.Screen
            name="AICrateBuilder"
            component={AICrateBuilderScreen}
            options={{
              presentation: 'card',
            }}
          />
          <RootStack.Screen
            name="TrialStart"
            component={TrialStartScreen}
            options={{
              presentation: 'fullScreenModal',
              gestureEnabled: false,
            }}
          />
          <RootStack.Screen
            name="Paywall"
            component={PaywallScreen}
            options={{
              presentation: 'modal',
            }}
          />
          <RootStack.Screen
            name="CrateDetailFromIdentify"
            component={CrateDetailScreen}
            options={({ navigation }) => ({
              headerShown: true,
              title: '',
              headerBackTitle: '',
              headerBackTitleVisible: false,
              headerTintColor: COLORS.text,
              gestureEnabled: true,
              headerStyle: {
                backgroundColor: COLORS.background,
              },
              headerShadowVisible: false,
              headerLeft: () => (
                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  <Ionicons name="chevron-back" size={28} color={COLORS.text} />
                </TouchableOpacity>
              ),
            })}
          />
        </>
      )}
    </RootStack.Navigator>
  );
}

// Wrapper component for NavigationContainer
function AppContent() {
  return (
    <View style={{ flex: 1 }}>
      <RootNavigator />
    </View>
  );
}

export default function App() {
  const navigationRef = useRef();

  const linking = {
    prefixes: ['recrate://'],
    config: {
      screens: {
        Auth: 'auth',
        Connection: {
          path: 'connect',
          parse: {
            ip: (ip) => ip,
            port: (port) => port,
          },
        },
        Main: 'main',
      },
    },
  };

  // Initialize Firebase Auth on app mount
  useEffect(() => {
    // Initialize auth store and set up listener
    const unsubscribeAuth = useAuthStore.getState().initialize();

    return () => {
      if (unsubscribeAuth) {
        unsubscribeAuth();
      }
    };
  }, []);

  // Initialize device ID on app mount (for API requests)
  useEffect(() => {
    const initDeviceId = async () => {
      await useConnectionStore.getState().initializeDeviceId();
      // Device ID is still used for API requests
      // Firebase UID is used for user tracking (set in authStore)
    };
    initDeviceId();
  }, []);

  // Initialize subscription state on app mount
  useEffect(() => {
    const initSubscription = async () => {
      try {
        await useSubscriptionStore.getState().initializeSubscription();
        console.log('[App] Subscription initialized');
      } catch (error) {
        console.error('[App] Failed to initialize subscription:', error);
      }
    };
    initSubscription();
  }, []);

  // Initialize TrackPlayer on app mount
  useEffect(() => {
    let mounted = true;

    async function initializeTrackPlayer() {
      try {
        if (!mounted) return;

        const success = await TrackPlayerService.setupPlayer();

        if (success && mounted) {
          // Setup event handlers with Zustand store
          TrackPlayerService.setupEventHandlers(useStore);
        }
      } catch (error) {
        // TrackPlayer initialization failed
      }
    }

    initializeTrackPlayer();

    return () => {
      mounted = false;
      // Don't cleanup TrackPlayer on unmount - it should persist
    };
  }, []);

  // Auto-reconnect on network change and trigger sync
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      // Update network state in connection store
      useConnectionStore.getState().setNetworkState(state);

      if (state.isConnected) {
        // Network came back - try to reconnect
        const { isConnected, lastSuccessfulIP, serverURL, quickTestConnection, setConnected, setServerURL } =
          useConnectionStore.getState();

        // Use serverURL if available, otherwise fall back to lastSuccessfulIP
        const urlToTest = serverURL || lastSuccessfulIP;

        if (!isConnected && urlToTest) {
          // Use quick test (5 sec timeout) for faster reconnection
          const works = await quickTestConnection(urlToTest);
          if (works) {
            setConnected(true);
            // Ensure serverURL is set (in case only lastSuccessfulIP was available)
            if (!serverURL && lastSuccessfulIP) {
              setServerURL(lastSuccessfulIP);
            }

            // Auto-sync when reconnected if there are pending operations
            if (useOfflineStore.getState().hasPendingOperations()) {
              syncQueue();
            }
          }
        }
      } else {
        // Mark as disconnected when network is lost
        useConnectionStore.getState().setConnected(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ActionSheetProvider>
            <>
              <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
              <DisclaimerModal />
              <ConflictModal />
              <SafeAreaView style={styles.container}>
                <NavigationContainer ref={navigationRef} linking={linking}>
                  <AppContent />
                </NavigationContainer>
              </SafeAreaView>
            </>
          </ActionSheetProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
