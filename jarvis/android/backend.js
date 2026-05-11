import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getToken } from './auth';

const BACKEND_URL = 'ws://10.0.2.2:8000/ws';
const MESSAGE_STORAGE_KEY = 'jarvis-mobile-history-v2';
const MAX_MESSAGES = 80;

function createMessage(partial = {}) {
  return {
    id: partial.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: partial.createdAt || new Date().toISOString(),
    kind: partial.kind || 'system',
    title: partial.title || 'Jarvis',
    text: partial.text || '',
    imageDataUrl: partial.imageDataUrl || null,
    taskId: partial.taskId || null,
    status: partial.status || null,
  };
}

function parseIncomingMessage(raw) {
  let payload;
  try {
    payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return createMessage({ title: 'Backend', text: String(raw), kind: 'system' });
  }

  if (payload.type === 'task_update') {
    return createMessage({
      id: payload.taskId ? `task-${payload.taskId}-${payload.status}` : undefined,
      kind: 'task',
      title: payload.taskId ? `Task ${payload.taskId}` : 'Task update',
      text: payload.currentStep
        ? `${payload.status}: ${payload.currentStep} (${payload.progress ?? 0}%)`
        : `${payload.status}: ${payload.summary || payload.prompt || 'Task update'}`,
      status: payload.status || null,
      taskId: payload.taskId || null,
      createdAt: payload.createdAt,
    });
  }

  if (payload.type === 'command_result') {
    return createMessage({
      kind: payload.level === 'error' ? 'error' : 'assistant',
      title: payload.title || 'PC result',
      text: payload.summary || payload.text || 'Action completed.',
      imageDataUrl: payload.imageDataUrl || null,
      taskId: payload.taskId || null,
      status: payload.level || null,
      createdAt: payload.createdAt,
    });
  }

  if (payload.type === 'peer_registered') {
    return createMessage({
      kind: 'system',
      title: 'Presence',
      text: `${payload.role || 'Device'} connected.`,
      createdAt: payload.createdAt,
    });
  }

  if (payload.type === 'peer_disconnected') {
    return createMessage({
      kind: 'system',
      title: 'Presence',
      text: `${payload.role || 'Device'} disconnected.`,
      createdAt: payload.createdAt,
    });
  }

  if (payload.type === 'presence_snapshot') {
    return createMessage({
      kind: 'system',
      title: 'Presence',
      text: `Connected clients: ${payload.active_connections ?? 0}.`,
      createdAt: payload.createdAt,
    });
  }

  return createMessage({
    kind: payload.level === 'error' ? 'error' : 'system',
    title: payload.title || payload.type || 'Backend',
    text: payload.summary || payload.text || payload.message || JSON.stringify(payload),
    createdAt: payload.createdAt,
  });
}

function trimMessages(messages) {
  return messages.slice(0, MAX_MESSAGES);
}

export function useBackendConnection() {
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [token, setToken] = useState('');
  const [messages, setMessages] = useState([]);
  const [pcOnline, setPcOnline] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(MESSAGE_STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setMessages(trimMessages(parsed));
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(MESSAGE_STORAGE_KEY, JSON.stringify(trimMessages(messages))).catch(() => null);
  }, [messages]);

  const pushMessage = useCallback((message) => {
    setMessages((current) => trimMessages([createMessage(message), ...current]));
  }, []);

  useEffect(() => {
    let isMounted = true;

    const connect = async () => {
      const deviceToken = await getToken();
      if (!isMounted) return;

      setToken(deviceToken);
      setStatus('connecting');

      const ws = new WebSocket(BACKEND_URL);
      socketRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        ws.send(JSON.stringify({ type: 'register', role: 'android', token: deviceToken }));
      };

      ws.onmessage = (event) => {
        const message = parseIncomingMessage(event.data);
        pushMessage(message);

        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'presence_snapshot') {
            setPcOnline((payload.role_counts?.desktop || 0) > 0);
          }
          if (payload.type === 'peer_registered' && payload.role === 'desktop') {
            setPcOnline(true);
          }
          if (payload.type === 'peer_disconnected') {
            setPcOnline((payload.role_counts?.desktop || 0) > 0);
          }
          if (payload.type === 'device_status' && payload.role === 'desktop') {
            setPcOnline(payload.status === 'online');
          }
        } catch {
          // non-json payload already handled as a plain message
        }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        setPcOnline(false);
        reconnectTimerRef.current = setTimeout(() => {
          connect().catch((error) => {
            setStatus(`error:${error.message}`);
          });
        }, 3000);
      };

      ws.onerror = (error) => {
        const message = error?.message || 'websocket error';
        setStatus(`error:${message}`);
      };
    };

    connect().catch((error) => {
      setStatus(`error:${error.message}`);
    });

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [pushMessage]);

  const sendPrompt = useCallback((text) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    pushMessage({ kind: 'user', title: 'You', text });
    socketRef.current.send(JSON.stringify({ type: 'desktop_prompt', text, token }));
    return true;
  }, [pushMessage, token]);

  const sendCommand = useCallback((command, app, extra = {}) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    pushMessage({
      kind: 'user',
      title: 'Quick action',
      text: extra.label || (app ? `${command}: ${app}` : command),
    });
    socketRef.current.send(JSON.stringify({ type: 'command', command, app, token, ...extra }));
    return true;
  }, [pushMessage, token]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    void AsyncStorage.removeItem(MESSAGE_STORAGE_KEY).catch(() => null);
  }, []);

  return {
    backendUrl: BACKEND_URL,
    clearHistory,
    messages,
    pcOnline,
    sendCommand,
    sendPrompt,
    status,
    token,
  };
}
