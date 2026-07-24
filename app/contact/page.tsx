import type { Metadata } from "next";
import Link from "next/link";
import { getUiLang } from "@/app/lib/get-ui-lang";
import { PAGE_STRINGS } from "@/app/lib/page-strings";
import { LanguageSwitcher } from "@/app/components/LanguageSwitcher";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the AssistantX team.",
};

const CONTACT_ADDRESS = "support.assistantx.pl@gmail.com";
const GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
] as const;

export default async function ContactPage() {
  const lang = await getUiLang();
  const s = PAGE_STRINGS[lang];
  const reasons = [
    { ...s.contact.reasons.general, gradient: GRADIENTS[0] },
    { ...s.contact.reasons.support, gradient: GRADIENTS[1] },
    { ...s.contact.reasons.privacy, gradient: GRADIENTS[2] },
    { ...s.contact.reasons.legal, gradient: GRADIENTS[3] },
  ];

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
          </nav>
        </div>

        <article className="relative rounded-3xl border border-white/[0.08] bg-white/[0.03] p-7 shadow-2xl shadow-purple-500/5 backdrop-blur-xl sm:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
            {s.contact.eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              {s.contact.heading}
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/60">
            {s.contact.intro}
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {reasons.map((reason) => (
              <a
                key={reason.label}
                href={`mailto:${CONTACT_ADDRESS}?subject=${encodeURIComponent(reason.subject)}`}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 transition-all hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050508]"
              >
                <div
                  className={`absolute -top-16 -right-16 h-32 w-32 rounded-full bg-gradient-to-br ${reason.gradient} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20`}
                />
                <div
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${reason.gradient} ring-1 ring-inset ring-white/20`}
                >
                  <svg
                    className="h-5 w-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.6}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                    />
                  </svg>
                </div>
                <h2 className="mt-5 text-lg font-bold tracking-tight text-white">
                  {reason.label}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/50">{reason.desc}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 transition-colors group-hover:text-violet-200">
                  {s.contact.sendEmail}
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
                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </span>
              </a>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-sm text-white/50">
            {s.contact.alsoReach}{" "}
            <Link
              href="https://discord.gg/mpjHw5QD"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-300 underline decoration-violet-400/50 underline-offset-2 hover:text-violet-200"
            >
              {s.contact.discord}
            </Link>
            .
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
