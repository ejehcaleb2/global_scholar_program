"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LOGOUT_REDIRECT_KEY, useAuth } from "@/components/auth/auth-provider";
import { useCopy } from "@/lib/copy/provider";
import { DashboardPageSkeleton } from "@/components/ui/page-skeleton";
import { AdminShell } from "@/components/layout/admin-shell";
import { useHydrated } from "@/components/ui/use-hydrated";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, currentUser } = useAuth();
  const { t } = useCopy();
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated && !accessToken && sessionStorage.getItem(LOGOUT_REDIRECT_KEY) !== "true") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [accessToken, hydrated, pathname, router]);

  useEffect(() => {
    const title = pathname === "/admin" ? t.admin.dashboard
      : pathname.startsWith("/admin/courses") ? t.admin.courses
      : pathname.startsWith("/admin/resources") ? t.admin.resources
      : pathname.startsWith("/admin/opportunities") ? t.admin.opportunities
      : pathname.startsWith("/admin/masterclasses") ? t.admin.masterclasses
      : pathname.startsWith("/admin/service-requests") ? t.admin.serviceRequests
      : pathname.startsWith("/admin/students") ? t.admin.students
      : pathname.startsWith("/admin/activity") ? t.admin.activity
      : pathname.startsWith("/admin/homepage-posts") ? t.admin.homepageContent
      : pathname.startsWith("/admin/settings") ? t.admin.settings
      : t.admin.dashboard;
    document.title = `${title} | Global Scholars Program`;
  }, [pathname, t]);

  if (!hydrated || !accessToken) {
    return <main className="mx-auto min-h-[60vh] max-w-[1600px] px-5 py-8 sm:px-8 lg:px-10"><DashboardPageSkeleton /></main>;
  }

  if (currentUser?.role !== "admin") {
    return <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-5 py-16 text-center"><h1 className="font-heading text-3xl text-text">{t.admin.forbidden}</h1><Link href="/dashboard" className="mt-6 inline-flex min-h-11 items-center rounded-[8px] bg-primary px-5 text-base font-semibold text-white">{t.admin.dashboardLink}</Link></main>;
  }

  return <AdminShell>{children}</AdminShell>;
}