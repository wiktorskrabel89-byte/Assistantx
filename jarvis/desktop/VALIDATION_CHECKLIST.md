# Jarvis Desktop Validation Checklist

Use this checklist for desktop-impacting changes.

## A) Repository baseline validation

Run from repository root:

1. `npm run lint`
2. `npm test -- --runInBand`
3. `npm run build`

If failures are unrelated/pre-existing, record them explicitly in PR notes.

Evidence matrix (recommended):
- Lint: pass/fail + command output summary
- Tests: pass/fail + suite totals
- Build: pass/fail + artifact/output summary

## B) Desktop smoke checks (manual)

From `jarvis/desktop`:

1. `npm ci`
2. `npm run dev`

Validate:
- App window opens and tray icon/menu works.
- Launcher overlay toggles via shortcut and manual menu item.
- App catalog search returns results.
- Account login window opens and closes cleanly.
- Sidecar status is visible and does not spam disconnect events.
- Update check button behaves safely in dev mode (disabled/no crash).

## C) Packaged-flow smoke checks (release-oriented)

1. Build installers on Windows:
   - `npm run dist:win:all`
2. Verify artifacts exist:
   - `JarvisSetup-x64.exe`
   - `JarvisSetup-arm64.exe`
   - `latest.yml`
   - `release-notes.json`
   - `*.blockmap`
3. Install packaged build and verify:
    - startup + tray
    - launcher search + launch
    - account login flow
    - updater startup self-test (`latest.yml` reachability + classification in diagnostics)
    - update check/download/install flow

## D) Sidecar checks

Validate sidecar bridge behavior:
- connect
- reconnect with exponential backoff
- unavailable signal after max retries
- basic STT/TTS intent roundtrip

## E) Workflow/release checks

Confirm `.github/workflows/build-jarvis.yml` still matches expected desktop outputs and release tag flow (`jarvis-latest`).
- Confirm updater topology guard still enforces `generic` provider with `https://updates.assistantx.pl/stable`.
- Confirm CI syncs updater artifacts (`latest.yml`, `release-notes.json`, `JarvisSetup-x64.exe`, `JarvisSetup-arm64.exe`, `*.blockmap`) to the same public feed folder.
- Confirm post-publish CI checks:
  - public `latest.yml` availability/content
  - public `release-notes.json` availability/content
  - public access to every artifact referenced from `latest.yml`
  - `jarvis-latest` visibility and required release assets

## F) Release notes / PR checklist block

For every desktop-impacting PR/release, include:
- Validation status for A–E (pass/fail)
- Any pre-existing failures (explicitly marked as unrelated)
- Packaged-flow verification notes (startup/tray, launcher, account, updater)
- Updater regression notes:
  - feed endpoint health
  - `latest.yml` validity
  - `release-notes.json` validity and highlights quality
  - artifact parity (`latest.yml` refs vs feed files)
  - provider/privacy compatibility (private repo + public generic feed)
  - correctness of updater error classification (`network unavailable` vs metadata/auth)
- Architecture alignment note against `FINAL_AI_VOICE_ARCHITECTURE_PLAN.md` (if scope touched AI/voice routing or sidecar behavior)
