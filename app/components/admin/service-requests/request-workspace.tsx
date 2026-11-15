"use client";

import { useState } from "react";
import { useIsFetching, useMutation } from "@tanstack/react-query";
import { Download, X } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { AdminDrawer } from "@/components/admin/ui/admin-drawer";
import { AdminPagination } from "@/components/admin/ui/pagination";
import { DataTable, EmptyState, StatusBadge } from "@/components/admin/ui/primitives";
import { useAdminFilter } from "@/lib/queries/use-admin-filter";
import { adminRequestKeys, useAdminRequests, useAdminRequestDetail, useInvalidateRequests, type RequestFilter } from "@/lib/queries/admin-service-requests";
import { downloadAdminServiceRequestDocument, updateAdminServiceRequestStatus, type ServiceRequest } from "@/lib/api/services";
import { getApiErrorMessage } from "@/lib/api/client";
import { saveAttachment } from "@/lib/utils/download";

function statusName(value: ServiceRequest["status"], t: ReturnType<typeof useCopy>["t"]) {
  return value === "submitted" ? t.admin.statusSubmitted : value === "in_progress" ? t.admin.statusInProgress : t.admin.statusReturned;
}
function serviceName(value: ServiceRequest["service_type"], t: ReturnType<typeof useCopy>["t"]) {
  return value === "essay_review" ? t.admin.essayReview : t.admin.activitiesReview;
}

