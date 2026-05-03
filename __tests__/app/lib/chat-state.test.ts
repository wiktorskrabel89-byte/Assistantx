/**
 * @jest-environment node
 */
import {
  getAllowedModels,
  createId,
  createMessage,
  createDefaultPromptTemplates,
  createSettings,
  createChat,
  createWorkspace,
  createDefaultState,
  readCloudSyncError,
  formatCloudSyncError,
  deriveTitle,
  stripMarkdown,
  toBase64,
  fromBase64,
  extractArtifacts,
  buildChatSessionItems,
  sanitizeForStorage,
  upgradeState,
  NEW_CHAT_TITLE,
  QUICK_CHIPS,
} from "@/app/lib/chat-state";
import type { ChatEntry, ChatThread, StoredState } from "@/app/lib/chat-types";

/* ── getAllowedModels ───────────────────────────────────────────────── */

describe("getAllowedModels", () => {
  it("returns an array for auto mode", () => {
    const result = getAllowedModels("auto");
    expect(Array.isArray(result)).toBe(true);
    expect(result!.length).toBeGreaterThan(0);
  });

  it("returns an array for chat mode", () => {
    expect(Array.isArray(getAllowedModels("chat"))).toBe(true);
  });

  it("returns an array for code mode", () => {
    expect(Array.isArray(getAllowedModels("code"))).toBe(true);
  });

  it("returns an array for search mode", () => {
    expect(Array.isArray(getAllowedModels("search"))).toBe(true);
  });

  it("returns undefined for image mode", () => {
    expect(getAllowedModels("image")).toBeUndefined();
  });

  it("returns undefined for upload mode", () => {
    expect(getAllowedModels("upload")).toBeUndefined();
  });
});

/* ── createId ──────────────────────────────────────────────────────── */

describe("createId", () => {
  it("returns a non-empty string", () => {
    const id = createId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns unique values", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createId()));
    expect(ids.size).toBe(50);
  });
});

/* ── createMessage ─────────────────────────────────────────────────── */

describe("createMessage", () => {
  it("returns defaults when no overrides given", () => {
    const msg = createMessage({});
    expect(msg.user).toBe("");
    expect(msg.ai).toBe("");
    expect(msg.model).toBeNull();
    expect(typeof msg.id).toBe("string");
    expect(typeof msg.createdAt).toBe("number");
  });

  it("applies overrides", () => {
    const msg = createMessage({ user: "hi", ai: "hello", model: "gpt-5" });
    expect(msg.user).toBe("hi");
    expect(msg.ai).toBe("hello");
    expect(msg.model).toBe("gpt-5");
  });
});

/* ── createDefaultPromptTemplates ──────────────────────────────────── */

describe("createDefaultPromptTemplates", () => {
  it("returns one template per QUICK_CHIP", () => {
    const templates = createDefaultPromptTemplates();
    expect(templates).toHaveLength(QUICK_CHIPS.length);
  });

  it("each template has label, text, mode, and timestamps", () => {
    for (const t of createDefaultPromptTemplates()) {
      expect(typeof t.label).toBe("string");
      expect(typeof t.text).toBe("string");
      expect(typeof t.mode).toBe("string");
      expect(typeof t.createdAt).toBe("number");
      expect(typeof t.updatedAt).toBe("number");
    }
  });
});

/* ── createSettings ────────────────────────────────────────────────── */

describe("createSettings", () => {
  it("returns default workspace settings", () => {
    const s = createSettings();
    expect(s.preferredModelId).toBeNull();
    expect(s.memoryEnabled).toBe(true);
    expect(s.styleMode).toBe("concise");
    expect(s.languageLock).toBe("auto");
    expect(s.costMode).toBe("balanced");
    expect(Array.isArray(s.promptTemplates)).toBe(true);
    expect(Array.isArray(s.customAgents)).toBe(true);
  });
});

/* ── createChat ────────────────────────────────────────────────────── */

describe("createChat", () => {
  it("returns a chat with default title", () => {
    const chat = createChat();
    expect(chat.title).toBe(NEW_CHAT_TITLE);
    expect(chat.messages).toEqual([]);
    expect(typeof chat.id).toBe("string");
  });

  it("accepts a custom title", () => {
    expect(createChat("My chat").title).toBe("My chat");
  });
});

/* ── createWorkspace ───────────────────────────────────────────────── */

describe("createWorkspace", () => {
  it("returns a workspace with one chat", () => {
    const ws = createWorkspace();
    expect(ws.name).toBe("Personal");
    expect(ws.chats).toHaveLength(1);
    expect(ws.activeChatId).toBe(ws.chats[0].id);
  });
});

/* ── createDefaultState ────────────────────────────────────────────── */

describe("createDefaultState", () => {
  it("returns state with one workspace", () => {
    const state = createDefaultState();
    expect(state.workspaces).toHaveLength(1);
    expect(state.activeWorkspaceId).toBe(state.workspaces[0].id);
    expect(state.dark).toBe(false);
  });
});

