"use client";

import { BarChart2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChatThread } from "../lib/chat-types";
import type { UserPlan } from "@/lib/ai-config";
import { PRO_PLAN, PRO_PLUS_PLAN } from "@/lib/ai-config";

type UsageDashboardProps = {
  open: boolean;
  dark: boolean;
  userPlan: UserPlan;
  premiumRequestsUsed: number;
  workspaces: Array<{ chats: ChatThread[] }>;
  onClose: () => void;
};

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function UsageDashboard({ open, dark, userPlan, premiumRequestsUsed, workspaces, onClose }: UsageDashboardProps) {
  // Capture the current time when the dashboard opens so the chart window
  // stays stable and we avoid calling Date.now() inside useMemo (impure).
  const [now] = useState(Date.now);
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const planLimit = userPlan === "pro"
    ? PRO_PLAN.premiumRequestsPerMonth
    : userPlan === "pro+"
      ? PRO_PLUS_PLAN.premiumRequestsPerMonth
      : null;

  const allMessages = useMemo(() => {
    const msgs: Array<{ model: string | null; createdAt: number }> = [];
    for (const ws of workspaces) {
      for (const chat of ws.chats) {
        for (const msg of chat.messages) {
          if (msg.ai) msgs.push({ model: msg.model, createdAt: msg.createdAt });
        }
      }
    }
    return msgs;
  }, [workspaces]);

  // Last 7 days buckets
  const last7 = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const ts = now - i * 86_400_000;
      buckets[dayKey(ts)] = 0;
    }
    for (const msg of allMessages) {
      const key = dayKey(msg.createdAt);
      if (key in buckets) buckets[key]++;
    }
    return Object.entries(buckets).map(([key, count]) => {
      const d = new Date(key);
      return { label: DAY_LABELS[d.getDay()], count };
    });
  }, [allMessages, now]);

  // Per-model breakdown
  const modelBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const msg of allMessages) {
      const key = msg.model ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [allMessages]);

  const totalMessages = allMessages.length;
  const maxDay = Math.max(1, ...last7.map((d) => d.count));
  const usagePercent = planLimit !== null ? Math.min(100, Math.round((premiumRequestsUsed / planLimit) * 100)) : null;

  const border = dark ? "border-slate-800" : "border-slate-200";
  const text = dark ? "text-slate-100" : "text-slate-900";
  const subText = dark ? "text-slate-400" : "text-slate-500";
  const cardClass = `rounded-xl border p-4 ${dark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`;

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close usage dashboard"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40"
        />
      ) : null}
      <div
        className={`fixed right-0 top-0 z-40 flex h-full w-[min(480px,calc(100vw-1rem))] flex-col shadow-2xl transition-transform duration-200 ${dark ? "bg-slate-900 border-l border-slate-800" : "bg-white border-l border-slate-200"} ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className={`flex items-center justify-between border-b px-4 py-3 ${border}`}>
          <div className="flex items-center gap-2">
            <BarChart2 className={`h-4 w-4 ${subText}`} />
            <h2 className={`text-sm font-semibold ${text}`}>Usage Dashboard</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close usage dashboard"
            className={`rounded-lg p-1.5 transition-colors ${dark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Plan quota */}
          <div className={cardClass}>
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${subText}`}>
              Plan quota — {userPlan === "free" ? "Free" : userPlan === "pro" ? "Pro" : "Pro+"}
            </div>
            {usagePercent !== null && planLimit !== null ? (
              <>
                <div className="mb-1 flex justify-between text-sm">
                  <span className={text}>{premiumRequestsUsed} used</span>
                  <span className={subText}>{planLimit} / month</span>
                </div>
                <div className={`h-2 w-full overflow-hidden rounded-full ${dark ? "bg-slate-700" : "bg-slate-200"}`}>
                  <div
                    className={`h-2 rounded-full transition-all ${usagePercent >= 90 ? "bg-red-500" : usagePercent >= 70 ? "bg-amber-500" : "bg-sky-500"}`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                <div className={`mt-1 text-xs ${subText}`}>{usagePercent}% used</div>
              </>
            ) : (
              <div className={`text-sm ${subText}`}>Unlimited on free plan (no premium request tracking).</div>
            )}
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className={cardClass}>
              <div className={`text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Total responses</div>
              <div className={`mt-1 text-2xl font-bold ${text}`}>{totalMessages}</div>
            </div>
            <div className={cardClass}>
              <div className={`text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Last 7 days</div>
              <div className={`mt-1 text-2xl font-bold ${text}`}>{last7.reduce((s, d) => s + d.count, 0)}</div>
            </div>
          </div>

          {/* Daily bar chart */}
          <div className={cardClass}>
            <div className={`mb-3 text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Requests per day (last 7 days)</div>
            <div className="flex items-end gap-1.5" style={{ height: 64 }}>
              {last7.map(({ label, count }) => (
                <div key={label} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t transition-all bg-sky-500/80"
                    style={{ height: `${Math.round((count / maxDay) * 56)}px`, minHeight: count > 0 ? 4 : 0 }}
                  />
                  <span className={`text-[10px] ${subText}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-model breakdown */}
          {modelBreakdown.length > 0 ? (
            <div className={cardClass}>
              <div className={`mb-3 text-[11px] font-semibold uppercase tracking-wide ${subText}`}>Top models used</div>
              <div className="space-y-2">
                {modelBreakdown.map(([model, count]) => {
                  const pct = Math.round((count / totalMessages) * 100);
                  const shortLabel = model.includes("/") ? model.split("/")[1] : model;
                  return (
                    <div key={model}>
                      <div className="mb-0.5 flex justify-between text-xs">
                        <span className={`truncate ${text}`} title={model}>{shortLabel}</span>
                        <span className={subText}>{count} ({pct}%)</span>
                      </div>
                      <div className={`h-1.5 w-full overflow-hidden rounded-full ${dark ? "bg-slate-700" : "bg-slate-200"}`}>
                        <div className="h-1.5 rounded-full bg-sky-500/70" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
