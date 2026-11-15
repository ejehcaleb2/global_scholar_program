import { expect, test, type Page } from "@playwright/test";
import { testPassword } from "@/tests/e2e/helpers/index";

const apiUrl = `http://127.0.0.1:${process.env.GSP_E2E_API_PORT ?? "8101"}`;

type ApiLesson = { id: string; title: string; completed: boolean; order: number };
type ApiCourse = { id: string; title: string; modules: Array<{ id: string; title: string; order: number; lessons: ApiLesson[] }> };

async function login(page: Page, email: string) {
  if (!testPassword) throw new Error("GSP_E2E_PASSWORD must be configured for the seeded accounts.");
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').fill(testPassword);
  await page.getByRole("button", { name: "Log In" }).click();
  await page.waitForFunction(() => Boolean(sessionStorage.getItem("gsp_access_token")));
  await page.goto(email.startsWith("admin") ? "/admin" : "/dashboard");
}

async function apiGet<T>(page: Page, path: string): Promise<T> {
  const token = await page.evaluate(() => sessionStorage.getItem("gsp_access_token"));
  const response = await page.context().request.get(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status(), `${path} status`).toBe(200);
  return await response.json() as T;
}

async function expectNoMarketingChrome(page: Page) {
  await expect(page.locator("header nav")).toHaveCount(0);
  await expect(page.locator("[data-site-footer]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Pricing" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Profile menu" })).toHaveCount(0);
}

async function expectActive(page: Page, label: string) {
  const sidebar = page.getByTestId("app-sidebar");
  const active = sidebar.getByRole("navigation", { name: "App navigation" }).getByRole("link", { name: label, exact: true });
  await expect(active).toHaveAttribute("aria-current", "page");
  const style = await active.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { border: computed.borderLeftColor, background: computed.backgroundColor };
  });
  const inactive = await sidebar.locator('nav a:not([aria-current="page"])').first().evaluate((element) => getComputedStyle(element).borderLeftColor);
  console.log(`Active nav item ${label}`, { ...style, inactiveBorder: inactive });
  expect(style.border).toBe("rgb(0, 86, 226)");
  expect(inactive).not.toBe("rgb(0, 86, 226)");
}

let completedLessonId: string | null = null;

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const token = await page.evaluate(() => sessionStorage.getItem("gsp_access_token")).catch(() => null);
  if (!token) return;
  const headers = { Authorization: `Bearer ${token}` };
  if (completedLessonId) {
    const response = await page.context().request.delete(`${apiUrl}/lessons/${completedLessonId}/complete`, { headers });
    console.log("Cleanup lesson completion", response.status());
    completedLessonId = null;
  }
});

