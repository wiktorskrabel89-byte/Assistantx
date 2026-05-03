"use client";

import { ArrowLeft, Check, Crown, Lock, Sparkles, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { PRO_PLAN, PRO_PLUS_PLAN } from "@/lib/ai-config";

async function startCheckout(plan: "pro" | "pro+") {
  let res: Response;
  try {
    res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
  } catch {
    alert("Failed to start checkout. Please try again later.");
    return;
  }
  if (!res.ok) {
    alert("Failed to start checkout. Please try again later.");
    return;
  }
  let data: { url?: string };
  try {
    data = await res.json() as { url?: string };
  } catch {
    alert("Failed to start checkout. Please try again later.");
    return;
  }
  if (data.url) {
    window.location.href = data.url;
  } else {
    alert("Failed to start checkout. Please try again later.");
  }
}

const PRO_BENEFITS = [
  "Unlimited chats",
  `${PRO_PLAN.premiumRequestsPerMonth} premium requests / month`,
  "Access to all models (GPT-5.4, Claude Opus 4.6, Grok 4, Gemini 3 Pro…)",
  "Code review & analysis",
  "Image generation",
  "File uploads & analysis",
  "Web search mode",
  "Priority response speed",
];

const PRO_PLUS_BENEFITS = [
  "Everything in Pro",
  `${PRO_PLUS_PLAN.premiumRequestsPerMonth} premium requests / month (5× more than Pro)`,
  "Exclusive access to Claude Opus 4.7",
  "Access to all current and future models",
  "Highest priority response speed",
  "Early access to new features",
];

export default function PricingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="mb-8 ml-2 flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Sparkles className="h-7 w-7 text-sky-400" />
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Choose your plan</h1>
        </div>
        <p className="text-slate-400">
          Unlock the full power of AI — from everyday tasks to the most advanced models available.
        </p>
      </div>

      {/* Cards */}
      <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
        {/* Pro */}
        <div className="relative flex flex-col rounded-3xl border border-sky-700/50 bg-gradient-to-br from-sky-950/60 to-slate-900/80 p-8 shadow-xl">
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <Zap className="h-5 w-5 text-sky-400" />
              <span className="text-lg font-bold text-white">Pro</span>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-4xl font-extrabold text-white">${PRO_PLAN.priceUsd}</span>
              <span className="mb-1 text-sm text-slate-400">/month</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Perfect for power users who need premium models every day.
            </p>
          </div>

          <ul className="mb-8 flex-1 space-y-3">
            {PRO_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm text-slate-200">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                {benefit}
              </li>
            ))}
            <li className="flex items-start gap-2.5 text-sm text-slate-500">
              <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
              Claude Opus 4.7 (Pro+ only)
            </li>
          </ul>

          <button
            onClick={() => void startCheckout("pro")}
            className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:from-sky-600 hover:to-cyan-600 active:scale-95"
          >
            Get Pro — ${PRO_PLAN.priceUsd}/mo
          </button>
        </div>

        {/* Pro+ */}
        <div className="relative flex flex-col rounded-3xl border border-purple-600/60 bg-gradient-to-br from-purple-950/60 to-slate-900/80 p-8 shadow-xl ring-2 ring-purple-500/30">
          {/* "Most powerful" badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-1 text-[11px] font-bold text-white shadow-lg">
            Most Powerful
          </div>

          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <Crown className="h-5 w-5 text-purple-400" />
              <span className="text-lg font-bold text-white">Pro+</span>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-4xl font-extrabold text-white">${PRO_PLUS_PLAN.priceUsd}</span>
              <span className="mb-1 text-sm text-slate-400">/month</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              For professionals who demand the very best — including Claude Opus 4.7.
            </p>
          </div>

          <ul className="mb-8 flex-1 space-y-3">
            {PRO_PLUS_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm text-slate-200">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-400" />
                {benefit}
              </li>
            ))}
          </ul>

          <button
            onClick={() => void startCheckout("pro+")}
            className="w-full rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:from-purple-600 hover:to-pink-600 active:scale-95"
          >
            <Crown className="mr-1.5 inline h-4 w-4" />
            Get Pro+ — ${PRO_PLUS_PLAN.priceUsd}/mo
          </button>
        </div>
      </div>

      {/* Free tier note */}
      <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-slate-500">
        Free plan is always available with free-tier models. No credit card required.
      </p>

      {/* Feature comparison */}
      <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Feature</th>
              <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">Free</th>
              <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-sky-400">Pro</th>
              <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-purple-400">Pro+</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {[
              { feature: "Chats", free: "Unlimited", pro: "Unlimited", proPlus: "Unlimited" },
              { feature: "Premium requests / month", free: "—", pro: String(PRO_PLAN.premiumRequestsPerMonth), proPlus: String(PRO_PLUS_PLAN.premiumRequestsPerMonth) },
              { feature: "Free-tier models", free: "✓", pro: "✓", proPlus: "✓" },
              { feature: "All premium models", free: "—", pro: "✓", proPlus: "✓" },
              { feature: "Claude Opus 4.7", free: "—", pro: "—", proPlus: "✓" },
              { feature: "Image generation", free: "—", pro: "✓", proPlus: "✓" },
              { feature: "File uploads & analysis", free: "—", pro: "✓", proPlus: "✓" },
              { feature: "Web search mode", free: "—", pro: "✓", proPlus: "✓" },
              { feature: "Response speed", free: "Standard", pro: "Priority", proPlus: "Highest" },
            ].map(({ feature, free, pro, proPlus }) => (
              <tr key={feature}>
                <td className="px-6 py-3 text-slate-300">{feature}</td>
                <td className="px-4 py-3 text-center text-slate-500">{free}</td>
                <td className="px-4 py-3 text-center text-sky-300">{pro}</td>
                <td className="px-4 py-3 text-center text-purple-300">{proPlus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
