"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AppNavigationColumn, type AppNavigationTab } from "./components/AppNavigationColumn";
import { ChatTab } from "./components/tabs/ChatTab";
import { PendingApprovalBanner } from "./components/PendingApprovalBanner";
import { WorkspaceProvider, useWorkspace } from "./providers/WorkspaceProvider";
import { useNotifications } from "./hooks/useNotifications";
import { usePendingApprovals } from "./hooks/usePendingApprovals";
import { isEditableElementTarget } from "./lib/keyboard";
import { createClient } from "@/lib/client";
import type { AppMode, Mode } from "./lib/chat-types";
import { Skeleton } from "@/components/ui/skeleton";

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

const ClinicalTab = dynamic(
  () => import("./components/tabs/ClinicalTab").then((m) => m.ClinicalTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const SandboxTab = dynamic(
  () => import("./components/tabs/SandboxTab").then((m) => m.SandboxTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const LearningTab = dynamic(
  () => import("./components/tabs/LearningTab").then((m) => m.LearningTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const ProjectsTab = dynamic(
  () => import("./components/tabs/ProjectsTab").then((m) => m.ProjectsTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const CodebaseTab = dynamic(
  () => import("./components/tabs/CodebaseTab").then((m) => m.CodebaseTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const WebsiteCreatorTab = dynamic(
  () => import("./components/tabs/WebsiteCreatorTab").then((m) => m.WebsiteCreatorTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const PromptLibraryTab = dynamic(
  () => import("./components/tabs/PromptLibraryTab").then((m) => m.PromptLibraryTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const KnowledgeExportTab = dynamic(
  () => import("./components/tabs/KnowledgeExportTab").then((m) => m.KnowledgeExportTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const SettingsTab = dynamic(
  () => import("./components/tabs/SettingsTab").then((m) => m.SettingsTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const NotificationsTab = dynamic(
  () => import("./components/tabs/NotificationsTab").then((m) => m.NotificationsTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const AILearningTab = dynamic(
  () => import("./components/tabs/AILearningTab").then((m) => m.AILearningTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const JarvisTab = dynamic(
  () => import("./components/tabs/JarvisTab"),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const MarketplaceTab = dynamic(
  () => import("./components/tabs/MarketplaceTab").then((m) => m.MarketplaceTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);

const AI_CODE_ONLY_TABS: AppNavigationTab[] = [
  "sandbox", "codebase", "projects",
];

function TabContent({
  activeTab,
  notificationsHook,
  sandboxInitCode,
  onOpenInSandbox,
  onAskAboutFile,
  externalComposerSeed,
  onConsumeComposerSeed,
  highlightGitHubCard,
  highlightCodebase,
}: {
  activeTab: AppNavigationTab;
  notificationsHook: ReturnType<typeof useNotifications>;
  sandboxInitCode?: { html: string; css: string; js: string } | null;
  onOpenInSandbox?: (html: string, css: string, js: string) => void;
  onAskAboutFile?: (prompt: string) => void;
  externalComposerSeed?: { text: string; mode: Mode } | null;
  onConsumeComposerSeed?: () => void;
  highlightGitHubCard?: boolean;
  highlightCodebase?: boolean;
}) {
  const { state } = useWorkspace();

  switch (activeTab) {
    case "chat":
      return (
        <ChatTab
          externalComposerSeed={externalComposerSeed}
          onConsumeExternalComposerSeed={onConsumeComposerSeed}
          highlightGitHubCard={highlightGitHubCard}
        />
      );
    case "jarvis":
      return <JarvisTab />;
    case "clinical":
      return <ClinicalTab />;
    case "sandbox":
      return <SandboxTab dark={state.dark} initialCode={sandboxInitCode ?? undefined} />;
    case "learning":
      return <LearningTab dark={state.dark} />;
    case "projects":
      return <ProjectsTab dark={state.dark} />;
    case "codebase":
      return (
        <CodebaseTab
          dark={state.dark}
          onAskAboutFile={onAskAboutFile}
          highlightTour={highlightCodebase}
        />
      );
    case "website-creator":
      return <WebsiteCreatorTab dark={state.dark} onOpenInSandbox={onOpenInSandbox} />;
    case "prompt-library":
      return <PromptLibraryTab dark={state.dark} />;
    case "knowledge-export":
      return <KnowledgeExportTab dark={state.dark} />;
    case "settings":
      return <SettingsTab />;
    case "notifications":
      return <NotificationsTab dark={state.dark} notificationsHook={notificationsHook} />;
    case "ai-learning":
      return <AILearningTab dark={state.dark} />;
    case "marketplace":
      return <MarketplaceTab dark={state.dark} />;
    default:
      return null;
  }
}

function HomeContent() {
  const { state, setAppMode, setPinnedAddOns, userEmail, authReady, loaded } = useWorkspace();
  const [activeAppTab, setActiveAppTab] = useState<AppNavigationTab>("chat");
  const notificationsHook = useNotifications();
  const approvalsHook = usePendingApprovals();
  const [isAdmin, setIsAdmin] = useState(false);
  const adminCheckedRef = useRef(false);
  const [sandboxInitCode, setSandboxInitCode] = useState<{ html: string; css: string; js: string } | null>(null);
  const [pendingComposerSeed, setPendingComposerSeed] = useState<{ text: string; mode: Mode } | null>(null);
  const [guestTourOpen, setGuestTourOpen] = useState(false);
  const [guestTourStep, setGuestTourStep] = useState(1);

  const appMode: AppMode = state.appMode ?? "ai-chat";
  const pinnedAddOns: string[] = state.pinnedAddOns ?? [];

  useEffect(() => {
    if (adminCheckedRef.current) return;
    adminCheckedRef.current = true;
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return;
      return fetch("/api/admin/check", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then((res) => res.ok ? res.json() : null);
    }).then((data: { isAdmin?: boolean } | null | undefined) => {
      if (data?.isAdmin) setIsAdmin(true);
    }).catch(() => null);
  }, []);

  const visibleTab: AppNavigationTab =
    appMode === "ai-chat" && AI_CODE_ONLY_TABS.includes(activeAppTab) ? "chat" : activeAppTab;

  const handleSelectAppTab = useCallback((tab: AppNavigationTab) => {
    setActiveAppTab(tab);
    if (tab === "notifications" && notificationsHook.unreadCount > 0) {
      void notificationsHook.markAllRead();
    }
  }, [notificationsHook]);

  // Global keyboard shortcuts for workspace tab navigation.
  // Ctrl/Cmd+Shift+1 → Chat, 2-4 → AI Code tabs (ai-code mode only),
  // Ctrl/Cmd+, → Settings, Ctrl/Cmd+. → Notifications.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      // Don't fire when the user is typing in an input or editable area.
      if (isEditableElementTarget(event.target)) return;
      if (event.key === "," || event.key === "<") {
        event.preventDefault();
        handleSelectAppTab("settings");
        return;
      }
      if (event.key === "." || event.key === ">") {
        event.preventDefault();
        handleSelectAppTab("notifications");
        return;
      }
      if (!event.shiftKey) return;
      switch (event.key) {
        case "1":
          event.preventDefault();
          handleSelectAppTab("chat");
          break;
        case "2":
          if (appMode === "ai-code") {
            event.preventDefault();
            handleSelectAppTab("sandbox");
          }
          break;
        case "3":
          if (appMode === "ai-code") {
            event.preventDefault();
            handleSelectAppTab("projects");
          }
          break;
        case "4":
          if (appMode === "ai-code") {
            event.preventDefault();
            handleSelectAppTab("codebase");
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appMode, handleSelectAppTab]);

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
  }, []);

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

  const handleOpenInSandbox = useCallback((html: string, css: string, js: string) => {
    setSandboxInitCode({ html, css, js });
    setAppMode("ai-code");
    setActiveAppTab("sandbox");
  }, [setAppMode]);

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
  }, [queueComposerSeed, setAppMode]);

  const isChatTab = visibleTab === "chat";

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
  }, [openCodeAnalysisPrompt, setAppMode]);

  if (!loaded) {
    return <WorkspaceLoadingScreen />;
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-background text-foreground transition-colors duration-300">
      <div className="mx-auto flex h-full max-w-[1680px] gap-3 px-3 py-3">
        <AppNavigationColumn
          activeTab={visibleTab}
          onSelectTab={handleSelectAppTab}
          notificationUnread={notificationsHook.unreadCount}
          appMode={appMode}
          onSetAppMode={setAppMode}
          pinnedAddOns={pinnedAddOns}
          onSetPinnedAddOns={setPinnedAddOns}
          userEmail={userEmail}
          isAdmin={isAdmin}
          highlightCodebase={guestTourOpen && guestTourStep === 2}
        />

        {isChatTab ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <PendingApprovalBanner approvalsHook={approvalsHook} />
            <div className="min-h-0 flex-1 overflow-hidden">
              <TabContent
                key={visibleTab}
                activeTab={visibleTab}
                notificationsHook={notificationsHook}
                sandboxInitCode={sandboxInitCode}
                onOpenInSandbox={handleOpenInSandbox}
                externalComposerSeed={pendingComposerSeed}
                onConsumeComposerSeed={() => setPendingComposerSeed(null)}
                highlightGitHubCard={guestTourOpen && guestTourStep === 1}
              />
            </div>
          </div>
        ) : (
          <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <PendingApprovalBanner approvalsHook={approvalsHook} />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-200">
            <TabContent
              key={visibleTab}
              activeTab={visibleTab}
              notificationsHook={notificationsHook}
              sandboxInitCode={sandboxInitCode}
              onOpenInSandbox={handleOpenInSandbox}
              onAskAboutFile={(prompt) => {
                setAppMode("ai-chat");
                setActiveAppTab("chat");
                queueComposerSeed(prompt, "code");
              }}
              externalComposerSeed={pendingComposerSeed}
              onConsumeComposerSeed={() => setPendingComposerSeed(null)}
              highlightGitHubCard={guestTourOpen && guestTourStep === 1}
              highlightCodebase={guestTourOpen && guestTourStep === 2}
            />
            </div>
          </main>
        )}
      </div>
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
