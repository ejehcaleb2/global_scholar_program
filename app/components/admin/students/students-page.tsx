"use client";

import { useDialogFocus } from "@/components/ui/use-dialog-focus";
import { useAdminFilter } from "@/lib/queries/use-admin-filter";
import { AdminRequestsWorkspace } from "@/components/admin/service-requests/request-workspace";
import { Avatar } from "@/components/ui/avatar";


import { AdminPagination } from "@/components/admin/ui/pagination";
import { apiFetch } from "@/lib/api/client";
import type { AdminPage } from "@/lib/api/pagination";
import { Button } from "@/components/ui/button";
import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, X } from "lucide-react";
import { AdminPageHeader, DataTable, StatusBadge } from "@/components/admin/ui/primitives";
import { useCopy } from "@/lib/copy/provider";
import { getAdminStudent, type AdminStudent } from "@/lib/api/index";
import { LocalTime } from "@/components/ui/local-time";

export default function AdminStudentsPage() {
  const { t } = useCopy();
  const [search, setSearch] = useAdminFilter<string>("search", "");
  const [tier, setTier] = useAdminFilter("tier", "all", ["all", "free", "paid"] as const);
  const [pageValue, setPageValue] = useAdminFilter<string>("page", "1");
  const page = Math.max(0, (Number(pageValue) || 1) - 1);
  function setPage(next: number | ((value: number) => number)) { setPageValue(String((typeof next === "function" ? next(page) : next) + 1)); }
  const [, setRequestPage] = useAdminFilter<string>("requests_page", "1", undefined, "requests_page");
  function openStudent(id: string) { setRequestPage("1"); setSelectedId(id); }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const limit = 20;
  const deferredSearch = useDeferredValue(search);
  const listPage = useQuery({ queryKey: ["admin", "students", { search: deferredSearch, tier, limit, offset: page * limit }], queryFn: () => apiFetch<AdminPage<AdminStudent>>(`/admin/students?${new URLSearchParams({ paginated: "true", search: deferredSearch, ...(tier === "all" ? {} : { membership_tier: tier }), limit: String(limit), offset: String(page * limit) })}`) });
  const list = { ...listPage, data: listPage.data?.items };
  const detail = useQuery({ queryKey: ["admin", "student", selectedId], queryFn: () => getAdminStudent(selectedId!), enabled: Boolean(selectedId) });
  const tiers: Array<{ value: typeof tier; label: string }> = [{ value: "all", label: t.admin.all }, { value: "paid", label: t.admin.paidTier }, { value: "free", label: t.admin.freeTier }];

  function setFilter(nextTier: typeof tier) { setTier(nextTier); setPage(0); }

  const drawerRef = useDialogFocus(Boolean(selectedId), () => setSelectedId(null));

  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 lg:px-10">
      <AdminPageHeader title={t.admin.students} description={t.admin.studentsDescription} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label={t.admin.filterTier} className="inline-flex w-fit rounded-[8px] border border-border bg-background p-1">{tiers.map((item) => <Button key={item.value} type="button" aria-pressed={tier === item.value} onClick={() => setFilter(item.value)} className={`min-h-10 rounded-[8px] px-4 text-sm font-semibold ${tier === item.value ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}>{item.label}</Button>)}</div>
        <label className="block w-full sm:max-w-sm"><span className="sr-only">{t.admin.searchStudents}</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder={t.admin.searchStudents} className="field-input" /></label>
      </div>

      <DataTable columns={[t.admin.student, t.admin.filterTier, t.admin.joined, t.admin.actions]} isLoading={list.isLoading} error={list.isError ? t.admin.loadRecordsError : null} onRetry={() => void list.refetch()} retryLabel={t.admin.retry} isEmpty={!list.isLoading && !list.isError && !list.data?.length} emptyTitle={t.admin.studentsEmpty} skeletonRows={6}>
        {list.data?.map((student) => <tr key={student.id} className="cursor-pointer transition-colors duration-200 ease-out hover:bg-surface-alt" onClick={() => openStudent(student.id)}><td className="min-w-64 px-4 py-4"><div className="flex items-center gap-3"><Avatar userId={student.id} name={student.full_name} email={student.email} avatarKey={student.avatar_url} updatedAt={student.updated_at} /><span><span className="block text-base font-semibold text-text">{student.full_name?.trim() || student.email}</span>{student.full_name && <span className="mt-1 block text-sm text-text">{student.email}</span>}</span></div></td><td className="px-4 py-4"><StatusBadge label={student.membership_tier === "paid" ? t.admin.paidTier : t.admin.freeTier} status={student.membership_tier === "paid" ? "published" : "draft"} /></td><td className="whitespace-nowrap px-4 py-4 text-base text-text"><LocalTime value={student.created_at} options={{ dateStyle: "medium" }} /></td><td className="px-4 py-4 text-right"><Button type="button" onClick={(event) => { event.stopPropagation(); openStudent(student.id); }} className="min-h-10 rounded-[8px] px-3 text-sm font-semibold text-primary hover:bg-primary/5">{t.admin.studentDetails}</Button></td></tr>)}
      </DataTable>

      <AdminPagination page={page + 1} total={listPage.data?.total ?? 0} size={limit} busy={listPage.isFetching} onChange={(next) => setPage(next - 1)} />

      {selectedId && <div className="fixed inset-0 z-[80] flex justify-end bg-text/30" role="presentation" onClick={() => setSelectedId(null)}><aside ref={drawerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t.admin.studentDetails} onClick={(event) => event.stopPropagation()} className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-background p-5 sm:p-7"><header className="flex items-start justify-between gap-4 border-b border-border pb-5"><div><p className="eyebrow">{t.admin.studentDetails}</p><h2 className="mt-2 font-heading text-2xl text-text">{detail.data?.full_name || detail.data?.email || t.admin.loadingPost}</h2>{detail.data && <a href={`mailto:${detail.data.email}`} className="mt-2 inline-flex items-center gap-2 text-base text-primary"><Mail size={16} aria-hidden="true" />{detail.data.email}</a>}</div><Button type="button" onClick={() => setSelectedId(null)} aria-label={t.admin.cancel} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border"><X size={18} /></Button></header>{detail.isLoading ? <div className="mt-6 space-y-3" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-[8px] bg-surface-alt" />)}</div> : detail.isError || !detail.data ? <p role="alert" className="mt-6 text-base text-text">{t.admin.loadRecordsError}<Button loading={detail.isFetching} onClick={() => void detail.refetch()} className="ml-3 min-h-10 px-3 text-primary">{t.admin.retry}</Button></p> : <><div className="mt-5"><StatusBadge label={detail.data.membership_tier === "paid" ? t.admin.paidTier : t.admin.freeTier} status={detail.data.membership_tier === "paid" ? "published" : "draft"} /></div><dl className="mt-5 divide-y divide-border">{[[t.admin.joined, <LocalTime key="joined" value={detail.data.created_at} options={{ dateStyle: "long" }} />], [t.admin.phone, detail.data.phone], [t.admin.country, detail.data.country], [t.admin.educationLevel, detail.data.education_level], [t.admin.school, detail.data.school], [t.admin.city, detail.data.city], [t.admin.studyInterests, detail.data.fields_of_study?.join(", ")], [t.admin.countriesOfInterest, detail.data.countries_of_interest?.join(", ")]].map(([label, value]) => <div key={String(label)} className="grid gap-1 py-3 sm:grid-cols-[180px_minmax(0,1fr)]"><dt className="text-sm font-semibold text-text">{label}</dt><dd className="text-base text-text">{value || "—"}</dd></div>)}</dl><div className="mt-8 border-t border-border pt-6"><AdminRequestsWorkspace key={selectedId} userId={selectedId} /></div></>}</aside></div>}
    </div>
  );
}