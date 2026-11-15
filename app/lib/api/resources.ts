import { apiFetch } from "@/lib/api/client";


export type Resource = {
  updated_at?: string;
  locked: boolean;
  id: string;
  title: string;
  description: string | null;
  category: string;
  access_type: "free" | "members_only";
  url: string | null;
  status: "draft" | "published";
};


export async function getAdminResources(filters: { status?: Resource["status"]; category?: string; search?: string } = {}): Promise<Resource[]> {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.category) query.set("category", filters.category);
  if (filters.search) query.set("search", filters.search);
  return apiFetch<Resource[]>(`/admin/resources${query.size ? `?${query.toString()}` : ""}`);
}


export async function createAdminResource(payload: Omit<Resource, "id" | "locked">): Promise<Resource> {
  return apiFetch<Resource>("/admin/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function updateAdminResource(resourceId: string, payload: { expected_updated_at?: string } & Partial<Omit<Resource, "id" | "locked">>): Promise<Resource> {
  return apiFetch<Resource>(`/admin/resources/${resourceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function deleteAdminResource(resourceId: string): Promise<void> {
  return apiFetch<void>(`/admin/resources/${resourceId}`, { method: "DELETE" });
}


export async function getResources(category?: string): Promise<Resource[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  return apiFetch<Resource[]>(`/resources${query}`);
}
