/**
 * @jest-environment node
 *
 * Tests for GET /auth/callback
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/server";
import { GET } from "@/app/auth/callback/route";

const mockCreateClient = createClient as jest.Mock;

function makeMockSupabase(
  data: object | null = null,
  error: Error | null = null,
) {
  return {
    auth: {
      exchangeCodeForSession: jest.fn().mockResolvedValue({
        data: data ?? {},
        error,
      }),
    },
  };
}

function makeReq(params: Record<string, string> = {}, headers: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/auth/callback");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString(), { headers });
}

function parseRedirectHash(location: string): URLSearchParams {
  const [, hash = ""] = location.split("#");
  return new URLSearchParams(hash);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
});

describe("GET /auth/callback", () => {
  it("redirects to /auth/login with error when 'code' is missing", async () => {
    const res = await GET(makeReq({}));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/auth/login");
    expect(location).toContain("error=");
  });

  it("redirects to /auth/login when code exchange fails", async () => {
    mockCreateClient.mockResolvedValue(makeMockSupabase(null, new Error("Bad code")));
    const res = await GET(makeReq({ code: "invalid-code" }));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/auth/login");
    expect(location).toContain("error=");
  });

  it("redirects to '/' on successful code exchange (default next)", async () => {
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({
        user: { app_metadata: { provider: "email" } },
        session: { provider_token: null, expires_in: 3600 },
      }),
    );
    const res = await GET(makeReq({ code: "valid-code" }));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    // Should redirect to '/' (root) of the same origin
    expect(location).toMatch(/\/$/);
  });

  it("redirects to the 'next' path when provided and it starts with '/'", async () => {
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({
        user: { app_metadata: { provider: "email" } },
        session: { provider_token: null, expires_in: 3600 },
      }),
    );
    const res = await GET(makeReq({ code: "valid-code", next: "/dashboard" }));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/dashboard");
  });

  it("falls back to '/' when 'next' does not start with '/'", async () => {
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({
        user: { app_metadata: { provider: "email" } },
        session: { provider_token: null, expires_in: 3600 },
      }),
    );
    const res = await GET(makeReq({ code: "valid-code", next: "https://evil.com" }));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    // Should not redirect to evil.com
    expect(location).not.toContain("evil.com");
  });

  it("sets a provider token cookie for the google provider", async () => {
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({
        user: { app_metadata: { provider: "google" } },
        session: { provider_token: "goog-token-xyz", expires_in: 3600 },
      }),
    );
    const res = await GET(makeReq({ code: "valid-code" }));
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("assistantx_google_provider_token");
    expect(setCookie).toContain("goog-token-xyz");
  });

  it("clears the github provider token cookie when provider is google", async () => {
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({
        user: { app_metadata: { provider: "google" } },
        session: { provider_token: "goog-token-xyz", expires_in: 3600 },
      }),
    );
    const res = await GET(makeReq({ code: "valid-code" }));
    const setCookie = res.headers.get("set-cookie") ?? "";
    // The GitHub cookie should be cleared (maxAge=0)
    expect(setCookie).toContain("assistantx_github_provider_token");
  });

  it("uses x-forwarded-host and x-forwarded-proto for redirect origin determination", async () => {
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({
        user: { app_metadata: { provider: "email" } },
        session: { provider_token: null, expires_in: 3600 },
      }),
    );
    const req = makeReq({ code: "valid-code" }, {
      "x-forwarded-host": "myapp.example.com",
      "x-forwarded-proto": "https",
    });
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("myapp.example.com");
  });

  it("includes error_code in the login redirect when code exchange fails", async () => {
    const err = Object.assign(new Error("Token expired"), { code: "otp_expired" });
    mockCreateClient.mockResolvedValue(makeMockSupabase(null, err as Error));
    const res = await GET(makeReq({ code: "expired-code" }));
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("error_code=otp_expired");
  });

  it("redirects jarvis-desktop sign-ins to the desktop callback with session details", async () => {
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({
        user: { id: "user-123", email: "jarvis@example.com", app_metadata: { provider: "github" } },
        session: {
          access_token: "session-token-123",
          provider_token: null,
          expires_in: 3600,
          refresh_token: "refresh-token-123",
          user: {
            id: "user-123",
            email: "jarvis@example.com",
            last_sign_in_at: "2026-05-16T08:00:00.000Z",
          },
        },
      }),
    );
    const res = await GET(makeReq({ code: "valid-code", client: "jarvis-desktop" }));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("assistantx://auth/callback#");
    const hashParams = parseRedirectHash(location);
    expect(hashParams.get("access_token")).toBe("session-token-123");
    expect(hashParams.get("refresh_token")).toBe("refresh-token-123");
    expect(hashParams.get("token_type")).toBe("bearer");
    expect(hashParams.get("email")).toBe("jarvis@example.com");
    expect(hashParams.get("user_id")).toBe("user-123");
    expect(hashParams.get("signed_in_at")).toBe("2026-05-16T08:00:00.000Z");
  });

  it("passes OAuth state through jarvis-desktop callback hash", async () => {
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({
        user: { id: "user-123", email: "jarvis@example.com", app_metadata: { provider: "github" } },
        session: {
          access_token: "session-token-123",
          provider_token: null,
          expires_in: 3600,
          refresh_token: "refresh-token-123",
          user: {
            id: "user-123",
            email: "jarvis@example.com",
            last_sign_in_at: "2026-05-16T08:00:00.000Z",
          },
        },
      }),
    );
    const res = await GET(makeReq({ code: "valid-code", client: "jarvis-desktop", state: "desktop-state-abc" }));
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("assistantx://auth/callback#");
    const hashParams = parseRedirectHash(location);
    expect(hashParams.get("state")).toBe("desktop-state-abc");
    expect(hashParams.get("email")).toBe("jarvis@example.com");
    expect(hashParams.get("user_id")).toBe("user-123");
    expect(hashParams.get("signed_in_at")).toBe("2026-05-16T08:00:00.000Z");
  });

  it("redirects to the provided desktop redirect target when redirect_to uses assistantx://", async () => {
    mockCreateClient.mockResolvedValue(
      makeMockSupabase({
        user: { id: "user-123", email: "jarvis@example.com", app_metadata: { provider: "github" } },
        session: {
          access_token: "session-token-123",
          provider_token: null,
          expires_in: 3600,
          refresh_token: "refresh-token-123",
          user: {
            id: "user-123",
            email: "jarvis@example.com",
            last_sign_in_at: "2026-05-16T08:00:00.000Z",
          },
        },
      }),
    );
    const res = await GET(makeReq({
      code: "valid-code",
      redirect_to: "assistantx://auth/callback",
    }));
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("assistantx://auth/callback#");
    const hashParams = parseRedirectHash(location);
    expect(hashParams.get("access_token")).toBe("session-token-123");
    expect(hashParams.get("refresh_token")).toBe("refresh-token-123");
    expect(hashParams.get("token_type")).toBe("bearer");
    expect(hashParams.get("email")).toBe("jarvis@example.com");
    expect(hashParams.get("user_id")).toBe("user-123");
    expect(hashParams.get("signed_in_at")).toBe("2026-05-16T08:00:00.000Z");
  });
});
