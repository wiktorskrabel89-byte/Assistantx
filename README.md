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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.


## Integrations Setup

See [INTEGRATIONS_SETUP.md](INTEGRATIONS_SETUP.md) for step-by-step instructions to configure Supabase and OpenRouter for all integrations (Google, GitHub, etc.).

## Supabase Auth And Cloud Sync

This app now uses Supabase magic-link authentication and can sync workspaces to the database.

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
