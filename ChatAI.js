// jarvis/desktop/ChatAI.js
// UI czatu dla Electron – wysyła tekst do serwera (nie mapuje lokalnie)

window.addEventListener('DOMContentLoaded', () => {
  const chat = document.getElementById('chat');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const status = document.getElementById('status');

  const { sendMessageToBackend, onMessage } = require('./backend');

  // Nasłuchuj wiadomości z serwera
  onMessage((rawData) => {
    try {
      const msg = JSON.parse(rawData);
      if (msg.type === 'response' || msg.type === 'info') {
        appendMessage('Jarvis', msg.text, 'jarvis');
      }
      if (msg.type === 'info') {
        status.textContent = '🟢 Połączono';
        status.style.color = '#4caf50';
      }
    } catch {
      appendMessage('Jarvis', rawData, 'jarvis');
    }
  });

  function appendMessage(sender, text, cls) {
    const div = document.createElement('div');
    div.className = `msg ${cls}`;
    div.innerHTML = `<span class="sender">${sender}:</span> ${escapeHtml(text)}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function doSend() {
    const text = input.value.trim();
    if (!text) return;
    appendMessage('Ty', text, 'user');
    input.value = '';
    // Wyślij surowy tekst – serwer przekaże do Claude
    sendMessageToBackend({ type: 'message', text });
  }

  send.addEventListener('click', doSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
});
