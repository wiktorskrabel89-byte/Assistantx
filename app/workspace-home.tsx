"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { type AppNavigationTab } from "./components/AppNavigationColumn";
import { ChatTab } from "./components/tabs/ChatTab";
import { PendingApprovalBanner } from "./components/PendingApprovalBanner";
import { WorkspaceProvider, useWorkspace } from "./providers/WorkspaceProvider";
import { useNotifications } from "./hooks/useNotifications";
import { usePendingApprovals } from "./hooks/usePendingApprovals";
import { isEditableElementTarget } from "./lib/keyboard";
import { createClient } from "@/lib/client";
import type { Mode } from "./lib/chat-types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MeridianActivityPanel,
  MeridianDevTools,
  MeridianLanguageWizard,
  MeridianRail,
  MeridianSettingsShell,
  MeridianTopBar,
  MeridianWorkspaceShell,
  type MeridianHwStatus,
  type MeridianTab,
} from "./components/meridian";

const GUEST_TOUR_TRIGGER_KEY = "assistantx.guest-tour";
const GUEST_TOUR_DONE_KEY = "assistantx.guest-tour-done";
const GUEST_ANALYSIS_PROMPT = [
  "Use GPT OSS 120B in strict coding mode.",
  "Analyze my repository context and suggest the next high-impact code improvements.",
  "Focus on architecture risks, missing integrations, and the safest next implementation steps.",
].join(" ");

function TabSkeleton() {
  return <Skeleton className="h-full w-full rounded-[inherit]" />;
}

function WorkspaceLoadingScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] px-6 dark:bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.2),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(135deg,#020617,#0f172a_46%,#082f49)]">
      <section className="w-full max-w-md rounded-3xl border border-sky-200/70 bg-white/90 p-8 text-center shadow-[0_24px_80px_-28px_rgba(14,116,144,0.25)] backdrop-blur dark:border-sky-900/70 dark:bg-slate-950/70">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-300/70 bg-sky-50 text-sky-700 dark:border-sky-700/60 dark:bg-slate-900 dark:text-sky-200">
          <span className="text-lg font-semibold">AX</span>
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">AssistantX</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Przygotowuję Twoją przestrzeń roboczą…</p>
        <div className="mt-5 inline-flex items-center gap-1.5">
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_infinite] rounded-full bg-blue-500" />
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_0.2s_infinite] rounded-full bg-cyan-500" />
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_0.4s_infinite] rounded-full bg-violet-500" />
        </div>
      </section>
    </main>
  );
}

