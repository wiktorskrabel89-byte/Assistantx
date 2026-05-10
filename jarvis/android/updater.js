// jarvis/android/updater.js
//
// Checks whether a newer Jarvis release is available on GitHub and returns
// the update info so the caller can decide how to present it to the user.
//
// Strategy:
//   1. Try the configured AssistantX server at /api/jarvis/version first.
//      This works for private repos because the server has a GitHub token.
//   2. Fall back to the public GitHub Releases API directly.
//      This works for public repos without any credentials.
//
// Change detection uses the release's `updated_at` timestamp (stored in
// AsyncStorage).  Each workflow run updates the release body/assets, which
// bumps `updated_at`, so any new build is correctly detected even when the
// tag name (`jarvis-latest`) stays constant.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

const REPO = 'wiktorskrabel89-byte/Assistantx';
const RELEASE_TAG = 'jarvis-latest';
const GITHUB_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`;
const LAST_SEEN_KEY = 'jarvis-updater-last-seen-updated-at';
const DISMISSED_KEY = 'jarvis-updater-dismissed-updated-at';
const FETCH_TIMEOUT_MS = 8000;

/**
 * Normalise a server URL (which may be http/https or ws/wss) to an http base.
 * @param {string} url
 * @returns {string}
 */
function toHttpBase(url) {
  return (url || '')
    .replace(/^wss?:\/\//, (m) => (m === 'wss://' ? 'https://' : 'http://'))
    .replace(/\/ws\/?$/, '')
    .replace(/\/$/, '');
}

/**
 * Fetch release metadata from the AssistantX server endpoint.
 * @param {string} serverUrl
 * @returns {Promise<object|null>}
 */
async function fetchFromServer(serverUrl) {
  if (!serverUrl) return null;
  try {
    const base = toHttpBase(serverUrl);
    const res = await fetch(`${base}/api/jarvis/version`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch release metadata directly from the GitHub Releases API.
 * Works without authentication for public repositories.
 * @returns {Promise<object|null>}
 */
async function fetchFromGitHub() {
  try {
    const res = await fetch(GITHUB_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const release = await res.json();
    return {
      releaseId: release.id,
      version: release.name || release.tag_name,
      releaseNotes: release.body || '',
      publishedAt: release.published_at,
      updatedAt: release.updated_at,
      downloadUrlAndroid: `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/Jarvis-android.apk`,
    };
  } catch {
    return null;
  }
}

/**
 * Check whether a new Jarvis release is available.
 *
 * @param {string} serverUrl - The AssistantX server URL saved in the WoL
 *   settings (e.g. "http://192.168.1.100:3000").  Pass an empty string if
 *   the user hasn't configured one yet.
 *
 * @returns {Promise<{
 *   hasUpdate: boolean,
 *   version: string,
 *   releaseNotes: string,
 *   updatedAt: string,
 *   downloadUrl: string
 * } | null>} Update info when an update is available, null when up-to-date or
 *   when the check could not be completed.
 */
export async function checkForUpdate(serverUrl) {
  const info = (await fetchFromServer(serverUrl)) || (await fetchFromGitHub());
  if (!info || !info.updatedAt) return null;

  // Load the timestamp that the user already acknowledged (either by tapping
  // "Download" or "Later" in a previous session).
  const dismissed = await AsyncStorage.getItem(DISMISSED_KEY);
  if (dismissed && dismissed >= info.updatedAt) {
    // User has already seen / dismissed this exact release build.
    return null;
  }

  // Load the timestamp we last stored.  If it's the same as what GitHub
  // reports, the release hasn't changed since last check.
  const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);
  await AsyncStorage.setItem(LAST_SEEN_KEY, info.updatedAt);

  if (lastSeen && lastSeen >= info.updatedAt) {
    // Release hasn't been updated since we last checked.
    return null;
  }

  return {
    hasUpdate: true,
    version: info.version || RELEASE_TAG,
    releaseNotes: info.releaseNotes || '',
    updatedAt: info.updatedAt,
    downloadUrl: info.downloadUrlAndroid || '',
  };
}

/**
 * Mark the given release build as dismissed so the user won't be prompted
 * again for this exact build.
 *
 * Call this when the user taps "Download" OR "Later".
 *
 * @param {string} updatedAt - The `updatedAt` value returned by checkForUpdate.
 */
export async function dismissUpdate(updatedAt) {
  if (updatedAt) {
    await AsyncStorage.setItem(DISMISSED_KEY, updatedAt);
  }
}

/**
 * Open the download URL in the device's default browser.
 * Android will prompt the user to save the APK and then to install it
 * (requires "Install from unknown sources" to be enabled for the browser).
 *
 * @param {string} downloadUrl
 */
export async function openDownloadUrl(downloadUrl) {
  if (!downloadUrl) return;
  try {
    const canOpen = await Linking.canOpenURL(downloadUrl);
    if (canOpen) {
      await Linking.openURL(downloadUrl);
    }
  } catch {
    // Linking failure is non-fatal — the user can navigate manually.
  }
}
