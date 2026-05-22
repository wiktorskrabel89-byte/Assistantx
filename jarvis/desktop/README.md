# Jarvis Desktop (Electron)

Jarvis Desktop is the Electron runtime for AssistantX desktop automation, voice, launcher, and account workflows.

## Scope in this repository

- Desktop app: `jarvis/desktop`
- Python voice sidecar: `ai-agent`
- Release pipeline: `.github/workflows/build-jarvis.yml`

## Core runtime modules

- `main.js` — Electron main process (window/tray lifecycle, updater, launcher IPC, sidecar process spawn)
- `preload.js` — secure bridge (`contextIsolation: true`, invoke/event allow-lists)
- `renderer.js` — desktop UI behavior
- `backend.js` — command execution, AI prompt routing, local/remote command orchestration
- `launcher/*` — local app catalog + ranking + launch logic (`sql.js`)
- `accounts.js` / `auth.js` / `local-state.js` / `runtime-config.js` — local session/device/config state
- `services/ipc-guards.js` — centralized privileged IPC input validation
- `services/startup-diagnostics.js` — desktop health snapshots and startup diagnostics
- `telemetry/event-bus.js` + `telemetry/local-telemetry.js` — local-only telemetry (event bus + subscriber persistence)

## Local development

```bash
cd jarvis/desktop
npm ci
npm run dev
```

## Build Windows installers

```bash
cd jarvis/desktop
npm ci
npm run dist:win:all
```

Artifacts are written to `jarvis/desktop/dist/`:
- `JarvisSetup-x64.exe`
- `JarvisSetup-arm64.exe`
- `latest.yml`
- `*.blockmap`

> Windows is the recommended build platform for NSIS installers.

## Build macOS DMG installers

```bash
cd jarvis/desktop
npm ci
npm run dist:mac
```

Artifacts are written to `jarvis/desktop/dist/`:
- `JarvisSetup-x64.dmg`
- `JarvisSetup-arm64.dmg`

> Note: Code signing/notarization is optional for local builds. Unsigned builds still compile.

## Build Linux AppImage installers

```bash
cd jarvis/desktop
npm ci
npm run dist:linux
```

Artifacts are written to `jarvis/desktop/dist/`:
- `Jarvis-x64.AppImage`

Linux runtime notes:
- Some desktops require `libappindicator` for tray icon support.
- AppImage may require FUSE support (`libfuse2`/`libfuse2t64`) on some distributions.
- Headless Linux dev runs already use `xvfb-run` fallback in `scripts/run-electron-dev.js` when `DISPLAY` is not set.

## Update model (current)

Jarvis Desktop uses `electron-updater` in `main.js` with GitHub Releases provider
configured in desktop `package.json` (`provider: github`, `private: true`).

- Dev mode: updates are disabled.
- Packaged mode: updater does a silent startup check and uses custom in-app update modals (no native updater dialogs).
- Manual `Check now` remains available as a secondary troubleshooting action in desktop settings/tray.
- Download behavior is explicit user consent (`autoDownload=false`): update download starts only after user confirmation.
- Release notes source of truth is `release-notes.json` (fed into renderer-friendly changelog cards, with updater metadata fallback).
- Supported updater state model:
  - `idle`
  - `checking`
  - `available`
  - `deferred`
  - `downloading`
  - `install-ready`
  - `installing`
  - `up-to-date`
  - `error`
  - `unavailable`

Release assets are published via:
- `.github/workflows/build-jarvis.yml`

## Runtime endpoints and sidecar

- Packaged desktop web base default: `https://assistantx.pl`
- Dev desktop web base default: `http://localhost:3000`
- Optional legacy backend websocket is used **only** when `JARVIS_BACKEND_URL` is set.
- Python sidecar websocket default: `ws://127.0.0.1:8765`

### Voice provider mode

- Default (recommended): `assistantx-server` (Desktop → AssistantX API → Groq/OpenRouter)
- Optional advanced mode (future/BYOK): `desktop-direct`
- Configure via `JARVIS_VOICE_PROVIDER_MODE` or desktop voice settings.

This keeps provider keys server-side by default for routing, billing, moderation, and failover.

Sidecar process (`ai-agent/main.py`) is spawned by `main.js` and renderer voice APIs are bridged through `sidecar-bridge.js` via preload exposure.

### Local AI bootstrapping (Ollama + cloud fallback)

- Desktop startup probes local Ollama health and exposes status in `desktop-health`.
- If Ollama is unavailable, cloud fallback remains active.
- Install local AI engine and required models:

```bash
cd jarvis/desktop
npm run setup:local-ai
```

This runs:
- `scripts/setup-env.ps1` (install/start Ollama)
- `scripts/ensure-ollama-models.ps1` (pull `gemma4:e4b`, `qwen2.5-coder:14b`)

### Optional local web search stack (SearXNG)

Start a local SearXNG endpoint for sidecar web search tool support:

```bash
cd jarvis/desktop
docker compose -f docker-compose.searxng.yml up -d
```

Endpoint used by sidecar: `http://127.0.0.1:8888/search?format=json`

## Embedded Python runtime (packaged Windows)

Packaged desktop runtime now checks embedded Python candidates first:

- `resources/ai-agent/runtime/python/python.exe`
- `resources/python/python.exe`

before falling back to local `venv` or system `python`.

For `resources/python/python.exe`, put the bundled runtime under:

- `jarvis/desktop/python/python.exe`

`.gitkeep` is not enough — the folder must contain a real runtime bundle (`python.exe` and required DLLs/libs).

Desktop packaging now enforces this with preflight:

- `npm run dist`
- `npm run dist:win`
- `npm run dist:win:arm64`

If runtime is missing, build fails early with a clear error.

## Related docs

- Architecture audit: `ARCHITECTURE_AUDIT.md`
- Final AI + voice architecture plan: `FINAL_AI_VOICE_ARCHITECTURE_PLAN.md`
- Upgrade/fix/ideas backlog: `UPGRADE_BACKLOG.md`
- Validation checklist: `VALIDATION_CHECKLIST.md`

## Validation and release checklist usage

- Use `VALIDATION_CHECKLIST.md` A–F for each desktop-impacting change.
- Capture explicit evidence for lint/test/build and desktop/package smoke checks.
- If a failure is unrelated/pre-existing, record it explicitly in PR/release notes.

## Active implementation scope

- Active phase includes only **critical + near-term** upgrades.
- Product ideas remain **future/experimental** and non-blocking until stabilization is complete.
- Modularization should be delivered in small module/service slices, not one giant refactor.

## Notes

- Desktop `package.json` currently does not define dedicated lint/test scripts; repo-level lint/test/build is used for broad validation.
