import { expect, test } from "@playwright/test";
import { loginThroughUi } from "@/tests/e2e/helpers/index";

// New controls must be assigned to a real interaction test, rather than silently
// disappearing from a hand-picked happy-path smoke test.
const contracts = [
  { name: /^(All|Draft|Published|Free|Paid|Submitted|In progress|Returned|Table|Cards|Needs attention)$/, suite: "filter and view activation below" },
  { name: /^Review request$/, suite: "request panel downloads, status/history and nested student recovery in form-controls" },
  { name: /^Refresh$/, suite: "refresh HTTP/result below and admin-repairs" },
  { name: /^Course actions:/, suite: "menu discovery below; course-manager-routes and admin-repairs" },
  { name: /^(Add resource|Add opportunity|Schedule masterclass)$/, suite: "form opening/cancel below; admin-repairs and backend CRUD" },
  { name: /^(Edit|Delete)$/, suite: "row editor/confirmation below; admin-repairs" },
  { name: /^Student details$/, suite: "drawer below and keyboard regression in admin-repairs" },
  { name: /^(Previous page|Next page)$/, suite: "server pagination in admin-repairs" },
  { name: /^(Pin |Unpin |Move ).+/, suite: "homepage-pin-flow: real pin/unpin/reorder with restoration" },
];

test("all nine admin tabs expose registered controls with working local interactions", async ({ page }) => {
  test.setTimeout(180_000);
  await loginThroughUi(page);
  const routes = ["", "homepage-posts", "courses", "resources", "opportunities", "masterclasses", "students", "activity", "settings"];
  const coverage: Array<{ route: string; label: string; suite: string; disabled: boolean }> = [];
  const widths: Array<{ route: string; viewport: number; document: number }> = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  for (const tab of routes) {
    const route = `/admin${tab ? `/${tab}` : ""}`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route);
    const main = page.locator('[data-shell="admin"] > main');
    await expect(main.locator("h1")).toBeVisible();
    await expect(main.locator(".animate-pulse:visible")).toHaveCount(0);
    const buttons = await main.locator("button:visible").evaluateAll((nodes) => nodes.map((node) => ({
      label: node.getAttribute("aria-label") || node.textContent?.trim() || "",
      disabled: (node as HTMLButtonElement).disabled,
      reason: node.getAttribute("title") || node.getAttribute("aria-describedby"),
      pressed: node.getAttribute("aria-pressed"),
    })));
    for (const button of buttons) {
      const contract = contracts.find((item) => item.name.test(button.label));
      expect(contract, `Unregistered admin control on ${route}: ${button.label}`).toBeTruthy();
      coverage.push({ route, label: button.label, suite: contract!.suite, disabled: button.disabled });
      if (button.disabled) expect(button.reason, `Explain disabled control: ${route} / ${button.label}`).toBeTruthy();
    }
    // Repeated row controls share the same component; exercise each operation
    // without deleting or editing the seeded fixture's stored content.
    for (const label of [...new Set(buttons.filter((item) => !item.disabled).map((item) => item.label))]) {
      await page.goto(route);
      await expect(main.locator(".animate-pulse:visible")).toHaveCount(0);
      const button = main.getByRole("button", { name: label, exact: true }).first();
      const descriptor = buttons.find((item) => item.label === label)!;
      if (descriptor.pressed !== null) {
        await button.click();
        await expect(main.getByRole("button", { name: label, exact: true }).first()).toHaveAttribute("aria-pressed", "true");
      } else if (label.startsWith("Course actions:")) {
        await button.click();
        await expect(page.getByRole("menu")).toBeVisible();
        await expect(page.getByRole("menuitem")).toHaveCount(4);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("menu")).toHaveCount(0);
      } else if (["Add resource", "Add opportunity", "Schedule masterclass", "Edit"].includes(label)) {
        await button.click();
        await expect(main.locator("form")).toBeVisible();
        await expect(main.getByRole("button", { name: "Save", exact: true })).toBeVisible();
        await main.getByRole("button", { name: "Cancel", exact: true }).last().click();
        await expect(main.locator("form")).toHaveCount(0);
      } else if (label === "Delete") {
        await button.click();
        await expect(page.getByRole("alertdialog")).toBeVisible();
        await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(page.getByRole("alertdialog")).toHaveCount(0);
        // Delete confirmation uses the record editor's selection. Close it too.
        await main.getByRole("button", { name: "Cancel", exact: true }).last().click();
      } else if (label === "Student details") {
        await button.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      } else if (label === "Refresh") {
        const response = page.waitForResponse((item) => item.request().method() === "GET" && new URL(item.url()).pathname === (tab === "activity" ? "/admin/audit-logs" : "/admin/stats"));
        await button.click();
        expect((await response).status()).toBe(200);
        await expect(page.locator("[data-toast]").filter({ hasText: "Data refreshed" }).first()).toBeVisible();
      }
    }
    for (const width of [390, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      widths.push({ route, viewport: width, document: await page.evaluate(() => document.documentElement.scrollWidth) });
    }
  }
  expect(consoleErrors).toEqual([]);
  await test.info().attach("admin-control-registry", { body: JSON.stringify(coverage, null, 2), contentType: "application/json" });
  await test.info().attach("admin-responsive-widths", { body: JSON.stringify(widths, null, 2), contentType: "application/json" });
});
