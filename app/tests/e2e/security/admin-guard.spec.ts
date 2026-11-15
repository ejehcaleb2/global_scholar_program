import { test, expect } from "@playwright/test";
import { adminEmail, screenshotDirectory, studentEmail } from "@/tests/e2e/helpers/index";

test("guest return path, admin default, student denial, and unsafe next values", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/admin/courses");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fcourses/, { timeout: 20_000 });
  await page.getByLabel("Email address").fill(adminEmail);
  await page.locator('input[name="password"]').fill(process.env.GSP_E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/admin\/courses$/);
  await expect(page).toHaveTitle("Courses | Global Scholars Program");
  await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();
  await expect(page.getByTestId("admin-sidebar").getByRole("navigation", { name: "Admin navigation" })).toBeVisible();
  await expect(page.getByTestId("app-sidebar")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to student view" })).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email address").fill(studentEmail);
  await page.locator('input[name="password"]').fill(process.env.GSP_E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "You do not have access to this area" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Go to dashboard" }).last()).toBeVisible();

  for (const unsafe of ["//evil.com", "https://evil.com", "/\\evil"]) {
    await page.goto(`/login?next=${encodeURIComponent(unsafe)}`);
    await page.getByLabel("Email address").fill(adminEmail);
    await page.locator('input[name="password"]').fill(process.env.GSP_E2E_PASSWORD ?? "");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3101");
  }

  const directory = await screenshotDirectory();
  await page.screenshot({ path: `${directory}/h1-dashboard-desktop.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Close navigation" });
  await expect(drawer.getByRole("navigation", { name: "Admin navigation" })).toBeVisible();
  await expect(drawer.getByRole("navigation", { name: "App navigation" })).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: "Back to student view" })).toBeVisible();
  await page.screenshot({ path: `${directory}/h1-admin-mobile-drawer.png` });
});