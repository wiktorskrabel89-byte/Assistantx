import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// ── Optional voice packages ─────────────────────────────────────────────────
// Install with: npm install @react-native-voice/voice react-native-tts
let Voice = null;
let Tts = null;
try { Voice = require('@react-native-voice/voice').default; } catch { /* not installed */ }
try { Tts = require('react-native-tts').default; } catch { /* not installed */ }

const QUICK_ACTIONS_KEY = 'jarvis-quick-actions-v1';

const DEFAULT_QUICK_ACTIONS = [
  { id: 'discord',    label: 'Discord',    command: 'openApp', app: 'discord', style: 'primary' },
  { id: 'roblox',     label: 'Roblox',     command: 'openApp', app: 'roblox',  style: 'primary' },
  { id: 'screenshot', label: 'Screenshot', command: 'screenshot', app: '',     style: 'secondary' },
  { id: 'sysinfo',    label: 'System Info',command: 'sysinfo', app: '',        style: 'secondary' },
  { id: 'files',      label: 'Files',      command: 'listFiles', app: '',      style: 'secondary' },
  { id: 'sleep',      label: 'Sleep',      command: 'sleep', app: '',          style: 'secondary' },
];

async function loadQuickActions() {
  try {
    const raw = await AsyncStorage.getItem(QUICK_ACTIONS_KEY);
    if (!raw) return DEFAULT_QUICK_ACTIONS;
    const saved = JSON.parse(raw);
    return Array.isArray(saved) && saved.length ? saved : DEFAULT_QUICK_ACTIONS;
  } catch {
    return DEFAULT_QUICK_ACTIONS;
  }
}

async function saveQuickActions(actions) {
  await AsyncStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(actions));
}

