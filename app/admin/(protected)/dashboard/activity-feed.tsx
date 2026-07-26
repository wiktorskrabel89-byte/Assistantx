import { getServiceRoleClient } from "@/app/lib/supabase-admin";

type RawLog = { id: number; at: string; action: string; target: string | null; metadata: Record<string, unknown> };
type RawSignup = { id: string; name: string | null; email: string; created_at: string; status: string | null };

type FeedItem = {
  key: string;
  when: string;
  kind: "signup" | "admin";
  action: string;
  title: string;
  subtitle: string;
  accent: string;
};

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const shown = user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "•".repeat(Math.max(1, user.length - 3)) + user.slice(-1);
  return `${shown}@${domain}`;
}

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const KIND_STYLES: Record<string, { dot: string; ring: string; icon: string }> = {
  signup: {
    dot: "bg-emerald-400",
    ring: "ring-emerald-400/40",
    icon: "M12 6v12m6-6H6",
  },
  "login.ok": {
    dot: "bg-violet-400",
    ring: "ring-violet-400/40",
    icon: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z",
  },
  "login.failed": {
    dot: "bg-red-400",
    ring: "ring-red-400/40",
    icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z",
  },
  logout: {
    dot: "bg-white/50",
    ring: "ring-white/20",
    icon: "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75",
  },
  "launch.created": {
    dot: "bg-cyan-400",
    ring: "ring-cyan-400/40",
    icon: "M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.63 8.59m5.96 5.78l-5.96-5.78m0 0a14.926 14.926 0 00-5.841 2.58c-.511 3.712.847 7.19 3.502 9.845z",
  },
  "launch.sent": {
    dot: "bg-fuchsia-400",
    ring: "ring-fuchsia-400/40",
    icon: "M2.25 12l19.5-9-4.5 19.5-6-9-9-1.5z",
  },
};

async function loadFeed(limit: number): Promise<FeedItem[]> {
  const supabase = getServiceRoleClient();
  if (!supabase) return [];
  const [signupsRes, logsRes] = await Promise.all([
    supabase
      .from("waitlist_signups")
      .select("id, name, email, created_at, status")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("admin_audit_logs")
      .select("id, at, action, target, metadata")
      .order("at", { ascending: false })
      .limit(limit),
  ]);

  const signups = (signupsRes.data ?? []) as RawSignup[];
  const logs = (logsRes.data ?? []) as RawLog[];

  const items: FeedItem[] = [
    ...signups.map<FeedItem>((s) => ({
      key: `s:${s.id}`,
      when: s.created_at,
      kind: "signup",
      action: "signup",
      title: s.name ? `${s.name} joined the waitlist` : "New waitlist signup",
      subtitle: `${maskEmail(s.email)} · ${s.status ?? "confirmed"}`,
      accent: "from-emerald-500 to-teal-500",
    })),
    ...logs.map<FeedItem>((l) => ({
      key: `a:${l.id}`,
      when: l.at,
      kind: "admin",
      action: l.action,
      title: humanizeAction(l.action),
      subtitle: l.target ? `Target ${String(l.target).slice(0, 12)}…` : "Admin action",
      accent: "from-violet-500 to-blue-500",
    })),
  ];

  items.sort((a, b) => (a.when < b.when ? 1 : -1));
  return items.slice(0, limit);
}

function humanizeAction(action: string): string {
  if (action === "login.ok") return "Admin signed in";
  if (action === "login.failed") return "Failed admin login attempt";
  if (action === "logout") return "Admin logged out";
  if (action === "launch.created") return "Launch draft created";
  if (action === "launch.sent") return "Launch sent";
  if (action === "launch.send.requested") return "Launch send requested";
  if (action === "launch.send.failed") return "Launch send failed";
  if (action === "launch.cancelled") return "Launch cancelled";
  return action;
}

export async function ActivityFeed({ limit = 12 }: { limit?: number }) {
  const items = await loadFeed(limit);
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
            Live feed
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight">Latest activity</h3>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-white/40">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          live
        </span>
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/40">Nothing to show yet — activity will appear here in real time.</p>
      ) : (
        <ol className="relative space-y-1 pl-6 before:absolute before:left-2 before:top-0 before:bottom-0 before:w-px before:bg-white/[0.06]">
          {items.map((item, i) => {
            const style = KIND_STYLES[item.kind === "signup" ? "signup" : item.action] || KIND_STYLES["logout"];
            return (
              <li
                key={item.key}
                className="relative py-2"
                style={{ animation: `feed-in 0.6s cubic-bezier(0.22,1,0.36,1) ${i * 0.05}s both` }}
              >
                <span
                  className={`absolute -left-[22px] top-3 inline-flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-[#050508] ${style.dot}`}
                >
                  <svg className="h-2.5 w-2.5 text-[#050508]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
                  </svg>
                </span>
                <p className="text-sm text-white/85">{item.title}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {item.subtitle} · <span title={new Date(item.when).toLocaleString()}>{relative(item.when)}</span>
                </p>
              </li>
            );
          })}
        </ol>
      )}

      <style>{`
        @keyframes feed-in {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
