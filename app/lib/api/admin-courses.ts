import { apiFetch } from "@/lib/api/client";
import type { CourseModule, CourseLessonResource, CourseLesson } from "@/lib/api/courses";


export type AdminCourse = {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  thumbnail_url: string | null;
  learning_outcomes: string[];
  access_type: "free" | "members_only";
  status: "draft" | "published";
  module_count: number;
  lesson_count: number;
  duration_minutes: number;
  learners_started: number;
  learners_completed: number;
  structure_revision: number;
  updated_at: string | null;
};


export type AdminCourseDetail = AdminCourse & {
  modules: CourseModule[];
};


export type AdminCoursePage = {
  items: AdminCourse[];
  total: number;
  limit: number;
  offset: number;
};


export type AdminCourseFacets = {
  all: number;
  published: number;
  draft: number;
  free: number;
  members_only: number;
};


export type AdminCourseStats = {
  module_count: number;
  lesson_count: number;
  total_minutes: number;
  lessons_without_duration: number;
  learners_started: number;
  learners_completed: number;
  completion_rate: number;
  average_progress: number;
  last_learner_activity_at: string | null;
};


type AdminCourseFunnelLesson = {
  lesson_id: string;
  module_id: string;
  position: number;
  title: string;
  completed_count: number;
  percent_of_started: number;
};


export type AdminCourseFunnel = {
  lessons: AdminCourseFunnelLesson[];
  learners_started: number;
  largest_drop: { from_lesson_id: string; to_lesson_id: string; points: number } | null;
};


export type AdminCourseLearner = {
  user: { id: string; full_name: string | null; email: string; avatar_url: string | null };
  plan_state: "paid" | "free";
  completed_lessons: number;
  total_lessons: number;
  percent: number;
  last_activity_at: string | null;
  status: "not_started" | "in_progress" | "completed" | "inactive";
};


export type AdminCourseLearners = {
  items: AdminCourseLearner[];
  total: number;
  limit: number;
  offset: number;
  facets: Record<AdminCourseLearner["status"], number>;
};


export type AdminCourseLearnerFilters = {
  q?: string;
  status?: AdminCourseLearner["status"];
  sort?: "progress_desc" | "progress_asc" | "activity_desc" | "name_asc";
  limit?: 10 | 20 | 50 | 100;
  offset?: number;
};


export type AdminCourseFilters = {
  search?: string;
  status?: AdminCourse["status"];
  access_type?: AdminCourse["access_type"];
  sort?: "updated" | "title" | "learners";
  limit?: 10 | 20 | 50;
  offset?: number;
};


export type AdminCourseReadiness = {
  course_id: string;
  structure_revision: number;
  errors: number;
  warnings: number;
  checks: Array<{
    key: string;
    severity: "error" | "warning";
    passed: boolean;
    message: string;
    tab: "details" | "curriculum";
    field: string | null;
    module_id: string | null;
    lesson_id: string | null;
  }>;
};


export type AdminCourseImpact = {
  id: string;
  title: string;
  status: AdminCourse["status"];
  module_count: number;
  lesson_count: number;
  learners_with_progress: number;
  progress_rows: number;
};


export type AdminModuleImpact = {
  id: string;
  title: string;
  lesson_count: number;
  learners_with_progress: number;
  progress_rows: number;
};


export type AdminLessonImpact = {
  id: string;
  title: string;
  learners_with_progress: number;
  progress_rows: number;
};


export type CourseLessonVersion = {
  id: string;
  version_no: number;
  saved_at: string;
  saved_by: { id: string; full_name: string | null } | null;
  note: string | null;
  changed_fields: string[];
};


export type CourseLessonVersionDetail = CourseLessonVersion & {
  title: string;
  body_html: string;
  try_it_yourself_prompt: string | null;
  duration_minutes: number;
  video: { provider: "youtube" | "vimeo"; id: string } | null;
  resources: CourseLessonResource[];
};


export async function getAdminCoursesPage(filters: AdminCourseFilters = {}): Promise<AdminCoursePage> {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.status) query.set("status", filters.status);
  if (filters.access_type) query.set("access_type", filters.access_type);
  if (filters.sort) query.set("sort", filters.sort);
  query.set("limit", String(filters.limit ?? 20));
  query.set("offset", String(filters.offset ?? 0));
  return apiFetch<AdminCoursePage>(`/admin/courses?${query.toString()}`);
}


export async function getAdminCourseFacets(): Promise<AdminCourseFacets> {
  return apiFetch<AdminCourseFacets>("/admin/courses/facets");
}


export async function getAdminCourse(courseId: string): Promise<AdminCourseDetail> {
  return apiFetch<AdminCourseDetail>(`/admin/courses/${courseId}`);
}


export async function getAdminCourseStats(courseId: string): Promise<AdminCourseStats> {
  return apiFetch<AdminCourseStats>(`/admin/courses/${courseId}/stats`);
}


export async function getAdminCourseFunnel(courseId: string): Promise<AdminCourseFunnel> {
  return apiFetch<AdminCourseFunnel>(`/admin/courses/${courseId}/funnel`);
}


export async function getAdminCourseLearners(courseId: string, filters: AdminCourseLearnerFilters = {}): Promise<AdminCourseLearners> {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.status) query.set("status", filters.status);
  if (filters.sort) query.set("sort", filters.sort);
  query.set("limit", String(filters.limit ?? 20));
  query.set("offset", String(filters.offset ?? 0));
  return apiFetch<AdminCourseLearners>(`/admin/courses/${courseId}/learners?${query.toString()}`);
}


