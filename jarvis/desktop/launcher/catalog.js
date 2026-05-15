const path = require('path');
const { getDb, getMeta } = require('./db');
const { normalizeKey, normalizeName } = require('../app-scanner');
const { saveDiscoveredApps, setAppAlias } = require('../local-state');

function safeJsonParse(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function toAppRecord(row, aliases = []) {
  const metadata = safeJsonParse(row.metadata_json, {});
  return {
    key: row.key,
    name: row.name,
    launchTarget: row.launch_target,
    launchType: row.launch_type,
    sourceProvider: row.source_provider,
    iconPath: row.icon_path || null,
    installRoot: row.install_root || null,
    riskLevel: row.risk_level || 'safe',
    launchCount: Number(row.launch_count || 0),
    lastUsedAt: row.last_used_at || null,
    lastIndexedAt: row.last_indexed_at || null,
    aliases,
    metadata: {
      ...metadata,
      usageHours: safeJsonParse(row.usage_hours_json, {}),
    },
  };
}

function getAliasMap() {
  const db = getDb();
  const rows = db.prepare('SELECT alias, app_key, source FROM aliases').all();
  return rows.reduce((acc, row) => {
    acc[row.alias] = row.app_key;
    return acc;
  }, {});
}

function getAliasesForKeys(keys = []) {
  if (!keys.length) return new Map();
  const db = getDb();
  const placeholders = keys.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT alias, app_key FROM aliases WHERE app_key IN (${placeholders})`).all(...keys);
  const map = new Map();
  rows.forEach((row) => {
    const list = map.get(row.app_key) || [];
    list.push(row.alias);
    map.set(row.app_key, list);
  });
  return map;
}

function listApps(limit = 500) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM apps
    ORDER BY launch_count DESC, COALESCE(last_used_at, '') DESC, name ASC
    LIMIT ?
  `).all(limit);
  const aliasMap = getAliasesForKeys(rows.map((row) => row.key));
  return rows.map((row) => toAppRecord(row, aliasMap.get(row.key) || []));
}

