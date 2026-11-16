import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { loginThroughUi, testPassword } from "@/tests/e2e/helpers/index";

test("RCP student signup, returning login and administrator discovery", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const email = `rcp-smoke-${randomUUID()}@example.com`;
  if (!testPassword) throw new Error("Isolated test credentials are required.");
  await page.goto("/signup");
  await page.locator('input[name="full_name"]').fill("RCP Smoke Student");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="date_of_birth"]').fill("2005-01-01");
  await page.locator('select[name="country"]').selectOption({ label: "Cameroon" });
  await page.locator('input[name="password"]').fill(testPassword);
  await page.locator('input[name="accept_terms"]').check();
  await page.locator('input[name="accept_privacy"]').check();
  const registration = page.waitForResponse((response) => response.url().endsWith("/auth/signup") && response.request().method() === "POST");
  await page.locator('button[type="submit"]').click();
  expect((await registration).status()).toBe(201);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.reload();
  await expect(page.getByLabel("School", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("School", { exact: true }).fill("RCP Test School");
  await page.getByLabel("City", { exact: true }).fill("Yaounde");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Undergraduate applications", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Log Out", exact: true }).click();
  await page.getByRole("alertdialog", { name: "Log out?" }).getByRole("button", { name: "Log Out", exact: true }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(testPassword);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('[data-shell="app"]')).toBeVisible();

  const administrator = await browser.newContext();
  try {
    const adminPage = await administrator.newPage();
    await loginThroughUi(adminPage);
    await adminPage.goto("/admin/students");
    await adminPage.getByRole("textbox", { name: "Search by student name or email" }).fill(email);
    const student = adminPage.getByRole("row").filter({ hasText: email });
    await expect(student).toBeVisible();
    await expect(student).toContainText("RCP Smoke Student");
  } finally {
    await administrator.close();
  }
});
