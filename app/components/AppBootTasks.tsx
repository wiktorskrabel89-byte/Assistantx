"use client";

import { useEffect } from "react";
import { registerPushServiceWorker } from "@/app/lib/push-notifications";

function runWhenIdle(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const browserWindow = window;

  if ("requestIdleCallback" in browserWindow) {
    const idleId = browserWindow.requestIdleCallback(callback, { timeout: 2_000 });
    return () => browserWindow.cancelIdleCallback(idleId);
  }

  const timeoutId = globalThis.setTimeout(callback, 1_500);
  return () => globalThis.clearTimeout(timeoutId);
}

export function AppBootTasks() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let cleanupIdle: () => void = () => {};

    const registerServiceWorker = () => {
      void registerPushServiceWorker()
        .then((registration) => registration?.update())
        .catch(() => undefined);
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
