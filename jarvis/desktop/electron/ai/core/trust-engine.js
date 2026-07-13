'use strict';

/**
 * Trust Engine — Jarvis Core system #12. Per-model/provider reliability
 * scoring, updated after every Basic Review Pipeline outcome. Distinct from
 * Skill Confidence (which scores user-facing skills, not model/provider
 * dispatch targets). Same JSON-on-disk pattern as the other userData
 * stores.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const DEFAULT_FILE = 'trust-engine.json';

function defaultState() {
  return { schemaVersion: 1, models: {} };
}

function defaultModelStats() {
  return { successCount: 0, failureCount: 0, confidenceSum: 0, confidenceSamples: 0, lastUpdatedAt: 0 };
}

function createTrustEngine({ baseDir = DEFAULT_BASE_DIR, fileName = DEFAULT_FILE } = {}) {
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
        models: (raw.models && typeof raw.models === 'object') ? raw.models : {},
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

  function recordOutcome(modelId, { ok = true, confidence = null } = {}) {
    if (!modelId) return null;
    const state = readState();
    const stats = state.models[modelId] || defaultModelStats();
    if (ok) stats.successCount += 1;
    else stats.failureCount += 1;
    if (Number.isFinite(confidence)) {
      stats.confidenceSum += Number(confidence);
      stats.confidenceSamples += 1;
    }
    stats.lastUpdatedAt = Date.now();
    state.models[modelId] = stats;
    writeState();
    return { ...stats };
  }

  function trustScore(modelId) {
    const stats = readState().models[modelId];
    if (!stats) return null;
    const total = stats.successCount + stats.failureCount;
    if (total === 0) return null;
    const successRate = stats.successCount / total;
    const avgConfidence = stats.confidenceSamples > 0 ? stats.confidenceSum / stats.confidenceSamples : successRate;
    return Number(((successRate + avgConfidence) / 2).toFixed(3));
  }

  function rankModels() {
    return Object.keys(readState().models)
      .map((modelId) => ({ modelId, score: trustScore(modelId) }))
      .filter((r) => r.score !== null)
      .sort((a, b) => b.score - a.score);
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(readState()));
  }

  function wipe() {
    cache = defaultState();
    writeState();
  }

  return { filePath, recordOutcome, trustScore, rankModels, snapshot, wipe };
}

module.exports = { createTrustEngine, DEFAULT_FILE };
