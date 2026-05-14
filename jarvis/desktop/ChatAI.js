// jarvis/desktop/ChatAI.js
// Prosty komponent czatu AI (Electron)

let queuePromptExecution;
let onMessage;
try {
  const backend = require('./backend');
  queuePromptExecution = backend.queuePromptExecution;
  onMessage = backend.onMessage;
} catch (err) {
  console.error('[ChatAI] Failed to load backend module:', err);
}

window.addEventListener('DOMContentLoaded', () => {
  const chat = document.getElementById('chat');
  const input = document.getElementById('input');
  const send = document.getElementById('send');

  function appendMsg(speaker, text) {
    const msg = document.createElement('div');
    msg.textContent = speaker + ': ' + text;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  }

  if (onMessage) {
    onMessage((raw) => {
      try {
        const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const text = payload?.text || payload?.summary || String(raw);
        appendMsg('Jarvis', text);
      } catch (err) {
        console.error('[ChatAI] Failed to parse message payload:', err);
        appendMsg('Jarvis', String(raw));
      }
    });
  }

  function submit() {
    const text = input.value.trim();
    if (!text) return;
    appendMsg('Ty', text);
    input.value = '';
    if (queuePromptExecution) {
      queuePromptExecution(text, { source: 'chat-ui', origin: 'desktop' });
    }
  }

  send.onclick = submit;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
});
