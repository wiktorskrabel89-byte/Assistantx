"use client";

import { Check, Crown, Sparkles } from "lucide-react";
import { PREMIUM_PLAN } from "@/lib/ai-config";

async function handleStripeCheckout() {
  const res = await fetch("/api/stripe/checkout", { method: "POST" });
  const data = await res.json();
  if (data.url) {
    window.location.href = data.url;
  } else {
    alert("Failed to start checkout. Please try again later.");
  }
}

type PremiumPlanBannerProps = {
  dark: boolean;
  isPremium: boolean;
  premiumRequestsUsed: number;
  onTogglePremium: () => void;
};

export function PremiumPlanBanner({ dark, isPremium, premiumRequestsUsed, onTogglePremium }: PremiumPlanBannerProps) {
  const remaining = Math.max(0, PREMIUM_PLAN.premiumRequestsPerMonth - premiumRequestsUsed);

  if (isPremium) {
    return (
      <div className={`rounded-2xl border p-4 ${dark ? "border-amber-800/50 bg-amber-950/30" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-center gap-2">
          <Crown className={`h-5 w-5 ${dark ? "text-amber-400" : "text-amber-600"}`} />
          <span className={`text-sm font-bold ${dark ? "text-amber-200" : "text-amber-800"}`}>Premium Plan Active</span>
        </div>
        <p className={`mt-1.5 text-xs ${dark ? "text-amber-300/70" : "text-amber-700/80"}`}>
          Unlimited chats &middot; {remaining} premium requests remaining &middot; All models unlocked
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${dark ? "bg-amber-900/50" : "bg-amber-200"}`}>
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${Math.min(100, (premiumRequestsUsed / PREMIUM_PLAN.premiumRequestsPerMonth) * 100)}%` }}
            />
          </div>
          <span className={`text-[10px] font-medium ${dark ? "text-amber-400" : "text-amber-600"}`}>
            {premiumRequestsUsed}/{PREMIUM_PLAN.premiumRequestsPerMonth}
          </span>
        </div>
        <button
          onClick={onTogglePremium}
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
        <Sparkles className={`h-5 w-5 ${dark ? "text-amber-400" : "text-amber-500"}`} />
        <span className={`text-sm font-bold ${dark ? "text-white" : "text-slate-900"}`}>Upgrade to Premium</span>
      </div>
      <p className={`mt-1.5 text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
        ${PREMIUM_PLAN.priceUsd}/month &middot; You can pay for the premium plan anytime
      </p>
      <ul className={`mt-3 space-y-1.5 text-xs ${dark ? "text-slate-300" : "text-slate-600"}`}>
        <li className="flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-emerald-500" /> Unlimited chats
        </li>
        <li className="flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-emerald-500" /> {PREMIUM_PLAN.premiumRequestsPerMonth} premium requests/month
        </li>
        <li className="flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-emerald-500" /> Access to all models (GPT-5.4, Claude Opus, Grok 4...)
        </li>
      </ul>
      <button
        onClick={handleStripeCheckout}
        className="mt-3 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:from-amber-600 hover:to-orange-600"
      >
        <Crown className="mr-1 inline h-3.5 w-3.5" />
        Upgrade to Premium
      </button>
      <p className={`mt-2 text-center text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>
        Free plan: free models only
      </p>
    </div>
  );
}
