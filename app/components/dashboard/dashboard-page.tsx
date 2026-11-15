"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ExternalLink, LoaderCircle, Lock, MessageCircle } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useCopy } from "@/lib/copy/provider";
import { DashboardPageSkeleton } from "@/components/ui/page-skeleton";
import { LocalTime } from "@/components/ui/local-time";
import { getApiErrorMessage, type CourseDetail, type CourseSummary, type Masterclass, type Opportunity, type Profile, type ServiceRequest } from "@/lib/api/index";
import { useCourseQuery, useCoursesQuery, useMasterclassesQuery, useOpportunitiesQuery, useProfileQuery, useServiceRequestsQuery } from "@/lib/queries/index";

type DashboardData = {
	courses: CourseSummary[];
	opportunities: Opportunity[];
	requests: ServiceRequest[];
	masterclasses: Masterclass[];
	profile: Profile | null;
	inProgressCourse: CourseSummary | null;
	inProgressDetail: CourseDetail | null;
};

function statusLabel(status: ServiceRequest["status"], t: ReturnType<typeof useCopy>["t"]) {
	return status === "in_progress" ? t.dashboard.requestInProgress : status === "returned" ? t.dashboard.requestReturned : t.dashboard.requestSubmitted;
}

function statusClass(status: ServiceRequest["status"]) {
	return status === "in_progress" ? "border border-primary text-primary" : status === "returned" ? "border border-status-success text-status-success" : "bg-surface-alt text-text";
}

function currentLesson(detail: CourseDetail) {
	return [...detail.modules].sort((a, b) => a.order - b.order).flatMap((module) => [...module.lessons].sort((a, b) => a.order - b.order)).find((lesson) => !lesson.completed) ?? null;
}

function completedModules(detail: CourseDetail) {
	return detail.modules.filter((module) => module.lessons.length > 0 && module.lessons.every((lesson) => lesson.completed)).length;
}

function getDisplayName(profile: Profile | null, email: string | undefined) {
	return profile?.full_name?.trim() || email?.split("@")[0] || "Scholar";
}

function EmptyState({ children, href, label }: { children: string; href: string; label: string }) {
	return <div className="border border-border bg-surface-alt p-5 text-sm text-text"><p>{children}</p><Link href={href} className="mt-3 inline-flex items-center gap-2 font-semibold text-primary hover:underline">{label} <ArrowRight size={15} /></Link></div>;
}

function SessionItem({ session }: { session: Masterclass }) {
	const { t } = useCopy();
	return <article className="flex flex-col justify-between gap-4 rounded-[8px] border border-border bg-background p-5 sm:flex-row sm:items-center"><div className="flex min-w-0 items-center gap-4"><div className="w-20 shrink-0 border-r border-border pr-4 text-center"><p className="font-heading text-lg font-semibold leading-none text-text"><LocalTime value={session.session_datetime} options={{ day: "2-digit", month: "short" }} className="uppercase" /></p><p className="mt-1 text-xs text-text"><LocalTime value={session.session_datetime} options={{ hour: "2-digit", minute: "2-digit", timeZoneName: "short" }} /></p></div><div className="min-w-0"><h3 className="font-heading text-base font-medium leading-snug text-text">{session.title}</h3><p className="mt-1 text-xs text-text">{session.speaker_name}</p></div></div>{session.locked ? <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-[8px] bg-surface-alt px-2.5 py-1 text-xs font-semibold text-text"><Lock size={13} /> {t.dashboard.membersOnly}</span> : session.session_link ? <a href={session.session_link} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-1 rounded-[8px] border border-primary px-4 py-2 text-xs font-medium text-primary hover:bg-surface-alt">{t.dashboard.joinSession} <ExternalLink size={14} /></a> : <span className="text-xs text-text">{t.dashboard.linkComingSoon}</span>}</article>;
}

