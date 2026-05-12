import type {
  MemoryEntry,
  MemoryLayer,
  MemoryQuery,
  MemorySearchResult,
  MemoryWriteRequest,
} from "@/src/memory/service/types";
import { retrieveMemory } from "@/src/memory/service/retrieval";
import { randomUUID } from "node:crypto";

export class MemoryService {
  // Phase-2: in-process store until Supabase wiring is complete.
  private store: MemoryEntry[] = [];

  async write(request: MemoryWriteRequest): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: randomUUID(),
      layer: request.layer,
      userId: request.userId,
      organizationId: request.organizationId ?? null,
      content: request.content,
      score: 1.0,
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
    this.store = this.store.filter((e) => !(e.id === id && e.userId === userId));
    return this.store.length < before;
  }

  async layerSummary(
    userId: string,
  ): Promise<Record<MemoryLayer, number>> {
    const layers: MemoryLayer[] = ["short_term", "episodic", "semantic", "procedural"];
    const summary = {} as Record<MemoryLayer, number>;
    for (const layer of layers) {
      summary[layer] = this.store.filter(
        (e) => e.userId === userId && e.layer === layer,
      ).length;
    }
    return summary;
  }
}

export const memoryService = new MemoryService();