export async function createAdminCourse(payload: { title: string; access_type: AdminCourse["access_type"] } & Partial<Pick<AdminCourse, "summary" | "description" | "thumbnail_url" | "learning_outcomes" | "status">>): Promise<AdminCourse> {
  return apiFetch<AdminCourse>("/admin/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function updateAdminCourse(courseId: string, payload: Partial<Pick<AdminCourse, "title" | "summary" | "description" | "thumbnail_url" | "learning_outcomes" | "access_type" | "status">> & { expected_updated_at?: string }): Promise<AdminCourse> {
  return apiFetch<AdminCourse>(`/admin/courses/${courseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function deleteAdminCourse(courseId: string, confirmation?: { confirm_progress_loss: true; confirm_title: string }): Promise<void> {
  const query = confirmation ? `?confirm_progress_loss=true&confirm_title=${encodeURIComponent(confirmation.confirm_title)}` : "";
  return apiFetch<void>(`/admin/courses/${courseId}${query}`, { method: "DELETE" });
}


export async function getAdminCourseReadiness(courseId: string): Promise<AdminCourseReadiness> {
  return apiFetch<AdminCourseReadiness>(`/admin/courses/${courseId}/readiness`);
}


export async function getAdminCourseImpact(courseId: string): Promise<AdminCourseImpact> {
  return apiFetch<AdminCourseImpact>(`/admin/impact/course/${courseId}`);
}


export async function getAdminModuleImpact(moduleId: string): Promise<AdminModuleImpact> {
  return apiFetch<AdminModuleImpact>(`/admin/impact/module/${moduleId}`);
}


export async function getAdminLessonImpact(lessonId: string): Promise<AdminLessonImpact> {
  return apiFetch<AdminLessonImpact>(`/admin/impact/lesson/${lessonId}`);
}


export async function publishAdminCourse(courseId: string): Promise<AdminCourse> {
  return apiFetch<AdminCourse>(`/admin/courses/${courseId}/publish`, { method: "POST" });
}


export async function unpublishAdminCourse(courseId: string): Promise<AdminCourse> {
  return apiFetch<AdminCourse>(`/admin/courses/${courseId}/unpublish`, { method: "POST" });
}


export async function duplicateAdminCourse(courseId: string, title?: string): Promise<AdminCourse> {
  return apiFetch<AdminCourse>(`/admin/courses/${courseId}/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  });
}


export async function reorderAdminCourseStructure(courseId: string, structureRevision: number, modules: Array<{ id: string; lessons: Array<{ id: string }> }>): Promise<AdminCourseDetail> {
  return apiFetch<AdminCourseDetail>(`/admin/courses/${courseId}/structure/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structure_revision: structureRevision, modules }),
  });
}


export async function createAdminModule(courseId: string, payload: { title: string; order: number }): Promise<CourseModule> {
  return apiFetch<CourseModule>(`/admin/courses/${courseId}/modules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function updateAdminModule(courseId: string, moduleId: string, payload: Partial<{ title: string; order: number }> & { expected_updated_at?: string }): Promise<CourseModule> {
  return apiFetch<CourseModule>(`/admin/courses/${courseId}/modules/${moduleId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function deleteAdminModule(courseId: string, moduleId: string, confirmation?: { confirm_progress_loss: true; confirm_title: string }): Promise<void> {
  const query = confirmation ? `?confirm_progress_loss=true&confirm_title=${encodeURIComponent(confirmation.confirm_title)}` : "";
  return apiFetch<void>(`/admin/courses/${courseId}/modules/${moduleId}${query}`, { method: "DELETE" });
}


export async function createAdminLesson(moduleId: string, payload: Pick<CourseLesson, "title" | "body_html" | "try_it_yourself_prompt" | "order">): Promise<CourseLesson> {
  return apiFetch<CourseLesson>(`/admin/modules/${moduleId}/lessons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function updateAdminLesson(moduleId: string, lessonId: string, payload: Partial<Pick<CourseLesson, "title" | "body_html" | "try_it_yourself_prompt" | "duration_minutes" | "order" | "resources">> & { video_url?: string | null; expected_updated_at?: string }): Promise<CourseLesson> {
  return apiFetch<CourseLesson>(`/admin/modules/${moduleId}/lessons/${lessonId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


export async function getAdminLessonVersions(lessonId: string): Promise<CourseLessonVersion[]> {
  const response = await apiFetch<{ items: CourseLessonVersion[] }>(`/admin/lessons/${lessonId}/versions`);
  return response.items;
}


export async function getAdminLessonVersion(lessonId: string, versionId: string): Promise<CourseLessonVersionDetail> {
  return apiFetch<CourseLessonVersionDetail>(`/admin/lessons/${lessonId}/versions/${versionId}`);
}


export async function restoreAdminLessonVersion(lessonId: string, versionId: string, expectedUpdatedAt: string): Promise<CourseLesson> {
  return apiFetch<CourseLesson>(`/admin/lessons/${lessonId}/versions/${versionId}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expected_updated_at: expectedUpdatedAt }),
  });
}


export async function deleteAdminLesson(moduleId: string, lessonId: string, confirmation?: { confirm_progress_loss: true; confirm_title: string }): Promise<void> {
  const query = confirmation ? `?confirm_progress_loss=true&confirm_title=${encodeURIComponent(confirmation.confirm_title)}` : "";
  return apiFetch<void>(`/admin/modules/${moduleId}/lessons/${lessonId}${query}`, { method: "DELETE" });
}

export async function duplicateAdminLesson(lessonId: string): Promise<CourseLesson> {
  return apiFetch<CourseLesson>(`/admin/lessons/${lessonId}/duplicate`, { method: "POST" });
}
