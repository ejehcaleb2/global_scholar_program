import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { loginThroughUi, studentEmail, testPassword } from "@/tests/e2e/helpers/index";

const api = process.env.GSP_E2E_API_URL ?? "http://127.0.0.1:8101";

for (const language of ["en"] as const) {
  test(`CFP login limits show a countdown and preserve seeded login (${language})`, async ({ page }) => {
    const hydration: string[] = [];
    page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/i.test(message.text())) hydration.push(message.text()); });
    await page.goto("/login");
    await expect(page.locator('a[href*="/forgot-password"]')).toHaveCount(0);
    await page.locator('input[name="email"]').fill(`cfp-security-${randomUUID()}@example.com`);
    await page.locator('input[name="password"]').fill(testPassword!);
    const submit = page.getByRole("button", { name: "Log In", exact: true });
    for (let i = 0; i < 6; i++) {
      const response = page.waitForResponse((response) => response.url().endsWith("/auth/login") && response.request().method() === "POST");
      await submit.click();
      expect((await response).status()).toBe(i === 5 ? 429 : 401);
    }
    const alert = page.locator("form").getByRole("alert").filter({ hasText: "Too many attempts" });
    await expect(alert).toBeVisible();
    await expect(submit).toBeDisabled();
    const first = await alert.innerText();
    await expect.poll(() => alert.innerText()).not.toBe(first);
    await page.screenshot({ path: `test-artifacts/cfp-login-limit-${language}.png` });
    await loginThroughUi(page);
    expect(hydration).toEqual([]);
  });
}

test("CFP password change replaces both tokens and keeps the current device signed in", async ({ page, request }) => {
  let changed = false;
  const replacement = `${testPassword}x`;
  try {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(studentEmail);
    await page.locator('input[name="password"]').fill(testPassword!);
    await page.getByRole("button", { name: "Log In", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const oldPair = await page.evaluate(() => ({ access: sessionStorage.getItem("gsp_access_token"), refresh: sessionStorage.getItem("gsp_refresh_token") }));
    await page.goto("/profile/account");
    const form = page.locator("form").filter({ has: page.locator('input[autocomplete="new-password"]') });
    await form.locator('input[autocomplete="current-password"]').fill(testPassword!);
    await form.locator('input[autocomplete="new-password"]').nth(0).fill(replacement);
    await form.locator('input[autocomplete="new-password"]').nth(1).fill(replacement);
    const response = page.waitForResponse((response) => response.url().endsWith("/profile/password") && response.request().method() === "POST");
    await form.getByRole("button", { name: "Update password", exact: true }).click();
    expect((await response).status()).toBe(200);
    changed = true;
    await expect.poll(() => page.evaluate((previous) => sessionStorage.getItem("gsp_access_token") !== previous, oldPair.access)).toBe(true);
    const freshPair = await page.evaluate(() => ({ access: sessionStorage.getItem("gsp_access_token"), refresh: sessionStorage.getItem("gsp_refresh_token") }));
    expect(freshPair.refresh !== oldPair.refresh).toBe(true);
    const oldAccess = await request.get(`${api}/profile`, { headers: { Authorization: `Bearer ${oldPair.access}` } });
    const freshAccess = await request.get(`${api}/profile`, { headers: { Authorization: `Bearer ${freshPair.access}` } });
    expect(oldAccess.status()).toBe(401);
    expect(freshAccess.status()).toBe(200);
    await page.reload();
    await expect(page).toHaveURL(/\/profile\/account/);
    await expect(form.getByRole("button", { name: "Update password", exact: true })).toBeVisible();
  } finally {
    if (changed) {
      const login = await request.post(`${api}/auth/login`, { data: { email: studentEmail, password: replacement } });
      const session = await login.json();
      const restored = await request.post(`${api}/profile/password`, { headers: { Authorization: `Bearer ${session.tokens.access_token}` }, data: { current_password: replacement, new_password: testPassword } });
      expect(restored.status()).toBe(200);
    }
  }
});
