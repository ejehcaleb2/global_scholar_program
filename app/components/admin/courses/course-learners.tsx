"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { useAdminCourseFunnel, useAdminCourseLearners } from "@/lib/queries/admin-courses";
import type { AdminCourseLearner, AdminCourseLearnerFilters } from "@/lib/api/index";
import { useCourseHub } from "@/components/admin/courses/course-hub";
import { EmptyState, StatusBadge } from "@/components/admin/ui/primitives";
import { LocalTime } from "@/components/ui/local-time";

const pageSizes = [10, 20, 50, 100] as const;
const statuses = ["not_started", "in_progress", "completed", "inactive"] as const;
const sorts = ["progress_desc", "progress_asc", "activity_desc", "name_asc"] as const;
type LearnerStatus = typeof statuses[number];
type LearnerSort = typeof sorts[number];

function labelForStatus(status: LearnerStatus, t: ReturnType<typeof useCopy>["t"]) {
  if (status === "not_started") return t.admin.notStarted;
  if (status === "in_progress") return t.admin.inProgressStatus;
  if (status === "completed") return t.admin.completedStatus;
  return t.admin.inactiveStatus;
}

export function CourseLearners() {
  const course = useCourseHub();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const urlKey = searchParams.toString();
  return <CourseLearnersState key={urlKey} courseId={course.id} searchParams={searchParams} pathname={pathname} router={router} />;
}

