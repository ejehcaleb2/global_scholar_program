"use client";

import { useQuery } from "@tanstack/react-query";
import { getMembership } from "@/lib/api/index";
import { queryKeys, STALE } from "@/lib/queries/keys";
import { useScope } from "@/lib/queries/scope";


export function useMembershipQuery() {
  const { signedIn } = useScope();
  return useQuery({ queryKey: queryKeys.membership, queryFn: getMembership, staleTime: STALE.profile, enabled: signedIn });
}
