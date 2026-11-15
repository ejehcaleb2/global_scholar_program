"use client";

import { Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useCopy } from "@/lib/copy/provider";
import { CourseSidebarBody, PrimarySidebarBody } from "@/components/layout/app-sidebars";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/layout/sidebar-primitives";
import { SiteFooter, SiteHeader } from "@/components/layout/site-chrome";
import { useConsentStatusQuery } from "@/lib/queries/index";

function PublicAppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}

function AuthenticatedAppShell({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const { t } = useCopy();
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const courseId = pathname.match(/^\/courses\/([^/]+)(?:\/lessons\/[^/]+)?\/?$/)?.[1] ?? null;
  const closeDrawer = () => setDrawerPath(null);

  function sidebarBody(onNavigate?: () => void) {
    return courseId
      ? <CourseSidebarBody courseId={courseId} pathname={pathname} onNavigate={onNavigate} />
      : <PrimarySidebarBody pathname={pathname} onNavigate={onNavigate} />;
  }

  return (
    <div data-shell={courseId ? "course" : pathname === "/profile" || pathname.startsWith("/profile/") ? "settings" : "app"} className="min-h-screen bg-background text-text">
      <aside
        data-testid={courseId ? "course-sidebar" : "app-sidebar"}
        className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col border-r border-border bg-background lg:flex"
      >
        {sidebarBody()}
      </aside>
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border bg-background px-4 lg:hidden">
        <Button
          type="button"
          aria-label={courseId ? t.nav.courseNavigation : t.nav.openNavigation}
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

function AuthShellLoading() {
  const { t } = useCopy();
  return (
    <div className="min-h-screen bg-background" role="status" aria-busy="true">
      <span className="sr-only">{t.nav.loadingApp}</span>
    </div>
  );
}

export function AppShellSwitcher({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useCopy();
  const { accessToken, currentUser, isInitializing, isLoggingOut, finishLogout } = useAuth();
  const consents = useConsentStatusQuery();
  const mustCheckConsent = Boolean(accessToken) && !["/terms", "/privacy", "/consent"].includes(pathname);
  const isAuthOnlyRoute = ["/login", "/signup", "/onboarding", "/consent"].includes(pathname);
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    if (!isLoggingOut) return;
    if (pathname === "/") finishLogout();
    else router.replace("/");
  }, [isLoggingOut, pathname, router, finishLogout]);

  useEffect(() => {
    if (mustCheckConsent && consents.data && !consents.data.complete) router.replace("/consent");
  }, [mustCheckConsent, consents.data, router]);

  // Unmount protected pages before their missing-session effects can redirect.
  if (isLoggingOut && pathname !== "/") return <AuthShellLoading />;

  if (mustCheckConsent && consents.isError) return <main className="mx-auto max-w-xl px-5 py-10" role="alert"><p>{t.common.consentLoadError}</p><Button type="button" onClick={() => consents.refetch()} className="mt-4 min-h-11 rounded-[8px] border border-border px-4 text-primary">{t.common.retry}</Button></main>;
  if (mustCheckConsent && (!consents.data || !consents.data.complete)) return <AuthShellLoading />;

  if (isAuthOnlyRoute) return <>{children}</>;
  if (isInitializing) return <AuthShellLoading />;
  if (!accessToken) return <PublicAppShell>{children}</PublicAppShell>;
  // Admins get their own shell from the admin layout; the student shell never wraps it.
  if (isAdminRoute && currentUser?.role === "admin") return <>{children}</>;
  return <AuthenticatedAppShell pathname={pathname}>{children}</AuthenticatedAppShell>;
}
