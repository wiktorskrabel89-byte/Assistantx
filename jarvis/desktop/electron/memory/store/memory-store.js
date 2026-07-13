'use strict';

/**
 * Memory store (M7) — user-specific recall durable across sessions.
 *
 * Sibling to electron/memory/context (compression) and retrieval/ (search).
 * Pattern mirrors jarvis/desktop/local-state.js: plain JSON written to the
 * userData / APPDATA folder, atomic-ish writes via temp file + rename.
 *
 * The schema is split per the V2.0 spec into 5 named buckets:
 *   - preferences        : { [key]: value }       — user knobs (theme, lang…)
 *   - customInstructions : { systemPrompt, persona, behaviorRules: [] }
 *   - projectKnowledge   : { [projectId]: { notes:[], decisions:[], files:[] } }
 *   - conversationMemory : [ { id, timestamp, role, text, conversationId } ]
 *   - longTermMemory     : [ { id, timestamp, kind, text, tags:[], embedding? } ]
 *
 * conversationMemory + longTermMemory are arrays (recent at the end) and
 * capped so the JSON stays under ~1MB even after months of use.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const DEFAULT_FILE = 'memory-store.json';
const MAX_CONVERSATION_MEMORY = 500;
const MAX_LONG_TERM_MEMORY = 2000;

function defaultState() {
  return {
    schemaVersion: 1,
    preferences: {},
    customInstructions: {
      systemPrompt: '',
      persona: '',
      behaviorRules: [],
    },
    projectKnowledge: {},
    conversationMemory: [],
    longTermMemory: [],
  };
}

function nowMs() {
  return Date.now();
}

function newId(prefix) {
  return `${prefix}-${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createMemoryStore({ baseDir = DEFAULT_BASE_DIR, fileName = DEFAULT_FILE } = {}) {
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
      const parsed = JSON.parse(raw);
      cache = normalize(parsed);
      return cache;
    } catch {
      cache = defaultState();
      return cache;
    }
  }

  function normalize(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    return {
      schemaVersion: Number(raw.schemaVersion) || base.schemaVersion,
      preferences: (raw.preferences && typeof raw.preferences === 'object') ? raw.preferences : {},
      customInstructions: {
        ...base.customInstructions,
        ...(raw.customInstructions && typeof raw.customInstructions === 'object' ? raw.customInstructions : {}),
        behaviorRules: Array.isArray(raw.customInstructions?.behaviorRules)
          ? raw.customInstructions.behaviorRules.map(String).filter(Boolean)
          : [],
      },
      projectKnowledge: (raw.projectKnowledge && typeof raw.projectKnowledge === 'object') ? raw.projectKnowledge : {},
      conversationMemory: Array.isArray(raw.conversationMemory) ? raw.conversationMemory.slice(-MAX_CONVERSATION_MEMORY) : [],
      longTermMemory: Array.isArray(raw.longTermMemory) ? raw.longTermMemory.slice(-MAX_LONG_TERM_MEMORY) : [],
    };
  }

  function writeState() {
    if (!cache) return;
    ensureDir();
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(readState()));
  }

  // ── Preferences ──────────────────────────────────────────────────────
  function setPreference(key, value) {
    const state = readState();
    state.preferences[String(key)] = value;
    writeState();
    return state.preferences[String(key)];
  }
  function getPreference(key, fallback = null) {
    const state = readState();
    return key in state.preferences ? state.preferences[key] : fallback;
  }

  // ── Custom instructions ──────────────────────────────────────────────
  function setCustomInstructions(patch = {}) {
    const state = readState();
    state.customInstructions = {
      ...state.customInstructions,
      ...patch,
      behaviorRules: Array.isArray(patch.behaviorRules)
        ? patch.behaviorRules.map(String).filter(Boolean)
        : state.customInstructions.behaviorRules,
    };
    writeState();
    return { ...state.customInstructions };
  }
  function getCustomInstructions() {
    return { ...readState().customInstructions };
  }

  // ── Project knowledge ────────────────────────────────────────────────
  function upsertProjectKnowledge(projectId, patch = {}) {
    const state = readState();
    const id = String(projectId);
    const current = state.projectKnowledge[id] || { notes: [], decisions: [], files: [] };
    state.projectKnowledge[id] = {
      ...current,
      ...patch,
      notes: Array.isArray(patch.notes) ? patch.notes : current.notes,
      decisions: Array.isArray(patch.decisions) ? patch.decisions : current.decisions,
      files: Array.isArray(patch.files) ? patch.files : current.files,
    };
    writeState();
    return state.projectKnowledge[id];
  }
  function getProjectKnowledge(projectId) {
    const state = readState();
    return state.projectKnowledge[String(projectId)] || null;
  }

  // ── Conversation memory ──────────────────────────────────────────────
  function appendConversation(entry = {}) {
    const state = readState();
    const record = {
      id: entry.id || newId('conv'),
      timestamp: Number(entry.timestamp) || nowMs(),
      role: String(entry.role || 'user'),
      text: String(entry.text || ''),
      conversationId: entry.conversationId ? String(entry.conversationId) : null,
    };
    state.conversationMemory.push(record);
    if (state.conversationMemory.length > MAX_CONVERSATION_MEMORY) {
      state.conversationMemory.splice(0, state.conversationMemory.length - MAX_CONVERSATION_MEMORY);
    }
    writeState();
    return record;
  }
  function recentConversation(limit = 20) {
    const state = readState();
    return state.conversationMemory.slice(-Math.max(1, limit));
  }

  // ── Long-term memory (free-form recall) ──────────────────────────────
  function rememberLongTerm(entry = {}) {
    const state = readState();
    const record = {
      id: entry.id || newId('ltm'),
      timestamp: Number(entry.timestamp) || nowMs(),
      kind: String(entry.kind || 'note'),
      text: String(entry.text || ''),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
      embedding: Array.isArray(entry.embedding) ? entry.embedding : null,
    };
    state.longTermMemory.push(record);
    if (state.longTermMemory.length > MAX_LONG_TERM_MEMORY) {
      state.longTermMemory.splice(0, state.longTermMemory.length - MAX_LONG_TERM_MEMORY);
    }
    writeState();
    return record;
  }
  function listLongTerm() {
    return readState().longTermMemory.slice();
  }
  function forgetLongTerm(id) {
    const state = readState();
    const before = state.longTermMemory.length;
    state.longTermMemory = state.longTermMemory.filter((entry) => entry.id !== id);
    const removed = before - state.longTermMemory.length;
    if (removed > 0) writeState();
    return removed > 0;
  }

  // ── Bulk export / wipe ───────────────────────────────────────────────
  function exportAll() {
    return snapshot();
  }
  function wipe() {
    cache = defaultState();
    writeState();
  }

  return {
    filePath,
    snapshot,
    setPreference,
    getPreference,
    setCustomInstructions,
    getCustomInstructions,
    upsertProjectKnowledge,
    getProjectKnowledge,
    appendConversation,
    recentConversation,
    rememberLongTerm,
    listLongTerm,
    forgetLongTerm,
    exportAll,
    wipe,
  };
}

module.exports = {
  createMemoryStore,
  DEFAULT_FILE,
  MAX_CONVERSATION_MEMORY,
  MAX_LONG_TERM_MEMORY,
};
