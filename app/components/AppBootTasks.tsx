"use client";

import { useEffect } from "react";

function runWhenIdle(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(callback, { timeout: 2_000 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = window.setTimeout(callback, 1_500);
  return () => window.clearTimeout(timeoutId);
}

export function AppBootTasks() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let cleanupIdle = () => undefined;

    const registerServiceWorker = () => {
      void navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
    };

    const scheduleRegistration = () => {
      cleanupIdle = runWhenIdle(registerServiceWorker);
    };

    if (document.readyState === "complete") {
      scheduleRegistration();
      return () => cleanupIdle();
    }

    window.addEventListener("load", scheduleRegistration, { once: true });

    return () => {
      window.removeEventListener("load", scheduleRegistration);
      cleanupIdle();
    };
  }, []);

  return null;
}