function CourseLearnersState({ courseId, searchParams, pathname, router }: {
  courseId: string;
  searchParams: ReturnType<typeof useSearchParams>;
  pathname: string;
  router: ReturnType<typeof useRouter>;
}) {
  const { t } = useCopy();
  const { addToast } = useToast();
  const rawSearch = searchParams.get("q") ?? "";
  const [searchText, setSearchText] = useState(rawSearch);
  const rawStatus = searchParams.get("status");
  const status = statuses.includes(rawStatus as LearnerStatus) ? rawStatus as LearnerStatus : undefined;
  const rawSort = searchParams.get("sort");
  const sort: LearnerSort = sorts.includes(rawSort as LearnerSort) ? rawSort as LearnerSort : "progress_desc";
  const rawLimit = Number(searchParams.get("limit") ?? 20);
  const limit = pageSizes.includes(rawLimit as typeof pageSizes[number]) ? rawLimit as typeof pageSizes[number] : 20;
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const filters: AdminCourseLearnerFilters = { q: rawSearch || undefined, status, sort, limit, offset };
  const funnel = useAdminCourseFunnel(courseId);
  const learners = useAdminCourseLearners(courseId, filters);
  const pageCount = Math.max(1, Math.ceil((learners.data?.total ?? 0) / limit));
  const page = Math.floor(offset / limit) + 1;
  const lessonPositions = useMemo(() => new Map(funnel.data?.lessons.map((lesson) => [lesson.lesson_id, lesson.position]) ?? []), [funnel.data]);

  function replaceParams(values: Record<string, string | undefined>, resetOffset = true) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (resetOffset) next.delete("offset");
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchText.trim() !== rawSearch) {
        const next = new URLSearchParams(searchParams.toString());
        const value = searchText.trim();
        if (value) next.set("q", value);
        else next.delete("q");
        next.delete("offset");
        router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [pathname, rawSearch, router, searchParams, searchText]);

  const largestDrop = funnel.data?.largest_drop;
  const fromPosition = largestDrop ? lessonPositions.get(largestDrop.from_lesson_id) : undefined;
  const toPosition = largestDrop ? lessonPositions.get(largestDrop.to_lesson_id) : undefined;

  async function copyEmail(learner: AdminCourseLearner) {
    try {
      await navigator.clipboard.writeText(learner.user.email);
      addToast(t.admin.emailCopied, t.admin.emailCopied, "success");
    } catch {
      addToast(t.admin.emailCopyFailed, t.admin.emailCopyFailed, "error");
    }
  }

  return <div className="space-y-7">
    <section className="border-b border-border pb-6" aria-labelledby="course-funnel-title">
      <h2 id="course-funnel-title" className="mb-4 font-heading text-xl text-text">{t.admin.learnerFunnelTitle}</h2>
      {funnel.isLoading ? <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-[8px] bg-surface-alt" />)}</div> : funnel.isError ? <div role="alert" className="flex items-center justify-between gap-3"><p className="text-base text-text">{t.admin.courseFunnelLoadError}</p><Button type="button" loading={funnel.isFetching} loadingLabel={t.admin.retry} onClick={() => void funnel.refetch()} className="min-h-10 rounded-[8px] border border-border px-3 text-sm font-semibold text-primary">{t.admin.retry}</Button></div> : funnel.data && funnel.data.lessons.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[620px] border-collapse text-left"><thead className="bg-surface-alt"><tr>{[t.admin.position, t.admin.learnerFunnelLesson, t.admin.learners, t.admin.progressColumn].map((header) => <th key={header} scope="col" className="px-4 py-3 text-sm font-semibold text-text">{header}</th>)}</tr></thead><tbody className="divide-y divide-border">{funnel.data.lessons.map((lesson) => <tr key={lesson.lesson_id}><td className="px-4 py-3 text-sm text-text">{lesson.position}</td><td className="px-4 py-3 text-base text-text">{lesson.title}</td><td className="px-4 py-3 text-sm text-text">{lesson.completed_count}</td><td className="min-w-56 px-4 py-3"><div className="flex items-center gap-3"><div className="h-2 min-w-28 flex-1 overflow-hidden rounded-[8px] border border-border bg-background"><div className="h-full bg-primary" style={{ width: `${Math.min(100, lesson.percent_of_started)}%` }} /></div><span className="w-12 text-right text-sm text-text">{t.admin.learnerPercent.replace("{percent}", String(Math.round(lesson.percent_of_started)))}</span></div></td></tr>)}</tbody></table></div>{largestDrop && fromPosition !== undefined && toPosition !== undefined && <p className="mt-3 text-sm text-text">{t.admin.largestDropBetween.replace("{from}", String(fromPosition)).replace("{to}", String(toPosition))}</p>}</> : <EmptyState title={t.admin.noCourseLearners} />}
    </section>

    <section aria-label={t.admin.learnersTab}>
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_220px_240px]">
        <label className="sr-only" htmlFor="course-learners-search">{t.admin.searchCourseLearners}</label><input id="course-learners-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={t.admin.searchCourseLearners} className="field-input min-h-11" />
        <label className="sr-only" htmlFor="course-learner-status">{t.admin.filterLearnerStatus}</label><select id="course-learner-status" value={status ?? "all"} onChange={(event) => replaceParams({ status: event.target.value === "all" ? undefined : event.target.value })} className="field-input min-h-11"><option value="all">{t.admin.allLearnerStatuses}</option>{statuses.map((item) => <option key={item} value={item}>{labelForStatus(item, t)} ({learners.data?.facets[item] ?? 0})</option>)}</select>
        <label className="sr-only" htmlFor="course-learner-sort">{t.admin.sortCourses}</label><select id="course-learner-sort" value={sort} onChange={(event) => replaceParams({ sort: event.target.value === "progress_desc" ? undefined : event.target.value })} className="field-input min-h-11"><option value="progress_desc">{t.admin.sortProgressDescending}</option><option value="progress_asc">{t.admin.sortProgressAscending}</option><option value="activity_desc">{t.admin.sortActivity}</option><option value="name_asc">{t.admin.sortTitle}</option></select>
      </div>
      {learners.isLoading ? <div className="overflow-hidden rounded-[8px] border border-border" aria-busy="true">{[0, 1, 2, 3].map((item) => <div key={item} className="h-16 border-b border-border bg-surface-alt" />)}</div> : learners.isError ? <div role="alert" className="flex items-center justify-between gap-3 border border-border p-5"><p className="text-base text-text">{t.admin.courseLearnersLoadError}</p><Button type="button" loading={learners.isFetching} loadingLabel={t.admin.retry} onClick={() => void learners.refetch()} className="min-h-10 rounded-[8px] border border-border px-3 text-sm font-semibold text-primary">{t.admin.retry}</Button></div> : learners.data?.items.length ? <div className="overflow-x-auto rounded-[8px] border border-border"><table className="w-full min-w-[820px] border-collapse text-left"><thead className="bg-surface-alt"><tr>{[t.admin.students, t.admin.planState, t.admin.progressColumn, t.admin.lastActivity, t.admin.status].map((header) => <th key={header} scope="col" className="px-4 py-3 text-sm font-semibold text-text">{header}</th>)}<th scope="col" className="px-4 py-3 text-sm font-semibold text-text">{t.admin.actions}</th></tr></thead><tbody className="divide-y divide-border">{learners.data.items.map((learner) => <tr key={learner.user.id}><td className="px-4 py-3"><p className="text-base font-semibold text-text">{learner.user.full_name || learner.user.email}</p><p className="text-sm text-text">{learner.user.email}</p></td><td className="px-4 py-3"><StatusBadge status={learner.plan_state} label={learner.plan_state === "paid" ? t.admin.previewTierPaid : t.admin.previewTierFree} /></td><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="h-2 min-w-24 flex-1 overflow-hidden rounded-[8px] border border-border bg-background"><div className="h-full bg-primary" style={{ width: `${learner.percent}%` }} /></div><span className="text-sm text-text">{learner.percent}%</span></div><p className="mt-1 text-sm text-text">{t.admin.lessonCountFraction.replace("{completed}", String(learner.completed_lessons)).replace("{total}", String(learner.total_lessons))}</p></td><td className="whitespace-nowrap px-4 py-3 text-sm text-text" >{learner.last_activity_at ? <LocalTime value={learner.last_activity_at} relative /> : t.admin.unknownDate}</td><td className="px-4 py-3"><StatusBadge status={learner.status} label={labelForStatus(learner.status, t)} /></td><td className="px-4 py-3"><Button type="button" aria-label={`${t.admin.copyEmail}: ${learner.user.email}`} onClick={() => void copyEmail(learner)} className="h-10 w-10 rounded-[8px] border border-border text-text"><Copy size={16} aria-hidden="true" /></Button></td></tr>)}</tbody></table></div> : <EmptyState title={t.admin.noCourseLearners} />}
      <footer className="mt-4 flex flex-col gap-3 text-sm text-text sm:flex-row sm:items-center sm:justify-between"><span>{t.admin.showingCourses.replace("{first}", String((learners.data?.total ?? 0) === 0 ? 0 : offset + 1)).replace("{last}", String(Math.min(learners.data?.total ?? 0, offset + limit))).replace("{total}", String(learners.data?.total ?? 0))}</span><div className="flex items-center gap-3"><span>{t.admin.showingPage.replace("{page}", String(page)).replace("{pages}", String(pageCount))}</span><Button type="button" aria-label={t.admin.previousPage} disabled={offset <= 0} onClick={() => replaceParams({ offset: String(Math.max(0, offset - limit)) }, false)} className="h-10 w-10 rounded-[8px] border border-border disabled:opacity-50"><ChevronLeft size={18} aria-hidden="true" /></Button><Button type="button" aria-label={t.admin.nextPage} disabled={offset + limit >= (learners.data?.total ?? 0)} onClick={() => replaceParams({ offset: String(offset + limit) }, false)} className="h-10 w-10 rounded-[8px] border border-border disabled:opacity-50"><ChevronRight size={18} aria-hidden="true" /></Button></div></footer>
    </section>
  </div>;
}