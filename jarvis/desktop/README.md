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

Obsługiwane architektury: **x64** (Intel/AMD) i **ARM64** (np. Snapdragon, Surface Pro X).

```bash
npm install

# tylko x64
npm run dist:win

# tylko ARM64
npm run dist:win:arm64

# obie architektury jednocześnie (zalecane)
npm run dist:win:all
```

Polecenia tworzą pliki `JarvisSetup-x64.exe` i/lub `JarvisSetup-arm64.exe` w katalogu `dist/` przy użyciu `electron-builder` i targetu `nsis`.

Skrypty budujące ustawiają też `--publish never`, więc sam build nie próbuje wysyłać artefaktów do GitHub Releases i nie wymaga ustawionego `GH_TOKEN`. Publikacja release pozostaje obsługiwana osobno przez workflow `.github/workflows/build-jarvis.yml`.

W tym samym katalogu `dist/` Electron Builder tworzy też pliki auto-update:
- `latest.yml`
- `JarvisSetup-x64.exe.blockmap`
- `JarvisSetup-arm64.exe.blockmap`

Te pliki muszą być opublikowane razem z installerami na GitHub Release, jeśli chcesz mieć automatyczne aktualizacje w aplikacji.

> **Uwaga:** Budowanie instalatora `.exe` działa najlepiej na Windows. Na Linux może wymagać Wine lub działać z ograniczeniami.

Jeśli chcesz od razu skopiować gotowe instalatory do katalogu publicznego aplikacji Next.js (`public/jarvis/`), uruchom:

```bash
npm run dist:win:public
```

Skrypt `publish:download` kopiuje `JarvisSetup-x64.exe` i `JarvisSetup-arm64.exe` do `public/jarvis/`.

## Auto-update z GitHub Releases

Desktop Jarvis wspiera auto-update przez `electron-updater`.

Wymagania:
1. build musi mieć `publish.provider = github`
2. release na GitHub musi zawierać:
   - `JarvisSetup-x64.exe`
   - `JarvisSetup-arm64.exe`
   - `latest.yml`
   - pliki `*.blockmap`
3. aplikacja musi działać z **prawdziwego zainstalowanego EXE**, nie z `npm run dev`

W tym repo workflow `.github/workflows/build-jarvis.yml` publikuje te pliki automatycznie do release `jarvis-latest`.

Opcjonalne zmienne środowiskowe (desktop runtime):
- `JARVIS_UPDATE_CHECK_INTERVAL_MS` — interwał automatycznych checków update (domyślnie `900000`, czyli 15 min)
- `JARVIS_AUTO_INSTALL_ON_DOWNLOAD=1` — po pobraniu update automatycznie uruchamia instalację (restart aplikacji)

## Bootstrap PowerShell

Do repo dodałem skrypt `scripts/JarvisSystemSetup.ps1`, oparty na Twoim flow pobierania + cichej instalacji NSIS.

Przykład uruchomienia:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\JarvisSystemSetup.ps1
```

Skrypt **automatycznie wykrywa architekturę CPU** (`$env:PROCESSOR_ARCHITECTURE`) i pobiera odpowiedni instalator:
- `AMD64` → `JarvisSetup-x64.exe`
- `ARM64` → `JarvisSetup-arm64.exe`

Domyślnie instalatory są pobierane z `http://127.0.0.1:3000/jarvis/`. Możesz zmienić bazowy URL przez zmienną środowiskową `JARVIS_BASE_URL` lub podać jawny URL przez `-DownloadUrl`.

Skrypt zakłada, że aplikacja po instalacji będzie nazywać się `Jarvis.exe`, co jest zgodne z `productName: "Jarvis"` w konfiguracji `electron-builder`.

Opcjonalne przełączniki:

- `-ApplyPowerTweaks` zachowany dla kompatybilności (optymalizacja zasilania i tak jest wykonywana w fazie konfiguracji sprzętowej).
- `-SkipAutostart` pomija utworzenie skrótu autostartu.
- `-DownloadUrl` pozwala wskazać dokładny URL instalatora (pomija auto-detekcję architektury).
- `-BaseUrl` pozwala zmienić bazowy URL, z którego wybierany jest instalator wg architektury.

Po instalacji skrypt uruchamia też automatyczną konfigurację sprzętową:
- wykrywa markę/model,
- próbuje włączyć Wake on LAN dla kart Ethernet,
- wyłącza Fast Startup i hibernację,
- próbuje auto-konfiguracji BIOS dla Dell/HP/Lenovo,
- ustawia autostart Jarvisa.

Jest to zewnętrzny bootstrapper Windows. Nie jest uruchamiany przez sam instalator NSIS, tylko pobiera i odpala wygenerowany plik `.exe` w trybie silent.

## Stan integracji z kodem Jarvis

- Desktop shell pokazuje token urządzenia, URL backendu i log połączenia.
- `renderer.js` korzysta teraz z `auth.js`, `backend.js` i `phone-commands.js`.
- `backend.js` ma jeden spójny moduł i wspiera automatyczne ponawianie połączenia.
- W dev domyślny backend URL to `ws://127.0.0.1:8000/ws` i FastAPI backend w tym repo wystawia już ten endpoint.
- Jeśli domyślny dev backend (`ws://127.0.0.1:8000/ws`) nie jest dostępny przy starcie, desktop automatycznie przechodzi w tryb local-only dla tej sesji (bez zapętlania błędów reconnect).
- Paczkowany build domyślnie korzysta z `https://www.assistantx.pl` dla logowania, cloud sync, AI fallbacku i checków aktualizacji, chyba że nadpiszesz to zmiennymi `JARVIS_WEB_URL` / `JARVIS_API_URL`.
- Jeśli chcesz też w paczkowanym buildzie połączyć legacy kanał WebSocket FastAPI, ustaw `JARVIS_BACKEND_URL`; bez tego desktop startuje w trybie local-only zamiast zapętlać błędy połączenia.
- Wiadomości `register`, `desktop_prompt`, `response` i `command` są obsługiwane przez `ai agent/main.py`.

## Uwagi

- Budowanie instalatora `.exe` najlepiej uruchamiać na Windows.
- W kontenerze Linux pakowanie Windows może wymagać dodatkowych narzędzi systemowych lub Wine.

---

Kolejne kroki:
1. Dodaj plik main.js z kodem startowym Electron
2. Dodaj package.json z zależnościami
3. Dodaj prosty renderer (index.html, renderer.js)
