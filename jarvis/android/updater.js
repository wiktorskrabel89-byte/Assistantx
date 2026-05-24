// jarvis/android/updater.js
// Canonical updater source:
//   versions.json manifest hosted on updates.assistantx.pl

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
const APP_VERSION = String(require('./package.json').version || '');

const UPDATE_MANIFEST_URL = 'https://updates.assistantx.pl/versions.json';
const UPDATE_CHANNEL = 'stable';
const DISMISSED_KEY = 'jarvis-updater-dismissed-build-id';
const FETCH_TIMEOUT_MS = 8000;

function parseSemver(value) {
  const match = String(value || '').trim().match(
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/,
  );
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease > b.prerelease ? 1 : (a.prerelease < b.prerelease ? -1 : 0);
}

function normalizeManifestContainer(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;
  if (manifest.channels && typeof manifest.channels === 'object' && manifest.channels[UPDATE_CHANNEL]) {
    return manifest.channels[UPDATE_CHANNEL];
  }
  if (manifest[UPDATE_CHANNEL] && typeof manifest[UPDATE_CHANNEL] === 'object') {
    return manifest[UPDATE_CHANNEL];
  }
  return manifest;
}

function normalizeAndroidManifestEntry(manifest) {
  const container = normalizeManifestContainer(manifest);
  if (!container || typeof container !== 'object') return null;
  const platforms = container.platforms && typeof container.platforms === 'object'
    ? container.platforms
    : null;
  const entry = platforms?.android || container.android;
  if (!entry || typeof entry !== 'object') return null;

  const latestVersion = String(entry.latestVersion || entry.version || '').trim();
  const artifacts = entry.artifacts && typeof entry.artifacts === 'object' ? entry.artifacts : {};
  const directUrl = String(entry.url || entry.downloadUrl || '').trim();
  const url = String(artifacts.apk || directUrl || '').trim();
  if (!latestVersion || !url) return null;

  const publishedAt = String(entry.publishedAt || entry.updatedAt || '').trim();
  const buildId = `${latestVersion}@${publishedAt || 'unknown'}`;
  return {
    version: latestVersion,
    releaseNotes: String(entry.releaseNotes || entry.notesMarkdown || entry.notes || '').trim(),
    updatedAt: buildId,
    downloadUrlAndroid: url,
  };
}

async function fetchManifestUrl(manifestUrl) {
  try {
    const response = await fetch(manifestUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeAndroidManifestEntry(payload);
  } catch {
    return null;
  }
}

async function fetchFromManifest() {
  return await fetchManifestUrl(UPDATE_MANIFEST_URL);
}

export async function checkForUpdate(serverUrl) {
  void serverUrl;
  const info = await fetchFromManifest();
  if (!info) return null;

  const nextVersion = String(info.version || '').trim();
  const semverCmp = compareSemver(nextVersion, APP_VERSION);
  if (semverCmp !== null && semverCmp <= 0) return null;

  const buildId = String(info.updatedAt || nextVersion || '').trim();
  if (!buildId) return null;
  const dismissedBuildId = await AsyncStorage.getItem(DISMISSED_KEY);
  if (dismissedBuildId && dismissedBuildId === buildId) return null;

  return {
    hasUpdate: true,
    version: nextVersion || UPDATE_CHANNEL,
    releaseNotes: String(info.releaseNotes || '').trim(),
    updatedAt: buildId,
    downloadUrl: String(info.downloadUrlAndroid || '').trim(),
  };
}

export async function dismissUpdate(updatedAt) {
  if (updatedAt) {
    await AsyncStorage.setItem(DISMISSED_KEY, updatedAt);
  }
}

export async function openDownloadUrl(downloadUrl) {
  if (!downloadUrl) return;
  try {
    const canOpen = await Linking.canOpenURL(downloadUrl);
    if (canOpen) {
      await Linking.openURL(downloadUrl);
    }
  } catch {
    // non-fatal
  }
}
