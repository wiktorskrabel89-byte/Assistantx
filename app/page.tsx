import { headers } from "next/headers";
import PublicHome from "./public-home";
import { normalizePublicLanguage } from "@/app/lib/ui-language";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";
import { getPublicSetting } from "@/app/lib/admin-settings";

// The public site IS the waitlist. Everyone — signed in or not — gets the
// cinematic waitlist landing page.
//
// Language: middleware pre-computes the preferred UI language (from cookie,
// geo, and Accept-Language) and puts it on `x-assistantx-ui-language`.
export const revalidate = 60; // real counter cached for 60s per edge node.

export default async function Home() {
  const h = await headers();
  const lang = normalizePublicLanguage(h.get("x-assistantx-ui-language"));

  // Real waitlist count (confirmed rows). We take Math.max so the hero
  // never regresses in front of the visitor: the visible number is either
  // the true count or a floor we set below.
  const supabase = getServiceRoleClient();
  let confirmed = 0;
  if (supabase) {
    const { count } = await supabase
      .from("waitlist_signups")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed");
    confirmed = count ?? 0;
  }
  const waitlistCount = Math.max(confirmed, 1);

  // Admin-configurable launch date lives in admin_settings.launch_date.
  // Falls back to the old env var so existing setups keep working.
  const setting = await getPublicSetting<string | null>("launch_date");
  const launchDate =
    (typeof setting === "string" && setting.length > 0 ? setting : null) ||
    process.env.NEXT_PUBLIC_LAUNCH_DATE ||
    null;

  return <PublicHome lang={lang} waitlistCount={waitlistCount} launchDate={launchDate} />;
}
