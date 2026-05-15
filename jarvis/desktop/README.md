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

## Update model (current)

Jarvis Desktop uses `electron-updater` in `main.js` with GitHub publish metadata from desktop `package.json`.

- Dev mode: updates are disabled.
- Packaged mode: updater checks, prompts, downloads, and installs.
- Manual UI actions:
  - `check-for-updates`
  - `download-update`
  - `install-update`

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

## Embedded Python runtime (packaged Windows)

Packaged desktop runtime now checks embedded Python candidates first:

- `resources/ai-agent/runtime/python/python.exe`
- `resources/python/python.exe`

before falling back to local `venv` or system `python`.

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
