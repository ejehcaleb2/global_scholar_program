import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { copy } from "@/lib/copy/dictionary";

test("auth image panel, password reveal geometry and accessible forms work at every target width", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const evidence: object[] = [];
  mkdirSync("test-artifacts/ux-after", { recursive: true });
  for (const route of ["/login", "/signup"]) {
    await page.goto(route);
    const input = page.locator('input[name="password"]');
    await expect(input).toBeEnabled();
    const toggle = page.getByRole("button", { name: copy.auth.showPassword, exact: true });
    await input.fill("frontend-ux-visibility-only");
    await toggle.click(); await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue("frontend-ux-visibility-only");
    await expect(page.getByRole("button", { name: copy.auth.hidePassword, exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: copy.auth.hidePassword, exact: true }).click();
    await expect(input).toHaveAttribute("type", "password");
    await input.fill("");
    for (const width of [390, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0,0));
      const panel = page.getByTestId("auth-image-panel");
      if (width >= 1024) {
        await expect(panel).toBeVisible();
        await expect.poll(() => panel.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
        await expect.poll(() => panel.locator("figure").evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
      } else await expect(panel).toBeHidden();
      const geometry = await input.evaluate(element => {
        const input = element.getBoundingClientRect();
        const button = element.parentElement!.querySelector("button")!.getBoundingClientRect();
        return { inputRight: input.right, buttonLeft: button.left, buttonWidth: button.width, buttonHeight: button.height, overflow: document.documentElement.scrollWidth > window.innerWidth, passwordSpellcheck: (element as HTMLInputElement).spellcheck };
      });
      expect(geometry.inputRight).toBeLessThanOrEqual(geometry.buttonLeft);
      expect(geometry.buttonWidth).toBeGreaterThanOrEqual(40);
      expect(geometry.buttonHeight).toBeGreaterThanOrEqual(40);
      expect(geometry.overflow).toBe(false);
      expect(geometry.passwordSpellcheck).toBe(false);
      if ([390,768,1440,1920].includes(width)) await page.screenshot({ path: `test-artifacts/ux-after/${route.slice(1)}-${width}.png` });
      evidence.push({ route, width, geometry, imageVisible: width >= 1024 });
    }
    if (route === "/signup") {
      await page.evaluate(() => window.scrollTo(0, 400));
      expect((await page.getByTestId("auth-image-panel").boundingBox())!.y).toBeGreaterThanOrEqual(0);
      expect((await page.getByTestId("auth-image-panel").boundingBox())!.y).toBeLessThanOrEqual(40);
    }
    const accessibility = await new AxeBuilder({ page }).analyze();
    const serious = accessibility.violations.filter(item => item.impact === "serious" || item.impact === "critical");
    evidence.push({ route, serious: serious.map(item => ({ id:item.id, nodes:item.nodes.map(node => node.target) })), violations: accessibility.violations.map(item => ({ id:item.id, impact:item.impact })) });
    expect(serious).toEqual([]);
  }
  expect(errors).toEqual([]);
  writeFileSync("test-artifacts/ux-auth-presentation.json", JSON.stringify({ evidence, errors }, null, 2));
});
