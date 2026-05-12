import type { CostLane, CostRecord } from "@/src/core/cost/types";
import { estimateCost } from "@/src/core/cost/types";
import { createEventBus } from "@/src/core/events/event-bus";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";
import { randomUUID } from "node:crypto";

const eventBus = createEventBus();

/**
 * Cost Tracker — Phase 2 persistent implementation.
 *
 * Cost records are persisted to `cost_records` in Supabase.
 * The in-memory ledger is kept as a short-term cache / fallback.
 * Quota enforcement reads from Supabase for accurate cross-session totals.
 */
class CostTracker {
  /** Short-term in-process cache — not the source of truth. */
  private readonly cache: CostRecord[] = [];

  async record(params: {
    userId: string;
    organizationId?: string | null;
    executionId?: string;
    workflowId?: string;
    toolId?: string;
    lane: CostLane;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<CostRecord> {
    const estimatedUsd = estimateCost(params.model, params.inputTokens, params.outputTokens);
    const record: CostRecord = {
      id: randomUUID(),
      userId: params.userId,
      organizationId: params.organizationId ?? null,
      executionId: params.executionId,
      workflowId: params.workflowId,
      toolId: params.toolId,
      lane: params.lane,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedUsd,
      createdAt: new Date().toISOString(),
    };

    // Persist to Supabase (best-effort — never fail the request for a cost write).
    try {
      const { insertCostRecord } = await import("@/src/core/persistence/runtime-db");
      await insertCostRecord({
        user_id: record.userId,
        organization_id: record.organizationId,
        execution_id: record.executionId ?? null,
        workflow_id: record.workflowId ?? null,
        tool_id: record.toolId ?? null,
        lane: record.lane,
        model: record.model,
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
        estimated_usd: record.estimatedUsd,
      });
    } catch {
      // Fall back to in-memory cache on DB error.
      this.cache.push(record);
    }

    await eventBus.publish({
      type: RUNTIME_EVENT_TYPES.COST_RECORDED,
      timestamp: record.createdAt,
      actorUserId: record.userId,
      organizationId: record.organizationId,
      executionId: record.executionId,
      payload: {
        model: record.model,
        lane: record.lane,
        estimatedUsd: record.estimatedUsd,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
      },
    });
    return record;
  }

  /**
   * Total cost for a user.  Reads from Supabase for cross-session accuracy;
   * falls back to the in-memory cache on DB error.
   */
  async totalForUser(userId: string, since?: Date): Promise<number> {
    try {
      const { sumCostForUser } = await import("@/src/core/persistence/runtime-db");
      return await sumCostForUser(userId, since);
    } catch {
      // Fallback: use in-memory cache.
      return this.cache
        .filter((r) => r.userId === userId && (!since || new Date(r.createdAt) >= since))
        .reduce((sum, r) => sum + r.estimatedUsd, 0);
    }
  }

  /**
   * Total cost for an organization.  Reads from Supabase for accuracy.
   */
  async totalForOrg(organizationId: string, since?: Date): Promise<number> {
    try {
      const { sumCostForOrg } = await import("@/src/core/persistence/runtime-db");
      return await sumCostForOrg(organizationId, since);
    } catch {
      return this.cache
        .filter(
          (r) =>
            r.organizationId === organizationId &&
            (!since || new Date(r.createdAt) >= since),
        )
        .reduce((sum, r) => sum + r.estimatedUsd, 0);
    }
  }
}

export const costTracker = new CostTracker();
