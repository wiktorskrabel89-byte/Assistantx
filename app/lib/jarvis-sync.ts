import { createHash } from "node:crypto";

export const JARVIS_SYNC_SCHEMA_VERSION = 1;
const MAX_SYNC_HISTORY = 50;
const MAX_SYNC_TASKS = 80;
const MAX_SYNC_SCHEDULES = 80;
const MAX_MEMORY_LINES = 250;

export type JarvisSyncOptions = {
  syncChatHistory: boolean;
  syncMemories: boolean;
  syncTasksReminders: boolean;
  syncVoiceSettings: boolean;
  syncAnalyticsUsage: boolean;
  syncAutomations: boolean;
  syncLocalFiles: boolean;
  localOnlyMode: boolean;
  encryptedSync: boolean;
  pauseSync: boolean;
};

export const DEFAULT_JARVIS_SYNC_OPTIONS: JarvisSyncOptions = {
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

type JsonRecord = Record<string, unknown>;

type JarvisCloudState = {
  preferences: JsonRecord;
  history: JsonRecord[];
  tasks: JsonRecord[];
  schedules: JsonRecord[];
  reminders: JsonRecord[];
  voiceSettings: JsonRecord;
  syncOptions: JarvisSyncOptions;
  syncMetadata: JsonRecord;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function asArrayRecords(value: unknown, limit: number): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, limit) as JsonRecord[];
}

function sanitizeSyncOptions(value: unknown): JarvisSyncOptions {
  const raw = asRecord(value);
  return {
    syncChatHistory: typeof raw.syncChatHistory === "boolean" ? raw.syncChatHistory : DEFAULT_JARVIS_SYNC_OPTIONS.syncChatHistory,
    syncMemories: typeof raw.syncMemories === "boolean" ? raw.syncMemories : DEFAULT_JARVIS_SYNC_OPTIONS.syncMemories,
    syncTasksReminders: typeof raw.syncTasksReminders === "boolean" ? raw.syncTasksReminders : DEFAULT_JARVIS_SYNC_OPTIONS.syncTasksReminders,
    syncVoiceSettings: typeof raw.syncVoiceSettings === "boolean" ? raw.syncVoiceSettings : DEFAULT_JARVIS_SYNC_OPTIONS.syncVoiceSettings,
    syncAnalyticsUsage: typeof raw.syncAnalyticsUsage === "boolean" ? raw.syncAnalyticsUsage : DEFAULT_JARVIS_SYNC_OPTIONS.syncAnalyticsUsage,
    syncAutomations: typeof raw.syncAutomations === "boolean" ? raw.syncAutomations : DEFAULT_JARVIS_SYNC_OPTIONS.syncAutomations,
    syncLocalFiles: typeof raw.syncLocalFiles === "boolean" ? raw.syncLocalFiles : DEFAULT_JARVIS_SYNC_OPTIONS.syncLocalFiles,
    localOnlyMode: typeof raw.localOnlyMode === "boolean" ? raw.localOnlyMode : DEFAULT_JARVIS_SYNC_OPTIONS.localOnlyMode,
    encryptedSync: typeof raw.encryptedSync === "boolean" ? raw.encryptedSync : DEFAULT_JARVIS_SYNC_OPTIONS.encryptedSync,
    pauseSync: typeof raw.pauseSync === "boolean" ? raw.pauseSync : DEFAULT_JARVIS_SYNC_OPTIONS.pauseSync,
  };
}

function normalizeText(value: unknown, max = 220): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toIso(value: unknown): string {
  const d = new Date(typeof value === "string" || typeof value === "number" ? value : Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function mergeByNewest(left: JsonRecord[], right: JsonRecord[]): JsonRecord[] {
  const byId = new Map<string, JsonRecord>();
  for (const item of [...left, ...right]) {
    const id = normalizeText(item.id, 120);
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, item);
      continue;
    }
    const existingUpdated = Date.parse(String(existing.updatedAt ?? existing.createdAt ?? 0));
    const incomingUpdated = Date.parse(String(item.updatedAt ?? item.createdAt ?? 0));
    if (incomingUpdated >= existingUpdated) byId.set(id, item);
  }
  return Array.from(byId.values());
}

