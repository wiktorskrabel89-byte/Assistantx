/**
 * Server-side in-memory model health tracker.
 *
 * When a model returns a 5xx or "no endpoint" 404 error from OpenRouter, it is
 * marked as "down". Down models are excluded from auto-routing. After a 2-hour
 * cooling-off window the model is tentatively re-admitted: the next live request
 * acts as a natural health probe. A successful response clears the down state; a
 * new failure restarts the 2-hour window.
 *
 * State lives in Node.js module scope — it persists across requests within a warm
 * server process and is intentionally reset on cold start (acceptable trade-off
 * for a stateless serverless environment).
 */

/** Two-hour re-check window in milliseconds. */
export const RECHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;

type HealthEntry = {
  /** Timestamp (ms) when the model was first marked down in the current window. */
  markedDownAt: number;
  /**
   * Timestamp (ms) of the last time the cooling-off status was evaluated.
   * Updated to now when the 2h window expires so subsequent reads don't
   * immediately re-probe the same model multiple times.
   */
  lastCheckedAt: number;
};

const downModels = new Map<string, HealthEntry>();

/**
 * Mark a model as down.
 * Restarts (or initialises) the 2-hour cooling-off window.
 */
export function markModelDown(modelId: string): void {
  const now = Date.now();
  downModels.set(modelId, { markedDownAt: now, lastCheckedAt: now });
}

/**
 * Call this when a model responds successfully.
 * Removes the model from the down set so it is immediately usable again.
 */
export function recordModelSuccess(modelId: string): void {
  downModels.delete(modelId);
}

/**
 * Returns true if the model is currently inside its 2-hour cooling-off window.
 *
 * Once the window has elapsed the entry is refreshed and the function returns
 * false, allowing the next request to act as a live health probe without
 * generating a dedicated probe API call.
 */
export function isModelDown(modelId: string): boolean {
  const entry = downModels.get(modelId);
  if (!entry) return false;

  const now = Date.now();
  if (now - entry.lastCheckedAt >= RECHECK_INTERVAL_MS) {
    // Cooling-off window expired — refresh timestamp and tentatively re-admit.
    downModels.set(modelId, { ...entry, lastCheckedAt: now });
    return false;
  }
  return true;
}

/**
 * Filters a list of model IDs, removing those that are currently down.
 * Falls back to the original list if filtering would leave it empty.
 */
export function filterHealthyModels(modelIds: string[]): string[] {
  const healthy = modelIds.filter((id) => !isModelDown(id));
  return healthy.length > 0 ? healthy : modelIds;
}

/**
 * Returns all model IDs that are currently within their 2-hour cooling-off
 * window (i.e. excluded from auto-routing right now).
 */
export function getDownModels(): string[] {
  const now = Date.now();
  const result: string[] = [];
  for (const [id, entry] of downModels) {
    if (now - entry.lastCheckedAt < RECHECK_INTERVAL_MS) {
      result.push(id);
    }
  }
  return result;
}

/** @internal — exposed only for tests. Resets all health state. */
export function _resetForTests(): void {
  downModels.clear();
}
