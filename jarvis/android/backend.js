import { useEffect, useRef, useState } from 'react';

import { getToken } from './auth';

const BACKEND_URL = 'ws://10.0.2.2:8000/ws';

export function useBackendConnection() {
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [token, setToken] = useState('');
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const connect = async () => {
      const deviceToken = await getToken();
      if (!isMounted) {
        return;
      }

      setToken(deviceToken);
      setStatus('connecting');

      const ws = new WebSocket(BACKEND_URL);
      socketRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        ws.send(JSON.stringify({ type: 'register', role: 'android', token: deviceToken }));
      };

      ws.onmessage = (event) => {
        setMessages((current) => [event.data, ...current].slice(0, 50));
      };

      ws.onclose = () => {
        setStatus('disconnected');
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
  }, []);

  const sendPrompt = (text) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    socketRef.current.send(JSON.stringify({ type: 'desktop_prompt', text, token }));
    return true;
  };

  const sendCommand = (command, app) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    socketRef.current.send(JSON.stringify({ type: 'command', command, app, token }));
    return true;
  };

  return {
    backendUrl: BACKEND_URL,
    messages,
    sendCommand,
    sendPrompt,
    status,
    token,
  };
}
