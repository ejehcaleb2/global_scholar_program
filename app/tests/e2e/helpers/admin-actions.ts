import { expect, type Page, type Locator } from "@playwright/test";

export const api = () => process.env.GSP_E2E_API_URL!;
export async function headers(page: Page) {
  return { Authorization: `Bearer ${await page.evaluate(() => sessionStorage.getItem("gsp_access_token"))}` };
}

export async function heldMutation(page: Page, path: string, method: string, button: Locator, pendingButton = button) {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const arrived = new Promise<void>((resolve) => { started = resolve; });
  const pattern = `${api()}${path}*`;
  const handle = await pendingButton.elementHandle();
  expect(handle).not.toBeNull();
  await page.route(pattern, async (route) => {
    if (route.request().method() === method) { started(); await gate; }
    await route.continue();
  });
  const response = page.waitForResponse((item) => item.request().method() === method && new URL(item.url()).pathname === path);
  try {
    await button.click();
    await arrived;
    await expect.poll(() => handle!.getAttribute("aria-busy")).toBe("true");
    expect(await handle!.isDisabled()).toBe(true);
    const spinner = await handle!.$("svg.motion-safe\\:animate-spin");
    expect(spinner).not.toBeNull();
    expect(await spinner!.isVisible()).toBe(true);
  } finally { release(); }
  const result = await response;
  await page.unroute(pattern);
  expect(result.ok(), `HTTP status ${result.status()} for ${method} ${path}`).toBeTruthy();
  return result;
}

