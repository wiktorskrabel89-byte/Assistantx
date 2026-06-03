@AGENTS.md

## Quick Reference

- Build: `npm run build`
- Lint: `npm run lint`
- Dev server: `npm run dev:next`
- No test suite is configured yet.
- Always read `node_modules/next/dist/docs/` before using Next.js APIs — this project uses Next.js 16 which has breaking changes from earlier versions.

# Firecrawl Integration

Firecrawl provides fast, reliable web context with strong search, scraping, and interaction tools. Three main paths for different use cases:

## Quick Start

```bash
# Live web tools (search, scrape, interact during session)
/firecrawl-search   # Search the web and get results
/firecrawl-scrape   # Extract clean markdown from a URL
/firecrawl-interact # Click, fill forms, navigate on live pages

# Workflow deliverables (research reports, SEO audits, etc)
/firecrawl-workflows # Route to research, SEO, lead-gen, or QA workflows

# Build Firecrawl into app code
/firecrawl-build    # Add Firecrawl API calls to project code
```

## Three Paths

### Path A: Live Web Tools
Use when you need web data during this session (search, scrape, interact):

- `/firecrawl-search` — discover pages by query
- `/firecrawl-scrape` — extract clean markdown from a single URL
- `/firecrawl-interact` — browser actions (clicks, forms, navigation)
- `/firecrawl-crawl` — bulk extraction from multiple URLs
- `/firecrawl-map` — discover URL structure of a site

### Path B: Build Firecrawl Into App Code
Use when adding Firecrawl API calls to the AssistantX codebase:

- `/firecrawl-build` — overall workflow for integrating into code
- `/firecrawl-build-onboarding` — auth, SDK install, env vars, smoke test
- `/firecrawl-build-scrape` — add scraping to a feature
- `/firecrawl-build-search` — add search discovery to a feature
- `/firecrawl-build-interact` — add browser interactions to a feature

### Path C: Workflow Deliverables
Use when the goal is a finished artifact (research brief, SEO audit, lead list, QA report):

- `/firecrawl-workflows` — auto-routes to the right workflow
- `/firecrawl-deep-research` — multi-source research reports
- `/firecrawl-seo-audit` — SEO analysis and recommendations
- `/firecrawl-lead-gen` — prospect research and lead lists
- `/firecrawl-qa` — QA testing and issue detection
- `/firecrawl-knowledge-base` — turn web content into a KB
- `/firecrawl-market-research` — competitive intelligence

## Configuration

API Key (already set up):
```
FIRECRAWL_API_KEY=fc-e789df071c054e76aef3d7413e2c46b0
```

To use Firecrawl in app code, add to `.env`:
```dotenv
FIRECRAWL_API_KEY=fc-e789df071c054e76aef3d7413e2c46b0
```

Install SDK (if adding to app):
```bash
# TypeScript/JavaScript
npm install @firecrawl/sdk

# Python
pip install firecrawl-py
```

## Common Tasks

**Research a competitor's website:**
```
/firecrawl-deep-research research [competitor name] and their top features
```

**Scrape a specific page:**
```
/firecrawl-scrape https://example.com/pricing
```

**Get SEO recommendations for a page:**
```
/firecrawl-seo-audit https://assistantx.com
```

**Find prospects in a market:**
```
/firecrawl-lead-gen Find B2B SaaS companies in [market]
```

**Test a website for issues:**
```
/firecrawl-qa Test https://example.com for broken links, form issues, etc
```

## Docs & References

- Full API docs: https://docs.firecrawl.dev
- Skills repo (build patterns): https://github.com/firecrawl/skills
- Workflows repo (deliverables): https://github.com/firecrawl/firecrawl-workflows

