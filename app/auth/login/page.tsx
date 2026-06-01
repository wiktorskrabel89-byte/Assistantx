"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { PublicLanguageSelector } from "@/app/components/PublicLanguageSelector";
import {
  detectLanguageFromAcceptLanguage,
  normalizePublicLanguage,
  type PublicUILanguage,
  UI_LANGUAGE_COOKIE_NAME,
} from "@/app/lib/ui-language";
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
type AuthTab = "login" | "register";

const LOGIN_COPY: Record<PublicUILanguage, Record<string, string>> = {
  en: {
    workspaceChip: "AssistantX Workspace",
    buildFaster: "Build faster with",
    cloudTitle: "AssistantX Cloud",
    heroSubtitle: "Resume your sessions, memory, and tools with one login. Designed for focused work with a clean, reliable auth flow.",
    persistentSessions: "Persistent sessions",
    persistentSessionsDesc: "Workspace state and chat history are tied to your account, not only one browser tab.",
    secureFlow: "Secure login flow",
    secureFlowDesc: "Sign in with your email and password or use a social provider.",
    signInTab: "Sign In",
    createAccountTab: "Create Account",
    welcomeBack: "Welcome back",
    joinAssistantX: "Join AssistantX",
    signInSub: "Sign in with a social provider or your email and password.",
    createSub: "Create your account with a social provider or an email and password.",
    continueAsGuest: "Continue as Guest",
    entering: "Entering…",
    orSignIn: "or sign in",
    orEmail: "or email",
    continueWithGoogle: "Continue with Google",
    continueWithGitHub: "Continue with GitHub",
    pricing: "Pricing",
    roadmap: "Roadmap",
    socialProof: "Trusted stack: Supabase • GitHub • Google • OpenRouter • Next.js • FastAPI",
    trustSignals: "Acrux.pl Sp. z o.o., ul. Sobczaka 1, Poznań. NIP: 7792506166.",
    plansHeadline: "Transparent pricing before login",
    plansBody: "Free plan available, plus Pro and Pro+ with premium model access.",
    openPricing: "Open pricing",
    openRoadmap: "Open roadmap",
  },
  pl: {
    workspaceChip: "AssistantX Workspace",
    buildFaster: "Twórz szybciej z",
    cloudTitle: "AssistantX Cloud",
    heroSubtitle: "Wznów sesje, pamięć i narzędzia po jednym logowaniu. Zaprojektowane pod skupioną pracę i stabilny auth flow.",
    persistentSessions: "Trwałe sesje",
    persistentSessionsDesc: "Stan workspace i historia czatu są przypięte do konta, nie tylko do jednej karty przeglądarki.",
    secureFlow: "Bezpieczne logowanie",
    secureFlowDesc: "Zaloguj się emailem i hasłem albo przez dostawcę społecznościowego.",
    signInTab: "Zaloguj się",
    createAccountTab: "Utwórz konto",
    welcomeBack: "Witaj ponownie",
    joinAssistantX: "Dołącz do AssistantX",
    signInSub: "Zaloguj się przez dostawcę lub email i hasło.",
    createSub: "Utwórz konto przez dostawcę lub email i hasło.",
    continueAsGuest: "Kontynuuj jako gość",
    entering: "Wchodzę…",
    orSignIn: "lub zaloguj się",
    orEmail: "lub email",
    continueWithGoogle: "Kontynuuj z Google",
    continueWithGitHub: "Kontynuuj z GitHub",
    pricing: "Cennik",
    roadmap: "Roadmapa",
    socialProof: "Zaufany stack: Supabase • GitHub • Google • OpenRouter • Next.js • FastAPI",
    trustSignals: "Acrux.pl Sp. z o.o., ul. Sobczaka 1, Poznań. NIP: 7792506166.",
    plansHeadline: "Przejrzysty cennik przed logowaniem",
    plansBody: "Dostępny plan Free oraz Pro i Pro+ z modelami premium.",
    openPricing: "Zobacz cennik",
    openRoadmap: "Zobacz roadmapę",
  },
};

