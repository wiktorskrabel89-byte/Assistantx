"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { MessageCircle } from "lucide-react";

const PublicChatWidget = dynamic(() => import("./PublicChatWidget"), { ssr: false });

export function DeferredPublicChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  if (isOpen) {
    return <PublicChatWidget onClose={() => setIsOpen(false)} />;
  }

  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="fixed bottom-8 right-8 z-50 flex items-center gap-2 rounded-xl border border-blue-300 bg-white px-4 py-3 text-sm font-medium text-blue-800 shadow-lg transition hover:bg-blue-50"
      aria-label="Open AssistantX chat widget"
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      Ask AssistantX
    </button>
  );
}
