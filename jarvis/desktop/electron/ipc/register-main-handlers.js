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
const {
  setEngineMode,
  getJarvisModelConfig,
  setJarvisModelConfig,
  getRuntimeConfig,
  VALID_ENGINE_MODES,
} = require('../../runtime-config');
const {
  FREE_MODEL_CATALOG,
  getFreeModelsForPlan,
  pickBestFreeModel,
} = require('../ai/free-model-catalog');
const { createByokKeyStore, normalizeProvider } = require('../ai/byok-key-store');

const byokKeyStore = createByokKeyStore();

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
    getMapConfig,
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
    permissions,
    securityAudit,
    mcpManager,
    mcpRouter,
    // ── new: wizard + map fly-to ──────────────────────────────────────────────
    onSetupComplete,
    getSubscriptionStatus,
    onMapFlyTo,
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

    'map:get-config': async () => {
      const config = typeof getMapConfig === 'function' ? (getMapConfig() || {}) : {};
      return {
        accessToken: validateString(config.accessToken, { allowEmpty: true, maxLen: 4096 }) || '',
      };
    },

    // ── Map fly-to (triggered by voice pipeline map trigger) ─────────────────
    'map:fly-to': (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const lat = Number(body.lat) || 0;
      const lon = Number(body.lon) || 0;
      const label = validateString(body.label, { allowEmpty: true, maxLen: 200 }) || '';
      if (typeof onMapFlyTo === 'function') {
        onMapFlyTo({ lat, lon, label });
      }
      const win = getMainWindow?.();
      if (win && !win.isDestroyed()) {
        win.webContents.send('map:fly-to', { lat, lon, label });
      }
      return { ok: true };
    },

    // ── Setup Wizard IPC ─────────────────────────────────────────────────────
    'setup:complete': async (_event, payload) => {
      const body = validatePlainObject(payload);
      if (!body) return invalidResult('setup:complete', 'payload-must-be-object');
      const requestedEngineMode = validateString(body.engine_mode, { allowEmpty: false, maxLen: 20 });
      const engine_mode = requestedEngineMode === 'cloud' ? 'byok-cloud' : requestedEngineMode;
      if (!engine_mode || !VALID_ENGINE_MODES.includes(engine_mode)) {
        return invalidResult('setup:complete', 'invalid-engine-mode');
      }
      const hardware_profile = validateString(body.hardware_profile, { allowEmpty: true, maxLen: 20 }) || 'standard';
      const language = validateString(body.language, { allowEmpty: true, maxLen: 10 }) || 'en';
      const stt_model = validateString(body.stt_model, { allowEmpty: true, maxLen: 40 }) || 'base';
      const llm_model = validateString(body.llm_model, { allowEmpty: true, maxLen: 80 }) || 'gemma3:4b';
      const tts_model = validateString(body.tts_model, { allowEmpty: true, maxLen: 40 }) || 'kokoro';
      const llm_target = validateString(body.llm_target, { allowEmpty: true, maxLen: 30 }) || undefined;
      const local = validatePlainObject(body.local) || undefined;
      const cloud = validatePlainObject(body.cloud) || undefined;
      const server = validatePlainObject(body.server) || undefined;
      try {
        const config = setJarvisModelConfig({
          engine_mode,
          llm_target,
          hardware_profile,
          language,
          stt_model,
          llm_model,
          tts_model,
          local,
          cloud,
          server,
        });
        if (typeof onSetupComplete === 'function') {
          await onSetupComplete(config);
        }
        return { ok: true, config };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    },

    'setup:get-subscription-status': async () => {
      if (typeof getSubscriptionStatus === 'function') {
        return getSubscriptionStatus();
      }
      return { ok: true, status: 'unknown' };
    },

    'setup:get-recommended-config': () => {
      const config = getRuntimeConfig();
      return { ok: true, config };
    },

    'secure:set-api-key': async (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const provider = normalizeProvider(validateString(body.provider, { allowEmpty: false, maxLen: 40 }) || '');
      const value = validateString(body.value, { allowEmpty: false, maxLen: 8192 }) || '';
      if (!provider || !value) return invalidResult('secure:set-api-key', 'provider-and-value-required');
      securityAudit({ action: 'secure:set-api-key', target: provider });
      return byokKeyStore.set(provider, value);
    },

    'secure:get-api-key': async (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const provider = normalizeProvider(validateString(body.provider, { allowEmpty: false, maxLen: 40 }) || '');
      if (!provider) return invalidResult('secure:get-api-key', 'provider-required');
      const value = await byokKeyStore.get(provider);
      return { ok: true, value: value || null };
    },

    'secure:clear-api-key': async (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const provider = normalizeProvider(validateString(body.provider, { allowEmpty: false, maxLen: 40 }) || '');
      if (!provider) return invalidResult('secure:clear-api-key', 'provider-required');
      securityAudit({ action: 'secure:clear-api-key', target: provider });
      return byokKeyStore.clear(provider);
    },

    // ── Config IPC (engine mode + model config) ──────────────────────────────
    'config:get-engine-mode': () => {
      const config = getJarvisModelConfig();
      return { ok: true, engine_mode: config.engine_mode };
    },

    'config:set-engine-mode': async (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const requestedMode = validateString(body.mode, { allowEmpty: false, maxLen: 20 });
      const mode = requestedMode === 'cloud' ? 'byok-cloud' : requestedMode;
      if (!mode || !VALID_ENGINE_MODES.includes(mode)) {
        return invalidResult('config:set-engine-mode', 'invalid-engine-mode');
      }
      try {
        setEngineMode(mode);
        return { ok: true, engine_mode: mode };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    },

    'config:get-model-config': () => {
      return { ok: true, config: getJarvisModelConfig() };
    },

    // ── Free model catalog ────────────────────────────────────────────────────
    'config:get-free-model-catalog': (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const plan = validateString(body.plan, { allowEmpty: true, maxLen: 20 }) || '';
      const models = plan ? getFreeModelsForPlan(plan) : FREE_MODEL_CATALOG;
      return { ok: true, models };
    },

    'config:pick-best-free-model': (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const profile = validateString(body.profile, { allowEmpty: true, maxLen: 20 }) || 'chat';
      const plan = validateString(body.plan, { allowEmpty: false, maxLen: 20 }) || 'pro';
      const best = pickBestFreeModel(profile, plan);
      return { ok: true, model: best };
    },

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
          streamId: validateString(body.streamId, { allowEmpty: true, maxLen: 120 }) || '',
        }, {
          onChunk: (chunkEvent) => {
            try {
              _event.sender.send('jarvis-ai-route-event', {
                type: 'ai_stream_token',
                ...(chunkEvent && typeof chunkEvent === 'object' ? chunkEvent : {}),
              });
            } catch {
              // ignore detached renderers
            }
          },
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

    // ── Clipboard Monitoring ─────────────────────────────────────────────────
    'clipboard:get-status': () => {
      const { watcher } = require('../clipboard/watcher');
      return { ok: true, ...watcher.getStatus() };
    },

    'clipboard:enable': async (_event) => {
      const auth = await permissions.authorize('clipboard:enable');
      if (!auth.allowed) return denied('clipboard:enable', auth.reason);
      const { watcher } = require('../clipboard/watcher');
      watcher.enable();
      return { ok: true, ...watcher.getStatus() };
    },

    'clipboard:disable': () => {
      const { watcher } = require('../clipboard/watcher');
      watcher.disable();
      return { ok: true, ...watcher.getStatus() };
    },

    'clipboard:get-last': () => {
      const { watcher } = require('../clipboard/watcher');
      if (!watcher.getStatus().enabled) return { ok: false, error: 'clipboard-watcher-disabled' };
      return { ok: true, entry: watcher.getLast() };
    },

    'clipboard:get-history': () => {
      const { watcher } = require('../clipboard/watcher');
      if (!watcher.getStatus().enabled) return { ok: false, error: 'clipboard-watcher-disabled' };
      return { ok: true, history: watcher.getHistory() };
    },

    // ── Drag-and-drop File Indexing ──────────────────────────────────────────
    'index:drop-files': async (_event, payload) => {
      const auth = await permissions.authorize('index:drop-files');
      if (!auth.allowed) return denied('index:drop-files', auth.reason);
      const body = validatePlainObject(payload) || {};
      const paths = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === 'string' && p.trim()) : [];
      if (paths.length === 0) return { ok: false, error: 'no-paths-provided' };
      const { dropHandler } = require('../indexing/drop-handler');
      securityAudit({ action: 'index:drop-files', target: `${paths.length} path(s)` });
      const result = await dropHandler.addDrop(paths);
      return { ok: true, ...result };
    },

    'index:get-jobs': () => {
      const { dropHandler } = require('../indexing/drop-handler');
      return { ok: true, jobs: dropHandler.getJobs() };
    },

    'index:get-job': (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const jobId = validateString(body.jobId, { allowEmpty: false, maxLen: 80 });
      if (!jobId) return invalidResult('index:get-job', 'job-id-required');
      const { dropHandler } = require('../indexing/drop-handler');
      const job = dropHandler.getJob(jobId);
      return job ? { ok: true, job } : { ok: false, error: 'job-not-found' };
    },

    'index:cancel-job': (_event, payload) => {
      const body = validatePlainObject(payload) || {};
      const jobId = validateString(body.jobId, { allowEmpty: false, maxLen: 80 });
      if (!jobId) return invalidResult('index:cancel-job', 'job-id-required');
      const { dropHandler } = require('../indexing/drop-handler');
      const cancelled = dropHandler.cancelJob(jobId);
      return { ok: true, cancelled };
    },
  };

  // ── Wire clipboard & indexing events → renderer ──────────────────────────
  (function wireFeatureEvents() {
    let clipboardWired = false;
    let indexWired = false;

    function tryWireClipboard() {
      if (clipboardWired) return;
      try {
        const { watcher } = require('../clipboard/watcher');
        watcher.on('change', (entry) => {
          const win = getMainWindow?.();
          if (win) win.webContents.send('clipboard:change', entry);
        });
        watcher.on('status', (status) => {
          const win = getMainWindow?.();
          if (win) win.webContents.send('clipboard:status', status);
        });
        watcher.init();
        clipboardWired = true;
      } catch {
        // clipboard module not available in this environment
      }
    }

    function tryWireIndexing() {
      if (indexWired) return;
      try {
        const { dropHandler } = require('../indexing/drop-handler');
        dropHandler.on('job-update', (job) => {
          const win = getMainWindow?.();
          if (win) win.webContents.send('index:job-update', job);
        });
        indexWired = true;
      } catch {
        // indexing module not available in this environment
      }
    }

    tryWireClipboard();
    tryWireIndexing();
  })();

  registerIpcHandlers(ipcMain, handlers);
}

module.exports = {
  createMainIpcHandlers,
};
