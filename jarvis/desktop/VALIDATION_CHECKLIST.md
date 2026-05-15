# Jarvis Desktop Validation Checklist

Use this checklist for desktop-impacting changes.

## A) Repository baseline validation

Run from repository root:

1. `npm run lint`
2. `npm test -- --runInBand`
3. `npm run build`

If failures are unrelated/pre-existing, record them explicitly in PR notes.

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
   - `*.blockmap`
3. Install packaged build and verify:
   - startup + tray
   - launcher search + launch
   - account login flow
   - update check/download/install flow

## D) Sidecar checks

Validate sidecar bridge behavior:
- connect
- reconnect with exponential backoff
- unavailable signal after max retries
- basic STT/TTS intent roundtrip

## E) Workflow/release checks

Confirm `.github/workflows/build-jarvis.yml` still matches expected desktop outputs and release tag flow (`jarvis-latest`).
