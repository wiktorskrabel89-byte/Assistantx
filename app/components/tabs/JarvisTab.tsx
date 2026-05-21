"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Download, GitBranch, Link2, Loader2, Mail, Mic, Smartphone, Sparkles, Volume2, Wifi, WifiOff } from "lucide-react";

type DeviceStatus = {
  id: string;
  label: string;
  platform: string;
  role: string;
  trustState: string;
  usesVpn: boolean;
  wakeMethodLastSuccess: string | null;
  wakeFailCount: number;
  status: string;
  rawStatus: string;
  isOnline: boolean;
  freshnessAgeMs: number | null;
  freshnessState: string;
  lastSeenAt: string | null;
  lastHeartbeatAt: string | null;
  cpuPercent: number | null;
  ramPercent: number | null;
  activeApps: string[];
};

type WakeRouteResponse = {
  ok?: boolean;
  error?: string;
  mode?: "router" | "ipv6" | "rtc_wait";
  method?: string | null;
  nextAction?: string;
};

function formatFreshness(ageMs: number | null) {
  if (ageMs === null) return "no heartbeat yet";
  if (ageMs < 1000) return "just now";
  const seconds = Math.round(ageMs / 1000);
  return `${seconds}s ago`;
}

function useJarvisControlPlane() {
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [primaryDeviceId, setPrimaryDeviceId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isStatusLoading, setIsStatusLoading] = useState(true);
  const [isBetaTester, setIsBetaTester] = useState(false);
  const [isWaking, setIsWaking] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [wakeResponse, setWakeResponse] = useState<WakeRouteResponse | null>(null);
  const [queuedTaskId, setQueuedTaskId] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/jarvis/devices/status", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as {
        devices?: DeviceStatus[];
        primaryDeviceId?: string | null;
        isBetaTester?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load Jarvis device status.");
      }
      setDevices(payload.devices ?? []);
      setPrimaryDeviceId((current) => current ?? payload.primaryDeviceId ?? payload.devices?.[0]?.id ?? null);
      setIsBetaTester(Boolean(payload.isBetaTester));
      setStatusError(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to load Jarvis device status.");
    } finally {
      setIsStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchStatus();
    }, 0);
    const intervalId = window.setInterval(() => {
      void fetchStatus();
    }, 10000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [fetchStatus]);

  const primaryDevice = useMemo(
    () => devices.find((device) => device.id === primaryDeviceId) ?? devices[0] ?? null,
    [devices, primaryDeviceId],
  );

  const wakeJarvis = useCallback(async () => {
    if (!primaryDevice?.id) return;
    setIsWaking(true);
    setQueuedTaskId(null);
    try {
      const response = await fetch("/api/wake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: primaryDevice.id,
          reason: "launch_jarvis",
        }),
      });
      const payload = await response.json().catch(() => ({})) as WakeRouteResponse;
      setWakeResponse(payload);
      if (response.ok || response.status === 202) {
        void fetchStatus();
        return;
      }
      throw new Error(payload.error ?? "Wake request failed.");
    } catch (error) {
      setWakeResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Wake request failed.",
        mode: "rtc_wait",
        nextAction: "wait_for_bios_rtc",
      });
    } finally {
      setIsWaking(false);
    }
  }, [fetchStatus, primaryDevice]);

  const queueRobloxLaunch = useCallback(async () => {
    if (!primaryDevice?.id) return;
    setIsQueueing(true);
    setQueuedTaskId(null);
    try {
      const wakeResult = await fetch("/api/wake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: primaryDevice.id,
          reason: "beta_launch_roblox",
        }),
      });
      const wakePayload = await wakeResult.json().catch(() => ({})) as WakeRouteResponse;
      setWakeResponse(wakePayload);

      const response = await fetch("/api/jarvis/system-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: primaryDevice.id,
          actionType: "launch_roblox",
          payload: { gameId: "185655149" },
        }),
      });
      const payload = await response.json().catch(() => ({})) as { taskId?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to queue Roblox launch.");
      }
      setQueuedTaskId(payload.taskId ?? null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to queue Roblox launch.");
    } finally {
      setIsQueueing(false);
    }
  }, [primaryDevice]);

  return {
    devices,
    primaryDevice,
    setPrimaryDeviceId,
    isBetaTester,
    isStatusLoading,
    statusError,
    wakeResponse,
    isWaking,
    wakeJarvis,
    isQueueing,
    queueRobloxLaunch,
    queuedTaskId,
  };
}

// ── Linked accounts ──────────────────────────────────────────────────────────
type LinkedAccount = { provider: string; label: string; metadata?: Record<string, string | null> };

