import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { studentEmail, testPassword } from "@/tests/e2e/helpers/index";

test("RRP local fonts load without Google requests and keep layout stable", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) external.push(request.url());
  });
  await page.addInitScript(() => {
    const state = window as Window & { __rrpCls?: number };
    state.__rrpCls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) state.__rrpCls! += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  const measurements: object[] = [];
  for (const route of ["/", "/dashboard"]) {
    if (route === "/dashboard") {
      await page.goto("/login");
      await page.getByLabel("Email address").fill(studentEmail);
      await page.locator('input[name="password"]').fill(testPassword!);
      await page.getByRole("button", { name: "Log In", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    }
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const measurement = await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
      const families = Array.from(document.fonts).filter((font) => font.status === "loaded" && !/fallback/i.test(font.family)).map((font) => font.family);
      return { families, heading: getComputedStyle(document.documentElement).getPropertyValue("--font-heading"),
        faces: Array.from(document.fonts).map((font) => ({ family: font.family, status: font.status })),
        h1: getComputedStyle(document.querySelector("h1")!).fontFamily,
        body: getComputedStyle(document.body).fontFamily, cls: (window as Window & { __rrpCls?: number }).__rrpCls ?? 0 };
    });
    writeFileSync("test-artifacts/rrp-font-diagnostic.json", JSON.stringify({ route, ...measurement }, null, 2));
    expect(measurement.families.some((family) => /fraunces/i.test(family))).toBe(true);
    expect(measurement.families.some((family) => /source.?sans/i.test(family))).toBe(true);
    expect(measurement.cls).toBeLessThan(0.1);
    measurements.push({ route, ...measurement });
  }
  expect(external).toEqual([]);
  writeFileSync("test-artifacts/rrp-font-browser.json", JSON.stringify({ measurements, external }, null, 2));
  console.log("RRP_FONT_BROWSER", JSON.stringify({ measurements, external }));
});
