'use strict';

function buildSecureWebPreferences({ preload, extra = {} } = {}) {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    preload,
    ...extra,
  };
}

module.exports = {
  buildSecureWebPreferences,
};
