"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createId, createMessage, deriveTitle, getAllowedModels, NEW_CHAT_TITLE } from "../lib/chat-state";
import { type ActiveRequestTarget, type ChatStreamChunk, isAbortLikeError } from "../lib/chat-transport";
import type { ChatEntry, ChatThread, Mode, QueuedMessage, StoredState } from "../lib/chat-types";

type UseChatTransportArgs = {
  activeWorkspaceId: string;
  activeChatId: string;
  message: string;
  mode: Mode;
  file: File | null;
  setMessage: Dispatch<SetStateAction<string>>;
  setFile: Dispatch<SetStateAction<File | null>>;
  setFilePreview: Dispatch<SetStateAction<string | null>>;
  setComposerPreview: Dispatch<SetStateAction<boolean>>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  stateRef: RefObject<StoredState>;
  updateChat: (workspaceId: string, chatId: string, updater: (chat: ChatThread) => ChatThread) => void;
  updateLastMessage: (workspaceId: string, chatId: string, updater: (message: ChatEntry) => ChatEntry) => void;
};

export function useChatTransport({
  activeWorkspaceId,
  activeChatId,
  message,
  mode,
  file,
  setMessage,
  setFile,
  setFilePreview,
  setComposerPreview,
  inputRef,
  stateRef,
  updateChat,
  updateLastMessage,
}: UseChatTransportArgs) {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const activeRequestAbortRef = useRef<AbortController | null>(null);
  const activeRequestTargetRef = useRef<ActiveRequestTarget | null>(null);
  const processingQueueRef = useRef(false);
  const queuedMessagesRef = useRef<QueuedMessage[]>([]);
  const isMountedRef = useRef(true);

  const revokeQueuedPreview = useCallback((preview: string | null) => {
    if (preview?.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }
  }, []);

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages;
  }, [queuedMessages]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      activeRequestAbortRef.current?.abort();
      queuedMessagesRef.current.forEach((queuedMessage) => revokeQueuedPreview(queuedMessage.filePreview));
    };
  }, [revokeQueuedPreview]);

  const stopCurrentGeneration = useCallback(() => {
    const controller = activeRequestAbortRef.current;
    const activeTarget = activeRequestTargetRef.current;
    if (!controller || !activeTarget) return;

    updateLastMessage(activeTarget.workspaceId, activeTarget.chatId, (entry) => ({
      ...entry,
      ai: entry.ai || "Stopped by user.",
      status: undefined,
      stopped: true,
    }));
    controller.abort();
  }, [updateLastMessage]);

  const queueComposerMessage = useCallback(() => {
    const text = message.trim();
    if (!text && !file) return;

    const queuedMessage: QueuedMessage = {
      id: createId(),
      workspaceId: activeWorkspaceId,
      chatId: activeChatId,
      text,
      mode,
      file,
      filePreview: file?.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      createdAt: Date.now(),
    };

    setQueuedMessages((prev) => [...prev, queuedMessage]);
    setMessage("");
    setFile(null);
    setFilePreview(null);
    setComposerPreview(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [activeChatId, activeWorkspaceId, file, inputRef, message, mode, setComposerPreview, setFile, setFilePreview, setMessage]);

  const removeQueuedMessage = useCallback((queueId: string) => {
    setQueuedMessages((prev) => {
      const queuedMessage = prev.find((item) => item.id === queueId);
      if (queuedMessage) revokeQueuedPreview(queuedMessage.filePreview);
      return prev.filter((item) => item.id !== queueId);
    });
  }, [revokeQueuedPreview]);

  const consumeStream = useCallback(async (response: Response, workspaceId: string, chatId: string) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing streaming body");

    const decoder = new TextDecoder();
    let buffer = "";
    let pendingTokens = "";
    let pendingReasoning = "";
    let tokenRaf: number | null = null;
    let reasoningRaf: number | null = null;

    const flushTokens = () => {
      tokenRaf = null;
      if (!pendingTokens) return;
      const tokens = pendingTokens;
      pendingTokens = "";
      updateLastMessage(workspaceId, chatId, (message) => ({ ...message, ai: message.ai + tokens }));
    };

    const flushReasoning = () => {
      reasoningRaf = null;
      if (!pendingReasoning) return;
      const reasoning = pendingReasoning;
      pendingReasoning = "";
      updateLastMessage(workspaceId, chatId, (message) => ({
        ...message,
        reasoning: (message.reasoning ?? "") + reasoning,
      }));
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break;
        try {
          const parsed = JSON.parse(raw) as ChatStreamChunk;
          if (parsed.model || parsed.routeReason || parsed.status) {
            updateLastMessage(workspaceId, chatId, (message) => ({
              ...message,
              model: parsed.model ?? message.model,
              routeReason: parsed.routeReason ?? message.routeReason,
              status: parsed.status === "Done" ? undefined : (parsed.status ?? message.status),
            }));
          }
          if (parsed.reasoning) {
            pendingReasoning += parsed.reasoning;
            if (reasoningRaf === null) reasoningRaf = requestAnimationFrame(flushReasoning);
          }
          if (parsed.token) {
            pendingTokens += parsed.token;
            if (tokenRaf === null) tokenRaf = requestAnimationFrame(flushTokens);
          }
        } catch {
          // Ignore malformed SSE payloads.
        }
      }
    }

    if (tokenRaf !== null) cancelAnimationFrame(tokenRaf);
    if (pendingTokens) {
      updateLastMessage(workspaceId, chatId, (message) => ({ ...message, ai: message.ai + pendingTokens }));
    }
    if (reasoningRaf !== null) cancelAnimationFrame(reasoningRaf);
    if (pendingReasoning) {
      updateLastMessage(workspaceId, chatId, (message) => ({
        ...message,
        reasoning: (message.reasoning ?? "") + pendingReasoning,
      }));
    }
  }, [updateLastMessage]);

  const processQueuedMessage = useCallback(async (queuedMessage: QueuedMessage) => {
    const snapshot = stateRef.current;
    const workspace = snapshot.workspaces.find((candidate) => candidate.id === queuedMessage.workspaceId) ?? snapshot.workspaces[0];
    const chat = workspace.chats.find((candidate) => candidate.id === queuedMessage.chatId) ?? workspace.chats[0];
    const requestAbortController = new AbortController();

    const workspaceId = workspace.id;
    const chatId = chat.id;
    const userMsg = queuedMessage.text;
    const activeSettings = workspace.settings;
    const activeCustomAgent = activeSettings.customAgents.find((agent) => agent.id === activeSettings.activeAgentId) ?? null;
    const allowedModels = getAllowedModels(queuedMessage.mode);
    const history = activeSettings.memoryEnabled
      ? chat.messages.filter((entry) => entry.ai && !entry.imageUrl).map((entry) => ({ user: entry.user, ai: entry.ai }))
      : [];

    const title = chat.messages.length === 0 || chat.title === NEW_CHAT_TITLE
      ? deriveTitle(userMsg || queuedMessage.file?.name || NEW_CHAT_TITLE)
      : chat.title;

    activeRequestAbortRef.current = requestAbortController;
    activeRequestTargetRef.current = { workspaceId, chatId, queueId: queuedMessage.id };

    try {
      if (queuedMessage.mode === "image") {
        const pending = createMessage({
          user: userMsg,
          ai: "",
          model: null,
          status: "Generating image...",
          routeReason: "Manual image mode",
        });
        updateChat(workspaceId, chatId, (chat) => ({
          ...chat,
          title,
          messages: [...chat.messages, pending],
        }));

        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: requestAbortController.signal,
          body: JSON.stringify({ prompt: userMsg }),
        });
        const data = await response.json();
        updateLastMessage(workspaceId, chatId, (entry) => ({
          ...entry,
          ai: data.error ?? "",
          model: data.model ?? entry.model,
          imageUrl: data.url ?? undefined,
          status: undefined,
        }));
        return;
      }

      if (queuedMessage.mode === "upload" && queuedMessage.file) {
        const pending = createMessage({
          user: userMsg || `Analyze ${queuedMessage.file.name}`,
          ai: "",
          model: null,
          fileName: queuedMessage.file.name,
          filePreview: queuedMessage.filePreview ?? undefined,
          status: "Uploading file...",
        });
        updateChat(workspaceId, chatId, (chat) => ({
          ...chat,
          title,
          messages: [...chat.messages, pending],
        }));

        const formData = new FormData();
        formData.append("file", queuedMessage.file);
        formData.append("message", userMsg || `What is in ${queuedMessage.file.name}?`);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          signal: requestAbortController.signal,
        });
        await consumeStream(response, workspaceId, chatId);
        return;
      }

      const pending = createMessage({
        user: userMsg,
        ai: "",
        model: null,
        fileName: queuedMessage.file?.name ?? undefined,
        status: "Analyzing prompt...",
      });
      updateChat(workspaceId, chatId, (chat) => ({
        ...chat,
        title,
        messages: [...chat.messages, pending],
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: requestAbortController.signal,
        body: JSON.stringify({
          message: userMsg,
          mode: queuedMessage.mode,
          allowedModels,
          history,
          assistantName: activeCustomAgent?.name,
          assistantInstructions: activeCustomAgent?.instructions,
          memoryNotes: activeSettings.memoryNotes,
          style: activeSettings.styleMode,
          languageLock: activeSettings.languageLock,
        }),
      });

      await consumeStream(response, workspaceId, chatId);
    } catch (error) {
      if (isAbortLikeError(error)) return;
      updateLastMessage(workspaceId, chatId, (entry) => ({
        ...entry,
        ai: error instanceof Error
          ? error.message
          : queuedMessage.mode === "upload"
            ? "File analysis failed."
            : queuedMessage.mode === "image"
              ? "Image generation failed."
              : "Message failed.",
        status: undefined,
      }));
    } finally {
      if (activeRequestTargetRef.current?.queueId === queuedMessage.id) {
        activeRequestAbortRef.current = null;
        activeRequestTargetRef.current = null;
      }
    }
  }, [consumeStream, stateRef, updateChat, updateLastMessage]);

  useEffect(() => {
    if (processingQueueRef.current || queuedMessages.length === 0) return;

    const queuedMessage = queuedMessages[0];
    processingQueueRef.current = true;
    setLoading(true);

    void processQueuedMessage(queuedMessage).finally(() => {
      revokeQueuedPreview(queuedMessage.filePreview);
      processingQueueRef.current = false;
      if (!isMountedRef.current) return;
      setQueuedMessages((prev) => prev.filter((item) => item.id !== queuedMessage.id));
      setLoading(false);
    });
  }, [processQueuedMessage, queuedMessages, revokeQueuedPreview]);

  return {
    loading,
    queuedMessages,
    queueComposerMessage,
    removeQueuedMessage,
    stopCurrentGeneration,
  };
}