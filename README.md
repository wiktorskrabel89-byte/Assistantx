# 🤖 Jarvis – Asystent sterujący komputerem z telefonu

## Architektura

```
[Telefon Android] ←──WebSocket──→ [Serwer Node.js] ←──WebSocket──→ [Komputer Windows]
                                        ↕
                                   [Claude AI API]
```

Telefon wysyła tekst → Serwer pyta Claude co zrobić → Claude decyduje (komenda/chat) → Serwer wysyła komendę do komputera → Komputer wykonuje i odpowiada.

---

## Krok 1 – Uruchom serwer (na komputerze)

```bash
cd server
npm install
set ANTHROPIC_API_KEY=sk-ant-...   # ustaw swój klucz API
node server.js
```

Serwer nasłuchuje na porcie `8000`.

---

## Krok 2 – Uruchom aplikację desktopową

```bash
cd desktop
npm install
npm start
```

Aplikacja automatycznie łączy się z serwerem i rejestruje jako `desktop`.
Minimalizacja do traya (ikona na pasku zadań) – aplikacja działa w tle.

**Wymagane narzędzia PC (opcjonalne):**
- **NirCmd** (kontrola głośności) → https://www.nirsoft.net/utils/nircmd.html – dodaj do PATH

---

## Krok 3 – Uruchom aplikację mobilną

1. Sprawdź IP komputera w sieci lokalnej:
   ```
   ipconfig   (Windows) → szukaj "IPv4 Address", np. 192.168.1.5
   ```

2. Otwórz `android/backend.js` i zmień adres:
   ```js
   export const BACKEND_URL = 'ws://192.168.1.5:8000';
   ```

3. Uruchom aplikację:
   ```bash
   cd android
   npm install
   npx react-native run-android
   ```

---

## Dostępne komendy (przez Claude AI)

Możesz mówić naturalnie – Claude rozumie polskie polecenia:

| Co powiesz | Co się stanie |
|---|---|
| "Otwórz Chrome" | Uruchamia przeglądarkę |
| "Włącz Roblox" | Uruchamia Roblox |
| "Zrób screenshot" | Zapisuje zrzut ekranu na Pulpicie |
| "Zwiększ głośność" | Głośność +10% |
| "Wycisz komputer" | Mute/unmute |
| "Zablokuj ekran" | Blokuje Windows |
| "Wyłącz komputer" | Shutdown za 30s |
| "Uśpij komputer" | Tryb uśpienia |
| "Cześć, jak się masz?" | Zwykła rozmowa z AI |

---

## Struktura plików

```
jarvis/
├── server/
│   ├── server.js          ← WebSocket server + Claude AI
│   └── package.json
├── desktop/
│   ├── main.js            ← Electron main + system tray
│   ├── backend.js         ← WS klient + obsługa komend PC
│   ├── ChatAI.js          ← UI czatu
│   ├── index.html         ← Okno aplikacji
│   └── package.json
└── android/
    ├── App.js             ← Główny komponent
    ├── ChatAI.js          ← UI czatu
    ├── backend.js         ← WS klient + auto-reconnect
    └── package.json
```

---

## Klucz API Claude

Uzyskaj klucz na: https://console.anthropic.com

Ustaw zmienną środowiskową przed startem serwera:
- Windows: `set ANTHROPIC_API_KEY=sk-ant-...`
- Linux/Mac: `export ANTHROPIC_API_KEY=sk-ant-...`
