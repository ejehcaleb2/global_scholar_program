"use client";

import { APP_LOCALE } from "@/lib/copy/dictionary";
import { useHydrated } from "@/components/ui/use-hydrated";

type LocalTimeProps = {
  value: string;
  options?: Intl.DateTimeFormatOptions;
  relative?: boolean;
  className?: string;
};

function formatRelative(value: Date) {
  const elapsed = value.getTime() - Date.now();
  const units = [
    { unit: "year" as const, size: 365 * 24 * 60 * 60 * 1000 },
    { unit: "month" as const, size: 30 * 24 * 60 * 60 * 1000 },
    { unit: "day" as const, size: 24 * 60 * 60 * 1000 },
    { unit: "hour" as const, size: 60 * 60 * 1000 },
    { unit: "minute" as const, size: 60 * 1000 },
  ];
  const selected = units.find((item) => Math.abs(elapsed) >= item.size) ?? units[4];
  return new Intl.RelativeTimeFormat(APP_LOCALE, { numeric: "auto" }).format(
    Math.round(elapsed / selected.size),
    selected.unit,
  );
}

export function LocalTime({ value, options = { dateStyle: "medium", timeStyle: "short" }, relative = false, className }: LocalTimeProps) {
  const hydrated = useHydrated();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date-time value: ${value}`);

  const formatOptions = dateOnly ? { ...options, timeZone: "UTC" } : options;
  const stableText = new Intl.DateTimeFormat(APP_LOCALE, { ...formatOptions, timeZone: "UTC" }).format(date);
  const localText = new Intl.DateTimeFormat(APP_LOCALE, formatOptions).format(date);
  const absoluteText = hydrated ? localText : stableText;
  const text = relative && hydrated ? formatRelative(date) : absoluteText;

  return <time dateTime={value} title={absoluteText} className={className}>{text}</time>;
}
