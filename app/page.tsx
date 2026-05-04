"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppNavigationColumn, type AppNavigationTab } from "./components/AppNavigationColumn";
import { ChatTab } from "./components/tabs/ChatTab";
import { ClinicalTab } from "./components/tabs/ClinicalTab";
import {
  AILearningTab,
  CodebaseTab,
  KnowledgeExportTab,
  LearningTab,
  NotificationsTab,
  ProjectsTab,
  PromptLibraryTab,
  SandboxTab,
  ScriptsTab,
  SettingsTab,
} from "./components/tabs";
import JarvisTab from "./components/tabs/JarvisTab";
import { WorkspaceProvider, useWorkspace } from "./providers/WorkspaceProvider";
import { useNotifications } from "./hooks/useNotifications";
import { createClient } from "@/lib/client";
import type { AppMode } from "./lib/chat-types";

// Tabs that are only available in AI Code mode (resets to "chat" if mode switches)
const AI_CODE_ONLY_TABS: AppNavigationTab[] = [
  "sandbox", "codebase", "scripts", "projects", "prompt-library",
  "learning", "ai-learning", "jarvis", "clinical", "knowledge-export",
];

function TabContent({
  activeTab,
  notificationsHook,
}: {
  activeTab: AppNavigationTab;
  notificationsHook: ReturnType<typeof useNotifications>;
}) {
  const { state } = useWorkspace();

  switch (activeTab) {
    case "chat":
      return <ChatTab />;
    case "clinical":
      return <ClinicalTab />;
    case "sandbox":
      return <SandboxTab dark={state.dark} />;
    case "learning":
      return <LearningTab dark={state.dark} />;
    case "projects":
      return <ProjectsTab dark={state.dark} />;
    case "codebase":
      return <CodebaseTab dark={state.dark} />;
    case "scripts":
      return <ScriptsTab dark={state.dark} />;
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

  // Guard: if mode switches to AI Chat and current tab is code-only, reset to "chat"
  useEffect(() => {
    if (appMode === "ai-chat" && AI_CODE_ONLY_TABS.includes(activeAppTab)) {
      setActiveAppTab("chat");
    }
  }, [appMode, activeAppTab]);

  const handleSelectAppTab = useCallback((tab: AppNavigationTab) => {
    setActiveAppTab(tab);
    if (tab === "notifications" && notificationsHook.unreadCount > 0) {
      void notificationsHook.markAllRead();
    }
  }, [notificationsHook]);

  const bg = state.dark
    ? "bg-slate-950 text-slate-100"
    : "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.15),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] text-slate-900";
  const cardBg = state.dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white/92 border-sky-200/60 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.28)]";
  const isChatTab = activeAppTab === "chat";

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bg}`}>
        <div className="mx-auto flex min-h-screen max-w-[1680px] gap-3 px-3 py-3">
          <AppNavigationColumn
            dark={state.dark}
            activeTab={activeAppTab}
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
            <TabContent key={activeAppTab} activeTab={activeAppTab} notificationsHook={notificationsHook} />
          ) : (
            <main className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border transition-all duration-200 ${cardBg}`}>
              <TabContent key={activeAppTab} activeTab={activeAppTab} notificationsHook={notificationsHook} />
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
