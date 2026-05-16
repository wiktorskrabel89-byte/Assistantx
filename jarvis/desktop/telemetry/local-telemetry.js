'use strict';

const { getTelemetrySnapshot, updateTelemetry } = require('../local-state');
const { compareSemver } = require('../electron/updater/feed-metadata');

function wireLocalTelemetry(eventBus) {
  if (!eventBus?.subscribe) return () => {};

  const unsubscribe = eventBus.subscribe((eventName, payload = {}) => {
    const now = new Date().toISOString();

    updateTelemetry((current) => {
      const sidecar = { ...(current.sidecar || {}) };
      const startup = { ...(current.startup || {}) };
      const updater = { ...(current.updater || {}) };

      if (eventName === 'sidecar.started') sidecar.started = Number(sidecar.started || 0) + 1;
      if (eventName === 'sidecar.running') sidecar.running = Number(sidecar.running || 0) + 1;
      if (eventName === 'sidecar.exit') sidecar.exits = Number(sidecar.exits || 0) + 1;
      if (eventName === 'sidecar.error') sidecar.errors = Number(sidecar.errors || 0) + 1;
      if (eventName === 'sidecar.reconnect') sidecar.reconnects = Number(sidecar.reconnects || 0) + 1;
      if (eventName === 'sidecar.unavailable') sidecar.unavailable = Number(sidecar.unavailable || 0) + 1;
      if (eventName === 'sidecar.restart') sidecar.restarts = Number(sidecar.restarts || 0) + 1;

      if (eventName === 'startup.healthy') startup.healthy = Number(startup.healthy || 0) + 1;
      if (eventName === 'startup.degraded') startup.degraded = Number(startup.degraded || 0) + 1;
      if (eventName === 'startup.unavailable') startup.unavailable = Number(startup.unavailable || 0) + 1;

      if (eventName === 'updater.offered') {
        updater.offered = Number(updater.offered || 0) + 1;
        updater.lastOfferedVersion = payload.version || updater.lastOfferedVersion || null;
      }
      if (eventName === 'updater.accepted') updater.accepted = Number(updater.accepted || 0) + 1;
      if (eventName === 'updater.deferred') updater.deferred = Number(updater.deferred || 0) + 1;
      if (eventName === 'updater.rollout.deferred') updater.rolloutDeferred = Number(updater.rolloutDeferred || 0) + 1;
      if (eventName === 'updater.download.started') updater.downloadStarted = Number(updater.downloadStarted || 0) + 1;
      if (eventName === 'updater.downloaded') {
        updater.downloaded = Number(updater.downloaded || 0) + 1;
        updater.lastDownloadedVersion = payload.version || updater.lastDownloadedVersion || null;
        updater.pendingInstallVersion = payload.version || updater.pendingInstallVersion || null;
      }
      if (eventName === 'updater.download.failed') updater.downloadFailed = Number(updater.downloadFailed || 0) + 1;
      if (eventName === 'updater.download.full-fallback') updater.fullFallbacks = Number(updater.fullFallbacks || 0) + 1;
      if (eventName === 'updater.install.started') {
        updater.installStarted = Number(updater.installStarted || 0) + 1;
        updater.pendingInstallVersion = payload.version || updater.pendingInstallVersion || null;
      }
      if (eventName === 'updater.install.failed') {
        updater.installFailed = Number(updater.installFailed || 0) + 1;
        updater.lastInstallerExitCode = payload.exitCode ?? updater.lastInstallerExitCode ?? null;
      }
      if (eventName === 'updater.install.succeeded') {
        updater.installSucceeded = Number(updater.installSucceeded || 0) + 1;
        updater.pendingInstallVersion = null;
      }
      if (eventName === 'updater.metadata.signature-verified') updater.signatureVerified = Number(updater.signatureVerified || 0) + 1;
      if (eventName === 'updater.metadata.signature-failed') updater.signatureFailed = Number(updater.signatureFailed || 0) + 1;
      if (eventName === 'updater.session.started' && updater.pendingInstallVersion && payload.currentVersion) {
        const installCmp = compareSemver(payload.currentVersion, updater.pendingInstallVersion);
        if (installCmp !== null && installCmp >= 0) {
          updater.installSucceeded = Number(updater.installSucceeded || 0) + 1;
          updater.pendingInstallVersion = null;
        }
      }

      if (eventName.startsWith('sidecar.')) sidecar.lastEventAt = now;
      if (eventName.startsWith('startup.')) startup.lastEventAt = now;
      if (eventName.startsWith('updater.')) updater.lastEventAt = now;

      return {
        ...current,
        sidecar,
        startup,
        updater,
      };
    });
  });

  return unsubscribe;
}

function getLocalTelemetrySnapshot() {
  return getTelemetrySnapshot();
}

module.exports = {
  getLocalTelemetrySnapshot,
  wireLocalTelemetry,
};
