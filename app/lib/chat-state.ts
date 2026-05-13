import { Braces, Code2, MessageSquareText, PlugZap, SlidersHorizontal, UserRound } from "lucide-react";
import {
  CHAT_MODELS,
  CODE_MODELS,
  LANGUAGE_OPTIONS,
  PERSONALITY_MODES,
  RECOMMENDED_CHAT_MODELS,
  RECOMMENDED_CODING_MODELS,
  SEARCH_MODELS,
} from "@/lib/ai-config";
import type { CostMode, ModelPreset, UserPlan } from "@/lib/ai-config";
import type {
  Artifact,
  ActionMode,
  ActionStep,
  BuiltInAgent,
  ChatEntry,
  ChatSessionItem,
  ChatThread,
  CloudSyncErrorPayload,
  JarvisMode,
  Mode,
  PromptTemplate,
  StoredState,
  ToolbarTab,
  Workspace,
  WorkspaceSettings,
} from "./chat-types";
import { DEFAULT_WEB_WAKE_PHRASE, VOICE_PROFILES } from "./voice";

type AutoRoutedMode = Exclude<Mode, "image" | "upload">;

export const STORAGE_KEY = "assistantx.workspace-state.v3";
export const NEW_CHAT_TITLE = "New chat";
export const TEXT_LANGUAGE_OPTIONS = LANGUAGE_OPTIONS;
export const MODEL_PRESETS: { coding: ModelPreset[]; chat: ModelPreset[] } = {
  coding: RECOMMENDED_CODING_MODELS,
  chat: RECOMMENDED_CHAT_MODELS,
};
export const COST_MODE_OPTIONS: Array<{ id: CostMode; label: string; icon: string; description: string }> = [
  { id: "thrifty", label: "Thrifty", icon: "🪙", description: "Use cheapest models to save credits." },
  { id: "balanced", label: "Balanced", icon: "⚖️", description: "Good quality at moderate cost." },
  { id: "performance", label: "Performance", icon: "🚀", description: "Best models, higher credit usage." },
];
export const QUICK_CHIPS: Array<{ label: string; text: string; mode?: Mode }> = [
  { label: "Explain code", text: "Explain this code: ", mode: "code" },
  { label: "Fix bug", text: "Help me fix this bug: ", mode: "code" },
  { label: "Web search", text: "Search the web for the latest info about: ", mode: "search" },
  { label: "Generate tests", text: "Generate tests for: ", mode: "code" },
  { label: "Plan steps", text: "Break this into clear implementation steps: ", mode: "chat" },
];
export const MODE_PANEL_OPTIONS: Array<{ id: Mode; label: string; description: string }> = [
  { id: "auto", label: "Auto", description: "Let the router pick the best lane for the prompt." },
  { id: "chat", label: "Chat", description: "Bias toward general conversation and writing." },
  { id: "code", label: "Code", description: "Bias toward coding, debugging, and reviews." },
  { id: "search", label: "Search", description: "Bias toward web-aware research answers." },
  { id: "image", label: "Image", description: "Generate an image from a prompt." },
];
export const BUILT_IN_AGENTS: BuiltInAgent[] = [
  {
    id: "builtin-code",
    name: "Code Assistant",
    description: "Expert in AutoHotkey, Python, JavaScript, and all programming languages. Provides complete code solutions with best practices.",
    preferredMode: "code",
    icon: Code2,
  },
  {
    id: "builtin-chat",
    name: "AI Chat",
    description: "Friendly AI assistant for general conversation, questions, advice, creative writing, and anything else you want to talk about.",
    preferredMode: "chat",
    icon: MessageSquareText,
  },
];

const AUTO_ROUTER_ALLOWED_MODELS: Record<AutoRoutedMode, string[]> = {
  auto: Array.from(new Set([...CHAT_MODELS, ...CODE_MODELS].map((model) => model.id))),
  chat: CHAT_MODELS.map((model) => model.id),
  code: CODE_MODELS.map((model) => model.id),
  search: SEARCH_MODELS.map((model) => model.id),
};

export const MODE_LABELS: Record<Mode, string> = {
  auto: "Auto",
  code: "Code",
  chat: "Chat",
  search: "Search",
  image: "Image",
  upload: "File",
};

