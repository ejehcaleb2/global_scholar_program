import { apiFetch } from "@/lib/api/client";


export type AdminStats = {
  students: { total: number; paid: number; free: number };
  signups: { last_7_days: number };
  service_requests: { pending: number; submitted: number; in_progress: number; returned: number };
  courses: { published: number; draft: number };
};


export async function getAdminStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>("/admin/stats");
}
