import { expect, test } from "@playwright/test";

for (const locale of ["en"] as const) {
  test(`CFP guest previews require signup (${locale})`, async ({ page }) => {
    for (const route of ["resources", "opportunities", "masterclasses"]) {
      const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/${route}`) && response.url().includes(":8101"));
      await page.goto(`/${route}`);
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      const items = await response.json() as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.locked).toBe(true);
        for (const key of ["url", "external_link", "session_link", "recording_url", "body_html"]) expect(item[key] ?? null).toBeNull();
      }
      await expect(page.locator('article a[href="/signup"]').first()).toBeVisible();
      await expect(page.locator('article a[href^="http"]')).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      console.log(`GUEST_PREVIEW ${locale}/${route}: status=200 rows=${items.length} locked=true private-links=0 signup-prompt=visible`);
    }
  });
}
