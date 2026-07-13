"use client";

/**
 * Single source of truth for the Meridian dev-tools overlay enable state.
 *
 * The same boolean drives two consumers:
 *   - MeridianDevTools (the floating panel) — opens when this is true.
 *   - MeridianDevToolsToggle (Settings switch) — toggles it from the UI.
 *
 * Persisted to localStorage under "jarvis.devtools.enabled" so the choice
 * survives reloads. Default is true in development, false in production —
 * because devs want it open while iterating, but the panel shouldn't surprise
 * a real user the first time they sign in on production.
 *
 * Cross-tab sync via the storage event so flipping the toggle in one tab
 * updates every other tab without reloading.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "jarvis.devtools.enabled";

function defaultEnabled(): boolean {
  if (typeof process === "undefined") return false;
  return process.env.NODE_ENV === "development";
}

function readStored(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}

function writeStored(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Quota exceeded or storage disabled (private browsing). The in-memory
    // state still works for the session — silent failure is correct here.
  }
}

export function useMeridianDevTools(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    const stored = readStored();
    return stored ?? defaultEnabled();
  });

  // Cross-tab + cross-window sync. Storage events only fire in OTHER tabs of
  // the same origin (never the writer itself), so the writer also updates
  // local state in setEnabled below.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      const next = event.newValue === "1";
      setEnabledState(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeStored(next);
  }, []);

  return [enabled, setEnabled];
}

export const MERIDIAN_DEVTOOLS_STORAGE_KEY = STORAGE_KEY;