/* ── readCloudSyncError ────────────────────────────────────────────── */

describe("readCloudSyncError", () => {
  it("extracts code, error, and hint from an object", () => {
    const result = readCloudSyncError({ code: "401", error: "Unauthorized", hint: "Log in again" });
    expect(result.code).toBe("401");
    expect(result.error).toBe("Unauthorized");
    expect(result.hint).toBe("Log in again");
  });

  it("returns empty object for null/undefined", () => {
    expect(readCloudSyncError(null)).toEqual({});
    expect(readCloudSyncError(undefined)).toEqual({});
  });

  it("ignores non-string fields", () => {
    const result = readCloudSyncError({ code: 42, error: true });
    expect(result.code).toBeUndefined();
    expect(result.error).toBeUndefined();
  });
});

/* ── formatCloudSyncError ──────────────────────────────────────────── */

describe("formatCloudSyncError", () => {
  it("returns local status for 401", () => {
    const result = formatCloudSyncError(401, {}, "fail");
    expect(result.status).toBe("local");
  });

  it("returns local status when code is unauthorized", () => {
    const result = formatCloudSyncError(500, { code: "unauthorized" }, "fail");
    expect(result.status).toBe("local");
  });

  it("returns error status with hint appended", () => {
    const result = formatCloudSyncError(500, { error: "Oops", hint: "retry" }, "fallback");
    expect(result.status).toBe("error");
    expect(result.message).toBe("Oops retry");
  });

  it("uses fallback message when no error in data", () => {
    const result = formatCloudSyncError(500, {}, "fallback msg");
    expect(result.message).toBe("fallback msg");
  });
});

/* ── deriveTitle ───────────────────────────────────────────────────── */

describe("deriveTitle", () => {
  it("returns NEW_CHAT_TITLE for empty text", () => {
    expect(deriveTitle("")).toBe(NEW_CHAT_TITLE);
    expect(deriveTitle("   ")).toBe(NEW_CHAT_TITLE);
  });

  it("returns short text as-is", () => {
    expect(deriveTitle("Hello world")).toBe("Hello world");
  });

  it("truncates long text to 36 chars + ellipsis", () => {
    const long = "a".repeat(50);
    const title = deriveTitle(long);
    expect(title).toBe("a".repeat(36) + "...");
  });
});

/* ── stripMarkdown ─────────────────────────────────────────────────── */

describe("stripMarkdown", () => {
  it("removes code blocks", () => {
    expect(stripMarkdown("before ```js\ncode\n``` after")).toBe("before  after");
  });

  it("removes inline code", () => {
    expect(stripMarkdown("use `foo` here")).toBe("use  here");
  });

  it("removes headings", () => {
    expect(stripMarkdown("## Title")).toBe("Title");
  });

  it("removes bold/italic markers", () => {
    expect(stripMarkdown("**bold** and *italic*")).toBe("bold and italic");
  });

  it("converts links to text", () => {
    expect(stripMarkdown("[click](http://x.com)")).toBe("click");
  });
});

/* ── toBase64 / fromBase64 ─────────────────────────────────────────── */

describe("toBase64 / fromBase64", () => {
  it("round-trips ASCII text", () => {
    expect(fromBase64(toBase64("hello world"))).toBe("hello world");
  });

  it("round-trips unicode text", () => {
    const text = "こんにちは 🌍";
    expect(fromBase64(toBase64(text))).toBe(text);
  });

  it("round-trips empty string", () => {
    expect(fromBase64(toBase64(""))).toBe("");
  });
});

/* ── extractArtifacts ──────────────────────────────────────────────── */

describe("extractArtifacts", () => {
  it("returns empty array for messages without code blocks", () => {
    const msgs: ChatEntry[] = [createMessage({ ai: "just text" })];
    expect(extractArtifacts(msgs)).toEqual([]);
  });

  it("extracts code blocks from ai messages", () => {
    const msgs: ChatEntry[] = [
      createMessage({ user: "help", ai: "Here:\n```js\nconsole.log(1)\n```" }),
    ];
    const artifacts = extractArtifacts(msgs);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].language).toBe("js");
    expect(artifacts[0].code).toBe("console.log(1)");
  });

  it("extracts multiple blocks from one message", () => {
    const ai = "```py\nprint(1)\n```\ntext\n```ts\nconst x = 1\n```";
    const msgs: ChatEntry[] = [createMessage({ ai })];
    expect(extractArtifacts(msgs)).toHaveLength(2);
  });

  it("skips empty code blocks", () => {
    const msgs: ChatEntry[] = [createMessage({ ai: "```\n\n```" })];
    expect(extractArtifacts(msgs)).toEqual([]);
  });

  it("skips messages with no ai text", () => {
    const msgs: ChatEntry[] = [createMessage({ user: "hi", ai: "" })];
    expect(extractArtifacts(msgs)).toEqual([]);
  });
});

/* ── buildChatSessionItems ─────────────────────────────────────────── */

