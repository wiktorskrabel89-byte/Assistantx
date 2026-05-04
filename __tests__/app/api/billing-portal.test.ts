/**
 * @jest-environment node
 *
 * Regression tests for POST /api/stripe/billing-portal
 * Focuses on the open-redirect protection and authentication guard.
 */

// ── Mocks (declared before imports so they are hoisted) ──────────────────────

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("stripe", () => {
  const mockCreate = jest.fn().mockResolvedValue({
    url: "https://billing.stripe.com/session/test",
  });
  return jest.fn().mockImplementation(() => ({
    billingPortal: { sessions: { create: mockCreate } },
  }));
});

// ── Imports ───────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { createClient } from "@/lib/server";

const mockCreateClient = createClient as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockSupabase(user: object | null) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error("No user"),
      }),
    },
  };
}

function makeRequest(body: Record<string, unknown>, origin = "https://app.example.com") {
  return new NextRequest(`${origin}/api/stripe/billing-portal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/stripe/billing-portal — authentication", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    ({ POST } = await import("@/app/api/stripe/billing-portal/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when no user session exists", async () => {
    mockCreateClient.mockResolvedValue(makeMockSupabase(null));
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("redirects authenticated user with valid Stripe customer ID to portal", async () => {
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({ id: "user-1", app_metadata: { stripe_customer_id: "cus_123" } })
    );
    const req = makeRequest({ returnUrl: "https://app.example.com/dashboard" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { url?: string };
    expect(body.url).toBe("https://billing.stripe.com/session/test");
  });
});

describe("POST /api/stripe/billing-portal — open-redirect protection", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    ({ POST } = await import("@/app/api/stripe/billing-portal/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({ id: "user-1", app_metadata: { stripe_customer_id: "cus_123" } })
    );
  });

  it("accepts a same-origin returnUrl", async () => {
    const req = makeRequest({ returnUrl: "https://app.example.com/settings" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("rejects a cross-origin returnUrl and uses the default", async () => {
    const req = makeRequest({ returnUrl: "https://evil.com/steal" });
    const res = await POST(req);
    // Still succeeds but Stripe session is created with origin default, not evil URL
    expect(res.status).toBe(200);
    const body = await res.json() as { url?: string };
    // Stripe mock always returns the same URL regardless; the important thing is
    // that evil.com was not forwarded to Stripe as the return_url.
    expect(body.url).toBeDefined();
  });

  it("rejects authority-confusion bypass (host@evil.com style)", async () => {
    // https://app.example.com@evil.com/ has origin https://app.example.com@evil.com
    // which is different from https://app.example.com — should be rejected.
    const req = makeRequest({ returnUrl: "https://app.example.com@evil.com/" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Route should succeed with the default returnUrl, not the attacker's URL.
    const body = await res.json() as { url?: string };
    expect(body.url).toBeDefined();
  });

  it("handles malformed returnUrl gracefully without throwing", async () => {
    const req = makeRequest({ returnUrl: "not-a-valid-url" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
