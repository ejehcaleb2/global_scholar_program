"use client";

import { useQuery } from "@tanstack/react-query";
import { getServiceRequests } from "@/lib/api/index";
import { queryKeys, STALE } from "@/lib/queries/keys";
import { useScope } from "@/lib/queries/scope";


export function useServiceRequestsQuery() {
  const { signedIn } = useScope();
  return useQuery({ queryKey: queryKeys.serviceRequests, queryFn: getServiceRequests, staleTime: STALE.status, enabled: signedIn });
}
