"use client";

import { BarChart2, Bot, MessageSquareText, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/client";
import { useWorkspace } from "@/app/providers/WorkspaceProvider";
import { PRO_PLAN, PRO_PLUS_PLAN } from "@/lib/ai-config";

type Stats = {
  totalMessages: number;
  totalTokens: number;
  totalConversations: number;
  topModels: Array<{ model: string; count: number }>;
  userPlan: string;
  premiumRequestsUsed: number;
};

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 truncate text-xs">{label}</span>
      <div className="flex-1 rounded-full bg-slate-200 dark:bg-slate-800" style={{ height: 10 }}>
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%`, transition: "width 0.6s ease" }}
        />
      </div>
      <span className="w-8 text-right text-xs font-medium">{value}</span>
    </div>
  );
}

export function StatsTab({ dark }: { dark: boolean }) {
  const { state, activeWorkspace } = useWorkspace();
  const [serverStats, setServerStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      return fetch("/api/stats", { headers });
    }).then((res) => (res.ok ? res.json() : null))
      .then((data: Stats | null) => {
        if (data) setServerStats(data);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  // Derive local stats from client state as a fallback / supplement
  const localMessageCount = activeWorkspace.chats.reduce((sum, c) => sum + c.messages.length, 0);
  const localConversations = activeWorkspace.chats.length;

  // Per-model usage from local messages
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

  const planLimit =
    state.userPlan === "pro"
      ? PRO_PLAN.premiumRequestsPerMonth
      : state.userPlan === "pro+"
        ? PRO_PLUS_PLAN.premiumRequestsPerMonth
        : null;

  const maxModelCount = Math.max(...topModels.map((m) => m.count), 1);

  const card = dark
    ? "border border-slate-800 bg-slate-950/70 rounded-2xl p-5"
    : "border border-slate-200 bg-white/90 rounded-2xl p-5 shadow-sm";

  const bg = dark
    ? "bg-[linear-gradient(135deg,#020617,#0f172a_46%,#082f49)] text-slate-100"
    : "bg-[linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] text-slate-900";

  return (
    <section className={`h-full min-h-0 overflow-auto p-4 sm:p-6 lg:p-8 ${bg}`}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {/* Header */}
        <div className={dark ? "border border-sky-900/60 bg-slate-950/65 rounded-3xl p-6 sm:p-8" : "border border-sky-200/60 bg-white/90 rounded-3xl p-6 sm:p-8 shadow-lg"}>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${dark ? "border-sky-600/40 bg-sky-500/10 text-sky-200" : "border-sky-300/70 bg-white/70 text-sky-800"}`}>
            <BarChart2 className="h-3.5 w-3.5" />
            Moje statystyki
          </div>
          <h2 className={`mt-5 text-2xl font-semibold tracking-tight ${dark ? "text-slate-100" : "text-slate-900"}`}>
            Pulpit użycia
          </h2>
          <p className={`mt-2 max-w-2xl text-sm leading-7 ${dark ? "text-slate-300" : "text-slate-600"}`}>
            Przegląd aktywności, wykorzystanych tokenów i limitu planu.
          </p>
        </div>

        {loading ? (
          <div className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>Ładowanie statystyk…</div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className={card}>
                <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide">
                  <MessageSquareText className="h-3.5 w-3.5" /> Wiadomości
                </div>
                <div className={`mt-2 text-3xl font-bold ${dark ? "text-slate-100" : "text-slate-900"}`}>{totalMessages.toLocaleString()}</div>
              </div>

              <div className={card}>
                <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide">
                  <MessageSquareText className="h-3.5 w-3.5" /> Rozmowy
                </div>
                <div className={`mt-2 text-3xl font-bold ${dark ? "text-slate-100" : "text-slate-900"}`}>{totalConversations.toLocaleString()}</div>
              </div>

              {planLimit !== null && (
                <div className={card}>
                  <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide">
                    <Zap className="h-3.5 w-3.5" /> Zapytania premium
                  </div>
                  <div className={`mt-2 text-3xl font-bold ${dark ? "text-slate-100" : "text-slate-900"}`}>
                    {premiumRequestsUsed}
                    <span className="text-sm font-normal text-slate-400"> / {planLimit}</span>
                  </div>
                  {/* Usage bar */}
                  <div className="mt-3 rounded-full bg-slate-200 dark:bg-slate-800" style={{ height: 8 }}>
                    <div
                      className={`h-full rounded-full ${premiumRequestsUsed / planLimit >= 0.8 ? "bg-amber-500" : "bg-sky-500"}`}
                      style={{ width: `${Math.min((premiumRequestsUsed / planLimit) * 100, 100)}%`, transition: "width 0.6s ease" }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Top models bar chart */}
            {topModels.length > 0 && (
              <div className={card}>
                <div className="flex items-center gap-2 mb-4">
                  <Bot className="h-4 w-4 text-sky-500" />
                  <span className={`text-sm font-semibold ${dark ? "text-slate-200" : "text-slate-700"}`}>Najczęściej używane modele</span>
                </div>
                <div className="space-y-3">
                  {topModels.map((m, i) => (
                    <Bar
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
          </>
        )}
      </div>
    </section>
  );
}
