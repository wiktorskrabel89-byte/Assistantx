"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Loader2, Mail, Sparkles } from "lucide-react";
import { PublicLanguageSelector } from "@/app/components/PublicLanguageSelector";
import {
  detectLanguageFromAcceptLanguage,
  normalizePublicLanguage,
  type PublicUILanguage,
  UI_LANGUAGE_COOKIE_NAME,
} from "@/app/lib/ui-language";
import { WAITLIST_COPY } from "@/app/lib/waitlist-copy";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubmitStatus = "idle" | "loading" | "success" | "duplicate" | "error" | "invalid";

export default function WaitlistPage() {
  const [language] = useState<PublicUILanguage>(() => {
    if (typeof document === "undefined") return "en";
    const cookieValue = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${UI_LANGUAGE_COOKIE_NAME}=`))
      ?.split("=")[1];
    if (cookieValue) return normalizePublicLanguage(cookieValue);
    if (typeof navigator !== "undefined") {
      return detectLanguageFromAcceptLanguage(navigator.language);
    }
    return "en";
  });
  const t = WAITLIST_COPY[language];

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      setStatus("invalid");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, language }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; duplicate?: boolean } | null;

      if (res.ok && data?.ok) {
        setStatus(data.duplicate ? "duplicate" : "success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const statusMessage = (() => {
    switch (status) {
      case "success":
        return t.successMessage;
      case "duplicate":
        return t.alreadyOnListMessage;
      case "error":
        return t.errorMessage;
      case "invalid":
        return t.invalidEmailMessage;
      default:
        return null;
    }
  })();

  const statusColor = status === "error" || status === "invalid" ? "#f87171" : "#34d399";
  const submitted = status === "success" || status === "duplicate";

  return (
    <main
      className="relative min-h-screen overflow-hidden px-5 py-5"
      style={{
        background: "linear-gradient(135deg, #0d0d14 0%, #0f1117 50%, #0a0e1a 100%)",
        color: "#e8eaf0",
      }}
    >
      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Radial glow top-left */}
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)",
        }}
      />
      {/* Radial glow bottom-right */}
      <div
        className="pointer-events-none absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full opacity-15"
        style={{
          background: "radial-gradient(circle, rgba(56,189,248,0.25) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col">
        {/* ── Header ── */}
        <header
          className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 text-sm"
          style={{
            borderColor: "rgba(255,255,255,0.08)",
            color: "rgba(232,234,240,0.6)",
          }}
        >
          <Link
            href="https://assistantx.pl"
            className="text-base font-bold tracking-tight"
            style={{ color: "#e8eaf0", letterSpacing: "-0.02em" }}
          >
            AssistantX
          </Link>
          <PublicLanguageSelector initialLanguage={language} />
        </header>

        {/* ── Hero + signup ── */}
        <section className="flex flex-1 flex-col items-center justify-center py-16 text-center lg:py-24">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest"
              style={{
                borderColor: "rgba(99,102,241,0.4)",
                background: "rgba(99,102,241,0.1)",
                color: "#a5b4fc",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t.badge}
            </span>
          </div>

          {/* Title */}
          <h1
            className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
            style={{ letterSpacing: "-0.04em" }}
          >
            <span style={{ color: "#e8eaf0" }}>{t.title}</span>
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #6366f1 0%, #38bdf8 60%, #a78bfa 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {t.titleAccent}
            </span>
          </h1>

          <p className="mt-4 max-w-xl text-lg font-medium" style={{ color: "rgba(232,234,240,0.8)" }}>
            {t.tagline}
          </p>

          <p className="mt-4 max-w-xl text-base leading-7" style={{ color: "rgba(232,234,240,0.6)" }}>
            {t.intro}
          </p>

          {/* Signup card */}
          <div
            className="mt-10 w-full max-w-md rounded-2xl border p-6 sm:p-8"
            style={{
              borderColor: "rgba(99,102,241,0.2)",
              background: "rgba(255,255,255,0.03)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {submitted ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}
                >
                  <Mail className="h-6 w-6" />
                </span>
                <p className="text-sm font-medium" style={{ color: "#e8eaf0" }}>
                  {statusMessage}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <label htmlFor="waitlist-email" className="text-left text-sm font-medium" style={{ color: "rgba(232,234,240,0.8)" }}>
                  {t.emailLabel}
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    id="waitlist-email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t.emailPlaceholder}
                    className="min-h-11 flex-1 rounded-lg border px-4 text-sm outline-none transition-colors duration-150 focus:border-[rgba(99,102,241,0.6)]"
                    style={{
                      borderColor: "rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "#e8eaf0",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-70"
                    style={{
                      background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                      color: "#fff",
                      boxShadow: "0 0 20px rgba(99,102,241,0.35)",
                    }}
                  >
                    {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                    {status === "loading" ? t.submitButtonLoading : t.submitButton}
                  </button>
                </div>
                {statusMessage && (
                  <p className="text-left text-sm" style={{ color: statusColor }}>
                    {statusMessage}
                  </p>
                )}
              </form>
            )}
          </div>

          <p className="mt-6 max-w-md text-xs leading-6" style={{ color: "rgba(232,234,240,0.4)" }}>
            {t.privacyNote}{" "}
            <Link href="/privacy" className="underline transition-colors duration-150 hover:text-white">
              {t.privacyLink}
            </Link>
            .
          </p>
        </section>

        {/* ── Footer ── */}
        <footer
          className="relative mx-auto mt-4 w-full space-y-2 border-t pt-4 text-sm"
          style={{
            borderColor: "rgba(255,255,255,0.08)",
            color: "rgba(232,234,240,0.4)",
          }}
        >
          <div>
            &copy; {new Date().getFullYear()} AssistantX. {t.footerRights}
          </div>
          <div className="text-xs" style={{ color: "rgba(232,234,240,0.25)" }}>
            Acrux.pl Sp. z o.o., ul. Sobczaka 1, Poznań. NIP: 7792506166.
          </div>
        </footer>
      </div>
    </main>
  );
}
