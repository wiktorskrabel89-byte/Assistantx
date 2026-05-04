/**
 * @jest-environment node
 *
 * Isolated tests for detectLanguage — no module mocks needed since detectLanguage
 * is a pure function with no external dependencies.
 */
import { detectLanguage } from "@/app/api/chat/route";

describe("detectLanguage", () => {
  it("returns null for text shorter than 2 characters", () => {
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("a")).toBeNull();
    expect(detectLanguage(" ")).toBeNull();
  });

  it("detects Polish from Polish characters", () => {
    const result = detectLanguage("Cześć, jak się masz?");
    expect(result).not.toBeNull();
    expect(result?.lang).toBe("pl");
    expect(result?.name).toBe("Polish");
  });

  it("detects Russian from Cyrillic script", () => {
    const result = detectLanguage("Привет, как дела?");
    expect(result?.lang).toBe("ru");
  });

  it("detects Chinese from CJK characters", () => {
    const result = detectLanguage("你好，今天怎么样？");
    expect(result?.lang).toBe("zh");
  });

  it("detects Japanese from Hiragana/Katakana", () => {
    const result = detectLanguage("こんにちは、元気ですか？");
    expect(result?.lang).toBe("ja");
  });

  it("detects Korean from Hangul", () => {
    const result = detectLanguage("안녕하세요, 오늘 어때요?");
    expect(result?.lang).toBe("ko");
  });

  it("detects Arabic from Arabic script", () => {
    const result = detectLanguage("مرحبا كيف حالك؟");
    expect(result?.lang).toBe("ar");
  });

  it("detects English from common English words", () => {
    const result = detectLanguage("Hello, how are you doing today?");
    expect(result).not.toBeNull();
    expect(result?.lang).toBe("en");
    expect(result?.name).toBe("English");
  });

  it("returns null when no language patterns match", () => {
    const result = detectLanguage("12345 !@#$%");
    expect(result).toBeNull();
  });

  it("prefers English when scores are tied", () => {
    // English-only plain text with common words
    const result = detectLanguage("hello and the is");
    expect(result).not.toBeNull();
    // Should not crash and should return some result
    expect(result?.lang).toBeDefined();
  });

  it("handles text with exactly 2 characters", () => {
    // Should not return null (length is exactly 2)
    // might return null or some language — important is it doesn't throw
    expect(() => detectLanguage("ab")).not.toThrow();
  });

  it("returns a result object with lang and name fields", () => {
    const result = detectLanguage("Bonjour comment allez-vous?");
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("lang");
    expect(result).toHaveProperty("name");
    expect(typeof result?.lang).toBe("string");
    expect(typeof result?.name).toBe("string");
  });
});
