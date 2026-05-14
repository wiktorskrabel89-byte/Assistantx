const fs = require('fs');
const path = require('path');
const { dedupeApps, normalizeName } = require('../../app-scanner');

const EVERYTHING_CLI_CANDIDATES = [
  process.env.JARVIS_EVERYTHING_CLI_PATH,
  'es.exe',
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Everything', 'es.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Everything', 'es.exe'),
].filter(Boolean);

async function findEverythingCli(execFilePromise) {
  for (const candidate of EVERYTHING_CLI_CANDIDATES) {
    try {
      if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
      await execFilePromise(candidate, ['-version']);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function parsePaths(stdout) {
  return String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\.(exe|lnk)$/i.test(line));
}

async function scanWithEverything(execFilePromise) {
  const cliPath = await findEverythingCli(execFilePromise);
  if (!cliPath) {
    return {
      provider: 'everything',
      available: false,
      apps: [],
      detail: 'Everything CLI not found.',
    };
  }

  const queries = [
    'ext:exe|lnk',
    'path:"C:\\ProgramData\\Microsoft\\Windows\\Start Menu" ext:lnk',
    'path:"%APPDATA%\\Microsoft\\Windows\\Start Menu" ext:lnk',
  ];

  const results = [];
  for (const query of queries) {
    try {
      const stdout = await execFilePromise(cliPath, [query]);
      parsePaths(stdout).forEach((filePath) => {
        results.push({
          key: path.basename(filePath, path.extname(filePath)),
          name: normalizeName(path.basename(filePath)),
          launchTarget: filePath,
          launchType: /\.lnk$/i.test(filePath) ? 'shortcut' : 'executable',
          launchMode: /\.lnk$/i.test(filePath) ? 'start' : 'filePath',
          source: filePath,
          iconPath: filePath,
          installRoot: path.dirname(filePath),
        });
      });
    } catch (error) {
      return {
        provider: 'everything',
        available: false,
        apps: [],
        detail: `Everything query failed: ${error.message}`,
      };
    }
  }

  return {
    provider: 'everything',
    available: results.length > 0,
    apps: dedupeApps(results),
    detail: results.length > 0 ? `Everything returned ${results.length} paths.` : 'Everything returned no launcher candidates.',
  };
}

module.exports = {
  findEverythingCli,
  scanWithEverything,
};
