const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_DEV_WEB_URL = 'http://localhost:3000';
const DEFAULT_PROD_WEB_URL = 'https://www.assistantx.pl';

const CONFIG_PATH = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.config'),
  'JarvisDesktop',
  'config.json',
);

// In-memory override set for the current session (updated via setJarvisWebUrl).
let _webUrlOverride = null;

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '');
}

function isPackagedDesktopRuntime() {
  const hasElectron = Boolean(process.versions?.electron);
  if (!hasElectron) return false;

  const execPath = String(process.execPath || '').toLowerCase();
  return process.env.NODE_ENV === 'production' || (!process.defaultApp && !execPath.includes('electron'));
}

function readPersistedWebUrl() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return raw?.webUrl ? trimTrailingSlash(String(raw.webUrl)) : null;
  } catch {
    return null;
  }
}

/**
 * Persist a custom server URL for the user's Jarvis installation.
 * Writes to config.json and updates the in-memory override so the change
 * takes effect immediately without restarting the app.
 * Pass null or an empty string to clear the custom URL and fall back to the default.
 */
function setJarvisWebUrl(url) {
  const normalized = url ? trimTrailingSlash(String(url)) : null;
  _webUrlOverride = normalized;
  try {
    let current = {};
    try { current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch { /* ok */ }
    if (normalized) {
      current.webUrl = normalized;
    } else {
      delete current.webUrl;
    }
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2), 'utf-8');
  } catch {
    // Ignore write errors — in-memory override is still active for this session.
  }
}

function getJarvisWebUrl() {
  if (_webUrlOverride) return _webUrlOverride;
  const fromEnv = trimTrailingSlash(process.env.JARVIS_WEB_URL || process.env.JARVIS_API_URL);
  if (fromEnv) return fromEnv;
  const fromFile = readPersistedWebUrl();
  if (fromFile) return fromFile;
  return isPackagedDesktopRuntime() ? DEFAULT_PROD_WEB_URL : DEFAULT_DEV_WEB_URL;
}

function getJarvisApiUrl() {
  return trimTrailingSlash(process.env.JARVIS_API_URL || getJarvisWebUrl());
}

module.exports = {
  getJarvisApiUrl,
  getJarvisWebUrl,
  isPackagedDesktopRuntime,
  setJarvisWebUrl,
};
