"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Download, GitBranch, Link2, Mail, Mic, Smartphone, Sparkles, Volume2, Wifi, WifiOff } from "lucide-react";

// ── Live PC presence hook ────────────────────────────────────────────────────
function usePcPresence(backendWsUrl?: string) {
  const [pcOnline, setPcOnline] = useState(false);
  const [pcError, setPcError] = useState<string | null>(null);
  const [pcPresence, setPcPresence] = useState<{
    status?: string;
    cpu?: number | null;
    freeRamMb?: number | null;
    totalRamMb?: number | null;
    activeApps?: string[];
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const url = backendWsUrl ?? (process.env.NEXT_PUBLIC_JARVIS_WS_URL ?? null);
    if (!url) return;

    let mounted = true;

    const connect = () => {
      if (!mounted) return;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setPcError(null);
          ws.send(JSON.stringify({ type: 'register', role: 'web' }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string);
            if (msg.type === 'presence_snapshot') {
              setPcOnline((msg.role_counts?.desktop ?? 0) > 0);
            }
            if (msg.type === 'peer_registered' && msg.role === 'desktop') setPcOnline(true);
            if (msg.type === 'peer_disconnected' && msg.role === 'desktop') setPcOnline(false);
            if (msg.type === 'device_status' && msg.role === 'desktop') {
              setPcOnline(msg.status === 'online' || msg.status === 'busy');
              setPcPresence({
                status: msg.status,
                cpu: msg.cpu ?? null,
                freeRamMb: msg.freeRamMb ?? null,
                totalRamMb: msg.totalRamMb ?? null,
                activeApps: msg.activeApps ?? [],
              });
            }
          } catch {
            // ignore malformed message payloads
          }
        };

        ws.onclose = (event) => {
          setPcOnline(false);
          const reason = event.reason ? ` (${event.reason})` : '';
          const detail = `WebSocket closed: code ${event.code}${reason}`;
          setPcError(detail);
          console.warn('[JarvisTab] PC presence websocket closed:', { code: event.code, reason: event.reason, url });
          if (mounted) timerRef.current = setTimeout(connect, 5000);
        };

        ws.onerror = (event) => {
          setPcError('WebSocket error while connecting to PC presence service.');
          console.warn('[JarvisTab] PC presence websocket error:', { url, event });
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown WebSocket initialization error';
        setPcError(`Failed to initialize WebSocket: ${detail}`);
        console.warn('[JarvisTab] Failed to create PC presence websocket:', { url, error });
      }
    };

    connect();
    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [backendWsUrl]);

  return { pcOnline, pcPresence, pcError };
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
  const { pcOnline, pcPresence, pcError } = usePcPresence();
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

  const pcStatusText = pcOnline
    ? [
        `PC online${pcPresence?.status === 'busy' ? ' (busy)' : ''}`,
        pcPresence?.cpu !== null && pcPresence?.cpu !== undefined ? `CPU ${pcPresence.cpu}%` : null,
        pcPresence?.freeRamMb ? `RAM ${pcPresence.freeRamMb}/${pcPresence.totalRamMb}MB` : null,
        pcPresence?.activeApps?.length ? pcPresence.activeApps.slice(0, 2).join(', ') : null,
      ].filter(Boolean).join(' · ')
    : (pcError ? `PC offline · ${pcError}` : 'PC offline');

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
          <CardContent className="flex items-center gap-3 py-3">
            {pcOnline
              ? <Wifi className="h-4 w-4 shrink-0 text-green-600" />
              : <WifiOff className="h-4 w-4 shrink-0 text-slate-400" />}
            <span className={`text-sm font-medium ${pcOnline ? 'text-green-800' : 'text-slate-500'}`}>
              {pcStatusText}
            </span>
            {!process.env.NEXT_PUBLIC_JARVIS_WS_URL && (
              <span className="ml-auto text-xs text-slate-400">Set NEXT_PUBLIC_JARVIS_WS_URL to enable live status</span>
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