// Only SettingsTab survives as a direct dynamic import — it's rendered as
// the "Ogólne" legacy content inside MeridianSettingsShell. The other legacy
// tabs (Sandbox / Codebase / Projects / Learning / WebsiteCreator / Marketplace /
// AILearning / Clinical / Jarvis / Notifications) are isolated per spec — code
// stays on disk, no longer mounted from the shell. They'll be migrated into
// Workspace sub-sections (Step 7 continuation) or dropped if Phase-2-only.
const SettingsTab = dynamic(
  () => import("./components/tabs/SettingsTab").then((m) => m.SettingsTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);

/**
 * Folds the legacy 14-value AppNavigationTab union to the 3 Meridian tabs so
 * existing callers (guest tour, open-in-sandbox, navigate-tab event) keep
 * working while the migration to the new shell completes. Mapping:
 *   chat / notifications / jarvis    → "chat"
 *   settings                          → "settings"
 *   everything else (codebase, sandbox, projects, learning, …) → "workspace"
 */
function bridgeToMeridian(legacy: AppNavigationTab): MeridianTab {
  if (legacy === "chat" || legacy === "notifications" || legacy === "jarvis") return "chat";
  if (legacy === "settings") return "settings";
  return "workspace";
}

function HomeContent() {
  const { setAppMode, userEmail, authReady, loaded } = useWorkspace();
  const [, setActiveAppTabRaw] = useState<AppNavigationTab>("chat");
  const [meridianTab, setMeridianTab] = useState<MeridianTab>("chat");
  // Wrap the legacy setter so anything still pointing at the 14-value tab
  // system also moves the Meridian shell to the right top-level tab.
  const setActiveAppTab = useCallback((tab: AppNavigationTab) => {
    setActiveAppTabRaw(tab);
    setMeridianTab(bridgeToMeridian(tab));
  }, []);
  const notificationsHook = useNotifications();
  const approvalsHook = usePendingApprovals();
  const adminCheckedRef = useRef(false);
  const [pendingComposerSeed, setPendingComposerSeed] = useState<{ text: string; mode: Mode } | null>(null);
  const [guestTourOpen, setGuestTourOpen] = useState(false);
  const [guestTourStep, setGuestTourStep] = useState(1);

  // Admin check still runs (side-effect: future role-gated UI). The boolean
  // result isn't currently rendered — the old AppNavigationColumn consumed
  // it; new Settings sections will re-consume it in Step 8 continuation.
  useEffect(() => {
    if (adminCheckedRef.current) return;
    adminCheckedRef.current = true;
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return;
      return fetch("/api/admin/check", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then((res) => res.ok ? res.json() : null);
    }).catch(() => null);
  }, []);

  // Meridian shortcuts: Ctrl/Cmd+1/2/3 → Czat / Workspace / Ustawienia.
  // Ctrl/Cmd+, also jumps to Ustawienia (familiar macOS convention).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (isEditableElementTarget(event.target)) return;
      if (event.key === "," || event.key === "<") {
        event.preventDefault();
        setMeridianTab("settings");
        return;
      }
      if (event.shiftKey) {
        switch (event.key) {
          case "1": event.preventDefault(); setMeridianTab("chat"); break;
          case "2": event.preventDefault(); setMeridianTab("workspace"); break;
          case "3": event.preventDefault(); setMeridianTab("settings"); break;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleNavigateTab = (event: Event) => {
      const customEvent = event as CustomEvent<{ tab?: AppNavigationTab }>;
      const nextTab = customEvent.detail?.tab;
      if (!nextTab) return;
      setActiveAppTab(nextTab);
    };
    window.addEventListener("assistantx:navigate-tab", handleNavigateTab as EventListener);
    return () => {
      window.removeEventListener("assistantx:navigate-tab", handleNavigateTab as EventListener);
    };
  }, [setActiveAppTab]);

  useEffect(() => {
    if (!loaded || !authReady || typeof window === "undefined") return;
    if (userEmail) {
      const frameId = window.requestAnimationFrame(() => setGuestTourOpen(false));
      return () => window.cancelAnimationFrame(frameId);
    }
    let frameId: number | null = null;
    try {
      const shouldOpenTour = window.sessionStorage.getItem(GUEST_TOUR_TRIGGER_KEY) === "1";
      const alreadyDone = window.localStorage.getItem(GUEST_TOUR_DONE_KEY) === "1";
      if (shouldOpenTour) {
        window.sessionStorage.removeItem(GUEST_TOUR_TRIGGER_KEY);
      }
      if (shouldOpenTour && !alreadyDone) {
        frameId = window.requestAnimationFrame(() => {
          setGuestTourStep(1);
          setGuestTourOpen(true);
        });
      }
    } catch {
      // ignore storage failures
    }
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [authReady, loaded, userEmail]);

  const closeGuestTour = useCallback((markDone = true) => {
    setGuestTourOpen(false);
    if (!markDone || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(GUEST_TOUR_DONE_KEY, "1");
    } catch {
      // ignore storage failures
    }
  }, []);

  const queueComposerSeed = useCallback((text: string, mode: Mode) => {
    setPendingComposerSeed({ text, mode });
  }, []);

  const openCodeAnalysisPrompt = useCallback(() => {
    setAppMode("ai-chat");
    setActiveAppTab("chat");
    queueComposerSeed(GUEST_ANALYSIS_PROMPT, "code");
  }, [queueComposerSeed, setAppMode, setActiveAppTab]);

  const goToTourStep = useCallback((step: number) => {
    setGuestTourStep(step);
    if (step === 1) {
      setAppMode("ai-chat");
      setActiveAppTab("chat");
      window.dispatchEvent(new CustomEvent("assistantx:open-apps-panel"));
      return;
    }
    if (step === 2) {
      setAppMode("ai-code");
      setActiveAppTab("codebase");
      return;
    }
    if (step === 3) {
      openCodeAnalysisPrompt();
    }
  }, [openCodeAnalysisPrompt, setAppMode, setActiveAppTab]);

  if (!loaded) {
    return <WorkspaceLoadingScreen />;
  }

  // Hardware status pill — populated by the Capability Awareness Engine in
  // a follow-on milestone. For now we surface a static "idle" connection;
  // the pill is real (not a placeholder) — it just reflects no telemetry yet.
  const hwStatus: MeridianHwStatus = { connection: "idle" };

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden"
      style={{ background: "var(--ox-bg)", color: "var(--ox-text-hi)" }}
    >
      <MeridianTopBar activeTab={meridianTab} onTabChange={setMeridianTab} hwStatus={hwStatus} />
      <div className="flex flex-1 overflow-hidden">
        <MeridianRail
          activeTab={meridianTab}
          activeItemId={null}
          onItemChange={() => {
            /* Rail items map onto in-pane sub-sections in Steps 7/8 — no-op for now. */
          }}
        />

        {/* Three persistent panes — display:none toggle so chat state survives  */}
        {/* tab switches (per layout-tab-switch-chat acceptance test).            */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <PendingApprovalBanner approvalsHook={approvalsHook} />

          {/* Czat pane */}
          <section
            id="meridian-panel-chat"
            role="tabpanel"
            aria-labelledby="meridian-tab-chat"
            hidden={meridianTab !== "chat"}
            style={{
              display: meridianTab === "chat" ? "flex" : "none",
              flex: 1,
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <ChatTab
              externalComposerSeed={pendingComposerSeed}
              onConsumeExternalComposerSeed={() => setPendingComposerSeed(null)}
              highlightGitHubCard={guestTourOpen && guestTourStep === 1}
            />
          </section>

          {/* Workspace pane */}
          <section
            id="meridian-panel-workspace"
            role="tabpanel"
            aria-labelledby="meridian-tab-workspace"
            hidden={meridianTab !== "workspace"}
            style={{
              display: meridianTab === "workspace" ? "flex" : "none",
              flex: 1,
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <MeridianWorkspaceShell />
          </section>

          {/* Ustawienia pane */}
          <section
            id="meridian-panel-settings"
            role="tabpanel"
            aria-labelledby="meridian-tab-settings"
            hidden={meridianTab !== "settings"}
            style={{
              display: meridianTab === "settings" ? "flex" : "none",
              flex: 1,
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <MeridianSettingsShell legacyGeneralContent={<SettingsTab />} />
          </section>
        </main>

        {meridianTab === "chat" ? <MeridianActivityPanel /> : null}
      </div>

      {/* Floating dev-tools overlay — wired via the localStorage hook, so the  */}
      {/* Settings → Zaawansowane toggle (and Ctrl+Shift+D) both reach it.     */}
      <MeridianDevTools />

      {/* First-run language wizard — self-gates on hasChosen, so it's a no-op */}
      {/* on every launch except the first (and any time the user re-opens it */}
      {/* via Settings → Ogólne → "Otwórz kreator języka").                    */}
      <MeridianLanguageWizard />

      {guestTourOpen ? (
        <>
          <button
            type="button"
            aria-label="Close guided tour"
            className="fixed inset-0 z-[70] bg-black/50"
            onClick={() => setGuestTourOpen(false)}
          />
          <section className="fixed left-1/2 top-1/2 z-[80] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-card p-6 shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Guided Tour · Step {guestTourStep}/3</div>
            {guestTourStep === 1 ? (
              <>
                <h2 className="mt-2 text-xl font-semibold">Connect GitHub</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Open the Apps panel and connect GitHub. The GitHub card is highlighted so you can unlock repo browsing and coding workflows right away.
                </p>
                <button
                  type="button"
                  onClick={() => goToTourStep(1)}
                  className="mt-4 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  Open Apps panel
                </button>
              </>
            ) : null}
            {guestTourStep === 2 ? (
              <>
                <h2 className="mt-2 text-xl font-semibold">Open Codebase</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Switch to AI Code mode and open the highlighted Codebase tab to browse files and prepare a repository-wide task.
                </p>
                <button
                  type="button"
                  onClick={() => goToTourStep(2)}
                  className="mt-4 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  Open Codebase
                </button>
              </>
            ) : null}
            {guestTourStep === 3 ? (
              <>
                <h2 className="mt-2 text-xl font-semibold">Analyze code with 120B</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  I can prefill the chat composer with a 120B code-analysis prompt so you can start from a strong repository review workflow.
                </p>
                <button
                  type="button"
                  onClick={() => openCodeAnalysisPrompt()}
                  className="mt-4 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  Prefill code-analysis prompt
                </button>
              </>
            ) : null}
            <div className="mt-6 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => closeGuestTour(true)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Skip tour
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={guestTourStep === 1}
                  onClick={() => goToTourStep(Math.max(1, guestTourStep - 1))}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-accent"
                >
                  Back
                </button>
                <button
                  type="button"
                   onClick={() => {
                     if (guestTourStep >= 3) {
                      closeGuestTour(true);
                      return;
                     }
                     goToTourStep(guestTourStep + 1);
                  }}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {guestTourStep >= 3 ? "Finish" : "Next"}
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function WorkspaceHome() {
  return (
    <WorkspaceProvider>
      <HomeContent />
    </WorkspaceProvider>
  );
}
