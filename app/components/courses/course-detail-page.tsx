"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Lock } from "lucide-react";
import { use, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useCopy, type CopyDictionary } from "@/lib/copy/provider";
import { Button } from "@/components/ui/button";
import { ApiError, type CourseDetail, type CourseLesson } from "@/lib/api/index";
import { useCourseQuery } from "@/lib/queries/index";
import { CourseDetailPageSkeleton } from "@/components/ui/page-skeleton";

function moduleStatus(lessons: CourseLesson[], t: CopyDictionary) {
  if (lessons.length > 0 && lessons.every((lesson) => lesson.completed)) return t.learning.completed;
  if (lessons.some((lesson) => lesson.completed)) return t.learning.inProgress;
  return t.learning.notStarted;
}

function firstLesson(course: CourseDetail) {
  const lessons = course.modules
    .slice()
    .sort((left, right) => left.order - right.order)
    .flatMap((module) => module.lessons.slice().sort((left, right) => left.order - right.order));
  return lessons.find((lesson) => !lesson.completed) ?? lessons[0] ?? null;
}

export default function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useCopy();
  const query = useCourseQuery(courseId);
  const course = query.data ?? null;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const queryError = query.error;
  const errorStatus = queryError instanceof ApiError ? queryError.status : null;
  const state: "loading" | "ready" | "not-found" | "forbidden" | "error" = query.isError ? (errorStatus === 403 ? "forbidden" : errorStatus === 404 ? "not-found" : "error") : query.data ? "ready" : "loading";

  useEffect(() => { if (!accessToken || errorStatus === 401) router.replace("/login"); }, [accessToken, errorStatus, router]);

  const nextLesson = course ? firstLesson(course) : null;
  const currentModuleId = course?.modules.find((module) => module.lessons.some((lesson) => lesson.id === nextLesson?.id))?.id;
  if (state === "loading") return <main className="mx-auto min-h-screen max-w-6xl px-5 py-10 lg:px-8"><CourseDetailPageSkeleton /></main>;

  return (
    <div className="min-h-screen bg-background">
      <motion.main aria-label={t.learning.courseDetail} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
        {state === "not-found" && <div className="mx-auto max-w-3xl px-5 py-24 text-center lg:px-8"><h1 className="font-heading text-4xl text-text">{t.learning.courseNotFound}</h1><Link href="/courses" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={16} /> {t.learning.backToCourses}</Link></div>}
        {state === "forbidden" && <div className="mx-auto max-w-3xl px-5 py-24 text-center lg:px-8"><Lock size={30} className="mx-auto text-primary" /><h1 className="mt-5 font-heading text-4xl text-text">{t.learning.membershipRequired}</h1><p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-text">{t.learning.courseMembersDescription}</p><Link href="/services" className="mt-7 inline-flex items-center gap-2 rounded-[8px] bg-primary px-5 py-3 text-sm font-semibold text-white">{t.learning.exploreMembership} <ArrowRight size={16} /></Link></div>}
        {state === "error" && <div className="mx-auto max-w-3xl px-5 py-24 text-center lg:px-8"><h1 className="font-heading text-4xl text-text">{t.learning.loadCourseError}</h1><p className="mt-4 text-sm text-text">{t.learning.tryLater}</p></div>}
        {state === "ready" && course && <>
          <section className="bg-background">
            <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-10">
              <Link href="/courses" className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={16} /> {t.learning.coursesBreadcrumb}</Link>
              <div className="mt-6 rounded-[8px] border border-border bg-background p-6 sm:p-8">
                <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
                  <div><p className="eyebrow">{t.learning.courseDetail}</p><h1 className="mt-3 font-heading text-3xl leading-tight text-text sm:text-4xl">{course.title}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-text">{course.description || t.learning.workAtOwnPace}</p></div>
                  {nextLesson && <Link href={`/courses/${course.id}/lessons/${nextLesson.id}`} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[8px] bg-primary px-5 py-3 text-sm font-semibold text-white hover:opacity-90">                  {course.progress.completed_count ? t.learning.continueCourse : t.learning.startCourse} <ArrowRight size={16} /></Link>}
                </div>
                                  <div className="mt-8 max-w-xl"><div className="mb-2 flex justify-between text-xs text-text"><span>{t.learning.courseProgress.replace("{completed}", String(course.progress.completed_count)).replace("{total}", String(course.progress.total_count))}</span><span className="font-semibold text-primary">{course.progress.percent}%</span></div><div className="h-2 overflow-hidden rounded-[8px] bg-surface-alt"><div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${course.progress.percent}%` }} /></div></div>
              </div>
            </div>
          </section>
          <section className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16">
            <div className="mb-8">            <p className="eyebrow">{t.learning.courseOutline}</p><h2 className="font-heading text-2xl leading-tight text-text">{t.learning.learnInAnyOrder}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-text">{t.learning.outlineDescription}</p></div>
                        {course.modules.length === 0 ? <p className="border border-border bg-surface-alt p-5 text-sm text-text">{t.learning.noLessons}</p> : <div data-testid="course-outline" className="space-y-4">{course.modules.slice().sort((a, b) => a.order - b.order).map((module, index) => { const status = moduleStatus(module.lessons, t); const isOpen = expanded[module.id] ?? module.id === currentModuleId; return <article key={module.id} className="rounded-[8px] border border-border bg-background"><Button type="button" className="flex w-full items-center justify-between gap-4 p-5 text-left" onClick={() => setExpanded((current) => ({ ...current, [module.id]: !isOpen }))} aria-expanded={isOpen}><span className="flex items-start gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-surface-alt text-sm font-semibold text-primary">{index + 1}</span><span><span className="block font-heading text-xl text-text">{module.title}</span><span className="mt-1 block text-xs text-text">{module.lessons.length} {module.lessons.length === 1 ? t.learning.lesson : t.learning.lessons} · {status}</span></span></span><ChevronDown size={20} className={`shrink-0 text-text transition-transform ${isOpen ? "rotate-180" : ""}`} /></Button>{isOpen && <div className="border-t border-border px-5 pb-3">{module.lessons.slice().sort((a, b) => a.order - b.order).map((lesson, lessonIndex) => { const isCurrent = lesson.id === nextLesson?.id; return <Link key={lesson.id} href={`/courses/${course.id}/lessons/${lesson.id}`} aria-current={isCurrent ? "step" : undefined} className={`flex items-center justify-between gap-4 border-b border-border border-l-2 py-4 last:border-b-0 ${isCurrent ? "border-l-primary bg-primary/5 text-primary" : "border-l-transparent hover:text-primary"}`}><span className="flex items-center gap-3 text-sm text-text"><span className="w-6 text-xs text-text">{lessonIndex + 1}</span>{lesson.title}</span>{lesson.completed ? <CheckCircle2 size={18} className="shrink-0 text-primary" /> : isCurrent ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label={t.learning.currentLesson} /> : <ArrowRight size={17} className="shrink-0 text-text" />}</Link>; })}</div>}</article>; })}</div>}
          </section>
        </>}
      </motion.main>
    </div>
  );
}
