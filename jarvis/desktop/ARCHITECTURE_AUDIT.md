# Jarvis Desktop Architecture Audit (Full Repo Scope)

This audit covers:
- `jarvis/desktop`
- `ai-agent`
- `.github/workflows/build-jarvis.yml`

Target-state reference:
- `jarvis/desktop/FINAL_AI_VOICE_ARCHITECTURE_PLAN.md`

## 1) Runtime ownership boundaries

## Electron main process (`jarvis/desktop/main.js`)
- Owns app lifecycle, tray, launcher overlay, updater, login popup, sidecar process lifecycle.
- Registers privileged IPC handlers (open path/url, launcher actions, updater actions, AI proxy).
- Initializes launcher DB (`launcher/db.init()`) before launcher use.
- Uses startup diagnostics snapshots (`services/startup-diagnostics.js`) to expose normalized health states (`healthy/degraded/unavailable`).
- Uses centralized IPC validation guards (`services/ipc-guards.js`) for privileged handler inputs.

## Electron preload (`jarvis/desktop/preload.js`)
- Exposes only allow-listed invoke channels and receive channels.
- Exposes Node-backed APIs (backend orchestration, local-state, accounts, runtime-config, sidecar bridge wrappers).
- Enforces `contextIsolation` boundary for renderer.

## Renderer (`jarvis/desktop/renderer.js`)
- UI orchestration (chat panel, settings, account controls, voice UX, update status UX).
- Uses `window.jarvisApi` and `window.jarvisIpc` exclusively.

## Local orchestration (`jarvis/desktop/backend.js`)
- Structured command execution (open apps/files/urls, clipboard, volume, screenshot, power actions).
- Hybrid prompt flow:
  - `task-planner` for executable steps
  - cloud AI fallback when no executable steps are detected
- Optional remote backend websocket only when `JARVIS_BACKEND_URL` is configured.

## Launcher subsystem (`jarvis/desktop/launcher/*`)
- Catalog persistence with `sql.js` file-backed DB at `%APPDATA%/JarvisDesktop/launcher.db`.
- Provider strategy:
  - Windows: Everything CLI first
  - fallback: Windows scanner
- Alias learning and resolver history persisted in launcher DB.

## Account/session/storage modules
- `accounts.js` stores desktop session in `%APPDATA%/JarvisDesktop/session.json`.
- `auth.js` stores device token in `%APPDATA%/JarvisDesktop/token.txt`.
- `local-state.js` stores desktop local state/preferences in `%APPDATA%/JarvisDesktop/state.json`.
- `runtime-config.js` stores optional web URL override in `%APPDATA%/JarvisDesktop/config.json`.
- `local-state.js` now stores local-only telemetry snapshot counters under `preferences.telemetry`.

## Telemetry/eventing (`jarvis/desktop/telemetry/*`)
- `event-bus.js` provides decoupled publish/subscribe events for runtime diagnostics.
- `local-telemetry.js` subscribes to telemetry events and persists compact counters locally.
- Remote diagnostics are architecture-ready but disabled by default (opt-in only, no upload path coupled into runtime flow).

## Python sidecar (`ai-agent/main.py`)
- Local websocket server (`127.0.0.1:8765` default).
- Handles configure/audio_chunk/tts_speak/parse_intent messages.
- Emits status/wake_word/stt_result/tts_audio/intent_parsed/error events.

## Build/release workflow (`.github/workflows/build-jarvis.yml`)
- Builds Windows x64 + arm64 installers.
- Produces updater metadata (`latest.yml`, `*.blockmap`).
- Publishes to `jarvis-latest` GitHub release.

## 2) Reliability findings

1. **Critical fixed in this change**: conflicting duplicate update functions in `main.js`.
- The lower duplicate update flow referenced undefined symbols and could break update checks.
- Consolidated to one `electron-updater` strategy.

2. Renderer remains large and tightly coupled.
- Functional but high maintenance overhead and slower iteration on voice/account/settings.

3. Desktop package has no dedicated lint/test scripts.
- Validation currently depends on repo-level lint/test/build and manual desktop smoke checks.

## 3) Security review snapshot

- Positive:
  - `contextIsolation: true`, `nodeIntegration: false`.
  - IPC channels are allow-listed in preload.
  - Backend path reads/writes are constrained via safe roots in `backend.js`.
  - High-risk remote commands require explicit approval flow.
- Ongoing hardening opportunities:
  - Further reduce privileged surface area exposed through preload.
  - Add stricter per-handler argument validation in main-process IPC handlers.
  - Document local credential-at-rest expectations and optional OS-level hardening.

## 4) Upgrade direction

- Keep updater strategy single-source (`electron-updater` + release assets).
- Incrementally modularize renderer and main-process orchestration.
- Add desktop-focused smoke checks as part of release validation.
- Keep product ideas marked as future/experimental until stabilization slices complete.
