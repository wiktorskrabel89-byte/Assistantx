"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart2, Bot, MessageSquareText, Zap } from "lucide-react";
import UserProfileEditor, { type UserProfile } from "../UserProfileEditor";
import { createClient } from "@/lib/client";
import { useWorkspace } from "@/app/providers/WorkspaceProvider";
import { PRO_PLAN, PRO_PLUS_PLAN } from "@/lib/ai-config";

type SaveStatus = "idle" | "saving" | "success" | "error";

type Stats = {
  totalMessages: number;
  totalTokens: number;
  totalConversations: number;
  topModels: Array<{ model: string; count: number }>;
  userPlan: string;
  premiumRequestsUsed: number;
};

function UsageBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 truncate text-xs text-slate-500">{label}</span>
      <div className="flex-1 rounded-full bg-slate-200" style={{ height: 8 }}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: "width 0.6s ease" }} />
      </div>
      <span className="w-8 text-right text-xs font-medium text-slate-700">{value}</span>
    </div>
  );
}

export function SettingsTab() {
  const { state, activeWorkspace } = useWorkspace();

  const [profile, setProfile] = useState<UserProfile>({
    avatarUrl: "",
    displayName: "",
    email: "",
    bio: "",
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const [serverStats, setServerStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const hasFetchedStatsRef = useRef(false);

  // Load real user data from Supabase on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setProfile({
        email: user.email ?? "",
        displayName:
          (user.user_metadata?.display_name as string | undefined) ??
          (user.user_metadata?.full_name as string | undefined) ??
          "",
        avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? "",
        bio: (user.user_metadata?.bio as string | undefined) ?? "",
      });
    });
  }, []);

  // Load usage stats
  useEffect(() => {
    if (hasFetchedStatsRef.current) return;
    hasFetchedStatsRef.current = true;
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      return fetch("/api/stats", { headers });
    }).then((res) => (res.ok ? res.json() : null))
      .then((data: Stats | null) => { if (data) setServerStats(data); })
      .catch(() => null)
      .finally(() => setStatsLoading(false));
  }, []);

  async function handleSave(updatedProfile: UserProfile) {
    setSaveStatus("saving");
    setErrorMessage("");
    const supabase = createClient();
    const { error: metaError } = await supabase.auth.updateUser({
      data: {
        display_name: updatedProfile.displayName,
        bio: updatedProfile.bio,
        avatar_url: updatedProfile.avatarUrl,
      },
    });
    if (metaError) {
      setErrorMessage(metaError.message);
      setSaveStatus("error");
      return;
    }
    // Upsert profile data — check for errors and surface them to the user
    const { error: upsertError } = await supabase.from("profiles").upsert({
      avatar_url: updatedProfile.avatarUrl,
      display_name: updatedProfile.displayName,
      email: updatedProfile.email,
      bio: updatedProfile.bio,
    });
    if (upsertError) {
      setErrorMessage(upsertError.message);
      setSaveStatus("error");
      return;
    }
    setProfile(updatedProfile);
    setSaveStatus("success");
    setTimeout(() => setSaveStatus("idle"), 3000);
  }

  // Derive local stats as fallback
  const localMessageCount = activeWorkspace.chats.reduce((sum, c) => sum + c.messages.length, 0);
  const localConversations = activeWorkspace.chats.length;

  const modelCounts: Record<string, number> = {};
  for (const chat of activeWorkspace.chats) {
    for (const msg of chat.messages) {
      if (msg.model) modelCounts[msg.model] = (modelCounts[msg.model] ?? 0) + 1;
    }
  }
  const topLocalModels = Object.entries(modelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([model, count]) => ({ model, count }));

  const totalMessages = serverStats?.totalMessages ?? localMessageCount;
  const totalConversations = serverStats?.totalConversations ?? localConversations;
  const premiumRequestsUsed = serverStats?.premiumRequestsUsed ?? state.premiumRequestsUsed;
  const topModels = (serverStats?.topModels?.length ? serverStats.topModels : topLocalModels).slice(0, 5);
  const maxModelCount = Math.max(...topModels.map((m) => m.count), 1);

  const planLimit =
    state.userPlan === "pro"
      ? PRO_PLAN.premiumRequestsPerMonth
      : state.userPlan === "pro+"
        ? PRO_PLUS_PLAN.premiumRequestsPerMonth
        : null;

  return (
    <section className="h-full min-h-0 overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {/* Profile card */}
        <div className="rounded-3xl border border-sky-200/60 bg-white/90 p-6 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)] backdrop-blur sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800">
            Ustawienia profilu
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Edit Profile</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">Zarządzaj profilem i informacjami widocznymi w przestrzeni AssistantX.</p>

          {saveStatus === "success" && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
              Profil zapisany pomyślnie.
            </div>
          )}
          {saveStatus === "error" && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
              Błąd: {errorMessage || "Nie udało się zapisać profilu."}
            </div>
          )}

          <div className="mt-6">
            <UserProfileEditor profile={profile} onSave={(p) => { void handleSave(p); }} />
          </div>
        </div>

        {/* Usage stats card */}
        <div className="rounded-3xl border border-sky-200/60 bg-white/90 p-6 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)] backdrop-blur sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800">
            <BarChart2 className="h-3.5 w-3.5" />
            Użycie
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Statystyki użycia</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">Przegląd aktywności i limitu planu.</p>

          {statsLoading ? (
            <p className="mt-6 text-sm text-slate-400">Ładowanie statystyk…</p>
          ) : (
            <div className="mt-6 flex flex-col gap-5">
              {/* KPI row */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                    <MessageSquareText className="h-3.5 w-3.5" /> Wiadomości
                  </div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">{totalMessages.toLocaleString()}</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                    <MessageSquareText className="h-3.5 w-3.5" /> Rozmowy
                  </div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">{totalConversations.toLocaleString()}</div>
                </div>

                {planLimit !== null && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                      <Zap className="h-3.5 w-3.5" /> Zapytania premium
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {premiumRequestsUsed}
                      <span className="text-sm font-normal text-slate-400"> / {planLimit}</span>
                    </div>
                    <div className="mt-3 rounded-full bg-slate-200" style={{ height: 7 }}>
                      <div
                        className={`h-full rounded-full ${premiumRequestsUsed / planLimit >= 0.8 ? "bg-amber-500" : "bg-sky-500"}`}
                        style={{ width: `${Math.min((premiumRequestsUsed / planLimit) * 100, 100)}%`, transition: "width 0.6s ease" }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Top models */}
              {topModels.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Bot className="h-4 w-4 text-sky-500" />
                    <span className="text-sm font-semibold text-slate-700">Najczęściej używane modele</span>
                  </div>
                  <div className="space-y-3">
                    {topModels.map((m, i) => (
                      <UsageBar
                        key={m.model}
                        label={m.model.split("/").pop() ?? m.model}
                        value={m.count}
                        max={maxModelCount}
                        color={i === 0 ? "bg-sky-500" : i === 1 ? "bg-cyan-500" : "bg-slate-400"}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
