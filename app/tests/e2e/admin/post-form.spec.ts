import { test, expect } from "@playwright/test";
import { deletePostThroughUi, loginThroughUi, screenshotDirectory } from "@/tests/e2e/helpers/index";

test("post form validates, previews, saves, and protects unsaved changes", async ({ page }) => {
  test.setTimeout(90_000);
  await loginThroughUi(page);
  const title = `h1-form-${Date.now()}`;
  const directory = await screenshotDirectory();

  try {
    await page.goto("/admin/homepage-posts/new");
    await expect(page).toHaveURL(/\/admin\/homepage-posts\/new$/);
    await expect(page.getByRole("heading", { name: "New Post" })).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter a title." })).toBeVisible();
    await page.screenshot({ path: `${directory}/h1-post-form-validation-error.png` });
    await page.getByLabel("Title").fill(title);
    await expect(page.getByText(`${title.length}/255`)).toBeVisible();
    await page.locator(".tiptap[contenteditable='true']").fill("Form body for a temporary A1 post.");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Back to Homepage Content" }).click();
    await expect(page).toHaveURL(/\/admin\/homepage-posts\/new$/);
    await page.screenshot({ path: `${directory}/h1-post-form-desktop.png` });
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/homepage-posts$/);
  } finally {
    await deletePostThroughUi(page, title);
  }
});