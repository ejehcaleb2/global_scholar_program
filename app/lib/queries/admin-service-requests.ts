"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { getAdminRequestDetail, type AdminServiceRequest } from "@/lib/api/services";
import type { AdminPage } from "@/lib/api/pagination";

export const adminRequestKeys = {
  all: ["admin", "service-requests"] as const,
  detail: (id: string) => ["admin", "service-requests", "detail", id] as const,
};
export type RequestFilter = "pending" | "all" | "submitted" | "in_progress" | "returned";

export function useAdminRequests({ status, userId, page }: { status: RequestFilter; userId?: string; page: number }) {
  const limit = 10;
  return useQuery({
    queryKey: [...adminRequestKeys.all, "list", { status, userId, page }],
    queryFn: () => apiFetch<AdminPage<AdminServiceRequest>>(`/admin/service-requests?${new URLSearchParams({
      paginated: "true", limit: String(limit), offset: String((page - 1) * limit),
      ...(status === "pending" ? { pending: "true" } : status === "all" ? {} : { status }),
      ...(userId ? { user_id: userId } : {}),
    })}`),
    staleTime: 5_000,
    refetchInterval: () => document.visibilityState === "visible" ? 60_000 : false,
  });
}

export function useAdminRequestDetail(id: string | null) {
  return useQuery({ queryKey: adminRequestKeys.detail(id ?? ""), queryFn: () => getAdminRequestDetail(id!), enabled: Boolean(id) });
}

export function useInvalidateRequests() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: adminRequestKeys.all }),
    client.invalidateQueries({ queryKey: ["admin", "stats"] }),
    client.invalidateQueries({ queryKey: ["admin", "audit-logs"] }),
    client.invalidateQueries({ queryKey: ["student", "service-requests"] }),
  ]);
}
