/**
 * @jest-environment node
 *
 * Tests for lib/detect.ts — isCodeRequest and isImageRequest helpers.
 */

import {
  isCodeRequest,
  isComplexCodingRequest,
  isImageRequest,
  isHeavyReasoningRequest,
  isVeryLongContext,
} from "@/lib/detect";

// ---------------------------------------------------------------------------
// isCodeRequest
// ---------------------------------------------------------------------------
describe("isCodeRequest", () => {
  it("returns false for an empty string", () => {
    expect(isCodeRequest("")).toBe(false);
  });

  it("returns false for whitespace-only input", () => {
    expect(isCodeRequest("   ")).toBe(false);
  });

  it("detects triple-backtick code fences", () => {
    expect(isCodeRequest("```\nconsole.log('hi')\n```")).toBe(true);
  });

  it("detects HTML-like tags", () => {
    expect(isCodeRequest("Fix this <div> tag please")).toBe(true);
    expect(isCodeRequest("What does </span> do?")).toBe(true);
  });

  it("detects the keyword 'function'", () => {
    expect(isCodeRequest("Write a function to sort an array")).toBe(true);
  });

  it("detects the keyword 'class'", () => {
    expect(isCodeRequest("Explain the class hierarchy")).toBe(true);
  });

  it("detects the keyword 'import'", () => {
    expect(isCodeRequest("How do I import a module in Python?")).toBe(true);
  });

  it("detects the keyword 'typescript'", () => {
    expect(isCodeRequest("Show me TypeScript generics")).toBe(true);
  });

  it("detects the keyword 'python'", () => {
    expect(isCodeRequest("Help me debug this Python script")).toBe(true);
  });

  it("detects 'debug' keyword", () => {
    expect(isCodeRequest("debug the null pointer error")).toBe(true);
  });

  it("detects 'refactor' keyword", () => {
    expect(isCodeRequest("refactor this messy code block")).toBe(true);
  });

  it("detects 'algorithm' keyword", () => {
    expect(isCodeRequest("Explain the algorithm used here")).toBe(true);
  });

  it("detects 'npm' keyword", () => {
    expect(isCodeRequest("How do I install with npm?")).toBe(true);
  });

  it("detects 'api' keyword", () => {
    expect(isCodeRequest("Call the REST api endpoint")).toBe(true);
  });

  it("detects write-code imperative pattern", () => {
    expect(isCodeRequest("Write a script to parse JSON")).toBe(true);
    expect(isCodeRequest("generate a function for sorting")).toBe(true);
    expect(isCodeRequest("create a component for login")).toBe(true);
  });

  it("detects fix-code pattern", () => {
    expect(isCodeRequest("fix this function that crashes")).toBe(true);
  });

  it("detects lines that look like code symbols", () => {
    expect(isCodeRequest("{}()[];")).toBe(true);
  });

  it("returns false for a plain conversational message", () => {
    expect(isCodeRequest("What is the weather like today?")).toBe(false);
  });

  it("returns false for a greeting", () => {
    expect(isCodeRequest("Hello! How are you?")).toBe(false);
  });

  it("is case-insensitive for keywords", () => {
    expect(isCodeRequest("FUNCTION to calculate")).toBe(true);
    expect(isCodeRequest("Python is great")).toBe(true);
  });

  it("returns false for a question about history (no code keywords)", () => {
    expect(isCodeRequest("Tell me about World War II")).toBe(false);
  });
});

