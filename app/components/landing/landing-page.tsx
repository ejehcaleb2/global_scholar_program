"use client";

import Link from "next/link";
import { useEffect } from "react";
import { scrollToLandingSection } from "@/lib/utils/section-navigation";
import { publicContainer } from "@/lib/utils/layout";
import {
  ArrowRight,
  BadgeCheck,
  Calendar,
  Calculator,
  GraduationCap,
  Landmark,
  Lock,
  ScrollText,
} from "lucide-react";
import {
  type CourseSummary,
  type HomepagePost,
  type Masterclass,
} from "@/lib/api/index";
import { useCoursesQuery, useHomepagePostsQuery, useMasterclassesQuery } from "@/lib/queries/index";
import { useCopy } from "@/lib/copy/provider";
import { HeroCarousel } from "@/components/landing/hero-carousel";
import { TypewriterHeading } from "@/components/landing/typewriter-heading";
import { LocalTime } from "@/components/ui/local-time";
import { MediaImage } from "@/components/ui/media-image";
import { LandingImage, getLandingMedia } from "@/components/landing/landing-image";

type LoadState = "loading" | "ready" | "error";

const courseIcons = [Landmark, ScrollText, Calculator];

function SectionLoading({ label }: { label: string }) {
  const { t } = useCopy();
  return (
    <div className="grid gap-4 md:grid-cols-3" aria-label={t.landing.loadingSection.replace("{section}", label)}>
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-48 animate-pulse rounded-[8px] bg-surface-alt" />
      ))}
    </div>
  );
}

function SectionError() {
  const { t } = useCopy();
  return <p className="border border-border bg-surface-alt p-5 text-sm text-text">{t.landing.contentUnavailable}</p>;
}

function PostsSection({ state, posts }: { state: LoadState; posts: HomepagePost[] }) {
  const { t } = useCopy();
  return <section id="updates" className="scroll-mt-32 bg-background py-16"><div className={publicContainer}><div className="mb-8 flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="eyebrow">{t.landing.fieldReports}</p><h2 className="section-title">{t.landing.latestFromGsp}</h2></div><p className="max-w-md text-sm leading-6 text-text">{t.landing.practicalGuidance}</p></div>{state === "loading" ? <SectionLoading label={t.landing.latestFromGsp} /> : state === "error" ? <SectionError /> : posts.length === 0 ? <p className="text-base text-text">{t.landing.postsEmpty}</p> : <div className="grid gap-5 md:grid-cols-3">{posts.slice(0, 3).map((post) => <article key={post.id} className="flex flex-col overflow-hidden rounded-[8px] border border-border bg-background"><MediaImage src={post.thumbnail_url} alt={t.landing.editorialImageAlt} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" wrapperClassName="relative aspect-[16/9] bg-surface-alt" /><div className="flex flex-1 flex-col gap-4 p-5"><div><p className="eyebrow">{t.landing.gspUpdate}</p><h3 className="mt-2 font-heading text-xl text-text">{post.title}</h3><p className="mt-2 text-sm leading-6 text-text">{post.summary || t.landing.readLatest}</p></div><span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-primary">{t.landing.readMore} <ArrowRight size={16} /></span></div></article>)}</div>}</div></section>;
}

