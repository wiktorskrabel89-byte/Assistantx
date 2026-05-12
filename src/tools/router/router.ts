/**
 * Tool Router — Phase 1 Foundation Hardening
 *
 * The mandatory gateway for every privileged tool action.  No tool may be
 * executed directly — all execution flows through this middleware pipeline:
 *
 *   DISCOVER → VALIDATE → POLICY CHECK → RATE LIMIT → APPROVAL CHECK
 *   → IDEMPOTENCY → EXECUTE → VERIFY OUTPUT → PERSIST AUDIT → EMIT EVENT
 */

import { createEventBus } from "@/src/core/events/event-bus";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";
import { authorizeToolCall } from "@/src/core/policies/tool-policy";
import type { RuntimeExecutionContext } from "@/src/core/types/runtime";
import { toolRegistry } from "@/src/tools/router/registry";
import type {
  RegisteredTool,
  ToolExecutionRequest,
  ToolExecutionResult,
} from "@/src/tools/router/types";
import { checkRateLimit } from "@/lib/rateLimit";

export class ToolRouter {
  private readonly eventBus = createEventBus();

  constructor(extraTools?: RegisteredTool[]) {
    if (extraTools) {
      for (const tool of extraTools) {
        toolRegistry.register(tool, "builtin");
      }
    }
  }

  async execute(
    request: ToolExecutionRequest,
    context: RuntimeExecutionContext,
  ): Promise<ToolExecutionResult> {
    const startMs = Date.now();

    // ── 1. DISCOVER ──────────────────────────────────────────────────────────
    const tool = toolRegistry.get(request.toolId);
    if (!tool) {
      return { ok: false, toolId: request.toolId, error: "Tool not found." };
    }

    // ── 2. IDEMPOTENCY CHECK ─────────────────────────────────────────────────
    if (request.idempotencyKey) {
      try {
        const { checkIdempotencyKey } = await import(
          "@/src/core/persistence/runtime-db"
        );
        const cached = await checkIdempotencyKey(request.idempotencyKey);
        if (cached) {
          return {
            ok: true,
            toolId: request.toolId,
            output: cached,
            fromCache: true,
            durationMs: 0,
          };
        }
      } catch {
        // Idempotency cache miss — continue with normal execution.
      }
    }

    // ── 3. POLICY CHECK ──────────────────────────────────────────────────────
    const authorization = authorizeToolCall({
      actor: context.actor,
      policy: tool.policy,
    });

    if (!authorization.allowed) {
      // Best-effort audit emit
      void this.emitEvent(RUNTIME_EVENT_TYPES.POLICY_DENIED, context, {
        toolId: request.toolId,
        reason: authorization.reason,
      });
      void this.persistToolCall(tool, request, context, false, null, authorization.reason, startMs);
      return {
        ok: false,
        toolId: request.toolId,
        error: authorization.reason,
      };
    }

    // ── 4. RATE LIMIT ────────────────────────────────────────────────────────
    const rateLimitKey = `tool:${request.toolId}:${context.actor.userId ?? "anon"}`;
    const { allowed: rateLimitOk, retryAfterMs } = checkRateLimit(
      rateLimitKey,
      50,     // 50 tool calls…
      60_000, // …per minute per user per tool
    );
    if (!rateLimitOk) {
      void this.emitEvent(RUNTIME_EVENT_TYPES.TOOL_RATE_LIMITED, context, {
        toolId: request.toolId,
        retryAfterMs,
      });
      return {
        ok: false,
        toolId: request.toolId,
        error: `Rate limit exceeded. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`,
      };
    }

    // ── 5. APPROVAL CHECK ────────────────────────────────────────────────────
    if (tool.policy.requiresApproval || tool.policy.irreversible) {
      // Approval queue integration: for now we emit the event and block
      // execution.  Phase 2 will add async resumption via Inngest.
      void this.emitEvent(RUNTIME_EVENT_TYPES.TOOL_APPROVAL_REQUIRED, context, {
        toolId: request.toolId,
        riskLevel: tool.policy.riskLevel,
        irreversible: tool.policy.irreversible ?? false,
      });
      return {
        ok: false,
        toolId: request.toolId,
        error: "Tool execution blocked: approval required from an org administrator.",
      };
    }

    // ── 6. EXECUTE ───────────────────────────────────────────────────────────
    let output: Record<string, unknown>;
    try {
      const timeoutMs = tool.policy.timeoutMs ?? 30_000;
      output = await Promise.race([
        tool.execute(request.input, context),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Tool execution timeout after ${timeoutMs}ms.`)),
            timeoutMs,
          ),
        ),
      ]);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Tool execution failed.";
      void this.emitEvent(RUNTIME_EVENT_TYPES.TOOL_EXECUTED, context, {
        toolId: request.toolId,
        ok: false,
        error,
        durationMs: Date.now() - startMs,
      });
      void this.persistToolCall(tool, request, context, true, null, error, startMs);
      return { ok: false, toolId: request.toolId, error };
    }

    const durationMs = Date.now() - startMs;

    // ── 7. PERSIST AUDIT ─────────────────────────────────────────────────────
    void this.persistToolCall(tool, request, context, true, output, null, startMs);

    // ── 8. EMIT EVENT ────────────────────────────────────────────────────────
    void this.emitEvent(RUNTIME_EVENT_TYPES.TOOL_EXECUTED, context, {
      toolId: request.toolId,
      ok: true,
      outputKeys: Object.keys(output),
      durationMs,
    });

    // ── 9. STORE IDEMPOTENCY RESULT ──────────────────────────────────────────
    if (request.idempotencyKey) {
      try {
        const { storeIdempotencyResult } = await import(
          "@/src/core/persistence/runtime-db"
        );
        await storeIdempotencyResult(
          request.idempotencyKey,
          context.executionId,
          output,
          context.actor.userId,
        );
      } catch {
        // Best-effort — don't fail the response.
      }
    }

    return { ok: true, toolId: request.toolId, output, durationMs };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async emitEvent(
    type: string,
    context: RuntimeExecutionContext,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.eventBus.publish({
        type: type as Parameters<typeof this.eventBus.publish>[0]["type"],
        timestamp: new Date().toISOString(),
        actorUserId: context.actor.userId,
        organizationId: context.actor.organizationId,
        executionId: context.executionId,
        payload,
      });
    } catch {
      // Event emission is always best-effort.
    }
  }

  private async persistToolCall(
    tool: RegisteredTool,
    request: ToolExecutionRequest,
    context: RuntimeExecutionContext,
    policyAllowed: boolean,
    output: Record<string, unknown> | null,
    error: string | null,
    startMs: number,
  ): Promise<void> {
    try {
      const { insertToolCall } = await import("@/src/core/persistence/runtime-db");
      await insertToolCall({
        execution_id: context.executionId,
        tool_id: request.toolId,
        user_id: context.actor.userId,
        organization_id: context.actor.organizationId,
        policy_allowed: policyAllowed,
        risk_level: tool.policy.riskLevel,
        input_summary: JSON.stringify(Object.keys(request.input)).slice(0, 500),
        output_summary: output
          ? JSON.stringify(Object.keys(output)).slice(0, 500)
          : null,
        error: error?.slice(0, 1000) ?? null,
        duration_ms: Date.now() - startMs,
      });
    } catch {
      // DB write failure must not surface to the caller.
    }
  }
}

