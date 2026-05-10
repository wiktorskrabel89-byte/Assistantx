"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Link2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { normalizePairingCode, type PairingStatus } from "@/lib/device-pairing";

export function PCPairingDialog({
  open,
  pairingStatus,
  errorMessage,
  isConfirming,
  onOpenChange,
  onConfirm,
  onSkip,
}: {
  open: boolean;
  pairingStatus: PairingStatus;
  errorMessage: string | null;
  isConfirming?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (code: string) => Promise<{ ok: boolean }>;
  onSkip: () => void;
}) {
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) return;
    if (pairingStatus === "paired") {
      const timeoutId = window.setTimeout(() => {
        onOpenChange(false);
      }, 1400);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [onOpenChange, open, pairingStatus]);

  const handleSubmit = async () => {
    const result = await onConfirm(code);
    if (result.ok) {
      setCode("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {pairingStatus === "paired" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Link2 className="h-5 w-5 text-sky-600" />}
            {pairingStatus === "paired" ? "Phone linked" : "Link your phone"}
          </DialogTitle>
          <DialogDescription>
            {pairingStatus === "paired"
              ? "Your phone and PC are now linked. Jarvis sync is ready."
              : "Log into AssistantX on your phone, then enter the 6-character pairing code shown there."}
          </DialogDescription>
        </DialogHeader>

        {pairingStatus === "paired" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Pairing complete. This dialog will close automatically.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              If you started on your phone, install Jarvis Desktop on your PC and sign in with the same account before entering the pairing code.
            </div>
            <div className="space-y-2">
              <label htmlFor="pc-pairing-code" className="text-sm font-medium text-foreground">
                Pairing code
              </label>
              <Input
                id="pc-pairing-code"
                value={code}
                onChange={(event) => setCode(normalizePairingCode(event.target.value).slice(0, 6))}
                placeholder="AX7K2P"
                autoComplete="one-time-code"
                maxLength={6}
                className="font-mono text-lg tracking-[0.28em] uppercase"
              />
            </div>
            {errorMessage && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        )}

        {pairingStatus !== "paired" && (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isConfirming || code.length !== 6}>
              {isConfirming ? "Pairing..." : "Confirm pairing"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
