// jarvis/android/backend.js
// WebSocket z serwerem – z automatycznym reconnect

import { useEffect, useRef, useState } from 'react';

// ⚠️ Zmień na lokalny adres IP komputera (sprawdź ipconfig)
export const BACKEND_URL = 'ws://192.168.1.X:8000';

let ws = null;
let reconnectTimer = null;
const listeners = new Set();

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  console.log('[WS] Łączenie z serwerem...');
  ws = new WebSocket(BACKEND_URL);

  ws.onopen = () => {
    console.log('[WS] Połączono!');
    clearTimeout(reconnectTimer);
    // Zarejestruj się jako telefon
    ws.send(JSON.stringify({ type: 'register', role: 'phone' }));
    notifyListeners({ connected: true });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      listeners.forEach(cb => cb(msg));
    } catch {
      listeners.forEach(cb => cb({ type: 'raw', text: event.data }));
    }
  };

  ws.onclose = () => {
    console.log('[WS] Rozłączono. Ponawiam za 3s...');
    notifyListeners({ connected: false });
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = (err) => {
    console.error('[WS] Błąd:', err.message);
  };
}

function notifyListeners(data) {
  listeners.forEach(cb => cb(data));
}

// Inicjuj połączenie od razu przy imporcie modułu
connect();

export function sendMessage(text) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'message', text }));
    return true;
  }
  return false;
}

// Hook React – subskrybuj wiadomości + status połączenia
export function useBackend() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    function handler(data) {
      if (data.connected !== undefined) {
        setConnected(data.connected);
        return;
      }
      if (data.type === 'response' || data.type === 'info') {
        setMessages(prev => [...prev, { from: 'jarvis', text: data.text, id: Date.now() + Math.random() }]);
      }
    }

    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  return { connected, messages, setMessages };
}
