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
import { Plus, Save, X } from "lucide-react";
import { AdminPageHeader, ConfirmDialog, DataTable, FormField, StatusBadge } from "@/components/admin/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import { useCopy } from "@/lib/copy/provider";
import { LocalTime } from "@/components/ui/local-time";
import { createAdminOpportunity, deleteAdminOpportunity, getAdminOpportunities, getApiErrorMessage, updateAdminOpportunity, type Opportunity } from "@/lib/api/index";

type Draft = Omit<Opportunity, "updated_at" | "id" | "status" | "locked">;
const emptyDraft: Draft = { name: "", description: "", category: "", deadline: null, external_link: "" };

function dateInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toDraft(item: Opportunity): Draft { return ({ name: item.name, description: item.description ?? "", category: item.category, deadline: dateInputValue(item.deadline), external_link: item.external_link ?? "" }); }

export default function AdminOpportunitiesPage() {
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
  const listPage = useQuery({ queryKey: ["admin", "opportunities", { search: deferredSearch, page }], queryFn: () => getAdminContentPage<Opportunity>("opportunities", { search: deferredSearch || undefined, limit: 20, offset: (page - 1) * 20 }) });
  const list = { ...listPage, data: listPage.data?.items };

  const safety = useEditSafety({ draft, setDraft, initial: emptyDraft, loadLatest: async () => {
    const rows = await getAdminOpportunities();
    const item = rows.find((row) => row.id === editingId);
    if (!item) throw new Error(t.admin.loadRecordsError);
    return { draft: toDraft(item), revision: item.updated_at };
  } });
  const revision = safety.revision;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "opportunities"] });
    void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  }

  const save = useMutation({
    mutationFn: () => {
      const payload: Draft = { ...draft, deadline: draft.deadline ? new Date(draft.deadline).toISOString() : null };
      return editingId ? updateAdminOpportunity(editingId, { ...payload, expected_updated_at: revision }) : createAdminOpportunity(payload);
    },
    onSuccess: () => { addToast(editingId ? t.admin.savedRecord : t.admin.createdRecord, t.admin.savedRecord, "success"); setEditingId(null); safety.begin(emptyDraft); setPage("1"); invalidate(); },
    onError: (error) => { if (!safety.handleError(error)) addToast(t.admin.saveRecordError, getApiErrorMessage(error, t.admin.saveRecordError), "error"); },
  });
  const remove = useMutation({
    mutationFn: () => deleteAdminOpportunity(editingId!),
    onSuccess: () => { addToast(t.admin.deletedRecord, t.admin.deletedRecord, "success"); setDeleteOpen(false); setEditingId(null); safety.begin(emptyDraft); setPage("1"); invalidate(); },
    onError: (error) => addToast(t.admin.deleteRecordError, getApiErrorMessage(error, t.admin.saveRecordError), "error"),
  });

  function edit(item: Opportunity, deleting = false) {
    safety.request(() => { setEditingId(item.id); safety.begin(toDraft(item), item.updated_at); setDeleteOpen(deleting); });
  }
  function setField<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  function closeForm() { if (save.isPending || remove.isPending) return; safety.request(() => { setEditingId(null); safety.begin(emptyDraft); }); }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 lg:px-10">
      <AdminPageHeader title={t.admin.opportunities} description={t.admin.opportunitiesDescription} actions={<Button type="button" title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} onClick={() => safety.request(() => { setEditingId(""); safety.begin(emptyDraft); })} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-4 text-base font-semibold text-white"><Plus size={18} aria-hidden="true" />{t.admin.createOpportunity}</Button>} />
      <AdminDrawer open={editingId !== null} title={editingId ? t.admin.editOpportunity : t.admin.createOpportunity} onClose={closeForm}>{editingId !== null && <form onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate(); }} className="mb-7 rounded-[8px] border border-border bg-background p-5">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-heading text-xl text-text">{editingId ? t.admin.editOpportunity : t.admin.createOpportunity}</h2><Button type="button" aria-label={t.admin.cancel} title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} onClick={closeForm} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border"><X size={18} aria-hidden="true" /></Button></div>
        <fieldset title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} className="grid gap-4 sm:grid-cols-2">
          <FormField label={t.admin.opportunityName} htmlFor="opportunity-name" required><input id="opportunity-name" value={draft.name} onChange={(event) => setField("name", event.target.value)} maxLength={255} className="field-input" /></FormField>
          <FormField label={t.admin.opportunityCategory} htmlFor="opportunity-category" required><input id="opportunity-category" value={draft.category} onChange={(event) => setField("category", event.target.value)} maxLength={100} className="field-input" /></FormField>
          <FormField label={t.admin.deadline} htmlFor="opportunity-deadline" hint={t.admin.computedStatus}><input id="opportunity-deadline" type="datetime-local" value={draft.deadline ?? ""} onChange={(event) => setField("deadline", event.target.value || null)} className="field-input" /></FormField>
          <FormField label={t.admin.externalLink} htmlFor="opportunity-link" error={draft.external_link && !isHttpUrl(draft.external_link) ? t.admin.linkInvalid : undefined}><input id="opportunity-link" type="url" value={draft.external_link ?? ""} onChange={(event) => setField("external_link", event.target.value || null)} maxLength={500} className="field-input" /></FormField>
          <div className="sm:col-span-2"><FormField label={t.admin.opportunityDescription} htmlFor="opportunity-description"><textarea id="opportunity-description" rows={4} value={draft.description ?? ""} onChange={(event) => setField("description", event.target.value || null)} className="field-input min-h-28 resize-y" /></FormField></div>
        </fieldset>
        <p className="mt-4 text-sm text-text">{t.admin.saveRequirements}</p><div className="mt-5 flex justify-end gap-3"><Button type="button" title={save.isPending ? t.admin.saving : remove.isPending ? t.admin.deleting : undefined} disabled={save.isPending || remove.isPending} onClick={closeForm} className="min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-text">{t.admin.cancel}</Button><Button loading={save.isPending} loadingLabel={t.admin.saving} type="submit" title={t.admin.saveRequirements} disabled={save.isPending || !draft.name.trim() || !draft.category.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50"><Save size={16} aria-hidden="true" />{t.admin.save}</Button></div>
      </form>}</AdminDrawer>
      <label className="mb-5 block w-full sm:ml-auto sm:max-w-sm"><span className="sr-only">{t.admin.searchOpportunities}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.admin.searchOpportunities} className="field-input" /></label>
      <DataTable columns={[t.admin.opportunityName, t.admin.opportunityCategory, t.admin.deadline, t.admin.status, t.admin.actions]} isLoading={list.isLoading} error={list.isError ? t.admin.loadRecordsError : null} onRetry={() => void list.refetch()} retryLabel={t.admin.retry} isEmpty={!list.isLoading && !list.isError && !list.data?.length} emptyTitle={t.admin.opportunitiesEmpty} skeletonRows={5}>
        {list.data?.map((item) => <tr key={item.id} className="transition-colors duration-200 ease-out hover:bg-surface-alt"><td className="min-w-64 px-4 py-4"><p className="text-base font-semibold text-text">{item.name}</p>{item.description && <p className="mt-1 line-clamp-2 text-sm text-text">{item.description}</p>}</td><td className="px-4 py-4 text-base text-text">{item.category}</td><td className="whitespace-nowrap px-4 py-4 text-base text-text">{item.deadline ? <LocalTime value={item.deadline} options={{ dateStyle: "medium" }} /> : "—"}</td><td className="px-4 py-4"><StatusBadge label={item.status} status={item.status.toLowerCase().replaceAll(" ", "_")} /></td><td className="whitespace-nowrap px-4 py-4 text-right"><Button type="button" onClick={() => edit(item)} className="min-h-10 rounded-[8px] px-3 text-sm font-semibold text-primary hover:bg-primary/5">{t.admin.edit}</Button><Button type="button" onClick={() => edit(item, true)} className="min-h-10 rounded-[8px] px-3 text-sm font-semibold text-text hover:bg-surface-alt">{t.admin.delete}</Button></td></tr>)}
      </DataTable>
      <AdminPagination page={page} total={listPage.data?.total ?? 0} size={20} busy={listPage.isFetching} onChange={(next) => setPage(String(next))} />
      {safety.dialogs}
      <ConfirmDialog open={deleteOpen} title={t.admin.deleteRecordTitle} description={t.admin.deleteRecordDescription} confirmLabel={t.admin.delete} cancelLabel={t.admin.cancel} destructive busy={remove.isPending} onClose={() => setDeleteOpen(false)} onConfirm={() => remove.mutate()} />
    </div>
  );
}