export default function DashboardPage() {
	const router = useRouter();
	const { accessToken, currentUser } = useAuth();
	const { t } = useCopy();
	const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);

	useEffect(() => { if (hydrated && !accessToken) router.replace("/login"); }, [accessToken, hydrated, router]);

	// Independent hooks fire concurrently; only the in-progress course detail depends on the course list.
	const coursesQuery = useCoursesQuery();
	const opportunitiesQuery = useOpportunitiesQuery();
	const requestsQuery = useServiceRequestsQuery();
	const masterclassesQuery = useMasterclassesQuery();
	const profileQuery = useProfileQuery();
	const inProgressCourse = coursesQuery.data?.find((course) => course.progress && course.progress.percent > 0 && course.progress.percent < 100) ?? null;
	const detailQuery = useCourseQuery(inProgressCourse?.id ?? "");

	const queries = [coursesQuery, opportunitiesQuery, requestsQuery, masterclassesQuery, profileQuery];
	const failed = queries.find((query) => query.isError);
	const loading = !failed && (queries.some((query) => query.isPending) || Boolean(inProgressCourse && detailQuery.isPending));
	const error = failed ? getApiErrorMessage(failed.error, t.dashboard.loadError) : null;
	const data: DashboardData | null = loading || failed ? null : {
		courses: coursesQuery.data ?? [],
		opportunities: opportunitiesQuery.data ?? [],
		requests: requestsQuery.data ?? [],
		masterclasses: masterclassesQuery.data ?? [],
		profile: profileQuery.data ?? null,
		inProgressCourse,
		inProgressDetail: detailQuery.data ?? null,
	};

	if (!hydrated || !accessToken) return null;
	const displayName = getDisplayName(data?.profile ?? null, currentUser?.email);
	const firstName = displayName.split(" ")[0];
	const upcoming = data?.masterclasses.filter((session) => !session.is_past).sort((a, b) => new Date(a.session_datetime).getTime() - new Date(b.session_datetime).getTime()).slice(0, 2) ?? [];
	const latestRequests = data?.requests.slice(0, 2) ?? [];
	const opportunities = data?.opportunities.slice(0, 3) ?? [];
	const lesson = data?.inProgressDetail ? currentLesson(data.inProgressDetail) : null;
	const allAccessibleComplete = Boolean(data?.courses.length && data.courses.filter((course) => !course.locked).length && data.courses.filter((course) => !course.locked).every((course) => course.progress?.percent === 100));
	if (loading) return <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-10 lg:px-8 lg:py-12"><DashboardPageSkeleton /></main>;

		return <div className="min-h-screen bg-background"><main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 lg:px-8 lg:py-12"><div className="mb-10"><h1 className="font-heading text-3xl font-semibold leading-tight text-text sm:text-4xl">{t.dashboard.greeting.replace("{name}", firstName)}</h1><p className="mt-2 text-base text-text">{t.dashboard.whereLeftOff}</p></div>{loading && <div className="flex items-center gap-3 border border-border bg-surface-alt p-5 text-sm text-text"><LoaderCircle size={18} className="animate-spin text-primary" /> {t.dashboard.loading}</div>}{error && <p role="alert" className="border border-border bg-surface-alt p-5 text-sm text-text">{error}</p>}{data && !error && <><section className="mb-12"><div className="rounded-[8px] border border-border bg-background p-6 sm:p-7">{data.inProgressCourse && data.inProgressDetail && lesson ? <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div className="space-y-1.5"><span className="text-xs font-semibold uppercase tracking-wider text-primary">{t.dashboard.inProgress}</span><h2 className="font-heading text-2xl font-medium text-text">{data.inProgressCourse.title}</h2><p className="text-sm text-text">{t.dashboard.currentLesson} <span className="font-medium text-text">{lesson.title}</span></p></div><div className="flex flex-col gap-5 sm:flex-row sm:items-center lg:gap-8"><div className="w-full space-y-2 sm:w-56"><div className="flex justify-between gap-3 text-xs font-medium text-text"><span>{t.dashboard.progress}</span><span className="text-text">{t.dashboard.modulesComplete.replace("{completed}", String(completedModules(data.inProgressDetail))).replace("{total}", String(data.inProgressDetail.modules.length))}</span></div><div className="h-1.5 overflow-hidden rounded-[8px] bg-border"><div className="h-full rounded-[8px] bg-primary" style={{ width: `${data.inProgressCourse.progress?.percent ?? 0}%` }} /></div></div><Link href={`/courses/${data.inProgressCourse.id}/lessons/${lesson.id}`} className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-primary px-6 py-2.5 text-sm font-medium text-white hover:opacity-90">{t.dashboard.continueLearning} <ArrowRight size={15} /></Link></div></div> : allAccessibleComplete ? <div><span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><CheckCircle2 size={15} /> {t.dashboard.allComplete}</span><h2 className="mt-2 font-heading text-2xl font-medium text-text">{t.dashboard.allComplete}</h2><p className="mt-2 text-sm text-text">{t.dashboard.keepExploring}</p><Link href="/courses" className="mt-5 inline-flex items-center gap-2 rounded-[8px] bg-primary px-5 py-2.5 text-sm font-medium text-white">{t.dashboard.browseCourses} <ArrowRight size={15} /></Link></div> : <div><span className="text-xs font-semibold uppercase tracking-wider text-primary">{t.dashboard.continueLearning}</span><h2 className="mt-2 font-heading text-2xl font-medium text-text">{t.dashboard.notStartedTitle}</h2><p className="mt-2 text-sm text-text">{t.dashboard.notStartedDescription}</p><Link href="/courses" className="mt-5 inline-flex items-center gap-2 rounded-[8px] border border-primary px-5 py-2.5 text-sm font-medium text-primary hover:bg-surface-alt">{t.dashboard.browseCourses} <ArrowRight size={15} /></Link></div>}</div></section><div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-10"><div className="space-y-10"><section><div className="mb-4 flex items-center justify-between gap-4"><h2 className="font-heading text-xl font-medium text-text sm:text-2xl">{t.dashboard.recentOpportunities}</h2><Link href="/opportunities" className="text-sm font-medium text-primary hover:underline">{t.dashboard.viewAll}</Link></div>{opportunities.length ? <div className="space-y-3">{opportunities.map((opportunity) => <article key={opportunity.id} className="card-interactive content-fade-in flex items-center justify-between gap-4 rounded-[8px] border border-border bg-background p-5"><div className="min-w-0 space-y-1"><h3 className="font-heading text-base font-medium leading-snug text-text">{opportunity.name}</h3><p className="text-xs text-text">{t.opportunities.deadline}: {opportunity.deadline ? <LocalTime value={opportunity.deadline} options={{ month: "long", day: "numeric", year: "numeric" }} /> : t.opportunities.deadlineNotListed}</p></div><span className="inline-flex shrink-0 items-center rounded-[8px] border border-border bg-surface-alt px-2.5 py-1 text-xs font-medium text-text">{opportunity.category}</span></article>)}</div> : <EmptyState href="/opportunities" label={t.dashboard.browseOpportunities}>{t.dashboard.noOpportunities}</EmptyState>}</section><section><div className="mb-4 flex items-center justify-between gap-4"><h2 className="font-heading text-xl font-medium text-text sm:text-2xl">{t.dashboard.serviceRequests}</h2><Link href="/services" className="text-sm font-medium text-primary hover:underline">{t.dashboard.viewAll}</Link></div>{latestRequests.length ? <div className="space-y-3">{latestRequests.map((request) => <article key={request.id} className="flex items-center justify-between gap-4 rounded-[8px] border border-border bg-background p-5"><div className="min-w-0"><h3 className="text-base font-medium text-text">{request.service_type === "essay_review" ? t.admin.essayReview : t.admin.activitiesReview}</h3><p className="mt-0.5 text-xs text-text">{t.dashboard.submittedOn} <LocalTime value={request.created_at} options={{ dateStyle: "long" }} /></p></div><span className={`inline-flex shrink-0 items-center rounded-[8px] px-3 py-1 text-xs font-medium ${statusClass(request.status)}`}>{statusLabel(request.status, t)}</span></article>)}</div> : <EmptyState href="/services" label={t.dashboard.exploreServices}>{t.dashboard.noRequests}</EmptyState>}</section></div><div className="space-y-10"><section><div className="mb-4 flex items-center justify-between gap-4"><h2 className="font-heading text-xl font-medium text-text sm:text-2xl">{t.dashboard.upcomingSessions}</h2><Link href="/masterclasses" className="text-sm font-medium text-primary hover:underline">{t.dashboard.viewAll}</Link></div>{upcoming.length ? <div className="space-y-3">{upcoming.map((session) => <SessionItem key={session.id} session={session} />)}</div> : <EmptyState href="/masterclasses" label={t.dashboard.viewSessions}>{t.dashboard.noUpcoming}</EmptyState>}</section><section><div className="rounded-[8px] border border-border bg-background p-6"><div className="space-y-1"><h2 className="font-heading text-xl font-medium text-text">{t.dashboard.community}</h2><p className="text-sm text-text">{t.dashboard.communityDescription}</p></div><a href="https://chat.whatsapp.com" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center justify-center gap-2 rounded-[8px] border border-primary px-4 py-2.5 text-xs font-medium text-primary hover:bg-surface-alt"><MessageCircle size={16} /> {t.dashboard.joinCommunity}</a></div></section></div></div></>}</main></div>;
}
