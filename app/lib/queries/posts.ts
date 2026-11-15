"use client";

import { useQuery } from "@tanstack/react-query";
import { getHomepagePosts } from "@/lib/api/index";
import { queryKeys, STALE } from "@/lib/queries/keys";


export function useHomepagePostsQuery() {
  return useQuery({ queryKey: queryKeys.homepagePosts, queryFn: getHomepagePosts, staleTime: STALE.content });
}
