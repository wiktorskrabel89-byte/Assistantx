import { createEventBus } from "@/src/core/events/event-bus";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";
import { authorizeToolCall } from "@/src/core/policies/tool-policy";
import type { RuntimeExecutionContext } from "@/src/core/types/runtime";
import { BUILTIN_TOOLS } from "@/src/tools/router/builtin-tools";
import type {
  RegisteredTool,
  ToolExecutionRequest,
  ToolExecutionResult,
} from "@/src/tools/router/types";

export class ToolRouter {
  private readonly eventBus = createEventBus();
  private readonly tools = new Map<string, RegisteredTool>();

  constructor(seedTools: RegisteredTool[] = BUILTIN_TOOLS) {
    for (const tool of seedTools) {
      this.tools.set(tool.id, tool);
    }
  }

  async execute(
    request: ToolExecutionRequest,
    context: RuntimeExecutionContext,
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(request.toolId);
    if (!tool) {
      return { ok: false, toolId: request.toolId, error: "Tool not found." };
    }

    const authorization = authorizeToolCall({
      actor: context.actor,
      policy: tool.policy,
    });
    if (!authorization.allowed) {
      await this.eventBus.publish({
        type: RUNTIME_EVENT_TYPES.POLICY_DENIED,
        timestamp: new Date().toISOString(),
        actorUserId: context.actor.userId,
        organizationId: context.actor.organizationId,
        executionId: context.executionId,
        payload: { toolId: request.toolId, reason: authorization.reason },
      });
      return {
        ok: false,
        toolId: request.toolId,
        error: authorization.reason,
      };
    }

    const output = await tool.execute(request.input, context);
    await this.eventBus.publish({
      type: RUNTIME_EVENT_TYPES.TOOL_EXECUTED,
      timestamp: new Date().toISOString(),
      actorUserId: context.actor.userId,
      organizationId: context.actor.organizationId,
      executionId: context.executionId,
      payload: { toolId: request.toolId, outputKeys: Object.keys(output) },
    });

    return {
      ok: true,
      toolId: request.toolId,
      output,
    };
  }
}

