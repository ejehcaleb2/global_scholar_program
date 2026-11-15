import { expect, test } from "@playwright/test";
import { copy } from "@/lib/copy/dictionary";
import { api, headers, heldMutation } from "@/tests/e2e/helpers/admin-actions";
import { loginThroughUi } from "@/tests/e2e/helpers/index";
import { installVideoFixtures } from "@/tests/e2e/helpers/video";



test("course authoring preserves URL focus, optional duration, preview media and published deletion", async ({ page }) => {
  test.setTimeout(120_000);
  await installVideoFixtures(page);
  await loginThroughUi(page);
  const auth = await headers(page);
  const title = `admin-fixes-course-${Date.now()}`;
  let id: string | undefined;
  try {
    await page.goto("/admin/courses/new");
    await page.getByLabel("Course title").fill(title);
    await page.getByRole("radio", { name: /^Free/ }).click();
    const uploaded = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/admin/media");
    await page.locator("#new-course-cover").setInputFiles("public/media/landing/program-banner-640.webp");
    expect((await uploaded).status()).toBe(201);
    const created = await heldMutation(page, "/admin/courses", "POST", page.getByRole("button", { name: "Create course", exact: true }));
    id = (await created.json()).id;
    await expect(page).toHaveURL(new RegExp(`/admin/courses/${id}/curriculum$`));
    await page.getByPlaceholder("New module title").fill("admin-fixes-module");
    await page.getByRole("button", { name: "Add module", exact: true }).click();
    await page.getByPlaceholder("New lesson title").fill("admin-fixes-lesson");
    await page.getByRole("button", { name: "Add lesson", exact: true }).click();
    await page.getByRole("link", { name: "admin-fixes-lesson", exact: true }).click();
    await expect(page.getByLabel("Lesson title", { exact: false })).toHaveValue("admin-fixes-lesson");
    await expect(page.getByRole("navigation", { name: "Course editor tabs" }).getByRole("link", { name: "Curriculum" })).toHaveAttribute("aria-current", "page");
    await page.locator('.tiptap[contenteditable="true"]').fill("A saved lesson with optional duration and real links.");
    await page.locator("#lesson-video-url").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByRole("button", { name: "Add resource link", exact: true }).click();
    const url = page.locator("#resource-url-0");
    await page.locator("#resource-title-0").fill("Reading");
    await url.pressSequentially("https://example.com/reading");
    await expect(url).toHaveValue("https://example.com/reading");
    await expect(url).toBeFocused();
    await expect(page.locator("#lesson-duration")).toHaveValue("");
    const saved = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname.includes("/lessons/"));
    await page.getByRole("button", { name: "Save lesson", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText("Lesson saved", { exact: true }).first()).toBeVisible();
    await page.goto(`/admin/courses/${id}/curriculum`);
    const lessonMenu = page.getByRole("button", { name: "Course actions: admin-fixes-lesson", exact: true });
    await lessonMenu.click();
    const lessonHref = await page.getByRole("link", { name: "admin-fixes-lesson", exact: true }).getAttribute("href");
    const lessonId = lessonHref!.split("/").at(-1)!;
    await heldMutation(page, `/admin/lessons/${lessonId}/duplicate`, "POST", page.getByRole("menuitem", { name: "Duplicate lesson", exact: true }), lessonMenu);
    await expect(page.getByRole("link", { name: "admin-fixes-lesson (copy)", exact: true })).toBeVisible();
    await page.getByPlaceholder("New module title").fill("admin-fixes-destination");
    await page.getByRole("button", { name: "Add module", exact: true }).click();
    await expect(page.getByRole("heading", { name: "2. admin-fixes-destination", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Course actions: admin-fixes-lesson (copy)", exact: true }).click();
    await page.getByRole("menuitem", { name: "Move to module", exact: true }).click();
    const moved = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/structure/reorder"));
    await page.getByRole("dialog").getByRole("button", { name: "Move to module", exact: true }).click();
    expect((await moved).status()).toBe(200);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const destination = page.locator("section").filter({ has: page.getByRole("heading", { name: "2. admin-fixes-destination", exact: true }) }).last();
    await expect(destination.getByRole("link", { name: "admin-fixes-lesson (copy)", exact: true })).toBeVisible();
    await page.goto(`/admin/courses/${id}/preview`);
    await page.getByRole("button", { name: "Lesson", exact: true }).click();
    await expect(page.locator('iframe[src*="youtube-nocookie.com"]')).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Reading", exact: true })).toHaveAttribute("href", "https://example.com/reading");
    await page.goto(`/admin/courses/${id}/curriculum`);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const publishDialog = page.getByRole("dialog");
    await expect.poll(() => publishDialog.evaluate((node) => { const box = node.getBoundingClientRect(); return box.top >= 0 && box.bottom <= window.innerHeight; })).toBe(true);
    await publishDialog.getByRole("button", { name: "Publish course", exact: true }).click();
    await expect(publishDialog).toHaveCount(0);
    await page.getByRole("button", { name: "Course actions: admin-fixes-module", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete module", exact: true }).click();
    const deletion = page.getByRole("dialog");
    await deletion.getByRole("textbox").pressSequentially("admin-fixes-module");
    await expect(deletion.getByRole("textbox")).toBeFocused();
    await expect(deletion.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
    const removed = page.waitForResponse((response) => response.request().method() === "DELETE" && new URL(response.url()).pathname.includes("/modules/"));
    await deletion.getByRole("button", { name: "Delete", exact: true }).click();
    expect((await removed).status()).toBe(204);
    await expect(page.getByRole("heading", { name: /admin-fixes-module/ })).toHaveCount(0);
  } finally {
    if (id && !page.isClosed()) expect((await page.request.delete(`${api()}/admin/courses/${id}?confirm_progress_loss=true&confirm_title=${encodeURIComponent(title)}`, { headers: auth })).status()).toBe(204);
  }
});

test("published resource is visible after SPA return, with discard protection and visible delete recovery", async ({ page }) => {
  test.setTimeout(90_000);
  await loginThroughUi(page);
  const title = `admin-fixes-resource-${Date.now()}`;
  let id: string | undefined;
  try {
    await page.goto("/resources");
    await expect(page.locator('[data-testid="app-sidebar"]')).toBeVisible();
    await page.locator('[data-testid="app-sidebar"] a[href="/admin"]').click();
    await page.locator('[data-testid="admin-sidebar"] a[href="/admin/resources"]').click();
    await page.getByRole("button", { name: "Add resource", exact: true }).click();
    await page.locator("#resource-title").fill(title);
    await page.locator("#resource-category").fill("Review");
    await page.locator("#resource-url").fill("not-a-url");
    await expect(page.getByRole("alert").filter({ hasText: "Enter a valid http or https URL." })).toBeVisible();
    await page.locator("#resource-url").fill("https://example.com/reading");
    await page.locator("#resource-status").selectOption("published");
    const created = await heldMutation(page, "/admin/resources", "POST", page.getByRole("button", { name: "Save", exact: true }));
    id = (await created.json()).id;
    const row = page.getByRole("row").filter({ hasText: title });
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator("#resource-description").fill("Unsaved review draft");
    await page.getByRole("button", { name: "Cancel", exact: true }).last().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(page.locator("#resource-description")).toHaveValue("Unsaved review draft");
    await page.getByRole("button", { name: "Cancel", exact: true }).last().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Discard changes", exact: true }).click();
    await page.locator('[data-testid="admin-sidebar"] a[href="/dashboard"]').click();
    await page.locator('[data-testid="app-sidebar"] a[href="/resources"]').click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.locator('[data-testid="app-sidebar"] a[href="/admin"]').click();
    await page.locator('[data-testid="admin-sidebar"] a[href="/admin/resources"]').click();
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    const pattern = `${api()}/admin/resources/${id}`;
    await page.route(pattern, async (route) => route.request().method() === "DELETE" ? route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Simulated failure"}' }) : route.continue());
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator('[data-toast][role="alert"]')).toContainText("Could not delete this record");
    await expect(row).toBeVisible();
    await page.unroute(pattern);
    await heldMutation(page, `/admin/resources/${id}`, "DELETE", page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }));
    id = undefined;
    await expect(row).toHaveCount(0);
  } finally {
    if (id) await page.request.delete(`${api()}/admin/resources/${id}`, { headers: await headers(page) });
  }
});

test("stale resource editor offers an explicit conflict choice and keeps the newer title", async ({ page }) => {
  await loginThroughUi(page);
  const auth = await headers(page);
  const title = `admin-fixes-conflict-${Date.now()}`;
  const created = await page.request.post(`${api()}/admin/resources`, { headers: auth, data: { title, category: "Review", access_type: "free", status: "draft" } });
  expect(created.status()).toBe(201);
  const original = await created.json();
  try {
    await page.goto("/admin/resources");
    await page.getByRole("row").filter({ hasText: title }).getByRole("button", { name: "Edit", exact: true }).click();
    const newer = `${title}-newer`;
    expect((await page.request.patch(`${api()}/admin/resources/${original.id}`, { headers: auth, data: { title: newer, expected_updated_at: original.updated_at } })).status()).toBe(200);
    await page.locator("#resource-description").fill("Older editor draft");
    const rejected = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(original.id));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect((await rejected).status()).toBe(409);
    await expect(page.getByRole("heading", { name: "This record was changed by someone else." })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "This record was changed by someone else." })).toHaveCount(0);
    const stillRejected = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(original.id));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect((await stillRejected).status(), "Dismissing a conflict must not authorize overwriting newer data").toBe(409);
    await page.getByRole("button", { name: "Load latest version", exact: true }).click();
    await expect(page.locator("#resource-title")).toHaveValue(newer);
    const rows = await (await page.request.get(`${api()}/admin/resources`, { headers: auth })).json();
    expect(rows.find((item: { id: string }) => item.id === original.id).title).toBe(newer);
  } finally { expect((await page.request.delete(`${api()}/admin/resources/${original.id}`, { headers: auth })).status()).toBe(204); }
});

