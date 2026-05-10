# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: basic.spec.ts >> strona główna ładuje się i pokazuje nawigację
- Location: e2e/basic.spec.ts:3:5

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
Call log:
  - navigating to "http://localhost:3000/", waiting until "load"

```

# Test source

```ts
  1 | import { test, expect } from '@playwright/test';
  2 | 
  3 | test('strona główna ładuje się i pokazuje nawigację', async ({ page }) => {
> 4 |   await page.goto('/');
    |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
  5 |   await expect(page.locator('text=AssistantX')).toBeVisible();
  6 |   await expect(page.locator('text=Chat')).toBeVisible();
  7 |   await expect(page.locator('text=AI Learning')).toBeVisible();
  8 | });
  9 | 
```