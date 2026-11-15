"use client";

import Link from "@/components/ui/pending-link";
import { useParams, useRouter } from "next/navigation";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bold, ChevronDown, ChevronLeft, ChevronRight, Clock3, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, RotateCcw, X } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import { ApiError, getAdminCourse, getAdminLessonVersion, getAdminLessonVersions, getApiErrorMessage, restoreAdminLessonVersion, updateAdminLesson, type CourseLesson, type CourseLessonResource, type CourseModule } from "@/lib/api/index";
import { adminCourseKeys, invalidateAdminCourse } from "@/lib/queries/admin-courses";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, FormField, StaleChangeDialog } from "@/components/admin/ui/primitives";
import { SaveStatusIndicator, useUnsavedChanges } from "@/components/admin/courses/course-primitives";
import { useCourseHub } from "@/components/admin/courses/course-hub";
import { RichTextLinkDialog } from "@/components/admin/ui/rich-text-link-dialog";
import { RichContent } from "@/components/ui/rich-content";
import { VideoPlayer } from "@/components/courses/video-player";
import { parseLessonVideo } from "@/lib/utils/video";
import { LocalTime } from "@/components/ui/local-time";

type LessonDraft = Pick<CourseLesson, "title" | "body_html" | "try_it_yourself_prompt" | "duration_minutes"> & { video_url: string; resources: CourseLessonResource[] };

function storedVideoUrl(video: CourseLesson["video"]): string {
  if (!video) return "";
  return video.provider === "youtube" ? `https://youtube.com/watch?v=${video.id}` : `https://vimeo.com/${video.id}`;
}

function lessonModules(modules: CourseModule[]) {
  return modules.map((module) => ({ ...module, lessons: [...module.lessons].sort((a, b) => a.order - b.order) })).sort((a, b) => a.order - b.order);
}

