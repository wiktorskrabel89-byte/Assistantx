/**
 * Memory Service — Supabase Adapter
 *
 * Persistent implementation of the MemoryService interface backed by the
 * `user_profile_memories` Supabase table.  This replaces the in-process store
 * from memory-service.ts for production use.
 *
 * Layer mapping:
 *   short_term   → TTL-aware entries (expires within 1 hour)
 *   episodic     → Event entries keyed by timestamp
 *   semantic     → Fact/preference entries (long-lived)
 *   procedural   → Workflow pattern entries (long-lived)
 *
 * All entries use `memory_key = "<layer>:<id>"` so they can be filtered by
 * layer without a separate column.  The `memory_value` column holds JSON with
 * the full MemoryEntry shape including content, tags, and score.
 *
 * Note: embedding generation is intentionally deferred to a background job;
 * this adapter persists text entries synchronously and scores are based on
 * recency + keyword matching until vector similarity is wired.
 */

import { randomUUID } from "node:crypto";
import type {
  MemoryEntry,
  MemoryLayer,
  MemoryQuery,
  MemorySearchResult,
  MemoryWriteRequest,
} from "@/src/memory/service/types";

// ─────────────────────────────────────────────────────────────────────────────
// DB row shape
// ─────────────────────────────────────────────────────────────────────────────

type MemoryDbRow = {
  id: string;
  user_id: string;
  memory_key: string;
  memory_value: string;
  created_at: string;
  updated_at: string;
};

type MemoryValuePayload = {
  layer: MemoryLayer;
  content: string;
  score: number;
  tags: string[];
  organizationId: string | null;
  expiresAt?: string;
};

const LAYER_PREFIX = "runtime_memory:";
const VALID_LAYERS = new Set<MemoryLayer>(["short_term", "episodic", "semantic", "procedural"]);

function makeKey(layer: MemoryLayer, id: string): string {
  return `${LAYER_PREFIX}${layer}:${id}`;
}

function parseKey(key: string): { layer: MemoryLayer; id: string } | null {
  if (!key.startsWith(LAYER_PREFIX)) return null;
  const rest = key.slice(LAYER_PREFIX.length);
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) return null;
  const layer = rest.slice(0, colonIdx) as MemoryLayer;
  const id = rest.slice(colonIdx + 1);
  if (!VALID_LAYERS.has(layer)) return null;
  return { layer, id };
}

function rowToEntry(row: MemoryDbRow): MemoryEntry | null {
  const parsed = parseKey(row.memory_key);
  if (!parsed) return null;

  let payload: MemoryValuePayload;
  try {
    payload = JSON.parse(row.memory_value) as MemoryValuePayload;
  } catch {
    return null;
  }

  // Skip expired entries
  if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) return null;

  return {
    id: parsed.id,
    layer: payload.layer,
    userId: row.user_id,
    organizationId: payload.organizationId,
    content: payload.content,
    score: payload.score,
    tags: payload.tags,
    createdAt: row.created_at,
    expiresAt: payload.expiresAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase adapter
// ─────────────────────────────────────────────────────────────────────────────

export class SupabaseMemoryAdapter {
  private async getClient() {
    const { createClient } = await import("@/lib/server");
    return createClient();
  }

  async write(request: MemoryWriteRequest): Promise<MemoryEntry> {
    const id = randomUUID();
    const now = new Date().toISOString();

    let expiresAt: string | undefined;
    if (request.layer === "short_term") {
      expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour TTL
    }

    const payload: MemoryValuePayload = {
      layer: request.layer,
      content: request.content,
      score: 1.0,
      tags: request.tags ?? [],
      organizationId: request.organizationId ?? null,
      expiresAt,
    };

    const supabase = await this.getClient();
    const { error } = await supabase.from("user_profile_memories").insert({
      id,
      user_id: request.userId,
      memory_key: makeKey(request.layer, id),
      memory_value: JSON.stringify(payload),
      created_at: now,
      updated_at: now,
    });

    if (error) {
      throw new Error(`SupabaseMemoryAdapter.write: ${error.message}`);
    }

    return {
      id,
      layer: request.layer,
      userId: request.userId,
      organizationId: request.organizationId ?? null,
      content: request.content,
      score: 1.0,
      tags: request.tags ?? [],
      createdAt: now,
      expiresAt,
    };
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult> {
    const supabase = await this.getClient();

    // Build prefix filter for layer-scoped retrieval.
    let keyPrefix = LAYER_PREFIX;
    if (query.layer) {
      keyPrefix = `${LAYER_PREFIX}${query.layer}:`;
    }

    const { data, error } = await supabase
      .from("user_profile_memories")
      .select("id, user_id, memory_key, memory_value, created_at, updated_at")
      .eq("user_id", query.userId)
      .like("memory_key", `${keyPrefix}%`)
      .order("updated_at", { ascending: false })
      .limit((query.limit ?? 20) * 3); // over-fetch to allow filtering

    if (error) {
      throw new Error(`SupabaseMemoryAdapter.search: ${error.message}`);
    }

    const entries: MemoryEntry[] = [];
    for (const row of (data ?? []) as MemoryDbRow[]) {
      const entry = rowToEntry(row);
      if (!entry) continue;

      // Org scope filter
      if (query.organizationId) {
        const matchesOrg =
          entry.organizationId === query.organizationId ||
          entry.organizationId === null;
        if (!matchesOrg) continue;
      }

      // Min score filter
      if (query.minScore !== undefined && entry.score < query.minScore) continue;

      entries.push(entry);
      if (entries.length >= (query.limit ?? 20)) break;
    }

    // Sort by score descending.
    entries.sort((a, b) => b.score - a.score);

    return { entries, totalFound: entries.length };
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const supabase = await this.getClient();

    const { error, count } = await supabase
      .from("user_profile_memories")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .like("memory_key", `${LAYER_PREFIX}%:${id}`);

    if (error) throw new Error(`SupabaseMemoryAdapter.delete: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async layerSummary(userId: string): Promise<Record<MemoryLayer, number>> {
    const supabase = await this.getClient();

    const { data } = await supabase
      .from("user_profile_memories")
      .select("memory_key")
      .eq("user_id", userId)
      .like("memory_key", `${LAYER_PREFIX}%`);

    const summary: Record<MemoryLayer, number> = {
      short_term: 0,
      episodic: 0,
      semantic: 0,
      procedural: 0,
    };

    for (const row of (data ?? []) as { memory_key: string }[]) {
      const parsed = parseKey(row.memory_key);
      if (parsed) summary[parsed.layer]++;
    }

    return summary;
  }
}

/** Singleton adapter for use across the runtime. */
export const supabaseMemoryAdapter = new SupabaseMemoryAdapter();
