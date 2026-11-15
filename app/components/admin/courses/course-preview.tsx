"use client";

import Link from "@/components/ui/pending-link";
import { useState } from "react";
import { Lock } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import { useCourseHub } from "@/components/admin/courses/course-hub";
import { Button } from "@/components/ui/button";
import { CourseCatalogCard, StudentCourseHeader } from "@/components/courses/course-student-ui";
import { LessonMedia } from "@/components/courses/lesson-media";
import { RichContent } from "@/components/ui/rich-content";
import type { CourseSummary } from "@/lib/api/index";

type PreviewView = "catalog" | "course" | "lesson";
type PreviewTier = "free" | "paid";

export function CoursePreview() {
  const course = useCourseHub();
  const { t } = useCopy();
  const [view, setView] = useState<PreviewView>("catalog");
  const [tier, setTier] = useState<PreviewTier>("free");
  const lessons = course.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title })));
  const [selectedLessonId, setSelectedLessonId] = useState(lessons[0]?.id ?? "");
  const lesson = lessons.find((item) => item.id === selectedLessonId);
  const locked = course.access_type === "members_only" && tier === "free";
  const studentCourse: CourseSummary = {
    id: course.id,
    title: course.title,
    summary: course.summary,
    description: course.description,
    thumbnail_url: course.thumbnail_url,
    access_type: course.access_type,
    locked,
    module_count: course.module_count,
    lesson_count: course.lesson_count,
    duration_minutes: course.duration_minutes,
    progress: null,
  };
  const headerCourse = {
    id: course.id,
    title: course.title,
    summary: course.summary,
    description: course.description,
    progress: { completed_count: 0, total_count: course.lesson_count, percent: 0 },
  };

  return <div className="space-y-5">
    <div className="sticky top-24 z-20 flex flex-col gap-4 border-b border-border bg-background py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-base font-semibold text-text">{t.admin.previewNotice}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={t.admin.previewTier} className="inline-flex rounded-[8px] border border-border p-1">{(["free", "paid"] as const).map((item) => <Button key={item} type="button" aria-pressed={tier === item} onClick={() => setTier(item)} className={`min-h-10 rounded-[8px] px-3 text-sm ${tier === item ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}>{item === "free" ? t.admin.previewTierFree : t.admin.previewTierPaid}</Button>)}</div>
        <Link href={`/admin/courses/${course.id}`} className="inline-flex min-h-10 items-center rounded-[8px] border border-border px-3 text-sm font-semibold text-text">{t.admin.exitPreview}</Link>
      </div>
    </div>
    <div role="group" aria-label={t.admin.previewView} className="flex flex-wrap gap-2">{(["catalog", "course", "lesson"] as const).map((item) => <Button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)} className={`min-h-10 rounded-[8px] border px-4 text-sm font-semibold ${view === item ? "border-primary bg-primary text-white" : "border-border text-text hover:bg-surface-alt"}`}>{item === "catalog" ? t.admin.previewCatalogTab : item === "course" ? t.admin.previewCourseTab : t.admin.previewLessonTab}</Button>)}</div>
    {view === "catalog" && <div className="max-w-sm"><CourseCatalogCard course={studentCourse} locked={locked} showCounts /></div>}
    {view === "course" && (locked ? <div role="status" className="flex items-start gap-3 border-y border-border py-5"><Lock size={20} className="mt-1 shrink-0 text-text" aria-hidden="true" /><div><h2 className="font-heading text-xl text-text">{t.admin.previewLocked}</h2><p className="mt-2 text-base text-text">{t.admin.previewLockedDescription}</p></div></div> : <section><StudentCourseHeader course={headerCourse} /><div className="mx-auto max-w-6xl px-5 py-6 lg:px-8"><h2 className="mb-3 font-heading text-xl text-text">{t.admin.learningOutcomes}</h2><ul className="list-disc space-y-2 pl-5">{course.learning_outcomes.map((outcome, index) => <li key={`${index}-${outcome}`} className="text-base text-text">{outcome}</li>)}</ul><p className="mt-6 whitespace-pre-wrap text-base leading-7 text-text">{course.description}</p></div></section>)}
    {view === "lesson" && (locked ? <div role="status" className="flex items-start gap-3 border-y border-border py-5"><Lock size={20} className="mt-1 shrink-0 text-text" aria-hidden="true" /><div><h2 className="font-heading text-xl text-text">{t.admin.previewLocked}</h2><p className="mt-2 text-base text-text">{t.admin.previewLockedDescription}</p></div></div> : lessons.length === 0 ? <p className="border-y border-border py-5 text-base text-text">{t.admin.previewNoLessons}</p> : <section className="max-w-4xl"><label htmlFor="preview-lesson-select" className="mb-2 block text-base font-semibold text-text">{t.admin.previewLesson}</label><select id="preview-lesson-select" value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)} className="field-input mb-5">{lessons.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{lesson && <><p className="mb-2 text-sm text-text">{lesson.moduleTitle}{lesson.duration_minutes ? ` · ${lesson.duration_minutes} ${t.admin.minutesShort}` : ""}</p><h2 className="mb-4 font-heading text-2xl text-text">{lesson.title}</h2><LessonMedia lesson={lesson} /><RichContent html={lesson.body_html} />{lesson.try_it_yourself_prompt && <section className="mt-6 border-t border-border pt-5"><h3 className="font-heading text-xl text-text">{t.admin.tryItYourself}</h3><p className="mt-2 text-base text-text">{lesson.try_it_yourself_prompt}</p><textarea aria-label={t.admin.previewReflection} rows={4} className="field-input mt-3 min-h-24 resize-y" placeholder={t.admin.previewReflection} /><p className="mt-2 text-sm text-text">{t.admin.lessonReflectionNote}</p></section>}</>}</section>)}
  </div>;
}