import React, { useEffect, useRef } from 'react';
import { StatusBar, StyleSheet, View, TouchableOpacity } from 'react-native';
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
import * as TrackPlayerService from './src/services/TrackPlayerService';
import { syncQueue } from './src/services/SyncService';

// Screens
import ConnectionScreen from './src/screens/ConnectionScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import CratesScreen from './src/screens/CratesScreen';
import CrateDetailScreen from './src/screens/CrateDetailScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import IdentifyTrackScreen from './src/screens/IdentifyTrackScreen';
import AICrateBuilderScreen from './src/screens/AICrateBuilderScreen';

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

// Root navigator with connection screen
function RootNavigator() {
  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
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

  // Initialize device ID on app mount (for authentication)
  useEffect(() => {
    useConnectionStore.getState().initializeDeviceId();
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
          console.log('TrackPlayer initialized successfully');
        } else if (!success) {
          console.error('Failed to initialize TrackPlayer');
        }
      } catch (error) {
        console.error('Error initializing TrackPlayer:', error);
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
      console.log('[App] Network state changed:', state.type, 'Connected:', state.isConnected);

      // Update network state in connection store
      useConnectionStore.getState().setNetworkState(state);

      if (state.isConnected) {
        // Network came back - try to reconnect
        const { isConnected, lastSuccessfulIP, serverURL, quickTestConnection, setConnected, setServerURL } =
          useConnectionStore.getState();

        // Use serverURL if available, otherwise fall back to lastSuccessfulIP
        const urlToTest = serverURL || lastSuccessfulIP;

        if (!isConnected && urlToTest) {
          console.log('[App] Network back, testing connection to:', urlToTest);

          // Use quick test (5 sec timeout) for faster reconnection
          const works = await quickTestConnection(urlToTest);
          if (works) {
            setConnected(true);
            // Ensure serverURL is set (in case only lastSuccessfulIP was available)
            if (!serverURL && lastSuccessfulIP) {
              setServerURL(lastSuccessfulIP);
            }
            console.log('[App] Reconnected successfully!');

            // Auto-sync when reconnected if there are pending operations
            if (useOfflineStore.getState().hasPendingOperations()) {
              console.log('[App] Auto-syncing pending operations...');
              syncQueue();
            }
          } else {
            console.log('[App] Reconnection test failed, will retry on next network change');
          }
        }
      } else {
        // Mark as disconnected when network is lost
        console.log('[App] Network lost, marking as disconnected');
        useConnectionStore.getState().setConnected(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
