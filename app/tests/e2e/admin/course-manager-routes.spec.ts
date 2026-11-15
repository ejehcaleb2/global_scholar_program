import { expect, test, type Response } from "@playwright/test";
import { loginThroughUi } from "@/tests/e2e/helpers/index";
import { installVideoFixtures } from "@/tests/e2e/helpers/video";

test("course creation reaches a working curriculum and all course routes resolve", async ({ page }) => {
  test.setTimeout(120_000);
  await installVideoFixtures(page);
  await loginThroughUi(page);
  const timestamp = Date.now();
  const title = `b3-course-${timestamp}`;
  const moduleTitle = `b3-module-${timestamp}`;
  const lessonTitle = `b3-lesson-${timestamp}`;
  let courseId: string | null = null;
  let moduleCreateRequests = 0;
  const apiOrigin = new URL(process.env.GSP_E2E_API_URL!).origin;
  const isCourseDetailResponse = (response: Response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET"
      && url.origin === apiOrigin
      && url.pathname === `/admin/courses/${courseId}`;
  };
  const matchingModuleIds = (detail: { modules: Array<{ id: string; title: string }> }) =>
    detail.modules.filter((module) => module.title === moduleTitle).map((module) => module.id);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto("/admin/courses/new");
    await page.getByLabel("Course title").fill(title);
    await page.getByRole("radio", { name: /Members only/ }).click();
    const createResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/admin/courses");
    await page.getByRole("button", { name: "Create course" }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status(), await createResponse.text()).toBe(201);
    await expect(page).toHaveURL(/\/admin\/courses\/[^/]+\/curriculum$/);
    courseId = new URL(page.url()).pathname.split("/")[3] ?? null;
    expect(courseId).toBeTruthy();

    await expect(page.getByRole("heading", { name: "Course outline" })).toBeVisible();
    await page.getByPlaceholder("New module title").fill(moduleTitle);
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/modules")) moduleCreateRequests += 1;
    });
    const [moduleDetailResponse] = await Promise.all([
      page.waitForResponse(isCourseDetailResponse),
      page.getByRole("button", { name: "Add module" }).click(),
    ]);
    expect(moduleDetailResponse.status()).toBe(200);
    const courseModuleIds = matchingModuleIds(await moduleDetailResponse.json());
    const moduleHeading = page.getByRole("heading", { name: new RegExp(moduleTitle) });
    await expect(moduleHeading.first()).toBeVisible();
    expect(moduleCreateRequests, "module creation requests after one submit").toBe(1);
    expect(courseModuleIds, "persisted modules with the submitted title").toHaveLength(1);
    const [reloadedDetailResponse] = await Promise.all([
      page.waitForResponse(isCourseDetailResponse),
      page.reload(),
    ]);
    expect(reloadedDetailResponse.status()).toBe(200);
    const reloadedModuleIds = matchingModuleIds(await reloadedDetailResponse.json());
    await expect(page.getByRole("navigation", { name: "Course editor tabs" })).toBeVisible();
    expect(reloadedModuleIds, "persisted course-detail response after reload").toHaveLength(1);
    expect(reloadedModuleIds, "same persisted module after reload").toEqual(courseModuleIds);
    await expect(page.getByRole("heading", { name: new RegExp(moduleTitle) })).toHaveCount(1);
    await page.getByPlaceholder("New lesson title").fill(lessonTitle);
    await page.getByRole("button", { name: "Add lesson" }).click();
    await expect(page.getByRole("link", { name: lessonTitle })).toBeVisible();

    const lessonId = await page.getByRole("link", { name: lessonTitle }).getAttribute("href");
    expect(lessonId).toContain(`/admin/courses/${courseId}/lessons/`);

    for (const path of [
      `/admin/courses/${courseId}`,
      `/admin/courses/${courseId}/details`,
      `/admin/courses/${courseId}/curriculum`,
      `/admin/courses/${courseId}/lessons/${lessonId?.split("/").at(-1)}`,
      `/admin/courses/${courseId}/learners`,
      `/admin/courses/${courseId}/preview`,
    ]) {
      const response = await page.goto(path);
      const responseBody = await response?.text();
      expect(response?.status(), `${path} final=${page.url()} htmlEnd=${responseBody?.slice(-1000)}`).toBe(200);
      await expect(page.getByRole("navigation", { name: "Course editor tabs" })).toBeVisible();
      await expect(page.getByText("Page not found")).toHaveCount(0);
    }

    await page.goto(`/admin/courses/${courseId}/preview`);
    await expect(page.getByText("Members only").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Unlock with membership" })).toBeVisible();
    await page.getByRole("button", { name: "Course page" }).click();
    await expect(page.getByText("A free student can see the course listing, but cannot open its members-only content.")).toBeVisible();
    await page.getByRole("button", { name: "Paid student" }).click();
    await expect(page.getByRole("heading", { name: title }).last()).toBeVisible();
    await page.getByRole("button", { name: "Lesson", exact: true }).click();
    await expect(page.getByLabel("Preview lesson")).toBeVisible();

    await page.goto(`/admin/courses/${courseId}/lessons/${lessonId?.split("/").at(-1)}`);
    const revisedLessonTitle = `${lessonTitle}-revised`;
    await page.getByLabel("Lesson title").fill(revisedLessonTitle);
    await page.getByLabel("Duration in minutes").fill("5");
    let releaseFirstSave!: () => void;
    let firstSaveStarted!: () => void;
    const saveGate = new Promise<void>((resolve) => { releaseFirstSave = resolve; });
    const requestStarted = new Promise<void>((resolve) => { firstSaveStarted = resolve; });
    const savePath = "**/admin/modules/*/lessons/*";
    await page.route(savePath, async (route) => {
      if (route.request().method() === "PATCH") {
        firstSaveStarted();
        await saveGate;
      }
      await route.continue();
    });
    const firstSaveResponse = page.waitForResponse((response) => response.request().method() === "PATCH" && /\/admin\/modules\/[^/]+\/lessons\/[^/]+$/.test(new URL(response.url()).pathname));
    try {
      await page.getByRole("button", { name: "Save lesson" }).click();
      await requestStarted;
      await expect(page.getByLabel("Lesson title")).toHaveValue(revisedLessonTitle);
      // Keep editing while the first save is pending, then release its older response.
      await page.getByLabel("Video URL").fill("https://youtu.be/abcdefghijk");
      await page.getByRole("button", { name: "Add resource link" }).click();
      await page.getByLabel("Resource title").fill("b3-reading");
      await page.getByLabel("Resource URL").fill("https://example.com/b3-reading");
      releaseFirstSave();
      expect((await firstSaveResponse).status()).toBe(200);
      await expect(page.getByRole("button", { name: "Save lesson" })).toBeEnabled();
      await expect(page.getByLabel("Video URL")).toHaveValue("https://youtu.be/abcdefghijk");
      await expect(page.getByLabel("Resource URL")).toHaveValue("https://example.com/b3-reading");
    } finally {
      releaseFirstSave();
      if (!page.isClosed()) await page.unroute(savePath);
    }
    const mediaSaveResponse = page.waitForResponse((response) => response.request().method() === "PATCH" && /\/admin\/modules\/[^/]+\/lessons\/[^/]+$/.test(new URL(response.url()).pathname));
    await page.getByRole("button", { name: "Save lesson" }).click();
    expect((await mediaSaveResponse).status()).toBe(200);
    await expect(page.getByLabel("Video URL")).toHaveValue("https://youtube.com/watch?v=abcdefghijk");
    await page.getByRole("button", { name: "Open lesson version history" }).click();
    await expect(page.getByRole("dialog", { name: "Version history" })).toBeVisible();
    await expect(page.getByText("https://example.com/b3-reading")).toHaveCount(0);
    await expect(page.getByText("b3-reading").last()).toBeVisible();
    await page.getByRole("button", { name: /Version 1/ }).click();
    await page.getByRole("button", { name: "Restore this version" }).click();
    await expect(page.getByRole("heading", { name: "Restore this saved version?" })).toBeVisible();
    await page.getByRole("button", { name: "Restore version" }).click();
    await expect(page.getByLabel("Video URL")).toHaveValue("");
    await expect(page.getByLabel("Resource title")).toHaveCount(0);
    expect(consoleErrors.filter((message) => !message.includes("Permissions policy violation: compute-pressure is not allowed in this document."))).toEqual([]);
    expect(pageErrors).toEqual([]);

    await page.goto(`/admin/courses/${courseId}/learners`);
    await expect(page.getByRole("heading", { name: "Lesson funnel" })).toBeVisible();
    await expect(page.getByText("No student has started this course yet.").first()).toBeVisible();
    await page.getByLabel("Search learners by name or email").fill("b3-no-matching-learner");
    await expect(page).toHaveURL(/q=b3-no-matching-learner/);

    await page.goto(`/admin/courses/${courseId}/details`);
    const revisedTitle = `${title}-revised`;
    await page.getByLabel("Course title").fill(revisedTitle);
    await page.getByRole("radio", { name: /Members only/ }).click();
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByLabel("Course title")).toHaveValue(revisedTitle);

    const legacyResponse = await page.goto(`/admin/courses/${courseId}/lessons`);
    expect(legacyResponse?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/admin/courses/${courseId}/curriculum$`));
    await expect(page.getByRole("heading", { name: moduleTitle })).toBeVisible();
  } finally {
    if (courseId) {
      await page.goto(`/admin/courses/${courseId}`);
      await page.getByRole("button", { name: "Course actions" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await expect(page.getByRole("heading", { name: "Delete this course?" })).toBeVisible();
      await page.getByRole("button", { name: "Delete course" }).click();
      await expect(page).toHaveURL(/\/admin\/courses$/);
    }
  }
});