test("primary sidebar, course sidebar, and navigation flow for the paid student", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "paid.student@gsp.test");
  await expect(page).toHaveURL(/\/dashboard$/);
  const profile = await apiGet<{ full_name: string | null }>(page, "/profile");
  const fullName = profile.full_name?.trim();
  expect(fullName).toBeTruthy();

  const sidebar = page.getByTestId("app-sidebar");
  await expect(sidebar).toBeVisible();
  await expectNoMarketingChrome(page);
  await expectActive(page, "Dashboard");
  await expect(page.getByRole("navigation", { name: "App navigation" })).toHaveCount(1);

  const geometry = await page.evaluate(() => {
    const aside = document.querySelector('[data-testid="app-sidebar"]') as HTMLElement;
    const rect = aside.getBoundingClientRect();
    const style = getComputedStyle(aside);
    const logo = aside.querySelector("img")?.getBoundingClientRect();
    const nav = aside.querySelector("nav")?.getBoundingClientRect();
    const block = aside.querySelector('[data-testid="profile-block"]')?.getBoundingClientRect();
    return {
      sidebar: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom },
      background: style.backgroundColor,
      borderRight: style.borderRightColor,
      logo: logo && { width: logo.width, height: logo.height, top: logo.top },
      nav: nav && { top: nav.top, bottom: nav.bottom },
      block: block && { top: block.top, bottom: block.bottom, left: block.left, width: block.width },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  console.log("Primary sidebar geometry", geometry);
  expect(geometry.sidebar).toMatchObject({ x: 0, y: 0, width: 250 });
  expect(geometry.background).toBe("rgb(255, 255, 255)");
  expect(geometry.borderRight).toBe("rgb(224, 224, 224)");
  expect(geometry.block).not.toBeNull();
  expect(geometry.sidebar.bottom - (geometry.block?.bottom ?? 0)).toBeLessThanOrEqual(1);
  expect(geometry.block?.top ?? 0).toBeGreaterThanOrEqual(geometry.nav?.bottom ?? Number.POSITIVE_INFINITY);
  expect(geometry.block?.left ?? 99).toBeLessThan(250);

  const block = sidebar.getByTestId("profile-block");
  await expect(block.getByText(fullName ?? "", { exact: true })).toBeVisible();
  await expect(block.getByText("paid.student@gsp.test")).toHaveCount(0);
  await expect(block.getByText("Student", { exact: true })).toBeVisible();
  await expect(block.getByRole("link")).toHaveAttribute("href", "/profile");

  for (const [href, label] of [["/courses", "Courses"], ["/resources", "Resources"], ["/masterclasses", "Masterclasses"], ["/services", "Services"], ["/profile", null]] as const) {
    await page.goto(href);
    await expect(sidebar).toBeVisible();
    await expectNoMarketingChrome(page);
    if (label) await expectActive(page, label);
    await expect(page.getByTestId("course-sidebar")).toHaveCount(0);
  }
  await expect(sidebar.locator('a[href="/admin"]')).toHaveCount(0);

  await page.goto("/courses");
  const courses = await apiGet<Array<{ id: string; title: string }>>(page, "/courses");
  const foundations = courses.find((course) => course.title === "Foundations");
  expect(foundations).toBeTruthy();
  const preCourse = await apiGet<ApiCourse>(page, `/courses/${foundations?.id}`);
  const seedLesson = preCourse.modules.slice().sort((a, b) => a.order - b.order)[0].lessons.slice().sort((a, b) => a.order - b.order)[0];
  expect(seedLesson.completed).toBe(false);
  const completionToken = await page.evaluate(() => sessionStorage.getItem("gsp_access_token"));
  const completion = await page.context().request.post(`${apiUrl}/lessons/${seedLesson.id}/complete`, { headers: { Authorization: `Bearer ${completionToken}` } });
  expect(completion.status()).toBe(200);
  completedLessonId = seedLesson.id;
  await page.goto("/courses");
  await page.locator(`a[href="/courses/${foundations?.id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/courses/${foundations?.id}$`));

  const course = await apiGet<ApiCourse>(page, `/courses/${foundations?.id}`);
  const modules = course.modules.slice().sort((a, b) => a.order - b.order);
  const courseSidebar = page.getByTestId("course-sidebar");
  await expect(courseSidebar).toBeVisible();
  await expect(page.getByTestId("app-sidebar")).toHaveCount(0);
  await expectNoMarketingChrome(page);
  await expect(courseSidebar.getByRole("link", { name: "Back to Courses" })).toHaveAttribute("href", "/courses");
  await expect(courseSidebar.getByRole("heading", { name: course.title })).toBeVisible();
  await expect(courseSidebar.getByRole("navigation", { name: "Course curriculum" })).toBeVisible();

  const toggles = courseSidebar.locator("button[aria-expanded]");
  await expect(toggles).toHaveCount(modules.length);
  const nextLesson = modules.flatMap((m) => m.lessons.slice().sort((a, b) => a.order - b.order).map((l) => ({ moduleId: m.id, lesson: l }))).find((x) => !x.lesson.completed);
  const expectedModule = modules.find((m) => m.id === (nextLesson?.moduleId ?? modules[0].id));
  const expandedStates = await toggles.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-expanded") === "true"));
  console.log("Course detail expanded modules", expandedStates, "expected module", expectedModule?.title);
  expect(expandedStates.filter(Boolean)).toHaveLength(1);
  expect(expandedStates[modules.findIndex((m) => m.id === expectedModule?.id)]).toBe(true);
  await expect(courseSidebar.locator('[aria-current="page"]')).toHaveCount(0);

  const firstModule = modules[0];
  const firstLessonTitle = firstModule.lessons.slice().sort((a, b) => a.order - b.order)[0].title;
  if (expandedStates[0] !== true) await toggles.nth(0).click();
  await courseSidebar.getByRole("link", { name: new RegExp(firstLessonTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
  await expect(page).toHaveURL(/\/lessons\//);
  await expect(page.getByTestId("course-sidebar")).toBeVisible();
  await expect(page.getByTestId("app-sidebar")).toHaveCount(0);
  await expectNoMarketingChrome(page);

  const currentLink = courseSidebar.locator('a[aria-current="page"]');
  await expect(currentLink).toHaveCount(1);
  await expect(currentLink).toContainText(firstLessonTitle);
  const currentStyle = await currentLink.evaluate((element) => ({ border: getComputedStyle(element).borderLeftColor, background: getComputedStyle(element).backgroundColor }));
  console.log("Current lesson highlight", currentStyle);
  expect(currentStyle.border).toBe("rgb(0, 86, 226)");

  // Fresh course data so status icons are compared against the API, not a cached view.
  const fresh = await apiGet<ApiCourse>(page, `/courses/${course.id}`);
  for (let index = 0; index < modules.length; index += 1) {
    if ((await toggles.nth(index).getAttribute("aria-expanded")) !== "true") await toggles.nth(index).click();
  }
  const expectedLessons = fresh.modules.flatMap((m) => m.lessons);
  const rows = courseSidebar.getByTestId("course-lesson-link");
  await expect(rows).toHaveCount(expectedLessons.length);
  const completedRows = await rows.evaluateAll((nodes) => nodes.filter((node) => node.querySelector('[aria-label^="Completed"]')).length);
  console.log("Sidebar completed rows vs API", { sidebar: completedRows, api: expectedLessons.filter((l) => l.completed).length });
  expect(completedRows).toBe(expectedLessons.filter((l) => l.completed).length);
  expect(completedRows).toBe(1);
  await expect(currentLink.locator('[aria-label="Completed, Current lesson"]')).toHaveCount(1);

  const target = rows.filter({ hasNot: page.locator('[aria-current="page"]') }).last();
  const targetHref = await target.getAttribute("href");
  const targetTitle = (await target.innerText()).trim();
  await target.click();
  await expect(page).toHaveURL(new RegExp(`${targetHref}$`));
  const moved = courseSidebar.locator('a[aria-current="page"]');
  await expect(moved).toHaveCount(1);
  await expect(moved).toHaveAttribute("href", targetHref ?? "");
  await expect(moved).toContainText(targetTitle);
  await expect(page.getByTestId("course-sidebar")).toBeVisible();

  await courseSidebar.getByRole("link", { name: "Back to Courses" }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.getByTestId("app-sidebar")).toBeVisible();
  await expect(page.getByTestId("course-sidebar")).toHaveCount(0);
  await expectActive(page, "Courses");
  await expectNoMarketingChrome(page);
});

test("mobile primary and course sidebars become off-canvas drawers", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "paid.student@gsp.test");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/courses");
  await expect(page.getByTestId("app-sidebar")).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const hamburger = page.getByRole("button", { name: "Open navigation" });
  const trigger = await hamburger.boundingBox();
  console.log("Mobile hamburger rect", trigger);
  expect(trigger?.x ?? 999).toBeLessThan(40);
  await hamburger.click();
  const drawer = page.getByRole("dialog", { name: "Close navigation" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("navigation", { name: "App navigation" })).toBeVisible();
  await expect(drawer.getByTestId("profile-block")).toBeVisible();
  console.log("Mobile primary drawer", await drawer.evaluate((node) => ({ modal: node.getAttribute("aria-modal"), width: node.getBoundingClientRect().width })));
  await drawer.getByRole("link", { name: "Resources", exact: true }).click();
  await expect(page).toHaveURL(/\/resources$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/courses");
  const courses = await apiGet<Array<{ id: string; title: string }>>(page, "/courses");
  const foundations = courses.find((course) => course.title === "Foundations");
  await page.locator(`a[href="/courses/${foundations?.id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/courses/${foundations?.id}$`));
  await expect(page.getByTestId("course-sidebar")).toBeHidden();
  await page.getByRole("button", { name: "Course curriculum" }).click();
  const courseDrawer = page.getByRole("dialog", { name: "Close navigation" });
  await expect(courseDrawer.getByRole("link", { name: "Back to Courses" })).toBeVisible();
  await courseDrawer.getByTestId("course-lesson-link").first().click();
  await expect(page).toHaveURL(/\/lessons\//);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Course curriculum" }).click();
  await page.getByRole("dialog", { name: "Close navigation" }).getByRole("link", { name: "Back to Courses" }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("admin link, logout, and guest marketing chrome", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "admin@gsp.test");
  await expect(page).toHaveURL(/\/admin$/);
  const sidebar = page.getByTestId("admin-sidebar");
  await expect(sidebar.getByRole("navigation", { name: "Admin navigation" })).toBeVisible();
  await expect(page.getByTestId("app-sidebar")).toHaveCount(0);
  await expect(sidebar.getByTestId("profile-block").getByText("Admin", { exact: true })).toBeVisible();
  await expectNoMarketingChrome(page);

  await page.goto("/dashboard");
  await expect(page.getByTestId("app-sidebar").locator('a[href="/admin"]')).toBeVisible();
  await page.goto("/admin");
  await expect(sidebar).toBeVisible();

  await sidebar.getByRole("button", { name: "Log Out" }).click();
  await page.getByRole("alertdialog", { name: "Log out?" }).getByRole("button", { name: "Log Out", exact: true }).click();
  await expect(page).toHaveURL("/");
  const cleared = await page.evaluate(() => ({ token: sessionStorage.getItem("gsp_access_token"), user: sessionStorage.getItem("gsp_current_user") }));
  console.log("Logout session verification", cleared, page.url());
  expect(cleared).toEqual({ token: null, user: null });
  await expect(page.locator("header nav")).toBeVisible();
  await expect(page.locator("[data-site-footer]")).toBeVisible();

  await page.goto("/courses");
  await expect(page.locator("header nav")).toBeVisible();
  await expect(page.locator("[data-site-footer]")).toBeVisible();
  await expect(page.getByTestId("app-sidebar")).toHaveCount(0);

  await login(page, "free.student@gsp.test");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("app-sidebar").locator('a[href="/admin"]')).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /You do not have access to this area/ })).toBeVisible();
  await expect(page.getByTestId("app-sidebar").locator('a[href="/admin"]')).toHaveCount(0);
});
