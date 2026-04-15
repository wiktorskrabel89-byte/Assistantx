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
      className={`flex h-full min-h-0 flex-col items-center justify-center px-6 animate-tab-enter ${
        dark ? "bg-slate-950" : "bg-[#f7f8fd]"
      }`}
    >
      <div
        className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg transition-transform duration-300 hover:scale-105 ${
          dark
            ? "bg-slate-800 text-slate-300 shadow-slate-900/40"
            : "bg-white text-slate-500 shadow-slate-200/70"
        }`}
      >
        <Icon className="h-7 w-7" />
      </div>
      <h2
        className={`mt-5 text-xl font-semibold tracking-tight ${
          dark ? "text-white" : "text-slate-900"
        }`}
      >
        {title}
      </h2>
      <p
        className={`mt-2 max-w-sm text-center text-sm ${
          dark ? "text-slate-400" : "text-slate-500"
        }`}
      >
        {description}
      </p>
      <span
        className={`mt-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
          dark
            ? "bg-blue-500/10 text-blue-300"
            : "bg-blue-50 text-blue-600"
        }`}
      >
        Wkrotce dostepne
      </span>
    </section>
  );
}
