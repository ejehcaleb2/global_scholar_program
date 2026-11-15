"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "@/components/ui/pending-link";
import { useCopy } from "@/lib/copy/provider";
import { scrollToLandingSection } from "@/lib/utils/section-navigation";
import { useToast } from "@/components/ui/toast-provider";

export function LandingNavigation({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { t } = useCopy();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const { addToast } = useToast();
  const root = useRef<HTMLDivElement>(null);
  const uid = useId();
  const reduced = useReducedMotion();
  const access = { label:t.nav.membershipAccess, href:"/#pricing" };
  const groups = [
    { id:"home", label:t.nav.home, items:[{label:t.nav.welcome,href:"/#top"},{label:t.public.about,href:"/#about"},{label:t.nav.programUpdates,href:"/#updates"}] },
    { id:"courses", label:t.nav.courses, items:[{label:t.nav.courseOverview,href:"/#courses"},access] },
    { id:"resources", label:t.nav.resources, href:"/resources", items:[] },
    { id:"opportunities", label:t.nav.opportunities, href:"/opportunities", items:[] },
    { id:"masterclasses", label:t.nav.masterclasses, items:[{label:t.nav.sessionOverview,href:"/#masterclasses"},access] },
    { id:"services", label:t.nav.services, href:"/services", items:[] },
    { id:"pricing", label:t.common.pricing, items:[access] },
  ];
  function focusItem(id: string, last = false) {
    setOpen(id);
    requestAnimationFrame(() => {
      const items = root.current?.querySelectorAll<HTMLAnchorElement>(`[data-navigation-group="${id}"] a`);
      (last ? items?.[items.length - 1] : items?.[0])?.focus();
    });
  }
  return <div ref={root} className={mobile ? "flex flex-col gap-1" : "flex items-center gap-1"} onBlur={event => {
    // Removing a previously clicked link emits blur with no next target. It must
    // not close the next menu that the pointer has already opened.
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(null);
  }}>
    {groups.map((group,index) => group.href ? <Link key={group.id} href={group.href} onClick={() => {setOpen(null);onNavigate?.();}} className="marketing-nav-trigger inline-flex min-h-11 items-center rounded-[8px] px-2 text-base text-text">{group.label}</Link> : <div key={group.id} data-navigation-group={group.id} className="relative" onPointerEnter={event => { if (!mobile && event.pointerType !== "touch") setOpen(group.id); }} onPointerLeave={() => { if (!mobile) setOpen(null); }} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(null); event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus(); }
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && event.target instanceof HTMLButtonElement) { event.preventDefault(); focusItem(group.id,event.key === "ArrowUp"); }
    }}>
      <Button type="button" loading={pending === group.id} loadingLabel={t.nav.loadingApp} aria-expanded={open === group.id} aria-controls={`${uid}-${group.id}`} onClick={event => setOpen(mobile || event.detail === 0 ? open === group.id ? null : group.id : group.id)} className={`marketing-nav-trigger min-h-11 rounded-[8px] px-2 text-base text-text ${mobile ? "w-full justify-start" : ""}`}>{group.label}</Button>
      <AnimatePresence initial={false}>{open === group.id && <motion.div id={`${uid}-${group.id}`} style={{transformOrigin:index > 4 ? "top right" : "top left"}} initial={{ opacity:0,y:reduced ? 0 : 6,scale:reduced ? 1 : 0.98 }} animate={{ opacity:1,y:0,scale:1 }} exit={{ opacity:0,y:reduced ? 0 : 4,scale:reduced ? 1 : 0.99 }} transition={{ duration:reduced ? 0 : 0.2,ease:"easeOut" }} className={mobile ? "relative py-2" : `absolute top-full z-50 min-w-60 pt-2 ${index > 4 ? "right-0" : "left-0"}`}>
        <ul className={`rounded-[8px] border border-border bg-background p-2 ${mobile ? "" : "shadow-overlay"}`}>{group.items.map(item => <li key={item.href}><Link href={item.href} scroll={false} onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          setOpen(null); onNavigate?.();
          if (window.location.pathname !== "/") return;
          event.preventDefault();
          if (pending) return;
          setPending(group.id);
          void scrollToLandingSection(new URL(item.href,window.location.origin).hash,true).catch(() => addToast(t.nav.sectionErrorTitle,t.nav.sectionError,"error")).finally(() => setPending(null));
        }} className="marketing-nav-item flex min-h-11 items-center rounded-[8px] px-3 py-2 text-base text-text hover:bg-surface-alt hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{item.label}</Link></li>)}</ul>
      </motion.div>}</AnimatePresence>
    </div>)}
  </div>;
}
