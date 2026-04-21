// jarvis/desktop/ChatAI.js
// Prosty komponent czatu AI (placeholder, Electron)

const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  const chat = document.getElementById('chat');
  const input = document.getElementById('input');
  const send = document.getElementById('send');

  send.onclick = () => {
    const text = input.value.trim();
    if (!text) return;
    const msg = document.createElement('div');
    msg.textContent = 'Ty: ' + text;
    chat.appendChild(msg);
    input.value = '';
    // Tu wyślij wiadomość do backendu/AI
  };
});
