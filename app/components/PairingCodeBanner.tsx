"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Smartphone, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PairingStatus } from "@/lib/device-pairing";

function formatRemainingTime(expiresAt: string | null) {
  if (!expiresAt) return "--:--";
  const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function PairingCodeBanner({
  status,
  pairingCode,
  expiresAt,
  isRefreshing,
  showDesktopInstallWarning,
  onRefresh,
  onClose,
}: {
  status: PairingStatus;
  pairingCode: string | null;
  expiresAt: string | null;
  isRefreshing?: boolean;
  showDesktopInstallWarning?: boolean;
  onRefresh: () => void;
  onClose?: () => void;
}) {
  const [countdown, setCountdown] = useState(() => formatRemainingTime(expiresAt));

  useEffect(() => {
    setCountdown(formatRemainingTime(expiresAt));
    if (!expiresAt) return;
    const intervalId = window.setInterval(() => {
      setCountdown(formatRemainingTime(expiresAt));
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [expiresAt]);

  useEffect(() => {
    if (status !== "paired" || !onClose) return;
    const timeoutId = window.setTimeout(() => {
      onClose();
    }, 3000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [onClose, status]);

  const statusLabel = useMemo(() => (
    status === "paired" ? "Paired" : "Waiting for your PC"
  ), [status]);

  return (
    <div className="fixed left-1/2 top-3 z-50 w-[min(calc(100%-1.5rem),30rem)] -translate-x-1/2">
      <Card className="border-sky-200/80 bg-white/95 shadow-2xl backdrop-blur">
        <CardHeader className="gap-3 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                {status === "paired" ? <CheckCircle2 className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
              </div>
              <div>
                <CardTitle className="text-base text-slate-900">
                  {status === "paired" ? "Phone and PC linked" : "Pair your phone with your PC"}
                </CardTitle>
                <CardDescription className="mt-1 text-xs text-slate-600">
                  {status === "paired"
                    ? "Your phone and PC are now linked. Workspace sync is active."
                    : "Open AssistantX on your PC, sign in with the same account, and enter this code."}
                </CardDescription>
              </div>
            </div>
            <Badge className={status === "paired" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-sky-100 text-sky-700 hover:bg-sky-100"}>
              {statusLabel}
            </Badge>
          </div>
          {showDesktopInstallWarning && status !== "paired" && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>Account not paired with a PC yet. To continue, install Jarvis Desktop on your PC and sign in with the same account.</p>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-center">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Pairing code</div>
            <div className="mt-1 font-mono text-3xl font-bold tracking-[0.36em] text-white">
              {pairingCode ?? "------"}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span>Expires in {countdown}</span>
            <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh code"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
