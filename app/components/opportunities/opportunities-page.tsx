"use client";

import Link from "next/link";

import { ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { OpportunityPageSkeleton } from "@/components/ui/page-skeleton";
import { useCopy } from "@/lib/copy/provider";
import { useOpportunitiesQuery } from "@/lib/queries/index";
import { LocalTime } from "@/components/ui/local-time";

const categories = ["All", "Scholarships", "Summer Programs", "Competitions", "Activity Building"] as const;

export default function OpportunitiesPage() {
	const { t } = useCopy();
	const [category, setCategory] = useState<(typeof categories)[number]>("All");
	const [search, setSearch] = useState("");
	const query = useOpportunitiesQuery();
	const opportunities = useMemo(() => query.data ?? [], [query.data]);

	const filtered = useMemo(() => {
		const text = search.trim().toLowerCase();
		return opportunities.filter((opportunity) => {
			const matchesCategory = category === "All" || opportunity.category === category;
			const matchesSearch = !text || `${opportunity.name} ${opportunity.description ?? ""} ${opportunity.category}`.toLowerCase().includes(text);
			return matchesCategory && matchesSearch;
		});
	}, [category, opportunities, search]);

	const statusLabel = (status: string) => (status === "Expired" ? t.opportunities.expired : status === "Expiring Soon" ? t.opportunities.expiringSoon : t.opportunities.open);

	if (query.isPending) return <main className="mx-auto min-h-screen max-w-6xl px-5 py-10 lg:px-8"><OpportunityPageSkeleton /></main>;

	return <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-10 lg:px-8 lg:py-12">
		<nav aria-label={t.common.breadcrumb} className="mb-5 text-sm text-text">{t.opportunities.title}</nav>
		<header className="mb-8"><h1 className="font-heading text-3xl font-semibold leading-tight text-text sm:text-4xl">{t.opportunities.title}</h1><p className="mt-2 text-base leading-6 text-text">{t.opportunities.pageDescription}</p></header>
		<div className="relative mb-4"><Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text" aria-hidden="true" /><label htmlFor="opportunity-search" className="sr-only">{t.opportunities.searchLabel}</label><input id="opportunity-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.opportunities.searchPlaceholder} className="field-input pl-11" /></div>
		<div className="mb-8 flex flex-wrap gap-2" role="group" aria-label={t.opportunities.categoriesLabel}>
			{categories.map((item) => <Button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`rounded-[8px] px-3.5 py-1.5 text-sm font-semibold transition-colors ${category === item ? "bg-primary text-white" : "border border-border bg-background text-text hover:bg-surface-alt"}`}>{t.opportunities.categoryLabels[item]}</Button>)}
		</div>
		{query.isError && <div role="alert" className="border border-border bg-surface-alt p-5 text-sm text-text"><p>{t.opportunities.temporarilyUnavailable}</p><Button type="button" onClick={() => void query.refetch()} className="mt-2 text-sm font-semibold text-primary">{t.common.retry}</Button></div>}
		{!query.isError && filtered.length === 0 && <p className="border border-border bg-surface-alt p-5 text-sm text-text">{opportunities.length === 0 ? t.opportunities.empty : `${t.opportunities.noSearchMatches} ${t.opportunities.freeLimitNote}`}</p>}
		{filtered.length > 0 && <div className="content-fade-in flex flex-col gap-4">{filtered.map((opportunity) => <article key={opportunity.id} className="card-interactive flex flex-col justify-between gap-5 rounded-[8px] border border-border bg-background p-5 sm:flex-row sm:items-center sm:p-6"><div className="min-w-0 flex-1"><h2 className="font-heading text-xl font-semibold text-text">{opportunity.name}</h2><p className="mt-1 text-sm leading-5 text-text">{opportunity.description || t.opportunities.fallbackDescription}</p><div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text"><span className="rounded-[8px] bg-surface-alt px-2.5 py-1 font-semibold text-primary">{t.opportunities.categoryLabels[opportunity.category as keyof typeof t.opportunities.categoryLabels] ?? opportunity.category}</span><span aria-hidden="true">•</span><span>{t.opportunities.deadline}: {opportunity.deadline ? <LocalTime value={opportunity.deadline} options={{ month: "long", day: "numeric", year: "numeric" }} /> : t.opportunities.rolling}</span><span className="rounded-[8px] border border-border px-2 py-1">{statusLabel(opportunity.status)}</span></div></div>{opportunity.locked ? <Link href="/signup" className="text-sm font-semibold text-primary hover:underline">{t.common.signupToContinue}</Link> : opportunity.external_link ? <a href={opportunity.external_link} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">{t.opportunities.viewDetails} <ExternalLink size={15} /></a> : <span className="shrink-0 text-sm text-text">{t.opportunities.linkComingSoon}</span>}</article>)}</div>}
	</main>;
}
