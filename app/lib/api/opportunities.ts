import { apiFetch } from "@/lib/api/client";


export type Opportunity = {
  updated_at?: string;
  locked: boolean;
  id: string;
  name: string;
  description: string | null;
  category: string;
  deadline: string | null;
  external_link: string | null;
  status: "Open" | "Expiring Soon" | "Expired";
};


export async function getAdminOpportunities(search?: string): Promise<Opportunity[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch<Opportunity[]>(`/admin/opportunities${query}`);
}


export async function createAdminOpportunity(payload: Omit<Opportunity, "id" | "status" | "locked">): Promise<Opportunity> {
  return apiFetch<Opportunity>("/admin/opportunities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function updateAdminOpportunity(opportunityId: string, payload: { expected_updated_at?: string } & Partial<Omit<Opportunity, "id" | "status" | "locked">>): Promise<Opportunity> {
  return apiFetch<Opportunity>(`/admin/opportunities/${opportunityId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function deleteAdminOpportunity(opportunityId: string): Promise<void> {
  return apiFetch<void>(`/admin/opportunities/${opportunityId}`, { method: "DELETE" });
}


export async function getOpportunities(): Promise<Opportunity[]> {
  return apiFetch<Opportunity[]>("/opportunities");
}
