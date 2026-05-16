import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CodeHistoryPanel } from "@/app/components/CodeHistoryPanel";
import type { Artifact } from "@/app/lib/chat-types";

// SyntaxHighlighter renders complex DOM; a simple stub keeps tests fast.
jest.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children: string }) => <pre data-testid="syntax-highlighter">{children}</pre>,
}));
jest.mock("react-syntax-highlighter/dist/esm/styles/prism", () => ({
  oneDark: {},
  oneLight: {},
}));

const ARTIFACTS: Artifact[] = [
  {
    id: "art-1",
    label: "Helper utils",
    language: "typescript",
    code: "export function help() {}",
    sourceTitle: "Message 1",
  },
  {
    id: "art-2",
    label: "Python script",
    language: "python",
    code: "def run(): pass",
    sourceTitle: "Message 2",
  },
];

function renderPanel(overrides: Partial<Parameters<typeof CodeHistoryPanel>[0]> = {}) {
  const onCopyCode = overrides.onCopyCode ?? jest.fn();
  const onClose = overrides.onClose ?? jest.fn();
  return {
    ...render(
      <CodeHistoryPanel
        open={overrides.open ?? true}
        dark={overrides.dark ?? false}
        artifacts={overrides.artifacts ?? ARTIFACTS}
        copied={overrides.copied ?? null}
        onCopyCode={onCopyCode}
        onClose={onClose}
      />
    ),
    onCopyCode,
    onClose,
  };
}

describe("CodeHistoryPanel", () => {
  describe("visibility", () => {
    it("renders nothing when open=false", () => {
      const { container } = renderPanel({ open: false });
      expect(container.firstChild).toBeNull();
    });

    it("renders the panel when open=true", () => {
      renderPanel({ open: true });
      expect(screen.getByText("Code history")).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty-state message when no artifacts are provided", () => {
      renderPanel({ artifacts: [] });
      expect(screen.getByText(/No code artifacts yet/)).toBeInTheDocument();
    });
  });

  describe("artifact list", () => {
    it("renders all artifact labels in the sidebar list", () => {
      renderPanel();
      expect(screen.getAllByText("Helper utils").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Python script").length).toBeGreaterThanOrEqual(1);
    });

    it("shows the first artifact's code by default", () => {
      renderPanel();
      expect(screen.getByTestId("syntax-highlighter")).toHaveTextContent("export function help() {}");
    });

    it("switches to the selected artifact when clicked", () => {
      renderPanel();
      fireEvent.click(screen.getByText("Python script"));
      expect(screen.getByTestId("syntax-highlighter")).toHaveTextContent("def run(): pass");
    });

    it("shows the artifact language tag in the header bar", () => {
      renderPanel();
      // First artifact is selected by default; language is 'typescript'
      expect(screen.getAllByText("typescript").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("copy button", () => {
    it("calls onCopyCode with the artifact's code and id when Copy code is clicked", () => {
      const { onCopyCode } = renderPanel();
      fireEvent.click(screen.getByRole("button", { name: /Copy code/i }));
      expect(onCopyCode).toHaveBeenCalledWith("export function help() {}", "art-1");
    });

    it("shows 'Copied' label when copied matches the selected artifact id", () => {
      renderPanel({ copied: "art-1" });
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });

    it("shows 'Copy code' label when copied does not match the selected artifact id", () => {
      renderPanel({ copied: "art-2" });
      expect(screen.getByRole("button", { name: /Copy code/i })).toBeInTheDocument();
    });
  });

  describe("close", () => {
    it("calls onClose when the X button inside the header is clicked", () => {
      const { onClose } = renderPanel();
      const closeBtn = screen.getByRole("button", { name: "Close" });
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when the backdrop overlay is clicked", () => {
      const { onClose } = renderPanel();
      const backdrop = screen.getByRole("button", { name: "Close code history panel" });
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when Escape is pressed", () => {
      const { onClose } = renderPanel();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalled();
    });

    it("does not register Escape listener when panel is closed", () => {
      const { onClose } = renderPanel({ open: false });
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("dark mode", () => {
    it("applies dark class to the panel wrapper when dark=true", () => {
      renderPanel({ dark: true });
      const aside = document.querySelector("aside");
      expect(aside?.className).toContain("border-slate-800");
    });

    it("applies light class to the panel wrapper when dark=false", () => {
      renderPanel({ dark: false });
      const aside = document.querySelector("aside");
      expect(aside?.className).toContain("border-slate-200");
    });
  });
});
