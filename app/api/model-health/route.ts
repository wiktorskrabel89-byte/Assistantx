/**
 * GET /api/model-health
 *
 * Returns the list of model IDs currently marked as "down" (within their
 * 60-second cooling-off window). Clients use this to show a warning indicator
 * in the ModelSelector and to exclude the models from manual selection.
 */

import { getDownModels } from "@/app/api/openrouter/modelHealth";

// Always evaluate fresh — do not cache.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ downModels: getDownModels() });
}
