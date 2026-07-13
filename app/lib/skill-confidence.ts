"use client";

/**
 * Skill Confidence — tracks per-skill success/failure/runtime/usage so the
 * router can prefer higher-confidence skills. Same localStorage pattern as
 * Memory V1 but a separate key so each can be wiped independently.
 *
 * Confidence formula:
 *   raw = success / (success + failure)            (0 if never run)
 *   recency = 0.5 + 0.5 * exp(-Δdays / halfLife)   (1 today → 0.5 after halfLife)
 *   confidence = raw * recency                      (decays when unused)
 *
 * `halfLife` defaults to 14 days. Per spec the system "automatically prefers
 * higher-confidence skills", so the router consumes `confidence(skill)` and
 * sorts candidates descending.
 */

export type SkillId = string;

export type SkillStats = {
  successCount: number;
  failureCount: number;
  totalRuntimeMs: number;
  usageCount: number;
  lastUsedAt: number | null;
  lastOutcome: "success" | "failure" | null;
};

export type SkillConfidenceSchema = {
  schemaVersion: 1;
  skills: Record<SkillId, SkillStats>;
};

const STORAGE_KEY = "jarvis.skill-confidence.v1";
const DEFAULT_HALF_LIFE_DAYS = 14;
const MS_PER_DAY = 86_400_000;

function defaultStats(): SkillStats {
  return {
    successCount: 0,
    failureCount: 0,
    totalRuntimeMs: 0,
    usageCount: 0,
    lastUsedAt: null,
    lastOutcome: null,
  };
}

function defaultSchema(): SkillConfidenceSchema {
  return { schemaVersion: 1, skills: {} };
}

function normalize(raw: unknown): SkillConfidenceSchema {
  if (!raw || typeof raw !== "object") return defaultSchema();
  const src = raw as { skills?: Record<string, unknown> };
  const skills: Record<string, SkillStats> = {};
  if (src.skills && typeof src.skills === "object") {
    for (const [id, statsRaw] of Object.entries(src.skills)) {
      if (!statsRaw || typeof statsRaw !== "object") continue;
      const s = statsRaw as Partial<SkillStats>;
      skills[id] = {
        successCount: Math.max(0, Number(s.successCount) || 0),
        failureCount: Math.max(0, Number(s.failureCount) || 0),
        totalRuntimeMs: Math.max(0, Number(s.totalRuntimeMs) || 0),
        usageCount: Math.max(0, Number(s.usageCount) || 0),
        lastUsedAt: Number.isFinite(s.lastUsedAt) ? Number(s.lastUsedAt) : null,
        lastOutcome:
          s.lastOutcome === "success" || s.lastOutcome === "failure" ? s.lastOutcome : null,
      };
    }
  }
  return { schemaVersion: 1, skills };
}

export type SkillStorageAdapter = {
  read(): SkillConfidenceSchema;
  write(next: SkillConfidenceSchema): void;
};

let cache: SkillConfidenceSchema | null = null;
const fallback: { value: SkillConfidenceSchema } = { value: defaultSchema() };

export const defaultSkillStorage: SkillStorageAdapter = {
  read() {
    if (cache) return cache;
    if (typeof window === "undefined") return fallback.value;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      cache = normalize(raw ? JSON.parse(raw) : null);
      return cache;
    } catch {
      cache = defaultSchema();
      return cache;
    }
  },
  write(next: SkillConfidenceSchema) {
    cache = next;
    if (typeof window === "undefined") {
      fallback.value = next;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      fallback.value = next;
    }
  },
};

export function trackSkillSuccess(
  id: SkillId,
  runtimeMs: number,
  storage: SkillStorageAdapter = defaultSkillStorage,
): SkillStats {
  return bumpStats(id, { kind: "success", runtimeMs }, storage);
}

export function trackSkillFailure(
  id: SkillId,
  runtimeMs: number,
  storage: SkillStorageAdapter = defaultSkillStorage,
): SkillStats {
  return bumpStats(id, { kind: "failure", runtimeMs }, storage);
}

function bumpStats(
  id: SkillId,
  patch: { kind: "success" | "failure"; runtimeMs: number },
  storage: SkillStorageAdapter,
): SkillStats {
  const state = storage.read();
  const prev = state.skills[id] ?? defaultStats();
  const next: SkillStats = {
    successCount: prev.successCount + (patch.kind === "success" ? 1 : 0),
    failureCount: prev.failureCount + (patch.kind === "failure" ? 1 : 0),
    totalRuntimeMs: prev.totalRuntimeMs + Math.max(0, patch.runtimeMs),
    usageCount: prev.usageCount + 1,
    lastUsedAt: Date.now(),
    lastOutcome: patch.kind,
  };
  storage.write({ ...state, skills: { ...state.skills, [id]: next } });
  return next;
}

/** Pure scoring function. Exposed so tests can verify the recency curve. */
export function computeConfidence(
  stats: SkillStats,
  options: { halfLifeDays?: number; now?: number } = {},
): number {
  const total = stats.successCount + stats.failureCount;
  if (total === 0) return 0;
  const rawSuccess = stats.successCount / total;
  if (stats.lastUsedAt === null) return rawSuccess;
  const halfLife = options.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const now = options.now ?? Date.now();
  const ageDays = Math.max(0, (now - stats.lastUsedAt) / MS_PER_DAY);
  const recency = 0.5 + 0.5 * Math.exp(-ageDays / Math.max(0.01, halfLife));
  return Math.min(1, Math.max(0, rawSuccess * recency));
}

/** Returns skills sorted by confidence descending. */
export function rankSkills(
  storage: SkillStorageAdapter = defaultSkillStorage,
): Array<{ id: SkillId; stats: SkillStats; confidence: number }> {
  const state = storage.read();
  return Object.entries(state.skills)
    .map(([id, stats]) => ({ id, stats, confidence: computeConfidence(stats) }))
    .sort((a, b) => b.confidence - a.confidence);
}

export function preferHigherConfidence(
  candidates: SkillId[],
  storage: SkillStorageAdapter = defaultSkillStorage,
): SkillId | null {
  if (candidates.length === 0) return null;
  const state = storage.read();
  let best: { id: SkillId; confidence: number } | null = null;
  for (const id of candidates) {
    const stats = state.skills[id] ?? defaultStats();
    const confidence = computeConfidence(stats);
    if (!best || confidence > best.confidence) best = { id, confidence };
  }
  return best?.id ?? null;
}

export function getSkillStats(
  id: SkillId,
  storage: SkillStorageAdapter = defaultSkillStorage,
): SkillStats {
  return storage.read().skills[id] ?? defaultStats();
}

export function wipeSkills(storage: SkillStorageAdapter = defaultSkillStorage): void {
  storage.write(defaultSchema());
}

export function createInMemorySkillStorage(): SkillStorageAdapter {
  let store = defaultSchema();
  return {
    read() {
      return store;
    },
    write(next) {
      store = next;
    },
  };
}

export const SKILL_CONFIDENCE_STORAGE_KEY = STORAGE_KEY;
