import { apiFetch } from "@/lib/api/client";


export async function getMembership(): Promise<{
  tier: "free" | "paid";
  plan: "beta" | "monthly" | "annual" | null;
  status: "active" | "expired" | "canceled" | null;
  current_period_end: string | null;
}> {
  return apiFetch("/membership");
}
