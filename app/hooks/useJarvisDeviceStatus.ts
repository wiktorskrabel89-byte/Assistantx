"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type JarvisStatusDevice = {
  id: string;
  label: string;
  trustState: string;
  status: string;
  isOnline: boolean;
};

type JarvisDeviceStatusResponse = {
  devices?: JarvisStatusDevice[];
  primaryDeviceId?: string | null;
  error?: string;
};

export function useJarvisDeviceStatus() {
  const [devices, setDevices] = useState<JarvisStatusDevice[]>([]);
  const [primaryDeviceId, setPrimaryDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/jarvis/devices/status", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as JarvisDeviceStatusResponse;
      if (!response.ok) {
        setDevices([]);
        setPrimaryDeviceId(null);
        return;
      }
      setDevices(Array.isArray(payload.devices) ? payload.devices : []);
      setPrimaryDeviceId(typeof payload.primaryDeviceId === "string" ? payload.primaryDeviceId : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRefreshId = window.setTimeout(() => {
      void refresh();
    }, 0);
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => {
      window.clearTimeout(initialRefreshId);
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  const primaryDevice = useMemo(() => (
    devices.find((device) => device.id === primaryDeviceId)
    ?? devices.find((device) => device.trustState === "trusted" && device.isOnline)
    ?? devices.find((device) => device.trustState === "trusted")
    ?? null
  ), [devices, primaryDeviceId]);

  const hasTrustedOnlineDesktop = Boolean(primaryDevice?.trustState === "trusted" && primaryDevice.isOnline);

  return {
    devices,
    primaryDevice,
    hasTrustedOnlineDesktop,
    loading,
    refresh,
  };
}
