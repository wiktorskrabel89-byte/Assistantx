"use client";

import { ArrowRight, Cloud } from "lucide-react";

type GoogleIntegrationBannerProps = {
  dark: boolean;
  visible: boolean;
  connecting: boolean;
  onConnectGoogle: () => void;
  onOpenApps: () => void;
};

export function GoogleIntegrationBanner({
  dark,
  visible,
  connecting,
  onConnectGoogle,
  onOpenApps,
}: GoogleIntegrationBannerProps) {
  if (!visible) return null;

  return (
    <div className={`mb-3 flex flex-col gap-3 rounded-3xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${dark ? "border-slate-800 bg-slate-900 text-slate-100" : "border-blue-100 bg-blue-50/80 text-slate-900"}`}>
      <div className="flex min-w-0 items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${dark ? "bg-slate-800 text-blue-300" : "bg-white text-blue-600"}`}>
          <Cloud className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Connect Google</div>
          <div className="mt-1 text-sm text-slate-500">
            Access Drive files, Gmail messages, and Calendar events directly inside the chat.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={onConnectGoogle}
          disabled={connecting}
          className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {connecting ? "Connecting..." : "Connect Google"}
        </button>
        <button
          onClick={onOpenApps}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${dark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-700"}`}
        >
          <span>Open apps</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}