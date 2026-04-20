import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModelSelector } from "@/app/components/ModelSelector";
import { MODEL_PRESETS } from "@/app/lib/chat-state";

describe("ModelSelector", () => {
  const allPresets = [...MODEL_PRESETS.coding, ...MODEL_PRESETS.chat];

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

  it('renders "Auto" button', () => {
    renderSelector();
    expect(screen.getByRole("button", { name: /Auto/i })).toBeInTheDocument();
  });

  it("Auto button is active when preferredModelId is null", () => {
    renderSelector({ preferredModelId: null });
    const autoButton = screen.getByRole("button", { name: /Auto/i });
    expect(autoButton.className).toContain("bg-blue");
  });

  it("Auto button is inactive when a model is selected", () => {
    renderSelector({ preferredModelId: allPresets[0].modelId });
    const autoButton = screen.getByRole("button", { name: /Auto/i });
    expect(autoButton.className).not.toContain("bg-blue");
  });

  it("renders all coding and chat model presets", () => {
    renderSelector();
    for (const preset of allPresets) {
      expect(screen.getByRole("button", { name: new RegExp(preset.label) })).toBeInTheDocument();
    }
  });

  it("calls onSelectModel(null) when Auto is clicked", () => {
    const { onSelectModel } = renderSelector({ preferredModelId: allPresets[0].modelId });
    fireEvent.click(screen.getByRole("button", { name: /Auto/i }));
    expect(onSelectModel).toHaveBeenCalledWith(null);
  });

  it("calls onSelectModel with correct modelId when a preset is clicked", () => {
    const target = allPresets[0];
    const { onSelectModel } = renderSelector();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(target.label) }));
    expect(onSelectModel).toHaveBeenCalledWith(target.modelId);
  });

  it("highlights the active model", () => {
    const target = allPresets[1];
    renderSelector({ preferredModelId: target.modelId });
    const btn = screen.getByRole("button", { name: new RegExp(target.label) });
    expect(btn.className).toContain("bg-blue");
  });

  it('renders "Coding" and "Chat" section labels', () => {
    renderSelector();
    expect(screen.getByText("Coding")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("applies dark theme classes when dark is true", () => {
    renderSelector({ dark: true });
    const autoButton = screen.getByRole("button", { name: /Auto/i });
    expect(autoButton.className).toContain("blue-700");
  });
});
