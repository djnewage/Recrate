import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

/**
 * Connection Debug Component
 * Add this to your ConnectionScreen temporarily to test connections
 */
const ConnectionDebug = () => {
  const [results, setResults] = useState([]);
  const [testing, setTesting] = useState(false);

  const testConnection = async (url, name) => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const result = {
        name,
        url,
        timestamp: new Date().toISOString(),
        status: 'testing...',
      };

      console.log(`[DEBUG] Testing ${name}: ${url}`);

      // Use XMLHttpRequest instead of fetch for better VPN compatibility
      const xhr = new XMLHttpRequest();
      const timeout = setTimeout(() => {
        xhr.abort();
        const elapsed = Date.now() - startTime;
        result.status = 'error';
        result.elapsed = elapsed;
        result.error = 'Request timeout';
        result.errorName = 'TimeoutError';
        console.error(`[DEBUG] ${name} timeout`);
        resolve(result);
      }, 10000);

      xhr.onload = function() {
        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;

        result.elapsed = elapsed;
        result.statusCode = xhr.status;

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            result.status = 'success';
            result.data = data;
            console.log(`[DEBUG] ${name} success:`, result);
          } catch (e) {
            result.status = 'error';
            result.error = 'Invalid JSON response';
            result.errorName = 'ParseError';
            console.error(`[DEBUG] ${name} parse error:`, e);
          }
        } else {
          result.status = 'failed';
          console.log(`[DEBUG] ${name} failed with status ${xhr.status}`);
        }

        resolve(result);
      };

      xhr.onerror = function() {
        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;
        result.status = 'error';
        result.elapsed = elapsed;
        result.error = 'Network request failed';
        result.errorName = 'NetworkError';
        console.error(`[DEBUG] ${name} network error`);
        resolve(result);
      };

      try {
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.send();
      } catch (error) {
        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;
        result.status = 'error';
        result.elapsed = elapsed;
        result.error = error.message;
        result.errorName = error.name;
        console.error(`[DEBUG] ${name} exception:`, error);
        resolve(result);
      }
    });
  };

  const runAllTests = async () => {
    setTesting(true);
    setResults([]);

    const tests = [
      // Test 1: Public internet (should always work)
      { url: 'https://httpbin.org/get', name: 'Internet (httpbin.org)' },

      // Test 2: Local network
      { url: 'http://192.168.1.131:3000/health', name: 'Local IP (192.168.1.131)' },

      // Test 3: Tailscale (remote)
      { url: 'http://100.111.35.70:3000/health', name: 'Tailscale IP (100.111.35.70)' },

      // Test 4: Alternative - try with explicit port
      { url: 'http://100.111.35.70:3000/health', name: 'Tailscale retry' },
    ];

    const testResults = [];

    for (const test of tests) {
      const result = await testConnection(test.url, test.name);
      testResults.push(result);
      setResults([...testResults]);
    }

    setTesting(false);
  };

  return (
    <View style={{ padding: 20, backgroundColor: '#2a2a3e' }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
        🔍 Connection Debugger
      </Text>

      <TouchableOpacity
        onPress={runAllTests}
        disabled={testing}
        style={{
          backgroundColor: testing ? '#666' : '#667eea',
          padding: 15,
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>
          {testing ? 'Testing...' : 'Run Connection Tests'}
        </Text>
      </TouchableOpacity>

      <ScrollView style={{ maxHeight: 400 }}>
        {results.map((result, index) => (
          <View
            key={index}
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              padding: 15,
              borderRadius: 8,
              marginBottom: 10,
              borderLeftWidth: 4,
              borderLeftColor:
                result.status === 'success'
                  ? '#48bb78'
                  : result.status === 'error'
                  ? '#f56565'
                  : '#fbd38d',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
              {result.name}
            </Text>
            <Text style={{ color: '#ccc', fontSize: 12, marginTop: 5, fontFamily: 'monospace' }}>
              {result.url}
            </Text>
            <View style={{ marginTop: 10 }}>
              <Text
                style={{
                  color:
                    result.status === 'success'
                      ? '#48bb78'
                      : result.status === 'error'
                      ? '#f56565'
                      : '#fbd38d',
                  fontWeight: 'bold',
                }}
              >
                Status: {result.status.toUpperCase()}
              </Text>
              {result.elapsed && (
                <Text style={{ color: '#ccc', fontSize: 12 }}>Time: {result.elapsed}ms</Text>
              )}
              {result.statusCode && (
                <Text style={{ color: '#ccc', fontSize: 12 }}>HTTP: {result.statusCode}</Text>
              )}
              {result.error && (
                <Text style={{ color: '#f56565', fontSize: 12, marginTop: 5 }}>
                  Error: {result.error}
                </Text>
              )}
              {result.errorName && (
                <Text style={{ color: '#f56565', fontSize: 12 }}>
                  Type: {result.errorName}
                </Text>
              )}
              {result.data && (
                <Text style={{ color: '#48bb78', fontSize: 11, marginTop: 5 }}>
                  Response: {JSON.stringify(result.data).substring(0, 100)}...
                </Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {results.length > 0 && (
        <View style={{ marginTop: 20, padding: 15, backgroundColor: 'rgba(102, 126, 234, 0.1)', borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: 'bold', marginBottom: 10 }}>
            📊 Test Summary:
          </Text>
          <Text style={{ color: '#ccc', fontSize: 12 }}>
            • Internet test: {results[0]?.status === 'success' ? '✅' : '❌'}
            {results[0]?.status === 'success' ? ' (Device has internet)' : ' (No internet!)'}
          </Text>
          <Text style={{ color: '#ccc', fontSize: 12, marginTop: 5 }}>
            • Local IP: {results[1]?.status === 'success' ? '✅' : '❌'}
            {results[1]?.status === 'success' ? ' (Same WiFi works)' : ' (Local network issue)'}
          </Text>
          <Text style={{ color: '#ccc', fontSize: 12, marginTop: 5 }}>
            • Tailscale: {results[2]?.status === 'success' ? '✅' : '❌'}
            {results[2]?.status === 'success' ? ' (Remote works!)' : ' (Tailscale issue)'}
          </Text>

          {results[2]?.status !== 'success' && (
            <Text style={{ color: '#fbd38d', fontSize: 12, marginTop: 10, fontWeight: 'bold' }}>
              ⚠️ Tailscale connection failed!
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

export default ConnectionDebug;
