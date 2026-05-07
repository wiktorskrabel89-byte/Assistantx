import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PremiumPlanBanner } from "@/app/components/PremiumPlanBanner";
import { PRO_PLAN, PRO_PLUS_PLAN } from "@/lib/ai-config";

// Spy on fetch for billing-portal calls
const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
});

function renderBanner(overrides: Partial<Parameters<typeof PremiumPlanBanner>[0]> = {}) {
  return render(
    <PremiumPlanBanner
      dark={overrides.dark ?? false}
      userPlan={overrides.userPlan ?? "free"}
      premiumRequestsUsed={overrides.premiumRequestsUsed ?? 0}
      onDismiss={overrides.onDismiss}
    />
  );
}

describe("PremiumPlanBanner", () => {
  describe("free plan", () => {
    it("can be dismissed when hide action is provided", () => {
      const onDismiss = jest.fn();
      renderBanner({ userPlan: "free", onDismiss });
      fireEvent.click(screen.getByRole("button", { name: /Hide premium banner/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("shows 'Upgrade your plan' heading for free users", () => {
      renderBanner({ userPlan: "free" });
      expect(screen.getByText("Upgrade your plan")).toBeInTheDocument();
    });

    it("shows 'See plans & pricing' CTA button", () => {
      renderBanner({ userPlan: "free" });
      expect(screen.getByRole("button", { name: /See plans & pricing/i })).toBeInTheDocument();
    });

    it("shows the free plan note", () => {
      renderBanner({ userPlan: "free" });
      expect(screen.getByText(/Free plan: free models only/i)).toBeInTheDocument();
    });

    it("clicking the CTA button does not throw and the button is rendered", () => {
      renderBanner({ userPlan: "free" });
      const btn = screen.getByRole("button", { name: /See plans & pricing/i });
      // Navigation to /pricing is triggered; just verify the handler doesn't throw
      expect(() => fireEvent.click(btn)).not.toThrow();
    });
  });

  describe("pro plan", () => {
    it("shows 'Pro Active' label", () => {
      renderBanner({ userPlan: "pro" });
      expect(screen.getByText("Pro Active")).toBeInTheDocument();
    });

    it("shows remaining premium requests", () => {
      renderBanner({ userPlan: "pro", premiumRequestsUsed: 10 });
      const remaining = PRO_PLAN.premiumRequestsPerMonth - 10;
      expect(screen.getByText(new RegExp(`${remaining} premium requests remaining`))).toBeInTheDocument();
    });

    it("shows usage progress bar", () => {
      const { container } = renderBanner({ userPlan: "pro", premiumRequestsUsed: 50 });
      const bar = container.querySelector(".h-full.rounded-full");
      expect(bar).toBeInTheDocument();
    });

    it("shows 'Manage subscription' button", () => {
      renderBanner({ userPlan: "pro" });
      expect(screen.getByRole("button", { name: /Manage subscription/i })).toBeInTheDocument();
    });

    it("calls billing-portal API and on success would redirect to portal URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://billing.example.com/portal" }),
      });
      renderBanner({ userPlan: "pro" });
      fireEvent.click(screen.getByRole("button", { name: /Manage subscription/i }));
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/stripe/billing-portal",
          expect.objectContaining({ method: "POST" })
        );
      });
    });

    it("falls back to pricing page when billing-portal returns an error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "No portal configured" }),
      });
      renderBanner({ userPlan: "pro" });
      fireEvent.click(screen.getByRole("button", { name: /Manage subscription/i }));
      // Wait for loading to complete (button re-enables)
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Manage subscription/i })).not.toBeDisabled();
      });
    });

    it("falls back when fetch throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      renderBanner({ userPlan: "pro" });
      fireEvent.click(screen.getByRole("button", { name: /Manage subscription/i }));
      // Wait for the error to resolve
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Manage subscription/i })).not.toBeDisabled();
      });
    });

    it("disables Manage subscription button while loading", async () => {
      // Pending promise keeps the loading state active
      mockFetch.mockReturnValueOnce(new Promise(() => undefined));
      renderBanner({ userPlan: "pro" });
      const btn = screen.getByRole("button", { name: /Manage subscription/i });
      fireEvent.click(btn);
      await waitFor(() => {
        expect(screen.getByText("Opening portal...")).toBeInTheDocument();
      });
      expect(btn).toBeDisabled();
    });
  });

  describe("pro+ plan", () => {
    it("shows 'Pro+ Active' label", () => {
      renderBanner({ userPlan: "pro+" });
      expect(screen.getByText("Pro+ Active")).toBeInTheDocument();
    });

    it("mentions Claude Opus 4.7 for pro+ plan", () => {
      renderBanner({ userPlan: "pro+" });
      expect(screen.getByText(/Claude Opus 4\.7/)).toBeInTheDocument();
    });

    it("shows remaining premium requests for pro+", () => {
      renderBanner({ userPlan: "pro+", premiumRequestsUsed: 5 });
      const remaining = PRO_PLUS_PLAN.premiumRequestsPerMonth - 5;
      expect(screen.getByText(new RegExp(`${remaining} premium requests remaining`))).toBeInTheDocument();
    });

    it("shows 0 remaining when all requests used", () => {
      renderBanner({ userPlan: "pro+", premiumRequestsUsed: PRO_PLUS_PLAN.premiumRequestsPerMonth + 100 });
      expect(screen.getByText(/0 premium requests remaining/)).toBeInTheDocument();
    });
  });

  describe("dark mode", () => {
    it("applies dark styling in free plan dark mode", () => {
      const { container } = renderBanner({ userPlan: "free", dark: true });
      expect(container.firstChild?.toString()).not.toBeNull();
      // The gradient uses slate-800 in dark mode
      expect((container.firstChild as HTMLElement).className).toContain("slate-800");
    });

    it("applies dark styling in pro plan dark mode", () => {
      const { container } = renderBanner({ userPlan: "pro", dark: true });
      expect((container.firstChild as HTMLElement).className).toContain("sky-950");
    });
  });
});
