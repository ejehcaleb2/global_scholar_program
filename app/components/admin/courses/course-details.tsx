"use client";

import { useSearchParams } from "next/navigation";
import { useUploadFeedback } from "@/components/ui/use-upload-feedback";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Plus, Trash2 } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import { ApiError, getAdminCourse, getApiErrorMessage, updateAdminCourse, uploadAdminMedia, type AdminCourseDetail } from "@/lib/api/index";
import { adminCourseKeys, invalidateAdminCourse } from "@/lib/queries/admin-courses";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, FormField, StaleChangeDialog } from "@/components/admin/ui/primitives";
import { SaveStatusIndicator, useUnsavedChanges } from "@/components/admin/courses/course-primitives";
import { useCourseHub } from "@/components/admin/courses/course-hub";
import { MediaImage } from "@/components/ui/media-image";
import { CourseCatalogCard, StudentCourseHeader } from "@/components/courses/course-student-ui";

type DetailsDraft = Pick<AdminCourseDetail, "title" | "summary" | "description" | "thumbnail_url" | "learning_outcomes" | "access_type">;

function toDraft(course: AdminCourseDetail): DetailsDraft {
  return {
    title: course.title,
    summary: course.summary,
    description: course.description,
    thumbnail_url: course.thumbnail_url,
    learning_outcomes: [...course.learning_outcomes],
    access_type: course.access_type,
  };
}

