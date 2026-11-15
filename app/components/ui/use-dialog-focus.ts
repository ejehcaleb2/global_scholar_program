"use client";

import { useEffect, useRef } from "react";

/** Focus containment and restoration shared by modal drawers. */
export function useDialogFocus<T extends HTMLElement = HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selector = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]';
    const items = () => [...(ref.current?.querySelectorAll<HTMLElement>(selector) ?? [])].filter((item) => item.getClientRects().length > 0);
    const focus = () => (items()[0] ?? ref.current)?.focus();
    const isTopmost = () => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]');
      return dialogs.item(dialogs.length - 1) === ref.current;
    };
    // AnimatePresence mounts its child after the parent's render commits.
    const frame = requestAnimationFrame(focus);
    const onKey = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const list = items();
      const first = list[0]; const last = list.at(-1);
      if (!first) { event.preventDefault(); ref.current?.focus(); return; }
      if (!ref.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const onFocus = (event: FocusEvent) => {
      if (isTopmost() && ref.current && !ref.current.contains(event.target as Node)) focus();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      previous?.focus();
    };
  }, [open]);
  return ref;
}
