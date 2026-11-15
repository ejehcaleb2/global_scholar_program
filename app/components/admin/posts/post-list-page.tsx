"use client";


import { useAdminFilter } from "@/lib/queries/use-admin-filter";
import { getAdminContentPage } from "@/lib/api/pagination";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { MediaImage } from "@/components/ui/media-image";
import Link from "@/components/ui/pending-link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, FileText, Plus } from "lucide-react";

import { useCopy } from "@/lib/copy/provider";
import { useToast } from "@/components/ui/toast-provider";
import { AdminPageHeader, DataTable, StatusBadge, SwitchToggle } from "@/components/admin/ui/primitives";
import {
  getApiErrorMessage,
  reorderAdminHomepagePosts,
  updateAdminHomepagePost,
  type HomepagePost,
} from "@/lib/api/index";

type StatusFilter = "all" | "published" | "draft";

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
}

export default function HomepagePostsPage() {
  const { t } = useCopy();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useAdminFilter("status", "all", ["all", "published", "draft"] as const);
  const [pageValue, setPageValue] = useAdminFilter<string>("page", "1");
  const page = Math.max(1, Number(pageValue) || 1);
  function setPage(next: number | ((value: number) => number)) { setPageValue(String(typeof next === "function" ? next(page) : next)); }
  const pageSize = 10;
  const status = filter === "all" ? undefined : filter;
  const listQuery = useQuery({ queryKey: ["admin", "homepage-posts", { status, page }], queryFn: () => getAdminContentPage<HomepagePost>("homepage-posts", { status, limit: pageSize, offset: (page - 1) * pageSize }) });
  const allQuery = useQuery({ queryKey: ["admin", "homepage-posts", { status: undefined }], queryFn: async () => (await getAdminContentPage<HomepagePost>("homepage-posts", { pinned: true, limit: 3 })).items });
  const posts = listQuery.data?.items ?? [];
  const allPosts = allQuery.data ?? [];
  const pinnedPosts = allPosts.filter((post) => post.pinned).sort((left, right) => (left.pin_order ?? 0) - (right.pin_order ?? 0));
  const pageCount = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / pageSize));
  const pageRows = posts;

  function invalidateAdmin() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "homepage-posts"] });
    void queryClient.invalidateQueries({ queryKey: ["public", "homepage-posts"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  }

  const pinMutation = useMutation({
    mutationFn: ({ post, pinned }: { post: HomepagePost; pinned: boolean }) => updateAdminHomepagePost(post.id, { pinned, expected_updated_at: post.updated_at }),
    onMutate: async ({ post, pinned }) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "homepage-posts"] });
      const previous = queryClient.getQueriesData<HomepagePost[]>({ queryKey: ["admin", "homepage-posts"] });
      queryClient.setQueriesData<HomepagePost[]>({ queryKey: ["admin", "homepage-posts"] }, (current) => Array.isArray(current) ? current.map((entry) => entry.id === post.id ? { ...entry, pinned, pin_order: pinned ? Math.max(0, ...allPosts.map((item) => item.pin_order ?? 0)) + 1 : null } : entry) : current);
      return { previous };
    },
    onError: (error, _variables, context) => {
      context?.previous.forEach(([key, value]) => queryClient.setQueryData(key, value));
      addToast(t.admin.saveFailed, getApiErrorMessage(error, t.admin.saveFailed), "error");
    },
    onSuccess: () => addToast(t.admin.pinSaved, t.admin.pinSaved, "success"),
    onSettled: invalidateAdmin,
  });

  const reorderMutation = useMutation({
    mutationFn: reorderAdminHomepagePosts,
    onSuccess: () => {
      addToast(t.admin.pinOrderSaved, t.admin.pinOrderSaved, "success");
      invalidateAdmin();
    },
    onError: (error) => addToast(t.admin.saveFailed, getApiErrorMessage(error, t.admin.saveFailed), "error"),
  });

  const filterButtons: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: t.admin.allPosts },
    { value: "published", label: t.admin.publishedPosts },
    { value: "draft", label: t.admin.draftPosts },
  ];

  function movePin(post: HomepagePost, direction: -1 | 1) {
    const index = pinnedPosts.findIndex((entry) => entry.id === post.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= pinnedPosts.length) return;
    const reordered = [...pinnedPosts];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    reorderMutation.mutate(reordered.map((entry) => entry.id));
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 lg:px-10">
      <AdminPageHeader
        title={t.admin.homepageContent}
        description={t.admin.homepageSubtitle}
        actions={<Link href="/admin/homepage-posts/new" className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-4 text-base font-semibold text-white transition-colors duration-200 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Plus size={18} aria-hidden="true" />{t.admin.newPost}</Link>}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label={t.admin.status} className="inline-flex rounded-[8px] border border-border bg-background p-1">
          {filterButtons.map((button) => <Button key={button.value} type="button" aria-pressed={filter === button.value} onClick={() => { setFilter(button.value); setPage(1); }} className={`min-h-10 rounded-[8px] px-4 text-sm font-semibold transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${filter === button.value ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}>{button.label}</Button>)}
        </div>
        {listQuery.isError && <Button type="button" onClick={() => void listQuery.refetch()} className="min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-primary">{t.admin.retry}</Button>}
      </div>

      <DataTable
        columns={[t.admin.post, t.admin.status, t.admin.pinnedColumn, t.admin.date, t.admin.actions]}
        isLoading={listQuery.isLoading}
        error={listQuery.isError ? t.admin.postsLoadError : null}
        onRetry={() => void listQuery.refetch()}
        retryLabel={t.admin.retry}
        isEmpty={!listQuery.isLoading && !listQuery.isError && pageRows.length === 0}
        emptyTitle={t.admin.noPosts}
        emptyDescription={t.admin.noPostsDescription}
        emptyAction={<Link href="/admin/homepage-posts/new" className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-semibold text-white"><Plus size={16} aria-hidden="true" />{t.admin.newPost}</Link>}
        skeletonRows={5}
      >
        {pageRows.map((post) => {
          const pinIndex = pinnedPosts.findIndex((entry) => entry.id === post.id);
          const pinDisabled = post.status === "draft" || (!post.pinned && pinnedPosts.length >= 3);
          const disabledReason = post.status === "draft" ? t.admin.draftCannotPin : t.admin.unpinFirst;
          return (
            <tr key={post.id} className="transition-colors duration-200 ease-out hover:bg-surface-alt">
              <td className="min-w-[340px] max-w-[560px] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {post.thumbnail_url
                    ? <MediaImage src={post.thumbnail_url} alt="" fill sizes="44px" className="object-cover" wrapperClassName="relative h-11 w-11 shrink-0 overflow-hidden rounded-[8px] border border-border" />
                    : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-border"><FileText size={19} className="text-text" aria-hidden="true" /></span>}
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-text">{post.title}</p>
                    <p className="truncate text-sm text-text">{post.summary || t.admin.noSummary}</p>
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3"><StatusBadge label={post.status === "published" ? t.admin.publishedStatus : t.admin.draftStatus} status={post.status} /></td>
              <td className="whitespace-nowrap px-4 py-3">
                <div className="flex items-center gap-2">
                  <SwitchToggle checked={post.pinned} onChange={(pinned) => pinMutation.mutate({ post, pinned })} label={interpolate(post.pinned ? t.admin.unpinPost : t.admin.pinPost, { title: post.title })} loading={pinMutation.isPending && pinMutation.variables?.post.id === post.id} disabled={pinDisabled || (pinMutation.isPending && pinMutation.variables?.post.id === post.id)} disabledReason={disabledReason} />
                  {post.pinned && <><span className="inline-flex h-8 min-w-8 items-center justify-center rounded-[8px] border border-border px-2 text-sm font-semibold text-text" aria-label={interpolate(t.admin.pinOrder, { order: post.pin_order ?? pinIndex + 1 })}>{post.pin_order ?? pinIndex + 1}</span>{pinnedPosts.length > 1 && <span className="inline-flex items-center gap-1"><Button loading={reorderMutation.isPending && reorderMutation.variables?.includes(post.id)} loadingLabel={t.admin.pinOrderSaved} type="button" onClick={() => movePin(post, -1)} title={pinIndex === 0 ? t.admin.boundaryAction : t.admin.saving} disabled={pinIndex === 0 || reorderMutation.isPending} aria-label={interpolate(t.admin.orderUp, { title: post.title })} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border text-primary transition-colors duration-200 ease-out hover:bg-surface-alt disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ArrowUp size={16} aria-hidden="true" /></Button><Button loading={reorderMutation.isPending && reorderMutation.variables?.includes(post.id)} loadingLabel={t.admin.pinOrderSaved} type="button" onClick={() => movePin(post, 1)} title={pinIndex === pinnedPosts.length - 1 ? t.admin.boundaryAction : t.admin.saving} disabled={pinIndex === pinnedPosts.length - 1 || reorderMutation.isPending} aria-label={interpolate(t.admin.orderDown, { title: post.title })} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border text-primary transition-colors duration-200 ease-out hover:bg-surface-alt disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ArrowDown size={16} aria-hidden="true" /></Button></span>}</>}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-base text-text">{post.status === "draft" || !post.published_at ? "—" : <LocalTime value={post.published_at} options={{ dateStyle: "medium" }} />}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right"><Link href={`/admin/homepage-posts/${post.id}/edit`} aria-label={interpolate(t.admin.editPost, { title: post.title })} className="inline-flex min-h-11 items-center justify-center rounded-[8px] px-4 text-base font-semibold text-primary transition-colors duration-200 ease-out hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t.admin.edit}</Link></td>
            </tr>
          );
        })}
      </DataTable>

      <footer className="mt-4 flex flex-col gap-2 border-t border-border py-4 text-sm text-text sm:flex-row sm:items-center sm:justify-between">
        <span>{interpolate(t.admin.pinnedCount, { count: pinnedPosts.length })}</span>
        <span>{interpolate(t.admin.showingPosts, { shown: pageRows.length, total: listQuery.data?.total ?? 0 })}</span>
        {pageCount > 1 && <div className="flex items-center gap-2">
          <Button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} title={t.admin.firstPageReason} disabled={page <= 1} aria-label={t.admin.previousPage} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border text-primary disabled:opacity-40"><ArrowLeft size={17} aria-hidden="true" /></Button>
          <span>{interpolate(t.admin.showingPage, { page, pages: pageCount })}</span>
          <Button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} title={t.admin.lastPageReason} disabled={page >= pageCount} aria-label={t.admin.nextPage} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border text-primary disabled:opacity-40"><ArrowRight size={17} aria-hidden="true" /></Button>
        </div>}
      </footer>
    </div>
  );
}