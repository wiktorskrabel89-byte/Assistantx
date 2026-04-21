// jarvis/android/backend.js
// Połączenie z backendem przez WebSocket (React Native)

import { useEffect } from 'react';

const BACKEND_URL = 'ws://localhost:8000/ws'; // Przykładowy adres backendu

export function useBackendConnection() {
  useEffect(() => {
    const ws = new WebSocket(BACKEND_URL);

    ws.onopen = () => {
      console.log('Połączono z backendem!');
      // Możesz wysłać token autoryzacyjny tutaj
    };

    ws.onmessage = (event) => {
      console.log('Odebrano wiadomość:', event.data);
      // Obsłuż wiadomości z backendu
    };

    ws.onclose = () => {
      console.log('Rozłączono z backendem.');
    };

    ws.onerror = (err) => {
      console.error('Błąd połączenia:', err);
    };

    return () => ws.close();
  }, []);
}
