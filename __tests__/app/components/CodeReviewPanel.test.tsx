import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CodeReviewPanel } from "@/app/components/CodeReviewPanel";

type Block = { language: string; code: string };

function renderPanel(
  blocks: Block[] = [],
  onCreateFollowUp = jest.fn()
) {
  return render(
    <CodeReviewPanel blocks={blocks} onCreateFollowUp={onCreateFollowUp} />
  );
}

const SINGLE_BLOCK: Block[] = [{ language: "typescript", code: "const x = 1;" }];
const MULTI_BLOCK: Block[] = [
  { language: "typescript", code: "const x = 1;" },
  { language: "python", code: "x = 1" },
];

describe("CodeReviewPanel", () => {
  describe("visibility", () => {
    it("renders nothing when blocks array is empty", () => {
      const { container } = renderPanel([]);
      expect(container.firstChild).toBeNull();
    });

    it("renders the panel when at least one block is provided", () => {
      renderPanel(SINGLE_BLOCK);
      expect(screen.getByText("Code analysis")).toBeInTheDocument();
    });
  });

  describe("metadata line", () => {
    it("shows singular 'block' for a single code block", () => {
      renderPanel(SINGLE_BLOCK);
      expect(screen.getByText(/1 block •/)).toBeInTheDocument();
    });

    it("shows plural 'blocks' for multiple code blocks", () => {
      renderPanel(MULTI_BLOCK);
      expect(screen.getByText(/2 blocks •/)).toBeInTheDocument();
    });

    it("shows total line count across all blocks", () => {
      // SINGLE_BLOCK has 1 line
      renderPanel(SINGLE_BLOCK);
      expect(screen.getByText(/1 lines/)).toBeInTheDocument();
    });

    it("shows the language of a single-language set", () => {
      renderPanel(SINGLE_BLOCK);
      expect(screen.getByText(/typescript/)).toBeInTheDocument();
    });

    it("shows comma-separated languages for a multi-language set", () => {
      renderPanel(MULTI_BLOCK);
      expect(screen.getByText(/typescript, python/)).toBeInTheDocument();
    });

    it("shows 'mixed' when all blocks have empty language", () => {
      renderPanel([{ language: "", code: "x" }]);
      expect(screen.getByText(/mixed/)).toBeInTheDocument();
    });
  });

  describe("action buttons", () => {
    it("renders Review, Find bugs, and Generate tests buttons", () => {
      renderPanel(SINGLE_BLOCK);
      expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Find bugs" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Generate tests" })).toBeInTheDocument();
    });

    it("calls onCreateFollowUp with a prompt containing the code when Review is clicked", () => {
      const onCreateFollowUp = jest.fn();
      renderPanel(SINGLE_BLOCK, onCreateFollowUp);
      fireEvent.click(screen.getByRole("button", { name: "Review" }));
      expect(onCreateFollowUp).toHaveBeenCalledTimes(1);
      const [prompt] = onCreateFollowUp.mock.calls[0] as [string];
      expect(prompt).toContain("const x = 1;");
      expect(prompt.toLowerCase()).toContain("review");
    });

    it("calls onCreateFollowUp with a prompt containing the code when Find bugs is clicked", () => {
      const onCreateFollowUp = jest.fn();
      renderPanel(SINGLE_BLOCK, onCreateFollowUp);
      fireEvent.click(screen.getByRole("button", { name: "Find bugs" }));
      const [prompt] = onCreateFollowUp.mock.calls[0] as [string];
      expect(prompt).toContain("const x = 1;");
      expect(prompt.toLowerCase()).toContain("bugs");
    });

    it("calls onCreateFollowUp with a prompt containing the code when Generate tests is clicked", () => {
      const onCreateFollowUp = jest.fn();
      renderPanel(SINGLE_BLOCK, onCreateFollowUp);
      fireEvent.click(screen.getByRole("button", { name: "Generate tests" }));
      const [prompt] = onCreateFollowUp.mock.calls[0] as [string];
      expect(prompt).toContain("const x = 1;");
      expect(prompt.toLowerCase()).toContain("tests");
    });

    it("includes all block code in the follow-up prompt for multi-block responses", () => {
      const onCreateFollowUp = jest.fn();
      renderPanel(MULTI_BLOCK, onCreateFollowUp);
      fireEvent.click(screen.getByRole("button", { name: "Review" }));
      const [prompt] = onCreateFollowUp.mock.calls[0] as [string];
      expect(prompt).toContain("const x = 1;");
      expect(prompt).toContain("x = 1");
    });
  });

  describe("dark mode", () => {
    it("uses CSS-variable-based border class", () => {
      const { container } = renderPanel(SINGLE_BLOCK);
      expect(container.firstChild).toHaveClass("border-border");
    });

    it("uses CSS-variable-based button styles", () => {
      renderPanel(SINGLE_BLOCK);
      const reviewBtn = screen.getByRole("button", { name: "Review" });
      expect(reviewBtn.className).toContain("border-border");
    });
  });
});
