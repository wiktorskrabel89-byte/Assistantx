"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createClient } from "@/lib/client";
import { ALL_MODELS } from "@/lib/ai-config";
import { BUILT_IN_AGENTS, createId, createMessage, deriveTitle, NEW_CHAT_TITLE } from "../lib/chat-state";
import { type ActiveRequestTarget, type ChatStreamChunk, isAbortLikeError } from "../lib/chat-transport";
import type { ChatEntry, ChatThread, Mode, QueuedMessage, StoredState } from "../lib/chat-types";
import { isImageRequest } from "@/lib/detect";

const PROGRAMMING_LANGUAGE_HINTS: Array<{ name: string; patterns: RegExp[]; extensions: string[] }> = [
  { name: "TypeScript", patterns: [/\btypescript\b/i, /\btsx?\b/i, /react|next\.js/i], extensions: ["ts", "tsx"] },
  { name: "JavaScript", patterns: [/\bjavascript\b/i, /\bjsx?\b/i, /node\.?js/i], extensions: ["js", "jsx", "mjs", "cjs"] },
  { name: "Python", patterns: [/\bpython\b/i, /\bpy\b/i, /django|flask|fastapi/i], extensions: ["py"] },
  { name: "SQL", patterns: [/\bsql\b/i, /postgres|mysql|sqlite/i], extensions: ["sql"] },
  { name: "HTML/CSS", patterns: [/\bhtml\b/i, /\bcss\b/i, /tailwind|stylesheet/i], extensions: ["html", "css"] },
  { name: "Java", patterns: [/\bjava\b/i, /spring boot/i], extensions: ["java"] },
  { name: "C#", patterns: [/\bc#\b/i, /dotnet|\.net/i], extensions: ["cs"] },
  { name: "Go", patterns: [/\bgolang\b/i, /\bgo\b/i], extensions: ["go"] },
  { name: "Rust", patterns: [/\brust\b/i, /cargo/i], extensions: ["rs"] },
];

const ALL_MODEL_IDS = ALL_MODELS.map((model) => model.id);
const DEFAULT_THINKING_EFFORT = 2;

function getFileExtension(name?: string | null) {
  if (!name) return "";
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}

function inferPreferredProgrammingLanguage(message: string, fileName: string | undefined, recentMessages: ChatEntry[]) {
  const samples = [
    message,
    ...recentMessages.flatMap((entry) => [entry.user, entry.ai]).filter(Boolean),
  ].join("\n");
  const extension = getFileExtension(fileName);

  const ranked = PROGRAMMING_LANGUAGE_HINTS.map((candidate) => {
    const patternScore = candidate.patterns.reduce((score, pattern) => score + (pattern.test(samples) ? 1 : 0), 0);
    const extensionScore = candidate.extensions.includes(extension) ? 2 : 0;
    return { name: candidate.name, score: patternScore + extensionScore };
  }).sort((left, right) => right.score - left.score);

  return ranked[0]?.score > 0 ? ranked[0].name : null;
}

function buildInteractionProfile({
  recentMessages,
  mode,
  styleMode,
  languageLock,
  preferredProgrammingLanguage,
}: {
  recentMessages: ChatEntry[];
  mode: Mode;
  styleMode: string;
  languageLock: string;
  preferredProgrammingLanguage: string | null;
}) {
  const recentUserMessages = recentMessages.map((entry) => entry.user).filter(Boolean);
  const codeCount = recentUserMessages.filter((entry) => /\b(code|bug|component|function|query|test|refactor|api|script)\b/i.test(entry)).length;
  const researchCount = recentUserMessages.filter((entry) => /\b(search|latest|current|docs|documentation|compare|research)\b/i.test(entry)).length;
  const ratings = recentMessages.map((entry) => entry.feedback).filter(Boolean);
  const profile: string[] = [];

  profile.push(`Current interaction lane: ${mode}.`);
  if (codeCount > 0) profile.push(`Recent history is coding-heavy (${codeCount} of the last ${recentUserMessages.length || 1} user turns).`);
  if (researchCount > 0) profile.push(`The user sometimes asks for web-backed or documentation-backed answers (${researchCount} recent turns).`);
  profile.push(`Preferred answer style is ${styleMode}.`);
  if (languageLock !== "auto") profile.push(`The user explicitly locked the response language to ${languageLock}.`);
  if (preferredProgrammingLanguage) profile.push(`When code is appropriate, the user's current likely programming language is ${preferredProgrammingLanguage}.`);
  if (ratings.length > 0) profile.push(`Stored response feedback exists for ${ratings.length} recent assistant replies; keep responses practical and easy to iterate on.`);

  return profile.join(" ");
}

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
  const [stopRequested, setStopRequested] = useState(false);
  const activeRequestAbortRef = useRef<AbortController | null>(null);
  const activeRequestTargetRef = useRef<ActiveRequestTarget | null>(null);
  const processingQueueRef = useRef(false);
  const queuedMessagesRef = useRef<QueuedMessage[]>([]);
  const isMountedRef = useRef(true);
  // Google integration context injected into the next chat message system prompt
  const googleContextRef = useRef<string>("");
  const setGoogleContext = useCallback((context: string) => {
    googleContextRef.current = context;
  }, []);

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

    setStopRequested(true);
    updateLastMessage(activeTarget.workspaceId, activeTarget.chatId, (entry) => ({
      ...entry,
      ai: entry.ai || "Stopped by user.",
      status: undefined,
      stopped: true,
    }));
    controller.abort();
  }, [updateLastMessage]);

  const queueComposerMessage = useCallback((thinkingEffort: number) => {
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
      thinkingEffort,
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
    const activeBuiltInAgent = BUILT_IN_AGENTS.find((agent) => agent.id === activeSettings.activeAgentId) ?? null;
    // Null modelId intentionally enables chat auto-routing across the curated model list.
    const userPreferredModelId = activeSettings.preferredModelId ?? null;
    const effectiveAllowedModels = ALL_MODEL_IDS;
    const recentMessages = chat.messages.slice(-8);
    const history = activeSettings.memoryEnabled
      ? recentMessages.filter((entry) => entry.ai && !entry.imageUrl).map((entry) => ({ user: entry.user, ai: entry.ai }))
      : [];
    const preferredProgrammingLanguage = inferPreferredProgrammingLanguage(userMsg, queuedMessage.file?.name, recentMessages);
    const interactionProfile = buildInteractionProfile({
      recentMessages,
      mode: queuedMessage.mode,
      styleMode: activeSettings.styleMode,
      languageLock: activeSettings.languageLock,
      preferredProgrammingLanguage,
    });
    const assistantPurpose = activeCustomAgent?.description ?? activeBuiltInAgent?.description ?? "";
    const shouldAutoGenerateImage = activeSettings.activeAgentId === "builtin-chat"
      && queuedMessage.mode !== "upload"
      && isImageRequest(userMsg);

    const title = chat.messages.length === 0 || chat.title === NEW_CHAT_TITLE
      ? deriveTitle(userMsg || queuedMessage.file?.name || NEW_CHAT_TITLE)
      : chat.title;

    activeRequestAbortRef.current = requestAbortController;
    activeRequestTargetRef.current = { workspaceId, chatId, queueId: queuedMessage.id };

    try {
      if (queuedMessage.mode === "image" || shouldAutoGenerateImage) {
        const pending = createMessage({
          user: userMsg,
          ai: "",
          model: null,
          status: "Generating image...",
          routeReason: shouldAutoGenerateImage ? "AI Chat auto-detected an image request" : "Manual image mode",
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
        updateLastMessage(workspaceId, chatId, (entry) => ({
          ...entry,
          status: "Finalizing image response...",
        }));
        if (!response.ok) {
          let errorText = `Image generation failed (${response.status})`;
          try { errorText = (await response.json() as { error?: string }).error ?? errorText; } catch { /* ignore */ }
          updateLastMessage(workspaceId, chatId, (entry) => ({
            ...entry,
            ai: errorText,
            status: undefined,
          }));
          return;
        }
        const data = await response.json();
        updateLastMessage(workspaceId, chatId, (entry) => ({
          ...entry,
          ai: data.error ?? "",
          model: data.model ?? entry.model,
          imageUrl: data.url ?? undefined,
          imageGeneration: data.model
            ? {
                provider: data.provider ?? "Unknown",
                model: data.model,
                stages: Array.isArray(data.stages) ? data.stages.map((item: unknown) => String(item)) : [],
              }
            : entry.imageGeneration,
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

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const chatBody = {
        message: userMsg,
        mode: queuedMessage.mode,
        modelId: userPreferredModelId,
        allowedModels: effectiveAllowedModels,
        history,
        conversationId: chatId,
        assistantName: activeCustomAgent?.name,
        assistantPurpose,
        assistantInstructions: activeCustomAgent?.instructions,
        memoryNotes: activeSettings.memoryNotes,
        style: activeSettings.styleMode,
        languageLock: activeSettings.languageLock,
        preferredProgrammingLanguage,
        interactionProfile,
        addInternetContext: queuedMessage.mode === "search" || (activeSettings.enabledTools ?? []).includes("web_search"),
        costMode: "performance",
        userPlan: stateRef.current.userPlan,
        thinkingEffort: queuedMessage.thinkingEffort ?? DEFAULT_THINKING_EFFORT,
        modelProfile: activeSettings.modelProfile ?? "default",
        temperature: typeof activeSettings.temperature === "number" ? activeSettings.temperature : 0.7,
        topP: typeof activeSettings.topP === "number" ? activeSettings.topP : 0.9,
        repetitionPenalty: typeof activeSettings.repetitionPenalty === "number" ? activeSettings.repetitionPenalty : 1,
        systemPrompt: activeSettings.systemPrompt ?? "",
        enabledTools: activeSettings.enabledTools ?? [],
        googleContext: googleContextRef.current || undefined,
      };

      const doChatFetch = async (bodyOverride?: Partial<typeof chatBody>) => {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers,
          signal: requestAbortController.signal,
          body: JSON.stringify({ ...chatBody, ...bodyOverride }),
        });
        await consumeStream(res, workspaceId, chatId);
      };

      try {
        await doChatFetch();
      } catch (innerError) {
        if (isAbortLikeError(innerError)) throw innerError;
        // Network-level failure (e.g. ERR_HTTP2_PROTOCOL_ERROR): retry once with auto model selection.
        // Clear any partial content so the retry response renders cleanly (the status message
        // communicates to the user that a retry is in progress).
        updateLastMessage(workspaceId, chatId, (entry) => ({
          ...entry,
          ai: "",
          status: "Retrying with fallback model...",
        }));
        await doChatFetch({ modelId: null, allowedModels: effectiveAllowedModels });
      }
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
    setStopRequested(false);

    void processQueuedMessage(queuedMessage).finally(() => {
      revokeQueuedPreview(queuedMessage.filePreview);
      processingQueueRef.current = false;
      if (!isMountedRef.current) return;
      setQueuedMessages((prev) => prev.filter((item) => item.id !== queuedMessage.id));
      setLoading(false);
      setStopRequested(false);
    });
  }, [processQueuedMessage, queuedMessages, revokeQueuedPreview]);

  return {
    loading,
    stopRequested,
    queuedMessages,
    queueComposerMessage,
    removeQueuedMessage,
    stopCurrentGeneration,
    setGoogleContext,
  };
}
