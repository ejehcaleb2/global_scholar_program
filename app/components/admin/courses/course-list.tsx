"use client";

import Link from "@/components/ui/pending-link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, Plus, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@/lib/copy/provider";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { AdminPageHeader, DataTable } from "@/components/admin/ui/primitives";
import { AccessChip, CourseStatusBadge, KebabMenu } from "@/components/admin/courses/course-primitives";
import { CourseDeleteDialog, CourseReadinessDialog } from "@/components/admin/courses/course-actions";
import { CourseCatalogCard } from "@/components/courses/course-student-ui";
import { duplicateAdminCourse, getApiErrorMessage, type AdminCourse, type AdminCourseFilters, type CourseSummary } from "@/lib/api/index";
import { adminCourseKeys, invalidateAdminCourse, useAdminCourseFacets, useAdminCourseList } from "@/lib/queries/admin-courses";
import { LocalTime } from "@/components/ui/local-time";
import { MediaImage } from "@/components/ui/media-image";

const limits = [10, 20, 50] as const;
const sorts = ["updated", "title", "learners"] as const;
type View = "table" | "cards";

function parseLimit(value: string | null): 10 | 20 | 50 {
  const parsed = Number(value);
  return limits.includes(parsed as 10 | 20 | 50) ? parsed as 10 | 20 | 50 : 20;
}

function formatDuration(total: number, t: ReturnType<typeof useCopy>["t"]) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const parts = [];
  if (hours) parts.push(t.courses.durationHours.replace("{count}", String(hours)));
  if (minutes) parts.push(t.courses.durationMinutes.replace("{count}", String(minutes)));
  return parts.join(" ");
}

function CourseMenuActions({ course, onPublish, onDelete, onDuplicate, duplicating }: { course: AdminCourse; onPublish: () => void; onDelete: () => void; onDuplicate: () => void; duplicating: boolean }) {
  const { t } = useCopy();
  const router = useRouter();
  return <div className="flex items-center justify-end gap-1"><Link href={`/admin/courses/${course.id}`} aria-label={`${t.admin.edit} ${course.title}`} className="inline-flex min-h-10 items-center rounded-[8px] px-3 text-sm font-semibold text-primary hover:bg-surface-alt">{t.admin.edit}</Link><KebabMenu label={`${t.admin.courseActions}: ${course.title}`} actions={[
    { id: "preview", label: t.admin.preview, icon: Eye, onSelect: () => router.push(`/admin/courses/${course.id}/preview`) },
    { id: "duplicate", label: t.admin.duplicate, icon: Copy, onSelect: onDuplicate, loading: duplicating },
    { id: "publish", label: course.status === "published" ? t.admin.unpublish : t.admin.publish, icon: course.status === "published" ? EyeOff : Send, onSelect: onPublish },
    { id: "delete", label: t.admin.delete, icon: Trash2, onSelect: onDelete },
  ]} /></div>;
}

export function CourseList() {
  const { t } = useCopy();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const urlKey = searchParams.toString();
  return <CourseListState key={urlKey} searchParams={searchParams} pathname={pathname} router={router} queryClient={queryClient} t={t} addToast={addToast} />;
}

