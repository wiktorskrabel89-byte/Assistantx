/**
 * @jest-environment node
 *
 * Tests for POST /api/stripe/billing-portal
 *
 * Covers:
 * - Unauthenticated callers receive 401
 * - Missing STRIPE_SECRET_KEY returns 500
 * - Client-supplied customerId is ignored (server-side lookup only)
 * - Open-redirect bypass (https://app.example.com@evil.com) is rejected
 * - Cross-origin returnUrl is rejected
 * - Valid same-origin returnUrl is accepted
 * - No Stripe customer ID → fallback /pricing redirect URL
 * - Stripe API errors are surfaced as 500
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

let mockPortalCreate: jest.Mock;
jest.mock("stripe", () => {
  mockPortalCreate = jest.fn().mockResolvedValue({ url: "https://billing.stripe.com/portal/test" });
  return jest.fn().mockImplementation(() => ({
    billingPortal: { sessions: { create: mockPortalCreate } },
  }));
});

import { NextRequest } from "next/server";
import { createClient } from "@/lib/server";

const mockCreateClient = createClient as jest.Mock;

const ORIGIN = "https://app.example.com";

function makeMockSupabase(user: object | null) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "test@example.com",
    app_metadata: { stripe_customer_id: "cus_test123" },
    ...overrides,
  };
}

function makeReq(body: unknown, origin = ORIGIN): NextRequest {
  return new NextRequest(`${origin}/api/stripe/billing-portal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/billing-portal", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    ({ POST } = await import("@/app/api/stripe/billing-portal/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/portal/test" });
    mockCreateClient.mockResolvedValue(makeMockSupabase(makeUser()));
  });

  it("returns 401 when no user session exists", async () => {
    mockCreateClient.mockResolvedValue(makeMockSupabase(null));
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("returns 500 when STRIPE_SECRET_KEY is not set", async () => {
    const original = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const res = await POST(makeReq({}));
      expect(res.status).toBe(500);
    } finally {
      process.env.STRIPE_SECRET_KEY = original;
    }
  });

  it("returns a Stripe portal URL for an authenticated user with a customer ID", async () => {
    const res = await POST(makeReq({ returnUrl: `${ORIGIN}/dashboard` }));
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toBe("https://billing.stripe.com/portal/test");
  });

  it("passes the correct customer ID to Stripe (from app_metadata, not client body)", async () => {
    await POST(makeReq({ returnUrl: `${ORIGIN}/dashboard`, customerId: "cus_attacker" }));
    const callArgs = mockPortalCreate.mock.calls[0]?.[0] as { customer: string };
    // Must use server-side customer ID, not the attacker-supplied one
    expect(callArgs?.customer).toBe("cus_test123");
  });

  it("falls back to /pricing URL when no stripe_customer_id in app_metadata", async () => {
    mockCreateClient.mockResolvedValue(
      makeMockSupabase(makeUser({ app_metadata: {} })),
    );
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toContain("/pricing");
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("uses the valid same-origin returnUrl when provided", async () => {
    const returnUrl = `${ORIGIN}/settings`;
    await POST(makeReq({ returnUrl }));
    const callArgs = mockPortalCreate.mock.calls[0]?.[0] as { return_url: string };
    expect(callArgs?.return_url).toBe(returnUrl);
  });

  it("rejects a cross-origin returnUrl and falls back to the app origin", async () => {
    await POST(makeReq({ returnUrl: "https://evil.com/steal" }));
    const callArgs = mockPortalCreate.mock.calls[0]?.[0] as { return_url: string };
    // Should NOT use the cross-origin URL
    expect(callArgs?.return_url).not.toBe("https://evil.com/steal");
    // Should fall back to a same-origin URL
    expect(callArgs?.return_url.startsWith(ORIGIN)).toBe(true);
  });

  it("rejects an open-redirect bypass URL (https://app.example.com@evil.com)", async () => {
    // new URL("https://app.example.com@evil.com/path").origin === "https://evil.com"
    // so this must be rejected and the default returnUrl must be used instead
    const bypassUrl = `${ORIGIN}@evil.com/steal`;
    await POST(makeReq({ returnUrl: bypassUrl }));
    const callArgs = mockPortalCreate.mock.calls[0]?.[0] as { return_url: string };
    expect(callArgs?.return_url).not.toBe(bypassUrl);
    expect(callArgs?.return_url.startsWith(ORIGIN)).toBe(true);
  });

  it("handles a malformed returnUrl gracefully (falls back to default)", async () => {
    await POST(makeReq({ returnUrl: "not-a-valid-url" }));
    const callArgs = mockPortalCreate.mock.calls[0]?.[0] as { return_url: string };
    expect(callArgs?.return_url.startsWith(ORIGIN)).toBe(true);
  });

  it("returns 500 when Stripe throws an error", async () => {
    mockPortalCreate.mockRejectedValue(new Error("Stripe unavailable"));
    const res = await POST(makeReq({}));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/stripe unavailable/i);
  });

  it("handles malformed request body gracefully (uses default returnUrl)", async () => {
    const req = new NextRequest(`${ORIGIN}/api/stripe/billing-portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toBeDefined();
  });
});
