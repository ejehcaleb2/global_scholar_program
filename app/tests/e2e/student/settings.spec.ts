import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { copy } from "@/lib/copy/dictionary";
import { adminEmail, studentEmail, testPassword } from "@/tests/e2e/helpers/index";
import { api, headers, heldMutation } from "@/tests/e2e/helpers/admin-actions";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: copy.auth.showPassword, exact: true }).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute("type", "text");
  await page.getByLabel(copy.auth.email).fill(studentEmail);
  await page.locator('input[name="password"]').fill(testPassword!);
  const response = page.waitForResponse(item => new URL(item.url()).pathname === "/auth/login" && item.request().method() === "POST");
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("profile first interest and comma-separated drafts save, discard and recover visibly", async ({ page }) => {
  await signIn(page);
  const auth = await headers(page);
  const originalResponse = await page.request.get(`${api()}/profile`, { headers: auth });
  expect(originalResponse.ok()).toBeTruthy();
  const original = await originalResponse.json();
  try {
    await page.goto("/profile");
    const save = page.getByRole("button", { name: copy.profile.save, exact: true });
    await expect(save).toBeDisabled();
    const reason = page.getByRole("button", { name: copy.profile.reasons[0], exact: true });
    const selected = await reason.getAttribute("aria-pressed");
    await reason.click();
    await expect(reason).toHaveAttribute("aria-pressed", String(selected !== "true"));
    const studies = page.getByLabel(copy.profile.fieldsOfStudy, { exact: true });
    await studies.fill("");
    await studies.pressSequentially("Biology, Physics");
    await expect(studies).toHaveValue("Biology, Physics");
    await expect(page.getByRole("status").filter({ hasText: copy.admin.saveStatusDirty })).toBeVisible();
    const saved = await heldMutation(page, "/profile", "PATCH", save);
    expect((await saved.json()).fields_of_study).toEqual(["Biology", "Physics"]);
    await expect(save).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: copy.admin.saveStatusSaved })).toBeVisible();
    await page.reload(); await expect(studies).toHaveValue("Biology, Physics");
    await studies.fill("Unsaved draft");
    await page.getByRole("button", { name: copy.profile.discard, exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: copy.profile.keepEditing }).click();
    await expect(dialog).toBeHidden();
    await expect(studies).toHaveValue("Unsaved draft");
    await page.getByRole("button", { name: copy.profile.discard, exact: true }).click();
    await dialog.getByRole("button", { name: copy.profile.discard, exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(studies).toHaveValue("Biology, Physics");
    await studies.fill("Biology, Chemistry");
    await page.route(`${api()}/profile`, async route => route.request().method() === "PATCH" ? route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"Unavailable"}' }) : route.continue());
    await save.click();
    await expect(page.getByRole("status").filter({ hasText: copy.admin.saveStatusError })).toBeVisible();
    await expect(page.locator("main").getByRole("alert").filter({ hasText: copy.apiErrors.server })).toBeVisible();
    await expect(studies).toHaveValue("Biology, Chemistry");
    await page.unroute(`${api()}/profile`);
    await heldMutation(page, "/profile", "PATCH", save);
    await expect(save).toBeDisabled();
    mkdirSync("test-artifacts/ux-after", { recursive: true });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-artifacts/ux-after/student-profile-${width}.png`, fullPage: true });
    }
    await expect(page.locator('[data-shell="settings"]')).toBeVisible();
    const settings = page.getByRole("navigation", { name: copy.profile.settingsNavigation });
    await settings.getByRole("link", { name: copy.profile.account, exact: true }).click();
    await expect(page).toHaveURL(/\/profile\/account$/);
    await expect(settings.getByRole("link", { name: copy.profile.account, exact: true })).toHaveAttribute("aria-current", "page");
    await settings.getByRole("link", { name: copy.profile.profileSection, exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
  } finally {
    const fields = ["full_name", "phone", "country", "school", "city", "education_level", "what_brings_you", "fields_of_study", "countries_of_interest"];
    expect((await page.request.patch(`${api()}/profile`, { headers: auth, data: Object.fromEntries(fields.map(key => [key, original[key]])) })).status()).toBe(200);
  }
});

test("account validation stays inline and membership failure does not block security forms", async ({ page }) => {
  await signIn(page);
  await page.route(`${api()}/membership`, route => route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"Unavailable"}' }));
  await page.goto("/profile/account");
  const email = page.getByRole("form", { name: copy.profile.emailAddress });
  const password = page.getByRole("form", { name: copy.profile.changePassword });
  await expect(email).toBeVisible(); await expect(password).toBeVisible();
  await email.getByRole("textbox", { name: copy.profile.newEmail, exact: true }).fill("invalid");
  await email.getByRole("button", { name: copy.profile.updateEmail, exact: true }).click();
  await expect(email.getByRole("alert").filter({ hasText: copy.profile.emailInvalid })).toBeVisible();
  await expect(email.getByLabel(/^Current password/)).toBeFocused();
  await password.getByLabel(/^New password/).fill("short");
  await password.getByLabel(/^Confirm new password/).fill("different");
  await password.getByRole("button", { name: copy.profile.updatePassword, exact: true }).click();
  await expect(password.getByRole("alert").filter({ hasText: copy.profile.passwordMismatch })).toBeVisible();
  await expect(password.getByRole("alert").filter({ hasText: copy.common.passwordPolicy })).toBeVisible();
  await password.getByRole("button", { name: copy.auth.showPassword }).nth(1).click();
  await expect(password.getByLabel(/^New password/)).toHaveAttribute("type", "text");
  await expect(page.locator("main").getByRole("alert").filter({ hasText: copy.profile.membershipLoadError })).toBeVisible();
  await page.unroute(`${api()}/membership`);
  const retry = page.locator("main").getByRole("button", { name: copy.common.retry, exact: true });
  // Membership uses a genuinely independent query; a delayed refetch must keep Retry busy.
  await heldMutation(page, "/membership", "GET", retry);
  await expect(page.getByText(copy.profile.freeTier, { exact: true }).last()).toBeVisible();
});

test("email changes distinguish wrong passwords and duplicate addresses and synchronize the saved account", async ({ page }) => {
  await signIn(page);
  const auth = await headers(page);
  const replacement = `frontend-ux-settings-${Date.now()}@example.com`;
  let changed = false;
  try {
    await page.goto("/profile/account");
    const form = page.getByRole("form", { name: copy.profile.emailAddress });
    const current = form.getByLabel(/^Current password/);
    const address = form.getByRole("textbox", { name: copy.profile.newEmail, exact: true });
    const submit = form.getByRole("button", { name: copy.profile.updateEmail, exact: true });
    await current.fill("Wrong-current-password"); await address.fill(replacement);
    let response = page.waitForResponse(item => new URL(item.url()).pathname === "/profile/email" && item.request().method() === "POST");
    await submit.click(); expect((await response).status()).toBe(401);
    await expect(current).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByRole("alert").filter({ hasText: copy.profile.incorrectCurrentPassword }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/profile\/account$/);
    await current.fill(testPassword!); await address.fill(adminEmail);
    response = page.waitForResponse(item => new URL(item.url()).pathname === "/profile/email" && item.request().method() === "POST");
    await submit.click(); expect((await response).status()).toBe(409);
    await expect(address).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByRole("alert").filter({ hasText: copy.profile.emailInUse }).first()).toBeVisible();
    await address.fill(replacement);
    await heldMutation(page, "/profile/email", "POST", submit); changed = true;
    await expect(page.locator("main").getByText(replacement, { exact: false })).toBeVisible();
    await expect(submit).toBeDisabled();
    expect(await page.evaluate(value => JSON.parse(sessionStorage.getItem("gsp_current_user")!).email === value, replacement)).toBe(true);
    mkdirSync("test-artifacts/ux-after", { recursive: true });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-artifacts/ux-after/student-profile-account-${width}.png`, fullPage: true });
    }
  } finally {
    if (changed) expect((await page.request.post(`${api()}/profile/email`, { headers: auth, data: { current_password: testPassword, new_email: studentEmail } })).status()).toBe(200);
  }
});
