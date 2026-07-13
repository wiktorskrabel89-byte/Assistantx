'use strict';

/**
 * Knowledge store (M7) — general learned information + relationship graph.
 *
 * Strictly distinct from memory-store (user-specific): this is the
 * "everything Jarvis knows about projects / skills / lessons / users /
 * integrations / agents" graph, forward-compatible with the Phase 5
 * knowledge-graph epic.
 *
 * Schema:
 *   entities  : [ { id, type, label, payload, createdAt, updatedAt } ]
 *   relations : [ { id, type, from, to, weight, createdAt } ]
 *
 * Entity types: project | skill | lesson | user | integration | agent | blueprint.
 * `blueprint` payloads carry the Intelligent Requirements System's output:
 * { goal, requirements[], features[], techStack[], risks[], timeline, costEstimate, projectId }.
 * Relations are directed edges; type is open string (e.g. "uses",
 * "depends_on", "learned_from", "owns").
 *
 * Plain JSON on disk, same atomic-rename write strategy as memory-store.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const DEFAULT_FILE = 'knowledge-store.json';
const VALID_ENTITY_TYPES = new Set(['project', 'skill', 'lesson', 'user', 'integration', 'agent', 'blueprint']);

function defaultState() {
  return {
    schemaVersion: 1,
    entities: [],
    relations: [],
  };
}

function nowMs() {
  return Date.now();
}

function newId(prefix) {
  return `${prefix}-${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createKnowledgeStore({ baseDir = DEFAULT_BASE_DIR, fileName = DEFAULT_FILE } = {}) {
  const filePath = path.join(baseDir, fileName);
  let cache = null;

  function ensureDir() {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  function normalize(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    return {
      schemaVersion: Number(raw.schemaVersion) || base.schemaVersion,
      entities: Array.isArray(raw.entities) ? raw.entities.map(normalizeEntity).filter(Boolean) : [],
      relations: Array.isArray(raw.relations) ? raw.relations.map(normalizeRelation).filter(Boolean) : [],
    };
  }

  function normalizeEntity(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const type = String(raw.type || '');
    if (!VALID_ENTITY_TYPES.has(type)) return null;
    return {
      id: String(raw.id || newId(type)),
      type,
      label: String(raw.label || ''),
      payload: (raw.payload && typeof raw.payload === 'object') ? raw.payload : {},
      createdAt: Number(raw.createdAt) || nowMs(),
      updatedAt: Number(raw.updatedAt) || nowMs(),
    };
  }

  function normalizeRelation(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const from = String(raw.from || '');
    const to = String(raw.to || '');
    if (!from || !to) return null;
    return {
      id: String(raw.id || newId('rel')),
      type: String(raw.type || 'relates_to'),
      from,
      to,
      weight: Number.isFinite(raw.weight) ? Number(raw.weight) : 1,
      createdAt: Number(raw.createdAt) || nowMs(),
    };
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

  function snapshot() {
    return JSON.parse(JSON.stringify(readState()));
  }

  // ── Entities ─────────────────────────────────────────────────────────
  function upsertEntity(entity = {}) {
    const normalized = normalizeEntity(entity);
    if (!normalized) throw new Error(`knowledge-store: invalid entity type "${entity?.type}"`);
    const state = readState();
    const idx = state.entities.findIndex((e) => e.id === normalized.id);
    if (idx >= 0) {
      state.entities[idx] = {
        ...state.entities[idx],
        ...normalized,
        createdAt: state.entities[idx].createdAt,
        updatedAt: nowMs(),
      };
    } else {
      state.entities.push(normalized);
    }
    writeState();
    return normalized;
  }
  function getEntity(id) {
    return readState().entities.find((e) => e.id === id) || null;
  }
  function listEntities({ type = null } = {}) {
    const all = readState().entities;
    return type ? all.filter((e) => e.type === type) : all.slice();
  }
  function removeEntity(id) {
    const state = readState();
    const before = state.entities.length;
    state.entities = state.entities.filter((e) => e.id !== id);
    state.relations = state.relations.filter((r) => r.from !== id && r.to !== id);
    if (state.entities.length !== before) writeState();
    return before - state.entities.length;
  }

  // ── Relations ────────────────────────────────────────────────────────
  function link(from, to, type = 'relates_to', weight = 1) {
    const state = readState();
    const relation = normalizeRelation({ from, to, type, weight });
    if (!relation) throw new Error('knowledge-store: link() requires from & to');
    state.relations.push(relation);
    writeState();
    return relation;
  }
  function unlink(relationId) {
    const state = readState();
    const before = state.relations.length;
    state.relations = state.relations.filter((r) => r.id !== relationId);
    if (state.relations.length !== before) writeState();
    return before - state.relations.length;
  }
  function neighbors(entityId, { direction = 'both', type = null } = {}) {
    const state = readState();
    return state.relations.filter((r) => {
      if (type && r.type !== type) return false;
      if (direction === 'out') return r.from === entityId;
      if (direction === 'in') return r.to === entityId;
      return r.from === entityId || r.to === entityId;
    });
  }

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
    upsertEntity,
    getEntity,
    listEntities,
    removeEntity,
    link,
    unlink,
    neighbors,
    exportAll,
    wipe,
  };
}

module.exports = {
  createKnowledgeStore,
  VALID_ENTITY_TYPES: Array.from(VALID_ENTITY_TYPES),
  DEFAULT_FILE,
};
