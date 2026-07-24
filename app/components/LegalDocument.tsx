import Link from "next/link";
import type { ReactNode } from "react";
import { getUiLang } from "@/app/lib/get-ui-lang";
import { PAGE_STRINGS } from "@/app/lib/page-strings";
import { LanguageSwitcher } from "@/app/components/LanguageSwitcher";

export async function LegalDocument({
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
  const lang = await getUiLang();
  const s = PAGE_STRINGS[lang];

  return (
    <main className="relative min-h-screen bg-[#050508] text-white overflow-x-hidden">
      <LanguageSwitcher lang={lang} />
      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 15%, rgba(120,80,220,0.15), transparent)",
          }}
        />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 80% 60%, rgba(0,180,255,0.1), transparent)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-4xl px-6 py-14">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/60 transition-colors hover:text-white"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {s.back}
          </Link>

          <nav className="flex flex-wrap gap-2 text-xs">
            <Link
              href="/faq"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              {s.nav.faq}
            </Link>
            <Link
              href="/privacy"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              {s.nav.privacy}
            </Link>
            <Link
              href="/terms"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              {s.nav.terms}
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              {s.nav.contact}
            </Link>
          </nav>
        </div>

        <article className="relative rounded-3xl border border-white/[0.08] bg-white/[0.03] p-7 shadow-2xl shadow-purple-500/5 backdrop-blur-xl sm:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
            {s.legal.lastUpdatedLabel} {lastUpdated}
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              {title}
            </span>
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-white/60">{description}</p>

          <div className="mt-10 space-y-8 text-sm leading-7 text-white/70 [&_a]:text-violet-300 [&_a]:underline [&_a]:decoration-violet-400/50 [&_a]:underline-offset-2 [&_a:hover]:text-violet-200 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-white [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white/90 [&_li]:ml-5 [&_li]:list-disc [&_li]:marker:text-violet-400/60 [&_p]:text-white/70 [&_strong]:text-white [&_ul]:space-y-2">
            {children}
          </div>
        </article>

        <footer className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/[0.05] pt-6 text-xs text-white/30 sm:flex-row">
          <span>&copy; {new Date().getFullYear()} AssistantX. {s.footerRights}</span>
          <div className="flex gap-4">
            <Link href="/faq" className="hover:text-white/60 transition-colors">
              {s.nav.faq}
            </Link>
            <Link href="/privacy" className="hover:text-white/60 transition-colors">
              {s.nav.privacy}
            </Link>
            <Link href="/terms" className="hover:text-white/60 transition-colors">
              {s.nav.terms}
            </Link>
            <Link href="/contact" className="hover:text-white/60 transition-colors">
              {s.nav.contact}
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
