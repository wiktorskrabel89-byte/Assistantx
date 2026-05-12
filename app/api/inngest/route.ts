/**
 * Inngest route handler — AssistantX runtime backbone.
 *
 * Uses the real @inngest/next serve() adapter.  All registered Inngest
 * functions are delivered through this endpoint.
 *
 * Required environment variables:
 *   INNGEST_SIGNING_KEY   — validates incoming Inngest requests
 *   INNGEST_EVENT_KEY     — used by the client to send events to Inngest Cloud
 *
 * In local development: set INNGEST_SIGNING_KEY=any-string and
 * INNGEST_EVENT_KEY=any-string to activate Inngest Dev Server mode.
 * Run `npx inngest-cli dev` to start the local dev server.
 */

import { serve } from "inngest/next";
import { inngest } from "@/src/core/events/inngest-client";
import { workflowExecuteFunction } from "@/src/inngest/functions/workflow-execute";
import { approvalRequestedFunction } from "@/src/inngest/functions/approval-lifecycle";
import { agentTaskFunction } from "@/src/inngest/functions/agent-task";
import { startGamingFunction } from "@/src/inngest/functions/start-gaming";

export const runtime = "nodejs";
export const maxDuration = 300;

const handler = serve({
  client: inngest,
  functions: [
    workflowExecuteFunction,
    approvalRequestedFunction,
    agentTaskFunction,
    startGamingFunction,
  ],
});

export const GET = handler.GET;
export const POST = handler.POST;
export const PUT = handler.PUT;