function CoursesSection({ state, courses }: { state: LoadState; courses: CourseSummary[] }) {
  const { t } = useCopy();
  return <section id="courses" className="scroll-mt-32 bg-surface-alt py-16"><div className={publicContainer}><div className="mb-8 max-w-2xl"><p className="eyebrow">{t.landing.curriculumFramework}</p><h2 className="section-title">{t.landing.whatYouLearn}</h2><p className="mt-3 text-base leading-7 text-text">{t.landing.courseIntroduction}</p></div>{state === "loading" ? <SectionLoading label={t.catalog.availableCourses} /> : state === "error" ? <SectionError /> : courses.length === 0 ? <p className="border border-border bg-background p-5 text-sm text-text">{t.landing.coursesEmpty}</p> : <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{courses.map((course, index) => { const Icon = courseIcons[index % courseIcons.length]; return <article key={course.id} className="flex min-h-64 flex-col justify-between rounded-[8px] border border-border bg-background p-5"><div><div className="flex items-center justify-between"><Icon size={27} className="text-primary" />{course.locked ? <span className="inline-flex items-center gap-1 rounded-[8px] bg-surface-alt px-2 py-1 text-xs text-text"><Lock size={13} /> {t.landing.memberAccess}</span> : <span className="rounded-[8px] bg-surface-alt px-2 py-1 text-xs text-text">{t.landing.openAccess}</span>}</div><h3 className="mt-7 font-heading text-xl text-text">{course.title}</h3><p className="mt-2 text-sm leading-6 text-text">{course.description || t.landing.courseNoContent}</p></div><p className="mt-6 text-xs font-semibold text-primary">{course.module_count} {course.module_count === 1 ? t.landing.module : t.landing.modules}</p></article>; })}</div>}</div></section>;
}

function MasterclassesSection({ state, masterclasses }: { state: LoadState; masterclasses: Masterclass[] }) {
  const { t } = useCopy();
  const upcoming = masterclasses.filter((item) => !item.is_past).sort((a, b) => new Date(a.session_datetime).getTime() - new Date(b.session_datetime).getTime()).slice(0, 3);
  return <section id="masterclasses" className="scroll-mt-32 bg-background py-16"><div className={publicContainer}><div className="mb-8 flex items-end justify-between gap-4"><div><p className="eyebrow">{t.landing.liveSessions}</p><h2 className="section-title">{t.landing.upcomingMasterclasses}</h2></div><Link href="/masterclasses" className="hidden items-center gap-2 text-sm font-semibold text-primary sm:inline-flex">{t.landing.viewSchedule} <ArrowRight size={16} /></Link></div>{state === "loading" ? <SectionLoading label={t.masterclasses.title} /> : state === "error" ? <SectionError /> : upcoming.length === 0 ? <p className="border border-border bg-surface-alt p-5 text-sm text-text">{t.landing.noScheduledMasterclasses}</p> : <div className="grid gap-5 md:grid-cols-3">{upcoming.map((item) => <article key={item.id} className="flex min-h-60 flex-col justify-between rounded-[8px] border border-border bg-surface-alt p-5"><div><div className="flex items-center justify-between gap-3"><span className="rounded-[8px] bg-background px-2 py-1 text-xs text-text">{item.locked ? t.landing.memberAccess : t.landing.openAccess}</span><Calendar size={17} className="text-primary" /></div><h3 className="mt-6 font-heading text-xl text-text">{item.title}</h3><p className="mt-2 text-sm leading-6 text-text">{item.description || t.landing.sessionFallback}</p></div><div className="mt-6 border-t border-border pt-4 text-sm text-text"><p className="font-semibold">{item.speaker_name}</p><p className="mt-1"><LocalTime value={item.session_datetime} options={{ weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }} /></p></div></article>)}</div>}</div></section>;
}

