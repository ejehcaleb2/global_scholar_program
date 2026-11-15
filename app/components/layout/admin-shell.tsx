"use client";

import Link from "@/components/ui/pending-link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Menu,
  BookOpen,
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  PlaySquare,
  Settings,
  UsersRound,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCopy } from "@/lib/copy/provider";
import { getAdminStats } from "@/lib/api/index";
import { SidebarProfile } from "@/components/layout/app-sidebars";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { MobileDrawer, SidebarNavItem } from "@/components/layout/sidebar-primitives";

const navigation = [
  { key: "dashboard", href: "/admin", icon: LayoutDashboard },
  { key: "activity", href: "/admin/activity", icon: FileText },
  { key: "homepageContent", href: "/admin/homepage-posts", icon: FileText },
  { key: "courses", href: "/admin/courses", icon: BookOpen },
  { key: "resources", href: "/admin/resources", icon: FileText },
  { key: "opportunities", href: "/admin/opportunities", icon: BriefcaseBusiness },
  { key: "masterclasses", href: "/admin/masterclasses", icon: PlaySquare },
  { key: "students", href: "/admin/students", icon: UsersRound },
  { key: "settings", href: "/admin/settings", icon: Settings },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useCopy();
  const statsQuery = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: getAdminStats,
    staleTime: 5_000,
    refetchInterval: () => document.visibilityState === "visible" ? 60_000 : false,
    refetchIntervalInBackground: false,
  });

  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const closeDrawer = () => setDrawerPath(null);

  function sidebarBody(onNavigate?: () => void) {
    return (
      <>
        <div className="flex h-[88px] shrink-0 items-center border-b border-border px-5">
          <BrandLogo size="sidebar" href="/admin" ariaLabel={t.admin.dashboard} priority />
        </div>
        <nav aria-label={t.admin.menu} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-5">
          {navigation.map((item) => (
            <SidebarNavItem
              key={item.href}
              href={item.href}
              label={t.admin[item.key]}
              icon={item.icon}
              active={pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`))}
              badge={item.key === "dashboard" ? statsQuery.data?.service_requests.pending : undefined}
              onClick={onNavigate}
            />
          ))}
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className="mt-3 flex min-h-12 items-center gap-3 rounded-[8px] border border-border px-3 py-2.5 text-base font-semibold text-primary transition-colors duration-200 ease-out hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{t.admin.backToStudent}</span>
          </Link>
        </nav>
        <SidebarProfile />
      </>
    );
  }

  return (
    <div data-shell="admin" className="min-h-screen bg-background text-text">
      <aside data-testid="admin-sidebar" className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col border-r border-border bg-background lg:flex">
        {sidebarBody()}
      </aside>
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border bg-background px-4 lg:hidden">
        <Button
          type="button"
          aria-label={t.nav.openNavigation}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerPath(pathname)}
          className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border text-text transition-colors duration-200 ease-out hover:bg-surface-alt"
        >
          <Menu size={20} aria-hidden="true" />
        </Button>
      </header>
      <main className="min-w-0 lg:ml-[250px]">{children}</main>
      <MobileDrawer open={drawerOpen} onClose={closeDrawer} label={t.nav.closeNavigation}>
        <div className="flex min-h-full flex-col">{sidebarBody(closeDrawer)}</div>
      </MobileDrawer>
    </div>
  );
}
