import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { copy } from "@/lib/copy/dictionary";
import { loginThroughUi } from "@/tests/e2e/helpers/index";
import { api, headers, heldMutation } from "@/tests/e2e/helpers/admin-actions";

test.use({ actionTimeout: 10_000 });

test("admin publishes a linked article and guests open its real homepage card", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const title = `homepage-reading-${randomUUID()}`;
  const summary = "An introduction shown on the homepage card.";
  const body = "Open the admissions guide for the complete instructions.";
  const destination = "https://example.org/admissions-guide";
  await loginThroughUi(page);
  const auth = await headers(page);
  const list = await page.request.get(`${api()}/admin/homepage-posts`, { headers: auth });
  expect(list.status()).toBe(200);
  const initialPins = (await list.json() as Array<{ id: string; pinned: boolean; pin_order: number }>).filter(post => post.pinned);
  let id: string | undefined;
  const guestContext = await browser.newContext({ baseURL: process.env.GSP_E2E_BASE_URL });
  const guest = await guestContext.newPage();
  const errors: string[] = [];
  guest.on("pageerror", error => errors.push(error.message));
  try {
    for (const post of initialPins) expect((await page.request.patch(`${api()}/admin/homepage-posts/${post.id}`, { headers: auth, data: { pinned: false } })).status()).toBe(200);
    await page.goto("/admin/homepage-posts/new");
    await expect(page.getByText(copy.posts.purpose, { exact: true })).toBeVisible();
    await page.getByLabel(copy.admin.title).fill(title);
    await page.getByLabel(copy.admin.summary, { exact: true }).fill(summary);
    const editor = page.locator('.tiptap[contenteditable="true"]');
    await editor.fill(body);
    for (const name of [copy.admin.toolbarBold, copy.admin.toolbarItalic, copy.admin.toolbarHeading2, copy.admin.toolbarHeading3, copy.admin.toolbarBullets, copy.admin.toolbarNumbered, copy.admin.toolbarQuote]) {
      await editor.focus(); await page.keyboard.press("ControlOrMeta+Home"); await page.keyboard.press("Shift+End");
      const control = page.getByRole("button", { name, exact: true });
      await control.click(); await expect(control).toHaveAttribute("aria-pressed", "true");
      if (name === copy.admin.toolbarHeading2) expect(await editor.locator("h2").evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThan(20);
      if (name === copy.admin.toolbarBullets) expect(await editor.locator("ul").evaluate(node => getComputedStyle(node).listStyleType)).toBe("disc");
      if (name === copy.admin.toolbarQuote) expect(await editor.locator("blockquote").evaluate(node => getComputedStyle(node).fontStyle)).toBe("italic");
      await control.click(); await expect(control).toHaveAttribute("aria-pressed", "false");
    }
    await editor.fill(body);
    await page.getByRole("button", { name: copy.admin.toolbarLink, exact: true }).click();
    await expect(page.getByText(copy.posts.linkSelectionTitle, { exact: true })).toBeVisible();
    await editor.focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.getByRole("button", { name: copy.admin.toolbarLink, exact: true }).click();
    const linkDialog = page.getByRole("dialog", { name: copy.admin.toolbarLink, exact: true });
    await linkDialog.getByLabel(copy.admin.linkUrl, { exact: true }).fill("javascript:alert(1)");
    await expect(linkDialog.getByRole("button", { name: copy.admin.toolbarLink, exact: true })).toBeDisabled();
    await linkDialog.getByLabel(copy.admin.linkUrl, { exact: true }).fill(destination);
    await linkDialog.getByRole("button", { name: copy.admin.toolbarLink, exact: true }).click();
    await expect(editor.locator("a")).toHaveAttribute("href", destination);
    const uploaded = page.waitForResponse(response => new URL(response.url()).pathname === "/admin/media" && response.request().method() === "POST");
    await page.getByLabel(copy.admin.uploadImage, { exact: true }).setInputFiles(resolve("public/gsp-logo.png"));
    expect((await uploaded).ok()).toBe(true);
    await expect(page.locator("#post-image-url")).toHaveValue(/\/media\/public\//);
    await page.getByRole("button", { name: copy.posts.addText, exact: true }).click();
    const textSection = page.getByRole("region", { name: "Text section 1", exact: true });
    await textSection.locator('.tiptap[contenteditable="true"]').fill("The next part of this publication contains practical steps.");
    await expect(textSection.getByRole("button", { name: copy.posts.moveUp })).toBeDisabled();
    await page.getByRole("button", { name: copy.posts.addImage, exact: true }).click();
    const photoSection = page.getByRole("region", { name: "Photo section 2", exact: true });
    const photoUploaded = page.waitForResponse(response => new URL(response.url()).pathname === "/admin/media" && response.request().method() === "POST");
    const chooser = page.waitForEvent("filechooser");
    await photoSection.getByRole("button", { name: copy.admin.uploadImage, exact: true }).click();
    await (await chooser).setFiles(resolve("public/gsp-logo.png"));
    expect((await photoUploaded).ok()).toBe(true);
    await photoSection.getByLabel(copy.posts.photoAlt).fill("Global Scholars Program logo for the publication test");
    await photoSection.getByLabel(copy.posts.caption).fill("Photo caption for the complete publication.");
    await page.getByRole("button", { name: copy.posts.addVideo, exact: true }).click();
    let videoSection = page.getByRole("region", { name: "Video section 3", exact: true });
    await videoSection.getByLabel(copy.posts.videoUrl).fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");
    await videoSection.getByLabel(copy.posts.caption).fill("Publication video test");
    await videoSection.getByRole("button", { name: copy.posts.moveUp }).click();
    videoSection = page.getByRole("region", { name: "Video section 2", exact: true });
    await expect(videoSection).toBeVisible();
    await videoSection.getByRole("button", { name: copy.posts.moveDown }).click();
    await expect(page.getByRole("region", { name: "Photo section 2", exact: true })).toBeVisible();
    await page.getByRole("button", { name: copy.posts.addText, exact: true }).click();
    const removedSection = page.getByRole("region", { name: "Text section 4", exact: true });
    await removedSection.getByRole("button", { name: copy.posts.removeSection }).click();
    await page.getByRole("alertdialog", { name: copy.posts.removeSectionTitle }).getByRole("button", { name: copy.admin.cancel, exact: true }).click();
    await expect(removedSection).toBeVisible();
    await removedSection.getByRole("button", { name: copy.posts.removeSection }).click();
    await page.getByRole("alertdialog", { name: copy.posts.removeSectionTitle }).getByRole("button", { name: copy.posts.removeSection, exact: true }).click();
    await expect(removedSection).toHaveCount(0);
    await page.getByRole("button", { name: copy.admin.preview, exact: true }).click();
    const preview = page.getByRole("region", { name: copy.admin.preview, exact: true });
    await expect(preview.getByText("The next part of this publication contains practical steps.", { exact: true })).toBeVisible();
    await expect(preview.getByRole("img", { name: "Global Scholars Program logo for the publication test", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: copy.admin.hidePreview, exact: true }).click();
    for (const width of [390, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    }
    mkdirSync("test-artifacts/homepage-reading", { recursive: true });
    await page.screenshot({ path: "test-artifacts/homepage-reading/editor-1440.png" });

    const created = await heldMutation(page, "/admin/homepage-posts", "POST", page.getByRole("button", { name: copy.admin.save, exact: true }).first());
    const saved = await created.json() as { id: string; sections: Array<{ type: string }> };
    id = saved.id;
    expect(saved.sections.map(section => section.type)).toEqual(["text", "image", "video"]);
    await expect(page).toHaveURL(/\/admin\/homepage-posts$/);
    expect((await guest.request.get(`${api()}/homepage-posts/${id}`)).status()).toBe(404);
    await guest.goto(`/posts/${id}`);
    await expect(guest.getByRole("heading", { name: copy.posts.notFoundTitle, exact: true })).toBeVisible();
    let row = page.getByRole("row").filter({ hasText: title });
    await expect(row.getByRole("link", { name: copy.posts.viewPostLabel.replace("{title}", title), exact: true })).toHaveCount(0);
    await row.getByRole("link", { name: copy.admin.editPost.replace("{title}", title), exact: true }).click();
    await page.getByRole("group", { name: copy.admin.statusField }).getByRole("button", { name: copy.admin.publishedStatus, exact: true }).click();
    await page.getByRole("switch", { name: copy.admin.pinToHomepage, exact: true }).click();
    await heldMutation(page, `/admin/homepage-posts/${id}`, "PATCH", page.getByRole("button", { name: copy.admin.save, exact: true }).first());
    await expect(page).toHaveURL(/\/admin\/homepage-posts$/);
    row = page.getByRole("row").filter({ hasText: title });
    const popupEvent = page.waitForEvent("popup");
    await row.getByRole("link", { name: copy.posts.viewPostLabel.replace("{title}", title), exact: true }).click();
    const publicPreview = await popupEvent;
    await expect(publicPreview.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await publicPreview.close();
    await guest.goto("/");
    const card = guest.locator("#updates article").filter({ has: guest.getByRole("heading", { name: title, exact: true }) });
    const readMore = card.getByRole("link", { name: copy.posts.readMoreLabel.replace("{title}", title), exact: true });
    await expect(readMore).toHaveAttribute("href", `/posts/${id}`);
    await expect(readMore).toContainText(copy.landing.readMore);
    await expect(card.locator("img")).toBeVisible();
    await expect(card.locator("a")).toHaveCount(1);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let arrived!: () => void;
    const navigationArrived = new Promise<void>(resolve => { arrived = resolve; });
    const destinationPattern = `**/posts/${id}*`;
    let navigationFinished!: () => void;
    const navigationDone = new Promise<void>(resolve => { navigationFinished = resolve; });
    await guest.route(destinationPattern, async route => { arrived(); await gate; await route.continue(); navigationFinished(); });
    try {
      await readMore.focus(); await guest.keyboard.press("Enter"); await navigationArrived;
      await expect(readMore).toHaveAttribute("aria-busy", "true");
      await expect(readMore.getByText(copy.landing.readMore, { exact: true })).toBeHidden();
      await expect(readMore.locator("svg.motion-safe\\:animate-spin")).toBeVisible();
      await expect(card.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(card.locator("img")).toBeVisible();
      await expect(card).not.toHaveAttribute("aria-busy", "true");
    } finally { release(); }
    await navigationDone;
    await guest.unroute(destinationPattern);
    await expect(guest).toHaveURL(`/posts/${id}`);
    await expect(guest.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(guest.getByText("The next part of this publication contains practical steps.", { exact: true })).toBeVisible();
    await expect(guest.getByText("Photo caption for the complete publication.", { exact: true })).toBeVisible();
    await expect(guest.getByText("Publication video test", { exact: true }).last()).toBeVisible();
    await expect(guest.locator(".prose-gsp").getByRole("link", { name: body, exact: true })).toHaveAttribute("href", destination);
    for (const width of [390, 768, 1024, 1280, 1440]) {
      await guest.setViewportSize({ width, height: 1000 });
      expect(await guest.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await guest.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      mkdirSync("test-artifacts/homepage-reading", { recursive: true });
      await guest.screenshot({ path: `test-artifacts/homepage-reading/article-${width}.png` });
    }
    await guestContext.route(destination, route => route.fulfill({ contentType: "text/html", body: "<h1>External destination fixture</h1>" }));
    const contentLink = guest.locator(".prose-gsp").getByRole("link", { name: body, exact: true });
    // The editor's link policy may open external destinations in a new tab.
    const target = await contentLink.getAttribute("target");
    if (target === "_blank") {
      const externalEvent = guest.waitForEvent("popup");
      await contentLink.click();
      const external = await externalEvent;
      await expect(external).toHaveURL(destination);
      await external.close();
    } else {
      await contentLink.click();
      await expect(guest).toHaveURL(destination);
      await guest.goBack();
    }
    await guest.getByRole("link", { name: copy.posts.backToUpdates, exact: true }).click();
    await expect(guest).toHaveURL(/\/#updates$/);
    await expect(card).toBeVisible();
    await card.getByRole("link").click();
    await expect(guest).toHaveURL(`/posts/${id}`);
    await page.goto(`/admin/homepage-posts/${id}/edit`);
    await expect(page.getByRole("link", { name: copy.posts.viewPost, exact: true })).toHaveAttribute("href", `/posts/${id}`);
    await expect(page.getByText(copy.posts.savedPageHint, { exact: true })).toBeVisible();
    await page.getByRole("group", { name: copy.admin.statusField }).getByRole("button", { name: copy.admin.saveDraft, exact: true }).click();
    await heldMutation(page, `/admin/homepage-posts/${id}`, "PATCH", page.getByRole("button", { name: copy.admin.save, exact: true }).first());
    await expect(page).toHaveURL(/\/admin\/homepage-posts$/);
    await guest.reload();
    await expect(guest.getByRole("heading", { name: copy.posts.notFoundTitle, exact: true })).toBeVisible();
    expect((await guest.request.get(`${api()}/homepage-posts/${id}`)).status()).toBe(404);
    expect(errors).toEqual([]);
  } finally {
    await guestContext.close();
    let removed = 0;
    if (id) { expect((await page.request.delete(`${api()}/admin/homepage-posts/${id}`, { headers: auth })).status()).toBe(204); removed++; }
    for (const post of initialPins.sort((left, right) => left.pin_order - right.pin_order)) expect((await page.request.patch(`${api()}/admin/homepage-posts/${post.id}`, { headers: auth, data: { pinned: true, pin_order: post.pin_order } })).status()).toBe(200);
    console.log(`homepage-reading cleanup: posts removed=${removed}; seed pins restored=${initialPins.length}`);
  }
});

test("public article retries a temporary failure with visible loading and recovers", async ({ page, browser }) => {
  await loginThroughUi(page);
  const auth = await headers(page);
  const title = `homepage-reading-recovery-${randomUUID()}`;
  const response = await page.request.post(`${api()}/admin/homepage-posts`, { headers: auth, data: { title, body_html: "<p>Complete recovery test content.</p>", status: "published" } });
  expect(response.status()).toBe(201);
  const { id } = await response.json() as { id: string };
  const guestContext = await browser.newContext({ baseURL: process.env.GSP_E2E_BASE_URL });
  try {
    const guest = await guestContext.newPage();
    const path = `/homepage-posts/${id}`;
    await guest.route(`${api()}${path}`, route => route.fulfill({ status: 503, json: { detail: "Temporary test failure" } }));
    await guest.goto(`/posts/${id}`);
    await expect(guest.getByRole("heading", { name: copy.posts.loadErrorTitle, exact: true })).toBeVisible();
    await guest.unroute(`${api()}${path}`);
    await heldMutation(guest, path, "GET", guest.getByRole("button", { name: copy.common.retry, exact: true }));
    await expect(guest.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(guest.getByText(copy.posts.loadedTitle, { exact: true })).toBeVisible();
    await expect(guest.locator(".prose-gsp")).toContainText("Complete recovery test content.");
    await guest.goto(`/posts/${randomUUID()}`);
    await expect(guest.getByRole("heading", { name: copy.posts.notFoundTitle, exact: true })).toBeVisible();
    await expect(guest.getByRole("button", { name: copy.common.retry, exact: true })).toHaveCount(0);
  } finally {
    await guestContext.close();
    expect((await page.request.delete(`${api()}/admin/homepage-posts/${id}`, { headers: auth })).status()).toBe(204);
    console.log("homepage-reading recovery cleanup: posts removed=1");
  }
});


for (const type of ["text", "image", "video"] as const) {
  test(`publishes a ${type}-only article with precise inline validation and no opening text`, async ({ page }) => {
    test.setTimeout(60_000);
    await loginThroughUi(page);
    const auth = await headers(page);
    const title = `homepage-reading-${type}-${randomUUID()}`;
    let id: string | undefined;
    try {
      await page.goto("/admin/homepage-posts/new");
      await page.getByLabel(copy.admin.title).fill(title);
      await page.getByRole("button", { name: type === "text" ? copy.posts.addText : type === "image" ? copy.posts.addImage : copy.posts.addVideo, exact: true }).click();
      await page.getByRole("group", { name: copy.admin.statusField }).getByRole("button", { name: copy.admin.publishedStatus, exact: true }).click();
      const section = page.getByRole("region", { name: `${type === "text" ? copy.posts.textSection : type === "image" ? copy.posts.imageSection : copy.posts.videoSection} 1`, exact: true });
      const save = page.getByRole("button", { name: copy.admin.save, exact: true }).first();
      await save.click();
      await expect(section.getByText(type === "text" ? copy.posts.sectionTextRequired : type === "image" ? copy.posts.photoUrlRequired : copy.posts.videoUrlRequired, { exact: true })).toBeVisible();
      if (type === "text") {
        await section.locator('.tiptap[contenteditable="true"]').fill("The full article is written in a text section.");
      } else if (type === "image") {
        await section.getByLabel(copy.posts.photoUrl).fill(`${new URL(page.url()).origin}/media/landing/program-banner-640.webp`);
        await save.click();
        await expect(section.getByText(copy.posts.photoDescriptionRequired, { exact: true })).toBeVisible();
        await expect(section.getByLabel(copy.posts.photoAlt)).toBeFocused();
        await section.getByLabel(copy.posts.photoAlt).fill("Global Scholars Program banner");
      } else {
        await section.getByLabel(copy.posts.videoUrl).fill("https://example.org/not-a-supported-video");
        await save.click();
        await expect(section.getByText(copy.posts.videoUrlInvalid, { exact: true })).toBeVisible();
        await section.getByLabel(copy.posts.videoUrl).fill("https://youtu.be/jNQXAC9IVRw");
      }
      const created = await heldMutation(page, "/admin/homepage-posts", "POST", save);
      const post = await created.json() as { id: string; body_html: string; sections: Array<{ type: string }> };
      id = post.id;
      expect(post.body_html).toBe("");
      expect(post.sections.map(section => section.type)).toEqual([type]);
      await expect(page).toHaveURL("/admin/homepage-posts");
      expect((await page.request.get(`${api()}/homepage-posts/${id}`)).status()).toBe(200);
      await page.goto(`/posts/${id}`);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.getByText(copy.posts.sectionInvalid, { exact: true })).toHaveCount(0);
    } finally {
      if (id) expect((await page.request.delete(`${api()}/admin/homepage-posts/${id}`, { headers: auth })).status()).toBe(204);
      console.log(`homepage-reading ${type}-only cleanup: posts removed=${id ? 1 : 0}`);
    }
  });
}
