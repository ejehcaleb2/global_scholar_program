import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { copy } from "@/lib/copy/dictionary";
import { loginThroughUi } from "@/tests/e2e/helpers/index";
import { api, headers, heldMutation } from "@/tests/e2e/helpers/admin-actions";
import { installVideoFixtures } from "@/tests/e2e/helpers/video";
import { STALE } from "@/lib/queries/keys";

const t = copy.admin;
async function exerciseToolbar(page: Page) {
  for (const label of [t.toolbarBold, t.toolbarItalic, t.toolbarHeading2, t.toolbarHeading3, t.toolbarBullets, t.toolbarNumbered, t.toolbarQuote]) {
    const control = page.getByRole("button", { name: label, exact: true });
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "false");
  }
  await page.locator(".tiptap").click();
  await page.locator(".tiptap").press("Control+A");
  await page.getByRole("button", { name: t.toolbarLink, exact: true }).click();
  await page.locator("#rich-text-link-url").fill("https://example.com/admin-controls");
  await page.getByRole("dialog").getByRole("button", { name: t.toolbarLink, exact: true }).click();
  await expect(page.locator('.tiptap a[href="https://example.com/admin-controls"]')).toHaveCount(1);
}

test("course and post editor controls format, reorder, preview, upload and save real content", async ({ page }) => {
  test.setTimeout(120_000);
  await installVideoFixtures(page);
  await loginThroughUi(page);
  const auth = await headers(page);
  const prefix = `admin-fixes-controls-${Date.now()}`;
  let courseId: string | undefined;
  let postId: string | undefined;
  try {
    const course = await page.request.post(`${api()}/admin/courses`, { headers: auth, data: { title: prefix, access_type: "free" } });
    expect(course.status()).toBe(201); courseId = (await course.json()).id;
    const courseModule = await page.request.post(`${api()}/admin/courses/${courseId}/modules`, { headers: auth, data: { title: `${prefix}-module`, order: 0 } });
    expect(courseModule.status()).toBe(201); const moduleId = (await courseModule.json()).id;
    const lesson = await page.request.post(`${api()}/admin/modules/${moduleId}/lessons`, { headers: auth, data: { title: `${prefix}-lesson`, body_html: "<p>Regression content for the editor controls.</p>", order: 0 } });
    expect(lesson.status()).toBe(201); const lessonId = (await lesson.json()).id;
    expect((await page.request.patch(`${api()}/admin/modules/${moduleId}/lessons/${lessonId}`, { headers: auth, data: { video_url: "https://youtube.com/watch?v=abcdefghijk", resources: [{ title: "First", url: "https://example.com/first" }, { title: "Second", url: "https://example.com/second" }] } })).status()).toBe(200);
    await page.goto(`/admin/courses/${courseId}/lessons/${lessonId}`);
    await exerciseToolbar(page);
    await page.getByRole("button", { name: t.suggestDuration, exact: true }).click();
    await expect(page.locator("#lesson-duration")).toHaveValue("1");
    await page.getByRole("button", { name: t.removeVideo, exact: true }).click();
    await expect(page.locator("#lesson-video-url")).toHaveValue("");
    await expect(page.getByRole("button", { name: t.removeVideo, exact: true })).toBeDisabled();
    await page.getByRole("button", { name: t.addLessonResource, exact: true }).click();
    await page.locator("#resource-title-2").fill("Third");
    await page.locator("#resource-url-2").fill("https://example.com/third");
    await page.getByRole("button", { name: t.resourceOrderUp.replace("{title}", "Third"), exact: true }).click();
    await expect(page.locator("#resource-title-1")).toHaveValue("Third");
    await page.getByRole("button", { name: t.resourceOrderDown.replace("{title}", "Third"), exact: true }).click();
    await expect(page.locator("#resource-title-2")).toHaveValue("Third");
    await page.getByRole("button", { name: t.removeLessonResource.replace("{title}", "Third"), exact: true }).click();
    await expect(page.locator("#resource-title-2")).toHaveCount(0);
    await page.getByRole("button", { name: t.preview, exact: true }).click();
    await expect(page.getByRole("heading", { name: t.preview, exact: true })).toBeVisible();
    await heldMutation(page, `/admin/modules/${moduleId}/lessons/${lessonId}`, "PATCH", page.getByRole("button", { name: t.saveLesson, exact: true }));
    await page.getByRole("button", { name: t.lessonHistoryOpen, exact: true }).click();
    await expect(page.getByRole("dialog", { name: t.lessonHistory })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto(`/admin/courses/${courseId}/details`);
    await page.getByRole("button", { name: t.addOutcome, exact: true }).click();
    await page.locator("#outcome-0").fill(`${prefix}-first`);
    await page.getByRole("button", { name: t.addOutcome, exact: true }).click();
    await page.locator("#outcome-1").fill(`${prefix}-second`);
    await page.getByRole("button", { name: `${t.moveUp} 2`, exact: true }).click();
    await expect(page.locator("#outcome-0")).toHaveValue(`${prefix}-second`);
    await page.getByRole("button", { name: `${t.moveDown} 1`, exact: true }).click();
    await page.getByRole("button", { name: `${t.removeOutcome} 2`, exact: true }).click();
    await expect(page.locator("#outcome-1")).toHaveCount(0);
    await heldMutation(page, `/admin/courses/${courseId}`, "PATCH", page.getByRole("button", { name: t.saveCourseDetails, exact: true }));

    await page.goto("/admin/homepage-posts/new");
    await page.getByLabel(t.title, { exact: false }).fill(`${prefix}-post`);
    await page.locator(".tiptap").fill("Regression content for the post toolbar.");
    await exerciseToolbar(page);
    await page.getByRole("button", { name: t.preview, exact: true }).click();
    await expect(page.getByRole("heading", { name: `${prefix}-post`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: t.hidePreview, exact: true }).click();
    const saved = await heldMutation(page, "/admin/homepage-posts", "POST", page.getByRole("button", { name: t.save, exact: true }).first());
    postId = (await saved.json()).id;
  } finally {
    if (postId) expect((await page.request.delete(`${api()}/admin/homepage-posts/${postId}`, { headers: auth })).status()).toBe(204);
    if (courseId) expect((await page.request.delete(`${api()}/admin/courses/${courseId}`, { headers: auth })).status()).toBe(204);
  }
});

test("dashboard and student request panels preserve downloads, transitions, history and student synchronization", async ({ page, browser }) => {
  test.setTimeout(150_000);
  await loginThroughUi(page);
  const auth = await headers(page);
  const python = resolve("../backend/.venv/Scripts/python.exe");
  const cleanupScript = resolve("../backend/scripts/e2e_cleanup_service_requests.py");
  const refused = spawnSync(python, [cleanupScript, "00000000-0000-0000-0000-000000000001"], { env: { ...process.env, APP_ENV: "production", DATABASE_URL: "postgresql+asyncpg://localhost/Global_scholar" }, encoding: "utf8" });
  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toContain("Refusing cleanup outside the fixed local E2E database");
  const students = await (await page.request.get(`${api()}/admin/students?membership_tier=paid`, { headers: auth })).json();
  expect(students.length).toBeGreaterThan(0);
  const signedIn = await page.request.post(`${api()}/auth/login`, { data: { email: students[0].email, password: process.env.GSP_E2E_PASSWORD } });
  expect(signedIn.status()).toBe(200);
  const session = await signedIn.json();
  expect(typeof session.tokens?.access_token).toBe("string");
  const paidHeaders = { Authorization: `Bearer ${session.tokens.access_token}` };
  const ids: string[] = [];
  let paidContext: BrowserContext | undefined;
  try {
    for (const kind of ["essay_review", "activities_review"]) {
      const created = await page.request.post(`${api()}/service-requests`, { headers: paidHeaders, multipart: { service_type: kind, file: { name: "frontend-ux-service.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nfrontend-ux-service\n%%EOF") } } });
      expect(created.status()).toBe(201); ids.push((await created.json()).id);
    }
    paidContext = await browser.newContext({ baseURL: process.env.GSP_E2E_BASE_URL });
    await paidContext.addInitScript(value => { sessionStorage.setItem("gsp_access_token", value.tokens.access_token); sessionStorage.setItem("gsp_current_user", JSON.stringify(value.user)); }, session);
    const paidPage = await paidContext.newPage();
    await paidPage.clock.install();
    await paidPage.goto("/services");
    await expect(paidPage.getByRole("heading").first()).toBeVisible();
    await page.bringToFront();
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: /^Service [Rr]equests/ })).toHaveCount(0);
    for (const [index, label] of [t.essayReview, t.activitiesReview].entries()) {
      const row = page.getByRole("row").filter({ has: page.getByText(label, { exact: true }) });
      await row.getByRole("button", { name: t.reviewRequest, exact: true }).click();
      const panel = page.getByRole("dialog", { name: t.requestDetails });
      await expect(panel.getByText(t.returnStatusNotice, { exact: true })).toBeVisible();
      const downloaded = page.waitForEvent("download");
      await heldMutation(page, `/service-requests/${ids[index]}/document`, "GET", panel.getByRole("button", { name: t.downloadDocument, exact: true }));
      expect(await (await downloaded).failure()).toBeNull();
      await expect(page.locator("[data-toast]").filter({ hasText: t.downloadComplete }).first()).toBeVisible();
      await heldMutation(page, `/admin/service-requests/${ids[index]}/status`, "PATCH", panel.getByRole("button", { name: t.startReview, exact: true }));
      await expect(panel.getByText(t.statusInProgress, { exact: true }).first()).toBeVisible();
      await heldMutation(page, `/admin/service-requests/${ids[index]}/status`, "PATCH", panel.getByRole("button", { name: t.markReturned, exact: true }));
      await expect(panel.getByText(t.statusReturned, { exact: true }).first()).toBeVisible();
      await expect(panel.getByRole("listitem")).toHaveCount(3);
      await panel.getByRole("button", { name: t.closeRequest, exact: true }).click();
      await expect(panel).toHaveCount(0);
    }
    const own = await (await page.request.get(`${api()}/service-requests`, { headers: paidHeaders })).json();
    expect(own.filter((item: { id: string; status: string }) => ids.includes(item.id) && item.status === "returned")).toHaveLength(2);
    const studentRefresh = paidPage.waitForResponse(response => new URL(response.url()).pathname === "/service-requests" && response.request().method() === "GET");
    await paidPage.clock.fastForward(STALE.status + 1);
    await paidPage.bringToFront();
    await paidPage.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    expect((await studentRefresh).status()).toBe(200);
    await expect(paidPage.getByText(t.statusReturned, { exact: true })).toHaveCount(2);
    await page.bringToFront();
    await page.goto("/admin/students");
    const student = students[0];
    await page.getByRole("row").filter({ has: page.getByText(student.full_name || student.email, { exact: true }) }).getByRole("button", { name: t.studentDetails }).click();
    const studentPanel = page.getByRole("dialog", { name: t.studentDetails });
    const requests = studentPanel.getByRole("region", { name: t.studentRequests });
    await expect(requests.getByRole("button", { name: t.reviewRequest })).toHaveCount(2);
    const path = `${api()}/admin/service-requests/${ids[0]}`;
    await page.route(path, route => route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"Unavailable"}' }));
    await requests.getByRole("listitem").filter({ has: page.getByText(t.essayReview, { exact: true }) }).getByRole("button", { name: t.reviewRequest }).click();
    const panel = page.getByRole("dialog", { name: t.requestDetails });
    await expect(panel.getByRole("alert")).toBeVisible();
    await page.unroute(path);
    await heldMutation(page, `/admin/service-requests/${ids[0]}`, "GET", panel.getByRole("button", { name: t.retry, exact: true }));
    await expect(panel.getByRole("listitem")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(studentPanel).toBeVisible();
    await page.evaluate(() => { const url = new URL(location.href); url.searchParams.set("page", "2"); history.replaceState(null, "", url); });
    await requests.getByRole("button", { name: t.needsAttention, exact: true }).click();
    expect(new URL(page.url()).searchParams.get("page")).toBe("2");
    await expect(requests.getByText(t.requestsNoResults, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(studentPanel).toHaveCount(0);
  } finally {
    await paidContext?.close();
    if (ids.length) {
      const result = execFileSync(python, [cleanupScript, ...ids], { env: process.env, timeout: 20_000 });
      await test.info().attach("service-fixture-cleanup", { body: result, contentType: "application/json" });
    }
  }
});
