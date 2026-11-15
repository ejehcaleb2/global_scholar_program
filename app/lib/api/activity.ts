import { apiFetch } from "@/lib/api/client";


export type AdminAuditLog = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  label: string | null;
  actor: { id: string; full_name: string | null; email: string; avatar_url: string | null; updated_at: string | null };
};

export type AuditFilters = { entity_type?: string; entity_id?: string; q?: string; action?: string; offset?: number };
export type AuditPage = { items: AdminAuditLog[]; total: number; limit: number; offset: number };

export async function getAdminAuditPage(limit = 25, filters: AuditFilters = {}): Promise<AuditPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value));
  return apiFetch<AuditPage>(`/admin/audit-logs?${query}`);
}


export async function getAdminAuditLogs(limit = 10, filters: { entity_type?: string; entity_id?: string } = {}): Promise<AdminAuditLog[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (filters.entity_type) query.set("entity_type", filters.entity_type);
  if (filters.entity_id) query.set("entity_id", filters.entity_id);
  const payload = await apiFetch<{ items?: AdminAuditLog[]; total?: number }>(`/admin/audit-logs?${query.toString()}`);
  return Array.isArray(payload) ? payload : (payload.items ?? []);
}
