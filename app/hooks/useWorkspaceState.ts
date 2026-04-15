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
  ChatEntry,
  ChatThread,
  CustomAgent,
  Mode,
  SharePayload,
  StoredState,
  StyleMode,
  Workspace,
} from "../lib/chat-types";

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
      const haystack = `${chat.title} ${latest?.user ?? ""} ${latest?.ai ?? ""}`.toLowerCase();
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
    let cancelled = false;

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
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void loadState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeForStorage(state)));
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

  useEffect(() => {
    if (mode === activeWorkspace.settings.lastMode) return;
    setMode(activeWorkspace.settings.lastMode);
  }, [activeWorkspace.id, activeWorkspace.settings.lastMode, mode]);

  const setActiveWorkspaceId = useCallback((workspaceId: string) => {
    setState((prev) => ({ ...prev, activeWorkspaceId: workspaceId }));
  }, []);

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
    deleteChat,
    clearActiveChat,
    setStyleMode,
    setLanguageLock,
    setMemoryEnabled,
    setMemoryNotes,
    clearMemoryNotes,
    createPromptTemplate,
    updatePromptTemplate,
    deletePromptTemplate,
    createCustomAgent,
    updateCustomAgent,
    deleteCustomAgent,
    selectActiveAgent,
    importSharedChat,
    activeCustomAgent,
    activeBuiltInAgent,
    assistantName,
    assistantDescription,
    activeAgentId,
    assistantIcon,
    auxiliaryMode,
  };
}