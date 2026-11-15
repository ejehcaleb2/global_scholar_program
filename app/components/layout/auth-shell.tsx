"use client";

import type { ReactNode } from "react";
import Link from "@/components/ui/pending-link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { MediaImage } from "@/components/ui/media-image";
import { useCopy } from "@/lib/copy/provider";

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  const { t } = useCopy();

  return (
    <main className="grid min-h-screen w-full grid-cols-1 bg-background lg:grid-cols-2">
      <section className="flex min-w-0 flex-col px-5 py-6 sm:px-10 lg:px-12 lg:py-10">
        <header className="mx-auto mb-6 flex w-full max-w-md justify-start">
          <BrandLogo size="auth" priority />
        </header>
        <div className="mx-auto my-auto w-full max-w-md py-6">
          {children}
        </div>
        <footer className="mx-auto mt-6 flex w-full max-w-md flex-wrap gap-5 border-t border-border pt-5 text-sm text-text"><Link href="/terms" className="inline-flex min-h-10 items-center text-primary underline">{t.public.terms}</Link><Link href="/privacy" className="inline-flex min-h-10 items-center text-primary underline">{t.public.privacy}</Link></footer>
      </section>
      <aside className="hidden min-w-0 border-l border-border bg-surface-alt px-8 py-10 lg:block lg:px-10" aria-label={t.auth.programInformation}>
        <div data-testid="auth-image-panel" className="sticky top-8 mx-auto max-w-xl space-y-6">
          <figure className="content-fade-in motion-reduce:animate-none">
            <MediaImage src="/media/landing/classroom-session-960.webp" alt={t.auth.programImageAlt} width={960} height={720} sizes="(min-width: 1024px) 576px, 100vw" className="h-auto w-full object-cover" wrapperClassName="block overflow-hidden rounded-[8px] border border-border bg-background" />
            <figcaption className="mt-3 text-sm text-text">{t.auth.programImageCaption}</figcaption>
          </figure>
          <div><h2 className="font-heading text-3xl leading-tight text-text">{t.auth.programTitle}</h2><p className="mt-4 text-lg leading-7 text-text">{t.auth.programSummary}</p></div>
          <p className="border-t border-border pt-5 text-base leading-7 text-text">{t.auth.programPoints[0].description}</p>
        </div>
      </aside>
    </main>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-[8px] border border-border bg-surface-alt p-3 text-sm text-text">{message}</p>;
}
