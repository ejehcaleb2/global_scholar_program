"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getResources } from "@/lib/api/index";
import { queryKeys, STALE } from "@/lib/queries/keys";
import { useScope } from "@/lib/queries/scope";


export function useResourcesQuery(category?: string) {
  const { scope } = useScope();
  return useQuery({ queryKey: queryKeys.resources(scope, category ?? "all"), queryFn: () => getResources(category), staleTime: STALE.catalog, placeholderData: keepPreviousData });
}
