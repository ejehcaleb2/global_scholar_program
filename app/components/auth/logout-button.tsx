"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { ConfirmDialog } from "@/components/admin/ui/primitives";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { useCopy } from "@/lib/copy/provider";

/** Every explicit sign-out uses the same confirmation; expiry stays automatic. */
export function LogoutButton({ className, icon = false }: { className?: string; icon?: boolean }) {
  const [open, setOpen] = useState(false);
  const confirmed = useRef(false);
  const { logout } = useAuth();
  const { t } = useCopy();
  const { addToast } = useToast();

  function confirm() {
    if (confirmed.current) return;
    confirmed.current = true;
    logout();
    addToast(t.common.logout, t.common.logoutSuccess, "success");
  }

  return <>
    <Button type="button" onClick={() => setOpen(true)} className={className}>
      {icon && <LogOut size={16} aria-hidden="true" />}
      {t.common.logout}
    </Button>
    {/* A portal keeps the confirmation above transformed mobile drawers. */}
    {open && createPortal(<ConfirmDialog
      open={open}
      title={t.common.logoutConfirmTitle}
      description={t.common.logoutConfirmDescription}
      confirmLabel={t.common.logout}
      cancelLabel={t.common.logoutCancel}
      onClose={() => setOpen(false)}
      onConfirm={confirm}
    />, document.body)}
  </>;
}
