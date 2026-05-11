// Custom Next.js server used by local and production scripts.
/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

// ── Required environment variables ──────────────────────────────────────────
// These must be present before the server starts. Missing vars are logged as
// errors (not thrown) so the process still starts but operators are alerted.
const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

const missingVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error(
    `[env] ❌ Missing required environment variable(s): ${missingVars.join(", ")}. ` +
    "The server will start but some features may be unavailable. " +
    "Check your .env file or deployment configuration."
  );
}

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  httpServer.listen(port, hostname, () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`> Ready on http://${hostname}:${port}`);
    }
  });
});
