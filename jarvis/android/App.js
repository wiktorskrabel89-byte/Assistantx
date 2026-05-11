import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useBackendConnection } from './backend';
import { checkForUpdate, dismissUpdate, openDownloadUrl } from './updater';
import {
  loadMac,
  loadServerUrl,
  loadWolSecret,
  saveMac,
  saveServerUrl,
  saveWolSecret,
  sendWakeOnLan,
} from './wol';

function MessageBubble({ message }) {
  const bubbleStyle = [
    styles.messageBubble,
    message.kind === 'user' ? styles.userBubble : null,
    message.kind === 'assistant' ? styles.assistantBubble : null,
    message.kind === 'task' ? styles.taskBubble : null,
    message.kind === 'error' ? styles.errorBubble : null,
  ];

  return (
    <View style={bubbleStyle}>
      <Text style={styles.messageTitle}>{message.title}</Text>
      <Text style={styles.messageText}>{message.text}</Text>
      {message.imageDataUrl ? (
        <Image
          source={{ uri: message.imageDataUrl }}
          style={styles.previewImage}
          resizeMode="cover"
        />
      ) : null}
      <Text style={styles.messageMeta}>
        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

export default function App() {
  const {
    backendUrl,
    clearHistory,
    messages,
    pcOnline,
    sendCommand,
    sendPrompt,
    status,
    token,
  } = useBackendConnection();
  const [prompt, setPrompt] = useState('');
  const [mac, setMac] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [wolSecret, setWolSecret] = useState('');
  const [wolStatus, setWolStatus] = useState('');
  const [wolBusy, setWolBusy] = useState(false);
  const [showWolSettings, setShowWolSettings] = useState(false);

  useEffect(() => {
    Promise.all([loadMac(), loadServerUrl(), loadWolSecret()]).then(([savedMac, savedUrl, savedSecret]) => {
      if (savedMac) setMac(savedMac);
      if (savedUrl) setServerUrl(savedUrl);
      if (savedSecret) setWolSecret(savedSecret);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const savedUrl = await loadServerUrl();
        const update = await checkForUpdate(savedUrl);
        if (cancelled || !update) return;

        const notes = update.releaseNotes
          ? update.releaseNotes.replace(/#+\s*/g, '').trim().slice(0, 600)
          : 'No release notes available.';

        Alert.alert(
          '🚀 Jarvis Update Available',
          `Version: ${update.version}\n\nWhat's new:\n${notes}`,
          [
            {
              text: 'Download',
              onPress: async () => {
                await dismissUpdate(update.updatedAt);
                await openDownloadUrl(update.downloadUrl);
              },
            },
            {
              text: 'Later',
              style: 'cancel',
              onPress: () => dismissUpdate(update.updatedAt),
            },
          ],
          { cancelable: true }
        );
      } catch {
        // ignore updater failures
      }
    })();

    return () => {
      cancelled = true;
    };
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
      Alert.alert('Missing MAC', 'Enter your PC MAC address first.');
      return;
    }
    if (!trimmedUrl) {
      Alert.alert('Missing server URL', 'Enter the Jarvis server URL first.');
      return;
    }

    setWolBusy(true);
    setWolStatus('Sending magic packet…');

    try {
      const result = await sendWakeOnLan(trimmedMac, trimmedUrl, '255.255.255.255', wolSecret.trim());
      setWolStatus(`✅ ${result.message}`);
    } catch (err) {
      setWolStatus(`❌ ${err.message}`);
    } finally {
      setWolBusy(false);
    }
  };

  const saveWolSettings = async () => {
    await Promise.all([
      saveMac(mac.trim()),
      saveServerUrl(serverUrl.trim()),
      saveWolSecret(wolSecret.trim()),
    ]);
    setShowWolSettings(false);
    setWolStatus('Settings saved.');
  };

  const recentScreenshot = useMemo(
    () => messages.find((message) => message.imageDataUrl),
    [messages]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Jarvis Android</Text>
        <Text style={styles.subtitle}>
          Mobile chat, quick actions, PC status, and remote results in one place.
        </Text>

        <View style={styles.panel}>
          <View style={styles.statusRow}>
            <View>
              <Text style={styles.label}>Backend</Text>
              <Text style={styles.value}>{backendUrl}</Text>
            </View>
            <View style={[styles.statusBadge, pcOnline ? styles.onlineBadge : styles.offlineBadge]}>
              <Text style={styles.statusBadgeText}>{pcOnline ? 'PC online' : 'PC offline'}</Text>
            </View>
          </View>
          <Text style={styles.label}>Socket status</Text>
          <Text style={[styles.value, status === 'connected' ? styles.connected : null]}>
            {status}
          </Text>
          <Text style={styles.label}>Phone token</Text>
          <Text style={[styles.value, styles.mono]}>{token || 'Loading…'}</Text>
        </View>

        <View style={styles.wolPanel}>
          <View style={styles.wolHeader}>
            <Text style={styles.sectionTitle}>🖥️ Wake PC</Text>
            <Pressable onPress={() => setShowWolSettings((value) => !value)} style={styles.settingsBtn}>
              <Text style={styles.settingsBtnText}>{showWolSettings ? 'Hide' : '⚙ Settings'}</Text>
            </Pressable>
          </View>

          {showWolSettings ? (
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
              <Text style={styles.inputLabel}>Optional WoL shared secret</Text>
              <TextInput
                style={styles.settingsInput}
                value={wolSecret}
                onChangeText={setWolSecret}
                placeholder="Matches JARVIS_WOL_SHARED_SECRET on the server"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
              <Pressable style={styles.saveBtn} onPress={saveWolSettings}>
                <Text style={styles.saveBtnText}>Save Settings</Text>
              </Pressable>
              <Text style={styles.hint}>
                Add the shared secret only if your server is configured with JARVIS_WOL_SHARED_SECRET.
              </Text>
            </View>
          ) : null}

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

        <View style={styles.quickActionsCard}>
          <View style={styles.quickActionsHeader}>
            <Text style={styles.sectionTitle}>Quick actions</Text>
            <Pressable onPress={clearHistory}>
              <Text style={styles.clearText}>Clear history</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable style={styles.primaryButton} onPress={() => sendCommand('openApp', 'discord', { label: 'Open Discord' })}>
              <Text style={styles.buttonText}>Discord</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => sendCommand('openApp', 'roblox', { label: 'Open Roblox' })}>
              <Text style={styles.buttonText}>Roblox</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => sendCommand('screenshot', '', { label: 'Take screenshot' })}>
              <Text style={styles.buttonTextSecondary}>Screenshot</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable style={styles.secondaryButton} onPress={() => sendCommand('sysinfo', '', { label: 'System info' })}>
              <Text style={styles.buttonTextSecondary}>System Info</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => sendCommand('listFiles', '', { label: 'List desktop files' })}>
              <Text style={styles.buttonTextSecondary}>Files</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => sendCommand('sleep', '', { label: 'Sleep PC' })}>
              <Text style={styles.buttonTextSecondary}>Sleep</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.composerCard}>
          <Text style={styles.sectionTitle}>Chat with Jarvis</Text>
          <Text style={styles.hint}>Type natural-language commands like “open Roblox and take a screenshot”.</Text>
          <View style={styles.composer}>
            <TextInput
              onChangeText={setPrompt}
              placeholder='e.g. "open Spotify and show me a screenshot"'
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
        </View>

        {recentScreenshot ? (
          <View style={styles.previewCard}>
            <Text style={styles.sectionTitle}>Latest screenshot</Text>
            <Image source={{ uri: recentScreenshot.imageDataUrl }} style={styles.latestPreviewImage} resizeMode="cover" />
          </View>
        ) : null}

        <View style={styles.logContainer}>
          <Text style={styles.sectionTitle}>Conversation & results</Text>
          {messages.length === 0 ? (
            <Text style={styles.empty}>No messages yet.</Text>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
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
    gap: 6,
    padding: 14,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  statusBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  onlineBadge: { backgroundColor: '#dcfce7' },
  offlineBadge: { backgroundColor: '#fee2e2' },
  statusBadgeText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  label: { color: '#0369a1', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 6 },
  value: { color: '#0f172a', fontSize: 13, marginBottom: 2 },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  connected: { color: '#16a34a', fontWeight: '600' },

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

  quickActionsCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  quickActionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clearText: { color: '#0369a1', fontWeight: '600', fontSize: 12 },
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

  composerCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
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

  previewCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  latestPreviewImage: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: '#dbeafe',
  },

  logContainer: { gap: 8 },
  messageBubble: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  userBubble: {
    borderColor: '#bae6fd',
    backgroundColor: '#eff6ff',
  },
  assistantBubble: {
    borderColor: '#bfdbfe',
    backgroundColor: '#f8fafc',
  },
  taskBubble: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  errorBubble: {
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  messageTitle: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  messageText: { color: '#334155', fontSize: 13, lineHeight: 19 },
  messageMeta: { color: '#94a3b8', fontSize: 11 },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#dbeafe',
  },
  empty: { color: '#64748b', textAlign: 'center', fontSize: 13 },
});
