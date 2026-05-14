const { scanWindowsApps } = require('../../app-scanner');

async function scanWithWindowsFallback(execFilePromise) {
  const apps = await scanWindowsApps(execFilePromise);
  return {
    provider: 'windows-fallback',
    available: true,
    apps,
    detail: `Fallback scan discovered ${apps.length} launcher entries.`,
  };
}

module.exports = {
  scanWithWindowsFallback,
};
