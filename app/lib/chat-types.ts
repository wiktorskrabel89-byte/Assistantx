import type { LucideIcon } from "lucide-react";

export type Mode = "auto" | "code" | "chat" | "search" | "image" | "upload";
export type StyleMode = "concise" | "detailed" | "step-by-step";
export type ResponseAction = "summarize" | "checklist" | "translate" | "commit";
export type CloudSyncStatus = "checking" | "syncing" | "synced" | "error" | "local";
export type SidebarTab = "chat" | "workspace" | "integrations" | "artifacts" | "account";
export type MessageFeedback = "love" | "helpful" | "mixed" | "needs-work";

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
  createdAt: number;
};

export type ChatThread = {
  id: string;
  title: string;
  messages: ChatEntry[];
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

export type StoredState = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  dark: boolean;
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

export type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

export type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
};

export type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

export type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

export type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export type BrowserWindow = Window & typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};