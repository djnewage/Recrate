import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Linking,
  Modal,
} from 'react-native';
import { useConnectionStore, CONNECTION_TYPES } from '../store/connectionStore';
import QRScanner from '../components/QRScanner';
import ConnectionDebug from '../components/ConnectionDebug';

const ConnectionScreen = ({ navigation }) => {
  const {
    connectionType,
    serverURL,
    isConnected,
    isSearching,
    findServer,
    connectManually,
    disconnect,
  } = useConnectionStore();

  const [manualURL, setManualURL] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (isConnected) {
      // Auto-navigate to library after successful connection
      setTimeout(() => {
        navigation.replace('Main');
      }, 1500);
    }
  }, [isConnected, navigation]);

  const handleAutoConnect = async () => {
    await findServer();
  };

  const handleManualConnect = async () => {
    if (!manualURL) return;

    setIsConnecting(true);
    setConnectionError(null);

    const success = await connectManually(manualURL);

    setIsConnecting(false);

    if (!success) {
      const errorMsg = manualURL.includes('100.')
        ? 'Could not connect via Tailscale. Make sure Tailscale is connected on this device and you can access the server in Safari.'
        : 'Could not connect to server. Please check the URL and try again.';

      setConnectionError(errorMsg);
    }
  };

  const openTailscaleSetup = () => {
    Linking.openURL('https://tailscale.com/kb/1017/install');
  };

  const handleQRScan = async (url) => {
    console.log('[ConnectionScreen] QR code scanned:', url);
    setShowQRScanner(false);

    // Extract just the base URL (remove /health if present)
    const baseURL = url.replace('/health', '');

    const success = await connectManually(baseURL);
    if (!success) {
      alert('Could not connect to server. Please make sure the server is running.');
    }
  };

  const ConnectionBadge = ({ type }) => {
    const badges = {
      [CONNECTION_TYPES.PROXY]: {
        icon: '☁️',
        text: 'Cloud Proxy',
        color: '#8b5cf6',
        subtitle: 'Works anywhere',
      },
      [CONNECTION_TYPES.TAILSCALE]: {
        icon: '🌐',
        text: 'Tailscale Remote',
        color: '#48bb78',
        subtitle: 'VPN connection',
      },
      [CONNECTION_TYPES.LOCAL]: {
        icon: '🏠',
        text: 'Local Network',
        color: '#4299e1',
        subtitle: 'Same WiFi',
      },
      [CONNECTION_TYPES.MANUAL]: {
        icon: '⚙️',
        text: 'Manual Connection',
        color: '#9f7aea',
        subtitle: 'Custom IP',
      },
      [CONNECTION_TYPES.OFFLINE]: {
        icon: '⚠️',
        text: 'Not Connected',
        color: '#f56565',
        subtitle: 'Searching...',
      },
    };

    const badge = badges[type] || badges[CONNECTION_TYPES.OFFLINE];

    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: badge.color + '20',
          borderColor: badge.color,
          borderWidth: 2,
          borderRadius: 12,
          padding: 15,
          marginVertical: 20,
        }}
      >
        <Text style={{ fontSize: 32, marginRight: 15 }}>{badge.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#fff' }}>
            {badge.text}
          </Text>
          <Text style={{ fontSize: 14, color: '#ccc', marginTop: 4 }}>
            {badge.subtitle}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
      <View style={{ padding: 30 }}>
        <Text
          style={{
            fontSize: 36,
            fontWeight: 'bold',
            color: '#fff',
            textAlign: 'center',
            marginTop: 40,
          }}
        >
          🎧 Recrate
        </Text>

        <Text
          style={{
            fontSize: 16,
            color: '#ccc',
            textAlign: 'center',
            marginTop: 10,
            marginBottom: 30,
          }}
        >
          Connect to your music library
        </Text>

        {/* Connection Status */}
        <ConnectionBadge type={connectionType} />

        {isConnected && serverURL && (
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: 15,
              marginBottom: 20,
            }}
          >
            <Text style={{ color: '#ccc', fontSize: 12, marginBottom: 5 }}>
              Connected to:
            </Text>
            <Text
              style={{
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: 14,
              }}
            >
              {serverURL}
            </Text>
          </View>
        )}

        {/* QR Code Scanner Button */}
        {!isConnected && (
          <TouchableOpacity
            onPress={() => setShowQRScanner(true)}
            style={{
              backgroundColor: '#667eea',
              padding: 18,
              borderRadius: 12,
              marginBottom: 15,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 16,
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              📷 Scan QR Code
            </Text>
          </TouchableOpacity>
        )}

        {/* Auto Connect Button */}
        {!isConnected && (
          <TouchableOpacity
            onPress={handleAutoConnect}
            disabled={isSearching}
            style={{
              backgroundColor: isSearching ? '#666' : 'rgba(102, 126, 234, 0.3)',
              padding: 18,
              borderRadius: 12,
              marginBottom: 15,
              borderWidth: 2,
              borderColor: 'rgba(102, 126, 234, 0.5)',
            }}
          >
            {isSearching ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ActivityIndicator color="#fff" style={{ marginRight: 10 }} />
                <Text
                  style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}
                >
                  Searching for server...
                </Text>
              </View>
            ) : (
              <Text
                style={{
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: '600',
                  textAlign: 'center',
                }}
              >
                🔍 Auto-Detect Server
              </Text>
            )}
          </TouchableOpacity>
        )}

        {isConnected && (
          <TouchableOpacity
            onPress={disconnect}
            style={{
              backgroundColor: '#f56565',
              padding: 18,
              borderRadius: 12,
              marginBottom: 15,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 16,
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              Disconnect
            </Text>
          </TouchableOpacity>
        )}

        {/* Manual Connection Toggle */}
        {!isConnected && (
          <TouchableOpacity
            onPress={() => setShowManual(!showManual)}
            style={{
              padding: 15,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.2)',
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              {showManual ? '← Back' : '⚙️ Enter IP Address Manually'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Manual Connection Form */}
        {showManual && !isConnected && (
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, marginBottom: 10 }}>
              Server IP Address:
            </Text>

            {/* Quick fill buttons */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity
                onPress={() => setManualURL('https://tristans-macbook-pro.tailca1b53.ts.net')}
                style={{
                  backgroundColor: 'rgba(102, 126, 234, 0.2)',
                  padding: 10,
                  borderRadius: 6,
                  flex: 1,
                }}
              >
                <Text style={{ color: '#667eea', fontSize: 12, textAlign: 'center' }}>
                  Tailscale
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setManualURL('192.168.1.131')}
                style={{
                  backgroundColor: 'rgba(66, 153, 225, 0.2)',
                  padding: 10,
                  borderRadius: 6,
                  flex: 1,
                }}
              >
                <Text style={{ color: '#4299e1', fontSize: 12, textAlign: 'center' }}>
                  Local
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={manualURL}
              onChangeText={(text) => {
                setManualURL(text);
                setConnectionError(null);
              }}
              placeholder="https://your-server.ts.net or 192.168.1.131"
              placeholderTextColor="#666"
              style={{
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: '#fff',
                padding: 15,
                borderRadius: 8,
                fontSize: 16,
                fontFamily: 'monospace',
                marginBottom: 15,
              }}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isConnecting}
            />

            {/* Connection Error */}
            {connectionError && (
              <View
                style={{
                  backgroundColor: 'rgba(245, 101, 101, 0.1)',
                  borderColor: '#f56565',
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 15,
                }}
              >
                <Text style={{ color: '#f56565', fontSize: 14 }}>
                  ❌ {connectionError}
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleManualConnect}
              disabled={isConnecting || !manualURL}
              style={{
                backgroundColor: isConnecting || !manualURL ? '#666' : '#9f7aea',
                padding: 15,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: '600',
                  textAlign: 'center',
                }}
              >
                {isConnecting ? 'Connecting... (up to 15s)' : 'Connect'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Remote Access Help */}
        <View
          style={{
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            borderColor: '#667eea',
            borderWidth: 1,
            borderRadius: 12,
            padding: 20,
            marginTop: 20,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 18,
              fontWeight: '600',
              marginBottom: 10,
            }}
          >
            🌐 Want Remote Access?
          </Text>
          <Text style={{ color: '#ccc', fontSize: 14, marginBottom: 15 }}>
            Access your library from anywhere (gym, coffee shop, on the go) by
            installing Tailscale.
          </Text>
          <Text style={{ color: '#ccc', fontSize: 14, marginBottom: 15 }}>
            Setup takes 5 minutes:
            {'\n'}1. Install Tailscale on your computer
            {'\n'}2. Install Tailscale on this phone
            {'\n'}3. Sign in with same account
            {'\n'}4. That's it - works everywhere! ✨
          </Text>
          <TouchableOpacity
            onPress={openTailscaleSetup}
            style={{
              backgroundColor: '#667eea',
              padding: 15,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 14,
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              Learn How to Setup Tailscale
            </Text>
          </TouchableOpacity>
        </View>

        {/* Debug Toggle */}
        {!isConnected && (
          <TouchableOpacity
            onPress={() => setShowDebug(!showDebug)}
            style={{
              padding: 10,
              marginTop: 20,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.2)',
              borderStyle: 'dashed',
            }}
          >
            <Text style={{ color: '#999', fontSize: 12, textAlign: 'center' }}>
              {showDebug ? '🔧 Hide Debug Tools' : '🔧 Show Debug Tools'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Connection Debug Component */}
        {showDebug && <ConnectionDebug />}

        {/* Help Text */}
        <Text
          style={{
            color: '#666',
            fontSize: 12,
            textAlign: 'center',
            marginTop: 30,
          }}
        >
          Make sure your desktop app is running
        </Text>
      </View>

      {/* QR Scanner Modal */}
      <Modal
        visible={showQRScanner}
        animationType="slide"
        onRequestClose={() => setShowQRScanner(false)}
      >
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
        />
      </Modal>
    </ScrollView>
  );
};

export default ConnectionScreen;
