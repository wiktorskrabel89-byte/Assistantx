# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: basic.spec.ts >> strona główna ładuje się i pokazuje nawigację
- Location: e2e\basic.spec.ts:3:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=AI Learning')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=AI Learning')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
  - generic [ref=e5]: assistantx Cloud
        - heading "Sign in to sync your workspaces across devices." [level=1] [ref=e6]
        - paragraph [ref=e7]: Your chats, models, pinned memory, exports, and workspace settings now persist in Supabase. Use a magic link to sign in securely without managing passwords in this app.
        - generic [ref=e8]:
          - generic [ref=e9]:
            - generic [ref=e10]: Cloud-synced workspaces
            - paragraph [ref=e11]: Your workspace structure and preferences follow your account instead of staying only in one browser.
          - generic [ref=e12]:
            - generic [ref=e13]: Secure by default
            - paragraph [ref=e14]: Authenticated routes use your Supabase session cookies, and cloud data is scoped per user with row-level security.
      - generic [ref=e15]:
        - generic [ref=e16]:
          - heading "Email magic link" [level=2] [ref=e17]
          - paragraph [ref=e18]: Enter your email and Supabase will send you a one-time sign-in link.
        - generic [ref=e19]:
          - button "Continue with Google" [ref=e20]
          - button "Continue with GitHub" [ref=e21]
        - generic [ref=e24]: or use email
        - generic [ref=e26]:
          - generic [ref=e27]:
            - generic [ref=e28]: Email address
            - textbox "Email address" [ref=e29]:
              - /placeholder: you@example.com
          - button "Send magic link" [ref=e30]
        - paragraph [ref=e32]:
          - text: By continuing, you agree to the
          - link "Terms of Service" [ref=e33] [cursor=pointer]:
            - /url: /terms
          - text: and acknowledge the
          - link "Privacy Policy" [ref=e34] [cursor=pointer]:
            - /url: /privacy
          - text: .
        - generic [ref=e35]:
          - link "Privacy Policy" [ref=e36] [cursor=pointer]:
            - /url: /privacy
          - link "Terms of Service" [ref=e37] [cursor=pointer]:
            - /url: /terms
  - button "Open Next.js Dev Tools" [ref=e43] [cursor=pointer]:
    - img [ref=e44]
  - alert [ref=e47]
```

# Test source

```ts
  1 | import { test, expect } from '@playwright/test';
  2 | 
  3 | test('strona główna ładuje się i pokazuje nawigację', async ({ page }) => {
  4 |   await page.goto('/');
  5 |   await expect(page.locator('text=Moje AI')).toBeVisible();
  6 |   await expect(page.locator('text=Chat')).toBeVisible();
> 7 |   await expect(page.locator('text=AI Learning')).toBeVisible();
    |                                                  ^ Error: expect(locator).toBeVisible() failed
  8 | });
  9 | 
```