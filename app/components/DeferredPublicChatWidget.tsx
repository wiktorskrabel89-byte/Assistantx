"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PublicChatWidget = dynamic(() => import("./PublicChatWidget"), { ssr: false });

export function DeferredPublicChatWidget() {
  const [showWidget, setShowWidget] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const browserWindow = window;
    if ("requestIdleCallback" in browserWindow) {
      const id = browserWindow.requestIdleCallback(() => setShowWidget(true), { timeout: 3000 });
      return () => browserWindow.cancelIdleCallback(id);
    }
    const timeout = globalThis.setTimeout(() => setShowWidget(true), 1800);
    return () => globalThis.clearTimeout(timeout);
  }, []);

  if (showWidget) return <PublicChatWidget />;

  return (
    <button
      type="button"
      onClick={() => setShowWidget(true)}
      className="fixed bottom-8 right-8 z-50 rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-800 shadow-lg transition hover:bg-blue-50"
      aria-label="Open AssistantX chat widget"
    >
      Open AssistantX chat
    </button>
  );
}
