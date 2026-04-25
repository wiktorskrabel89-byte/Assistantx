import { test, expect } from '@playwright/test';

test('cała aplikacja ładuje się i główne funkcje są widoczne', async ({ page }) => {
  // Strona główna/czat
  await page.goto('/');
  // Nagłówek aplikacji
  await expect(page.locator('text=AssistantX')).toBeVisible();
  // Widoczność zakładki Chat
  await expect(page.locator('text=Chat')).toBeVisible();
  // Pole tekstowe czatu
  await expect(page.getByRole('textbox')).toBeVisible();
  // Przycisk wyślij (Send lub Wyślij)
  await expect(page.getByRole('button', { name: /send|wyślij/i })).toBeVisible();

  // Strona logowania
  await page.goto('/auth/login');
  // Nagłówki
  await expect(page.locator('text=Sign in to sync your workspaces across devices.')).toBeVisible();
  await expect(page.locator('text=Email magic link')).toBeVisible();
  // Formularz email
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: /send magic link/i })).toBeVisible();
  // Przyciski OAuth
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible();
  // Linki do polityki prywatności i regulaminu
  const privacyLinks = await page.getByRole('link', { name: /privacy policy/i });
  await expect(privacyLinks.nth(0)).toBeVisible();
  await expect(privacyLinks.nth(1)).toBeVisible();
  const termsLinks = await page.getByRole('link', { name: /terms of service/i });
  await expect(termsLinks.nth(0)).toBeVisible();
  await expect(termsLinks.nth(1)).toBeVisible();
});
