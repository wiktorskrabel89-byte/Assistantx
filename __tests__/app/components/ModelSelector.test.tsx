import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModelSelector } from "@/app/components/ModelSelector";

describe("ModelSelector", () => {
  function renderSelector(overrides: Partial<Parameters<typeof ModelSelector>[0]> = {}) {
    const onSelectModel = overrides.onSelectModel ?? jest.fn();
    const utils = render(
      <ModelSelector
        dark={overrides.dark ?? false}
        preferredModelId={overrides.preferredModelId ?? null}
        isPremium={overrides.isPremium ?? true}
        onSelectModel={onSelectModel}
      />
    );
    return { ...utils, onSelectModel };
  }


  it("renders the toggle button expanded by default", () => {
    renderSelector();
    expect(screen.getByRole("button", { name: "Ukryj wybór modelu" })).toBeInTheDocument();
  });

  it("shows Auto button when expanded by default", () => {
    renderSelector();
    expect(screen.getByRole("button", { name: /Auto/i })).toBeInTheDocument();
  });

  it("Auto button is active (has blue class) when preferredModelId is null", () => {
    renderSelector({ preferredModelId: null });
    const autoButton = screen.getByRole("button", { name: /Auto/i });
    expect(autoButton.className).toContain("blue");
  });

  it("Auto button is inactive when a model is selected", () => {
    // Use a model that exists in ALL_MODELS
    renderSelector({ preferredModelId: "openai/gpt-5.1" });
    const autoButton = screen.getByRole("button", { name: /Auto/i });
    expect(autoButton.className).not.toContain("blue-950");
  });

  it("calls onSelectModel(null) when Auto is clicked", () => {
    const { onSelectModel } = renderSelector({ preferredModelId: "openai/gpt-5.1" });
    fireEvent.click(screen.getByRole("button", { name: /Auto/i }));
    expect(onSelectModel).toHaveBeenCalledWith(null);
  });

  it("renders local models as buttons immediately (no async loading)", () => {
    renderSelector();
    // These models are in ALL_MODELS (from lib/ai-config)
    expect(screen.getByRole("button", { name: /anthropic\/claude-opus-4\.6/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /openai\/gpt-5\.1/i })).toBeInTheDocument();
  });

  it("calls onSelectModel with the model id when a model button is clicked", () => {
    const { onSelectModel } = renderSelector();
    fireEvent.click(screen.getByRole("button", { name: /openai\/gpt-5\.1/i }));
    expect(onSelectModel).toHaveBeenCalledWith("openai/gpt-5.1");
  });

  it("collapses the list when toggle is clicked", () => {
    renderSelector();
    fireEvent.click(screen.getByRole("button", { name: "Ukryj wybór modelu" }));
    expect(screen.queryByRole("button", { name: /Auto/i })).not.toBeInTheDocument();
  });

  it("re-expands when toggle is clicked again after collapsing", () => {
    renderSelector();
    fireEvent.click(screen.getByRole("button", { name: "Ukryj wybór modelu" }));
    fireEvent.click(screen.getByRole("button", { name: "Pokaż wybór modelu" }));
    expect(screen.getByRole("button", { name: /Auto/i })).toBeInTheDocument();
  });

  it("shows Pro badge when isPremium is true and isProPlus is false", () => {
    renderSelector({ isPremium: true });
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.queryByText("Pro+")).not.toBeInTheDocument();
  });

  it("shows Pro+ badge when isPremium and isProPlus are true", () => {
    const onSelectModel = jest.fn();
    render(
      <ModelSelector
        dark={false}
        preferredModelId={null}
        isPremium={true}
        isProPlus={true}
        onSelectModel={onSelectModel}
      />
    );
    expect(screen.getByText("Pro+")).toBeInTheDocument();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
  });

  it("hides plan badge when isPremium is false", () => {
    renderSelector({ isPremium: false });
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(screen.queryByText("Pro+")).not.toBeInTheDocument();
  });

  it("locked models are disabled and do not call onSelectModel", () => {
    // claude-opus-4.6 is a premium model, locked for non-premium users
    const { onSelectModel } = renderSelector({ isPremium: false });
    const lockedBtn = screen.getByRole("button", { name: /claude-opus-4\.6/i });
    expect(lockedBtn).toBeDisabled();
    fireEvent.click(lockedBtn);
    expect(onSelectModel).not.toHaveBeenCalled();
  });
});
