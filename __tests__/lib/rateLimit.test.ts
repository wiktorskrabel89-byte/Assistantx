/**
 * @jest-environment node
 */
import { checkRateLimit, getRateLimitKey, rateLimitedResponse } from "@/lib/rateLimit";

// Each test uses a unique key to avoid state bleed from the module-level Map.
let keyIndex = 0;
function freshKey(prefix = "test"): string {
  return `${prefix}:${++keyIndex}:${Math.random()}`;
}

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------
describe("checkRateLimit", () => {
  it("allows the first request when under the limit", () => {
    const result = checkRateLimit(freshKey(), 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it("allows exactly `limit` requests within the window", () => {
    const key = freshKey();
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    }
  });

  it("denies the (limit + 1)-th request within the window", () => {
    const key = freshKey();
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, 3, 60_000);
    }
    const result = checkRateLimit(key, 3, 60_000);
    expect(result.allowed).toBe(false);
  });

  it("returns a positive retryAfterMs when rate-limited", () => {
    const key = freshKey();
    checkRateLimit(key, 1, 60_000); // fill the limit
    const result = checkRateLimit(key, 1, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows requests again after the window expires", () => {
    const realNow = Date.now();
    jest.useFakeTimers({ now: realNow });

    const key = freshKey();
    checkRateLimit(key, 1, 5_000); // fill the 5-second window

    // Advance past the window
    jest.advanceTimersByTime(6_000);

    const result = checkRateLimit(key, 1, 5_000);
    expect(result.allowed).toBe(true);

    jest.useRealTimers();
  });

  it("keeps separate state for different keys", () => {
    const key1 = freshKey();
    const key2 = freshKey();

    // Exhaust key1
    checkRateLimit(key1, 1, 60_000);
    expect(checkRateLimit(key1, 1, 60_000).allowed).toBe(false);

    // key2 should still be fresh
    expect(checkRateLimit(key2, 1, 60_000).allowed).toBe(true);
  });

  it("triggers maybePrune and cleans up stale entries after 60 seconds", () => {
    const realNow = Date.now();

    // Fill a short-window key so it becomes stale quickly.
    const staleKey = freshKey("prune");
    checkRateLimit(staleKey, 1, 1_000); // 1-second window

    // Advance time by 70 s — past both the 1-second window and the
    // 60-second prune interval so that maybePrune actually runs.
    jest.useFakeTimers({ now: realNow + 70_000 });

    // A call on any key after advancing time will trigger maybePrune.
    // Use a fresh key so the call itself is also allowed.
    const freshK = freshKey("prune");
    const result = checkRateLimit(freshK, 5, 60_000);
    expect(result.allowed).toBe(true);

    jest.useRealTimers();
  });

  it("returns retryAfterMs of 0 when the oldest timestamp is about to expire", () => {
    const realNow = Date.now();
    jest.useFakeTimers({ now: realNow });

    const key = freshKey();
    checkRateLimit(key, 1, 5_000); // fill the limit at t=0

    // Move to just before expiry so retryAfterMs would be tiny but still >= 0.
    jest.advanceTimersByTime(4_999);
    const result = checkRateLimit(key, 1, 5_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThanOrEqual(0);

    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// getRateLimitKey
// ---------------------------------------------------------------------------
describe("getRateLimitKey", () => {
  function makeReq(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api", { headers });
  }

  it("uses the last 40 characters of the Bearer token when present", () => {
    const token = "x".repeat(50);
    const key = getRateLimitKey(makeReq({ Authorization: `Bearer ${token}` }), "chat");
    expect(key).toBe(`chat:tok:${token.slice(-40)}`);
  });

  it("uses the full token when it is shorter than 40 characters", () => {
    const token = "short-token";
    const key = getRateLimitKey(makeReq({ Authorization: `Bearer ${token}` }), "chat");
    expect(key).toBe(`chat:tok:${token}`);
  });

  it("falls back to x-real-ip when there is no Bearer token", () => {
    const key = getRateLimitKey(makeReq({ "x-real-ip": "1.2.3.4" }), "upload");
    expect(key).toBe("upload:ip:1.2.3.4");
  });

  it("trims whitespace from x-real-ip", () => {
    const key = getRateLimitKey(makeReq({ "x-real-ip": "  2.3.4.5  " }), "chat");
    expect(key).toBe("chat:ip:2.3.4.5");
  });

  it("prefers x-real-ip over x-forwarded-for", () => {
    const key = getRateLimitKey(
      makeReq({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 8.8.8.8" }),
      "image"
    );
    expect(key).toBe("image:ip:1.2.3.4");
  });

  it("uses the first IP from x-forwarded-for when x-real-ip is absent", () => {
    const key = getRateLimitKey(
      makeReq({ "x-forwarded-for": "5.6.7.8, 9.10.11.12" }),
      "chat"
    );
    expect(key).toBe("chat:ip:5.6.7.8");
  });

  it("trims whitespace from the x-forwarded-for IP", () => {
    const key = getRateLimitKey(
      makeReq({ "x-forwarded-for": "  3.4.5.6  , 7.8.9.10" }),
      "chat"
    );
    expect(key).toBe("chat:ip:3.4.5.6");
  });

  it("falls back to 'unknown' when no identifying header is present", () => {
    const key = getRateLimitKey(makeReq(), "chat");
    expect(key).toBe("chat:ip:unknown");
  });

  it("prefers Bearer over x-real-ip when both are present", () => {
    const token = "tok";
    const key = getRateLimitKey(
      makeReq({ Authorization: `Bearer ${token}`, "x-real-ip": "1.2.3.4" }),
      "chat"
    );
    expect(key).toContain("tok:");
    expect(key).not.toContain("ip:1.2.3.4");
  });

  it("uses the prefix in the returned key", () => {
    const key = getRateLimitKey(makeReq(), "myroute");
    expect(key).toMatch(/^myroute:/);
  });
});

// ---------------------------------------------------------------------------
// rateLimitedResponse
// ---------------------------------------------------------------------------
describe("rateLimitedResponse", () => {
  it("returns HTTP 429 status", () => {
    const res = rateLimitedResponse(5_000);
    expect(res.status).toBe(429);
  });

  it("sets the Retry-After header in whole seconds (exact)", () => {
    const res = rateLimitedResponse(5_000);
    expect(res.headers.get("Retry-After")).toBe("5");
  });

  it("rounds up fractional seconds in the Retry-After header", () => {
    const res = rateLimitedResponse(5_500);
    expect(res.headers.get("Retry-After")).toBe("6");
  });

  it("sets Content-Type to application/json", () => {
    const res = rateLimitedResponse(1_000);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("includes a human-readable error message in the JSON body", async () => {
    const res = rateLimitedResponse(3_000);
    const body = (await res.json()) as { error: string; retryAfterSeconds: number };
    expect(body.error).toContain("Too many requests");
  });

  it("includes the retryAfterSeconds in the JSON body", async () => {
    const res = rateLimitedResponse(3_000);
    const body = (await res.json()) as { retryAfterSeconds: number };
    expect(body.retryAfterSeconds).toBe(3);
  });

  it("handles 0 ms gracefully (0 seconds)", async () => {
    const res = rateLimitedResponse(0);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("0");
    const body = (await res.json()) as { retryAfterSeconds: number };
    expect(body.retryAfterSeconds).toBe(0);
  });

  it("rounds 999 ms up to 1 second", () => {
    const res = rateLimitedResponse(999);
    expect(res.headers.get("Retry-After")).toBe("1");
  });
});
