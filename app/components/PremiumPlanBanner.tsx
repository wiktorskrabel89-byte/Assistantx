"use client";

import { Crown, Sparkles, ArrowRight } from "lucide-react";
import { PRO_PLAN, PRO_PLUS_PLAN } from "@/lib/ai-config";
import type { UserPlan } from "@/lib/ai-config";

type PremiumPlanBannerProps = {
  dark: boolean;
  userPlan: UserPlan;
  premiumRequestsUsed: number;
  onSetUserPlan: (plan: UserPlan) => void;
};

export function PremiumPlanBanner({ dark, userPlan, premiumRequestsUsed, onSetUserPlan }: PremiumPlanBannerProps) {
  const planInfo = userPlan === "pro+" ? PRO_PLUS_PLAN : userPlan === "pro" ? PRO_PLAN : null;
  const remaining = planInfo ? Math.max(0, planInfo.premiumRequestsPerMonth - premiumRequestsUsed) : 0;

  if (userPlan === "pro" || userPlan === "pro+") {
    const label = userPlan === "pro+" ? "Pro+ Active" : "Pro Active";
    const accentDark = userPlan === "pro+" ? "border-purple-800/50 bg-purple-950/30" : "border-sky-800/50 bg-sky-950/30";
    const accentLight = userPlan === "pro+" ? "border-purple-200 bg-purple-50" : "border-sky-200 bg-sky-50";
    const iconColor = userPlan === "pro+" ? (dark ? "text-purple-400" : "text-purple-600") : (dark ? "text-sky-400" : "text-sky-600");
    const textColor = userPlan === "pro+" ? (dark ? "text-purple-200" : "text-purple-800") : (dark ? "text-sky-200" : "text-sky-800");
    const subtextColor = userPlan === "pro+" ? (dark ? "text-purple-300/70" : "text-purple-700/80") : (dark ? "text-sky-300/70" : "text-sky-700/80");
    const barFill = userPlan === "pro+" ? "bg-purple-500" : "bg-sky-500";
    const barTrack = userPlan === "pro+" ? (dark ? "bg-purple-900/50" : "bg-purple-200") : (dark ? "bg-sky-900/50" : "bg-sky-200");
    const countColor = userPlan === "pro+" ? (dark ? "text-purple-400" : "text-purple-600") : (dark ? "text-sky-400" : "text-sky-600");

    return (
      <div className={`rounded-2xl border p-4 ${dark ? accentDark : accentLight}`}>
        <div className="flex items-center gap-2">
          <Crown className={`h-5 w-5 ${iconColor}`} />
          <span className={`text-sm font-bold ${textColor}`}>{label}</span>
        </div>
        <p className={`mt-1.5 text-xs ${subtextColor}`}>
          Unlimited chats &middot; {remaining} premium requests remaining &middot; All models{userPlan === "pro+" ? " incl. Claude Opus 4.7" : ""}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${barTrack}`}>
            <div
              className={`h-full rounded-full transition-all ${barFill}`}
              style={{ width: `${Math.min(100, (premiumRequestsUsed / planInfo!.premiumRequestsPerMonth) * 100)}%` }}
            />
          </div>
          <span className={`text-[10px] font-medium ${countColor}`}>
            {premiumRequestsUsed}/{planInfo!.premiumRequestsPerMonth}
          </span>
        </div>
        <button
          onClick={() => onSetUserPlan("free")}
          className={`mt-3 w-full rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${dark ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}
        >
          Manage subscription
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 ${dark ? "border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900" : "border-slate-200 bg-gradient-to-br from-white to-slate-50"}`}>
      <div className="flex items-center gap-2">
        <Sparkles className={`h-5 w-5 ${dark ? "text-sky-400" : "text-sky-500"}`} />
        <span className={`text-sm font-bold ${dark ? "text-white" : "text-slate-900"}`}>Upgrade your plan</span>
      </div>
      <p className={`mt-1.5 text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
        Unlock premium models and more requests
      </p>
      <button
        onClick={() => { window.location.href = "/pricing"; }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all bg-gradient-to-r from-sky-500 to-purple-600 hover:from-sky-600 hover:to-purple-700"
      >
        See plans &amp; pricing
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
      <p className={`mt-2 text-center text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>
        Free plan: free models only
      </p>
    </div>
  );
}
