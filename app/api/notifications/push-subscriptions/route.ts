import { createClient } from "@/lib/server";
import { hasSupabaseConfig } from "@/lib/supabase-config";

type PushSubscriptionJson = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function getErrorProperty(error: unknown, key: "code" | "message") {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function buildUnavailablePushSubscriptionsResponse(error: unknown) {
  const code = getErrorProperty(error, "code");
  const message = (getErrorProperty(error, "message") ?? (error instanceof Error ? error.message : "")).toLowerCase();

  const missingTable = code === "42P01"
    || code === "PGRST204"
    || message.includes("push_subscriptions")
    && (message.includes("does not exist") || message.includes("not found"));
  if (missingTable) {
    return {
      available: false,
      code: "push_subscriptions_not_configured",
      error: "Push subscriptions are not configured in Supabase yet.",
      hint: "Run the push-subscriptions migration in supabase/migrations.",
    };
  }

  const missingPolicies = code === "42501"
    || message.includes("row-level security")
    || message.includes("permission denied");
  if (missingPolicies) {
    return {
      available: false,
      code: "push_subscriptions_not_configured",
      error: "Push subscriptions are blocked by Supabase permissions.",
      hint: "Run the push-subscriptions migration so signed-in users can manage their own records.",
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

function parsePushSubscription(payload: unknown): PushSubscriptionJson | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const keys = record.keys;
  if (!keys || typeof keys !== "object") return null;
  const keysRecord = keys as Record<string, unknown>;

  const endpoint = typeof record.endpoint === "string" ? record.endpoint : null;
  const p256dh = typeof keysRecord.p256dh === "string" ? keysRecord.p256dh : null;
  const auth = typeof keysRecord.auth === "string" ? keysRecord.auth : null;
  const expirationTime = typeof record.expirationTime === "number" || record.expirationTime === null
    ? record.expirationTime
    : undefined;

  if (!endpoint || !p256dh || !auth) return null;

  return {
    endpoint,
    expirationTime,
    keys: { p256dh, auth },
  };
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return Response.json(
      {
        available: false,
        code: "push_subscriptions_not_configured",
        error: "Supabase is not configured. Push subscriptions are unavailable.",
      },
      { status: 503 },
    );
  }

  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ code: "unauthorized", error: "No active session." }, { status: 401 });
    }

    const payload = parsePushSubscription(await request.json().catch(() => null));
    if (!payload) {
      return Response.json({ code: "invalid_push_subscription", error: "Invalid push subscription payload." }, { status: 400 });
    }

    const userAgent = request.headers.get("user-agent");
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: payload.endpoint,
        p256dh_key: payload.keys.p256dh,
        auth_key: payload.keys.auth,
        expiration_time: payload.expirationTime ?? null,
        user_agent: userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );

    if (error) throw error;

    return Response.json({ ok: true, available: true });
  } catch (error) {
    const unavailable = buildUnavailablePushSubscriptionsResponse(error);
    if (unavailable) return Response.json(unavailable, { status: 503 });
    return Response.json(
      { code: "push_subscriptions_failed", error: "Failed to save push subscription." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!hasSupabaseConfig()) {
    return Response.json({ ok: true, available: false });
  }

  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ ok: true, available: false });
    }

    const payload = await request.json().catch(() => ({})) as { endpoint?: unknown };
    if (typeof payload.endpoint !== "string" || !payload.endpoint) {
      return Response.json({ code: "invalid_push_subscription", error: "Missing subscription endpoint." }, { status: 400 });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", payload.endpoint);
    if (error) throw error;

    return Response.json({ ok: true, available: true });
  } catch (error) {
    const unavailable = buildUnavailablePushSubscriptionsResponse(error);
    if (unavailable) return Response.json({ ok: true, ...unavailable }, { status: 503 });
    return Response.json(
      { code: "push_subscriptions_failed", error: "Failed to remove push subscription." },
      { status: 500 },
    );
  }
}
