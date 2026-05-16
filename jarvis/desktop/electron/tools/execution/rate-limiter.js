'use strict';

function createToolRateLimiter({
  maxPerTool = 20,
  maxPerSession = 120,
  windowMs = 60_000,
} = {}) {
  const buckets = new Map();

  function currentBucket(key) {
    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const next = { count: 0, resetAt: now + windowMs };
      buckets.set(key, next);
      return next;
    }
    return existing;
  }

  function consume(tool, sessionId = 'default') {
    const toolBucket = currentBucket(`tool:${tool}`);
    const sessionBucket = currentBucket(`session:${sessionId}`);

    if (toolBucket.count >= maxPerTool) {
      return { ok: false, reason: 'tool-rate-limit', retryAfterMs: toolBucket.resetAt - Date.now() };
    }
    if (sessionBucket.count >= maxPerSession) {
      return { ok: false, reason: 'session-rate-limit', retryAfterMs: sessionBucket.resetAt - Date.now() };
    }

    toolBucket.count += 1;
    sessionBucket.count += 1;
    return { ok: true };
  }

  return {
    consume,
  };
}

module.exports = {
  createToolRateLimiter,
};
