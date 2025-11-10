import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants/theme';
import apiService from '../services/api';

const SERVER_URL_KEY = '@recrate_server_url';

export default function ConnectionScreen({ navigation }) {
  const [serverUrl, setServerUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    loadSavedServerUrl();
  }, []);

  const loadSavedServerUrl = async () => {
    try {
      const savedUrl = await AsyncStorage.getItem(SERVER_URL_KEY);
      if (savedUrl) {
        setServerUrl(savedUrl);
        // Auto-test connection if URL exists
        testConnection(savedUrl);
      } else {
        // Set default based on platform
        const defaultUrl = getDefaultUrl();
        setServerUrl(defaultUrl);
      }
    } catch (error) {
      console.error('Error loading saved URL:', error);
    }
  };

  const getDefaultUrl = () => {
    if (Platform.OS === 'ios') {
      return 'http://localhost:3000';
    } else if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3000';
    }
    return 'http://192.168.1.100:3000'; // Example IP for physical device
  };

  const testConnection = async (url) => {
    setIsConnecting(true);
    setIsConnected(false);

    try {
      // Update API base URL
      apiService.setBaseUrl(url || serverUrl);

      // Test health endpoint
      const response = await apiService.checkHealth();

      if (response.status === 'ok') {
        setIsConnected(true);
        // Save URL if connection successful
        await AsyncStorage.setItem(SERVER_URL_KEY, url || serverUrl);

        Alert.alert(
          'Connected!',
          `Successfully connected to Recrate server\n\nService: ${response.service}\nVersion: ${response.version}`,
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Main'),
            },
          ]
        );
      }
    } catch (error) {
      setIsConnected(false);
      Alert.alert(
        'Connection Failed',
        `Could not connect to server at ${url || serverUrl}\n\nError: ${error.message}\n\nMake sure:\n• The backend server is running\n• You're on the same WiFi network\n• The IP address is correct`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnect = () => {
    if (!serverUrl.trim()) {
      Alert.alert('Invalid URL', 'Please enter a server URL');
      return;
    }

    // Validate URL format
    if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://');
      return;
    }

    testConnection(serverUrl);
  };

  const getInstructions = () => {
    if (Platform.OS === 'ios' && __DEV__) {
      return 'For iOS Simulator, use: http://localhost:3000';
    } else if (Platform.OS === 'android' && __DEV__) {
      return 'For Android Emulator, use: http://10.0.2.2:3000';
    } else {
      return 'For physical device, use your computer\'s IP address (e.g., http://192.168.1.100:3000)';
    }
  };

  const getIpInstructions = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      return `\n\nTo find your MacBook's IP:\n1. Open Terminal on your Mac\n2. Run: ifconfig | grep "inet "\n3. Look for 192.168.x.x\n4. Use http://[that-ip]:3000`;
    }
    return '';
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Connect to Server</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {getInstructions()}
            {getIpInstructions()}
          </Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Server URL</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://192.168.1.100:3000"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!isConnecting}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.connectButton,
            isConnecting && styles.connectButtonDisabled,
            isConnected && styles.connectButtonSuccess,
          ]}
          onPress={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.connectButtonText}>
              {isConnected ? '✓ Connected' : 'Connect'}
            </Text>
          )}
        </TouchableOpacity>

        {isConnected && (
          <TouchableOpacity
            style={styles.continueButton}
            onPress={() => navigation.navigate('Main')}
          >
            <Text style={styles.continueButtonText}>Continue to Library</Text>
          </TouchableOpacity>
        )}

        <View style={styles.helpBox}>
          <Text style={styles.helpTitle}>Need Help?</Text>
          <Text style={styles.helpText}>
            1. Make sure the Recrate backend is running on your MacBook
          </Text>
          <Text style={styles.helpText}>
            2. Both devices must be on the same WiFi network
          </Text>
          <Text style={styles.helpText}>
            3. Use your MacBook's local IP address (starts with 192.168)
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 30,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
  },
  connectButton: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonSuccess: {
    backgroundColor: '#10b981',
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  continueButton: {
    backgroundColor: COLORS.surface,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  continueButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  helpBox: {
    marginTop: 32,
    padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  helpText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
    lineHeight: 20,
  },
});
