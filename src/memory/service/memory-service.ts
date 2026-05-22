import type {
  MemoryEntry,
  MemoryLayer,
  MemoryQuery,
  MemorySearchResult,
  MemoryWriteRequest,
} from "@/src/memory/service/types";
import { retrieveMemory } from "@/src/memory/service/retrieval";
import { supabaseMemoryAdapter } from "@/src/memory/service/supabase-adapter";
import { randomUUID } from "node:crypto";

class InMemoryMemoryService {
  private store: MemoryEntry[] = [];

  async write(request: MemoryWriteRequest): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: randomUUID(),
      layer: request.layer,
      userId: request.userId,
      organizationId: request.organizationId ?? null,
      content: request.content,
      score: 1,
      tags: request.tags ?? [],
      createdAt: new Date().toISOString(),
    };
    this.store.push(entry);
    return entry;
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult> {
    return retrieveMemory(query, this.store);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const before = this.store.length;
    this.store = this.store.filter((entry) => !(entry.id === id && entry.userId === userId));
    return this.store.length < before;
  }

  async layerSummary(userId: string): Promise<Record<MemoryLayer, number>> {
    const layers: MemoryLayer[] = ["short_term", "episodic", "semantic", "procedural"];
    const summary = {} as Record<MemoryLayer, number>;
    for (const layer of layers) {
      summary[layer] = this.store.filter((entry) => entry.userId === userId && entry.layer === layer).length;
    }
    return summary;
  }
}

class DelegatingMemoryService {
  private fallback = new InMemoryMemoryService();

  async write(request: MemoryWriteRequest) {
    try {
      return await supabaseMemoryAdapter.write(request);
    } catch {
      return this.fallback.write(request);
    }
  }

  async search(query: MemoryQuery) {
    try {
      return await supabaseMemoryAdapter.search(query);
    } catch {
      return this.fallback.search(query);
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await supabaseMemoryAdapter.delete(id, userId);
    } catch {
      return this.fallback.delete(id, userId);
    }
  }

  async layerSummary(userId: string) {
    try {
      return await supabaseMemoryAdapter.layerSummary(userId);
    } catch {
      return this.fallback.layerSummary(userId);
    }
  }
}

export const memoryService = new DelegatingMemoryService();
