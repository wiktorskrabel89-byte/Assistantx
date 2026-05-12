import type { ToolPolicyDefinition } from "@/src/core/policies/tool-policy";
import type { RuntimeExecutionContext } from "@/src/core/types/runtime";

export type ToolHandlerInput = Record<string, unknown>;
export type ToolHandlerOutput = Record<string, unknown>;

export type RegisteredTool = {
  id: string;
  description: string;
  policy: ToolPolicyDefinition;
  execute: (
    input: ToolHandlerInput,
    context: RuntimeExecutionContext,
  ) => Promise<ToolHandlerOutput>;
};

export type ToolExecutionRequest = {
  toolId: string;
  input: ToolHandlerInput;
};

export type ToolExecutionResult = {
  ok: boolean;
  toolId: string;
  output?: ToolHandlerOutput;
  error?: string;
};

