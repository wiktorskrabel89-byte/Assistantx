"use client";

import { Code2, MessageSquareText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildChatSessionItems,
  BUILT_IN_AGENTS,
  createChat,
  createDefaultState,
  createId,
  createMessage,
  createWorkspace,
  extractArtifacts,
  NEW_CHAT_TITLE,
  sanitizeForStorage,
  STORAGE_KEY,
  upgradeState,
} from "../lib/chat-state";
import type {
  ActionMode,
  ActionStep,
  ChatEntry,
  ChatThread,
  CustomAgent,
  JarvisMode,
  Mode,
  SharePayload,
  StoredState,
  StyleMode,
  Workspace,
} from "../lib/chat-types";
import {
  AUTO_PREFERRED_CHAT_MODEL,
  AUTO_PREFERRED_CODING_MODEL,
  FREE_CHAT_MODEL,
  FREE_CODING_MODEL,
  type UserPlan,
} from "@/lib/ai-config";

export function useWorkspaceState() {
  const [state, setState] = useState<StoredState>(createDefaultState());
  const [mode, setMode] = useState<Mode>(BUILT_IN_AGENTS[0].preferredMode);
  const [chatSearch, setChatSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const stateRef = useRef(state);

  const activeWorkspace = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0],
    [state]
  );

  const activeChat = useMemo(
    () => activeWorkspace.chats.find((chat) => chat.id === activeWorkspace.activeChatId) ?? activeWorkspace.chats[0],
    [activeWorkspace]
  );

  const artifacts = useMemo(() => extractArtifacts(activeChat.messages), [activeChat.messages]);
  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) return activeWorkspace.chats;

    return activeWorkspace.chats.filter((chat) => {
      const latest = chat.messages[chat.messages.length - 1];
      const tagStr = (chat.tags ?? []).join(" ");
      const haystack = `${chat.title} ${tagStr} ${latest?.user ?? ""} ${latest?.ai ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activeWorkspace.chats, chatSearch]);

  const sessionItems = useMemo(
    () => buildChatSessionItems(filteredChats, activeChat.id),
    [activeChat.id, filteredChats]
  );

  const activeCustomAgent = useMemo(
    () => activeWorkspace.settings.customAgents.find((agent) => agent.id === activeWorkspace.settings.activeAgentId) ?? null,
    [activeWorkspace.settings.activeAgentId, activeWorkspace.settings.customAgents]
  );
  const activeBuiltInAgent = useMemo(
    () => BUILT_IN_AGENTS.find((agent) => agent.id === activeWorkspace.settings.activeAgentId) ?? BUILT_IN_AGENTS[0],
    [activeWorkspace.settings.activeAgentId]
  );
  const assistantName = activeCustomAgent?.name ?? activeBuiltInAgent.name;
  const assistantDescription = activeCustomAgent?.description ?? activeBuiltInAgent.description;
  const activeAgentId = activeCustomAgent?.id ?? activeBuiltInAgent.id;
  const assistantIcon = activeCustomAgent
    ? (activeCustomAgent.preferredMode === "chat" ? MessageSquareText : Code2)
    : activeBuiltInAgent.icon;
  const auxiliaryMode = mode === "search" || mode === "image" || mode === "upload" ? mode : "auto";

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const browserWindow = window;
    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function loadState() {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = upgradeState(JSON.parse(raw) as StoredState);
          if (!cancelled && parsed) {
            setState(parsed);
            setLoaded(true);
            return;
          }
        } catch {
          // Ignore invalid local data and fall back to legacy history import.
        }
      }

      if (!cancelled) setLoaded(true);

      const importLegacyHistory = async () => {
        if (cancelled) return;
        if (stateRef.current.workspaces.some((workspace) => workspace.chats.some((chat) => chat.messages.length > 0))) {
          return;
        }

        try {
          const response = await fetch("/api/history");
          const data = await response.json();
          if (!cancelled && Array.isArray(data.messages) && data.messages.length > 0) {
            const nextState = createDefaultState();
            nextState.workspaces[0].chats[0].title = "Imported chat";
            nextState.workspaces[0].chats[0].messages = data.messages.map((item: { user_message: string; ai_message: string; model: string; image_url?: string }) => createMessage({
              user: item.user_message,
              ai: item.ai_message,
              model: item.model,
              imageUrl: item.image_url ?? undefined,
            }));
            setState(nextState);
          }
        } catch {
          // Ignore missing history and keep the local default workspace.
        }
      };

      if ("requestIdleCallback" in browserWindow) {
        idleId = browserWindow.requestIdleCallback(() => {
          void importLegacyHistory();
        }, { timeout: 2000 });
      } else {
        timeoutId = globalThis.setTimeout(() => {
          void importLegacyHistory();
        }, 800);
      }
    }

    void loadState();
    return () => {
      cancelled = true;
      if (idleId !== null && "cancelIdleCallback" in browserWindow) browserWindow.cancelIdleCallback(idleId);
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    const browserWindow = window;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const persistState = () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeForStorage(state)));
    };

    if ("requestIdleCallback" in browserWindow) {
      idleId = browserWindow.requestIdleCallback(persistState, { timeout: 1200 });
    } else {
      timeoutId = globalThis.setTimeout(persistState, 250);
    }

    return () => {
      if (idleId !== null && "cancelIdleCallback" in browserWindow) browserWindow.cancelIdleCallback(idleId);
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    };
  }, [loaded, state]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.dark);
  }, [state.dark]);

  const updateWorkspace = useCallback((workspaceId: string, updater: (workspace: Workspace) => Workspace) => {
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((workspace) => (
        workspace.id === workspaceId ? { ...updater(workspace), updatedAt: Date.now() } : workspace
      )),
    }));
  }, []);

  const updateChat = useCallback((workspaceId: string, chatId: string, updater: (chat: ChatThread) => ChatThread) => {
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace;
        return {
          ...workspace,
          updatedAt: Date.now(),
          chats: workspace.chats.map((chat) => (
            chat.id === chatId ? { ...updater(chat), updatedAt: Date.now() } : chat
          )),
        };
      }),
    }));
  }, []);

  const updateLastMessage = useCallback((workspaceId: string, chatId: string, updater: (message: ChatEntry) => ChatEntry) => {
    updateChat(workspaceId, chatId, (chat) => {
      if (chat.messages.length === 0) return chat;
      const messages = [...chat.messages];
      messages[messages.length - 1] = updater(messages[messages.length - 1]);
      return { ...chat, messages };
    });
  }, [updateChat]);

  const setWorkspaceMode = useCallback((nextMode: Mode) => {
    setMode((currentMode) => currentMode === nextMode ? currentMode : nextMode);

    if (activeWorkspace.settings.lastMode === nextMode) return;

    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        lastMode: nextMode,
      },
    }));
  }, [activeWorkspace.id, activeWorkspace.settings.lastMode, updateWorkspace]);

  const setActiveWorkspaceId = useCallback((workspaceId: string) => {
    const nextWorkspace = stateRef.current.workspaces.find((workspace) => workspace.id === workspaceId);
    if (nextWorkspace && mode !== nextWorkspace.settings.lastMode) {
      setMode(nextWorkspace.settings.lastMode);
    }
    setState((prev) => ({ ...prev, activeWorkspaceId: workspaceId }));
  }, [mode]);

  const setActiveChatId = useCallback((workspaceId: string, chatId: string) => {
    updateWorkspace(workspaceId, (workspace) => ({ ...workspace, activeChatId: chatId }));
  }, [updateWorkspace]);

  const createWorkspaceAction = useCallback(() => {
    const name = window.prompt("Workspace name", `Workspace ${state.workspaces.length + 1}`)?.trim();
    if (!name) return;
    const workspace = createWorkspace(name);
    setState((prev) => ({
      ...prev,
      workspaces: [workspace, ...prev.workspaces],
      activeWorkspaceId: workspace.id,
    }));
  }, [state.workspaces.length]);

  const renameWorkspace = useCallback((workspaceId: string) => {
    const current = state.workspaces.find((workspace) => workspace.id === workspaceId);
    const name = window.prompt("Rename workspace", current?.name ?? "")?.trim();
    if (!name) return;
    updateWorkspace(workspaceId, (workspace) => ({ ...workspace, name }));
  }, [state.workspaces, updateWorkspace]);

  const deleteWorkspace = useCallback((workspaceId: string) => {
    if (!window.confirm("Delete this workspace and all its chats?")) return;
    setState((prev) => {
      const workspaces = prev.workspaces.filter((workspace) => workspace.id !== workspaceId);
      if (workspaces.length === 0) {
        const fallback = createWorkspace();
        return { ...prev, workspaces: [fallback], activeWorkspaceId: fallback.id };
      }
      const activeWorkspaceId = prev.activeWorkspaceId === workspaceId ? workspaces[0].id : prev.activeWorkspaceId;
      return { ...prev, workspaces, activeWorkspaceId };
    });
  }, []);

  const createChatAction = useCallback(() => {
    const chat = createChat();
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      chats: [chat, ...workspace.chats],
      activeChatId: chat.id,
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const renameChat = useCallback((chatId: string) => {
    const current = activeWorkspace.chats.find((chat) => chat.id === chatId);
    const title = window.prompt("Rename chat", current?.title ?? "")?.trim();
    if (!title) return;
    updateChat(activeWorkspace.id, chatId, (chat) => ({ ...chat, title }));
  }, [activeWorkspace.chats, activeWorkspace.id, updateChat]);

  const setChatTags = useCallback((chatId: string, tags: string[]) => {
    updateChat(activeWorkspace.id, chatId, (chat) => ({ ...chat, tags }));
  }, [activeWorkspace.id, updateChat]);

  const deleteChat = useCallback((chatId: string) => {
    if (!window.confirm("Delete this chat?")) return;
    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((workspace) => {
        if (workspace.id !== prev.activeWorkspaceId) return workspace;
        const chats = workspace.chats.filter((chat) => chat.id !== chatId);
        if (chats.length === 0) {
          const fallbackChat = createChat();
          return {
            ...workspace,
            chats: [fallbackChat],
            activeChatId: fallbackChat.id,
            updatedAt: Date.now(),
          };
        }
        return {
          ...workspace,
          chats,
          activeChatId: workspace.activeChatId === chatId ? chats[0].id : workspace.activeChatId,
          updatedAt: Date.now(),
        };
      }),
    }));
  }, []);

  const clearActiveChat = useCallback(() => {
    if (!window.confirm("Clear all messages in the active chat?")) return;
    updateChat(activeWorkspace.id, activeChat.id, (chat) => ({ ...chat, title: NEW_CHAT_TITLE, messages: [] }));
  }, [activeChat.id, activeWorkspace.id, updateChat]);

  const setStyleMode = useCallback((styleMode: StyleMode) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, styleMode },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setLanguageLock = useCallback((languageLock: string) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, languageLock },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setPreferredModelId = useCallback((preferredModelId: string | null) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, preferredModelId },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setCostMode = useCallback((costMode: import("@/lib/ai-config").CostMode) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, costMode },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setUserPlan = useCallback((userPlan: UserPlan) => {
    setState((prev) => ({ ...prev, userPlan }));
  }, []);

  const setDark = useCallback((dark: boolean) => {
    setState((prev) => ({ ...prev, dark }));
  }, []);

  const setUiLanguage = useCallback((uiLanguage: string) => {
    setState((prev) => ({ ...prev, uiLanguage }));
  }, []);

  const incrementPremiumRequests = useCallback(() => {
    setState((prev) => ({ ...prev, premiumRequestsUsed: prev.premiumRequestsUsed + 1 }));
  }, []);

  const setAppMode = useCallback((appMode: import("../lib/chat-types").AppMode) => {
    // Capture workspace snapshot before the async setState to avoid any race.
    const snap = stateRef.current;
    const ws = snap.workspaces.find((w) => w.id === snap.activeWorkspaceId) ?? snap.workspaces[0];
    const isFreePlan = snap.userPlan === "free";
    let targetModelId: string;
    if (appMode === "ai-chat") {
      targetModelId = isFreePlan ? FREE_CHAT_MODEL : AUTO_PREFERRED_CHAT_MODEL;
    } else {
      targetModelId = isFreePlan ? FREE_CODING_MODEL : AUTO_PREFERRED_CODING_MODEL;
    }
    const targetModelProfile = appMode === "ai-chat" ? "gpt-oss-chat" : "gpt-oss-code";
    const targetTemperature = appMode === "ai-chat" ? 0.6 : 0.1;
    setState((prev) => ({ ...prev, appMode }));
    // Auto-switch built-in agent to match mode (only when no custom agent is currently active)
    const isCustomAgent = ws.settings.customAgents.some((a) => a.id === ws.settings.activeAgentId);
    const targetId = appMode === "ai-chat" ? "builtin-chat" : "builtin-code";
    updateWorkspace(ws.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        activeAgentId: isCustomAgent ? workspace.settings.activeAgentId : targetId,
        preferredModelId: targetModelId,
        modelProfile: targetModelProfile,
        temperature: targetTemperature,
      },
    }));
    if (!isCustomAgent) {
      const builtIn = BUILT_IN_AGENTS.find((a) => a.id === targetId);
      if (builtIn) setWorkspaceMode(builtIn.preferredMode);
    }
  }, [stateRef, updateWorkspace, setWorkspaceMode]);

  const setPinnedAddOns = useCallback((pinnedAddOns: string[]) => {
    setState((prev) => ({ ...prev, pinnedAddOns }));
  }, []);

  const setMemoryEnabled = useCallback((memoryEnabled: boolean) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, memoryEnabled },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setMemoryNotes = useCallback((memoryNotes: string) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, memoryNotes },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setSystemPrompt = useCallback((systemPrompt: string) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, systemPrompt },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setEnabledTools = useCallback((enabledTools: string[]) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, enabledTools },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setWakeWordEnabled = useCallback((wakeWordEnabled: boolean) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, wakeWordEnabled },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setWakeWordPhrase = useCallback((wakeWordPhrase: string) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, wakeWordPhrase },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setSttEnabled = useCallback((sttEnabled: boolean) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, sttEnabled },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setTtsEnabled = useCallback((ttsEnabled: boolean) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, ttsEnabled },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setVoiceLanguage = useCallback((voiceLanguage: string) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, voiceLanguage },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setTtsVoiceId = useCallback((ttsVoiceId: string) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, ttsVoiceId },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setAutoSpeakResponses = useCallback((autoSpeakResponses: boolean) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, autoSpeakResponses },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const setPersonalityMode = useCallback((personalityMode: import("@/lib/ai-config").PersonalityMode) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, personalityMode },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const clearMemoryNotes = useCallback(() => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, memoryNotes: "" },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const createPromptTemplate = useCallback((template: { label: string; text: string; mode: string }) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        promptTemplates: [
          {
            id: createId(),
            label: template.label,
            text: template.text,
            mode: template.mode as Mode,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          ...workspace.settings.promptTemplates,
        ],
      },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const updatePromptTemplate = useCallback((templateId: string, template: { label: string; text: string; mode: string }) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        promptTemplates: workspace.settings.promptTemplates.map((item) => (
          item.id === templateId
            ? {
                ...item,
                label: template.label,
                text: template.text,
                mode: template.mode as Mode,
                updatedAt: Date.now(),
              }
            : item
        )),
      },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const deletePromptTemplate = useCallback((templateId: string) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        promptTemplates: workspace.settings.promptTemplates.filter((item) => item.id !== templateId),
      },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const createCustomAgent = useCallback((agent: { name: string; description: string; instructions: string; preferredMode: string }) => {
    const createdAt = Date.now();
    const nextAgent: CustomAgent = {
      id: createId(),
      name: agent.name,
      description: agent.description,
      instructions: agent.instructions,
      preferredMode: agent.preferredMode as Mode,
      createdAt,
      updatedAt: createdAt,
    };

    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        activeAgentId: nextAgent.id,
        customAgents: [nextAgent, ...workspace.settings.customAgents],
      },
    }));
    setWorkspaceMode(nextAgent.preferredMode);
  }, [activeWorkspace.id, setWorkspaceMode, updateWorkspace]);

  const updateCustomAgent = useCallback((agentId: string, agent: { name: string; description: string; instructions: string; preferredMode: string }) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        customAgents: workspace.settings.customAgents.map((item) => (
          item.id === agentId
            ? {
                ...item,
                name: agent.name,
                description: agent.description,
                instructions: agent.instructions,
                preferredMode: agent.preferredMode as Mode,
                updatedAt: Date.now(),
              }
            : item
        )),
      },
    }));

    if (activeWorkspace.settings.activeAgentId === agentId) {
      setWorkspaceMode(agent.preferredMode as Mode);
    }
  }, [activeWorkspace.id, activeWorkspace.settings.activeAgentId, setWorkspaceMode, updateWorkspace]);

  const deleteCustomAgent = useCallback((agentId: string) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        activeAgentId: workspace.settings.activeAgentId === agentId ? BUILT_IN_AGENTS[0].id : workspace.settings.activeAgentId,
        customAgents: workspace.settings.customAgents.filter((item) => item.id !== agentId),
      },
    }));

    if (activeWorkspace.settings.activeAgentId === agentId) {
      setWorkspaceMode(BUILT_IN_AGENTS[0].preferredMode);
    }
  }, [activeWorkspace.id, activeWorkspace.settings.activeAgentId, setWorkspaceMode, updateWorkspace]);

  const selectActiveAgent = useCallback((nextAgentId: string) => {
    const builtInAgent = BUILT_IN_AGENTS.find((agent) => agent.id === nextAgentId);
    const customAgent = activeWorkspace.settings.customAgents.find((agent) => agent.id === nextAgentId);

    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, activeAgentId: nextAgentId },
    }));

    if (builtInAgent) {
      setWorkspaceMode(builtInAgent.preferredMode);
    } else if (customAgent) {
      setWorkspaceMode(customAgent.preferredMode);
    }
  }, [activeWorkspace.id, activeWorkspace.settings.customAgents, setWorkspaceMode, updateWorkspace]);

  const importSharedChat = useCallback((payload: SharePayload) => {
    const importedChat: ChatThread = {
      ...createChat(payload.title || "Shared chat"),
      title: payload.title || "Shared chat",
      messages: payload.messages.map((item) => createMessage(item)),
    };

    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((workspace) => (
        workspace.id !== prev.activeWorkspaceId
          ? workspace
          : {
              ...workspace,
              chats: [importedChat, ...workspace.chats],
              activeChatId: importedChat.id,
              updatedAt: Date.now(),
            }
      )),
    }));
  }, []);

  const createActionMode = useCallback((mode: { name: string; icon: string; description: string; steps: ActionStep[] }) => {
    const now = Date.now();
    const newMode: ActionMode = {
      id: createId(),
      name: mode.name,
      icon: mode.icon,
      description: mode.description,
      steps: mode.steps,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        actionModes: [...workspace.settings.actionModes, newMode],
      },
    }));
    return newMode.id;
  }, [activeWorkspace.id, updateWorkspace]);

  const updateActionMode = useCallback((modeId: string, patch: { name?: string; icon?: string; description?: string; steps?: ActionStep[] }) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        actionModes: workspace.settings.actionModes.map((m) =>
          m.id === modeId ? { ...m, ...patch, updatedAt: Date.now() } : m
        ),
      },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const deleteActionMode = useCallback((modeId: string) => {
    updateWorkspace(activeWorkspace.id, (workspace) => {
      const target = workspace.settings.actionModes.find((m) => m.id === modeId);
      if (target?.isDefault) return workspace;
      return {
        ...workspace,
        settings: {
          ...workspace.settings,
          actionModes: workspace.settings.actionModes.filter((m) => m.id !== modeId),
          activeActionModeId: workspace.settings.activeActionModeId === modeId
            ? null
            : workspace.settings.activeActionModeId,
        },
      };
    });
  }, [activeWorkspace.id, updateWorkspace]);

  const setActiveActionMode = useCallback((modeId: string | null) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, activeActionModeId: modeId },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const createJarvisMode = useCallback((mode: { name: string; description: string; instructions: string; icon?: string }) => {
    const now = Date.now();
    const newMode: JarvisMode = {
      id: createId(),
      name: mode.name,
      description: mode.description,
      instructions: mode.instructions,
      icon: mode.icon,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        jarvisModes: [...workspace.settings.jarvisModes, newMode],
      },
    }));
    return newMode.id;
  }, [activeWorkspace.id, updateWorkspace]);

  const updateJarvisMode = useCallback((modeId: string, patch: { name?: string; description?: string; instructions?: string; icon?: string }) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: {
        ...workspace.settings,
        jarvisModes: workspace.settings.jarvisModes.map((m) =>
          m.id === modeId ? { ...m, ...patch, updatedAt: Date.now() } : m
        ),
      },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  const deleteJarvisMode = useCallback((modeId: string) => {
    updateWorkspace(activeWorkspace.id, (workspace) => {
      const target = workspace.settings.jarvisModes.find((m) => m.id === modeId);
      // Protect built-in default modes
      if (target?.isDefault) return workspace;
      return {
        ...workspace,
        settings: {
          ...workspace.settings,
          jarvisModes: workspace.settings.jarvisModes.filter((m) => m.id !== modeId),
          activeJarvisModeId: workspace.settings.activeJarvisModeId === modeId
            ? null
            : workspace.settings.activeJarvisModeId,
        },
      };
    });
  }, [activeWorkspace.id, updateWorkspace]);

  const setActiveJarvisMode = useCallback((modeId: string | null) => {
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      settings: { ...workspace.settings, activeJarvisModeId: modeId },
    }));
  }, [activeWorkspace.id, updateWorkspace]);

  /**
   * Creates a new chat containing all messages up to and including
   * `messageIndex` from the active chat, then switches to it.
   * The forked chat is prefixed with "Branched from: " in its title.
   */
  const forkChatAtMessage = useCallback((messageIndex: number) => {
    const snapshot = stateRef.current;
    const workspace = snapshot.workspaces.find((w) => w.id === snapshot.activeWorkspaceId) ?? snapshot.workspaces[0];
    const chat = workspace.chats.find((c) => c.id === workspace.activeChatId) ?? workspace.chats[0];
    const messagesToFork = chat.messages.slice(0, messageIndex + 1);
    const forkedTitle = `Branched from: ${chat.title}`;
    const now = Date.now();
    const forkedChat: ChatThread = {
      ...createChat(forkedTitle),
      title: forkedTitle,
      messages: messagesToFork,
      createdAt: now,
      updatedAt: now,
    };

    setState((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((w) => (
        w.id !== prev.activeWorkspaceId
          ? w
          : {
              ...w,
              chats: [forkedChat, ...w.chats],
              activeChatId: forkedChat.id,
              updatedAt: now,
            }
      )),
    }));
  }, [stateRef]);

  return {
    state,
    setState,
    stateRef,
    loaded,
    activeWorkspace,
    activeChat,
    artifacts,
    filteredChats,
    sessionItems,
    mode,
    chatSearch,
    setChatSearch,
    updateWorkspace,
    updateChat,
    updateLastMessage,
    setActiveWorkspaceId,
    setActiveChatId,
    setWorkspaceMode,
    createWorkspaceAction,
    renameWorkspace,
    deleteWorkspace,
    createChatAction,
    renameChat,
    setChatTags,
    deleteChat,
    clearActiveChat,
    setStyleMode,
    setLanguageLock,
    setPreferredModelId,
    setCostMode,
    setUserPlan,
    setDark,
    setUiLanguage,
    incrementPremiumRequests,
    setAppMode,
    setPinnedAddOns,
    setMemoryEnabled,
    setMemoryNotes,
    setSystemPrompt,
    setEnabledTools,
    setWakeWordEnabled,
    setWakeWordPhrase,
    setSttEnabled,
    setTtsEnabled,
    setVoiceLanguage,
    setTtsVoiceId,
    setAutoSpeakResponses,
    setPersonalityMode,
    clearMemoryNotes,
    createPromptTemplate,
    updatePromptTemplate,
    deletePromptTemplate,
    createCustomAgent,
    updateCustomAgent,
    deleteCustomAgent,
    selectActiveAgent,
    importSharedChat,
    forkChatAtMessage,
    createJarvisMode,
    updateJarvisMode,
    deleteJarvisMode,
    setActiveJarvisMode,
    createActionMode,
    updateActionMode,
    deleteActionMode,
    setActiveActionMode,
    activeCustomAgent,
    activeBuiltInAgent,
    assistantName,
    assistantDescription,
    activeAgentId,
    assistantIcon,
    auxiliaryMode,
  };
}
