"use client";

import { useQuery } from "@tanstack/react-query";
import { getCourse, getCourses } from "@/lib/api/index";
import { queryKeys, STALE } from "@/lib/queries/keys";
import { useScope } from "@/lib/queries/scope";


export function useCoursesQuery() {
  const { scope } = useScope();
  return useQuery({ queryKey: queryKeys.courses(scope), queryFn: getCourses, staleTime: STALE.catalog });
}


export function useCourseQuery(courseId: string) {
  const { signedIn } = useScope();
  return useQuery({ queryKey: queryKeys.course(courseId), queryFn: () => getCourse(courseId), staleTime: STALE.content, enabled: signedIn && Boolean(courseId) });
}
