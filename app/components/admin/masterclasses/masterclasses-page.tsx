"use client";


import { useAdminFilter } from "@/lib/queries/use-admin-filter";
import { useEditSafety } from "@/components/admin/ui/use-edit-safety";
import { isHttpUrl } from "@/lib/utils/urls";
import { AdminPagination } from "@/components/admin/ui/pagination";
import { getAdminContentPage } from "@/lib/api/pagination";
import { AdminDrawer } from "@/components/admin/ui/admin-drawer";
import { Button } from "@/components/ui/button";
import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ExternalLink, Save, X } from "lucide-react";
import { AdminPageHeader, ConfirmDialog, DataTable, FormField, StatusBadge } from "@/components/admin/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import { useCopy } from "@/lib/copy/provider";
import { LocalTime } from "@/components/ui/local-time";
import { createAdminMasterclass, deleteAdminMasterclass, getAdminMasterclasses, getApiErrorMessage, updateAdminMasterclass, type Masterclass } from "@/lib/api/index";

type Draft = Omit<Masterclass, "updated_at" | "id" | "is_past" | "locked" | "session_link" | "session_datetime"> & { session_link: string; session_datetime: string };
const emptyDraft: Draft = { title: "", speaker_name: "", description: "", session_datetime: "", session_link: "", access_type: "free", recording_url: "" };

