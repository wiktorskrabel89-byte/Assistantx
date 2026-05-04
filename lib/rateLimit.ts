/**
 * In-process sliding-window rate limiter.
 *
 * Works on both the custom Node server (single process, shared map) and
 * serverless functions (best-effort per instance — still meaningful protection).
 *
 * No external dependencies required.
 */

// Map<key, sorted array of request timestamps (ms)>
const windows = new Map<string, number[]>();

let lastPrune = Date.now();

/** Remove stale entries from the map to prevent unbounded memory growth. */
function maybePrune(windowMs: number) {
  const now = Date.now();
  if (now - lastPrune < 60_000) return; // at most once per minute
  lastPrune = now;
  const cutoff = now - windowMs;
  for (const [key, timestamps] of windows.entries()) {
    const pruned = timestamps.filter((t) => t > cutoff);
    if (pruned.length === 0) windows.delete(key);
    else windows.set(key, pruned);
  }
}

/**
 * Check whether the caller identified by `key` is within their rate limit.
 *
 * @param key       Unique identifier for the caller (e.g. "chat:user-id")
 * @param limit     Maximum number of requests allowed within `windowMs`
 * @param windowMs  Duration of the sliding window in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  maybePrune(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  // Keep only timestamps within the current window
  const existing = (windows.get(key) ?? []).filter((t) => t > cutoff);

  if (existing.length >= limit) {
    // Tell the caller how long to wait until the oldest request expires
    const retryAfterMs = existing[0] + windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  existing.push(now);
  windows.set(key, existing);
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Derive a stable rate-limit key from the incoming request.
 *
 * Authenticated requests are keyed by the last 40 characters of the Bearer
 * token (unique per Supabase session, no round-trip needed). Anonymous
 * requests fall back to the client IP.
 *
 * IP extraction prefers `x-real-ip` (set by trusted reverse-proxies such as
 * Nginx/Vercel and not spoofable by the client) over `x-forwarded-for`.
 * When using `x-forwarded-for`, only the *last* address is used — this is
 * the address appended by the nearest trusted proxy and cannot be faked by
 * the browser.
 *
 * @param req    Incoming Next.js route request
 * @param prefix Short route identifier, e.g. "chat" or "image"
 */
export function getRateLimitKey(req: Request, prefix: string): string {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7); // strip "Bearer "
    // Use a suffix slice — avoids huge keys while remaining unique per session
    return `${prefix}:tok:${token.slice(-40)}`;
  }

  // x-real-ip is set by the nearest trusted proxy and cannot be spoofed by the client.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return `${prefix}:ip:${realIp}`;

  // x-forwarded-for is a comma-separated list; the *last* entry is appended
  // by the nearest trusted proxy and is safe to use for rate limiting.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",");
    const trustedIp = ips[ips.length - 1].trim();
    if (trustedIp) return `${prefix}:ip:${trustedIp}`;
  }

  return `${prefix}:ip:unknown`;
}

/** Build a 429 Response with a Retry-After header. */
export function rateLimitedResponse(retryAfterMs: number): Response {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please slow down.",
      retryAfterSeconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}
