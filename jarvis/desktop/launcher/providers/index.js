const { scanWithEverything } = require('./everything-provider');
const { scanWithWindowsFallback } = require('./windows-fallback-provider');

async function discoverApps(execFilePromise, { platform = process.platform } = {}) {
  if (platform !== 'win32') {
    return {
      activeProvider: 'unsupported-platform',
      apps: [],
      statuses: [{ provider: 'unsupported-platform', status: 'skipped', detail: 'Launcher discovery is Windows-first.' }],
    };
  }

  const statuses = [];
  const everything = await scanWithEverything(execFilePromise);
  statuses.push({
    provider: everything.provider,
    status: everything.available ? 'available' : 'unavailable',
    detail: everything.detail,
  });
  if (everything.available && everything.apps.length > 0) {
    return {
      activeProvider: 'everything',
      apps: everything.apps,
      statuses,
    };
  }

  const fallback = await scanWithWindowsFallback(execFilePromise);
  statuses.push({ provider: fallback.provider, status: 'available', detail: fallback.detail });
  return {
    activeProvider: fallback.provider,
    apps: fallback.apps,
    statuses,
  };
}

module.exports = {
  discoverApps,
};
