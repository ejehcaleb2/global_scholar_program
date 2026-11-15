"use client";

import Link from "@/components/ui/pending-link";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle2, Circle, Clock3, GraduationCap, Layers3 } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import { useAdminCourseActivity, useAdminCourseReadiness, useAdminCourseStats } from "@/lib/queries/admin-courses";
import type { AdminCourseReadiness } from "@/lib/api/index";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, StatCard } from "@/components/admin/ui/primitives";
import { ReadinessChecklist } from "@/components/admin/courses/course-primitives";
import { AuditActivityRow } from "@/components/admin/activity/activity-row";
import { useCourseHub } from "@/components/admin/courses/course-hub";
import { CourseCatalogCard } from "@/components/courses/course-student-ui";

function CoursePanel({ title, isLoading, error, onRetry, retryLabel, children }: { title: string; isLoading: boolean; error: string | null; onRetry: () => void; retryLabel: string; children: React.ReactNode }) {
  return <section className="border-b border-border py-6"><h2 className="mb-4 font-heading text-xl text-text">{title}</h2>{isLoading ? <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-[8px] bg-surface-alt" />)}</div> : error ? <div role="alert" className="flex items-center justify-between gap-3"><p className="text-base text-text">{error}</p><Button type="button" onClick={onRetry} className="min-h-10 rounded-[8px] border border-border px-3 text-sm font-semibold text-primary">{retryLabel}</Button></div> : children}</section>;
}

export function CourseOverview() {
  const course = useCourseHub();
  const { t } = useCopy();
  const router = useRouter();
  const readiness = useAdminCourseReadiness(course.id);
  const stats = useAdminCourseStats(course.id);
  const activity = useAdminCourseActivity(course.id, 5);
  const summary = {
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
  };
  const readinessPercent = readiness.data?.checks.length ? Math.round((readiness.data.checks.filter((check) => check.passed).length / readiness.data.checks.length) * 100) : 0;

  function goToCheck(check: AdminCourseReadiness["checks"][number]) {
    if (check.lesson_id) router.push(`/admin/courses/${course.id}/lessons/${check.lesson_id}`);
    else router.push(`/admin/courses/${course.id}/${check.tab === "details" ? "details" : "curriculum"}${check.field ? `?field=${encodeURIComponent(check.field)}` : ""}`);
  }

  return <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
    <div>
      <CoursePanel title={t.admin.readinessTitle} isLoading={readiness.isLoading} error={readiness.isError ? t.admin.readinessLoadError : null} onRetry={() => void readiness.refetch()} retryLabel={t.admin.retry}>
        {readiness.data && <><div className="mb-4"><div className="mb-2 flex items-center justify-between gap-3 text-sm text-text"><span>{t.admin.readinessProgress.replace("{passed}", String(readiness.data.checks.length - readiness.data.errors - readiness.data.warnings)).replace("{total}", String(readiness.data.checks.length))}</span><span className="font-semibold text-primary">{readinessPercent}%</span></div><div className="h-2 overflow-hidden rounded-[8px] bg-surface-alt"><div className="h-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${readinessPercent}%` }} /></div></div><div className="mb-3 flex flex-wrap gap-4 text-sm"><span className="text-text">{t.admin.readinessErrorsRemain.replace("{count}", String(readiness.data.errors))}</span><span className="text-text">{t.admin.readinessWarnings.replace("{count}", String(readiness.data.warnings))}</span></div><ReadinessChecklist readiness={readiness.data} onGoTo={goToCheck} /></>}
      </CoursePanel>

      <CoursePanel title={t.admin.courseStatistics} isLoading={stats.isLoading} error={stats.isError ? t.admin.courseStatsLoadError : null} onRetry={() => void stats.refetch()} retryLabel={t.admin.retry}>
        {stats.data && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label={t.admin.modules} value={stats.data.module_count} /><StatCard label={t.admin.lessons} value={stats.data.lesson_count} /><StatCard label={t.admin.totalDuration} value={stats.data.total_minutes} subtext={t.admin.minutesShort} /><StatCard label={t.admin.learnersStarted} value={stats.data.learners_started} subtext={t.admin.completionRate.replace("{rate}", String(Math.round(stats.data.completion_rate)))} />{stats.data.lessons_without_duration > 0 && <p className="text-sm text-text sm:col-span-2 xl:col-span-4">{t.admin.lessonsWithoutDuration.replace("{count}", String(stats.data.lessons_without_duration))}</p>}</div>}
      </CoursePanel>

      <CoursePanel title={t.admin.recentCourseChanges} isLoading={activity.isLoading} error={activity.isError ? t.admin.activityLoadError : null} onRetry={() => void activity.refetch()} retryLabel={t.admin.retry}>
        {activity.data?.length ? <><DataTable columns={[t.admin.actorColumn, t.admin.actionColumn, t.admin.recordColumn, t.admin.date]} isEmpty={false} emptyTitle={t.admin.noCourseChanges} retryLabel={t.admin.retry}>{activity.data.map((entry) => <AuditActivityRow key={entry.id} entry={entry} />)}</DataTable><Link href={`/admin/activity?entity_type=course&entity_id=${course.id}`} className="mt-3 inline-flex min-h-10 items-center rounded-[8px] px-3 text-sm font-semibold text-primary hover:bg-surface-alt">{t.admin.viewAll}</Link></> : <EmptyState title={t.admin.noCourseChanges} description={t.admin.noCourseChangesDescription} icon={Clock3} />}
      </CoursePanel>
    </div>

    <aside className="space-y-7 border-t border-border pt-6 xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0">
      <section><h2 className="mb-4 font-heading text-xl text-text">{t.admin.studentPreview}</h2><CourseCatalogCard course={summary} locked={summary.locked} showCounts /></section>
      {course.module_count === 0 && <section><h2 className="font-heading text-xl text-text">{t.admin.courseNextSteps}</h2><ol className="mt-3 space-y-3">
        {[{ done: Boolean(course.summary), label: t.admin.addCourseDetails, href: `/admin/courses/${course.id}/details`, icon: BookOpen }, { done: course.module_count > 0, label: t.admin.buildCurriculum, href: `/admin/courses/${course.id}/curriculum`, icon: Layers3 }, { done: course.status === "published", label: t.admin.publishCourse, href: `/admin/courses/${course.id}`, icon: GraduationCap }].map((step) => <li key={step.href} className="flex items-center gap-3 border-b border-border py-3"><span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-surface-alt">{step.done ? <CheckCircle2 size={16} className="text-primary" aria-hidden="true" /> : <step.icon size={16} className="text-text" aria-hidden="true" />}</span><Link href={step.href} className="text-base font-semibold text-primary hover:underline">{step.label}</Link>{step.done && <span className="sr-only">{t.admin.stepComplete}</span>}</li>)}
      </ol><span className="sr-only"><Circle size={16} aria-hidden="true" /></span></section>}
    </aside>
  </div>;
}