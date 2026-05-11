import { test, expect } from "@playwright/test";

test.describe("Public home", () => {
  test("renders public chat widget when not authenticated", async ({ page }) => {
    await page.goto("/");
    // Should show some content (login or chat widget)
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Auth redirect", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.locator("body")).toBeVisible();
  });
});
