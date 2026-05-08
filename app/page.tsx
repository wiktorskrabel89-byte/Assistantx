"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AppNavigationColumn, type AppNavigationTab } from "./components/AppNavigationColumn";
import { ChatTab } from "./components/tabs/ChatTab";
import { WorkspaceProvider, useWorkspace } from "./providers/WorkspaceProvider";
import { useNotifications } from "./hooks/useNotifications";
import { createClient } from "@/lib/client";
import type { AppMode } from "./lib/chat-types";

// Shared skeleton shown while a tab's JS chunk is loading
function TabSkeleton() {
  return <div className="flex h-full w-full animate-pulse rounded-[inherit] bg-slate-200/60 dark:bg-slate-800/60" />;
}

// Non-initial tabs are code-split so they don't inflate the first-load bundle.
// ChatTab is kept as a static import because it is the default visible tab.
const ClinicalTab = dynamic(
  () => import("./components/tabs/ClinicalTab").then((m) => m.ClinicalTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const MemoryTab = dynamic(
  () => import("./components/tabs/MemoryTab").then((m) => m.MemoryTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const KnowledgeTab = dynamic(
  () => import("./components/tabs/KnowledgeTab").then((m) => m.KnowledgeTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const WebResearchTab = dynamic(
  () => import("./components/tabs/WebResearchTab").then((m) => m.WebResearchTab),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const ImageStudioTab = dynamic(
  () => import("./components/tabs/ImageStudioTab").then((m) => m.ImageStudioTab),
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
// JarvisTab uses a default export, so no .then(m => m.X) destructuring is needed.
const JarvisTab = dynamic(
  () => import("./components/tabs/JarvisTab"),
  { ssr: false, loading: () => <TabSkeleton /> },
);

// Tabs that are only available in AI Code mode (resets to "chat" if mode switches)
const AI_CODE_ONLY_TABS: AppNavigationTab[] = [
  "sandbox", "codebase", "projects",
];

function TabContent({
  activeTab,
  notificationsHook,
  sandboxInitCode,
  onOpenInSandbox,
}: {
  activeTab: AppNavigationTab;
  notificationsHook: ReturnType<typeof useNotifications>;
  sandboxInitCode?: { html: string; css: string; js: string } | null;
  onOpenInSandbox?: (html: string, css: string, js: string) => void;
}) {
  const { state } = useWorkspace();

  switch (activeTab) {
    case "chat":
      return <ChatTab />;
    case "clinical":
      return <ClinicalTab />;
    case "memory":
      return <MemoryTab dark={state.dark} />;
    case "knowledge":
      return <KnowledgeTab dark={state.dark} />;
    case "research":
      return <WebResearchTab dark={state.dark} />;
    case "image-studio":
      return <ImageStudioTab dark={state.dark} />;
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
      return <AILearningTab />;
    case "jarvis":
      return <JarvisTab />;
    default:
      return null;
  }
}

function HomeContent() {
  const { state, setAppMode, setPinnedAddOns, userEmail } = useWorkspace();
  const [activeAppTab, setActiveAppTab] = useState<AppNavigationTab>("chat");
  const notificationsHook = useNotifications();
  const [isAdmin, setIsAdmin] = useState(false);
  const adminCheckedRef = useRef(false);
  const [sandboxInitCode, setSandboxInitCode] = useState<{ html: string; css: string; js: string } | null>(null);

  const appMode: AppMode = state.appMode ?? "ai-chat";
  const pinnedAddOns: string[] = state.pinnedAddOns ?? [];

  // Check admin status once on mount
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

  // Guard: if mode switches to AI Chat and current tab is code-only, show "chat" instead.
  // Use derived state to avoid calling setState synchronously inside an effect.
  const visibleTab: AppNavigationTab =
    appMode === "ai-chat" && AI_CODE_ONLY_TABS.includes(activeAppTab) ? "chat" : activeAppTab;

  const handleSelectAppTab = useCallback((tab: AppNavigationTab) => {
    setActiveAppTab(tab);
    if (tab === "notifications" && notificationsHook.unreadCount > 0) {
      void notificationsHook.markAllRead();
    }
  }, [notificationsHook]);

  const handleOpenInSandbox = useCallback((html: string, css: string, js: string) => {
    setSandboxInitCode({ html, css, js });
    setAppMode("ai-code");
    setActiveAppTab("sandbox");
  }, [setAppMode]);

  const bg = state.dark
    ? "bg-slate-950 text-slate-100"
    : "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.15),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] text-slate-900";
  const cardBg = state.dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white/92 border-sky-200/60 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.28)]";
  const isChatTab = visibleTab === "chat";

  return (
    <div className={`h-dvh overflow-hidden transition-colors duration-300 ${bg}`}>
        <div className="mx-auto flex h-full max-w-[1680px] gap-3 px-3 py-3">
          <AppNavigationColumn
            dark={state.dark}
            activeTab={visibleTab}
            onSelectTab={handleSelectAppTab}
            notificationUnread={notificationsHook.unreadCount}
            appMode={appMode}
            onSetAppMode={setAppMode}
            pinnedAddOns={pinnedAddOns}
            onSetPinnedAddOns={setPinnedAddOns}
            userEmail={userEmail}
            isAdmin={isAdmin}
          />

          {isChatTab ? (
            <TabContent key={visibleTab} activeTab={visibleTab} notificationsHook={notificationsHook} sandboxInitCode={sandboxInitCode} onOpenInSandbox={handleOpenInSandbox} />
          ) : (
            <main className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border transition-all duration-200 ${cardBg}`}>
              <TabContent key={visibleTab} activeTab={visibleTab} notificationsHook={notificationsHook} sandboxInitCode={sandboxInitCode} onOpenInSandbox={handleOpenInSandbox} />
            </main>
          )}
        </div>
    </div>
  );
}

export default function Home() {
  return (
    <WorkspaceProvider>
      <HomeContent />
    </WorkspaceProvider>
  );
}
