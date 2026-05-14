const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { readState } = require('../local-state');

const BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const DB_PATH = process.env.JARVIS_LAUNCHER_DB_PATH || path.join(BASE_DIR, 'launcher.db');

let db;

function ensureBaseDir() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

function runMigrations(database) {
  database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS apps (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      launch_target TEXT NOT NULL,
      launch_type TEXT NOT NULL,
      source_provider TEXT,
      icon_path TEXT,
      install_root TEXT,
      risk_level TEXT DEFAULT 'safe',
      launch_count INTEGER DEFAULT 0,
      last_used_at TEXT,
      usage_hours_json TEXT DEFAULT '{}',
      last_indexed_at TEXT,
      metadata_json TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS aliases (
      alias TEXT PRIMARY KEY,
      app_key TEXT NOT NULL,
      source TEXT NOT NULL,
      learned_confidence REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS launch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_key TEXT,
      input TEXT,
      launch_target TEXT,
      launch_type TEXT,
      strategy TEXT,
      status TEXT,
      trigger TEXT,
      message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resolver_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input TEXT,
      app_key TEXT,
      strategy TEXT,
      confidence REAL,
      matched_input TEXT,
      trigger TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_status (
      provider TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      detail TEXT,
      checked_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_apps_last_used ON apps(last_used_at DESC);
    CREATE INDEX IF NOT EXISTS idx_apps_launch_count ON apps(launch_count DESC);
    CREATE INDEX IF NOT EXISTS idx_aliases_app_key ON aliases(app_key);
    CREATE INDEX IF NOT EXISTS idx_history_app_key ON launch_history(app_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_resolver_input ON resolver_history(input, created_at DESC);
  `);
}

function migrateLegacyState(database) {
  const migratedAt = database.prepare('SELECT value FROM meta WHERE key = ?').get('legacy_state_migrated_at');
  if (migratedAt?.value) return;

  const legacyState = readState();
  const now = new Date().toISOString();
  const insertApp = database.prepare(`
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
      source_provider = COALESCE(excluded.source_provider, apps.source_provider),
      icon_path = COALESCE(excluded.icon_path, apps.icon_path),
      install_root = COALESCE(excluded.install_root, apps.install_root),
      launch_count = MAX(apps.launch_count, excluded.launch_count),
      last_used_at = COALESCE(excluded.last_used_at, apps.last_used_at),
      last_indexed_at = COALESCE(excluded.last_indexed_at, apps.last_indexed_at),
      metadata_json = excluded.metadata_json
  `);
  const insertAlias = database.prepare(`
    INSERT INTO aliases (alias, app_key, source, learned_confidence, created_at, updated_at)
    VALUES (@alias, @appKey, @source, @learnedConfidence, @createdAt, @updatedAt)
    ON CONFLICT(alias) DO UPDATE SET
      app_key = excluded.app_key,
      source = excluded.source,
      learned_confidence = excluded.learned_confidence,
      updated_at = excluded.updated_at
  `);
  const insertResolver = database.prepare(`
    INSERT INTO resolver_history (input, app_key, strategy, confidence, matched_input, trigger, created_at)
    VALUES (@input, @appKey, @strategy, @confidence, @matchedInput, @trigger, @createdAt)
  `);
  const insertMeta = database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');

  const txn = database.transaction(() => {
    const discoveredApps = Array.isArray(legacyState?.preferences?.discoveredApps)
      ? legacyState.preferences.discoveredApps
      : [];
    const appLaunchCount = legacyState?.preferences?.appLaunchCount || {};
    const recentApps = Array.isArray(legacyState?.preferences?.recentApps) ? legacyState.preferences.recentApps : [];

    discoveredApps.forEach((app, index) => {
      const key = String(app.key || app.name || '').trim().toLowerCase();
      if (!key || !app.launchTarget) return;
      const recentIndex = recentApps.indexOf(key);
      insertApp.run({
        key,
        name: String(app.name || key),
        launchTarget: String(app.launchTarget),
        launchType: String(app.launchType || (app.launchMode === 'filePath' ? 'executable' : 'shell')),
        sourceProvider: String(app.source || 'legacy-json'),
        iconPath: String(app.iconPath || ''),
        installRoot: String(app.installRoot || path.dirname(String(app.launchTarget || ''))),
        riskLevel: String(app.riskLevel || 'safe'),
        launchCount: Number(appLaunchCount[key] || 0),
        lastUsedAt: recentIndex >= 0 ? new Date(Date.now() - recentIndex * 60_000).toISOString() : null,
        usageHoursJson: '{}',
        lastIndexedAt: legacyState?.preferences?.appCatalogMeta?.lastScanAt || now,
        metadataJson: JSON.stringify({
          aliases: Array.isArray(app.aliases) ? app.aliases : [],
          importedFromLegacyState: true,
          legacyIndex: index,
        }),
      });

      (Array.isArray(app.aliases) ? app.aliases : []).forEach((alias) => {
        const normalizedAlias = String(alias || '').trim().toLowerCase();
        if (!normalizedAlias) return;
        insertAlias.run({
          alias: normalizedAlias,
          appKey: key,
          source: 'provider',
          learnedConfidence: 1,
          createdAt: now,
          updatedAt: now,
        });
      });
    });

    Object.entries(legacyState?.preferences?.appAliases || {}).forEach(([alias, appKey]) => {
      const normalizedAlias = String(alias || '').trim().toLowerCase();
      const normalizedAppKey = String(appKey || '').trim().toLowerCase();
      if (!normalizedAlias || !normalizedAppKey) return;
      insertAlias.run({
        alias: normalizedAlias,
        appKey: normalizedAppKey,
        source: 'explicit',
        learnedConfidence: 1,
        createdAt: now,
        updatedAt: now,
      });
    });

    (legacyState?.preferences?.resolverHistory || []).forEach((entry) => {
      insertResolver.run({
        input: String(entry.input || ''),
        appKey: String(entry.resolvedKey || ''),
        strategy: String(entry.strategy || 'legacy'),
        confidence: Number(entry.confidence || 0),
        matchedInput: String(entry.matchedInput || ''),
        trigger: String(entry.source || 'legacy'),
        createdAt: String(entry.createdAt || now),
      });
    });

    insertMeta.run('legacy_state_migrated_at', now);
  });

  txn();
}

function getDb() {
  if (db) return db;
  ensureBaseDir();
  db = new Database(DB_PATH);
  runMigrations(db);
  migrateLegacyState(db);
  return db;
}

function getMeta(key) {
  const database = getDb();
  return database.prepare('SELECT value FROM meta WHERE key = ?').get(String(key || ''))?.value ?? null;
}

function setMeta(key, value) {
  const database = getDb();
  database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(String(key || ''), value == null ? null : String(value));
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  closeDb,
  DB_PATH,
  getDb,
  getMeta,
  setMeta,
};
