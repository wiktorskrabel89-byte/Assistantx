/**
 * Memory V1 — round-trip + cap behaviour. Uses the in-memory storage
 * adapter so tests don't touch real localStorage and don't leak state.
 */

import {
  appendConversation,
  createInMemoryStorage,
  exportMemory,
  forgetLongTerm,
  getPreference,
  listLongTerm,
  MEMORY_V1_CAPS,
  readMemory,
  rememberLongTerm,
  setCustomInstructions,
  setPreference,
  wipeMemory,
} from "../app/lib/memory-v1";

describe("memory-v1", () => {
  test("defaults to empty schema", () => {
    const storage = createInMemoryStorage();
    const state = readMemory(storage);
    expect(state.schemaVersion).toBe(1);
    expect(state.preferences).toEqual({});
    expect(state.customInstructions.systemPrompt).toBe("");
    expect(state.conversationMemory).toEqual([]);
    expect(state.longTermMemory).toEqual([]);
  });

  test("preferences round-trip", () => {
    const storage = createInMemoryStorage();
    setPreference("theme", "dark-obsidian", storage);
    setPreference("answers", 42, storage);
    setPreference("flag", true, storage);
    expect(getPreference("theme", null, storage)).toBe("dark-obsidian");
    expect(getPreference("answers", null, storage)).toBe(42);
    expect(getPreference("flag", null, storage)).toBe(true);
    expect(getPreference("missing", "fallback", storage)).toBe("fallback");
  });

  test("custom instructions filters non-string behaviour rules", () => {
    const storage = createInMemoryStorage();
    setCustomInstructions(
      {
        systemPrompt: "Always be concise.",
        persona: "Coach",
        behaviorRules: ["No tabs", "No emoji", "", "Polish UI only"],
      },
      storage,
    );
    const out = readMemory(storage).customInstructions;
    expect(out.systemPrompt).toBe("Always be concise.");
    expect(out.persona).toBe("Coach");
    expect(out.behaviorRules).toEqual(["No tabs", "No emoji", "Polish UI only"]);
  });

  test("conversation memory respects cap", () => {
    const storage = createInMemoryStorage();
    const overage = 25;
    const total = MEMORY_V1_CAPS.conversation + overage;
    for (let i = 0; i < total; i += 1) {
      appendConversation({ role: "user", text: `msg-${i}` }, storage);
    }
    const state = readMemory(storage);
    expect(state.conversationMemory.length).toBe(MEMORY_V1_CAPS.conversation);
    // Oldest entries dropped; newest preserved.
    expect(state.conversationMemory[0].text).toBe(`msg-${overage}`);
    expect(state.conversationMemory[state.conversationMemory.length - 1].text).toBe(`msg-${total - 1}`);
  });

  test("long-term remember + forget cycle", () => {
    const storage = createInMemoryStorage();
    const a = rememberLongTerm({ text: "user prefers Polish", kind: "preference", tags: ["lang"] }, storage);
    const b = rememberLongTerm({ text: "remind me about deploy", kind: "note" }, storage);
    expect(listLongTerm(storage).length).toBe(2);
    expect(forgetLongTerm(a.id, storage)).toBe(true);
    expect(forgetLongTerm(a.id, storage)).toBe(false); // already gone
    const remaining = listLongTerm(storage);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(b.id);
  });

  test("wipe resets to defaults", () => {
    const storage = createInMemoryStorage();
    setPreference("theme", "dark", storage);
    rememberLongTerm({ text: "anything" }, storage);
    wipeMemory(storage);
    const state = readMemory(storage);
    expect(state.preferences).toEqual({});
    expect(state.longTermMemory).toEqual([]);
  });

  test("export is valid JSON of current state", () => {
    const storage = createInMemoryStorage();
    setPreference("a", "b", storage);
    const json = exportMemory(storage);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.preferences.a).toBe("b");
  });
});
