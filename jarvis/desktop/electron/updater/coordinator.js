'use strict';

const fs = require('fs');
const path = require('path');

const VALID_CHANNELS = new Set(['stable', 'beta', 'nightly']);
const DEFAULT_DEFER_MINOR_PATCH_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DEFER_MAJOR_SECURITY_MS = 6 * 60 * 60 * 1000;
const FEED_SELF_TEST_TIMEOUT_MS = 8_000;
const PRIVATE_TOKEN_WAIT_TIMEOUT_MS = 4_000;
const PRIVATE_TOKEN_STORE_FILE = 'updater-github-token.bin';
const MANIFEST_FETCH_TIMEOUT_MS = 6_000;
const DEFAULT_UPDATES_MANIFEST_URL = 'https://updates.assistantx.pl/versions.json';

function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function sanitizeText(value, maxLen = 1500) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\uFFFD/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function toLines(value) {
  return sanitizeText(value, 10_000)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseVersionParts(version) {
  const match = String(version || '').match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function inferSeverity(currentVersion, nextVersion, metadata = {}) {
  const explicit = String(metadata?.severity || '').toLowerCase();
  if (explicit === 'security' || explicit === 'major' || explicit === 'minor' || explicit === 'patch') {
    return explicit;
  }
  const current = parseVersionParts(currentVersion);
  const next = parseVersionParts(nextVersion);
  if (!current || !next) return 'minor';
  if (next.major > current.major) return 'major';
  if (next.minor > current.minor) return 'minor';
  if (next.patch > current.patch) return 'patch';
  return 'minor';
}

function hashString(input) {
  const value = String(input || '');
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeHighlights(text, maxCount = 6) {
  const highlights = [];
  for (const line of toLines(text)) {
    const normalized = line.replace(/^[-*•\d.)\s]+/, '').trim();
    if (!normalized) continue;
    highlights.push(normalized.slice(0, 180));
    if (highlights.length >= maxCount) break;
  }
  return highlights;
}

function resolveChannel(input) {
  const value = String(input || 'stable').toLowerCase();
  return VALID_CHANNELS.has(value) ? value : 'stable';
}

function withChannel(baseUrl, channel) {
  const normalizedBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalizedBase) return '';
  if (/\/(stable|beta|nightly)$/i.test(normalizedBase)) {
    return normalizedBase.replace(/\/(stable|beta|nightly)$/i, `/${channel}`);
  }
  return `${normalizedBase}/${channel}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createOfflineError(message = 'network-offline') {
  const error = new Error(message);
  error.code = 'ERR_NETWORK_OFFLINE';
  return error;
}

function createTimeoutError(message = 'network-timeout') {
  const error = new Error(message);
  error.code = 'ETIMEDOUT';
  return error;
}

class UpdateCoordinator {
  constructor({ app, startupDiagnostics, telemetryBus, onState, onHealth }) {
    this.app = app;
    this.startupDiagnostics = startupDiagnostics;
    this.telemetryBus = telemetryBus;
    this.onState = typeof onState === 'function' ? onState : () => {};
    this.onHealth = typeof onHealth === 'function' ? onHealth : () => {};

    this.autoUpdater = null;
    this.publishConfig = null;
    this.launchId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.deferStorePath = path.join(this.app.getPath('userData'), 'updater-defer-state.json');
    this.deferState = this.readDeferState();
    this.manifestCache = null;
    this.manifestCacheTs = 0;
    this.manifestDesktopFeedUrl = null;

    this.state = {
      status: 'idle',
      detail: 'Waiting to check for updates.',
      downloaded: false,
      version: null,
      releaseNotes: {
        source: 'none',
        highlights: [],
        details: '',
        markdown: '',
        hasNotes: false,
      },
      policy: {
        enabled: false,
        applied: false,
        reason: null,
      },
      updateAvailable: false,
      channel: this.getChannel(),
      feedUrl: null,
      diagnostics: null,
      deferred: null,
      lastCheckedAt: null,
      requiresTokenSetup: false,
      auth: {
        token: {
          required: false,
          available: false,
          source: 'none',
          error: null,
        },
      },
    };

    this.privateTokenPath = path.join(this.app.getPath('userData'), PRIVATE_TOKEN_STORE_FILE);
    this.privateTokenReady = Promise.resolve({
      available: false,
      source: 'none',
      error: null,
      required: false,
      encryptionAvailable: false,
    });
  }

  log(event, payload = {}) {
    try {
      console.info(`[updater] ${event}`, JSON.stringify(payload));
    } catch {
      console.info(`[updater] ${event}`);
    }
  }

  getState() {
    return { ...this.state };
  }

  emitState(status, detail, extra = {}) {
    this.state = {
      ...this.state,
      status,
      detail,
      ...extra,
    };
    this.onState(this.state);
  }

  readDeferState() {
    try {
      if (!fs.existsSync(this.deferStorePath)) return {};
      const raw = fs.readFileSync(this.deferStorePath, 'utf8');
      const parsed = safeJsonParse(raw, {});
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  persistDeferState(next) {
    this.deferState = { ...next };
    try {
      fs.writeFileSync(this.deferStorePath, JSON.stringify(this.deferState, null, 2), 'utf8');
    } catch (error) {
      this.log('defer-state:write-failed', { message: String(error?.message || error) });
    }
  }

  getChannel() {
    return resolveChannel(process.env.JARVIS_UPDATER_CHANNEL || 'stable');
  }

  getPolicyEnabled() {
    return String(process.env.JARVIS_UPDATER_POLICY_ENABLED || '').toLowerCase() === 'true';
  }

  getUpdateSource() {
    return 'manifest';
  }

  getManifestUrl() {
    return String(process.env.JARVIS_UPDATE_MANIFEST_URL || DEFAULT_UPDATES_MANIFEST_URL).trim();
  }

  getManifestAllowedHosts() {
    const configured = String(process.env.JARVIS_UPDATES_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (configured.length > 0) return new Set(configured);
    return new Set([
      'updates.assistantx.pl',
      'assistantx.pl',
      'github.com',
      'objects.githubusercontent.com',
      'release-assets.githubusercontent.com',
    ]);
  }

  getElectronNet() {
    try {
      const { net } = require('electron');
      return net || null;
    } catch {
      return null;
    }
  }

  isOffline() {
    const electronNet = this.getElectronNet();
    return typeof electronNet?.isOnline === 'function' ? !electronNet.isOnline() : false;
  }

  async fetchWithNetworkStack(url, init = {}, timeoutMs = 0) {
    const electronNet = this.getElectronNet();
    const fetchImpl = typeof electronNet?.fetch === 'function'
      ? electronNet.fetch.bind(electronNet)
      : globalThis.fetch?.bind(globalThis);

    if (typeof fetchImpl !== 'function') {
      throw new Error('fetch-unavailable');
    }

    const controller = new AbortController();
    const originalSignal = init?.signal;
    let timeoutHandle = null;
    let removeAbortListener = null;

    if (originalSignal) {
      if (originalSignal.aborted) {
        controller.abort(originalSignal.reason);
      } else {
        const onAbort = () => controller.abort(originalSignal.reason);
        originalSignal.addEventListener('abort', onAbort, { once: true });
        removeAbortListener = () => originalSignal.removeEventListener('abort', onAbort);
      }
    }

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        controller.abort(createTimeoutError());
      }, timeoutMs);
    }

    try {
      return await fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted && (error?.name === 'AbortError' || /abort/i.test(String(error?.message || '')))) {
        const reason = controller.signal.reason;
        if (reason instanceof Error) throw reason;
      }
      throw error;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (removeAbortListener) removeAbortListener();
    }
  }

  isAllowedHttpsUrl(rawUrl) {
    try {
      const url = new URL(String(rawUrl || '').trim());
      if (url.protocol !== 'https:') return false;
      return this.getManifestAllowedHosts().has(url.hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  resolveManifestPlatformKey() {
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'darwin') return 'mac';
    if (process.platform === 'linux') return 'linux';
    return null;
  }

  resolveManifestChannelKey() {
    const channel = this.getChannel();
    return channel === 'beta' ? 'beta' : 'stable';
  }

  async fetchUpdatesManifest() {
    if (this.getUpdateSource() !== 'manifest') return null;
    const now = Date.now();
    if (this.manifestCache && (now - this.manifestCacheTs) < 60_000) {
      return this.manifestCache;
    }

    const manifestUrl = this.getManifestUrl();
    if (!this.isAllowedHttpsUrl(manifestUrl)) {
      throw new Error('manifest-url-not-allowed');
    }
    if (this.isOffline()) {
      throw createOfflineError();
    }

    const response = await this.fetchWithNetworkStack(manifestUrl, {
      cache: 'no-store',
      redirect: 'follow',
      headers: { Accept: 'application/json,text/plain,*/*' },
    }, MANIFEST_FETCH_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`manifest-fetch-failed:${response.status}`);
    }
    const parsed = await response.json();
    this.manifestCache = parsed && typeof parsed === 'object' ? parsed : null;
    this.manifestCacheTs = now;
    return this.manifestCache;
  }

  resolveManifestChannelContainer(manifest) {
    if (!manifest || typeof manifest !== 'object') return null;
    const channel = this.resolveManifestChannelKey();
    if (manifest.channels && typeof manifest.channels === 'object' && manifest.channels[channel]) {
      return manifest.channels[channel];
    }
    if (manifest[channel] && typeof manifest[channel] === 'object') {
      return manifest[channel];
    }
    return manifest;
  }

  async getManifestPlatformEntry() {
    const platformKey = this.resolveManifestPlatformKey();
    if (!platformKey) return null;
    const manifest = await this.fetchUpdatesManifest();
    if (!manifest) return null;
    const channelContainer = this.resolveManifestChannelContainer(manifest);
    if (!channelContainer || typeof channelContainer !== 'object') return null;
    const platforms = (channelContainer.platforms && typeof channelContainer.platforms === 'object')
      ? channelContainer.platforms
      : null;
    const entry = platforms?.[platformKey] || channelContainer[platformKey];
    return entry && typeof entry === 'object' ? entry : null;
  }

  async applyManifestGenericFeed(autoUpdater) {
    if (this.getUpdateSource() !== 'manifest' || !autoUpdater) return null;
    let entry;
    try {
      entry = await this.getManifestPlatformEntry();
    } catch (err) {
      this.log('manifest-feed-fetch-skipped', { error: String(err?.message || err) });
      return null;
    }
    if (!entry) return null;
    const desktop = entry.desktop && typeof entry.desktop === 'object' ? entry.desktop : {};
    let feedUrl = String(desktop.feedUrl || '').trim();

    if (!feedUrl) {
      const directUrl = String(entry.url || entry.path || '').trim();
      if (/latest\.yml$/i.test(directUrl)) {
        feedUrl = directUrl.replace(/\/latest\.yml$/i, '');
      } else if (directUrl && !/\.(exe|dmg|appimage|apk)$/i.test(directUrl)) {
        feedUrl = directUrl.replace(/\/+$/, '');
      }
    }

    if (!feedUrl || !this.isAllowedHttpsUrl(feedUrl)) return null;
    this.manifestDesktopFeedUrl = feedUrl;
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
    return feedUrl;
  }

  getPublishConfig() {
    if (this.publishConfig) return this.publishConfig;
    try {
      const pkg = require('../../package.json');
      const publish = Array.isArray(pkg?.build?.publish) ? pkg.build.publish : [];
      const first = publish[0] || {};
      const provider = String(first.provider || 'unknown');
      const sourceUrl = typeof first.url === 'string' ? first.url : '';
      const channel = this.getChannel();
      const url = withChannel(sourceUrl, channel);
      this.publishConfig = {
        provider,
        sourceUrl,
        url,
        channel,
        owner: typeof first.owner === 'string' ? first.owner : '',
        repo: typeof first.repo === 'string' ? first.repo : '',
        private: first.private === true,
      };
    } catch {
      this.publishConfig = {
        provider: 'unknown',
        sourceUrl: '',
        url: '',
        channel: this.getChannel(),
        owner: '',
        repo: '',
        private: false,
      };
    }
    return this.publishConfig;
  }

  getFeedMetadataUrl() {
    if (this.manifestDesktopFeedUrl) {
      return `${this.manifestDesktopFeedUrl.replace(/\/+$/, '')}/latest.yml`;
    }
    const publish = this.getPublishConfig();
    if (publish.provider === 'generic' && publish.url) {
      return `${publish.url.replace(/\/+$/, '')}/latest.yml`;
    }
    return null;
  }

  getReleaseNotesUrl() {
    if (this.manifestDesktopFeedUrl) {
      return `${this.manifestDesktopFeedUrl.replace(/\/+$/, '')}/release-notes.json`;
    }
    const publish = this.getPublishConfig();
    if (publish.provider === 'generic' && publish.url) {
      return `${publish.url.replace(/\/+$/, '')}/release-notes.json`;
    }
    return null;
  }

  buildContext() {
    const publish = this.getPublishConfig();
    return {
      appVersion: this.app.getVersion(),
      packaged: this.app.isPackaged,
      arch: process.arch,
      platform: process.platform,
      provider: publish.provider,
      updateSource: this.getUpdateSource(),
      manifestUrl: this.getManifestUrl(),
      feedUrl: publish.url || null,
      sourceFeedUrl: publish.sourceUrl || null,
      channel: publish.channel,
      owner: publish.owner || null,
      repo: publish.repo || null,
      networkTransport: typeof this.getElectronNet()?.fetch === 'function' ? 'electron.net.fetch' : 'global.fetch',
      metadataUrl: this.getFeedMetadataUrl(),
      releaseNotesUrl: this.getReleaseNotesUrl(),
    };
  }

  toErrorMetadata(error) {
    const message = String(error?.message || error || 'Unknown updater error');
    const code = typeof error?.code === 'string' || typeof error?.code === 'number'
      ? String(error.code)
      : null;
    const statusCodeRaw = error?.statusCode ?? error?.status ?? error?.response?.status;
    const statusCode = Number.isFinite(Number(statusCodeRaw)) ? Number(statusCodeRaw) : null;
    const lower = `${message} ${code || ''}`.toLowerCase();
    return {
      message,
      code,
      statusCode,
      isNetwork: /network|fetch|econnrefused|enotfound|ehostunreach|timeout|eai_again|socket hang up|etimedout|err_name_not_resolved|name_not_resolved|dns/.test(lower),
      isAuth: /401|403|unauthorized|forbidden|bad credentials|token|authentication/.test(lower) || statusCode === 401 || statusCode === 403,
      isNoRelease: /no published versions? on github|no published releases? on github/.test(lower),
      isMetadataIssue: /latest\.yml|yaml|cannot parse|invalid update info|blockmap|sha512|checksum/.test(lower),
    };
  }

  classifyFailure(errorMeta) {
    if (errorMeta.isNoRelease) {
      return {
        status: 'up-to-date',
        health: 'healthy',
        severity: 'info',
        reason: 'no-published-release',
        detail: 'No published update release was found yet.',
      };
    }
    if (errorMeta.isNetwork) {
      return {
        status: 'unavailable',
        health: 'degraded',
        severity: 'warn',
        reason: 'network-unavailable',
        detail: 'Update check is temporarily unavailable (network).',
      };
    }
    if (errorMeta.isAuth) {
      return {
        status: 'error',
        health: 'degraded',
        severity: 'warn',
        reason: 'feed-auth-or-permission',
        detail: 'Update feed authentication/permission failed. Verify feed visibility and credentials.',
      };
    }
    if (errorMeta.statusCode === 404) {
      // Treat a missing manifest as a soft "unavailable" — surface it in settings,
      // but don't trip the splash error pill. This prevents a 404'd update feed
      // (e.g. private repo, missing latest.yml) from blocking startup UX.
      return {
        status: 'unavailable',
        health: 'degraded',
        severity: 'warn',
        reason: 'feed-not-found-or-private',
        detail: 'Update check unavailable (feed not published yet).',
      };
    }
    if (errorMeta.isMetadataIssue || errorMeta.statusCode === 404) {
      return {
        status: 'error',
        health: 'unavailable',
        severity: 'error',
        reason: 'feed-metadata-invalid-or-missing',
        detail: 'Update metadata is missing or invalid (latest.yml / artifact mismatch).',
      };
    }
    return {
      status: 'error',
      health: 'unavailable',
      severity: 'error',
      reason: 'updater-error',
      detail: `Update error: ${errorMeta.message}`,
    };
  }

  classifyFeedSelfTestFailure({ statusCode = null, message = '', code = null } = {}) {
    const lower = `${message} ${code || ''}`.toLowerCase();
    if (statusCode === 404) {
      return {
        health: 'unavailable',
        severity: 'error',
        reason: 'feed-metadata-missing',
        detail: 'Updater feed is reachable but latest.yml is missing (404).',
      };
    }
    if (statusCode === 401 || statusCode === 403) {
      return {
        health: 'degraded',
        severity: 'warn',
        reason: 'feed-auth-or-permission',
        detail: 'Updater feed returned an authentication/permission error.',
      };
    }
    if (statusCode !== null && statusCode >= 400) {
      return {
        health: 'unavailable',
        severity: 'error',
        reason: 'feed-http-error',
        detail: `Updater feed returned HTTP ${statusCode}.`,
      };
    }
    if (/err_name_not_resolved|name_not_resolved|enotfound|dns|eai_again/.test(lower)) {
      return {
        health: 'degraded',
        severity: 'warn',
        reason: 'feed-dns-failure',
        detail: 'Updater feed DNS lookup failed.',
      };
    }
    if (/offline|network|fetch|econnrefused|ehostunreach|socket hang up|etimedout|timeout/.test(lower)) {
      return {
        health: 'degraded',
        severity: 'warn',
        reason: 'feed-offline',
        detail: 'Updater feed is temporarily unreachable (offline/network).',
      };
    }
    if (/yaml|latest\.yml|invalid update info|cannot parse/.test(lower)) {
      return {
        health: 'unavailable',
        severity: 'error',
        reason: 'feed-invalid-yaml',
        detail: 'Updater metadata is invalid (latest.yml parsing/format error).',
      };
    }
    return {
      health: 'unavailable',
      severity: 'error',
      reason: 'feed-self-test-failed',
      detail: `Updater feed self-test failed: ${message || 'Unknown error'}`,
    };
  }

  async runFeedSelfTest() {
    const publish = this.getPublishConfig();
    const context = {
      ...this.buildContext(),
      phase: 'startup-self-test',
    };

    if (!this.app.isPackaged) {
      this.startupDiagnostics.pushEvent('updater', 'info', 'Updater feed self-test skipped in development mode.', context);
      this.log('feed-self-test:skipped-dev', context);
      return;
    }

    if (this.getUpdateSource() === 'manifest') {
      try {
        const updater = this.getAutoUpdater();
        await this.applyManifestGenericFeed(updater);
      } catch (error) {
        this.log('manifest-feed:override-failed', {
          message: String(error?.message || error || 'manifest override failed'),
        });
      }
    }

    if (publish.provider !== 'generic' && !this.manifestDesktopFeedUrl) {
      // GitHub provider self-test: electron-updater handles feed fetching with
      // authenticated GitHub API calls. We skip the HTTP self-test here and
      // mark the updater healthy so the startup check can proceed normally.
      const detail = `Updater provider is '${publish.provider}'. Feed self-test deferred to electron-updater.`;
      this.startupDiagnostics.setComponent('updater', 'healthy', detail);
      this.startupDiagnostics.pushEvent('updater', 'info', 'Updater feed self-test skipped for non-generic provider.', {
        ...context,
        classification: 'feed-provider-non-generic',
        detail,
      });
      this.telemetryBus.publish('startup.healthy');
      this.onHealth();
      this.log('feed-self-test:skipped-non-generic', context);
      return;
    }

    const metadataUrl = this.getFeedMetadataUrl();
    if (!metadataUrl) {
      const detail = 'Updater feed URL is empty or invalid.';
      this.startupDiagnostics.setComponent('updater', 'unavailable', detail);
      this.startupDiagnostics.pushEvent('updater', 'error', 'Updater feed self-test failed.', {
        ...context,
        classification: 'feed-url-missing',
        detail,
      });
      this.telemetryBus.publish('startup.unavailable');
      this.onHealth();
      this.log('feed-self-test:url-missing', context);
      return;
    }

    if (this.isOffline()) {
      const classification = this.classifyFeedSelfTestFailure({ message: 'offline' });
      this.startupDiagnostics.setComponent('updater', classification.health, classification.detail);
      this.startupDiagnostics.pushEvent('updater', classification.severity, 'Updater feed self-test skipped while offline.', {
        ...context,
        metadataUrl,
        classification: classification.reason,
      });
      this.telemetryBus.publish('startup.degraded');
      this.onHealth();
      this.log('feed-self-test:skipped-offline', {
        ...context,
        metadataUrl,
        classification: classification.reason,
      });
      return;
    }

    this.startupDiagnostics.pushEvent('updater', 'info', 'Updater feed self-test started.', {
      ...context,
      metadataUrl,
    });

    try {
      const response = await this.fetchWithNetworkStack(metadataUrl, {
        cache: 'no-store',
        redirect: 'follow',
        headers: { Accept: 'application/octet-stream,text/yaml,text/plain,*/*' },
      }, FEED_SELF_TEST_TIMEOUT_MS);
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const raw = await response.text();
      const hasVersion = /^\s*version\s*:/m.test(raw);
      const hasArtifactRef = /^\s*(path|url)\s*:/m.test(raw) || /^\s*files\s*:/m.test(raw);

      if (!response.ok) {
        const classification = this.classifyFeedSelfTestFailure({
          statusCode: response.status,
          message: `HTTP ${response.status} ${response.statusText}`.trim(),
        });
        this.startupDiagnostics.setComponent('updater', classification.health, classification.detail);
        this.startupDiagnostics.pushEvent('updater', classification.severity, 'Updater feed self-test failed.', {
          ...context,
          metadataUrl,
          statusCode: response.status,
          statusText: response.statusText,
          classification: classification.reason,
        });
        this.telemetryBus.publish(classification.health === 'degraded' ? 'startup.degraded' : 'startup.unavailable');
        this.onHealth();
        return;
      }

      if (!raw.trim() || !hasVersion || !hasArtifactRef) {
        const classification = this.classifyFeedSelfTestFailure({ message: 'Invalid latest.yml payload.' });
        this.startupDiagnostics.setComponent('updater', classification.health, classification.detail);
        this.startupDiagnostics.pushEvent('updater', classification.severity, 'Updater feed self-test failed.', {
          ...context,
          metadataUrl,
          classification: classification.reason,
          contentType,
        });
        this.telemetryBus.publish('startup.unavailable');
        this.onHealth();
        return;
      }

      const allowedContentType = !contentType
        || contentType.includes('yaml')
        || contentType.includes('text/plain')
        || contentType.includes('application/octet-stream');
      const health = allowedContentType ? 'healthy' : 'degraded';
      const detail = allowedContentType
        ? 'Updater feed self-test passed.'
        : `Updater metadata loaded but returned unexpected content-type: ${contentType}`;

      this.startupDiagnostics.setComponent('updater', health, detail);
      this.startupDiagnostics.pushEvent('updater', allowedContentType ? 'info' : 'warn', 'Updater feed self-test passed.', {
        ...context,
        metadataUrl,
        contentType: contentType || null,
        bytes: raw.length,
      });
      this.telemetryBus.publish(health === 'healthy' ? 'startup.healthy' : 'startup.degraded');
      this.onHealth();
      this.log('feed-self-test:passed', {
        ...context,
        metadataUrl,
        contentType: contentType || null,
        bytes: raw.length,
        health,
      });
    } catch (error) {
      const classification = this.classifyFeedSelfTestFailure({
        message: String(error?.message || error || 'Unknown feed self-test error'),
        code: error?.code || error?.cause?.code || null,
      });
      this.startupDiagnostics.setComponent('updater', classification.health, classification.detail);
      this.startupDiagnostics.pushEvent('updater', classification.severity, 'Updater feed self-test failed.', {
        ...context,
        metadataUrl,
        errorMessage: String(error?.message || error || 'Unknown feed self-test error'),
        errorCode: error?.code || error?.cause?.code || null,
        classification: classification.reason,
      });
      this.telemetryBus.publish(classification.health === 'degraded' ? 'startup.degraded' : 'startup.unavailable');
      this.onHealth();
      this.log('feed-self-test:failed-exception', {
        ...context,
        metadataUrl,
        errorMessage: String(error?.message || error || 'Unknown feed self-test error'),
        errorCode: error?.code || error?.cause?.code || null,
        classification: classification.reason,
      });
    }
  }

  getSafeStorage() {
    try {
      const { safeStorage } = require('electron');
      return safeStorage || null;
    } catch {
      return null;
    }
  }

  isPrivateGithubProvider() {
    if (this.getUpdateSource() === 'manifest') return false;
    const publish = this.getPublishConfig();
    return publish.provider === 'github' && publish.private === true;
  }

  getEnvPrivateToken() {
    return String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  }

  buildPrivateGithubFeedOptions(token) {
    const publish = this.getPublishConfig();
    return {
      provider: 'github',
      owner: publish.owner,
      repo: publish.repo,
      private: true,
      token,
    };
  }

  applyPrivateGithubToken(autoUpdater, token) {
    if (!autoUpdater || !this.isPrivateGithubProvider() || !token) return;
    autoUpdater.setFeedURL(this.buildPrivateGithubFeedOptions(token));
    autoUpdater.requestHeaders = { Authorization: `token ${token}` };
    if (typeof autoUpdater.addAuthHeader === 'function') {
      autoUpdater.addAuthHeader(`token ${token}`);
    }
  }

  emitTokenDiagnostics({ severity = 'info', detail = '', reason = '', source = 'none', error = null, available = false } = {}) {
    const status = available ? 'healthy' : (error ? 'degraded' : 'degraded');
    const resolvedDetail = detail || (available
      ? 'Private updater token is configured.'
      : 'Private updater token is missing.');
    this.startupDiagnostics.setComponent('updater', status, {
      detail: resolvedDetail,
      reason: reason || (available ? 'private-token-present' : 'private-token-missing'),
      details: {
        tokenSource: source,
        hasToken: available,
        error: error ? String(error) : null,
      },
      phase: 'auth',
    });
    this.startupDiagnostics.pushEvent('updater', severity, 'Updater private token state updated.', {
      ...this.buildContext(),
      tokenSource: source,
      hasToken: available,
      reason: reason || null,
      error: error ? String(error) : null,
    });
    this.onHealth();
  }

  readPrivateTokenFromSafeStorage() {
    const safeStorage = this.getSafeStorage();
    if (!safeStorage) {
      return {
        token: '',
        source: 'safeStorage',
        error: 'safeStorage-unavailable',
        encryptionAvailable: false,
      };
    }

    if (!safeStorage.isEncryptionAvailable()) {
      return {
        token: '',
        source: 'safeStorage',
        error: 'safeStorage-encryption-unavailable',
        encryptionAvailable: false,
      };
    }

    if (!fs.existsSync(this.privateTokenPath)) {
      return {
        token: '',
        source: 'safeStorage',
        error: null,
        encryptionAvailable: true,
      };
    }

    try {
      const encoded = String(fs.readFileSync(this.privateTokenPath, 'utf8') || '').trim();
      if (!encoded) {
        return {
          token: '',
          source: 'safeStorage',
          error: null,
          encryptionAvailable: true,
        };
      }
      const encryptedBuffer = Buffer.from(encoded, 'base64');
      const token = String(safeStorage.decryptString(encryptedBuffer) || '').trim();
      return {
        token,
        source: 'safeStorage',
        error: null,
        encryptionAvailable: true,
      };
    } catch (error) {
      return {
        token: '',
        source: 'safeStorage',
        error: String(error?.message || error),
        encryptionAvailable: true,
      };
    }
  }

  describePrivateTokenState() {
    if (!this.isPrivateGithubProvider()) {
      return {
        required: false,
        available: false,
        source: 'none',
        error: null,
        encryptionAvailable: false,
      };
    }

    const envToken = this.getEnvPrivateToken();
    if (envToken) {
      return {
        required: true,
        available: true,
        source: 'env',
        error: null,
        encryptionAvailable: Boolean(this.getSafeStorage()?.isEncryptionAvailable?.()),
      };
    }

    const fromSafeStorage = this.readPrivateTokenFromSafeStorage();
    return {
      required: true,
      available: Boolean(fromSafeStorage.token),
      source: fromSafeStorage.source,
      error: fromSafeStorage.error || null,
      encryptionAvailable: Boolean(fromSafeStorage.encryptionAvailable),
    };
  }

  getPrivateTokenStatus() {
    const tokenState = this.describePrivateTokenState();
    return {
      ok: true,
      ...tokenState,
      requiresSetup: Boolean(tokenState.required && !tokenState.available),
    };
  }

  setPrivateToken(rawToken) {
    if (!this.isPrivateGithubProvider()) {
      return { ok: false, reason: 'private-token-not-required' };
    }

    const token = String(rawToken || '').trim();
    if (!token) {
      return { ok: false, reason: 'token-required' };
    }

    if (token.length > 5000) {
      return { ok: false, reason: 'token-too-long' };
    }

    const safeStorage = this.getSafeStorage();
    if (!safeStorage) {
      return { ok: false, reason: 'safeStorage-unavailable' };
    }

    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: 'safeStorage-encryption-unavailable' };
    }

    try {
      const encrypted = safeStorage.encryptString(token);
      fs.writeFileSync(this.privateTokenPath, encrypted.toString('base64'), 'utf8');

      if (this.autoUpdater && !this.getEnvPrivateToken()) {
        this.applyPrivateGithubToken(this.autoUpdater, token);
      }

      this.emitTokenDiagnostics({
        severity: 'info',
        detail: 'Private updater token saved securely.',
        reason: 'private-token-saved',
        source: 'safeStorage',
        available: true,
      });

      this.emitState(this.state.status, this.state.detail, {
        requiresTokenSetup: false,
        auth: {
          token: {
            required: true,
            available: true,
            source: 'safeStorage',
            error: null,
          },
        },
      });
      return { ok: true };
    } catch (error) {
      this.emitTokenDiagnostics({
        severity: 'warn',
        detail: 'Failed to save private updater token.',
        reason: 'private-token-save-failed',
        source: 'safeStorage',
        error: error?.message || error,
        available: false,
      });
      return { ok: false, reason: String(error?.message || error) };
    }
  }

  clearPrivateToken() {
    try {
      if (fs.existsSync(this.privateTokenPath)) {
        fs.unlinkSync(this.privateTokenPath);
      }
    } catch (error) {
      return { ok: false, reason: String(error?.message || error) };
    }

    if (this.autoUpdater && !this.getEnvPrivateToken()) {
      this.autoUpdater.requestHeaders = {};
    }

    this.emitTokenDiagnostics({
      severity: 'warn',
      detail: 'Private updater token removed. Update checks now require token setup.',
      reason: 'private-token-cleared',
      source: 'safeStorage',
      available: false,
    });

    this.emitState('error', 'Private update access token is required to check updates.', {
      downloaded: false,
      reason: 'updater-token-missing',
      requiresTokenSetup: true,
      auth: {
        token: {
          required: true,
          available: false,
          source: 'safeStorage',
          error: null,
        },
      },
    });

    return { ok: true };
  }

  _injectGitHubToken(autoUpdater) {
    const resolution = Promise.resolve().then(() => {
      const tokenState = this.describePrivateTokenState();
      const token = tokenState.source === 'env'
        ? this.getEnvPrivateToken()
        : String(this.readPrivateTokenFromSafeStorage().token || '').trim();

      if (token) {
        this.applyPrivateGithubToken(autoUpdater, token);
        this.log('updater:github-token-injected', { source: tokenState.source });
        this.emitTokenDiagnostics({
          severity: 'info',
          detail: `Private updater token loaded from ${tokenState.source}.`,
          reason: 'private-token-present',
          source: tokenState.source,
          available: true,
        });
      } else if (tokenState.error) {
        this.log('updater:github-token-error', { source: tokenState.source, message: tokenState.error });
        this.emitTokenDiagnostics({
          severity: 'warn',
          detail: 'Private updater token could not be loaded.',
          reason: 'private-token-read-failed',
          source: tokenState.source,
          error: tokenState.error,
          available: false,
        });
      } else {
        this.log('updater:github-token-missing', { source: tokenState.source, detail: 'token not configured' });
        this.emitTokenDiagnostics({
          severity: 'warn',
          detail: 'Private updater token is missing. Configure token to enable private updates.',
          reason: 'private-token-missing',
          source: tokenState.source,
          available: false,
        });
      }

      this.emitState(this.state.status, this.state.detail, {
        requiresTokenSetup: Boolean(tokenState.required && !tokenState.available),
        auth: {
          token: {
            required: Boolean(tokenState.required),
            available: Boolean(tokenState.available),
            source: tokenState.source || 'none',
            error: tokenState.error || null,
          },
        },
      });

      return tokenState;
    }).catch((error) => {
      const failure = {
        required: true,
        available: false,
        source: 'safeStorage',
        error: String(error?.message || error),
        encryptionAvailable: Boolean(this.getSafeStorage()?.isEncryptionAvailable?.()),
      };
      this.log('updater:github-token-error', { source: failure.source, message: failure.error });
      this.emitTokenDiagnostics({
        severity: 'warn',
        detail: 'Private updater token resolution failed.',
        reason: 'private-token-resolution-failed',
        source: failure.source,
        error: failure.error,
        available: false,
      });
      return failure;
    });

    this.privateTokenReady = resolution;
    return resolution;
  }

  async waitForPrivateTokenReady() {
    if (!this.isPrivateGithubProvider()) {
      return {
        required: false,
        available: false,
        source: 'none',
        error: null,
        encryptionAvailable: false,
      };
    }

    const timeoutResult = {
      required: true,
      available: false,
      source: 'timeout',
      error: 'token-resolution-timeout',
      encryptionAvailable: Boolean(this.getSafeStorage()?.isEncryptionAvailable?.()),
    };

    const ready = await Promise.race([
      this.privateTokenReady,
      new Promise((resolve) => setTimeout(() => resolve(timeoutResult), PRIVATE_TOKEN_WAIT_TIMEOUT_MS)),
    ]);

    if (ready === timeoutResult) {
      this.emitTokenDiagnostics({
        severity: 'warn',
        detail: 'Private updater token resolution timed out.',
        reason: 'private-token-resolution-timeout',
        source: 'timeout',
        error: 'token-resolution-timeout',
        available: false,
      });
    }

    return ready;
  }

  getAutoUpdater() {
    if (this.autoUpdater) return this.autoUpdater;
    try {
      const { autoUpdater } = require('electron-updater');
      const publish = this.getPublishConfig();

      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;

      if (publish.provider === 'generic' && publish.url) {
        autoUpdater.setFeedURL({ provider: 'generic', url: publish.url });
      }

      if (this.isPrivateGithubProvider()) {
        this.privateTokenReady = this._injectGitHubToken(autoUpdater);
      }

      this.startupDiagnostics.setComponent('updater', 'healthy', 'Updater initialized.');
      this.startupDiagnostics.pushEvent('updater', 'info', 'Updater initialized.', {
        ...this.buildContext(),
        autoDownload: autoUpdater.autoDownload,
        autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
      });
      this.telemetryBus.publish('startup.healthy');
      this.onHealth();

      autoUpdater.on('checking-for-update', () => {
        const context = this.buildContext();
        this.log('checking-for-update', context);
        this.startupDiagnostics.pushEvent('updater', 'info', 'Checking for update.', context);
        this.emitState('checking', 'Checking for updates…', {
          downloaded: false,
          updateAvailable: false,
          diagnostics: context,
          lastCheckedAt: nowIso(),
        });
      });

      autoUpdater.on('update-available', async (info) => {
        const context = this.buildContext();
        const version = String(info?.version || '').trim() || null;
        const releaseNotes = await this.resolveReleaseNotes(info);
        const policyResult = this.evaluatePolicy(version, releaseNotes.metadata || {});

        if (policyResult.defer) {
          this.startupDiagnostics.pushEvent('updater', 'info', 'Update deferred by policy.', {
            ...context,
            availableVersion: version,
            reason: policyResult.reason,
          });
          this.telemetryBus.publish('updater.deferred.policy');
          this.emitState('deferred', policyResult.detail, {
            downloaded: false,
            updateAvailable: false,
            version,
            releaseNotes,
            deferred: {
              reason: policyResult.reason,
              policy: true,
            },
            policy: {
              enabled: this.getPolicyEnabled(),
              applied: true,
              reason: policyResult.reason,
            },
            diagnostics: context,
          });
          return;
        }

        this.log('update-available', {
          ...context,
          availableVersion: version,
          releaseNotesSource: releaseNotes.source,
        });
        this.startupDiagnostics.setComponent('updater', 'healthy', 'Update is available.');
        this.startupDiagnostics.pushEvent('updater', 'info', 'Update available.', {
          ...context,
          availableVersion: version,
          releaseNotesSource: releaseNotes.source,
        });
        this.telemetryBus.publish('updater.update.available');
        this.onHealth();

        this.emitState('available', 'AssistantX update found. Downloading in background…', {
          downloaded: false,
          updateAvailable: true,
          version,
          releaseNotes,
          deferred: null,
          policy: {
            enabled: this.getPolicyEnabled(),
            applied: false,
            reason: null,
          },
          diagnostics: context,
        });
      });

      autoUpdater.on('update-not-available', () => {
        const context = this.buildContext();
        this.log('update-not-available', context);
        this.startupDiagnostics.setComponent('updater', 'healthy', 'No update available.');
        this.startupDiagnostics.pushEvent('updater', 'info', 'No update available.', context);
        this.telemetryBus.publish('startup.healthy');
        this.onHealth();
        this.emitState('up-to-date', 'AssistantX is up to date.', {
          downloaded: false,
          updateAvailable: false,
          diagnostics: context,
          lastCheckedAt: nowIso(),
        });
      });

      autoUpdater.on('download-progress', (progress) => {
        const percent = Math.round(progress?.percent || 0);
        this.log('download-progress', {
          ...this.buildContext(),
          percent,
          transferred: Number(progress?.transferred || 0),
          total: Number(progress?.total || 0),
        });
        this.emitState('downloading', `Downloading update… ${percent}%`, {
          downloaded: false,
          updateAvailable: true,
          downloadProgress: percent,
        });
      });

      autoUpdater.on('update-downloaded', (info) => {
        const version = String(info?.version || '').trim() || this.state.version;
        this.log('update-downloaded', {
          ...this.buildContext(),
          downloadedVersion: version,
        });
        this.startupDiagnostics.setComponent('updater', 'healthy', 'Update downloaded and ready to install.');
        this.startupDiagnostics.pushEvent('updater', 'info', 'Update downloaded.', {
          ...this.buildContext(),
          downloadedVersion: version,
        });
        this.telemetryBus.publish('updater.download.completed');
        this.onHealth();
        this.emitState('install-ready', 'Update ready. Restart AssistantX to install.', {
          downloaded: true,
          updateAvailable: true,
          version,
        });
      });

      autoUpdater.on('error', (error) => {
        const errorMeta = this.toErrorMetadata(error);
        const classification = this.classifyFailure(errorMeta);
        const context = this.buildContext();
        this.log('error', {
          ...context,
          ...errorMeta,
          classification: classification.reason,
        });
        this.startupDiagnostics.setComponent('updater', classification.health, classification.detail);
        this.startupDiagnostics.pushEvent('updater', classification.severity, 'Updater emitted error event.', {
          ...context,
          ...errorMeta,
          classification: classification.reason,
        });
        this.telemetryBus.publish(classification.health === 'degraded' ? 'startup.degraded' : classification.health === 'healthy' ? 'startup.healthy' : 'startup.unavailable');
        this.onHealth();
        this.emitState(classification.status, classification.detail, {
          downloaded: false,
          reason: classification.reason,
          diagnostics: {
            ...context,
            error: errorMeta,
          },
        });
      });

      this.autoUpdater = autoUpdater;
      return autoUpdater;
    } catch (error) {
      this.log('updater-unavailable', { message: String(error?.message || error) });
      this.startupDiagnostics.setComponent('updater', 'unavailable', `Updater unavailable: ${String(error?.message || error)}`);
      this.startupDiagnostics.pushEvent('updater', 'warn', 'Updater module unavailable.', {
        message: String(error?.message || error),
      });
      this.telemetryBus.publish('startup.unavailable');
      this.onHealth();
      return null;
    }
  }

  async resolveReleaseNotes(info = {}) {
    const fromUpdater = sanitizeText(info?.releaseNotes || info?.releaseName || '', 4000);
    let metadata = null;
    let manifestEntry = null;

    if (this.getUpdateSource() === 'manifest') {
      try {
        manifestEntry = await this.getManifestPlatformEntry();
      } catch (error) {
        this.log('manifest-release-notes:read-failed', { message: String(error?.message || error) });
      }
    }

    const notesUrl = this.getReleaseNotesUrl();
    if (notesUrl) {
      try {
        const response = await this.fetchWithNetworkStack(notesUrl, {
          cache: 'no-store',
          redirect: 'follow',
          headers: { Accept: 'application/json,text/plain,*/*' },
        }, 5000);
        if (response.ok) {
          const raw = await response.text();
          const parsed = safeJsonParse(raw, null);
          if (parsed && typeof parsed === 'object') {
            metadata = parsed;
          }
        }
      } catch (error) {
        this.log('release-notes:fetch-failed', { message: String(error?.message || error) });
      }
    }

    const version = String(info?.version || '').trim();
    const manifestVersion = sanitizeText(manifestEntry?.latestVersion || manifestEntry?.version || '', 80);
    const manifestReleaseNotes = sanitizeText(
      manifestEntry?.releaseNotes || manifestEntry?.notesMarkdown || manifestEntry?.notes || '',
      20_000,
    );
    if (manifestVersion && (!version || version === manifestVersion) && manifestReleaseNotes) {
      metadata = {
        version: manifestVersion,
        notesMarkdown: manifestReleaseNotes,
        highlights: normalizeHighlights(manifestReleaseNotes, 6),
      };
    }
    const selected = this.selectReleaseMetadata(metadata, version);
    const rawDetails = sanitizeText(selected?.notesMarkdown || selected?.details || fromUpdater || '', 4000);
    const markdownSource = sanitizeText(selected?.notesMarkdown || fromUpdater || '', 20_000);
    const highlights = Array.isArray(selected?.highlights)
      ? selected.highlights.map((item) => sanitizeText(item, 220)).filter(Boolean).slice(0, 6)
      : normalizeHighlights(rawDetails, 6);

    const details = rawDetails || (highlights.length > 0 ? highlights.map((line) => `• ${line}`).join('\n') : 'Performance and stability improvements.');
    return {
      source: selected ? 'release-notes.json' : (fromUpdater ? 'updater' : 'fallback'),
      highlights: highlights.length > 0 ? highlights : ['Performance and stability improvements.'],
      details,
      markdown: markdownSource,
      hasNotes: Boolean(details),
      metadata: selected || {},
    };
  }

  selectReleaseMetadata(metadata, version) {
    if (!metadata || typeof metadata !== 'object') return null;
    if (Array.isArray(metadata.releases) && version) {
      const exact = metadata.releases.find((item) => String(item?.version || '') === version);
      if (exact) return exact;
    }
    if (String(metadata.version || '') === String(version || '')) return metadata;
    if (!version && (metadata.highlights || metadata.notesMarkdown)) return metadata;
    return null;
  }

  evaluatePolicy(version, metadata = {}) {
    if (!this.getPolicyEnabled()) {
      return { defer: false };
    }

    const policy = metadata?.policy && typeof metadata.policy === 'object' ? metadata.policy : {};

    const blocked = Array.isArray(policy?.rollback?.blockedVersions)
      ? policy.rollback.blockedVersions.map((item) => String(item))
      : [];
    if (version && blocked.includes(version)) {
      return {
        defer: true,
        reason: 'rollback-blocked-version',
        detail: 'This update is temporarily paused while we complete rollout validation.',
      };
    }

    const forcedDeferUntil = policy?.forcedDeferUntil ? Date.parse(policy.forcedDeferUntil) : null;
    if (Number.isFinite(forcedDeferUntil) && Date.now() < forcedDeferUntil) {
      return {
        defer: true,
        reason: 'forced-deferral-window',
        detail: 'Update rollout is temporarily deferred. We will notify you soon.',
      };
    }

    const stagedPercent = Number(policy?.stagedRollout?.percentage);
    if (Number.isFinite(stagedPercent) && stagedPercent >= 0 && stagedPercent < 100) {
      const identity = `${this.app.getPath('userData')}|${process.arch}|${process.platform}`;
      const bucket = hashString(identity) % 100;
      if (bucket >= stagedPercent) {
        return {
          defer: true,
          reason: 'staged-rollout-gated',
          detail: 'This update is rolling out in stages and is not available for this device yet.',
        };
      }
    }

    return { defer: false };
  }

  shouldSuppressPrompt(version) {
    if (!version) return { suppressed: false };
    const deferredVersion = String(this.deferState?.deferredVersion || '');
    if (!deferredVersion || deferredVersion !== version) {
      return { suppressed: false };
    }
    const deferredLaunchId = String(this.deferState?.launchId || '');
    if (deferredLaunchId !== this.launchId) {
      return { suppressed: false };
    }
    const deferredUntil = Number(this.deferState?.deferredUntilTs || 0);
    if (!Number.isFinite(deferredUntil) || deferredUntil <= Date.now()) {
      return { suppressed: false };
    }
    return {
      suppressed: true,
      reason: 'user-deferred-this-launch',
    };
  }

  getDeferDurationMs(version, releaseNotes) {
    const severity = inferSeverity(this.app.getVersion(), version, releaseNotes?.metadata || {});
    if (severity === 'major' || severity === 'security') return DEFAULT_DEFER_MAJOR_SECURITY_MS;
    return DEFAULT_DEFER_MINOR_PATCH_MS;
  }

  defer({ reason = 'later', source = 'user' } = {}) {
    const version = String(this.state.version || '').trim() || null;
    if (!version) return { ok: false, reason: 'no-update-available' };

    const durationMs = this.getDeferDurationMs(version, this.state.releaseNotes);
    const deferredUntilTs = Date.now() + durationMs;

    this.persistDeferState({
      deferredVersion: version,
      launchId: this.launchId,
      deferredAt: nowIso(),
      deferredUntilTs,
      reason,
      source,
    });

    this.telemetryBus.publish('updater.deferred.user');
    this.startupDiagnostics.pushEvent('updater', 'info', 'Update deferred by user.', {
      version,
      reason,
      source,
      deferredUntilTs,
    });

    this.emitState('deferred', 'Update postponed. We will remind you later.', {
      downloaded: false,
      updateAvailable: true,
      deferred: {
        reason,
        source,
        deferredUntilTs,
      },
    });

    return { ok: true };
  }

  async check({ source = 'manual' } = {}) {
    if (!this.app.isPackaged) {
      this.startupDiagnostics.setComponent('updater', 'degraded', 'Updater disabled in development mode.');
      this.startupDiagnostics.pushEvent('updater', 'info', 'Update check skipped in development mode.');
      this.telemetryBus.publish('startup.degraded');
      this.onHealth();
      this.emitState('disabled', 'Running in dev mode. Install the EXE build to enable auto-updates.');
      return { ok: false, reason: 'not-packaged' };
    }

    if (this.isOffline()) {
      const context = this.buildContext();
      this.log('check-for-updates:skipped-offline', { ...context, source });
      this.startupDiagnostics.setComponent('updater', 'degraded', 'Update check skipped while the device is offline.');
      this.startupDiagnostics.pushEvent('updater', 'info', 'Update check skipped because the device is offline.', {
        ...context,
        source,
        classification: 'network-offline',
      });
      this.telemetryBus.publish('startup.degraded');
      this.onHealth();
      this.emitState('unavailable', 'Update check skipped while the device is offline.', {
        downloaded: false,
        reason: 'network-offline',
        diagnostics: context,
      });
      return { ok: false, reason: 'network-offline' };
    }

    const updater = this.getAutoUpdater();
    if (!updater) return { ok: false, reason: 'updater-unavailable' };

    if (this.getUpdateSource() === 'manifest') {
      try {
        await this.applyManifestGenericFeed(updater);
      } catch (error) {
        const errorMeta = this.toErrorMetadata(error);
        const classification = this.classifyFailure(errorMeta);
        this.emitState(classification.status, classification.detail, {
          downloaded: false,
          reason: classification.reason,
          diagnostics: {
            ...this.buildContext(),
            error: errorMeta,
          },
        });
        return { ok: false, reason: classification.reason };
      }
    }

    if (this.isPrivateGithubProvider()) {
      const tokenState = await this.waitForPrivateTokenReady();
      if (!tokenState.available) {
        const reason = tokenState.error ? 'updater-token-error' : 'updater-token-missing';
        this.emitState('error', tokenState.error
          ? 'Unable to load the private updater token. Reconfigure update credentials.'
          : 'Private update access token is required before checking for updates.', {
          downloaded: false,
          reason,
          requiresTokenSetup: true,
          auth: {
            token: {
              required: true,
              available: false,
              source: tokenState.source || 'none',
              error: tokenState.error || null,
            },
          },
        });
        return { ok: false, reason };
      }
    }

    try {
      const context = this.buildContext();
      this.log('check-for-updates:requested', { ...context, source });
      this.startupDiagnostics.pushEvent('updater', 'info', 'Update check requested.', { ...context, source });
      this.telemetryBus.publish(source === 'startup' ? 'updater.check.startup' : 'updater.check.manual');
      await updater.checkForUpdates();
      return { ok: true };
    } catch (error) {
      const errorMeta = this.toErrorMetadata(error);
      const classification = this.classifyFailure(errorMeta);
      const context = this.buildContext();
      this.log('check-for-updates:failed', {
        ...context,
        ...errorMeta,
        classification: classification.reason,
      });
      this.startupDiagnostics.setComponent('updater', classification.health, `Check for updates failed: ${classification.detail}`);
      this.startupDiagnostics.pushEvent('updater', classification.severity, 'checkForUpdates failed.', {
        ...context,
        ...errorMeta,
        classification: classification.reason,
      });
      this.telemetryBus.publish(classification.health === 'degraded' ? 'startup.degraded' : classification.health === 'healthy' ? 'startup.healthy' : 'startup.unavailable');
      this.onHealth();
      this.emitState(classification.status, classification.detail, {
        downloaded: false,
        reason: classification.reason,
        diagnostics: {
          ...context,
          error: errorMeta,
        },
      });
      return { ok: false, reason: errorMeta.message };
    }
  }

  async download({ source = 'user' } = {}) {
    if (!this.app.isPackaged) return { ok: false, reason: 'not-packaged' };
    const updater = this.getAutoUpdater();
    if (!updater) return { ok: false, reason: 'updater-unavailable' };

    try {
      this.telemetryBus.publish('updater.download.started');
      this.startupDiagnostics.pushEvent('updater', 'info', 'Update download started.', { source });
      this.emitState('downloading', 'Downloading update…', { downloaded: false, updateAvailable: true });
      await updater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      const message = String(error?.message || error || 'Download failed');
      this.telemetryBus.publish('updater.download.failed');
      this.startupDiagnostics.setComponent('updater', 'degraded', `Update download failed: ${message}`);
      this.startupDiagnostics.pushEvent('updater', 'warn', 'Update download failed.', { message, source });
      this.telemetryBus.publish('startup.degraded');
      this.onHealth();
      this.emitState('error', `Download failed: ${message}`, { downloaded: false, reason: 'download-failed' });
      return { ok: false, reason: message };
    }
  }

  install({ source = 'user' } = {}) {
    if (!this.app.isPackaged) return { ok: false, reason: 'not-packaged' };
    const updater = this.getAutoUpdater();
    if (!updater || !this.state.downloaded) {
      return { ok: false, reason: 'no-update-downloaded' };
    }

    this.telemetryBus.publish('updater.install.requested');
    this.startupDiagnostics.pushEvent('updater', 'info', 'Update install requested.', { source });
    this.emitState('installing', 'Installing update… AssistantX will restart shortly.', {
      downloaded: true,
    });
    setImmediate(() => updater.quitAndInstall());
    return { ok: true };
  }

  setup() {
    if (!this.app.isPackaged) {
      this.startupDiagnostics.setComponent('updater', 'degraded', 'Updater disabled in development mode.');
      this.startupDiagnostics.pushEvent('updater', 'info', 'Updater setup skipped in development mode.');
      this.telemetryBus.publish('startup.degraded');
      this.onHealth();
      this.emitState('disabled', 'Running in dev mode. Install the EXE build to enable auto-updates.');
      return;
    }

    void this.runFeedSelfTest();
    this.getAutoUpdater();
  }
}

function createUpdateCoordinator(deps) {
  return new UpdateCoordinator(deps);
}

module.exports = {
  createUpdateCoordinator,
};
