/**
 * @jest-environment node
 */

import { retrieveMemory } from "@/src/memory/service/retrieval";
import type { MemoryEntry } from "@/src/memory/service/types";

function makeEntry(params: Partial<MemoryEntry> & Pick<MemoryEntry, "id" | "content">): MemoryEntry {
  return {
    id: params.id,
    layer: params.layer ?? "semantic",
    userId: params.userId ?? "user-1",
    organizationId: params.organizationId ?? null,
    content: params.content,
    score: params.score ?? 1,
    tags: params.tags ?? [],
    createdAt: params.createdAt ?? new Date().toISOString(),
  };
}

describe("memory retrieval semantic scoring", () => {
  it("boosts entries matching query terms", async () => {
    const entries: MemoryEntry[] = [
      makeEntry({ id: "a", content: "Deployment runbook for production rollout", tags: ["deploy"] }),
      makeEntry({ id: "b", content: "Grocery shopping list for weekend", tags: ["personal"] }),
    ];

    const result = await retrieveMemory(
      {
        userId: "user-1",
        query: "deploy production",
        limit: 5,
      },
      entries,
    );

    expect(result.entries[0]?.id).toBe("a");
  });
});

