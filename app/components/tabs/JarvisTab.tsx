"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Download, Laptop, Mic, Smartphone, Sparkles, TriangleAlert, Volume2 } from "lucide-react";
import type { DeviceType, PairingStatus } from "@/lib/device-pairing";

export default function JarvisTab({
  deviceType = "pc",
  pairingStatus = "none",
  pairingCode = null,
  expiresAt = null,
  onOpenPairingDialog,
  onShowPhonePairingBanner,
}: {
  deviceType?: DeviceType;
  pairingStatus?: PairingStatus;
  pairingCode?: string | null;
  expiresAt?: string | null;
  onOpenPairingDialog?: () => void;
  onShowPhonePairingBanner?: () => void;
}) {
  const [latestGithubVersion, setLatestGithubVersion] = useState<string | null>(null);

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

    // Navigate directly to the API route so the browser handles redirects and
    // streaming natively — avoids CORS issues and user-gesture restrictions.
    window.location.href = `/api/jarvis/download?arch=${arch}`;
  }

  function downloadForAndroid() {
    window.location.href = "/api/jarvis/download?platform=android";
  }

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

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
        <Card className="border-sky-200/70 bg-white/90 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)]">
          <CardHeader className="gap-4">
            <Badge className="w-fit bg-sky-100 text-sky-800 hover:bg-sky-100">AssistantX Jarvis</Badge>
            <CardTitle className="text-3xl text-slate-900 sm:text-4xl">
              Download Jarvis for desktop and mobile
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              Keep your AssistantX assistant close at hand. Install Jarvis on Windows or Android and continue your workflows with updated models and voice features.
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

        {pairingStatus !== "paired" && (
          <Card className="border-amber-200/70 bg-amber-50/85">
            <CardHeader>
              <div className="flex items-center gap-2 text-amber-900">
                <TriangleAlert className="h-4 w-4" />
                <CardTitle className="text-base">
                  Account not paired with {deviceType === "phone" ? "a PC" : "your phone"} yet
                </CardTitle>
              </div>
              <CardDescription className="text-amber-900/80">
                {deviceType === "phone"
                  ? "To continue, install Jarvis Desktop on your PC, sign in with the same account, and enter the pairing code from your phone."
                  : "Sign in on your phone with the same account, then enter the pairing code shown there to finish linking Jarvis."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-xs text-amber-950/80">
                {deviceType === "phone" && pairingCode && (
                  <div className="font-mono text-sm font-semibold tracking-[0.28em] text-amber-950">
                    {pairingCode}
                  </div>
                )}
                {deviceType === "phone" && expiresAt && (
                  <p>Pairing code active until {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>
                )}
              </div>
              {deviceType === "phone" ? (
                <Button type="button" variant="secondary" className="gap-2" onClick={onShowPhonePairingBanner}>
                  <Smartphone className="h-4 w-4" />
                  Show pairing code
                </Button>
              ) : (
                <Button type="button" variant="secondary" className="gap-2" onClick={onOpenPairingDialog}>
                  <Laptop className="h-4 w-4" />
                  Pair with phone
                </Button>
              )}
            </CardContent>
          </Card>
        )}

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
