"use client";

const nextLayout = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

async function waitForSections() {
  const main = document.querySelector<HTMLElement>("[data-sections-ready]");
  if (!main || main.dataset.sectionsReady === "true") return;
  await new Promise<void>((resolve,reject) => {
    const observer = new MutationObserver(() => {
      if (!main.isConnected || main.dataset.sectionsReady === "true") { cleanup(); resolve(); }
    });
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("section_layout_timeout")); },15000);
    function cleanup() { observer.disconnect(); clearTimeout(timeout); }
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["data-sections-ready"]});
  });
}

// Call after closing a disclosure/mobile header. Async content above the target
// and the expanded mobile header must settle before its position is measured.
export async function scrollToLandingSection(hash: string, updateHistory = false) {
  if (!hash.startsWith("#") || hash.length < 2) return;
  const main = document.querySelector<HTMLElement>("[data-sections-ready]");
  if (updateHistory && main) main.dataset.sectionNavigationPending = "true";
  try {
  await waitForSections();
  await nextLayout();
  if (window.location.pathname !== "/") return;
  const target = document.getElementById(decodeURIComponent(hash.slice(1)));
  if (!target) throw new Error("section_not_found");
  if (updateHistory && window.location.hash !== hash) window.history.pushState(null,"",hash);
  const header = document.querySelector<HTMLElement>("[data-site-header]");
  const offset = (header?.getBoundingClientRect().height ?? 0) + 24;
  const top = Math.max(0,window.scrollY + target.getBoundingClientRect().top - offset);
  window.scrollTo({top,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
  } finally {
    if (updateHistory && main) delete main.dataset.sectionNavigationPending;
  }
}
