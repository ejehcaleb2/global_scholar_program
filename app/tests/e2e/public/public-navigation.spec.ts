import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { copy } from "@/lib/copy/dictionary";

test("public header, hero and footer align, Home navigation works and no individual courses are linked", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const measurements: object[] = [];
  mkdirSync("test-artifacts/ux-after", { recursive: true });
  await page.goto("/");
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator(".animate-pulse:visible")).toHaveCount(0);
  await expect(page.locator('main a[href^="/courses/"]')).toHaveCount(0);
  await expect(page.locator('main #resources, main #opportunities, main #services')).toHaveCount(0);
  await expect(page.locator('footer a[href="#"], footer a[href="https://chat.whatsapp.com"]')).toHaveCount(0);
  for (const width of [390,768,1024,1280,1440,1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.mouse.move(0,0);
    await expect(page.locator("header nav ul")).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const logo = document.querySelector('header a img')!.getBoundingClientRect();
      const title = document.querySelector('main h1')!.getBoundingClientRect();
      const footerLogo = document.querySelector('footer a img')!.getBoundingClientRect();
      return { logo: { width:logo.width, height:logo.height, left:logo.left }, titleLeft:title.left, footerLeft:footerLogo.left, overflow:document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.logo.width).toBe(56);
    if (width === 1920) expect(geometry.titleLeft).toBe(256);
    expect(Math.abs(geometry.logo.left - geometry.titleLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.logo.left - geometry.footerLeft)).toBeLessThanOrEqual(1);
    if (width >= 1280) {
      await expect(page.getByRole("navigation", { name: copy.nav.primaryNavigation }).getByRole("button", { name: copy.nav.home, exact: true })).toBeVisible();
    } else {
      await page.getByRole("button", { name: copy.nav.openNavigation, exact: true }).click();
      await expect(page.getByRole("navigation", { name: copy.nav.mobileNavigation }).getByRole("button", { name: copy.nav.home, exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("navigation", { name: copy.nav.mobileNavigation })).toHaveCount(0);
    }
    if ([390,768,1440,1920].includes(width)) {
      await page.screenshot({ path:`test-artifacts/ux-after/landing-${width}.png` });
      await page.locator("footer").scrollIntoViewIfNeeded();
      await page.screenshot({ path:`test-artifacts/ux-after/footer-${width}.png` });
      await page.evaluate(() => window.scrollTo({top:0,behavior:"instant"}));
    }
    measurements.push({ width, ...geometry });
  }
  await page.locator("footer").getByRole("link", { name: copy.public.about, exact: true }).click();
  await expect(page).toHaveURL(/\/#about$/);
  await page.locator("footer").getByRole("link", { name: copy.public.backToTop, exact: true }).click();
  await expect(page).toHaveURL(/\/#top$/);
  expect(errors).toEqual([]);
  writeFileSync("test-artifacts/ux-public-layout.json", JSON.stringify({ measurements, errors }, null, 2));
});

test("landing dropdowns open on hover and keyboard and every section link reaches its target", async ({ page }) => {
  await page.setViewportSize({ width:1440,height:1000 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name:copy.nav.primaryNavigation });
  await expect(nav.locator("button svg")).toHaveCount(0);
  const evidence: object[] = [];
  for (const [name,href] of [[copy.nav.resources,"/resources"],[copy.nav.opportunities,"/opportunities"],[copy.nav.services,"/services"]]) {
    await expect(nav.getByRole("link",{name,exact:true})).toHaveAttribute("href",href);
  }
  for (const name of [copy.nav.home,copy.nav.courses,copy.nav.masterclasses,copy.common.pricing]) {
    const trigger = nav.getByRole("button", {name,exact:true});
    await trigger.hover();
    await expect(trigger).toHaveAttribute("aria-expanded","true");
    const group = trigger.locator("..");
    const links = group.locator("ul a");
    await expect(links.first()).toBeVisible();
    const targets = await links.evaluateAll(items => items.map(item => item.getAttribute("href")!));
    for (const href of targets) {
      expect(href).toMatch(/^\/#/);
      await expect(page.locator(href.slice(1))).toHaveCount(1);
      await expect(trigger).toBeEnabled();
      await trigger.hover();
      await group.locator(`a[href="${href}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${href.replace("/", "\\/")}$`));
      await expect(trigger).toHaveAttribute("aria-expanded","false");
      await expect.poll(async () => (await page.locator(href.slice(1)).boundingBox())?.y).toBeGreaterThanOrEqual(79);
      await expect.poll(async () => (await page.locator(href.slice(1)).boundingBox())?.y).toBeLessThan(200);
      evidence.push({name,href,hash:new URL(page.url()).hash});
      await page.mouse.move(0,0);
    }
  }
  await page.mouse.move(0,0);
  const home = nav.getByRole("button", {name:copy.nav.home,exact:true});
  await home.focus(); await home.press("ArrowDown");
  await expect(nav.getByRole("link", {name:copy.nav.welcome,exact:true})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(home).toBeFocused(); await expect(home).toHaveAttribute("aria-expanded","false");
  await page.emulateMedia({reducedMotion:"reduce"});
  await home.hover();
  await expect(home).toHaveAttribute("aria-expanded","true");
  await expect(home.locator("..").locator("ul")).toBeVisible();
  await page.screenshot({path:"test-artifacts/ux-after/navigation-dropdown-1440.png"});
  await page.setViewportSize({width:390,height:1000});
  await page.getByRole("button",{name:copy.nav.openNavigation,exact:true}).click();
  const mobile = page.getByRole("navigation",{name:copy.nav.mobileNavigation});
  await mobile.getByRole("button",{name:copy.nav.home,exact:true}).click();
  await mobile.getByRole("link",{name:copy.public.about,exact:true}).click();
  await expect(page).toHaveURL(/\/#about$/);
  await expect(mobile).toHaveCount(0);
  await expect.poll(async () => (await page.locator("#about").boundingBox())?.y).toBeLessThan(160);
  await expect.poll(async () => (await page.locator("#about").boundingBox())?.y).toBeGreaterThanOrEqual(79);
  writeFileSync("test-artifacts/ux-navigation-dropdowns.json",JSON.stringify(evidence,null,2));
});

test("navigation hover underline and highlight animate without layout shift and respect reduced motion",async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/");
  const nav=page.getByRole("navigation",{name:copy.nav.primaryNavigation});
  const trigger=nav.getByRole("button",{name:copy.nav.courses,exact:true});
  const before=await trigger.boundingBox();
  await trigger.hover();
  await expect(trigger).toHaveAttribute("aria-expanded","true");
  await expect.poll(()=>trigger.evaluate(element=>getComputedStyle(element,"::after").transform)).toBe("matrix(1, 0, 0, 1, 0, 0)");
  const after=await trigger.boundingBox();
  expect(after?.width).toBe(before?.width);expect(after?.height).toBe(before?.height);
  const style=await trigger.evaluate(element=>({duration:getComputedStyle(element,"::after").transitionDuration,color:getComputedStyle(element).color,background:getComputedStyle(element).backgroundColor}));
  expect(style.duration).toBe("0.2s");
  await page.screenshot({path:"test-artifacts/ux-after/navigation-hover-1440.png"});
  await page.keyboard.press("Escape");await page.mouse.move(0,0);
  await page.emulateMedia({reducedMotion:"reduce"});
  await trigger.focus();await trigger.press("ArrowDown");
  await expect(trigger).toHaveAttribute("aria-expanded","true");
  const reducedDuration=await trigger.evaluate(element=>getComputedStyle(element,"::after").transitionDuration);
  expect(parseFloat(reducedDuration)).toBeLessThan(0.001);
  writeFileSync("test-artifacts/navigation-hover.json",JSON.stringify({before,after,style,reducedDuration},null,2));
});

test("section navigation waits for real course loading and works from other public pages",async ({page})=>{
  const api=process.env.GSP_E2E_API_URL!;
  let release!:()=>void, arrived!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const requested=new Promise<void>(resolve=>{arrived=resolve;});
  await page.route(`${api}/courses`,async route=>{arrived();await gate;await route.continue();});
  try {
    await page.setViewportSize({width:1440,height:1000});
    await page.goto("/");await requested;
    const nav=page.getByRole("navigation",{name:copy.nav.primaryNavigation});
    const button=nav.getByRole("button",{name:copy.nav.masterclasses,exact:true});
    await button.hover();
    await nav.getByRole("link",{name:copy.nav.sessionOverview,exact:true}).click();
    await expect(button).toHaveAttribute("aria-busy","true");
    await expect(page.locator("main")).toHaveAttribute("data-sections-ready","false");
    const response=page.waitForResponse(item=>new URL(item.url()).pathname==="/courses"&&item.request().method()==="GET");
    release();expect((await response).status()).toBe(200);
    await expect(page).toHaveURL(/\/#masterclasses$/);
    await expect.poll(async()=>(await page.locator("#masterclasses").boundingBox())?.y).toBeLessThan(160);
    await expect.poll(async()=>(await page.locator("#masterclasses").boundingBox())?.y).toBeGreaterThanOrEqual(79);
    await expect(button).toBeEnabled();
    await page.unroute(`${api}/courses`);
    for(const [name,href] of [[copy.nav.resources,"/resources"],[copy.nav.opportunities,"/opportunities"]]){
      await nav.getByRole("link",{name,exact:true}).click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      const home=page.getByRole("navigation",{name:copy.nav.primaryNavigation}).getByRole("button",{name:copy.nav.home,exact:true});
      await home.hover();await home.locator("..").getByRole("link",{name:copy.public.about,exact:true}).click();
      await expect(page).toHaveURL(/\/#about$/);
      await expect.poll(async()=>(await page.locator("#about").boundingBox())?.y).toBeLessThan(160);
      await expect.poll(async()=>(await page.locator("#about").boundingBox())?.y).toBeGreaterThanOrEqual(79);
    }
    await page.goBack();await expect(page).toHaveURL(/\/opportunities$/);
    await page.goForward();await expect(page).toHaveURL(/\/#about$/);
    await expect.poll(async()=>(await page.locator("#about").boundingBox())?.y).toBeLessThan(160);
    await nav.getByRole("link",{name:copy.nav.services,exact:true}).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("link",{name:copy.nav.brandHome,exact:true}).click();
    await expect(page).toHaveURL(/\/$/);
  }finally{release();}
});
