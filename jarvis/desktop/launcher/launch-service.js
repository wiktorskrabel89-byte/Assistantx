const path = require('path');
const { execFile } = require('child_process');
const shell = process.versions?.electron
  ? require('electron').shell
  : null;
const { APP_OPEN_MAP, APP_OPEN_MAP_DARWIN } = require('../app-launch-config');
const { normalizeKey, normalizeName } = require('../app-scanner');
const { getMeta, setMeta } = require('./db');
const {
  getCatalogFreshness,
  getAliasMap,
  getAppByKey,
  getProviderStatus,
  getRecentApps,
  listApps,
  recordLaunch,
  recordProviderStatus,
  recordResolverDecision,
  setAlias,
  upsertApps,
} = require('./catalog');
const { PROTECTED_APP_KEYS, SCRIPT_EXTENSIONS, CONFIRMATION_TRIGGERS, normalizeTrigger } = require('./constants');
const { rankApps } = require('./matcher');
const { discoverApps } = require('./providers');

function execFilePromise(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve((stdout || '').trim());
    });
  });
}

function toBuiltinApps(platform = process.platform) {
  const source = platform === 'darwin' ? APP_OPEN_MAP_DARWIN : APP_OPEN_MAP;
  return Object.entries(source).map(([key, value]) => {
    const candidates = Array.isArray(value) ? value : [value];
    const primary = String(candidates[0]);
    const launchType = /^https?:/i.test(primary)
      ? 'url'
      : primary.includes(':') && !/^[a-z]:\\/i.test(primary)
        ? 'protocol'
        : platform === 'darwin'
          ? 'application'
          : 'shell';
    return {
      key,
      name: normalizeName(key),
      launchTarget: primary,
      launchType,
      launchMode: launchType === 'shell' ? 'start' : 'filePath',
      source: 'builtin',
      aliases: candidates.slice(1).map((item) => normalizeName(item)).filter(Boolean),
      iconPath: '',
      installRoot: '',
      riskLevel: PROTECTED_APP_KEYS.has(normalizeKey(key)) ? 'protected' : 'safe',
    };
  });
}

function getAllApps() {
  return listApps(1500).map((app) => ({
    ...app,
    usageHours: app.metadata?.usageHours || {},
  }));
}

function isEverythingAvailable() {
  return getProviderStatus().some((entry) => entry.provider === 'everything' && entry.status === 'available');
}

function shouldRecommendEverything() {
  if (process.platform !== 'win32') return false;
  if (isEverythingAvailable()) return false;
  if (getMeta('everything_recommendation_disabled') === '1') return false;
  const deferredAt = getMeta('everything_recommendation_deferred_at');
  if (!deferredAt) return true;
  const elapsedMs = Date.now() - Date.parse(deferredAt);
  return !Number.isFinite(elapsedMs) || elapsedMs >= (3 * 24 * 60 * 60 * 1000);
}

function disableEverythingRecommendation() {
  setMeta('everything_recommendation_disabled', '1');
}

function remindLaterForEverything() {
  setMeta('everything_recommendation_deferred_at', new Date().toISOString());
}

function getTriggerInfo(trigger) {
  const normalizedTrigger = normalizeTrigger(trigger);
  return {
    trigger: normalizedTrigger,
    requiresConfirmation: CONFIRMATION_TRIGGERS.has(normalizedTrigger),
  };
}

function classifyLaunchRisk(app, options = {}) {
  const key = normalizeKey(app?.key || app?.name);
  const launchTarget = String(app?.launchTarget || '');
  const extension = path.extname(launchTarget).toLowerCase();
  const isScript = SCRIPT_EXTENSIONS.has(extension);
  const isProtected = PROTECTED_APP_KEYS.has(key);
  const isUnknownExecutable = app?.sourceProvider === 'fallback-raw' || app?.sourceProvider === 'manual-raw';
  const isExternalUrl = app?.launchType === 'url' || /^https?:/i.test(launchTarget);
  const requiresAdmin = Boolean(options.admin);

  if (requiresAdmin) {
    return { level: 'admin', message: `Open ${app.name} as administrator?` };
  }
  if (isScript) {
    return { level: 'script', message: `Run script ${app.name || launchTarget}?` };
  }
  if (isProtected) {
    return { level: 'protected', message: `Open ${app.name} from a protected tools list?` };
  }
  if (isUnknownExecutable) {
    return { level: 'unknown', message: `Open unknown executable ${app.name || launchTarget}?` };
  }
  if (isExternalUrl) {
    return { level: 'external-url', message: `Open external URL ${launchTarget}?` };
  }
  return { level: 'safe', message: null };
}

