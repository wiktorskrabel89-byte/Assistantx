"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AppNavigationColumn, type AppNavigationTab } from "./components/AppNavigationColumn";
import { PairingCodeBanner } from "./components/PairingCodeBanner";
import { PCPairingDialog } from "./components/PCPairingDialog";
import { PairingStatusIndicator } from "./components/PairingStatusIndicator";
import { ChatTab } from "./components/tabs/ChatTab";
import { useDevicePairing } from "./hooks/useDevicePairing";
import { WorkspaceProvider, useWorkspace } from "./providers/WorkspaceProvider";
import { useNotifications } from "./hooks/useNotifications";
import { createClient } from "@/lib/client";
import { DEVICE_PAIRING_SKIP_KEY } from "@/lib/device-pairing";
import type { AppMode } from "./lib/chat-types";
import { Skeleton } from "@/components/ui/skeleton";

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

const AI_CODE_ONLY_TABS: AppNavigationTab[] = [
  "sandbox", "codebase", "projects",
];

function TabContent({
  activeTab,
  notificationsHook,
  sandboxInitCode,
  onOpenInSandbox,
  pairing,
  onOpenPairingDialog,
  onShowPhonePairingBanner,
}: {
  activeTab: AppNavigationTab;
  notificationsHook: ReturnType<typeof useNotifications>;
  sandboxInitCode?: { html: string; css: string; js: string } | null;
  onOpenInSandbox?: (html: string, css: string, js: string) => void;
  pairing: ReturnType<typeof useDevicePairing>;
  onOpenPairingDialog: () => void;
  onShowPhonePairingBanner: () => void;
}) {
  const { state } = useWorkspace();

  switch (activeTab) {
    case "chat":
      return <ChatTab />;
    case "clinical":
      return <ClinicalTab />;
    case "sandbox":
      return <SandboxTab dark={state.dark} initialCode={sandboxInitCode ?? undefined} />;
    case "learning":
      return <LearningTab dark={state.dark} />;
    case "projects":
      return <ProjectsTab dark={state.dark} />;
    case "codebase":
      return <CodebaseTab dark={state.dark} />;
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
    case "jarvis":
      return (
        <JarvisTab
          deviceType={pairing.deviceType}
          pairingStatus={pairing.pairingStatus}
          pairingCode={pairing.pairingCode}
          expiresAt={pairing.expiresAt}
          onOpenPairingDialog={onOpenPairingDialog}
          onShowPhonePairingBanner={onShowPhonePairingBanner}
        />
      );
    default:
      return null;
  }
}

function HomeContent() {
  const { state, setAppMode, setPinnedAddOns, userEmail, loaded } = useWorkspace();
  const [activeAppTab, setActiveAppTab] = useState<AppNavigationTab>("chat");
  const notificationsHook = useNotifications();
  const [isAdmin, setIsAdmin] = useState(false);
  const adminCheckedRef = useRef(false);
  const [sandboxInitCode, setSandboxInitCode] = useState<{ html: string; css: string; js: string } | null>(null);
  const pairing = useDevicePairing();
  const [pcPairingDialogOpen, setPcPairingDialogOpen] = useState(false);
  const [phoneBannerVisible, setPhoneBannerVisible] = useState(false);

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
  // , → Settings, . → Notifications.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || !event.shiftKey) return;
      // Don't fire when the user is typing in an input or editable area.
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || event.target.contentEditable === "true" || event.target.contentEditable === "plaintext-only") return;
      }
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
        case ",":
          event.preventDefault();
          handleSelectAppTab("settings");
          break;
        case ".":
          event.preventDefault();
          handleSelectAppTab("notifications");
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

  const handleOpenInSandbox = useCallback((html: string, css: string, js: string) => {
    setSandboxInitCode({ html, css, js });
    setAppMode("ai-code");
    setActiveAppTab("sandbox");
  }, [setAppMode]);

  const openPairingExperience = useCallback(() => {
    if (pairing.deviceType === "phone") {
      setPhoneBannerVisible(true);
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DEVICE_PAIRING_SKIP_KEY);
    }
    pairing.clearPairingError();
    setPcPairingDialogOpen(true);
  }, [pairing]);

  const handleSkipPairing = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEVICE_PAIRING_SKIP_KEY, "1");
    }
    setPcPairingDialogOpen(false);
  }, []);

  useEffect(() => {
    if (pairing.deviceType === "phone" && (pairing.pairingStatus === "pending" || pairing.pairingStatus === "paired")) {
      const timeoutId = window.setTimeout(() => {
        setPhoneBannerVisible(true);
      }, 0);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [pairing.deviceType, pairing.pairingStatus]);

  useEffect(() => {
    if (pairing.deviceType !== "pc" || !pairing.ready) return;
    if (pairing.pairingStatus === "paired") {
      const timeoutId = window.setTimeout(() => {
        window.localStorage.removeItem(DEVICE_PAIRING_SKIP_KEY);
        setPcPairingDialogOpen(false);
      }, 0);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }
    if (typeof window !== "undefined" && window.localStorage.getItem(DEVICE_PAIRING_SKIP_KEY) === "1") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setPcPairingDialogOpen(true);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pairing.deviceType, pairing.pairingStatus, pairing.ready]);

  const isChatTab = visibleTab === "chat";

  if (!loaded) {
    return <WorkspaceLoadingScreen />;
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-background text-foreground transition-colors duration-300">
      {pairing.deviceType === "phone" && phoneBannerVisible && (pairing.pairingStatus === "pending" || pairing.pairingStatus === "paired") && (
        <PairingCodeBanner
          status={pairing.pairingStatus}
          pairingCode={pairing.pairingCode}
          expiresAt={pairing.expiresAt}
          isRefreshing={pairing.isRefreshing}
          showDesktopInstallWarning={pairing.pairingStatus !== "paired"}
          onRefresh={pairing.refreshPairingCode}
          onClose={() => setPhoneBannerVisible(false)}
        />
      )}

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
          desktopAccessory={(
            <PairingStatusIndicator
              status={pairing.pairingStatus}
              deviceType={pairing.deviceType}
              onClick={openPairingExperience}
            />
          )}
          mobileAccessory={(
            <PairingStatusIndicator
              status={pairing.pairingStatus}
              deviceType={pairing.deviceType}
              onClick={openPairingExperience}
            />
          )}
        />

        {isChatTab ? (
          <TabContent
            key={visibleTab}
            activeTab={visibleTab}
            notificationsHook={notificationsHook}
            sandboxInitCode={sandboxInitCode}
            onOpenInSandbox={handleOpenInSandbox}
            pairing={pairing}
            onOpenPairingDialog={() => setPcPairingDialogOpen(true)}
            onShowPhonePairingBanner={() => setPhoneBannerVisible(true)}
          />
        ) : (
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-200">
            <TabContent
              key={visibleTab}
              activeTab={visibleTab}
              notificationsHook={notificationsHook}
              sandboxInitCode={sandboxInitCode}
              onOpenInSandbox={handleOpenInSandbox}
              pairing={pairing}
              onOpenPairingDialog={() => setPcPairingDialogOpen(true)}
              onShowPhonePairingBanner={() => setPhoneBannerVisible(true)}
            />
          </main>
        )}
      </div>

      <PCPairingDialog
        open={pairing.deviceType === "pc" && pcPairingDialogOpen}
        pairingStatus={pairing.pairingStatus}
        errorMessage={pairing.errorMessage}
        isConfirming={pairing.isConfirming}
        onOpenChange={setPcPairingDialogOpen}
        onConfirm={pairing.confirmPairing}
        onSkip={handleSkipPairing}
      />
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
