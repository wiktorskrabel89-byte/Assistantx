"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";

function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    async function checkAdmin() {
      // Use the server-side check endpoint which reads app_metadata.role,
      // which cannot be tampered with from the client.
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch("/api/admin/check", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = await res.json() as { isAdmin: boolean };
      setIsAdmin(json.isAdmin === true);
    }
    void checkAdmin();
  }, []);
  return isAdmin;
}

export function AILearningTab() {
  const isAdmin = useIsAdmin();
  if (!isAdmin) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-2xl rounded-3xl border border-rose-200/80 bg-white/90 p-8 text-center shadow-[0_24px_80px_-28px_rgba(190,24,93,0.24)] backdrop-blur">
          <div className="inline-flex items-center rounded-full border border-rose-300/70 bg-rose-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">
            Ograniczony dostęp
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Tylko dla administratora</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Ten obszar zawiera roadmap rozwoju AI, routing modeli i tuning OpenRouter.
          </p>
        </div>
      </section>
    );
  }

  const phases = [
    { title: "Phase 1", items: ["chat system", "auth", "memory", "RAG", "image generation", "Tavily integration"] },
    { title: "Phase 2", items: ["routing improvements", "caching", "summaries", "analytics", "performance optimization"] },
    { title: "Phase 3", items: ["agents", "workflows", "advanced tool calling", "autonomous systems"] },
  ];

  const featureBlocks = [
    {
      title: "Core stack",
      items: [
        "Next.js + React + TailwindCSS",
        "Supabase (PostgreSQL, Auth, Storage, Edge Functions, pgvector)",
        "OpenRouter for text routing",
        "fal.ai (FLUX) for image generation",
        "Tavily for advanced live web search",
      ],
    },
    {
      title: "Core capabilities",
      items: [
        "Conversational AI with streaming responses",
        "Coding assistant with markdown and syntax highlighting",
        "Memory system (short-term, long-term, and summarization)",
        "RAG knowledge system with semantic retrieval",
        "Live web RAG with routing and caching",
        "Admin research workflows for surfing the web with RAG context",
        "Provider routing across OpenRouter, Tavily, and fal.ai",
      ],
    },
    {
      title: "Performance and security",
      items: [
        "Response streaming, caching, deduplication, async/background processing",
        "Rate limiting, token tracking, and cost tracking",
        "Server-side AI provider calls only",
        "Protected API keys and secure file uploads",
        "Admin observability tabs for memory, knowledge, research, and image history",
      ],
    },
  ];

  const adminTabs = [
    "Memory tab with workspace notes, profile memories, and summaries",
    "Knowledge tab for uploaded files and vector indexing status",
    "Web Research tab for Tavily searches, caching, and source review",
    "Image Studio tab for fal.ai FLUX generations and history",
    "AI Learning tab as the admin roadmap and architecture control surface",
  ];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="rounded-3xl border border-sky-200/80 bg-white/90 p-6 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.24)] backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">AI App Development Requirements</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Scalable AI platform roadmap</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Priorytet: szybkie odpowiedzi, niski koszt AI, modularna architektura i nowoczesny UX.
          </p>
          <div className="mt-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-900">
            Admin scope includes web browsing with RAG, provider routing, memory visibility, knowledge ingestion, and image generation history.
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {featureBlocks.map((block) => (
            <article key={block.title} className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">{block.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {block.items.map((item) => (
                  <li key={item} className="leading-6">• {item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {phases.map((phase) => (
            <article key={phase.title} className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
              <h3 className="text-base font-semibold text-slate-900">{phase.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {phase.items.map((item) => (
                  <li key={item} className="leading-6">• {item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <article className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
          <h3 className="text-base font-semibold text-slate-900">Admin tabs to ship</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {adminTabs.map((item) => (
              <li key={item} className="leading-6">• {item}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
