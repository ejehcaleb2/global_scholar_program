import { expect, type Page } from "@playwright/test";

type Mode = "ready" | "error-first" | "hold";
declare global {
  interface Window {
    __uxVideoMode?: Mode;
    __uxVideoAttempts?: number;
    __uxVideoRelease?: () => void;
  }
}

/** Only provider responses are fixtures; content, auth and mutations use the API. */
export async function installVideoFixtures(page: Page, mode: Mode = "ready") {
  await page.addInitScript((initial) => { window.__uxVideoMode = initial; }, mode);
  await page.route(/^https:\/\/www\.youtube-nocookie\.com\/embed\/(abcdefghijk|dQw4w9WgXcQ)(?:\?|$)/, route => route.fulfill({
    status: 200, contentType: "text/html", body: "<!doctype html><html><body>Provider video fixture</body></html>",
  }));
  await page.route("https://www.youtube.com/iframe_api", route => route.fulfill({
    contentType: "application/javascript",
    body: `window.YT={Player:class {
      constructor(frame, options){this.frame=frame;window.__uxVideoAttempts=(window.__uxVideoAttempts||0)+1;
        if(window.__uxVideoMode==='error-first'&&window.__uxVideoAttempts===1)queueMicrotask(()=>options.events.onError({data:153}));
        else if(window.__uxVideoMode==='ready')queueMicrotask(()=>options.events.onReady());
        else {this.release=()=>options.events.onReady();window.__uxVideoRelease=this.release;}}
      destroy(){if(window.__uxVideoRelease===this.release)delete window.__uxVideoRelease;this.frame.remove();}
    }};window.onYouTubeIframeAPIReady?.();`,
  }));
  await page.route("https://player.vimeo.com/video/12345678*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Vimeo fixture</body></html>" }));
  await page.route("https://player.vimeo.com/api/player.js", route => route.fulfill({
    contentType: "application/javascript", body: "window.Vimeo={Player:class {constructor(frame){this.frame=frame;}ready(){return Promise.resolve();}on(){}destroy(){this.frame.remove();return Promise.resolve();}}};",
  }));
}

export async function releaseVideo(page: Page) {
  await expect.poll(() => page.evaluate(() => typeof window.__uxVideoRelease === "function")).toBe(true);
  await page.evaluate(() => { const release = window.__uxVideoRelease; delete window.__uxVideoRelease; release?.(); });
}
