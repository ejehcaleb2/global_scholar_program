"use client";

import { useQuery } from "@tanstack/react-query";
import { getMasterclasses } from "@/lib/api/index";
import { queryKeys, STALE } from "@/lib/queries/keys";
import { useScope } from "@/lib/queries/scope";


export function useMasterclassesQuery() {
  const { scope } = useScope();
  return useQuery({ queryKey: queryKeys.masterclasses(scope), queryFn: getMasterclasses, staleTime: STALE.content });
}