function appendUniqueLines(existingText: string, lines: string[], maxLines = MAX_MEMORY_LINES): string {
  const existingLines = existingText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set(existingLines);
  const merged = [...existingLines];
  for (const line of lines) {
    if (!line || seen.has(line)) continue;
    seen.add(line);
    merged.push(line);
  }
  return merged.slice(-maxLines).join("\n");
}

function historyToMemoryLines(history: JsonRecord[]): string[] {
  return history
    .map((entry) => {
      const userText = normalizeText(entry.user ?? entry.prompt ?? entry.text, 120);
      const assistantText = normalizeText(entry.ai ?? entry.assistant ?? entry.response ?? entry.result, 140);
      if (!userText && !assistantText) return "";
      const createdAt = toIso(entry.createdAt ?? entry.timestamp);
      const stamp = createdAt.slice(0, 16).replace("T", " ");
      return `• [Jarvis ${stamp}] ${userText || "Command"}${assistantText ? ` → ${assistantText}` : ""}`.slice(0, 240);
    })
    .filter(Boolean);
}

function mapHistoryToChatEntries(history: JsonRecord[]): JsonRecord[] {
  return history.reduce<JsonRecord[]>((acc, entry) => {
      const user = normalizeText(entry.user ?? entry.prompt ?? entry.text, 2000);
      const ai = normalizeText(entry.ai ?? entry.assistant ?? entry.response ?? entry.result, 3000);
      if (!user && !ai) return acc;
      const createdAt = Date.parse(toIso(entry.createdAt ?? entry.timestamp));
      const fingerprint = createHash("sha1").update(`${user}|${ai}|${createdAt}`).digest("hex");
      acc.push({
        id: `jarvis-sync-${fingerprint}`,
        user,
        ai,
        model: "jarvis-desktop",
        createdAt,
      });
      return acc;
    }, []);
}

export function normalizeJarvisCloudPayload(raw: unknown): JarvisCloudState {
  const payload = asRecord(raw);
  const preferences = asRecord(payload.preferences);
  const history = asArrayRecords(payload.history, MAX_SYNC_HISTORY);
  const tasks = asArrayRecords(payload.tasks, MAX_SYNC_TASKS);
  const schedules = asArrayRecords(payload.schedules, MAX_SYNC_SCHEDULES);
  const reminders = asArrayRecords(payload.reminders, MAX_SYNC_SCHEDULES);
  const voiceSettings = asRecord(payload.voiceSettings ?? preferences.voiceSettings);
  const syncOptions = sanitizeSyncOptions(payload.syncOptions ?? preferences.syncOptions);
  const syncMetadata = {
    schemaVersion: JARVIS_SYNC_SCHEMA_VERSION,
    sourceDevice: normalizeText(asRecord(payload.syncMetadata).sourceDevice, 80) || "jarvis-desktop",
    clientUpdatedAt: toIso(asRecord(payload.syncMetadata).clientUpdatedAt ?? Date.now()),
    serverMergedAt: new Date().toISOString(),
  };

  return {
    preferences,
    history,
    tasks,
    schedules,
    reminders,
    voiceSettings,
    syncOptions,
    syncMetadata,
  };
}

