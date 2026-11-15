"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useCopy } from "@/lib/copy/provider";

type PendingLinkProps = ComponentProps<typeof Link> & { pendingLabel?: string };

function PendingIndicator({ label, active }: { label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  const busy = active || pending;
  return <>
    {busy && <Loader2 className="absolute inset-0 m-auto motion-safe:animate-spin" size={16} aria-hidden="true" />}
    <span className="sr-only" role="status" aria-live="polite">{busy ? label : ""}</span>
  </>;
}

export function PendingLink({ href, children, className = "", pendingLabel, onClick, ...props }: PendingLinkProps) {
  const { t } = useCopy();
  const pathname = usePathname();
  const activated = useRef(false);
  const [active, setActive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { activated.current = false; setActive(false); } });
    return () => { cancelled = true; };
  }, [pathname]);
  return <Link {...props} href={href} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === "_blank") return;
    const destination = new URL(event.currentTarget.href);
    if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
    if (activated.current) { event.preventDefault(); return; }
    activated.current = true;
    setActive(true);
  }} aria-busy={active || undefined} aria-disabled={active || undefined} className={`relative ${className}`}>
    <span className={active ? "contents [&>*]:invisible" : "contents"}>{children}</span>
    <PendingIndicator label={pendingLabel ?? t.nav.loadingApp} active={active} />
  </Link>;
}

export default PendingLink;
