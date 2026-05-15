# Releasing Jarvis Desktop

## Prerequisites

Before `electron-updater` can detect new versions the GitHub release feed
(`releases.atom`) must contain at least one published release.  Until that
happens electron-updater receives a 404, which the app now treats as
"nothing to update" rather than an error.

## First release

```bash
# Build and publish a release from a tagged commit.
# electron-builder will create the GitHub release, upload the installer
# artefacts, and — critically — upload latest.yml which electron-updater
# uses to compare versions.
GH_TOKEN=<your-token> npm run dist:win:public
```

Make sure the tag matches `version` in `package.json` (e.g. `v0.1.0`).

## Authentication

Set the `GH_TOKEN` (or `GITHUB_TOKEN`) environment variable on machines that
build / run packaged versions of Jarvis.  The desktop app reads this variable
at runtime and passes it as the `Authorization` header to electron-updater so
that update checks succeed against private repositories.

## Subsequent releases

1. Bump `version` in `jarvis/desktop/package.json`.
2. Commit, tag, and push.
3. Run `GH_TOKEN=<token> npm run dist:win:public`.
4. The new `latest.yml` will be picked up by running Jarvis instances on the
   next update check (≈15 seconds after launch).
