"use client";

import type { ReactNode } from "react";
import { useDialogFocus } from "@/components/ui/use-dialog-focus";

/** Shared modal detail/editor surface; callers provide their labelled controls. */
export function AdminDrawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useDialogFocus(open, onClose);
  if (!open) return null;
  return <div role="presentation" className="fixed inset-0 z-[80] flex justify-end bg-text/30" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-5 sm:p-7">{children}</aside>
  </div>;
}
