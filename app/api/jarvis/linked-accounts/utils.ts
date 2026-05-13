import { hasSupabaseConfig } from "@/lib/supabase-config";

type LinkedAccountsErrorPayload = {
  code: string;
  error: string;
  hint?: string;
};

function getErrorProperty(error: unknown, key: "code" | "message") {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function hasLinkedAccountsConfig() {
  return hasSupabaseConfig();
}

export function linkedAccountsNotConfiguredResponse() {
  return Response.json(
    {
      code: "linked_accounts_not_configured",
      error: "Supabase is not configured. Linked accounts are unavailable.",
      hint: "Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your .env file.",
    },
    { status: 503 },
  );
}

export function buildLinkedAccountsError(error: unknown, fallbackMessage: string): { status: number; payload: LinkedAccountsErrorPayload } {
  const code = getErrorProperty(error, "code");
  const message = (getErrorProperty(error, "message") ?? (error instanceof Error ? error.message : fallbackMessage)).toLowerCase();

  const missingLinkedAccountsTable = code === "42P01"
    || code === "PGRST204"
    || (message.includes("jarvis_linked_accounts") && (message.includes("does not exist") || message.includes("not found")));
  if (missingLinkedAccountsTable) {
    return {
      status: 503,
      payload: {
        code: "linked_accounts_not_configured",
        error: "Linked accounts are not configured in Supabase yet.",
        hint: "Run the Jarvis linked accounts migration to create jarvis_linked_accounts and its RLS policies.",
      },
    };
  }

  const missingConfig = message.includes("supabaseurl is required")
    || message.includes("supabasekey is required")
    || message.includes("url is required")
    || message.includes("invalid url")
    || message.includes("your project's url and key are required")
    || message.includes("required to create a supabase client");
  if (missingConfig) {
    return {
      status: 503,
      payload: {
        code: "linked_accounts_not_configured",
        error: "Supabase is not configured. Linked accounts are unavailable.",
        hint: "Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your .env file.",
      },
    };
  }

  const missingPolicies = code === "42501"
    || message.includes("row-level security")
    || message.includes("permission denied");
  if (missingPolicies) {
    return {
      status: 503,
      payload: {
        code: "linked_accounts_not_configured",
        error: "Linked accounts are blocked by Supabase permissions.",
        hint: "Run the linked accounts migration so signed-in users can manage their own linked providers.",
      },
    };
  }

  return {
    status: 500,
    payload: {
      code: "linked_accounts_failed",
      error: fallbackMessage,
    },
  };
}
