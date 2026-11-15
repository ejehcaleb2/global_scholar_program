import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loginThroughUi, studentEmail, testPassword } from "@/tests/e2e/helpers/index";

const api = process.env.GSP_E2E_API_URL ?? "http://127.0.0.1:8101";

async function guard(page: Page, dialogs: string[]) {
  page.on("dialog", (dialog) => { dialogs.push(dialog.type()); void dialog.dismiss(); });
  await page.addInitScript(() => {
    const target = window as Window & { __cfpViolations?: string[] };
    target.__cfpViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => target.__cfpViolations?.push(event.violatedDirective));
  });
}

async function assertSafe(page: Page, dialogs: string[]) {
  await expect(page.locator(".prose-gsp").first()).toContainText("CFP renderer fixture");
  const state = await page.evaluate(() => {
    const target = window as Window & { __cfpXss?: unknown; __cfpViolations?: string[] };
    const unsafe = [...document.querySelectorAll(".prose-gsp *")].flatMap((node) => [...node.attributes].filter((attribute) => /^on/i.test(attribute.name) || attribute.name === "srcdoc" || /^(javascript|data):/i.test(attribute.value)).map((attribute) => attribute.name));
    return { executed: target.__cfpXss !== undefined, violations: target.__cfpViolations ?? [], unsafe };
  });
  expect(state).toEqual({ executed: false, violations: [], unsafe: [] });
  expect(dialogs).toEqual([]);
}

test("CFP corpus is inert on the public post, admin preview and student lesson", async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  const corpus = JSON.parse(execFileSync(resolve("../backend/.venv/Scripts/python.exe"), ["-X", "utf8", "-c", "import json; from tests.security.xss_corpus import XSS_CORPUS; print(json.dumps(XSS_CORPUS))"], { cwd: resolve("../backend"), encoding: "utf8", stdio: "pipe" })) as string[];
  expect(corpus.length).toBeGreaterThanOrEqual(30);
  const html = `<p>CFP renderer fixture</p>${corpus.join("\n")}`;
  const title = `cfp-xss-${randomUUID()}`;
  const dialogs: string[] = [];
  await guard(page, dialogs);
  await loginThroughUi(page);
  const token = await page.evaluate(() => sessionStorage.getItem("gsp_access_token"));
  const headers = { Authorization: `Bearer ${token}` };
  let postId: string | undefined;
  let courseId: string | undefined;
  const guestContext = await browser.newContext({ baseURL: process.env.GSP_E2E_BASE_URL });
  const studentContext = await browser.newContext({ baseURL: process.env.GSP_E2E_BASE_URL });
  try {
    const post = await request.post(`${api}/admin/homepage-posts`, { headers, data: { title, body_html: html, status: "published" } });
    expect(post.status()).toBe(201);
    postId = (await post.json() as { id: string }).id;
    const course = await request.post(`${api}/admin/courses`, { headers, data: { title, access_type: "free", summary: "CFP renderer fixture" } });
    expect(course.status()).toBe(201);
    courseId = (await course.json() as { id: string }).id;
    const moduleResponse = await request.post(`${api}/admin/courses/${courseId}/modules`, { headers, data: { title, order: 0 } });
    expect(moduleResponse.status()).toBe(201);
    const moduleId = (await moduleResponse.json() as { id: string }).id;
    const lesson = await request.post(`${api}/admin/modules/${moduleId}/lessons`, { headers, data: { title, body_html: html, order: 0, duration_minutes: 1 } });
    expect(lesson.status()).toBe(201);
    const lessonId = (await lesson.json() as { id: string }).id;
    expect((await request.patch(`${api}/admin/courses/${courseId}`, { headers, data: { status: "published" } })).status()).toBe(200);
    const guest = await guestContext.newPage();
    await guard(guest, dialogs);
    await guest.goto(`/posts/${postId}`);
    await assertSafe(guest, dialogs);
    await page.goto(`/admin/homepage-posts/${postId}/edit`);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("region", { name: "Preview", exact: true })).toBeVisible();
    await assertSafe(page, dialogs);
    const student = await studentContext.newPage();
    await guard(student, dialogs);
    await student.goto("/login");
    await student.locator('input[name="email"]').fill(studentEmail);
    await student.locator('input[name="password"]').fill(testPassword!);
    await student.getByRole("button", { name: "Log In", exact: true }).click();
    await expect(student).toHaveURL(/\/dashboard/);
    await student.goto(`/courses/${courseId}/lessons/${lessonId}`);
    await assertSafe(student, dialogs);
    await student.screenshot({ path: "test-artifacts/cfp-xss-student-lesson.png" });
    console.log(`CFP browser XSS corpus: payloads=${corpus.length}; public/admin/student dialogs=0, execution=0, CSP violations=0`);
  } finally {
    await guestContext.close();
    await studentContext.close();
    if (postId) expect((await request.delete(`${api}/admin/homepage-posts/${postId}`, { headers })).status()).toBe(204);
    if (courseId) expect((await request.delete(`${api}/admin/courses/${courseId}?confirm_progress_loss=true&confirm_title=${encodeURIComponent(title)}`, { headers })).status()).toBe(204);
  }
});
