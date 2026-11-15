import { apiFetch } from "@/lib/api/client";

export type AdminPage<T> = { items: T[]; total: number; limit: number; offset: number };

export function getAdminContentPage<T>(domain: "resources" | "opportunities" | "masterclasses" | "homepage-posts", filters: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams({ paginated: "true" });
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value));
  return apiFetch<AdminPage<T>>(`/admin/${domain}?${query}`);
}
