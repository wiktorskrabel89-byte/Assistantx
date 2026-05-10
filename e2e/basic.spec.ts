import { test, expect } from '@playwright/test';

test('strona główna ładuje się i pokazuje nawigację', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'AssistantX' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy Policy' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Terms of Service' }).first()).toBeVisible();
});
