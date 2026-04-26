// Placeholder for /api/debug/oauth-config route
// This prevents build errors due to missing file. Implement logic as needed.
import type { NextRequest } from "next/server";

export const GET = async (req: NextRequest) => {
  return new Response(JSON.stringify({ status: "ok", message: "OAuth config debug placeholder" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
