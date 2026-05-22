"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";
import type { MCPServerMeta } from "./MarketplaceClient";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jarvisApi?: any;
  }
}

const ELECTRON_AVAILABLE =
  typeof window !== "undefined" && typeof window.jarvisApi?.mcp?.setApiKey === "function";

type GoogleAuthStep = "idle" | "polling" | "done" | "error";

type Props = {
  server: MCPServerMeta;
  dark: boolean;
  onClose: () => void;
};

export function MCPServerConfigPanel({ server, dark, onClose }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [googleStep, setGoogleStep] = useState<GoogleAuthStep>("idle");
  const [googleUserCode, setGoogleUserCode] = useState("");
  const [googleVerifyUrl, setGoogleVerifyUrl] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const panelBg = dark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900";
  const labelCn = `text-xs font-medium ${dark ? "text-slate-400" : "text-slate-500"}`;
  const inputCn = `w-full rounded-xl border px-3 py-2 text-sm ${
    dark ? "border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500" : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
  } focus:outline-none focus:ring-2 focus:ring-violet-500`;

  function saveKey(key: string) {
    if (!key.trim()) return;
    if (ELECTRON_AVAILABLE) {
      void window.jarvisApi.mcp.setApiKey(server.serverId, key.trim()).then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      });
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  const startGoogleAuth = useCallback(async () => {
    if (!ELECTRON_AVAILABLE) return;
    setGoogleStep("polling");
    try {
      const res = await window.jarvisApi.mcp.googleStartAuth() as { user_code?: string; verification_url?: string; device_code?: string };
      setGoogleUserCode(res.user_code ?? "");
      setGoogleVerifyUrl(res.verification_url ?? "");
      const deviceCode = res.device_code ?? "";

      pollRef.current = setInterval(async () => {
        try {
          const tokenRes = await window.jarvisApi.mcp.googlePollAuth(deviceCode);
          if (tokenRes?.access_token || tokenRes?.refresh_token) {
            if (pollRef.current) clearInterval(pollRef.current);
            setGoogleStep("done");
          }
        } catch {
          // authorization_pending is normal — keep polling
        }
      }, 5000);
    } catch {
      setGoogleStep("error");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function renderBody() {
    if (server.authMethod === "google_oauth2") {
      return (
        <div className="space-y-4">
          <p className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
            One Google login unlocks <strong>Gmail</strong>, <strong>Google Calendar</strong>, and <strong>Google Drive</strong> simultaneously via a shared OAuth2 token.
          </p>

          {googleStep === "idle" && (
            <button
              type="button"
              onClick={() => void startGoogleAuth()}
              disabled={!ELECTRON_AVAILABLE}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              Connect Google Account
            </button>
          )}

          {googleStep === "polling" && (
            <div className={`rounded-xl border p-4 text-center ${dark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"}`}>
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-violet-500" />
              <p className="text-sm font-medium">Visit the link below and enter the code:</p>
              <a
                href={googleVerifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center justify-center gap-1 text-sm text-blue-500 hover:underline"
              >
                {googleVerifyUrl} <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <div className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-2xl font-bold tracking-widest text-white">
                {googleUserCode}
              </div>
              <p className={`mt-2 text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>Polling every 5 s…</p>
            </div>
          )}

          {googleStep === "done" && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">Google connected — Gmail, Calendar & Drive are active.</span>
            </div>
          )}

          {googleStep === "error" && (
            <p className="text-sm text-red-500">Failed to initiate Google login. Make sure you are running the desktop app.</p>
          )}

          {!ELECTRON_AVAILABLE && (
            <p className={`text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>
              Google OAuth Device Flow is only available in the Jarvis desktop app.
            </p>
          )}
        </div>
      );
    }

    if (server.authMethod === "pat") {
      return (
        <div className="space-y-3">
          <label htmlFor="mcp-pat" className={labelCn}>GitHub Personal Access Token</label>
          <input
            id="mcp-pat"
            type="password"
            placeholder="ghp_..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className={inputCn}
          />
          <button
            type="button"
            onClick={() => saveKey(inputValue)}
            className="w-full rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            {saved ? "Saved ✓" : "Save token"}
          </button>
          <p className={`text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>
            Needs <code className="rounded bg-muted px-1">read:user repo</code> scopes.{" "}
            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Create one →</a>
          </p>
        </div>
      );
    }

    if (server.authMethod === "api_key") {
      return (
        <div className="space-y-3">
          <label htmlFor="mcp-apikey" className={labelCn}>
            {server.serverId === "brave-search" ? "Brave Search API Key" : "API Key"}
          </label>
          <input
            id="mcp-apikey"
            type="password"
            placeholder="BSA..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className={inputCn}
          />
          <button
            type="button"
            onClick={() => saveKey(inputValue)}
            className="w-full rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            {saved ? "Saved ✓" : "Save key"}
          </button>
          {server.serverId === "brave-search" && (
            <a href="https://brave.com/search/api/" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
              Get a free Brave Search API key →
            </a>
          )}
        </div>
      );
    }

    if (server.authMethod === "uri") {
      return (
        <div className="space-y-3">
          <label htmlFor="mcp-uri" className={labelCn}>PostgreSQL Connection URI</label>
          <input
            id="mcp-uri"
            type="password"
            placeholder="postgresql://user:pass@host:5432/db"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className={inputCn}
          />
          <button
            type="button"
            onClick={() => saveKey(inputValue)}
            className="w-full rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            {saved ? "Saved ✓" : "Save URI"}
          </button>
        </div>
      );
    }

    if (server.authMethod === "slack_oauth") {
      return (
        <div className="space-y-3">
          <p className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
            Enter your Slack Bot Token (starts with <code>xoxb-</code>) after creating a Slack app with the required permissions.
          </p>
          <input
            id="mcp-slack"
            type="password"
            placeholder="xoxb-..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className={inputCn}
          />
          <button
            type="button"
            onClick={() => saveKey(inputValue)}
            className="w-full rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            {saved ? "Saved ✓" : "Save token"}
          </button>
          <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
            Create a Slack app →
          </a>
        </div>
      );
    }

    if (server.authMethod === "local_path") {
      return (
        <p className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
          The Filesystem server runs in the desktop app and has access to your Documents folder by default. Use the Jarvis desktop to select a custom root path.
        </p>
      );
    }

    if (server.authMethod === "local_file") {
      return (
        <div className={`rounded-xl border px-4 py-3 text-sm ${dark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"}`}>
          <p className={dark ? "text-slate-300" : "text-slate-700"}>
            Memory is stored locally in:
          </p>
          <code className={`mt-1 block text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
            userData/jarvis-memory.json
          </code>
          <p className={`mt-2 text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>
            No configuration needed — the file is created automatically on first use.
          </p>
        </div>
      );
    }

    // none / fetch
    return (
      <p className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
        This server requires no authentication. Just install it and start using it in your chats.
      </p>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l shadow-2xl ${panelBg}`}
        role="dialog"
        aria-label={`Configure ${server.name}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-5 py-4 ${dark ? "border-slate-700" : "border-slate-200"}`}>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{server.icon}</span>
            <div>
              <div className="text-sm font-semibold">{server.name}</div>
              <div className={`text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>Configure MCP Server</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg p-1.5 transition ${dark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {renderBody()}
        </div>
      </div>
    </>
  );
}
