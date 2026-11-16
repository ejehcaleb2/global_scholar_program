"use client";

import { useUploadFeedback } from "@/components/ui/use-upload-feedback";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";


import { useEditSafety } from "@/components/admin/ui/use-edit-safety";
import { PublicationTextEditor } from "./publication-text-editor";
import { PublicationSectionsEditor } from "./publication-sections-editor";
import { PublicationContent } from "@/components/landing/publication-content";
import { Button } from "@/components/ui/button";
import Link from "@/components/ui/pending-link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "@/lib/utils/zod";
import { isHttpUrl } from "@/lib/utils/urls";
import { parseLessonVideo } from "@/lib/utils/video";
import { ChevronLeft, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useCopy } from "@/lib/copy/provider";
import { useToast } from "@/components/ui/toast-provider";
import { AdminPageHeader, ConfirmDialog, FormField, SwitchToggle } from "@/components/admin/ui/primitives";
import {
  createAdminHomepagePost,
  deleteAdminHomepagePost,
  getAdminHomepagePost,
  getAdminHomepagePosts,
  getApiErrorMessage,
  updateAdminHomepagePost,
  uploadAdminMedia,
  type HomepagePost,
} from "@/lib/api/index";
import { MediaImage } from "@/components/ui/media-image";

type Props = { postId?: string };
type EditorProps = { initialPost?: HomepagePost };
type FormData = Pick<HomepagePost, "title" | "summary" | "body_html" | "thumbnail_url" | "status" | "pinned" | "sections">;

const emptyForm: FormData = { title: "", summary: "", body_html: "", thumbnail_url: null, status: "draft", pinned: false, sections: [] };

function isBodyEmpty(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/gi, " ").trim().length === 0;
}

function safeImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validationSchema(t: ReturnType<typeof useCopy>["t"]) {
  return z.object({
    title: z.string().trim().min(1, t.admin.titleRequired).max(255),
    summary: z.string().max(2000),
    body_html: z.string(),
    thumbnail_url: z.string().nullable().refine((value) => value === null || safeImageUrl(value), t.admin.linkInvalid),
    status: z.enum(["draft", "published"]),
    pinned: z.boolean(),
    sections: z.array(z.discriminatedUnion("type", [
      z.object({ id: z.string(), type: z.literal("text"), body_html: z.string().max(200000, t.posts.sectionTextTooLong).refine(value => !isBodyEmpty(value), t.posts.sectionTextRequired) }),
      z.object({ id: z.string(), type: z.literal("image"), url: z.string().trim().min(1, t.posts.photoUrlRequired).max(500, t.posts.sectionUrlTooLong).refine(value => !value || isHttpUrl(value), t.admin.linkInvalid), alt: z.string().trim().min(1, t.posts.photoDescriptionRequired).max(300, t.posts.photoDescriptionTooLong), caption: z.string().trim().max(1000, t.posts.sectionCaptionTooLong) }),
      z.object({ id: z.string(), type: z.literal("video"), url: z.string().trim().min(1, t.posts.videoUrlRequired).max(500, t.posts.sectionUrlTooLong).refine(value => !value || Boolean(parseLessonVideo(value)), t.posts.videoUrlInvalid), caption: z.string().trim().max(1000, t.posts.sectionCaptionTooLong) }),
    ])).max(50, t.posts.sectionLimit),
  }).refine(value => !isBodyEmpty(value.body_html) || value.sections.length > 0, { path: ["body_html"], message: t.admin.bodyRequired });
}

