# Releasing Jarvis Desktop

## Prerequisites

The source repository is private, but end-user updates must be served from a
public generic feed:

```
Private GitHub repo (CI/CD) -> Public update feed -> electron-updater clients
```

Configured updater feed:

- `https://updates.assistantx.pl/stable`

## Required artifacts in the public feed

For each release, publish these files to the same feed directory:

- `latest.yml`
- `JarvisSetup-x64.exe`
- `JarvisSetup-x64.exe.blockmap`
- `JarvisSetup-arm64.exe`
- `JarvisSetup-arm64.exe.blockmap`

`latest.yml` must reference exact filenames that actually exist in that folder.

## Build and publish

1. Bump `version` in `jarvis/desktop/package.json` (or let CI bump it).
2. Build installers and updater metadata (`latest.yml`) in CI.
3. Publish installer artifacts and `latest.yml` to:
   - GitHub release (optional mirror/internal traceability), and
   - public feed path `https://updates.assistantx.pl/stable` (required for app updates).
4. Verify packaged app update detection against a lower installed version.

## Pre-ship updater verification checklist

- [ ] Packaged app (not dev mode) shows real app version.
- [ ] `Check now` emits `checking`, then either `update-available` or `up-to-date`.
- [ ] On feed errors (auth/network/metadata), UI shows actionable degraded/unavailable reason.
- [ ] `latest.yml` exists and parses cleanly.
- [ ] Every file referenced in `latest.yml` exists in the same feed directory.
- [ ] Download path works (`update-available` -> `downloading` -> `ready-to-install`).
- [ ] Install path works on restart (`quitAndInstall` / install-on-quit).
