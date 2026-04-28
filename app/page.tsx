"use client";
import { useEffect, useCallback, useState } from "react";
import { AppNavigationColumn, type AppNavigationTab } from "./components/AppNavigationColumn";
import { ChatTab } from "./components/tabs/ChatTab";
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

function TabContent({ activeTab }: { activeTab: AppNavigationTab }) {
  const { state } = useWorkspace();

  switch (activeTab) {
    case "chat":
      return <ChatTab />;
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
      return <SettingsTab dark={state.dark} />;
    case "notifications":
      return <NotificationsTab dark={state.dark} />;
    case "ai-learning":
      return <AILearningTab dark={state.dark} />;
    case "jarvis":
      return <JarvisTab />;
    default:
      return null;
  }
}

function HomeContent() {
    useEffect(() => {
      console.log("SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
      console.log("SUPABASE_ANON_KEY:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    }, []);
  const { state } = useWorkspace();
  const [activeAppTab, setActiveAppTab] = useState<AppNavigationTab>("chat");

  const handleSelectAppTab = useCallback((tab: AppNavigationTab) => {
    setActiveAppTab(tab);
  }, []);

  const bg = state.dark
    ? "bg-slate-950 text-slate-100"
    : "bg-gradient-to-br from-blue-50 via-white to-purple-50 text-slate-900";
  const cardBg = state.dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white/95 border-slate-200 shadow-sm shadow-slate-200/70";
  const isChatTab = activeAppTab === "chat";

  return (
    <>
      <div className={`min-h-screen transition-colors duration-300 ${bg}`}>
        <div className="mx-auto flex min-h-screen max-w-[1680px] gap-3 px-3 py-3">
          <AppNavigationColumn dark={state.dark} activeTab={activeAppTab} onSelectTab={handleSelectAppTab} />

          {isChatTab ? (
            <TabContent key={activeAppTab} activeTab={activeAppTab} />
          ) : (
            <main className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border transition-all duration-200 ${cardBg}`}>
              <TabContent key={activeAppTab} activeTab={activeAppTab} />
            </main>
          )}
        </div>
      </div>
    </>
  );
}

export default function Home() {
  return (
    <WorkspaceProvider>
      <HomeContent />
    </WorkspaceProvider>
  );
}
