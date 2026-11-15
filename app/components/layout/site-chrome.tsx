"use client";


import { Button } from "@/components/ui/button";
import Link from "@/components/ui/pending-link";
import { publicContainer } from "@/lib/utils/layout";
import { LandingNavigation } from "@/components/layout/landing-navigation";
import { ArrowUp, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCopy } from "@/lib/copy/provider";
import { BrandLogo } from "@/components/ui/brand-logo";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); } };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);
  const { t } = useCopy();

  return (
    <header data-site-header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className={`${publicContainer} flex h-20 items-center justify-between gap-4`}>
        <BrandLogo priority showName />
        <nav className="hidden items-center xl:flex" aria-label={t.nav.primaryNavigation}>
          <LandingNavigation />
        </nav>
        <div className="hidden items-center gap-3 sm:flex">
          <Link href="/login" className="text-sm font-semibold text-text hover:text-primary">{t.common.login}</Link><Link href="/signup" className="rounded-[8px] bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">{t.common.signup}</Link>
        </div>
        <Button ref={menuButton} type="button" aria-controls="marketing-mobile-nav" className="h-11 w-11 rounded-[8px] text-text hover:bg-surface-alt xl:hidden" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? t.nav.closeNavigation : t.nav.openNavigation} aria-expanded={menuOpen}>
          {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </Button>
      </div>
      {menuOpen && (
        <nav id="marketing-mobile-nav" className="border-t border-border bg-background px-5 py-4 xl:hidden" aria-label={t.nav.mobileNavigation}>
          <div className="flex flex-col gap-4">
            <LandingNavigation mobile onNavigate={() => setMenuOpen(false)} />
            <div className="flex items-center justify-between gap-5 border-t border-border pt-4 sm:hidden">
              <Link href="/login" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-text">{t.common.login}</Link><Link href="/signup" onClick={() => setMenuOpen(false)} className="rounded-[8px] bg-primary px-5 py-2.5 text-sm font-semibold text-white">{t.common.signup}</Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

function FooterColumn({ title, links }: { title: string; links: readonly (readonly [string, string])[] }) {
  return <div><h3 className="mb-3 text-base font-semibold text-text">{title}</h3><ul className="space-y-1">{links.map(([label,href]) => <li key={label}><Link href={href} className="inline-flex min-h-10 items-center text-base text-text hover:text-primary hover:underline">{label}</Link></li>)}</ul></div>;
}

export function SiteFooter() {
  const { t } = useCopy();
  return <footer data-site-footer className="border-t border-border bg-background"><div className={`${publicContainer} py-10 lg:py-12`}>
    <div className="grid gap-10 pb-8 lg:grid-cols-[1fr_2fr] lg:gap-16">
      <div><BrandLogo size="footer" showName /><p className="mt-4 max-w-md text-base leading-7 text-text">{t.public.tagline}</p><div className="mt-5 max-w-md rounded-[8px] border border-border bg-surface-alt p-4"><p className="text-base font-semibold text-text">{t.public.communityHeading}</p><p className="mt-1 text-sm text-text">{t.public.communityUnavailable}</p></div></div>
      <nav aria-label={t.public.footerNavigation} className="grid grid-cols-2 gap-8 sm:grid-cols-3">
        <FooterColumn title={t.public.program} links={[[t.nav.home,"/"],[t.nav.courses,"/courses"],[t.nav.resources,"/resources"],[t.nav.opportunities,"/opportunities"],[t.nav.masterclasses,"/masterclasses"]]} />
        <FooterColumn title={t.nav.services} links={[[t.admin.essayReview,"/services"],[t.admin.activitiesReview,"/services"],[t.common.pricing,"/#pricing"]]} />
        <FooterColumn title={t.public.legal} links={[[t.public.about,"/#about"],[t.public.privacy,"/privacy"],[t.public.terms,"/terms"]]} />
      </nav>
    </div>
    <div className="flex flex-col justify-between gap-4 border-t border-border pt-5 sm:flex-row sm:items-center"><p className="text-sm text-text">{t.public.copyright}</p><Link href="/#top" className="inline-flex min-h-11 items-center gap-2 rounded-[8px] text-sm font-semibold text-primary hover:underline">{t.public.backToTop}<ArrowUp size={16} aria-hidden="true" /></Link></div>
  </div></footer>;
}
