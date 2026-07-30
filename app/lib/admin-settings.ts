import "server-only";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const supabase = getServiceRoleClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T) ?? null;
}

/**
 * Public-safe read that also works from anywhere with the anon key —
 * useful if you ever call it from a client component. Server code should
 * prefer getSetting() for a direct read.
 */
export async function getPublicSetting<T = unknown>(key: string): Promise<T | null> {
  const supabase = getServiceRoleClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.rpc("get_public_setting", { p_key: key });
    return (data as T) ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(
  key: string,
  value: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getServiceRoleClient();
  if (!supabase) return { ok: false, error: "supabase-not-configured" };
  const { error } = await supabase
    .from("admin_settings")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
