"use client";



// Cache policy: structure that rarely changes lives longer than status that changes often.
export const STALE = {
  catalog: 5 * 60_000,
  content: 2 * 60_000,
  profile: 5 * 60_000,
  status: 15_000,
} as const;


export const queryKeys = {
  legal: (kind: string) => ["public", "legal", kind] as const,
  consents: (scope: string) => ["auth", "consents", scope] as const,
  legalCurrent: ["public", "legal", "current"] as const,
  courses: (scope: string) => ["courses", "list", scope] as const,
  course: (courseId: string) => ["courses", "detail", courseId] as const,
  resources: (scope: string, category: string) => ["resources", scope, category] as const,
  opportunities: (scope: string) => ["opportunities", scope] as const,
  masterclasses: (scope: string) => ["masterclasses", scope] as const,
  serviceRequests: ["student", "service-requests"] as const,
  membership: ["student", "membership"] as const,
  avatar: (scope: string, id: string, version: string, size: number) => ["avatars", scope, id, version, size] as const,
  profile: ["student", "profile"] as const,
  homepagePosts: ["public", "homepage-posts"] as const,
};
