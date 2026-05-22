"use client";

import { CheckCircle2, Settings2, ZapOff } from "lucide-react";
import type { MCPServerMeta } from "./MarketplaceClient";

const AUTH_LABELS: Record<string, string> = {
  pat: "GitHub PAT",
  local_path: "Local path",
  google_oauth2: "Google OAuth",
  uri: "Database URI",
  none: "No auth",
  api_key: "API key",
  slack_oauth: "Slack OAuth",
  local_file: "Local file",
};

const AUTH_COLORS: Record<string, string> = {
  pat: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  local_path: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  google_oauth2: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  uri: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  none: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  api_key: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  slack_oauth: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  local_file: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
};

type MCPServerCardProps = {
  server: MCPServerMeta;
  dark: boolean;
  installed: boolean;
  builtIn?: boolean;
  loading: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onConfigure: () => void;
};

export function MCPServerCard({
  server,
  dark,
  installed,
  builtIn = false,
  loading,
  onInstall,
  onUninstall,
  onConfigure,
}: MCPServerCardProps) {
  const cardBg = dark
    ? "bg-slate-800 border-slate-700"
    : "bg-white border-slate-200";

  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-3 shadow-sm ${cardBg}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="text-2xl leading-none">{server.icon}</div>
          <div>
            <div className="text-sm font-semibold">{server.name}</div>
            <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${AUTH_COLORS[server.authMethod] ?? AUTH_COLORS.none}`}>
              {AUTH_LABELS[server.authMethod] ?? server.authMethod}
            </span>
          </div>
        </div>
        {installed && !builtIn && (
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500 mt-0.5" />
        )}
        {builtIn && (
          <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${dark ? "bg-emerald-900/30 text-emerald-200" : "bg-emerald-100 text-emerald-700"}`}>
            Built-in
          </span>
        )}
      </div>

      {/* Description */}
      <p className={`text-xs leading-5 ${dark ? "text-slate-400" : "text-slate-500"}`}>
        {server.description}
      </p>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1">
        {server.capabilities.slice(0, 3).map((cap) => (
          <span
            key={cap}
            className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-medium ${
              dark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
            }`}
          >
            {cap}
          </span>
        ))}
        {server.capabilities.length > 3 && (
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${dark ? "text-slate-400" : "text-slate-500"}`}>
            +{server.capabilities.length - 3} more
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-auto flex gap-2">
        {builtIn ? (
          server.authMethod === "none" ? (
            <div className={`w-full rounded-xl px-3 py-2 text-center text-xs font-medium ${dark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-700"}`}>
              Always active
            </div>
          ) : (
            <button
              type="button"
              onClick={onConfigure}
              disabled={loading}
              className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                dark
                  ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200"
              } disabled:opacity-50`}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Configure
            </button>
          )
        ) : installed ? (
          <>
            <button
              type="button"
              onClick={onConfigure}
              disabled={loading}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                dark
                  ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200"
              } disabled:opacity-50`}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Configure
            </button>
            <button
              type="button"
              onClick={onUninstall}
              disabled={loading}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                dark
                  ? "bg-red-950/60 text-red-300 hover:bg-red-900/60"
                  : "bg-red-50 text-red-700 hover:bg-red-100"
              } disabled:opacity-50`}
            >
              <ZapOff className="h-3.5 w-3.5" />
              Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onInstall}
            disabled={loading}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}
