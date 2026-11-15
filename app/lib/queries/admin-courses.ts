import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, deleteAdminCourse, getAdminAuditLogs, getAdminCourse, getAdminCourseFacets, getAdminCourseFunnel, getAdminCourseImpact, getAdminCourseLearners, getAdminCourseReadiness, getAdminCourseStats, getAdminCoursesPage, publishAdminCourse, unpublishAdminCourse, type AdminCourseFilters, type AdminCourseLearnerFilters } from "@/lib/api/index";

export const adminCourseKeys = {
  all: ["admin", "courses"] as const,
  lists: () => [...adminCourseKeys.all, "list"] as const,
  list: (filters: AdminCourseFilters) => [...adminCourseKeys.lists(), filters] as const,
  facets: () => [...adminCourseKeys.all, "facets"] as const,
  detail: (courseId: string) => [...adminCourseKeys.all, "detail", courseId] as const,
  stats: (courseId: string) => [...adminCourseKeys.all, "stats", courseId] as const,
  funnel: (courseId: string) => [...adminCourseKeys.all, "funnel", courseId] as const,
  learners: (courseId: string, filters: AdminCourseLearnerFilters) => [...adminCourseKeys.all, "learners", courseId, filters] as const,
  readiness: (courseId: string) => [...adminCourseKeys.all, "readiness", courseId] as const,
  impact: (courseId: string) => [...adminCourseKeys.all, "impact", courseId] as const,
  lessonVersions: (lessonId: string) => [...adminCourseKeys.all, "lesson", lessonId, "versions"] as const,
  lessonVersion: (lessonId: string, versionId: string) => [...adminCourseKeys.all, "lesson", lessonId, "versions", versionId] as const,
  activity: (courseId: string) => ["admin", "audit-logs", { entity_type: "course", entity_id: courseId }] as const,
};

export function useAdminCourseList(filters: AdminCourseFilters, enabled = true) {
  return useQuery({ queryKey: adminCourseKeys.list(filters), queryFn: () => getAdminCoursesPage(filters), enabled, placeholderData: (previous) => previous });
}

export function useAdminCourseFacets() {
  return useQuery({ queryKey: adminCourseKeys.facets(), queryFn: getAdminCourseFacets });
}

export function useAdminCourse(courseId: string) {
  return useQuery({ queryKey: adminCourseKeys.detail(courseId), queryFn: () => getAdminCourse(courseId), enabled: Boolean(courseId) });
}

export function useAdminCourseStats(courseId: string) {
  return useQuery({ queryKey: adminCourseKeys.stats(courseId), queryFn: () => getAdminCourseStats(courseId), enabled: Boolean(courseId) });
}

export function useAdminCourseFunnel(courseId: string) {
  return useQuery({ queryKey: adminCourseKeys.funnel(courseId), queryFn: () => getAdminCourseFunnel(courseId), enabled: Boolean(courseId) });
}

export function useAdminCourseLearners(courseId: string, filters: AdminCourseLearnerFilters) {
  return useQuery({ queryKey: adminCourseKeys.learners(courseId, filters), queryFn: () => getAdminCourseLearners(courseId, filters), enabled: Boolean(courseId), placeholderData: (previous) => previous });
}

export function useAdminCourseReadiness(courseId: string, enabled = true) {
  return useQuery({ queryKey: adminCourseKeys.readiness(courseId), queryFn: () => getAdminCourseReadiness(courseId), enabled: Boolean(courseId) && enabled });
}

export function useAdminCourseActivity(courseId: string, limit = 5) {
  return useQuery({ queryKey: adminCourseKeys.activity(courseId), queryFn: () => getAdminAuditLogs(limit, { entity_type: "course", entity_id: courseId }), enabled: Boolean(courseId) });
}

export function invalidateAdminCourse(queryClient: ReturnType<typeof useQueryClient>, courseId?: string) {
  void queryClient.invalidateQueries({ queryKey: adminCourseKeys.all });
  void queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
  void queryClient.invalidateQueries({ queryKey: ["public", "courses"] });
  void queryClient.invalidateQueries({ queryKey: ["courses"] });
  if (courseId) {
    void queryClient.invalidateQueries({ queryKey: adminCourseKeys.detail(courseId) });
    void queryClient.invalidateQueries({ queryKey: adminCourseKeys.stats(courseId) });
    void queryClient.invalidateQueries({ queryKey: adminCourseKeys.readiness(courseId) });
  }
}

type CourseFieldError = { field: string; message: string };
export type CourseApiFailure = {
  kind: "stale" | "not_ready" | "fields" | "generic";
  message: string;
  fieldErrors: CourseFieldError[];
  readinessErrors: Array<Record<string, unknown>>;
};

export function mapAdminCourseError(error: unknown, copy: { stale: string; notReady: string; invalid: string; generic: string }): CourseApiFailure {
  const generic = error instanceof ApiError ? error.message : "";
  let body: { detail?: unknown } = {};
  try {
    body = generic ? JSON.parse(generic) as { detail?: unknown } : {};
  } catch {
    return { kind: "generic", message: copy.generic, fieldErrors: [], readinessErrors: [] };
  }
  const detail = body.detail;
  if (error instanceof ApiError && error.status === 409) {
    return { kind: "stale", message: copy.stale, fieldErrors: [], readinessErrors: [] };
  }
  if (error instanceof ApiError && error.status === 422 && detail && typeof detail === "object" && "code" in detail && detail.code === "not_ready") {
    const readinessErrors = "errors" in detail && Array.isArray(detail.errors) ? detail.errors as Array<Record<string, unknown>> : [];
    return { kind: "not_ready", message: copy.notReady, fieldErrors: [], readinessErrors };
  }
  if (error instanceof ApiError && error.status === 422 && Array.isArray(detail)) {
    return {
      kind: "fields",
      message: copy.invalid,
      fieldErrors: detail.flatMap((item) => item && typeof item === "object" && "loc" in item && "msg" in item && Array.isArray(item.loc)
        ? [{ field: String(item.loc[item.loc.length - 1] ?? "form"), message: String(item.msg) }]
        : []),
      readinessErrors: [],
    };
  }
  return { kind: "generic", message: copy.generic, fieldErrors: [], readinessErrors: [] };
}

export function useAdminCourseImpact(courseId: string, enabled = true) {
  return useQuery({ queryKey: adminCourseKeys.impact(courseId), queryFn: () => getAdminCourseImpact(courseId), enabled: Boolean(courseId) && enabled });
}

export function useCoursePublicationMutation() {
  return useMutation({ mutationFn: ({ courseId, publish }: { courseId: string; publish: boolean }) => publish ? publishAdminCourse(courseId) : unpublishAdminCourse(courseId) });
}

export function useDeleteAdminCourseMutation() {
  return useMutation({ mutationFn: ({ courseId, confirmation }: { courseId: string; confirmation?: Parameters<typeof deleteAdminCourse>[1] }) => deleteAdminCourse(courseId, confirmation) });
}