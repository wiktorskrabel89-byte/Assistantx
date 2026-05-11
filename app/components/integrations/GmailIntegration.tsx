"use client";

import { Mail, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import type { OAuthProvider } from "@/lib/integrations";

type GmailMessageSummary = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
};

function providerBadge(isConnected: boolean, dark: boolean) {
  if (isConnected) {
    return dark ? "bg-emerald-950 text-emerald-200" : "bg-emerald-100 text-emerald-800";
  }
  return dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700";
}

function formatGmailDate(isoDate: string) {
  if (!isoDate) return "";
  try {
    return new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoDate;
  }
}

type GmailIntegrationProps = {
  dark: boolean;
  linkedProviders: OAuthProvider[];
  authProvider: OAuthProvider | null;
  onSendGoogleContext?: (context: string) => void;
};

export function GmailIntegration({ dark, linkedProviders, authProvider, onSendGoogleContext }: GmailIntegrationProps) {
  const [gmailMessages, setGmailMessages] = useState<GmailMessageSummary[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState("");
  const [gmailAnalysis, setGmailAnalysis] = useState<string | null>(null);
  const [gmailAnalyzing, setGmailAnalyzing] = useState(false);
  const [gmailAnalysisQuery, setGmailAnalysisQuery] = useState("");

  const googleConnected = linkedProviders.includes("google") || authProvider === "google";

  async function fetchGmailMessages() {
    setGmailLoading(true);
    setGmailError("");
    try {
      const response = await fetch("/api/integrations/gmail?maxResults=20");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to fetch Gmail messages.");
      }
      setGmailMessages((data as { messages: GmailMessageSummary[] }).messages);
    } catch (error) {
      setGmailError(error instanceof Error ? error.message : "Failed to fetch Gmail messages.");
    } finally {
      setGmailLoading(false);
    }
  }

  async function analyzeGmail() {
    setGmailAnalyzing(true);
    setGmailError("");
    setGmailAnalysis(null);
    try {
      const response = await fetch("/api/integrations/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxResults: 20,
          query: gmailAnalysisQuery.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        messages?: GmailMessageSummary[];
        analysis?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Analysis failed.");
      if (data.messages) setGmailMessages(data.messages);
      if (data.analysis) {
        setGmailAnalysis(data.analysis);
        const emailList = (data.messages ?? [])
          .map((m) => `Subject: ${m.subject} | From: ${m.from}`)
          .join("\n");
        onSendGoogleContext?.(
          `Gmail inbox (${(data.messages ?? []).length} emails):\n${emailList}\n\nAI analysis:\n${data.analysis}`
        );
      }
    } catch (error) {
      setGmailError(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setGmailAnalyzing(false);
    }
  }

  return (
    <div className={`rounded-2xl border px-3 py-3 ${dark ? "border-gray-800 bg-gray-950/60" : "border-gray-200 bg-gray-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Mail className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? "text-blue-400" : "text-blue-600"}`} />
          <div>
            <div className="text-sm font-medium">Gmail</div>
            <p className="mt-1 text-xs leading-5 text-gray-500">View and analyze your inbox with AI. Connect Google to enable Gmail access.</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${providerBadge(googleConnected, dark)}`}>
          {googleConnected ? "Gmail ready" : "Link Google"}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => void fetchGmailMessages()}
            disabled={gmailLoading || !googleConnected}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-gray-800 text-gray-100 hover:bg-gray-700 disabled:opacity-50" : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${gmailLoading ? "animate-spin" : ""}`} />
            {gmailLoading ? "Loading..." : "Load emails"}
          </button>
          <button
            onClick={() => void analyzeGmail()}
            disabled={gmailAnalyzing || !googleConnected}
            title="AI analyzes your inbox and tells you which emails are important"
            aria-label="Analyze inbox with AI"
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-blue-900/70 text-blue-200 hover:bg-blue-800 disabled:opacity-50" : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"}`}
          >
            <Sparkles className={`h-3.5 w-3.5 ${gmailAnalyzing ? "animate-spin" : ""}`} />
            {gmailAnalyzing ? "Analyzing..." : "Analyze with AI"}
          </button>
        </div>

        <input
          id="gmail-analysis-query"
          name="gmailAnalysisQuery"
          type="text"
          value={gmailAnalysisQuery}
          onChange={(e) => setGmailAnalysisQuery(e.target.value)}
          placeholder="Custom question (e.g. which emails need urgent reply?)"
          disabled={!googleConnected}
          className={`w-full rounded-xl border px-3 py-2 text-xs ${dark ? "border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500" : "border-gray-300 bg-white text-gray-900 placeholder-gray-400"} disabled:opacity-50`}
        />

        {gmailAnalysis && (
          <div className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${dark ? "border-blue-900 bg-blue-950/40 text-blue-100" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
            <div className="mb-1 font-semibold">AI inbox analysis</div>
            <div className="whitespace-pre-wrap">{gmailAnalysis}</div>
          </div>
        )}

        {gmailMessages.length > 0 && (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {gmailMessages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-xl border px-3 py-2 ${dark ? "border-gray-800 bg-gray-900/80" : "border-gray-200 bg-white"}`}
              >
                <div className="truncate text-sm font-medium">{msg.subject}</div>
                <div className="mt-0.5 truncate text-[11px] text-gray-500">{msg.from}</div>
                <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-400">{msg.snippet}</div>
                {msg.date && <div className="mt-1 text-[10px] text-gray-500">{formatGmailDate(msg.date)}</div>}
              </div>
            ))}
          </div>
        )}

        {gmailError && <div className="text-xs text-rose-400">{gmailError}</div>}
      </div>
    </div>
  );
}
