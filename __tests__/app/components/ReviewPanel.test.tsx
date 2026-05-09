import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ReviewPanel } from "@/app/components/ReviewPanel";
import type { MessageFeedback } from "@/app/lib/chat-types";

function renderPanel(overrides: Partial<Parameters<typeof ReviewPanel>[0]> = {}) {
  const onRatingChange = overrides.onRatingChange ?? jest.fn();
  const onReviewTextChange = overrides.onReviewTextChange ?? jest.fn();
  const utils = render(
    <ReviewPanel
      rating={overrides.rating}
      reviewText={overrides.reviewText}
      onRatingChange={onRatingChange}
      onReviewTextChange={onReviewTextChange}
    />
  );
  return { ...utils, onRatingChange, onReviewTextChange };
}

describe("ReviewPanel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("star rating", () => {
    it("renders 5 star buttons", () => {
      renderPanel();
      const stars = screen.getAllByRole("button").filter((b) =>
        b.getAttribute("aria-label")?.match(/gwiazdek/)
      );
      expect(stars).toHaveLength(5);
    });

    it("calls onRatingChange with the clicked star value", () => {
      const { onRatingChange } = renderPanel();
      fireEvent.click(screen.getByRole("button", { name: "3 gwiazdek" }));
      expect(onRatingChange).toHaveBeenCalledWith(3);
    });

    it("calls onRatingChange(null) when same star is clicked again (toggle off)", () => {
      const { onRatingChange } = renderPanel({ rating: 3 as MessageFeedback });
      fireEvent.click(screen.getByRole("button", { name: "3 gwiazdek" }));
      expect(onRatingChange).toHaveBeenCalledWith(null);
    });

    it("fills stars up to the current rating", () => {
      renderPanel({ rating: 4 as MessageFeedback });
      // Stars 1-4 should have amber fill class; count via class selector on the SVG elements
      const amberStars = document.querySelectorAll("svg.fill-amber-400");
      expect(amberStars.length).toBe(4);
    });

    it("highlights hovered stars", () => {
      renderPanel();
      const btn3 = screen.getByRole("button", { name: "3 gwiazdek" });
      fireEvent.mouseEnter(btn3);
      // After hovering star 3, stars 1-3 should be amber
      const amberStars = document.querySelectorAll("svg.fill-amber-400");
      expect(amberStars.length).toBe(3);
    });

    it("resets hover on mouse leave from container", () => {
      renderPanel({ rating: 2 as MessageFeedback });
      const btn3 = screen.getByRole("button", { name: "3 gwiazdek" });
      fireEvent.mouseEnter(btn3);
      // Hover makes 3 stars amber
      expect(document.querySelectorAll("svg.fill-amber-400").length).toBe(3);
      // Mouse leave from the container resets to rating=2
      const container = btn3.closest(".flex.items-center.gap-1")!;
      fireEvent.mouseLeave(container);
      expect(document.querySelectorAll("svg.fill-amber-400").length).toBe(2);
    });
  });

  describe("comment toggle", () => {
    it("shows 'Dodaj komentarz' button when rated without existing comment", () => {
      renderPanel({ rating: 4 as MessageFeedback });
      expect(screen.getByText("Dodaj komentarz")).toBeInTheDocument();
    });

    it("shows 'Edytuj komentarz' button when rated with existing comment", () => {
      renderPanel({ rating: 4 as MessageFeedback, reviewText: "Great!" });
      expect(screen.getByText("Edytuj komentarz")).toBeInTheDocument();
    });

    it("does not show comment toggle when no rating is set", () => {
      renderPanel();
      expect(screen.queryByText("Dodaj komentarz")).not.toBeInTheDocument();
    });

    it("expands the textarea when comment toggle is clicked", () => {
      renderPanel({ rating: 4 as MessageFeedback });
      fireEvent.click(screen.getByText("Dodaj komentarz"));
      expect(screen.getByPlaceholderText("Napisz komentarz (opcjonalnie)...")).toBeInTheDocument();
    });

    it("collapses the textarea when 'Ukryj komentarz' is clicked", () => {
      renderPanel({ rating: 4 as MessageFeedback });
      fireEvent.click(screen.getByText("Dodaj komentarz"));
      expect(screen.getByText("Ukryj komentarz")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Ukryj komentarz"));
      expect(screen.queryByPlaceholderText("Napisz komentarz (opcjonalnie)...")).not.toBeInTheDocument();
    });
  });

  describe("comment textarea", () => {
    it("pre-populates textarea with reviewText when expanded", () => {
      renderPanel({ rating: 4 as MessageFeedback, reviewText: "Excellent!" });
      fireEvent.click(screen.getByText("Edytuj komentarz"));
      expect(screen.getByDisplayValue("Excellent!")).toBeInTheDocument();
    });

    it("updates character count as text is typed", () => {
      renderPanel({ rating: 4 as MessageFeedback });
      fireEvent.click(screen.getByText("Dodaj komentarz"));
      const textarea = screen.getByPlaceholderText("Napisz komentarz (opcjonalnie)...");
      fireEvent.change(textarea, { target: { value: "hello" } });
      expect(screen.getByText("5/500 znaków")).toBeInTheDocument();
    });

    it("calls onReviewTextChange with the trimmed text when save is clicked", () => {
      const { onReviewTextChange } = renderPanel({ rating: 4 as MessageFeedback });
      fireEvent.click(screen.getByText("Dodaj komentarz"));
      const textarea = screen.getByPlaceholderText("Napisz komentarz (opcjonalnie)...");
      fireEvent.change(textarea, { target: { value: "Nice work" } });
      fireEvent.click(screen.getByRole("button", { name: /Zapisz recenzję/i }));
      expect(onReviewTextChange).toHaveBeenCalledWith("Nice work");
    });

    it("shows 'Zapisano ✓' briefly after save, then reverts", () => {
      renderPanel({ rating: 4 as MessageFeedback });
      fireEvent.click(screen.getByText("Dodaj komentarz"));
      fireEvent.click(screen.getByRole("button", { name: /Zapisz recenzję/i }));
      expect(screen.getByText("Zapisano ✓")).toBeInTheDocument();
      act(() => {
        jest.advanceTimersByTime(2100);
      });
      expect(screen.getByRole("button", { name: /Zapisz recenzję/i })).toBeInTheDocument();
    });

    it("shows the saved review text in collapsed mode", () => {
      renderPanel({ rating: 4 as MessageFeedback, reviewText: "Great answer!" });
      // The saved text is shown in collapsed state (not expanded) with curly quotes
      expect(screen.getByText((content) => content.includes("Great answer!"))).toBeInTheDocument();
    });
  });

  describe("dark mode", () => {
    it("uses CSS-variable-based border class", () => {
      const { container } = renderPanel();
      expect(container.firstChild).toHaveClass("border-border");
    });
  });

  describe("expanding behavior resets text from reviewText prop", () => {
    it("syncs localText from reviewText when textarea is re-opened", () => {
      const { rerender } = renderPanel({ rating: 4 as MessageFeedback, reviewText: "Old comment" });
      fireEvent.click(screen.getByText("Edytuj komentarz"));
      // Collapse it
      fireEvent.click(screen.getByText("Ukryj komentarz"));
      // Simulate parent updating reviewText
      rerender(
        <ReviewPanel
          rating={4 as MessageFeedback}
          reviewText="New comment"
          onRatingChange={jest.fn()}
          onReviewTextChange={jest.fn()}
        />
      );
      // Re-open
      fireEvent.click(screen.getByText("Edytuj komentarz"));
      expect(screen.getByDisplayValue("New comment")).toBeInTheDocument();
    });
  });
});
