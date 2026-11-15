"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { APP_LOCALE, useCopy } from "@/lib/copy/provider";
import { useToast } from "@/components/ui/toast-provider";
import { ApiError, type AdminCourse } from "@/lib/api/index";
import { adminCourseKeys, invalidateAdminCourse, mapAdminCourseError, useAdminCourseImpact, useAdminCourseReadiness, useCoursePublicationMutation, useDeleteAdminCourseMutation } from "@/lib/queries/admin-courses";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/ui/primitives";
import { ReadinessChecklist, TypedConfirmDialog } from "@/components/admin/courses/course-primitives";

export function CourseReadinessDialog({ course, open, onClose, onGoTo }: { course: AdminCourse; open: boolean; onClose: () => void; onGoTo: (tab: "details" | "curriculum", field: string | null, lessonId: string | null) => void }) {
  const { t } = useCopy();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const readiness = useAdminCourseReadiness(course.id, open && course.status !== "published");
  const publication = useCoursePublicationMutation();
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const pending = useRef(false);
  const isPublished = course.status === "published";
  const failures = readiness.data?.checks.filter((check) => !check.passed && check.severity === "error") ?? [];
  const warnings = readiness.data?.checks.filter((check) => !check.passed && check.severity === "warning") ?? [];

  function publish() {
    if (pending.current || publication.isPending || (!isPublished && failures.length)) return;
    pending.current = true;
    publication.mutate({ courseId: course.id, publish: !isPublished }, {
      onSuccess: (updated) => {
        pending.current = false;
        setServerErrors([]);
        queryClient.setQueryData(adminCourseKeys.detail(course.id), (current: unknown) => current && typeof current === "object" ? { ...current, ...updated } : current);
        invalidateAdminCourse(queryClient, course.id);
        addToast(isPublished ? t.admin.courseUnpublished : t.admin.coursePublished, isPublished ? t.admin.courseUnpublished : t.admin.coursePublished, "success");
        onClose();
      },
      onError: (error) => {
        pending.current = false;
        const failure = mapAdminCourseError(error, { stale: t.admin.staleCourse, notReady: t.admin.serverReadinessErrors, invalid: t.admin.courseValidation, generic: t.admin.publishFailed });
        setServerErrors(failure.kind === "not_ready" ? failure.readinessErrors.map((item) => {
          const message = item.message;
          return message && typeof message === "object" ? String((message as Record<string, unknown>)[APP_LOCALE]) : String(item.msg ?? failure.message);
        }) : []);
        addToast(t.admin.publishFailed, failure.message, "error");
      },
    });
  }

  const errorCount = isPublished ? 0 : failures.length;
  const canPublish = isPublished || Boolean(readiness.data && !readiness.isError && !readiness.isLoading && errorCount === 0);

  return <ConfirmDialog open={open} title={isPublished ? t.admin.unpublishTitle : t.admin.readinessTitle} description={isPublished ? t.admin.unpublishDescription : t.admin.readinessDescription} confirmLabel={isPublished ? t.admin.unpublish : t.admin.publishCourse} cancelLabel={t.admin.cancel} busy={publication.isPending} confirmDisabled={!canPublish} onClose={onClose} onConfirm={publish}>
    {isPublished ? <p className="rounded-[8px] border border-border bg-surface-alt p-3 text-base text-text">{t.admin.unpublishImpact}</p> : <div className="space-y-4">
      {readiness.isLoading && <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((row) => <div key={row} className="h-10 animate-pulse rounded-[8px] bg-surface-alt" />)}</div>}
      {readiness.isError && <div role="alert" className="flex items-center justify-between gap-3"><p className="text-base text-text">{t.admin.readinessLoadError}</p><Button type="button" loading={readiness.isFetching} loadingLabel={t.admin.retry} onClick={() => void readiness.refetch()} className="min-h-10 rounded-[8px] border border-border px-3 text-sm font-semibold text-primary">{t.admin.retry}</Button></div>}
      {readiness.data && <><p className="text-base font-semibold text-text" aria-live="polite">{errorCount ? t.admin.readinessErrorsRemain.replace("{count}", String(errorCount)) : t.admin.readinessReady}</p><ReadinessChecklist readiness={readiness.data} onGoTo={(check) => { onClose(); onGoTo(check.tab, check.field, check.lesson_id); }} />{warnings.length > 0 && <p className="border-t border-border pt-3 text-sm text-text">{t.admin.readinessWarnings.replace("{count}", String(warnings.length))}</p>}</>}
      {serverErrors.length > 0 && <div role="alert" className="space-y-2 border-t border-border pt-3"><p className="font-semibold text-text">{t.admin.serverReadinessErrors}</p>{serverErrors.map((message, index) => <p key={index} className="text-sm text-text">{message}</p>)}</div>}
    </div>}
  </ConfirmDialog>;

}

export function CourseDeleteDialog({ course, open, onClose, onDeleted }: { course: AdminCourse; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const { t } = useCopy();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [typedTitle, setTypedTitle] = useState("");
  const impact = useAdminCourseImpact(course.id, open);
  const remove = useDeleteAdminCourseMutation();
  const requiresTypedConfirm = course.status === "published" || (impact.data?.learners_with_progress ?? 0) > 0;
  const description = impact.data
    ? t.admin.courseImpactSummary.replace("{modules}", String(impact.data.module_count)).replace("{lessons}", String(impact.data.lesson_count)).replace("{learners}", String(impact.data.learners_with_progress))
    : t.admin.loadingImpact;

  function confirmDelete() {
    if (remove.isPending || !impact.data || impact.isError || requiresTypedConfirm && typedTitle !== course.title) return;
    remove.mutate({ courseId: course.id, confirmation: requiresTypedConfirm ? { confirm_progress_loss: true, confirm_title: typedTitle } : undefined }, {
      onSuccess: () => {
        addToast(t.admin.courseDeleted, t.admin.courseDeleted, "success");
        invalidateAdminCourse(queryClient, course.id);
        setTypedTitle("");
        onDeleted();
      },
      onError: (error) => addToast(t.admin.deleteRecordTitle, error instanceof ApiError ? error.message : t.admin.deleteRecordDescription, "error"),
    });
  }

  return <TypedConfirmDialog open={open} title={t.admin.deleteCourseTitle} description={description} expectedTitle={requiresTypedConfirm ? course.title : ""} value={typedTitle} onChange={setTypedTitle} confirmLabel={t.admin.deleteCourse} cancelLabel={t.admin.cancel} busy={remove.isPending} requireTyping={requiresTypedConfirm} confirmDisabled={impact.isLoading || impact.isError || !impact.data} onClose={() => { setTypedTitle(""); onClose(); }} onConfirm={confirmDelete}>
    {impact.isLoading && <div className="h-12 animate-pulse rounded-[8px] bg-surface-alt" aria-busy="true" />}
    {impact.isError && <div role="alert" className="flex items-center justify-between gap-3"><p className="text-base text-text">{t.admin.impactLoadError}</p><Button type="button" loading={impact.isFetching} loadingLabel={t.admin.retry} onClick={() => void impact.refetch()} className="min-h-10 rounded-[8px] border border-border px-3 text-sm font-semibold text-primary">{t.admin.retry}</Button></div>}
  </TypedConfirmDialog>;
}