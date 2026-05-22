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
    sendSidecarMessage,
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
    serverGetAuthStatus,
    serverClearAuth,
    serverVerifyPairing,
    serverGetRuntimeStatus,
    serverSetPermissionLevel,
    serverKillSwitch,
    serverGetConfig,
    serverSetConfig,
    localServerList,
    localServerAdd,
    localServerUpdate,
    localServerRemove,
    localServerScan,
    localServerGetAssignment,
    localServerSetAssignment,
    githubClient,
    googleClient,
    appsTool,
    getMainWindow,
    getOverlayWindow,
    createLauncherOverlayWindow,
    prepareForQuitAndInstall,
    resetQuitAndInstallPreparation,
    permissions,
    securityAudit,
    mcpManager,
    mcpRouter,
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

    'sidecar:send': withSchema('sidecar:send', (payload) => validatePlainObject(payload), async (_event, payload) => (
      sendSidecarMessage(payload || {})
    )),

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

    'tools:launch-game': async (_event, payload) => {
      const auth = await permissions.authorize('tools:launch-game');
      if (!auth.allowed) return denied('tools:launch-game', auth.reason);
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('tools:launch-game', 'payload-must-be-object');
      const platform = validateString(body.platform, { allowEmpty: false, maxLen: 40 });
      const id = validateString(body.id, { allowEmpty: false, maxLen: 120 });
      if (!platform || !id) return invalidResult('tools:launch-game', 'platform-and-id-required');
      securityAudit({ action: 'tools:launch-game', target: `${platform}:${id}` });
      return appsTool.openGame({ shell, platform, id });
    },
    'tools:launch-app': async (_event, payload) => {
      const auth = await permissions.authorize('tools:launch-game');
      if (!auth.allowed) return denied('tools:launch-app', auth.reason);
      const body = validatePlainObject(payload);
      const appName = validateString(body?.appName, { allowEmpty: false, maxLen: 120 });
      if (!appName) return invalidResult('tools:launch-app', 'app-name-required');
      securityAudit({ action: 'tools:launch-app', target: appName });
      return appsTool.launchAnyApp({ shell, appName });
    },

    'github:set-token': (_event, token) => {
      const value = validateString(token, { allowEmpty: false, maxLen: 5000 });
      if (!value) return invalidResult('github:set-token', 'token-required');
      return githubClient.setToken(value);
    },
    'github:clear-token': () => githubClient.clearToken(),
    'github:status': async () => githubClient.getStatus(),
    'github:list-repos': async (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const user = validateString(body.user, { allowEmpty: true, maxLen: 120 }) || undefined;
      const perPage = validateInteger(body.perPage, { min: 1, max: 100, fallback: 50 });
      return githubClient.listRepos({ user, perPage });
    },
    'github:get-tree': async (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('github:get-tree', 'payload-must-be-object');
      const owner = validateString(body.owner, { allowEmpty: false, maxLen: 120 });
      const repo = validateString(body.repo, { allowEmpty: false, maxLen: 120 });
      const branch = validateString(body.branch, { allowEmpty: true, maxLen: 120 }) || undefined;
      if (!owner || !repo) return invalidResult('github:get-tree', 'owner-and-repo-required');
      return githubClient.getRepoTree({ owner, repo, branch });
    },
    'github:read-file': async (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('github:read-file', 'payload-must-be-object');
      const owner = validateString(body.owner, { allowEmpty: false, maxLen: 120 });
      const repo = validateString(body.repo, { allowEmpty: false, maxLen: 120 });
      const filePath = validateString(body.path, { allowEmpty: false, maxLen: 1000 });
      const ref = validateString(body.ref, { allowEmpty: true, maxLen: 120 }) || undefined;
      if (!owner || !repo || !filePath) return invalidResult('github:read-file', 'owner-repo-path-required');
      return githubClient.readFile({ owner, repo, filePath, ref });
    },
    'github:list-commits': async (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('github:list-commits', 'payload-must-be-object');
      const owner = validateString(body.owner, { allowEmpty: false, maxLen: 120 });
      const repo = validateString(body.repo, { allowEmpty: false, maxLen: 120 });
      const perPage = validateInteger(body.perPage, { min: 1, max: 100, fallback: 20 });
      if (!owner || !repo) return invalidResult('github:list-commits', 'owner-and-repo-required');
      return githubClient.listCommits({ owner, repo, perPage });
    },
    'github:get-diff': async (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('github:get-diff', 'payload-must-be-object');
      const owner = validateString(body.owner, { allowEmpty: false, maxLen: 120 });
      const repo = validateString(body.repo, { allowEmpty: false, maxLen: 120 });
      const sha = validateString(body.sha, { allowEmpty: false, maxLen: 120 });
      if (!owner || !repo || !sha) return invalidResult('github:get-diff', 'owner-repo-sha-required');
      return githubClient.getCommitDiff({ owner, repo, sha });
    },

    'google:login-start': async () => googleClient.auth.initiateDeviceFlow(),
    'google:login-poll': async (_event, payload) => {
      const body = validatePlainObject(payload);
      const deviceCode = validateString(body?.deviceCode, { allowEmpty: false, maxLen: 500 });
      if (!deviceCode) return invalidResult('google:login-poll', 'device-code-required');
      return googleClient.auth.pollForToken(deviceCode);
    },
    'google:logout': async () => googleClient.auth.revokeAccess(),
    'google:status': () => googleClient.auth.getStatus(),
    'google:calendar-today': async () => googleClient.calendar.getTodaySchedule(),
    'google:gmail-unread': async (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const maxResults = validateInteger(body.maxResults, { min: 1, max: 50, fallback: 10 });
      const threads = await googleClient.gmail.getUnreadThreads(maxResults);
      const top = threads.slice(0, 5);
      const headers = await Promise.all(top.map((item) => googleClient.gmail.getMessageHeaders(item.id)));
      return {
        threads,
        headers,
      };
    },

    'server:get-auth-status': () => serverGetAuthStatus(),
    'server:clear-auth': () => serverClearAuth(),
    'server:verify-pairing': async (_event, payload) => {
      const auth = await permissions.authorize('server:verify-pairing');
      if (!auth.allowed) return denied('server:verify-pairing', auth.reason);
      const syncKey = validateString(payload?.syncKey, { allowEmpty: false, maxLen: 512 });
      if (!syncKey) return invalidResult('server:verify-pairing', 'sync-key-required');
      return serverVerifyPairing(syncKey);
    },
    'server:get-runtime-status': () => serverGetRuntimeStatus(),
    'server:set-permission-level': async (_event, payload) => {
      const auth = await permissions.authorize('server:set-permission-level');
      if (!auth.allowed) return denied('server:set-permission-level', auth.reason);
      const body = validatePlainObject(payload) || {};
      const level = validateString(body.level, { allowEmpty: false, maxLen: 20 }) || 'default';
      const fullControlConsent = Boolean(body.fullControlConsent);
      return serverSetPermissionLevel(level, fullControlConsent);
    },
    'server:kill-switch': async () => {
      const auth = await permissions.authorize('server:kill-switch');
      if (!auth.allowed) return denied('server:kill-switch', auth.reason);
      return serverKillSwitch();
    },
    'server:get-config': () => serverGetConfig(),
    'server:set-config': (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const runtimeMode = validateString(body.runtimeMode, { allowEmpty: true, maxLen: 64 }) || undefined;
      const remoteRuntimeApiUrl = validateString(body.remoteRuntimeApiUrl, { allowEmpty: true, maxLen: 500 }) || undefined;
      const remoteRuntimeWsUrl = validateString(body.remoteRuntimeWsUrl, { allowEmpty: true, maxLen: 500 }) || undefined;
      return serverSetConfig({ runtimeMode, remoteRuntimeApiUrl, remoteRuntimeWsUrl });
    },
    'local-server:list': () => ({ ok: true, servers: localServerList() }),
    'local-server:add': (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('local-server:add', 'payload-must-be-object');
      const label = validateString(body.label, { allowEmpty: false, maxLen: 120 });
      const baseUrl = validateString(body.baseUrl, { allowEmpty: false, maxLen: 500 });
      const apiType = validateString(body.apiType, { allowEmpty: false, maxLen: 40 }) || 'ollama';
      if (!label || !baseUrl) return invalidResult('local-server:add', 'label-and-base-url-required');
      return localServerAdd({ label, baseUrl, apiType, enabled: body.enabled !== false });
    },
    'local-server:update': (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('local-server:update', 'payload-must-be-object');
      const id = validateString(body.id, { allowEmpty: false, maxLen: 120 });
      if (!id) return invalidResult('local-server:update', 'id-required');
      return localServerUpdate(id, validatePlainObject(body.patch) || {});
    },
    'local-server:remove': (_event, payload) => {
      const body = validatePlainObject(payload);
      const id = validateString(body?.id, { allowEmpty: false, maxLen: 120 });
      if (!id) return invalidResult('local-server:remove', 'id-required');
      return localServerRemove(id);
    },
    'local-server:scan': async (_event, payload) => {
      const body = validatePlainObject(payload);
      const id = validateString(body?.id, { allowEmpty: false, maxLen: 120 });
      if (!id) return invalidResult('local-server:scan', 'id-required');
      return localServerScan(id);
    },
    'local-server:get-model-assignment': () => ({ ok: true, ...localServerGetAssignment() }),
    'local-server:set-model-assignment': (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      return localServerSetAssignment(body);
    },

    // ── MCP server management ──────────────────────────────────────────────
    'mcp:list-servers': () => {
      if (!mcpManager) return { ok: false, error: 'mcp-manager-unavailable' };
      return { ok: true, servers: mcpManager.listServers() };
    },

    'mcp:install-server': async (_event, payload) => {
      if (!mcpManager) return { ok: false, error: 'mcp-manager-unavailable' };
      const body = validatePlainObject(payload);
      const serverId = validateString(body?.serverId, { allowEmpty: false, maxLen: 60 });
      if (!serverId) return invalidResult('mcp:install-server', 'server-id-required');
      return mcpManager.installServer(serverId);
    },

    'mcp:uninstall-server': (_event, payload) => {
      if (!mcpManager) return { ok: false, error: 'mcp-manager-unavailable' };
      const body = validatePlainObject(payload);
      const serverId = validateString(body?.serverId, { allowEmpty: false, maxLen: 60 });
      if (!serverId) return invalidResult('mcp:uninstall-server', 'server-id-required');
      return mcpManager.uninstallServer(serverId);
    },

    'mcp:call-tool': async (_event, payload) => {
      if (!mcpManager || !mcpRouter) return { ok: false, error: 'mcp-unavailable' };
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('mcp:call-tool', 'payload-must-be-object');
      const toolName = validateString(body.toolName, { allowEmpty: false, maxLen: 120 });
      const params = validatePlainObject(body.params) || {};
      if (!toolName) return invalidResult('mcp:call-tool', 'tool-name-required');
      securityAudit({ action: 'mcp:call-tool', target: toolName });
      return mcpRouter.route(toolName, params);
    },

    'mcp:get-server-status': (_event, payload) => {
      if (!mcpManager) return { ok: false, error: 'mcp-manager-unavailable' };
      const body = validatePlainObject(payload);
      const serverId = validateString(body?.serverId, { allowEmpty: false, maxLen: 60 });
      if (!serverId) return invalidResult('mcp:get-server-status', 'server-id-required');
      return { ok: true, status: mcpManager.getServerStatus(serverId) };
    },

    'mcp:google-auth-status': () => {
      return googleClient.auth.getStatus();
    },

    'mcp:google-start-auth': async () => {
      return googleClient.auth.initiateDeviceFlow();
    },

    'mcp:google-poll-auth': async (_event, payload) => {
      const body = validatePlainObject(payload);
      const deviceCode = validateString(body?.deviceCode, { allowEmpty: false, maxLen: 500 });
      if (!deviceCode) return invalidResult('mcp:google-poll-auth', 'device-code-required');
      return googleClient.auth.pollForToken(deviceCode);
    },

    'mcp:set-api-key': (_event, payload) => {
      if (!mcpManager) return { ok: false, error: 'mcp-manager-unavailable' };
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('mcp:set-api-key', 'payload-must-be-object');
      const serverId = validateString(body.serverId, { allowEmpty: false, maxLen: 60 });
      const value = validateString(body.value, { allowEmpty: false, maxLen: 5000 });
      if (!serverId || !value) return invalidResult('mcp:set-api-key', 'server-id-and-value-required');
      securityAudit({ action: 'mcp:set-api-key', target: serverId });
      return mcpManager.setApiKey(serverId, value);
    },

    'mcp:list-tools': () => {
      if (!mcpRouter) return { ok: false, error: 'mcp-unavailable' };
      return { ok: true, tools: mcpRouter.listTools() };
    },
  };

  registerIpcHandlers(ipcMain, handlers);
}

module.exports = {
  createMainIpcHandlers,
};
