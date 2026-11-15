"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { CalendarDays, ExternalLink, Lock, PlayCircle } from "lucide-react";
import { type Masterclass } from "@/lib/api/index";
import { useMasterclassesQuery } from "@/lib/queries/index";
import { useCopy } from "@/lib/copy/provider";
import { MasterclassesPageSkeleton } from "@/components/ui/page-skeleton";
import { LocalTime } from "@/components/ui/local-time";

function SessionCard({ session }: { session: Masterclass }) {
  const { accessToken } = useAuth();
	const { t } = useCopy();
	return <article className="card-interactive flex flex-col justify-between gap-5 rounded-[8px] border border-border bg-background p-5 sm:flex-row sm:items-center sm:p-6"><div className="w-32 shrink-0"><p className="font-heading text-xl font-semibold text-text"><LocalTime value={session.session_datetime} options={{ day: "2-digit", month: "short" }} /></p><p className="mt-1 text-xs text-text"><LocalTime value={session.session_datetime} options={{ hour: "2-digit", minute: "2-digit", timeZoneName: "short" }} /></p></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading text-xl font-semibold text-text">{session.title}</h3>{session.locked && <span className="inline-flex items-center gap-1 rounded-[8px] bg-surface-alt px-2 py-1 text-xs text-text"><Lock size={13} /> {accessToken ? t.masterclasses.membersOnly : t.common.accountRequired}</span>}</div><p className="mt-1 text-sm text-text">{session.speaker_name}</p>{session.description && <p className="mt-3 text-sm leading-5 text-text">{session.description}</p>}</div><div className="shrink-0">{session.locked && !accessToken ? <Link href="/signup" className="text-sm font-semibold text-primary hover:underline">{t.common.signupToContinue}</Link> : session.locked ? <Link href="/services" className="text-sm font-semibold text-primary hover:underline">{t.masterclasses.unlockMembership}</Link> : session.is_past ? session.recording_url ? <a href={session.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">{t.masterclasses.watchRecording} <PlayCircle size={15} /></a> : <span className="text-sm text-text">{t.masterclasses.recordingComingSoon}</span> : session.session_link ? <a href={session.session_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[8px] bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">{t.masterclasses.joinSession} <ExternalLink size={15} /></a> : <span className="text-sm text-text">{t.masterclasses.linkComingSoon}</span>}</div></article>;
}

export default function MasterclassesPage() {
	const { t } = useCopy();
	const query = useMasterclassesQuery();
	const sessions = query.data ?? [];
	const state: "loading" | "error" | "ready" = query.isPending ? "loading" : query.isError ? "error" : "ready";
	const upcoming = sessions.filter((session) => !session.is_past);
	const past = sessions.filter((session) => session.is_past);
	if (state === "loading") return <main aria-label={t.masterclasses.title} className="mx-auto min-h-screen w-full max-w-6xl px-5 py-10 lg:px-8"><MasterclassesPageSkeleton /></main>;
	return <div className="min-h-screen bg-background"><main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 lg:px-8 lg:py-12"><div className="mb-10"><p className="eyebrow">{t.masterclasses.liveEyebrow}</p><h1 className="mt-3 font-heading text-3xl font-semibold leading-tight text-text sm:text-4xl">{t.masterclasses.title}</h1><p className="mt-2 text-base leading-6 text-text">{t.masterclasses.description}</p></div>{state === "error" && <p role="alert" className="border border-border bg-surface-alt p-5 text-sm text-text">{t.masterclasses.temporarilyUnavailable}</p>}{state === "ready" && <><section><div className="mb-4 flex items-center gap-2"><CalendarDays size={19} className="text-primary" /><h2 className="font-heading text-2xl text-text">{t.masterclasses.upcoming}</h2></div>{upcoming.length ? <div className="space-y-4">{upcoming.map((session) => <SessionCard key={session.id} session={session} />)}</div> : <p className="border border-border bg-surface-alt p-5 text-sm text-text">{t.masterclasses.noUpcoming}</p>}</section><section className="mt-12"><div className="mb-4 flex items-center gap-2"><PlayCircle size={19} className="text-primary" /><h2 className="font-heading text-2xl text-text">{t.masterclasses.pastSessions}</h2></div>{past.length ? <div className="space-y-4">{past.map((session) => <SessionCard key={session.id} session={session} />)}</div> : <p className="border border-border bg-surface-alt p-5 text-sm text-text">{t.masterclasses.noPast}</p>}</section></>}</main></div>;
}
