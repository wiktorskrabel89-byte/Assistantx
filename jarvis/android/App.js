import React, { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useBackendConnection } from './backend';

export default function App() {
  const { backendUrl, messages, sendCommand, sendPrompt, status, token } = useBackendConnection();
  const [prompt, setPrompt] = useState('');

  const submitPrompt = () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    sendPrompt(trimmed);
    setPrompt('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Jarvis Android</Text>
        <Text style={styles.subtitle}>Mobile control surface using the same WebSocket protocol as Jarvis Desktop.</Text>

        <View style={styles.panel}>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.value}>{status}</Text>
          <Text style={styles.label}>Backend</Text>
          <Text style={styles.value}>{backendUrl}</Text>
          <Text style={styles.label}>Token</Text>
          <Text style={styles.value}>{token || 'Loading...'}</Text>
        </View>

        <View style={styles.row}>
          <Pressable style={styles.primaryButton} onPress={() => sendCommand('openApp', 'discord')}>
            <Text style={styles.buttonText}>Open Discord</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => sendCommand('screenshot')}>
            <Text style={styles.buttonText}>Screenshot</Text>
          </Pressable>
        </View>

        <View style={styles.composer}>
          <TextInput
            onChangeText={setPrompt}
            placeholder="Send a Jarvis prompt..."
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={prompt}
          />
          <Pressable style={styles.primaryButton} onPress={submitPrompt}>
            <Text style={styles.buttonText}>Send</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.log}>
          {messages.map((message, index) => (
            <View key={`${message}-${index}`} style={styles.message}>
              <Text style={styles.messageText}>{message}</Text>
            </View>
          ))}
          {messages.length === 0 ? <Text style={styles.empty}>No messages yet.</Text> : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07111f',
  },
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  title: {
    color: '#e2e8f0',
    fontSize: 30,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
  },
  panel: {
    backgroundColor: '#132235',
    borderColor: '#29405d',
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  label: {
    color: '#67e8f9',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  value: {
    color: '#e2e8f0',
    fontSize: 14,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  composer: {
    gap: 10,
  },
  input: {
    borderColor: '#29405d',
    borderRadius: 14,
    borderWidth: 1,
    color: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 14,
    flex: 1,
    paddingVertical: 14,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderColor: '#29405d',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#e2e8f0',
    fontWeight: '700',
  },
  log: {
    gap: 10,
    paddingBottom: 24,
  },
  message: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  messageText: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  empty: {
    color: '#64748b',
    textAlign: 'center',
  },
});
