"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart2, Bot, Cloud, Globe, LogOut, MessageSquareText, Mic, MoonStar, Palette, RefreshCcw, Server, Sparkles, Sun, Theater, Trash2, Volume2, Zap } from "lucide-react";
import UserProfileEditor, { type UserProfile } from "../UserProfileEditor";
import { createClient } from "@/lib/client";
import { useWorkspace } from "@/app/providers/WorkspaceProvider";
import { PERSONALITY_MODES, PRO_PLAN, PRO_PLUS_PLAN } from "@/lib/ai-config";
import { DEFAULT_WEB_WAKE_PHRASE, VOICE_PROFILES } from "@/app/lib/voice";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MemorySummaryCard } from "../MemorySummaryCard";
import { getTranslations, UI_LANGUAGES } from "@/app/lib/i18n";
import { useJarvisDeviceStatus } from "@/app/hooks/useJarvisDeviceStatus";

type SaveStatus = "idle" | "saving" | "success" | "error";

type Stats = {
  totalMessages: number;
  totalTokens: number;
  totalConversations: number;
  topModels: Array<{ model: string; count: number }>;
  userPlan: string;
  premiumRequestsUsed: number;
};

function UsageBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 truncate text-xs text-slate-500">{label}</span>
      <div className="flex-1 rounded-full bg-slate-200" style={{ height: 8 }}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: "width 0.6s ease" }} />
      </div>
      <span className="w-8 text-right text-xs font-medium text-slate-700">{value}</span>
    </div>
  );
}