function sanitizeRedirectPath(value: string | null | undefined) {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function sanitizeDesktopRedirect(value: string | null | undefined) {
  const redirectTo = String(value ?? "").trim();
  try {
    const url = new URL(redirectTo);
    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
    return url.protocol === "assistantx:" && url.hostname === "auth" && normalizedPath === "/callback"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

export default function LoginPage() {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const [redirectContext] = useState(() => {
    if (typeof window === "undefined") {
      return { client: "", next: "/", state: "", redirectTo: "" };
    }

    const params = new URLSearchParams(window.location.search);
    const desktopState = params.get("desktop_state");
    return {
      client: params.get("client") ?? "",
      next: sanitizeRedirectPath(params.get("next")),
      state: desktopState ?? params.get("state") ?? "",
      redirectTo: sanitizeDesktopRedirect(params.get("redirect_to")),
    };
  });
  const isDesktopLoginFlow = redirectContext.client === "jarvis-desktop" && Boolean(redirectContext.redirectTo);
  const [initialLocationError] = useState(() => {
    if (typeof window === "undefined") return "";
    return readOAuthErrorFromLocation(getPendingOAuthProvider());
  });

  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>(initialLocationError ? "error" : "idle");
  const [feedback, setFeedback] = useState(initialLocationError);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);
  const [authError, setAuthError] = useState(initialLocationError);
  const [uiLanguage] = useState<PublicUILanguage>(() => {
    if (typeof window === "undefined") return "en";
    const cookieLang = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${UI_LANGUAGE_COOKIE_NAME}=`))
      ?.split("=")[1];
    if (cookieLang) return normalizePublicLanguage(cookieLang);
    return detectLanguageFromAcceptLanguage(window.navigator.language);
  });

  const t = LOGIN_COPY[uiLanguage];

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

  function switchTab(newTab: AuthTab) {
    setTab(newTab);
    setSubmitState("idle");
    setFeedback("");
    setAuthError("");
    setPassword("");
    setConfirmPassword("");
    setAcceptedPolicy(false);
  }

  function buildAuthCallbackUrl() {
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (isDesktopLoginFlow) redirectTo.searchParams.set("client", "jarvis-desktop");
    const safeRedirectPath = sanitizeRedirectPath(redirectContext.next);
    if (safeRedirectPath !== "/") redirectTo.searchParams.set("next", safeRedirectPath);
    if (isDesktopLoginFlow && redirectContext.state) redirectTo.searchParams.set("desktop_state", redirectContext.state);
    if (isDesktopLoginFlow && redirectContext.redirectTo) redirectTo.searchParams.set("redirect_to", redirectContext.redirectTo);
    return redirectTo.toString();
  }

  function handoffJarvisDesktopSession(session: {
    access_token?: string | null;
    refresh_token?: string | null;
    user?: { email?: string | null; id?: string | null } | null;
  }) {
    const accessToken = session.access_token;
    if (!accessToken) return false;

    const callbackUrl = redirectContext.redirectTo
      ? new URL(redirectContext.redirectTo)
      : new URL("/jarvis/callback", window.location.origin);
    const queryParams = new URLSearchParams({
      access_token: accessToken,
      refresh_token: session.refresh_token ?? "",
      token_type: "bearer",
      email: session.user?.email ?? "",
      user_id: session.user?.id ?? "",
      signed_in_at: new Date().toISOString(),
    });
    if (redirectContext.state) {
      queryParams.set("desktop_state", redirectContext.state);
      queryParams.set("state", redirectContext.state);
    }
    callbackUrl.search = queryParams.toString();
    console.log("[desktop-auth] launching desktop callback");
    console.log("[desktop-auth] redirect target:", callbackUrl.toString());
    window.location.href = callbackUrl.toString();
    return true;
  }

  async function handleGuest() {
    setGuestLoading(true);
    setSubmitState("idle");
    setAuthError("");
    setFeedback("");

    let supabase;
    try {
      supabase = getSupabase();
    } catch (error) {
      setGuestLoading(false);
      setSubmitState("error");
      setFeedback(error instanceof Error ? error.message : "Supabase client is not configured.");
      return;
    }

    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setGuestLoading(false);
        setSubmitState("error");
        setFeedback(error.message);
        return;
      }
    } catch (error) {
      setGuestLoading(false);
      setSubmitState("error");
      setFeedback(error instanceof Error ? error.message : "Guest sign-in failed. Please try again.");
      return;
    }

    try {
      window.sessionStorage.setItem("assistantx.guest-tour", "1");
    } catch {
      // ignore
    }
    window.location.href = sanitizeRedirectPath(redirectContext.next);
  }

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

    const redirectTo = buildAuthCallbackUrl();
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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setSubmitState("error");
      setFeedback("Enter your email and password.");
      return;
    }

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

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setSubmitState("error");
        setFeedback(error.message);
        return;
      }

      if (
        isDesktopLoginFlow
        && handoffJarvisDesktopSession({
          access_token: data.session?.access_token ?? null,
          refresh_token: data.session?.refresh_token ?? null,
          user: data.user
            ? {
              email: data.user.email ?? null,
              id: data.user.id ?? null,
            }
            : null,
        })
      ) {
        return;
      }
    } catch (error) {
      setSubmitState("error");
      setFeedback(error instanceof Error ? error.message : "Sign-in failed. Please try again.");
      return;
    }

    setSubmitState("success");
    setFeedback("Signed in successfully. Redirecting…");
    window.location.href = sanitizeRedirectPath(redirectContext.next);
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setSubmitState("error");
      setFeedback("Enter your email and a password.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitState("error");
      setFeedback("Passwords do not match.");
      return;
    }

    if (!acceptedPolicy) {
      setSubmitState("error");
      setFeedback("You must accept the Terms of Service and Privacy Policy to create an account.");
      document.getElementById("accept-policy")?.focus();
      return;
    }

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

    const redirectTo = buildAuthCallbackUrl();
    try {
      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        setSubmitState("error");
        setFeedback(error.message);
        return;
      }
    } catch (error) {
      setSubmitState("error");
      setFeedback(error instanceof Error ? error.message : "Registration failed. Please try again.");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setSubmitState("success");
    setFeedback("Account created! Check your inbox to confirm your email address.");
  }

  const isBusy = submitState === "submitting" || oauthLoading !== null || guestLoading;

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto grid min-h-[86vh] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr,0.9fr]">
        <section className="hidden lg:block">
          <div className="mb-4 flex items-center gap-2">
            <PublicLanguageSelector initialLanguage={uiLanguage} />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/70">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/40" />
            {t.workspaceChip}
          </div>
          <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-tight tracking-tight text-foreground">
            {t.buildFaster}
            <span className="block text-foreground/80">{t.cloudTitle}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            {t.heroSubtitle}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">{t.socialProof}</p>

          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="text-sm font-semibold text-foreground">{t.persistentSessions}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.persistentSessionsDesc}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="text-sm font-semibold text-foreground">{t.secureFlow}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.secureFlowDesc}</p>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-border bg-card px-5 py-4">
            <div className="text-sm font-semibold text-foreground">{t.plansHeadline}</div>
            <p className="mt-1 text-sm text-muted-foreground">{t.plansBody}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/pricing" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent">
                {t.openPricing}
              </Link>
              <Link href="/roadmap" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent">
                {t.openRoadmap}
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <PublicLanguageSelector initialLanguage={uiLanguage} />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Link href="/pricing" className="hover:text-foreground">{t.pricing}</Link>
              <Link href="/roadmap" className="hover:text-foreground">{t.roadmap}</Link>
            </div>
          </div>
          {/* Tab switcher */}
          <div role="tablist" aria-label="Authentication options" className="mb-6 flex rounded-xl border border-border bg-muted p-1">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "login"}
              aria-controls="panel-login"
              id="tab-login"
              onClick={() => switchTab("login")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                tab === "login"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.signInTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "register"}
              aria-controls="panel-register"
              id="tab-register"
              onClick={() => switchTab("register")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                tab === "register"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.createAccountTab}
            </button>
          </div>

          <h2 className="mb-1 text-2xl font-semibold tracking-tight text-foreground">
            {tab === "login" ? t.welcomeBack : t.joinAssistantX}
          </h2>
          <p className="mb-5 text-sm leading-6 text-muted-foreground">
            {tab === "login"
              ? t.signInSub
              : t.createSub}
          </p>

          {/* Guest access */}
          <button
            type="button"
            onClick={() => void handleGuest()}
            disabled={isBusy}
            className="mb-4 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guestLoading ? t.entering : t.continueAsGuest}
          </button>

          <div className="mb-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>{t.orSignIn}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* OAuth buttons */}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleOAuth("google")}
              disabled={isBusy}
              className="flex items-center justify-center gap-2.5 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {oauthLoading === "google" ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Redirecting…
                </span>
              ) : (
                <>
                  <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {t.continueWithGoogle}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleOAuth("github")}
              disabled={isBusy}
              className="flex items-center justify-center gap-2.5 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {oauthLoading === "github" ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Redirecting…
                </span>
              ) : (
                <>
                  <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                  {t.continueWithGitHub}
                </>
              )}
            </button>
          </div>

          {oauthLoading && (
            <div className="mt-4 rounded-xl border border-border bg-muted px-4 py-3 text-xs leading-5 text-foreground">
              <div>
                Back from {getProviderLabel(oauthLoading)} without finishing sign-in? Reset this attempt and choose another method.
              </div>
              <button
                type="button"
                onClick={() => recoverFromInterruptedOAuth(oauthLoading)}
                className="mt-3 rounded-lg border border-border px-3 py-2 font-medium text-foreground transition hover:bg-accent"
              >
                Use another sign-in method
              </button>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
              <span>{t.orEmail}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* Login form */}
          {tab === "login" && (
            <form id="panel-login" role="tabpanel" aria-labelledby="tab-login" onSubmit={(event) => void handleLogin(event)} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Email address</span>
                <input
                  type="email"
                  id="login-email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-input focus:ring-2 focus:ring-ring/20"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Password</span>
                <input
                  type="password"
                  id="login-password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-input focus:ring-2 focus:ring-ring/20"
                />
              </label>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitState === "submitting" ? "Signing in…" : "Sign In"}
              </button>
            </form>
          )}

          {/* Register form */}
          {tab === "register" && (
            <form id="panel-register" role="tabpanel" aria-labelledby="tab-register" onSubmit={(event) => void handleRegister(event)} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Email address</span>
                <input
                  type="email"
                  id="register-email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-input focus:ring-2 focus:ring-ring/20"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Password</span>
                <input
                  type="password"
                  id="register-password"
                  name="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-input focus:ring-2 focus:ring-ring/20"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Confirm password</span>
                <input
                  type="password"
                  id="register-confirm-password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-input focus:ring-2 focus:ring-ring/20"
                />
              </label>

              {/* Privacy policy & terms acceptance */}
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  id="accept-policy"
                  required
                  aria-required="true"
                  checked={acceptedPolicy}
                  onChange={(event) => setAcceptedPolicy(event.target.checked)}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer rounded border-border text-primary focus:ring-ring"
                />
                <span className="text-sm leading-6 text-muted-foreground">
                  I agree to the{" "}
                  <Link href="/terms" className="font-medium text-foreground underline decoration-border underline-offset-4 hover:text-foreground/80">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="font-medium text-foreground underline decoration-border underline-offset-4 hover:text-foreground/80">
                    Privacy Policy
                  </Link>
                  . <span aria-label="required" className="text-rose-500">*</span>
                </span>
              </label>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitState === "submitting" ? "Creating account…" : "Create Account"}
              </button>
            </form>
          )}

          <div className={`mt-4 min-h-6 text-sm ${submitState === "error" || authError ? "text-rose-600" : "text-emerald-600"}`}>
            {feedback || authError}
          </div>

          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
            <Link href="/pricing" className="hover:text-foreground">
              {t.pricing}
            </Link>
            <Link href="/roadmap" className="hover:text-foreground">
              {t.roadmap}
            </Link>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">{t.trustSignals}</div>
        </section>
      </div>
    </main>
  );
}
