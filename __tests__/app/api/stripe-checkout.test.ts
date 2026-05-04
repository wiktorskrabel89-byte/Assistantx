/**
 * @jest-environment node
 *
 * Tests for POST /api/stripe/checkout
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

// Capture the inner mock so we can inspect calls and re-apply after clearAllMocks.
let mockCheckoutCreate: jest.Mock;
jest.mock("stripe", () => {
  mockCheckoutCreate = jest.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session/test" });
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCheckoutCreate } },
  }));
});

import { NextRequest } from "next/server";
import { createClient } from "@/lib/server";

const mockCreateClient = createClient as jest.Mock;

function makeMockSupabase(user: object | null) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  };
}

function makeReq(body: unknown, origin = "https://app.example.com"): NextRequest {
  return new NextRequest(`${origin}/api/stripe/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/checkout", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    ({ POST } = await import("@/app/api/stripe/checkout/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply mockResolvedValue after clearAllMocks since it resets the implementation state.
    mockCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session/test" });
    // Default: authenticated user
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({ id: "user-1", email: "test@example.com" }),
    );
  });

  it("returns 401 when no user session exists", async () => {
    mockCreateClient.mockResolvedValue(makeMockSupabase(null));
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/auth/i);
  });

  it("returns a Stripe checkout URL for the 'pro' plan", async () => {
    const res = await POST(makeReq({ plan: "pro" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toBe("https://checkout.stripe.com/session/test");
  });

  it("returns a Stripe checkout URL for the 'pro+' plan", async () => {
    const res = await POST(makeReq({ plan: "pro+" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toBeDefined();
  });

  it("defaults to 'pro' plan (unit_amount 1000) when body plan is invalid", async () => {
    const res = await POST(makeReq({ plan: "enterprise" }));
    expect(res.status).toBe(200);
    const sessionArgs = mockCheckoutCreate.mock.calls[0]?.[0] as {
      line_items: Array<{ price_data: { unit_amount: number } }>;
    };
    expect(sessionArgs?.line_items?.[0]?.price_data?.unit_amount).toBe(1000);
  });

  it("defaults to 'pro' when body is malformed JSON (graceful fallback)", async () => {
    const req = new NextRequest("https://app.example.com/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("embeds userId and plan in Stripe session metadata", async () => {
    await POST(makeReq({ plan: "pro+" }));
    const sessionArgs = mockCheckoutCreate.mock.calls[0]?.[0] as {
      metadata: { userId: string; plan: string };
    };
    expect(sessionArgs?.metadata?.userId).toBe("user-1");
    expect(sessionArgs?.metadata?.plan).toBe("pro+");
  });

  it("sets mode to subscription", async () => {
    await POST(makeReq({ plan: "pro" }));
    const sessionArgs = mockCheckoutCreate.mock.calls[0]?.[0] as { mode: string };
    expect(sessionArgs?.mode).toBe("subscription");
  });

  it("sets recurring interval to month", async () => {
    await POST(makeReq({ plan: "pro" }));
    const sessionArgs = mockCheckoutCreate.mock.calls[0]?.[0] as {
      line_items: Array<{ price_data: { recurring: { interval: string } } }>;
    };
    expect(sessionArgs?.line_items?.[0]?.price_data?.recurring?.interval).toBe("month");
  });

  it("uses 3000 unit_amount for pro+ plan", async () => {
    await POST(makeReq({ plan: "pro+" }));
    const sessionArgs = mockCheckoutCreate.mock.calls[0]?.[0] as {
      line_items: Array<{ price_data: { unit_amount: number } }>;
    };
    expect(sessionArgs?.line_items?.[0]?.price_data?.unit_amount).toBe(3000);
  });

  it("uses customer_email from the authenticated user", async () => {
    await POST(makeReq({ plan: "pro" }));
    const sessionArgs = mockCheckoutCreate.mock.calls[0]?.[0] as { customer_email: string };
    expect(sessionArgs?.customer_email).toBe("test@example.com");
  });
});
