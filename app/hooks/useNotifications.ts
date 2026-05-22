"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/client";

export type AppNotification = {
  id: string;
  kind: "info" | "success" | "warning";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  /** Which system component emitted the notification. */
  source?: string | null;
  /** workflow_runs.execution_id — links to the run that triggered this notification. */
  executionId?: string | null;
  /** agent_tasks.task_id — links to the sub-task detail. */
  taskId?: string | null;
  /** Relative URL the UI can navigate to for run/task detail. */
  deepLink?: string | null;
  /**
   * Short TTS text.  Non-null means the client should speak it aloud using
   * the browser Web Speech API or the Electron/desktop sidecar.
   * Null means the notification is inbox-only (silent).
   */
  speechText?: string | null;
};

export type UseNotificationsReturn = {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => Promise<void>;
};

type NotificationsApiResponse = {
  notifications?: Record<string, unknown>[];
  available?: boolean;
  ok?: boolean;
};

function rowToNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id),
    kind: (row.kind as AppNotification["kind"]) ?? "info",
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    read: Boolean(row.read),
    createdAt: String(row.created_at ?? ""),
    source: typeof row.source === "string" ? row.source : null,
    executionId: typeof row.execution_id === "string" ? row.execution_id : null,
    taskId: typeof row.task_id === "string" ? row.task_id : null,
    deepLink: typeof row.deep_link === "string" ? row.deep_link : null,
    speechText: typeof row.speech_text === "string" ? row.speech_text : null,
  };
}

/**
 * Subscribes to the user's notifications in Supabase and provides helpers
 * to mark them read.  Gracefully no-ops when the user is not authenticated.
 */
export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
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

        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!active) return;
        const payload = await response.json().catch(() => ({})) as NotificationsApiResponse;
        if (!response.ok || !active) return;

        const rows = Array.isArray(payload.notifications) ? payload.notifications : [];
        setNotifications(rows.map(rowToNotification));

        // Guard against unmount during the async fetch above.
        if (!active || payload.available === false) return;

        // Realtime subscription
        const channel = supabase
          .channel(`notifications:${userId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              if (!active) return;
              if (payload.eventType === "INSERT") {
                const incoming = rowToNotification(payload.new as Record<string, unknown>);
                setNotifications((prev) => [incoming, ...prev]);
              } else if (payload.eventType === "UPDATE") {
                const updated = rowToNotification(payload.new as Record<string, unknown>);
                setNotifications((prev) =>
                  prev.map((n) => (n.id === updated.id ? updated : n))
                );
              } else if (payload.eventType === "DELETE") {
                const deleted = payload.old as { id?: string };
                if (deleted?.id) {
                  setNotifications((prev) => prev.filter((n) => n.id !== deleted.id));
                }
              }
            }
          )
          .subscribe((_status, err) => {
            // Realtime transport errors (e.g. "Connection closed") are non-fatal.
            // Supabase will attempt to reconnect automatically; suppress the
            // unhandled-rejection that would otherwise surface in the console.
            if (err && process.env.NODE_ENV === "development") {
              console.warn("Notifications realtime error:", err);
            }
          });

        channelRef.current = channel;
      } catch {
        // Ignore bootstrap errors (e.g. network issues or missing realtime config).
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

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markAllRead" }),
    });
    if (!response.ok) return;

    // Optimistic update — realtime will also fire, but this is faster.
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markAllRead };
}
