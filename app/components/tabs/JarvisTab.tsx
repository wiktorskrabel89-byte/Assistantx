"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Gamepad2, GitBranch, Laptop, Link2, Loader2, Mail, Power, ShieldCheck, Smartphone, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { getDeviceType } from "@/lib/device-detection";

type LinkedAccount = { provider: string; label: string; metadata?: Record<string, string | null> };

type RuntimeDevice = {
  id: string;
  label: string;
  trustState: string;
  setupState: string;
  lastSeenAt: string | null;
  online: boolean;
  biosManufacturer: string | null;
  biosModel: string | null;
  wakeMethodLastSuccess: string | null;
  wakeFailCount: number;
  lastKnownIpv6: string | null;
  lastKnownMac: string | null;
  lastLocalBroadcast: string | null;
  lastPublicIpv6DiscoveredAt: string | null;
  eligibleForWake: boolean;
  wakeCandidates: number;
  metadata?: {
    setupHint?: string | null;
    setupSource?: string | null;
    publicIpv6?: string | null;
  };
};

function buildControlDevicePayload() {
  const deviceType = getDeviceType();
  const label = deviceType === "phone" ? "AssistantX Phone" : "AssistantX Web";
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].filter(Boolean).join("|");

  return {
    platform: deviceType === "phone" ? "android" : "web",
    role: "control",
    label,
    fingerprint,
    metadata: {
      source: "assistantx-web",
      userAgent: navigator.userAgent,
    },
  };
}

function formatRelativeLastSeen(value: string | null) {
  if (!value) return "No heartbeat yet";
  const deltaMs = Date.now() - new Date(value).getTime();
  if (deltaMs < 60_000) return "Seen just now";
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `Seen ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Seen ${days}d ago`;
}

