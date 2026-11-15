"use client";

import { ArrowRight, BookOpen, CheckCircle2, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { PendingLink } from "@/components/ui/pending-link";
import { useCopy } from "@/lib/copy/provider";
import type { CourseDetail, CourseSummary } from "@/lib/api/index";
import { MediaImage } from "@/components/ui/media-image";

export function CourseCatalogCard({ course, href, locked = course.locked, action, showCounts = true }: { course: CourseSummary; href?: string; locked?: boolean; action?: ReactNode; showCounts?: boolean }) {
  const { t } = useCopy();
  const title = course.summary || course.description || t.courses.noDescription;
  const started = Boolean(course.progress?.completed_count);
  return <article className="flex min-h-[26rem] flex-col rounded-[8px] border border-border bg-background p-6">
    {course.thumbnail_url ? <MediaImage src={course.thumbnail_url} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" wrapperClassName="relative flex aspect-video items-center justify-center overflow-hidden rounded-[8px] border border-border bg-surface-alt" /> : <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[8px] border border-border bg-surface-alt"><BookOpen size={24} className="text-primary" aria-hidden="true" /></div>}
    <div className="mt-4 flex items-center justify-between gap-3">{locked ? <span className="inline-flex items-center gap-2 rounded-[8px] border border-border bg-surface-alt px-2.5 py-1 text-sm text-text"><Lock size={16} aria-hidden="true" />{t.courses.membersOnly}</span> : <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 size={16} aria-hidden="true" />{t.courses.available}</span>}</div>
    <h2 className="mt-4 font-heading text-2xl leading-tight text-text">{course.title}</h2>
    <p className="mt-2 flex-1 text-base leading-6 text-text">{title}</p>
    {showCounts && <p className="mt-4 text-sm font-semibold text-primary">{t.courses.contentCounts.replace("{modules}", String(course.module_count)).replace("{lessons}", String(course.lesson_count))}{course.duration_minutes > 0 && <span className="font-normal text-text"> · {formatDuration(course.duration_minutes, t)}</span>}</p>}
    {course.progress && <div className="mt-4"><div className="mb-2 flex items-center justify-between text-sm text-text"><span>{t.courses.progressCount.replace("{completed}", String(course.progress.completed_count)).replace("{total}", String(course.progress.total_count))}</span><span className="font-semibold text-primary">{course.progress.percent}%</span></div><div className="h-2 overflow-hidden rounded-[8px] bg-surface-alt"><div className="h-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${course.progress.percent}%` }} /></div></div>}
    <div className="mt-5">{action ?? <PendingLink href={locked ? "/services" : href ?? `/courses/${course.id}`} pendingLabel={locked ? t.courses.openServices : t.courses.openCourse} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-primary px-4 text-base font-semibold text-white hover:opacity-90">{locked ? t.courses.unlockMembership : started ? t.courses.continueCourse : t.courses.getStarted}<ArrowRight size={16} aria-hidden="true" /></PendingLink>}</div>
  </article>;
}

export function StudentCourseHeader({ course, action }: { course: Pick<CourseDetail, "id" | "title" | "summary" | "description" | "progress">; action?: ReactNode }) {
  const { t } = useCopy();
  return <section className="border-b border-border bg-background"><div className="mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-10"><div className="rounded-[8px] border border-border bg-background p-6 sm:p-8"><div className="flex flex-col justify-between gap-8 md:flex-row md:items-end"><div><p className="eyebrow">{t.courses.courseDetail}</p><h1 className="mt-3 font-heading text-3xl leading-tight text-text sm:text-4xl">{course.title}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-text">{course.summary || course.description || t.courses.noDescription}</p></div>{action}</div><div className="mt-8 max-w-xl"><div className="mb-2 flex justify-between text-sm text-text"><span>{t.courses.progressCount.replace("{completed}", String(course.progress.completed_count)).replace("{total}", String(course.progress.total_count))}</span><span className="font-semibold text-primary">{course.progress.percent}%</span></div><div className="h-2 overflow-hidden rounded-[8px] bg-surface-alt"><div className="h-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${course.progress.percent}%` }} /></div></div></div></div></section>;
}

function formatDuration(totalMinutes: number, t: ReturnType<typeof useCopy>["t"]) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours) parts.push(t.courses.durationHours.replace("{count}", String(hours)));
  if (minutes) parts.push(t.courses.durationMinutes.replace("{count}", String(minutes)));
  return parts.join(" ");
}