"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCopy } from "@/lib/copy/provider";
import { ApiError, getApiErrorMessage } from "@/lib/api/index";
import { useToast } from "@/components/ui/toast-provider";
import { ConfirmDialog, StaleChangeDialog } from "@/components/admin/ui/primitives";

/** One explicit discard/conflict contract for the content editors. */
export function useEditSafety<D>({ draft, setDraft, initial, loadLatest }: {
  draft: D;
  setDraft: (value: D) => void;
  initial: D;
  loadLatest: () => Promise<{ draft: D; revision?: string }>;
}) {
  const { t } = useCopy();
  const router = useRouter();
  const { addToast } = useToast();
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [revision, setRevision] = useState<string>();
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [stale, setStale] = useState(false);
  const [resolving, setResolving] = useState<"keep" | "load" | null>(null);
  const dirty = JSON.stringify(draft) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.origin !== window.location.origin || anchor.pathname === window.location.pathname && anchor.search === window.location.search) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPendingAction(() => () => router.push(`${anchor.pathname}${anchor.search}${anchor.hash}`));
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", navigate, true); };
  }, [dirty, router]);
  function begin(value: D, updatedAt?: string) {
    setDraft(value);
    setBaseline(JSON.stringify(value));
    setRevision(updatedAt);
  }
  function request(action: () => void) {
    if (dirty) setPendingAction(() => action);
    else action();
  }
  async function resolve(keep: boolean) {
    if (resolving) return;
    setResolving(keep ? "keep" : "load");
    try {
      const latest = await loadLatest();
      setRevision(latest.revision);
      setBaseline(JSON.stringify(latest.draft));
      if (!keep) setDraft(latest.draft);
      setStale(false);
    } catch (error) {
      addToast(t.admin.loadRecordsError, getApiErrorMessage(error, t.admin.loadRecordsError), "error");
    } finally { setResolving(null); }
  }
  function handleError(error: unknown) {
    if (error instanceof ApiError && error.status === 409 && error.message.includes('stale_version')) {
      setStale(true);
      return true;
    }
    return false;
  }
  return {
    revision, dirty, begin, request, handleError,
    dialogs: <>
      <ConfirmDialog open={Boolean(pendingAction)} title={t.admin.discardTitle} description={t.admin.discardDescription} confirmLabel={t.admin.discardAction} cancelLabel={t.admin.keepEditing} onClose={() => setPendingAction(null)} onConfirm={() => { const action = pendingAction; setPendingAction(null); action?.(); }} />
      <StaleChangeDialog open={stale} title={t.admin.staleRecordTitle} description={t.admin.staleChangeDescription} loadLatestLabel={t.admin.loadLatest} keepEditsLabel={t.admin.keepMyEdits} busy={Boolean(resolving)} keepEditsBusy={resolving === "keep"} onDismiss={() => setStale(false)} onLoadLatest={() => void resolve(false)} onKeepEdits={() => void resolve(true)} />
      {resolving && <p role="status" aria-live="polite" className="text-sm text-text">{t.admin.refreshing}</p>}
    </>,
  };
}
