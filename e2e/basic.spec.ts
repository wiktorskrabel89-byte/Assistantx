import { test, expect } from '@playwright/test';

test('strona główna ładuje się i pokazuje nawigację', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Moje AI')).toBeVisible();
  await expect(page.locator('text=Chat')).toBeVisible();
  await expect(page.locator('text=AI Learning')).toBeVisible();
});
