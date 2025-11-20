import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CameraView, Camera } from 'expo-camera';

const QRScanner = ({ onScan, onClose }) => {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [lastScanTime, setLastScanTime] = useState(0);

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };

    getCameraPermissions();
  }, []);

  const handleBarCodeScanned = ({ type, data }) => {
    // Prevent multiple scans within 2 seconds (cooldown)
    const now = Date.now();
    if (scanned || (now - lastScanTime) < 2000) return;

    setScanned(true);
    setLastScanTime(now);
    console.log('[QRScanner] Scanned:', data);

    try {
      let serverURL = null;

      // Format 1: Deep link format (recrate://connect?ip=100.111.35.70&port=3000)
      if (data.startsWith('recrate://connect')) {
        console.log('[QRScanner] Detected deep link format');
        const url = new URL(data);
        const ip = url.searchParams.get('ip');
        const port = url.searchParams.get('port') || '3000';

        if (ip) {
          serverURL = `http://${ip}:${port}`;
          console.log('[QRScanner] Converted to:', serverURL);
        }
      }
      // Format 2: Direct HTTP URL (http://100.111.35.70:3000)
      else if (data.startsWith('http://') && data.includes(':3000')) {
        console.log('[QRScanner] Detected HTTP URL format');
        serverURL = data;
      }
      // Format 3: HTTPS/Proxy URL (https://proxy.up.railway.app/api/deviceId)
      else if (data.startsWith('https://') || data.includes('/api/')) {
        console.log('[QRScanner] Detected HTTPS/proxy URL format');
        serverURL = data;
      }

      // If we got a valid URL, connect
      if (serverURL) {
        console.log('[QRScanner] Valid server URL:', serverURL);
        onScan(serverURL);
        return;
      }

      // Invalid format - show error (only once due to cooldown)
      console.log('[QRScanner] Invalid QR code format');
      Alert.alert(
        'Invalid QR Code',
        'This doesn\'t look like a Recrate server URL. Please scan the QR code from your desktop app.',
        [{
          text: 'Try Again',
          onPress: () => {
            setScanned(false);
            setLastScanTime(0); // Reset cooldown
          }
        }]
      );
    } catch (error) {
      console.error('[QRScanner] Error parsing QR code:', error);
      Alert.alert(
        'Scan Error',
        'Could not read QR code. Please try again.',
        [{
          text: 'OK',
          onPress: () => {
            setScanned(false);
            setLastScanTime(0);
          }
        }]
      );
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No access to camera</Text>
        <Text style={styles.subtext}>
          Please enable camera permissions in Settings to scan QR codes
        </Text>
        <TouchableOpacity style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>Scan QR Code</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Scanning frame */}
        <View style={styles.scanFrame}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        <Text style={styles.instructions}>
          Point your camera at the QR code{'\n'}
          shown on your desktop app
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 60,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#fff',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#667eea',
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  instructions: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  text: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 10,
  },
  subtext: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#667eea',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default QRScanner;
