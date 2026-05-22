# Jarvis Android

React Native Android client for Jarvis remote control.

## Structure

- `App.js` — Jarvis mobile UI and command workflows
- `backend.js` — WebSocket connection + message protocol
- `android/` — Native Android Gradle project
- `index.js` + `app.json` — React Native entrypoint (`JarvisAndroid`) and display name (`Jarvis`)

## Prerequisites

- Node.js 22+
- Android SDK + emulator/device
- Java 17

## Install

```bash
cd /home/runner/work/Assistantx/Assistantx/jarvis/android
npm ci
```

## Run in development

```bash
cd /home/runner/work/Assistantx/Assistantx/jarvis/android
npm start
```

In another terminal:

```bash
cd /home/runner/work/Assistantx/Assistantx/jarvis/android
npm run android
```

## Build release APK

```bash
cd /home/runner/work/Assistantx/Assistantx/jarvis/android
npm run build:android:release
```

APK output:

- `jarvis/android/android/app/build/outputs/apk/release/app-release.apk`

## Signing configuration

Release signing reads these values from Gradle properties or environment variables:

- `KEYSTORE_FILE`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

If not provided, release builds fall back to debug signing (CI-safe default).

## Android SDK local config

Create `jarvis/android/android/local.properties` from `local.properties.template` and set:

```properties
sdk.dir=/path/to/Android/Sdk
```
