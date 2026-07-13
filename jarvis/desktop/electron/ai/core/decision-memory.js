'use strict';

/**
 * Decision Memory — Jarvis Core system #10. A queryable history of every
 * routed decision (mode, confidence, route, review/advocate outcomes),
 * distinct from conversationMemory/longTermMemory in memory-store.js. Same
 * JSON-on-disk pattern as the other userData stores.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const DEFAULT_FILE = 'decision-memory.json';
const MAX_DECISIONS = 1000;

function defaultState() {
  return { schemaVersion: 1, decisions: [] };
}

function newId() {
  return `dec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDecisionMemory({ baseDir = DEFAULT_BASE_DIR, fileName = DEFAULT_FILE } = {}) {
  const filePath = path.join(baseDir, fileName);
  let cache = null;

  function ensureDir() {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  function readState() {
    if (cache) return cache;
    try {
      if (!fs.existsSync(filePath)) {
        cache = defaultState();
        return cache;
      }
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      cache = {
        schemaVersion: Number(raw.schemaVersion) || 1,
        decisions: Array.isArray(raw.decisions) ? raw.decisions.slice(-MAX_DECISIONS) : [],
      };
      return cache;
    } catch {
      cache = defaultState();
      return cache;
    }
  }

  function writeState() {
    if (!cache) return;
    ensureDir();
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  }

  function recordDecision(entry = {}) {
    const state = readState();
    const record = {
      id: entry.id || newId(),
      ts: Number(entry.ts) || Date.now(),
      mode: entry.mode || 'quick',
      confidence: Number.isFinite(entry.confidence) ? entry.confidence : null,
      route: entry.route || null,
      reviewOk: entry.reviewOk !== undefined ? Boolean(entry.reviewOk) : null,
      advocateFlags: Array.isArray(entry.advocateFlags) ? entry.advocateFlags : [],
      action: entry.action || 'proceed',
    };
    state.decisions.push(record);
    if (state.decisions.length > MAX_DECISIONS) {
      state.decisions.splice(0, state.decisions.length - MAX_DECISIONS);
    }
    writeState();
    return record;
  }

  function recentDecisions(limit = 50) {
    return readState().decisions.slice(-Math.max(1, limit));
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(readState()));
  }

  function wipe() {
    cache = defaultState();
    writeState();
  }

  return { filePath, recordDecision, recentDecisions, snapshot, wipe };
}

module.exports = { createDecisionMemory, DEFAULT_FILE, MAX_DECISIONS };
