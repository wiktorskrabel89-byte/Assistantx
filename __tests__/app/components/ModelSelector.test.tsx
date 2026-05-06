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

  function openSelector(overrides: Partial<Parameters<typeof ModelSelector>[0]> = {}) {
    const result = renderSelector(overrides);
    fireEvent.click(screen.getByRole("button", { name: "Pokaż wybór modelu" }));
    return result;
  }

  it("renders the toggle button collapsed by default", () => {
    renderSelector();
    expect(screen.getByRole("button", { name: "Pokaż wybór modelu" })).toBeInTheDocument();
  });

  it("shows Auto button after expanding", () => {
    openSelector();
    expect(screen.getByRole("button", { name: /Auto/i })).toBeInTheDocument();
  });

  it("Auto button is active (has blue class) when preferredModelId is null", () => {
    openSelector({ preferredModelId: null });
    const autoButton = screen.getByRole("button", { name: /Auto/i });
    expect(autoButton.className).toContain("blue");
  });

  it("Auto button is inactive when a model is selected", () => {
    openSelector({ preferredModelId: "openai/gpt-5.1" });
    const autoButton = screen.getByRole("button", { name: /Auto/i });
    expect(autoButton.className).not.toContain("blue-950");
    // Inactive state uses slate border (positive check for inactive styling)
    expect(autoButton.className).toContain("border-slate");
  });

  it("calls onSelectModel(null) when Auto is clicked", () => {
    const { onSelectModel } = openSelector({ preferredModelId: "openai/gpt-5.1" });
    fireEvent.click(screen.getByRole("button", { name: /Auto/i }));
    expect(onSelectModel).toHaveBeenCalledWith(null);
  });

  it("renders local models as buttons after expanding (no async loading)", () => {
    // Premium users see premium models up front; expand More models to see free ones
    openSelector();
    expect(screen.getByRole("button", { name: /anthropic\/claude-opus-4\.6/i })).toBeInTheDocument();
    // openai/gpt-5.1 is a premium model (standard tier), also visible up front
    expect(screen.getByRole("button", { name: /openai\/gpt-5\.1/i })).toBeInTheDocument();
  });

  it("premium users see premium models up front and free models behind More models", () => {
    openSelector({ isPremium: true });
    // Premium section label visible
    expect(screen.getByText(/premium models/i)).toBeInTheDocument();
    // A premium model visible directly
    expect(screen.getByRole("button", { name: /anthropic\/claude-opus-4\.6/i })).toBeInTheDocument();
    // Free models NOT shown directly
    expect(screen.queryByRole("button", { name: /meta-llama\/llama-3\.3-70b-instruct:free/i })).not.toBeInTheDocument();
    // "More models" toggle is shown
    expect(screen.getByRole("button", { name: /more models/i })).toBeInTheDocument();
  });

  it("premium users can expand More models to see free models", () => {
    openSelector({ isPremium: true });
    fireEvent.click(screen.getByRole("button", { name: /more models/i }));
    expect(screen.getByRole("button", { name: /meta-llama\/llama-3\.3-70b-instruct:free/i })).toBeInTheDocument();
  });

  it("calls onSelectModel with the model id when a model button is clicked", () => {
    const { onSelectModel } = openSelector();
    fireEvent.click(screen.getByRole("button", { name: /openai\/gpt-5\.1/i }));
    expect(onSelectModel).toHaveBeenCalledWith("openai/gpt-5.1");
  });

  it("free users see only free models and a More models button after expanding", () => {
    openSelector({ isPremium: false });
    // Free section label visible
    expect(screen.getByText(/free models/i)).toBeInTheDocument();
    // A free model is visible
    expect(screen.getByRole("button", { name: /meta-llama\/llama-3\.3-70b-instruct:free/i })).toBeInTheDocument();
    // Premium models are NOT shown directly
    expect(screen.queryByRole("button", { name: /anthropic\/claude-opus-4\.6/i })).not.toBeInTheDocument();
    // "More models" toggle is shown
    expect(screen.getByRole("button", { name: /more models/i })).toBeInTheDocument();
  });

  it("free users can expand More models to see premium models (locked)", () => {
    openSelector({ isPremium: false });
    fireEvent.click(screen.getByRole("button", { name: /more models/i }));
    const lockedBtn = screen.getByRole("button", { name: /anthropic\/claude-opus-4\.6/i });
    expect(lockedBtn).toBeInTheDocument();
    expect(lockedBtn).toBeDisabled();
  });

  it("collapses the list when toggle is clicked again", () => {
    openSelector();
    fireEvent.click(screen.getByRole("button", { name: "Ukryj wybór modelu" }));
    expect(screen.queryByRole("button", { name: /Auto/i })).not.toBeInTheDocument();
  });

  it("re-expands when toggle is clicked after collapsing", () => {
    openSelector();
    fireEvent.click(screen.getByRole("button", { name: "Ukryj wybór modelu" }));
    fireEvent.click(screen.getByRole("button", { name: "Pokaż wybór modelu" }));
    expect(screen.getByRole("button", { name: /Auto/i })).toBeInTheDocument();
  });

  it("shows Pro badge when isPremium is true and isProPlus is false", () => {
    openSelector({ isPremium: true });
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
    fireEvent.click(screen.getByRole("button", { name: "Pokaż wybór modelu" }));
    expect(screen.getByText("Pro+")).toBeInTheDocument();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
  });

  it("hides plan badge when isPremium is false", () => {
    openSelector({ isPremium: false });
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(screen.queryByText("Pro+")).not.toBeInTheDocument();
  });

  it("locked models are disabled and do not call onSelectModel", () => {
    // claude-opus-4.6 is a premium model, locked for non-premium users; expand More models first
    const { onSelectModel } = openSelector({ isPremium: false });
    fireEvent.click(screen.getByRole("button", { name: /more models/i }));
    const lockedBtn = screen.getByRole("button", { name: /claude-opus-4\.6/i });
    expect(lockedBtn).toBeDisabled();
    fireEvent.click(lockedBtn);
    expect(onSelectModel).not.toHaveBeenCalled();
  });
});
