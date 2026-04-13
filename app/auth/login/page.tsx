"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/client";
import { getOAuthScopes } from "@/lib/integrations";

type SubmitState = "idle" | "submitting" | "success" | "error";
type OAuthProvider = "google" | "github";

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [feedback, setFeedback] = useState("");
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [authError] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("error") ?? "";
  });

  async function handleOAuth(provider: OAuthProvider) {
    setOauthLoading(provider);
    setFeedback("");

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        scopes: getOAuthScopes(provider),
      },
    });

    if (error) {
      setOauthLoading(null);
      setSubmitState("error");
      setFeedback(error.message);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setSubmitState("error");
      setFeedback("Enter your email address first.");
      return;
    }

    setSubmitState("submitting");
    setFeedback("");

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setSubmitState("error");
      setFeedback(error.message);
      return;
    }

    setSubmitState("success");
    setFeedback("Magic link sent. Open the email on this device to sign in.");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_35%),linear-gradient(180deg,_#0f172a,_#111827_45%,_#020617)] text-white px-6 py-12">
      <div className="mx-auto max-w-5xl grid gap-10 lg:grid-cols-[1.15fr,0.85fr] items-center min-h-[80vh]">
        <section>
          <div className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-cyan-200">
            Moje AI Cloud
          </div>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight text-balance">Sign in to sync your workspaces across devices.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
            Your chats, models, pinned memory, exports, and workspace settings now persist in Supabase. Use a magic link to sign in securely without managing passwords in this app.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
              <div className="text-sm font-medium text-white">Cloud-synced workspaces</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">Your workspace structure and preferences follow your account instead of staying only in one browser.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
              <div className="text-sm font-medium text-white">Secure by default</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">Authenticated routes use your Supabase session cookies, and cloud data is scoped per user with row-level security.</p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/8 backdrop-blur-xl shadow-2xl shadow-cyan-950/30 p-7">
          <div>
            <h2 className="text-2xl font-semibold">Email magic link</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Enter your email and Supabase will send you a one-time sign-in link.</p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleOAuth("google")}
              disabled={oauthLoading !== null || submitState === "submitting"}
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {oauthLoading === "google" ? "Redirecting to Google..." : "Continue with Google"}
            </button>
            <button
              type="button"
              onClick={() => void handleOAuth("github")}
              disabled={oauthLoading !== null || submitState === "submitting"}
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {oauthLoading === "github" ? "Redirecting to GitHub..." : "Continue with GitHub"}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-slate-400">
            <span className="h-px flex-1 bg-white/10" />
            <span>or use email</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-200">Email address</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/30"
              />
            </label>

            <button
              type="submit"
              disabled={submitState === "submitting" || oauthLoading !== null}
              className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitState === "submitting" ? "Sending link..." : "Send magic link"}
            </button>
          </form>

          <div className={`mt-4 min-h-6 text-sm ${submitState === "error" || authError ? "text-rose-300" : "text-cyan-200"}`}>
            {feedback || authError}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-4 text-xs leading-6 text-slate-300">
            Supabase setup needed:
            add your app URL and <span className="font-mono text-slate-100">/auth/callback</span> as allowed redirect URLs, enable Google and GitHub providers, turn on manual account linking in Supabase Auth if you want to attach those providers to an existing email account, then run the SQL migration in <span className="font-mono text-slate-100">supabase/migrations/20260413_auth_workspace_sync.sql</span>.
          </div>
        </section>
      </div>
    </main>
  );
}