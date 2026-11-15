"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Home,
  Library,
  Shield,
  ShieldCheck,
  UserRound,
  Target,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useCopy } from "@/lib/copy/provider";
import { type CourseDetail, type CourseModule } from "@/lib/api/index";
import { useCourseQuery, useProfileQuery } from "@/lib/queries/index";
import { Avatar } from "@/components/ui/avatar";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { SidebarNavItem, SidebarProfileBlock } from "@/components/layout/sidebar-primitives";
import { LogoutButton } from "@/components/auth/logout-button";

const primaryLinks: Array<{ key: "dashboard" | "courses" | "resources" | "opportunities" | "masterclasses" | "services" | "admin"; href: string; icon: LucideIcon }> = [
  { key: "dashboard", href: "/dashboard", icon: Home },
  { key: "courses", href: "/courses", icon: BookOpen },
  { key: "resources", href: "/resources", icon: Library },
  { key: "opportunities", href: "/opportunities", icon: Target },
  { key: "masterclasses", href: "/masterclasses", icon: Video },
  { key: "services", href: "/services", icon: ClipboardCheck },
];

function initialsFor(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

export function SidebarProfile() {
  const { currentUser } = useAuth();
  const { t } = useCopy();
  const profileQuery = useProfileQuery();
  const email = currentUser?.email ?? "";
  const roleLabel = currentUser?.role === "admin" ? t.common.admin : t.common.student;

  if (profileQuery.isError) {
    return (
      <div data-testid="profile-block" className="border-t border-border px-4 py-4">
        <p role="alert" className="text-sm text-text">{t.common.errorDescription}</p>
        <Button type="button" onClick={() => void profileQuery.refetch()} className="mt-2 min-h-10 rounded-[8px] px-2 text-sm font-semibold text-primary">{t.common.retry}</Button>
        <LogoutButton className="mt-2 min-h-11 w-full rounded-[8px] border border-border px-3 text-sm font-semibold text-text hover:bg-surface-alt" />
      </div>
    );
  }

  if (!profileQuery.data) {
    return (
      <div data-testid="profile-block" aria-busy="true" className="border-t border-border px-4 py-4">
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-alt" />
          <span className="h-10 flex-1 animate-pulse rounded-[8px] bg-surface-alt" />
        </div>
      </div>
    );
  }

  const fullName = profileQuery.data.full_name?.trim() ?? "";
  return (
    <div data-testid="profile-block">
      <SidebarProfileBlock
        avatar={<Avatar userId={profileQuery.data.user_id} name={fullName} email={email} avatarKey={profileQuery.data.avatar_url} updatedAt={profileQuery.data.updated_at} />}
        displayName={fullName}
        email={email}
        role={roleLabel}
        initials={initialsFor(fullName || email)}
      />
    </div>
  );
}

export function PrimarySidebarBody({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { currentUser } = useAuth();
  const { t } = useCopy();
  const settings = pathname === "/profile" || pathname.startsWith("/profile/");
  const links = settings ? [
    { key: "profileSection" as const, href: "/profile", icon: UserRound },
    { key: "account" as const, href: "/profile/account", icon: ShieldCheck },
  ] : currentUser?.role === "admin"
    ? [...primaryLinks, { key: "admin" as const, href: "/admin", icon: Shield }]
    : primaryLinks;

  return (
    <>
      <div className="flex h-[88px] shrink-0 items-center border-b border-border px-5">
        <BrandLogo size="sidebar" href="/dashboard" ariaLabel={t.nav.dashboard} priority />
      </div>
      <nav aria-label={settings ? t.profile.settingsNavigation : t.nav.primaryNavigation} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-5">
        {settings && <Link href="/dashboard" onClick={onNavigate} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-[8px] px-3 text-sm text-primary"><ArrowLeft size={16} aria-hidden="true" />{t.profile.backToDashboard}</Link>}
        {links.map((item) => (
          <SidebarNavItem
            key={item.href}
            href={item.href}
            label={item.key === "profileSection" || item.key === "account" ? t.profile[item.key] : t.nav[item.key]}
            icon={item.icon}
            active={pathname === item.href || !settings && pathname.startsWith(`${item.href}/`)}
            onClick={onNavigate}
          />
        ))}
      </nav>
      <SidebarProfile />
    </>
  );
}

function orderedModules(modules: CourseModule[]) {
  return modules.slice().sort((left, right) => left.order - right.order).map((module) => ({
    ...module,
    lessons: module.lessons.slice().sort((left, right) => left.order - right.order),
  }));
}

function CourseOutline({ course, currentLessonId, onNavigate }: { course: CourseDetail; currentLessonId: string | null; onNavigate?: () => void }) {
  const { t } = useCopy();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const ordered = orderedModules(course.modules);
  const allLessons = ordered.flatMap((module) => module.lessons.map((lesson) => ({ module, lesson })));
  const focusLessonId = currentLessonId ?? (allLessons.find(({ lesson }) => !lesson.completed) ?? allLessons[0])?.lesson.id ?? null;
  const defaultModuleId = allLessons.find(({ lesson }) => lesson.id === focusLessonId)?.module.id ?? null;

  return (
    <nav aria-label={t.nav.courseNavigation} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      {ordered.map((module, index) => {
        const isOpen = overrides[module.id] ?? module.id === defaultModuleId;
        return (
          <section key={module.id} className="border-b border-border last:border-b-0">
            <Button
              type="button"
              aria-expanded={isOpen}
              aria-label={t.nav.toggleModule.replace("{title}", module.title)}
              onClick={() => setOverrides((current) => ({ ...current, [module.id]: !isOpen }))}
              className="flex min-h-12 w-full items-center gap-3 px-2 py-3 text-left text-text"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-surface-alt text-sm font-semibold text-primary">{index + 1}</span>
              <span className="min-w-0 flex-1 text-base font-semibold">{module.title}</span>
              <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ease-out ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </Button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="lessons"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                  data-module-panel
                >
                  <ol className="space-y-1 pb-2 pl-2">
                {module.lessons.map((lesson) => {
                  const isCurrent = lesson.id === currentLessonId;
                  const lessonStatus = lesson.completed ? t.nav.lessonCompleted : t.nav.lessonNotStarted;
                  const accessibleStatus = isCurrent ? `${lessonStatus}, ${t.nav.lessonCurrent}` : lessonStatus;
                  return (
                    <li key={lesson.id}>
                      <Link
                        data-testid="course-lesson-link"
                        href={`/courses/${course.id}/lessons/${lesson.id}`}
                        onClick={onNavigate}
                        aria-current={isCurrent ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-[8px] border-l-2 px-2 py-2 transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isCurrent ? "border-primary bg-primary/5 text-primary" : "border-transparent text-text hover:bg-surface-alt"}`}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center" role="img" aria-label={accessibleStatus}>
                          {lesson.completed
                            ? <CheckCircle2 size={16} className="text-primary" aria-hidden="true" />
                            : isCurrent
                              ? <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
                              : <span className="h-4 w-4 rounded-full border border-border" aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 flex-1 text-base leading-5">{lesson.title}</span>
                      </Link>
                    </li>
                  );
                })}
                  </ol>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}
    </nav>
  );
}

export function CourseSidebarBody({ courseId, pathname, onNavigate }: { courseId: string; pathname: string; onNavigate?: () => void }) {
  const { t } = useCopy();
  const courseQuery = useCourseQuery(courseId);
  const course = courseQuery.data;
  const routeLessonId = pathname.match(/^\/courses\/[^/]+\/lessons\/([^/]+)\/?$/)?.[1] ?? null;

  return (
    <>
      <div className="shrink-0 border-b border-border px-4 py-5">
        <Link href="/courses" onClick={onNavigate} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] text-base font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ArrowLeft size={16} aria-hidden="true" />
          {t.courses.backToCourses}
        </Link>
        {course && <h2 className="mt-3 font-heading text-2xl leading-tight text-text">{course.title}</h2>}
      </div>
      {course && <CourseOutline key={course.id} course={course} currentLessonId={routeLessonId} onNavigate={onNavigate} />}
      {courseQuery.isPending && (
        <div className="space-y-3 px-4 py-5" aria-busy="true">
          <div className="h-6 w-3/4 animate-pulse rounded-[8px] bg-surface-alt" />
          <div className="h-10 animate-pulse rounded-[8px] bg-surface-alt" />
          <div className="h-10 animate-pulse rounded-[8px] bg-surface-alt" />
        </div>
      )}
      {courseQuery.isError && (
        <div className="px-4 py-5">
          <p role="alert" className="text-base text-text">{t.courses.courseLoadError}</p>
          <Button type="button" onClick={() => void courseQuery.refetch()} className="mt-2 min-h-10 rounded-[8px] px-2 text-sm font-semibold text-primary">{t.common.retry}</Button>
        </div>
      )}
    </>
  );
}
