"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/client";

export type PendingApprovalTask = {
  taskId: string;
  prompt: string;
  status: string;
  category: string | null;
  actionType: string | null;
  createdAt: string;
};

type ApprovalDecision = "approved" | "rejected";

function rowToTask(row: Record<string, unknown>): PendingApprovalTask {
  return {
    taskId: String(row.task_id ?? ""),
    prompt: String(row.prompt ?? ""),
    status: String(row.status ?? "pending_approval"),
    category: typeof row.category === "string" ? row.category : null,
    actionType: typeof row.action_type === "string" ? row.action_type : null,
    createdAt: String(row.created_at ?? ""),
  };
}

export function usePendingApprovals() {
  const [tasks, setTasks] = useState<PendingApprovalTask[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const supabase = createClient();
    let active = true;

    async function bootstrap() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user || !active) return;

        const userId = session.user.id;
        const { data } = await supabase
          .from("ai_tasks")
          .select("task_id,prompt,status,category,action_type,created_at")
          .eq("user_id", userId)
          .eq("status", "pending_approval")
          .order("created_at", { ascending: false })
          .limit(20);
        if (!active) return;
        setTasks(Array.isArray(data) ? data.map((row) => rowToTask(row as Record<string, unknown>)) : []);

        const channel = supabase
          .channel(`ai-task-approvals:${userId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "ai_tasks",
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              if (!active) return;
              if (payload.eventType === "DELETE") {
                const taskId = String((payload.old as { task_id?: string })?.task_id ?? "");
                setTasks((prev) => prev.filter((task) => task.taskId !== taskId));
                return;
              }

              const next = rowToTask(payload.new as Record<string, unknown>);
              setTasks((prev) => {
                const without = prev.filter((task) => task.taskId !== next.taskId);
                return next.status === "pending_approval" ? [next, ...without] : without;
              });
            },
          )
          .subscribe();

        channelRef.current = channel;
      } catch {
        // ignore bootstrap/realtime errors
      }
    }

    void bootstrap();

    return () => {
      active = false;
      if (channelRef.current) {
        void channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, []);

  const decide = useCallback(async (taskId: string, decision: ApprovalDecision) => {
    setBusyTaskId(taskId);
    try {
      const response = await fetch(`/api/jarvis/tasks/${encodeURIComponent(taskId)}/approve`, {
        method: decision === "approved" ? "POST" : "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? `Approval request failed (${response.status}).`);
      }
      setTasks((prev) => prev.filter((task) => task.taskId !== taskId));
    } finally {
      setBusyTaskId((current) => current === taskId ? null : current);
    }
  }, []);

  return useMemo(() => ({
    tasks,
    busyTaskId,
    approve: (taskId: string) => decide(taskId, "approved"),
    reject: (taskId: string) => decide(taskId, "rejected"),
  }), [busyTaskId, decide, tasks]);
}
