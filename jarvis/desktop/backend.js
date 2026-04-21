// jarvis/desktop/backend.js
// Połączenie z backendem przez WebSocket

const WebSocket = require('ws');

const BACKEND_URL = 'ws://localhost:8000/ws'; // Przykładowy adres backendu

function connectToBackend() {
  const ws = new WebSocket(BACKEND_URL);

  ws.on('open', () => {
    console.log('Połączono z backendem!');
    // Możesz wysłać token autoryzacyjny tutaj
  });

  ws.on('message', (data) => {
    console.log('Odebrano wiadomość:', data);
    // Obsłuż polecenia z backendu
  });

  ws.on('close', () => {
    console.log('Rozłączono z backendem.');
  });

  ws.on('error', (err) => {
    console.error('Błąd połączenia:', err);
  });
}

module.exports = { connectToBackend };

// Aby przetestować, odkomentuj poniższą linię:
// connectToBackend();
