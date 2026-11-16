"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, Trash2, Upload } from "lucide-react";
import type { PostSection } from "@/lib/api/posts";
import { uploadAdminMedia } from "@/lib/api/index";
import { parseLessonVideo } from "@/lib/utils/video";
import { isHttpUrl } from "@/lib/utils/urls";
import { useCopy } from "@/lib/copy/provider";
import { Button } from "@/components/ui/button";
import { MediaImage } from "@/components/ui/media-image";
import { useToast } from "@/components/ui/toast-provider";
import { useUploadFeedback } from "@/components/ui/use-upload-feedback";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";
import { ConfirmDialog, FormField } from "@/components/admin/ui/primitives";
import { PublicationTextEditor } from "./publication-text-editor";

const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-border px-3 text-base font-semibold text-primary transition-colors duration-200 ease-out hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
export function PublicationSectionsEditor({ sections, onChange, onBusyChange, errors }: { errors: Record<string, string>; sections: PostSection[]; onChange: (sections: PostSection[]) => void; onBusyChange: (busy: boolean) => void }) {
  const { t } = useCopy(); const { addToast } = useToast();
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null); const latest = useRef(sections);
  useEffect(() => { latest.current = sections; }, [sections]);
  const queryClient = useQueryClient(); const feedback = useUploadFeedback(t.admin.uploadFailed, t.admin.uploadFailed);
  const upload = useMutation({ mutationFn: ({ file }: { file: File; id: string }) => uploadAdminMedia(file), onSuccess: ({ url }, { id }) => { onChange(latest.current.map(s => s.id === id && s.type === "image" ? { ...s, url } : s)); addToast(t.posts.photoUploaded, t.posts.draftNotice, "success"); void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] }); }, onError: feedback.error });
  useEffect(() => { onBusyChange(upload.isPending); }, [upload.isPending, onBusyChange]);
  const kind = (type: PostSection["type"]) => type === "text" ? t.posts.textSection : type === "image" ? t.posts.imageSection : t.posts.videoSection;
  function add(type: PostSection["type"]) { const id = crypto.randomUUID(); const s: PostSection = type === "text" ? { id, type, body_html: "" } : type === "image" ? { id, type, url: "", alt: "", caption: "" } : { id, type, url: "", caption: "" }; onChange([...sections, s]); addToast(t.posts.sectionAdded, t.posts.draftNotice, "success"); }
  function replace(s: PostSection) { onChange(sections.map(current => current.id === s.id ? s : current)); }
  function move(index: number, d: -1 | 1) { const next = [...sections]; [next[index], next[index + d]] = [next[index + d], next[index]]; onChange(next); addToast(t.posts.sectionMoved, t.posts.draftNotice, "success"); }
  return <section aria-label={t.posts.articleHeading} className="space-y-5">
    <p className="text-base leading-7 text-text">{t.posts.sectionsHelp}</p><RateLimitAlert seconds={feedback.remaining} />
    <input ref={input} type="file" className="sr-only" aria-label={t.posts.photoFile} tabIndex={-1} accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file && uploadId) upload.mutate({ file, id: uploadId }); e.target.value = ""; }} />
    {sections.length === 0 && <p className="rounded-[8px] border border-border bg-surface-alt p-4 text-base text-text">{t.posts.noSections}</p>}
    {sections.map((s, i) => { const fieldError = (field: string) => errors[`sections.${i}.${field}`]; const label = t.posts.sectionLabel.replace("{type}", kind(s.type)).replace("{number}", String(i + 1)); return <section key={s.id} aria-label={label} className="space-y-4 rounded-[8px] border border-border p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-heading text-xl text-text">{label}</h3><div className="flex flex-wrap gap-2">
        <Button className={actionClass} aria-label={t.posts.moveUp} disabled={i === 0 || upload.isPending} title={upload.isPending ? t.posts.uploadBusy : i === 0 ? t.posts.firstSection : undefined} onClick={() => move(i, -1)}><ArrowUp size={16} /></Button>
        <Button className={actionClass} aria-label={t.posts.moveDown} disabled={i === sections.length - 1 || upload.isPending} title={upload.isPending ? t.posts.uploadBusy : i === sections.length - 1 ? t.posts.lastSection : undefined} onClick={() => move(i, 1)}><ArrowDown size={16} /></Button>
        <Button className={actionClass} aria-label={t.posts.removeSection} disabled={upload.isPending} title={upload.isPending ? t.posts.uploadBusy : undefined} onClick={() => setRemoveId(s.id)}><Trash2 size={16} /></Button>
      </div></header>
      {s.type === "text" && <PublicationTextEditor id={`section-${s.id}`} label={label} error={fieldError("body_html")} value={s.body_html} onChange={body_html => replace({ ...s, body_html })} />}
      {s.type === "image" && <>
        {isHttpUrl(s.url) && <MediaImage src={s.url} alt={s.alt} width={1200} height={800} sizes="(max-width: 720px) 100vw, 672px" className="h-auto max-h-96 w-full object-contain" wrapperClassName="block overflow-hidden rounded-[8px] bg-surface-alt" />}
        <FormField label={t.posts.photoUrl} htmlFor={`url-${s.id}`} required error={fieldError("url") || (s.url && !isHttpUrl(s.url) ? t.admin.linkInvalid : undefined)}><input id={`url-${s.id}`} aria-invalid={Boolean(fieldError("url"))} className="field-input" type="url" maxLength={500} value={s.url} onChange={e => replace({ ...s, url: e.target.value })} /></FormField>
        <Button className={actionClass} loading={upload.isPending && upload.variables?.id === s.id} loadingLabel={t.admin.uploading} disabled={upload.isPending || feedback.remaining > 0} title={upload.isPending ? t.posts.uploadBusy : feedback.remaining > 0 ? t.admin.uploadFailed : undefined} onClick={() => { setUploadId(s.id); input.current?.click(); }}><Upload size={16} />{t.admin.uploadImage}</Button>
        <FormField label={t.posts.photoAlt} htmlFor={`alt-${s.id}`} hint={t.posts.photoAltHelp} required error={fieldError("alt")}><input id={`alt-${s.id}`} aria-invalid={Boolean(fieldError("alt"))} className="field-input" maxLength={300} value={s.alt} onChange={e => replace({ ...s, alt: e.target.value })} /></FormField>
      </>}
      {s.type === "video" && <FormField label={t.posts.videoUrl} htmlFor={`url-${s.id}`} hint={t.posts.videoHelp} error={fieldError("url") || (s.url && !parseLessonVideo(s.url) ? t.posts.videoUrlInvalid : undefined)} required><input id={`url-${s.id}`} aria-invalid={Boolean(fieldError("url"))} className="field-input" type="url" maxLength={500} value={s.url} onChange={e => replace({ ...s, url: e.target.value })} /></FormField>}
      {s.type !== "text" && <FormField label={t.posts.caption} htmlFor={`caption-${s.id}`} error={fieldError("caption")}><textarea id={`caption-${s.id}`} className="field-input" rows={2} maxLength={1000} value={s.caption} onChange={e => replace({ ...s, caption: e.target.value })} /></FormField>}
    </section>; })}
    <div className="flex flex-wrap gap-3">{(["text", "image", "video"] as const).map(type => <Button key={type} className={actionClass} disabled={sections.length >= 50 || upload.isPending} title={upload.isPending ? t.posts.uploadBusy : sections.length >= 50 ? t.posts.sectionLimit : undefined} onClick={() => add(type)}>{type === "text" ? t.posts.addText : type === "image" ? t.posts.addImage : t.posts.addVideo}</Button>)}</div>
    <ConfirmDialog open={Boolean(removeId)} title={t.posts.removeSectionTitle} description={t.posts.removeSectionDescription} confirmLabel={t.posts.removeSection} cancelLabel={t.admin.cancel} onClose={() => setRemoveId(null)} onConfirm={() => { onChange(sections.filter(s => s.id !== removeId)); setRemoveId(null); addToast(t.posts.sectionRemoved, t.posts.draftNotice, "success"); }} />
  </section>;
}
