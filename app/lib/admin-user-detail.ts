import "server-only";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export type UserDetail = {
  signup: {
    id: string;
    name: string | null;
    email: string;
    status: string | null;
    source: string | null;
    referral_code: string | null;
    referred_by: string | null;
    referral_count: number;
    created_at: string;
    confirmed_at: string | null;
  } | null;
  referredByRow: { name: string | null; email: string } | null;
  referredRows: { id: string; email: string; status: string | null; created_at: string }[];
  events: { id: number; at: string; event_name: string; source: string | null; properties: Record<string, unknown> }[];
  suppressed: boolean;
};

export async function getWaitlistDetail(id: string): Promise<UserDetail | null> {
  const supabase = getServiceRoleClient();
  if (!supabase) return null;

  const { data: signupRaw, error } = await supabase
    .from("waitlist_signups")
    .select("id, name, email, status, source, referral_code, referred_by, referral_count, created_at, confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !signupRaw) return null;

  const signup = signupRaw as unknown as NonNullable<UserDetail["signup"]>;
  const email = String(signup.email).toLowerCase();
  const emailDomain = email.split("@")[1] ?? "";

  // Run everything sequentially where the type shape is awkward — this
  // module is called from a server component so the extra round-trips
  // don't hurt (Supabase is ~5ms per query on the same region).

  let referredByRow: UserDetail["referredByRow"] = null;
  if (signup.referred_by) {
    const res = await supabase
      .from("waitlist_signups")
      .select("name, email")
      .eq("referral_code", signup.referred_by)
      .maybeSingle();
    referredByRow = (res.data as UserDetail["referredByRow"]) ?? null;
  }

  let referredRows: UserDetail["referredRows"] = [];
  if (signup.referral_code) {
    const res = await supabase
      .from("waitlist_signups")
      .select("id, email, status, created_at")
      .eq("referred_by", signup.referral_code)
      .order("created_at", { ascending: false })
      .limit(50);
    referredRows = ((res.data as UserDetail["referredRows"]) ?? []);
  }

  let events: UserDetail["events"] = [];
  if (emailDomain) {
    const res = await supabase
      .from("analytics_events")
      .select("id, at, event_name, source, properties")
      .contains("properties", { email_domain: emailDomain })
      .order("at", { ascending: false })
      .limit(50);
    events = ((res.data as UserDetail["events"]) ?? []);
  }

  const suppRes = await supabase
    .from("email_suppressions")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  const suppressed = Boolean(suppRes.data);

  return { signup, referredByRow, referredRows, events, suppressed };
}
