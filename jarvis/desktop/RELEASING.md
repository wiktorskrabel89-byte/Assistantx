# Releasing Jarvis Desktop

## Prerequisites

The source repository is private, and production desktop updates are served
from GitHub Releases metadata/assets:

```
Private GitHub repo (CI/CD) -> GitHub Releases -> electron-updater clients
```

## Source of truth (updater topology)

- **Permanent production updater source**: GitHub Releases (`jarvis-latest`)
- **Desktop updater provider**: `github` with `owner=wiktorskrabel89-byte`
  and `repo=Assistantx`.

## Required artifacts in the GitHub release

For each release, publish these files to `jarvis-latest`:

- `latest.yml`
- `latest.yml.sig`
- `release-notes.json`
- `JarvisSetup-x64.exe`
- `JarvisSetup-x64.exe.blockmap`
- `JarvisSetup-arm64.exe`
- `JarvisSetup-arm64.exe.blockmap`

`latest.yml` must reference exact filenames that actually exist in release assets.
`latest.yml` must also carry:

- `minimumAllowedVersion` for rollback protection
- `stagingPercentage` for staged rollout policy

`latest.yml.sig` must be a detached signature generated from the final `latest.yml`
payload after those fields are appended.

## Build and publish

1. Bump `version` in `jarvis/desktop/package.json` (or let CI bump it).
2. Build installers and updater metadata (`latest.yml`) in CI.
3. Publish installer artifacts and updater metadata to GitHub release `jarvis-latest`.
4. Verify packaged app update detection against a lower installed version.

### CI-managed publishing requirements

The release workflow should fully manage GitHub release publishing. Required
repository configuration:

- `UPDATE_FEED_METADATA_PRIVATE_KEY`
- `UPDATE_FEED_METADATA_PUBLIC_KEY`

The updater metadata key secrets may be stored as PEM text, PEM with escaped
`\n`, base64-encoded PEM, or base64-encoded DER.

Post-publish CI must verify `jarvis-latest` contains required updater assets
(`latest.yml`, `latest.yml.sig`, installers, blockmaps, and `release-notes.json`).

## Pre-ship updater verification checklist

- [ ] Packaged app (not dev mode) shows real app version.
- [ ] `Check now` emits `checking`, then either `update-available` or `up-to-date`.
- [ ] Startup check is silent (no native updater popups when already up to date).
- [ ] Startup updater self-test checks `latest.yml` fetch + validation and logs explicit error class (`offline`, DNS, `404`, invalid YAML, auth/permission).
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
