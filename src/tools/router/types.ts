import type { ToolPolicyDefinition } from "@/src/core/policies/tool-policy";
import type { RuntimeExecutionContext } from "@/src/core/types/runtime";

export type ToolHandlerInput = Record<string, unknown>;
export type ToolHandlerOutput = Record<string, unknown>;

export type RegisteredTool = {
  id: string;
  description: string;
  policy: ToolPolicyDefinition;
  /**
   * JSON Schema describing the expected input.
   * Used for input validation before execution.
   */
  inputSchema?: Record<string, unknown>;
  execute: (
    input: ToolHandlerInput,
    context: RuntimeExecutionContext,
  ) => Promise<ToolHandlerOutput>;
};

export type ToolExecutionRequest = {
  toolId: string;
  input: ToolHandlerInput;
  /**
   * Caller-provided idempotency key.
   * When provided, the router skips re-execution if the key was already
   * processed and returns the cached result.
   */
  idempotencyKey?: string;
};

export type ToolExecutionResult = {
  ok: boolean;
  toolId: string;
  output?: ToolHandlerOutput;
  error?: string;
  /** True when the result was served from the idempotency cache. */
  fromCache?: boolean;
  /** Duration of the actual tool execution in ms (0 for cached results). */
  durationMs?: number;
};

