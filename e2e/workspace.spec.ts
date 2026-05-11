import { test, expect } from "@playwright/test";

test.describe("Public home", () => {
  test("renders chat UI or redirects to login", async ({ page }) => {
    await page.goto("/");
    // Either the chat composer or the login form must be visible
    const chatOrLogin = page.locator("textarea, input[type='email'], input[type='text']");
    await expect(chatOrLogin.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Auth login page", () => {
  test("login page shows email input or OAuth button", async ({ page }) => {
    await page.goto("/auth/login");
    // At least one interactive element should be present
    const interactive = page.locator("input, button");
    await expect(interactive.first()).toBeVisible({ timeout: 10_000 });
  });
});
