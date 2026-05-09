export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_18%_16%,rgba(14,165,233,0.18),transparent_36%),radial-gradient(circle_at_82%_84%,rgba(251,146,60,0.16),transparent_40%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] px-6">
      <section className="w-full max-w-md rounded-3xl border border-sky-200/70 bg-white/90 p-8 text-center shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)] backdrop-blur">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-300/70 bg-sky-50 text-sky-700 shadow-sm">
          <span className="text-lg font-semibold">AX</span>
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">AssistantX</h1>
        <p className="mt-2 text-sm text-slate-600">Uruchamianie workspace…</p>
        <div className="mt-5 inline-flex items-center gap-1.5">
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_infinite] rounded-full bg-blue-500" />
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_0.2s_infinite] rounded-full bg-cyan-500" />
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_0.4s_infinite] rounded-full bg-violet-500" />
        </div>
      </section>
    </main>
  );
}
