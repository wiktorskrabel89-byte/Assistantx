"use client";

/**
 * Memory V1 — strictly user-specific recall, localStorage-backed.
 *
 * The Meridian spec splits memory along five buckets, all of which live
 * here (NEVER in the Knowledge store, per the strict separation rule).
 *
 * Schema is forward-compatible with a future per-user / per-project Supabase
 * sync — same JSON shape, the storage adapter is the only thing that changes.
 *
 * Caps prevent the JSON from growing without bound:
 *   conversationMemory  → 500 most recent entries
 *   longTermMemory      → 2000 most recent entries
 *
 * Knowledge (general learned info + graph) lives separately — do not write
 * factual knowledge here.
 */

export type MemoryV1Schema = {
  schemaVersion: 1;
  preferences: Record<string, string | number | boolean | null>;
  customInstructions: {
    systemPrompt: string;
    persona: string;
    behaviorRules: string[];
  };
  projectKnowledge: Record<
    string,
    { notes: string[]; decisions: string[]; files: string[] }
  >;
  conversationMemory: Array<{
    id: string;
    ts: number;
    role: "user" | "assistant" | "system";
    text: string;
    conversationId: string | null;
  }>;
  longTermMemory: Array<{
    id: string;
    ts: number;
    kind: "fact" | "note" | "preference" | "skill";
    text: string;
    tags: string[];
  }>;
};

const STORAGE_KEY = "jarvis.memory.v1";
const MAX_CONVERSATION = 500;
const MAX_LONG_TERM = 2000;

function nowMs(): number {
  return Date.now();
}

