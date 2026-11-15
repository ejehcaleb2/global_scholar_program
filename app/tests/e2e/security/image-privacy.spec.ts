import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loginThroughUi, studentEmail, testPassword } from "@/tests/e2e/helpers/index";

const api = process.env.GSP_E2E_API_URL ?? "http://127.0.0.1:8101";

function fixture(side: number) {
  const filename = resolve("test-artifacts", `cfp-avatar-${side}.jpg`);
  mkdirSync(resolve("test-artifacts"), { recursive: true });
  execFileSync(resolve("../backend/.venv/Scripts/python.exe"), ["-X", "utf8", "-c", "from PIL import Image; import sys; Image.new('RGB', (int(sys.argv[2]), int(sys.argv[2])), (70, 90, 120)).save(sys.argv[1], format='JPEG')", filename, String(side)], { stdio: "pipe" });
  return { name: "cfp-avatar.jpg", mimeType: "image/jpeg", buffer: readFileSync(filename) };
}

async function studentLogin(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(testPassword!);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("CFP private avatar appears in settings, shared sidebars, admin students and activity", async ({ page, request }) => {
  test.setTimeout(60_000);
  try {
    await studentLogin(page, studentEmail);
    await page.goto("/profile");
    let response = page.waitForResponse((value) => value.url().endsWith("/profile/avatar") && value.request().method() === "POST");
    await page.locator('input[type="file"]').setInputFiles(fixture(100));
    expect((await response).status()).toBe(422);
    await expect(page.locator("main").getByRole("alert").filter({ hasText: "This image is 100 by 100 pixels. An avatar requires at least 128 by 128 pixels." })).toBeVisible();
    response = page.waitForResponse((value) => value.url().endsWith("/profile/avatar") && value.request().method() === "POST");
    await page.locator('input[type="file"]').setInputFiles(fixture(512));
    expect((await response).status()).toBe(200);
    await expect(page.locator('[data-testid="profile-block"] img')).toHaveAttribute("src", /^data:image\/webp/);
    await expect(page.locator("main img")).toHaveAttribute("src", /^data:image\/webp/);
    response = page.waitForResponse((value) => value.url().endsWith("/profile/avatar") && value.request().method() === "POST");
    await page.locator('input[type="file"]').setInputFiles(fixture(512));
    expect((await response).status()).toBe(429);
    await expect(page.locator("main").getByRole("alert").filter({ hasText: "Too many attempts" })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeDisabled();
    await page.screenshot({ path: "test-artifacts/cfp-avatar-countdown.png" });
    await page.getByRole("button", { name: "Log Out", exact: true }).click();
    await page.getByRole("alertdialog", { name: "Log out?" }).getByRole("button", { name: "Log Out", exact: true }).click();
    await loginThroughUi(page);
    await page.goto("/admin/students");
    await expect(page.getByRole("row").filter({ hasText: studentEmail }).locator("img")).toHaveAttribute("src", /^data:image\/webp/);
    await page.goto("/profile");
    response = page.waitForResponse((value) => value.url().endsWith("/profile/avatar") && value.request().method() === "POST");
    await page.locator('input[type="file"]').setInputFiles(fixture(512));
    expect((await response).status()).toBe(200);
    await expect(page.locator('[data-testid="profile-block"] img')).toHaveAttribute("src", /^data:image\/webp/);
    const token = await page.evaluate(() => sessionStorage.getItem("gsp_access_token"));
    const uploaded = await request.post(`${api}/admin/media`, { headers: { Authorization: `Bearer ${token}` }, multipart: { file: fixture(512) } });
    expect(uploaded.status()).toBe(201);
    await page.goto("/admin/activity");
    await expect(page.locator("tbody tr img").first()).toHaveAttribute("src", /^data:image\/webp/);
    await page.screenshot({ path: "test-artifacts/cfp-admin-avatar-activity.png" });
  } finally {
  }
});

test("CFP service document downloads with its neutral server filename", async ({ page }) => {
  test.setTimeout(60_000);
  const email = "paid.student@gsp.test";
  try {
    await studentLogin(page, email);
    await page.goto("/services");
    await page.getByRole("button", { name: "Request service", exact: true }).first().click();
    await page.locator("#service-file").setInputFiles({ name: "cfp-original.exe.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nCFP document download fixture\n%%EOF\n") });
    const created = page.waitForResponse((value) => value.url().endsWith("/service-requests") && value.request().method() === "POST");
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const record = await response.json() as { id: string };
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download submitted document", exact: true }).first().click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`essay_review-${record.id.slice(0, 8)}.pdf`);
    await download.saveAs(resolve("test-artifacts/cfp-neutral-document.pdf"));
  } finally {
  }
});
