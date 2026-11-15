"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/copy/provider";

export function AdminPagination({ page, total, size, busy, onChange }: { page: number; total: number; size: number; busy: boolean; onChange: (page: number) => void }) {
  const { t } = useCopy();
  const pages = Math.max(1, Math.ceil(total / size));
  return <footer className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-border py-4 text-sm text-text">
    <Button disabled={page <= 1 || busy} title={page <= 1 ? t.admin.firstPageReason : t.admin.previousPage} aria-label={t.admin.previousPage} onClick={() => onChange(page - 1)} className="h-10 w-10 rounded-[8px] border border-border"><ArrowLeft size={16} aria-hidden="true" /></Button>
    <span role="status">{t.admin.showingPage.replace("{page}", String(page)).replace("{pages}", String(pages))}</span>
    <Button disabled={page >= pages || busy} title={page >= pages ? t.admin.lastPageReason : t.admin.nextPage} aria-label={t.admin.nextPage} onClick={() => onChange(page + 1)} className="h-10 w-10 rounded-[8px] border border-border"><ArrowRight size={16} aria-hidden="true" /></Button>
  </footer>;
}