export function mergeJarvisIntoWorkspaceState(
  workspaceState: unknown,
  jarvisCloudRaw: unknown,
): unknown {
  const state = asRecord(workspaceState);
  const workspaces = Array.isArray(state.workspaces) ? [...state.workspaces] as JsonRecord[] : [];
  if (workspaces.length === 0) return workspaceState;

  const jarvis = normalizeJarvisCloudPayload(jarvisCloudRaw);
  const activeId = typeof state.activeWorkspaceId === "string" ? state.activeWorkspaceId : null;
  const workspaceIndex = workspaces.findIndex((ws) => ws.id === activeId);
  const idx = workspaceIndex >= 0 ? workspaceIndex : 0;
  const currentWorkspace = asRecord(workspaces[idx]);
  const currentSettings = asRecord(currentWorkspace.settings);
  const nextSettings: JsonRecord = { ...currentSettings };

  if (jarvis.syncOptions.syncMemories) {
    const pinnedMemories = asArrayRecords(jarvis.preferences.pinnedMemories, 60)
      .map((item) => normalizeText(item.text ?? item.value ?? item.memory, 180))
      .filter(Boolean)
      .map((line) => `• [Pinned] ${line}`);
    const historyLines = historyToMemoryLines(jarvis.history);
    const currentNotes = normalizeText(currentSettings.memoryNotes, 10_000);
    nextSettings.memoryNotes = appendUniqueLines(currentNotes, [...pinnedMemories, ...historyLines]);
  }

  if (jarvis.syncOptions.syncVoiceSettings) {
    const voice = jarvis.voiceSettings;
    if (typeof voice.wakeWordEnabled === "boolean") nextSettings.wakeWordEnabled = voice.wakeWordEnabled;
    if (typeof voice.wakeWordPhrase === "string") nextSettings.wakeWordPhrase = voice.wakeWordPhrase;
    if (typeof voice.sttEnabled === "boolean") nextSettings.sttEnabled = voice.sttEnabled;
    if (typeof voice.ttsEnabled === "boolean") nextSettings.ttsEnabled = voice.ttsEnabled;
    if (typeof voice.voiceLanguage === "string") nextSettings.voiceLanguage = voice.voiceLanguage;
    if (typeof voice.ttsVoiceId === "string") nextSettings.ttsVoiceId = voice.ttsVoiceId;
    if (typeof voice.autoSpeakResponses === "boolean") nextSettings.autoSpeakResponses = voice.autoSpeakResponses;
  }

  const chats = Array.isArray(currentWorkspace.chats) ? [...currentWorkspace.chats] as JsonRecord[] : [];
  if (jarvis.syncOptions.syncChatHistory && chats.length > 0) {
    const activeChatId = typeof currentWorkspace.activeChatId === "string" ? currentWorkspace.activeChatId : null;
    const chatIndex = chats.findIndex((chat) => chat.id === activeChatId);
    const targetChatIndex = chatIndex >= 0 ? chatIndex : 0;
    const chat = asRecord(chats[targetChatIndex]);
    const messages = Array.isArray(chat.messages) ? [...chat.messages] as JsonRecord[] : [];
    const incomingMessages = mapHistoryToChatEntries(jarvis.history);
    const messageIds = new Set(messages.map((message) => String(message.id ?? "")));
    for (const incoming of incomingMessages) {
      const id = String(incoming.id ?? "");
      if (!id || messageIds.has(id)) continue;
      messageIds.add(id);
      messages.push(incoming);
    }
    chats[targetChatIndex] = {
      ...chat,
      messages: messages.slice(-MAX_SYNC_HISTORY * 2),
      updatedAt: Date.now(),
    };
  }

  const jarvisSync = asRecord(state.jarvisSync);
  const currentTasks = asArrayRecords(jarvisSync.tasks, MAX_SYNC_TASKS);
  const currentSchedules = asArrayRecords(jarvisSync.schedules, MAX_SYNC_SCHEDULES);
  const currentReminders = asArrayRecords(jarvisSync.reminders, MAX_SYNC_SCHEDULES);
  const mergedTasks = jarvis.syncOptions.syncTasksReminders
    ? mergeByNewest(currentTasks, jarvis.tasks).slice(0, MAX_SYNC_TASKS)
    : currentTasks;
  const mergedSchedules = jarvis.syncOptions.syncAutomations
    ? mergeByNewest(currentSchedules, jarvis.schedules).slice(0, MAX_SYNC_SCHEDULES)
    : currentSchedules;
  const mergedReminders = mergeByNewest(currentReminders, jarvis.reminders).slice(0, MAX_SYNC_SCHEDULES);

  workspaces[idx] = {
    ...currentWorkspace,
    chats,
    settings: nextSettings,
    updatedAt: Date.now(),
  };

  return {
    ...state,
    workspaces,
    jarvisSync: {
      ...jarvisSync,
      tasks: mergedTasks,
      schedules: mergedSchedules,
      reminders: mergedReminders,
      syncOptions: jarvis.syncOptions,
      syncMetadata: jarvis.syncMetadata,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function projectWorkspaceStateToJarvisCloud(workspaceState: unknown): JarvisCloudState {
  const state = asRecord(workspaceState);
  const workspaces = Array.isArray(state.workspaces) ? state.workspaces as JsonRecord[] : [];
  const activeId = typeof state.activeWorkspaceId === "string" ? state.activeWorkspaceId : null;
  const workspace = asRecord(workspaces.find((ws) => ws.id === activeId) ?? workspaces[0]);
  const settings = asRecord(workspace.settings);
  const chats = Array.isArray(workspace.chats) ? workspace.chats as JsonRecord[] : [];
  const activeChatId = typeof workspace.activeChatId === "string" ? workspace.activeChatId : null;
  const activeChat = asRecord(chats.find((chat) => chat.id === activeChatId) ?? chats[0]);
  const messages = asArrayRecords(activeChat.messages, 500);

  const history = messages
    .filter((message) => normalizeText(message.user, 1) || normalizeText(message.ai, 1))
    .slice(-MAX_SYNC_HISTORY)
    .map((message) => ({
      id: normalizeText(message.id, 120) || `web-${Date.now()}`,
      user: normalizeText(message.user, 2000),
      ai: normalizeText(message.ai, 3000),
      model: normalizeText(message.model, 120) || null,
      createdAt: toIso(message.createdAt),
    }));

  const jarvisSync = asRecord(state.jarvisSync);
  const syncOptions = sanitizeSyncOptions(jarvisSync.syncOptions);
  const tasks = asArrayRecords(jarvisSync.tasks, MAX_SYNC_TASKS);
  const schedules = asArrayRecords(jarvisSync.schedules, MAX_SYNC_SCHEDULES);
  const reminders = asArrayRecords(jarvisSync.reminders, MAX_SYNC_SCHEDULES);

  return {
    preferences: {
      personalityMode: normalizeText(settings.personalityMode, 64),
      systemPrompt: normalizeText(settings.systemPrompt, 6000),
      enabledTools: Array.isArray(settings.enabledTools) ? settings.enabledTools.slice(0, 100) : [],
      modelProfile: normalizeText(settings.modelProfile, 64),
      temperature: typeof settings.temperature === "number" ? settings.temperature : null,
      topP: typeof settings.topP === "number" ? settings.topP : null,
      memoryEnabled: Boolean(settings.memoryEnabled),
      memoryNotes: normalizeText(settings.memoryNotes, 10_000),
      syncOptions,
    },
    history,
    tasks,
    schedules,
    reminders,
    voiceSettings: {
      wakeWordEnabled: Boolean(settings.wakeWordEnabled),
      wakeWordPhrase: normalizeText(settings.wakeWordPhrase, 120),
      sttEnabled: Boolean(settings.sttEnabled),
      ttsEnabled: Boolean(settings.ttsEnabled),
      voiceLanguage: normalizeText(settings.voiceLanguage, 24),
      ttsVoiceId: normalizeText(settings.ttsVoiceId, 60),
      autoSpeakResponses: Boolean(settings.autoSpeakResponses),
    },
    syncOptions,
    syncMetadata: {
      schemaVersion: JARVIS_SYNC_SCHEMA_VERSION,
      sourceDevice: "web",
      clientUpdatedAt: new Date().toISOString(),
      serverMergedAt: new Date().toISOString(),
    },
  };
}
