"use client";

import { useUploadFeedback } from "@/components/ui/use-upload-feedback";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";

import Link from "@/components/ui/pending-link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "@/lib/utils/zod";
import { ArrowLeft, BookOpen, Copy, FilePlus2 } from "lucide-react";
import { useRef, useState } from "react";
import { useCopy } from "@/lib/copy/provider";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { AdminPageHeader, FormField } from "@/components/admin/ui/primitives";
import { CourseCatalogCard } from "@/components/courses/course-student-ui";
import { useUnsavedChanges } from "@/components/admin/courses/course-primitives";
import { invalidateAdminCourse, mapAdminCourseError, useAdminCourseList } from "@/lib/queries/admin-courses";
import { createAdminCourse, deleteAdminCourse, duplicateAdminCourse, getApiErrorMessage, updateAdminCourse, uploadAdminMedia, type AdminCourse } from "@/lib/api/index";
import { MediaImage } from "@/components/ui/media-image";

type StartMode = "blank" | "copy";
type Draft = { title: string; access_type: AdminCourse["access_type"] | null; summary: string; thumbnail_url: string | null };

export function NewCourseForm() {
  const { t } = useCopy();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const submitLock = useRef(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const duplicateCreatedId = useRef<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ title: "", access_type: null, summary: "", thumbnail_url: null });
  const [startMode, setStartMode] = useState<StartMode>("blank");
  const [search, setSearch] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [coverError, setCoverError] = useState("");
  const sources = useAdminCourseList({ search: search.trim() || undefined, limit: 20, offset: 0 }, startMode === "copy");
  const dirty = Boolean(draft.title || draft.summary || draft.access_type || draft.thumbnail_url || startMode === "copy" || sourceId);
  useUnsavedChanges(dirty, t.admin.unsavedCoursePrompt);
  const uploadFeedback = useUploadFeedback(t.admin.uploadFailed, t.admin.uploadFailed);
  const uploadCover = useMutation({
    mutationFn: uploadAdminMedia,
    onSuccess: ({ url }) => { setDraft((current) => ({ ...current, thumbnail_url: url })); setCoverError(""); addToast(t.admin.uploadCourseCover, t.admin.uploadCourseCover, "success"); },
    onError: (error) => setCoverError(uploadFeedback.error(error)),
  });

  const create = useMutation({
    mutationFn: async (values: Draft) => {
      const payload = { title: values.title.trim(), access_type: values.access_type!, summary: values.summary.trim() || null };
      const coursePayload = { ...payload, thumbnail_url: values.thumbnail_url };
      if (startMode === "blank") return createAdminCourse(coursePayload);
      const duplicate = await duplicateAdminCourse(sourceId, payload.title);
      duplicateCreatedId.current = duplicate.id;
      try {
        const updated = await updateAdminCourse(duplicate.id, { ...coursePayload, title: payload.title, access_type: payload.access_type, summary: payload.summary });
        duplicateCreatedId.current = null;
        return { ...duplicate, ...updated };
      } catch (error) {
        await deleteAdminCourse(duplicate.id).catch(() => undefined);
        duplicateCreatedId.current = null;
        throw error;
      }
    },
    onSuccess: (course) => {
      submitLock.current = false;
      invalidateAdminCourse(queryClient, course.id);
      addToast(t.admin.draftCreated, t.admin.draftCreated, "success");
      router.push(`/admin/courses/${course.id}/curriculum`);
    },
    onError: (error) => {
      submitLock.current = false;
      const failure = mapAdminCourseError(error, { stale: t.admin.staleCourse, notReady: t.admin.serverReadinessErrors, invalid: t.admin.courseValidation, generic: t.admin.courseCreateFailed });
      const fieldErrors: Record<string, string> = {};
      failure.fieldErrors.forEach(({ field, message }) => { fieldErrors[field] = message; });
      setErrors(fieldErrors);
      setFormError(failure.kind === "fields" ? "" : failure.message);
      addToast(t.admin.courseCreateFailed, failure.message || getApiErrorMessage(error, t.admin.courseCreateFailed), "error");
      if (duplicateCreatedId.current) void deleteAdminCourse(duplicateCreatedId.current).catch(() => undefined);
    },
  });

  function submit() {
    if (submitLock.current || create.isPending) return;
    const schema = z.object({
      title: z.string().trim().min(1, t.admin.courseTitleValidation).max(160, t.admin.courseTitleValidation),
      access_type: z.enum(["free", "members_only"], { message: t.admin.courseAccessRequired }),
      summary: z.string().max(200, t.admin.courseSummaryValidation),
    });
    const parsed = schema.safeParse(draft);
    const fieldErrors: Record<string, string> = {};
    if (!parsed.success) parsed.error.issues.forEach((issue) => { fieldErrors[String(issue.path[0] ?? "form")] = issue.message; });
    if (startMode === "copy" && !sourceId) fieldErrors.source = t.admin.copySourceRequired;
    setErrors(fieldErrors);
    setFormError("");
    if (!parsed.success || Object.keys(fieldErrors).length) return;
    submitLock.current = true;
    create.mutate({ ...parsed.data, thumbnail_url: draft.thumbnail_url });
  }

  const previewCourse = {
    id: "course-preview",
    title: draft.title.trim() || t.admin.courseTitle,
    summary: draft.summary.trim() || null,
    description: null,
    thumbnail_url: draft.thumbnail_url,
    access_type: draft.access_type ?? "free",
    locked: draft.access_type === "members_only",
    module_count: 0,
    lesson_count: 0,
    duration_minutes: 0,
    progress: null,
  };

  return <main className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10">
    <Link href="/admin/courses" className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-[8px] px-2 text-sm font-semibold text-primary hover:bg-surface-alt"><ArrowLeft size={16} aria-hidden="true" />{t.admin.backToCourses}</Link>
    <AdminPageHeader title={t.admin.newCourse} description={t.admin.newCourseDescription} />
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
      <section className="space-y-5" aria-label={t.admin.newCourse}>
        <FormField label={t.admin.courseTitle} htmlFor="new-course-title" required error={errors.title} hint={t.admin.courseTitleCounter.replace("{count}", String(draft.title.length)).replace("{max}", "160")}><input id="new-course-title" value={draft.title} maxLength={160} onChange={(event) => { setDraft((current) => ({ ...current, title: event.target.value })); setErrors((current) => ({ ...current, title: "" })); }} aria-invalid={Boolean(errors.title)} className="field-input" /></FormField>
        <fieldset><legend className="mb-2 text-base font-semibold text-text">{t.admin.accessType} *</legend><div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t.admin.accessType}>
          <Button type="button" role="radio" aria-checked={draft.access_type === "free"} onClick={() => { setDraft((current) => ({ ...current, access_type: "free" })); setErrors((current) => ({ ...current, access_type: "" })); }} className={`min-h-24 flex-col items-start rounded-[8px] border p-4 text-left ${draft.access_type === "free" ? "border-primary bg-primary/5" : "border-border hover:bg-surface-alt"}`}><span className="flex items-center gap-2 text-base font-semibold text-text"><BookOpen size={18} aria-hidden="true" />{t.admin.freeAccess}</span><span className="mt-2 text-sm font-normal text-text">{t.admin.freeAccessExplanation}</span></Button>
          <Button type="button" role="radio" aria-checked={draft.access_type === "members_only"} onClick={() => { setDraft((current) => ({ ...current, access_type: "members_only" })); setErrors((current) => ({ ...current, access_type: "" })); }} className={`min-h-24 flex-col items-start rounded-[8px] border p-4 text-left ${draft.access_type === "members_only" ? "border-primary bg-primary/5" : "border-border hover:bg-surface-alt"}`}><span className="flex items-center gap-2 text-base font-semibold text-text"><Copy size={18} aria-hidden="true" />{t.admin.membersOnly}</span><span className="mt-2 text-sm font-normal text-text">{t.admin.membersOnlyExplanation}</span></Button>
        </div>{errors.access_type && <p role="alert" className="mt-1 text-sm text-text">{errors.access_type}</p>}</fieldset>
        <FormField label={t.admin.summary} htmlFor="new-course-summary" hint={t.admin.courseSummaryCounter.replace("{count}", String(draft.summary.length)).replace("{max}", "200")} error={errors.summary}><textarea id="new-course-summary" value={draft.summary} maxLength={200} rows={3} onChange={(event) => { setDraft((current) => ({ ...current, summary: event.target.value })); setErrors((current) => ({ ...current, summary: "" })); }} className="field-input min-h-24 resize-y" /></FormField>
                <FormField label={t.admin.courseCover} htmlFor="new-course-cover" hint={t.admin.courseCoverGuidance} error={coverError}>
                  <RateLimitAlert seconds={uploadFeedback.remaining} />
                  <input disabled={uploadFeedback.remaining > 0} ref={coverInput} id="new-course-cover" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t.admin.courseCover} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadCover.mutate(file); event.target.value = ""; }} />
                  {draft.thumbnail_url && <MediaImage src={draft.thumbnail_url} alt="" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" wrapperClassName="relative mb-3 aspect-video overflow-hidden rounded-[8px] border border-border" />}
                  <div className="flex flex-wrap gap-2"><Button disabled={uploadFeedback.remaining > 0} type="button" loading={uploadCover.isPending} loadingLabel={t.admin.uploadCourseCover} onClick={() => coverInput.current?.click()} className="min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-primary">{draft.thumbnail_url ? t.admin.replaceImage : t.admin.uploadCourseCover}</Button>{draft.thumbnail_url && <Button type="button" onClick={() => setDraft((current) => ({ ...current, thumbnail_url: null }))} className="min-h-11 rounded-[8px] px-4 text-sm font-semibold text-text">{t.admin.removeCourseCover}</Button>}</div>
                </FormField>
        <fieldset><legend className="mb-2 text-base font-semibold text-text">{t.admin.startFrom}</legend><div role="radiogroup" aria-label={t.admin.startFrom} className="inline-flex rounded-[8px] border border-border p-1"><Button type="button" role="radio" aria-checked={startMode === "blank"} onClick={() => { setStartMode("blank"); setSourceId(""); }} className={`min-h-10 rounded-[8px] px-4 text-sm font-semibold ${startMode === "blank" ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}>{t.admin.blankCourse}</Button><Button type="button" role="radio" aria-checked={startMode === "copy"} onClick={() => setStartMode("copy")} className={`min-h-10 rounded-[8px] px-4 text-sm font-semibold ${startMode === "copy" ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}>{t.admin.copyCourseStructure}</Button></div></fieldset>
        {startMode === "copy" && <div className="space-y-3"><label htmlFor="source-search" className="block text-base font-semibold text-text">{t.admin.copySource}</label><input id="source-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.admin.searchCourses} className="field-input" /><label htmlFor="source-course" className="sr-only">{t.admin.copySource}</label><select id="source-course" value={sourceId} onChange={(event) => { setSourceId(event.target.value); setErrors((current) => ({ ...current, source: "" })); }} className="field-input"><option value="">{t.admin.chooseSource}</option>{sources.data?.items.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select>{sources.isLoading && <div className="h-10 animate-pulse rounded-[8px] bg-surface-alt" aria-busy="true" />}{sources.isError && <div role="alert" className="flex items-center justify-between gap-2"><span className="text-sm text-text">{t.admin.courseSourceLoadError}</span><Button type="button" onClick={() => void sources.refetch()} className="min-h-10 rounded-[8px] border border-border px-3 text-sm font-semibold text-primary">{t.admin.retry}</Button></div>}{errors.source && <p role="alert" className="text-sm text-text">{errors.source}</p>}</div>}
        {formError && <p role="alert" className="rounded-[8px] border border-border bg-surface-alt p-3 text-base text-text">{formError}</p>}
        <Button type="button" loading={create.isPending} loadingLabel={t.admin.creatingCourse} title={t.admin.saveRequirements} disabled={create.isPending || !draft.title.trim() || !draft.access_type || startMode === "copy" && !sourceId} onClick={submit} className="min-h-11 gap-2 rounded-[8px] bg-primary px-5 text-base font-semibold text-white"><FilePlus2 size={18} aria-hidden="true" />{t.admin.createCourse}</Button>
      </section>
      <aside className="border-t border-border pt-5 lg:sticky lg:top-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" aria-label={t.admin.studentPreview}><h2 className="mb-4 font-heading text-xl text-text">{t.admin.studentPreview}</h2><CourseCatalogCard course={previewCourse} locked={previewCourse.locked} showCounts={false} action={<span className="text-sm font-semibold text-primary">{previewCourse.locked ? t.admin.previewLocked : t.admin.previewAvailable}</span>} /></aside>
    </div>
  </main>;
}