async function launchResolvedApp(app, options = {}) {
  const launchTarget = String(app.launchTarget || '').trim();
  const launchType = String(app.launchType || 'shell');
  const platform = process.platform;

  if (!launchTarget) throw new Error('Missing launch target.');

  if (platform === 'darwin') {
    if (launchType === 'application') {
      await execFilePromise('open', ['-a', launchTarget]);
      return { strategy: 'darwin-open-app' };
    }
    if (launchType === 'url' && shell) {
      await shell.openExternal(launchTarget);
      return { strategy: 'darwin-open-url' };
    }
    await execFilePromise('open', [launchTarget]);
    return { strategy: 'darwin-open-path' };
  }

  if (options.admin) {
    const escapedPath = launchTarget.replace(/'/g, "''");
    await execFilePromise('powershell.exe', ['-NoProfile', '-Command', `Start-Process -FilePath '${escapedPath}' -Verb RunAs`]);
    return { strategy: 'windows-runas' };
  }

  if (launchType === 'url') {
    if (shell) {
      await shell.openExternal(launchTarget);
      return { strategy: 'shell-open-external' };
    }
    await execFilePromise('cmd.exe', ['/c', 'start', '', launchTarget]);
    return { strategy: 'cmd-start-url' };
  }

  if (launchType === 'uwp') {
    await execFilePromise('explorer.exe', [`shell:AppsFolder\\${launchTarget}`]);
    return { strategy: 'explorer-shell-appsfolder' };
  }

  if (launchType === 'application') {
    await execFilePromise('cmd.exe', ['/c', 'start', '', launchTarget]);
    return { strategy: 'cmd-start-application' };
  }

  if (launchType === 'shortcut' || launchType === 'protocol' || launchType === 'shell') {
    await execFilePromise('cmd.exe', ['/c', 'start', '', launchTarget]);
    return { strategy: 'cmd-start-shell' };
  }

  await execFilePromise('cmd.exe', ['/c', 'start', '', launchTarget]);
  return { strategy: 'cmd-start-executable' };
}

async function ensureCatalogReady(reason = 'startup') {
  const apps = listApps(5);
  if (apps.length > 0) return { appCount: apps.length, provider: 'cached' };
  return refreshCatalog({ reason });
}

async function refreshCatalog({ reason = 'manual', platform = process.platform } = {}) {
  try {
    upsertApps(toBuiltinApps(platform), { provider: 'builtin', replaceProvider: true });
  } catch (err) {
    if (err.message && err.message.includes('not initialised')) {
      // DB not yet ready — schedule a retry and return a neutral result.
      console.warn('[launcher] refreshCatalog: DB not initialised, retrying in 500ms.', err.message);
      await new Promise((res) => setTimeout(res, 500));
      return refreshCatalog({ reason, platform });
    }
    throw err;
  }

  const discovery = await discoverApps(execFilePromise, { platform });
  const nowIso = new Date().toISOString();
  discovery.statuses.forEach((entry) => recordProviderStatus(entry.provider, entry.status, entry.detail));
  if (discovery.apps.length > 0) {
    upsertApps(discovery.apps, { provider: discovery.activeProvider, replaceProvider: true });
    setMeta('catalog_last_successful_scan_at', nowIso);
    setMeta('catalog_active_provider', discovery.activeProvider);
  }
  const providerStatus = getProviderStatus();
  const catalogHealth = getCatalogFreshness();
  return {
    provider: discovery.activeProvider,
    appCount: listApps(2000).length,
    statuses: providerStatus,
    providerStatus,
    catalogHealth,
    everythingAvailable: discovery.activeProvider === 'everything',
    reason,
  };
}

function resolveAppQuery(input, options = {}) {
  const normalizedInput = normalizeKey(input);
  if (!normalizedInput) {
    return { status: 'invalid', suggestions: [] };
  }
  const aliasMap = getAliasMap();
  const directAlias = aliasMap[normalizedInput];
  if (directAlias) {
    const app = getAppByKey(directAlias);
    if (app) {
      return {
        status: 'resolved',
        strategy: 'alias_exact',
        confidence: 1,
        app,
        matchedInput: normalizedInput,
        suggestions: [],
      };
    }
  }

  const apps = getAllApps();
  const ranking = rankApps(normalizedInput, apps, { strict: options.strict });
  if (!ranking.best) {
    return {
      status: 'unknown',
      strategy: 'rank_none',
      confidence: 0,
      suggestions: [],
    };
  }

  const best = ranking.best;
  const suggestions = ranking.items.slice(0, 5).map((item) => ({
    key: item.app.key,
    name: item.app.name,
    score: item.score,
    launchType: item.app.launchType,
    aliases: item.app.aliases || [],
    riskLevel: classifyLaunchRisk(item.app, options).level,
  }));

  if (ranking.status === 'unknown') {
    return {
      status: 'unknown',
      strategy: 'rank_none',
      confidence: best.score / 100,
      suggestions,
    };
  }

  if (ranking.status === 'confirm') {
    return {
      status: 'ambiguous',
      strategy: 'rank_confirm',
      confidence: best.score / 100,
      matchedInput: best.matchedProbe,
      app: best.app,
      suggestions,
    };
  }

  return {
    status: 'resolved',
    strategy: directAlias ? 'alias_exact' : 'rank_auto',
    confidence: best.score / 100,
    matchedInput: best.matchedProbe,
    app: best.app,
    suggestions,
  };
}

async function teachAlias(alias, appQuery) {
  await ensureCatalogReady('teach-alias');
  const resolution = resolveAppQuery(appQuery, { strict: false });
  if (resolution.status !== 'resolved' || !resolution.app) {
    throw new Error(`Cannot set alias: unknown target app "${appQuery}".`);
  }
  setAlias(alias, resolution.app.key, 'explicit', 1);
  recordResolverDecision({
    input: alias,
    resolvedKey: resolution.app.key,
    strategy: 'explicit_alias',
    confidence: 1,
    matchedInput: resolution.app.key,
    trigger: 'manual',
  });
  return {
    summary: `Saved alias "${normalizeKey(alias)}" → "${resolution.app.key}".`,
    app: resolution.app.key,
  };
}

async function searchApps(query, { limit = 8 } = {}) {
  await ensureCatalogReady('search');
  if (!String(query || '').trim()) {
    const recent = getRecentApps(limit);
      return {
        query: '',
      results: recent.map((app) => ({
        key: app.key,
        name: app.name,
        launchType: app.launchType,
        aliases: app.aliases,
        sourceProvider: app.sourceProvider,
        riskLevel: classifyLaunchRisk(app).level,
        subtitle: [app.sourceProvider, app.launchCount ? `${app.launchCount} launches` : null].filter(Boolean).join(' · '),
      })),
        providerStatus: getProviderStatus(),
        catalogHealth: getCatalogFreshness(),
      };
  }

  const ranking = rankApps(query, getAllApps());
  return {
    query: String(query || ''),
    results: (ranking.items || []).slice(0, limit).map((item) => ({
      key: item.app.key,
      name: item.app.name,
      launchType: item.app.launchType,
      aliases: item.app.aliases,
      sourceProvider: item.app.sourceProvider,
      riskLevel: classifyLaunchRisk(item.app).level,
      score: item.score,
      subtitle: [item.app.sourceProvider, item.reasons.join(', ')].filter(Boolean).join(' · '),
    })),
    providerStatus: getProviderStatus(),
    catalogHealth: getCatalogFreshness(),
  };
}

function getCatalogHealth() {
  return getCatalogFreshness();
}

async function launchApp(input, options = {}) {
  await ensureCatalogReady('launch');
  const triggerInfo = getTriggerInfo(options.trigger || 'manual');
  const resolution = resolveAppQuery(input, {
    strict: triggerInfo.requiresConfirmation && triggerInfo.trigger !== 'manual',
  });

  if (resolution.status === 'unknown') {
    const fallbackName = normalizeName(input || 'Unknown app');
    return {
      status: 'unknown',
      summary: `Unknown app: ${input}`,
      suggestions: resolution.suggestions || [],
      app: fallbackName,
    };
  }

  if (resolution.status === 'ambiguous') {
    return {
      status: 'confirmation_required',
      summary: `I found multiple close matches for "${input}".`,
      suggestions: resolution.suggestions || [],
      confirmation: {
        title: 'Choose the correct app',
        message: `Confirm which app to open for "${input}".`,
        suggestions: resolution.suggestions || [],
      },
    };
  }

  const app = resolution.app;
  const risk = classifyLaunchRisk(app, options);
  if (triggerInfo.requiresConfirmation && !options.confirmed && risk.level !== 'safe') {
    return {
      status: 'confirmation_required',
      summary: risk.message,
      app: app.key,
      confirmation: {
        title: 'Confirm launch',
        message: risk.message,
        app,
        riskLevel: risk.level,
      },
    };
  }

  try {
    const launchResult = await launchResolvedApp(app, options);
    recordResolverDecision({
      input,
      resolvedKey: app.key,
      strategy: resolution.strategy,
      confidence: resolution.confidence,
      matchedInput: resolution.matchedInput || app.key,
      trigger: triggerInfo.trigger,
    });
    recordLaunch({
      appKey: app.key,
      input,
      launchTarget: app.launchTarget,
      launchType: app.launchType,
      strategy: launchResult.strategy,
      status: 'launched',
      trigger: triggerInfo.trigger,
      message: `Opened ${app.name}`,
    });
    return {
      status: 'launched',
      summary: `${resolution.strategy === 'rank_auto' ? `Matched "${input}" to "${app.name}". ` : ''}Opened ${app.name}.`,
      app: app.key,
      resolver: {
        strategy: resolution.strategy,
        confidence: resolution.confidence,
        matchedInput: resolution.matchedInput || app.key,
      },
      launch: launchResult,
    };
  } catch (error) {
    recordLaunch({
      appKey: app.key,
      input,
      launchTarget: app.launchTarget,
      launchType: app.launchType,
      strategy: resolution.strategy,
      status: 'failed',
      trigger: triggerInfo.trigger,
      message: error.message,
    });
    throw error;
  }
}

async function launchUrl(url, options = {}) {
  const app = {
    key: 'external-url',
    name: 'External URL',
    launchTarget: String(url || ''),
    launchType: 'url',
    sourceProvider: 'url',
  };
  const triggerInfo = getTriggerInfo(options.trigger || 'manual');
  const risk = classifyLaunchRisk(app, options);
  if (triggerInfo.requiresConfirmation && !options.confirmed && risk.level !== 'safe') {
    return {
      status: 'confirmation_required',
      summary: risk.message,
      confirmation: {
        title: 'Confirm external URL',
        message: risk.message,
        app,
        riskLevel: risk.level,
      },
    };
  }
  const launchResult = await launchResolvedApp(app, options);
  recordLaunch({
    appKey: 'external-url',
    input: url,
    launchTarget: url,
    launchType: 'url',
    strategy: launchResult.strategy,
    status: 'launched',
    trigger: triggerInfo.trigger,
    message: `Opened ${url}`,
  });
  return {
    status: 'launched',
    summary: `Opened URL in browser: ${url}`,
    url,
  };
}

module.exports = {
  classifyLaunchRisk,
  disableEverythingRecommendation,
  ensureCatalogReady,
  getProviderStatus,
  getRecentApps,
  getCatalogHealth,
  isEverythingAvailable,
  launchApp,
  launchUrl,
  refreshCatalog,
  remindLaterForEverything,
  resolveAppQuery,
  searchApps,
  shouldRecommendEverything,
  teachAlias,
  toBuiltinApps,
};
