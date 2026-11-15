import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { copy } from "@/lib/copy/dictionary";
import { adminEmail, studentEmail, testPassword } from "@/tests/e2e/helpers/index";

for (const role of ["student", "admin"] as const) {
  for (const width of [390, 1440]) {
    test(`${role} logout requires confirmation and supports cancellation at ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/login");
      await page.getByLabel(copy.auth.email).fill(role === "admin" ? adminEmail : studentEmail);
      await page.locator('input[name="password"]').fill(testPassword!);
      await page.getByRole("button", { name: copy.common.login, exact: true }).click();
      const destination = role === "admin" ? "/admin" : "/dashboard";
      await expect(page).toHaveURL(destination);
      if (width < 1024) await page.getByRole("button", { name: copy.nav.openNavigation, exact: true }).click();
      const trigger = page.locator('[data-testid="profile-block"]:visible').getByRole("button", { name: copy.common.logout, exact: true });
      const session = await page.evaluate(() => ["gsp_access_token", "gsp_refresh_token", "gsp_current_user"].map(key => sessionStorage.getItem(key)));
      expect(session.every(Boolean)).toBe(true);
      const dialog = page.getByRole("alertdialog", { name: copy.common.logoutConfirmTitle });
      const cancel = dialog.getByRole("button", { name: copy.common.logoutCancel, exact: true });
      const confirm = dialog.getByRole("button", { name: copy.common.logout, exact: true });
      await trigger.click();
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(copy.common.logoutConfirmDescription);
      await expect(cancel).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(confirm).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(cancel).toBeFocused();
      await cancel.click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(page).toHaveURL(destination);
      // Compare privately so a failing matcher never prints credentials.
      expect(await page.evaluate(expected => JSON.stringify(["gsp_access_token", "gsp_refresh_token", "gsp_current_user"].map(key => sessionStorage.getItem(key))) === JSON.stringify(expected), session)).toBe(true);
      await trigger.click();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(page).toHaveURL(destination);
      if (width < 1024) await expect(page.getByRole("dialog", { name: copy.nav.closeNavigation })).toBeVisible();
      await trigger.click();
      mkdirSync("test-artifacts/logout-confirmation", { recursive: true });
      await page.screenshot({ path: `test-artifacts/logout-confirmation/${role}-${width}.png` });
      await confirm.click();
      await expect(page).toHaveURL("/");
      expect(await page.evaluate(() => ["gsp_access_token", "gsp_refresh_token", "gsp_current_user"].every(key => sessionStorage.getItem(key) === null))).toBe(true);
      await expect(page.getByText(copy.common.logoutSuccess, { exact: true })).toBeVisible();
      await page.goto(destination);
      await expect(page).toHaveURL(/\/login(?:\?|$)/);
      expect(errors).toEqual([]);
    });
  }
}
