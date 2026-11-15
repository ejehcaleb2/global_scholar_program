"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, LoaderCircle, Lock } from "lucide-react";
import { use, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useCopy } from "@/lib/copy/provider";
import { Button } from "@/components/ui/button";
import { ApiError, completeLesson, getApiErrorMessage, uncompleteLesson, type CourseDetail, type CourseLesson, type CourseModule } from "@/lib/api/index";
import { queryKeys, useCourseQuery } from "@/lib/queries/index";
import { useQueryClient } from "@tanstack/react-query";
import { LessonMedia } from "@/components/courses/lesson-media";
import { RichContent } from "@/components/ui/rich-content";
import { LessonPageSkeleton } from "@/components/ui/page-skeleton";
import { useToast } from "@/components/ui/toast-provider";

function orderedLessons(modules: CourseModule[]) {
  return modules.slice().sort((a, b) => a.order - b.order).flatMap((module) => module.lessons.slice().sort((a, b) => a.order - b.order).map((lesson) => ({ lesson, module })));
}

export default function LessonViewerPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = use(params);
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useCopy();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const query = useCourseQuery(courseId);
  const course = query.data ?? null;
  const match = course ? orderedLessons(course.modules).find(({ lesson: item }) => item.id === lessonId) ?? null : null;
  const lesson: CourseLesson | null = match?.lesson ?? null;
  const currentModule: CourseModule | null = match?.module ?? null;
  const errorStatus = query.error instanceof ApiError ? query.error.status : null;
  const state: "loading" | "ready" | "not-found" | "forbidden" | "error" = query.isError ? (errorStatus === 403 ? "forbidden" : errorStatus === 404 ? "not-found" : "error") : course ? (match ? "ready" : "not-found") : "loading";
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");

  useEffect(() => { if (!accessToken || errorStatus === 401) router.replace("/login"); }, [accessToken, errorStatus, router]);

  async function toggleComplete() {
    if (!lesson || !course || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = lesson.completed ? await uncompleteLesson(lesson.id) : await completeLesson(lesson.id);
      queryClient.setQueryData<CourseDetail>(queryKeys.course(courseId), (current) => current ? { ...current, progress: response.progress, modules: current.modules.map((item) => ({ ...item, lessons: item.lessons.map((entry) => entry.id === lesson.id ? { ...entry, completed: response.completed } : entry) })) } : current);
      void queryClient.invalidateQueries({ queryKey: ["courses", "list"] });
      addToast(response.completed ? t.learning.completed : t.learning.notStarted, response.completed ? t.learning.progressSaved : t.learning.progressRemoved, "success");
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, t.learning.progressError);
      setActionError(message);
      addToast(t.common.errorTitle, message, "error");
    } finally {
      setSaving(false);
    }
  }

  const sequence = course ? orderedLessons(course.modules) : [];
  if (state === "loading") return <LessonPageSkeleton />;
  const currentIndex = sequence.findIndex(({ lesson: item }) => item.id === lessonId);
  const previous = currentIndex > 0 ? sequence[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < sequence.length - 1 ? sequence[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-background">
      <motion.main initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
        {state === "forbidden" && <div className="mx-auto max-w-3xl px-5 py-24 text-center lg:px-8"><Lock size={30} className="mx-auto text-primary" /><h1 className="mt-5 font-heading text-4xl text-text">{t.learning.membershipRequired}</h1><p className="mt-4 text-sm leading-6 text-text">{t.learning.lessonMembersDescription}</p><Link href="/services" className="mt-7 inline-flex items-center gap-2 rounded-[8px] bg-primary px-5 py-3 text-sm font-semibold text-white">{t.learning.exploreMembership} <ArrowRight size={16} /></Link></div>}
        {state === "not-found" && <div className="mx-auto max-w-3xl px-5 py-24 text-center lg:px-8"><h1 className="font-heading text-4xl text-text">{t.learning.lessonNotFound}</h1><p className="mt-4 text-sm text-text">{t.learning.lessonNotFoundDescription}</p><Link href={`/courses/${courseId}`} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={16} /> {t.learning.backToCourse}</Link></div>}
        {state === "error" && <div className="mx-auto max-w-3xl px-5 py-24 text-center lg:px-8"><h1 className="font-heading text-4xl text-text">{t.learning.loadLessonError}</h1><p className="mt-4 text-sm text-text">{t.learning.tryLater}</p></div>}
        {state === "ready" && course && lesson && currentModule && <article className="mx-auto max-w-3xl px-5 py-10 lg:px-8 lg:py-16">
          <nav aria-label={t.learning.breadcrumb} className="flex flex-wrap items-center gap-2 text-xs text-text"><Link href="/courses" className="hover:text-primary">{t.learning.coursesBreadcrumb}</Link><span aria-hidden="true">/</span><Link href={`/courses/${course.id}`} className="hover:text-primary">{course.title}</Link><span aria-hidden="true">/</span><span>{lesson.title}</span></nav>
          <div className="mt-10 border-b border-border pb-8"><p className="eyebrow">{currentModule.title}</p><h1 className="mt-3 font-heading text-3xl leading-tight text-text sm:text-4xl">{lesson.title}</h1><p className="mt-4 text-sm text-text">{t.learning.lessonPosition.replace("{current}", String(currentIndex + 1)).replace("{total}", String(sequence.length)).replace("{module}", currentModule.title)}</p></div>
          <LessonMedia lesson={lesson} /><RichContent className="mt-10" html={lesson.body_html} />
          {lesson.try_it_yourself_prompt?.trim() && <section className="mt-10 rounded-[8px] bg-surface-alt p-5 sm:p-6"><p className="text-sm font-semibold text-primary">{t.learning.tryItYourself}</p><p className="mt-3 text-sm leading-6 text-text">{lesson.try_it_yourself_prompt}</p><label htmlFor="reflection" className="sr-only">{t.learning.reflection}</label><textarea id="reflection" value={reflection} onChange={(event) => setReflection(event.target.value)} className="field-input mt-5 min-h-36 resize-y" placeholder={t.learning.reflectionPlaceholder} /><p className="mt-2 text-xs text-text">{t.learning.reflectionNotSaved}</p></section>}
          <div className="mt-10 border-t border-border pt-8"><Button type="button" onClick={toggleComplete} disabled={saving} className={`inline-flex items-center gap-2 rounded-[8px] px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${lesson.completed ? "border border-border bg-background text-text" : "bg-primary text-white"}`}>{saving ? <LoaderCircle size={17} className="animate-spin" /> : lesson.completed ? <CheckCircle2 size={17} /> : <Check size={17} />}{lesson.completed ? t.learning.completed : t.learning.markComplete}</Button>{actionError && <p role="alert" className="mt-3 text-sm text-text">{actionError}</p>}</div>
          <nav aria-label={t.learning.lessonNavigation} className="mt-12 flex items-center justify-between gap-4 border-t border-border pt-6">{previous ? <Link href={`/courses/${course.id}/lessons/${previous.lesson.id}`} className="inline-flex max-w-[48%] items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={17} /><span className="truncate">{previous.lesson.title}</span></Link> : <span />}{next ? <Link href={`/courses/${course.id}/lessons/${next.lesson.id}`} className="inline-flex max-w-[48%] items-center gap-2 text-right text-sm font-semibold text-primary"><span className="truncate">{next.lesson.title}</span><ArrowRight size={17} /></Link> : <span />}</nav>
        </article>}
      </motion.main>
    </div>
  );
}
