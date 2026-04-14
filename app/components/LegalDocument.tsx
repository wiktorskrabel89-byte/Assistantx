import Link from "next/link";
import type { ReactNode } from "react";

export function LegalDocument({
  title,
  description,
  lastUpdated,
  children,
}: {
  title: string;
  description: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_35%),linear-gradient(180deg,_#0f172a,_#111827_45%,_#020617)] px-6 py-12 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
          <div className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-cyan-200">
            Moje AI Legal
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/10">
              App
            </Link>
            <Link href="/auth/login" className="rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/10">
              Sign in
            </Link>
            <Link href="/privacy" className="rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/10">
              Privacy
            </Link>
            <Link href="/terms" className="rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/10">
              Terms
            </Link>
          </div>
        </div>

        <article className="rounded-[2rem] border border-white/10 bg-white/8 p-7 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl sm:p-10">
          <p className="text-sm uppercase tracking-[0.22em] text-cyan-200">Last updated {lastUpdated}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance">{title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">{description}</p>

          <div className="mt-8 space-y-8 text-sm leading-7 text-slate-200 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_li]:ml-5 [&_li]:list-disc [&_p]:text-slate-200 [&_ul]:space-y-2">
            {children}
          </div>
        </article>
      </div>
    </main>
  );
}