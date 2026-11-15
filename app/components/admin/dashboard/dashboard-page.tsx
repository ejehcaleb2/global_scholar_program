"use client";

import { Avatar } from "@/components/ui/avatar";


import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { AdminRequestsWorkspace } from "@/components/admin/service-requests/request-workspace";
import { adminRequestKeys } from "@/lib/queries/admin-service-requests";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { AdminAuditLog, getAdminAuditLogs, getAdminStats } from "@/lib/api/index";
import { useCopy } from "@/lib/copy/provider";
import { AdminPageHeader, EmptyState, StatCard } from "@/components/admin/ui/primitives";
import { LocalTime } from "@/components/ui/local-time";

function interpolate(template: string, values: Record<string, string | number>) {
	return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
}

function activityText(entry: AdminAuditLog, t: ReturnType<typeof useCopy>["t"]) {
	const actionKey = ({ create: "created", update: "updated", delete: "deleted", status_change: "updated", upload: "uploaded" } as Record<string, string>)[entry.action] ?? entry.action;
	const verb = t.admin[actionKey as keyof typeof t.admin] ?? entry.action;
	const label = entry.label || `${entry.entity_type} ${entry.entity_id.slice(0, 8)}`;
	return `${entry.actor.full_name || entry.actor.email} ${verb} ${label}`;
}

function ActivityLine({ entry }: { entry: AdminAuditLog }) {
	const { t } = useCopy();
	return <span className="flex items-center gap-3"><Avatar userId={entry.actor.id} name={entry.actor.full_name} email={entry.actor.email} avatarKey={entry.actor.avatar_url} updatedAt={entry.actor.updated_at} /><span>{activityText(entry, t)} · <LocalTime value={entry.created_at} relative /></span></span>;
}

export default function AdminDashboardPage() {
	const { t } = useCopy();
	const { addToast } = useToast();
	const client = useQueryClient();
	const [refreshing, setRefreshing] = useState(false);
	const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: getAdminStats, staleTime: 5_000 });
	const activity = useQuery({ queryKey: ["admin", "audit-logs", { limit: 8 }], queryFn: () => getAdminAuditLogs(8) });

	return (
		<div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 lg:px-10">
			<AdminPageHeader title={t.admin.dashboard} description={t.admin.dashboardSubtitle} actions={<Button type="button" loading={refreshing} loadingLabel={t.admin.refreshing} onClick={async () => {
              if (refreshing) return;
              setRefreshing(true);
              try {
                const results = await Promise.all([stats.refetch(), activity.refetch(), client.refetchQueries({ queryKey: adminRequestKeys.all, type: "active" }, { throwOnError: true }).then(() => ({ isError: false })).catch(() => ({ isError: true }))]);
                const failed = results.some(result => result.isError);
                addToast(failed ? t.admin.statsLoadError : t.admin.refreshComplete, failed ? t.admin.statsLoadError : t.admin.refreshComplete, failed ? "error" : "success");
              } finally { setRefreshing(false); }
            }} aria-label={t.admin.refresh} className="min-h-11 rounded-[8px] border border-border px-4 text-sm font-semibold text-primary hover:bg-surface-alt"><RefreshCw size={16} aria-hidden="true" />{t.admin.refresh}</Button>} />
			{stats.isError && <p role="alert" className="mb-4 rounded-[8px] border border-border bg-surface-alt p-4 text-base text-text">{t.admin.statsLoadError}</p>}
			<section aria-label={t.admin.dashboard} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard label={t.admin.totalStudents} value={stats.data?.students.total} subtext={stats.data && interpolate(t.admin.paidFree, { paid: stats.data.students.paid, free: stats.data.students.free })} isLoading={stats.isLoading} />
				<StatCard label={t.admin.newSignups} value={stats.data?.signups.last_7_days} subtext={t.admin.last7Days} isLoading={stats.isLoading} />
				<StatCard label={t.admin.pendingRequests} value={stats.data?.service_requests.pending} subtext={stats.data && interpolate(t.admin.requestCounts, { submitted: stats.data.service_requests.submitted, inProgress: stats.data.service_requests.in_progress })} isLoading={stats.isLoading} />
				<StatCard label={t.admin.activeCourses} value={stats.data?.courses.published} subtext={Boolean(stats.data?.courses.draft) ? interpolate(t.admin.draftsCount, { draft: stats.data?.courses.draft ?? 0 }) : undefined} isLoading={stats.isLoading} />
			</section>

			<section id="needs-attention" className="mt-9"><AdminRequestsWorkspace /></section>

			<section className="mt-9">
				<div className="mb-4 flex items-center gap-3"><Activity size={19} className="text-primary" aria-hidden="true" /><h2 className="font-heading text-2xl text-text">{t.admin.recentActivity}</h2></div>
				{activity.isLoading ? <div className="space-y-3" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-[8px] border border-border bg-surface-alt" />)}</div>
					: activity.isError ? <div role="alert" className="flex min-h-32 items-center justify-center rounded-[8px] border border-border bg-background p-5 text-base text-text"><Button type="button" onClick={() => void activity.refetch()} className="min-h-11 rounded-[8px] border border-border px-4 font-semibold text-primary">{t.admin.retry}</Button></div>
						: activity.data?.length ? <ol className="divide-y divide-border rounded-[8px] border border-border bg-background">{activity.data.map((entry) => <li key={entry.id} className="px-4 py-4 text-base leading-6 text-text"><ActivityLine entry={entry} /></li>)}</ol>
							: <div className="rounded-[8px] border border-border bg-background"><EmptyState title={t.admin.noActivity} icon={Activity} /></div>}
			</section>
		</div>
	);
}