function dateInputValue(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toDraft(item: Masterclass): Draft { return ({ title: item.title, speaker_name: item.speaker_name, description: item.description ?? "", session_datetime: dateInputValue(item.session_datetime), session_link: item.session_link ?? "", access_type: item.access_type, recording_url: item.recording_url ?? "" }); }

export default function AdminMasterclassesPage() {
  const { t } = useCopy();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useAdminFilter<string>("search", "");
  const deferredSearch = useDeferredValue(search);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pageValue, setPage] = useAdminFilter<string>("page", "1");
  const page = Math.max(1, Number(pageValue) || 1);
  const listPage = useQuery({ queryKey: ["admin", "masterclasses", { search: deferredSearch, page }], queryFn: () => getAdminContentPage<Masterclass>("masterclasses", { search: deferredSearch || undefined, limit: 20, offset: (page - 1) * 20 }) });
  const list = { ...listPage, data: listPage.data?.items };

  const safety = useEditSafety({ draft, setDraft, initial: emptyDraft, loadLatest: async () => {
    const rows = await getAdminMasterclasses();
    const item = rows.find((row) => row.id === editingId);
    if (!item) throw new Error(t.admin.loadRecordsError);
    return { draft: toDraft(item), revision: item.updated_at };
  } });
  const revision = safety.revision;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "masterclasses"] });
    void queryClient.invalidateQueries({ queryKey: ["masterclasses"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
  }
  const save = useMutation({
    mutationFn: () => {
      const values: Draft = { ...draft, session_datetime: new Date(draft.session_datetime).toISOString() };
      return editingId ? updateAdminMasterclass(editingId, { ...values, expected_updated_at: revision }) : createAdminMasterclass(values);
    },
    onSuccess: () => { addToast(editingId ? t.admin.savedRecord : t.admin.createdRecord, t.admin.savedRecord, "success"); setEditingId(null); safety.begin(emptyDraft); setPage("1"); invalidate(); },
    onError: (error) => { if (!safety.handleError(error)) addToast(t.admin.saveRecordError, getApiErrorMessage(error, t.admin.saveRecordError), "error"); },
  });
  const remove = useMutation({
    mutationFn: () => deleteAdminMasterclass(editingId!),
    onSuccess: () => { addToast(t.admin.deletedRecord, t.admin.deletedRecord, "success"); setDeleteOpen(false); setEditingId(null); safety.begin(emptyDraft); setPage("1"); invalidate(); },
    onError: (error) => addToast(t.admin.deleteRecordError, getApiErrorMessage(error, t.admin.saveRecordError), "error"),
  });

  function edit(item: Masterclass, deleting = false) {
    safety.request(() => { setEditingId(item.id); safety.begin(toDraft(item), item.updated_at); setDeleteOpen(deleting); });
  }
  function setField<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  function closeForm() { if (save.isPending || remove.isPending) return; safety.request(() => { setEditingId(null); safety.begin(emptyDraft); }); }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 lg:px-10">
      <AdminPageHeader title={t.admin.masterclasses} description={t.admin.masterclassesDescription} actions={<Button type="button" title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} onClick={() => safety.request(() => { setEditingId(""); safety.begin(emptyDraft); })} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-4 text-base font-semibold text-white"><CalendarPlus size={18} aria-hidden="true" />{t.admin.createMasterclass}</Button>} />
      <AdminDrawer open={editingId !== null} title={editingId ? t.admin.editMasterclass : t.admin.createMasterclass} onClose={closeForm}>{editingId !== null && <form onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate(); }} className="mb-7 rounded-[8px] border border-border bg-background p-5">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-heading text-xl text-text">{editingId ? t.admin.editMasterclass : t.admin.createMasterclass}</h2><Button type="button" aria-label={t.admin.cancel} title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} onClick={closeForm} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border"><X size={18} aria-hidden="true" /></Button></div>
        <fieldset title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} className="grid gap-4 sm:grid-cols-2">
          <FormField label={t.admin.masterclassTitle} htmlFor="masterclass-title" required><input id="masterclass-title" value={draft.title} onChange={(event) => setField("title", event.target.value)} maxLength={255} className="field-input" /></FormField>
          <FormField label={t.admin.speaker} htmlFor="masterclass-speaker" required><input id="masterclass-speaker" value={draft.speaker_name} onChange={(event) => setField("speaker_name", event.target.value)} maxLength={255} className="field-input" /></FormField>
          <FormField label={t.admin.sessionDate} htmlFor="masterclass-date" required><input id="masterclass-date" type="datetime-local" value={draft.session_datetime} onChange={(event) => setField("session_datetime", event.target.value)} className="field-input" /></FormField>
          <FormField label={t.admin.sessionAccess} htmlFor="masterclass-access"><select id="masterclass-access" value={draft.access_type} onChange={(event) => setField("access_type", event.target.value as Draft["access_type"])} className="field-input"><option value="free">{t.admin.freeAccess}</option><option value="members_only">{t.admin.membersOnly}</option></select></FormField>
          <FormField label={t.admin.sessionLink} htmlFor="masterclass-link" error={draft.session_link && !isHttpUrl(draft.session_link) ? t.admin.linkInvalid : undefined} required><input id="masterclass-link" type="url" value={draft.session_link} onChange={(event) => setField("session_link", event.target.value)} maxLength={500} className="field-input" /></FormField>
          <FormField label={t.admin.recordingUrl} htmlFor="masterclass-recording" error={draft.recording_url && !isHttpUrl(draft.recording_url) ? t.admin.linkInvalid : undefined}><input id="masterclass-recording" type="url" value={draft.recording_url ?? ""} onChange={(event) => setField("recording_url", event.target.value || null)} maxLength={500} className="field-input" /></FormField>
          <div className="sm:col-span-2"><FormField label={t.admin.sessionDescription} htmlFor="masterclass-description"><textarea id="masterclass-description" rows={3} value={draft.description ?? ""} onChange={(event) => setField("description", event.target.value || null)} className="field-input min-h-24 resize-y" /></FormField></div>
        </fieldset>
        <p className="mt-4 text-sm text-text">{t.admin.saveRequirements}</p><div className="mt-5 flex justify-end gap-3"><Button type="button" title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} onClick={closeForm} className="min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-text">{t.admin.cancel}</Button><Button loading={save.isPending} loadingLabel={t.admin.saving} type="submit" title={t.admin.saveRequirements} disabled={save.isPending || !draft.title.trim() || !draft.speaker_name.trim() || !draft.session_datetime || !draft.session_link.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50"><Save size={16} aria-hidden="true" />{t.admin.save}</Button></div>
      </form>}</AdminDrawer>
      <label className="mb-5 block w-full sm:ml-auto sm:max-w-sm"><span className="sr-only">{t.admin.searchMasterclasses}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.admin.searchMasterclasses} className="field-input" /></label>
      <DataTable columns={[t.admin.masterclassTitle, t.admin.speaker, t.admin.sessionDate, t.admin.sessionAccess, t.admin.status, t.admin.actions]} isLoading={list.isLoading} error={list.isError ? t.admin.loadRecordsError : null} onRetry={() => void list.refetch()} retryLabel={t.admin.retry} isEmpty={!list.isLoading && !list.isError && !list.data?.length} emptyTitle={t.admin.masterclassesEmpty} skeletonRows={5}>
        {list.data?.map((item) => <tr key={item.id} className="transition-colors duration-200 ease-out hover:bg-surface-alt"><td className="min-w-56 px-4 py-4"><p className="text-base font-semibold text-text">{item.title}</p>{item.description && <p className="mt-1 line-clamp-2 text-sm text-text">{item.description}</p>}</td><td className="px-4 py-4 text-base text-text">{item.speaker_name}</td><td className="whitespace-nowrap px-4 py-4 text-base text-text"><LocalTime value={item.session_datetime} /></td><td className="px-4 py-4 text-base text-text">{item.access_type === "free" ? t.admin.freeAccess : t.admin.membersOnly}</td><td className="px-4 py-4"><StatusBadge label={item.is_past ? t.admin.past : t.admin.upcoming} status={item.is_past ? "draft" : "published"} /></td><td className="whitespace-nowrap px-4 py-4 text-right"><div className="flex justify-end gap-2">{item.session_link && <a href={item.session_link} target="_blank" rel="noreferrer" aria-label={t.admin.sessionLink} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border text-primary"><ExternalLink size={16} aria-hidden="true" /></a>}<Button type="button" onClick={() => edit(item)} className="min-h-10 rounded-[8px] px-3 text-sm font-semibold text-primary hover:bg-primary/5">{t.admin.edit}</Button><Button type="button" onClick={() => edit(item, true)} className="min-h-10 rounded-[8px] px-3 text-sm font-semibold text-text hover:bg-surface-alt">{t.admin.delete}</Button></div></td></tr>)}
      </DataTable>
      <AdminPagination page={page} total={listPage.data?.total ?? 0} size={20} busy={listPage.isFetching} onChange={(next) => setPage(String(next))} />
      {safety.dialogs}
      <ConfirmDialog open={deleteOpen} title={t.admin.deleteRecordTitle} description={t.admin.deleteRecordDescription} confirmLabel={t.admin.delete} cancelLabel={t.admin.cancel} destructive busy={remove.isPending} onClose={() => setDeleteOpen(false)} onConfirm={() => remove.mutate()} />
    </div>
  );
}
