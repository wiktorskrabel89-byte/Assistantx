# Jarvis Desktop Upgrade / Fix / Ideas Backlog

Balanced backlog across reliability, security, and product UX.

## Critical fixes (high impact, high priority)

1. **Consolidate duplicate update paths in `main.js`**
- Keep one updater strategy with `electron-updater`.
- Remove conflicting duplicate implementation that referenced undefined symbols.

2. **Add stricter IPC argument guards for privileged handlers**
- Validate payload shape/types in `main.js` for open-path/open-url/launcher operations/update actions.
- Standardize invalid-input responses and logging.

3. **Desktop startup fault observability**
- Add structured startup diagnostics for sidecar spawn failures, DB init failures, and updater init failures.
- Keep failures non-fatal where possible and visible in renderer status.

## Near-term upgrades (medium risk, high maintainability gain)

1. **Renderer modularization**
- Split `renderer.js` into modules:
  - account/auth
  - update UI
  - voice controls
  - command log/UX
  - settings/server URL

2. **Main-process modularization**
- Extract from `main.js`:
  - updater service
  - sidecar process manager
  - launcher overlay manager
  - account login window flow
  - IPC registration map

3. **Launcher quality improvements**
- Improve stale-catalog detection and fallback messaging.
- Add explicit provider telemetry in UI (Everything vs fallback and last scan time).

4. **Sidecar lifecycle telemetry**
- Persist compact health counters (connect, reconnect, unavailable events) to help diagnose field failures.

## Product ideas (balanced UX improvements)

1. **Offline-first mode UX**
- Show explicit state when cloud AI is unavailable and guide user to local-only commands.

2. **Launcher confidence UX**
- Display why app match was selected (alias/exact/fuzzy) and one-click alias training.

3. **Account troubleshooting panel**
- Surface token/session expiration, linked-account sync state, and retry actions.

4. **Update UX improvements**
- Show release notes and updater source status in a dedicated settings section.
- Add one-click “download and install on restart” flow in desktop settings.

## Suggested sequencing

1) Critical IPC + reliability hardening  
2) Renderer/main modularization (thin-slice extraction)  
3) Launcher + sidecar observability improvements  
4) Product UX enhancements
