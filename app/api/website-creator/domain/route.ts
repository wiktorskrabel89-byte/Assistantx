import { NextRequest } from "next/server";

/** POST /api/website-creator/domain
 *
 * Creates a CNAME DNS record via the Cloudflare API pointing
 * `{subdomain}.{CLOUDFLARE_BASE_DOMAIN}` → the Northflank preview URL.
 *
 * Request body: { projectId?, subdomain, targetUrl? }
 * Response:     { liveUrl, recordId }
 *
 * When Cloudflare env vars are not configured, returns a simulated response.
 */

export async function POST(req: NextRequest) {
  let body: { projectId?: string; subdomain?: string; targetUrl?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { subdomain, targetUrl } = body;
  if (!subdomain?.trim()) {
    return Response.json({ error: "subdomain is required" }, { status: 400 });
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const baseDomain = process.env.CLOUDFLARE_BASE_DOMAIN;

  // ── Simulated mode ────────────────────────────────────────────────────────────
  if (!apiToken || !zoneId || !baseDomain) {
    const simulatedUrl = `https://${subdomain.trim()}.example.com`;
    return Response.json({
      liveUrl: simulatedUrl,
      recordId: `simulated-${Date.now()}`,
      note: "Cloudflare env vars not configured — simulated domain assignment.",
    });
  }

  // ── Real Cloudflare DNS record ────────────────────────────────────────────────
  const fullDomain = `${subdomain.trim()}.${baseDomain}`;
  // The CNAME target is the Northflank preview URL (hostname only) or the
  // base domain as a fallback.
  let cnameTarget = baseDomain;
  if (targetUrl) {
    try {
      cnameTarget = new URL(targetUrl).hostname;
    } catch {
      cnameTarget = baseDomain;
    }
  }

  try {
    // Check if a record already exists for this name
    const listRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(fullDomain)}`,
      { headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" } }
    );
    const listData = await listRes.json() as { result?: { id: string }[] };
    const existingId = listData.result?.[0]?.id;

    const payload = {
      type: "CNAME",
      name: fullDomain,
      content: cnameTarget,
      ttl: 1,    // auto
      proxied: true,
    };

    let recordId: string;

    if (existingId) {
      // Update existing record
      const updateRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existingId}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const updateData = await updateRes.json() as { success?: boolean; result?: { id: string }; errors?: { message: string }[] };
      if (!updateData.success) {
        const msg = updateData.errors?.map((e) => e.message).join(", ") ?? "Cloudflare update failed.";
        return Response.json({ error: msg }, { status: 502 });
      }
      recordId = updateData.result?.id ?? existingId;
    } else {
      // Create new CNAME record
      const createRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const createData = await createRes.json() as { success?: boolean; result?: { id: string }; errors?: { message: string }[] };
      if (!createData.success) {
        const msg = createData.errors?.map((e) => e.message).join(", ") ?? "Cloudflare DNS creation failed.";
        return Response.json({ error: msg }, { status: 502 });
      }
      recordId = createData.result?.id ?? "";
    }

    const liveUrl = `https://${fullDomain}`;
    return Response.json({ liveUrl, recordId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DNS configuration failed.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
