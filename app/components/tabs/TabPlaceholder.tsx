// TODO: This is a generic placeholder for tabs. Replace with real content as features are built.
"use client";

import type { LucideIcon } from "lucide-react";

type TabPlaceholderProps = {
  dark: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
};

export function TabPlaceholder({ dark, icon: Icon, title, description }: TabPlaceholderProps) {
  return (
    <section
      className={`flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-6 animate-tab-enter ${
        dark
          ? "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(135deg,#020617,#0f172a_46%,#082f49)]"
          : "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)]"
      }`}
    >
      <div
        className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl border shadow-lg transition-transform duration-300 hover:scale-105 ${
          dark
            ? "border-sky-900/70 bg-sky-950/55 text-sky-200 shadow-cyan-950/30"
            : "border-sky-200/80 bg-white/85 text-sky-700 shadow-sky-200/60"
        }`}
      >
        <Icon className="h-7 w-7" />
      </div>
      <h2
        className={`mt-5 text-xl font-semibold tracking-tight ${
          dark ? "text-slate-100" : "text-slate-900"
        }`}
      >
        {title}
      </h2>
      <p
        className={`mt-2 max-w-sm text-center text-sm ${
          dark ? "text-slate-300" : "text-slate-600"
        }`}
      >
        {description}
      </p>
      <span
        className={`mt-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
          dark
            ? "border border-amber-300/20 bg-amber-200/10 text-amber-200"
            : "border border-amber-300/60 bg-amber-100/70 text-amber-700"
        }`}
      >
        Coming soon
      </span>
    </section>
  );
}
