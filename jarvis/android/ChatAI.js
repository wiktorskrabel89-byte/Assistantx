// jarvis/android/ChatAI.js
// Prosty komponent czatu AI (placeholder)

import React, { useState } from 'react';
import { View, TextInput, Button, Text, ScrollView } from 'react-native';

export default function ChatAI() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages([...messages, { from: 'user', text: input }]);
    setInput('');
    // Tu wyślij wiadomość do backendu/AI
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <ScrollView style={{ flex: 1 }}>
        {messages.map((msg, idx) => (
          <Text key={idx} style={{ marginVertical: 4 }}>
            <Text style={{ fontWeight: 'bold' }}>{msg.from}: </Text>{msg.text}
          </Text>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8 }}
          value={input}
          onChangeText={setInput}
          placeholder="Wpisz wiadomość..."
        />
        <Button title="Wyślij" onPress={sendMessage} />
      </View>
    </View>
  );
}
