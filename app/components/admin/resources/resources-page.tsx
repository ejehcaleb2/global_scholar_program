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
import { ExternalLink, Plus, Save, X } from "lucide-react";
import { AdminPageHeader, ConfirmDialog, DataTable, FormField, StatusBadge } from "@/components/admin/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import { useCopy } from "@/lib/copy/provider";
import { createAdminResource, deleteAdminResource, getAdminResources, getApiErrorMessage, updateAdminResource, type Resource } from "@/lib/api/index";

type Draft = Omit<Resource, "updated_at" | "id" | "locked">;
const emptyDraft: Draft = { title: "", description: "", category: "", access_type: "free", url: "", status: "draft" };

function toDraft(item: Resource): Draft { return ({ title: item.title, description: item.description, category: item.category, access_type: item.access_type, url: item.url, status: item.status }); }

export default function AdminResourcesPage() {
  const { t } = useCopy();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useAdminFilter("status", "all", ["all", "draft", "published"] as const);
  const [search, setSearch] = useAdminFilter<string>("search", "");
  const deferredSearch = useDeferredValue(search);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pageValue, setPage] = useAdminFilter<string>("page", "1");
  const page = Math.max(1, Number(pageValue) || 1);
  const listPage = useQuery({ queryKey: ["admin", "resources", { status: status === "all" ? undefined : status, search: deferredSearch, page }], queryFn: () => getAdminContentPage<Resource>("resources", { status: status === "all" ? undefined : status, search: deferredSearch || undefined, limit: 20, offset: (page - 1) * 20 }) });
  const list = { ...listPage, data: listPage.data?.items };

  const safety = useEditSafety({ draft, setDraft, initial: emptyDraft, loadLatest: async () => {
    const rows = await getAdminResources();
    const item = rows.find((row) => row.id === editingId);
    if (!item) throw new Error(t.admin.loadRecordsError);
    return { draft: toDraft(item), revision: item.updated_at };
  } });
  const revision = safety.revision;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "resources"] });
    void queryClient.invalidateQueries({ queryKey: ["resources"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
  }

  const save = useMutation({
    mutationFn: () => editingId ? updateAdminResource(editingId, { ...draft, expected_updated_at: revision }) : createAdminResource(draft),
    onSuccess: () => { addToast(editingId ? t.admin.savedRecord : t.admin.createdRecord, t.admin.savedRecord, "success"); setEditingId(null); safety.begin(emptyDraft); setPage("1"); invalidate(); },
    onError: (error) => { if (!safety.handleError(error)) addToast(t.admin.saveRecordError, getApiErrorMessage(error, t.admin.saveRecordError), "error"); },
  });
  const remove = useMutation({
    mutationFn: () => deleteAdminResource(editingId!),
    onSuccess: () => { addToast(t.admin.deletedRecord, t.admin.deletedRecord, "success"); setDeleteOpen(false); setEditingId(null); safety.begin(emptyDraft); setPage("1"); invalidate(); },
    onError: (error) => addToast(t.admin.deleteRecordError, getApiErrorMessage(error, t.admin.saveRecordError), "error"),
  });

  function edit(item: Resource, deleting = false) {
    safety.request(() => { setEditingId(item.id); safety.begin(toDraft(item), item.updated_at); setDeleteOpen(deleting); setDeleteOpen(deleting); });
  }

  function closeForm() { if (save.isPending || remove.isPending) return; safety.request(() => { setEditingId(null); safety.begin(emptyDraft); });
  }

  function field<K extends keyof Draft>(name: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  const statuses: Array<{ id: typeof status; label: string }> = [
    { id: "all", label: t.admin.all },
    { id: "published", label: t.admin.publishedStatus },
    { id: "draft", label: t.admin.draftStatus },
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 lg:px-10">
      <AdminPageHeader title={t.admin.resources} description={t.admin.resourcesDescription} actions={<Button type="button" title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} onClick={() => safety.request(() => { setEditingId(""); safety.begin(emptyDraft); })} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-4 text-base font-semibold text-white transition-colors duration-200 ease-out hover:opacity-90"><Plus size={18} aria-hidden="true" />{t.admin.createResource}</Button>} />

      <AdminDrawer open={editingId !== null} title={editingId ? t.admin.editResource : t.admin.createResource} onClose={closeForm}>{editingId !== null && <form onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate(); }} className="mb-7 rounded-[8px] border border-border bg-background p-5" aria-label={editingId ? t.admin.editResource : t.admin.createResource}>
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-heading text-xl text-text">{editingId ? t.admin.editResource : t.admin.createResource}</h2><Button type="button" title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} onClick={closeForm} aria-label={t.admin.cancel} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border text-text hover:bg-surface-alt"><X size={18} aria-hidden="true" /></Button></div>
        <fieldset title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} className="grid gap-4 sm:grid-cols-2">
          <FormField label={t.admin.resourceTitle} htmlFor="resource-title" required><input id="resource-title" value={draft.title} onChange={(event) => field("title", event.target.value)} maxLength={255} className="field-input" /></FormField>
          <FormField label={t.admin.resourceCategory} htmlFor="resource-category" required><input id="resource-category" value={draft.category} onChange={(event) => field("category", event.target.value)} maxLength={100} className="field-input" /></FormField>
          <FormField label={t.admin.accessType} htmlFor="resource-access"><select id="resource-access" value={draft.access_type} onChange={(event) => field("access_type", event.target.value as Draft["access_type"])} className="field-input"><option value="free">{t.admin.freeAccess}</option><option value="members_only">{t.admin.membersOnly}</option></select></FormField>
          <FormField label={t.admin.status} htmlFor="resource-status"><select id="resource-status" value={draft.status} onChange={(event) => field("status", event.target.value as Draft["status"])} className="field-input"><option value="draft">{t.admin.statusDraft}</option><option value="published">{t.admin.statusPublished}</option></select></FormField>
          <FormField label={t.admin.resourceUrl} htmlFor="resource-url" error={draft.url && !isHttpUrl(draft.url) ? t.admin.linkInvalid : undefined}><input id="resource-url" type="url" value={draft.url ?? ""} onChange={(event) => field("url", event.target.value || null)} maxLength={500} className="field-input" /></FormField>
          <div className="sm:col-span-2"><FormField label={t.admin.resourceDescription} htmlFor="resource-description"><textarea id="resource-description" value={draft.description ?? ""} onChange={(event) => field("description", event.target.value || null)} rows={3} className="field-input min-h-24 resize-y" /></FormField></div>
        </fieldset>
        <p className="mt-4 text-sm text-text">{t.admin.saveRequirements}</p><div className="mt-5 flex justify-end gap-3"><Button type="button" title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} onClick={closeForm} className="min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-text">{t.admin.cancel}</Button><Button loading={save.isPending} loadingLabel={t.admin.saving} type="submit" title={t.admin.saveRequirements} disabled={save.isPending || !draft.title.trim() || !draft.category.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50"><Save size={16} aria-hidden="true" />{t.admin.save}</Button></div>
      </form>}</AdminDrawer>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label={t.admin.filterStatus} className="inline-flex w-fit rounded-[8px] border border-border bg-background p-1">{statuses.map((item) => <Button key={item.id} type="button" aria-pressed={status === item.id} onClick={() => setStatus(item.id)} className={`min-h-10 rounded-[8px] px-4 text-sm font-semibold ${status === item.id ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}>{item.label}</Button>)}</div>
        <label className="block w-full sm:max-w-sm"><span className="sr-only">{t.admin.searchResources}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.admin.searchResources} className="field-input" /></label>
      </div>

      <DataTable columns={[t.admin.resourceTitle, t.admin.resourceCategory, t.admin.accessType, t.admin.status, t.admin.actions]} isLoading={list.isLoading} error={list.isError ? t.admin.loadRecordsError : null} onRetry={() => void list.refetch()} retryLabel={t.admin.retry} isEmpty={!list.isLoading && !list.isError && !list.data?.length} emptyTitle={t.admin.resourcesEmpty} skeletonRows={5}>
        {list.data?.map((resource) => <tr key={resource.id} className="transition-colors duration-200 ease-out hover:bg-surface-alt"><td className="min-w-64 px-4 py-4"><p className="text-base font-semibold text-text">{resource.title}</p>{resource.description && <p className="mt-1 line-clamp-2 text-sm text-text">{resource.description}</p>}</td><td className="px-4 py-4 text-base text-text">{resource.category}</td><td className="px-4 py-4 text-base text-text">{resource.access_type === "free" ? t.admin.freeAccess : t.admin.membersOnly}</td><td className="px-4 py-4"><StatusBadge status={resource.status} label={resource.status === "published" ? t.admin.statusPublished : t.admin.statusDraft} /></td><td className="whitespace-nowrap px-4 py-4 text-right"><div className="flex justify-end gap-2">{resource.url && <a href={resource.url} target="_blank" rel="noreferrer" aria-label={resource.title} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border text-primary"><ExternalLink size={16} aria-hidden="true" /></a>}<Button type="button" onClick={() => edit(resource)} className="min-h-10 rounded-[8px] px-3 text-sm font-semibold text-primary hover:bg-primary/5">{t.admin.edit}</Button><Button type="button" onClick={() => edit(resource, true)} className="min-h-10 rounded-[8px] px-3 text-sm font-semibold text-text hover:bg-surface-alt">{t.admin.delete}</Button></div></td></tr>)}
      </DataTable>
      <AdminPagination page={page} total={listPage.data?.total ?? 0} size={20} busy={listPage.isFetching} onChange={(next) => setPage(String(next))} />

      {safety.dialogs}
      <ConfirmDialog open={deleteOpen} title={t.admin.deleteRecordTitle} description={t.admin.deleteRecordDescription} confirmLabel={t.admin.delete} cancelLabel={t.admin.cancel} destructive busy={remove.isPending} onClose={() => setDeleteOpen(false)} onConfirm={() => remove.mutate()} />
    </div>
  );
}