function getRecentApps(limit = 8) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM apps
    WHERE last_used_at IS NOT NULL
    ORDER BY last_used_at DESC, launch_count DESC, name ASC
    LIMIT ?
  `).all(limit);
  const aliasMap = getAliasesForKeys(rows.map((row) => row.key));
  return rows.map((row) => toAppRecord(row, aliasMap.get(row.key) || []));
}

function getAppByKey(key) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM apps WHERE key = ?').get(normalizedKey);
  if (!row) return null;
  const aliasMap = getAliasesForKeys([normalizedKey]);
  return toAppRecord(row, aliasMap.get(normalizedKey) || []);
}

function upsertApps(apps = [], { provider = 'scan', replaceProvider = false } = {}) {
  const db = getDb();
  const now = new Date().toISOString();
  const normalizedApps = [];
  const upsertStmt = db.prepare(`
    INSERT INTO apps (
      key, name, launch_target, launch_type, source_provider, icon_path,
      install_root, risk_level, launch_count, last_used_at, usage_hours_json,
      last_indexed_at, metadata_json
    ) VALUES (
      @key, @name, @launchTarget, @launchType, @sourceProvider, @iconPath,
      @installRoot, @riskLevel, @launchCount, @lastUsedAt, @usageHoursJson,
      @lastIndexedAt, @metadataJson
    ) ON CONFLICT(key) DO UPDATE SET
      name = excluded.name,
      launch_target = excluded.launch_target,
      launch_type = excluded.launch_type,
      source_provider = excluded.source_provider,
      icon_path = COALESCE(excluded.icon_path, apps.icon_path),
      install_root = COALESCE(excluded.install_root, apps.install_root),
      risk_level = excluded.risk_level,
      last_indexed_at = excluded.last_indexed_at,
      metadata_json = excluded.metadata_json
  `);
  const deleteByProviderStmt = db.prepare('DELETE FROM apps WHERE source_provider = ?');
  const insertAliasStmt = db.prepare(`
    INSERT INTO aliases (alias, app_key, source, learned_confidence, created_at, updated_at)
    VALUES (@alias, @appKey, @source, @learnedConfidence, @createdAt, @updatedAt)
    ON CONFLICT(alias) DO UPDATE SET
      app_key = excluded.app_key,
      source = CASE WHEN aliases.source = 'explicit' THEN aliases.source ELSE excluded.source END,
      learned_confidence = CASE WHEN aliases.source = 'explicit' THEN aliases.learned_confidence ELSE excluded.learned_confidence END,
      updated_at = excluded.updated_at
  `);
  const deleteProviderAliasesStmt = db.prepare("DELETE FROM aliases WHERE source = 'provider' AND app_key NOT IN (SELECT key FROM apps)");

  const txn = db.transaction(() => {
    if (replaceProvider) deleteByProviderStmt.run(provider);

    apps.forEach((app) => {
      const key = normalizeKey(app.key || app.name);
      const launchTarget = String(app.launchTarget || '').trim();
      if (!key || !launchTarget) return;
      const launchType = String(app.launchType || (app.launchMode === 'filePath' ? 'executable' : 'shell'));
      const installRoot = String(app.installRoot || path.dirname(launchTarget));
      const metadata = {
        source: app.source || provider,
        launchMode: app.launchMode || null,
        importedAliases: Array.isArray(app.aliases) ? app.aliases : [],
      };
      const riskLevel = String(app.riskLevel || 'safe');
      upsertStmt.run({
        key,
        name: normalizeName(app.name || key),
        launchTarget,
        launchType,
        sourceProvider: provider,
        iconPath: String(app.iconPath || ''),
        installRoot,
        riskLevel,
        launchCount: 0,
        lastUsedAt: null,
        usageHoursJson: '{}',
        lastIndexedAt: now,
        metadataJson: JSON.stringify(metadata),
      });
      normalizedApps.push({
        key,
        name: normalizeName(app.name || key),
        launchTarget,
        launchType,
        launchMode: launchType === 'executable' ? 'filePath' : 'start',
        source: provider,
        aliases: Array.isArray(app.aliases) ? app.aliases : [],
      });

      const aliases = new Set([key, normalizeName(app.name || key), ...(Array.isArray(app.aliases) ? app.aliases : [])]);
      aliases.forEach((alias) => {
        const normalizedAlias = normalizeKey(alias);
        if (!normalizedAlias) return;
        insertAliasStmt.run({
          alias: normalizedAlias,
          appKey: key,
          source: 'provider',
          learnedConfidence: 1,
          createdAt: now,
          updatedAt: now,
        });
      });
    });

    deleteProviderAliasesStmt.run();
  });

  txn();
  saveDiscoveredApps(listApps(1000).map((app) => ({
    key: app.key,
    name: app.name,
    launchTarget: app.launchTarget,
    launchType: app.launchType,
    launchMode: app.launchType === 'executable' ? 'filePath' : 'start',
    source: app.sourceProvider,
    aliases: app.aliases,
    iconPath: app.iconPath,
    installRoot: app.installRoot,
    riskLevel: app.riskLevel,
  })), { source: provider });
  return normalizedApps;
}

function setAlias(alias, appKey, source = 'explicit', learnedConfidence = 1) {
  const normalizedAlias = normalizeKey(alias);
  const normalizedAppKey = normalizeKey(appKey);
  if (!normalizedAlias || !normalizedAppKey) return false;
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO aliases (alias, app_key, source, learned_confidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(alias) DO UPDATE SET
      app_key = excluded.app_key,
      source = excluded.source,
      learned_confidence = excluded.learned_confidence,
      updated_at = excluded.updated_at
  `).run(normalizedAlias, normalizedAppKey, source, learnedConfidence, now, now);
  if (source === 'explicit') setAppAlias(normalizedAlias, normalizedAppKey);
  return true;
}

