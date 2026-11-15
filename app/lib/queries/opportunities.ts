"use client";

import { useQuery } from "@tanstack/react-query";
import { getOpportunities } from "@/lib/api/index";
import { queryKeys, STALE } from "@/lib/queries/keys";
import { useScope } from "@/lib/queries/scope";


export function useOpportunitiesQuery() {
  const { scope } = useScope();
  return useQuery({ queryKey: queryKeys.opportunities(scope), queryFn: getOpportunities,   staleTime: STALE.content });
}