function MessageBubble({ message, onApprove, onDeny }) {
  const bubbleStyle = [
    styles.messageBubble,
    message.kind === 'user' ? styles.userBubble : null,
    message.kind === 'assistant' ? styles.assistantBubble : null,
    message.kind === 'task' ? styles.taskBubble : null,
    message.kind === 'error' ? styles.errorBubble : null,
  ];

  // Parse approvalId from approval_required messages
  const approvalMatch = message.text?.match(/approvalId:\s*(approval-[\w-]+)/);
  const approvalId = approvalMatch?.[1];

  return (
    <View style={bubbleStyle}>
      <Text style={styles.messageTitle}>{message.title}</Text>
      <Text style={styles.messageText}>{message.text}</Text>
      {approvalId ? (
        <View style={styles.approvalRow}>
          <Pressable style={styles.approveBtn} onPress={() => onApprove?.(approvalId)}>
            <Text style={styles.approveBtnText}>✅ Approve</Text>
          </Pressable>
          <Pressable style={styles.denyBtn} onPress={() => onDeny?.(approvalId)}>
            <Text style={styles.denyBtnText}>❌ Deny</Text>
          </Pressable>
        </View>
      ) : null}
      {message.imageDataUrl ? (
        <Image
          source={{ uri: message.imageDataUrl }}
          style={styles.previewImage}
          resizeMode="cover"
          accessible
          accessibilityLabel="Screenshot preview from Jarvis"
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
    pcPresence,
    sendApproval,
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

  // Voice STT state
  const [sttActive, setSttActive] = useState(false);
  const [sttAvailable] = useState(() => Voice !== null);

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsAvailable] = useState(() => Tts !== null);

  // Quick-actions state
  const [quickActions, setQuickActions] = useState(DEFAULT_QUICK_ACTIONS);
  const [editingActions, setEditingActions] = useState(false);
  const [newActionLabel, setNewActionLabel] = useState('');
  const [newActionCommand, setNewActionCommand] = useState('');
  const [newActionApp, setNewActionApp] = useState('');

  // Persisted TTS pref
  useEffect(() => {
    AsyncStorage.getItem('jarvis-tts-enabled').then((val) => {
      if (val !== null) setTtsEnabled(val !== 'false');
    }).catch(() => null);
  }, []);

  const toggleTts = () => {
    setTtsEnabled((prev) => {
      const next = !prev;
      if (!next && Tts) {
        Tts.stop();
      }
      AsyncStorage.setItem('jarvis-tts-enabled', String(next)).catch(() => null);
      return next;
    });
  };

  // Load quick-actions from storage
  useEffect(() => {
    loadQuickActions().then(setQuickActions).catch(() => null);
  }, []);

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

  // TTS: read new assistant messages aloud
  const lastSpokenIdRef = useRef(null);
  useEffect(() => {
    if (!ttsEnabled || !Tts || !messages.length) return;
    const latest = messages[0];
    if (latest.kind !== 'assistant') return;
    if (latest.id === lastSpokenIdRef.current) return;
    lastSpokenIdRef.current = latest.id;
    const textToSpeak = latest.text?.slice(0, 300) || '';
    if (textToSpeak) {
      Tts.stop();
      Tts.speak(textToSpeak);
    }
  }, [messages, ttsEnabled]);

  // STT handlers
  const startListening = useCallback(async () => {
    if (!Voice) return;
    try {
      Voice.onSpeechResults = (e) => {
        const text = e.value?.[0] || '';
        if (text) setPrompt(text);
        setSttActive(false);
      };
      Voice.onSpeechError = () => setSttActive(false);
      await Voice.start('en-US');
      setSttActive(true);
    } catch {
      setSttActive(false);
    }
  }, []);

  const stopListening = useCallback(async () => {
    if (!Voice) return;
    try {
      await Voice.stop();
    } finally {
      setSttActive(false);
    }
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

  const addQuickAction = async () => {
    if (!newActionLabel.trim() || !newActionCommand.trim()) return;
    const newAction = {
      id: `custom-${Date.now()}`,
      label: newActionLabel.trim(),
      command: newActionCommand.trim(),
      app: newActionApp.trim(),
      style: 'secondary',
    };
    const updated = [...quickActions, newAction];
    setQuickActions(updated);
    await saveQuickActions(updated);
    setNewActionLabel('');
    setNewActionCommand('');
    setNewActionApp('');
  };

  const removeQuickAction = async (id) => {
    const updated = quickActions.filter((a) => a.id !== id);
    setQuickActions(updated);
    await saveQuickActions(updated);
  };

  const recentScreenshot = useMemo(
    () => messages.find((message) => message.imageDataUrl),
    [messages]
  );

  const pcPresenceText = useMemo(() => {
    if (!pcOnline) return 'PC offline';
    if (!pcPresence) return 'PC online';
    const parts = ['PC online'];
    if (pcPresence.cpu !== null) parts.push(`CPU ${pcPresence.cpu}%`);
    if (pcPresence.freeRamMb && pcPresence.totalRamMb) {
      parts.push(`RAM ${pcPresence.freeRamMb}/${pcPresence.totalRamMb}MB`);
    }
    if (pcPresence.activeApps?.length) parts.push(pcPresence.activeApps.slice(0, 2).join(', '));
    return parts.join(' · ');
  }, [pcOnline, pcPresence]);

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
              <Text style={styles.statusBadgeText}>{pcPresenceText}</Text>
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

        {/* Quick Actions */}
        <View style={styles.quickActionsCard}>
          <View style={styles.quickActionsHeader}>
            <Text style={styles.sectionTitle}>Quick actions</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setEditingActions((v) => !v)}>
                <Text style={styles.clearText}>{editingActions ? 'Done' : '✏️ Edit'}</Text>
              </Pressable>
              <Pressable onPress={clearHistory}>
                <Text style={styles.clearText}>Clear history</Text>
              </Pressable>
            </View>
          </View>

          {/* Render quick action buttons in rows of 3 */}
          {Array.from({ length: Math.ceil(quickActions.length / 3) }).map((_, rowIdx) => (
            <View key={rowIdx} style={styles.row}>
              {quickActions.slice(rowIdx * 3, rowIdx * 3 + 3).map((action) => (
                <View key={action.id} style={{ flex: 1, position: 'relative' }}>
                  <Pressable
                    style={action.style === 'primary' ? styles.primaryButton : styles.secondaryButton}
                    onPress={() => sendCommand(action.command, action.app, { label: action.label })}
                  >
                    <Text style={action.style === 'primary' ? styles.buttonText : styles.buttonTextSecondary}>
                      {action.label}
                    </Text>
                  </Pressable>
                  {editingActions ? (
                    <Pressable style={styles.removeActionBtn} onPress={() => removeQuickAction(action.id)}>
                      <Text style={styles.removeActionText}>✕</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          ))}

          {editingActions ? (
            <View style={styles.addActionForm}>
              <Text style={styles.inputLabel}>Label</Text>
              <TextInput style={styles.settingsInput} value={newActionLabel} onChangeText={setNewActionLabel} placeholder="e.g. Spotify" placeholderTextColor="#94a3b8" />
              <Text style={styles.inputLabel}>Command</Text>
              <TextInput style={styles.settingsInput} value={newActionCommand} onChangeText={setNewActionCommand} placeholder="e.g. openApp" placeholderTextColor="#94a3b8" autoCapitalize="none" />
              <Text style={styles.inputLabel}>App / target (optional)</Text>
              <TextInput style={styles.settingsInput} value={newActionApp} onChangeText={setNewActionApp} placeholder="e.g. spotify" placeholderTextColor="#94a3b8" autoCapitalize="none" />
              <Pressable style={styles.saveBtn} onPress={addQuickAction}>
                <Text style={styles.saveBtnText}>+ Add action</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Chat composer with STT / TTS */}
        <View style={styles.composerCard}>
          <View style={styles.composerHeader}>
            <Text style={styles.sectionTitle}>Chat with Jarvis</Text>
            {ttsAvailable ? (
              <Pressable onPress={toggleTts} style={styles.ttsToggle}>
                <Text style={styles.clearText}>{ttsEnabled ? '🔊 TTS on' : '🔇 TTS off'}</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.hint}>Type natural-language commands like &quot;open Roblox and take a screenshot&quot;.</Text>
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
            {sttAvailable ? (
              <Pressable
                style={[styles.micBtn, sttActive && styles.micBtnActive]}
                onPress={sttActive ? stopListening : startListening}
              >
                <Text style={styles.buttonText}>{sttActive ? '⏹' : '🎙'}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.sendBtn} onPress={submitPrompt}>
              <Text style={styles.buttonText}>Send</Text>
            </Pressable>
          </View>
        </View>

        {recentScreenshot ? (
          <View style={styles.previewCard}>
            <Text style={styles.sectionTitle}>Latest screenshot</Text>
            <Image
              source={{ uri: recentScreenshot.imageDataUrl }}
              style={styles.latestPreviewImage}
              resizeMode="cover"
              accessible
              accessibilityLabel="Latest screenshot preview from Jarvis"
            />
          </View>
        ) : null}

        <View style={styles.logContainer}>
          <Text style={styles.sectionTitle}>Conversation &amp; results</Text>
          {messages.length === 0 ? (
            <Text style={styles.empty}>No messages yet.</Text>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onApprove={(id) => sendApproval(id, true)}
                onDeny={(id) => sendApproval(id, false)}
              />
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
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  statusBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexShrink: 1,
  },
  onlineBadge: { backgroundColor: '#dcfce7' },
  offlineBadge: { backgroundColor: '#fee2e2' },
  statusBadgeText: { fontSize: 11, fontWeight: '700', color: '#0f172a' },
  label: { color: '#0369a1', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 6 },
  value: { color: '#0f172a', fontSize: 13, marginBottom: 2 },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  connected: { color: '#16a34a', fontWeight: '600' },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', paddingVertical: 16 },

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
  removeActionBtn: {
    position: 'absolute',
    top: -6,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 999,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeActionText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  addActionForm: {
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  composerCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  composerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ttsToggle: { paddingHorizontal: 8, paddingVertical: 4 },
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
  micBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  micBtnActive: { backgroundColor: '#dc2626' },
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
  userBubble: { borderColor: '#bae6fd', backgroundColor: '#eff6ff' },
  assistantBubble: { borderColor: '#bfdbfe', backgroundColor: '#f8fafc' },
  taskBubble: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  errorBubble: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  messageTitle: { color: '#0369a1', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  messageText: { color: '#0f172a', fontSize: 13, lineHeight: 18 },
  messageMeta: { color: '#94a3b8', fontSize: 10, textAlign: 'right' },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#dbeafe',
  },

  approvalRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  approveBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  approveBtnText: { color: '#15803d', fontWeight: '700', fontSize: 12 },
  denyBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  denyBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },
});