export function CourseLessonEditor() {
  const course = useCourseHub();
  const params = useParams<{ lessonId: string }>();
  const lessonId = params.lessonId;
  const modules = useMemo(() => lessonModules(course.modules), [course.modules]);
  const selected = modules.flatMap((module) => module.lessons.map((lesson) => ({ module, lesson }))).find((item) => item.lesson.id === lessonId);
  const { t } = useCopy();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const lesson = selected?.lesson;
  const currentModule = selected?.module;
  const [draft, setDraft] = useState<LessonDraft>(() => lesson ? {
    title: lesson.title,
    body_html: lesson.body_html,
    try_it_yourself_prompt: lesson.try_it_yourself_prompt,
    duration_minutes: lesson.duration_minutes,
    video_url: storedVideoUrl(lesson.video),
    resources: lesson.resources ?? [],
  } : { title: "", body_html: "", try_it_yourself_prompt: null, duration_minutes: 0, video_url: "", resources: [] });
  const [savedAt, setSavedAt] = useState(lesson?.updated_at ?? "");
  const [saveFailed, setSaveFailed] = useState(false);
  const [staleOpen, setStaleOpen] = useState(false);
  const [staleAction, setStaleAction] = useState<"keep" | "load" | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const [preview, setPreview] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const versions = useQuery({ queryKey: adminCourseKeys.lessonVersions(lesson?.id ?? ""), queryFn: () => getAdminLessonVersions(lesson!.id), enabled: historyOpen && Boolean(lesson) });
  const activeVersionId = selectedVersionId ?? versions.data?.[0]?.id ?? null;
  const selectedVersion = useQuery({ queryKey: adminCourseKeys.lessonVersion(lesson?.id ?? "", activeVersionId ?? ""), queryFn: () => getAdminLessonVersion(lesson!.id, activeVersionId!), enabled: historyOpen && Boolean(lesson && activeVersionId) });
  const draftVideo = parseLessonVideo(draft.video_url);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, protocols: ["http", "https"] } })],
    content: draft.body_html,
    onUpdate: ({ editor: current }) => setDraft((value) => ({ ...value, body_html: current.getHTML() })),
    editorProps: { attributes: { class: "min-h-[320px] px-4 py-3 text-base leading-7 text-text focus:outline-none", "aria-label": t.admin.body } },
  });
  useEditorState({ editor, selector: ({ editor: current }) => ({ document: current?.state.doc, selection: current?.state.selection, marks: current?.state.storedMarks }) });
  const initialDraft = lesson ? { title: lesson.title, body_html: lesson.body_html, try_it_yourself_prompt: lesson.try_it_yourself_prompt, duration_minutes: lesson.duration_minutes, video_url: storedVideoUrl(lesson.video), resources: lesson.resources ?? [] } : null;
  const dirty = Boolean(initialDraft && JSON.stringify(draft) !== JSON.stringify(initialDraft));
  const siblings = currentModule?.lessons ?? [];
  const lessonIndex = siblings.findIndex((item) => item.id === lessonId);
  const previousLesson = lessonIndex > 0 ? siblings[lessonIndex - 1] : null;
  const nextLesson = lessonIndex >= 0 && lessonIndex < siblings.length - 1 ? siblings[lessonIndex + 1] : null;
  const wordCount = draft.body_html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").trim().split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    if (editor && editor.getHTML() !== draft.body_html) editor.commands.setContent(draft.body_html, { emitUpdate: false });
  }, [draft.body_html, editor]);

  useEffect(() => {
    if (!historyOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    drawerRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setHistoryOpen(false); return; }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [historyOpen]);

  const save = useMutation({
    mutationFn: (submitted: LessonDraft) => {
      if (!lesson || !currentModule) throw new Error(t.admin.lessonNotFound);
      return updateAdminLesson(currentModule.id, lesson.id, { title: submitted.title, body_html: submitted.body_html, try_it_yourself_prompt: submitted.try_it_yourself_prompt, duration_minutes: submitted.duration_minutes, video_url: submitted.video_url.trim() || null, resources: submitted.resources, expected_updated_at: savedAt || undefined });
    },
    onSuccess: (updated, submitted) => {
      setSavedAt(updated.updated_at ?? "");
      // Edits made while this request was pending belong to the next save.
      // A completed older request must not replace that newer local draft.
      setDraft((current) => JSON.stringify(current) === JSON.stringify(submitted)
        ? { title: updated.title, body_html: updated.body_html, try_it_yourself_prompt: updated.try_it_yourself_prompt, duration_minutes: updated.duration_minutes, video_url: storedVideoUrl(updated.video), resources: updated.resources ?? [] }
        : current);
      setSaveFailed(false);
      invalidateAdminCourse(queryClient, course.id);
      queryClient.setQueryData(adminCourseKeys.detail(course.id), (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        const detail = current as typeof course;
        return { ...detail, modules: detail.modules.map((item) => ({ ...item, lessons: item.lessons.map((existing) => existing.id === updated.id ? { ...existing, ...updated } : existing) })) };
      });
      addToast(t.admin.lessonSaved, t.admin.lessonSaved, "success");
    },
    onError: (error) => {
      setSaveFailed(true);
      if (error instanceof ApiError && error.status === 409) {
        setStaleOpen(true);
        void queryClient.invalidateQueries({ queryKey: adminCourseKeys.detail(course.id) });
      } else {
        addToast(t.admin.lessonSaveFailed, getApiErrorMessage(error, t.admin.lessonSaveFailed), "error");
      }
    },
  });

  const restore = useMutation({
    mutationFn: () => {
      if (!lesson || !activeVersionId) throw new Error(t.admin.lessonNotFound);
      return restoreAdminLessonVersion(lesson.id, activeVersionId, savedAt);
    },
    onSuccess: (updated) => {
      setSavedAt(updated.updated_at ?? "");
      setDraft({ title: updated.title, body_html: updated.body_html, try_it_yourself_prompt: updated.try_it_yourself_prompt, duration_minutes: updated.duration_minutes, video_url: storedVideoUrl(updated.video), resources: updated.resources ?? [] });
      invalidateAdminCourse(queryClient, course.id);
      queryClient.setQueryData(adminCourseKeys.detail(course.id), (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        const detail = current as typeof course;
        return { ...detail, modules: detail.modules.map((item) => ({ ...item, lessons: item.lessons.map((existing) => existing.id === updated.id ? { ...existing, ...updated } : existing) })) };
      });
      void queryClient.invalidateQueries({ queryKey: adminCourseKeys.lessonVersions(updated.id) });
      setRestoreOpen(false);
      setHistoryOpen(false);
      addToast(t.admin.lessonVersionRestored, t.admin.lessonVersionRestored, "success");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) { setStaleOpen(true); setHistoryOpen(false); }
      else addToast(t.admin.lessonVersionRestoreFailed, getApiErrorMessage(error, t.admin.lessonVersionRestoreFailed), "error");
    },
  });

  useUnsavedChanges(dirty, t.admin.unsavedLessonDescription, () => save.mutate(draft));

  function setField<K extends keyof LessonDraft>(key: K, value: LessonDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveFailed(false);
  }

  function suggestDuration() {
    const words = wordCount;
    setField("duration_minutes", Math.min(600, Math.max(1, Math.ceil(words / 200))));
  }

  async function resolveStale(keepEdits: boolean) {
    if (!lesson || staleAction) return;
    setStaleAction(keepEdits ? "keep" : "load");
    try {
      const latest = await getAdminCourse(course.id);
      queryClient.setQueryData(adminCourseKeys.detail(course.id), latest);
      const latestLesson = latest.modules.flatMap((item) => item.lessons).find((item) => item.id === lesson.id);
      if (latestLesson) {
        setSavedAt(latestLesson.updated_at ?? "");
        if (!keepEdits) {
          setDraft({ title: latestLesson.title, body_html: latestLesson.body_html, try_it_yourself_prompt: latestLesson.try_it_yourself_prompt, duration_minutes: latestLesson.duration_minutes, video_url: storedVideoUrl(latestLesson.video), resources: latestLesson.resources ?? [] });
          editor?.commands.setContent(latestLesson.body_html, { emitUpdate: false });
        }
      }
    } catch {
      addToast(t.admin.courseLoadError, t.admin.courseLoadDescription, "error");
      return;
    } finally { setStaleAction(null); }
    setSaveFailed(false);
    setStaleOpen(false);
  }

  if (!lesson || !currentModule) return <section className="border-t border-border py-8"><h2 className="font-heading text-xl text-text">{t.admin.lessonNotFound}</h2><p className="mt-2 text-base text-text">{t.admin.lessonNotFoundDescription}</p><Link href={`/admin/courses/${course.id}/curriculum`} className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary"><ChevronLeft size={16} aria-hidden="true" />{t.admin.backToOutline}</Link></section>;

  const status = save.isPending ? "saving" : saveFailed ? "error" : dirty ? "dirty" : "saved";
  const toolbar = [
    { label: t.admin.toolbarLink, icon: Link2, action: () => setLinkOpen(true), active: editor?.isActive("link") ?? false },
    { label: t.admin.toolbarBold, icon: Bold, action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive("bold") ?? false },
    { label: t.admin.toolbarItalic, icon: Italic, action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive("italic") ?? false },
    { label: t.admin.toolbarHeading2, icon: Heading2, action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: editor?.isActive("heading", { level: 2 }) ?? false },
    { label: t.admin.toolbarHeading3, icon: Heading3, action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), active: editor?.isActive("heading", { level: 3 }) ?? false },
    { label: t.admin.toolbarBullets, icon: List, action: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive("bulletList") ?? false },
    { label: t.admin.toolbarNumbered, icon: ListOrdered, action: () => editor?.chain().focus().toggleOrderedList().run(), active: editor?.isActive("orderedList") ?? false },
    { label: t.admin.toolbarQuote, icon: Quote, action: () => editor?.chain().focus().toggleBlockquote().run(), active: editor?.isActive("blockquote") ?? false },
  ];
  const versionFieldLabels: Record<string, string> = {
    title: t.admin.versionTitleField,
    body_html: t.admin.versionBodyField,
    try_it_yourself_prompt: t.admin.versionPromptField,
    duration_minutes: t.admin.versionDurationField,
    video: t.admin.versionVideoField,
    video_provider: t.admin.versionVideoField,
    video_id: t.admin.versionVideoField,
    resources: t.admin.versionResourcesField,
  };

  return <div className="grid items-start gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
    <aside className="max-h-64 overflow-y-auto border-b border-border pb-4 xl:max-h-[calc(100vh-10rem)] xl:border-b-0 xl:border-r xl:pb-0 xl:pr-4" aria-label={t.admin.courseOutline}>
      <h2 className="mb-3 font-heading text-xl text-text">{t.admin.courseOutline}</h2>
      {modules.map((item) => <section key={item.id} className="mb-4"><h3 className="mb-2 text-base font-semibold text-text">{item.title}</h3><ol className="space-y-1">{item.lessons.map((entry) => <li key={entry.id}><Link href={`/admin/courses/${course.id}/lessons/${entry.id}`} aria-current={entry.id === lesson.id ? "page" : undefined} className={`block rounded-[8px] px-3 py-2 text-sm ${entry.id === lesson.id ? "bg-surface-alt font-semibold text-primary" : "text-text hover:bg-surface-alt"}`}>{entry.title}</Link></li>)}</ol></section>)}
    </aside>
    <section className="min-w-0" aria-label={t.admin.lessonEditor}>
      <RichTextLinkDialog open={linkOpen} onClose={() => setLinkOpen(false)} onSave={(url) => { editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run(); }} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><nav aria-label={t.admin.courseBreadcrumb} className="text-sm text-text"><Link href="/admin/courses" className="text-primary">{t.admin.courses}</Link> / <Link href={`/admin/courses/${course.id}`} className="text-primary">{course.title}</Link> / <span>{currentModule.title}</span> / <span>{lesson.title}</span></nav><p className="mt-2 text-sm text-text">{t.admin.modulePosition.replace("{position}", String(modules.findIndex((item) => item.id === currentModule.id) + 1))} · {t.admin.lessonPosition.replace("{position}", String(lessonIndex + 1))}</p></div><SaveStatusIndicator status={status} /></div>
      <FormField label={t.admin.lessonTitle} htmlFor="lesson-title" required><input id="lesson-title" value={draft.title} maxLength={255} onChange={(event) => setField("title", event.target.value)} className="field-input" /></FormField>
      <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,180px)_auto] sm:items-end"><FormField label={t.admin.durationMinutes} htmlFor="lesson-duration" hint={t.admin.lessonDurationHint}><input id="lesson-duration" type="number" min={0} max={600} value={draft.duration_minutes || ""} onChange={(event) => setField("duration_minutes", Number(event.target.value))} className="field-input" /></FormField><Button type="button" onClick={suggestDuration} className="min-h-11 justify-self-start rounded-[8px] border border-border px-3 text-sm font-semibold text-primary">{t.admin.suggestDuration}</Button></div>
      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <FormField label={t.admin.videoUrl} htmlFor="lesson-video-url" hint={t.admin.videoUrlHint}>
          <div className="flex gap-2"><input id="lesson-video-url" type="url" value={draft.video_url} onChange={(event) => setField("video_url", event.target.value)} className="field-input min-w-0 flex-1"/><Button type="button" aria-label={t.admin.removeVideo} title={!draft.video_url ? t.admin.noVideoReason : t.admin.removeVideo} disabled={!draft.video_url} onClick={() => setField("video_url", "")} className="h-11 w-11 rounded-[8px] border border-border text-text"><X size={16} aria-hidden="true"/></Button></div>
          {draft.video_url && !draftVideo && <p role="alert" className="mt-1 text-sm text-text">{t.admin.videoUrlInvalid}</p>}
          {draftVideo && <VideoPlayer key={`${draftVideo.provider}/${draftVideo.id}`} video={draftVideo} title={draft.title} />}
        </FormField>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-base font-semibold text-text">{t.admin.lessonResources}</h2><Button type="button" title={draft.resources.length >= 10 ? t.admin.resourceLimitReason : undefined} disabled={draft.resources.length >= 10} onClick={() => setField("resources", [...draft.resources, { title: "", url: "" }])} className="min-h-10 rounded-[8px] border border-border px-3 text-sm font-semibold text-primary">{t.admin.addLessonResource}</Button></div>
          {draft.resources.length >= 10 && <p className="mb-2 text-sm text-text">{t.admin.resourceLimit}</p>}
          <ol className="space-y-3">{draft.resources.map((resource, index) => <li key={index} className="grid gap-2 border-b border-border pb-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <FormField label={t.admin.resourceLinkTitle} htmlFor={`resource-title-${index}`}><input id={`resource-title-${index}`} value={resource.title} maxLength={80} onChange={(event) => setField("resources", draft.resources.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} className="field-input"/></FormField>
            <FormField label={t.admin.resourceLinkUrl} htmlFor={`resource-url-${index}`}><input id={`resource-url-${index}`} type="url" value={resource.url} onChange={(event) => setField("resources", draft.resources.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} className="field-input"/></FormField>
            <div className="flex items-end gap-1"><Button type="button" title={index === 0 ? t.admin.boundaryAction : undefined} disabled={index === 0} aria-label={t.admin.resourceOrderUp.replace("{title}", resource.title)} onClick={() => { const items = [...draft.resources]; [items[index - 1], items[index]] = [items[index], items[index - 1]]; setField("resources", items); }} className="h-10 w-10 rounded-[8px] border border-border text-text"><ChevronDown size={16} className="rotate-180" aria-hidden="true"/></Button><Button type="button" title={index === draft.resources.length - 1 ? t.admin.boundaryAction : undefined} disabled={index === draft.resources.length - 1} aria-label={t.admin.resourceOrderDown.replace("{title}", resource.title)} onClick={() => { const items = [...draft.resources]; [items[index + 1], items[index]] = [items[index], items[index + 1]]; setField("resources", items); }} className="h-10 w-10 rounded-[8px] border border-border text-text"><ChevronDown size={16} aria-hidden="true"/></Button><Button type="button" aria-label={t.admin.removeLessonResource.replace("{title}", resource.title)} onClick={() => setField("resources", draft.resources.filter((_, itemIndex) => itemIndex !== index))} className="h-10 w-10 rounded-[8px] border border-border text-text"><X size={16} aria-hidden="true"/></Button></div>
          </li>)}</ol>
          {draft.resources.length > 0 && <ul className="mt-3 space-y-1">{draft.resources.filter((item) => item.title.trim() && /^https?:\/\//i.test(item.url)).map((item) => <li key={`${item.title}-${item.url}`} className="flex items-center gap-2 text-sm text-text"><Link2 size={16} aria-hidden="true"/><a href={item.url} target="_blank" rel="noopener noreferrer" className="underline">{item.title}</a></li>)}</ul>}
        </div>
      </section>
      <div className="mt-5"><span className="mb-2 block text-base font-semibold text-text">{t.admin.body}</span><div className="flex flex-wrap gap-1 rounded-t-[8px] border border-border bg-surface-alt p-2">{toolbar.map(({ label, icon: Icon, action, active }) => <Button key={label} type="button" aria-label={label} aria-pressed={active} title={label} onClick={action} className={`h-10 w-10 rounded-[8px] ${active ? "bg-primary text-white" : "text-text hover:bg-background"}`}><Icon size={18} aria-hidden="true" /></Button>)}</div><div className="rounded-b-[8px] border border-t-0 border-border bg-background"><EditorContent editor={editor} /></div><p className="mt-1 text-sm text-text">{t.admin.wordCount.replace("{count}", String(wordCount))}</p></div>
      <FormField label={t.admin.tryItYourself} htmlFor="lesson-reflection" hint={t.admin.lessonReflectionNote}><textarea id="lesson-reflection" value={draft.try_it_yourself_prompt ?? ""} maxLength={1000} rows={3} onChange={(event) => setField("try_it_yourself_prompt", event.target.value || null)} className="field-input min-h-24 resize-y" /></FormField>
      {preview && <section className="mt-5 border-t border-border pt-4"><h2 className="mb-3 font-heading text-xl text-text">{t.admin.preview}</h2><RichContent html={draft.body_html} /></section>}
      <footer className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2"><Button type="button" title={!previousLesson ? t.admin.noPreviousLesson : undefined} disabled={!previousLesson} onClick={() => previousLesson && router.push(`/admin/courses/${course.id}/lessons/${previousLesson.id}`)} className="min-h-10 gap-2 rounded-[8px] border border-border px-3 text-sm font-semibold text-text"><ChevronLeft size={16} aria-hidden="true" />{t.admin.previousLesson}</Button><Button type="button" title={!nextLesson ? t.admin.noNextLesson : undefined} disabled={!nextLesson} onClick={() => nextLesson && router.push(`/admin/courses/${course.id}/lessons/${nextLesson.id}`)} className="min-h-10 gap-2 rounded-[8px] border border-border px-3 text-sm font-semibold text-text">{t.admin.nextLesson}<ChevronRight size={16} aria-hidden="true" /></Button></div>
        <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => { setSelectedVersionId(null); setHistoryOpen(true); }} aria-label={t.admin.lessonHistoryOpen} className="min-h-10 gap-2 rounded-[8px] border border-border px-3 text-sm font-semibold text-text"><Clock3 size={16} aria-hidden="true"/>{t.admin.lessonHistory}</Button><Button type="button" onClick={() => setPreview((current) => !current)} className="min-h-10 rounded-[8px] border border-border px-3 text-sm font-semibold text-text">{t.admin.preview}</Button><Button type="button" loading={save.isPending} loadingLabel={t.admin.saveStatusSaving} title={!dirty ? t.admin.noChanges : t.admin.saveRequirements} disabled={!dirty || save.isPending || !draft.title.trim() || draft.duration_minutes < 0 || draft.duration_minutes > 600 || Boolean(draft.video_url && !draftVideo) || draft.resources.length > 10 || draft.resources.some((item, index) => !item.title.trim() || !/^https?:\/\//i.test(item.url) || draft.resources.some((other, otherIndex) => otherIndex !== index && other.url.trim().toLowerCase() === item.url.trim().toLowerCase()))} onClick={() => save.mutate(draft)} className="min-h-10 rounded-[8px] bg-primary px-4 text-sm font-semibold text-white">{t.admin.saveLesson}</Button></div>
      </footer>
    </section>
    <StaleChangeDialog open={staleOpen} title={t.admin.staleChangeTitle} description={t.admin.staleChangeDescription} loadLatestLabel={t.admin.loadLatest} keepEditsLabel={t.admin.keepMyEdits} busy={Boolean(staleAction)} keepEditsBusy={staleAction === "keep"} onDismiss={() => setStaleOpen(false)} onLoadLatest={() => void resolveStale(false)} onKeepEdits={() => void resolveStale(true)} />
    <ConfirmDialog open={restoreOpen} title={t.admin.restoreVersionTitle} description={t.admin.restoreVersionDescription} confirmLabel={t.admin.restoreVersionConfirm} cancelLabel={t.admin.cancel} busy={restore.isPending} confirmDisabled={!selectedVersionId || dirty} onClose={() => setRestoreOpen(false)} onConfirm={() => restore.mutate()} />
    {historyOpen && <div className="fixed inset-0 z-[80] flex justify-end bg-text/30">
      <aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="lesson-history-title" className="flex h-full w-full max-w-[480px] flex-col overflow-y-auto border-l border-border bg-background p-5 transition-transform duration-200 ease-out">
        <header className="flex items-start justify-between gap-3 border-b border-border pb-4"><h2 id="lesson-history-title" className="font-heading text-2xl text-text">{t.admin.lessonHistory}</h2><Button type="button" aria-label={t.admin.lessonHistoryClose} onClick={() => setHistoryOpen(false)} className="h-10 w-10 rounded-[8px] border border-border text-text"><X size={18} aria-hidden="true"/></Button></header>
        {versions.isLoading ? <div className="space-y-3 py-5" aria-busy="true"><div className="h-12 animate-pulse rounded-[8px] border border-border bg-surface-alt"/><div className="h-12 animate-pulse rounded-[8px] border border-border bg-surface-alt"/></div> : versions.isError ? <div className="py-5"><p role="alert" className="text-base text-text">{t.admin.lessonHistoryLoadError}</p><Button type="button" onClick={() => void versions.refetch()} className="mt-3 min-h-10 rounded-[8px] border border-border px-3 text-sm font-semibold text-primary">{t.admin.retry}</Button></div> : versions.data?.length ? <div className="grid min-h-0 flex-1 gap-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ol className="space-y-2 overflow-y-auto">{versions.data.map((version) => {
            return <li key={version.id}><Button type="button" aria-pressed={version.id === activeVersionId} onClick={() => setSelectedVersionId(version.id)} className={`w-full items-start rounded-[8px] border border-border p-3 text-left ${version.id === activeVersionId ? "bg-surface-alt" : "bg-background"}`}>
              <span className="block text-base font-semibold text-text">{t.admin.versionNumber.replace("{number}", String(version.version_no))}</span><LocalTime value={version.saved_at} relative className="mt-1 block text-sm text-text" /><span className="mt-1 block text-sm text-text">{version.saved_by?.full_name ?? t.admin.administrator}</span><span className="mt-1 block text-sm text-text">{t.admin.lessonVersionChanges.replace("{fields}", version.changed_fields.map((field) => versionFieldLabels[field] ?? t.admin.versionBodyField).join(", "))}</span>{version.note && <span className="mt-1 block text-sm text-text">{version.note}</span>}
            </Button></li>;
          })}</ol>
          <section className="min-h-0 overflow-y-auto border-t border-border pt-4 md:border-l md:border-t-0 md:pl-4 md:pt-0">
            {!activeVersionId ? <p className="text-base text-text">{t.admin.selectLesson}</p> : selectedVersion.isLoading ? <div className="h-24 animate-pulse rounded-[8px] border border-border bg-surface-alt" aria-busy="true"/> : selectedVersion.isError ? <><p role="alert" className="text-base text-text">{t.admin.lessonVersionLoadError}</p><Button type="button" onClick={() => void selectedVersion.refetch()} className="mt-3 min-h-10 rounded-[8px] border border-border px-3 text-sm font-semibold text-primary">{t.admin.retry}</Button></> : selectedVersion.data && <>
              <h3 className="font-heading text-xl text-text">{selectedVersion.data.title}</h3><p className="mt-2 flex items-center gap-2 text-sm text-text"><Clock3 size={16} aria-hidden="true"/>{selectedVersion.data.duration_minutes} {t.admin.minutesShort}</p>
              {selectedVersion.data.video && <VideoPlayer key={`${selectedVersion.data.video.provider}/${selectedVersion.data.video.id}`} video={selectedVersion.data.video} title={selectedVersion.data.title} />}
              <div className="mt-4"><RichContent html={selectedVersion.data.body_html}/></div>{selectedVersion.data.try_it_yourself_prompt && <p className="mt-4 border-t border-border pt-3 text-base text-text">{selectedVersion.data.try_it_yourself_prompt}</p>}
              {selectedVersion.data.resources.length > 0 && <ul className="mt-4 space-y-2">{selectedVersion.data.resources.map((resource) => <li key={resource.url}><a href={resource.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary underline"><Link2 size={16} aria-hidden="true"/>{resource.title}</a></li>)}</ul>}
              <Button type="button" disabled={dirty || restore.isPending} onClick={() => setRestoreOpen(true)} className="mt-5 min-h-10 gap-2 rounded-[8px] bg-primary px-3 text-sm font-semibold text-white"><RotateCcw size={16} aria-hidden="true"/>{t.admin.restoreVersion}</Button>
            </>}
          </section>
        </div> : <p className="py-5 text-base text-text">{t.admin.lessonHistoryEmpty}</p>}
      </aside>
    </div>}
  </div>;
}
