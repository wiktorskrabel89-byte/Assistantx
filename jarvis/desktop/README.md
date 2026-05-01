# Jarvis Desktop (Windows)

Minimalny szkielet aplikacji desktopowej (Electron)

## Pliki:
- main.js — główny proces Electron
- renderer.js — renderer (UI)
- package.json — zależności
- backend.js — desktop WebSocket + komendy systemowe
- auth.js — lokalny token urządzenia
- scripts/JarvisSystemSetup.ps1 — bootstrapper PowerShell dla instalatora NSIS

## Uruchamianie lokalne

```bash
npm install
npm run dev
```

## Budowanie instalatora Windows

```bash
npm install
npm run dist:win
```

Polecenie tworzy instalator `JarvisSetup.exe` w katalogu `dist/` przy użyciu `electron-builder` i targetu `nsis`.

Jeśli chcesz od razu podmienić plik pobierany przez aplikację webową w `public/jarvis/JarvisSetup.exe`, uruchom:

```bash
npm run dist:win:public
```

Skrypt `publish:download` kopiuje gotowy instalator do katalogu publicznego aplikacji Next.js.

## Bootstrap PowerShell

Do repo dodałem skrypt `scripts/JarvisSystemSetup.ps1`, oparty na Twoim flow pobierania + cichej instalacji NSIS.

Przykład uruchomienia:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\JarvisSystemSetup.ps1
```

Domyślnie skrypt pobiera instalator z `http://127.0.0.1:3000/jarvis/JarvisSetup.exe`, czyli z aktualnego endpointu pobierania tej aplikacji webowej. Możesz to nadpisać przez `-DownloadUrl` albo zmienną środowiskową `JARVIS_DOWNLOAD_URL`.

Skrypt zakłada, że aplikacja po instalacji będzie nazywać się `Jarvis.exe`, co jest zgodne z `productName: "Jarvis"` w konfiguracji `electron-builder`.

Opcjonalne przełączniki:

- `-ApplyPowerTweaks` wyłącza Fast Startup i hibernację.
- `-SkipAutostart` pomija utworzenie skrótu autostartu.
- `-DownloadUrl` pozwala wskazać publiczny adres instalatora, jeśli nie używasz lokalnego serwera na porcie 3000.

Jest to zewnętrzny bootstrapper Windows. Nie jest uruchamiany przez sam instalator NSIS, tylko pobiera i odpala wygenerowany `JarvisSetup.exe` w trybie silent.

## Stan integracji z kodem Jarvis

- Desktop shell pokazuje token urządzenia, URL backendu i log połączenia.
- `renderer.js` korzysta teraz z `auth.js`, `backend.js` i `phone-commands.js`.
- `backend.js` ma jeden spójny moduł i wspiera automatyczne ponawianie połączenia.
- Domyślny backend URL to `ws://127.0.0.1:8000/ws` i FastAPI backend w tym repo wystawia już ten endpoint.
- Wiadomości `register`, `desktop_prompt`, `response` i `command` są obsługiwane przez `ai agent/main.py`.

## Uwagi

- Budowanie instalatora `.exe` najlepiej uruchamiać na Windows.
- W kontenerze Linux pakowanie Windows może wymagać dodatkowych narzędzi systemowych lub Wine.

---

Kolejne kroki:
1. Dodaj plik main.js z kodem startowym Electron
2. Dodaj package.json z zależnościami
3. Dodaj prosty renderer (index.html, renderer.js)
