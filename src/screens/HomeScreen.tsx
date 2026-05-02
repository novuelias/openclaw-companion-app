import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { connectionService } from '../services/connection';

export default function HomeScreen() {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<{ status: string; uptime: number; version: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set up event listeners
    const unsubConnected = connectionService.on('connected', () => setConnected(true));
    const unsubDisconnected = connectionService.on('disconnected', () => setConnected(false));
    const unsubError = connectionService.on('error', (e: unknown) => setError(String(e)));

    // Check initial state
    setConnected(connectionService.isConnected());

    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubError();
    };
  }, []);

  const handleConnect = async () => {
    try {
      setError(null);
      // Note: In production, load real credentials from secure storage
      await connectionService.initialize({
        gatewayUrl: 'ws://127.0.0.1:18789',
        operatorToken: 'ZsCwTCvHeqvnD0hvJW5xZSVa3Tl2W42r7zGeN_qa120',
      });
      await connectionService.connect();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDisconnect = async () => {
    await connectionService.disconnect();
  };

  const handleHealth = async () => {
    try {
      const result = await connectionService.health();
      setStatus(result);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>OpenClaw Companion</Text>
      <Text style={styles.subtitle}>Willkommen!</Text>

      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>Verbindung:</Text>
        <Text style={[styles.statusValue, connected ? styles.connected : styles.disconnected]}>
          {connected ? 'Verbunden' : 'Getrennt'}
        </Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {status && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Status: {status.status}</Text>
          <Text style={styles.infoText}>Version: {status.version}</Text>
          <Text style={styles.infoText}>Uptime: {Math.floor(status.uptime / 60)}min</Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        {!connected ? (
          <TouchableOpacity style={styles.button} onPress={handleConnect}>
            <Text style={styles.buttonText}>Verbinden</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.button, styles.disconnectButton]} onPress={handleDisconnect}>
            <Text style={styles.buttonText}>Trennen</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={[styles.button, !connected && styles.buttonDisabled]} 
          onPress={handleHealth}
          disabled={!connected}
        >
          <Text style={styles.buttonText}>Status</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Gateway API Methods:</Text>
        <Text style={styles.infoText}>• health() - Gateway health check</Text>
        <Text style={styles.infoText}>• status() - Full system status</Text>
        <Text style={styles.infoText}>• agent(input) - Run agent command</Text>
        <Text style={styles.infoText}>• send(target, msg) - Send message</Text>
        <Text style={styles.infoText}>• session.create/send/list - Session management</Text>
        <Text style={styles.infoText}>• tool.invoke() - Tool invocation</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 16,
    marginRight: 8,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  connected: {
    color: '#34C759',
  },
  disconnected: {
    color: '#FF3B30',
  },
  errorBox: {
    backgroundColor: '#FFE5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
  },
  infoBox: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  disconnectButton: {
    backgroundColor: '#FF9500',
  },
  buttonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoSection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
});
