"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

export function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  const { t } = useCopy();
  const content = {
    saved: [CheckCircle2, t.admin.saveStatusSaved],
    dirty: [TriangleAlert, t.admin.saveStatusDirty],
    saving: [LoaderCircle, t.admin.saveStatusSaving],
    error: [AlertCircle, t.admin.saveStatusError],
  } as const;
  const [Icon, label] = content[status];
  return <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-sm text-text"><Icon size={16} aria-hidden="true" className={status === "saving" ? "motion-safe:animate-spin" : undefined} />{label}</span>;
}
