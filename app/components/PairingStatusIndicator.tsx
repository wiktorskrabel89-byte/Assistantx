"use client";

import { Link2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeviceType, PairingStatus } from "@/lib/device-pairing";

export function PairingStatusIndicator({
  status,
  deviceType,
  onClick,
  title,
}: {
  status: PairingStatus;
  deviceType: DeviceType;
  onClick: () => void;
  title?: string;
}) {
  const isPaired = status === "paired";
  const tooltip = title ?? (isPaired
    ? "Phone linked"
    : deviceType === "phone"
      ? "Account not paired with a PC yet"
      : "No phone linked — click to pair");

  return (
    <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={tooltip}
          aria-label={tooltip}
          onClick={onClick}
          className={isPaired
            ? "h-9 w-9 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "relative h-9 w-9 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"}
        >
          <Link2 className="h-4 w-4" />
          {!isPaired && <TriangleAlert className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-white text-amber-600" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}
