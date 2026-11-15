import { expect, test } from "@playwright/test";
import { readdirSync, writeFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { copy } from "@/lib/copy/dictionary";
import { randomUUID } from "node:crypto";
import { adminEmail, loginThroughUi, studentEmail, testPassword } from "@/tests/e2e/helpers/index";

const api = process.env.GSP_E2E_API_URL ?? "http://127.0.0.1:8101";

function copyKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child ? copyKeys(child, path) : [path];
  });
}
const rawKeys = copyKeys(copy);

test("CFP production route, locale and role security guard", async ({ browser, page, request }) => {
  test.setTimeout(600_000);
  await loginThroughUi(page);
  const token = await page.evaluate(() => sessionStorage.getItem("gsp_access_token"));
  const headers = { Authorization: `Bearer ${token}` };
  const title = `cfp-headers-${randomUUID()}`;
  const postResponse = await request.post(`${api}/admin/homepage-posts`, { headers, data: { title, body_html: "<p>CFP header verification</p>", status: "published" } });
  expect(postResponse.status()).toBe(201);
  const post = await postResponse.json() as { id: string };
  const courseResponse = await request.post(`${api}/admin/courses`, { headers, data: { title, summary: title, description: title, access_type: "free" } });
  expect(courseResponse.status()).toBe(201);
  const course = await courseResponse.json() as { id: string };
  const moduleResponse = await request.post(`${api}/admin/courses/${course.id}/modules`, { headers, data: { title, order: 0 } });
  expect(moduleResponse.status()).toBe(201);
  const unit = await moduleResponse.json() as { id: string };
  const lessonResponse = await request.post(`${api}/admin/modules/${unit.id}/lessons`, { headers, data: { title, body_html: "<p>CFP header verification</p>", order: 0, duration_minutes: 1 } });
  expect(lessonResponse.status()).toBe(201);
  const lesson = await lessonResponse.json() as { id: string };
  expect((await request.post(`${api}/admin/courses/${course.id}/publish`, { headers })).status()).toBe(200);
  const root = resolve("app");
  const routes = readdirSync(root, { recursive: true }).map(String).filter((file) => file.endsWith(`${sep}page.tsx`) || file === "page.tsx").map((file) => `/${relative(root, resolve(root, file)).split(sep).slice(0, -1).join("/")}`.replace("[courseId]", course.id).replace("[lessonId]", lesson.id).replace("[id]", post.id));
  const findings: string[] = [];
  let visits = 0;
  try {
    for (const role of ["guest", "student", "admin"] as const) {
      for (const locale of ["en"] as const) {
        const context = await browser.newContext({ baseURL: process.env.GSP_E2E_BASE_URL });
        const target = await context.newPage();
        await target.addInitScript(() => {
          const state = window as Window & { __cfpCsp?: string[] };
          state.__cfpCsp = [];
          document.addEventListener("securitypolicyviolation", (event) => state.__cfpCsp?.push(`${event.violatedDirective}: ${event.blockedURI}`));
        });
        let route = "/login";
        target.on("console", (message) => { if (message.type() === "error") findings.push(`${role}/${locale} ${route}: ${message.text()}`); });
        target.on("pageerror", (error) => findings.push(`${role}/${locale} ${route}: ${error.message}`));
        if (role !== "guest") {
          const email = role === "admin" ? adminEmail : studentEmail;
          await target.goto("/login");
          await target.getByLabel("Email address").fill(email);
          await target.locator('input[name="password"]').fill(testPassword!);
          await target.getByRole("button", { name: "Log In" }).click();
          await expect(target).toHaveURL(role === "admin" ? /\/admin/ : /\/dashboard/);
        }
        for (route of routes) {
          console.log(`CFP route guard visiting ${role}/${locale} ${route}`);
          const response = await target.goto(route, { waitUntil: "domcontentloaded", timeout: 20_000 });
          await expect(target.locator("body")).toBeVisible();
          await target.waitForLoadState("networkidle");
          await expect(target.locator("html")).toHaveAttribute("lang", locale);
          const body = await target.locator("body").innerText();
          await expect(target.locator('a[href*="/forgot-password"]')).toHaveCount(0);
          expect(body).not.toContain("undefined");
          expect(body).not.toContain("[object Object]");
          expect(rawKeys.filter((key) => body.includes(key))).toEqual([]);
          const values = await target.evaluate(() => (window as Window & { __cfpCsp?: string[] }).__cfpCsp ?? []);
          findings.push(...values.map((value) => `${role}/${locale} ${route}: ${value}`));
          const responseHeaders = response!.headers();
          expect(responseHeaders["x-content-type-options"]).toBe("nosniff");
          expect(responseHeaders["referrer-policy"]).toBe("strict-origin-when-cross-origin");
          expect(responseHeaders["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
          expect(responseHeaders["cross-origin-opener-policy"]).toBe("same-origin");
          expect(responseHeaders["strict-transport-security"]).toBe(process.env.ENABLE_HSTS === "true" ? "max-age=31536000; includeSubDomains" : undefined);
          const policy = responseHeaders["content-security-policy-report-only"] ?? responseHeaders["content-security-policy"];
          expect(policy).toContain("script-src 'self' 'nonce-");
          if (responseHeaders["content-security-policy-report-only"]) {
            expect(policy).not.toContain("upgrade-insecure-requests");
          } else {
            expect(policy).toContain("upgrade-insecure-requests");
          }
          expect(policy).not.toContain("unsafe-eval");
          visits++;
        }
        await context.close();
      }
    }
    console.log(`CFP HTTP guard: routes=${routes.length}, visits=${visits}, roles=3, locales=1, violations=${findings.length}`);
    writeFileSync(resolve("test-artifacts/cfp-http-findings.json"), JSON.stringify(findings, null, 2));
    expect(findings).toEqual([]);
  } finally {
    await request.delete(`${api}/admin/homepage-posts/${post.id}`, { headers });
    await request.delete(`${api}/admin/courses/${course.id}?confirm_progress_loss=true&confirm_title=${encodeURIComponent(title)}`, { headers });
  }
});
