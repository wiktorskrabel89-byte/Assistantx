"use client";
import PublicChatWidget from "@/app/components/PublicChatWidget";

export default function ChatbotSection() {
  return (
    <div className="mt-10 flex justify-center">
      {/* Embedded AssistantX Chatbot */}
      <div style={{ minWidth: 320, maxWidth: 400, width: '100%' }}>
        <PublicChatWidget />
      </div>
    </div>
  );
}
