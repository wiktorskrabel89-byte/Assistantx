import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CostModeSelector } from "@/app/components/CostModeSelector";
import { COST_MODE_OPTIONS } from "@/app/lib/chat-state";

describe("CostModeSelector", () => {
  function renderSelector(overrides: Partial<Parameters<typeof CostModeSelector>[0]> = {}) {
    const onSelectCostMode = overrides.onSelectCostMode ?? jest.fn();
    const utils = render(
      <CostModeSelector
        dark={overrides.dark ?? false}
        costMode={overrides.costMode ?? "balanced"}
        onSelectCostMode={onSelectCostMode}
      />
    );
    return { ...utils, onSelectCostMode };
  }

  it("renders all cost mode options", () => {
    renderSelector();
    for (const option of COST_MODE_OPTIONS) {
      expect(screen.getByRole("button", { name: new RegExp(option.label) })).toBeInTheDocument();
    }
  });

  it("highlights the active cost mode", () => {
    renderSelector({ costMode: "thrifty" });
    const btn = screen.getByRole("button", { name: /Thrifty/ });
    expect(btn.className).toContain("emerald");
  });

  it("does not highlight inactive modes", () => {
    renderSelector({ costMode: "thrifty" });
    const btn = screen.getByRole("button", { name: /Performance/ });
    expect(btn.className).not.toContain("emerald");
  });

  it("calls onSelectCostMode with correct value when clicked", () => {
    const { onSelectCostMode } = renderSelector({ costMode: "balanced" });
    fireEvent.click(screen.getByRole("button", { name: /Thrifty/ }));
    expect(onSelectCostMode).toHaveBeenCalledWith("thrifty");
  });

  it("calls onSelectCostMode with performance when Performance is clicked", () => {
    const { onSelectCostMode } = renderSelector({ costMode: "balanced" });
    fireEvent.click(screen.getByRole("button", { name: /Performance/ }));
    expect(onSelectCostMode).toHaveBeenCalledWith("performance");
  });

  it('renders "Cost" label', () => {
    renderSelector();
    expect(screen.getByText("Cost")).toBeInTheDocument();
  });

  it("applies dark theme classes when dark is true", () => {
    renderSelector({ dark: true, costMode: "balanced" });
    const btn = screen.getByRole("button", { name: /Balanced/ });
    expect(btn.className).toContain("emerald-700");
  });
});
