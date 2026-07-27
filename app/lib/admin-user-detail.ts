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

  const { data: signup, error } = await supabase
    .from("waitlist_signups")
    .select("id, name, email, status, source, referral_code, referred_by, referral_count, created_at, confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !signup) return null;

  const email = String(signup.email).toLowerCase();

  const [referredByRes, referredRes, eventsRes, suppRes] = await Promise.all([
    signup.referred_by
      ? supabase
          .from("waitlist_signups")
          .select("name, email")
          .eq("referral_code", signup.referred_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    signup.referral_code
      ? supabase
          .from("waitlist_signups")
          .select("id, email, status, created_at")
          .eq("referred_by", signup.referral_code)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    supabase
      .from("analytics_events")
      .select("id, at, event_name, source, properties")
      .contains("properties", { email_domain: email.split("@")[1] })
      .order("at", { ascending: false })
      .limit(50),
    supabase.from("email_suppressions").select("email").eq("email", email).maybeSingle(),
  ]);

  return {
    signup: signup as UserDetail["signup"],
    referredByRow: (referredByRes.data as UserDetail["referredByRow"]) ?? null,
    referredRows: (referredRes.data as UserDetail["referredRows"]) ?? [],
    events: (eventsRes.data as UserDetail["events"]) ?? [],
    suppressed: Boolean(suppRes.data),
  };
}