function newId(prefix: string): string {
  return `${prefix}-${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultSchema(): MemoryV1Schema {
  return {
    schemaVersion: 1,
    preferences: {},
    customInstructions: { systemPrompt: "", persona: "", behaviorRules: [] },
    projectKnowledge: {},
    conversationMemory: [],
    longTermMemory: [],
  };
}

function normalize(raw: unknown): MemoryV1Schema {
  const base = defaultSchema();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<MemoryV1Schema>;
  return {
    schemaVersion: 1,
    preferences:
      src.preferences && typeof src.preferences === "object" ? src.preferences : {},
    customInstructions: {
      systemPrompt: String(src.customInstructions?.systemPrompt ?? ""),
      persona: String(src.customInstructions?.persona ?? ""),
      behaviorRules: Array.isArray(src.customInstructions?.behaviorRules)
        ? src.customInstructions!.behaviorRules.map(String).filter(Boolean)
        : [],
    },
    projectKnowledge:
      src.projectKnowledge && typeof src.projectKnowledge === "object"
        ? src.projectKnowledge
        : {},
    conversationMemory: Array.isArray(src.conversationMemory)
      ? src.conversationMemory.slice(-MAX_CONVERSATION)
      : [],
    longTermMemory: Array.isArray(src.longTermMemory)
      ? src.longTermMemory.slice(-MAX_LONG_TERM)
      : [],
  };
}

/** Adapter — overridable in tests. Falls back to in-memory when storage is unavailable. */
export type MemoryStorageAdapter = {
  read(): MemoryV1Schema;
  write(next: MemoryV1Schema): void;
};

let cache: MemoryV1Schema | null = null;
const fallback: { value: MemoryV1Schema } = { value: defaultSchema() };

export const defaultMemoryStorage: MemoryStorageAdapter = {
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
  write(next: MemoryV1Schema) {
    cache = next;
    if (typeof window === "undefined") {
      fallback.value = next;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota exceeded or storage blocked — silent failure; cache still works.
      fallback.value = next;
    }
  },
};

export function readMemory(storage: MemoryStorageAdapter = defaultMemoryStorage): MemoryV1Schema {
  return storage.read();
}

export function setPreference(
  key: string,
  value: string | number | boolean | null,
  storage: MemoryStorageAdapter = defaultMemoryStorage,
): void {
  const state = storage.read();
  storage.write({ ...state, preferences: { ...state.preferences, [key]: value } });
}

export function getPreference<T = string | number | boolean | null>(
  key: string,
  fallbackValue: T | null = null,
  storage: MemoryStorageAdapter = defaultMemoryStorage,
): T | null {
  const state = storage.read();
  return key in state.preferences ? (state.preferences[key] as unknown as T) : fallbackValue;
}

export function setCustomInstructions(
  patch: Partial<MemoryV1Schema["customInstructions"]>,
  storage: MemoryStorageAdapter = defaultMemoryStorage,
): MemoryV1Schema["customInstructions"] {
  const state = storage.read();
  const next: MemoryV1Schema["customInstructions"] = {
    ...state.customInstructions,
    ...patch,
    behaviorRules: Array.isArray(patch.behaviorRules)
      ? patch.behaviorRules.map(String).filter(Boolean)
      : state.customInstructions.behaviorRules,
  };
  storage.write({ ...state, customInstructions: next });
  return next;
}

export function appendConversation(
  entry: { role: "user" | "assistant" | "system"; text: string; conversationId?: string | null },
  storage: MemoryStorageAdapter = defaultMemoryStorage,
): MemoryV1Schema["conversationMemory"][number] {
  const state = storage.read();
  const record = {
    id: newId("conv"),
    ts: nowMs(),
    role: entry.role,
    text: String(entry.text),
    conversationId: entry.conversationId ?? null,
  };
  const next = [...state.conversationMemory, record];
  storage.write({
    ...state,
    conversationMemory: next.slice(-MAX_CONVERSATION),
  });
  return record;
}

export function rememberLongTerm(
  entry: { kind?: MemoryV1Schema["longTermMemory"][number]["kind"]; text: string; tags?: string[] },
  storage: MemoryStorageAdapter = defaultMemoryStorage,
): MemoryV1Schema["longTermMemory"][number] {
  const state = storage.read();
  const record = {
    id: newId("ltm"),
    ts: nowMs(),
    kind: entry.kind ?? "note",
    text: String(entry.text),
    tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
  };
  const next = [...state.longTermMemory, record];
  storage.write({ ...state, longTermMemory: next.slice(-MAX_LONG_TERM) });
  return record;
}

export function forgetLongTerm(id: string, storage: MemoryStorageAdapter = defaultMemoryStorage): boolean {
  const state = storage.read();
  const next = state.longTermMemory.filter((e) => e.id !== id);
  if (next.length === state.longTermMemory.length) return false;
  storage.write({ ...state, longTermMemory: next });
  return true;
}

export function listLongTerm(storage: MemoryStorageAdapter = defaultMemoryStorage): MemoryV1Schema["longTermMemory"] {
  return [...storage.read().longTermMemory];
}

export function recentConversation(
  limit = 20,
  storage: MemoryStorageAdapter = defaultMemoryStorage,
): MemoryV1Schema["conversationMemory"] {
  return storage.read().conversationMemory.slice(-Math.max(1, limit));
}

export function wipeMemory(storage: MemoryStorageAdapter = defaultMemoryStorage): void {
  storage.write(defaultSchema());
}

export function exportMemory(storage: MemoryStorageAdapter = defaultMemoryStorage): string {
  return JSON.stringify(storage.read(), null, 2);
}

/**
 * Build a fresh in-memory storage adapter for tests. The default adapter
 * uses module-level cache which leaks across test cases — this returns a
 * fully isolated instance per call.
 */
export function createInMemoryStorage(): MemoryStorageAdapter {
  let store: MemoryV1Schema = defaultSchema();
  return {
    read() {
      return store;
    },
    write(next) {
      store = next;
    },
  };
}

export const MEMORY_V1_STORAGE_KEY = STORAGE_KEY;
export const MEMORY_V1_CAPS = {
  conversation: MAX_CONVERSATION,
  longTerm: MAX_LONG_TERM,
} as const;