function CourseListState({ searchParams, pathname, router, queryClient,  t, addToast }: {
  searchParams: ReturnType<typeof useSearchParams>;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  queryClient: ReturnType<typeof useQueryClient>;
  t: ReturnType<typeof useCopy>["t"];
  addToast: ReturnType<typeof useToast>["addToast"];
}) {
  const urlKey = searchParams.toString();
  const rawSearch = searchParams.get("search") ?? "";
  const [searchText, setSearchText] = useState(rawSearch);
  const statusValue = searchParams.get("status");
  const accessValue = searchParams.get("access_type");
  const sortValue = searchParams.get("sort");
  const status = statusValue === "published" || statusValue === "draft" ? statusValue : undefined;
  const access = accessValue === "free" || accessValue === "members_only" ? accessValue : undefined;
  const sort: AdminCourseFilters["sort"] = sorts.includes(sortValue as (typeof sorts)[number]) ? sortValue as AdminCourseFilters["sort"] : "updated";
  const limit = parseLimit(searchParams.get("limit"));
  const requestedOffset = Number(searchParams.get("offset") ?? 0);
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  const view: View = searchParams.get("view") === "cards" ? "cards" : "table";
  const filters: AdminCourseFilters = { search: rawSearch || undefined, status, access_type: access, sort, limit, offset };
  const courses = useAdminCourseList(filters);
  const facets = useAdminCourseFacets();
  const [action, setAction] = useState<{ course: AdminCourse; type: "publish" | "delete" } | null>(null);
  const duplicate = useMutation({
    mutationFn: (courseId: string) => duplicateAdminCourse(courseId),
    onSuccess: (course) => {
      invalidateAdminCourse(queryClient, course.id);
      addToast(t.admin.courseDuplicated, t.admin.courseDuplicated, "success");
      router.push(`/admin/courses/${course.id}`);
    },
    onError: (error) => addToast(t.admin.courseDuplicateFailed, getApiErrorMessage(error, t.admin.courseDuplicateFailed), "error"),
  });

  const replaceParams = useCallback((values: Record<string, string | undefined>, resetOffset = true) => {
    const next = new URLSearchParams(urlKey);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (resetOffset) next.delete("offset");
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
  }, [pathname, router, urlKey]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (statusValue && !status) next.delete("status");
    if (accessValue && !access) next.delete("access_type");
    if (sortValue && !sorts.includes(sortValue as (typeof sorts)[number])) next.delete("sort");
    if (searchParams.has("limit") && !limits.includes(Number(searchParams.get("limit")) as 10 | 20 | 50)) next.delete("limit");
    if (searchParams.has("view") && searchParams.get("view") !== "cards" && searchParams.get("view") !== "table") next.delete("view");
    if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0) next.delete("offset");
    if (next.toString() !== urlKey) router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [access, accessValue, pathname, requestedOffset, router, searchParams, sort, sortValue, status, statusValue, urlKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchText.trim() !== rawSearch) replaceParams({ search: searchText.trim() || undefined });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [rawSearch, replaceParams, searchText]);

  const total = courses.data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(total, offset + limit);
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;
  const activeFilters = Boolean(rawSearch || status || access || sort !== "updated");

  useEffect(() => {
    if (courses.data && offset >= total && offset > 0) replaceParams({ offset: String(Math.max(0, Math.floor((Math.max(total, 1) - 1) / limit) * limit)) }, false);
  }, [courses.data, limit, offset, replaceParams, total]);

  const actions = (course: AdminCourse) => <CourseMenuActions course={course} onPublish={() => setAction({ course, type: "publish" })} onDelete={() => setAction({ course, type: "delete" })} onDuplicate={() => duplicate.mutate(course.id)} duplicating={duplicate.isPending && duplicate.variables === course.id} />;
  const studentCourse = (course: AdminCourse): CourseSummary => ({
    id: course.id,
    title: course.title,
    summary: course.summary,
    description: course.description,
    thumbnail_url: course.thumbnail_url,
    access_type: course.access_type,
    locked: course.access_type === "members_only",
    module_count: course.module_count,
    lesson_count: course.lesson_count,
    duration_minutes: course.duration_minutes,
    progress: null,
  });

  return <main className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 lg:px-10">
    <AdminPageHeader title={t.admin.courses} description={t.admin.coursesDescription} actions={<Link href="/admin/courses/new" className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-4 text-base font-semibold text-white"><Plus size={18} aria-hidden="true" />{t.admin.newCourse}</Link>} />
    <div className="mb-5 min-h-6 text-sm text-text" aria-live="polite">{facets.isLoading ? <span className="inline-block h-4 w-64 animate-pulse rounded-[8px] bg-surface-alt" aria-busy="true" /> : facets.isError ? <span role="alert">{t.admin.facetsLoadError} <Button type="button" onClick={() => void facets.refetch()} className="min-h-8 rounded-[8px] px-2 font-semibold text-primary">{t.admin.retry}</Button></span> : t.admin.courseFacetSummary.replace("{all}", String(facets.data?.all ?? 0)).replace("{published}", String(facets.data?.published ?? 0)).replace("{draft}", String(facets.data?.draft ?? 0))}</div>
    <section aria-label={t.admin.courseFilters} className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <label className="sr-only" htmlFor="course-search">{t.admin.searchCourses}</label><input id="course-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={t.admin.searchCourses} className="field-input" />
      <label className="sr-only" htmlFor="course-status">{t.admin.filterStatus}</label><select id="course-status" value={status ?? "all"} onChange={(event) => replaceParams({ status: event.target.value === "all" ? undefined : event.target.value })} className="field-input"><option value="all">{t.admin.allStatuses} ({facets.data?.all ?? 0})</option><option value="published">{t.admin.publishedStatus} ({facets.data?.published ?? 0})</option><option value="draft">{t.admin.draftStatus} ({facets.data?.draft ?? 0})</option></select>
      <label className="sr-only" htmlFor="course-access">{t.admin.filterAccess}</label><select id="course-access" value={access ?? "all"} onChange={(event) => replaceParams({ access_type: event.target.value === "all" ? undefined : event.target.value })} className="field-input"><option value="all">{t.admin.allAccess}</option><option value="free">{t.admin.freeAccess} ({facets.data?.free ?? 0})</option><option value="members_only">{t.admin.membersOnly} ({facets.data?.members_only ?? 0})</option></select>
      <label className="sr-only" htmlFor="course-sort">{t.admin.sortCourses}</label><select id="course-sort" value={sort} onChange={(event) => replaceParams({ sort: event.target.value === "updated" ? undefined : event.target.value })} className="field-input"><option value="updated">{t.admin.sortRecentlyUpdated}</option><option value="title">{t.admin.sortTitle}</option><option value="learners">{t.admin.sortLearners}</option></select>
      <div role="group" aria-label={t.admin.courseView} className="inline-flex rounded-[8px] border border-border p-1"><Button type="button" aria-pressed={view === "table"} onClick={() => replaceParams({ view: undefined })} className={`min-h-10 rounded-[8px] px-3 text-sm font-semibold ${view === "table" ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}>{t.admin.tableView}</Button><Button type="button" aria-pressed={view === "cards"} onClick={() => replaceParams({ view: "cards" })} className={`min-h-10 rounded-[8px] px-3 text-sm font-semibold ${view === "cards" ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}>{t.admin.cardsView}</Button></div>
      {activeFilters && <Button type="button" onClick={() => { setSearchText(""); router.replace(pathname, { scroll: false }); }} className="min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-text hover:bg-surface-alt">{t.admin.resetFilters}</Button>}
    </section>

    {view === "table" ? <DataTable columns={[t.admin.courseColumn, t.admin.accessType, t.admin.status, t.admin.courseContent, t.admin.learners, t.admin.updated, t.admin.actions]} isLoading={courses.isLoading} error={courses.isError ? t.admin.coursesLoadError : null} onRetry={() => void courses.refetch()} retryLabel={t.admin.retry} isEmpty={!courses.isLoading && !courses.isError && !courses.data?.items.length} emptyTitle={activeFilters ? t.admin.noCourseResults : t.admin.coursesEmpty} emptyDescription={activeFilters ? t.admin.noCourseResultsDescription : t.admin.noCoursesDescription} emptyAction={activeFilters ? <Button type="button" onClick={() => router.replace(pathname, { scroll: false })} className="min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-primary">{t.admin.resetFilters}</Button> : <Link href="/admin/courses/new" className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-semibold text-white"><Plus size={16} aria-hidden="true" />{t.admin.createFirstCourse}</Link>} skeletonRows={6}>
      {courses.data?.items.map((course) => <tr key={course.id} className="cursor-pointer transition-colors duration-200 ease-out hover:bg-surface-alt" onClick={(event) => { if (!(event.target instanceof Element) || !event.target.closest("a,button")) router.push(`/admin/courses/${course.id}`); }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); router.push(`/admin/courses/${course.id}`); } }} tabIndex={0}>
        <td className="min-w-64 px-4 py-4"><div className="flex items-center gap-3">{course.thumbnail_url ? <MediaImage src={course.thumbnail_url} alt="" fill sizes="56px" className="object-cover" wrapperClassName="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border bg-surface-alt" /> : <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border bg-surface-alt"><BookOpen size={20} className="text-text" aria-hidden="true" /></span>}<span className="min-w-0"><Link href={`/admin/courses/${course.id}`} className="font-semibold text-primary hover:underline">{course.title}</Link>{course.summary && <span className="mt-1 block line-clamp-1 text-sm text-text">{course.summary}</span>}</span></div></td>
        <td className="px-4 py-4"><AccessChip accessType={course.access_type} /></td><td className="px-4 py-4"><CourseStatusBadge status={course.status} /></td>
        <td className="min-w-48 px-4 py-4 text-sm text-text">{t.admin.courseContentCounts.replace("{modules}", String(course.module_count)).replace("{lessons}", String(course.lesson_count))}{course.duration_minutes > 0 && <span className="mt-1 block">{formatDuration(course.duration_minutes, t)}</span>}</td>
        <td className="min-w-40 px-4 py-4 text-sm text-text">{t.admin.courseLearnerCounts.replace("{started}", String(course.learners_started)).replace("{completed}", String(course.learners_completed))}</td>
        <td className="whitespace-nowrap px-4 py-4 text-sm text-text">{course.updated_at ? <LocalTime value={course.updated_at} relative /> : t.admin.unknownDate}</td><td className="px-4 py-4">{actions(course)}</td>
      </tr>)}
    </DataTable> : courses.isError ? <div role="alert" className="rounded-[8px] border border-border p-6 text-base text-text">{t.admin.coursesLoadError}<Button type="button" onClick={() => void courses.refetch()} className="ml-3 min-h-10 rounded-[8px] border border-border px-3 text-sm font-semibold text-primary">{t.admin.retry}</Button></div> : courses.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-80 animate-pulse rounded-[8px] border border-border bg-surface-alt" />)}</div> : courses.data?.items.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{courses.data.items.map((course) => <CourseCatalogCard key={course.id} course={studentCourse(course)} locked={course.access_type === "members_only"} action={<div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/admin/courses/${course.id}`} className="inline-flex min-h-10 items-center rounded-[8px] px-3 text-sm font-semibold text-primary hover:bg-surface-alt">{t.admin.edit}</Link>{actions(course)}</div>} />)}</div> : <div className="rounded-[8px] border border-border bg-background p-8 text-center"><h2 className="font-heading text-xl text-text">{activeFilters ? t.admin.noCourseResults : t.admin.coursesEmpty}</h2><p className="mt-2 text-base text-text">{activeFilters ? t.admin.noCourseResultsDescription : t.admin.noCoursesDescription}</p><Button type="button" onClick={() => activeFilters ? router.replace(pathname, { scroll: false }) : router.push("/admin/courses/new")} className="mt-4 min-h-11 rounded-[8px] bg-primary px-4 text-base font-semibold text-white">{activeFilters ? t.admin.resetFilters : t.admin.createFirstCourse}</Button></div>}

    <footer className="mt-4 flex flex-col gap-3 text-sm text-text sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-3"><span>{t.admin.showingCourses.replace("{first}", String(from)).replace("{last}", String(to)).replace("{total}", String(total))}</span><label className="flex items-center gap-2">{t.admin.rowsPerPage}<select aria-label={t.admin.rowsPerPage} value={limit} onChange={(event) => replaceParams({ limit: event.target.value === "20" ? undefined : event.target.value })} className="field-input min-h-10 w-20">{limits.map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div><div className="flex items-center gap-3"><span>{t.admin.showingPage.replace("{page}", String(page)).replace("{pages}", String(pages))}</span><Button type="button" title={t.admin.firstPageReason} aria-label={t.admin.previousPage} disabled={offset <= 0} onClick={() => replaceParams({ offset: String(Math.max(0, offset - limit)) }, false)} className="h-10 w-10 rounded-[8px] border border-border disabled:opacity-50"><ChevronLeft size={18} aria-hidden="true" /></Button><Button type="button" title={t.admin.lastPageReason} aria-label={t.admin.nextPage} disabled={offset + limit >= total} onClick={() => replaceParams({ offset: String(offset + limit) }, false)} className="h-10 w-10 rounded-[8px] border border-border disabled:opacity-50"><ChevronRight size={18} aria-hidden="true" /></Button></div></footer>

    {action?.type === "publish" && <CourseReadinessDialog course={action.course} open onClose={() => setAction(null)} onGoTo={(tab, field, lessonId) => { const params = new URLSearchParams({ tab }); if (lessonId) params.set("lesson", lessonId); if (field) params.set("field", field); router.push(`/admin/courses/${action.course.id}?${params}`); }} />}
    {action?.type === "delete" && <CourseDeleteDialog course={action.course} open onClose={() => setAction(null)} onDeleted={() => { setAction(null); void queryClient.invalidateQueries({ queryKey: adminCourseKeys.lists() }); }} />}
  </main>;
}