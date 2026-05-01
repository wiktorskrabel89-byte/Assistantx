"use client";
import ChatbotSection from "@/app/components/ChatbotSection";

export default function SupportPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-6">
      <div className="text-2xl mb-4">Welcome to AssistantX Support!</div>
      <div className="mb-6 text-lg">
        Contact us at <a href="mailto:support.assistantx.pl@gmail.com" className="underline text-blue-400">support.assistantx.pl@gmail.com</a>
      </div>
      <div className="w-full max-w-md">
        <ChatbotSection />
      </div>
    </main>
  );
}
