"use client";

/**
 * Locale single-source-of-truth. Used by:
 *   - MeridianLanguageWizard (first-run modal)
 *   - Settings → Ogólne language picker
 *   - Any future i18n consumer
 *
 * Two keys on localStorage:
 *   jarvis.locale          → "pl" | "en" | "es" | "de"
 *   jarvis.locale.chosen   → "1" once the user has confirmed (wizard dismissed)
 *
 * `hasChosen` is the signal the wizard uses to decide whether to render at
 * first launch. Setting locale without marking-chosen lets us preselect a
 * default in the wizard without auto-closing it.
 *
 * Cross-tab sync via storage event so flipping locale in one tab updates the
 * other immediately.
 */

import { useCallback, useEffect, useState } from "react";

export type LocaleId = "pl" | "en" | "es" | "de";

export const LOCALE_AVAILABILITY: Record<LocaleId, "active" | "coming-soon"> = {
  pl: "active",
  en: "active",
  es: "coming-soon",
  de: "coming-soon",
};

export const LOCALE_LABELS: Record<LocaleId, string> = {
  pl: "Polski",
  en: "English",
  es: "Español",
  de: "Deutsch",
};

/** Native greeting per locale — what the wizard shows next to each option. */
export const LOCALE_GREETING: Record<LocaleId, string> = {
  pl: "Cześć, jestem Jarvis.",
  en: "Hi, I am Jarvis.",
  es: "Hola, soy Jarvis.",
  de: "Hallo, ich bin Jarvis.",
};

const STORAGE_KEY_LOCALE = "jarvis.locale";
const STORAGE_KEY_CHOSEN = "jarvis.locale.chosen";
const DEFAULT_LOCALE: LocaleId = "pl";

function isLocaleId(value: unknown): value is LocaleId {
  return value === "pl" || value === "en" || value === "es" || value === "de";
}

function readStoredLocale(): LocaleId {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_LOCALE);
    return isLocaleId(raw) ? raw : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function readStoredChosen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY_CHOSEN) === "1";
  } catch {
    return false;
  }
}

export function useMeridianLocale(): {
  locale: LocaleId;
  setLocale: (next: LocaleId) => void;
  hasChosen: boolean;
  markChosen: () => void;
  /** Reopen the wizard (Settings → Ogólne → "Change language" → calls this). */
  reset: () => void;
} {
  const [locale, setLocaleState] = useState<LocaleId>(() => readStoredLocale());
  const [hasChosen, setHasChosen] = useState<boolean>(() => readStoredChosen());

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY_LOCALE) {
        setLocaleState(isLocaleId(event.newValue) ? event.newValue : DEFAULT_LOCALE);
      } else if (event.key === STORAGE_KEY_CHOSEN) {
        setHasChosen(event.newValue === "1");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setLocale = useCallback((next: LocaleId) => {
    setLocaleState(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_LOCALE, next);
    } catch {
      // storage blocked — fall back to in-memory state only
    }
  }, []);

  const markChosen = useCallback(() => {
    setHasChosen(true);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_CHOSEN, "1");
    } catch { /* ignore */ }
  }, []);

  const reset = useCallback(() => {
    setHasChosen(false);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(STORAGE_KEY_CHOSEN);
    } catch { /* ignore */ }
  }, []);

  return { locale, setLocale, hasChosen, markChosen, reset };
}

export const MERIDIAN_LOCALE_STORAGE_KEYS = {
  locale: STORAGE_KEY_LOCALE,
  chosen: STORAGE_KEY_CHOSEN,
} as const;

export const MERIDIAN_LOCALE_DEFAULT: LocaleId = DEFAULT_LOCALE;
