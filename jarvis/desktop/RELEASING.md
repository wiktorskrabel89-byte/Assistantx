# Releasing Jarvis Desktop

## Prerequisites

The source repository is private, and production desktop updates are served
from a public generic feed:

```
Private GitHub repo (CI/CD) -> Public update feed -> electron-updater clients
```

Configured updater feed:

- `https://updates.assistantx.pl/stable`

## Source of truth (updater topology)

- **Permanent production updater source**: generic feed
  `https://updates.assistantx.pl/stable`
- **GitHub Releases (`jarvis-latest`) role**: CI artifact storage, release
  traceability, and rollback history.
- Desktop runtime updater must **not** depend on anonymous GitHub Release asset
  access.

## Required artifacts in the public feed

For each release, publish these files to the same feed directory:

- `latest.yml`
- `JarvisSetup-x64.exe`
- `JarvisSetup-x64.exe.blockmap`
- `JarvisSetup-arm64.exe`
- `JarvisSetup-arm64.exe.blockmap`

`latest.yml` must reference exact filenames that actually exist in that folder.
Do not reference subfolders in `latest.yml` paths for production feed assets.

## Build and publish

1. Bump `version` in `jarvis/desktop/package.json` (or let CI bump it).
2. Build installers and updater metadata (`latest.yml`) in CI.
3. Publish installer artifacts and `latest.yml` to:
   - GitHub release (optional mirror/internal traceability), and
   - public feed path `https://updates.assistantx.pl/stable` (required for app updates).
4. Verify packaged app update detection against a lower installed version.

### CI-managed feed publishing requirements

The release workflow should fully manage feed publishing and fail when feed
secrets are missing. Required repository secrets:

- `UPDATE_FEED_SSH_HOST`
- `UPDATE_FEED_SSH_PORT` (optional, defaults to `22`)
- `UPDATE_FEED_SSH_USER`
- `UPDATE_FEED_SSH_PATH`
- `UPDATE_FEED_SSH_KEY`
- `UPDATE_FEED_SSH_KNOWN_HOSTS`

Post-publish CI must verify:

- `latest.yml` is reachable at `https://updates.assistantx.pl/stable/latest.yml`
- `latest.yml` is parseable and includes `version` + artifact refs
- every artifact referenced by `latest.yml` is publicly reachable via the same
  feed directory

## Pre-ship updater verification checklist

- [ ] Packaged app (not dev mode) shows real app version.
- [ ] `Check now` emits `checking`, then either `update-available` or `up-to-date`.
- [ ] Startup updater self-test checks `latest.yml` fetch + validation and logs explicit error class (`offline`, DNS, `404`, invalid YAML, auth/permission).
- [ ] On feed errors (auth/network/metadata), UI shows actionable degraded/unavailable reason.
- [ ] `latest.yml` exists and parses cleanly.
- [ ] Every file referenced in `latest.yml` exists in the same feed directory.
- [ ] Download path works (`update-available` -> `downloading` -> `ready-to-install`).
- [ ] Install path works on restart (`quitAndInstall` / install-on-quit).
