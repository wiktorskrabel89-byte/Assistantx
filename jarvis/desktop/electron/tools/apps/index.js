'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

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

function listMacAppPaths() {
  const homeDir = process.env.HOME || '';
  const roots = ['/Applications', homeDir ? path.join(homeDir, 'Applications') : null].filter(Boolean);
  const appPaths = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && /\.app$/i.test(entry.name)) {
        appPaths.push(path.join(root, entry.name));
      }
    }
  }
  return appPaths;
}

function findMacApp(appName) {
  const query = String(appName || '').trim().toLowerCase();
  if (!query) return null;
  for (const appPath of listMacAppPaths()) {
    const displayName = path.basename(appPath, '.app').toLowerCase();
    if (displayName.includes(query)) return appPath;
  }
  return null;
}

function findMacAppWithSpotlight(appName) {
  return new Promise((resolve) => {
    const query = String(appName || '').trim();
    if (!query) {
      resolve(null);
      return;
    }
    execFile('mdfind', [`kMDItemKind == "Application" && kMDItemDisplayName == "*${query}*"`], {
      timeout: 2000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const firstMatch = String(stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.endsWith('.app'));
      resolve(firstMatch || null);
    });
  });
}

function parseDesktopExecCommand(execValue) {
  const line = String(execValue || '').trim();
  if (!line) return '';
  const withoutArgs = line.replace(/\s+%[fFuUdDnNickvm]/g, '').trim();
  const quoteMatch = withoutArgs.match(/^"([^"]+)"/);
  if (quoteMatch) return quoteMatch[1];
  return withoutArgs.split(/\s+/)[0] || '';
}

function findLinuxDesktopEntry(appName) {
  const query = String(appName || '').trim().toLowerCase();
  if (!query) return null;
  const homeDir = process.env.HOME || '';
  const roots = ['/usr/share/applications', homeDir ? path.join(homeDir, '.local', 'share', 'applications') : null].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.desktop$/i.test(entry.name)) continue;
      const fullPath = path.join(root, entry.name);
      let content = '';
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }
      const nameMatch = content.match(/^Name=(.+)$/m);
      const execMatch = content.match(/^Exec=(.+)$/m);
      const appDisplayName = String(nameMatch?.[1] || '').trim().toLowerCase();
      if (!appDisplayName.includes(query)) continue;
      const execCommand = parseDesktopExecCommand(execMatch?.[1]);
      if (!execCommand) continue;
      return { desktopEntryPath: fullPath, execCommand };
    }
  }
  return null;
}

function execFilePromise(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function launchAnyApp({ shell, appName }) {
  const normalized = String(appName || '').trim();
  if (!normalized) throw new Error('app-name-required');
  if (!shell || typeof shell.openPath !== 'function') throw new Error('shell-unavailable');
  if (process.platform === 'win32') {
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

  if (process.platform === 'darwin') {
    const appPath = findMacApp(normalized) || (await findMacAppWithSpotlight(normalized));
    if (!appPath) {
      return {
        ok: false,
        appName: normalized,
        reason: 'app-not-found',
      };
    }
    const result = await shell.openPath(appPath);
    if (result) throw new Error(result);
    return {
      ok: true,
      appName: normalized,
      path: appPath,
    };
  }

  if (process.platform === 'linux') {
    const desktopEntry = findLinuxDesktopEntry(normalized);
    if (!desktopEntry) {
      return {
        ok: false,
        appName: normalized,
        reason: 'app-not-found',
      };
    }
    const commandPath = desktopEntry.execCommand;
    await execFilePromise(commandPath, [], { timeout: 5000, windowsHide: true });
    return {
      ok: true,
      appName: normalized,
      path: desktopEntry.desktopEntryPath,
      command: commandPath,
    };
  }

  return {
    ok: false,
    appName: normalized,
    reason: `unsupported-platform:${process.platform}`,
  };
}

module.exports = {
  name: 'apps',
  KNOWN_GAME_IDS,
  buildGameUri,
  openGame,
  launchAnyApp,
};
