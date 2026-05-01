import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ModelSelector } from "@/app/components/ModelSelector";

// Mock fetchAllModels so tests don't hit the network
jest.mock("@/app/api/openrouter/fetchAllModels", () => ({
  fetchAllModels: jest.fn().mockResolvedValue([
    { id: "openai/gpt-5", description: "" },
    { id: "anthropic/claude-opus-4.6", description: "" },
    { id: "openai/gpt-5-mini", description: "" },
  ]),
}));

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

  async function expandSelector(overrides: Partial<Parameters<typeof ModelSelector>[0]> = {}) {
    const result = renderSelector(overrides);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Poka[żz] wyb[oó]r modelu/i }));
    });
    return result;
  }

  it("renders the toggle button collapsed by default", () => {
    renderSelector();
    expect(screen.getByRole("button", { name: /Poka[żz] wyb[oó]r modelu/i })).toBeInTheDocument();
  });

  it("expands to show Auto button when toggle is clicked", async () => {
    await expandSelector();
    expect(screen.getByRole("button", { name: /Auto/i })).toBeInTheDocument();
  });

  it("Auto button is active (has bg-blue class) when preferredModelId is null", async () => {
    await expandSelector({ preferredModelId: null });
    const autoButton = screen.getByRole("button", { name: /Auto/i });
    expect(autoButton.className).toContain("blue");
  });

  it("Auto button is inactive when a model is selected", async () => {
    await expandSelector({ preferredModelId: "openai/gpt-5" });
    const autoButton = screen.getByRole("button", { name: /Auto/i });
    expect(autoButton.className).not.toContain("blue-950");
  });

  it("calls onSelectModel(null) when Auto is clicked", async () => {
    const { onSelectModel } = await expandSelector({ preferredModelId: "openai/gpt-5" });
    fireEvent.click(screen.getByRole("button", { name: /Auto/i }));
    expect(onSelectModel).toHaveBeenCalledWith(null);
  });

  it("renders loaded models as buttons", async () => {
    await expandSelector();
    expect(screen.getByRole("button", { name: /openai\/gpt-5-mini/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /claude-opus-4\.6/i })).toBeInTheDocument();
  });

  it("calls onSelectModel with the model id when a model button is clicked", async () => {
    const { onSelectModel } = await expandSelector();
    fireEvent.click(screen.getByRole("button", { name: /openai\/gpt-5-mini/i }));
    expect(onSelectModel).toHaveBeenCalledWith("openai/gpt-5-mini");
  });

  it("collapses the list when toggle is clicked a second time", async () => {
    await expandSelector();
    // Click again to collapse
    fireEvent.click(screen.getByRole("button", { name: /Ukryj wyb[oó]r modelu/i }));
    expect(screen.queryByRole("button", { name: /Auto/i })).not.toBeInTheDocument();
  });

  it("shows Premium badge when isPremium is true", async () => {
    await expandSelector({ isPremium: true });
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });

  it("hides Premium badge when isPremium is false", async () => {
    await expandSelector({ isPremium: false });
    expect(screen.queryByText("Premium")).not.toBeInTheDocument();
  });

  it("locked models are disabled and do not call onSelectModel", async () => {
    // claude-opus-4.6 should be locked for non-premium users
    const { onSelectModel } = await expandSelector({ isPremium: false });
    const lockedBtn = screen.getByRole("button", { name: /claude-opus/i });
    expect(lockedBtn).toBeDisabled();
    fireEvent.click(lockedBtn);
    expect(onSelectModel).not.toHaveBeenCalled();
  });
});
