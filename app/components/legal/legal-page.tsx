"use client";

import { APP_LOCALE, useCopy } from "@/lib/copy/provider";
import { useLegalQuery } from "@/lib/queries/index";
import { ApiError } from "@/lib/api/index";
import { Button } from "@/components/ui/button";
import { RichContent } from "@/components/ui/rich-content";
import { SkeletonBlock } from "@/components/ui/page-skeleton";

export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const { t } = useCopy();
  const query = useLegalQuery(kind);
  const title = kind === "terms" ? t.public.terms : t.public.privacy;
  return <article className="mx-auto max-w-4xl px-5 py-8 lg:px-10 lg:py-10">
    <h1 className="mb-5 font-heading text-3xl text-text">{title}</h1>
    {query.isPending && !query.data ? <div role="status" aria-label={t.nav.loadingApp}><SkeletonBlock className="h-10 w-full" /><SkeletonBlock className="mt-5 h-40 w-full" /></div> : query.isError && !query.data ? <div role="alert"><p>{query.error instanceof ApiError && query.error.status === 404 ? t.common.legalNotFound : t.common.legalError}</p><Button type="button" onClick={() => query.refetch()} className="mt-4 min-h-11 rounded-[8px] border border-border px-4 text-primary">{t.common.retry}</Button></div> : query.data ? <>
      {query.data.review_pending && <p role="status" className="mb-5 rounded-[8px] border border-border bg-surface-alt p-3 text-base text-text">{t.common.legalPending}</p>}
      <p className="mb-5 text-sm text-text">{t.common.legalVersion} {query.data.version} · {t.common.legalEffective} {new Intl.DateTimeFormat(APP_LOCALE, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${query.data.effective_date}T00:00:00Z`))}</p>
      <RichContent html={query.data.html} />
    </> : <p>{t.common.legalNotFound}</p>}
  </article>;
}
