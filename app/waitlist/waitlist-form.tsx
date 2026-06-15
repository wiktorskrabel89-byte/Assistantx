"use client";

import { useId, useState } from "react";
import { Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import type { PublicUILanguage } from "@/app/lib/ui-language";
import type { WaitlistCopy } from "./copy";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "loading" | "success" | "alreadyIn" | "error" | "invalid";

export function WaitlistForm({
  copy,
  language,
  className = "",
}: {
  copy: WaitlistCopy["form"];
  language: PublicUILanguage;
  className?: string;
}) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const isDone = status === "success" || status === "alreadyIn";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setStatus("invalid");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, locale: language, source: "waitlist" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        alreadySubscribed?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setStatus("error");
        return;
      }
      setStatus(data.alreadySubscribed ? "alreadyIn" : "success");
    } catch {
      setStatus("error");
    }
  }

  if (isDone) {
    return (
      <div className={className}>
        <div
          className="flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm font-medium"
          style={{
            borderColor: "rgba(215,250,138,0.35)",
            background: "rgba(215,250,138,0.08)",
            color: "#d7fa8a",
          }}
        >
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <span>{status === "alreadyIn" ? copy.alreadyIn : copy.success}</span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={className} noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">
          Email
        </label>
        <input
          id={inputId}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "invalid" || status === "error") setStatus("idle");
          }}
          placeholder={copy.placeholder}
          className="min-h-12 flex-1 rounded-xl border bg-transparent px-4 text-sm font-medium text-white outline-none transition-colors duration-150 placeholder:text-white/35 focus:border-[#d7fa8a]/60"
          style={{
            borderColor:
              status === "invalid" ? "rgba(248,113,113,0.6)" : "rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.03)",
          }}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold uppercase tracking-wide transition-transform duration-150 hover:scale-[1.02] disabled:opacity-70"
          style={{
            background: "#d7fa8a",
            color: "#0a0a0a",
            boxShadow: "0 0 24px rgba(215,250,138,0.25)",
          }}
        >
          {status === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.buttonLoading}
            </>
          ) : (
            <>
              {copy.button}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
      <p className="mt-2 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
        {status === "invalid" ? (
          <span style={{ color: "#f87171" }}>{copy.invalidEmail}</span>
        ) : status === "error" ? (
          <span style={{ color: "#f87171" }}>{copy.error}</span>
        ) : (
          copy.disclaimer
        )}
      </p>
    </form>
  );
}
