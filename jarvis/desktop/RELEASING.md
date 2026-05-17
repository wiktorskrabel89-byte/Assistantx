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
- `release-notes.json`
- `JarvisSetup-x64.exe`
- `JarvisSetup-x64.exe.blockmap`
- `JarvisSetup-arm64.exe`
- `JarvisSetup-arm64.exe.blockmap`

`latest.yml` must reference exact filenames that actually exist in that folder.
Do not reference subfolders in `latest.yml` paths for production feed assets.
`latest.yml` must also carry:

- `minimumAllowedVersion` for rollback protection
- `stagingPercentage` for staged rollout policy

`latest.yml.sig` must be a detached signature generated from the final `latest.yml`
payload after those fields are appended.

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
- `UPDATE_FEED_METADATA_PRIVATE_KEY`
- `UPDATE_FEED_METADATA_PUBLIC_KEY`

The updater metadata key secrets may be stored as PEM text, PEM with escaped
`\n`, base64-encoded PEM, or base64-encoded DER.

Post-publish CI must verify:

- `latest.yml` is reachable at `https://updates.assistantx.pl/stable/latest.yml`
- `latest.yml.sig` is reachable at `https://updates.assistantx.pl/stable/latest.yml.sig`
- `latest.yml` is parseable and includes `version` + artifact refs
- `latest.yml` `version` is valid semver, matches the release build version, and
  is stable-channel compatible (no beta/prerelease drift on stable feed)
- `minimumAllowedVersion` is valid semver and does not exceed `version`
- `stagingPercentage` is an integer between `0` and `100`
- detached signature verification for `latest.yml` succeeds with the bundled
  updater public key
- `latest.yml` must return `Cache-Control` with `no-cache`
- every artifact referenced by `latest.yml` is publicly reachable via the same
  feed directory
- `release-notes.json` is reachable and includes non-empty `version` + `highlights`

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
- [ ] Every file referenced in `latest.yml` exists in the same feed directory.
- [ ] Download path works (`available` -> `downloading` -> `install-ready`).
- [ ] Install path works on restart (`quitAndInstall` / install-on-quit).

## Channel-ready feed contract (future-safe)

The updater runtime is channel-aware and expects this structure when channels are enabled:

- `/stable/latest.yml`
- `/beta/latest.yml`
- `/nightly/latest.yml`

Current production default remains `stable`.
