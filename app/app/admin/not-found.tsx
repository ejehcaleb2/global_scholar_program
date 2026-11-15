"use client";

import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { useCopy } from "@/lib/copy/provider";

export default function AdminNotFound() {
  const { t } = useCopy();

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-5 py-16 text-center">
      <FileQuestion className="text-primary" size={24} aria-hidden="true" />
      <h1 className="mt-4 font-heading text-3xl text-text">{t.admin.notFound}</h1>
      <Link href="/admin" className="mt-6 inline-flex min-h-11 items-center rounded-[8px] bg-primary px-5 text-base font-semibold text-white">{t.admin.dashboardLink}</Link>
    </main>
  );
}