describe("buildChatSessionItems", () => {
  it("builds items from chats", () => {
    const chat1: ChatThread = {
      ...createChat("First"),
      id: "c1",
      messages: [createMessage({ user: "hello" })],
    };
    const chat2: ChatThread = {
      ...createChat("Second"),
      id: "c2",
      messages: [],
    };
    const items = buildChatSessionItems([chat1, chat2], "c1");

    expect(items).toHaveLength(2);
    expect(items[0].isActive).toBe(true);
    expect(items[0].messageCount).toBe(1);
    expect(items[1].isActive).toBe(false);
  });
});

/* ── sanitizeForStorage ────────────────────────────────────────────── */

describe("sanitizeForStorage", () => {
  it("removes filePreview from all messages", () => {
    const state = createDefaultState();
    state.workspaces[0].chats[0].messages = [
      createMessage({ user: "hi", filePreview: "data:image/png;base64,abc" }),
    ];

    const sanitized = sanitizeForStorage(state);
    const msg = sanitized.workspaces[0].chats[0].messages[0];
    expect(msg.filePreview).toBeUndefined();
    expect(msg.user).toBe("hi");
  });
});

/* ── upgradeState ──────────────────────────────────────────────────── */

describe("upgradeState", () => {
  it("returns null for null input", () => {
    expect(upgradeState(null)).toBeNull();
  });

  it("returns null for state with no workspaces", () => {
    expect(upgradeState({ workspaces: [], activeWorkspaceId: "", dark: false, userPlan: "free", premiumRequestsUsed: 0 })).toBeNull();
  });

  it("upgrades a valid minimal state", () => {
    const state: StoredState = {
      workspaces: [
        {
          id: "ws1",
          name: "Test",
          chats: [
            {
              id: "ch1",
              title: "",
              messages: [{ id: "", user: "hi", ai: "yo", model: null, createdAt: 0 }],
              createdAt: 0,
              updatedAt: 0,
            },
          ],
          activeChatId: "ch1",
          settings: createSettings(),
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      activeWorkspaceId: "ws1",
      dark: true,
      userPlan: "free",
      premiumRequestsUsed: 0,
    };

    const upgraded = upgradeState(state)!;
    expect(upgraded).not.toBeNull();
    expect(upgraded.dark).toBe(true);
    // Empty title should be replaced with NEW_CHAT_TITLE
    expect(upgraded.workspaces[0].chats[0].title).toBe(NEW_CHAT_TITLE);
    // Empty message id should be replaced with a generated id
    expect(upgraded.workspaces[0].chats[0].messages[0].id).not.toBe("");
  });

  it("fixes mismatched activeChatId", () => {
    const state: StoredState = {
      workspaces: [
        {
          id: "ws1",
          name: "Test",
          chats: [{ id: "ch1", title: "Chat", messages: [], createdAt: 1, updatedAt: 1 }],
          activeChatId: "non-existent",
          settings: createSettings(),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      activeWorkspaceId: "ws1",
      dark: false,
      userPlan: "free",
      premiumRequestsUsed: 0,
    };

    const upgraded = upgradeState(state)!;
    expect(upgraded.workspaces[0].activeChatId).toBe("ch1");
  });

  it("creates a default chat when workspace has no chats", () => {
    const state: StoredState = {
      workspaces: [
        {
          id: "ws1",
          name: "Test",
          chats: [],
          activeChatId: "",
          settings: createSettings(),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      activeWorkspaceId: "ws1",
      dark: false,
      userPlan: "free",
      premiumRequestsUsed: 0,
    };

    const upgraded = upgradeState(state)!;
    expect(upgraded.workspaces[0].chats).toHaveLength(1);
  });

  it("migrates old isPremium:true to userPlan:'premium'", () => {
    const legacyState = {
      workspaces: [
        {
          id: "ws1",
          name: "Test",
          chats: [{ id: "ch1", title: "Chat", messages: [], createdAt: 1, updatedAt: 1 }],
          activeChatId: "ch1",
          settings: createSettings(),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      activeWorkspaceId: "ws1",
      dark: false,
      isPremium: true,
      premiumRequestsUsed: 42,
    };

    const upgraded = upgradeState(legacyState as unknown as StoredState)!;
    expect(upgraded.userPlan).toBe("premium");
    expect(upgraded.premiumRequestsUsed).toBe(42);
  });

  it("preserves starter userPlan through upgrade", () => {
    const state: StoredState = {
      workspaces: [
        {
          id: "ws1",
          name: "Test",
          chats: [{ id: "ch1", title: "Chat", messages: [], createdAt: 1, updatedAt: 1 }],
          activeChatId: "ch1",
          settings: createSettings(),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      activeWorkspaceId: "ws1",
      dark: false,
      userPlan: "starter",
      premiumRequestsUsed: 10,
    };

    const upgraded = upgradeState(state)!;
    expect(upgraded.userPlan).toBe("starter");
    expect(upgraded.premiumRequestsUsed).toBe(10);
  });
});
