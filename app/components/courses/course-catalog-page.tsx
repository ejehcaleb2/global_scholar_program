"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CheckCircle2, Lock } from "lucide-react";
import type { CourseSummary } from "@/lib/api/index";
import { useCoursesQuery } from "@/lib/queries/index";
import { CoursePageSkeleton } from "@/components/ui/page-skeleton";
import { useCopy } from "@/lib/copy/provider";

type LoadState = "loading" | "ready" | "error";

function CourseProgress({ course, label }: { course: CourseSummary; label: string }) {
	const progress = course.progress;
	if (!progress) return null;

	return (
		<div className="mt-6">
			<div className="mb-2 flex items-center justify-between text-xs text-text">
				<span>{label.replace("{completed}", String(progress.completed_count)).replace("{total}", String(progress.total_count))}</span>
				<span className="font-semibold text-primary">{progress.percent}%</span>
			</div>
			<div className="h-2 overflow-hidden rounded-[8px] bg-surface-alt" aria-label={`${progress.percent}% complete`}>
				<div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
			</div>
		</div>
	);
}


export default function CoursesPage() {
	const { t } = useCopy();
	const query = useCoursesQuery();
	const courses = query.data ?? [];
	const state: LoadState = query.isPending ? "loading" : query.isError ? "error" : "ready";
	if (state === "loading") return <main className="mx-auto min-h-screen max-w-7xl px-5 py-12 lg:px-8"><CoursePageSkeleton /></main>;

	return (
		<div className="min-h-screen bg-background">
			<motion.main initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
				<section className="border-b border-border bg-background">
					<div className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-20">
						<p className="eyebrow">{t.catalog.framework}</p>
						<h1 className="mt-3 max-w-3xl font-heading text-3xl leading-tight text-text sm:text-4xl">{t.catalog.headline}</h1>
						<p className="mt-5 max-w-2xl text-base leading-7 text-text">{t.catalog.description}</p>
					</div>
				</section>
				<section className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
					<div className="mb-8 flex items-end justify-between gap-4">
						<div><p className="eyebrow">{t.catalog.availableCourses}</p><h2 className="section-title">{t.catalog.learningPath}</h2></div>
						<BookOpen size={28} className="hidden text-primary sm:block" aria-hidden="true" />
					</div>
					{state === "error" && <p role="alert" className="border border-border bg-surface-alt p-5 text-sm text-text">{t.catalog.loadError}</p>}
					{state === "ready" && courses.length === 0 && <p className="border border-border bg-surface-alt p-5 text-sm text-text">{t.catalog.empty}</p>}
					{state === "ready" && courses.length > 0 && (
						<div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
							{courses.map((course) => {
								const started = Boolean(course.progress?.completed_count);
								return (
									<article key={course.id} className="card-interactive content-fade-in flex min-h-[26rem] flex-col rounded-[8px] border border-border bg-background p-6">
										<div className="flex items-start justify-between gap-4">
											<div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-surface-alt text-primary"><BookOpen size={22} /></div>
											{course.locked ? <span className="inline-flex items-center gap-1 rounded-[8px] bg-surface-alt px-2 py-1 text-xs text-text"><Lock size={13} /> {t.catalog.membersOnly}</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><CheckCircle2 size={14} /> {t.catalog.available}</span>}
										</div>
										<h3 className="mt-7 font-heading text-2xl text-text">{course.title}</h3>
										<p className="mt-3 flex-1 text-sm leading-6 text-text">{course.description || t.catalog.noDescription}</p>
										<p className="mt-5 text-xs font-semibold uppercase tracking-[0.1em] text-primary">{course.module_count} {course.module_count === 1 ? t.catalog.module : t.catalog.modules}</p>
										{course.locked ? <Link href="/services" className="mt-5 inline-flex items-center justify-center gap-2 rounded-[8px] border border-primary px-4 py-3 text-sm font-semibold text-primary hover:bg-surface-alt">{t.catalog.unlock} <ArrowRight size={16} /></Link> : <><CourseProgress course={course} label={t.catalog.progress} /><Link href={`/courses/${course.id}`} className="mt-5 inline-flex items-center justify-center gap-2 rounded-[8px] bg-primary px-4 py-3 text-sm font-semibold text-white hover:opacity-90">{started ? t.catalog.continue : t.catalog.getStarted} <ArrowRight size={16} /></Link></>}
									</article>
								);
							})}
						</div>
					)}
				</section>
			</motion.main>
		</div>
	);
}