export function AdminPostForm({ postId }: Props) {
  const { t } = useCopy();
  const editQuery = useQuery({
    queryKey: ["admin", "homepage-post", postId],
    queryFn: () => getAdminHomepagePost(postId!),
    enabled: Boolean(postId),
  });

  if (postId && editQuery.isLoading) {
    return <main className="mx-auto min-h-[60vh] max-w-[720px] animate-pulse space-y-5 px-5 py-10" aria-busy="true"><div className="h-6 w-40 rounded-[8px] bg-surface-alt" /><div className="h-10 w-64 rounded-[8px] bg-surface-alt" /><div className="h-16 rounded-[8px] bg-surface-alt" /><div className="h-80 rounded-[8px] bg-surface-alt" /></main>;
  }

  if (postId && (editQuery.isError || !editQuery.data)) {
    return <main className="mx-auto max-w-[720px] px-5 py-16"><p role="alert" className="text-base text-text">{t.admin.notFound}</p><Link href="/admin/homepage-posts" className="mt-5 inline-flex min-h-11 items-center gap-2 text-base font-semibold text-primary"><ChevronLeft size={18} aria-hidden="true" />{t.admin.backToPosts}</Link></main>;
  }

  return <AdminPostFormEditor key={postId ?? "new"} initialPost={editQuery.data} />;
}

