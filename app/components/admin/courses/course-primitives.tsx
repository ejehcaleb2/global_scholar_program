"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, MoreHorizontal, TriangleAlert } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import type { AdminCourse, AdminCourseReadiness } from "@/lib/api/index";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, StatusBadge } from "@/components/admin/ui/primitives";

export function CourseStatusBadge({ status }: { status: AdminCourse["status"] }) {
  const { t } = useCopy();
  return <StatusBadge status={status} label={status === "published" ? t.admin.statusPublished : t.admin.statusDraft} />;
}

export function AccessChip({ accessType }: { accessType: AdminCourse["access_type"] }) {
  const { t } = useCopy();
  return <span className="inline-flex min-h-8 items-center rounded-[8px] border border-border bg-surface-alt px-2.5 text-sm font-semibold text-text">{accessType === "free" ? t.admin.freeAccess : t.admin.membersOnly}</span>;
}

export { SaveStatusIndicator } from "@/components/ui/save-status";

export function TypedConfirmDialog({ open, title, description, expectedTitle, value, onChange, confirmLabel, cancelLabel, onConfirm, onClose, busy = false, requireTyping = true, confirmDisabled = false, children }: {
  open: boolean;
  title: string;
  description: string;
  expectedTitle: string;
  value: string;
  onChange: (value: string) => void;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  requireTyping?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
}) {
  const { t } = useCopy();
  return <ConfirmDialog open={open} title={title} description={description} confirmLabel={confirmLabel} cancelLabel={cancelLabel} destructive busy={busy} confirmDisabled={confirmDisabled || requireTyping && value !== expectedTitle} onConfirm={onConfirm} onClose={onClose}>
    {children}
    {requireTyping && <><label htmlFor="typed-confirm-title" className="mb-1 block text-sm font-semibold text-text">{t.admin.typeCourseTitle.replace("{title}", expectedTitle)}</label><input id="typed-confirm-title" value={value} onChange={(event) => onChange(event.target.value)} className="field-input" autoComplete="off" /></>}
  </ConfirmDialog>;
}

export type KebabAction = { id: string; label: string; icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>; onSelect: () => void; disabled?: boolean; disabledReason?: string; loading?: boolean };

export function KebabMenu({ label, actions }: { label: string; actions: KebabAction[] }) {
  const [open, setOpen] = useState(false);
  const { t } = useCopy();
  const busy = actions.some((action) => action.loading);
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); return; }
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])];
      const index = items.indexOf(document.activeElement as HTMLElement);
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && items.length) {
        event.preventDefault();
        const offset = event.key === "ArrowDown" ? 1 : -1;
        items[(index + offset + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return <div ref={rootRef} className="relative inline-flex"><Button type="button" aria-label={label} loading={busy} loadingLabel={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="h-10 w-10 rounded-[8px] border border-border text-text"><MoreHorizontal size={18} aria-hidden="true" /></Button>{open && <div ref={menuRef} role="menu" aria-label={label} className="absolute right-0 top-11 z-40 min-w-48 rounded-[8px] border border-border bg-background p-1">{actions.map(({ id, label: actionLabel, icon: Icon, onSelect, disabled, disabledReason, loading }) => <Button key={id} role="menuitem" type="button" title={disabled ? disabledReason ?? t.admin.boundaryAction : undefined} disabled={disabled} loading={loading} loadingLabel={actionLabel} onClick={() => { setOpen(false); onSelect(); }} className="w-full justify-start gap-2 rounded-[8px] px-3 text-sm text-text hover:bg-surface-alt"><Icon size={16} aria-hidden={true} />{actionLabel}</Button>)}</div>}</div>;
}

export function ReadinessChecklist({ readiness, onGoTo }: { readiness: AdminCourseReadiness; onGoTo: (check: AdminCourseReadiness["checks"][number]) => void }) {
  const { t } = useCopy();
  return <ul className="space-y-2">{readiness.checks.map((check) => <li key={check.key} className="flex items-start gap-3 border-b border-border py-3 last:border-0">{check.passed ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-status-success" aria-label={t.admin.checkPassed} /> : check.severity === "error" ? <AlertCircle size={16} className="mt-0.5 shrink-0 text-primary" aria-label={t.admin.checkError} /> : <TriangleAlert size={16} className="mt-0.5 shrink-0 text-text" aria-label={t.admin.checkWarning} />}<div className="min-w-0 flex-1"><p className="text-base text-text">{check.message}</p>{!check.passed && <Button type="button" onClick={() => onGoTo(check)} className="mt-1 min-h-9 rounded-[8px] px-2 text-sm font-semibold text-primary">{t.admin.goTo}</Button>}</div></li>)}</ul>;
}

export { useUnsavedChanges } from "@/components/ui/use-unsaved-changes";
