import { createClient } from "@/lib/server";

/**
 * GET /api/admin/check
 * Returns { isAdmin: boolean } based on the authenticated user's app_metadata.
 * The `role` field in app_metadata is set via the Supabase dashboard or management API;
 * it cannot be modified by the client, making this a secure server-side check.
 */
export async function GET(req: Request) {
  const noStore = { headers: { "Cache-Control": "no-store", "Vary": "Authorization" } };
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ isAdmin: false }, { status: 401, ...noStore });
    }

    const token = authHeader.slice(7);
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return Response.json({ isAdmin: false }, { status: 403, ...noStore });
    }

    const appMetadata = data.user.app_metadata ?? {};
    // Admins have app_metadata.role === "admin" (set in Supabase dashboard).
    // Additional owner emails can be specified via the ADMIN_EMAILS env var
    // (comma-separated) to grant admin access without Supabase metadata changes.
    const ownerEmails = (process.env.ADMIN_EMAILS ?? "wiktorskrabel89@gmail.com")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const isAdmin =
      appMetadata.role === "admin" ||
      ownerEmails.includes(data.user.email ?? "");

    return Response.json({ isAdmin }, noStore);
  } catch {
    return Response.json({ isAdmin: false }, { status: 500, ...noStore });
  }
}