export function CourseDetails() {
  const course = useCourseHub();
  const { t } = useCopy();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const uploadInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<DetailsDraft>(() => toDraft(course));
  const [updatedAt, setUpdatedAt] = useState(course.updated_at ?? "");
  const [saveFailed, setSaveFailed] = useState(false);
  const [staleOpen, setStaleOpen] = useState(false);
  const [staleAction, setStaleAction] = useState<"keep" | "load" | null>(null);
  const [accessConfirmation, setAccessConfirmation] = useState<DetailsDraft["access_type"] | null>(null);
  const [coverError, setCoverError] = useState("");
    const [previewTier, setPreviewTier] = useState<"free" | "paid">("free");
  const field = useSearchParams().get("field");
  useEffect(() => {
    const ids: Record<string, string> = { title: "details-title", summary: "details-summary", thumbnail_url: "details-cover-action", learning_outcomes: "details-outcomes" };
    const target = field ? document.getElementById(ids[field] ?? `details-${field}`) : null;
    target?.scrollIntoView({ block: "center", behavior: "instant" });
    target?.focus({ preventScroll: true });
  }, [field]);
  const original = toDraft(course);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  const uploadFeedback = useUploadFeedback(t.admin.uploadFailed, t.admin.uploadFailed);
  const upload = useMutation({
    mutationFn: uploadAdminMedia,
    onSuccess: ({ url }) => { setDraft((current) => ({ ...current, thumbnail_url: url })); setCoverError(""); addToast(t.admin.uploadCourseCover, t.admin.uploadCourseCover, "success"); },
    onError: (error) => setCoverError(uploadFeedback.error(error)),
  });

  const save = useMutation({
    mutationFn: () => updateAdminCourse(course.id, { ...draft, expected_updated_at: updatedAt || undefined }),
    onSuccess: (updated) => {
      const next = { ...course, ...updated };
      queryClient.setQueryData<AdminCourseDetail>(adminCourseKeys.detail(course.id), (current) => current ? { ...current, ...next } : current);
      invalidateAdminCourse(queryClient, course.id);
      setUpdatedAt(updated.updated_at ?? "");
      setSaveFailed(false);
      addToast(t.admin.courseDetailsSaved, t.admin.courseDetailsSaved, "success");
    },
    onError: (error) => {
      setSaveFailed(true);
      if (error instanceof ApiError && error.status === 409) {
        setStaleOpen(true);

      } else {
        addToast(t.admin.courseDetailsSaveFailed, getApiErrorMessage(error, t.admin.courseDetailsSaveFailed), "error");
      }
    },
  });

  useUnsavedChanges(dirty, t.admin.unsavedCoursePrompt, () => save.mutate());

  function setField<K extends keyof DetailsDraft>(key: K, value: DetailsDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveFailed(false);
  }

  function addOutcome() {
    if (draft.learning_outcomes.length < 8) setField("learning_outcomes", [...draft.learning_outcomes, ""]);
  }

  function moveOutcome(index: number, offset: -1 | 1) {
    const destination = index + offset;
    if (destination < 0 || destination >= draft.learning_outcomes.length) return;
    const outcomes = [...draft.learning_outcomes];
    [outcomes[index], outcomes[destination]] = [outcomes[destination], outcomes[index]];
    setField("learning_outcomes", outcomes);
  }

  async function resolveStale(keepEdits: boolean) {
    if (staleAction) return;
    setStaleAction(keepEdits ? "keep" : "load");
    try {
      const latest = await getAdminCourse(course.id);
      if (!keepEdits) setDraft(toDraft(latest));
      setUpdatedAt(latest.updated_at ?? "");
      queryClient.setQueryData(adminCourseKeys.detail(course.id), latest);
      setSaveFailed(false);
      setStaleOpen(false);
    } catch (error) {
      addToast(t.admin.courseLoadError, getApiErrorMessage(error, t.admin.courseLoadDescription), "error");
    } finally { setStaleAction(null); }
  }

  const preview = {
    id: course.id,
    title: draft.title || t.admin.courseTitle,
    summary: draft.summary,
    description: draft.description,
    thumbnail_url: draft.thumbnail_url,
    learning_outcomes: draft.learning_outcomes.filter(Boolean),
    access_type: draft.access_type,
    locked: draft.access_type === "members_only" && previewTier === "free",
    module_count: course.module_count,
    lesson_count: course.lesson_count,
    duration_minutes: course.duration_minutes,
    progress: null,
  };
  const studentHeader = {
    id: course.id,
    title: preview.title,
    summary: preview.summary,
    description: preview.description,
    progress: { completed_count: 0, total_count: course.lesson_count, percent: 0 },
  };
  const status = save.isPending ? "saving" : saveFailed ? "error" : dirty ? "dirty" : "saved";
  const duplicateOutcomes = new Set(draft.learning_outcomes.map((item) => item.trim().toLocaleLowerCase()).filter(Boolean)).size !== draft.learning_outcomes.filter((item) => item.trim()).length;

  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
    <section className="space-y-5" aria-label={t.admin.detailsTab}>
      <div className="flex flex-wrap items-center justify-between gap-3"><SaveStatusIndicator status={status} /><Button type="button" loading={save.isPending} loadingLabel={t.common.saving} title={!dirty ? t.admin.noChanges : t.admin.saveRequirements} disabled={!dirty || save.isPending || !draft.title.trim() || draft.learning_outcomes.some((item) => !item.trim()) || duplicateOutcomes} onClick={() => save.mutate()} className="min-h-11 gap-2 rounded-[8px] bg-primary px-4 text-sm font-semibold text-white"><BookOpen size={16} aria-hidden="true" />{t.admin.saveCourseDetails}</Button></div>
      <FormField label={t.admin.courseTitle} htmlFor="details-title" required hint={t.admin.courseTitleCounter.replace("{count}", String(draft.title.length)).replace("{max}", "160")}><input id="details-title" value={draft.title} onChange={(event) => setField("title", event.target.value)} maxLength={160} className="field-input" /></FormField>
      <FormField label={t.admin.summary} htmlFor="details-summary" hint={t.admin.courseSummaryShown}><textarea id="details-summary" value={draft.summary ?? ""} onChange={(event) => setField("summary", event.target.value || null)} maxLength={200} rows={3} className="field-input min-h-24 resize-y" /><span className="text-sm text-text">{t.admin.courseSummaryCounter.replace("{count}", String((draft.summary ?? "").length)).replace("{max}", "200")}</span></FormField>
      <FormField label={t.admin.courseDescription} htmlFor="details-description" hint={t.admin.courseDescriptionShown}><textarea id="details-description" value={draft.description ?? ""} onChange={(event) => setField("description", event.target.value || null)} maxLength={5000} rows={7} className="field-input min-h-40 resize-y" /><span className="text-sm text-text">{t.admin.courseDescriptionCounter.replace("{count}", String((draft.description ?? "").length)).replace("{max}", "5000")}</span></FormField>
      <FormField label={t.admin.courseCover} htmlFor="details-cover" hint={t.admin.courseCoverGuidance} error={coverError}>
        <RateLimitAlert seconds={uploadFeedback.remaining} />
                  <input disabled={uploadFeedback.remaining > 0} ref={uploadInput} id="details-cover" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t.admin.courseCover} onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ""; }} />
        {draft.thumbnail_url && <MediaImage src={draft.thumbnail_url} alt="" fill sizes="(max-width: 1280px) 100vw, 50vw" className="object-cover" wrapperClassName="relative mb-3 aspect-video overflow-hidden rounded-[8px] border border-border" />}
        <div className="flex flex-wrap gap-2"><Button disabled={uploadFeedback.remaining > 0} type="button" loading={upload.isPending} loadingLabel={t.admin.uploadCourseCover} id="details-cover-action" onClick={() => uploadInput.current?.click()} className="min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-primary">{draft.thumbnail_url ? t.admin.replaceImage : t.admin.uploadCourseCover}</Button>{draft.thumbnail_url && <Button type="button" onClick={() => setField("thumbnail_url", null)} className="min-h-11 rounded-[8px] px-4 text-sm font-semibold text-text">{t.admin.removeCourseCover}</Button>}</div>
      </FormField>
      <fieldset id="details-outcomes" tabIndex={-1} className="scroll-mt-48 space-y-3"><legend className="text-base font-semibold text-text">{t.admin.learningOutcomes}</legend>{draft.learning_outcomes.map((outcome, index) => <div key={index} className="flex items-start gap-2"><FormField label={t.admin.outcomeNumber.replace("{number}", String(index + 1))} htmlFor={`outcome-${index}`}><input id={`outcome-${index}`} value={outcome} maxLength={120} onChange={(event) => setField("learning_outcomes", draft.learning_outcomes.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} className="field-input" /></FormField><div className="mt-7 flex shrink-0"><Button type="button" aria-label={`${t.admin.moveUp} ${index + 1}`} title={index === 0 ? t.admin.boundaryAction : undefined} disabled={index === 0} onClick={() => moveOutcome(index, -1)} className="h-10 w-10 rounded-[8px] text-text"><ArrowUp size={16} aria-hidden="true" /></Button><Button type="button" aria-label={`${t.admin.moveDown} ${index + 1}`} title={index === draft.learning_outcomes.length - 1 ? t.admin.boundaryAction : undefined} disabled={index === draft.learning_outcomes.length - 1} onClick={() => moveOutcome(index, 1)} className="h-10 w-10 rounded-[8px] text-text"><ArrowDown size={16} aria-hidden="true" /></Button><Button type="button" aria-label={`${t.admin.removeOutcome} ${index + 1}`} onClick={() => setField("learning_outcomes", draft.learning_outcomes.filter((_, itemIndex) => itemIndex !== index))} className="h-10 w-10 rounded-[8px] text-text"><Trash2 size={16} aria-hidden="true" /></Button></div></div>)}{duplicateOutcomes && <p role="alert" className="text-sm text-text">{t.admin.duplicateOutcome}</p>}<Button type="button" title={t.admin.outcomeLimitReason} disabled={draft.learning_outcomes.length >= 8} onClick={addOutcome} className="min-h-10 gap-2 rounded-[8px] px-3 text-sm font-semibold text-primary"><Plus size={16} aria-hidden="true" />{t.admin.addOutcome}</Button></fieldset>
      <fieldset><legend className="mb-2 text-base font-semibold text-text">{t.admin.accessType}</legend><div className="grid gap-3 sm:grid-cols-2">{(["free", "members_only"] as const).map((accessType) => <Button key={accessType} type="button" role="radio" aria-checked={draft.access_type === accessType} onClick={() => course.status === "published" && draft.access_type !== accessType ? setAccessConfirmation(accessType) : setField("access_type", accessType)} className={`min-h-24 flex-col items-start rounded-[8px] border p-4 text-left ${draft.access_type === accessType ? "border-primary bg-primary/5" : "border-border hover:bg-surface-alt"}`}><span className="text-base font-semibold text-text">{accessType === "free" ? t.admin.freeAccess : t.admin.membersOnly}</span><span className="mt-2 text-sm font-normal text-text">{accessType === "free" ? t.admin.freeAccessExplanation : t.admin.membersOnlyExplanation}</span></Button>)}</div></fieldset>
    </section>
    <aside className="space-y-6 border-t border-border pt-5 xl:sticky xl:top-28 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0" aria-label={t.admin.studentPreview}>
        <section><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-heading text-xl text-text">{t.admin.studentPreview}</h2><div role="group" aria-label={t.admin.previewTier} className="inline-flex rounded-[8px] border border-border p-1"><Button type="button" aria-pressed={previewTier === "free"} onClick={() => setPreviewTier("free")} className={`min-h-9 rounded-[8px] px-3 text-sm ${previewTier === "free" ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}>{t.admin.previewTierFree}</Button><Button type="button" aria-pressed={previewTier === "paid"} onClick={() => setPreviewTier("paid")} className={`min-h-9 rounded-[8px] px-3 text-sm ${previewTier === "paid" ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}>{t.admin.previewTierPaid}</Button></div></div><CourseCatalogCard course={preview} locked={preview.locked} showCounts /></section>
      <section><h2 className="mb-3 font-heading text-xl text-text">{t.admin.coursePagePreview}</h2><StudentCourseHeader course={studentHeader} /><div className="mt-3 space-y-2">{preview.learning_outcomes.map((outcome, index) => <p key={`${index}-${outcome}`} className="border-b border-border py-2 text-base text-text">{outcome}</p>)}</div></section>
    </aside>
    <StaleChangeDialog open={staleOpen} title={t.admin.staleChangeTitle} description={t.admin.staleChangeDescription} loadLatestLabel={t.admin.loadLatest} keepEditsLabel={t.admin.keepMyEdits} busy={Boolean(staleAction)} keepEditsBusy={staleAction === "keep"} onDismiss={() => setStaleOpen(false)} onLoadLatest={() => void resolveStale(false)} onKeepEdits={() => void resolveStale(true)} />
    <ConfirmDialog open={Boolean(accessConfirmation)} title={t.admin.accessChangeTitle} description={t.admin.accessChangeDescription} confirmLabel={t.admin.continueAction} cancelLabel={t.admin.cancelStructureAction} onClose={() => setAccessConfirmation(null)} onConfirm={() => { if (accessConfirmation) setField("access_type", accessConfirmation); setAccessConfirmation(null); }} />
  </div>;
}