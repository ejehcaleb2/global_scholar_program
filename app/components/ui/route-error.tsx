"use client";

import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/copy/provider";

export function RouteError({ reset }: { reset: () => void }) {
  const { t } = useCopy();

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-5 py-12 text-center">
      <h1 className="font-heading text-3xl font-semibold text-text">
        {t.common.errorTitle}
      </h1>
      <p className="mt-3 max-w-xl text-base leading-6 text-text">
        {t.common.errorDescription}
      </p>
      <Button
        type="button"
        onClick={reset}
        className="mt-6 min-h-11 rounded-[8px] bg-primary px-5 text-base font-semibold text-white"
      >
        {t.common.retry}
      </Button>
    </main>
  );
}