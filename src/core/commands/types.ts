export type AssistantCommandId =
  | "os"
  | "game"
  | "open"
  | "screenshot"
  | "sleep"
  | "repo"
  | "index"
  | "file"
  | "search"
  | "ignore"
  | "today"
  | "calendar"
  | "gmail"
  | "draft"
  | "drive"
  | "web"
  | "google"
  | "slack"
  | "db"
  | "skills";

export type CommandExecutionMode =
  | "local_only"
  | "remote_on_paired_device"
  | "cloud_direct"
  | "hybrid_dual";

export type CommandRiskLevel = "low" | "medium" | "high";

export type AssistantCommandDefinition = {
  id: AssistantCommandId;
  slash: `/${AssistantCommandId}`;
  title: string;
  description: string;
  category: "system" | "repo" | "google" | "web" | "jarvis";
  executionMode: CommandExecutionMode;
  riskLevel: CommandRiskLevel;
  requiresDesktop: boolean;
  argsPlaceholder?: string;
  aliases: string[];
  examples: string[];
};

export type ParsedAssistantCommand = {
  id: AssistantCommandId;
  slash: `/${AssistantCommandId}`;
  argsText: string;
  matchedBy: "slash" | "alias";
  rawInput: string;
};

export type CommandEnvelope = {
  commandId: AssistantCommandId;
  slash: `/${AssistantCommandId}`;
  argsText: string;
  executionMode: CommandExecutionMode;
  matchedBy: "slash" | "alias";
  source: "web" | "desktop";
  conversationId?: string | null;
  correlationId?: string | null;
  deviceId?: string | null;
};