function recordProviderStatus(provider, status, detail = '') {
  const db = getDb();
  db.prepare(`
    INSERT INTO provider_status (provider, status, detail, checked_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      status = excluded.status,
      detail = excluded.detail,
      checked_at = excluded.checked_at
  `).run(String(provider), String(status), String(detail || ''), new Date().toISOString());
}

function getProviderStatus() {
  const db = getDb();
  const statuses = db.prepare('SELECT * FROM provider_status ORDER BY provider ASC').all();
  return statuses.map((entry) => ({
    ...entry,
    checkedAt: entry.checked_at || null,
  }));
}

function getCatalogFreshness() {
  const lastSuccessfulScanAt = getMeta('catalog_last_successful_scan_at');
  const activeProvider = getMeta('catalog_active_provider');
  const parsed = Date.parse(lastSuccessfulScanAt || '');
  const ageMs = Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : null;
  const freshness = ageMs == null
    ? 'unknown'
    : ageMs <= (15 * 60 * 1000)
      ? 'fresh'
      : ageMs <= (2 * 60 * 60 * 1000)
        ? 'stale'
        : 'degraded';
  return {
    activeProvider: activeProvider || null,
    lastSuccessfulScanAt: lastSuccessfulScanAt || null,
    ageMs,
    freshness,
  };
}

function recordResolverDecision({ input, resolvedKey, strategy, confidence, matchedInput, trigger }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO resolver_history (input, app_key, strategy, confidence, matched_input, trigger, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(input || ''),
    String(resolvedKey || ''),
    String(strategy || ''),
    Number(confidence || 0),
    String(matchedInput || ''),
    String(trigger || 'manual'),
    new Date().toISOString(),
  );

  maybeLearnAlias({ input, appKey: resolvedKey, confidence });
}

function maybeLearnAlias({ input, appKey, confidence }) {
  const normalizedInput = normalizeKey(input);
  const normalizedAppKey = normalizeKey(appKey);
  if (!normalizedInput || !normalizedAppKey || normalizedInput === normalizedAppKey || Number(confidence || 0) < 0.88) return;
  const db = getDb();
  const aliasRow = db.prepare('SELECT source FROM aliases WHERE alias = ?').get(normalizedInput);
  if (aliasRow?.source === 'explicit') return;
  const countRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM resolver_history
    WHERE input = ? AND app_key = ? AND confidence >= 0.88
  `).get(normalizedInput, normalizedAppKey);
  if (Number(countRow?.total || 0) < 3) return;
  setAlias(normalizedInput, normalizedAppKey, 'learned', 0.9);
}

function recordLaunch({ appKey, input, launchTarget, launchType, strategy, status, trigger, message }) {
  const normalizedAppKey = normalizeKey(appKey);
  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  db.prepare(`
    INSERT INTO launch_history (app_key, input, launch_target, launch_type, strategy, status, trigger, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    normalizedAppKey,
    String(input || ''),
    String(launchTarget || ''),
    String(launchType || ''),
    String(strategy || ''),
    String(status || ''),
    String(trigger || 'manual'),
    String(message || ''),
    nowIso,
  );

  if (status !== 'launched' || !normalizedAppKey) return;
  const row = db.prepare('SELECT launch_count, usage_hours_json FROM apps WHERE key = ?').get(normalizedAppKey);
  if (!row) return;
  const usageHours = safeJsonParse(row.usage_hours_json, {});
  const hourKey = String(now.getHours());
  usageHours[hourKey] = Number(usageHours[hourKey] || 0) + 1;
  db.prepare(`
    UPDATE apps
    SET launch_count = launch_count + 1,
        last_used_at = ?,
        usage_hours_json = ?
    WHERE key = ?
  `).run(nowIso, JSON.stringify(usageHours), normalizedAppKey);
}

module.exports = {
  getAliasMap,
  getAppByKey,
  getProviderStatus,
  getCatalogFreshness,
  getRecentApps,
  listApps,
  recordLaunch,
  recordProviderStatus,
  recordResolverDecision,
  setAlias,
  toAppRecord,
  upsertApps,
};
