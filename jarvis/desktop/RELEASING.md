# Releasing Jarvis Desktop

## Prerequisites

The source repository is private, and production desktop updates are served
from GitHub Releases metadata/assets:

``` 
Private GitHub repo (CI/CD) -> GitHub Releases -> electron-updater clients
```

electron-updater is configured with `"private": true` in `build.publish`.
Runtime update checks on user machines therefore require authenticated access
to private GitHub release metadata/assets.

## Source of truth (updater topology)

- **Canonical manifest host**: `https://updates.assistantx.pl/versions.json`
- **Desktop update engine**: `electron-updater` (`latest.yml` + blockmaps)
- **Migration mode**: dual source (`JARVIS_UPDATE_SOURCE=manifest|github`), so rollback is an env flip.
- **Channeling**: `stable` + `beta` entries exist in `versions.json`.
- **Compatibility fallback**: legacy `jarvis-latest` GitHub Release remains supported during migration.

## Installer identity + NSIS requirements (must stay stable)

To keep in-place auto-updates working and preserve installer identity, keep these
values stable across releases:

- `build.appId`
- `build.productName`
- `build.win.executableName`

NSIS must remain configured for machine-wide installer flow:

- `build.nsis.oneClick = false`
- `build.nsis.perMachine = true`
- `build.nsis.allowToChangeInstallationDirectory = true`

## Required secrets and tokens

### CI repository secret

| Name | Value |
|------|-------|
| `GH_TOKEN` | Fine-Grained PAT with **Contents: Read + Write**, **Metadata: Read** scoped to the `Assistantx` repo |

> **Important**: GitHub Actions blocks secrets prefixed with `GITHUB_`. Use
> `GH_TOKEN`, not `GITHUB_TOKEN`, for the PAT.

Create at: <https://github.com/settings/personal-access-tokens>

### Updater metadata signing secrets

| Name | Value |
|------|-------|
| `UPDATE_FEED_METADATA_PRIVATE_KEY` | Ed25519/RSA private key for signing `latest.yml` |
| `UPDATE_FEED_METADATA_PUBLIC_KEY` | Corresponding public key bundled in the app |

Keys may be stored as PEM text, PEM with escaped `\n`, base64-encoded PEM, or
base64-encoded DER.

### End-user machines (private updater auth)

For private-repo topology, end-user updater tokens are required unless
`GH_TOKEN` is provided by environment policy. AssistantX stores the updater PAT
encrypted with Electron `safeStorage` in userData.

## Required artifacts in the release workflow

For each release, publish/update these assets so `versions.json` and desktop metadata stay aligned.

- `latest.yml`
- `latest.yml.sig`
- `release-notes.json`
- `versions.json`
- `JarvisSetup-x64.exe`
- `JarvisSetup-x64.exe.blockmap`
- `JarvisSetup-arm64.exe`
- `JarvisSetup-arm64.exe.blockmap`
- `JarvisSetup-x64.dmg`
- `JarvisSetup-arm64.dmg`
- `Jarvis-x64.AppImage`
- `Jarvis-android.apk`

`latest.yml` must reference exact filenames that actually exist in release assets.
`latest.yml` must also carry:

- `minimumAllowedVersion` for rollback protection
- `stagingPercentage` for staged rollout policy

`latest.yml.sig` must be a detached signature generated from the final `latest.yml`
payload after those fields are appended.

`versions.json` must:

- contain `schemaVersion`
- contain both `stable` and `beta` channels
- include `windows`, `mac`, `linux`, `android` entries in `stable`
- point to HTTPS URLs on approved update hosts

## Build and publish

1. Create the `GH_TOKEN` Fine-Grained PAT and add it as a repository secret.
2. Bump `version` in `jarvis/desktop/package.json` (or let CI bump it).
3. Build installers and updater metadata (`latest.yml`) in CI.
4. Publish installer artifacts + updater metadata (`latest.yml`, `release-notes.json`, `versions.json`).
5. Verify packaged app update detection against a lower installed version.

### CI-managed publishing requirements

The release workflow fully manages GitHub release publishing using `GH_TOKEN`.
Required repository configuration:

| Secret/Variable | Purpose |
|-----------------|---------|
| `GH_TOKEN` | Fine-Grained PAT for authenticated GitHub release publishing |
| `UPDATE_FEED_METADATA_PRIVATE_KEY` | Signs `latest.yml` in CI |
| `UPDATE_FEED_METADATA_PUBLIC_KEY` | Bundled in app for runtime verification |

Post-publish CI verifies `jarvis-latest` contains all required updater assets
(`latest.yml`, `latest.yml.sig`, installers, blockmaps, and `release-notes.json`).

## Pre-ship updater verification checklist

- [ ] Packaged app (not dev mode) shows real app version.
- [ ] `Check now` emits `checking`, then either `update-available` or `up-to-date`.
- [ ] Startup check is silent (no native updater popups when already up to date).
- [ ] Private GitHub release metadata/assets are reachable on update check with valid auth.
- [ ] Runtime update-available flow validates metadata sanity (`semver`, `available > current`, stable channel vs prerelease mismatch rejection, rollback floor).
- [ ] Detached `latest.yml` signature is verified before updater execution.
- [ ] `minimumAllowedVersion` / `stagingPercentage` are present and correct for the release policy.
- [ ] On feed errors (auth/network/metadata), UI shows actionable degraded/unavailable reason.
- [ ] Signature validation failures are explicitly classified separately from download/metadata/install execution failures.
- [ ] Differential/blockmap failures retry once with a full installer download.
- [ ] `latest.yml` exists and parses cleanly.
- [ ] `release-notes.json` exists and has human-readable highlights.
- [ ] Every file referenced in `latest.yml` exists as a release asset.
- [ ] Download path works (`available` -> `downloading` -> `install-ready`).
- [ ] Install path works on restart (`quitAndInstall` / install-on-quit).

## Channel-ready release contract (future-safe)

The updater runtime is channel-aware and expects channel-specific metadata when channels are enabled:

- stable/beta/nightly release metadata and assets must remain isolated by channel.

Current production default remains `stable`.