export default function Home() {
  const { t } = useCopy();
  const postsQuery = useHomepagePostsQuery();
  const coursesQuery = useCoursesQuery();
  const masterclassesQuery = useMasterclassesQuery();
  const toState = (query: { isPending: boolean; isError: boolean }): LoadState => (query.isPending ? "loading" : query.isError ? "error" : "ready");
  const posts = postsQuery.data ?? [];
  const courses = coursesQuery.data ?? [];
  const masterclasses = masterclassesQuery.data ?? [];
  const postState = toState(postsQuery);
  const courseState = toState(coursesQuery);
  const masterclassState = toState(masterclassesQuery);
  const sectionsReady = ![postsQuery,coursesQuery,masterclassesQuery].some(query => query.isPending && !query.data);
  useEffect(() => {
    if (!sectionsReady) return;
    const restoreSection = () => {
      if (document.querySelector<HTMLElement>("[data-sections-ready]")?.dataset.sectionNavigationPending === "true") return;
      // Unknown fragments entered by hand retain normal browser behavior.
      void scrollToLandingSection(window.location.hash).catch(() => undefined);
    };
    restoreSection();
    window.addEventListener("popstate",restoreSection);
    window.addEventListener("hashchange",restoreSection);
    return () => { window.removeEventListener("popstate",restoreSection); window.removeEventListener("hashchange",restoreSection); };
  },[sectionsReady]);
  return (
    <main id="top" data-sections-ready={sectionsReady}>
      <section className="bg-background py-10 lg:py-16">
        <div className={`${publicContainer} grid items-center gap-8 lg:grid-cols-2 lg:gap-12`}>
          <div>
            <p className="eyebrow">{t.landing.eyebrow}</p>
            <TypewriterHeading text={t.landing.headline} className="mt-4 max-w-3xl font-heading text-5xl leading-tight text-text lg:text-6xl" />
            <p className="mt-6 max-w-xl text-lg leading-8 text-text">{t.landing.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-[8px] bg-primary px-5 py-3 text-sm font-semibold text-white hover:opacity-90">{t.landing.getStarted} <ArrowRight size={17} /></Link>
              <Link href="/courses" className="rounded-[8px] border border-border px-5 py-3 text-sm font-semibold text-primary hover:bg-surface-alt">{t.landing.exploreCourses}</Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-5 text-xs font-semibold text-text">
              <span className="inline-flex items-center gap-2"><BadgeCheck size={17} className="text-primary" /> {t.landing.mentorship}</span>
              <span className="inline-flex items-center gap-2"><GraduationCap size={17} className="text-primary" /> {t.landing.pathways}</span>
            </div>
          </div>
          <HeroCarousel />
        </div>
      </section>

      <section id="about" className="scroll-mt-32 bg-surface-alt py-16">
        <div className={`${publicContainer} grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]`}>
          <div>
            <p className="eyebrow">{t.landing.challengeEyebrow}</p>
            <h2 className="section-title">{t.landing.challengeTitle}</h2>
            <div className="mt-5 space-y-4 text-base leading-7 text-text">
              <p>{t.landing.challengeParagraphOne}</p>
              <p>{t.landing.challengeParagraphTwo}</p>
            </div>
          </div>
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] bg-background p-2">
            <div className="absolute inset-2 overflow-hidden rounded-[8px]">
              <LandingImage
                asset={getLandingMedia("community-event")}
                alt={t.landing.challengeImageAlt}
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <PostsSection state={postState} posts={posts} />
      <CoursesSection state={courseState} courses={courses} />
      <MasterclassesSection state={masterclassState} masterclasses={masterclasses} />

      <section id="pricing" className="scroll-mt-32 bg-background py-16">
        <div className="mx-auto max-w-2xl rounded-[8px] border border-border bg-surface-alt px-6 py-12 text-center lg:px-12">
          <p className="eyebrow">{t.landing.membershipEyebrow}</p>
          <h2 className="section-title">{t.landing.membershipTitle}</h2>
          <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-text">{t.landing.membershipDescription}</p>
          <p className="mt-8 font-heading text-5xl text-text">{t.landing.membershipPrice} <span className="font-body text-base text-text">{t.landing.monthlyPrice}</span></p>
          <Link href="/signup" className="mt-8 inline-flex items-center gap-2 rounded-[8px] bg-primary px-6 py-3 text-sm font-semibold text-white hover:opacity-90">{t.landing.becomeMember} <ArrowRight size={17} /></Link>
        </div>
      </section>

      <section className="bg-surface-alt py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-5 text-center">
          <h2 className="section-title">{t.landing.closingHeadline}</h2>
          <p className="mt-4 text-base leading-7 text-text">{t.landing.closingDescription}</p>
          <Link href="/signup" className="mt-7 inline-flex items-center gap-2 rounded-[8px] bg-primary px-6 py-3 text-sm font-semibold text-white hover:opacity-90">{t.landing.getStarted} <ArrowRight size={17} /></Link>
        </div>
      </section>
    </main>
  );
}
