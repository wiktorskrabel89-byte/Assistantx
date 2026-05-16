'use strict';

function buildSecureWebPreferences({ preload, extra = {} } = {}) {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    // sandbox: true prevents Electron's sandboxed preloadRequire from resolving
    // relative module paths (e.g. './auth') used throughout preload.js.
    // Security is maintained by contextIsolation + nodeIntegration: false, which
    // prevents renderer-side XSS from reaching Node.js or the preload context.
    sandbox: false,
    webSecurity: true,
    preload,
    ...extra,
  };
}

module.exports = {
  buildSecureWebPreferences,
};
