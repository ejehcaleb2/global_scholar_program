"use client";

import Link from "@/components/ui/pending-link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import { ApiError } from "@/lib/api/index";
import { useHomepagePostQuery } from "@/lib/queries/posts";
import { Button } from "@/components/ui/button";
import { PublicationContent } from "./publication-content";
import { LocalTime } from "@/components/ui/local-time";
import { MediaImage } from "@/components/ui/media-image";
import { useToast } from "@/components/ui/toast-provider";

export default function PublicPostPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useCopy();
  const { addToast } = useToast();
  const query = useHomepagePostQuery(id);
  const post = query.data;
  const missing = query.error instanceof ApiError && [404, 422].includes(query.error.status);
  const recovery = useMutation({
    mutationFn: async () => {
      const result = await query.refetch();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => addToast(t.posts.loadedTitle, t.posts.loadedDescription, "success"),
    onError: () => addToast(t.posts.loadErrorTitle, t.posts.loadErrorDescription, "error"),
  });
  const title = post?.title ?? (query.isPending ? t.posts.loading : missing ? t.posts.notFoundTitle : t.posts.loadErrorTitle);

  useEffect(() => {
    document.title = t.posts.titleTemplate.replace("{title}", title);
  }, [title, t.posts.titleTemplate]);

  const backLink = <Link href="/#updates" className="inline-flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-base font-semibold text-primary transition-colors duration-200 ease-out hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ArrowLeft size={16} aria-hidden="true" />{t.posts.backToUpdates}</Link>;

  if (query.isPending && !recovery.isPending) return <main className="mx-auto min-h-[60vh] max-w-3xl space-y-5 px-5 py-12" role="status" aria-label={t.posts.loading} aria-busy="true"><div className="h-5 w-40 motion-safe:animate-pulse rounded-[8px] bg-surface-alt" /><div className="h-12 w-3/4 motion-safe:animate-pulse rounded-[8px] bg-surface-alt" /><div className="aspect-[16/7] motion-safe:animate-pulse rounded-[8px] bg-surface-alt" /><div className="h-60 motion-safe:animate-pulse rounded-[8px] bg-surface-alt" /></main>;

  if (recovery.isPending || query.isError || !post) return <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-5 py-16 text-center"><FileText size={20} className="text-primary" aria-hidden="true" /><div role={missing ? undefined : "alert"}><h1 className="mt-4 font-heading text-3xl text-text">{missing ? t.posts.notFoundTitle : t.posts.loadErrorTitle}</h1><p className="mt-3 max-w-xl text-base leading-7 text-text">{missing ? t.posts.notFoundDescription : t.posts.loadErrorDescription}</p></div><div className="mt-6 flex flex-wrap items-center justify-center gap-3">{!missing && <Button variant="primary" size="md" loading={recovery.isPending} loadingLabel={t.common.retry} onClick={() => recovery.mutate()} className="rounded-[8px]">{t.common.retry}</Button>}{backLink}</div></main>;

  const hasBody = post.body_html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/gi, " ").trim().length > 0;
  return <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 lg:py-14">
    <article>
      {backLink}
      <header className="mt-7 border-b border-border pb-7">
        <p className="eyebrow">{t.landing.gspUpdate}</p>
        <h1 className="mt-3 break-words font-heading text-3xl leading-tight text-text sm:text-4xl">{post.title}</h1>
        {post.published_at && <p className="mt-3 text-base text-text">{t.posts.published} <LocalTime value={post.published_at} options={{ dateStyle: "long" }} /></p>}
        {post.summary && <p className="mt-5 break-words text-lg leading-7 text-text">{post.summary}</p>}
      </header>
      {post.thumbnail_url && <MediaImage src={post.thumbnail_url} alt="" fill sizes="(max-width: 896px) 100vw, 832px" className="object-cover" wrapperClassName="relative block mt-8 aspect-[16/7] overflow-hidden rounded-[8px] border border-border" priority />}
      {hasBody || post.sections?.length ? <PublicationContent body={post.body_html} sections={post.sections ?? []} title={post.title} /> : <p className="mt-8 rounded-[8px] border border-border bg-surface-alt p-5 text-base text-text">{t.posts.emptyBody}</p>}
    </article>
  </main>;
}