export const MODE_COLORS: Record<Mode, string> = {
  auto: "bg-blue-600",
  code: "bg-violet-600",
  chat: "bg-sky-600",
  search: "bg-cyan-600",
  image: "bg-emerald-600",
  upload: "bg-orange-500",
};

export const TOOLBAR_TABS: ToolbarTab[] = [
  { id: "chat", label: "Chat", icon: MessageSquareText },
  { id: "workspace", label: "Tools", icon: SlidersHorizontal },
  { id: "artifacts", label: "Artifacts", icon: Braces },
  { id: "integrations", label: "Apps", icon: PlugZap },
  { id: "account", label: "Account", icon: UserRound },
];

export function getAllowedModels(mode: Mode) {
  switch (mode) {
    case "auto":
    case "chat":
    case "code":
    case "search":
      return AUTO_ROUTER_ALLOWED_MODELS[mode];
    default:
      return undefined;
  }
}

export function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createMessage(overrides: Partial<ChatEntry>): ChatEntry {
  return {
    id: createId(),
    user: "",
    ai: "",
    model: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createDefaultPromptTemplates(): PromptTemplate[] {
  const now = Date.now();
  return QUICK_CHIPS.map((chip, index) => ({
    id: `prompt-${index + 1}-${createId()}`,
    label: chip.label,
    text: chip.text,
    mode: chip.mode ?? "chat",
    createdAt: now,
    updatedAt: now,
  }));
}

const DEFAULT_JARVIS_MODES: Array<Omit<JarvisMode, "id" | "createdAt" | "updatedAt">> = [
  {
    name: "Gaming",
    icon: "🎮",
    description: "Hyped, game-savvy assistant tuned for gaming sessions.",
    instructions:
      "You are in Gaming Mode. Be casual, energetic, and hype. Prioritise gaming tips, performance advice, and meta knowledge. When the user asks technical questions, frame answers in gaming context first. Keep responses short and punchy. Use gaming slang naturally but don't overdo it.",
    isDefault: true,
  },
  {
    name: "Focus",
    icon: "🎯",
    description: "Minimal, direct, no-fluff mode for deep work.",
    instructions:
      "You are in Focus Mode. The user wants to get things done. Be concise and direct. Omit pleasantries and filler text. Provide actionable answers only. No small talk. Prioritise clarity and efficiency above everything else.",
    isDefault: true,
  },
  {
    name: "Study",
    icon: "📚",
    description: "Patient teacher mode — explains step-by-step with analogies.",
    instructions:
      "You are in Study Mode. Explain concepts step-by-step using clear language. Use analogies and real-world examples. When the user seems confused, try a different explanation approach. Encourage questions. Check understanding by summarising key points at the end of complex explanations.",
    isDefault: true,
  },
  {
    name: "Creative",
    icon: "✨",
    description: "Imaginative brainstorming partner for creative work.",
    instructions:
      "You are in Creative Mode. Be imaginative, expressive, and metaphor-rich. Embrace unconventional ideas and lateral thinking. When brainstorming, generate diverse options without filtering. Invite the user to explore ideas further. Tone should feel inspired and collaborative.",
    isDefault: true,
  },
  {
    name: "Chill",
    icon: "😎",
    description: "Relaxed, conversational — like chatting with a friend.",
    instructions:
      "You are in Chill Mode. Keep the conversation relaxed and friendly. Light humour is welcome. There is no rush — explore topics at a comfortable pace. Feel free to go on tangents if they are interesting. Be warm and laid-back.",
    isDefault: true,
  },
];

export function createDefaultJarvisModes(): JarvisMode[] {
  const now = Date.now();
  return DEFAULT_JARVIS_MODES.map((mode, index) => ({
    ...mode,
    id: `jarvis-mode-default-${index + 1}`,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * Derives a short bullet-point preview from a mode's instructions string.
 * Splits on sentence boundaries and returns up to `maxBullets` items.
 */
export function modeInstructionsPreview(instructions: string, maxBullets = 3): string[] {
  if (!instructions.trim()) return [];
  return instructions
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxBullets);
}

function makeStep(type: ActionStep["type"], label: string, extra: Partial<ActionStep> = {}): ActionStep {
  return { id: createId(), type, label, ...extra };
}

type DefaultActionModeDef = Omit<ActionMode, "id" | "createdAt" | "updatedAt">;

const DEFAULT_ACTION_MODES: DefaultActionModeDef[] = [
  {
    name: "Gaming",
    icon: "🎮",
    description: "Fire up your gaming setup — opens your games and chat apps.",
    isDefault: true,
    steps: [
      makeStep("open_url", "Open Roblox", { url: "https://www.roblox.com" }),
      makeStep("open_url", "Open Discord", { url: "https://discord.com/app" }),
      makeStep("switch_jarvis_mode", "Switch Jarvis to Gaming personality", { jarvisModeId: "jarvis-mode-default-1" }),
    ],
  },
  {
    name: "Study",
    icon: "📚",
    description: "Open study resources and put Jarvis in teacher mode.",
    isDefault: true,
    steps: [
      makeStep("open_url", "Open YouTube", { url: "https://www.youtube.com" }),
      makeStep("switch_jarvis_mode", "Switch Jarvis to Study personality", { jarvisModeId: "jarvis-mode-default-3" }),
    ],
  },
  {
    name: "Work",
    icon: "💼",
    description: "Open work tools and switch Jarvis to focused mode.",
    isDefault: true,
    steps: [
      makeStep("open_url", "Open Notion", { url: "https://www.notion.so" }),
      makeStep("switch_jarvis_mode", "Switch Jarvis to Focus personality", { jarvisModeId: "jarvis-mode-default-2" }),
    ],
  },
  {
    name: "Music",
    icon: "🎵",
    description: "Open your music app and chill out.",
    isDefault: true,
    steps: [
      makeStep("open_url", "Open Spotify", { url: "https://open.spotify.com" }),
      makeStep("switch_jarvis_mode", "Switch Jarvis to Chill personality", { jarvisModeId: "jarvis-mode-default-5" }),
    ],
  },
  {
    name: "Creative",
    icon: "✨",
    description: "Get into creative mode — open your tools and brainstorm.",
    isDefault: true,
    steps: [
      makeStep("open_url", "Open Figma", { url: "https://www.figma.com" }),
      makeStep("switch_jarvis_mode", "Switch Jarvis to Creative personality", { jarvisModeId: "jarvis-mode-default-4" }),
    ],
  },
];

export function createDefaultActionModes(): ActionMode[] {
  const now = Date.now();
  return DEFAULT_ACTION_MODES.map((mode, index) => ({
    ...mode,
    id: `action-mode-default-${index + 1}`,
    createdAt: now,
    updatedAt: now,
  }));
}

export function createSettings(): WorkspaceSettings {
  return {
    activeAgentId: BUILT_IN_AGENTS[0].id,
    customAgents: [],
    lastMode: BUILT_IN_AGENTS[0].preferredMode,
    memoryEnabled: true,
    memoryNotes: "",
    promptTemplates: createDefaultPromptTemplates(),
    styleMode: "concise",
    languageLock: "auto",
    preferredModelId: null,
    modelProfile: "gpt-oss-chat",
    temperature: 0.6,
    topP: 0.9,
    repetitionPenalty: 1,
    costMode: "balanced",
    systemPrompt: "",
    enabledTools: [],
    wakeWordEnabled: true,
    wakeWordPhrase: DEFAULT_WEB_WAKE_PHRASE,
    sttEnabled: true,
    ttsEnabled: true,
    voiceLanguage: "en-US",
    ttsVoiceId: "default",
    autoSpeakResponses: false,
    personalityMode: "default",
    jarvisModes: createDefaultJarvisModes(),
    activeJarvisModeId: null,
    actionModes: createDefaultActionModes(),
    activeActionModeId: null,
    syncChatHistory: true,
    syncMemories: true,
    syncTasksReminders: true,
    syncVoiceSettings: true,
    syncAnalyticsUsage: false,
    syncAutomations: true,
    syncLocalFiles: false,
    localOnlyMode: false,
    encryptedSync: false,
    pauseSync: false,
  };
}

export function createChat(title = NEW_CHAT_TITLE): ChatThread {
  const now = Date.now();
  return {
    id: createId(),
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createWorkspace(name = "Personal"): Workspace {
  const chat = createChat();
  const now = Date.now();
  return {
    id: createId(),
    name,
    chats: [chat],
    activeChatId: chat.id,
    settings: createSettings(),
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultState(): StoredState {
  const workspace = createWorkspace();
  return {
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
    dark: false,
    userPlan: "free",
    premiumRequestsUsed: 0,
    appMode: "ai-chat",
    pinnedAddOns: [],
    uiLanguage: "en",
  };
}

export function readCloudSyncError(data: unknown): CloudSyncErrorPayload {
  if (!data || typeof data !== "object") return {};
  const candidate = data as Record<string, unknown>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    error: typeof candidate.error === "string" ? candidate.error : undefined,
    hint: typeof candidate.hint === "string" ? candidate.hint : undefined,
  };
}

export function formatCloudSyncError(status: number, data: unknown, fallbackMessage: string) {
  const payload = readCloudSyncError(data);

  if (status === 401 || payload.code === "unauthorized") {
    return {
      status: "local" as const,
      message: "No active session. Workspace changes stay local.",
    };
  }

  if (status === 503 || payload.code === "workspace_sync_not_configured") {
    return {
      status: "local" as const,
      message: "Cloud sync is not configured. Workspace changes stay local.",
    };
  }

  return {
    status: "error" as const,
    message: payload.hint ? `${payload.error ?? fallbackMessage} ${payload.hint}` : (payload.error ?? fallbackMessage),
  };
}

export function deriveTitle(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return NEW_CHAT_TITLE;
  return cleaned.length > 36 ? `${cleaned.slice(0, 36)}...` : cleaned;
}

export function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/[*_~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s/gm, "")
    .trim();
}

export function toBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function extractArtifacts(messages: ChatEntry[]): Artifact[] {
  const artifacts: Artifact[] = [];
  const blockRegex = /```([\w.+-]*)\n?([\s\S]*?)```/g;

  for (const message of messages) {
    if (!message.ai) continue;
    let match: RegExpExecArray | null;
    let index = 1;
    while ((match = blockRegex.exec(message.ai)) !== null) {
      const language = match[1] || "text";
      const code = match[2].replace(/\n$/, "");
      if (!code.trim()) continue;
      artifacts.push({
        id: `${message.id}-${index}`,
        language,
        code,
        label: `${language.toUpperCase()} ${index}`,
        sourceTitle: message.user || "AI response",
      });
      index += 1;
    }
  }

  return artifacts;
}

export function buildChatSessionItems(chats: ChatThread[], activeChatId: string): ChatSessionItem[] {
  return chats.map((chat) => {
    const latest = chat.messages[chat.messages.length - 1];
    return {
      id: chat.id,
      title: chat.title,
      preview: stripMarkdown(latest?.user ?? latest?.ai ?? ""),
      messageCount: chat.messages.length,
      isActive: chat.id === activeChatId,
    };
  });
}

export function sanitizeForStorage(state: StoredState): StoredState {
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) => ({
      ...workspace,
      chats: workspace.chats.map((chat) => ({
        ...chat,
        messages: chat.messages.map((message) => ({
          ...message,
          filePreview: undefined,
        })),
      })),
    })),
  };
}

export function upgradeState(value: StoredState | null): StoredState | null {
  if (!value || !Array.isArray(value.workspaces) || value.workspaces.length === 0) return null;

  const workspaces = value.workspaces.map((workspace) => {
    const chats = Array.isArray(workspace.chats) && workspace.chats.length > 0
      ? workspace.chats.map((chat) => ({
          ...chat,
          title: chat.title || NEW_CHAT_TITLE,
          messages: Array.isArray(chat.messages)
            ? chat.messages.map((message) => ({
                ...message,
                id: message.id || createId(),
                createdAt: message.createdAt || Date.now(),
              }))
            : [],
          updatedAt: chat.updatedAt || Date.now(),
          createdAt: chat.createdAt || Date.now(),
        }))
      : [createChat()];

    const activeChatId = chats.some((chat) => chat.id === workspace.activeChatId)
      ? workspace.activeChatId
      : chats[0].id;

    const rawSettings = workspace.settings ?? {};
    const defaultModes = createDefaultJarvisModes();
    const existingModes: JarvisMode[] = Array.isArray(rawSettings.jarvisModes) ? rawSettings.jarvisModes as JarvisMode[] : [];
    // Merge: keep user-created modes, ensure all defaults are present
    const defaultIds = new Set(defaultModes.map((m) => m.id));
    const userModes = existingModes.filter((m) => !defaultIds.has(m.id));
    const jarvisModes = [...defaultModes, ...userModes];
    const activeJarvisModeId: string | null =
      rawSettings.activeJarvisModeId === null
        ? null
        : typeof rawSettings.activeJarvisModeId === "string"
          && jarvisModes.some((m) => m.id === rawSettings.activeJarvisModeId)
          ? rawSettings.activeJarvisModeId
          : null;

    const defaultActionModes = createDefaultActionModes();
    const existingActionModes: ActionMode[] = Array.isArray(rawSettings.actionModes) ? rawSettings.actionModes as ActionMode[] : [];
    const defaultActionIds = new Set(defaultActionModes.map((m) => m.id));
    const userActionModes = existingActionModes.filter((m) => !defaultActionIds.has(m.id));
    const actionModes = [...defaultActionModes, ...userActionModes];
    const activeActionModeId =
      typeof rawSettings.activeActionModeId === "string"
      && actionModes.some((m) => m.id === rawSettings.activeActionModeId)
        ? rawSettings.activeActionModeId
        : null;

    const settings = {
      ...createSettings(),
      ...rawSettings,
      ttsVoiceId:
        typeof rawSettings.ttsVoiceId === "string"
        && VOICE_PROFILES.some((voice) => voice.id === rawSettings.ttsVoiceId)
          ? rawSettings.ttsVoiceId
          : "default",
      personalityMode:
        typeof rawSettings.personalityMode === "string"
        && PERSONALITY_MODES.some((mode) => mode.id === rawSettings.personalityMode)
          ? rawSettings.personalityMode
          : "default",
      jarvisModes,
      activeJarvisModeId,
      actionModes,
      activeActionModeId,
    };

    return {
      ...workspace,
      chats,
      activeChatId,
      settings,
      updatedAt: workspace.updatedAt || Date.now(),
      createdAt: workspace.createdAt || Date.now(),
    };
  });

  const activeWorkspaceId = workspaces.some((workspace) => workspace.id === value.activeWorkspaceId)
    ? value.activeWorkspaceId
    : workspaces[0].id;

  const raw = value as Record<string, unknown>;
  const VALID_USER_PLANS: UserPlan[] = ["free", "pro", "pro+"];
  // Migrate legacy plan values
  let userPlan: UserPlan = "free";
  const rawPlan = raw.userPlan as string | undefined;
  if (rawPlan === "pro" || rawPlan === "pro+") {
    userPlan = rawPlan;
  } else if (rawPlan === "premium" || raw.isPremium === true) {
    // old "premium" maps to new "pro+"
    userPlan = "pro+";
  } else if (rawPlan === "starter") {
    // old "starter" maps to new "pro"
    userPlan = "pro";
  } else if (VALID_USER_PLANS.includes(rawPlan as UserPlan)) {
    userPlan = rawPlan as UserPlan;
  }

  return {
    workspaces,
    activeWorkspaceId,
    dark: Boolean(raw.dark),
    userPlan,
    premiumRequestsUsed: typeof raw.premiumRequestsUsed === "number"
      ? raw.premiumRequestsUsed
      : 0,
    appMode: (raw.appMode === "ai-chat" || raw.appMode === "ai-code") ? raw.appMode : "ai-chat",
    pinnedAddOns: Array.isArray(raw.pinnedAddOns) ? raw.pinnedAddOns as string[] : [],
    uiLanguage: typeof raw.uiLanguage === "string" && raw.uiLanguage ? raw.uiLanguage : "en",
  };
}
