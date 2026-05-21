'use strict';

const fs = require('fs');
const path = require('path');

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

const KNOWN_GAME_IDS = {
  steam: {
    cs2: '730',
    dota2: '570',
    cyberpunk2077: '1091500',
  },
  roblox: {
    default: '1818',
  },
  epic: {
    fortnite: 'Fortnite',
  },
  battlenet: {
    wow: 'wow',
    d4: 'd4',
  },
};

function resolveGameId(platform, id) {
  const normalizedPlatform = String(platform || '').toLowerCase();
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return '';
  const known = KNOWN_GAME_IDS[normalizedPlatform] || {};
  const fromMap = known[normalizedId.toLowerCase()];
  return String(fromMap || normalizedId);
}

function buildGameUri(platform, id) {
  const normalizedPlatform = String(platform || '').toLowerCase();
  const resolvedId = resolveGameId(normalizedPlatform, id);
  if (!SAFE_ID_RE.test(resolvedId)) {
    throw new Error('invalid-game-id');
  }

  if (normalizedPlatform === 'steam') return `steam://run/${resolvedId}`;
  if (normalizedPlatform === 'roblox') return `roblox://placeId=${resolvedId}`;
  if (normalizedPlatform === 'epic') return `com.epicgames.launcher://apps/${resolvedId}?action=launch`;
  if (normalizedPlatform === 'battlenet') return `battlenet://${resolvedId}/launch`;
  throw new Error('unsupported-platform');
}

async function openGame({ shell, platform, id }) {
  if (!shell || typeof shell.openExternal !== 'function') {
    throw new Error('shell-unavailable');
  }
  const uri = buildGameUri(platform, id);
  await shell.openExternal(uri);
  return {
    ok: true,
    uri,
  };
}

function getStartMenuRoots() {
  const roots = [];
  if (process.platform === 'win32') {
    const programData = process.env.PROGRAMDATA;
    const appData = process.env.APPDATA;
    if (programData) roots.push(path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
    if (appData) roots.push(path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  }
  return roots;
}

function* walkShortcuts(rootPath, maxDepth = 4, depth = 0) {
  if (!rootPath || depth > maxDepth || !fs.existsSync(rootPath)) return;
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      yield* walkShortcuts(full, maxDepth, depth + 1);
      continue;
    }
    if (entry.isFile() && /\.lnk$/i.test(entry.name)) {
      yield full;
    }
  }
}

function findAppShortcut(appName) {
  const query = String(appName || '').trim().toLowerCase();
  if (!query) return null;
  const roots = getStartMenuRoots();
  for (const root of roots) {
    for (const shortcutPath of walkShortcuts(root)) {
      const fileName = path.basename(shortcutPath, path.extname(shortcutPath)).toLowerCase();
      if (fileName.includes(query)) return shortcutPath;
    }
  }
  return null;
}

async function launchAnyApp({ shell, appName }) {
  const normalized = String(appName || '').trim();
  if (!normalized) throw new Error('app-name-required');
  if (!shell || typeof shell.openPath !== 'function') throw new Error('shell-unavailable');
  const shortcut = findAppShortcut(normalized);
  if (!shortcut) {
    return {
      ok: false,
      appName: normalized,
      reason: 'app-not-found',
    };
  }
  const result = await shell.openPath(shortcut);
  if (result) throw new Error(result);
  return {
    ok: true,
    appName: normalized,
    path: shortcut,
  };
}

module.exports = {
  name: 'apps',
  KNOWN_GAME_IDS,
  buildGameUri,
  openGame,
  launchAnyApp,
};
