import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { copy } from "@/lib/copy/dictionary";
import { testPassword } from "@/tests/e2e/helpers/index";

for (const language of ["en"] as const) {
  test(`CFP signup validation, minor notice, legal pages and consent (${language})`, async ({ page }) => {
    const hydration: string[] = [];
    page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/i.test(message.text())) hydration.push(message.text()); });
    await page.goto("/signup");
    const submit = page.locator('button[type="submit"]');
    await submit.click();
    await expect(page.locator('input[name="full_name"]')).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator('input[name="date_of_birth"]')).toHaveAttribute("aria-invalid", "true");
    await page.locator('input[name="full_name"]').fill("CFP Legal Student");
    await page.locator('input[name="email"]').fill(`cfp-legal-${randomUUID()}@example.com`);
    const born = new Date();
    born.setFullYear(born.getFullYear() - 16);
    await page.locator('input[name="date_of_birth"]').fill(born.toISOString().slice(0, 10));
    await page.locator('input[name="password"]').fill(testPassword!);
    await expect(page.locator('input[name="phone"]')).toHaveValue("");
    const terms = page.locator('input[name="accept_terms"]');
    const privacy = page.locator('input[name="accept_privacy"]');
    await expect(terms).not.toBeChecked();
    await expect(privacy).not.toBeChecked();
    await expect(page.getByText("If you are under 18, read these documents with a parent or guardian.")).toBeVisible();
    await submit.click();
    await expect(page.locator("#consent-error")).toContainText("Accept both");
    for (const kind of ["terms", "privacy"]) {
      const popupEvent = page.waitForEvent("popup");
      await page.locator(`fieldset a[href="/${kind}"]`).click();
      const popup = await popupEvent;
      await expect(popup.locator(".prose-gsp")).toContainText("owner drafting skeleton");
      await expect(popup.getByText(copy.common.legalPending, { exact: true })).toHaveCount(0);
      await expect(popup.locator(".prose-gsp h2").first()).toBeVisible();
      await expect(popup.getByText(/2026-11-01/).first()).toBeVisible();
      await popup.close();
    }
    await terms.check();
    await privacy.check();
    const response = page.waitForResponse((response) => response.url().endsWith("/auth/signup") && response.request().method() === "POST");
    await submit.click();
    expect((await response).status()).toBe(201);
    await expect(page).toHaveURL(/\/onboarding/);
    expect(hydration).toEqual([]);
    await page.screenshot({ path: `test-artifacts/cfp-signup-${language}.png` });
  });
}

test("CFP existing user is gated with the static interface while legal pages remain reachable", async ({ page }) => {
  const email = "cfp-no-consent@gsp.test";
  const hydration: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/i.test(message.text())) hydration.push(message.text()); });
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(testPassword!);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page).toHaveURL(/\/consent/);
  for (const language of ["en"] as const) {
    await page.goto("/profile/account");
    await expect(page).toHaveURL(/\/consent/);
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Accept both documents");
    await expect(page.getByRole("button", { name: "Log Out", exact: true })).toBeVisible();
    await page.screenshot({ path: `test-artifacts/cfp-consent-gate-${language}.png` });
    for (const kind of ["terms", "privacy"]) {
      await page.goto(`/${kind}`);
      await expect(page).toHaveURL(new RegExp(`/${kind}$`));
      await expect(page.locator(".prose-gsp")).toContainText("owner drafting skeleton");
      await expect(page.getByText(copy.common.legalPending, { exact: true })).toHaveCount(0);
    }
  }
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/consent/);
  await page.locator('input[name="tos"]').check();
  await page.locator('input[name="privacy"]').check();
  const accepted = page.waitForResponse((response) => response.url().endsWith("/consents") && response.request().method() === "POST");
  await page.locator('button[type="submit"]').click();
  expect((await accepted).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard/);
  expect(hydration).toEqual([]);
});

test("legal review notice still appears when a document is marked pending", async ({ page }) => {
  const api = process.env.GSP_E2E_API_URL ?? "http://127.0.0.1:8101";
  await page.route(`${api}/legal/terms`, async route => {
    const response = await route.fetch();
    const document = await response.json();
    await route.fulfill({ response, json: { ...document, review_pending: true } });
  });
  await page.goto("/terms");
  await expect(page.getByText(copy.common.legalPending, { exact: true })).toBeVisible();
  await expect(page.locator(".prose-gsp h2").first()).toBeVisible();
});
