import { apiFetch } from "@/lib/api/client";
import type { Profile } from "@/lib/api/profile";


export type AdminStudent = {
  avatar_url: string | null;
  updated_at: string | null;
  id: string;
  full_name: string | null;
  email: string;
  membership_tier: "free" | "paid";
  created_at: string;
  school: string | null;
  city: string | null;
};


export type AdminStudentDetail = AdminStudent & {
  phone: string | null;
  country: string | null;
  date_of_birth: string | null;
  education_level: Profile["education_level"];
  fields_of_study: string[] | null;
  countries_of_interest: string[] | null;
};


export async function getAdminStudents(filters: { search?: string; membership_tier?: AdminStudent["membership_tier"]; limit?: number; offset?: number } = {}): Promise<AdminStudent[]> {
  const query = new URLSearchParams({ limit: String(filters.limit ?? 20), offset: String(filters.offset ?? 0) });
  if (filters.search) query.set("search", filters.search);
  if (filters.membership_tier) query.set("membership_tier", filters.membership_tier);
  return apiFetch<AdminStudent[]>(`/admin/students?${query.toString()}`);
}


export async function getAdminStudent(studentId: string): Promise<AdminStudentDetail> {
  return apiFetch<AdminStudentDetail>(`/admin/students/${studentId}`);
}
