/**
 * @jest-environment node
 *
 * Tests for POST /api/stripe/webhook
 */

// Capture inner mocks directly so they survive clearAllMocks().
let mockConstructEvent: jest.Mock;
let mockCustomersRetrieve: jest.Mock;
jest.mock("stripe", () => {
  mockConstructEvent = jest.fn();
  mockCustomersRetrieve = jest.fn();
  return jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    customers: { retrieve: mockCustomersRetrieve },
  }));
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

import { NextRequest } from "next/server";
import { createClient as supabaseCreateClient } from "@supabase/supabase-js";

const mockSupabaseCreateClient = supabaseCreateClient as jest.Mock;

function makeAdminSupabase({
  existingState = {} as Record<string, unknown>,
  upsertError = null as Error | null,
  rpcResult = null as string | null,
} = {}) {
  const upsertMock = jest.fn().mockResolvedValue({ error: upsertError });
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: existingState ? { state_json: existingState } : null,
            error: null,
          }),
        }),
      }),
      upsert: upsertMock,
    }),
    rpc: jest.fn().mockResolvedValue({ data: rpcResult, error: null }),
    auth: {
      admin: {
        updateUserById: jest.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
  };
}

function makeWebhookReq(body: string, signature = "valid-sig"): NextRequest {
  return new NextRequest("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-apply mock implementations after clearAllMocks.
  mockConstructEvent.mockReturnValue({ type: "unknown.event", data: { object: {} } });
  mockCustomersRetrieve.mockResolvedValue({ deleted: true });
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

describe("POST /api/stripe/webhook", () => {
  let POST: (req: NextRequest) => Promise<Response>;
  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    ({ POST } = await import("@/app/api/stripe/webhook/route"));
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const req = new NextRequest("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/signature/i);
  });

  it("returns 400 when webhook signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const res = await POST(makeWebhookReq("{}"));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/verification failed/i);
  });

  it("returns 200 for unknown event types without processing", async () => {
    mockConstructEvent.mockReturnValue({ type: "payment_intent.created", data: { object: {} } });
    const res = await POST(makeWebhookReq("{}"));
    expect(res.status).toBe(200);
    const body = await res.json() as { received: boolean };
    expect(body.received).toBe(true);
  });

  it("returns 200 for checkout.session.completed with paid status and grants plan", async () => {
    const adminSupabase = makeAdminSupabase();
    mockSupabaseCreateClient.mockReturnValue(adminSupabase);

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          payment_status: "paid",
          metadata: { userId: "user-123", plan: "pro" },
          customer: "cus_123",
        },
      },
    });

    const res = await POST(makeWebhookReq("{}"));
    expect(res.status).toBe(200);
    const body = await res.json() as { received: boolean };
    expect(body.received).toBe(true);
    // Upsert should have been called to grant the plan
    expect(adminSupabase.from().upsert).toHaveBeenCalled();
  });

  it("skips plan grant when checkout.session payment_status is not 'paid'", async () => {
    const adminSupabase = makeAdminSupabase();
    mockSupabaseCreateClient.mockReturnValue(adminSupabase);

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_2",
          payment_status: "unpaid",
          metadata: { userId: "user-123", plan: "pro" },
          customer: "cus_123",
        },
      },
    });

    const res = await POST(makeWebhookReq("{}"));
    expect(res.status).toBe(200);
    // Upsert should NOT have been called
    expect(adminSupabase.from().upsert).not.toHaveBeenCalled();
  });

  it("skips plan grant when metadata plan is not in GRANTABLE_PAID_PLANS", async () => {
    const adminSupabase = makeAdminSupabase();
    mockSupabaseCreateClient.mockReturnValue(adminSupabase);

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_3",
          payment_status: "paid",
          metadata: { userId: "user-123", plan: "free" },
          customer: "cus_123",
        },
      },
    });

    const res = await POST(makeWebhookReq("{}"));
    expect(res.status).toBe(200);
    // Upsert should NOT have been called because "free" is not a grantable paid plan
    expect(adminSupabase.from().upsert).not.toHaveBeenCalled();
  });

  it("handles customer.subscription.deleted and downgrades user to free", async () => {
    const adminSupabase = makeAdminSupabase({ rpcResult: "user-456" });
    mockSupabaseCreateClient.mockReturnValue(adminSupabase);

    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: {
          customer: "cus_abc",
        },
      },
    });

    const res = await POST(makeWebhookReq("{}"));
    expect(res.status).toBe(200);
    expect(adminSupabase.from().upsert).toHaveBeenCalled();
  });

  it("returns 500 when upsert fails during plan grant", async () => {
    const adminSupabase = makeAdminSupabase({ upsertError: new Error("DB error") });
    mockSupabaseCreateClient.mockReturnValue(adminSupabase);

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_4",
          payment_status: "paid",
          metadata: { userId: "user-123", plan: "pro+" },
          customer: "cus_123",
        },
      },
    });

    const res = await POST(makeWebhookReq("{}"));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("DB error");
  });
});
