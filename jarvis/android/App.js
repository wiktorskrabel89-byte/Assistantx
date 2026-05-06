import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useBackendConnection } from './backend';
import { loadMac, loadServerUrl, saveMac, saveServerUrl, sendWakeOnLan } from './wol';

export default function App() {
  const { backendUrl, messages, sendCommand, sendPrompt, status, token } = useBackendConnection();
  const [prompt, setPrompt] = useState('');

  // Wake-on-LAN state
  const [mac, setMac] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [wolStatus, setWolStatus] = useState('');
  const [wolBusy, setWolBusy] = useState(false);
  const [showWolSettings, setShowWolSettings] = useState(false);

  // Load persisted WoL settings on mount
  useEffect(() => {
    Promise.all([loadMac(), loadServerUrl()]).then(([savedMac, savedUrl]) => {
      if (savedMac) setMac(savedMac);
      if (savedUrl) setServerUrl(savedUrl);
    });
  }, []);

  const submitPrompt = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    sendPrompt(trimmed);
    setPrompt('');
  };

  const handleWakePC = async () => {
    const trimmedMac = mac.trim();
    const trimmedUrl = serverUrl.trim();

    if (!trimmedMac) {
      Alert.alert('Missing MAC', 'Enter your PC\'s MAC address first (tap ⚙ to configure).');
      return;
    }
    if (!trimmedUrl) {
      Alert.alert('Missing Server URL', 'Enter the Jarvis server URL (tap ⚙ to configure).');
      return;
    }

    setWolBusy(true);
    setWolStatus('Sending magic packet…');

    try {
      const result = await sendWakeOnLan(trimmedMac, trimmedUrl);
      setWolStatus(`✅ ${result.message}`);
    } catch (err) {
      setWolStatus(`❌ ${err.message}`);
    } finally {
      setWolBusy(false);
    }
  };

  const saveWolSettings = async () => {
    await Promise.all([saveMac(mac.trim()), saveServerUrl(serverUrl.trim())]);
    setShowWolSettings(false);
    setWolStatus('Settings saved.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Jarvis Android</Text>
        <Text style={styles.subtitle}>
          Mobile control surface. Send commands to your PC, or wake it remotely.
        </Text>

        {/* Status panel */}
        <View style={styles.panel}>
          <Text style={styles.label}>Backend</Text>
          <Text style={styles.value}>{backendUrl}</Text>
          <Text style={styles.label}>Status</Text>
          <Text style={[styles.value, status === 'connected' ? styles.connected : null]}>
            {status}
          </Text>
          <Text style={styles.label}>Device Token</Text>
          <Text style={[styles.value, styles.mono]}>{token || 'Loading…'}</Text>
        </View>

        {/* Wake-on-LAN panel */}
        <View style={styles.wolPanel}>
          <View style={styles.wolHeader}>
            <Text style={styles.sectionTitle}>🖥️  Wake PC</Text>
            <Pressable onPress={() => setShowWolSettings((v) => !v)} style={styles.settingsBtn}>
              <Text style={styles.settingsBtnText}>⚙ Settings</Text>
            </Pressable>
          </View>

          {showWolSettings && (
            <View style={styles.wolSettings}>
              <Text style={styles.inputLabel}>PC MAC address</Text>
              <TextInput
                style={styles.settingsInput}
                value={mac}
                onChangeText={setMac}
                placeholder="AA:BB:CC:DD:EE:FF"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
              />
              <Text style={styles.inputLabel}>Jarvis server URL</Text>
              <TextInput
                style={styles.settingsInput}
                value={serverUrl}
                onChangeText={setServerUrl}
                placeholder="http://192.168.1.100:3000"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                keyboardType="url"
              />
              <Pressable style={styles.saveBtn} onPress={saveWolSettings}>
                <Text style={styles.saveBtnText}>Save Settings</Text>
              </Pressable>
              <Text style={styles.hint}>
                Find your PC&apos;s MAC in: Settings → Network → Adapter Properties.{'\n'}
                Server URL = the machine running the Next.js Jarvis server on your local network.
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.wakeBtn, wolBusy && styles.wakeBtnDisabled]}
            onPress={handleWakePC}
            disabled={wolBusy}
          >
            {wolBusy
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={styles.wakeBtnText}>⚡ Wake PC</Text>}
          </Pressable>

          {wolStatus ? <Text style={styles.wolStatusText}>{wolStatus}</Text> : null}
        </View>

        {/* Quick actions */}
        <View style={styles.row}>
          <Pressable style={styles.primaryButton} onPress={() => sendCommand('openApp', 'discord')}>
            <Text style={styles.buttonText}>Discord</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => sendCommand('openApp', 'roblox')}>
            <Text style={styles.buttonText}>Roblox</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => sendCommand('screenshot')}>
            <Text style={styles.buttonTextSecondary}>Screenshot</Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <Pressable style={styles.secondaryButton} onPress={() => sendCommand('sysinfo')}>
            <Text style={styles.buttonTextSecondary}>System Info</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => sendCommand('lockScreen')}>
            <Text style={styles.buttonTextSecondary}>Lock Screen</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => sendCommand('sleep')}>
            <Text style={styles.buttonTextSecondary}>Sleep</Text>
          </Pressable>
        </View>

        {/* Prompt input */}
        <View style={styles.composer}>
          <TextInput
            onChangeText={setPrompt}
            placeholder='e.g. "otwórz Spotify" or "search minecraft"'
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={prompt}
            onSubmitEditing={submitPrompt}
            returnKeyType="send"
          />
          <Pressable style={styles.sendBtn} onPress={submitPrompt}>
            <Text style={styles.buttonText}>Send</Text>
          </Pressable>
        </View>

        {/* Message log */}
        <View style={styles.logContainer}>
          <Text style={styles.sectionTitle}>📋 Log</Text>
          {messages.length === 0 ? (
            <Text style={styles.empty}>No messages yet.</Text>
          ) : (
            messages.map((message, index) => (
              <View key={`${message}-${index}`} style={styles.message}>
                <Text style={styles.messageText}>{message}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#eef4ff' },
  container: { padding: 20, gap: 14 },

  title: { color: '#0f172a', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#475569', fontSize: 14, lineHeight: 20 },

  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  label: { color: '#0369a1', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 6 },
  value: { color: '#0f172a', fontSize: 13, marginBottom: 2 },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  connected: { color: '#16a34a', fontWeight: '600' },

  // Wake-on-LAN
  wolPanel: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  wolHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  settingsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#7dd3fc',
  },
  settingsBtnText: { color: '#0369a1', fontSize: 12, fontWeight: '600' },

  wolSettings: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inputLabel: { color: '#475569', fontSize: 12, fontWeight: '600' },
  settingsInput: {
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    color: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  saveBtn: {
    backgroundColor: '#0369a1',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  saveBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  hint: { color: '#64748b', fontSize: 11, lineHeight: 16 },

  wakeBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  wakeBtnDisabled: { opacity: 0.6 },
  wakeBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  wolStatusText: { color: '#475569', fontSize: 12, textAlign: 'center' },

  // Buttons
  row: { flexDirection: 'row', gap: 8 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0369a1',
    borderRadius: 14,
    flex: 1,
    paddingVertical: 13,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 13,
  },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  buttonTextSecondary: { color: '#0f172a', fontWeight: '700', fontSize: 13 },

  // Prompt
  composer: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    color: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
  },
  sendBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0369a1',
    borderRadius: 14,
    paddingHorizontal: 18,
  },

  // Log
  logContainer: { gap: 8 },
  message: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  messageText: { color: '#334155', fontSize: 13 },
  empty: { color: '#64748b', textAlign: 'center', fontSize: 13 },
});

