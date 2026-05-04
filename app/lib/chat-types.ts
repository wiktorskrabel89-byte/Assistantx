import type { LucideIcon } from "lucide-react";
import type { CostMode, UserPlan } from "@/lib/ai-config";

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
  filePreview?: string;
  fileName?: string;
  reasoning?: string;
  routeReason?: string;
  status?: string;
  stopped?: boolean;
  feedback?: MessageFeedback;
  reviewText?: string;
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

export type CustomAgent = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  preferredMode: Mode;
  createdAt: number;
  updatedAt: number;
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
  costMode: CostMode;
  systemPrompt: string;
  enabledTools: string[];
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

export type StoredState = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  dark: boolean;
  userPlan: UserPlan;
  premiumRequestsUsed: number;
  appMode: AppMode;
  pinnedAddOns: string[];
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