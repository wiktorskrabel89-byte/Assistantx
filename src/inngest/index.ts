/**
 * Inngest Functions — AssistantX runtime backbone
 *
 * All Inngest functions must be registered here and imported by the
 * /api/inngest serve() handler.  New functions go in src/inngest/functions/.
 */

export { workflowExecuteFunction } from "@/src/inngest/functions/workflow-execute";
export { approvalRequestedFunction } from "@/src/inngest/functions/approval-lifecycle";
export { agentTaskFunction } from "@/src/inngest/functions/agent-task";

export const ALL_INNGEST_FUNCTIONS = [
  // Dynamically imported at serve time to avoid circular deps.
  // See app/api/inngest/route.ts
] as const;
