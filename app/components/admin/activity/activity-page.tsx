"use client";

import Link from "@/components/ui/pending-link";
import { useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPageHeader, DataTable, FormField } from "@/components/admin/ui/primitives";
import { AuditActivityRow } from "@/components/admin/activity/activity-row";
import { useCopy } from "@/lib/copy/provider";
import { getAdminAuditPage } from "@/lib/api/activity";
import { useAdminFilter } from "@/lib/queries/use-admin-filter";
import { useToast } from "@/components/ui/toast-provider";

export default function AdminActivityPage() {
  const { t } = useCopy();
  const { addToast } = useToast();
  const [entityType, setEntityType] = useAdminFilter<string>("entity_type", "");
  const [entityId, setEntityId] = useAdminFilter<string>("entity_id", "");
  const [search, setSearch] = useAdminFilter<string>("q", "");
  const [pageValue, setPage] = useAdminFilter<string>("page", "1");
  const page = Math.max(1, Math.min(100000, Number(pageValue) || 1));
  const q = useDeferredValue(search);
  const limit = 25;
  const filters = { entity_type: entityType || undefined, entity_id: entityId || undefined, q: q || undefined, offset: (page - 1) * limit };
  const activity = useQuery({ queryKey: ["admin", "audit-logs", filters], queryFn: () => getAdminAuditPage(limit, filters) });
  async function refresh() {
    const result = await activity.refetch();
    const message = result.isError ? t.admin.loadRecordsError : t.admin.refreshComplete;
    addToast(message, message, result.isError ? "error" : "success");
  }
  return <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 lg:px-10">
    <AdminPageHeader title={t.admin.activity} description={t.admin.activityDescription} actions={<>
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-border px-4 text-sm font-semibold text-primary"><ArrowLeft size={16} aria-hidden="true" />{t.admin.dashboard}</Link>
      <Button loading={activity.isFetching} loadingLabel={t.admin.refreshing} onClick={() => void refresh()} className="min-h-11 gap-2 rounded-[8px] border border-border px-4 text-primary"><RefreshCw size={16} aria-hidden="true" />{t.admin.refresh}</Button>
    </>} />
    <div className="mb-5 grid gap-4 md:grid-cols-3">
      <FormField label={t.admin.activityEntity} htmlFor="activity-entity"><input id="activity-entity" value={entityType} onChange={(event) => setEntityType(event.target.value)} className="field-input" /></FormField>
      <FormField label={t.admin.activityEntityId} htmlFor="activity-record"><input id="activity-record" value={entityId} onChange={(event) => setEntityId(event.target.value)} className="field-input" /></FormField>
      <FormField label={t.admin.activitySearch} htmlFor="activity-search"><input id="activity-search" value={search} onChange={(event) => setSearch(event.target.value)} className="field-input" /></FormField>
    </div>
    <DataTable columns={[t.admin.activityActor, t.admin.activityAction, t.admin.activityRecord, t.admin.activityDate]} isLoading={activity.isPending} error={activity.isError ? t.admin.loadRecordsError : null} onRetry={() => void refresh()} retryLabel={t.admin.retry} isEmpty={activity.isSuccess && activity.data.items.length === 0} emptyTitle={t.admin.noActivity} emptyDescription={t.admin.activityEmptyDescription}>
      {activity.data?.items.map((entry) => <AuditActivityRow key={entry.id} entry={entry} />)}
    </DataTable>
    <footer className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-border py-4 text-sm text-text">
      <Button disabled={page === 1 || activity.isFetching} title={t.admin.previousPage} aria-label={t.admin.previousPage} onClick={() => setPage(String(page - 1))} className="h-10 w-10 rounded-[8px] border border-border"><ArrowLeft size={16} /></Button>
      <span role="status">{t.admin.showingPage.replace("{page}", String(page)).replace("{pages}", String(Math.max(1, Math.ceil((activity.data?.total ?? 0) / limit))))}</span>
      <Button disabled={activity.isFetching || !activity.data || page * limit >= activity.data.total} title={t.admin.nextPage} aria-label={t.admin.nextPage} onClick={() => setPage(String(page + 1))} className="h-10 w-10 rounded-[8px] border border-border"><ArrowRight size={16} /></Button>
    </footer>
  </div>;
}
