"use client";

import { useSearchParams } from "next/navigation";

/** Native history updates integrate with App Router without a server navigation. */
export function useAdminFilter<T extends string>(key: string, fallback: T, allowed?: readonly T[], pageKey = "page") {
  const params = useSearchParams();
  const raw = params.get(key);
  const value = raw !== null && (!allowed || allowed.includes(raw as T)) ? raw as T : fallback;
  function setValue(next: T) {
    const query = new URLSearchParams(window.location.search);
    if (next === fallback || !next) query.delete(key); else query.set(key, next);
    if (key !== pageKey) query.delete(pageKey);
    window.history.replaceState(null, "", `${window.location.pathname}${query.size ? `?${query}` : ""}`);
  }
  return [value, setValue] as const;
}