export function SettingsTab() {
  const {
    state,
    activeWorkspace,
    setDark,
    setTheme,
    setUiLanguage,
    cloudSyncStatus,
    cloudSyncMessage,
    userEmail,
    authReady,
    authProvider,
    linkedProviders,
    oauthLoading,
    signInWithProvider,
    signOut,
    setWakeWordEnabled,
    setWakeWordPhrase,
    setSttEnabled,
    setTtsEnabled,
    setVoiceLanguage,
    setTtsVoiceId,
    setAutoSpeakResponses,
    setPersonalityMode,
    setLocalOnlyMode,
    setPostPrReviewCommentsToGitHub,
    setJarvisCodeSettings,
    setMultiAgentBeta,
    addLocalServer,
    removeLocalServer,
    updateLocalServer,
    setLocalModelAssignment,
    setPreferLocalWhenAvailable,
  } = useWorkspace();

  const tr = getTranslations(state.uiLanguage ?? "en");

  const [profile, setProfile] = useState<UserProfile>({
    avatarUrl: "",
    displayName: "",
    email: "",
    bio: "",
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [newServerLabel, setNewServerLabel] = useState("");
  const [newServerBaseUrl, setNewServerBaseUrl] = useState("http://127.0.0.1:11434");
  const [newServerApiType, setNewServerApiType] = useState<"ollama" | "lmstudio" | "openai-compat">("ollama");
  const [localServerError, setLocalServerError] = useState("");
  const [scanBusyServerId, setScanBusyServerId] = useState<string | null>(null);
  const { primaryDevice, hasTrustedOnlineDesktop } = useJarvisDeviceStatus();

  const [serverStats, setServerStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const hasFetchedStatsRef = useRef(false);

  // Load real user data from Supabase on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setProfile({
        email: user.email ?? "",
        displayName:
          (user.user_metadata?.display_name as string | undefined) ??
          (user.user_metadata?.full_name as string | undefined) ??
          "",
        avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? "",
        bio: (user.user_metadata?.bio as string | undefined) ?? "",
      });
    });
  }, []);

  // Load usage stats
  useEffect(() => {
    if (hasFetchedStatsRef.current) return;
    hasFetchedStatsRef.current = true;
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      return fetch("/api/stats", { headers });
    }).then((res) => (res.ok ? res.json() : null))
      .then((data: Stats | null) => { if (data) setServerStats(data); })
      .catch(() => null)
      .finally(() => setStatsLoading(false));
  }, []);

  async function handleSave(updatedProfile: UserProfile) {
    setSaveStatus("saving");
    setErrorMessage("");
    const supabase = createClient();
    const { error: metaError } = await supabase.auth.updateUser({
      data: {
        display_name: updatedProfile.displayName,
        bio: updatedProfile.bio,
        avatar_url: updatedProfile.avatarUrl,
      },
    });
    if (metaError) {
      setErrorMessage(metaError.message);
      setSaveStatus("error");
      return;
    }
    // Upsert profile data — check for errors and surface them to the user
    const { error: upsertError } = await supabase.from("profiles").upsert({
      avatar_url: updatedProfile.avatarUrl,
      display_name: updatedProfile.displayName,
      email: updatedProfile.email,
      bio: updatedProfile.bio,
    });
    if (upsertError) {
      setErrorMessage(upsertError.message);
      setSaveStatus("error");
      return;
    }
    setProfile(updatedProfile);
    setSaveStatus("success");
    setTimeout(() => setSaveStatus("idle"), 3000);
  }

  // Derive local stats as fallback
  const localMessageCount = activeWorkspace.chats.reduce((sum, c) => sum + c.messages.length, 0);
  const localConversations = activeWorkspace.chats.length;

  const modelCounts: Record<string, number> = {};
  for (const chat of activeWorkspace.chats) {
    for (const msg of chat.messages) {
      if (msg.model) modelCounts[msg.model] = (modelCounts[msg.model] ?? 0) + 1;
    }
  }
  const topLocalModels = Object.entries(modelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([model, count]) => ({ model, count }));

  const totalMessages = serverStats?.totalMessages ?? localMessageCount;
  const totalConversations = serverStats?.totalConversations ?? localConversations;
  const premiumRequestsUsed = serverStats?.premiumRequestsUsed ?? state.premiumRequestsUsed;
  const topModels = (serverStats?.topModels?.length ? serverStats.topModels : topLocalModels).slice(0, 5);
  const maxModelCount = Math.max(...topModels.map((m) => m.count), 1);

  const planLimit =
    state.userPlan === "pro"
      ? PRO_PLAN.premiumRequestsPerMonth
      : state.userPlan === "pro+"
        ? PRO_PLUS_PLAN.premiumRequestsPerMonth
        : null;
  const dark = state.dark;
  const voiceSettings = activeWorkspace.settings;
  const appModeLabel = state.appMode === "ai-code" ? "AI Code" : "AI Chat";
  const sectionBackground = dark
    ? "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.2),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(135deg,#020617,#0f172a_46%,#082f49)]"
    : "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)]";
  const cardClass = dark
    ? "border-sky-900/70 bg-slate-950/70 text-slate-100 shadow-[0_24px_80px_-28px_rgba(2,132,199,0.35)]"
    : "border-sky-200/60 bg-white/90 text-slate-900 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)]";
  const chipClass = dark
    ? "border-sky-800/70 bg-slate-900/70 text-sky-200"
    : "border-sky-300/70 bg-white/70 text-sky-800";
  const mutedClass = dark ? "text-slate-300" : "text-slate-600";
  const softSurfaceClass = dark
    ? "border-slate-800 bg-slate-900/60"
    : "border-slate-200 bg-slate-50/80";
  const localServers = activeWorkspace.settings.localServers;
  const jarvisCodeSettings = activeWorkspace.settings.jarvisCode;
  const canUseSwarm = state.userPlan === "pro" || state.userPlan === "pro+";
  const swarmEnabled = jarvisCodeSettings?.use7AgentTasking ?? activeWorkspace.settings.multiAgentBeta ?? false;
  const localAssignment = activeWorkspace.settings.localModelAssignment ?? {
    chatModelId: null,
    codeModelId: null,
    externalApiModelId: null,
    serverId: null,
  };
  const localModelOptions = useMemo(() => {
    const options: Array<{ serverId: string; label: string; modelId: string; value: string }> = [];
    for (const server of localServers) {
      if (!server.enabled) continue;
      for (const modelId of server.discoveredModels ?? []) {
        options.push({
          serverId: server.id,
          label: `${server.label} · ${modelId}`,
          modelId,
          value: `${server.id}::${modelId}`,
        });
      }
    }
    return options;
  }, [localServers]);
  const hasLocalModelOptions = localModelOptions.length > 0;
  const selectedChatOption = localAssignment.serverId && localAssignment.chatModelId
    ? `${localAssignment.serverId}::${localAssignment.chatModelId}`
    : "__cloud__";
  const selectedCodeOption = localAssignment.serverId && localAssignment.codeModelId
    ? `${localAssignment.serverId}::${localAssignment.codeModelId}`
    : "__cloud__";
  const selectedExternalOption = localAssignment.serverId && localAssignment.externalApiModelId
    ? `${localAssignment.serverId}::${localAssignment.externalApiModelId}`
    : "__cloud__";

  async function handleAddLocalServer() {
    const label = newServerLabel.trim() || "Local server";
    const baseUrl = newServerBaseUrl.trim();
    if (!baseUrl) {
      setLocalServerError("Base URL is required.");
      return;
    }
    addLocalServer({
      label,
      baseUrl,
      apiType: newServerApiType,
      enabled: true,
      discoveredModels: [],
      lastScannedAt: null,
    });
    setLocalServerError("");
    setNewServerLabel("");
  }

  async function handleScanServer(serverId: string) {
    const server = localServers.find((entry) => entry.id === serverId);
    if (!server) return;
    setLocalServerError("");
    setScanBusyServerId(serverId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch("/api/local-server/probe", {
        method: "POST",
        headers,
        body: JSON.stringify({ baseUrl: server.baseUrl, apiType: server.apiType }),
      });
      const data = await res.json().catch(() => ({})) as { models?: string[]; error?: string };
      if (!res.ok) {
        setLocalServerError(data.error ?? `Probe failed (${res.status}).`);
        return;
      }
      updateLocalServer(serverId, {
        discoveredModels: Array.isArray(data.models) ? data.models : [],
        lastScannedAt: Date.now(),
      });
    } catch (error) {
      setLocalServerError(error instanceof Error ? error.message : "Probe failed.");
    } finally {
      setScanBusyServerId(null);
    }
  }

  function handleRoleModelSelect(
    role: "chatModelId" | "codeModelId" | "externalApiModelId",
    value: string,
  ) {
    if (value === "__cloud__") {
      const next = {
        ...localAssignment,
        [role]: null,
      };
      setLocalModelAssignment({
        [role]: null,
        serverId: next.chatModelId || next.codeModelId || next.externalApiModelId ? next.serverId : null,
      });
      return;
    }
    const [serverId, modelId] = value.split("::");
    const serverChanged = localAssignment.serverId && localAssignment.serverId !== serverId;
    setLocalModelAssignment({
      serverId,
      ...(serverChanged
        ? {
            chatModelId: role === "chatModelId" ? modelId ?? null : null,
            codeModelId: role === "codeModelId" ? modelId ?? null : null,
            externalApiModelId: role === "externalApiModelId" ? modelId ?? null : null,
          }
        : {}),
      [role]: modelId ?? null,
    });
  }

  return (
    <section className={`h-full min-h-0 overflow-auto p-4 sm:p-6 lg:p-8 ${sectionBackground}`}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className={`rounded-3xl border p-6 backdrop-blur sm:p-8 ${cardClass}`}>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${chipClass}`}>
            <Sparkles className="h-3.5 w-3.5" />
            {tr.settings_chip}
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">{tr.settings_title}</h2>
          <p className={`mt-2 text-sm leading-7 ${mutedClass}`}>{tr.settings_subtitle}</p>

          <div className={`mt-6 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">{tr.settings_dark_mode}</p>
                <p className={`mt-1 text-xs ${mutedClass}`}>{tr.settings_dark_mode_desc}</p>
              </div>
              <div className="flex items-center gap-2">
                <Sun className={`h-4 w-4 ${dark ? "text-slate-500" : "text-amber-500"}`} />
                <Switch checked={dark} onCheckedChange={setDark} aria-label={tr.settings_dark_mode} />
                <MoonStar className={`h-4 w-4 ${dark ? "text-sky-300" : "text-slate-400"}`} />
              </div>
            </div>
          </div>

          {/* Theme preset selector */}
          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
              <Palette className="h-3.5 w-3.5" /> Theme
            </div>
            <p className="mt-2 text-sm font-semibold">Color Theme</p>
            <p className={`mt-1 text-xs ${mutedClass}`}>Choose from curated presets. Preset themes override the dark/light toggle.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {([
                { id: "default",   label: "Default",        swatch: dark ? "#1e293b" : "#f8fafc", accent: "#0ea5e9" },
                { id: "midnight",  label: "Midnight",       swatch: "#0e0e1a",        accent: "#a78bfa" },
                { id: "ocean",     label: "Deep Ocean",     swatch: "#08101a",        accent: "#22d3ee" },
                { id: "slate",     label: "Slate Grey",     swatch: "#1a1a1a",        accent: "#94a3b8" },
                { id: "cyberpunk", label: "Cyberpunk",      swatch: "#0b0810",        accent: "#22d9c4" },
              ] as Array<{ id: import("@/app/lib/chat-types").AppTheme; label: string; swatch: string; accent: string }>).map((preset) => {
                const isActive = (state.theme ?? "default") === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setTheme(preset.id)}
                    aria-pressed={isActive}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      isActive
                        ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                        : dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <div
                      className="mb-1.5 h-6 w-full rounded-md border border-white/10"
                      style={{ background: `linear-gradient(135deg, ${preset.swatch} 60%, ${preset.accent})` }}
                    />
                    <div className="text-xs font-semibold">{preset.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language selector */}
          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
              <Globe className="h-3.5 w-3.5" /> {tr.settings_language_chip}
            </div>
            <p className="mt-2 text-sm font-semibold">{tr.settings_language_title}</p>
            <p className={`mt-1 text-xs ${mutedClass}`}>{tr.settings_language_subtitle}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {UI_LANGUAGES.map((lang) => {
                const isActive = (state.uiLanguage ?? "en") === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setUiLanguage(lang.code)}
                    aria-pressed={isActive}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      isActive
                        ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                        : `${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`
                    }`}
                  >
                    <div className="text-sm font-semibold">{lang.nativeLabel}</div>
                    <div className={`mt-0.5 text-xs ${mutedClass}`}>{lang.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Local device queue</p>
                <p className={`mt-1 text-xs ${mutedClass}`}>
                  Send new chat prompts to your paired PC through Supabase `ai_tasks` instead of the default cloud chat route.
                </p>
              </div>
              <Switch
                checked={activeWorkspace.settings.localOnlyMode ?? false}
                onCheckedChange={setLocalOnlyMode}
                aria-label="Route chat through local device queue"
              />
            </div>
          </div>

          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">GitHub PR review comments</p>
                <p className={`mt-1 text-xs ${mutedClass}`}>
                  Allow AssistantX to publish generated PR review feedback back to GitHub when a PR review workflow opts in.
                </p>
              </div>
              <Switch
                checked={activeWorkspace.settings.postPrReviewCommentsToGitHub ?? false}
                onCheckedChange={setPostPrReviewCommentsToGitHub}
                aria-label="Post PR review comments to GitHub"
              />
            </div>
          </div>

          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
              <Bot className="h-3.5 w-3.5" /> AI Engine
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">
                  Jarvis Code 7-Agent Tasking (PRO / PRO+)
                </p>
                <p className={`mt-1 text-xs ${mutedClass}`}>
                  FREE runs in Solo-Developer mode (single coding agent). PRO / PRO+ unlocks autonomous 7-agent swarm with Architect, Developer, Reviewer, Tester, Debugger, DevOps and Release Manager.
                </p>
                {swarmEnabled && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    ⚠️ Human-in-the-loop release is enabled by default: merge/push actions require explicit approval.
                  </p>
                )}
                {!canUseSwarm && (
                  <p className="mt-2 text-xs text-fuchsia-600 dark:text-fuchsia-400">
                    🔐 ACCESS DENIED: PRO LEVEL REQUIRED
                  </p>
                )}
              </div>
              <Switch
                checked={swarmEnabled}
                onCheckedChange={(checked) => {
                  const next = canUseSwarm ? checked : false;
                  setJarvisCodeSettings({
                    enabled: next || (jarvisCodeSettings?.enabled ?? false),
                    use7AgentTasking: next,
                    freeSoloAgent: true,
                    releaseRequiresApproval: true,
                  });
                  setMultiAgentBeta(next);
                }}
                aria-label="Enable Multi-Agent AI mode"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className={`rounded-2xl border p-4 ${softSurfaceClass}`}>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <Cloud className="h-3.5 w-3.5" /> {tr.settings_sync}
              </div>
              <p className="mt-2 text-sm font-semibold">{authReady ? cloudSyncStatus : "checking"}</p>
              <p className={`mt-1 text-xs ${mutedClass}`}>{cloudSyncMessage}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${softSurfaceClass}`}>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <MessageSquareText className="h-3.5 w-3.5" /> {tr.settings_workspace}
              </div>
              <p className="mt-2 text-sm font-semibold">{activeWorkspace.name}</p>
              <p className={`mt-1 text-xs ${mutedClass}`}>
                {tr.settings_plan}: {state.userPlan.toUpperCase()} • {tr.settings_mode}: {appModeLabel}
              </p>
              {userEmail ? <p className={`mt-1 text-xs ${mutedClass}`}>{userEmail}</p> : null}
            </div>
          </div>

          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Account</p>
                <p className={`mt-1 text-xs ${mutedClass}`}>
                  Logged in as {userEmail ?? "unknown"} {authProvider ? `via ${authProvider}` : ""}
                </p>
                <p className={`mt-1 text-xs ${mutedClass}`}>
                  Linked: {linkedProviders.length ? linkedProviders.join(", ") : "none"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={oauthLoading === "google"}
                  onClick={() => void signInWithProvider("google")}
                >
                  {oauthLoading === "google" ? "Connecting..." : "Connect Google"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={oauthLoading === "github"}
                  onClick={() => void signInWithProvider("github")}
                >
                  {oauthLoading === "github" ? "Connecting..." : "Connect GitHub"}
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => void signOut()}>
                  <LogOut className="mr-1 h-3.5 w-3.5" />
                  Log out
                </Button>
              </div>
            </div>
          </div>

          <MemorySummaryCard dark={dark} />

          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
              <Mic className="h-3.5 w-3.5" /> Voice controls
            </div>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Wake word</p>
                  <p className={`text-xs ${mutedClass}`}>Use your configured phrase (&quot;{voiceSettings.wakeWordPhrase || DEFAULT_WEB_WAKE_PHRASE}&quot;) in web chat voice mode.</p>
                </div>
                <Switch checked={voiceSettings.wakeWordEnabled} onCheckedChange={setWakeWordEnabled} aria-label="Toggle wake word" />
              </div>
              <Input
                value={voiceSettings.wakeWordPhrase}
                onChange={(event) => setWakeWordPhrase(event.target.value)}
                placeholder={DEFAULT_WEB_WAKE_PHRASE}
              />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Speech-to-text</p>
                  <p className={`text-xs ${mutedClass}`}>Microphone transcription for prompts.</p>
                </div>
                <Switch checked={voiceSettings.sttEnabled} onCheckedChange={setSttEnabled} aria-label="Toggle speech to text" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Text-to-speech</p>
                  <p className={`text-xs ${mutedClass}`}>Allow response playback.</p>
                </div>
                <Switch checked={voiceSettings.ttsEnabled} onCheckedChange={setTtsEnabled} aria-label="Toggle text to speech" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  <p className="text-sm font-medium">Auto-speak responses</p>
                </div>
                <Switch checked={voiceSettings.autoSpeakResponses} onCheckedChange={setAutoSpeakResponses} aria-label="Toggle auto speak responses" />
              </div>
              <div className="grid gap-1">
                <label htmlFor="voice-language" className={`text-xs ${mutedClass}`}>Voice language</label>
                <select
                  id="voice-language"
                  name="voiceLanguage"
                  value={voiceSettings.voiceLanguage}
                  onChange={(event) => setVoiceLanguage(event.target.value)}
                  className={`h-10 rounded-md border px-3 text-sm ${dark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`}
                >
                  <option value="en-US">English (en-US)</option>
                  <option value="pl-PL">Polish (pl-PL)</option>
                  <option value="de-DE">German (de-DE)</option>
                  <option value="es-ES">Spanish (es-ES)</option>
                </select>
              </div>
              <div className="grid gap-2">
                <div className={`text-xs ${mutedClass}`}>Voice personality</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {VOICE_PROFILES.map((voice) => {
                    const selected = voiceSettings.ttsVoiceId === voice.id;
                    return (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => setTtsVoiceId(voice.id)}
                        className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                          selected
                            ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                            : `${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`
                        }`}
                        aria-pressed={selected}
                      >
                        <div className="text-sm font-semibold">{voice.label}</div>
                        <div className={`mt-0.5 text-xs ${mutedClass}`}>{voice.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
              <Theater className="h-3.5 w-3.5" /> Personality mode
            </div>
            <p className={`mt-2 text-xs ${mutedClass}`}>Apply ChatGPT-style behavior presets for tone and creativity.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PERSONALITY_MODES.map((mode) => {
                const selected = (voiceSettings.personalityMode ?? "default") === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setPersonalityMode(mode.id)}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      selected
                        ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-200"
                        : `${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`
                    }`}
                    aria-pressed={selected}
                  >
                    <div className="text-sm font-semibold">{mode.emoji} {mode.label}</div>
                    <div className={`mt-0.5 text-xs ${mutedClass}`}>{mode.description}</div>
                  </button>
                );
              })}
            </div>
            <div className={`mt-2 text-[11px] ${mutedClass}`}>
              Temperatures are estimated behavior targets and may still be adjusted by model-specific routing.
            </div>
          </div>

        </div>

        <div className={`rounded-3xl border p-6 backdrop-blur sm:p-8 ${cardClass}`}>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${chipClass}`}>
            <Server className="h-3.5 w-3.5" />
            Local model routing
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">Local servers & model assignment</h2>
          <p className={`mt-2 text-sm leading-7 ${mutedClass}`}>
            Hosted AssistantX cannot reach your localhost directly. Local server routing is only enabled while a trusted Jarvis desktop is online.
          </p>

          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Paired desktop status</p>
                <p className={`mt-1 text-xs ${mutedClass}`}>
                  {hasTrustedOnlineDesktop
                    ? `Connected to ${primaryDevice?.label ?? "Jarvis Desktop"}`
                    : "No trusted online Jarvis desktop detected. Local commands and local model routing are disabled on web."}
                </p>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                hasTrustedOnlineDesktop
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
              }`}>
                {hasTrustedOnlineDesktop ? "PC online" : "PC offline"}
              </div>
            </div>
          </div>

          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Prefer local models when available</p>
                <p className={`mt-1 text-xs ${mutedClass}`}>
                  When a lane has a scanned local model assigned, AssistantX will try the local runtime before cloud fallback.
                </p>
              </div>
              <Switch
                checked={activeWorkspace.settings.preferLocalWhenAvailable ?? false}
                onCheckedChange={setPreferLocalWhenAvailable}
                aria-label="Prefer local models when available"
                disabled={!hasTrustedOnlineDesktop}
              />
            </div>
          </div>

          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                value={newServerLabel}
                onChange={(event) => setNewServerLabel(event.target.value)}
                placeholder="Server label"
                disabled={!hasTrustedOnlineDesktop}
              />
              <Input
                value={newServerBaseUrl}
                onChange={(event) => setNewServerBaseUrl(event.target.value)}
                placeholder="http://127.0.0.1:11434"
                disabled={!hasTrustedOnlineDesktop}
              />
              <Select
                value={newServerApiType}
                onValueChange={(value: "ollama" | "lmstudio" | "openai-compat") => setNewServerApiType(value)}
                disabled={!hasTrustedOnlineDesktop}
              >
                <SelectTrigger>
                  <SelectValue placeholder="API type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">Ollama</SelectItem>
                  <SelectItem value="lmstudio">LM Studio</SelectItem>
                  <SelectItem value="openai-compat">OpenAI-compatible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={() => void handleAddLocalServer()} disabled={!hasTrustedOnlineDesktop}>
                Add local server
              </Button>
            </div>
            {localServerError ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                {localServerError}
              </div>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {localServers.length === 0 ? (
              <div className={`rounded-2xl border p-4 text-sm ${softSurfaceClass}`}>
                No local servers configured yet.
              </div>
            ) : (
              localServers.map((server) => (
                <div key={server.id} className={`rounded-2xl border p-4 ${softSurfaceClass}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{server.label}</div>
                      <div className={`mt-1 text-xs ${mutedClass}`}>{server.baseUrl} · {server.apiType}</div>
                      <div className={`mt-1 text-xs ${mutedClass}`}>
                        {server.lastScannedAt ? `Last scanned ${new Date(server.lastScannedAt).toLocaleString()}` : "Not scanned yet"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Switch
                        checked={server.enabled}
                        onCheckedChange={(enabled) => updateLocalServer(server.id, { enabled })}
                        aria-label={`Toggle ${server.label}`}
                        disabled={!hasTrustedOnlineDesktop}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleScanServer(server.id)}
                        disabled={!hasTrustedOnlineDesktop || scanBusyServerId === server.id}
                      >
                        <RefreshCcw className={`mr-1 h-3.5 w-3.5 ${scanBusyServerId === server.id ? "animate-spin" : ""}`} />
                        Scan
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLocalServer(server.id)}
                        disabled={!hasTrustedOnlineDesktop}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(server.discoveredModels ?? []).length > 0 ? (
                      server.discoveredModels.map((modelId) => (
                        <span
                          key={modelId}
                          className={`rounded-full border px-2.5 py-1 text-[11px] ${dark ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-white text-slate-700"}`}
                        >
                          {modelId}
                        </span>
                      ))
                    ) : (
                      <span className={`text-xs ${mutedClass}`}>No discovered models yet.</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={`mb-2 block text-xs ${mutedClass}`}>Chat lane</label>
                <Select
                  value={selectedChatOption}
                  onValueChange={(value) => handleRoleModelSelect("chatModelId", value)}
                  disabled={!hasTrustedOnlineDesktop || !hasLocalModelOptions}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cloud default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__cloud__">Cloud default</SelectItem>
                    {localModelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={`mb-2 block text-xs ${mutedClass}`}>Code lane</label>
                <Select
                  value={selectedCodeOption}
                  onValueChange={(value) => handleRoleModelSelect("codeModelId", value)}
                  disabled={!hasTrustedOnlineDesktop || !hasLocalModelOptions}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cloud default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__cloud__">Cloud default</SelectItem>
                    {localModelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={`mb-2 block text-xs ${mutedClass}`}>External/API lane</label>
                <Select
                  value={selectedExternalOption}
                  onValueChange={(value) => handleRoleModelSelect("externalApiModelId", value)}
                  disabled={!hasTrustedOnlineDesktop || !hasLocalModelOptions}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cloud default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__cloud__">Cloud default</SelectItem>
                    {localModelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Profile card */}
        <div className={`rounded-3xl border p-6 backdrop-blur sm:p-8 ${cardClass}`}>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${chipClass}`}>
            {tr.settings_profile_chip}
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">{tr.settings_profile_title}</h2>
          <p className={`mt-2 text-sm leading-7 ${mutedClass}`}>{tr.settings_profile_subtitle}</p>

          {saveStatus === "success" && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
              {tr.settings_profile_saved}
            </div>
          )}
          {saveStatus === "error" && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
              {tr.settings_profile_error}: {errorMessage || tr.settings_profile_save_failed}
            </div>
          )}

          <div className="mt-6">
            <UserProfileEditor profile={profile} onSave={(p) => { void handleSave(p); }} />
          </div>
        </div>

        {/* Usage stats card */}
        <div className={`rounded-3xl border p-6 backdrop-blur sm:p-8 ${cardClass}`}>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${chipClass}`}>
            <BarChart2 className="h-3.5 w-3.5" />
            {tr.settings_usage_chip}
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">{tr.settings_usage_title}</h2>
          <p className={`mt-2 text-sm leading-7 ${mutedClass}`}>{tr.settings_usage_subtitle}</p>

          {statsLoading ? (
            <p className={`mt-6 text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>{tr.settings_usage_loading}</p>
          ) : (
            <div className="mt-6 flex flex-col gap-5">
              {/* KPI row */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className={`rounded-2xl border p-4 ${softSurfaceClass}`}>
                  <div className={`flex items-center gap-2 text-xs uppercase tracking-wide ${dark ? "text-slate-400" : "text-slate-500"}`}>
                    <MessageSquareText className="h-3.5 w-3.5" /> {tr.settings_messages}
                  </div>
                  <div className="mt-2 text-2xl font-bold">{totalMessages.toLocaleString()}</div>
                </div>

                <div className={`rounded-2xl border p-4 ${softSurfaceClass}`}>
                  <div className={`flex items-center gap-2 text-xs uppercase tracking-wide ${dark ? "text-slate-400" : "text-slate-500"}`}>
                    <MessageSquareText className="h-3.5 w-3.5" /> {tr.settings_conversations}
                  </div>
                  <div className="mt-2 text-2xl font-bold">{totalConversations.toLocaleString()}</div>
                </div>

                {planLimit !== null && (
                  <div className={`rounded-2xl border p-4 ${softSurfaceClass}`}>
                    <div className={`flex items-center gap-2 text-xs uppercase tracking-wide ${dark ? "text-slate-400" : "text-slate-500"}`}>
                      <Zap className="h-3.5 w-3.5" /> {tr.settings_premium_requests}
                    </div>
                    <div className="mt-2 text-2xl font-bold">
                      {premiumRequestsUsed}
                      <span className={`text-sm font-normal ${dark ? "text-slate-500" : "text-slate-400"}`}> / {planLimit}</span>
                    </div>
                    <div className={`mt-3 rounded-full ${dark ? "bg-slate-700" : "bg-slate-200"}`} style={{ height: 7 }}>
                      <div
                        className={`h-full rounded-full ${premiumRequestsUsed / planLimit >= 0.8 ? "bg-amber-500" : "bg-sky-500"}`}
                        style={{ width: `${Math.min((premiumRequestsUsed / planLimit) * 100, 100)}%`, transition: "width 0.6s ease" }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Top models */}
              {topModels.length > 0 && (
                <div className={`rounded-2xl border p-4 ${softSurfaceClass}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <Bot className="h-4 w-4 text-sky-500" />
                    <span className={`text-sm font-semibold ${dark ? "text-slate-200" : "text-slate-700"}`}>{tr.settings_top_models}</span>
                  </div>
                  <div className="space-y-3">
                    {topModels.map((m, i) => (
                      <UsageBar
                        key={m.model}
                        label={m.model.split("/").pop() ?? m.model}
                        value={m.count}
                        max={maxModelCount}
                        color={i === 0 ? "bg-sky-500" : i === 1 ? "bg-cyan-500" : "bg-slate-400"}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
