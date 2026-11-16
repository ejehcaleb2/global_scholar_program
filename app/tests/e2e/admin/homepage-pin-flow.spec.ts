import { test, expect } from "@playwright/test";
import { deletePostThroughUi, loginThroughUi, screenshotDirectory } from "@/tests/e2e/helpers/index";

test("homepage renders a published post thumbnail at its natural dimensions", async ({ page }) => {
  const title = `h1-e2e-thumbnail-${Date.now()}`;
  try {
    await loginThroughUi(page);
    await page.goto("/admin/homepage-posts/new");
    await page.getByLabel("Title").fill(title);
    await page.locator(".tiptap[contenteditable='true']").fill("Temporary thumbnail rendering regression test.");
    await page.getByLabel("Thumbnail").fill(`${new URL(page.url()).origin}/media/landing/program-banner-640.webp`);
    await page.getByRole("group", { name: "Publication status" }).getByRole("button", { name: "Published", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/homepage-posts$/);

    await page.goto("/");
    const post = page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(post).toBeVisible();
    const image = post.locator("img");
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0 && element.naturalHeight > 0)).toBe(true);
  } finally {
    await page.goto("/");
    await deletePostThroughUi(page, title);
  }
});

test("create, publish, pin, reorder, unpin, unpublish, and delete homepage post", async ({ page }) => {
  test.setTimeout(90_000);
  let accessToken = "";
  await loginThroughUi(page);
  accessToken = await page.evaluate(() => sessionStorage.getItem("gsp_access_token") ?? "");
  const title = `h1-e2e-${Date.now()}`;
  const peerTitle = `${title}-peer`;
  let initialPins: Array<{ id: string; title: string; pin_order: number }> = [];
  let detailUrl = "";

  async function setPin(title: string, checked: boolean) {
    const targetRow = page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) });
    const toggle = targetRow.getByRole("switch");
    const current = (await toggle.getAttribute("aria-checked")) === "true";
    if (current !== checked) {
      const editHref = await targetRow.locator('a[href$="/edit"]').getAttribute("href");
      const postId = editHref?.match(/homepage-posts\/([^/]+)\/edit/)?.[1];
      if (!postId) throw new Error(`Could not identify homepage post ${title}`);
      const updateResponse = page.waitForResponse((response) => {
        const request = response.request();
        return request.method() === "PATCH" && new URL(response.url()).pathname === `/admin/homepage-posts/${postId}`;
      });
      await toggle.click();
      expect((await updateResponse).status()).toBe(200);
    }
    await expect(toggle).toHaveAttribute("aria-checked", String(checked));
    await expect(toggle).not.toHaveAttribute("aria-busy", "true");
  }

  async function createPublishedPost(title: string, pin: boolean) {
    await page.goto("/admin/homepage-posts/new");
    await page.getByLabel("Title").fill(title);
    await page.locator(".tiptap[contenteditable='true']").fill("A temporary H1 post body.");
    const group = page.getByRole("group", { name: "Publication status" });
    const published = group.getByRole("button", { name: "Published", exact: true });
    await published.click();
    await expect(published).toHaveAttribute("aria-pressed", "true");
    if (pin) {
      const toggle = page.getByRole("switch", { name: "Pin to homepage" });
      await expect(toggle).toBeEnabled();
      await toggle.click();
    }
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/homepage-posts$/);
  }

  try {
    await page.goto("/admin/homepage-posts");
    initialPins = await page.evaluate(async () => {
      const token = sessionStorage.getItem("gsp_access_token");
      const response = await fetch("http://127.0.0.1:8101/admin/homepage-posts", { headers: { Authorization: `Bearer ${token}` } });
      const posts = await response.json();
      return posts.filter((post: { title: string; pinned: boolean }) => post.pinned).map((post: { id: string; title: string; pin_order: number }) => ({ id: post.id, title: post.title, pin_order: post.pin_order }));
    });
    for (const item of initialPins) await setPin(item.title, false);
    await expect.poll(async () => page.evaluate(async () => {
      const token = sessionStorage.getItem("gsp_access_token");
      const response = await fetch("http://127.0.0.1:8101/admin/homepage-posts", { headers: { Authorization: `Bearer ${token}` } });
      const posts = await response.json();
      return posts.filter((post: { pinned: boolean }) => post.pinned).length;
    })).toBe(0);

    await page.goto("/admin/homepage-posts/new");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Summary").fill("A temporary H1 browser-flow summary.");
    await page.locator(".tiptap[contenteditable='true']").fill("A temporary H1 post body.");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/homepage-posts$/);

    let row = page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) });
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: new RegExp(`Edit ${title}`) }).click();
    const publicationGroup = page.getByRole("group", { name: "Publication status" });
    const publishButton = publicationGroup.getByRole("button", { name: "Published", exact: true });
    await publishButton.click();
    await expect(publishButton).toHaveAttribute("aria-pressed", "true");
    const pinSwitch = page.getByRole("switch", { name: "Pin to homepage" });
    await expect(pinSwitch).toBeEnabled();
    await pinSwitch.click();
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/homepage-posts$/);

    row = page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) });
    await expect(row.getByText("Published")).toBeVisible();
    await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    const postId = await row.getByRole("link", { name: new RegExp(`Edit ${title}`) }).getAttribute("href");
    detailUrl = postId ? `/posts/${postId.match(/homepage-posts\/([^/]+)\/edit/)?.[1]}` : "";
    await page.goto("/");
    await expect(page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) })).toBeVisible();
    await page.locator("#updates article").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).getByRole("link").click();
    await expect(page).toHaveURL(detailUrl);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await createPublishedPost(peerTitle, true);
    await page.goto("/admin/homepage-posts");
    const peerRow = page.getByRole("row").filter({ has: page.getByText(peerTitle, { exact: true }) });
    await peerRow.getByRole("button", { name: new RegExp(`Move ${peerTitle} up`) }).click();
    await expect(page.getByText("Pin order updated").first()).toBeVisible();
    row = page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) });
    await setPin(title, false);
    await test.step("Unpinned published posts fill public homepage slots", async () => {
      await page.goto("/");
      await expect(page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) })).toBeVisible();
    }, { timeout: 15_000 });

    await test.step("Unpublish post and verify public detail is hidden", async () => {
      await page.goto("/admin/homepage-posts");
      row = page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) });
      await row.getByRole("link", { name: new RegExp(`Edit ${title}`) }).click();
      await page.getByRole("group", { name: "Publication status" }).getByRole("button", { name: "Draft", exact: true }).click();
      await page.getByRole("button", { name: "Save", exact: true }).first().click();
      await expect(page).toHaveURL(/\/admin\/homepage-posts$/);
      row = page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) });
      await expect(row.getByText("Draft", { exact: true })).toBeVisible();
      await page.goto(detailUrl);
      await expect(page.getByRole("heading", { name: "Post not found" })).toBeVisible();
    }, { timeout: 20_000 });
    await page.goto("/admin/homepage-posts");
    row = page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) });
    await row.getByRole("link", { name: new RegExp(`Edit ${title}`) }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete post", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/homepage-posts$/);
    await expect(page.getByRole("row").filter({ has: page.getByText(title, { exact: true }) })).toHaveCount(0);
    if (detailUrl) {
      await page.goto(detailUrl);
      await expect(page.getByRole("heading", { name: "Post not found" })).toBeVisible();
    }

    const directory = await screenshotDirectory();
    await page.goto("/admin/homepage-posts");
    await page.screenshot({ path: `${directory}/h1-homepage-content-desktop.png`, fullPage: true });
  } finally {
    if (accessToken) {
      const request = page.context().request;
      const headers = { Authorization: `Bearer ${accessToken}` };
      const postsResponse = await request.get("http://127.0.0.1:8101/admin/homepage-posts", { headers });
      const posts = await postsResponse.json() as Array<{ id: string; title: string }>;
      for (const post of posts.filter((item) => item.title === title || item.title === peerTitle)) {
        await request.delete(`http://127.0.0.1:8101/admin/homepage-posts/${post.id}`, { headers });
      }
      for (const item of initialPins.sort((left, right) => left.pin_order - right.pin_order)) {
        await request.patch(`http://127.0.0.1:8101/admin/homepage-posts/${item.id}`, {
          headers,
          data: { pinned: true, pin_order: item.pin_order },
        });
      }
    }
  }
});