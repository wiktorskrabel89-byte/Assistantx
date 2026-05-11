import type { CostLane, CostRecord } from "@/src/core/cost/types";
import { estimateCost } from "@/src/core/cost/types";
import { createEventBus } from "@/src/core/events/event-bus";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";
import { randomUUID } from "node:crypto";

const eventBus = createEventBus();

class CostTracker {
  private readonly ledger: CostRecord[] = [];

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
    this.ledger.push(record);
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

  totalForUser(userId: string, since?: Date): number {
    return this.ledger
      .filter((r) => r.userId === userId && (!since || new Date(r.createdAt) >= since))
      .reduce((sum, r) => sum + r.estimatedUsd, 0);
  }

  totalForOrg(organizationId: string, since?: Date): number {
    return this.ledger
      .filter(
        (r) =>
          r.organizationId === organizationId &&
          (!since || new Date(r.createdAt) >= since),
      )
      .reduce((sum, r) => sum + r.estimatedUsd, 0);
  }
}

export const costTracker = new CostTracker();