function useLinkedAccounts() {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/jarvis/linked-accounts')
      .then((r) => r.json())
      .then((data: { accounts?: LinkedAccount[] }) => setAccounts(data.accounts ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const link = async (provider: string) => {
    const res = await fetch(`/api/jarvis/linked-accounts/${provider}?action=initiate`, { method: 'POST' });
    const data = await res.json() as { authUrl?: string; error?: string };
    if (data.authUrl) window.open(data.authUrl, '_blank', 'width=480,height=680');
    else alert(data.error ?? 'Failed to initiate linking');
  };

  const unlink = async (provider: string) => {
    await fetch(`/api/jarvis/linked-accounts/${provider}`, { method: 'DELETE' });
    setAccounts((prev) => prev.filter((a) => a.provider !== provider));
  };

  return { accounts, loading, link, unlink };
}

export default function JarvisTab() {
  const [latestGithubVersion, setLatestGithubVersion] = useState<string | null>(null);
  const {
    devices,
    primaryDevice,
    setPrimaryDeviceId,
    isBetaTester,
    isStatusLoading,
    statusError,
    wakeResponse,
    isWaking,
    wakeJarvis,
    isQueueing,
    queueRobloxLaunch,
    queuedTaskId,
  } = useJarvisControlPlane();
  const { accounts, loading: accountsLoading, link, unlink } = useLinkedAccounts();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/jarvis/version");
        if (!res.ok) return;

        const payload = (await res.json()) as { version?: string };
        if (cancelled) return;
        if (payload.version) setLatestGithubVersion(payload.version);
      } catch {
        // Keep download actions available even if version lookup fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function downloadForWindows() {
    let arch = "x64";
    try {
      const nav = navigator as Navigator & {
        userAgentData?: {
          getHighEntropyValues: (hints: string[]) => Promise<{ architecture?: string }>;
        };
      };
      if (nav.userAgentData) {
        const data = await nav.userAgentData.getHighEntropyValues(["architecture"]);
        if (data.architecture === "arm") arch = "arm64";
      }
    } catch {
      // fall back to x64
    }

    window.location.href = `/api/jarvis/download?arch=${arch}`;
  }

  function downloadForAndroid() {
    window.location.href = "/api/jarvis/download?platform=android";
  }

  const pcOnline = Boolean(primaryDevice?.isOnline);
  const pcStatusText = primaryDevice
    ? [
        `${primaryDevice.label}${pcOnline ? " online" : " offline"}`,
        primaryDevice.status !== "offline" ? primaryDevice.status : null,
        primaryDevice.cpuPercent !== null ? `CPU ${primaryDevice.cpuPercent}%` : null,
        primaryDevice.ramPercent !== null ? `RAM ${primaryDevice.ramPercent}%` : null,
        primaryDevice.activeApps.length > 0 ? primaryDevice.activeApps.slice(0, 2).join(", ") : null,
        `heartbeat ${formatFreshness(primaryDevice.freshnessAgeMs)}`,
      ].filter(Boolean).join(" · ")
    : (isStatusLoading ? "Loading Jarvis devices..." : "No trusted Jarvis desktop paired yet.");

  const highlights = [
    {
      title: "New chat models",
      description: "Jarvis Desktop supports auto-smart routing (Qwen 3 32B for fast prompts, GPT OSS 120B for harder prompts) with Gemini 2.5 Flash fallback.",
      icon: Sparkles,
    },
    {
      title: "Speech-to-text",
      description: "STT support with default model selection whisper-large-v3-turbo.",
      icon: Mic,
    },
    {
      title: "Text-to-speech",
      description: "Automatic response playback (TTS) using the orpheus-english profile.",
      icon: Volume2,
    },
  ];

  const SUPPORTED_PROVIDERS = [
    { id: 'github', label: 'GitHub', icon: GitBranch, description: 'Push commits, create PRs, manage repos' },
    { id: 'google', label: 'Gmail & Drive', icon: Mail, description: 'Read/send email, access Google Drive files' },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">

        {/* Live PC Status Banner */}
        <Card className={`border ${pcOnline ? 'border-green-200/70 bg-green-50/80' : 'border-slate-200/70 bg-white/80'}`}>
          <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
            {pcOnline
              ? <Wifi className="h-4 w-4 shrink-0 text-green-600" />
              : <WifiOff className="h-4 w-4 shrink-0 text-slate-400" />}
            <span className={`text-sm font-medium ${pcOnline ? 'text-green-800' : 'text-slate-500'}`}>
              {pcStatusText}
            </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {devices.length > 1 && (
                <select
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  value={primaryDevice?.id ?? ""}
                  onChange={(event) => setPrimaryDeviceId(event.target.value)}
                >
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label} · {device.platform} · {device.trustState}
                    </option>
                  ))}
                </select>
              )}
              <Button
                size="sm"
                onClick={wakeJarvis}
                disabled={!primaryDevice?.id || isWaking}
                className="gap-2"
              >
                {isWaking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                Uruchom Jarvisa
              </Button>
              {isBetaTester && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={queueRobloxLaunch}
                  disabled={!primaryDevice?.id || isQueueing}
                  className="gap-2"
                >
                  {isQueueing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Wake + queue Roblox
                </Button>
              )}
            </div>
            {statusError && (
              <span className="text-xs text-amber-700">{statusError}</span>
            )}
            {wakeResponse?.mode && (
              <span className={`text-xs ${wakeResponse.mode === "rtc_wait" ? "text-amber-700" : "text-sky-700"}`}>
                Wake mode: {wakeResponse.mode} {wakeResponse.nextAction ? `· ${wakeResponse.nextAction}` : ""}
              </span>
            )}
            {queuedTaskId && (
              <span className="text-xs text-emerald-700">Queued Roblox task: {queuedTaskId}</span>
            )}
          </CardContent>
        </Card>

        <Card className="border-sky-200/70 bg-white/90 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)]">
          <CardHeader className="gap-4">
            <Badge className="w-fit bg-sky-100 text-sky-800 hover:bg-sky-100">Jarvis app settings</Badge>
            <CardTitle className="text-3xl text-slate-900 sm:text-4xl">
              Manage Jarvis for desktop and mobile
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              Download Jarvis, link your devices, and keep your desktop/mobile voice setup in sync from one place.
            </CardDescription>
            {latestGithubVersion && (
              <p className="text-xs font-medium text-sky-700">
                Latest Jarvis release on GitHub: {latestGithubVersion}
              </p>
            )}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Button onClick={downloadForWindows} className="h-11 gap-2" title="Download Jarvis for Windows">
                <Download className="h-4 w-4" />
                Download for Windows
              </Button>
              <p className="text-center text-xs font-medium text-green-600">✅ Auto-detects x64 or ARM64</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={downloadForAndroid} variant="secondary" className="h-11 gap-2" title="Download Jarvis for Android">
                <Smartphone className="h-4 w-4" />
                Download for Android
              </Button>
              <p className="text-center text-xs font-medium text-emerald-600">✅ Direct APK download</p>
            </div>
          </CardContent>
        </Card>

        {/* Linked Accounts Panel */}
        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-slate-600" />
              <CardTitle className="text-base text-slate-900">Linked accounts</CardTitle>
            </div>
            <CardDescription className="text-slate-600">
              Link your accounts so Jarvis can push to GitHub, send emails, access Google Drive, and more — all on your behalf.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {SUPPORTED_PROVIDERS.map(({ id, label, icon: Icon, description }) => {
              const linked = accounts.find((a) => a.provider === id);
              return (
                <div key={id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/80 p-4">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-900">{label}</span>
                      {linked && (
                        <Badge className="text-xs bg-green-100 text-green-800 hover:bg-green-100">
                          ✅ {linked.label || 'linked'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 leading-5">{description}</p>
                  </div>
                  {!accountsLoading && (
                    linked ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
                        onClick={() => unlink(id)}
                      >
                        Unlink
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs shrink-0"
                        onClick={() => link(id)}
                      >
                        Link
                      </Button>
                    )
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base text-slate-900">Jarvis Desktop voice + model upgrades</CardTitle>
            <CardDescription className="text-slate-600">
              Desktop build now supports selecting chat/STT/TTS model profiles and includes speech-to-text + auto text-to-speech controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {highlights.map(({ title, description, icon: Icon }) => (
              <div key={title} className="rounded-xl border border-slate-200 bg-white/80 p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-900">
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-semibold">{title}</span>
                </div>
                <Separator className="mb-2" />
                <p className="text-xs leading-6 text-slate-600">{description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border-sky-200/70 bg-white/85">
            <CardHeader>
              <CardTitle className="text-sm text-slate-900">Fast install</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs leading-6 text-slate-600">
              Get up and running in minutes with a direct installer and APK package.
            </CardContent>
          </Card>
          <Card className="border-amber-200/70 bg-white/85">
            <CardHeader>
              <CardTitle className="text-sm text-slate-900">Same ecosystem</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs leading-6 text-slate-600">
              Continue using your AssistantX flows, tools, and integrations across platforms.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white/85">
            <CardHeader>
              <CardTitle className="text-sm text-slate-900">Private workflow</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs leading-6 text-slate-600">
              Use your own account context and keep your work sessions organized per device.
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
