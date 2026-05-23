"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { toast } from "sonner";
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

function mapLocalTaskStatus(task: {
  status?: string | null;
  category?: string | null;
  action_type?: string | null;
  agent_loop_status?: string | null;
}) {
  if (task.status === "pending") {
    return "Queued on local device...";
  }

  if (task.status === "processing") {
    // Surface multi-agent pipeline step when active
    if (task.agent_loop_status && task.agent_loop_status !== "idle" && task.agent_loop_status !== "done") {
      const labels: Record<string, string> = {
        architect: "🕵️ Architect is analysing the codebase...",
        coder:     "💻 Coder is writing the implementation...",
        tester:    "🧪 Tester is verifying syntax & logic...",
        sandbox:   "📦 Sandbox Runner is executing runtime checks...",
        reviewer:  "🔍 Reviewer is validating code quality...",
        critic:    "⚖️ Product Critic is scoring final quality...",
        security:  "🛡️ Security agent is scanning the code...",
      };
      return labels[task.agent_loop_status] ?? `Multi-agent: ${task.agent_loop_status}...`;
    }

    if (task.category === "system_action") {
      if (task.action_type === "launch_roblox") return "Launching Roblox on local device...";
      if (task.action_type === "open_app") return "Opening app on local device...";
      if (task.action_type === "system_screenshot") return "Capturing screenshot on local device...";
      if (task.action_type === "system_sleep") return "Putting local device to sleep...";
      if (task.action_type === "system_file_list") return "Listing files on local device...";
      if (task.action_type === "system_file_read") return "Reading file on local device...";
      if (task.action_type === "system_file_search") return "Searching local workspace...";
      if (task.action_type === "system_status_ping") return "Reading local device status...";
      if (task.action_type === "system_repo_status") return "Inspecting local repository...";
      if (task.action_type === "system_repo_index") return "Refreshing local repository index...";
      if (task.action_type === "system_ignore_update") return "Updating local ignore rules...";
      if (task.action_type === "system_db_query") return "Running local database query...";
    }
    return "Processing on local device...";
  }

  if (task.status === "completed") {
    return "Done";
  }

  if (task.status === "failed") {
    return "Local device task failed.";
  }

  return "Waiting for local device...";
}

function buildSystemPromptWithMode(
  settings: { activeJarvisModeId?: string | null; jarvisModes?: Array<{ id: string; name: string; instructions: string }>; systemPrompt?: string }
): string {
  const base = settings.systemPrompt ?? "";
  if (!settings.activeJarvisModeId || !settings.jarvisModes) return base;
  const activeMode = settings.jarvisModes.find((m) => m.id === settings.activeJarvisModeId);
  if (!activeMode) return base;
  return `[${activeMode.name} Mode]\n${activeMode.instructions}\n\n${base}`.trim();
}

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

