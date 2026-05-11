import { expect, test } from "@playwright/test";

test("public homepage legal/support navigation flow works", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "AssistantX" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();

  await page.getByRole("link", { name: "Privacy Policy" }).first().click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Terms of Service" }).first().click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Support" }).first().click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.getByText("AssistantX Support Assistant")).toBeVisible();
});

test("login/register flow toggles tabs and validates required fields", async ({ page }) => {
  await page.goto("/auth/login");

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sign In" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Create Account" })).toBeVisible();

  await page.getByRole("tab", { name: "Create Account" }).click();
  await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();

  await page.getByLabel("Email address").fill("user@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("different-password");
  await page.getByRole("checkbox", { name: /I agree to the/i }).check();
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/login$/);
});
