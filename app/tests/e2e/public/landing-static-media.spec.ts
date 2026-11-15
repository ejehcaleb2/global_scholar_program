import { expect, test } from "@playwright/test";

test("static landing carousel and challenge photo load from optimized media without a delayed route error", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  const carousel = page.getByRole("region", { name: "Global Scholars Program photos" });
  const firstImage = carousel.getByRole("img", { name: "Two students standing in front of a Global Scholars Program banner." });
  await expect(firstImage).toBeVisible();
  await expect.poll(() => firstImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)).toBe(true);

  await carousel.getByRole("button", { name: "Next photo" }).click();
  await expect(carousel.getByRole("img", { name: "Students gathered in a classroom during a learning session." })).toBeVisible();

  const challengeImage = page.getByRole("img", { name: "Students gathered at a Global Scholars Program event." });
  await challengeImage.scrollIntoViewIfNeeded();
  await expect.poll(() => challengeImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)).toBe(true);
  await page.waitForTimeout(13_000);
  await expect(page.getByRole("heading", { name: "Global opportunities should not depend on who you know." })).toBeVisible();
  await expect(page.getByText("An unexpected error interrupted this page. Try again.")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
