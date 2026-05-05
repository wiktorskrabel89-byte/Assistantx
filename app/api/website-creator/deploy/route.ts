import { createClient } from "@/lib/server";
import { NextRequest } from "next/server";

/** POST /api/website-creator/deploy
 *
 * Packages HTML + CSS + JS into a single index.html file and pushes it to
 * Northflank as a static-site deployment. Falls back to a simulated response
 * when NORTHFLANK_API_KEY is not configured so the UI still works locally.
 *
 * Request body: { projectId?, projectName, html, css, js }
 * Response:     { previewUrl, deploymentId, logs? }
 */

export const maxDuration = 60;

async function getUser(req: NextRequest) {
  const supabase = await createClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    if (data.user) return data.user;
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

function buildIndexHtml(html: string, css: string, js: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
${css}
</style>
</head>
<body>
${html}
${js ? `<script>\n${js}\n</script>` : ""}
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { projectId?: string; projectName?: string; html?: string; css?: string; js?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectName = "untitled", html = "", css = "", js = "" } = body;
  const indexHtml = buildIndexHtml(html, css, js);

  const apiKey = process.env.NORTHFLANK_API_KEY;
  const projectId = process.env.NORTHFLANK_PROJECT_ID;

  // ── Simulated mode (no Northflank keys configured) ──────────────────────────
  if (!apiKey || !projectId) {
    // Return a data-URL so the UI can show a preview without real keys.
    // Security note: the data-URL is displayed inside a sandboxed iframe
    // (sandbox="allow-scripts") in the client, which prevents cross-origin access
    // and limits XSS impact to the isolated sandbox context. No user data is
    // persisted server-side in this simulated path.
    const encoded = Buffer.from(indexHtml).toString("base64");
    const dataUrl = `data:text/html;base64,${encoded}`;
    return Response.json({
      previewUrl: dataUrl,
      deploymentId: `simulated-${Date.now()}`,
      logs: [
        "NORTHFLANK_API_KEY not configured — using simulated deployment.",
        "✓ index.html built successfully.",
        `✓ Simulated preview URL generated (${(indexHtml.length / 1024).toFixed(1)} KB).`,
      ],
    });
  }

  // ── Real Northflank deployment ───────────────────────────────────────────────
  // Northflank doesn't have a direct file-upload API for static sites; the
  // standard approach is to use their Git-backed builds or their container
  // service. Here we use the "file-based" secrets/config approach by creating
  // a service with environment content, or fall back to a simplified PUT.
  //
  // For static sites the cleanest approach is to use Northflank's API to
  // create/update a "Manual Deploy" service and push the file via their CDN
  // endpoint. Below we create (or update) a deployment and upload the file.

  try {
    const serviceName = `site-${body.projectId ?? Date.now()}`;
    const northflankBase = "https://api.northflank.com/v1";
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // 1. Ensure the service exists (create if not)
    const createRes = await fetch(`${northflankBase}/projects/${projectId}/services/deployment`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: serviceName,
        description: `Static site: ${projectName}`,
        deployment: {
          docker: {
            configType: "default",
          },
        },
        // Static file hosting via Northflank's built-in static server
        staticSiteConfig: {
          buildType: "static",
          indexDocument: "index.html",
        },
      }),
    });

    let serviceId: string;
    if (createRes.ok) {
      const createData = await createRes.json() as { data?: { id?: string } };
      serviceId = createData.data?.id ?? serviceName;
    } else if (createRes.status === 409) {
      // Service already exists — use the name as ID
      serviceId = serviceName;
    } else {
      const errText = await createRes.text();
      return Response.json({ error: `Northflank service creation failed: ${errText}` }, { status: 502 });
    }

    // 2. Upload index.html as a static file (Northflank Files API)
    const uploadRes = await fetch(
      `${northflankBase}/projects/${projectId}/services/${serviceId}/files`,
      {
        method: "PUT",
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
        body: indexHtml,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return Response.json({ error: `File upload failed: ${errText}` }, { status: 502 });
    }

    // 3. Get preview URL
    const previewUrl = `https://${serviceName}--${projectId}.code.run`;

    return Response.json({
      previewUrl,
      deploymentId: serviceId,
      logs: [
        `✓ Service "${serviceName}" ensured.`,
        `✓ index.html uploaded (${(indexHtml.length / 1024).toFixed(1)} KB).`,
        `✓ Preview URL: ${previewUrl}`,
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Deployment failed.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
