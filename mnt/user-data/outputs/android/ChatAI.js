// jarvis/android/ChatAI.js
// Czat z Jarvisem – React Native

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, KeyboardAvoidingView,
  Platform, StatusBar, ActivityIndicator
} from 'react-native';
import { useBackend, sendMessage } from './backend';

export default function ChatAI() {
  const { connected, messages, setMessages } = useBackend();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const doSend = () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg = { from: 'user', text, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    const sent = sendMessage(text);
    if (!sent) {
      setMessages(prev => [...prev, { from: 'jarvis', text: '❌ Brak połączenia z serwerem.', id: Date.now() }]);
    }
    setSending(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#16213e" />

      {/* Nagłówek */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🤖 JARVIS</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: connected ? '#4caf50' : '#ff6b6b' }]} />
          <Text style={styles.statusText}>{connected ? 'Połączono' : 'Łączenie...'}</Text>
        </View>
      </View>

      {/* Chat */}
      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <Text style={styles.placeholder}>Napisz cokolwiek lub wydaj komendę, np.{'\n'}"Otwórz Spotify" • "Zrób screenshot" • "Wycisz"</Text>
        )}
        {messages.map(msg => (
          <View key={msg.id} style={[styles.bubble, msg.from === 'user' ? styles.userBubble : styles.jarvisBubble]}>
            <Text style={styles.sender}>{msg.from === 'user' ? 'Ty' : 'Jarvis'}</Text>
            <Text style={styles.bubbleText}>{msg.text}</Text>
          </View>
        ))}
        {sending && <ActivityIndicator color="#00d4ff" style={{ alignSelf: 'flex-start', marginLeft: 8 }} />}
      </ScrollView>

      {/* Input */}
      <View style={styles.footer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Napisz komendę lub pytanie..."
          placeholderTextColor="#666"
          onSubmitEditing={doSend}
          returnKeyType="send"
          multiline={false}
        />
        <TouchableOpacity style={[styles.sendBtn, !connected && styles.sendBtnDisabled]} onPress={doSend}>
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    backgroundColor: '#16213e',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#00d4ff', letterSpacing: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, color: '#aaa' },
  chat: { flex: 1 },
  placeholder: {
    color: '#555',
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  bubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 12,
  },
  userBubble: {
    backgroundColor: '#0f3460',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 2,
  },
  jarvisBubble: {
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#0f3460',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 2,
  },
  sender: { fontSize: 11, color: '#00d4ff', marginBottom: 3, fontWeight: 'bold' },
  bubbleText: { color: '#e0e0e0', fontSize: 14, lineHeight: 20 },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: '#16213e',
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0f3460',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#e0e0e0',
    fontSize: 14,
  },
  sendBtn: {
    backgroundColor: '#00d4ff',
    borderRadius: 10,
    width: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#2a4a5e' },
  sendText: { color: '#1a1a2e', fontSize: 18, fontWeight: 'bold' },
});
