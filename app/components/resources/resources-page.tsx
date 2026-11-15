"use client";

import Link from "next/link";

import { FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/copy/provider";
import { useResourcesQuery } from "@/lib/queries/index";
import { ResourcePageSkeleton } from "@/components/ui/page-skeleton";

const categories = ["All", "Successful Essays", "African Case Studies", "SAT Resources", "How-To Guides"] as const;

type LoadState = "loading" | "ready" | "error";

export default function ResourcesPage() {
  const { t } = useCopy();
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [search, setSearch] = useState("");
  const query = useResourcesQuery(category === "All" ? undefined : category);
  const resources = useMemo(() => query.data ?? [], [query.data]);
  const state: LoadState = query.isPending ? "loading" : query.isError ? "error" : "ready";

  const filteredResources = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return resources;
    return resources.filter((resource) => `${resource.title} ${resource.description ?? ""}`.toLowerCase().includes(text));
  }, [resources, search]);
  if (state === "loading") return <main className="mx-auto min-h-screen max-w-6xl px-5 py-10 lg:px-8"><ResourcePageSkeleton /></main>;

  return <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-10 lg:px-8 lg:py-12">
    <nav aria-label={t.common.breadcrumb} className="mb-5 text-sm text-text">{t.resources.title}</nav>
    <header className="mb-8"><h1 className="font-heading text-3xl font-semibold leading-tight text-text sm:text-4xl">{t.resources.title}</h1><p className="mt-2 text-base leading-6 text-text">{t.resources.description}</p></header>
    <div className="relative mb-4"><Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text" aria-hidden="true" /><label htmlFor="resource-search" className="sr-only">{t.resources.searchLabel}</label><input id="resource-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.resources.searchPlaceholder} className="field-input pl-11" /></div>
    <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label={t.resources.categoriesLabel}>
      {categories.map((item) => <Button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`rounded-[8px] px-3.5 py-1.5 text-sm font-semibold transition-colors ${category === item ? "bg-primary text-white" : "border border-border bg-background text-text hover:bg-surface-alt"}`}>{t.resources.categoryLabels[item]}</Button>)}
    </div>
    {state === "error" && <p role="alert" className="border border-border bg-surface-alt p-5 text-sm text-text">{t.resources.temporarilyUnavailable}</p>}
    {state === "ready" && filteredResources.length === 0 && <p className="border border-border bg-surface-alt p-5 text-sm text-text">{t.resources.noSearchMatches}</p>}
    {state === "ready" && filteredResources.length > 0 && <div className="content-fade-in flex flex-col gap-4">{filteredResources.map((resource) => <article key={resource.id} className="card-interactive flex flex-col justify-between gap-5 rounded-[8px] border border-border bg-background p-5 sm:flex-row sm:items-center sm:p-6"><div className="flex min-w-0 items-start gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-surface-alt text-primary"><FileText size={21} aria-hidden="true" /></div><div className="min-w-0"><h2 className="font-heading text-xl font-semibold text-text">{resource.title}</h2><p className="mt-1 text-sm leading-5 text-text">{resource.description || t.resources.fallbackDescription}</p><span className="mt-3 inline-block rounded-[8px] bg-surface-alt px-2.5 py-1 text-xs font-semibold text-primary">{resource.category}</span></div></div>{resource.locked ? <Link href="/signup" className="text-sm font-semibold text-primary hover:underline">{t.common.signupToContinue}</Link> : resource.url ? <a href={resource.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">{t.resources.viewResource} <span aria-hidden="true">-&gt;</span></a> : <span className="shrink-0 text-sm text-text">{t.resources.linkComingSoon}</span>}</article>)}</div>}
  </main>;
}
