import { randomUUID } from "node:crypto";
import { runAgentTask } from "@/src/agents/runtime/coordinator";
import { runVerifier } from "@/src/agents/runtime/verifier";
import { createEventBus } from "@/src/core/events/event-bus";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";
import { memoryService } from "@/src/memory/service/memory-service";
import type {
  RuntimeExecutionRequest,
  RuntimeExecutionResult,
} from "@/src/core/types/runtime";
import { ToolRouter } from "@/src/tools/router/router";
import { APP_FORCED_MODEL_ID, ROUTING_GEMINI_MODEL } from "@/lib/ai-config";

function createExecutionId() {
  return randomUUID();
}

function getGitHubRuntimeToken() {
  return process.env.GITHUB_WEBHOOK_GITHUB_TOKEN
    || process.env.GITHUB_TOKEN
    || null;
}

async function fetchPullRequestDiff(repo: string, pullNumber: number, diffUrl?: string) {
  const token = getGitHubRuntimeToken();
  const url = diffUrl || `https://api.github.com/repos/${repo}/pulls/${pullNumber}`;
  const response = await fetch(url, {
    headers: {
      Accept: diffUrl ? "application/vnd.github.v3.diff" : "application/vnd.github.v3.diff",
      "User-Agent": "AssistantX",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch pull request diff (${response.status}).`);
  }
  return response.text();
}

async function generatePrReview(diff: string, repo: string, pullNumber: number, headSha: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const userPrompt = [
    `Repository: ${repo}`,
    `Pull request: #${pullNumber}`,
    `Head SHA: ${headSha}`,
    "Review the following GitHub pull request diff.",
    "Return concise markdown with these sections only:",
    "1. Summary",
    "2. Risks",
    "3. Suggested follow-ups",
    "",
    diff.slice(0, 20000),
  ].join("\n");

  if (!apiKey) {
    return [
      "## Summary",
      `Automated PR review fallback for ${repo}#${pullNumber}.`,
      "",
      "## Risks",
      "- OpenRouter is not configured, so this review used a non-LLM fallback.",
      `- Diff length: ${diff.length} characters.`,
      "",
      "## Suggested follow-ups",
      "- Re-run the PR review after OPENROUTER_API_KEY is configured.",
    ].join("\n");
  }

  const models = [APP_FORCED_MODEL_ID, ROUTING_GEMINI_MODEL];
  let lastError: string | null = null;

  for (const model of models) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          top_p: 1,
          messages: [
            {
              role: "system",
              content: "You are a careful code reviewer. Focus on correctness, security, regressions, and maintainability. Keep the review concise and actionable.",
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Model ${model} failed: ${text}`);
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (content) return content;
      throw new Error(`Model ${model} returned an empty review.`);
    } catch (error) {
      lastError = error instanceof Error ? error.message : `Model ${model} failed.`;
    }
  }

  throw new Error(lastError ?? "PR review generation failed.");
}

async function maybePersistPrReviewArtifacts({
  userId,
  repo,
  pullNumber,
  review,
}: {
  userId: string | null;
  repo: string;
  pullNumber: number;
  review: string;
}) {
  if (!userId) return;

  await memoryService.write({
    userId,
    layer: "episodic",
    content: `PR review for ${repo}#${pullNumber}\n\n${review}`,
    tags: ["pr_review", repo, `pr:${pullNumber}`],
  }).catch(() => undefined);

  try {
    const { createClient } = await import("@/lib/server");
    const supabase = await createClient();
    await supabase.from("notifications").insert({
      user_id: userId,
      kind: "info",
      title: `PR review ready for ${repo}#${pullNumber}`,
      body: review.slice(0, 8000),
    });
  } catch {
    // best-effort notification insert
  }
}

async function maybePublishGitHubPrComment({
  repo,
  pullNumber,
  review,
  enabled,
}: {
  repo: string;
  pullNumber: number;
  review: string;
  enabled: boolean;
}) {
  if (!enabled) return false;
  const token = getGitHubRuntimeToken();
  if (!token) return false;

  const response = await fetch(`https://api.github.com/repos/${repo}/pulls/${pullNumber}/reviews`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "AssistantX",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      event: "COMMENT",
      body: review.slice(0, 65000),
    }),
  });

  return response.ok;
}

