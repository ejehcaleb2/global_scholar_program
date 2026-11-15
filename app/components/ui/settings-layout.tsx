"use client";

import type { ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useCopy } from "@/lib/copy/provider";
import { Button } from "@/components/ui/button";
import { SkeletonBlock } from "@/components/ui/page-skeleton";

export function SettingsHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="mb-8 border-b border-border pb-6"><p className="text-sm font-semibold text-primary">{eyebrow}</p><h1 className="mt-2 font-heading text-3xl leading-tight text-text">{title}</h1><p className="mt-2 max-w-2xl text-base text-text">{description}</p></header>;
}

export function SettingsSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="border-b border-border pb-8 last:border-0"><h2 id={id} className="font-heading text-2xl text-text">{title}</h2>{description && <p className="mt-2 max-w-2xl text-base text-text">{description}</p>}<div className="mt-5">{children}</div></section>;
}

export function SettingsLoading() {
  const { t } = useCopy();
  return <div className="space-y-6" role="status" aria-label={t.profile.loadingSettings} aria-busy="true"><SkeletonBlock className="h-8 w-52" /><SkeletonBlock className="h-5 w-80 max-w-full" /><SkeletonBlock className="h-48 border border-border bg-background" /><SkeletonBlock className="h-56 border border-border bg-background" /></div>;
}

// Keep the clicked Retry mounted while a query with no cached data becomes pending.
export function useSettingsRetry(onRetry: () => Promise<unknown>) {
  return useMutation({ mutationFn: onRetry });
}

export function SettingsLoadError({ onRetry, message, loading = false }: { onRetry: () => void; message: string; loading?: boolean }) {
  const { t } = useCopy();
  return <div className="rounded-[8px] border border-border bg-surface-alt p-5" role="alert"><p className="text-base text-text">{message}</p><Button type="button" variant="secondary" size="md" loading={loading} loadingLabel={t.common.retry} onClick={onRetry} className="mt-4 rounded-[8px]">{t.common.retry}</Button></div>;
}
