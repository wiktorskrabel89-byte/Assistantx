'use strict';

/**
 * Skill Confidence store — per-skill success/failure tracking so the router
 * can prefer higher-confidence skills when two could handle the same task.
 *
 * Pattern matches memory-store.js + knowledge-store.js (M7): plain JSON in
 * the userData folder, atomic-ish writes via temp file + rename.
 *
 * Schema:
 *   skills : { [skillId]: { successCount, failureCount, totalRuntimeMs,
 *                          usageCount, lastUsedAt, lastOutcome } }
 *
 * Confidence formula (recency-weighted):
 *   raw      = success / (success + failure)            (0 if never run)
 *   recency  = 0.5 + 0.5 * exp(-Δdays / halfLife)       (1 today → 0.5 after halfLife)
 *   conf     = raw * recency                            (decays with disuse)
 *
 * The router calls `preferHigherConfidence(candidateIds)` to pick the winner
 * among multiple candidates; the Workspace → Umiejętności panel calls
 * `rankSkills()` to render the leaderboard.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const DEFAULT_FILE = 'skill-confidence.json';
const DEFAULT_HALF_LIFE_DAYS = 14;
const MS_PER_DAY = 86_400_000;

function defaultStats() {
  return {
    successCount: 0,
    failureCount: 0,
    totalRuntimeMs: 0,
    usageCount: 0,
    lastUsedAt: null,
    lastOutcome: null,
  };
}

function defaultState() {
  return { schemaVersion: 1, skills: {} };
}

function normalize(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const skills = {};
  if (raw.skills && typeof raw.skills === 'object') {
    for (const [id, statsRaw] of Object.entries(raw.skills)) {
      if (!statsRaw || typeof statsRaw !== 'object') continue;
      skills[String(id)] = {
        successCount: Math.max(0, Number(statsRaw.successCount) || 0),
        failureCount: Math.max(0, Number(statsRaw.failureCount) || 0),
        totalRuntimeMs: Math.max(0, Number(statsRaw.totalRuntimeMs) || 0),
        usageCount: Math.max(0, Number(statsRaw.usageCount) || 0),
        lastUsedAt: Number.isFinite(statsRaw.lastUsedAt) ? Number(statsRaw.lastUsedAt) : null,
        lastOutcome:
          statsRaw.lastOutcome === 'success' || statsRaw.lastOutcome === 'failure'
            ? statsRaw.lastOutcome
            : null,
      };
    }
  }
  return { schemaVersion: 1, skills };
}

/**
 * Pure scoring function. Exposed so tests verify the decay curve without
 * touching disk.
 */
function computeConfidence(stats, options = {}) {
  if (!stats) return 0;
  const total = (stats.successCount || 0) + (stats.failureCount || 0);
  if (total === 0) return 0;
  const rawSuccess = stats.successCount / total;
  if (stats.lastUsedAt == null) return rawSuccess;
  const halfLife = Number(options.halfLifeDays) || DEFAULT_HALF_LIFE_DAYS;
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
  const ageDays = Math.max(0, (now - stats.lastUsedAt) / MS_PER_DAY);
  const recency = 0.5 + 0.5 * Math.exp(-ageDays / Math.max(0.01, halfLife));
  return Math.min(1, Math.max(0, rawSuccess * recency));
}

function createSkillConfidenceStore({ baseDir = DEFAULT_BASE_DIR, fileName = DEFAULT_FILE } = {}) {
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
      const raw = fs.readFileSync(filePath, 'utf8');
      cache = normalize(JSON.parse(raw));
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

  function bumpStats(id, kind, runtimeMs) {
    const state = readState();
    const skillId = String(id);
    const prev = state.skills[skillId] ?? defaultStats();
    const next = {
      successCount: prev.successCount + (kind === 'success' ? 1 : 0),
      failureCount: prev.failureCount + (kind === 'failure' ? 1 : 0),
      totalRuntimeMs: prev.totalRuntimeMs + Math.max(0, Number(runtimeMs) || 0),
      usageCount: prev.usageCount + 1,
      lastUsedAt: Date.now(),
      lastOutcome: kind,
    };
    state.skills[skillId] = next;
    writeState();
    return next;
  }

  return {
    filePath,
    snapshot() {
      return JSON.parse(JSON.stringify(readState()));
    },
    trackSuccess(id, runtimeMs = 0) {
      return bumpStats(id, 'success', runtimeMs);
    },
    trackFailure(id, runtimeMs = 0) {
      return bumpStats(id, 'failure', runtimeMs);
    },
    getStats(id) {
      const state = readState();
      return state.skills[String(id)] ?? defaultStats();
    },
    /** Sorted by confidence descending. */
    rankSkills() {
      const state = readState();
      return Object.entries(state.skills)
        .map(([id, stats]) => ({ id, stats, confidence: computeConfidence(stats) }))
        .sort((a, b) => b.confidence - a.confidence);
    },
    /** Returns the higher-confidence id from `candidates`, or null. */
    preferHigherConfidence(candidates) {
      if (!Array.isArray(candidates) || candidates.length === 0) return null;
      const state = readState();
      let best = null;
      for (const id of candidates) {
        const stats = state.skills[String(id)] ?? defaultStats();
        const confidence = computeConfidence(stats);
        if (!best || confidence > best.confidence) best = { id: String(id), confidence };
      }
      return best?.id ?? null;
    },
    wipe() {
      cache = defaultState();
      writeState();
    },
  };
}

module.exports = {
  createSkillConfidenceStore,
  computeConfidence,
  DEFAULT_HALF_LIFE_DAYS,
};
