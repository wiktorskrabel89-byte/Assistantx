<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: AssistantX

An AI workspace built with **Next.js 16** and a **Python FastAPI** backend. Features multi-model chat, file uploads, image generation, code review, GitHub/Google Drive integrations, and Supabase-backed authentication with cloud workspace sync.

## Commands

| Task | Command |
|------|---------|
| Install deps | `npm ci` |
| Dev (Next + FastAPI) | `npm run dev` |
| Dev (Next only) | `npm run dev:next` |
| Dev (FastAPI only) | `npm run dev:api` |
| Build | `npm run build` |
| Start production | `npm start` |
| Lint | `npm run lint` |

The Next.js dev server uses a custom `server.js` (binds `0.0.0.0:3000`). The FastAPI backend lives in the `ai agent/` directory and runs on `127.0.0.1:8000`.

## Environment Variables

Required in `.env` (not committed):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
GROQ_API_KEY=...
GOOGLE_AI_STUDIO_API_KEY=...
OPENROUTER_API_KEY=...
```

## Directory Structure

```
app/
  page.tsx          # Main single-page client component (chat UI)
  layout.tsx        # Root layout (Geist font, QueryProvider, Analytics)
  components/       # UI components (AIMessage, ChatComposer, panels, etc.)
  hooks/            # React hooks (chat transport, workspace queries/state/sync)
  lib/              # Client-side helpers (chat-state, chat-transport, chat-types)
  api/              # Next.js API routes
    chat/route.ts   # OpenRouter streaming proxy (SSE)
    upload/route.ts # File upload endpoint
    image/route.ts  # Image-related endpoint
    history/route.ts
    agents/         # Agent documentation endpoint
    integrations/   # GitHub & Google Drive integration routes
    workspaces/     # Workspace state sync
  auth/             # Auth pages (login, callback)
  privacy/          # Privacy policy page
  terms/            # Terms page
lib/
  ai-config.ts      # Model lists and language options
  client.ts         # Supabase browser client
  server.ts         # Supabase server client
  middleware.ts      # Auth session middleware
  oauth-client.ts   # OAuth helper
  utils.ts          # Shared utilities (cn)
  integrations.ts   # Integration helpers
ai agent/           # Python FastAPI backend
  main.py           # FastAPI app entry point
supabase/
  migrations/       # SQL migration files
proxy.ts            # Next.js middleware config (auth session refresh)
server.js           # Custom Node HTTP server for Next.js
Dockerfile          # Production Docker image (node:22-bookworm-slim)
```

## Architecture Notes

- **Single-page app**: `app/page.tsx` is a large `"use client"` component that renders the entire chat workspace with tab navigation. All panels (chat, code review, GitHub, integrations, etc.) are toggled client-side.
- **Chat backend**: `app/api/chat/route.ts` uses Groq as primary provider with Google AI Studio fallback, streaming responses via SSE. It auto-detects language, request type (code/image/search), and selects the appropriate model.
- **Auth**: Supabase magic-link authentication with Google/GitHub OAuth providers. Middleware in `proxy.ts` + `lib/middleware.ts` refreshes sessions and redirects unauthenticated users to `/auth/login`.
- **Styling**: Tailwind CSS v4 with `tw-animate-css`. Component library is shadcn/ui (radix-ui primitives). Dark/light theme is toggled client-side.
- **State**: React Query (`@tanstack/react-query`) for server state. Local workspace state managed via custom hooks (`useWorkspaceState`, `useWorkspaceSync`).
- **No test framework** is currently configured in this repository.

## Conventions

- TypeScript strict mode is enabled.
- ESLint uses `eslint-config-next` with core-web-vitals and TypeScript rules.
- Path alias `@/*` maps to the project root.
- Components live in `app/components/` and are imported directly by `app/page.tsx`.
- API routes use the Next.js App Router convention (`app/api/.../route.ts`).
- The `"use client"` directive is used at the top of client components.
- Prefer existing libraries (`lucide-react` for icons, `react-markdown` + `react-syntax-highlighter` for rendering).
