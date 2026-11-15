"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useUnsavedChanges(dirty: boolean, prompt: string, onSave?: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const inAppNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (window.confirm(prompt)) router.push(`${anchor.pathname}${anchor.search}${anchor.hash}`);
    };
    const saveShortcut = (event: KeyboardEvent) => {
      if (onSave && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); onSave?.(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", inAppNavigation, true);
    window.addEventListener("keydown", saveShortcut);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", inAppNavigation, true);
      window.removeEventListener("keydown", saveShortcut);
    };
  }, [dirty, onSave, prompt, router]);
}