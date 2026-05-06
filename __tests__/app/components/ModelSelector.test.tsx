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
  LOCAL_FALLBACK_MODELS: [
    { id: "openai/gpt-5", description: "" },
    { id: "anthropic/claude-opus-4.6", description: "" },
    { id: "openai/gpt-5-mini", description: "" },
  ],
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


  it("renders the toggle button expanded by default", () => {
    renderSelector();
    expect(screen.getByRole("button", { name: "Ukryj wybór modelu" })).toBeInTheDocument();
  });

  it("shows Auto button when expanded by default", async () => {
    renderSelector();
    await act(async () => {});
    expect(screen.getByRole("button", { name: /Auto/i })).toBeInTheDocument();
  });

  it("Auto button is active (has blue class) when preferredModelId is null", async () => {
    renderSelector({ preferredModelId: null });
    await act(async () => {});
    const autoButton = screen.getByRole("button", { name: /Auto/i });
    expect(autoButton.className).toContain("blue");
  });

  it("Auto button is inactive when a model is selected", async () => {
    renderSelector({ preferredModelId: "openai/gpt-5" });
    await act(async () => {});
    const autoButton = screen.getByRole("button", { name: /Auto/i });
    expect(autoButton.className).not.toContain("blue-950");
  });

  it("calls onSelectModel(null) when Auto is clicked", async () => {
    const { onSelectModel } = renderSelector({ preferredModelId: "openai/gpt-5" });
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Auto/i }));
    expect(onSelectModel).toHaveBeenCalledWith(null);
  });

  it("renders loaded models as buttons", async () => {
    renderSelector();
    await act(async () => {});
    expect(screen.getByRole("button", { name: /openai\/gpt-5-mini/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /claude-opus-4\.6/i })).toBeInTheDocument();
  });

  it("calls onSelectModel with the model id when a model button is clicked", async () => {
    const { onSelectModel } = renderSelector();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /openai\/gpt-5-mini/i }));
    expect(onSelectModel).toHaveBeenCalledWith("openai/gpt-5-mini");
  });

  it("collapses the list when toggle is clicked", async () => {
    renderSelector();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Ukryj wybór modelu" }));
    expect(screen.queryByRole("button", { name: /Auto/i })).not.toBeInTheDocument();
  });

  it("re-expands when toggle is clicked again after collapsing", async () => {
    renderSelector();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Ukryj wybór modelu" }));
    fireEvent.click(screen.getByRole("button", { name: "Pokaż wybór modelu" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: /Auto/i })).toBeInTheDocument();
  });

  it("shows Pro badge when isPremium is true and isProPlus is false", async () => {
    renderSelector({ isPremium: true });
    await act(async () => {});
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.queryByText("Pro+")).not.toBeInTheDocument();
  });

  it("shows Pro+ badge when isPremium and isProPlus are true", async () => {
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
    await act(async () => {});
    expect(screen.getByText("Pro+")).toBeInTheDocument();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
  });

  it("hides plan badge when isPremium is false", async () => {
    renderSelector({ isPremium: false });
    await act(async () => {});
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(screen.queryByText("Pro+")).not.toBeInTheDocument();
  });

  it("locked models are disabled and do not call onSelectModel", async () => {
    // claude-opus-4.6 should be locked for non-premium users
    const { onSelectModel } = renderSelector({ isPremium: false });
    await act(async () => {});
    const lockedBtn = screen.getByRole("button", { name: /claude-opus/i });
    expect(lockedBtn).toBeDisabled();
    fireEvent.click(lockedBtn);
    expect(onSelectModel).not.toHaveBeenCalled();
  });
});
