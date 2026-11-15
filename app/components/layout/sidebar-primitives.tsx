"use client";


import { Button } from "@/components/ui/button";
import Link from "@/components/ui/pending-link";
import { useDialogFocus } from "@/components/ui/use-dialog-focus";
import { X, type LucideIcon } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { AnimatePresence, motion } from "framer-motion";

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
  onClick,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-12 items-center gap-3 rounded-[8px] border-l-2 px-3 py-2.5 text-base font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        active ? "border-primary bg-primary/5 text-primary" : "border-transparent text-text hover:bg-surface-alt hover:text-primary"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && <span className="min-w-6 rounded-[8px] bg-primary px-1.5 py-0.5 text-center text-xs font-semibold text-white">{badge}</span>}
    </Link>
  );
}

export function SidebarProfileBlock({
  displayName,
  email,
  role,
  href = "/profile",
  avatar,
  initials,
}: {
  displayName: string;
  email: string;
  role: string;
  href?: string;
  avatar?: React.ReactNode;
  initials: string;
}) {
  return (
    <div className="border-t border-border px-4 py-4">
      <Link href={href} className="flex min-w-0 items-center gap-3 rounded-[8px] px-2 py-2 transition-colors duration-200 ease-out hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {avatar ?? <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-surface-alt text-sm font-semibold text-primary">{initials}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-text">{displayName || email}</span>
          <span className="block truncate text-sm text-text">{role}</span>
        </span>
      </Link>
      <LogoutButton icon className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-border px-3 text-sm font-semibold text-text transition-colors duration-200 ease-out hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
    </div>
  );
}

export function MobileDrawer({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const drawerRef = useDialogFocus(open, onClose);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" data-drawer>
          <motion.div
            className="absolute inset-0 bg-text/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            data-drawer-overlay
          >
            <Button type="button" aria-label={label} className="absolute inset-0 h-full w-full" onClick={onClose} />
          </motion.div>
          <motion.aside
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            data-drawer-panel
            className="relative flex h-full w-[min(84vw,300px)] flex-col overflow-y-auto border-r border-border bg-background p-4 shadow-overlay"
          >
            <div className="mb-4 flex items-center justify-end">
              <Button type="button" onClick={onClose} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border transition-colors duration-200 ease-out hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X size={18} /></Button>
            </div>
            {children}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
