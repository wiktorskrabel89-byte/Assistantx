import type { LucideIcon } from "lucide-react";
import type { CostMode, PersonalityMode, UserPlan } from "@/lib/ai-config";

export type Mode = "auto" | "code" | "chat" | "search" | "image" | "upload";
export type StyleMode = "concise" | "detailed" | "step-by-step";
export type ResponseAction = "summarize" | "checklist" | "translate" | "commit";
export type CloudSyncStatus = "checking" | "syncing" | "synced" | "error" | "local";
export type SidebarTab = "chat" | "workspace" | "integrations" | "artifacts" | "account";
export type MessageFeedback = 1 | 2 | 3 | 4 | 5;

export type ChatEntry = {
  id: string;
  user: string;
  ai: string;
  model: string | null;
  imageUrl?: string;
  imageGeneration?: {
    provider: string;
    model: string;
    stages: string[];
  };
  filePreview?: string;
  fileName?: string;
  reasoning?: string;
  routeReason?: string;
  status?: string;
  stopped?: boolean;
  feedback?: MessageFeedback;
  reviewText?: string;
  agentLoopStatus?: string;
  agentLogs?: string;
  agentAttempt?: number;
  criticScore?: number | null;
  quotaRemaining?: number | null;
  quotaMax?: number | null;
  tokenEstimateK?: number | null;
  createdAt: number;
};

export type ChatThread = {
  id: string;
  title: string;
  messages: ChatEntry[];
  tags?: string[];
  createdAt: number;
  updatedAt: number;
};

export type PromptTemplate = {
  id: string;
  label: string;
  text: string;
  mode: Mode;
  createdAt: number;
  updatedAt: number;
};

export type JarvisMode = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  icon?: string;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ActionStepType = "open_url" | "switch_jarvis_mode" | "send_message";

export type ActionStep = {
  id: string;
  type: ActionStepType;
  label: string;
  /** For open_url: the URL or deep-link to open */
  url?: string;
  /** For switch_jarvis_mode: id of a JarvisMode preset */
  jarvisModeId?: string;
  /** For send_message: message text to queue in chat */
  message?: string;
};

export type ActionMode = {
  id: string;
  name: string;
  icon: string;
  description: string;
  steps: ActionStep[];
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CustomAgent = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  preferredMode: Mode;
  createdAt: number;
  updatedAt: number;
};

export type LocalServerApiType = "ollama" | "lmstudio" | "openai-compat";

export type LocalServerEntry = {
  id: string;
  label: string;
  baseUrl: string;
  apiType: LocalServerApiType;
  enabled: boolean;
  discoveredModels: string[];
  lastScannedAt: number | null;
};

export type LocalModelAssignment = {
  chatModelId: string | null;
  codeModelId: string | null;
  externalApiModelId: string | null;
  serverId: string | null;
};

export type WorkspaceSettings = {
  activeAgentId: string;
  customAgents: CustomAgent[];
  lastMode: Mode;
  memoryEnabled: boolean;
  memoryNotes: string;
  promptTemplates: PromptTemplate[];
  styleMode: StyleMode;
  languageLock: string;
  preferredModelId: string | null;
  modelProfile: "default" | "gpt-oss-chat" | "gpt-oss-code";
  temperature: number;
  topP: number;
  repetitionPenalty: number;
  costMode: CostMode;
  systemPrompt: string;
  enabledTools: string[];
  wakeWordEnabled: boolean;
  wakeWordPhrase: string;
  sttEnabled: boolean;
  ttsEnabled: boolean;
  voiceLanguage: string;
  ttsVoiceId: string;
  autoSpeakResponses: boolean;
  personalityMode: PersonalityMode;
  jarvisModes: JarvisMode[];
  activeJarvisModeId: string | null;
  actionModes: ActionMode[];
  activeActionModeId: string | null;
  syncChatHistory: boolean;
  syncMemories: boolean;
  syncTasksReminders: boolean;
  syncVoiceSettings: boolean;
  syncAnalyticsUsage: boolean;
  syncAutomations: boolean;
  syncLocalFiles: boolean;
  localOnlyMode: boolean;
  localServers: LocalServerEntry[];
  localModelAssignment: LocalModelAssignment;
  preferLocalWhenAvailable: boolean;
  encryptedSync: boolean;
  pauseSync: boolean;
  postPrReviewCommentsToGitHub: boolean;
  multiAgentBeta: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  chats: ChatThread[];
  activeChatId: string;
  settings: WorkspaceSettings;
  createdAt: number;
  updatedAt: number;
};

export type AppMode = "ai-chat" | "ai-code";

/**
 * Curated visual themes.
 * - "default"    → the classic two-state dark/light toggle (no extra CSS class)
 * - "midnight"   → deep navy with violet accents
 * - "ocean"      → dark blue with cyan accents
 * - "slate"      → neutral grey professional
 * - "cyberpunk"  → near-black with electric cyan/magenta
 */
export type AppTheme = "default" | "midnight" | "ocean" | "slate" | "cyberpunk";

export type StoredState = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  dark: boolean;
  /** Active curated theme preset. Overrides `dark` for the preset themes. */
  theme?: AppTheme;
  userPlan: UserPlan;
  premiumRequestsUsed: number;
  appMode: AppMode;
  pinnedAddOns: string[];
  /** BCP-47-like UI language code, e.g. "en" | "pl" | "de" | "es" | "fr". Defaults to "en". */
  uiLanguage: string;
};

export type Artifact = {
  id: string;
  language: string;
  code: string;
  label: string;
  sourceTitle: string;
};

export type QueuedMessage = {
  id: string;
  workspaceId: string;
  chatId: string;
  text: string;
  mode: Mode;
  file: File | null;
  filePreview: string | null;
  createdAt: number;
  thinkingEffort?: number;
};

export type SharePayload = {
  title: string;
  messages: Array<{
    user: string;
    ai: string;
    model: string | null;
    imageUrl?: string;
    fileName?: string;
    reasoning?: string;
    routeReason?: string;
    feedback?: MessageFeedback;
    reviewText?: string;
  }>;
};

export type CloudSyncErrorPayload = {
  code?: string;
  error?: string;
  hint?: string;
};

export type ChatSessionItem = {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  isActive: boolean;
};

export type BuiltInAgent = {
  id: string;
  name: string;
  description: string;
  preferredMode: Mode;
  icon: LucideIcon;
};

export type ToolbarTab = {
  id: SidebarTab;
  label: string;
  icon: LucideIcon;
};
