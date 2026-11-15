import { test, expect, type Page } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { copy } from "@/lib/copy/dictionary";
import { STALE } from "@/lib/queries/keys";
import { api, headers } from "@/tests/e2e/helpers/admin-actions";
import { loginThroughUi, studentEmail, testPassword } from "@/tests/e2e/helpers/index";
import { installVideoFixtures, releaseVideo } from "@/tests/e2e/helpers/video";

async function fixture(page: Page) {
  await loginThroughUi(page);
  const auth = await headers(page);
  const title = `frontend-ux-video-${Date.now()}`;
  const created = await page.request.post(`${api()}/admin/courses`, { headers: auth, data: { title, summary: title, description: title, access_type: "free" } });
  expect(created.status()).toBe(201); const course = await created.json();
  const moduleResponse = await page.request.post(`${api()}/admin/courses/${course.id}/modules`, { headers: auth, data: { title, order: 0 } });
  expect(moduleResponse.status()).toBe(201); const unit = await moduleResponse.json();
  const added = await page.request.post(`${api()}/admin/modules/${unit.id}/lessons`, { headers: auth, data: { title, body_html: "<p>Video playback regression content.</p>", order: 0 } });
  expect(added.status()).toBe(201); const lesson = await added.json();
  expect((await page.request.patch(`${api()}/admin/modules/${unit.id}/lessons/${lesson.id}`, { headers: auth, data: { video_url: "https://www.youtube.com/shorts/abcdefghijk?si=shared" } })).status()).toBe(200);
  expect((await page.request.post(`${api()}/admin/courses/${course.id}/publish`, { headers: auth })).status()).toBe(200);
  await page.getByRole("button", { name: copy.common.logout, exact: true }).click();
  await page.getByRole("alertdialog", { name: "Log out?" }).getByRole("button", { name: "Log Out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/login");
  // Observe a real client interaction before entering fixture credentials.
  await page.getByRole("button", { name: copy.auth.showPassword, exact: true }).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: copy.auth.hidePassword, exact: true }).click();
  await page.getByLabel(copy.auth.email).fill(studentEmail);
  await page.locator('input[name="password"]').fill(testPassword!);
  const signedIn = page.waitForResponse(response => new URL(response.url()).pathname === "/auth/login" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  expect((await signedIn).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  return { auth, course, lesson, unit };
}

async function refetch(page: Page, id: string) {
  const response = page.waitForResponse(item => item.request().method() === "GET" && new URL(item.url()).pathname === `/courses/${id}`);
  await page.clock.fastForward(STALE.content + 1);
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  return response;
}

test("provider failure recovers, real refetch preserves the video, Vimeo works and expiry redirects", async ({ page }) => {
  test.setTimeout(120_000);
  await installVideoFixtures(page, "error-first");
  const data = await fixture(page);
  try {
    await page.clock.install();
    await page.goto(`/courses/${data.course.id}/lessons/${data.lesson.id}`);
    const region = page.getByTestId("lesson-video");
    await region.scrollIntoViewIfNeeded();
    await expect(region).toHaveAttribute("data-video-failure", "youtube-153");
    await expect(region.getByRole("heading", { name: copy.learning.videoFailed })).toBeVisible();
    await page.context().route("https://www.youtube.com/watch?v=abcdefghijk", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Original provider video</body></html>" }));
    const opened = page.waitForEvent("popup");
    await region.getByRole("link", { name: copy.learning.openYouTube }).click();
    const popup = await opened;
    await expect(popup).toHaveURL("https://www.youtube.com/watch?v=abcdefghijk");
    await popup.close();
    await region.getByRole("button", { name: copy.common.retry, exact: true }).click();
    const pending = region.getByRole("button");
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await expect(pending).toBeDisabled();
    await expect(pending.locator("svg.motion-safe\\:animate-spin")).toBeVisible();
    await releaseVideo(page);
    await expect(region).toHaveAttribute("data-video-state", "ready");
    const frame = region.locator("iframe");
    await expect(frame).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    const source = new URL((await frame.getAttribute("src"))!);
    expect(source.origin).toBe("https://www.youtube-nocookie.com");
    expect(source.pathname).toBe("/embed/abcdefghijk");
    expect(source.searchParams.get("enablejsapi")).toBe("1");
    expect(source.searchParams.get("origin")).toBe(process.env.GSP_E2E_BASE_URL);
    expect(await page.locator('script[src="https://www.youtube.com/iframe_api"]').evaluate(element => Boolean((element as HTMLScriptElement).nonce))).toBe(true);
    const refreshed = await refetch(page, data.course.id);
    expect(refreshed.status()).toBe(200);
    const course = await refreshed.json();
    expect(course.modules.flatMap((unit: { lessons: Array<{ id: string; video: object }> }) => unit.lessons).find((lesson: { id: string }) => lesson.id === data.lesson.id).video).toEqual({ provider: "youtube", id: "abcdefghijk" });
    await expect(frame).toHaveAttribute("src", source.toString());
    await expect(region).toHaveAttribute("data-video-state", "ready");
    expect(await page.evaluate(() => window.__uxVideoAttempts)).toBe(2);
    expect((await page.request.patch(`${api()}/admin/modules/${data.unit.id}/lessons/${data.lesson.id}`, { headers: data.auth, data: { video_url: "https://www.vimeo.com/12345678" } })).status()).toBe(200);
    expect((await refetch(page, data.course.id)).status()).toBe(200);
    await region.scrollIntoViewIfNeeded();
    await expect(region.locator("iframe")).toHaveAttribute("src", "https://player.vimeo.com/video/12345678?dnt=1");
    await expect(region).toHaveAttribute("data-video-state", "ready");
    await expect(region.getByRole("link", { name: copy.learning.openVimeo })).toHaveAttribute("href", "https://vimeo.com/12345678");
    const current = await page.evaluate(() => sessionStorage.getItem("gsp_access_token"));
    const claims = JSON.parse(Buffer.from(current!.split(".")[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ ...claims, iat: now - 3600, exp: now - 60, jti: randomUUID() })).toString("base64url")}`;
    if (!process.env.JWT_SECRET) throw new Error("Missing isolated signing configuration");
    const expired = `${unsigned}.${createHmac("sha256", process.env.JWT_SECRET).update(unsigned).digest("base64url")}`;
    await page.evaluate(token => sessionStorage.setItem("gsp_access_token", token), expired);
    const rejected = await refetch(page, data.course.id);
    expect(rejected.status()).toBe(401);
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => sessionStorage.getItem("gsp_access_token") === null)).toBe(true);
    await expect(page.locator("iframe")).toHaveCount(0);
  } finally {
    expect((await page.request.delete(`${api()}/admin/courses/${data.course.id}?confirm_progress_loss=true&confirm_title=${encodeURIComponent(data.course.title)}`, { headers: data.auth })).status()).toBe(204);
  }
});

test("the observed blocked frame and an unresponsive player both offer recovery without weakening CSP", async ({ page }) => {
  test.setTimeout(90_000);
  await installVideoFixtures(page, "hold");
  const pattern = "https://www.youtube-nocookie.com/embed/abcdefghijk*";
  await page.route(pattern, route => route.fulfill({ status: 302, headers: { location: "https://www.google.com/sorry/index" } }));
  const data = await fixture(page);
  try {
    await page.clock.install();
    const response = await page.goto(`/courses/${data.course.id}/lessons/${data.lesson.id}`);
    const policy = response!.headers()["content-security-policy"];
    expect(policy).toContain("frame-src https://www.youtube-nocookie.com https://player.vimeo.com;");
    expect(policy).not.toContain("frame-src https://www.google.com");
    const region = page.getByTestId("lesson-video");
    await region.scrollIntoViewIfNeeded();
    await expect(region).toHaveAttribute("data-video-failure", "csp");
    await expect(region.getByRole("heading", { name: copy.learning.videoFailed })).toBeVisible();
    await page.unroute(pattern);
    await region.getByRole("button", { name: copy.common.retry, exact: true }).click();
    await expect(region.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => page.evaluate(() => typeof window.__uxVideoRelease === "function")).toBe(true);
    await page.clock.fastForward(15_001);
    await expect(region).toHaveAttribute("data-video-failure", "timeout");
    await expect(region.getByRole("heading", { name: copy.learning.videoFailed })).toBeVisible();
    await region.getByRole("button", { name: copy.common.retry, exact: true }).click();
    await releaseVideo(page);
    await expect(region).toHaveAttribute("data-video-state", "ready");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await region.locator("iframe").evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(200);
  } finally {
    expect((await page.request.delete(`${api()}/admin/courses/${data.course.id}?confirm_progress_loss=true&confirm_title=${encodeURIComponent(data.course.title)}`, { headers: data.auth })).status()).toBe(204);
  }
});
