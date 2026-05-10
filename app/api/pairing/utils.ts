import { createClient } from "@/lib/server";
import { hasSupabaseConfig } from "@/lib/supabase-config";
import {
  DEVICE_PAIRING_CODE_LENGTH,
  normalizePairingCode,
  type DeviceType,
  type PairingStatusResponse,
} from "@/lib/device-pairing";

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

type PairingErrorPayload = {
  code: string;
  error: string;
  hint?: string;
};

type DevicePairRow = {
  pairing_code: string;
  status: "pending" | "paired" | "expired";
  expires_at: string;
  paired_at: string | null;
  initiator_device: DeviceType;
  created_at: string;
};

function getErrorProperty(error: unknown, key: "code" | "message") {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function pairingNotConfiguredResponse() {
  return Response.json(
    {
      code: "pairing_not_configured",
      error: "Device pairing is not configured in Supabase yet.",
      hint: "Run supabase/migrations/20260510_device_pairing.sql.",
    },
    { status: 503 }
  );
}

export function buildPairingError(error: unknown, fallbackMessage: string): { status: number; payload: PairingErrorPayload } {
  const code = getErrorProperty(error, "code");
  const message = (getErrorProperty(error, "message") ?? (error instanceof Error ? error.message : fallbackMessage)).toLowerCase();

  const missingPairingTable = code === "42P01"
    || code === "PGRST204"
    || (message.includes("device_pairs") && (message.includes("does not exist") || message.includes("not found")));
  if (missingPairingTable) {
    return {
      status: 503,
      payload: {
        code: "pairing_not_configured",
        error: "Device pairing is not configured in Supabase yet.",
        hint: "Run supabase/migrations/20260510_device_pairing.sql.",
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
        code: "pairing_not_configured",
        error: "Supabase is not configured. Device pairing is unavailable.",
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
        code: "pairing_not_configured",
        error: "Device pairing is blocked by Supabase permissions.",
        hint: "Run the pairing migration so signed-in users can manage their own device_pairs rows.",
      },
    };
  }

  return {
    status: 500,
    payload: {
      code: "pairing_failed",
      error: fallbackMessage,
    },
  };
}

export function isValidInitiatorDevice(value: unknown): value is DeviceType {
  return value === "phone" || value === "pc";
}

export function createPairingCode(): string {
  return Array.from({ length: DEVICE_PAIRING_CODE_LENGTH }, () => {
    const index = crypto.getRandomValues(new Uint32Array(1))[0] % PAIRING_ALPHABET.length;
    return PAIRING_ALPHABET[index];
  }).join("");
}

export function hasPairingConfig() {
  return hasSupabaseConfig();
}

export async function getAuthenticatedUser() {
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

export async function expirePendingPairs(supabase: SupabaseLike, userId: string, excludeCode?: string) {
  let query = supabase
    .from("device_pairs")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("status", "pending");

  if (excludeCode) {
    query = query.neq("pairing_code", normalizePairingCode(excludeCode));
  }

  const { error } = await query;
  if (error) throw error;
}

export async function expireStalePendingPairs(supabase: SupabaseLike, userId: string) {
  const { error } = await supabase
    .from("device_pairs")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString());

  if (error) throw error;
}

async function getLatestPairByStatus(supabase: SupabaseLike, userId: string, status: "pending" | "paired") {
  const { data, error } = await supabase
    .from("device_pairs")
    .select("pairing_code, status, expires_at, paired_at, initiator_device, created_at")
    .eq("user_id", userId)
    .eq("status", status)
    .order(status === "paired" ? "paired_at" : "created_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DevicePairRow>();

  if (error) throw error;
  return data;
}

export async function getPairingStatus(supabase: SupabaseLike, userId: string): Promise<PairingStatusResponse> {
  await expireStalePendingPairs(supabase, userId);

  const pendingPair = await getLatestPairByStatus(supabase, userId, "pending");
  if (pendingPair) {
    return {
      status: "pending",
      code: pendingPair.pairing_code,
      expiresAt: pendingPair.expires_at,
      pairedAt: pendingPair.paired_at,
      initiatorDevice: pendingPair.initiator_device,
    };
  }

  const pairedPair = await getLatestPairByStatus(supabase, userId, "paired");
  if (pairedPair) {
    return {
      status: "paired",
      code: pairedPair.pairing_code,
      expiresAt: pairedPair.expires_at,
      pairedAt: pairedPair.paired_at,
      initiatorDevice: pairedPair.initiator_device,
    };
  }

  return { status: "none" };
}

export async function getPairByCode(supabase: SupabaseLike, userId: string, code: string) {
  const normalizedCode = normalizePairingCode(code);
  const { data, error } = await supabase
    .from("device_pairs")
    .select("pairing_code, status, expires_at, paired_at, initiator_device, created_at")
    .eq("user_id", userId)
    .eq("pairing_code", normalizedCode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DevicePairRow>();

  if (error) throw error;
  return data;
}
