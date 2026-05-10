# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: basic.spec.ts >> strona główna ładuje się i pokazuje nawigację
- Location: e2e/basic.spec.ts:3:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=AssistantX')
Expected: visible
Error: strict mode violation: locator('text=AssistantX') resolved to 4 elements:
    1) <h1 class="mb-4 text-4xl font-bold text-blue-700">AssistantX</h1> aka getByRole('heading', { name: 'AssistantX' })
    2) <strong>AssistantX</strong> aka getByRole('strong')
    3) <footer class="mt-8 text-center text-sm text-slate-500">…</footer> aka getByText('© 2026 AssistantX. All rights')
    4) <button type="button" aria-label="Open AssistantX chat widget" class="fixed bottom-8 right-8 z-50 rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-800 shadow-lg transition hover:bg-blue-50">Open AssistantX chat</button> aka getByRole('button', { name: 'Open AssistantX chat widget' })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=AssistantX')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]: AI workspace for chat, code, files, and integrations
        - navigation [ref=e7]:
          - link "Privacy Policy" [ref=e8] [cursor=pointer]:
            - /url: /privacy
          - link "Terms of Service" [ref=e9] [cursor=pointer]:
            - /url: /terms
          - link "Support" [ref=e10] [cursor=pointer]:
            - /url: /support
      - heading "AssistantX" [level=1] [ref=e11]
      - paragraph [ref=e12]:
        - strong [ref=e13]: AssistantX
        - text: is an advanced AI workspace for chat, code, file uploads, image generation, and cloud-synced projects. It integrates with GitHub, Google Drive, and Supabase for seamless productivity.
      - list [ref=e14]:
        - listitem [ref=e15]: Multi-model AI chat (GPT, Claude, Gemini, and more)
        - listitem [ref=e16]: Code review, file uploads, and image generation
        - listitem [ref=e17]: GitHub & Google Drive integration
        - listitem [ref=e18]: Supabase-backed authentication and cloud sync
      - paragraph [ref=e19]: No login is required to view this page. To use the workspace, sign in or create an account.
      - generic [ref=e20]:
        - link "Sign In" [ref=e21] [cursor=pointer]:
          - /url: /auth/login
        - link "Review Privacy Policy" [ref=e22] [cursor=pointer]:
          - /url: /privacy
    - generic [ref=e23]: © 2026 AssistantX. All rights reserved.
    - button "Open AssistantX chat widget" [ref=e24]: Open AssistantX chat
  - button "Open Next.js Dev Tools" [ref=e30] [cursor=pointer]:
    - img [ref=e31]
  - alert [ref=e34]
```

# Test source

```ts
  1 | import { test, expect } from '@playwright/test';
  2 | 
  3 | test('strona główna ładuje się i pokazuje nawigację', async ({ page }) => {
  4 |   await page.goto('/');
> 5 |   await expect(page.locator('text=AssistantX')).toBeVisible();
    |                                                 ^ Error: expect(locator).toBeVisible() failed
  6 |   await expect(page.locator('text=Chat')).toBeVisible();
  7 |   await expect(page.locator('text=AI Learning')).toBeVisible();
  8 | });
  9 | 
```