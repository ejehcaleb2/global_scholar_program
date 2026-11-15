"use client";

import { useQuery } from "@tanstack/react-query";
import { getConsentStatus, getLegalDocument } from "@/lib/api/index";
import { queryKeys, STALE } from "@/lib/queries/keys";
import { useScope } from "@/lib/queries/scope";


export function useLegalQuery(kind: "terms" | "privacy") {
  return useQuery({ queryKey: queryKeys.legal(kind), queryFn: () => getLegalDocument(kind), staleTime: STALE.catalog });
}


export function useConsentStatusQuery() {
  const { scope, signedIn } = useScope();
  return useQuery({ queryKey: queryKeys.consents(scope), queryFn: getConsentStatus, staleTime: STALE.status, enabled: signedIn });
}