test("student and mobile navigation drawers contain focus; filters survive reload", async ({ page }) => {
  await loginThroughUi(page);
  await page.goto("/admin/students");
  await page.getByRole("button", { name: "Paid", exact: true }).click();
  await page.getByPlaceholder("Search by student name or email").fill("Paid");
  await page.reload();
  await expect(page.getByPlaceholder("Search by student name or email")).toHaveValue("Paid");
  await expect(page.getByRole("button", { name: "Paid", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Student details", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const navigation = page.getByRole("dialog");
  await expect.poll(() => navigation.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(navigation).toHaveCount(0);
});

test("dismissing a course-details conflict cannot overwrite a newer edit", async ({ page }) => {
  await loginThroughUi(page);
  const auth = await headers(page);
  const title = `admin-fixes-course-conflict-${Date.now()}`;
  const created = await page.request.post(`${api()}/admin/courses`, { headers: auth, data: { title, access_type: "free" } });
  expect(created.status()).toBe(201);
  const original = await created.json();
  try {
    await page.goto(`/admin/courses/${original.id}/details`);
    await expect(page.locator("#details-title")).toHaveValue(title);
    expect((await page.request.patch(`${api()}/admin/courses/${original.id}`, { headers: auth, data: { title: `${title}-newer`, expected_updated_at: original.updated_at } })).status()).toBe(200);
    await page.locator("#details-summary").fill("Draft from the older editor");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rejected = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(original.id));
      await page.getByRole("button", { name: "Save details", exact: true }).click();
      expect((await rejected).status()).toBe(409);
      await expect(page.getByRole("heading", { name: "This course was changed by someone else." })).toBeVisible();
      if (attempt === 0) { await page.keyboard.press("Escape"); await expect(page.getByRole("heading", { name: "This course was changed by someone else." })).toHaveCount(0); }
    }
    await page.getByRole("button", { name: "Load latest version", exact: true }).click();
    await expect(page.locator("#details-title")).toHaveValue(`${title}-newer`);
  } finally {
    expect((await page.request.delete(`${api()}/admin/courses/${original.id}`, { headers: auth })).status()).toBe(204);
  }
});

test("settings security destination and failed-load retry work", async ({ page }) => {
  await loginThroughUi(page);
  await page.route(`${api()}/profile`, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Simulated failure"}' }));
  await page.goto("/admin/settings");
  await expect(page.getByRole("alert").filter({ hasText: "Administrator settings could not be loaded." })).toBeVisible();
  await page.unroute(`${api()}/profile`);
  await page.getByRole("alert").filter({ hasText: copy.admin.settingsLoadError }).getByRole("button", { name: copy.common.retry, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Administrator settings could not be loaded." })).toHaveCount(0);
  await page.getByRole("link", { name: "Manage password and email", exact: true }).click();
  await expect(page).toHaveURL(/\/profile\/account$/);
});

test("Activity preserves record filters and exposes all pages of matching history", async ({ page }) => {
  test.setTimeout(90_000);
  await loginThroughUi(page);
  const auth = await headers(page);
  const prefix = `admin-fixes-activity-${Date.now()}`;
  const ids: string[] = [];
  try {
    for (let index = 0; index < 27; index += 1) {
      const response = await page.request.post(`${api()}/admin/resources`, { headers: auth, data: { title: `${prefix}-${index}`, category: "Review", access_type: "free", status: "draft" } });
      expect(response.status()).toBe(201);
      ids.push((await response.json()).id);
    }
    await page.goto(`/admin/activity?entity_type=resource&entity_id=${ids[0]}`);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("#activity-record")).toHaveValue(ids[0]);
    await page.goto(`/admin/activity?q=${prefix}&entity_type=resource`);
    await expect(page.locator("tbody tr")).toHaveCount(25);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator("tbody tr")).toHaveCount(2);
    await page.reload();
    await expect(page.locator("tbody tr")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();
    const refreshed = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname === "/admin/audit-logs");
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    expect((await refreshed).status()).toBe(200);
    await expect(page.locator("[data-toast]").filter({ hasText: "Data refreshed" })).toBeVisible();
  } finally {
    for (const id of ids) expect((await page.request.delete(`${api()}/admin/resources/${id}`, { headers: auth })).status()).toBe(204);
  }
});
