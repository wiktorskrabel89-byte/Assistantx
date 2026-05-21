This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Run only the local queue worker (polls `ai_tasks` and executes local Ollama jobs):

```bash
npm run dev:worker
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Local Worker Queue (ai-agent/worker.py)

The repository now includes a dedicated Python worker process at:

- `/home/runner/work/Assistantx/Assistantx/ai-agent/worker.py`

It is isolated from HTTP API servers and is designed to:

- poll `public.ai_tasks` (`pending` + `routing=local`)
- process tasks with local Ollama (`qwen2.5:14b` by default)
- process async Jarvis queue tasks created by `/api/jarvis/tasks`
- parse in-chat commands like `zmień temp na 0.7`
- persist temperature per-task (`ai_tasks.temperature`) and per-user (`user_profiles.default_temperature`)
- inject a sanitized, size-limited copy of its own source code into the system prompt
- augment explicit Polish web-search prompts through local SearXNG (`JARVIS_SEARXNG_URL`)
- keep the light model warm while unloading the heavy model immediately after use
- auto-fallback to cloud model (`OPENROUTER_API_KEY`) when local runtime is unavailable or overloaded
- execute the allowlisted `system_action` commands:
  - `launch_roblox`
  - `system_file_list`
  - `system_status_ping`

Database objects are introduced in migration:

- `supabase/migrations/20260521_ai_tasks_local_worker.sql`

Required env for worker:

```bash
SUPABASE_URL=... # or NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=... # required for cloud fallback
```

Useful worker tuning vars:

```bash
LOCAL_WORKER_MAX_PROCESSING=2
LOCAL_WORKER_TASK_PICK_TIMEOUT_SECONDS=10
LOCAL_WORKER_DEVICE_ID=...
LOCAL_WORKER_ALLOWED_DIRECTORY=/path/to/safe/root
LOCAL_OLLAMA_BASE_URL=http://localhost:11434
LOCAL_OLLAMA_LIGHT_MODEL=qwen2.5:14b
LOCAL_OLLAMA_HEAVY_MODEL=qwen2.5-coder:32b
LOCAL_OLLAMA_LIGHT_KEEP_ALIVE=5m
LOCAL_OLLAMA_HEAVY_KEEP_ALIVE=0
JARVIS_SEARXNG_URL=http://127.0.0.1:8080
LOCAL_WORKER_WEB_SEARCH_MAX_RESULTS=3
IMAGE_GEN_API_URL=http://127.0.0.1:7860/sdapi/v1/txt2img
```

Suggested local startup checklist:

1. Pull the Ollama models you want the worker to route between.
2. Start SearXNG locally and enable the `json` response format in its settings.
3. Start Forge/ComfyUI separately on GPU 1 and expose its API URL through `IMAGE_GEN_API_URL`.
4. Run `npm run dev:worker` to process `ai_tasks` with local-first routing and cloud fallback.

## Speed Insights Get Started

To start collecting performance metrics in Next.js:

1. Install the package:
   ```bash
   npm i @vercel/speed-insights
   ```
2. Add the Next.js component by importing `SpeedInsights` from `@vercel/speed-insights/next` and rendering `<SpeedInsights />` in the root layout (`app/layout.tsx`).
   - This repository already includes that integration in `app/layout.tsx`.


## Integrations Setup

See [INTEGRATIONS_SETUP.md](INTEGRATIONS_SETUP.md) for step-by-step instructions to configure Supabase and OpenRouter for all integrations (Google, GitHub, etc.).

## Supabase Auth And Cloud Sync

This app now uses Supabase magic-link authentication and can sync workspaces to the database.

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
GROQ_API_KEY=...
GOOGLE_AI_STUDIO_API_KEY=...
OPENROUTER_API_KEY=...
```

### Website Creator (optional)

The Website Creator add-on supports deploying static sites to Northflank and
configuring custom domains via Cloudflare. These are optional — the tab works
without them in "simulated" mode.

```bash
# Northflank — deploy static sites
NORTHFLANK_API_KEY=...
NORTHFLANK_PROJECT_ID=...

# Cloudflare — assign custom subdomains (optional)
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ZONE_ID=...
CLOUDFLARE_BASE_DOMAIN=yourdomain.com

# Admin access — comma-separated list of emails granted the AI Learning tab
# (in addition to any Supabase users whose app_metadata.role === "admin")
ADMIN_EMAILS=wiktorskrabel89@gmail.com
```

Run the migrations to enable project storage:
```bash
supabase/migrations/20260504_website_creator.sql
supabase/migrations/20260504_website_creator_enhancements.sql
supabase/migrations/20260505_website_creator_snapshot_user_idx.sql
```

Required Supabase setup:

1. Add your app origin and `/auth/callback` to Supabase Auth redirect URLs.
2. Enable the Google and GitHub providers in Supabase Auth.
3. If you want to attach Google or GitHub to an existing email-magic-link account, turn on manual account linking in Supabase Auth settings.
4. For Google Drive import, enable the Google Drive API for the OAuth app used by your Supabase Google provider.
5. Run the SQL in `supabase/migrations/20260413_auth_workspace_sync.sql`.
6. Start the app and sign in at `/auth/login`.

Without the migration, the app still runs locally, but cloud workspace sync will show a setup error in the in-app roadmap panel.

GitHub integration now browses importable repo files in-app and can stage a file directly into the existing upload analysis flow. Google integration now imports a Drive file by share link or file ID after the account has Google Drive scope. VS Code integration is built into the app sidebar and exports the active chat plus extracted artifacts as a markdown handoff bundle.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Testing

| Task | Command |
|------|---------|
| Unit tests | `npm test` |
| E2E tests (Playwright) | `npx playwright test` |
| Lint | `npm run lint` |

The repository includes Jest unit tests in `__tests__/` and Playwright end-to-end tests in `e2e/`.

## Runtime Foundation (Phase 1)

AssistantX now includes a runtime-foundation scaffold under `/src` for the architecture migration:

- platform decisions (`src/core/config/platform.ts`)
- runtime events + event-bus boundary (`src/core/events/*`)
- tool policy + governed tool router (`src/core/policies/*`, `src/tools/router/*`)
- agent-runtime contracts (`src/agents/runtime/*`)
- runtime facade + FastAPI compatibility bridge marker (`src/backend/runtime/*`)
- thin runtime API adapter (`app/api/runtime/execute/route.ts`)

See `docs/architecture/runtime-foundation.md` for details.

## Public MCP API

AssistantX exposes MCP discovery and invocation routes:

- `GET /api/mcp`
- `GET /api/mcp/tools`
- `POST /api/mcp/invoke`

Authenticate with either:

- `Authorization: Bearer <MCP_API_KEY>` for server-to-server access, or
- `Authorization: Bearer <Supabase access token>` for a signed-in AssistantX user.

Example discovery request:

```bash
curl -H "Authorization: Bearer $MCP_API_KEY" \
  http://localhost:3000/api/mcp/tools
```

Example tool invocation:

```bash
curl -X POST http://localhost:3000/api/mcp/invoke \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "memory/write",
    "input": {
      "content": "Remember that the PR review route is enabled.",
      "layer": "episodic",
      "tags": ["mcp", "example"]
    }
  }'
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