describe("isComplexCodingRequest", () => {
  it("returns false for empty/whitespace input", () => {
    expect(isComplexCodingRequest("")).toBe(false);
    expect(isComplexCodingRequest("   ")).toBe(false);
  });

  it("detects debugging and refactoring prompts", () => {
    expect(isComplexCodingRequest("Help me debug this race condition in production")).toBe(true);
    expect(isComplexCodingRequest("How can I refactor this legacy module safely?")).toBe(true);
  });

  it("detects architecture and testing complexity prompts", () => {
    expect(isComplexCodingRequest("Design architecture for a multi-step migration")).toBe(true);
    expect(isComplexCodingRequest("Our integration test is failing and not working")).toBe(true);
  });

  it("returns false for simple coding requests", () => {
    expect(isComplexCodingRequest("Write a function that adds two numbers")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isImageRequest
// ---------------------------------------------------------------------------
describe("isImageRequest", () => {
  it("returns false for an empty string", () => {
    expect(isImageRequest("")).toBe(false);
  });

  it("returns false for whitespace-only input", () => {
    expect(isImageRequest("   ")).toBe(false);
  });

  it("detects 'generate image' pattern", () => {
    expect(isImageRequest("generate an image of a cat")).toBe(true);
  });

  it("detects 'create a picture' pattern", () => {
    expect(isImageRequest("create a picture of a sunset")).toBe(true);
  });

  it("detects 'draw a logo' pattern", () => {
    expect(isImageRequest("draw a logo for my company")).toBe(true);
  });

  it("detects 'make a wallpaper' pattern", () => {
    expect(isImageRequest("make a wallpaper with mountains")).toBe(true);
  });

  it("detects 'design an icon' pattern", () => {
    expect(isImageRequest("design an icon for the app")).toBe(true);
  });

  it("detects '/image' command prefix", () => {
    expect(isImageRequest("/image a futuristic city")).toBe(true);
  });

  it("detects '/image' with leading whitespace", () => {
    expect(isImageRequest("  /image sunset on the beach")).toBe(true);
  });

  it("detects 'image of' phrase", () => {
    expect(isImageRequest("Show me an image of the Eiffel Tower")).toBe(true);
  });

  it("detects 'please show a photo' pattern", () => {
    expect(isImageRequest("please show a photo of the moon")).toBe(true);
  });

  it("returns false for a plain text question", () => {
    expect(isImageRequest("What is machine learning?")).toBe(false);
  });

  it("returns false for a code request that mentions images in passing", () => {
    // Should not trigger — no matching pattern
    expect(isImageRequest("How do I resize images in Python?")).toBe(false);
  });

  it("is case-insensitive for the action verbs", () => {
    expect(isImageRequest("GENERATE an IMAGE of a dog")).toBe(true);
  });

  it("detects 'create art' pattern", () => {
    expect(isImageRequest("create some art for a poster")).toBe(true);
  });

  it("detects 'draw a photo' pattern", () => {
    expect(isImageRequest("draw a photo of a mountain")).toBe(true);
  });

  it("returns false for a message with 'picture' but no triggering verb", () => {
    expect(isImageRequest("I like your profile picture!")).toBe(false);
  });

  it("detects 'please ... image' pattern", () => {
    expect(isImageRequest("please create an image of fireworks")).toBe(true);
  });

  it("detects 'make a poster' pattern", () => {
    expect(isImageRequest("make a poster for my event")).toBe(true);
  });

  it("returns false for an empty slash command (not /image)", () => {
    expect(isImageRequest("/help")).toBe(false);
  });
});

describe("isHeavyReasoningRequest", () => {
  it("returns false for empty/whitespace input", () => {
    expect(isHeavyReasoningRequest("")).toBe(false);
    expect(isHeavyReasoningRequest("   ")).toBe(false);
  });

  it("detects planning, analysis, and strategy prompts", () => {
    expect(isHeavyReasoningRequest("Create a step-by-step plan for this workflow")).toBe(true);
    expect(isHeavyReasoningRequest("Analyze the trade-off between monolith and microservices")).toBe(true);
  });

  it("detects explicit 'how should we design/build' prompts", () => {
    expect(isHeavyReasoningRequest("How should we design this pipeline?")).toBe(true);
    expect(isHeavyReasoningRequest("How would you build this agent workflow?")).toBe(true);
  });

  it("returns false for simple prompts", () => {
    expect(isHeavyReasoningRequest("What time is it in London?")).toBe(false);
  });
});

describe("isVeryLongContext", () => {
  it("returns false when combined length is <= 6000", () => {
    expect(isVeryLongContext("a".repeat(6000), 0)).toBe(false);
  });

  it("returns true when combined length is > 6000", () => {
    expect(isVeryLongContext("a".repeat(6000), 1)).toBe(true);
    expect(isVeryLongContext("hello", 7000)).toBe(true);
  });
});
