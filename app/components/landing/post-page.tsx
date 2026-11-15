"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import { getHomepagePost } from "@/lib/api/index";
import { RichContent } from "@/components/ui/rich-content";
import { LocalTime } from "@/components/ui/local-time";
import { MediaImage } from "@/components/ui/media-image";

export default function PublicPostPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useCopy();
  const query = useQuery({ queryKey: ["public", "homepage-post", id], queryFn: () => getHomepagePost(id), enabled: Boolean(id) });
  const post = query.data;

  useEffect(() => {
    document.title = post ? `${post.title} | Global Scholars Program` : `${t.admin.notFound} | Global Scholars Program`;
  }, [post, t.admin.notFound]);

  if (query.isLoading) return <main className="mx-auto min-h-[60vh] max-w-3xl animate-pulse space-y-5 px-5 py-12" aria-busy="true"><div className="h-5 w-40 rounded-[8px] bg-surface-alt" /><div className="h-12 w-3/4 rounded-[8px] bg-surface-alt" /><div className="aspect-[16/7] rounded-[8px] bg-surface-alt" /><div className="h-60 rounded-[8px] bg-surface-alt" /></main>;

  if (query.isError || !post) return <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-5 py-16 text-center"><FileText size={30} className="text-primary" aria-hidden="true" /><h1 className="mt-4 font-heading text-3xl text-text">{t.admin.notFound}</h1><p className="mt-3 text-base text-text">{t.admin.notFound}</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-5 text-base font-semibold text-white"><ArrowLeft size={17} aria-hidden="true" />{t.admin.dashboardLink}</Link></main>;

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 lg:py-14">
      <article>
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-base font-semibold text-primary transition-colors duration-200 ease-out hover:bg-surface-alt"><ArrowLeft size={18} aria-hidden="true" />{t.nav.dashboard}</Link>
        <header className="mt-7 border-b border-border pb-7">
          <h1 className="font-heading text-3xl leading-tight text-text sm:text-4xl">{post.title}</h1>
          {post.published_at && <p className="mt-3 text-base text-text"><LocalTime value={post.published_at} options={{ dateStyle: "long" }} /></p>}
          {post.summary && <p className="mt-5 text-lg leading-7 text-text">{post.summary}</p>}
        </header>
        <MediaImage src={post.thumbnail_url} alt="" fill sizes="(max-width: 896px) 100vw, 832px" className="object-cover" wrapperClassName="relative mt-8 aspect-[16/7] overflow-hidden rounded-[8px] border border-border" priority />
        <RichContent html={post.body_html} className="mt-8" />
      </article>
    </main>
  );
}