"use client";

import { createContext, useContext, useState } from "react";
import Link from "@/components/ui/pending-link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, EyeOff, Send, Copy, Trash2 } from "lucide-react";
import { ApiError, duplicateAdminCourse, getApiErrorMessage, type AdminCourseDetail } from "@/lib/api/index";
import { invalidateAdminCourse, useAdminCourse, useAdminCourseActivity, useAdminCourseStats } from "@/lib/queries/admin-courses";
import { useCopy } from "@/lib/copy/provider";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { CourseStatusBadge, AccessChip, KebabMenu } from "@/components/admin/courses/course-primitives";
import { CourseDeleteDialog, CourseReadinessDialog } from "@/components/admin/courses/course-actions";
import { LocalTime } from "@/components/ui/local-time";

const CourseHubContext = createContext<AdminCourseDetail | null>(null);

export function useCourseHub() {
  const course = useContext(CourseHubContext);
  if (!course) throw new Error("Course hub data is not available");
  return course;
}

export function CourseHubShell({ courseId, children }: { courseId: string; children: React.ReactNode }) {
  const { t } = useCopy();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const courseQuery = useAdminCourse(courseId);
  const activity = useAdminCourseActivity(courseId, 1);
  const stats = useAdminCourseStats(courseId);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const course = courseQuery.data;
  const duplicate = useMutation({
    mutationFn: () => duplicateAdminCourse(courseId),
    onSuccess: (created) => {
      invalidateAdminCourse(queryClient, created.id);
      addToast(t.admin.courseDuplicated, t.admin.courseDuplicated, "success");
      router.push(`/admin/courses/${created.id}`);
    },
    onError: (error) => addToast(t.admin.courseDuplicateFailed, getApiErrorMessage(error, t.admin.courseDuplicateFailed), "error"),
  });

  if (courseQuery.isLoading) return <main className="mx-auto min-h-[65vh] max-w-[1500px] animate-pulse px-5 py-8 sm:px-8" aria-busy="true"><div className="h-24 rounded-[8px] bg-surface-alt" /><div className="mt-6 h-12 rounded-[8px] bg-surface-alt" /><div className="mt-8 h-80 rounded-[8px] bg-surface-alt" /></main>;
  if (courseQuery.error instanceof ApiError && courseQuery.error.status === 404) return <main className="mx-auto flex min-h-[65vh] max-w-2xl flex-col items-center justify-center px-5 py-12 text-center"><h1 className="font-heading text-3xl text-text">{t.admin.courseNotFound}</h1><p className="mt-3 text-base text-text">{t.admin.courseNotFoundDescription}</p><Link href="/admin/courses" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-4 text-base font-semibold text-white"><ArrowLeft size={16} aria-hidden="true" />{t.admin.backToCourses}</Link></main>;
  if (courseQuery.isError || !course) return <main className="mx-auto flex min-h-[65vh] max-w-2xl flex-col items-center justify-center px-5 py-12 text-center"><h1 className="font-heading text-3xl text-text">{t.admin.courseLoadError}</h1><p className="mt-3 text-base text-text">{t.admin.courseLoadDescription}</p><Button type="button" loading={courseQuery.isFetching} loadingLabel={t.admin.retry} onClick={() => void courseQuery.refetch()} className="mt-5 min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-primary">{t.admin.retry}</Button></main>;

  const latest = activity.data?.[0];
  const isActive = (tab: { id: string; href: string }) => pathname === tab.href || tab.id === "curriculum" && pathname.startsWith(`/admin/courses/${courseId}/lessons/`);
  const tabs = [
    { id: "overview", href: `/admin/courses/${courseId}`, label: t.admin.overviewTab },
    { id: "details", href: `/admin/courses/${courseId}/details`, label: t.admin.detailsTab },
    { id: "curriculum", href: `/admin/courses/${courseId}/curriculum`, label: t.admin.curriculumTab },
    { id: "learners", href: `/admin/courses/${courseId}/learners`, label: t.admin.learnersTab, count: stats.data?.learners_started },
  ];

  return <CourseHubContext.Provider value={course}>
    <div className="mx-auto w-full max-w-[1600px] px-5 py-6 sm:px-8 lg:px-10">
      <header className="sticky top-16 z-30 -mx-5 mb-5 border-b border-border bg-background px-5 py-3 lg:top-0 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0"><Link href="/admin/courses" className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={16} aria-hidden="true" />{t.admin.backToCourses}</Link><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="max-w-[55vw] truncate font-heading text-2xl text-text">{course.title}</h1><CourseStatusBadge status={course.status} /><AccessChip accessType={course.access_type} /></div>
            {activity.isLoading ? <div className="mt-2 h-4 w-52 animate-pulse rounded-[8px] bg-surface-alt" aria-busy="true" /> : activity.isError ? <span className="mt-1 flex items-center gap-2 text-sm text-text">{t.admin.activityUnavailable}<Button type="button" aria-label={t.admin.retry} onClick={() => void activity.refetch()} className="min-h-8 rounded-[8px] px-2 text-primary">{t.admin.retry}</Button></span> : latest ? <p className="mt-1 text-sm text-text">{t.admin.courseUpdatedBy.replace("{actor}", latest.actor.full_name || latest.actor.email).split("{relative}")[0]}<LocalTime value={latest.created_at} relative />{t.admin.courseUpdatedBy.split("{relative}")[1]}</p> : <p className="mt-1 text-sm text-text">{t.admin.noCourseChanges}</p>}
          </div>
          <div className="flex items-center gap-2"><Link href={`/admin/courses/${courseId}/preview`} className="inline-flex min-h-10 items-center rounded-[8px] border border-border px-3 text-sm font-semibold text-text hover:bg-surface-alt">{t.admin.preview}</Link><Button type="button" onClick={() => setPublishOpen(true)} className="min-h-10 gap-2 rounded-[8px] bg-primary px-3 text-sm font-semibold text-white">{course.status === "published" ? <EyeOff size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}{course.status === "published" ? t.admin.unpublish : t.admin.publish}</Button><KebabMenu label={t.admin.courseActions} actions={[{ id: "duplicate", label: t.admin.duplicate, icon: Copy, onSelect: () => duplicate.mutate(), loading: duplicate.isPending }, { id: "delete", label: t.admin.delete, icon: Trash2, onSelect: () => setDeleteOpen(true) }]} /></div>
        </div>
      </header>
      <nav aria-label={t.admin.courseTabs} className="mb-6 flex gap-1 overflow-x-auto border-b border-border">{tabs.map((tab) => <Link key={tab.id} href={tab.href} aria-current={isActive(tab) ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors duration-200 ease-out ${isActive(tab) ? "border-primary text-primary" : "border-transparent text-text hover:bg-surface-alt"}`}>{tab.label}{tab.count !== undefined && <span className="rounded-[8px] bg-surface-alt px-2 py-0.5 text-sm text-text">{tab.count}</span>}</Link>)}</nav>
      {children}
    </div>
    <CourseReadinessDialog course={course} open={publishOpen} onClose={() => setPublishOpen(false)} onGoTo={(tab, field, lessonId) => {
      if (lessonId) router.push(`/admin/courses/${courseId}/lessons/${lessonId}`);
      else router.push(`/admin/courses/${courseId}/${tab === "details" ? "details" : "curriculum"}${field ? `?field=${encodeURIComponent(field)}` : ""}`);
    }} />
    <CourseDeleteDialog course={course} open={deleteOpen} onClose={() => setDeleteOpen(false)} onDeleted={() => { setDeleteOpen(false); router.push("/admin/courses"); }} />
  </CourseHubContext.Provider>;
}
