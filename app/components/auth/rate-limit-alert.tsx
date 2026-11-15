"use client";

import { APP_LOCALE, useCopy } from "@/lib/copy/provider";

export function RateLimitAlert({ seconds }: { seconds: number }) {
  const { t } = useCopy();
  if (seconds <= 0) return null;
  return <div className="text-sm text-red-600" role="alert">{t.common.rateLimited.replace("{seconds}", new Intl.NumberFormat(APP_LOCALE).format(seconds))}</div>;
}
