"use client";

import { ApiError, getApiErrorMessage } from "@/lib/api/index";
import { useRateLimit } from "@/components/auth/use-rate-limit";
import { APP_LOCALE, useCopy } from "@/lib/copy/provider";
import { useToast } from "@/components/ui/toast-provider";

export function useUploadFeedback(title: string, fallback: string) {
  const rate = useRateLimit();
  const { t } = useCopy();
  const { addToast } = useToast();
  function error(failure: unknown): string {
    let message = getApiErrorMessage(failure, fallback);
    if (rate.accept(failure)) {
      message = t.common.rateLimited.replace("{seconds}", new Intl.NumberFormat(APP_LOCALE).format((failure as ApiError).retryAfter ?? 1));
      addToast(title, message, "error");
      return "";
    }
    if (failure instanceof ApiError) {
      try {
        const detail = (JSON.parse(failure.message) as { detail: { code?: string; width?: number; height?: number; minimum?: number } }).detail;
        const template = t.common.imageErrors[detail.code as keyof typeof t.common.imageErrors];
        if (typeof template === "string") {
          message = template;
          for (const key of ["width", "height", "minimum"] as const) {
            if (typeof detail[key] === "number") message = message.replaceAll(`{${key}}`, new Intl.NumberFormat(APP_LOCALE).format(detail[key]));
          }
        }
      } catch { /* Preserve the existing localized fallback for other API shapes. */ }
    }
    addToast(title, message, "error");
    return message;
  }
  return { remaining: rate.remaining, error };
}
