'use strict';

const {
  invalidResult,
  parseHttpUrl,
  validateInteger,
  validatePlainObject,
  validateString,
} = require('../../services/ipc-guards');
const { withSchema } = require('./schema');
const { registerIpcHandlers } = require('./channel-registry');

function denied(action, reason) {
  return {
    ok: false,
    error: 'permission-denied',
    action,
    reason,
  };
}

function createMainIpcHandlers(deps) {
  const {
    ipcMain,
    app,
    shell,
    launcherService,
    ensureDbReady,
    getSidecarStatus,
    checkLocalAiAvailability,
    routeAiRequest,
    installLocalAiEngine,
    restartSidecar,
    startupDiagnostics,
    getLocalTelemetrySnapshot,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    deferUpdate,
    getUpdateState,
    getUpdaterAuthStatus,
    setUpdaterPrivateToken,
    clearUpdaterPrivateToken,
    getJarvisWebUrl,
    setJarvisWebUrl,
    getAuthSessionView,
    getDeviceToken,
    refreshAuthSession,
    signOutAccountSession,
    getAccountProfile,
    beginDesktopLogin,
    getMainWindow,
    getOverlayWindow,
    createLauncherOverlayWindow,
    pairServer,
    connectServer,
    disconnectServer,
    getServerStatus,
    execServerTool,
    approveServerAction,
    rejectServerAction,
    setServerAutonomy,
    forceServerDisconnect,
    getFullControlConsent,
    acceptFullControlDisclaimer,
    setAppStateHint,
    serverToolAllowList,
    permissions,
    securityAudit,
  } = deps;

  const handlers = {
    'get-sidecar-status': () => ({
      status: getSidecarStatus(),
      port: Number(process.env.JARVIS_SIDECAR_PORT || '8765'),
    }),

    'setup:check-local-ai': async () => checkLocalAiAvailability(),

    'setup:install-local': async () => {
      const auth = await permissions.authorize('setup:install-local');
      if (!auth.allowed) return denied('setup:install-local', auth.reason);
      return installLocalAiEngine();
    },

    'restart-sidecar': async () => {
      const auth = await permissions.authorize('restart-sidecar');
      if (!auth.allowed) return denied('restart-sidecar', auth.reason);
      restartSidecar();
      return { ok: true };
    },

    'open-url': withSchema('open-url', (payload) => validateString(payload, { maxLen: 2000 }), async (_event, url) => {
      const auth = await permissions.authorize('open-url', { url });
      if (!auth.allowed) return denied('open-url', auth.reason);
      const parsed = parseHttpUrl(url);
      if (!parsed) return invalidResult('open-url', 'url-must-be-http-or-https');
      securityAudit({ action: 'open-url', target: parsed.toString() });
      await shell.openExternal(parsed.toString());
      return { ok: true };
    }),

    'open-path': withSchema('open-path', (payload) => validateString(payload, { maxLen: 8192 }), async (_event, filePath) => {
      const auth = await permissions.authorize('open-path', { filePath });
      if (!auth.allowed) return denied('open-path', auth.reason);
      if (!filePath) return invalidResult('open-path', 'path-must-be-non-empty-string');
      securityAudit({ action: 'open-path', target: filePath });
      const result = await shell.openPath(filePath);
      return {
        ok: !result,
        error: result || null,
      };
    }),

    'launcher-search': async (_event, payload) => {
      await ensureDbReady();
      const body = validatePlainObject(payload) || {};
      const query = validateString(body.query, { allowEmpty: true, maxLen: 200 }) || '';
      const limit = validateInteger(body.limit, { min: 1, max: 20, fallback: 8 });
      return launcherService.searchApps(query, { limit });
    },

    'launcher-recent': async (_event, payload) => {
      await ensureDbReady();
      const body = validatePlainObject(payload) || {};
      const limit = validateInteger(body.limit, { min: 1, max: 20, fallback: 8 });
      return launcherService.searchApps('', { limit });
    },

    'launcher-refresh': async () => {
      await ensureDbReady();
      return launcherService.refreshCatalog({ reason: 'overlay-manual' });
    },

    'launcher-launch': async (_event, payload) => {
      await ensureDbReady();
      const auth = await permissions.authorize('launcher-launch', { source: 'ipc' });
      if (!auth.allowed) return denied('launcher-launch', auth.reason);
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('launcher-launch', 'payload-must-be-object');
      const query = validateString(body.query, { allowEmpty: true, maxLen: 200 }) || '';
      const key = validateString(body.key, { allowEmpty: true, maxLen: 200 }) || '';
      const launchQuery = query || key;
      if (!launchQuery) return invalidResult('launcher-launch', 'query-or-key-required');
      securityAudit({ action: 'launcher-launch', target: launchQuery });
      return launcherService.launchApp(launchQuery, {
        trigger: 'manual',
        confirmed: true,
        admin: Boolean(body.admin),
      });
    },

    'launcher-hide': () => {
      const overlayWin = getOverlayWindow();
      if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
      return { ok: true };
    },

    'request-launcher-confirmation': async (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const title = validateString(body.title, { allowEmpty: true, maxLen: 120 }) || 'Confirm launch';
      const message = validateString(body.message, { allowEmpty: true, maxLen: 500 }) || 'Do you want to continue?';
      let overlayWin = getOverlayWindow();
      if (!overlayWin || overlayWin.isDestroyed()) {
        createLauncherOverlayWindow();
        overlayWin = getOverlayWindow();
      }
      const id = `launcher-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      overlayWin.show();
      overlayWin.focus();
      overlayWin.webContents.send('launcher-confirmation-request', {
        id,
        ...body,
        title,
        message,
      });
      return new Promise((resolve) => {
        deps.pendingLauncherConfirmations.set(id, resolve);
      });
    },

    'launcher-confirmation-response': (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('launcher-confirmation-response', 'payload-must-be-object');
      const confirmationId = validateString(body.id, { maxLen: 120 });
      if (!confirmationId) return invalidResult('launcher-confirmation-response', 'id-required');
      const pending = deps.pendingLauncherConfirmations.get(confirmationId);
      if (pending) {
        pending(Boolean(body.approved));
        deps.pendingLauncherConfirmations.delete(confirmationId);
      }
      const overlayWin = getOverlayWindow();
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.webContents.send('launcher-confirmation-cleared', { id: confirmationId || null });
        if (deps.pendingLauncherConfirmations.size === 0) {
          overlayWin.webContents.send('launcher-overlay-focus');
        }
      }
      return { ok: true };
    },

    'install-everything-search': async () => {
      const auth = await permissions.authorize('install-everything-search');
      if (!auth.allowed) return denied('install-everything-search', auth.reason);
      launcherService.remindLaterForEverything();
      await shell.openExternal('https://www.voidtools.com/downloads/');
      return { ok: true };
    },

    'jarvis-ai-request': async (_event, payload) => {
      const auth = await permissions.authorize('jarvis-ai-request');
      if (!auth.allowed) return denied('jarvis-ai-request', auth.reason);
      const body = validatePlainObject(payload);
      if (!body) {
        return { ok: false, status: 400, body: 'Invalid payload', headers: { 'content-type': 'text/plain' } };
      }
      const endpoint = validateString(body.endpoint, { maxLen: 2000 });
      const endpointUrl = parseHttpUrl(endpoint);
      if (!endpointUrl) {
        return { ok: false, status: 400, body: 'Invalid endpoint', headers: { 'content-type': 'text/plain' } };
      }

      const timeoutMs = validateInteger(body.timeoutMs, { min: 1_000, max: 120_000, fallback: 45_000 });
      try {
        const requestHeaders = {
          'Content-Type': 'application/json',
          'User-Agent': `JarvisDesktop/${app.getVersion()} Electron`,
          Origin: endpointUrl.origin,
        };
        const token = validateString(body.token, { allowEmpty: true, maxLen: 5000 });
        if (token) requestHeaders.Authorization = `Bearer ${token}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(validatePlainObject(body.payload) || {}),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const responseBody = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          body: responseBody,
          headers: {
            'content-type': response.headers.get('content-type') || 'text/plain',
          },
        };
      } catch (error) {
        return {
          ok: false,
          status: 502,
          body: `Main-process AI proxy failed: ${error?.message || 'unknown error'}`,
          headers: {
            'content-type': 'text/plain',
          },
        };
      }
    },

    'jarvis-ai-route': async (_event, payload) => {
      const auth = await permissions.authorize('jarvis-ai-request');
      if (!auth.allowed) return denied('jarvis-ai-request', auth.reason);
      const body = validatePlainObject(payload) || {};
      const message = validateString(body.message, { allowEmpty: false, maxLen: 30000 });
      if (!message) {
        return {
          ok: false,
          error: 'message-required',
        };
      }
      const messages = Array.isArray(body.messages)
        ? body.messages
          .slice(-20)
          .map((entry) => ({
            role: validateString(entry?.role, { allowEmpty: false, maxLen: 20 }) || 'user',
            content: validateString(entry?.content, { allowEmpty: true, maxLen: 16000 }) || '',
          }))
        : undefined;
      const profile = validateString(body.profile, { allowEmpty: true, maxLen: 20 }) || 'chat';
      const contextType = validateString(body.contextType, { allowEmpty: true, maxLen: 20 }) || 'general';
      try {
        return await routeAiRequest({
          message,
          messages,
          profile,
          contextType,
          retryCount: validateInteger(body.retryCount, { min: 0, max: 5, fallback: 0 }),
          contextSize: validateString(body.contextSize, { allowEmpty: true, maxLen: 20 }) || undefined,
        });
      } catch (error) {
        return {
          ok: false,
          error: String(error?.message || error || 'ai-router-failed'),
        };
      }
    },

    'get-desktop-diagnostics': () => startupDiagnostics.snapshot(),
    'get-local-telemetry': () => getLocalTelemetrySnapshot(),
    'get-app-meta': () => ({ version: app.getVersion(), packaged: app.isPackaged }),
    'auth:get-device-token': async () => getDeviceToken(),
    'auth:get-session': () => getAuthSessionView(),
    'auth:refresh': async () => refreshAuthSession(),
    'auth:sign-out': async () => signOutAccountSession({ reason: 'renderer-sign-out' }),
    'auth:get-profile': async () => getAccountProfile(),

    'get-displays': () => {
      const { screen } = require('electron');
      return screen.getAllDisplays().map((display) => ({
        id: display.id,
        label: display.label || `Display ${display.id}`,
        bounds: display.bounds,
        scaleFactor: display.scaleFactor,
        isPrimary: display.bounds.x === 0 && display.bounds.y === 0,
      }));
    },

    'check-for-updates': () => checkForUpdates(),
    'get-update-state': () => getUpdateState(),
    'updater:get-auth-status': () => getUpdaterAuthStatus(),
    'updater:set-token': (_event, payload) => {
      const token = validateString(payload, { allowEmpty: false, maxLen: 5000 });
      if (!token) return invalidResult('updater:set-token', 'token-required');
      return setUpdaterPrivateToken(token);
    },
    'updater:clear-token': () => clearUpdaterPrivateToken(),
    'get-jarvis-web-url': () => getJarvisWebUrl(),

    'set-jarvis-web-url': (_event, url) => {
      const urlStr = validateString(url, { allowEmpty: true, maxLen: 300 }) || '';
      if (urlStr && !parseHttpUrl(urlStr)) {
        return invalidResult('set-jarvis-web-url', 'server-url-must-be-http-or-https');
      }
      setJarvisWebUrl(urlStr || null);
      return { ok: true, url: getJarvisWebUrl() };
    },

    'download-update': async () => {
      return downloadUpdate('renderer-update-now');
    },

    'install-update': () => installUpdate('renderer-restart-now'),
    'defer-update': (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const reason = validateString(body.reason, { allowEmpty: false, maxLen: 80 }) || 'later';
      const source = validateString(body.source, { allowEmpty: false, maxLen: 80 }) || 'renderer';
      return deferUpdate(reason, source);
    },

    'open-account-login': async () => {
      const auth = await permissions.authorize('open-account-login');
      if (!auth.allowed) return denied('open-account-login', auth.reason);
      return beginDesktopLogin({ parentWindow: getMainWindow() });
    },

    'server:pair': (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('server:pair', 'payload-must-be-object');
      const serverIp = validateString(body.serverIp, { allowEmpty: false, maxLen: 200 });
      const syncKey = validateString(body.syncKey, { allowEmpty: false, maxLen: 1024 });
      if (!serverIp) return invalidResult('server:pair', 'server-ip-required');
      if (!syncKey) return invalidResult('server:pair', 'sync-key-required');
      return pairServer({ serverIp, syncKey });
    },

    'server:connect': () => connectServer(),
    'server:disconnect': () => disconnectServer(),
    'server:status': () => getServerStatus(),

    'server:exec-tool': async (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('server:exec-tool', 'payload-must-be-object');
      const tool = validateString(body.tool, { allowEmpty: false, maxLen: 120 });
      if (!tool) return invalidResult('server:exec-tool', 'tool-required');
      if (Array.isArray(serverToolAllowList) && !serverToolAllowList.includes(tool)) {
        return invalidResult('server:exec-tool', 'tool-not-allowed');
      }
      const args = validatePlainObject(body.args) || {};
      try {
        const result = await execServerTool(tool, args);
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: String(error?.message || 'server-tool-failed') };
      }
    },

    'server:approve': (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('server:approve', 'payload-must-be-object');
      const id = validateString(body.id, { allowEmpty: false, maxLen: 120 });
      if (!id) return invalidResult('server:approve', 'id-required');
      return approveServerAction(id);
    },

    'server:reject': (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('server:reject', 'payload-must-be-object');
      const id = validateString(body.id, { allowEmpty: false, maxLen: 120 });
      if (!id) return invalidResult('server:reject', 'id-required');
      return rejectServerAction(id);
    },

    'server:set-autonomy': (_event, payload) => {
      const level = validateString(payload, { allowEmpty: false, maxLen: 20 });
      if (!level) return invalidResult('server:set-autonomy', 'autonomy-level-required');
      return setServerAutonomy(level);
    },

    'server:force-disconnect': () => forceServerDisconnect(),
    'server:get-full-control-consent': () => getFullControlConsent(),
    'server:accept-full-control-disclaimer': () => acceptFullControlDisclaimer(),

    'app-state:hint': (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('app-state:hint', 'payload-must-be-object');
      const state = validateString(body.state, { allowEmpty: false, maxLen: 30 });
      const active = typeof body.active === 'boolean' ? body.active : false;
      const source = validateString(body.source, { allowEmpty: true, maxLen: 120 }) || 'renderer';
      if (!state) return invalidResult('app-state:hint', 'state-required');
      setAppStateHint(state, active, source);
      return { ok: true };
    },
  };

  registerIpcHandlers(ipcMain, handlers);
}

module.exports = {
  createMainIpcHandlers,
};