export function AdminRequestsWorkspace({ userId }: { userId?: string }) {
  const { t } = useCopy();
  const { addToast } = useToast();
  const [status, setStatus] = useAdminFilter<RequestFilter>("requests_status", userId ? "all" : "pending", ["pending", "all", "submitted", "in_progress", "returned"], "requests_page");
  const [pageValue, setPage] = useAdminFilter<string>("requests_page", "1", undefined, "requests_page");
  const parsedPage = Number(pageValue);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const query = useAdminRequests({ status, userId, page });
  const retry = useMutation({
    mutationFn: () => query.refetch({ throwOnError: true }),
    onSuccess: () => addToast(userId ? t.admin.studentRequests : t.admin.needsAttention, t.admin.refreshComplete, "success"),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const opening = useIsFetching({ queryKey: adminRequestKeys.detail(selected ?? ""), exact: true }) > 0;
  const filters: Array<{ value: RequestFilter; label: string }> = [
    { value: "pending", label: t.admin.needsAttention }, { value: "all", label: t.admin.all },
    { value: "submitted", label: t.admin.statusSubmitted }, { value: "in_progress", label: t.admin.statusInProgress }, { value: "returned", label: t.admin.statusReturned },
  ];
  const openControl = (id: string) => <Button variant="secondary" size="sm" className="rounded-[8px]" loading={opening && selected === id} loadingLabel={t.admin.loadingRequest} title={opening && selected === id ? t.admin.loadingRequest : undefined} onClick={() => setSelected(id)}>{t.admin.reviewRequest}</Button>;
  return <section aria-label={userId ? t.admin.studentRequests : t.admin.needsAttention}>
    <header className="mb-4"><h2 className="font-heading text-2xl text-text">{userId ? t.admin.studentRequests : t.admin.needsAttention}</h2><p className="mt-2 text-base text-text">{status === "pending" ? t.admin.requestsOldestFirst : t.admin.requestsAllHistory}</p></header>
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t.admin.filterStatus}>{filters.map(filter => <Button key={filter.value} aria-pressed={status === filter.value} loading={query.isFetching && status === filter.value} loadingLabel={t.admin.loadingRequests} title={query.isFetching && status === filter.value ? t.admin.loadingRequests : undefined} variant={status === filter.value ? "primary" : "secondary"} size="sm" className="rounded-[8px]" onClick={() => { setStatus(filter.value); setPage("1"); }}>{filter.label}</Button>)}</div>
    <DataTable columns={[t.admin.student, t.admin.service, t.admin.requestReceived, t.admin.status, t.admin.actions]} isLoading={query.isPending && !retry.isPending} error={query.isError || retry.isPending ? t.admin.loadRecordsError : null} onRetry={() => retry.mutate()} retryLabel={t.admin.retry} retrying={retry.isPending} retryingLabel={t.admin.loadingRequests} isEmpty={!query.isPending && !query.isError && !query.data?.items.length} emptyTitle={status === "all" ? t.admin.serviceQueueEmpty : t.admin.requestsNoResults} emptyDescription={status === "all" ? t.admin.requestsEmptyDescription : t.admin.requestsChangeFilter} skeletonRows={3}
      stacked={userId ? <ul className="divide-y divide-border">{query.data?.items.map(request => <li key={request.id} className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><p className="text-base font-semibold text-text">{serviceName(request.service_type, t)}</p><StatusBadge label={statusName(request.status, t)} status={request.status} /></div><LocalTime value={request.created_at} className="block text-sm text-text" />{openControl(request.id)}</li>)}</ul> : undefined}>
      {query.data?.items.map(request => <tr key={request.id}>
        <td className="max-w-64 px-4 py-4 text-base text-text"><span className="block truncate font-semibold">{request.student.full_name || request.student.email}</span></td>
        <td className="px-4 py-4 text-base text-text">{serviceName(request.service_type, t)}</td>
        <td className="px-4 py-4 text-sm text-text"><LocalTime value={request.created_at} relative={status === "pending"} /></td>
        <td className="px-4 py-4"><StatusBadge label={statusName(request.status, t)} status={request.status} /></td>
        <td className="px-4 py-4">{openControl(request.id)}</td>
      </tr>)}
    </DataTable>
    <AdminPagination page={page} total={query.data?.total ?? 0} size={10} busy={query.isFetching} onChange={next => setPage(String(next))} />
    <AdminRequestPanel id={selected} onClose={() => setSelected(null)} />
  </section>;
}

function AdminRequestPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useCopy();
  const { addToast } = useToast();
  const query = useAdminRequestDetail(id);
  const retry = useMutation({
    mutationFn: () => query.refetch({ throwOnError: true }),
    onSuccess: () => addToast(t.admin.requestDetails, t.admin.refreshComplete, "success"),
  });
  const invalidate = useInvalidateRequests();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const transition = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ServiceRequest["status"] }) => updateAdminServiceRequestStatus(id, status),
    onSuccess: async result => {
      addToast(t.admin.requestStatusUpdated, `${serviceName(result.service_type, t)}: ${statusName(result.status, t)}`, "success");
      await invalidate();
    },
    onError: error => { addToast(t.admin.serviceTransitionError, getApiErrorMessage(error, t.admin.serviceTransitionError), "error"); void invalidate(); },
  });
  async function download() {
    if (!id || downloadingId) return;
    const downloadId = id;
    setDownloadingId(downloadId);
    try { saveAttachment(await downloadAdminServiceRequestDocument(id)); addToast(t.admin.downloadComplete, t.admin.downloadDocument, "success"); }
    catch (error) { addToast(t.admin.requestDocumentError, getApiErrorMessage(error, t.admin.requestDocumentError), "error"); }
    finally { setDownloadingId(current => current === downloadId ? null : current); }
  }
  const request = query.data;
  const next = request?.status === "submitted" ? "in_progress" : request?.status === "in_progress" ? "returned" : null;
  return <AdminDrawer open={Boolean(id)} title={t.admin.requestDetails} onClose={onClose}>
    <header className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-5"><div><p className="eyebrow">{t.admin.requestDetails}</p><h2 className="mt-2 font-heading text-2xl text-text">{request ? serviceName(request.service_type, t) : t.admin.loadingRequest}</h2></div><Button variant="secondary" className="h-10 w-10 rounded-[8px]" aria-label={t.admin.closeRequest} onClick={onClose}><X size={20} aria-hidden="true" /></Button></header>
    {query.isPending && !retry.isPending && <div aria-busy="true" className="space-y-4">{[1, 2, 3].map(item => <div key={item} className="h-16 animate-pulse rounded-[8px] bg-surface-alt" />)}</div>}
    {(query.isError || retry.isPending) && <div role="alert" className="space-y-4 text-base text-text"><p>{t.admin.loadRecordsError}</p><Button loading={retry.isPending} loadingLabel={t.admin.loadingRequest} variant="secondary" size="md" className="rounded-[8px]" onClick={() => retry.mutate()}>{t.admin.retry}</Button></div>}
    {request && !query.isError && !retry.isPending && <>
      <p className="text-base font-semibold text-text">{request.student.full_name || request.student.email}</p><p className="mt-1 text-sm text-text">{request.student.email}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3"><StatusBadge label={statusName(request.status, t)} status={request.status} /><LocalTime value={request.created_at} className="text-sm text-text" /></div>
      <div className="my-6 flex flex-wrap gap-3"><Button variant="secondary" size="md" className="rounded-[8px]" loading={downloadingId === request.id} loadingLabel={t.admin.downloadingRequest} disabled={!request.has_document || Boolean(downloadingId && downloadingId !== request.id)} title={!request.has_document ? t.admin.requestDocumentMissing : downloadingId && downloadingId !== request.id ? t.admin.downloadPending : undefined} onClick={() => void download()}><Download size={16} aria-hidden="true" />{t.admin.downloadDocument}</Button>
        {next && <Button variant="primary" size="md" className="rounded-[8px]" loading={transition.isPending && transition.variables.id === request.id} loadingLabel={t.admin.saving} disabled={transition.isPending && transition.variables.id !== request.id} title={transition.isPending && transition.variables.id !== request.id ? t.admin.statusUpdatePending : undefined} onClick={() => transition.mutate({ id: request.id, status: next })}>{next === "in_progress" ? t.admin.startReview : t.admin.markReturned}</Button>}
      </div>
      <p className="border-y border-border py-4 text-base text-text">{t.admin.returnStatusNotice}</p>
      <section className="mt-6"><h3 className="font-heading text-xl text-text">{t.admin.requestHistory}</h3>
        {request.events.length ? <ol className="mt-4 divide-y divide-border">{request.events.map((event, index) => <li key={`${event.changed_at}/${index}`} className="py-4 text-base text-text"><p className="font-semibold">{statusName(event.to_status, t)}</p><p className="mt-1 text-sm">{event.actor.full_name || event.actor.email}</p><LocalTime value={event.changed_at} className="text-sm" /></li>)}</ol> : <EmptyState title={t.admin.requestHistoryEmpty} />}
      </section>
    </>}
  </AdminDrawer>;
}
