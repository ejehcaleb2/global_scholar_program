"use client";


import { Button } from "@/components/ui/button";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type ReactNode } from "react";
import { useDialogFocus } from "@/components/ui/use-dialog-focus";
import { AlertCircle, FileText } from "lucide-react";

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-heading text-3xl leading-tight text-text">{title}</h1>
        <p className="mt-2 max-w-3xl text-base leading-6 text-text">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

export function DataTable({
  columns,
  children,
  isLoading = false,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
  retryLabel,
  retrying = false,
  retryingLabel,
  stacked,
  isEmpty = false,
  skeletonRows = 5,
}: {
  columns: string[];
  children: ReactNode;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  retryLabel: string;
  retrying?: boolean;
  retryingLabel?: string;
  stacked?: ReactNode;
  isEmpty?: boolean;
  skeletonRows?: number;
}) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-border bg-background">
      {error ? (
        <div role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 px-5 text-center">
          <AlertCircle className="text-primary" aria-hidden="true" />
          <p className="text-base text-text">{error}</p>
          {onRetry && <Button type="button" onClick={onRetry} loading={retrying} loadingLabel={retryingLabel ?? retryLabel} title={retrying ? retryingLabel ?? retryLabel : undefined} className="min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-primary transition-colors duration-200 ease-out hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{retryLabel}</Button>}
        </div>
      ) : stacked ? (
        isLoading ? <div className="space-y-3 p-4" aria-busy="true">{Array.from({ length: skeletonRows }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-[8px] bg-surface-alt" />)}</div>
          : isEmpty ? <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} /> : stacked
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead className="bg-surface-alt">
              <tr>{columns.map((column) => <th key={column} scope="col" className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-text">{column}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: skeletonRows }, (_, index) => <tr key={index} aria-hidden="true"><td colSpan={columns.length} className="px-4 py-4"><div className="h-6 animate-pulse rounded-[8px] bg-surface-alt" /></td></tr>)
                : isEmpty ? null : children}
            </tbody>
          </table>
          {!isLoading && !error && isEmpty && <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} icon={FileText} />}
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ label, status }: { label: string; status: string }) {
  const colorClass = status === "returned" || status === "published"
    ? "border-status-success/30 bg-status-success/10 text-status-success"
    : status === "submitted" || status === "in_progress"
      ? "border-primary/30 bg-primary/5 text-primary"
      : "border-border bg-surface-alt text-text";
  return <span className={`inline-flex min-h-8 items-center whitespace-nowrap rounded-[8px] border px-2.5 text-sm font-semibold ${colorClass}`}>{label}</span>;
}

export function SwitchToggle({
  checked,
  onChange,
  label,
  disabled = false,
  loading = false,
  disabledReason,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  loading?: boolean;
  disabledReason?: string;
}) {
  return (
    <Button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      loading={loading}
      loadingLabel={label}
      title={disabled ? disabledReason : undefined}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-11 min-w-11 items-center justify-center rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={`relative h-6 w-11 rounded-full border border-border transition-colors duration-200 ease-out ${checked ? "bg-primary" : "bg-surface-alt"}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full border border-border bg-background transition-transform duration-200 ease-out ${checked ? "translate-x-5" : "translate-x-0"} ${loading ? "opacity-60" : ""}`} />
      </span>
    </Button>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = FileText,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: typeof FileText;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center">
      <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
      <h2 className="mt-3 text-lg font-semibold text-text">{title}</h2>
      {description && <p className="mt-1 max-w-lg text-base leading-6 text-text">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  subtext,
  isLoading = false,
}: {
  label: string;
  value?: number;
  subtext?: string;
  isLoading?: boolean;
}) {
  return (
    <section className="min-h-32 rounded-[8px] border border-border bg-background p-5 transition-colors duration-200 ease-out hover:border-primary/50" aria-busy={isLoading}>
      <h2 className="text-sm font-semibold text-text">{label}</h2>
      {isLoading ? <div className="mt-3 h-9 w-20 animate-pulse rounded-[8px] bg-surface-alt" /> : <p className="mt-2 font-heading text-3xl text-primary">{value ?? 0}</p>}
      {isLoading ? <div className="mt-2 h-5 w-36 animate-pulse rounded-[8px] bg-surface-alt" /> : subtext && <p className="mt-1 text-sm text-text">{subtext}</p>}
    </section>
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-base font-semibold text-text">{label}{required && <span aria-hidden="true"> *</span>}</label>
      {children}
      {hint && <p id={`${htmlFor}-hint`} className="text-sm text-text">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  onEscape,
  destructive = false,
  busy = false,
  cancelLoading = false,
  confirmDisabled = false,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  onEscape?: () => void;
  destructive?: boolean;
  busy?: boolean;
  cancelLoading?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>(open, () => { if (!busy) (onEscape ?? onClose)(); });
  const reducedMotion = useReducedMotion();



  return (
    <AnimatePresence>
      {open && <motion.div className="fixed inset-0 z-[90] flex items-center justify-center bg-text/30 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}>
        <motion.div ref={dialogRef} tabIndex={-1} role={children ? "dialog" : "alertdialog"} aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[8px] border border-border bg-background p-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}>
          <h2 id="confirm-title" className="font-heading text-2xl text-text">{title}</h2>
          <p id="confirm-description" className="mt-3 text-base leading-6 text-text">{description}</p>
          {children && <div className="mt-5">{children}</div>}
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" onClick={onClose} disabled={busy} title={busy ? confirmLabel : undefined} loading={cancelLoading} loadingLabel={cancelLabel} className="min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-text transition-colors duration-200 ease-out hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{cancelLabel}</Button>
            <Button type="button" onClick={onConfirm} disabled={confirmDisabled || busy} title={confirmDisabled ? description : undefined} loading={busy && !cancelLoading} loadingLabel={confirmLabel} className={`inline-flex min-h-11 items-center gap-2 rounded-[8px] px-4 text-sm font-semibold text-white transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${destructive ? "bg-text" : "bg-primary"}`}>
              {confirmLabel}
            </Button>
          </div>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  );
}

export function StaleChangeDialog({
  open,
  title,
  description,
  loadLatestLabel,
  keepEditsLabel,
  onLoadLatest,
  onKeepEdits,
  onDismiss,
  busy = false,
  keepEditsBusy = false,
}: {
  open: boolean;
  title: string;
  description: string;
  loadLatestLabel: string;
  keepEditsLabel: string;
  onLoadLatest: () => void;
  onKeepEdits: () => void;
  onDismiss?: () => void;
  busy?: boolean;
  keepEditsBusy?: boolean;
}) {
  return <ConfirmDialog open={open} title={title} description={description} confirmLabel={loadLatestLabel} cancelLabel={keepEditsLabel} busy={busy} cancelLoading={keepEditsBusy} onConfirm={onLoadLatest} onClose={onKeepEdits} onEscape={onDismiss ?? onKeepEdits} />;
}
