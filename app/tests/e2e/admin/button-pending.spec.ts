import { expect, test } from "@playwright/test";
import { deletePostThroughUi, loginThroughUi } from "@/tests/e2e/helpers/index";

test("post save reports pending state during a delayed request and creates one row", async ({ page }) => {
  test.setTimeout(60_000);
  await loginThroughUi(page);
  const title = `h1-button-${Date.now()}`;
  let postRequests = 0;
  let releaseSave!: () => void;
  let saveStarted!: () => void;
  const gate = new Promise<void>((resolve) => { releaseSave = resolve; });
  const started = new Promise<void>((resolve) => { saveStarted = resolve; });
  await page.route("**/admin/homepage-posts", async (route) => {
    if (route.request().method() === "POST") {
      postRequests += 1;
      saveStarted();
      await gate;
    }
    await route.continue();
  });

  try {
    await page.goto("/admin/homepage-posts/new");
    await page.getByLabel("Title").fill(title);
    await page.locator(".tiptap[contenteditable='true']").fill("A temporary H1 pending-state post.");
    const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/admin/homepage-posts");
    await page.getByRole("button", { name: "Save", exact: true }).first().dblclick({ delay: 50 });
    await started;
    const pendingButton = page.locator('button[aria-busy="true"]').first();
    await expect(pendingButton).toBeVisible({ timeout: 100 });
    await expect(pendingButton).toBeDisabled();
    expect(await pendingButton.getAttribute("aria-busy")).toBe("true");
    releaseSave();
    expect((await responsePromise).status()).toBe(201);
    expect(postRequests).toBe(1);
    await expect(page).toHaveURL(/\/admin\/homepage-posts$/);
    const savedRow = page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) });
    await expect(savedRow).toBeVisible();
    expect(await savedRow.getByRole("link").getAttribute("href")).toMatch(/\/admin\/homepage-posts\/.+\/edit$/);
  } finally {
    releaseSave();
    await deletePostThroughUi(page, title);
    await page.unroute("**/admin/homepage-posts");
  }
});
