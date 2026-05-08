"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { extractArtifacts, stripMarkdown } from "../lib/chat-state";
import type { ChatThread, Workspace, WorkspaceSettings } from "../lib/chat-types";

type PreferencesPatch = Partial<Pick<WorkspaceSettings, "styleMode" | "languageLock" | "memoryEnabled" | "memoryNotes" | "temperature" | "topP" | "repetitionPenalty" | "modelProfile">>;

type FeedbackRecord = {
  chatId: string;
  chatTitle: string;
  messageId: string;
  feedback: string;
  createdAt: number;
};

type InteractionPattern = {
  id: string;
  label: string;
  count: number;
  description: string;
};

type ConversationKnowledge = {
  artifactCount: number;
  fileMentions: string[];
  topTopics: string[];
  artifactLanguages: string[];
  summary: string;
};

function deriveFeedbacks(workspace: Workspace): FeedbackRecord[] {
  return workspace.chats.flatMap((chat) => chat.messages
    .filter((message) => message.feedback)
    .map((message) => ({
      chatId: chat.id,
      chatTitle: chat.title,
      messageId: message.id,
      feedback: String(message.feedback),
      createdAt: message.createdAt,
    }))
  );
}

function deriveInteractionPatterns(workspace: Workspace): InteractionPattern[] {
  const userMessages = workspace.chats.flatMap((chat) => chat.messages.map((message) => message.user).filter(Boolean));
  const patterns: InteractionPattern[] = [
    {
      id: "code",
      label: "Coding requests",
      count: userMessages.filter((message) => /\b(code|bug|component|function|query|test|refactor|api|script)\b/i.test(message)).length,
      description: "Requests focused on implementation, debugging, or code review.",
    },
    {
      id: "research",
      label: "Research requests",
      count: userMessages.filter((message) => /\b(search|latest|docs|documentation|compare|research|current)\b/i.test(message)).length,
      description: "Prompts that need current information, docs, or comparison work.",
    },
    {
      id: "image",
      label: "Image requests",
      count: userMessages.filter((message) => /\b(image|picture|photo|illustration|poster|logo|draw|generate)\b/i.test(message)).length,
      description: "Prompts that likely target image generation or visual analysis.",
    },
  ];

  return patterns.filter((pattern) => pattern.count > 0);
}

function deriveConversationKnowledge(chat: ChatThread): ConversationKnowledge {
  const artifacts = extractArtifacts(chat.messages);
  const fileMentions = Array.from(new Set(chat.messages.map((message) => message.fileName).filter((value): value is string => Boolean(value))));
  const topicCounts = new Map<string, number>();

  for (const message of chat.messages) {
    const words = stripMarkdown(message.user)
      .toLowerCase()
      .split(/[^a-z0-9+#.-]+/i)
      .filter((word) => word.length > 4);
    for (const word of words) {
      topicCounts.set(word, (topicCounts.get(word) ?? 0) + 1);
    }
  }

  const topTopics = Array.from(topicCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([word]) => word);

  const latestUser = chat.messages.slice().reverse().find((message) => message.user)?.user ?? "";
  const latestAi = chat.messages.slice().reverse().find((message) => message.ai)?.ai ?? "";

  return {
    artifactCount: artifacts.length,
    fileMentions,
    topTopics,
    artifactLanguages: Array.from(new Set(artifacts.map((artifact) => artifact.language))),
    summary: [stripMarkdown(latestUser), stripMarkdown(latestAi)].filter(Boolean).join(" -> ").slice(0, 220),
  };
}

export function useWorkspaceQueries({
  activeWorkspace,
  activeChat,
  updateWorkspace,
  updateChat,
  createCustomAgent,
  updateCustomAgent,
}: {
  activeWorkspace: Workspace;
  activeChat: ChatThread;
  updateWorkspace: (workspaceId: string, updater: (workspace: Workspace) => Workspace) => void;
  updateChat: (workspaceId: string, chatId: string, updater: (chat: ChatThread) => ChatThread) => void;
  createCustomAgent: (agent: { name: string; description: string; instructions: string; preferredMode: string }) => void;
  updateCustomAgent: (agentId: string, agent: { name: string; description: string; instructions: string; preferredMode: string }) => void;
}) {
  const queryClient = useQueryClient();
  const baseKey = ["workspace", activeWorkspace.id, activeWorkspace.updatedAt] as const;

  const conversationsQuery = useQuery({
    queryKey: [...baseKey, "conversations"],
    queryFn: () => activeWorkspace.chats,
  });

  const customAgentsQuery = useQuery({
    queryKey: [...baseKey, "customAgents"],
    queryFn: () => activeWorkspace.settings.customAgents,
  });

  const userPreferencesQuery = useQuery({
    queryKey: [...baseKey, "userPreferences"],
    queryFn: () => activeWorkspace.settings,
  });

  const feedbacksQuery = useQuery({
    queryKey: [...baseKey, "feedbacks"],
    queryFn: () => deriveFeedbacks(activeWorkspace),
  });

  const patternsQuery = useQuery({
    queryKey: [...baseKey, "patterns"],
    queryFn: () => deriveInteractionPatterns(activeWorkspace),
  });

  const conversationKnowledgeQuery = useQuery({
    queryKey: [...baseKey, "conversationKnowledge", activeChat.id, activeChat.updatedAt],
    queryFn: () => deriveConversationKnowledge(activeChat),
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (patch: PreferencesPatch) => {
      updateWorkspace(activeWorkspace.id, (workspace) => ({
        ...workspace,
        settings: {
          ...workspace.settings,
          ...patch,
        },
      }));
      return patch;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace", activeWorkspace.id] });
    },
  });

  const createCustomAgentMutation = useMutation({
    mutationFn: async (agent: { name: string; description: string; instructions: string; preferredMode: string }) => {
      createCustomAgent(agent);
      return agent;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace", activeWorkspace.id] });
    },
  });

  const updateCustomAgentMutation = useMutation({
    mutationFn: async ({
      agentId,
      agent,
    }: {
      agentId: string;
      agent: { name: string; description: string; instructions: string; preferredMode: string };
    }) => {
      updateCustomAgent(agentId, agent);
      return { agentId, agent };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace", activeWorkspace.id] });
    },
  });

  const updateConversationMutation = useMutation({
    mutationFn: async ({ chatId, patch }: { chatId: string; patch: Partial<Pick<ChatThread, "title" | "messages">> }) => {
      updateChat(activeWorkspace.id, chatId, (chat) => ({
        ...chat,
        ...patch,
      }));
      return { chatId, patch };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace", activeWorkspace.id] });
    },
  });

  return {
    conversationsQuery,
    customAgentsQuery,
    userPreferencesQuery,
    feedbacksQuery,
    patternsQuery,
    conversationKnowledgeQuery,
    updatePreferencesMutation,
    createCustomAgentMutation,
    updateCustomAgentMutation,
    updateConversationMutation,
  };
}
