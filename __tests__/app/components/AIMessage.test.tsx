import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AIMessage } from "@/app/components/AIMessage";
import type { ChatEntry } from "@/app/lib/chat-types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Stub heavy markdown/syntax-highlighter rendering
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

jest.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children: string }) => <pre>{children}</pre>,
}));

jest.mock("react-syntax-highlighter/dist/esm/styles/prism", () => ({
  oneDark: {},
  oneLight: {},
}));

// Stub child panels so we don't pull in their full logic
jest.mock("@/app/components/CodeReviewPanel", () => ({
  CodeReviewPanel: ({ blocks, onCreateFollowUp }: { blocks: unknown[]; onCreateFollowUp: (p: string) => void }) => (
    blocks.length > 0
      ? <div data-testid="code-review-panel"><button onClick={() => onCreateFollowUp("review prompt")}>Review</button></div>
      : null
  ),
}));

jest.mock("@/app/components/ReviewPanel", () => ({
  ReviewPanel: ({ onRatingChange }: { onRatingChange: (v: number | null) => void }) => (
    <div data-testid="review-panel"><button onClick={() => onRatingChange(5)}>Rate</button></div>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<ChatEntry> = {}): ChatEntry {
  return {
    id: "entry-1",
    user: "Hello",
    ai: "Hello back",
    model: null,
    createdAt: 1,
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  dark: false,
  cardBg: "bg-white",
  codeBg: "bg-gray-100",
  copied: null as string | null,
  isStreaming: false,
  reasoningOpen: false,
  rating: undefined as number | undefined,
  reviewText: undefined as string | undefined,
  onCopyText: jest.fn(),
  onToggleReasoning: jest.fn(),
  onResponseAction: jest.fn(),
  onCreateFollowUp: jest.fn(),
  onRatingChange: jest.fn(),
  onReviewTextChange: jest.fn(),
};

function renderMessage(entry: ChatEntry, overrides: Partial<typeof DEFAULT_PROPS> = {}) {
  const props = { ...DEFAULT_PROPS, ...overrides };
  return render(<AIMessage entry={entry} {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AIMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("basic text rendering", () => {
    it("renders the ai text via ReactMarkdown when not streaming", () => {
      renderMessage(makeEntry({ ai: "Hello back" }));
      expect(screen.getByTestId("markdown")).toHaveTextContent("Hello back");
    });

    it("renders raw text while streaming", () => {
      renderMessage(makeEntry({ ai: "partial…" }), { isStreaming: true });
      expect(screen.getByText("partial…")).toBeInTheDocument();
      expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
    });

    it("renders streaming placeholder when ai is empty and isStreaming is true", () => {
      renderMessage(makeEntry({ ai: "" }), { isStreaming: true });
      expect(screen.getByText(/Thinking.../i)).toBeInTheDocument();
    });

    it("renders status text while streaming", () => {
      renderMessage(makeEntry({ ai: "text", status: "Searching the web..." }), { isStreaming: true });
      expect(screen.getByText("Searching the web...")).toBeInTheDocument();
    });

    it("shows routeReason in placeholder when streaming and ai is empty", () => {
      renderMessage(makeEntry({ ai: "", routeReason: "Using GPT-5" }), { isStreaming: true });
      expect(screen.getAllByText("Using GPT-5").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("image entries", () => {
    it("renders an img tag when imageUrl is set", () => {
      renderMessage(makeEntry({ imageUrl: "https://example.com/img.png" }));
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "https://example.com/img.png");
    });
  });

  describe("reasoning section", () => {
    it("renders reasoning toggle when entry.reasoning is set", () => {
      renderMessage(makeEntry({ reasoning: "Step 1, Step 2" }));
      expect(screen.getByText("Reasoning")).toBeInTheDocument();
    });

    it("does not render reasoning toggle when entry.reasoning is absent", () => {
      renderMessage(makeEntry({ reasoning: undefined }));
      expect(screen.queryByText("Reasoning")).not.toBeInTheDocument();
    });

    it("calls onToggleReasoning when the reasoning button is clicked", () => {
      const onToggleReasoning = jest.fn();
      renderMessage(makeEntry({ reasoning: "Some reasoning" }), { onToggleReasoning });
      fireEvent.click(screen.getByText("Reasoning").closest("button")!);
      expect(onToggleReasoning).toHaveBeenCalledWith("entry-1");
    });

    it("shows reasoning text when reasoningOpen is true", () => {
      renderMessage(makeEntry({ reasoning: "My reasoning here" }), { reasoningOpen: true });
      expect(screen.getByText("My reasoning here")).toBeInTheDocument();
    });

    it("shows reasoning text while streaming regardless of reasoningOpen", () => {
      renderMessage(makeEntry({ reasoning: "Thinking…", ai: "" }), { isStreaming: true, reasoningOpen: false });
      expect(screen.getByText("Thinking…")).toBeInTheDocument();
    });
  });

  describe("action toolbar (ai text present, not streaming)", () => {
    it("renders Copy button", () => {
      renderMessage(makeEntry({ ai: "Some text" }));
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    it("calls onCopyText when Copy is clicked", () => {
      const onCopyText = jest.fn();
      renderMessage(makeEntry({ ai: "Some text" }), { onCopyText });
      fireEvent.click(screen.getByText("Copy"));
      expect(onCopyText).toHaveBeenCalledWith("Some text", "entry-1-response");
    });

    it("shows 'Copied' label when copied matches the response id", () => {
      renderMessage(makeEntry({ ai: "text" }), { copied: "entry-1-response" });
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });

    it("calls onResponseAction('summarize', ...) when Summarize is clicked", () => {
      const onResponseAction = jest.fn();
      renderMessage(makeEntry({ ai: "text" }), { onResponseAction });
      fireEvent.click(screen.getByText("Summarize"));
      expect(onResponseAction).toHaveBeenCalledWith("summarize", "text");
    });

    it("calls onResponseAction('checklist', ...) when Checklist is clicked", () => {
      const onResponseAction = jest.fn();
      renderMessage(makeEntry({ ai: "text" }), { onResponseAction });
      fireEvent.click(screen.getByText("Checklist"));
      expect(onResponseAction).toHaveBeenCalledWith("checklist", "text");
    });

    it("calls onResponseAction('translate', ...) when Translate is clicked", () => {
      const onResponseAction = jest.fn();
      renderMessage(makeEntry({ ai: "text" }), { onResponseAction });
      fireEvent.click(screen.getByText("Translate"));
      expect(onResponseAction).toHaveBeenCalledWith("translate", "text");
    });

    it("calls onResponseAction('commit', ...) when Commit msg is clicked", () => {
      const onResponseAction = jest.fn();
      renderMessage(makeEntry({ ai: "text" }), { onResponseAction });
      fireEvent.click(screen.getByText("Commit msg"));
      expect(onResponseAction).toHaveBeenCalledWith("commit", "text");
    });

    it("renders Fork button and calls onFork when clicked", () => {
      const onFork = jest.fn();
      renderMessage(makeEntry({ ai: "text" }), { onFork } as Parameters<typeof renderMessage>[1]);
      fireEvent.click(screen.getByText("Fork"));
      expect(onFork).toHaveBeenCalled();
    });

    it("does not render Fork button when onFork is not provided", () => {
      renderMessage(makeEntry({ ai: "text" }));
      expect(screen.queryByText("Fork")).not.toBeInTheDocument();
    });
  });

  describe("stopped indicator", () => {
    it("shows 'Stopped' when entry.stopped is true", () => {
      renderMessage(makeEntry({ ai: "partial", stopped: true }));
      expect(screen.getByText("Stopped")).toBeInTheDocument();
    });
  });

  describe("search model citations", () => {
    it("strips citation footnotes from the displayed text for perplexity model", () => {
      const entry = makeEntry({
        ai: "Answer text\n[1]: https://example.com",
        model: "perplexity/llama-3.1-sonar-huge-128k-online",
      });
      renderMessage(entry);
      const markdown = screen.getByTestId("markdown");
      expect(markdown.textContent).not.toContain("[1]:");
      expect(markdown.textContent).toContain("Answer text");
    });

    it("renders citation list for perplexity responses", () => {
      const entry = makeEntry({
        ai: "Answer text\n[1]: https://example.com",
        model: "perplexity/llama-3.1-sonar-huge-128k-online",
      });
      renderMessage(entry);
      expect(screen.getByText("[1]")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "https://example.com" })).toBeInTheDocument();
    });

    it("does not render citations for non-search models", () => {
      const entry = makeEntry({
        ai: "Answer\n[1]: https://example.com",
        model: "openai/gpt-5.2",
      });
      renderMessage(entry);
      // The citation block should not appear
      expect(screen.queryByText("[1]")).not.toBeInTheDocument();
    });
  });

  describe("child panels", () => {
    it("renders CodeReviewPanel (stubbed) when there are code blocks in ai text", () => {
      const entry = makeEntry({ ai: "```typescript\nconst x = 1;\n```" });
      renderMessage(entry);
      expect(screen.getByTestId("code-review-panel")).toBeInTheDocument();
    });

    it("renders ReviewPanel (stubbed) when ai text is non-empty", () => {
      renderMessage(makeEntry({ ai: "some response" }));
      expect(screen.getByTestId("review-panel")).toBeInTheDocument();
    });

    it("does not render ReviewPanel when ai text is empty", () => {
      renderMessage(makeEntry({ ai: "" }));
      expect(screen.queryByTestId("review-panel")).not.toBeInTheDocument();
    });
  });

  describe("TTS (text-to-speech) support", () => {
    afterEach(() => {
      // Remove any mock speechSynthesis so subsequent tests see jsdom's default
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).speechSynthesis;
    });

    it("shows 'Speak' button when speechSynthesis is available", () => {
      Object.defineProperty(window, "speechSynthesis", {
        value: { cancel: jest.fn(), speak: jest.fn() },
        writable: true,
        configurable: true,
      });
      renderMessage(makeEntry({ ai: "hello" }));
      expect(screen.getByRole("button", { name: "Read response aloud" })).toBeInTheDocument();
    });

    it("does not show 'Speak' button when speechSynthesis is unavailable", () => {
      // Ensure speechSynthesis is absent for this test
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).speechSynthesis;
      renderMessage(makeEntry({ ai: "hello" }));
      expect(screen.queryByRole("button", { name: "Read response aloud" })).not.toBeInTheDocument();
    });

    it("calls speechSynthesis.speak when Speak is clicked", () => {
      const speak = jest.fn();
      const cancel = jest.fn();
      // Also stub SpeechSynthesisUtterance which jsdom doesn't provide
      const utteranceMock = { onend: null as (() => void) | null, onerror: null as (() => void) | null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).SpeechSynthesisUtterance = jest.fn(() => utteranceMock);
      Object.defineProperty(window, "speechSynthesis", {
        value: { cancel, speak },
        writable: true,
        configurable: true,
      });
      renderMessage(makeEntry({ ai: "hello" }));
      fireEvent.click(screen.getByRole("button", { name: "Read response aloud" }));
      expect(speak).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).SpeechSynthesisUtterance;
    });
  });
});
