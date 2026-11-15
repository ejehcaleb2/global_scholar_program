"use client";

import Link from "@/components/ui/pending-link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Copy, CircleAlert, Clock3, FileText, Layers3, Plus, Trash2 } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import { duplicateAdminLesson, createAdminLesson, createAdminModule, deleteAdminLesson, deleteAdminModule, getAdminLessonImpact, getAdminModuleImpact, getApiErrorMessage, reorderAdminCourseStructure, updateAdminModule, type CourseLesson, type CourseModule } from "@/lib/api/index";
import { adminCourseKeys, invalidateAdminCourse } from "@/lib/queries/admin-courses";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, EmptyState, FormField } from "@/components/admin/ui/primitives";
import { KebabMenu, type KebabAction } from "@/components/admin/courses/course-primitives";
import { useCourseHub } from "@/components/admin/courses/course-hub";
import { useHydrated } from "@/components/ui/use-hydrated";

type DeleteTarget = { kind: "module" | "lesson"; id: string; moduleId: string; title: string };

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === "boolean");
}

export function CourseCurriculum() {
  const course = useCourseHub();
  const { t } = useCopy();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { addToast } = useToast();
  const hydrated = useHydrated();
  const [search, setSearch] = useState("");
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newLessonTitles, setNewLessonTitles] = useState<Record<string, string>>({});
  const [renamingModule, setRenamingModule] = useState<string | null>(null);
  const [moduleTitle, setModuleTitle] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ module: CourseModule; lesson: CourseLesson } | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [confirmTitle, setConfirmTitle] = useState("");
  const impacts = useQuery({
    queryKey: ["admin", "course-structure", "impact", deleteTarget?.kind, deleteTarget?.id],
    enabled: Boolean(deleteTarget),
    queryFn: async () => {
      if (!deleteTarget) return { lesson_count: 0, learners_with_progress: 0 };
      if (deleteTarget.kind === "module") {
        const result = await getAdminModuleImpact(deleteTarget.id);
        return { lesson_count: result.lesson_count, learners_with_progress: result.learners_with_progress };
      }
      const result = await getAdminLessonImpact(deleteTarget.id);
      return { lesson_count: 1, learners_with_progress: result.learners_with_progress };
    },
  });
  const storageKey = `gsp_course_outline_${course.id}`;

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (isBooleanRecord(parsed)) queueMicrotask(() => {
        if (!cancelled) setCollapsed(parsed);
      });
      else window.localStorage.removeItem(storageKey);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      window.localStorage.removeItem(storageKey);
    }
    return () => {
      cancelled = true;
    };
  }, [hydrated, storageKey]);

  function setModuleCollapsed(moduleId: string, value: boolean) {
    setCollapsed((current) => {
      const next = { ...current, [moduleId]: value };
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  function refreshCourse() {
    invalidateAdminCourse(queryClient, course.id);
    void queryClient.invalidateQueries({ queryKey: adminCourseKeys.lists() });
  }

  const createModule = useMutation({
    mutationFn: (title: string) => createAdminModule(course.id, { title, order: course.modules.length }),
    onSuccess: () => { setNewModuleTitle(""); refreshCourse(); addToast(t.admin.moduleCreated, t.admin.moduleCreated, "success"); },
    onError: (error) => addToast(t.admin.moduleCreateFailed, getApiErrorMessage(error, t.admin.moduleCreateFailed), "error"),
  });
  const renameModule = useMutation({
    mutationFn: ({ module, title }: { module: CourseModule; title: string }) => updateAdminModule(course.id, module.id, { title, expected_updated_at: module.updated_at ?? undefined }),
    onSuccess: () => { setRenamingModule(null); refreshCourse(); addToast(t.admin.structureSaved, t.admin.structureSaved, "success"); },
    onError: (error) => addToast(t.admin.structureSaveFailed, getApiErrorMessage(error, t.admin.structureSaveFailed), "error"),
  });
  const createLesson = useMutation({
    mutationFn: ({ module, title }: { module: CourseModule; title: string }) => createAdminLesson(module.id, { title, body_html: "", try_it_yourself_prompt: null, order: module.lessons.length }),
    onSuccess: () => { refreshCourse(); addToast(t.admin.lessonCreated, t.admin.lessonCreated, "success"); },
    onError: (error) => addToast(t.admin.lessonCreateFailed, getApiErrorMessage(error, t.admin.lessonCreateFailed), "error"),
  });
  const reorder = useMutation({
    mutationFn: (modules: CourseModule[]) => reorderAdminCourseStructure(course.id, course.structure_revision, modules.map((module) => ({ id: module.id, lessons: module.lessons.map((lesson) => ({ id: lesson.id })) }))),
    onSuccess: () => { refreshCourse(); addToast(t.admin.structureSaved, t.admin.structureSaved, "success"); },
    onError: (error) => { refreshCourse(); addToast(t.admin.structureSaveFailed, getApiErrorMessage(error, t.admin.structureSaveFailed), "error"); },
  });
  const duplicateLesson = useMutation({
    mutationFn: (lessonId: string) => duplicateAdminLesson(lessonId),
    onSuccess: () => { refreshCourse(); addToast(t.admin.lessonDuplicated, t.admin.lessonDuplicated, "success"); },
    onError: (error) => addToast(t.admin.structureSaveFailed, getApiErrorMessage(error, t.admin.structureSaveFailed), "error"),
  });
  const removeModule = useMutation({
    mutationFn: (target: DeleteTarget) => deleteAdminModule(course.id, target.id, (course.status === "published" || impacts.data?.learners_with_progress) ? { confirm_progress_loss: true, confirm_title: confirmTitle } : undefined),
    onSuccess: () => { closeDelete(); refreshCourse(); addToast(t.admin.structureSaved, t.admin.contentDeleted, "success"); },
    onError: (error) => addToast(t.admin.structureSaveFailed, getApiErrorMessage(error, t.admin.structureSaveFailed), "error"),
  });
  const removeLesson = useMutation({
    mutationFn: (target: DeleteTarget) => deleteAdminLesson(target.moduleId, target.id, (course.status === "published" || impacts.data?.learners_with_progress) ? { confirm_progress_loss: true, confirm_title: confirmTitle } : undefined),
    onSuccess: () => { closeDelete(); refreshCourse(); addToast(t.admin.structureSaved, t.admin.contentDeleted, "success"); },
    onError: (error) => addToast(t.admin.structureSaveFailed, getApiErrorMessage(error, t.admin.structureSaveFailed), "error"),
  });

  function closeDelete() {
    setDeleteTarget(null);
    setConfirmTitle("");
    void queryClient.invalidateQueries({ queryKey: adminCourseKeys.impact(course.id) });
  }

  const visibleModules = useMemo(() => course.modules.map((module) => ({
    ...module,
    lessons: module.lessons.filter((lesson) => lesson.title.toLowerCase().includes(search.trim().toLowerCase())),
  })).filter((module) => !search.trim() || module.title.toLowerCase().includes(search.trim().toLowerCase()) || module.lessons.length > 0), [course.modules, search]);
  const totalLessons = course.modules.reduce((count, module) => count + module.lessons.length, 0);
  const totalMinutes = course.modules.reduce((sum, module) => sum + module.lessons.reduce((moduleSum, lesson) => moduleSum + lesson.duration_minutes, 0), 0);
  const targetImpact = deleteTarget?.kind === "module" ? impacts.data?.learners_with_progress ?? 0 : impacts.data?.learners_with_progress ?? 0;
  const requiresConfirmation = course.status === "published" || targetImpact > 0;
  const deleteBusy = removeModule.isPending || removeLesson.isPending;

  function moveModule(moduleIndex: number, offset: -1 | 1) {
    const next = [...course.modules];
    const destination = moduleIndex + offset;
    if (destination < 0 || destination >= next.length) return;
    [next[moduleIndex], next[destination]] = [next[destination], next[moduleIndex]];
    reorder.mutate(next);
  }

  function moveLesson(module: CourseModule, lessonIndex: number, offset: -1 | 1) {
    const destination = lessonIndex + offset;
    if (destination < 0 || destination >= module.lessons.length) return;
    const next = course.modules.map((item) => item.id === module.id ? { ...item, lessons: [...item.lessons] } : item);
    const selected = next.find((item) => item.id === module.id);
    if (!selected) return;
    [selected.lessons[lessonIndex], selected.lessons[destination]] = [selected.lessons[destination], selected.lessons[lessonIndex]];
    reorder.mutate(next);
  }

  function moduleActions(module: CourseModule, index: number): KebabAction[] {
    return [
      { id: "rename", label: t.admin.renameShort, icon: FileText, onSelect: () => { setRenamingModule(module.id); setModuleTitle(module.title); } },
      { id: "up", label: t.admin.moveUp, icon: ChevronDown, loading: reorder.isPending, disabled: index === 0 || reorder.isPending, onSelect: () => moveModule(index, -1) },
      { id: "down", label: t.admin.moveDown, icon: ChevronDown, loading: reorder.isPending, disabled: index === course.modules.length - 1 || reorder.isPending, onSelect: () => moveModule(index, 1) },
      { id: "delete", label: t.admin.deleteModule, icon: Trash2, onSelect: () => setDeleteTarget({ kind: "module", id: module.id, moduleId: module.id, title: module.title }) },
    ];
  }

  function lessonActions(module: CourseModule, lesson: CourseLesson, index: number): KebabAction[] {
    return [
        { id: "edit", label: t.admin.editContent, icon: FileText, onSelect: () => { router.push(`/admin/courses/${course.id}/lessons/${lesson.id}`); } },
      { id: "duplicate", label: t.admin.duplicateLesson, icon: Copy, loading: duplicateLesson.isPending && duplicateLesson.variables === lesson.id, onSelect: () => duplicateLesson.mutate(lesson.id) },
      { id: "move", label: t.admin.moveToModule, icon: Layers3, disabled: course.modules.length < 2, disabledReason: t.admin.moveNeedsModule, onSelect: () => { setMoveTarget({ module, lesson }); setDestinationId(course.modules.find((item) => item.id !== module.id)?.id ?? ""); } },
      { id: "up", label: t.admin.moveUp, icon: ChevronDown, loading: reorder.isPending, disabled: index === 0 || reorder.isPending, onSelect: () => moveLesson(module, index, -1) },
      { id: "down", label: t.admin.moveDown, icon: ChevronDown, loading: reorder.isPending, disabled: index === module.lessons.length - 1 || reorder.isPending, onSelect: () => moveLesson(module, index, 1) },
      { id: "delete", label: t.admin.deleteLesson, icon: Trash2, onSelect: () => setDeleteTarget({ kind: "lesson", id: lesson.id, moduleId: module.id, title: lesson.title }) },
    ];
  }

  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
    <section aria-label={t.admin.courseOutline} className="min-w-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-heading text-xl text-text">{t.admin.courseOutline}</h2><p className="mt-1 text-sm text-text">{t.admin.curriculumCounts.replace("{modules}", String(course.modules.length)).replace("{lessons}", String(totalLessons))}</p></div>
        <label className="sr-only" htmlFor="curriculum-search">{t.admin.searchCurriculum}</label><input id="curriculum-search" value={search} onChange={(event) => setSearch(event.target.value)} className="field-input min-h-11 w-full sm:w-64" placeholder={t.admin.searchCurriculum} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => { const next = Object.fromEntries(course.modules.map((module) => [module.id, false])); setCollapsed(next); window.localStorage.setItem(storageKey, JSON.stringify(next)); }} className="min-h-10 rounded-[8px] px-3 text-sm">{t.admin.expandAll}</Button>
        <Button type="button" variant="secondary" onClick={() => { const next = Object.fromEntries(course.modules.map((module) => [module.id, true])); setCollapsed(next); window.localStorage.setItem(storageKey, JSON.stringify(next)); }} className="min-h-10 rounded-[8px] px-3 text-sm">{t.admin.collapseAll}</Button>
      </div>
      {course.modules.length === 0 ? <EmptyState title={t.admin.noModules} description={t.admin.addFirstModuleDescription} icon={Layers3} /> : visibleModules.length === 0 ? <EmptyState title={t.admin.noCurriculumResults} description={t.admin.noCurriculumResultsDescription} icon={FileText} /> : <div className="space-y-3">{visibleModules.map((module) => {
        const moduleIndex = course.modules.findIndex((item) => item.id === module.id);
        const isCollapsed = collapsed[module.id] ?? false;
        return <section key={module.id} className="rounded-[8px] border border-border bg-background p-4">
          <div className="flex items-center gap-2">

            <Button type="button" aria-label={isCollapsed ? t.admin.expandModule : t.admin.collapseModule} aria-expanded={!isCollapsed} onClick={() => setModuleCollapsed(module.id, !isCollapsed)} className="h-10 w-10 shrink-0 rounded-[8px] text-text">{isCollapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}</Button>
            {renamingModule === module.id ? <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); const title = moduleTitle.trim(); if (title && title !== module.title) renameModule.mutate({ module, title }); else setRenamingModule(null); }}><label className="sr-only" htmlFor={`module-title-${module.id}`}>{t.admin.renameModule}</label><input id={`module-title-${module.id}`} autoFocus value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} className="field-input min-h-10" maxLength={255} /><Button type="submit" loading={renameModule.isPending} className="min-h-10 rounded-[8px] bg-primary px-3 text-sm font-semibold text-white">{t.admin.saveStructureAction}</Button><Button type="button" onClick={() => setRenamingModule(null)} className="min-h-10 rounded-[8px] px-3 text-sm text-text">{t.admin.cancelStructureAction}</Button></form> : <div className="min-w-0 flex-1"><h3 className="truncate text-base font-semibold text-text">{moduleIndex + 1}. {module.title}</h3><p className="mt-1 text-sm text-text">{t.admin.moduleLessonCount.replace("{count}", String(module.lessons.length))}</p></div>}
            <KebabMenu label={`${t.admin.courseActions}: ${module.title}`} actions={moduleActions(module, moduleIndex)} />
          </div>
          {!isCollapsed && <div className="mt-3 border-l border-border pl-3 sm:ml-12 sm:pl-4">
            {module.lessons.length === 0 ? <p className="py-3 text-sm text-text">{t.admin.noLessonsInModule}</p> : <ol className="space-y-1">{module.lessons.map((lesson, index) => <li key={lesson.id} className="flex min-h-12 items-center gap-2 rounded-[8px] px-2 hover:bg-surface-alt">

              <span className="w-6 shrink-0 text-sm text-text">{index + 1}.</span>
              <Link href={`/admin/courses/${course.id}/lessons/${lesson.id}`} className="min-w-0 flex-1 truncate text-base text-primary hover:underline">{lesson.title}</Link>
              {lesson.duration_minutes > 0 && <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-text"><Clock3 size={16} aria-hidden="true" />{lesson.duration_minutes} {t.admin.minutesShort}</span>}
              {!lesson.body_html.replace(/<[^>]*>/g, "").trim() && <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-text"><CircleAlert size={16} aria-hidden="true" />{t.admin.lessonBodyEmpty}</span>}
              <KebabMenu label={`${t.admin.courseActions}: ${lesson.title}`} actions={lessonActions(module, lesson, index)} />
            </li>)}</ol>}
            <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); const title = (newLessonTitles[module.id] ?? "").trim(); if (title) createLesson.mutate({ module, title }, { onSuccess: () => setNewLessonTitles((current) => ({ ...current, [module.id]: "" })) }); }}>
              <label className="sr-only" htmlFor={`new-lesson-${module.id}`}>{t.admin.addLesson}</label>
              <input id={`new-lesson-${module.id}`} value={newLessonTitles[module.id] ?? ""} onChange={(event) => setNewLessonTitles((current) => ({ ...current, [module.id]: event.target.value }))} className="field-input min-h-11 flex-1" maxLength={255} placeholder={t.admin.newLessonTitle} />
              <Button type="submit" loading={createLesson.isPending && createLesson.variables?.module.id === module.id} title={!(newLessonTitles[module.id] ?? "").trim() ? t.admin.lessonTitleReason : undefined} disabled={createLesson.isPending || !(newLessonTitles[module.id] ?? "").trim()} className="min-h-11 gap-2 rounded-[8px] bg-primary px-4 text-sm font-semibold text-white"><Plus size={16} aria-hidden="true" />{t.admin.addLesson}</Button>
            </form>
          </div>}
        </section>;
      })}</div>}
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); const title = newModuleTitle.trim(); if (title) createModule.mutate(title); }}>
        <label className="sr-only" htmlFor="new-module-title">{t.admin.addModule}</label>
        <input id="new-module-title" value={newModuleTitle} onChange={(event) => setNewModuleTitle(event.target.value)} className="field-input min-h-11 flex-1" maxLength={255} placeholder={t.admin.newModuleTitle} />
        <Button type="submit" loading={createModule.isPending} title={!newModuleTitle.trim() ? t.admin.moduleTitleReason : undefined} disabled={!newModuleTitle.trim()} className="min-h-11 gap-2 rounded-[8px] bg-primary px-4 text-sm font-semibold text-white"><Plus size={16} aria-hidden="true" />{t.admin.addModule}</Button>
      </form>
    </section>
    <aside className="border-t border-border pt-5 xl:sticky xl:top-28 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
      <h2 className="font-heading text-xl text-text">{t.admin.curriculumSummary}</h2>
      <dl className="mt-4 divide-y divide-border border-y border-border text-base">
        <div className="flex items-center justify-between gap-4 py-3"><dt className="text-text">{t.admin.modules}</dt><dd className="font-semibold text-text">{course.modules.length}</dd></div>
        <div className="flex items-center justify-between gap-4 py-3"><dt className="text-text">{t.admin.lessons}</dt><dd className="font-semibold text-text">{totalLessons}</dd></div>
        <div className="flex items-center justify-between gap-4 py-3"><dt className="text-text">{t.admin.totalDuration}</dt><dd className="font-semibold text-text">{totalMinutes} {t.admin.minutesShort}</dd></div>
      </dl>
      <p className="mt-4 text-base text-text">{t.admin.curriculumReadinessHint}</p>
    </aside>
    <ConfirmDialog open={Boolean(moveTarget)} title={t.admin.moveToModule} description={t.admin.moveLessonDescription} confirmLabel={t.admin.moveToModule} cancelLabel={t.admin.cancel} busy={reorder.isPending} confirmDisabled={!destinationId} onClose={() => { if (!reorder.isPending) setMoveTarget(null); }} onConfirm={() => {
      if (!moveTarget || !destinationId || reorder.isPending) return;
      const next = course.modules.map((item) => ({ ...item, lessons: item.id === destinationId ? [...item.lessons, moveTarget.lesson] : item.lessons.filter((lesson) => lesson.id !== moveTarget.lesson.id) }));
      reorder.mutate(next, { onSuccess: () => setMoveTarget(null) });
    }}>
      <FormField label={t.admin.destinationModule} htmlFor="destination-module"><select id="destination-module" value={destinationId} onChange={(event) => setDestinationId(event.target.value)} className="field-input">{course.modules.filter((item) => item.id !== moveTarget?.module.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></FormField>
    </ConfirmDialog>
    <ConfirmDialog open={Boolean(deleteTarget)} title={t.admin.deleteContentTitle} description={t.admin.deleteContentDescription} confirmLabel={t.admin.delete} cancelLabel={t.admin.cancelStructureAction} onClose={closeDelete} busy={deleteBusy} confirmDisabled={impacts.isLoading || Boolean(impacts.error) || requiresConfirmation && confirmTitle !== deleteTarget?.title} onConfirm={() => { if (!deleteTarget) return; if (deleteTarget.kind === "module") removeModule.mutate(deleteTarget); else removeLesson.mutate(deleteTarget); }}>
      {impacts.isLoading ? <p className="text-base text-text">{t.admin.loadingImpact}</p> : impacts.isError ? <div role="alert" className="space-y-2"><p className="text-base text-text">{t.admin.impactLoadError}</p><Button type="button" onClick={() => void impacts.refetch()} className="min-h-10 rounded-[8px] px-3 text-sm font-semibold text-primary">{t.admin.retry}</Button></div> : <><p className="text-base text-text">{t.admin.impactSummary.replace("{modules}", String(deleteTarget?.kind === "module" ? 1 : 0)).replace("{lessons}", String(deleteTarget?.kind === "lesson" ? 1 : impacts.data?.lesson_count ?? 0)).replace("{learners}", String(targetImpact))}</p>{requiresConfirmation && <FormField label={t.admin.typeCourseTitle.replace("{title}", deleteTarget?.title ?? "")} htmlFor="confirm-delete-structure"><input id="confirm-delete-structure" value={confirmTitle} onChange={(event) => setConfirmTitle(event.target.value)} className="field-input" autoComplete="off" /></FormField>}</>}
    </ConfirmDialog>
  </div>;
}