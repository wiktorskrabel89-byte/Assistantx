// jarvis/server/server.js
// Serwer WebSocket – most między telefonem a komputerem + Claude AI

const WebSocket = require('ws');
const https = require('https');

const PORT = 8000;
const wss = new WebSocket.Server({ port: PORT });

let desktopClient = null;
let phoneClient = null;

// ─── Claude API ────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'YOUR_API_KEY_HERE';

async function callClaude(userMessage) {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: `Jesteś Jarvisem – asystentem sterującym komputerem z Windows.
Gdy użytkownik wydaje polecenie do komputera, odpowiedz TYLKO poprawnym JSON:
{"action":"command","command":"<komenda>","app":"<opcjonalnie>"}

Dostępne komendy:
- openApp    (app: np. "chrome","roblox","spotify","discord","notepad","steam","calc","firefox")
- closeApp   (app: jak wyżej)
- volumeUp
- volumeDown
- mute
- screenshot
- lockScreen
- shutdown
- restart
- sleep

Gdy to zwykła rozmowa (nie polecenie), odpowiedz:
{"action":"chat","text":"<twoja odpowiedź po polsku>"}

Odpowiadaj WYŁĄCZNIE poprawnym JSON, zero innego tekstu.`,
    messages: [{ role: 'user', content: userMessage }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.content[0].text.trim();
          resolve(JSON.parse(text));
        } catch (e) {
          reject(new Error('Zła odpowiedź Claude: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── WebSocket server ──────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[+] Połączenie z ${ip}`);

  ws.on('message', async (rawData) => {
    let msg;
    try { msg = JSON.parse(rawData); } catch { return; }

    // Rejestracja roli klienta
    if (msg.type === 'register') {
      if (msg.role === 'desktop') {
        desktopClient = ws;
        console.log('[✓] Desktop zarejestrowany');
        ws.send(JSON.stringify({ type: 'info', text: 'Desktop połączony.' }));
      } else if (msg.role === 'phone') {
        phoneClient = ws;
        console.log('[✓] Telefon zarejestrowany');
        ws.send(JSON.stringify({ type: 'info', text: 'Telefon połączony.' }));
      }
      return;
    }

    // Wiadomość z telefonu → Claude → desktop lub chat
    if (msg.type === 'message' && ws === phoneClient) {
      console.log(`[telefon → Claude] "${msg.text}"`);
      try {
        const response = await callClaude(msg.text);

        if (response.action === 'command') {
          const label = response.app ? `${response.command} (${response.app})` : response.command;
          if (desktopClient && desktopClient.readyState === WebSocket.OPEN) {
            desktopClient.send(JSON.stringify({ type: 'command', command: response.command, app: response.app }));
            ws.send(JSON.stringify({ type: 'response', text: `⚙️ Wykonuję: ${label}` }));
          } else {
            ws.send(JSON.stringify({ type: 'response', text: '❌ Desktop jest offline.' }));
          }
        } else {
          ws.send(JSON.stringify({ type: 'response', text: response.text }));
        }
      } catch (err) {
        console.error('[Claude error]', err.message);
        ws.send(JSON.stringify({ type: 'response', text: '❌ Błąd AI: ' + err.message }));
      }
      return;
    }

    // Odpowiedź z desktopa → do telefonu
    if (msg.type === 'response' && ws === desktopClient) {
      console.log(`[desktop → telefon] "${msg.text}"`);
      if (phoneClient && phoneClient.readyState === WebSocket.OPEN) {
        phoneClient.send(JSON.stringify(msg));
      }
    }
  });

  ws.on('close', () => {
    if (ws === desktopClient) { desktopClient = null; console.log('[-] Desktop rozłączony'); }
    if (ws === phoneClient)   { phoneClient = null;   console.log('[-] Telefon rozłączony'); }
  });

  ws.on('error', err => console.error('[WS error]', err.message));
});

console.log(`\n🤖 Jarvis Server działa na ws://localhost:${PORT}`);
console.log('   Telefon: ustaw IP komputera, np. ws://192.168.1.X:8000\n');
