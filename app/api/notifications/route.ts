import { createClient } from "@/lib/server";

export const maxDuration = 30;

type NotificationsRouteResponse = {
  notifications?: unknown[];
  available?: boolean;
  ok?: boolean;
  code?: string;
  error?: string;
  hint?: string;
};

function getErrorProperty(error: unknown, key: "code" | "message") {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function buildUnavailableNotificationsResponse(error: unknown): NotificationsRouteResponse | null {
  const code = getErrorProperty(error, "code");
  const message = (getErrorProperty(error, "message") ?? (error instanceof Error ? error.message : "")).toLowerCase();

  const missingNotificationsTable = code === "42P01"
    || code === "PGRST204"
    || message.includes("notifications")
    && (message.includes("does not exist") || message.includes("not found"));
  if (missingNotificationsTable) {
    return {
      notifications: [],
      available: false,
      code: "notifications_not_configured",
      error: "Notifications are not configured in Supabase yet.",
      hint: "Run supabase/migrations/20260503_notifications.sql and 20260504_security_fixes.sql.",
    };
  }

  const missingConfig = message.includes("supabaseurl is required")
    || message.includes("supabasekey is required")
    || message.includes("url is required")
    || message.includes("invalid url");
  if (missingConfig) {
    return {
      notifications: [],
      available: false,
      code: "notifications_not_configured",
      error: "Supabase is not configured. Notifications are unavailable.",
    };
  }

  const missingPolicies = code === "42501"
    || message.includes("row-level security")
    || message.includes("permission denied");
  if (missingPolicies) {
    return {
      notifications: [],
      available: false,
      code: "notifications_not_configured",
      error: "Notifications are blocked by Supabase permissions.",
      hint: "Run the notifications migrations so signed-in users can read and update their own notifications.",
    };
  }

  return null;
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? (error as { status: unknown }).status
      : undefined;
    if (typeof status === "number" && status !== 401 && status !== 403) throw error;
    return { supabase, user: null };
  }
  return { supabase, user: data.user };
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ notifications: [], available: false });
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return Response.json({ notifications: data ?? [], available: true });
  } catch (error) {
    const unavailable = buildUnavailableNotificationsResponse(error);
    if (unavailable) return Response.json(unavailable);
    return Response.json(
      { code: "notifications_failed", error: "Failed to load notifications." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ ok: true, available: false });
    }

    const payload = await request.json().catch(() => ({})) as { action?: string };
    if (payload.action !== "markAllRead") {
      return Response.json({ code: "invalid_notifications_action", error: "Invalid notifications action." }, { status: 400 });
    }

    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) throw error;

    return Response.json({ ok: true, available: true });
  } catch (error) {
    const unavailable = buildUnavailableNotificationsResponse(error);
    if (unavailable) {
      return Response.json({ ok: true, ...unavailable });
    }
    return Response.json(
      { code: "notifications_failed", error: "Failed to update notifications." },
      { status: 500 }
    );
  }
}
