"use client";

import { useQuery } from "@tanstack/react-query";
import { getHomepagePosts, getHomepagePost } from "@/lib/api/index";
import { queryKeys, STALE } from "@/lib/queries/keys";


export function useHomepagePostsQuery() {
  return useQuery({ queryKey: queryKeys.homepagePosts, queryFn: getHomepagePosts, staleTime: STALE.content });
}

export function useHomepagePostQuery(id: string) {
  return useQuery({ queryKey: queryKeys.homepagePost(id), queryFn: () => getHomepagePost(id), enabled: Boolean(id), staleTime: STALE.content });
}
