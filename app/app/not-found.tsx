"use client";


import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useCopy } from "@/lib/copy/provider";

export default function NotFound() {
  const { accessToken } = useAuth();
  const { t } = useCopy();

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-alt px-5 py-10">
      <div className="w-full max-w-xl rounded-[8px] border border-border bg-background p-8 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 font-heading text-4xl text-text">{t.notFound.title}</h1>
        <p className="mt-4 text-sm leading-6 text-text">
          {accessToken ? t.notFound.memberMessage : t.notFound.guestMessage}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={accessToken ? "/dashboard" : "/"} className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-primary px-5 py-3 text-sm font-semibold text-white">
            <Home size={16} />
            {accessToken ? t.notFound.dashboard : t.notFound.home}
          </Link>
          <Button type="button" onClick={() => window.history.back()} className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-border px-5 py-3 text-sm font-semibold text-text">
            <ArrowLeft size={16} />
            {t.notFound.goBack}
          </Button>
        </div>
      </div>
    </main>
  );
}
