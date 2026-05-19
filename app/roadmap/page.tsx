import Link from "next/link";

export default function RoadmapPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-100 px-6 py-10 text-slate-900">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-3xl border border-blue-200/70 bg-white/90 p-8 shadow-[0_24px_80px_-28px_rgba(37,99,235,0.28)]">
          <div className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            AssistantX Public Roadmap
          </div>
          <h1 className="mt-4 text-3xl font-bold text-blue-700">Roadmap + KPI baseline</h1>
          <p className="mt-3 text-sm text-slate-700">
            Strategic rollout for AssistantX as a full developer platform (PaaS), starting with Phase A quick wins.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/pricing" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:border-blue-200 hover:text-blue-700">
              View pricing
            </Link>
            <Link href="/auth/login" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Sign in
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6">
          <h2 className="text-lg font-semibold">North-star KPI baseline (before rollout)</h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm text-slate-700">
            <li>Guest → Registration conversion</li>
            <li>GitHub activation rate</li>
            <li>AI Code mode usage (120B profile)</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6">
          <h2 className="text-lg font-semibold">Phased delivery</h2>
          <ol className="mt-3 space-y-2 text-sm text-slate-700">
            <li><strong>Phase A:</strong> Localization, onboarding, trust signals, public conversion pages.</li>
            <li><strong>Phase B:</strong> Repo-wide editing workflow (plan + manual approval) and proactive PR analysis in chat.</li>
            <li><strong>Phase C:</strong> Runtime hardening, optional GitHub PR comments, production memory adapter.</li>
            <li><strong>Phase D:</strong> Public MCP endpoints with API keys + ecosystem docs.</li>
            <li><strong>Phase E:</strong> Reliability/cost tuning, reflection loop optimization, growth experiments.</li>
          </ol>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6">
          <h2 className="text-lg font-semibold">Coding model policy (120B + fallbacks)</h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm text-slate-700">
            <li>Primary coding profile: GPT OSS 120B with strict deterministic mode for critical tasks.</li>
            <li>Fallback 1: Gemini long-context profile.</li>
            <li>Fallback 2: Low-cost reasoning profile (DeepSeek/Llama class).</li>
            <li>Repo-wide changes are always plan-first with explicit user approval before commit/PR.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