function resolveLocalRoutePayload(
  settings: StoredState["workspaces"][number]["settings"],
  mode: Mode,
): {
  localBaseUrl?: string;
  localApiType?: "ollama" | "lmstudio" | "openai-compat";
  localModelId?: string;
  preferLocalWhenAvailable?: boolean;
} {
  if (settings.preferredModelId) return {};
  const assignment = settings.localModelAssignment;
  if (!assignment?.serverId) return {};

  const server = (settings.localServers ?? []).find((entry) => entry.id === assignment.serverId && entry.enabled);
  if (!server) return {};

  const roleModelId = mode === "code"
    ? assignment.codeModelId
    : mode === "search"
      ? assignment.externalApiModelId
      : assignment.chatModelId;
  if (!roleModelId) return {};
  if (!server.discoveredModels?.includes(roleModelId)) return {};

  return {
    localBaseUrl: server.baseUrl,
    localApiType: server.apiType,
    localModelId: roleModelId,
    preferLocalWhenAvailable: Boolean(settings.preferLocalWhenAvailable),
  };
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
  const localTaskControllersRef = useRef<Map<string, AbortController>>(new Map());
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

  const updateMessageById = useCallback((
    workspaceId: string,
    chatId: string,
    messageId: string,
    updater: (message: ChatEntry) => ChatEntry,
  ) => {
    updateChat(workspaceId, chatId, (chat) => ({
      ...chat,
      messages: chat.messages.map((entry) => (
        entry.id === messageId
          ? updater(entry)
          : entry
      )),
    }));
  }, [updateChat]);

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages;
  }, [queuedMessages]);

  useEffect(() => {
    const localTaskControllers = localTaskControllersRef.current;
    return () => {
      isMountedRef.current = false;
      activeRequestAbortRef.current?.abort();
      localTaskControllers.forEach((controller) => controller.abort());
      localTaskControllers.clear();
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

  const pollLocalTask = useCallback(async (params: {
    taskId: string;
    messageId: string;
    workspaceId: string;
    chatId: string;
    headers: Record<string, string>;
  }) => {
    const controller = new AbortController();
    localTaskControllersRef.current.set(params.taskId, controller);

    try {
      while (!controller.signal.aborted && isMountedRef.current) {
        const response = await fetch(`/api/jarvis/tasks/${encodeURIComponent(params.taskId)}`, {
          method: "GET",
          headers: params.headers,
          signal: controller.signal,
          cache: "no-store",
        });

        const payload = await response.json().catch(() => ({})) as {
          error?: string;
          uiStatus?: string;
          task?: {
            status?: string | null;
            response?: string | null;
            error?: string | null;
            model?: string | null;
            provider?: string | null;
            category?: string | null;
            action_type?: string | null;
            agent_loop_status?: string | null;
            agent_logs?: string | null;
            agent_attempt?: number | null;
            critic_score?: number | null;
            quota_remaining?: number | null;
            quota_max?: number | null;
            token_estimate_k?: number | null;
          };
        };

        if (!response.ok || !payload.task) {
          updateMessageById(params.workspaceId, params.chatId, params.messageId, (entry) => ({
            ...entry,
            ai: payload.error ?? `Failed to refresh local task (${response.status}).`,
            status: undefined,
          }));
          break;
        }

        const task = payload.task;
        const uiStatus = payload.uiStatus ?? mapLocalTaskStatus(task);
        if (task.status === "completed") {
          updateMessageById(params.workspaceId, params.chatId, params.messageId, (entry) => ({
            ...entry,
            ai: task.response ?? "Local device task completed.",
            model: task.model ?? entry.model,
            routeReason: task.provider
              ? `Completed by local device queue (${task.provider})`
              : "Completed by local device queue",
            status: undefined,
            agentLoopStatus: task.agent_loop_status ?? entry.agentLoopStatus,
            agentLogs: task.agent_logs ?? entry.agentLogs,
            agentAttempt: task.agent_attempt ?? entry.agentAttempt,
            criticScore: task.critic_score ?? entry.criticScore ?? null,
            quotaRemaining: task.quota_remaining ?? entry.quotaRemaining ?? null,
            quotaMax: task.quota_max ?? entry.quotaMax ?? null,
            tokenEstimateK: task.token_estimate_k ?? entry.tokenEstimateK ?? null,
          }));
          break;
        }

        if (task.status === "failed" || task.status === "cancelled") {
          updateMessageById(params.workspaceId, params.chatId, params.messageId, (entry) => ({
            ...entry,
            ai: task.error ?? task.response ?? "Local device task failed.",
            status: undefined,
            routeReason: "Local device queue",
            agentLoopStatus: task.agent_loop_status ?? entry.agentLoopStatus,
            agentLogs: task.agent_logs ?? entry.agentLogs,
            agentAttempt: task.agent_attempt ?? entry.agentAttempt,
            criticScore: task.critic_score ?? entry.criticScore ?? null,
            quotaRemaining: task.quota_remaining ?? entry.quotaRemaining ?? null,
            quotaMax: task.quota_max ?? entry.quotaMax ?? null,
            tokenEstimateK: task.token_estimate_k ?? entry.tokenEstimateK ?? null,
          }));
          break;
        }

        updateMessageById(params.workspaceId, params.chatId, params.messageId, (entry) => ({
          ...entry,
          status: uiStatus === "Done" ? undefined : uiStatus,
          routeReason: "Queued via Supabase local device worker",
          agentLoopStatus: task.agent_loop_status ?? entry.agentLoopStatus,
          agentLogs: task.agent_logs ?? entry.agentLogs,
          agentAttempt: task.agent_attempt ?? entry.agentAttempt,
          criticScore: task.critic_score ?? entry.criticScore ?? null,
          quotaRemaining: task.quota_remaining ?? entry.quotaRemaining ?? null,
          quotaMax: task.quota_max ?? entry.quotaMax ?? null,
          tokenEstimateK: task.token_estimate_k ?? entry.tokenEstimateK ?? null,
        }));

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      if (!isAbortLikeError(error)) {
        updateMessageById(params.workspaceId, params.chatId, params.messageId, (entry) => ({
          ...entry,
          ai: error instanceof Error ? error.message : "Local device polling failed.",
          status: undefined,
        }));
      }
    } finally {
      localTaskControllersRef.current.delete(params.taskId);
    }
  }, [updateMessageById]);

  const queueComposerMessage = useCallback((thinkingEffort: number) => {
    const text = message.trim();
    if (!text && !file) return;
    const shouldShowImmediateLoader = !processingQueueRef.current && queuedMessagesRef.current.length === 0;

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

    if (shouldShowImmediateLoader) {
      setLoading(true);
      setStopRequested(false);
    }
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
    let pendingMessageId: string | null = null;

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

        const toastId = toast.loading(`Uploading ${queuedMessage.file.name}…`);
        try {
          const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
            signal: requestAbortController.signal,
          });
          if (response.ok) {
            toast.success("File uploaded successfully", { id: toastId });
          } else {
            toast.error("File upload failed", { id: toastId });
          }
          await consumeStream(response, workspaceId, chatId);
        } catch (err) {
          if (!isAbortLikeError(err)) {
            toast.error("File upload failed", { id: toastId });
          } else {
            toast.dismiss(toastId);
          }
          throw err;
        }
        return;
      }

      const pending = createMessage({
        user: userMsg,
        ai: "",
        model: null,
        fileName: queuedMessage.file?.name ?? undefined,
        status: "Analyzing prompt...",
      });
      pendingMessageId = pending.id;
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

      const commandResponse = await fetch("/api/commands/execute", {
        method: "POST",
        headers,
        signal: requestAbortController.signal,
        body: JSON.stringify({
          message: userMsg,
          conversationId: chatId,
        }),
      });
      const commandPayload = await commandResponse.json().catch(() => ({})) as {
        handled?: boolean;
        ok?: boolean;
        taskId?: string | null;
        task?: { status?: string | null; category?: string | null; action_type?: string | null } | null;
        status?: string | null;
        routeReason?: string | null;
        message?: string | null;
        error?: string;
      };

      if (commandPayload.handled) {
        if (!commandPayload.ok) {
          updateMessageById(workspaceId, chatId, pending.id, (entry) => ({
            ...entry,
            ai: commandPayload.message ?? commandPayload.error ?? "Command failed.",
            status: undefined,
            routeReason: commandPayload.routeReason ?? "Command dispatcher",
          }));
          return;
        }

        if (commandPayload.taskId) {
          updateMessageById(workspaceId, chatId, pending.id, (entry) => ({
            ...entry,
            ai: commandPayload.message ?? "",
            status: commandPayload.status
              ?? mapLocalTaskStatus({
                status: commandPayload.task?.status ?? "pending",
                category: commandPayload.task?.category ?? "system_action",
                action_type: commandPayload.task?.action_type ?? null,
              }),
            routeReason: commandPayload.routeReason ?? "Queued via command dispatcher",
          }));
          void pollLocalTask({
            taskId: commandPayload.taskId,
            messageId: pending.id,
            workspaceId,
            chatId,
            headers,
          });
          return;
        }

        updateMessageById(workspaceId, chatId, pending.id, (entry) => ({
          ...entry,
          ai: commandPayload.message ?? "Command completed.",
          status: undefined,
          routeReason: commandPayload.routeReason ?? "Command dispatcher",
        }));
        return;
      }

      // When the command dispatcher did not handle the message but the user typed a
      // slash command, inject a hint into the system prompt so the AI can explain
      // the command and guide the user instead of responding with confusion.
      const isUnhandledSlashCommand = !commandPayload.handled && userMsg.trim().startsWith("/");

      if (activeSettings.localOnlyMode) {
        updateMessageById(workspaceId, chatId, pending.id, (entry) => ({
          ...entry,
          status: "Queueing task on local device...",
          routeReason: "Local device queue via Supabase",
        }));

        const enqueueResponse = await fetch("/api/jarvis/tasks", {
          method: "POST",
          headers,
          signal: requestAbortController.signal,
          body: JSON.stringify({
            prompt: userMsg,
            category: "ai_request",
          }),
        });

        const enqueuePayload = await enqueueResponse.json().catch(() => ({})) as {
          error?: string;
          taskId?: string;
          task?: { status?: string | null };
        };

        if (!enqueueResponse.ok || !enqueuePayload.taskId) {
          updateMessageById(workspaceId, chatId, pending.id, (entry) => ({
            ...entry,
            ai: enqueuePayload.error ?? `Failed to enqueue local device task (${enqueueResponse.status}).`,
            status: undefined,
          }));
          return;
        }

        updateMessageById(workspaceId, chatId, pending.id, (entry) => ({
          ...entry,
          status: mapLocalTaskStatus({ status: enqueuePayload.task?.status ?? "pending" }),
          routeReason: "Queued via Supabase local device worker",
        }));

        void pollLocalTask({
          taskId: enqueuePayload.taskId,
          messageId: pending.id,
          workspaceId,
          chatId,
          headers,
        });
        return;
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
        systemPrompt: buildSystemPromptWithMode(activeSettings) + (isUnhandledSlashCommand ? `\n\nNote: The user sent the slash command "${userMsg.trim()}" but it was not intercepted by the command dispatcher. The required integration may not be connected, or the command was not recognized. Explain what this slash command does and guide the user on how to enable it.` : ""),
        personalityMode: activeSettings.personalityMode ?? "default",
        enabledTools: activeSettings.enabledTools ?? [],
        googleContext: googleContextRef.current || undefined,
        ...resolveLocalRoutePayload(activeSettings, queuedMessage.mode),
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
      const fallbackMessage = error instanceof Error
        ? error.message
        : queuedMessage.mode === "upload"
          ? "File analysis failed."
          : queuedMessage.mode === "image"
            ? "Image generation failed."
            : "Message failed.";

      if (activeSettings.localOnlyMode && queuedMessage.mode !== "upload" && queuedMessage.mode !== "image" && pendingMessageId) {
        updateMessageById(workspaceId, chatId, pendingMessageId, (entry) => ({
          ...entry,
          ai: fallbackMessage,
          status: undefined,
        }));
      } else {
        updateLastMessage(workspaceId, chatId, (entry) => ({
          ...entry,
          ai: fallbackMessage,
          status: undefined,
        }));
      }
    } finally {
      if (activeRequestTargetRef.current?.queueId === queuedMessage.id) {
        activeRequestAbortRef.current = null;
        activeRequestTargetRef.current = null;
      }
    }
  }, [consumeStream, pollLocalTask, stateRef, updateChat, updateLastMessage, updateMessageById]);

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
