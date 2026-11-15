import { apiFetch } from "@/lib/api/client";


export type Masterclass = {
  updated_at?: string;
  id: string;
  title: string;
  speaker_name: string;
  description: string | null;
  session_datetime: string;
  session_link: string | null;
  access_type: "free" | "members_only";
  recording_url: string | null;
  is_past: boolean;
  locked: boolean;
};


export async function getAdminMasterclasses(search?: string): Promise<Masterclass[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch<Masterclass[]>(`/admin/masterclasses${query}`);
}


export async function createAdminMasterclass(payload: Omit<Masterclass, "id" | "is_past" | "locked">): Promise<Masterclass> {
  return apiFetch<Masterclass>("/admin/masterclasses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function updateAdminMasterclass(masterclassId: string, payload: { expected_updated_at?: string } & Partial<Omit<Masterclass, "id" | "is_past" | "locked">>): Promise<Masterclass> {
  return apiFetch<Masterclass>(`/admin/masterclasses/${masterclassId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function deleteAdminMasterclass(masterclassId: string): Promise<void> {
  return apiFetch<void>(`/admin/masterclasses/${masterclassId}`, { method: "DELETE" });
}


export async function getMasterclasses(): Promise<Masterclass[]> {
  return apiFetch<Masterclass[]>("/masterclasses");
}