function AdminPostFormEditor({ initialPost }: EditorProps) {
  const postId = initialPost?.id;
  const isEdit = Boolean(postId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useCopy();
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const initialForm: FormData = initialPost ? {
    title: initialPost.title,
    summary: initialPost.summary ?? "",
    body_html: initialPost.body_html,
    thumbnail_url: initialPost.thumbnail_url,
    status: initialPost.status,
    pinned: initialPost.pinned,
    sections: initialPost.sections ?? [],
  } : emptyForm;
  const initialRef = useRef<FormData>(initialForm);
  const originalRevision = useRef(initialPost?.updated_at);
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [sectionUploadBusy, setSectionUploadBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState(initialForm.thumbnail_url ?? "");
  const schema = useMemo(() => validationSchema(t), [t]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialRef.current);
  const postsQuery = useQuery({ queryKey: ["admin", "homepage-posts", { status: undefined }], queryFn: () => getAdminHomepagePosts() });
  const safety = useEditSafety({ draft: form, initial: initialForm, setDraft: (value: FormData) => {
    setForm(value);
  }, loadLatest: async () => {
    const latest = await getAdminHomepagePost(postId!);
    return { revision: latest.updated_at, draft: { title: latest.title, summary: latest.summary ?? "", body_html: latest.body_html, thumbnail_url: latest.thumbnail_url, status: latest.status, pinned: latest.pinned, sections: latest.sections ?? [] } };
  } });
  const existing = initialPost;
  const pinnedCount = postsQuery.data?.filter((post) => post.pinned).length ?? 0;
  const canPin = form.status === "published" && (form.pinned || pinnedCount < 3);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const handleNavigation = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (window.confirm(t.admin.unsavedChanges)) router.push(`${anchor.pathname}${anchor.search}${anchor.hash}`);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleNavigation, true);
    };
  }, [dirty, router, t.admin.unsavedChanges]);

  const saveMutation = useMutation({
    mutationFn: (payload: FormData) => postId ? updateAdminHomepagePost(postId, { ...payload, expected_updated_at: safety.revision ?? originalRevision.current }) : createAdminHomepagePost(payload),
    onSuccess: () => {
      addToast(isEdit ? t.admin.postUpdated : t.admin.postCreated, t.admin.postCreated, "success");
      void queryClient.invalidateQueries({ queryKey: ["admin", "homepage-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "homepage-post"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      void queryClient.invalidateQueries({ queryKey: ["public", "homepage-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["public", "homepage-post"] });
      initialRef.current = form;
      router.push("/admin/homepage-posts");
    },
    onError: (error) => {
      if (safety.handleError(error)) return;
      const message = getApiErrorMessage(error, t.admin.saveFailed);
      const fieldErrors: Record<string, string> = {};
      if ("status" in error && "message" in error) {
        try {
          const detail = JSON.parse(error.message as string).detail;
          if (Array.isArray(detail)) {
            for (const item of detail) {
              const field = item.loc?.at(-1);
              if (typeof field === "string") fieldErrors[field] = item.msg;
            }
          }
        } catch {
          fieldErrors.form = message;
        }
      }
      setErrors(fieldErrors.form || Object.keys(fieldErrors).length ? fieldErrors : { form: message });
      addToast(t.admin.saveFailed, message, "error");
    },
  });

  const uploadFeedback = useUploadFeedback(t.admin.uploadFailed, t.admin.uploadFailed);
  const uploadMutation = useMutation({
    mutationFn: uploadAdminMedia,
    onSuccess: ({ url }) => {
      setForm((value) => ({ ...value, thumbnail_url: url }));
      setImageUrlInput(url);
      addToast(t.admin.uploadImage, t.admin.uploadImage, "success");
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
    },
    onError: uploadFeedback.error,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminHomepagePost(postId!),
    onSuccess: () => {
      addToast(t.admin.postDeleted, t.admin.postDeleted, "success");
      void queryClient.invalidateQueries({ queryKey: ["admin", "homepage-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
      void queryClient.invalidateQueries({ queryKey: ["public", "homepage-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["public", "homepage-post"] });
      setConfirmDelete(false);
      router.push("/admin/homepage-posts");
    },
    onError: (error) => addToast(t.admin.postDeleted, getApiErrorMessage(error, t.admin.saveFailed), "error"),
  });

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors(current => {
      if (key !== "sections" || !Object.keys(current).some(field => field.startsWith("sections"))) return { ...current, [key]: "" };
      const validation = schema.safeParse({ ...form, [key]: value });
      const remaining = Object.fromEntries(Object.entries(current).filter(([field]) => !field.startsWith("sections")));
      if (!validation.success) for (const issue of validation.error.issues) if (issue.path[0] === "sections") remaining[issue.path.join(".")] = issue.message;
      return remaining;
    });
  }

  function leaveTo(url: string) {
    if (dirty && !window.confirm(t.admin.unsavedChanges)) return;
    router.push(url);
  }

  function submit() {
    const result = schema.safeParse(form);
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map(issue => [issue.path.join(".") || "form", issue.message])));
      const first = result.error.issues[0];
      const index = typeof first.path[1] === "number" ? first.path[1] : undefined;
      const section = index === undefined ? undefined : form.sections[index];
      const label = section ? t.posts.sectionLabel.replace("{type}", section.type === "text" ? t.posts.textSection : section.type === "image" ? t.posts.imageSection : t.posts.videoSection).replace("{number}", String(index! + 1)) : "";
      if (section) addToast(t.posts.validationTitle, t.posts.validationSection.replace("{section}", label).replace("{message}", first.message), "error");
      const field = section ? document.getElementById(first.path[2] === "body_html" ? `section-${section.id}` : `${String(first.path[2])}-${section.id}`) : document.getElementById(first.path[0] === "body_html" ? "post-body" : `post-${String(first.path[0])}`);
      const input = field?.matches("input, textarea") ? field : field?.querySelector<HTMLElement>('[contenteditable="true"]');
      input?.focus();
      field?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
      return;
    }
    setErrors({});
    saveMutation.mutate(result.data);
  }

  async function handleImage(file?: File) {
    if (!file || uploadFeedback.remaining > 0) return;
    if (!file.type.startsWith("image/")) {
      addToast(t.admin.uploadFailed, t.admin.uploadFailed, "error");
      return;
    }
    uploadMutation.mutate(file);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleImage(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleImage(event.dataTransfer.files[0]);
  }

  const title = isEdit ? t.admin.editPostTitle : t.admin.newPostTitle;
  const saveButton = <Button loading={saveMutation.isPending} loadingLabel={t.admin.saving} type="button" onClick={submit} disabled={saveMutation.isPending || uploadMutation.isPending || sectionUploadBusy} title={sectionUploadBusy || uploadMutation.isPending ? t.posts.uploadBusy : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-primary px-5 text-base font-semibold text-white transition-colors duration-200 ease-out hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t.admin.save}</Button>;

  return (
    <main className="mx-auto w-full max-w-[720px] px-5 py-8 sm:px-8">
      <Button type="button" onClick={() => leaveTo("/admin/homepage-posts")} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-base font-semibold text-primary transition-colors duration-200 ease-out hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronLeft size={18} aria-hidden="true" />{t.admin.backToPosts}</Button>
      {safety.dialogs}
      <AdminPageHeader title={title} description={t.posts.purpose} actions={<div className="flex gap-2">{saveButton}<Button type="button" onClick={() => setPreview((value) => !value)} aria-pressed={preview} className="min-h-11 rounded-[8px] border border-border px-4 text-base font-semibold text-text transition-colors duration-200 ease-out hover:bg-surface-alt">{preview ? t.admin.hidePreview : t.admin.preview}</Button></div>} />

      {initialPost?.status === "published" && <div className="mb-6 rounded-[8px] border border-border bg-surface-alt p-4"><Link href={`/posts/${initialPost.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-[8px] px-2 text-base font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t.posts.viewPost}</Link><p className="mt-1 text-sm text-text">{t.posts.savedPageHint}</p></div>}

      {errors.form && <p role="alert" className="mb-4 rounded-[8px] border border-border bg-surface-alt p-3 text-base text-text">{errors.form}</p>}

      <div className="space-y-6">
        <header><h2 className="font-heading text-2xl text-text">{t.posts.coverHeading}</h2><p className="mt-2 text-base text-text">{t.posts.coverHelp}</p></header>
        <FormField label={t.admin.title} htmlFor="post-title" required error={errors.title}>
          <div className="relative"><input id="post-title" maxLength={255} value={form.title} onChange={(event) => setField("title", event.target.value)} className="field-input pr-20" aria-invalid={Boolean(errors.title)} /><span className="absolute right-3 top-3 text-sm text-text">{form.title.length}/255</span></div>
        </FormField>

        <FormField label={t.admin.summary} htmlFor="post-summary" hint={t.posts.summaryHelp} error={errors.summary}>
          <div className="relative"><textarea id="post-summary" value={form.summary ?? ""} maxLength={2000} onChange={(event) => setField("summary", event.target.value)} rows={3} className="field-input min-h-28 resize-y pr-20" aria-invalid={Boolean(errors.summary)} /><span className="absolute bottom-3 right-3 text-sm text-text">{(form.summary ?? "").length}</span></div>
        </FormField>

        <FormField label={t.admin.thumbnail} htmlFor="post-image-url" error={errors.thumbnail_url}>
          <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`rounded-[8px] border border-dashed p-4 transition-colors duration-200 ease-out ${dragging ? "border-primary bg-primary/5" : "border-border bg-background"}`}>
            {form.thumbnail_url && <div className="relative mb-4 aspect-[16/7] overflow-hidden rounded-[8px] border border-border"><MediaImage src={form.thumbnail_url} alt="" fill sizes="(max-width: 720px) 100vw, 672px" className="object-cover" wrapperClassName="absolute inset-0" /><Button type="button" onClick={() => { setField("thumbnail_url", null); setImageUrlInput(""); }} aria-label={t.admin.removeImage} className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-[8px] bg-background text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X size={18} aria-hidden="true" /></Button></div>}
            <div className="flex flex-wrap items-center gap-3">
              <RateLimitAlert seconds={uploadFeedback.remaining} />
              <input disabled={uploadFeedback.remaining > 0} ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="sr-only" aria-label={t.admin.uploadImage} />
              <Button loading={uploadMutation.isPending} loadingLabel={t.admin.uploading} type="button" onClick={() => inputRef.current?.click()} disabled={uploadMutation.isPending || uploadFeedback.remaining > 0} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-border px-4 text-base font-semibold text-text transition-colors duration-200 ease-out hover:bg-surface-alt disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{uploadMutation.isPending ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Upload size={17} aria-hidden="true" />}{uploadMutation.isPending ? t.admin.uploading : t.admin.uploadImage}</Button>
              <input id="post-image-url" value={imageUrlInput} onChange={(event) => { setImageUrlInput(event.target.value); if (event.target.value === "") setField("thumbnail_url", null); else if (safeImageUrl(event.target.value)) setField("thumbnail_url", event.target.value); }} placeholder="https://" className="field-input min-w-[220px] flex-1" />
            </div>
          </div>
        </FormField>

        <h2 className="border-t border-border pt-6 font-heading text-2xl text-text">{t.posts.articleHeading}</h2>
        <FormField label={t.admin.body} htmlFor="post-body" hint={t.posts.bodyHelp} error={errors.body_html}>
          <PublicationTextEditor id="post-body" label={t.admin.body} value={form.body_html} onChange={html => setField("body_html", html)} />
        </FormField>

        <PublicationSectionsEditor errors={errors} sections={form.sections} onChange={sections => setField("sections", sections)} onBusyChange={setSectionUploadBusy} />
        {errors.sections && <p role="alert" className="text-base text-red-600">{errors.sections}</p>}
        <h2 className="border-t border-border pt-6 font-heading text-2xl text-text">{t.posts.publishingHeading}</h2>
        <div className="space-y-1.5">
          <p id="post-status-label" className="block text-base font-semibold text-text">{t.admin.statusField}</p>
          <div role="group" aria-labelledby="post-status-label" className="inline-flex rounded-[8px] border border-border bg-background p-1">
            {(["draft", "published"] as const).map((status) => <Button key={status} type="button" aria-label={status === "draft" ? t.admin.saveDraft : t.admin.publishedStatus} aria-pressed={form.status === status} onClick={() => { setField("status", status); if (status === "draft") setField("pinned", false); }} className={`min-h-11 rounded-[8px] px-5 text-base font-semibold transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${form.status === status ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}>{status === "draft" ? t.admin.saveDraft : t.admin.publishedStatus}</Button>)}
          </div>
        </div>

        <FormField label={t.admin.pinToHomepage} htmlFor="pin-toggle" hint={t.admin.pinExplanation}>
          <div className="flex items-center gap-3"><span id="pin-toggle"><SwitchToggle checked={form.pinned} onChange={(pinned) => setField("pinned", pinned)} label={t.admin.pinToHomepage} disabled={!canPin} disabledReason={form.status !== "published" ? t.admin.draftCannotPin : t.admin.unpinFirst} /></span><span className="text-base text-text">{t.admin.pinToHomepage}</span></div>
          {isEdit && existing?.pinned && form.status === "draft" && <p className="mt-2 rounded-[8px] border border-border bg-surface-alt p-3 text-base text-text">{t.admin.unpublishNotice}</p>}
        </FormField>

        {preview && <section className="border-t border-border pt-6" aria-label={t.admin.preview}>
          <h2 className="font-heading text-2xl text-text">{form.title || t.admin.newPostTitle}</h2>
          {form.thumbnail_url && <MediaImage src={form.thumbnail_url} alt="" fill sizes="(max-width: 720px) 100vw, 672px" className="object-cover" wrapperClassName="relative block mt-4 aspect-[16/7] overflow-hidden rounded-[8px] border border-border" />}
          {form.summary && <p className="mt-4 text-lg leading-7 text-text">{form.summary}</p>}
          <PublicationContent body={form.body_html} sections={form.sections} title={form.title} />
        </section>}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          {isEdit ? <Button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-border px-4 text-base font-semibold text-text transition-colors duration-200 ease-out hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Trash2 size={17} aria-hidden="true" />{t.admin.delete}</Button> : <span />}
          {saveButton}
        </div>
      </div>

      <ConfirmDialog open={confirmDelete} title={t.admin.deletePostTitle} description={t.admin.deletePostDescription} confirmLabel={t.admin.confirmDelete} cancelLabel={t.admin.cancel} destructive busy={deleteMutation.isPending} onClose={() => setConfirmDelete(false)} onConfirm={() => deleteMutation.mutate()} />
    </main>
  );
}
