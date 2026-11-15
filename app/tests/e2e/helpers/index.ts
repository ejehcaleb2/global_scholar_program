import { expect, type Page } from "@playwright/test";

export const adminEmail = process.env.GSP_E2E_ADMIN_EMAIL ?? "admin@gsp.test";
export const studentEmail = process.env.GSP_E2E_STUDENT_EMAIL ?? "free.student@gsp.test";
export const testPassword = process.env.GSP_E2E_PASSWORD;

export async function loginThroughUi(page: Page, email = adminEmail) {
  if (!testPassword) throw new Error("GSP_E2E_PASSWORD must be set to the seeded account password.");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').fill(testPassword);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/admin(?:\/|$)/);
}

export async function screenshotDirectory() {
  const { mkdirSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const directory = resolve(process.cwd(), "test-artifacts/screenshots/admin");
  mkdirSync(directory, { recursive: true });
  return directory;
}

export async function deletePostThroughUi(page: Page, title: string) {
  if (page.isClosed()) return;
  const token = await page.evaluate(() => sessionStorage.getItem("gsp_access_token"));
  if (!token) return;
  const request = page.context().request;
  const headers = { Authorization: `Bearer ${token}` };
  const response = await request.get("http://127.0.0.1:8101/admin/homepage-posts", { headers });
  const posts = await response.json() as Array<{ id: string; title: string }>;
  for (const post of posts.filter((item) => item.title === title)) {
    await request.delete(`http://127.0.0.1:8101/admin/homepage-posts/${post.id}`, { headers });
  }
}
