"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/client";
import { getOAuthQueryParams, getOAuthScopes, getProviderLabel, type OAuthProvider } from "@/lib/integrations";
import {
  clearPendingOAuthProvider,
  clearOAuthErrorFromLocation,
  formatOAuthErrorMessage,
  getOAuthInterruptedMessage,
  getPendingOAuthProvider,
  readOAuthErrorFromLocation,
  rememberPendingOAuthProvider,
} from "@/lib/oauth-client";

type SubmitState = "idle" | "submitting" | "success" | "error";

export default function LoginPage() {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const [initialLocationError] = useState(() => {
    if (typeof window === "undefined") return "";
    return readOAuthErrorFromLocation(getPendingOAuthProvider());
  });
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>(initialLocationError ? "error" : "idle");
  const [feedback, setFeedback] = useState(initialLocationError);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [authError, setAuthError] = useState(initialLocationError);

  function getSupabase() {
    if (supabaseRef.current) return supabaseRef.current;
    supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const recoverFromInterruptedOAuth = useCallback((provider: OAuthProvider) => {
    clearPendingOAuthProvider();
    setOauthLoading(null);
    setSubmitState("idle");
    setAuthError("");
    setFeedback(getOAuthInterruptedMessage(provider));
  }, []);

  useEffect(() => {
    if (!initialLocationError) return;
    clearPendingOAuthProvider();
    clearOAuthErrorFromLocation();
  }, [initialLocationError]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const restorePendingOAuth = () => {
      const pendingProvider = getPendingOAuthProvider();
      if (!pendingProvider) return;
      recoverFromInterruptedOAuth(pendingProvider);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        restorePendingOAuth();
      }
    };

    window.addEventListener("pageshow", restorePendingOAuth);
    window.addEventListener("focus", restorePendingOAuth);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", restorePendingOAuth);
      window.removeEventListener("focus", restorePendingOAuth);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [recoverFromInterruptedOAuth]);

  async function handleOAuth(provider: OAuthProvider) {
    setOauthLoading(provider);
    setSubmitState("idle");
    setAuthError("");
    setFeedback("");

    let supabase;
    try {
      supabase = getSupabase();
    } catch (error) {
      clearPendingOAuthProvider();
      setOauthLoading(null);
      setSubmitState("error");
      setFeedback(error instanceof Error ? error.message : "Supabase client is not configured.");
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback`;
    rememberPendingOAuthProvider(provider);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: getOAuthQueryParams(provider),
          scopes: getOAuthScopes(provider),
        },
      });

      if (!error) return;

      clearPendingOAuthProvider();
      setOauthLoading(null);
      setSubmitState("error");
      setFeedback(formatOAuthErrorMessage(provider, error));
    } catch (error) {
      clearPendingOAuthProvider();
      setOauthLoading(null);
      setSubmitState("error");
      setFeedback(formatOAuthErrorMessage(provider, error));
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

    clearPendingOAuthProvider();
    setOauthLoading(null);
    setSubmitState("submitting");
    setAuthError("");
    setFeedback("");

    let supabase;
    try {
      supabase = getSupabase();
    } catch (error) {
      setSubmitState("error");
      setFeedback(error instanceof Error ? error.message : "Supabase client is not configured.");
      return;
    }

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
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.28),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.22),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] px-5 py-8 text-slate-900 sm:px-8 sm:py-10">
      <div className="mx-auto grid min-h-[86vh] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr,0.9fr]">
        <section className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800 shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-sky-500 to-amber-400" />
            AssistantX Workspace
          </div>
          <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-tight tracking-tight text-slate-900">
            Build faster with
            <span className="block bg-gradient-to-r from-sky-700 via-cyan-600 to-amber-500 bg-clip-text text-transparent">AssistantX Cloud</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700">
            Resume your sessions, memory, and tools with one login. Designed for focused work with a clean, reliable auth flow.
          </p>

          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-sky-200/70 bg-white/85 px-5 py-4 shadow-sm backdrop-blur">
              <div className="text-sm font-semibold text-slate-900">Persistent sessions</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Workspace state and chat history are tied to your account, not only one browser tab.</p>
            </div>
            <div className="rounded-2xl border border-amber-200/70 bg-white/85 px-5 py-4 shadow-sm backdrop-blur">
              <div className="text-sm font-semibold text-slate-900">Secure login flow</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Use OAuth or a one-time magic link. No local password management needed.</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-sky-200/60 bg-white/92 p-6 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.45)] backdrop-blur sm:p-8">
          <div className="mb-6">
            <div className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-sky-700">
              Sign in
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Access AssistantX</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Choose a provider or get a secure link in your inbox.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleOAuth("google")}
              disabled={oauthLoading !== null || submitState === "submitting"}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {oauthLoading === "google" ? "Redirecting to Google..." : "Continue with Google"}
            </button>
            <button
              type="button"
              onClick={() => void handleOAuth("github")}
              disabled={oauthLoading !== null || submitState === "submitting"}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-amber-300 hover:bg-amber-50/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {oauthLoading === "github" ? "Redirecting to GitHub..." : "Continue with GitHub"}
            </button>
          </div>

          {oauthLoading && (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs leading-5 text-slate-700">
              <div>
                Back from {getProviderLabel(oauthLoading)} without finishing sign-in? Reset this attempt and choose another method.
              </div>
              <button
                type="button"
                onClick={() => recoverFromInterruptedOAuth(oauthLoading)}
                className="mt-3 rounded-lg border border-sky-300 px-3 py-2 font-medium text-sky-800 transition hover:bg-white"
              >
                Use another sign-in method
              </button>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
            <span>or email</span>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
          </div>

          <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Email address</span>
              <input
                type="email"
                id="login-email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <button
              type="submit"
              disabled={submitState === "submitting" || oauthLoading !== null}
              className="w-full rounded-xl bg-gradient-to-r from-sky-700 to-cyan-600 px-4 py-3 text-sm font-semibold text-white transition hover:from-sky-800 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitState === "submitting" ? "Sending link..." : "Send magic link"}
            </button>
          </form>

          <div className={`mt-4 min-h-6 text-sm ${submitState === "error" || authError ? "text-rose-600" : "text-cyan-700"}`}>
            {feedback || authError}
          </div>

          <p className="mt-6 text-xs leading-6 text-slate-500">
            By continuing, you agree to the{" "}
            <Link href="/terms" className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-900">
              Terms of Service
            </Link>
            {" "}and acknowledge the{" "}
            <Link href="/privacy" className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-900">
              Privacy Policy
            </Link>
            .
          </p>

          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-slate-900">
              Terms of Service
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}