function useLinkedAccounts() {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/jarvis/linked-accounts")
      .then((r) => r.json())
      .then((data: { accounts?: LinkedAccount[] }) => setAccounts(data.accounts ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const link = async (provider: string) => {
    const res = await fetch(`/api/jarvis/linked-accounts/${provider}?action=initiate`, { method: "POST" });
    const data = await res.json() as { authUrl?: string; error?: string };
    if (data.authUrl) window.open(data.authUrl, "_blank", "width=480,height=680");
    else alert(data.error ?? "Failed to initiate linking");
  };

  const unlink = async (provider: string) => {
    await fetch(`/api/jarvis/linked-accounts/${provider}`, { method: "DELETE" });
    setAccounts((prev) => prev.filter((a) => a.provider !== provider));
  };

  return { accounts, loading, link, unlink };
}

export default function JarvisTab() {
  const { accounts, loading: accountsLoading, link, unlink } = useLinkedAccounts();
  const [devices, setDevices] = useState<RuntimeDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingMessage, setPairingMessage] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [gameIds, setGameIds] = useState<Record<string, string>>({});

  const refreshDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const response = await fetch("/api/jarvis/devices", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { devices?: RuntimeDevice[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Failed to load Jarvis devices.");
      setDevices(payload.devices ?? []);
      setDevicesError(null);
    } catch (error) {
      setDevicesError(error instanceof Error ? error.message : "Failed to load Jarvis devices.");
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  const runtimeSummary = useMemo(() => {
    const online = devices.filter((device) => device.online).length;
    const ready = devices.filter((device) => device.setupState === "ready" || device.setupState === "paired").length;
    return { online, ready, total: devices.length };
  }, [devices]);

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

  const handleConfirmPairing = useCallback(async () => {
    setPairingBusy(true);
    setPairingMessage(null);
    try {
      const response = await fetch("/api/pairing/v2/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: pairingCode,
          device: buildControlDevicePayload(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Failed to pair computer.");
      setPairingCode("");
      setPairingMessage("Computer paired successfully.");
      await refreshDevices();
    } catch (error) {
      setPairingMessage(error instanceof Error ? error.message : "Failed to pair computer.");
    } finally {
      setPairingBusy(false);
    }
  }, [pairingCode, refreshDevices]);

  const runWake = useCallback(async (deviceId: string) => {
    const response = await fetch("/api/wake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, reason: "assistantx_manual_wake" }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; method?: string };
    if (!response.ok) throw new Error(payload.error ?? "Wake request failed.");
    return payload.method ?? "wake_chain";
  }, []);

  const handleWake = useCallback(async (deviceId: string) => {
    const key = `wake:${deviceId}`;
    setBusyKey(key);
    setActionStatus((prev) => ({ ...prev, [deviceId]: "Waking desktop…" }));
    try {
      const method = await runWake(deviceId);
      setActionStatus((prev) => ({ ...prev, [deviceId]: `Wake sent via ${method}.` }));
      await refreshDevices();
    } catch (error) {
      setActionStatus((prev) => ({ ...prev, [deviceId]: error instanceof Error ? error.message : "Wake failed." }));
    } finally {
      setBusyKey(null);
    }
  }, [refreshDevices, runWake]);

  const handleLaunchRoblox = useCallback(async (deviceId: string) => {
    const key = `roblox:${deviceId}`;
    setBusyKey(key);
    setActionStatus((prev) => ({ ...prev, [deviceId]: "Queueing Roblox launch…" }));
    try {
      const response = await fetch(`/api/jarvis/devices/${deviceId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "launch_roblox",
          wakeBeforeAction: true,
          payload: { gameId: gameIds[deviceId] },
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; taskId?: string };
      if (!response.ok) throw new Error(payload.error ?? "Failed to queue Roblox launch.");
      setActionStatus((prev) => ({ ...prev, [deviceId]: `Roblox queued on desktop (task ${payload.taskId ?? "pending"}).` }));
      await refreshDevices();
    } catch (error) {
      setActionStatus((prev) => ({ ...prev, [deviceId]: error instanceof Error ? error.message : "Failed to queue Roblox." }));
    } finally {
      setBusyKey(null);
    }
  }, [gameIds, refreshDevices]);

  const SUPPORTED_PROVIDERS = [
    { id: "github", label: "GitHub", icon: GitBranch, description: "Push commits, create PRs, manage repos" },
    { id: "google", label: "Gmail & Drive", icon: Mail, description: "Read/send email, access Google Drive files" },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
        <Card className="border-sky-200/70 bg-white/90 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)]">
          <CardHeader className="gap-4">
            <Badge className="w-fit bg-sky-100 text-sky-800 hover:bg-sky-100">AssistantX workspace control</Badge>
            <CardTitle className="text-3xl text-slate-900 sm:text-4xl">
              Pair, wake, and control your Windows workspace
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              Sign in on Jarvis Desktop with the same AssistantX account, generate a pairing code on the PC, then confirm it here.
              AssistantX is now the only mobile control surface — the old Android Jarvis client is no longer required.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-slate-900">
                <Laptop className="h-4 w-4" />
                <span className="text-sm font-semibold">Windows desktop</span>
              </div>
              <Button onClick={downloadForWindows} className="h-11 w-full gap-2" title="Download Jarvis for Windows">
                <Download className="h-4 w-4" />
                Download Jarvis Desktop
              </Button>
              <p className="mt-3 text-xs leading-6 text-slate-600">
                Install Jarvis on Windows, sign in with the same account, and let the desktop generate a short pairing code.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-slate-900">
                <Smartphone className="h-4 w-4" />
                <span className="text-sm font-semibold">Phone control in AssistantX</span>
              </div>
              <p className="text-xs leading-6 text-slate-600">
                Open AssistantX on your phone, enter the code from your PC, then use the same app to wake the desktop and launch Roblox remotely.
              </p>
              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                No separate mobile Jarvis app. One account, one app, one device list.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-slate-600" />
              <CardTitle className="text-base text-slate-900">Add a new computer</CardTitle>
            </div>
            <CardDescription className="text-slate-600">
              Enter the pairing code shown in Jarvis Desktop. Both devices must already be signed into the same AssistantX account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={pairingCode}
              onChange={(event) => setPairingCode(event.target.value.toUpperCase().replace(/\s+/g, ""))}
              placeholder="AX-XXXXXXX"
              className="font-mono tracking-[0.2em]"
              maxLength={10}
            />
            <Button onClick={() => void handleConfirmPairing()} disabled={pairingBusy || pairingCode.trim().length < 10}>
              {pairingBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Pair this computer
            </Button>
          </CardContent>
          {pairingMessage ? (
            <CardContent className="pt-0">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {pairingMessage}
              </div>
            </CardContent>
          ) : null}
        </Card>

        <Card className={`border ${runtimeSummary.online > 0 ? "border-green-200/70 bg-green-50/80" : "border-slate-200/70 bg-white/80"}`}>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            {runtimeSummary.online > 0
              ? <Wifi className="h-4 w-4 shrink-0 text-green-600" />
              : <WifiOff className="h-4 w-4 shrink-0 text-slate-400" />}
            <span className={`text-sm font-medium ${runtimeSummary.online > 0 ? "text-green-800" : "text-slate-500"}`}>
              {runtimeSummary.total === 0
                ? "No paired desktops yet."
                : `${runtimeSummary.online}/${runtimeSummary.total} desktops online · ${runtimeSummary.ready} setup-ready`}
            </span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void refreshDevices()} disabled={devicesLoading}>
              Refresh
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader>
            <CardTitle className="text-base text-slate-900">Your desktops</CardTitle>
            <CardDescription className="text-slate-600">
              Wake your workspace, verify wake readiness, and queue Roblox from the same AssistantX dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {devicesError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {devicesError}
              </div>
            ) : null}
            {devicesLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading desktops…
              </div>
            ) : null}
            {!devicesLoading && devices.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                No desktop devices yet. Sign into Jarvis Desktop on Windows, generate a code there, then confirm it above.
              </div>
            ) : null}
            {devices.map((device) => (
              <div key={device.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{device.label}</span>
                      <Badge className={device.online ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-slate-100 text-slate-700 hover:bg-slate-100"}>
                        {device.online ? "Online" : "Offline"}
                      </Badge>
                      <Badge className={device.trustState === "trusted" ? "bg-sky-100 text-sky-800 hover:bg-sky-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                        {device.trustState}
                      </Badge>
                      <Badge variant="outline">{device.setupState}</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-slate-600">
                      {formatRelativeLastSeen(device.lastSeenAt)}
                      {" · "}
                      {device.eligibleForWake ? `${device.wakeCandidates} wake candidates` : "Wake needs a fresh network snapshot"}
                      {device.wakeMethodLastSuccess ? ` · Last wake: ${device.wakeMethodLastSuccess}` : ""}
                    </p>
                    <p className="mt-1 text-xs leading-6 text-slate-500">
                      BIOS: {device.biosManufacturer ?? "Unknown"} {device.biosModel ?? ""}
                      {device.metadata?.setupHint ? ` · ${device.metadata.setupHint}` : ""}
                    </p>
                    <p className="mt-1 text-xs leading-6 text-slate-500">
                      IPv6: {device.lastKnownIpv6 ?? device.metadata?.publicIpv6 ?? "missing"} · MAC: {device.lastKnownMac ?? "missing"}
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto">
                    <Button
                      variant="outline"
                      onClick={() => void handleWake(device.id)}
                      disabled={busyKey !== null}
                      className="gap-2"
                    >
                      {busyKey === `wake:${device.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                      Wake desktop
                    </Button>
                    <div className="flex gap-2">
                      <Input
                        value={gameIds[device.id] ?? ""}
                        onChange={(event) => setGameIds((prev) => ({ ...prev, [device.id]: event.target.value.trim() }))}
                        placeholder="Roblox game ID"
                        className="h-9 min-w-0 text-xs"
                      />
                      <Button
                        onClick={() => void handleLaunchRoblox(device.id)}
                        disabled={busyKey !== null || device.trustState !== "trusted"}
                        className="gap-2"
                      >
                        {busyKey === `roblox:${device.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gamepad2 className="h-4 w-4" />}
                        Launch Roblox
                      </Button>
                    </div>
                  </div>
                </div>
                {actionStatus[device.id] ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {actionStatus[device.id]}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-white/90">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-slate-600" />
              <CardTitle className="text-base text-slate-900">Linked accounts</CardTitle>
            </div>
            <CardDescription className="text-slate-600">
              Link your cloud accounts once and reuse them across AssistantX and Jarvis Desktop.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {SUPPORTED_PROVIDERS.map(({ id, label, icon: Icon, description }) => {
              const linked = accounts.find((a) => a.provider === id);
              return (
                <div key={id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/80 p-4">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{label}</span>
                      {linked ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">linked</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs leading-5 text-slate-500">{description}</p>
                  </div>
                  {!accountsLoading ? (
                    linked ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => unlink(id)}
                      >
                        Unlink
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => link(id)}>
                        Link
                      </Button>
                    )
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border-sky-200/70 bg-white/85">
            <CardHeader>
              <CardTitle className="text-sm text-slate-900">Pair by code</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs leading-6 text-slate-600">
              Desktop and phone both use Supabase Auth first. The code is only a one-time handshake between your own signed-in devices.
            </CardContent>
          </Card>
          <Card className="border-amber-200/70 bg-white/85">
            <CardHeader>
              <CardTitle className="text-sm text-slate-900">Wake-ready metadata</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs leading-6 text-slate-600">
              Jarvis Desktop reports MAC, IPv6, BIOS hints, and setup state so AssistantX can wake your workspace without manual router setup.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white/85">
            <CardHeader>
              <CardTitle className="text-sm text-slate-900">Single mobile UX</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs leading-6 text-slate-600">
              Wake, pair, and launch games directly from AssistantX. No second mobile app and no manual WoL settings screen.
            </CardContent>
          </Card>
        </div>

        <Separator />
      </div>
    </section>
  );
}
