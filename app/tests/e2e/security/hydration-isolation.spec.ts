import { test, expect } from "@playwright/test";
import { copy } from "@/lib/copy/dictionary";

for (const descendant of [false, true]) {
  test(descendant ? "root exception does not hide a descendant hydration mismatch" : "verified focus-visible root mutation has a narrowly scoped exception", async ({ page }) => {
    const findings: string[] = [];
    const capture = (message: string) => { if (/hydration|hydrated|did not match|Minified React error #418/i.test(message)) findings.push(message); };
    page.on("console", message => { if (message.type() === "error") capture(message.text()); });
    page.on("pageerror", error => capture(error.message));
    await page.addInitScript((includeDescendant) => {
      let injected = false;
      const apply = () => {
        document.documentElement?.classList.add("js-focus-visible");
        document.documentElement?.setAttribute("data-js-focus-visible", "");
        // Attribute-only warnings are development-only in React. A real text
        // mismatch proves production error 418 still reaches the strict guard.
        const heading = document.querySelector("h1");
        if (includeDescendant && !injected && heading) {
          injected = true;
          heading.textContent = "External descendant hydration probe";
        }
      };
      new MutationObserver(apply).observe(document, { childList: true, subtree: true });
      apply();
    }, descendant);
    await page.goto("/login");
    await page.getByRole("button", { name: copy.auth.showPassword, exact: true }).click();
    await expect(page.locator("#password")).toHaveAttribute("type", "text");
    await expect(page.locator("html")).toHaveAttribute("data-js-focus-visible", "");
    if (descendant) {
      await expect.poll(() => findings.length).toBeGreaterThan(0);
    } else {
      expect(findings).toEqual([]);
    }
  });
}
