# Releasing Jarvis Desktop

## Prerequisites

Production desktop updates are served from the public manifest/update host:

```
CI/CD -> updates.assistantx.pl (versions.json + platform assets) -> electron-updater clients
```

## Source of truth (updater topology)

- **Canonical manifest host**: `https://updates.assistantx.pl/versions.json`
- **Release strategy**: immutable Git tags (`v*`) + GitHub Releases assets per tag
- **Source mode**: manifest-only (`updates.assistantx.pl`)
- **Channeling**: `stable` + `beta` entries exist in `versions.json`.
- **Binary storage**: GitHub Releases only (no Git LFS/repository binary commits)

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

## Required secrets

### Updater metadata signing secrets

| Name | Value |
|------|-------|
| `UPDATE_FEED_METADATA_PRIVATE_KEY` | Ed25519/RSA private key for signing `latest.yml` |
| `UPDATE_FEED_METADATA_PUBLIC_KEY` | Corresponding public key bundled in the app |

### Vercel deployment secrets (manifest publish)

| Name | Value |
|------|-------|
| `VERCEL_TOKEN` | Token used by CI to deploy manifest to Vercel |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |

Keys may be stored as PEM text, PEM with escaped `\n`, base64-encoded PEM, or
base64-encoded DER.

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
- include at least `windows` + `linux` entries in each active channel (optionally `mac`/`android`)
- include direct installer URL aliases (`version` + `path`) and compatibility aliases (`latestVersion` + `url`)
- point to HTTPS URLs on approved update hosts

## Build and publish

1. Create and push a version tag (for example `v1.1.0`).
2. CI builds installers and updater metadata.
3. CI publishes artifacts to GitHub Release for that tag.
4. CI regenerates `versions.json` with direct GitHub Releases URLs and deploys it to Vercel.
5. Verify packaged app update detection against a lower installed version.

### CI-managed publishing requirements

The release workflow fully manages artifact publishing and metadata generation.
Required repository configuration:

| Secret/Variable | Purpose |
|-----------------|---------|
| `UPDATE_FEED_METADATA_PRIVATE_KEY` | Signs `latest.yml` in CI |
| `UPDATE_FEED_METADATA_PUBLIC_KEY` | Bundled in app for runtime verification |

## Pre-ship updater verification checklist

- [ ] Packaged app (not dev mode) shows real app version.
- [ ] `Check now` emits `checking`, then either `update-available` or `up-to-date`.
- [ ] Startup check is silent (no native updater popups when already up to date).
- [ ] `latest.yml` and assets are reachable from `https://updates.assistantx.pl/windows/` over HTTPS.
- [ ] `versions.json` on `updates.assistantx.pl` points to the same release tag (`v*`) for each platform in active channels.
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
