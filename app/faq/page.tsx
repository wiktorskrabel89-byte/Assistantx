import type { Metadata } from "next";
import Link from "next/link";
import { getFaqItems } from "@/app/lib/faq-items";
import { getUiLang } from "@/app/lib/get-ui-lang";
import { PAGE_STRINGS } from "@/app/lib/page-strings";
import { LanguageSwitcher } from "@/app/components/LanguageSwitcher";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to the questions most people ask about AssistantX.",
};

export default async function FaqPage() {
  const lang = await getUiLang();
  const s = PAGE_STRINGS[lang];
  const items = getFaqItems(lang);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <main className="relative min-h-screen bg-[#050508] text-white overflow-x-hidden">
      <LanguageSwitcher lang={lang} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5 8.25 12l7.5-7.5"
              />
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
            {s.faq.eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              {s.faq.heading}
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/60">
            {s.faq.intro}
          </p>

          <div className="mt-10 space-y-3">
            {items.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-5 transition-all hover:border-white/[0.14] hover:bg-white/[0.04] open:border-white/[0.14] open:bg-white/[0.04]"
              >
                <summary className="flex list-none items-start justify-between gap-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050508] rounded-md">
                  <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white/85 group-open:text-white transition-colors">
                    {item.question}
                  </h2>
                  <span
                    aria-hidden="true"
                    className="mt-1 shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/50 transition-all group-open:rotate-45 group-open:border-violet-400/50 group-open:text-violet-300 group-open:bg-violet-500/10"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4.5v15m7.5-7.5h-15"
                      />
                    </svg>
                  </span>
                </summary>
                <p className="mt-4 text-sm leading-7 text-white/60">{item.answer}</p>
              </details>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-white/40">
            {s.faq.notFound}{" "}
            <Link
              href="/contact"
              className="text-violet-300 hover:text-violet-200 underline decoration-violet-400/50 underline-offset-2 transition-colors"
            >
              {s.faq.getInTouch}
            </Link>
            .
          </p>
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
