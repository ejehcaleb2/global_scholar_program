"use client";

import { useQuery } from "@tanstack/react-query";
import { getProfile, getProfileAvatar } from "@/lib/api/index";
import { queryKeys, STALE } from "@/lib/queries/keys";
import { useScope } from "@/lib/queries/scope";


export function useProfileQuery() {
  const { signedIn } = useScope();
  return useQuery({ queryKey: queryKeys.profile, queryFn: getProfile, staleTime: STALE.profile, enabled: signedIn });
}


export function useAvatarQuery(userId: string, avatarKey?: string | null, updatedAt?: string | null, size: 96 | 512 = 96) {
  const { scope, signedIn } = useScope();
  return useQuery({ queryKey: queryKeys.avatar(scope, userId, `${avatarKey ?? ""}:${updatedAt ?? ""}`, size), queryFn: () => getProfileAvatar(userId, updatedAt, size), staleTime: STALE.profile, retry: false, enabled: signedIn && Boolean(userId && avatarKey) });
}
