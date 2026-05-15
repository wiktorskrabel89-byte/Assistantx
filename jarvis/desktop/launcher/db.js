const fs = require('fs');
const os = require('os');
const path = require('path');
const { readState } = require('../local-state');

const BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const DB_PATH = process.env.JARVIS_LAUNCHER_DB_PATH || path.join(BASE_DIR, 'launcher.db');

let db = null;
// Single in-flight init promise so that concurrent callers awaiting init()
// share the same WASM load rather than each triggering a separate one.
let _initPromise = null;
// Tracks how many transaction wrappers are currently active.  Flushing to
// disk via db.export() must not happen while a transaction is open because
// sql.js's export() implicitly ends the active transaction.
//
// Electron's main process (like all Node.js code) is single-threaded, so
// this module-level counter is safe: only one call path is executing at a
// time, making concurrent transactions impossible without explicit async
// interleaving, which the callers do not perform.
let _inTransaction = 0;

// ── Disk persistence ─────────────────────────────────────────────────────────

function ensureBaseDir() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

function flushToDisk() {
  if (!db) return;
  ensureBaseDir();
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ── sql.js compatibility shim ─────────────────────────────────────────────────
//
// Provides a better-sqlite3-like synchronous API over an in-memory sql.js
// Database so that callers (catalog.js, launch-service.js, etc.) need no
// changes.

function normalisedBindParams(args) {
  if (args.length === 0) return undefined;

  // Named-params object: { key: val } → { '@key': val }
  if (
    args.length === 1
    && args[0] !== null
    && typeof args[0] === 'object'
    && !Array.isArray(args[0])
  ) {
    const obj = args[0];
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const prefixed = /^[@:$]/.test(k) ? k : `@${k}`;
      out[prefixed] = v == null ? null : v;
    }
    return out;
  }

  // One or more positional args
  return args.length === 1 ? [args[0]] : [...args];
}

function createStmtWrapper(sqlDb, sql) {
  // Prepare once; reuse across calls (mirrors better-sqlite3 behaviour).
  const stmt = sqlDb.prepare(sql);

  function bindAndRun(args) {
    stmt.reset();
    const params = normalisedBindParams(args);
    if (params !== undefined) stmt.bind(params);
  }

  return {
    all(...args) {
      bindAndRun(args);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.reset();
      return rows;
    },
    get(...args) {
      bindAndRun(args);
      const row = stmt.step() ? stmt.getAsObject() : undefined;
      stmt.reset();
      return row;
    },
    run(...args) {
      bindAndRun(args);
      stmt.step();
      stmt.reset();
      // Only flush to disk when NOT inside a transaction.  sql.js's export()
      // implicitly ends any active transaction so we must defer flushing until
      // after the surrounding transactionRunner calls COMMIT and flushes once.
      if (_inTransaction === 0) flushToDisk();
    },
  };
}

function createDbWrapper(sqlDb) {
  return {
    pragma(text) {
      // sql.js is in-memory so most PRAGMAs are no-ops; run anyway for
      // correctness (e.g. PRAGMA integrity_check).
      try { sqlDb.run(`PRAGMA ${text}`); } catch { /* ignore */ }
    },
    exec(sql) {
      sqlDb.exec(sql);
    },
    prepare(sql) {
      return createStmtWrapper(sqlDb, sql);
    },
    transaction(fn) {
      // Returns a function that wraps fn in a BEGIN / COMMIT block,
      // exactly like better-sqlite3's db.transaction().
      return function transactionRunner(...args) {
        _inTransaction += 1;
        sqlDb.run('BEGIN');
        let originalErr = null;
        try {
          const result = fn(...args);
          sqlDb.run('COMMIT');
          _inTransaction -= 1;
          flushToDisk();
          return result;
        } catch (err) {
          originalErr = err;
          _inTransaction -= 1;
          try {
            sqlDb.run('ROLLBACK');
          } catch {
            // Transaction may already have been rolled back implicitly.
          }
          throw originalErr;
        }
      };
    },
  };
}

// ── Schema setup ──────────────────────────────────────────────────────────────

function runMigrations(wrapper) {
  // journal_mode = WAL has no effect for an in-memory / file-export DB but is
  // harmless; skip it to avoid a sql.js warning.
  wrapper.exec(`
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

function migrateLegacyState(wrapper) {
  const migratedAt = wrapper.prepare('SELECT value FROM meta WHERE key = ?').get('legacy_state_migrated_at');
  if (migratedAt?.value) return;

  const legacyState = readState();
  const now = new Date().toISOString();
  const insertApp = wrapper.prepare(`
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
  const insertAlias = wrapper.prepare(`
    INSERT INTO aliases (alias, app_key, source, learned_confidence, created_at, updated_at)
    VALUES (@alias, @appKey, @source, @learnedConfidence, @createdAt, @updatedAt)
    ON CONFLICT(alias) DO UPDATE SET
      app_key = excluded.app_key,
      source = excluded.source,
      learned_confidence = excluded.learned_confidence,
      updated_at = excluded.updated_at
  `);
  const insertResolver = wrapper.prepare(`
    INSERT INTO resolver_history (input, app_key, strategy, confidence, matched_input, trigger, created_at)
    VALUES (@input, @appKey, @strategy, @confidence, @matchedInput, @trigger, @createdAt)
  `);
  const insertMeta = wrapper.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');

  const txn = wrapper.transaction(() => {
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise the database. Must be awaited once at app startup (before any
 * DB calls are made) because sql.js loads a WebAssembly binary asynchronously.
 * Concurrent calls share the same in-flight promise so WASM is only loaded once.
 */
function init() {
  // Already initialised — fast path.
  if (db) return Promise.resolve();

  // Another caller is already loading WASM — piggyback on that promise.
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Resolve WASM binary via Node module resolution so tests and app runtime
    // both work regardless of which node_modules directory provides sql.js.
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    const wasmBinary = fs.readFileSync(wasmPath);

    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs({ wasmBinary });

    ensureBaseDir();

    const rawDb = fs.existsSync(DB_PATH)
      ? new SQL.Database(fs.readFileSync(DB_PATH))
      : new SQL.Database();

    db = rawDb;

    const wrapper = createDbWrapper(rawDb);
    runMigrations(wrapper);
    migrateLegacyState(wrapper);
    flushToDisk();
  })();

  return _initPromise;
}

function getDb() {
  if (!db) throw new Error('[db] Database not initialised — await init() must be called first.');
  return createDbWrapper(db);
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
    flushToDisk();
    db.close();
    db = null;
    _initPromise = null;
  }
}

module.exports = {
  closeDb,
  DB_PATH,
  getDb,
  getMeta,
  init,
  setMeta,
};