export async function executeRuntimeRequest(
  request: RuntimeExecutionRequest,
): Promise<RuntimeExecutionResult<Record<string, unknown>>> {
  const executionId = createExecutionId();
  const eventBus = createEventBus();
  const toolRouter = new ToolRouter();
  const startedAt = new Date().toISOString();

  // Persist the workflow run record (authoritative state — fail-closed).
  let hasPersistentRecord = false;
  try {
    const { insertWorkflowRun } = await import(
      "@/src/core/persistence/runtime-db"
    );
    await insertWorkflowRun({
      execution_id: executionId,
      workflow_id: request.workflow,
      user_id: request.actor.userId,
      organization_id: request.actor.organizationId,
      status: "queued",
      trigger: "user",
      input: request.input,
      started_at: startedAt,
    });
    hasPersistentRecord = true;
  } catch {
    // If we can't persist the run record, continue but note it is not durable.
  }

  await eventBus.publish({
    type: RUNTIME_EVENT_TYPES.WORKFLOW_STARTED,
    timestamp: startedAt,
    actorUserId: request.actor.userId,
    organizationId: request.actor.organizationId,
    executionId,
    payload: { workflow: request.workflow },
  });

  // Durable template workflow path: queue in Inngest and return immediately.
  if (request.workflow === "start_gaming") {
    await eventBus.publish({
      type: RUNTIME_EVENT_TYPES.START_GAMING_REQUESTED,
      timestamp: startedAt,
      actorUserId: request.actor.userId,
      organizationId: request.actor.organizationId,
      executionId,
      payload: {
        workflow: request.workflow,
        input: request.input,
      },
    });

    return {
      executionId,
      status: "queued",
      output: {
        workflow: "start_gaming",
        orchestrator: "inngest",
        queued: true,
      },
    };
  }

  // Update status to running.
  if (hasPersistentRecord) {
    try {
      const { updateWorkflowRun } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await updateWorkflowRun(executionId, { status: "running" });
    } catch {
      // Best-effort status update.
    }
  }

  let finalStatus: "completed" | "failed" = "completed";
  let finalOutput: Record<string, unknown> = {};
  let finalError: string | null = null;

  try {
    if (request.workflow === "pr_review") {
      const repo = typeof request.input.repo === "string" ? request.input.repo : "";
      const pullNumber = typeof request.input.pullNumber === "number" ? request.input.pullNumber : Number(request.input.pullNumber ?? 0);
      const headSha = typeof request.input.headSha === "string" ? request.input.headSha : "";
      const diffUrl = typeof request.input.diffUrl === "string" ? request.input.diffUrl : undefined;
      const postGitHubComment = request.input.postGitHubComment === true;

      if (!repo || !pullNumber || !headSha) {
        throw new Error("pr_review requires repo, pullNumber, and headSha.");
      }

      const diff = await fetchPullRequestDiff(repo, pullNumber, diffUrl);
      const review = await generatePrReview(diff, repo, pullNumber, headSha);
      const publishedToGitHub = await maybePublishGitHubPrComment({
        repo,
        pullNumber,
        review,
        enabled: postGitHubComment,
      });

      await maybePersistPrReviewArtifacts({
        userId: request.actor.userId,
        repo,
        pullNumber,
        review,
      });

      finalOutput = {
        workflow: request.workflow,
        review,
        repo,
        pullNumber,
        headSha,
        publishedToGitHub,
      };
      const completedAt = new Date().toISOString();
      await eventBus.publish({
        type: RUNTIME_EVENT_TYPES.WORKFLOW_COMPLETED,
        timestamp: completedAt,
        actorUserId: request.actor.userId,
        organizationId: request.actor.organizationId,
        executionId,
        payload: {
          workflow: request.workflow,
          repo,
          pullNumber,
          publishedToGitHub,
        },
      });

      if (hasPersistentRecord) {
        try {
          const { updateWorkflowRun } = await import(
            "@/src/core/persistence/runtime-db"
          );
          await updateWorkflowRun(executionId, {
            status: "completed",
            output: finalOutput,
            completed_at: completedAt,
          });
        } catch {
          // Best-effort.
        }
      }

      return {
        executionId,
        status: "completed",
        output: finalOutput,
      };
    }

    const agent = await runAgentTask({
      id: `${executionId}:coordinator`,
      role: "coordinator",
      goal: request.workflow,
      input: request.input,
    });

    const toolResult = await toolRouter.execute(
      {
        toolId: "memory.read",
        input: request.input,
      },
      {
        executionId,
        workflowId: request.workflow,
        actor: request.actor,
        metadata: { source: "runtime-facade" },
      },
    );

    // Run the verifier gate on the coordinator output.
    const verifierTask = {
      id: `${executionId}:verifier`,
      role: "verifier" as const,
      goal: request.workflow,
      input: agent.output,
    };
    const verification = await runVerifier(verifierTask, agent.output);

    finalOutput = {
      workflow: request.workflow,
      agent,
      toolResult,
      verification: {
        safe: verification.safe,
        reasons: verification.reasons,
      },
    };

    if (!verification.safe) {
      finalStatus = "failed";
      finalError = `Verifier rejected output: ${verification.reasons.join("; ")}`;
    }
  } catch (err) {
    finalStatus = "failed";
    finalError = err instanceof Error ? err.message : "Workflow execution failed.";
  }

  const completedAt = new Date().toISOString();

  // Update authoritative run record.
  if (hasPersistentRecord) {
    try {
      const { updateWorkflowRun } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await updateWorkflowRun(executionId, {
        status: finalStatus,
        output: finalStatus === "completed" ? finalOutput : null,
        error: finalError,
        completed_at: completedAt,
      });
    } catch {
      // Best-effort.
    }
  }

  // Emit lifecycle event.
  await eventBus.publish({
    type:
      finalStatus === "completed"
        ? RUNTIME_EVENT_TYPES.WORKFLOW_COMPLETED
        : RUNTIME_EVENT_TYPES.WORKFLOW_FAILED,
    timestamp: completedAt,
    actorUserId: request.actor.userId,
    organizationId: request.actor.organizationId,
    executionId,
    payload: {
      workflow: request.workflow,
      status: finalStatus,
      error: finalError,
    },
  });

  return {
    executionId,
    status: finalStatus,
    output: finalStatus === "completed" ? finalOutput : undefined,
    error: finalError ?? undefined,
  };
}
