import React, { useEffect, useRef } from 'react';
import { StatusBar, SafeAreaView, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import NetInfo from '@react-native-community/netinfo';
import { COLORS } from './src/constants/theme';
import { useConnectionStore } from './src/store/connectionStore';
import useStore from './src/store/useStore';
import * as TrackPlayerService from './src/services/TrackPlayerService';

// Screens
import ConnectionScreen from './src/screens/ConnectionScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import CratesScreen from './src/screens/CratesScreen';
import CrateDetailScreen from './src/screens/CrateDetailScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// Components
import MiniPlayer from './src/components/MiniPlayer';

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
      <Stack.Screen name="Crates" component={CratesScreen} />
      <Stack.Screen
        name="CrateDetail"
        component={CrateDetailScreen}
        options={{
          headerShown: true,
          title: '',
          headerBackVisible: true,
          headerBackTitleVisible: false,
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
    </RootStack.Navigator>
  );
}

// Wrapper component to include MiniPlayer inside NavigationContainer
function AppContent() {
  return (
    <View style={{ flex: 1 }}>
      <RootNavigator />
      <MiniPlayer />
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

  // Initialize TrackPlayer on app mount
  useEffect(() => {
    let isInitialized = false;

    async function initializeTrackPlayer() {
      try {
        const success = await TrackPlayerService.setupPlayer();

        if (success) {
          // Setup event handlers with Zustand store
          TrackPlayerService.setupEventHandlers(useStore);
          isInitialized = true;
          console.log('TrackPlayer initialized successfully');
        } else {
          console.error('Failed to initialize TrackPlayer');
        }
      } catch (error) {
        console.error('Error initializing TrackPlayer:', error);
      }
    }

    initializeTrackPlayer();

    return () => {
      if (isInitialized) {
        // Cleanup on app unmount (optional)
        TrackPlayerService.cleanup().catch(console.error);
      }
    };
  }, []);

  // Auto-reconnect on network change
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      console.log('Network state changed:', state.type, 'Connected:', state.isConnected);

      if (state.isConnected) {
        // Network came back - try to reconnect
        const { isConnected, lastSuccessfulIP, testConnection, setConnected } =
          useConnectionStore.getState();

        if (!isConnected && lastSuccessfulIP) {
          console.log('Attempting to reconnect to:', lastSuccessfulIP);
          testConnection(lastSuccessfulIP).then((works) => {
            if (works) {
              setConnected(true);
              console.log('Reconnected successfully!');
            }
          });
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <SafeAreaView style={styles.container}>
        <NavigationContainer ref={navigationRef} linking={linking}>
          <AppContent />
        </NavigationContainer>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
